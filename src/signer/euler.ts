// The Euler Stream signer, written from Euler Stream's public docs
// (PROTOCOL.md, "Signer"). EulerSigner and EulerSignerOptions are public API:
// keep their signatures.
import {
  PremiumFeatureError,
  ProtocolError,
  RateLimitError,
  SignError,
} from "../errors.js";
import type { Gift } from "../events.js";
import { Deadline, describeFailure, previewBody } from "../http/client.js";
import { giftsIn } from "../room/gifts.js";
import { idOf, recordOf } from "../room/resolver.js";
import { parseSignerCookies } from "../util/cookies.js";
import type {
  RoomInfo,
  SignContext,
  SignRequest,
  SignedConnect,
  Signer,
} from "./types.js";

/** Euler Stream's API server. */
export const DEFAULT_EULER_HOST = "https://tiktok.eulerstream.com";

/** The `client` query parameter Euler Stream uses for its metrics. */
export const DEFAULT_EULER_CLIENT = "ttlive-node";

/** Options of {@link EulerSigner}. */
export interface EulerSignerOptions {
  /** The API server, without a trailing slash. Default `https://tiktok.eulerstream.com`. */
  host?: string;
  /**
   * An Euler Stream API key. It raises the rate limits and unlocks the paid
   * routes of your plan. Only ever sent in the `x-api-key` header.
   */
  apiKey?: string;
  /** The `client` query parameter (Euler Stream's metrics). Default `ttlive-node`. */
  client?: string;
}

const JSON_TYPE = "application/json";

/** Euler Stream's error body: `{ code, message }`, plus `limit_label` on some 429s. */
interface EulerErrorBody {
  message?: unknown;
  limit_label?: unknown;
}

function headerOf(response: Response, name: string): string | undefined {
  return response.headers.get(name)?.trim() || undefined;
}

// A number of seconds, or a Unix time in seconds or milliseconds, to a wait
// in milliseconds. `ratelimit-reset` (IETF draft) is seconds from now; 2.4.0
// read `x-ratelimit-reset` as a Unix time in seconds.
function resetToMs(value: string | undefined, now: number): number | undefined {
  if (value === undefined || !/^\d+(?:\.\d+)?$/.test(value)) return undefined;
  const number = Number(value);
  if (number >= 1e12) return Math.max(0, Math.round(number - now));
  if (number >= 1e9) return Math.max(0, Math.round(number * 1000 - now));
  return Math.round(number * 1000);
}

/**
 * How long a 429 asks to wait, in milliseconds: `retry-after` (seconds or an
 * HTTP date), else `ratelimit-reset`, else `x-ratelimit-reset`.
 */
function retryAfterMs(response: Response): number | undefined {
  const now = Date.now();
  const retryAfter = headerOf(response, "retry-after");
  if (retryAfter !== undefined) {
    const seconds = resetToMs(retryAfter, now);
    if (seconds !== undefined) return seconds;
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }
  return (
    resetToMs(headerOf(response, "ratelimit-reset"), now) ??
    resetToMs(headerOf(response, "x-ratelimit-reset"), now)
  );
}

/** The body of an error answer: its JSON (`undefined` if it isn't) and what to quote of it. */
async function errorBody(
  response: Response,
): Promise<{ body: EulerErrorBody | undefined; detail: string }> {
  let text = "";
  let body: EulerErrorBody | undefined;
  try {
    text = await response.text();
    body = recordOf(JSON.parse(text));
  } catch {
    // Unreadable or not JSON: quote the text, if any.
  }
  const message =
    typeof body?.message === "string" && body.message !== ""
      ? body.message
      : previewBody(text);
  return { body, detail: message ? `: ${message}` : "" };
}

/** The error for a failed answer: 429, 402, or any other status. */
async function rejection(response: Response, what: string): Promise<SignError> {
  const { body, detail } = await errorBody(response);
  const status = response.status;
  const requestId = headerOf(response, "x-request-id");
  if (status === 429) {
    const label =
      typeof body?.limit_label === "string" ? ` (${body.limit_label})` : "";
    return new RateLimitError(
      `${what} hit Euler Stream's rate limit${label}${detail}`,
      { status, requestId, retryAfterMs: retryAfterMs(response) },
    );
  }
  if (status === 402) {
    return new PremiumFeatureError(
      `${what} needs a paid Euler Stream plan${detail}`,
      { status, requestId },
    );
  }
  return new SignError(`${what} answered ${status}${detail}`, {
    status,
    requestId,
  });
}

/**
 * Signs connections with Euler Stream (https://www.eulerstream.com), the
 * default {@link Signer}. Without an API key it uses Euler Stream's anonymous
 * limits. It never sends the TikTok session to Euler Stream.
 */
export class EulerSigner implements Signer {
  readonly #host: string;
  readonly #client: string;
  readonly #apiKey: string | undefined;

  /** @throws `TypeError` when `host` isn't a URL. */
  constructor(options: EulerSignerOptions = {}) {
    const host = (options.host ?? DEFAULT_EULER_HOST).replace(/\/+$/, "");
    if (!URL.canParse(host)) {
      throw new TypeError(`The Euler Stream host must be a URL, got "${host}"`);
    }
    this.#host = host;
    this.#client = options.client ?? DEFAULT_EULER_CLIENT;
    this.#apiKey = options.apiKey?.trim() || undefined;
  }

  /**
   * Signs a connection: `GET {host}/webcast/rooms/{room_id}/connect`. The
   * answer's body is the first batch; its `x-set-tt-cookie` header holds the
   * cookies (required), `x-room-id` the room it connected to.
   * `request.sessionCookies` is never sent.
   */
  fetchConnect(
    request: SignRequest,
    context: SignContext,
  ): Promise<SignedConnect> {
    const query = {
      client: this.#client,
      cursor: request.cursor,
      user_agent: context.userAgent,
      client_enter: "true",
      platform: "web",
    };
    return this.#request(
      "The signed connect",
      `/webcast/rooms/${encodeURIComponent(request.roomId)}/connect`,
      query,
      "application/protobuf, application/json",
      context,
      async (response, what) => {
        if (!response.ok) throw await rejection(response, what);
        const requestId = headerOf(response, "x-request-id");
        const agentId = headerOf(response, "x-agent-id");
        const support = requestId ? ` (request id ${requestId})` : "";
        const cookieHeader = headerOf(response, "x-set-tt-cookie");
        const cookies = cookieHeader ? parseSignerCookies(cookieHeader) : [];
        if (cookies.length === 0) {
          throw new ProtocolError(
            `${what} came without cookies (x-set-tt-cookie)${support}`,
          );
        }
        const body = new Uint8Array(await response.arrayBuffer());
        if (body.length === 0) {
          throw new ProtocolError(`${what} came with an empty body${support}`);
        }
        const signed: SignedConnect = { body, cookies };
        const roomId = idOf(headerOf(response, "x-room-id"));
        if (roomId !== null) signed.roomId = roomId;
        if (requestId !== undefined) signed.requestId = requestId;
        if (agentId !== undefined) signed.agentId = agentId;
        return signed;
      },
    );
  }

  /**
   * The room id of a username: `GET {host}/webcast/anchors/{unique_id}/room_id`
   * (a Pro route). `null` when Euler Stream has none, or the plan lacks the
   * route (any 4xx but 429).
   */
  async resolveRoomId(
    uniqueId: string,
    context: SignContext,
  ): Promise<string | null> {
    const json = await this.#fallback(
      "Euler Stream's room id lookup",
      `/webcast/anchors/${encodeURIComponent(uniqueId)}/room_id`,
      context,
    );
    const answer = recordOf(json);
    return answer?.ok === true ? idOf(answer.room_id) : null;
  }

  /**
   * Whether a room is LIVE: `GET {host}/webcast/rooms/{room_id}/room_info`
   * (`data.room_info.is_live`, else its `status`, 4 being offline). `null`
   * when it doesn't say, or the plan lacks the route.
   */
  async fetchRoomInfo(
    roomId: string,
    context: SignContext,
  ): Promise<RoomInfo | null> {
    const json = await this.#fallback(
      "Euler Stream's room info",
      `/webcast/rooms/${encodeURIComponent(roomId)}/room_info`,
      context,
    );
    const info = recordOf(recordOf(recordOf(json)?.data)?.room_info);
    if (typeof info?.is_live === "boolean") return { isLive: info.is_live };
    if (typeof info?.status === "number") return { isLive: info.status !== 4 };
    return null;
  }

  /**
   * A room's gifts: `GET {host}/webcast/rooms/{room_id}/gifts`. The documented
   * answer only lists gift ids and per-room overrides, so this returns `null`
   * unless it also carries gifts with a name and a diamond count.
   */
  async fetchGifts(
    roomId: string,
    context: SignContext,
  ): Promise<Gift[] | null> {
    const json = await this.#fallback(
      "Euler Stream's room gifts",
      `/webcast/rooms/${encodeURIComponent(roomId)}/gifts`,
      context,
    );
    const gifts = giftsIn(recordOf(json)?.response, true);
    return gifts.length > 0 ? gifts : null;
  }

  // A JSON fallback route: the parsed body, or `null` for a 4xx other than
  // 429 (the plan lacks the route, or Euler Stream knows no answer). A 429
  // or 5xx throws.
  #fallback(
    what: string,
    path: string,
    context: SignContext,
  ): Promise<unknown> {
    return this.#request(
      what,
      path,
      undefined,
      JSON_TYPE,
      context,
      async (response) => {
        if (response.status === 429 || response.status >= 500) {
          throw await rejection(response, what);
        }
        if (!response.ok) {
          await response.body?.cancel();
          context.logger("debug", `${what}: no answer (${response.status})`, {
            status: response.status,
          });
          return null;
        }
        const text = await response.text();
        try {
          return JSON.parse(text) as unknown;
        } catch (error) {
          throw new ProtocolError(
            `${what} answered with a body that isn't JSON: ${previewBody(text) || "(empty)"}`,
            { cause: error },
          );
        }
      },
    );
  }

  async #request<T>(
    what: string,
    path: string,
    query: Record<string, string> | undefined,
    accept: string,
    context: SignContext,
    handle: (response: Response, what: string) => Promise<T>,
  ): Promise<T> {
    const url = `${this.#host}${path}${query ? `?${new URLSearchParams(query).toString()}` : ""}`;
    const headers: Record<string, string> = { Accept: accept };
    if (this.#apiKey !== undefined) headers["x-api-key"] = this.#apiKey;
    const deadline = new Deadline(context.timeoutMs, context.signal);
    const started = performance.now();
    let status: number | undefined;
    try {
      if (deadline.aborted) throw context.signal.reason;
      const response = await context.fetch(url, {
        method: "GET",
        headers,
        signal: deadline.signal,
      });
      status = response.status;
      const result = await handle(response, what);
      context.logger("debug", `Euler Stream GET ${path}: ${status}`, {
        status,
        ms: Math.round(performance.now() - started),
        requestId: headerOf(response, "x-request-id"),
      });
      return result;
    } catch (error) {
      const failure =
        deadline.settle(error, what, "sign") ??
        new SignError(`${what} failed: ${describeFailure(error)}`, {
          cause: error,
        });
      context.logger(
        "debug",
        `Euler Stream GET ${path} failed: ${failure.code}`,
        {
          status,
          ms: Math.round(performance.now() - started),
          error: failure,
        },
      );
      throw failure;
    }
  }
}
