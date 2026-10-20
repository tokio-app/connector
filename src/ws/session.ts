// Owned by T3 (Phase 1): one WebSocket's lifetime, from opening to closing
// (PROTOCOL.md, "WebSocket" and "Frames"). Only connection.ts uses it.
import type { FetchResult } from "../codec/messages/fetchResult.js";
import { TypedEmitter } from "../emitter.js";
import { ConnectorError } from "../errors.js";
import type { Logger } from "../logger.js";

/** What one session needs. */
export interface SessionOptions {
  /** The full WebSocket URL. */
  url: string;
  /** The upgrade request's headers, `Cookie` included. */
  headers: Record<string, string>;
  /** The room to enter. */
  roomId: string;
  heartbeatIntervalMs: number;
  idleTimeoutMs: number;
  connectTimeoutMs: number;
  logger: Logger;
}

/** Why a session ended, as the connection reports it. */
export type SessionCloseReason = "wsClose" | "wsError" | "idle";

/** Events of a {@link WebcastSession}. */
export interface SessionEvents {
  /** A batch of messages arrived (acked already when it asked for an ack). */
  messages: FetchResult;
  /** The socket closed for good. Emitted once, not after `close()`. */
  closed: { reason: SessionCloseReason; error: ConnectorError };
}

function notImplemented(what: string): ConnectorError {
  return new ConnectorError(
    "NOT_IMPLEMENTED",
    `WebcastSession.${what} is not implemented yet`,
  );
}

/**
 * One WebSocket: opens it with the headers, enters the room, sends
 * heartbeats, watches for silence (`idleTimeoutMs`), decompresses and decodes
 * `msg` frames, acks the batches that ask for it, and reports how it ended.
 */
export class WebcastSession extends TypedEmitter<SessionEvents> {
  readonly #options: SessionOptions;

  constructor(options: SessionOptions) {
    super();
    this.#options = options;
  }

  /** Opens the socket and enters the room. Rejects with `TimeoutError` (phase `connect`) or `WebSocketError`. */
  open(): Promise<void> {
    return Promise.reject(notImplemented(`open(${this.#options.roomId})`));
  }

  /** Closes the socket (code 1000), terminating it when it doesn't close in time. Idempotent. */
  close(): Promise<void> {
    return Promise.reject(notImplemented("close()"));
  }
}
