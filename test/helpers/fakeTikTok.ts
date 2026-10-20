// A local stand-in for TikTok's WebSocket push server, for offline tests: a
// `ws` server on 127.0.0.1 that records what clients send and pushes batches
// built with the test encoder. Point a FakeSigner's push server at `url`.
import type { IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { decodeMessage } from "../../src/codec/decode.js";
import {
  FetchResultSchema,
  type FetchResultMessage,
} from "../../src/codec/messages/fetchResult.js";
import {
  EnterRoomSchema,
  HeartbeatSchema,
  PushFrameSchema,
  type EnterRoomMessage,
  type HeartbeatMessage,
  type PushFrame,
} from "../../src/codec/messages/frame.js";
import { encodeMessage, fields, type EncodeInput } from "./encoder.js";

/** A frame a client sent, decoded. */
export interface ReceivedFrame {
  /** Which connection sent it (its index in `FakeTikTok.connections`). */
  connection: number;
  /** The frame. */
  frame: PushFrame;
  /** The enter room message of an `im_enter_room` frame. */
  enter?: EnterRoomMessage;
  /** The heartbeat of an `hb` frame. */
  heartbeat?: HeartbeatMessage;
  /** The payload of an `ack` frame: the acked batch's internalExt. */
  ack?: string;
}

/** One client connection the server accepted. */
export interface FakeConnection {
  /** Its index in `FakeTikTok.connections`. */
  readonly index: number;
  /** The upgrade request's URL, query string included. */
  readonly url: URL;
  /** The upgrade request's headers (lowercase names). */
  readonly headers: IncomingHttpHeaders;
  /** The frames it sent. */
  readonly frames: ReceivedFrame[];
  /** The server side of the socket. */
  readonly socket: WebSocket;
  /** A silent connection gets no answer and no pushes. */
  silent: boolean;
}

/** A LIVE message to push: its method and id at least. */
export type PushMessage = EncodeInput<FetchResultMessage>;

/** Options of {@link FakeTikTok.push}. */
export interface PushOptions {
  /** Gzip the batch (as TikTok does with `compress=gzip`). Default `false`. */
  gzip?: boolean;
  /** Ask for an ack. Default `false`. */
  needAck?: boolean;
  /** The frame's log id. Default: a new one for each push. */
  logId?: string;
  /** The batch's cursor. Default: `ws-cursor-<n>`. */
  cursor?: string;
  /** The batch's internalExt. Default: `ws-ext-<n>`. */
  internalExt?: string;
  /** Mark every message as history. */
  isHistory?: boolean;
  /** The connection to push to. Default: the last one. */
  connection?: FakeConnection;
}

const utf8 = new TextDecoder();

/** The path the fake push server answers on (any path works). */
const PUSH_PATH = "/webcast/im/ws_proxy/ws_reuse_supplement/";

/** Encodes a frame the server sends. */
export function serverFrame(frame: EncodeInput<PushFrame>): Uint8Array {
  return encodeMessage(PushFrameSchema, {
    payloadEncoding: "pb",
    ...frame,
  });
}

/**
 * A fake TikTok push server. It answers `im_enter_room` with
 * `im_enter_room_resp` (unless `answerEnter` is off or the connection is
 * silent) and records every frame clients send; the test pushes batches.
 * `refuseUpgrade` makes it answer chosen upgrades with a plain HTTP response.
 */
export class FakeTikTok {
  /** Every connection accepted so far, oldest first. */
  readonly connections: FakeConnection[] = [];
  /** Every frame clients sent, oldest first. */
  readonly receivedFrames: ReceivedFrame[] = [];
  /** The URLs of the upgrades `refuseUpgrade` refused, oldest first. */
  readonly refused: URL[] = [];
  /** Answer `im_enter_room` with `im_enter_room_resp`. Default `true`. */
  answerEnter = true;
  /**
   * Called with each upgrade request's URL. A status it returns (TikTok
   * answered a resumed connect with 200) refuses the upgrade with that HTTP
   * response; `undefined` accepts it.
   */
  refuseUpgrade: ((url: URL) => number | undefined) | undefined;
  /** Called with each new connection, before it sends anything. */
  onConnection: ((connection: FakeConnection) => void) | undefined;
  readonly #server: WebSocketServer;
  readonly #port: number;
  #pushes = 0;
  #closing: Promise<void> | undefined;

  private constructor(server: WebSocketServer) {
    this.#server = server;
    this.#port = (server.address() as AddressInfo).port;
    server.on("connection", (socket, request) => {
      const connection: FakeConnection = {
        index: this.connections.length,
        url: new URL(request.url ?? "/", `ws://127.0.0.1:${this.#port}`),
        headers: request.headers,
        frames: [],
        socket,
        silent: false,
      };
      this.connections.push(connection);
      // A client that resets the connection isn't a test failure.
      socket.on("error", () => {});
      socket.on("message", (data) => this.#receive(connection, data));
      this.onConnection?.(connection);
    });
  }

  /** Starts a server on a free port of 127.0.0.1. */
  static async start(): Promise<FakeTikTok> {
    let fake: FakeTikTok | undefined;
    const server = new WebSocketServer({
      host: "127.0.0.1",
      port: 0,
      verifyClient: (info, accept) => {
        const url = new URL(info.req.url ?? "/", "ws://127.0.0.1");
        const status = fake?.refuseUpgrade?.(url);
        if (status === undefined) {
          accept(true);
          return;
        }
        fake?.refused.push(url);
        accept(false, status, "Refused by FakeTikTok");
      },
    });
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    fake = new FakeTikTok(server);
    return fake;
  }

  /** The push server URL, as a signed connect names it. */
  get url(): string {
    return `ws://127.0.0.1:${this.#port}${PUSH_PATH}`;
  }

  /** The last connection accepted. Throws when there is none. */
  get last(): FakeConnection {
    const connection = this.connections.at(-1);
    if (connection === undefined) throw new Error("No client connected yet");
    return connection;
  }

  /** The frames clients sent with `payloadType`. */
  framesOfType(payloadType: string): ReceivedFrame[] {
    return this.receivedFrames.filter(
      ({ frame }) => frame.payloadType === payloadType,
    );
  }

  /**
   * Pushes one batch of `messages` in a `msg` frame. The cursor and
   * internalExt default to new values for every push.
   */
  push(messages: PushMessage[], options: PushOptions = {}): void {
    const count = ++this.#pushes;
    let payload = encodeMessage(FetchResultSchema, {
      messages: messages.map((message) => ({
        ...message,
        isHistory: options.isHistory ?? message.isHistory,
      })),
      cursor: options.cursor ?? `ws-cursor-${count}`,
      internalExt: options.internalExt ?? `ws-ext-${count}`,
      needAck: options.needAck ?? false,
    });
    if (options.gzip) payload = gzipSync(payload);
    this.pushFrame(
      serverFrame({
        seqId: String(count),
        logId:
          options.logId ?? String(7_400_000_000_000_000_000n + BigInt(count)),
        payloadType: "msg",
        payload,
      }),
      options.connection,
    );
  }

  /** Sends raw bytes to a connection (default: the last one), unless it is silent. */
  pushFrame(bytes: Uint8Array, connection: FakeConnection = this.last): void {
    if (connection.silent) return;
    connection.socket.send(bytes);
  }

  /**
   * Pushes a `WebcastControlMessage` with `action` (3 ended, 4 suspended),
   * written field by field: TikTok ending the LIVE.
   */
  endStream(action = 3, connection: FakeConnection = this.last): void {
    this.push(
      [
        {
          method: "WebcastControlMessage",
          msgId: String(9_000_000_000_000_000_000n + BigInt(this.#pushes)),
          payload: fields.varint(2, action),
        },
      ],
      { connection },
    );
  }

  /** Destroys the TCP socket of a connection (default: the last one), as a network failure would. */
  dropSocket(connection: FakeConnection = this.last): void {
    connection.socket.terminate();
  }

  /** Stops answering a connection (default: the last one) and pushing to it; the socket stays open. */
  goSilent(connection: FakeConnection = this.last): void {
    connection.silent = true;
  }

  /** Destroys every client socket and stops the server. Idempotent. */
  close(): Promise<void> {
    this.#closing ??= new Promise<void>((resolve, reject) => {
      for (const client of this.#server.clients) client.terminate();
      this.#server.close((error) => (error ? reject(error) : resolve()));
    });
    return this.#closing;
  }

  #receive(connection: FakeConnection, data: RawData): void {
    // The server's sockets keep ws's binaryType, "nodebuffer": a Buffer.
    const frame = decodeMessage(PushFrameSchema, data as Buffer);
    const received: ReceivedFrame = { connection: connection.index, frame };
    switch (frame.payloadType) {
      case "im_enter_room":
        received.enter = decodeMessage(EnterRoomSchema, frame.payload);
        break;
      case "hb":
        received.heartbeat = decodeMessage(HeartbeatSchema, frame.payload);
        break;
      case "ack":
        received.ack = utf8.decode(frame.payload);
        break;
    }
    connection.frames.push(received);
    this.receivedFrames.push(received);
    if (frame.payloadType === "im_enter_room" && this.answerEnter) {
      this.pushFrame(
        serverFrame({ payloadType: "im_enter_room_resp" }),
        connection,
      );
    }
  }
}
