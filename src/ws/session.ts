// One WebSocket's lifetime, from opening to closing (PROTOCOL.md, "WebSocket"
// and "Frames"). Only connection.ts uses it: every connect and reconnect
// opens a new session.
import type { ClientRequest, IncomingMessage } from "node:http";
import { WebSocket, type RawData } from "ws";
import type { DecodeOptions } from "../codec/decode.js";
import type { FetchResult } from "../codec/messages/fetchResult.js";
import type { PushFrame } from "../codec/messages/frame.js";
import { TypedEmitter } from "../emitter.js";
import {
  AbortError,
  ConnectorError,
  TimeoutError,
  WebSocketError,
  isConnectorError,
} from "../errors.js";
import { previewBody } from "../http/client.js";
import type { Logger } from "../logger.js";
import {
  PROTOBUF_ENCODING,
  PayloadType,
  decodeFetchResult,
  decodePushFrame,
  encodeAck,
  encodeEnterRoom,
  encodeHeartbeat,
} from "./frames.js";

/**
 * How long `close()` waits for the server to answer the close frame before
 * terminating the socket (2.4.0's `WS_DISCONNECT_TIMEOUT_MS`).
 */
export const CLOSE_GRACE_MS = 2_000;

// How long, and how much of, the body of a refused upgrade is read for the
// debug log before the socket is terminated.
const REFUSAL_READ_MS = 500;
const REFUSAL_READ_CHARS = 1_000;

/** What {@link WebcastSession.open} needs. */
export interface SessionOptions {
  /** The full WebSocket URL. */
  url: string;
  /** The upgrade request's headers, `User-Agent` and `Cookie` included. */
  headers: Record<string, string>;
  /** The room to enter. */
  roomId: string;
  /** How long opening the socket and entering the room may take, in milliseconds. */
  connectTimeoutMs: number;
  /** How often to send a heartbeat once the enter room frame is sent, in milliseconds. */
  heartbeatIntervalMs: number;
  /** Terminate the socket when no frame arrives for this long once in the room, in milliseconds; `0` never does. */
  idleTimeoutMs: number;
  /** How long `close()` waits for the server's close frame. Default {@link CLOSE_GRACE_MS}. */
  closeGraceMs?: number;
  /** Aborts the opening: `open()` rejects with an `AbortError`. Ignored once in the room. */
  signal?: AbortSignal;
  /** Where unsafe counters in batches are reported. */
  decodeOptions?: DecodeOptions;
  /** Where to log. */
  logger: Logger;
}

/**
 * Why a session ended:
 *
 * - `close`: the socket closed: the server or the network closed it, or `close()` was called.
 * - `error`: the socket failed, or didn't open and enter the room within `connectTimeoutMs`.
 * - `idle`: no frame arrived for `idleTimeoutMs`, so the session terminated the socket.
 * - `terminated`: `terminate()` was called, or the `signal` aborted the opening.
 */
export type SessionCloseReason = "close" | "error" | "idle" | "terminated";

/** Payload of a session's `closed` event. */
export interface SessionClosed {
  /** Why the session ended. */
  reason: SessionCloseReason;
  /** The close code, when the socket got as far as closing: the server's, or 1005 (none sent) or 1006 (abnormal). */
  code?: number;
  /** The close reason the server sent, when it sent one. */
  reasonText?: string;
  /** What ended the session, as the connection reports it. */
  error: ConnectorError;
}

/** Payload of a session's `batch` event. */
export interface SessionBatch {
  /** The decoded batch. */
  result: FetchResult;
  /** The frame it came in. */
  frame: PushFrame;
}

/** Events of a {@link WebcastSession}. */
export interface SessionEvents {
  /** A batch arrived in a `msg` frame. It was acked already when it asked for an ack. */
  batch: SessionBatch;
  /** A frame couldn't be read (a `ProtocolError`). The socket stays open. */
  error: ConnectorError;
  /**
   * The session ended, whether it entered the room or not. Emitted exactly
   * once, after every timer was cleared.
   */
  closed: SessionClosed;
}

interface Ending {
  reason: SessionCloseReason;
  error: ConnectorError;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// A failure as a ConnectorError: as it is, or wrapped as INTERNAL.
function toConnectorError(error: unknown, what: string): ConnectorError {
  return isConnectorError(error)
    ? error
    : new ConnectorError("INTERNAL", `${what}: ${messageOf(error)}`, {
        cause: error,
      });
}

function abortError(signal: AbortSignal): AbortError {
  return new AbortError("Opening the WebSocket was aborted", {
    cause: signal.reason,
  });
}

// A plain Uint8Array view of a received message, without copying it. ws hands
// out Buffers (binaryType "nodebuffer", its default).
function toBytes(data: RawData): Uint8Array {
  const bytes = Array.isArray(data) ? Buffer.concat(data) : data;
  return bytes instanceof ArrayBuffer
    ? new Uint8Array(bytes)
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * One WebSocket: opens it with the headers, enters the room, sends
 * heartbeats, watches for silence (`idleTimeoutMs`), decompresses and decodes
 * `msg` frames, acks the batches that ask for it, and reports how it ended.
 * Opens once; the connection makes a new session for every reconnect.
 *
 * Nothing it does throws from a socket callback: a frame it can't read is an
 * `error` event, and anything else that fails ends the session (`closed`).
 */
export class WebcastSession extends TypedEmitter<SessionEvents> {
  #options: SessionOptions | undefined;
  #socket: WebSocket | undefined;
  // open()'s promise until the room is entered or the session ends.
  #opening: PromiseWithResolvers<void> | undefined;
  readonly #ended = Promise.withResolvers<void>();
  // What ends the session, when it is decided before the socket closes. The
  // first one wins; the socket's close event finishes the session.
  #ending: Ending | undefined;
  #closed = false;
  // Removes open()'s listener on its signal.
  #unlink: () => void = () => {};
  #seqId = 0;
  #pinged = false;
  #heartbeatAnswered = false;
  #connectTimer: NodeJS.Timeout | undefined;
  #heartbeatTimer: NodeJS.Timeout | undefined;
  #idleTimer: NodeJS.Timeout | undefined;
  #closeTimer: NodeJS.Timeout | undefined;

  /**
   * Opens the socket and enters the room: resolves when the server confirms
   * the entry (`im_enter_room_resp`) or sends its first batch, whichever comes
   * first. Rejects with a `TimeoutError` (phase `connect`) when that takes
   * longer than `connectTimeoutMs`, a `WebSocketError` when the socket fails
   * or closes first, and an `AbortError` when `signal` aborts. A session
   * opens once.
   */
  open(options: SessionOptions): Promise<void> {
    if (this.#options !== undefined || this.#closed) {
      return Promise.reject(
        new ConnectorError("INTERNAL", "A WebcastSession opens only once"),
      );
    }
    this.#options = options;
    const opening = Promise.withResolvers<void>();
    this.#opening = opening;
    const { signal } = options;
    if (signal?.aborted) {
      this.#finish({ reason: "terminated", error: abortError(signal) });
      return opening.promise;
    }
    let socket: WebSocket;
    try {
      socket = this.openSocket(options.url, options.headers);
    } catch (error) {
      this.#finish({
        reason: "error",
        error: new WebSocketError(
          `Can't open the WebSocket: ${messageOf(error)}`,
          { cause: error },
        ),
      });
      return opening.promise;
    }
    this.#socket = socket;
    socket.on(
      "open",
      this.#guard(() => this.#onOpen()),
    );
    socket.on(
      "message",
      this.#guard((data: RawData) => this.#onMessage(data)),
    );
    socket.on(
      "ping",
      this.#guard(() => this.#onPing()),
    );
    socket.on(
      "unexpected-response",
      this.#guard((_request: ClientRequest, response: IncomingMessage) =>
        this.#onRefused(response),
      ),
    );
    socket.on(
      "error",
      this.#guard((error: Error) => this.#onError(error)),
    );
    socket.on(
      "close",
      this.#guard((code: number, reason: Buffer) =>
        this.#onClose(code, reason),
      ),
    );
    this.#connectTimer = setTimeout(
      this.#guard(() => this.#onConnectTimeout()),
      options.connectTimeoutMs,
    );
    if (signal !== undefined) {
      const onAbort = () => {
        this.#end("terminated", abortError(signal));
        socket.terminate();
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.#unlink = () => signal.removeEventListener("abort", onAbort);
    }
    return opening.promise;
  }

  /**
   * Closes the socket with a close frame (`code`, default 1000), and
   * terminates it when the server doesn't answer within `closeGraceMs`.
   * Resolves once the socket is closed. Idempotent.
   */
  // The connection calls it on `run.session`, which fallow doesn't follow.
  // fallow-ignore-next-line unused-class-member
  close(code = 1000): Promise<void> {
    if (!this.#closed) {
      this.#end(
        "close",
        new WebSocketError("The WebSocket was closed", { closeCode: code }),
      );
      const socket = this.#socket;
      if (socket === undefined) {
        this.#finish(this.#ending!);
      } else if (this.#closeTimer === undefined) {
        socket.close(code);
        this.#closeTimer = setTimeout(
          () => socket.terminate(),
          this.#options!.closeGraceMs ?? CLOSE_GRACE_MS,
        );
      }
    }
    return this.#ended.promise;
  }

  /** Destroys the socket at once, without a close frame (`closed` with reason `terminated`). Idempotent. */
  terminate(): void {
    if (this.#closed) return;
    this.#end(
      "terminated",
      new WebSocketError("The WebSocket was terminated", { closeCode: 1006 }),
    );
    if (this.#socket === undefined) this.#finish(this.#ending!);
    else this.#socket.terminate();
  }

  /**
   * Creates the socket. The only place that knows how: `ws`, because Node's
   * built-in WebSocket can't send the `Cookie` and `User-Agent` headers. A
   * subclass can open it another way.
   *
   * `ws` keeps its defaults otherwise. It answers the server's pings
   * (`autoPong`), as browsers must; 2.4.0 turned that off without saying why
   * (PROTOCOL.md, open item 11).
   */
  protected openSocket(
    url: string,
    headers: Record<string, string>,
  ): WebSocket {
    return new WebSocket(url, { headers });
  }

  // Wraps a socket or timer callback: whatever it throws ends the session
  // instead of reaching the socket's emitter.
  #guard<A extends unknown[]>(
    handler: (...args: A) => void,
  ): (...args: A) => void {
    return (...args) => {
      try {
        handler(...args);
      } catch (error) {
        this.#fail(error);
      }
    };
  }

  // Every guarded callback belongs to the socket, so there is one to end.
  #fail(error: unknown): void {
    this.#end("error", toConnectorError(error, "The WebSocket session failed"));
    this.#socket?.terminate();
  }

  #end(reason: SessionCloseReason, error: ConnectorError): void {
    this.#ending ??= { reason, error };
  }

  #onOpen(): void {
    const { roomId, heartbeatIntervalMs } = this.#options!;
    this.#send(encodeEnterRoom({ roomId }));
    // 2.4.0 starts the heartbeats once the enter frame is sent: the server
    // closes a socket that sends them before.
    this.#heartbeatTimer = setInterval(
      this.#guard(() =>
        this.#send(encodeHeartbeat({ roomId, seqId: ++this.#seqId })),
      ),
      heartbeatIntervalMs,
    );
  }

  #onMessage(data: RawData): void {
    if (this.#ending !== undefined) return;
    this.#idleTimer?.refresh();
    let frame: PushFrame;
    try {
      frame = decodePushFrame(toBytes(data));
    } catch (error) {
      this.#report(error);
      return;
    }
    switch (frame.payloadType) {
      case PayloadType.BATCH:
        this.#onBatch(frame);
        break;
      case PayloadType.ENTER_ROOM_RESPONSE:
        this.#entered("the server's im_enter_room_resp");
        break;
      case PayloadType.HEARTBEAT:
        this.#onHeartbeatReply();
        break;
      default:
        // PROTOCOL.md, open item 4: which other types the server sends.
        this.#options!.logger(
          "debug",
          `Ignored a WebSocket frame of type "${frame.payloadType}"`,
          {
            payloadType: frame.payloadType,
            payloadEncoding: frame.payloadEncoding,
            bytes: frame.payload.length,
          },
        );
    }
  }

  #onBatch(frame: PushFrame): void {
    if (frame.payloadEncoding !== PROTOBUF_ENCODING) {
      this.#options!.logger(
        "debug",
        `Ignored a batch encoded as "${frame.payloadEncoding}"`,
        { bytes: frame.payload.length },
      );
      return;
    }
    let result: FetchResult;
    try {
      result = decodeFetchResult(frame.payload, this.#options!.decodeOptions);
    } catch (error) {
      this.#report(error);
      return;
    }
    if (result.needAck) this.#ack(frame.logId, result.internalExt);
    this.#entered("the first batch");
    this.emit("batch", { result, frame });
  }

  #ack(logId: string, internalExt: string): void {
    if (logId === "0" || internalExt === "") {
      this.#options!.logger(
        "debug",
        `A batch asked for an ack without ${logId === "0" ? "a log id" : "an internalExt"}: not acked`,
      );
      return;
    }
    this.#send(encodeAck({ logId, internalExt }));
  }

  // `by` says what showed the room was entered (PROTOCOL.md, open item 16).
  #entered(by: string): void {
    const opening = this.#opening;
    if (opening === undefined) return;
    this.#opening = undefined;
    const { idleTimeoutMs, logger, roomId } = this.#options!;
    logger("debug", `Entered room ${roomId}: ${by}`);
    clearTimeout(this.#connectTimer);
    this.#unlink();
    if (idleTimeoutMs > 0) {
      this.#idleTimer = setTimeout(
        this.#guard(() => this.#onIdle()),
        idleTimeoutMs,
      );
    }
    opening.resolve();
  }

  // The server answers a heartbeat with an `hb` frame of its own (seen in the
  // first smoke run). Like any frame, it keeps the idle check quiet; the first
  // one is logged.
  #onHeartbeatReply(): void {
    if (this.#heartbeatAnswered) return;
    this.#heartbeatAnswered = true;
    this.#options!.logger("debug", "The server answers heartbeats");
  }

  #onPing(): void {
    if (this.#ending !== undefined) return;
    this.#idleTimer?.refresh();
    if (!this.#pinged) {
      this.#pinged = true;
      this.#options!.logger("debug", "The server sends WebSocket pings");
    }
  }

  #onIdle(): void {
    this.#end(
      "idle",
      new TimeoutError(
        `No frame arrived for ${this.#options!.idleTimeoutMs} ms`,
        { phase: "idle" },
      ),
    );
    this.#socket!.terminate();
  }

  #onConnectTimeout(): void {
    this.#end(
      "error",
      new TimeoutError(
        `The WebSocket didn't open and enter the room within ${this.#options!.connectTimeoutMs} ms`,
        { phase: "connect" },
      ),
    );
    this.#socket!.terminate();
  }

  // The server answered the upgrade request with an HTTP response instead of
  // switching to a WebSocket (PROTOCOL.md, "WebSocket"). The session ends with
  // a WebSocketError holding the status. The start of the body, read for
  // REFUSAL_READ_MS at most, goes to the debug log; then the socket is
  // terminated.
  #onRefused(response: IncomingMessage): void {
    // A client's response always has a status.
    const status = response.statusCode!;
    this.#end(
      "error",
      new WebSocketError(
        `The WebSocket failed to open: the server answered ${status} instead of switching protocols`,
        { status },
      ),
    );
    let body = "";
    let read = false;
    const finish = () => {
      if (read) return;
      read = true;
      clearTimeout(timer);
      this.#options!.logger(
        "debug",
        `The server refused the WebSocket with ${status}`,
        {
          status,
          contentType: response.headers["content-type"],
          body: previewBody(body),
        },
      );
      this.#socket!.terminate();
    };
    const timer = setTimeout(this.#guard(finish), REFUSAL_READ_MS);
    response.setEncoding("utf8");
    response.on(
      "data",
      this.#guard((chunk: string) => {
        body += chunk;
        if (body.length >= REFUSAL_READ_CHARS) finish();
      }),
    );
    response.on("end", this.#guard(finish));
    response.on("error", this.#guard(finish));
  }

  #onError(error: Error): void {
    const opening = this.#opening !== undefined;
    this.#end(
      "error",
      new WebSocketError(
        `The WebSocket failed${opening ? " to open" : ""}: ${error.message}`,
        { cause: error },
      ),
    );
  }

  #onClose(code: number, reason: Buffer): void {
    const reasonText = reason.toString();
    const ending = this.#ending ?? {
      reason: "close",
      error: new WebSocketError(
        `The WebSocket closed with code ${code}${reasonText ? ` (${reasonText})` : ""}${this.#opening === undefined ? "" : " before entering the room"}`,
        { closeCode: code },
      ),
    };
    this.#finish({ ...ending, code, ...(reasonText ? { reasonText } : {}) });
  }

  #send(bytes: Uint8Array): void {
    const socket = this.#socket;
    if (socket?.readyState === WebSocket.OPEN) socket.send(bytes);
  }

  // The decoders throw ProtocolErrors.
  #report(error: unknown): void {
    this.emit("error", toConnectorError(error, "A frame couldn't be read"));
  }

  #finish(closed: SessionClosed): void {
    if (this.#closed) return;
    this.#closed = true;
    clearTimeout(this.#connectTimer);
    clearInterval(this.#heartbeatTimer);
    clearTimeout(this.#idleTimer);
    clearTimeout(this.#closeTimer);
    this.#unlink();
    this.#opening?.reject(closed.error);
    this.#opening = undefined;
    this.#ended.resolve();
    this.emit("closed", closed);
  }
}
