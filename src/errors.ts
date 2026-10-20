/**
 * Every error code a {@link ConnectorError} can carry. Branch on `error.code`
 * (or on the subclass) rather than on the message, which is for people.
 */
export const ERROR_CODES = [
  "INVALID_USERNAME",
  "INVALID_STATE",
  "ROOM_NOT_FOUND",
  "OFFLINE",
  "NETWORK",
  "HTTP",
  "SIGN_FAILED",
  "RATE_LIMITED",
  "PREMIUM_REQUIRED",
  "TIMEOUT",
  "WEBSOCKET",
  "PROTOCOL",
  "ABORTED",
  "RECONNECT_GAVE_UP",
  "GIFTS_UNAVAILABLE",
  "INTERNAL",
  // Temporary: the Phase 0B stubs throw it. Removed in Phase 2.
  "NOT_IMPLEMENTED",
] as const;

/**
 * What went wrong, as a stable machine-readable string:
 *
 * - `INVALID_USERNAME`: the username is empty or malformed ({@link InvalidUsernameError}).
 * - `INVALID_STATE`: the call isn't allowed in the connection's current state, such as `connect()` while connecting.
 * - `ROOM_NOT_FOUND`: no source could resolve the user's room id ({@link RoomNotFoundError}).
 * - `OFFLINE`: the user isn't LIVE ({@link OfflineError}).
 * - `NETWORK`: a request failed before any response (DNS, refused or reset connection).
 * - `HTTP`: TikTok answered with an unexpected status or body ({@link HttpError}).
 * - `SIGN_FAILED`: the signer couldn't sign the connection ({@link SignError}).
 * - `RATE_LIMITED`: the signer's rate limit was hit ({@link RateLimitError}).
 * - `PREMIUM_REQUIRED`: the signer needs a paid plan for this request ({@link PremiumFeatureError}).
 * - `TIMEOUT`: a request, the socket opening or the stream went quiet for too long ({@link TimeoutError}).
 * - `WEBSOCKET`: the WebSocket failed or closed ({@link WebSocketError}).
 * - `PROTOCOL`: TikTok or the signer sent data the library can't read ({@link ProtocolError}).
 * - `ABORTED`: the `signal` option aborted, or `disconnect()` interrupted the call ({@link AbortError}).
 * - `RECONNECT_GAVE_UP`: every reconnect attempt failed ({@link ReconnectGiveUpError}).
 * - `GIFTS_UNAVAILABLE`: every gift list source failed (`fetchGifts()`).
 * - `INTERNAL`: an unexpected failure inside the library (a bug: please report it).
 * - `NOT_IMPLEMENTED`: temporary, for code that isn't written yet.
 */
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Options every {@link ConnectorError} accepts. */
export interface ConnectorErrorOptions {
  /** Whether trying again later can succeed. Each class has its own default. */
  retryable?: boolean;
  /** The underlying error. */
  cause?: unknown;
}

// Sets `name` on the prototype, so it doesn't show up as an own property when
// the error is logged, and survives minifiers that rename classes.
function setName(target: { prototype: Error }, name: string): void {
  Object.defineProperty(target.prototype, "name", {
    value: name,
    writable: true,
    configurable: true,
  });
}

/**
 * The base class of every error the library throws, rejects with or emits.
 * `code` says what went wrong, `retryable` whether trying again can help, and
 * `cause` holds the underlying error when there is one.
 */
export class ConnectorError extends Error {
  /** What went wrong. */
  readonly code: ErrorCode;
  /** Whether trying again later can succeed. The connection's reconnect logic follows it. */
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: ConnectorErrorOptions = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.code = code;
    this.retryable = options.retryable ?? false;
  }

  /** A plain object for logs: `name`, `message`, `code`, `retryable` and the subclass's fields. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      ...Object.fromEntries(Object.entries(this)),
    };
  }

  static {
    setName(this, "ConnectorError");
  }
}

/** The username is empty or isn't a TikTok username. Not retryable. */
export class InvalidUsernameError extends ConnectorError {
  constructor(message: string, options: ConnectorErrorOptions = {}) {
    super("INVALID_USERNAME", message, { ...options, retryable: false });
  }

  static {
    setName(this, "InvalidUsernameError");
  }
}

/** No source could resolve the user's room id: the user doesn't exist, or TikTok blocked every lookup. Not retryable by default. */
export class RoomNotFoundError extends ConnectorError {
  constructor(message: string, options: ConnectorErrorOptions = {}) {
    super("ROOM_NOT_FOUND", message, {
      ...options,
      retryable: options.retryable ?? false,
    });
  }

  static {
    setName(this, "RoomNotFoundError");
  }
}

/** Options of {@link OfflineError}. */
export interface OfflineErrorOptions extends ConnectorErrorOptions {
  /** The room that was checked. */
  roomId?: string;
}

/** The user isn't LIVE (TikTok reports the room as finished). Not retryable by default. */
export class OfflineError extends ConnectorError {
  /** The room that was checked, when known. */
  readonly roomId: string | undefined;

  constructor(message: string, options: OfflineErrorOptions = {}) {
    super("OFFLINE", message, {
      retryable: options.retryable ?? false,
      cause: options.cause,
    });
    this.roomId = options.roomId;
  }

  static {
    setName(this, "OfflineError");
  }
}

/** Options of {@link HttpError}. */
export interface HttpErrorOptions extends ConnectorErrorOptions {
  /** The HTTP status TikTok answered with. */
  status: number;
}

/**
 * TikTok answered a request with an unexpected status, or with a body the
 * library couldn't use. Retryable by default for 429 and 5xx statuses.
 */
export class HttpError extends ConnectorError {
  /** The HTTP status. */
  readonly status: number;

  constructor(message: string, options: HttpErrorOptions) {
    super("HTTP", message, {
      retryable:
        options.retryable ?? (options.status === 429 || options.status >= 500),
      cause: options.cause,
    });
    this.status = options.status;
  }

  static {
    setName(this, "HttpError");
  }
}

/** Options of {@link SignError} and its subclasses. */
export interface SignErrorOptions extends ConnectorErrorOptions {
  /** The signer's HTTP status, when it answered at all. */
  status?: number;
  /** The signer's request id (Euler Stream's `x-request-id`), for support requests. */
  requestId?: string;
}

/**
 * The signer couldn't sign the connection: it answered with an error status,
 * or couldn't be reached. Retryable by default, except for 401 and 403 (the API
 * key is missing, wrong or not allowed to make this request).
 */
export class SignError extends ConnectorError {
  /** The code instances of this class get; subclasses override it. */
  static readonly CODE: ErrorCode = "SIGN_FAILED";

  /** The signer's HTTP status, or `undefined` when it couldn't be reached. */
  readonly status: number | undefined;
  /** The signer's request id, when it sent one. */
  readonly requestId: string | undefined;

  constructor(message: string, options: SignErrorOptions = {}) {
    super(new.target.CODE, message, {
      retryable:
        options.retryable ?? (options.status !== 401 && options.status !== 403),
      cause: options.cause,
    });
    this.status = options.status;
    this.requestId = options.requestId;
  }

  static {
    setName(this, "SignError");
  }
}

/** Options of {@link RateLimitError}. */
export interface RateLimitErrorOptions extends SignErrorOptions {
  /** How long the signer asked to wait before the next request, in milliseconds, when it said. */
  retryAfterMs?: number;
}

/**
 * The signer's rate limit was hit (HTTP 429). Retryable: the connection waits
 * at least `retryAfterMs` before its next attempt.
 */
export class RateLimitError extends SignError {
  static override readonly CODE: ErrorCode = "RATE_LIMITED";

  /** How long to wait before the next request, in milliseconds, when the signer said. */
  readonly retryAfterMs: number | undefined;

  constructor(message: string, options: RateLimitErrorOptions = {}) {
    super(message, {
      status: options.status ?? 429,
      requestId: options.requestId,
      retryable: options.retryable ?? true,
      cause: options.cause,
    });
    this.retryAfterMs = options.retryAfterMs;
  }

  static {
    setName(this, "RateLimitError");
  }
}

/**
 * The signer needs a paid plan (or an API key with more access) for this
 * request (HTTP 402). Not retryable by default.
 */
export class PremiumFeatureError extends SignError {
  static override readonly CODE: ErrorCode = "PREMIUM_REQUIRED";

  constructor(message: string, options: SignErrorOptions = {}) {
    super(message, {
      status: options.status ?? 402,
      requestId: options.requestId,
      retryable: options.retryable ?? false,
      cause: options.cause,
    });
  }

  static {
    setName(this, "PremiumFeatureError");
  }
}

/**
 * Where a {@link TimeoutError} happened:
 *
 * - `request`: an HTTP request to TikTok took longer than `requestTimeoutMs`.
 * - `sign`: a request to the signer took longer than `requestTimeoutMs`.
 * - `connect`: the WebSocket didn't open within `connectTimeoutMs`.
 * - `idle`: no frame arrived for `idleTimeoutMs` while connected.
 */
export type TimeoutPhase = "request" | "sign" | "connect" | "idle";

/** Options of {@link TimeoutError}. */
export interface TimeoutErrorOptions extends ConnectorErrorOptions {
  /** Where it happened. */
  phase: TimeoutPhase;
}

/** Something took too long. Retryable by default. */
export class TimeoutError extends ConnectorError {
  /** Where it happened. */
  readonly phase: TimeoutPhase;

  constructor(message: string, options: TimeoutErrorOptions) {
    super("TIMEOUT", message, {
      retryable: options.retryable ?? true,
      cause: options.cause,
    });
    this.phase = options.phase;
  }

  static {
    setName(this, "TimeoutError");
  }
}

/** Options of {@link WebSocketError}. */
export interface WebSocketErrorOptions extends ConnectorErrorOptions {
  /** The close code, when the socket closed. */
  closeCode?: number;
}

/** The WebSocket failed to open, errored or closed unexpectedly. Retryable by default. */
export class WebSocketError extends ConnectorError {
  /** The close code, when the socket closed (1006 for an abnormal close). */
  readonly closeCode: number | undefined;

  constructor(message: string, options: WebSocketErrorOptions = {}) {
    super("WEBSOCKET", message, {
      retryable: options.retryable ?? true,
      cause: options.cause,
    });
    this.closeCode = options.closeCode;
  }

  static {
    setName(this, "WebSocketError");
  }
}

/**
 * TikTok or the signer sent data the library can't read: a malformed
 * protobuf message, a frame that can't be decompressed, or a response missing
 * something required. Retryable by default.
 */
export class ProtocolError extends ConnectorError {
  constructor(message: string, options: ConnectorErrorOptions = {}) {
    super("PROTOCOL", message, {
      retryable: options.retryable ?? true,
      cause: options.cause,
    });
  }

  static {
    setName(this, "ProtocolError");
  }
}

/** The `signal` option aborted, or `disconnect()` interrupted the call. Not retryable. */
export class AbortError extends ConnectorError {
  constructor(
    message = "The operation was aborted",
    options: ConnectorErrorOptions = {},
  ) {
    super("ABORTED", message, { retryable: false, cause: options.cause });
  }

  static {
    setName(this, "AbortError");
  }
}

/** Options of {@link ReconnectGiveUpError}. */
export interface ReconnectGiveUpErrorOptions extends ConnectorErrorOptions {
  /** How many reconnect attempts were made. */
  attempts: number;
}

/**
 * Every reconnect attempt failed (`reconnect.maxAttempts`). `cause` is the
 * last attempt's error. Not retryable.
 */
export class ReconnectGiveUpError extends ConnectorError {
  /** How many reconnect attempts were made. */
  readonly attempts: number;

  constructor(message: string, options: ReconnectGiveUpErrorOptions) {
    super("RECONNECT_GAVE_UP", message, {
      retryable: false,
      cause: options.cause,
    });
    this.attempts = options.attempts;
  }

  static {
    setName(this, "ReconnectGiveUpError");
  }
}

const CODES: ReadonlySet<string> = new Set(ERROR_CODES);

/**
 * Whether `value` is a {@link ConnectorError}. Also true for one thrown by
 * another copy of this library (two versions installed side by side), which
 * `instanceof` misses.
 */
export function isConnectorError(value: unknown): value is ConnectorError {
  if (value instanceof ConnectorError) return true;
  if (!(value instanceof Error)) return false;
  const code: unknown = Reflect.get(value, "code");
  const retryable: unknown = Reflect.get(value, "retryable");
  return (
    typeof code === "string" &&
    CODES.has(code) &&
    typeof retryable === "boolean"
  );
}
