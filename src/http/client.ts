// Owned by T2 (Phase 1): fetch with timeouts, the client params and headers,
// and a cookie jar (PROTOCOL.md, "HTTP requests to TikTok"). connection.ts
// (T3) uses the constructor, userAgent, cookieHeader(), sessionCookieHeader()
// and addCookies(): keep their signatures.
import {
  AbortError,
  ConnectorError,
  HttpError,
  TimeoutError,
  isConnectorError,
  type TimeoutPhase,
} from "../errors.js";
import type { Logger } from "../logger.js";
import { DEFAULT_TARGET_IDC, type SessionCookies } from "../options.js";
import {
  TARGET_IDC_COOKIE,
  mergeCookies,
  parseSetCookie,
  serializeCookies,
  sessionCookies,
  splitSetCookieHeader,
} from "../util/cookies.js";
import { randomDigits } from "../util/random.js";
import {
  httpHeaders,
  httpParams,
  mergeHeaders,
  userAgentOf,
} from "./params.js";

/** What an {@link HttpClient} needs from the connection's options. */
export interface HttpClientOptions {
  /** The `fetch` to use. */
  fetch: typeof fetch;
  /** How long a request may take, in milliseconds (`requestTimeoutMs`). */
  timeoutMs: number;
  /** The `clientParams` option: added to, or replacing, the default query parameters. */
  clientParams: Readonly<Record<string, string>>;
  /** The `headers` option: added to, or replacing, the default headers. */
  headers: Readonly<Record<string, string>>;
  /** The session, sent as cookies. */
  session: Required<SessionCookies> | undefined;
  /** Where to log. */
  logger: Logger;
  /** The `device_id` client param. Default: 19 random digits, made once per client. */
  deviceId?: string;
}

/** Options of one request. */
export interface RequestOptions {
  /** Query parameters added after the client params (they win over them). */
  params?: Readonly<Record<string, string>>;
  /** Headers added after the default ones and the `headers` option (they win over them). */
  headers?: Readonly<Record<string, string>>;
  /**
   * Send a plain request: only `params` as the query, and only the
   * User-Agent and `headers`. No client params, default headers or cookies.
   */
  bare?: boolean;
  /** Aborts the request (throw an `AbortError`). */
  signal?: AbortSignal;
}

/** How many characters of a response body an error message quotes. */
const BODY_PREVIEW_LENGTH = 200;

/** The start of `body` for an error message: whitespace collapsed, at most 200 characters. */
export function previewBody(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > BODY_PREVIEW_LENGTH
    ? `${text.slice(0, BODY_PREVIEW_LENGTH)}…`
    : text;
}

/** Why a request failed without a response, for an error message: the cause's message and code. */
export function describeFailure(error: unknown): string {
  const cause: unknown =
    error instanceof Error && error.cause !== undefined ? error.cause : error;
  if (!(cause instanceof Error)) return String(cause);
  const code: unknown = Reflect.get(cause, "code");
  return typeof code === "string"
    ? `${cause.message} (${code})`
    : cause.message;
}

/**
 * The time box of one request: `signal` aborts when `outer` does or after
 * `timeoutMs`, and the getters say which happened.
 */
export class Deadline {
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly #timeout: AbortSignal;
  readonly #outer: AbortSignal | undefined;

  constructor(timeoutMs: number, outer?: AbortSignal) {
    this.timeoutMs = timeoutMs;
    this.#timeout = AbortSignal.timeout(timeoutMs);
    this.#outer = outer;
    this.signal = outer
      ? AbortSignal.any([outer, this.#timeout])
      : this.#timeout;
  }

  /** Whether the outer signal aborted. */
  get aborted(): boolean {
    return this.#outer?.aborted === true;
  }

  /** Whether the time ran out (and the outer signal didn't abort). */
  get timedOut(): boolean {
    return !this.aborted && this.#timeout.aborted;
  }

  /**
   * What a failed request becomes when it isn't a network failure: an
   * `AbortError` when the outer signal aborted, the error itself when it's a
   * `ConnectorError` already, or a `TimeoutError` in `phase` when the time ran
   * out. `null` otherwise: the request failed on its own.
   */
  settle(
    error: unknown,
    what: string,
    phase: TimeoutPhase,
  ): ConnectorError | null {
    if (this.aborted) {
      return new AbortError(`${what} was aborted`, {
        cause: this.#outer?.reason,
      });
    }
    if (isConnectorError(error)) return error;
    if (this.timedOut) {
      return new TimeoutError(`${what} took longer than ${this.timeoutMs} ms`, {
        phase,
        cause: error,
      });
    }
    return null;
  }
}

/** The headers' `Set-Cookie` lines, also from a `fetch` whose `Headers` lack `getSetCookie()`. */
function setCookieLines(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  return splitSetCookieHeader(headers.get("set-cookie") ?? "");
}

/**
 * Makes the library's HTTP requests to TikTok: adds the client params,
 * headers and cookies, enforces the timeout, keeps the cookies TikTok sets
 * (name and value only, like a browser on one site), and maps failures to
 * `HttpError`, `TimeoutError` (phase `request`), `AbortError` and
 * `ConnectorError` with code `NETWORK`.
 *
 * Query parameters are the defaults (`http/params.ts`) with `device_id`,
 * then the `clientParams` option, then the request's own. Headers are the
 * defaults and `Cookie` (the jar), then the `headers` option, then the
 * request's own.
 */
export class HttpClient {
  readonly #options: HttpClientOptions;
  readonly #deviceId: string;
  readonly #jar: Map<string, string>;

  constructor(options: HttpClientOptions) {
    this.#options = options;
    this.#deviceId = options.deviceId ?? randomDigits(19);
    const jar = mergeCookies(
      { [TARGET_IDC_COOKIE]: DEFAULT_TARGET_IDC },
      options.session ? sessionCookies(options.session) : {},
    );
    this.#jar = new Map(Object.entries(jar));
  }

  /** The User-Agent of every request: the `headers` option's, or the default. */
  get userAgent(): string {
    return userAgentOf(this.#options.headers);
  }

  /** GETs `url` and returns the body as text. */
  getText(url: string, options: RequestOptions = {}): Promise<string> {
    return this.#get(url, options, (response) => response.text());
  }

  /** GETs `url` and parses the body as JSON. A body that isn't JSON is an `HttpError`. */
  getJson(url: string, options: RequestOptions = {}): Promise<unknown> {
    return this.#get(url, options, async (response, what) => {
      const text = await response.text();
      try {
        return JSON.parse(text) as unknown;
      } catch (error) {
        throw new HttpError(
          `${what} answered with a body that isn't JSON: ${previewBody(text) || "(empty)"}`,
          { status: response.status, retryable: false, cause: error },
        );
      }
    });
  }

  /** GETs `url` and returns the body as bytes. */
  getBytes(url: string, options: RequestOptions = {}): Promise<Uint8Array> {
    return this.#get(
      url,
      options,
      async (response) => new Uint8Array(await response.arrayBuffer()),
    );
  }

  /** The `Cookie` header for TikTok: `tt-target-idc`, the session cookies, and every cookie set since. */
  cookieHeader(): string {
    return serializeCookies(Object.fromEntries(this.#jar));
  }

  /** The session's cookies only (for `SignRequest.sessionCookies`), or `undefined` without a session. */
  sessionCookieHeader(): string | undefined {
    const session = this.#options.session;
    if (!session) return undefined;
    return serializeCookies({
      sessionid: session.sessionId,
      [TARGET_IDC_COOKIE]: session.ttTargetIdc,
    });
  }

  /**
   * Adds `name=value` pairs to the jar, such as the signer's cookies; a later
   * value replaces an earlier one. `Set-Cookie` attributes after a `;` are
   * ignored, and so are strings without a pair.
   */
  addCookies(pairs: readonly string[]): void {
    for (const text of pairs) {
      const pair = parseSetCookie(text);
      if (pair) this.#jar.set(pair[0], pair[1]);
    }
  }

  #url(url: string, options: RequestOptions): URL {
    const target = new URL(url);
    const params = options.bare
      ? { ...options.params }
      : {
          ...httpParams(this.#deviceId, this.#options.clientParams),
          ...options.params,
        };
    for (const [name, value] of Object.entries(params)) {
      target.searchParams.set(name, value);
    }
    return target;
  }

  #headers(options: RequestOptions): Record<string, string> {
    if (options.bare) {
      return mergeHeaders({ "User-Agent": this.userAgent }, options.headers);
    }
    const cookie = this.cookieHeader();
    const base = httpHeaders({
      ...(cookie ? { Cookie: cookie } : {}),
      ...this.#options.headers,
    });
    return mergeHeaders(base, options.headers);
  }

  async #get<T>(
    url: string,
    options: RequestOptions,
    read: (response: Response, what: string) => Promise<T>,
  ): Promise<T> {
    const target = this.#url(url, options);
    // The URL without its query: no device id or other params in messages and logs.
    const where = `${target.host}${target.pathname}`;
    const what = `GET ${target.origin}${target.pathname}`;
    const { logger } = this.#options;
    const deadline = new Deadline(this.#options.timeoutMs, options.signal);
    const started = performance.now();
    let status: number | undefined;
    try {
      if (deadline.aborted) throw new AbortError(`${what} was aborted`);
      const response = await this.#options.fetch(target.href, {
        method: "GET",
        headers: this.#headers(options),
        signal: deadline.signal,
      });
      status = response.status;
      this.addCookies(setCookieLines(response.headers));
      if (!response.ok) throw await statusError(response, what);
      const body = await read(response, what);
      logger("debug", `HTTP GET ${where}: ${status}`, {
        method: "GET",
        url: where,
        status,
        ms: Math.round(performance.now() - started),
      });
      return body;
    } catch (error) {
      const failure =
        deadline.settle(error, what, "request") ??
        new ConnectorError(
          "NETWORK",
          `${what} failed: ${describeFailure(error)}`,
          {
            retryable: true,
            cause: error,
          },
        );
      logger("debug", `HTTP GET ${where} failed: ${failure.code}`, {
        method: "GET",
        url: where,
        status,
        ms: Math.round(performance.now() - started),
        error: failure,
      });
      throw failure;
    }
  }
}

async function statusError(
  response: Response,
  what: string,
): Promise<HttpError> {
  let body = "";
  try {
    body = previewBody(await response.text());
  } catch {
    // The status says enough.
  }
  return new HttpError(
    `${what} answered ${response.status}${body ? `: ${body}` : ""}`,
    { status: response.status },
  );
}
