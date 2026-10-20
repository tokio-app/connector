// Owned by T2 (Phase 1): username → room id, and the live check
// (PROTOCOL.md, "Room id" and "Is the room LIVE?"). connection.ts (T3) calls
// both: keep their signatures.
import {
  AbortError,
  ProtocolError,
  RoomNotFoundError,
  TimeoutError,
  isConnectorError,
} from "../errors.js";
import type { HttpClient } from "../http/client.js";
import type { SignContext, Signer } from "../signer/types.js";

/** What room lookups need: the HTTP client, the signer for fallbacks, and its context (whose `signal` also aborts HTTP requests). */
export interface RoomContext {
  readonly http: HttpClient;
  readonly signer: Signer;
  readonly signContext: SignContext;
}

const LIVE_PAGE_URL = "https://www.tiktok.com/@";
const ROOM_API_URL = "https://www.tiktok.com/api-live/user/room/";
const ROOM_INFO_URL = "https://webcast.tiktok.com/webcast/room/info/";

// 2.4.0's pattern, with the `s` flag so a line break inside can't defeat it.
const SIGI_STATE =
  /<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/s;
// The script newer TikTok pages carry their state in (PROTOCOL.md, open item
// 13). Its layout isn't known, so the room id is searched for in it.
const UNIVERSAL_DATA =
  /<script\b[^>]*\bid="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s;

// Bounds of the search through a page's state.
const SEARCH_DEPTH = 16;
const SEARCH_NODES = 50_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `value` as an object to read properties from, or `undefined`. */
export function recordOf(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

/** The value at `path` inside nested objects and arrays, or `undefined`. */
export function valueAt(
  value: unknown,
  ...path: readonly (string | number)[]
): unknown {
  let current = value;
  for (const key of path) current = recordOf(current)?.[key];
  return current;
}

/**
 * A numeric id (room or gift): a decimal string other than zero, or a
 * positive safe integer as a string. `null` for anything else, `""` and
 * `"0"` included.
 */
export function idOf(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== "string") return null;
  const id = value.trim();
  return /^\d+$/.test(id) && /[1-9]/.test(id) ? id : null;
}

/**
 * Throws when `signal` aborted: `error` when it is an `AbortError` already,
 * else a new one. A step that failed because of the abort stops the chain.
 */
export function throwIfAborted(error: unknown, signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (isConnectorError(error) && error.code === "ABORTED") throw error;
  throw new AbortError(undefined, { cause: signal.reason });
}

/**
 * Runs a signer call within the context's `timeoutMs` and `signal`, so a
 * signer that ignores them can't hold a chain up: `TimeoutError` (phase
 * `sign`) when the time runs out, `AbortError` when the signal aborts.
 */
export function withinDeadline<T>(
  what: string,
  context: SignContext,
  call: (context: SignContext) => Promise<T>,
): Promise<T> {
  const { signal, timeoutMs } = context;
  if (signal.aborted) {
    return Promise.reject(
      new AbortError(`${what} was aborted`, { cause: signal.reason }),
    );
  }
  return new Promise<T>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      finish();
      reject(new AbortError(`${what} was aborted`, { cause: signal.reason }));
    };
    const timer = setTimeout(() => {
      finish();
      reject(
        new TimeoutError(`${what} took longer than ${timeoutMs} ms`, {
          phase: "sign",
        }),
      );
    }, timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    // A call that throws instead of rejecting fails the same way.
    new Promise<T>((run) => run(call(context))).then(
      (value) => {
        finish();
        resolve(value);
      },
      (error: unknown) => {
        finish();
        reject(error);
      },
    );
  });
}

// The room id an object of a page's state gives: its `liveRoomUserInfo`'s,
// or its own when it is the user's object (`uniqueId` and `roomId`).
function roomIdAt(
  record: Record<string, unknown>,
  username: string,
): string | null {
  const { uniqueId } = record;
  const isUser =
    typeof uniqueId === "string" && uniqueId.toLowerCase() === username;
  return (
    idOf(valueAt(record, "liveRoomUserInfo", "user", "roomId")) ??
    (isUser ? idOf(record.roomId) : null)
  );
}

// Where a page's state holds the room id: SIGI_STATE's own place first, then
// any object `roomIdAt` reads one from, breadth first.
function roomIdInState(state: unknown, username: string): string | null {
  const direct = idOf(
    valueAt(state, "LiveRoom", "liveRoomUserInfo", "user", "roomId"),
  );
  if (direct !== null) return direct;
  const name = username.toLowerCase();
  const queue: [unknown, number][] = [[state, 0]];
  for (let index = 0; index < queue.length && index < SEARCH_NODES; index++) {
    const [node, depth] = queue[index]!;
    const record = recordOf(node);
    const found = record === undefined ? null : roomIdAt(record, name);
    if (found !== null) return found;
    if (record !== undefined && depth < SEARCH_DEPTH) {
      for (const child of Object.values(record)) queue.push([child, depth + 1]);
    }
  }
  return null;
}

// Step 1: the room id in the LIVE page's SIGI_STATE script, else in its
// __UNIVERSAL_DATA_FOR_REHYDRATION__ script.
async function roomIdFromLivePage(
  username: string,
  { http, signContext }: RoomContext,
): Promise<string> {
  const html = await http.getText(
    `${LIVE_PAGE_URL}${encodeURIComponent(username)}/live`,
    { signal: signContext.signal },
  );
  const problems: string[] = [];
  for (const [script, pattern] of [
    ["SIGI_STATE", SIGI_STATE],
    ["__UNIVERSAL_DATA_FOR_REHYDRATION__", UNIVERSAL_DATA],
  ] as const) {
    const json = pattern.exec(html)?.[1];
    if (json === undefined) {
      problems.push(`no ${script} script`);
      continue;
    }
    let state: unknown;
    try {
      state = JSON.parse(json);
    } catch {
      problems.push(`${script} isn't JSON`);
      continue;
    }
    const roomId = roomIdInState(state, username);
    if (roomId !== null) return roomId;
    problems.push(`no room id in ${script}`);
  }
  throw new ProtocolError(
    `The LIVE page of @${username} has ${problems.join(", ")} (blocked by TikTok?)`,
    { retryable: false },
  );
}

// Step 2: TikTok's api-live/user/room route.
async function roomIdFromApi(
  username: string,
  { http, signContext }: RoomContext,
): Promise<string> {
  const answer = await http.getJson(ROOM_API_URL, {
    params: { uniqueId: username, sourceType: "54" },
    signal: signContext.signal,
  });
  // 2.4.0's rule: a missing statusCode passes, any other than 0 fails.
  const statusCode = valueAt(answer, "statusCode");
  if (statusCode !== undefined && statusCode !== 0) {
    const message = valueAt(answer, "message");
    const reason =
      typeof message === "string" && message ? ` (${message})` : "";
    throw new ProtocolError(
      `api-live/user/room answered statusCode ${JSON.stringify(statusCode)}${reason}`,
      { retryable: false },
    );
  }
  const roomId = idOf(valueAt(answer, "data", "user", "roomId"));
  if (roomId === null) {
    const message = `api-live/user/room has no room id for @${username}`;
    throw new ProtocolError(message, { retryable: false });
  }
  return roomId;
}

// Step 3: the signer, when it can.
async function roomIdFromSigner(
  username: string,
  { signer, signContext }: RoomContext,
): Promise<string> {
  const resolve = signer.resolveRoomId?.bind(signer);
  if (resolve === undefined) {
    throw new RoomNotFoundError("The signer can't look up room ids");
  }
  const roomId = idOf(
    await withinDeadline("The signer's room id lookup", signContext, (ctx) =>
      resolve(username, ctx),
    ),
  );
  if (roomId === null) {
    throw new RoomNotFoundError(`The signer has no room id for @${username}`);
  }
  return roomId;
}

const STEPS = [
  ["the LIVE page", roomIdFromLivePage],
  ["api-live", roomIdFromApi],
  ["the signer", roomIdFromSigner],
] as const;

/**
 * Resolves a username to its room id: the LIVE page, then TikTok's
 * `api-live/user/room` route, then `signer.resolveRoomId`; the first that
 * answers wins, each within `requestTimeoutMs`. Throws `RoomNotFoundError`
 * (with the steps' errors as `cause`, an array) when none does, and
 * `AbortError` when the signal aborts. The `RoomNotFoundError` is retryable
 * when a step failed for a reason that can pass (network, timeout, 5xx).
 */
export async function resolveRoomId(
  username: string,
  context: RoomContext,
): Promise<string> {
  const { logger, signal } = context.signContext;
  const errors: unknown[] = [];
  for (const [name, step] of STEPS) {
    try {
      const roomId = await step(username, context);
      logger("debug", `Room id of @${username} from ${name}`, { roomId });
      return roomId;
    } catch (error) {
      throwIfAborted(error, signal);
      logger("debug", `Room id of @${username} from ${name} failed`, { error });
      errors.push(error);
    }
  }
  const codes = STEPS.map(
    ([name], index) =>
      `${name}: ${isConnectorError(errors[index]) ? errors[index].code : "failed"}`,
  );
  throw new RoomNotFoundError(
    `Couldn't find the room of @${username} (${codes.join(", ")})`,
    {
      cause: errors,
      retryable: errors.some(
        (error) => isConnectorError(error) && error.retryable,
      ),
    },
  );
}

/**
 * Whether a room is LIVE: TikTok's `room/info` route (status 4 is offline),
 * then `signer.fetchRoomInfo`. Resolves `null` when neither answers. Throws
 * only `AbortError`.
 */
export async function checkLive(
  roomId: string,
  context: RoomContext,
): Promise<boolean | null> {
  const { http, signer, signContext } = context;
  const { logger, signal } = signContext;
  try {
    const answer = await http.getJson(ROOM_INFO_URL, {
      params: { room_id: roomId },
      signal,
    });
    const status = valueAt(answer, "data", "status");
    if (typeof status === "number") {
      logger("debug", `Room ${roomId} has status ${status}`, {
        roomId,
        status,
      });
      return status !== 4;
    }
    logger("debug", `TikTok's room/info has no status for room ${roomId}`, {
      roomId,
    });
  } catch (error) {
    throwIfAborted(error, signal);
    logger("debug", `TikTok's room/info failed for room ${roomId}`, { error });
  }
  const fetchRoomInfo = signer.fetchRoomInfo?.bind(signer);
  if (fetchRoomInfo === undefined) return null;
  try {
    const info = await withinDeadline(
      "The signer's room info",
      signContext,
      (ctx) => fetchRoomInfo(roomId, ctx),
    );
    if (typeof info?.isLive === "boolean") return info.isLive;
    logger("debug", `The signer has no room info for room ${roomId}`, {
      roomId,
    });
  } catch (error) {
    throwIfAborted(error, signal);
    logger("debug", `The signer's room info failed for room ${roomId}`, {
      error,
    });
  }
  return null;
}
