// The connection's own events and results: the state machine's names, what
// `connect()` and `fetchGifts()` resolve with, and the `raw` message.
import type { ConnectorError } from "../errors.js";
import type { Gift } from "./shared.js";

/**
 * Where a {@link TikTokLiveConnection} is in its lifecycle:
 *
 * - `idle`: created, `connect()` not called yet.
 * - `connecting`: the first `connect()` is running.
 * - `connected`: the WebSocket is open and events flow.
 * - `reconnecting`: the connection dropped and is waiting for, or running, a reconnect attempt.
 * - `disconnected`: stopped: `disconnect()`, the stream ended, the reconnects ran out, the
 *   signal aborted, or the first `connect()` failed. `connect()` can start it again.
 */
export type ConnectionState =
  "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

/**
 * Why a connection ended:
 *
 * - `user`: `disconnect()` was called.
 * - `streamEnd`: the LIVE ended or was suspended, or a reconnect's live check found it offline.
 * - `wsClose`: the WebSocket closed (TikTok or the network closed it).
 * - `wsError`: the WebSocket errored.
 * - `idle`: no frame arrived for `idleTimeoutMs`.
 * - `signError`: a reconnect attempt failed before the socket opened, in a way retrying can't
 *   fix: the signer, the room lookup or the signed batch (see the error).
 * - `giveUp`: the reconnect attempts ran out (`reconnect.maxAttempts`).
 * - `aborted`: the `signal` option aborted.
 */
export type DisconnectReason =
  | "user"
  | "streamEnd"
  | "wsClose"
  | "wsError"
  | "idle"
  | "signError"
  | "giveUp"
  | "aborted";

/** How a LIVE ended: the host ended it, or TikTok suspended it. */
export type StreamEndAction = "ended" | "suspended";

/** Payload of the `connected` event. */
export interface ConnectedEvent {
  /** The room the connection entered. */
  roomId: string;
  /** `false` for the first connect, `true` after a reconnect. */
  reconnected: boolean;
  /** `0` for the first connect, else the number of the reconnect attempt that succeeded (1-based). */
  attempt: number;
}

/** Payload of the `disconnected` event. */
export interface DisconnectedEvent {
  /** Why the connection ended. */
  reason: DisconnectReason;
  /** The failure behind it; absent for `user` and `streamEnd`. */
  error?: ConnectorError;
  /** `true` when a reconnect follows (a `reconnecting` event comes next). */
  willReconnect: boolean;
}

/** Payload of the `reconnecting` event. */
export interface ReconnectingEvent {
  /** The attempt about to run, starting at 1. Resets after a successful reconnect. */
  attempt: number;
  /** How long the connection waits before the attempt, in milliseconds. */
  delayMs: number;
  /** Why the connection dropped, or why the previous attempt failed. */
  reason: DisconnectReason;
}

/** Payload of the `streamEnd` event. */
export interface StreamEndEvent {
  /** How the LIVE ended. */
  action: StreamEndAction;
}

/** Any LIVE message, before decoding (`raw` event). */
export interface RawMessage {
  /** The message type, such as `WebcastChatMessage`. */
  method: string;
  /**
   * The protobuf-encoded message. A view into the received frame: copy it
   * (`payload.slice()`) to keep it beyond the listener call.
   */
  payload: Uint8Array;
  /** The message id. */
  msgId: string;
  /** `true` for backlog messages TikTok replays when the connection enters the room. */
  isHistory: boolean;
  /** When TikTok created the message (its `common.createTime`), or `"0"` when it has none. */
  createTime: string;
}

/** Which source answered a gift list request. */
export type GiftSource = "room" | "signer" | "region";

/** Result of `fetchGifts()`. */
export interface GiftList {
  /** The gifts, without duplicates. */
  gifts: Gift[];
  /**
   * Which source answered: `room` (the LIVE's own list), `signer` (the
   * signer's room gift list) or `region` (the list for a region and language).
   */
  source: GiftSource;
}

/** Result of `connect()`. */
export interface ConnectResult {
  /** The room the connection entered. */
  roomId: string;
}
