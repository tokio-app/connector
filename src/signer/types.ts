import type { Gift } from "../events.js";
import type { Logger } from "../logger.js";

/**
 * What a {@link Signer} gets with every call. Signers make their requests with
 * `fetch` and pass it `signal`. The connection enforces `timeoutMs` and the
 * signal on every call itself, so a signer needn't wrap its requests.
 */
export interface SignContext {
  /** The `fetch` to make requests with (the connection's `fetch` option). */
  readonly fetch: typeof fetch;
  /**
   * Aborts when the connection stops (`disconnect()` or the `signal` option).
   * Pass it to `fetch`, so that a stop cancels the request; the call then
   * fails with the library's `AbortError`, whatever the signer throws.
   */
  readonly signal: AbortSignal;
  /**
   * How long one call may take, in milliseconds (the `requestTimeoutMs`
   * option). A call still running after that fails with a `TimeoutError`
   * (phase `sign`). To also cancel the request then, pass `fetch`
   * `AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])`.
   */
  readonly timeoutMs: number;
  /**
   * The User-Agent the library sends to TikTok. A signer that fetches from
   * TikTok for the library must use it: the WebSocket is opened with it.
   */
  readonly userAgent: string;
  /** Where to log. */
  readonly logger: Logger;
}

/** What {@link Signer.fetchConnect} signs. */
export interface SignRequest {
  /** The room to connect to. */
  roomId: string;
  /** Where to resume the stream: `""` on the first connect, the last cursor seen on a reconnect. */
  cursor: string;
  /**
   * The TikTok session cookies (`sessionid=…; tt-target-idc=…`), when the
   * connection has a session. They let whoever holds them act as that TikTok
   * account: a signer must only send them to a third party when its user
   * explicitly asked for it. `EulerSigner` never sends them.
   */
  sessionCookies?: string;
}

/** A signed connect: the first batch of messages and what the WebSocket needs. */
export interface SignedConnect {
  /** The protobuf-encoded `ProtoMessageFetchResult`: first messages, cursor, push server and WebSocket params. */
  body: Uint8Array;
  /** Cookies to send on the WebSocket, as `name=value` pairs (Euler Stream's `x-set-tt-cookie`). */
  cookies: string[];
  /** The room id the signer connected to, when it says (it replaces the requested one). */
  roomId?: string;
  /** The signer's request id, for support requests. */
  requestId?: string;
  /** The signer's agent id, for support requests. */
  agentId?: string;
}

/** What a {@link Signer} knows about a room. */
export interface RoomInfo {
  /** Whether the room is LIVE now. */
  isLive: boolean;
}

/**
 * Signs TikTok's WebSocket connection. TikTok only accepts a connection
 * opened with a signed request; a signing service does that.
 * {@link EulerSigner} (Euler Stream) is the default; implement this interface
 * to use another service.
 *
 * The optional methods are fallbacks for when TikTok refuses the library's
 * own requests. Each returns `null` when the signer has no answer.
 *
 * For the service's own failures, throw `RateLimitError`, `PremiumFeatureError`
 * or `SignError` (with the HTTP `status`): the connection decides from them
 * whether and when to retry. Anything else a signer throws is converted: an
 * error named `AbortError` or `TimeoutError` (what `fetch` throws) becomes
 * the library's `AbortError` or `TimeoutError` (phase `sign`), any other a
 * retryable `SignError` with it as `cause`.
 */
export interface Signer {
  /**
   * Signs a connection to `request.roomId`. Throws `RateLimitError` when the
   * signer's rate limit is hit, `PremiumFeatureError` when it needs a paid
   * plan, `SignError` for other failures, and `ProtocolError` when its answer
   * is unusable (no cookies, for one).
   */
  fetchConnect(
    request: SignRequest,
    context: SignContext,
  ): Promise<SignedConnect>;
  /** Resolves a username to its room id, or `null` when the signer can't. */
  resolveRoomId?(
    uniqueId: string,
    context: SignContext,
  ): Promise<string | null>;
  /** Says whether a room is LIVE, or `null` when the signer can't. */
  fetchRoomInfo?(
    roomId: string,
    context: SignContext,
  ): Promise<RoomInfo | null>;
  /** Lists a room's gifts, or `null` when the signer can't. */
  fetchGifts?(roomId: string, context: SignContext): Promise<Gift[] | null>;
}
