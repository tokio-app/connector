import { InvalidUsernameError } from "./errors.js";
import { consoleLogger, type Logger } from "./logger.js";
import type { Signer } from "./signer/types.js";

/**
 * A logged-in TikTok web session, sent to TikTok as cookies. Some LIVEs
 * (age-restricted ones, for one) only work with a session. It is never sent to
 * the signer by `EulerSigner`.
 */
export interface SessionCookies {
  /** The `sessionid` cookie of a logged-in TikTok web session. */
  sessionId: string;
  /** The `tt-target-idc` cookie: the session's data center, such as `useast1a` or `alisg`. Defaults to `useast1a`. */
  ttTargetIdc?: string;
}

/**
 * How the connection reconnects after it drops. With
 * `d = min(maxDelayMs, baseDelayMs * factor ** (n - 1))`, the wait before
 * attempt `n` (from 1) is a random time from `d / 2` up to `d` ("equal
 * jitter"), at least `minDelayMs`, and at least the wait a `RateLimitError`
 * asks for. With the defaults, the first five attempts wait at least 1, 1, 2,
 * 4 and 8 seconds. The attempt count starts over after each successful
 * reconnect.
 */
export interface ReconnectOptions {
  /**
   * Attempts before giving up (`disconnected` with reason `giveUp`). `Infinity`
   * never gives up; `0` turns reconnecting off, like `reconnect: false`.
   * Default `10`.
   */
  maxAttempts: number;
  /** The wait ceiling of the first attempt, in milliseconds. Default `1000`. */
  baseDelayMs: number;
  /** The largest wait ceiling, in milliseconds. Default `30000`. */
  maxDelayMs: number;
  /**
   * The shortest wait before an attempt, in milliseconds, whatever the
   * jitter draws; at most `maxDelayMs`. Each attempt is a request to the
   * signer, and Euler Stream allows few without an API key (5 a minute), so
   * attempts shouldn't come back to back. Default `1000`.
   */
  minDelayMs: number;
  /** How much the wait ceiling grows per attempt. Default `2`. */
  factor: number;
  /**
   * Check whether the room is still LIVE before each attempt. When it isn't,
   * the connection emits `streamEnd` and stops instead of retrying. Default `true`.
   */
  checkLiveBeforeRetry: boolean;
  /**
   * Deliver the messages sent while the connection was away. A reconnect
   * then signs twice: once for its socket, once with the last cursor for the
   * messages of the gap. `false` signs once and loses them (a reconnect only
   * gets the room's recent backlog). Each sign is a request to the signer, and
   * Euler Stream allows 5 a minute without an API key. Default `true`.
   */
  resume: boolean;
}

/**
 * Options of a `TikTokLiveConnection`. All of them are optional. Times are in
 * milliseconds, up to 2147483647 (about 24.8 days, the longest a Node timer
 * waits).
 */
export interface ConnectOptions {
  /** Signs the WebSocket connection. Default: an `EulerSigner` without an API key. */
  signer?: Signer;
  /** A TikTok web session to send to TikTok. Ignored when `sessionId` is empty. */
  session?: SessionCookies;
  /** The room id, when already known: skips the username lookup. */
  roomId?: string;
  /**
   * Also process the backlog TikTok sends on connect: the first batch of the
   * first connect and messages marked as history. Default `false`.
   */
  processInitialData?: boolean;
  /** How to reconnect after a drop, or `false` to never reconnect. */
  reconnect?: Partial<ReconnectOptions> | false;
  /** How often to send a heartbeat on the WebSocket, in milliseconds. Default `10000`. */
  heartbeatIntervalMs?: number;
  /**
   * Reconnect when no frame (pings included) arrives for this long once in the
   * room, in milliseconds. `0` disables the check. Default `30000`.
   */
  idleTimeoutMs?: number;
  /** How long the WebSocket may take to open and enter the room, in milliseconds. Default `20000`. */
  connectTimeoutMs?: number;
  /** How long each HTTP request (to TikTok or the signer) may take, in milliseconds. Default `10000`. */
  requestTimeoutMs?: number;
  /** How many recent message ids to remember to drop duplicates; `0` keeps none. Default `2048`. */
  dedupeSize?: number;
  /**
   * Query parameters to add to, or replace in, every request to TikTok and the
   * WebSocket URL. For working around a TikTok change before a release.
   */
  clientParams?: Record<string, string>;
  /**
   * Headers to add to, or replace in, every request to TikTok and the
   * WebSocket. For working around a TikTok change before a release.
   */
  headers?: Record<string, string>;
  /** The `fetch` to use for HTTP requests. Default: the global `fetch`. */
  fetch?: typeof fetch;
  /** Stops the connection for good when it aborts (`disconnected` with reason `aborted`). */
  signal?: AbortSignal;
  /** Receives the library's log entries. Default: warnings and errors to the console. */
  logger?: Logger;
}

/** Options of `fetchGifts()`. */
export interface FetchGiftsOptions {
  /** The region of the region gift list (the last source), as a country code. Default `US`. */
  region?: string;
  /** The language of the region gift list, as a language tag. Default `en-US`. */
  language?: string;
}

/** {@link ConnectOptions} with their defaults applied, as the connection uses them. */
export interface ResolvedOptions {
  /** `undefined` when not set: the connection then creates an `EulerSigner`. */
  signer: Signer | undefined;
  /** `undefined` when not set or when `sessionId` is empty. */
  session: Required<SessionCookies> | undefined;
  roomId: string | undefined;
  processInitialData: boolean;
  /** `false` when reconnecting is off. */
  reconnect: Readonly<ReconnectOptions> | false;
  heartbeatIntervalMs: number;
  idleTimeoutMs: number;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
  dedupeSize: number;
  clientParams: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  fetch: typeof fetch;
  signal: AbortSignal | undefined;
  logger: Logger;
}

/** The default reconnect behavior. */
const DEFAULT_RECONNECT: Readonly<ReconnectOptions> = Object.freeze({
  maxAttempts: 10,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  minDelayMs: 1_000,
  factor: 2,
  checkLiveBeforeRetry: true,
  resume: true,
});

/** The defaults of the {@link ConnectOptions} that have one. */
export const DEFAULT_OPTIONS = Object.freeze({
  processInitialData: false,
  reconnect: DEFAULT_RECONNECT,
  heartbeatIntervalMs: 10_000,
  idleTimeoutMs: 30_000,
  connectTimeoutMs: 20_000,
  requestTimeoutMs: 10_000,
  dedupeSize: 2_048,
});

/** The defaults of {@link FetchGiftsOptions}: the region gift list Tokio used before this library. */
export const DEFAULT_GIFT_OPTIONS: Readonly<Required<FetchGiftsOptions>> =
  Object.freeze({ region: "US", language: "en-US" });

/** The `tt-target-idc` cookie sent when the session doesn't set one. */
export const DEFAULT_TARGET_IDC = "useast1a";

function check(
  name: string,
  value: number,
  valid: (value: number) => boolean,
  rule: string,
): number {
  if (typeof value !== "number" || !valid(value)) {
    throw new RangeError(`${name} must be ${rule}, got ${String(value)}`);
  }
  return value;
}

/**
 * The longest delay Node's timers keep, in milliseconds (about 24.8 days): a
 * longer one fires after 1 ms. The options that set a timer stop here.
 */
export const MAX_TIMER_MS = 2_147_483_647;

// A delay of at least `min` that a timer can keep.
const delay = (min: number) => (value: number) =>
  Number.isFinite(value) && value >= min && value <= MAX_TIMER_MS;
// A delay above 0.
const positive = (value: number) => delay(0)(value) && value > 0;
const count = (value: number) => Number.isInteger(value) && value >= 0;

function resolveReconnect(
  reconnect: ConnectOptions["reconnect"],
): Readonly<ReconnectOptions> | false {
  if (reconnect === false) return false;
  const merged = { ...DEFAULT_RECONNECT, ...reconnect };
  check(
    "reconnect.maxAttempts",
    merged.maxAttempts,
    (value) => count(value) || value === Infinity,
    "a whole number of at least 0, or Infinity",
  );
  check(
    "reconnect.baseDelayMs",
    merged.baseDelayMs,
    delay(0),
    `a number from 0 to ${MAX_TIMER_MS}`,
  );
  check(
    "reconnect.maxDelayMs",
    merged.maxDelayMs,
    delay(merged.baseDelayMs),
    `a number from reconnect.baseDelayMs to ${MAX_TIMER_MS}`,
  );
  check(
    "reconnect.minDelayMs",
    merged.minDelayMs,
    (value) => delay(0)(value) && value <= merged.maxDelayMs,
    `a number from 0 to reconnect.maxDelayMs (${merged.maxDelayMs})`,
  );
  check(
    "reconnect.factor",
    merged.factor,
    (value) => Number.isFinite(value) && value >= 1,
    "a number of at least 1",
  );
  for (const name of ["checkLiveBeforeRetry", "resume"] as const) {
    if (typeof merged[name] !== "boolean") {
      throw new RangeError(
        `reconnect.${name} must be a boolean, got ${String(merged[name])}`,
      );
    }
  }
  return Object.freeze(merged);
}

function resolveSession(
  session: SessionCookies | undefined,
): Required<SessionCookies> | undefined {
  const sessionId = session?.sessionId?.trim();
  if (!sessionId) return undefined;
  return {
    sessionId,
    ttTargetIdc: session?.ttTargetIdc?.trim() || DEFAULT_TARGET_IDC,
  };
}

// Calls the global fetch at request time, so a fetch stubbed after the
// connection was created (tests, instrumentation) is the one used.
const globalFetch: typeof fetch = (input, init) =>
  globalThis.fetch(input, init);

/**
 * Applies the defaults to `options` and checks them. Throws a `RangeError` for
 * a number out of range and a `TypeError` for a malformed `roomId`.
 */
export function resolveOptions(options: ConnectOptions = {}): ResolvedOptions {
  const roomId = options.roomId?.trim() || undefined;
  if (roomId !== undefined && !/^\d+$/.test(roomId)) {
    throw new TypeError(`roomId must be a numeric string, got "${roomId}"`);
  }
  return {
    signer: options.signer,
    session: resolveSession(options.session),
    roomId,
    processInitialData:
      options.processInitialData ?? DEFAULT_OPTIONS.processInitialData,
    reconnect: resolveReconnect(options.reconnect),
    heartbeatIntervalMs: check(
      "heartbeatIntervalMs",
      options.heartbeatIntervalMs ?? DEFAULT_OPTIONS.heartbeatIntervalMs,
      positive,
      `a number above 0, up to ${MAX_TIMER_MS}`,
    ),
    idleTimeoutMs: check(
      "idleTimeoutMs",
      options.idleTimeoutMs ?? DEFAULT_OPTIONS.idleTimeoutMs,
      delay(0),
      `a number from 0 to ${MAX_TIMER_MS}`,
    ),
    connectTimeoutMs: check(
      "connectTimeoutMs",
      options.connectTimeoutMs ?? DEFAULT_OPTIONS.connectTimeoutMs,
      positive,
      `a number above 0, up to ${MAX_TIMER_MS}`,
    ),
    requestTimeoutMs: check(
      "requestTimeoutMs",
      options.requestTimeoutMs ?? DEFAULT_OPTIONS.requestTimeoutMs,
      positive,
      `a number above 0, up to ${MAX_TIMER_MS}`,
    ),
    dedupeSize: check(
      "dedupeSize",
      options.dedupeSize ?? DEFAULT_OPTIONS.dedupeSize,
      count,
      "a whole number of at least 0",
    ),
    clientParams: Object.freeze({ ...options.clientParams }),
    headers: Object.freeze({ ...options.headers }),
    fetch: options.fetch ?? globalFetch,
    signal: options.signal,
    logger: options.logger ?? consoleLogger,
  };
}

// A TikTok profile or LIVE URL, with or without the scheme and subdomain.
const TIKTOK_URL = /^(?:https?:\/\/)?(?:(?:www|m)\.)?tiktok\.com\//i;
// Letters and digits of any script, "_", "." and "-": broader than what
// TikTok allows today, so a valid username is never refused here.
const USERNAME = /^[\p{L}\p{N}_.-]+$/u;

/**
 * Turns what a user typed into a TikTok username: `@name`, `name`,
 * `https://www.tiktok.com/@name/live` and the like all give `name`. Throws an
 * `InvalidUsernameError` when nothing usable is left.
 */
export function normalizeUsername(input: string): string {
  if (typeof input !== "string") {
    throw new InvalidUsernameError(
      `The username must be a string, got ${typeof input}`,
    );
  }
  let username = input.trim().replace(TIKTOK_URL, "");
  if (username.startsWith("@")) username = username.slice(1);
  // Drops "/live", a query string, a fragment or a trailing slash.
  username = username.split(/[/?#]/, 1)[0]!.trim();
  if (!USERNAME.test(username)) {
    throw new InvalidUsernameError(
      username === ""
        ? `No username in "${input}"`
        : `"${input}" isn't a TikTok username`,
    );
  }
  return username;
}
