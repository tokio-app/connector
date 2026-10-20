import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import type { ConnectorError } from "../errors.js";
import {
  CLOSE_GRACE_MS,
  WebcastSession,
  type SessionBatch,
  type SessionClosed,
  type SessionEvents,
  type SessionOptions,
} from "./session.js";
import { fromHex } from "../../test/helpers/encoder.js";
import { FakeTikTok, serverFrame } from "../../test/helpers/fakeTikTok.js";

const ROOM_ID = "7140000000000000001";

let fake: FakeTikTok;
let sessions: WebcastSession[];

beforeEach(async () => {
  fake = await FakeTikTok.start();
  sessions = [];
});

afterEach(async () => {
  for (const session of sessions) session.terminate();
  await Promise.all(sessions.map((session) => session.close()));
  await fake.close();
});

function sessionOptions(
  overrides: Partial<SessionOptions> = {},
): SessionOptions {
  return {
    url: fake.url,
    headers: { "User-Agent": "test-agent", Cookie: "a=1; b=2" },
    roomId: ROOM_ID,
    connectTimeoutMs: 2_000,
    heartbeatIntervalMs: 10_000,
    idleTimeoutMs: 0,
    logger: vi.fn(),
    ...overrides,
  };
}

// A session with its events recorded; afterEach ends it.
function track(session = new WebcastSession()) {
  sessions.push(session);
  const batches: SessionBatch[] = [];
  const errors: ConnectorError[] = [];
  const closed: SessionClosed[] = [];
  session.on("batch", (batch) => batches.push(batch));
  session.on("error", (error) => errors.push(error));
  session.on("closed", (event) => closed.push(event));
  return { session, batches, errors, closed };
}

async function openSession(overrides: Partial<SessionOptions> = {}) {
  const tracked = track();
  const options = sessionOptions(overrides);
  await tracked.session.open(options);
  return { ...tracked, logger: options.logger, connection: fake.last };
}

function next<K extends keyof SessionEvents>(
  session: WebcastSession,
  event: K,
): Promise<SessionEvents[K]> {
  return new Promise((resolve) => session.once(event, resolve));
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const chat = (msgId: string) => ({
  method: "WebcastChatMessage",
  msgId,
  payload: fromHex("0a 00"),
});

describe("WebcastSession.open", () => {
  it("opens the socket with the URL and headers, then enters the room", async () => {
    const { connection } = await openSession();
    expect(fake.connections).toHaveLength(1);
    expect(connection.url.pathname).toBe(
      "/webcast/im/ws_proxy/ws_reuse_supplement/",
    );
    expect(connection.headers["user-agent"]).toBe("test-agent");
    expect(connection.headers.cookie).toBe("a=1; b=2");
    const [first] = connection.frames;
    expect(first?.frame).toMatchObject({
      logId: "0",
      payloadEncoding: "pb",
      payloadType: "im_enter_room",
    });
    expect(first?.enter).toMatchObject({
      roomId: ROOM_ID,
      liveId: 12,
      identity: "audience",
      filterWelcomeMsg: "0",
    });
    expect(BigInt(first!.enter!.enterUniqueId)).toBeGreaterThan(0n);
  });

  it("makes a new entry id for each session", async () => {
    await openSession();
    await openSession();
    const [first, second] = fake.framesOfType("im_enter_room");
    expect(first?.enter?.enterUniqueId).not.toBe(second?.enter?.enterUniqueId);
  });

  it("resolves on the first batch when the entry isn't confirmed", async () => {
    fake.answerEnter = false;
    const { session, batches } = track();
    const opening = session.open(sessionOptions());
    await vi.waitFor(() =>
      expect(fake.framesOfType("im_enter_room")).toHaveLength(1),
    );
    fake.push([chat("1")]);
    await opening;
    expect(batches).toHaveLength(1);
  });

  it("rejects with a TimeoutError when the room isn't entered in time", async () => {
    fake.answerEnter = false;
    const { session, closed } = track();
    const started = Date.now();
    await expect(
      session.open(sessionOptions({ connectTimeoutMs: 100 })),
    ).rejects.toMatchObject({ code: "TIMEOUT", phase: "connect" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(90);
    expect(closed).toEqual([
      expect.objectContaining({
        reason: "error",
        error: expect.objectContaining({ code: "TIMEOUT", phase: "connect" }),
      }),
    ]);
  });

  it("rejects with a WebSocketError when nothing listens", async () => {
    const { url } = fake;
    await fake.close();
    const { session, closed } = track();
    await expect(session.open(sessionOptions({ url }))).rejects.toMatchObject({
      code: "WEBSOCKET",
      message: expect.stringMatching(/^The WebSocket failed to open: /),
    });
    expect(closed).toEqual([expect.objectContaining({ reason: "error" })]);
  });

  it("rejects when the server closes the socket before the entry", async () => {
    fake.answerEnter = false;
    fake.onConnection = (connection) => connection.socket.close(4001, "nope");
    const { session, closed } = track();
    await expect(session.open(sessionOptions())).rejects.toMatchObject({
      code: "WEBSOCKET",
      closeCode: 4001,
      message:
        "The WebSocket closed with code 4001 (nope) before entering the room",
    });
    expect(closed).toEqual([
      expect.objectContaining({
        reason: "close",
        code: 4001,
        reasonText: "nope",
      }),
    ]);
  });

  it("rejects with an AbortError when the signal aborts the opening", async () => {
    fake.answerEnter = false;
    const controller = new AbortController();
    const { session, closed } = track();
    const opening = session.open(sessionOptions({ signal: controller.signal }));
    await vi.waitFor(() => expect(fake.connections).toHaveLength(1));
    const reason = new Error("stop");
    controller.abort(reason);
    await expect(opening).rejects.toMatchObject({
      code: "ABORTED",
      cause: reason,
    });
    expect(closed).toEqual([
      expect.objectContaining({
        reason: "terminated",
        error: expect.objectContaining({ code: "ABORTED" }),
      }),
    ]);
  });

  it("rejects at once when the signal already aborted", async () => {
    const { session, closed } = track();
    await expect(
      session.open(sessionOptions({ signal: AbortSignal.abort() })),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(closed).toEqual([expect.objectContaining({ reason: "terminated" })]);
  });

  it("ignores the signal once in the room", async () => {
    const controller = new AbortController();
    const { closed } = await openSession({ signal: controller.signal });
    controller.abort();
    await delay(20);
    expect(closed).toEqual([]);
  });

  it("rejects when the socket can't be created", async () => {
    const { session, closed } = track();
    await expect(
      session.open(sessionOptions({ url: "not a url" })),
    ).rejects.toMatchObject({
      code: "WEBSOCKET",
      message: expect.stringMatching(/^Can't open the WebSocket: /),
    });
    expect(closed).toEqual([expect.objectContaining({ reason: "error" })]);
  });

  it("says what went wrong, whatever opening the socket throws", async () => {
    class Session extends WebcastSession {
      protected override openSocket(): WebSocket {
        // oxlint-disable-next-line no-throw-literal -- a value that isn't an Error
        throw "no sockets today";
      }
    }
    const { session } = track(new Session());
    await expect(session.open(sessionOptions())).rejects.toMatchObject({
      code: "WEBSOCKET",
      message: "Can't open the WebSocket: no sockets today",
    });
  });

  it("opens only once", async () => {
    const { session } = await openSession();
    await expect(session.open(sessionOptions())).rejects.toMatchObject({
      code: "INTERNAL",
    });
  });

  it("ends the session when a socket callback throws", async () => {
    // The enter room frame can't be written for a room id that isn't a number.
    const { session, closed } = track();
    await expect(
      session.open(sessionOptions({ roomId: "room" })),
    ).rejects.toMatchObject({ code: "INTERNAL" });
    expect(closed).toEqual([expect.objectContaining({ reason: "error" })]);
  });
});

describe("heartbeats", () => {
  it("sends one every interval after the entry, numbered from 1", async () => {
    const started = Date.now();
    await openSession({ heartbeatIntervalMs: 50 });
    await vi.waitFor(
      () => expect(fake.framesOfType("hb").length).toBeGreaterThanOrEqual(3),
      { timeout: 2_000 },
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    expect(fake.receivedFrames[0]?.frame.payloadType).toBe("im_enter_room");
    expect(
      fake
        .framesOfType("hb")
        .slice(0, 3)
        .map(({ heartbeat }) => heartbeat),
    ).toEqual([
      { roomId: ROOM_ID, sendPacketSeqId: 1 },
      { roomId: ROOM_ID, sendPacketSeqId: 2 },
      { roomId: ROOM_ID, sendPacketSeqId: 3 },
    ]);
  });

  it("starts over at 1 on a new socket", async () => {
    const first = await openSession({ heartbeatIntervalMs: 50 });
    await vi.waitFor(() =>
      expect(first.connection.frames.length).toBeGreaterThanOrEqual(3),
    );
    first.session.terminate();
    const second = await openSession({ heartbeatIntervalMs: 50 });
    await vi.waitFor(() =>
      expect(second.connection.frames.length).toBeGreaterThanOrEqual(2),
    );
    expect(second.connection.frames[1]?.heartbeat?.sendPacketSeqId).toBe(1);
  });
});

describe("batches", () => {
  it("emits each batch with its frame, gzipped or not, in order", async () => {
    const { batches } = await openSession();
    fake.push([chat("1")], { cursor: "c1" });
    fake.push([chat("2"), chat("3")], { cursor: "c2", gzip: true });
    fake.push([chat("4")], { cursor: "c3" });
    await vi.waitFor(() => expect(batches).toHaveLength(3));
    expect(batches.map(({ result }) => result.cursor)).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
    expect(batches[1]?.result.messages).toEqual([
      {
        method: "WebcastChatMessage",
        payload: fromHex("0a 00"),
        msgId: "2",
        msgType: 0,
        isHistory: false,
      },
      expect.objectContaining({ msgId: "3" }),
    ]);
    expect(batches[0]?.frame).toMatchObject({
      payloadEncoding: "pb",
      payloadType: "msg",
    });
  });

  it("acks a batch that asks for it with the frame's log id and the batch's internalExt", async () => {
    const { batches } = await openSession();
    fake.push([chat("1")], {
      needAck: true,
      logId: "7400000000000000001",
      internalExt: "internal_src:dim|first_req_ms:1",
    });
    await vi.waitFor(() => expect(fake.framesOfType("ack")).toHaveLength(1));
    const [ack] = fake.framesOfType("ack");
    expect(ack?.frame).toMatchObject({
      logId: "7400000000000000001",
      payloadEncoding: "pb",
      payloadType: "ack",
    });
    expect(ack?.ack).toBe("internal_src:dim|first_req_ms:1");
    expect(batches).toHaveLength(1);
  });

  it("doesn't ack without needAck, a log id or an internalExt", async () => {
    const { batches, logger } = await openSession();
    fake.push([chat("1")], { needAck: false });
    fake.push([chat("2")], { needAck: true, internalExt: "" });
    fake.push([chat("3")], { needAck: true, logId: "0" });
    fake.push([chat("4")], { needAck: true, logId: "5", internalExt: "x" });
    await vi.waitFor(() => expect(batches).toHaveLength(4));
    await vi.waitFor(() => expect(fake.framesOfType("ack")).toHaveLength(1));
    expect(fake.framesOfType("ack")[0]?.ack).toBe("x");
    expect(logger).toHaveBeenCalledWith(
      "debug",
      "A batch asked for an ack without an internalExt: not acked",
    );
    expect(logger).toHaveBeenCalledWith(
      "debug",
      "A batch asked for an ack without a log id: not acked",
    );
  });

  it("reports frames it can't read and keeps going", async () => {
    const { batches, errors } = await openSession();
    fake.pushFrame(fromHex("0a ff ff"));
    fake.pushFrame(
      serverFrame({ payloadType: "msg", payload: fromHex("1f 8b 08 00 00") }),
    );
    fake.pushFrame(
      serverFrame({ payloadType: "msg", payload: fromHex("0a 05 01") }),
    );
    fake.push([chat("1")]);
    await vi.waitFor(() => expect(batches).toHaveLength(1));
    expect(errors).toHaveLength(3);
    for (const error of errors) {
      expect(error).toMatchObject({ code: "PROTOCOL" });
    }
  });

  it("ignores other payload types and encodings, with a debug log", async () => {
    const { batches, logger } = await openSession();
    fake.pushFrame(
      serverFrame({ payloadType: "hb", payload: fromHex("08 01") }),
    );
    fake.pushFrame(
      serverFrame({
        payloadType: "msg",
        payloadEncoding: "json",
        payload: fromHex("7b 7d"),
      }),
    );
    fake.push([chat("1")]);
    await vi.waitFor(() => expect(batches).toHaveLength(1));
    expect(logger).toHaveBeenCalledWith(
      "debug",
      'Ignored a WebSocket frame of type "hb"',
      { payloadType: "hb", payloadEncoding: "pb", bytes: 2 },
    );
    expect(logger).toHaveBeenCalledWith(
      "debug",
      'Ignored a batch encoded as "json"',
      { bytes: 2 },
    );
  });

  it.each(["arraybuffer", "fragments"] as const)(
    "reads messages of a socket with binaryType %s",
    async (binaryType) => {
      class Session extends WebcastSession {
        protected override openSocket(
          url: string,
          headers: Record<string, string>,
        ): WebSocket {
          const socket = super.openSocket(url, headers);
          socket.binaryType = binaryType;
          return socket;
        }
      }
      const { session, batches } = track(new Session());
      await session.open(sessionOptions());
      fake.push([chat("1")], { gzip: true });
      await vi.waitFor(() => expect(batches).toHaveLength(1));
      expect(batches[0]?.result.messages[0]?.payload).toEqual(fromHex("0a 00"));
    },
  );
});

describe("idle watchdog", () => {
  it("terminates the socket when no frame arrives for idleTimeoutMs", async () => {
    const { closed } = await openSession({ idleTimeoutMs: 150 });
    await vi.waitFor(() => expect(closed).toHaveLength(1), { timeout: 2_000 });
    expect(closed[0]).toMatchObject({
      reason: "idle",
      code: 1006,
      error: { code: "TIMEOUT", phase: "idle" },
    });
  });

  it("waits again after every frame", async () => {
    const { closed, batches } = await openSession({ idleTimeoutMs: 200 });
    for (let index = 0; index < 8; index++) {
      fake.push([chat(String(index))]);
      await delay(50);
    }
    expect(batches.length).toBeGreaterThan(0);
    expect(closed).toEqual([]);
  });

  it("counts pings as frames, and answers them", async () => {
    const { closed, logger, connection } = await openSession({
      idleTimeoutMs: 200,
    });
    let pongs = 0;
    connection.socket.on("pong", () => pongs++);
    for (let index = 0; index < 8; index++) {
      connection.socket.ping();
      await delay(50);
    }
    expect(closed).toEqual([]);
    expect(pongs).toBeGreaterThan(0);
    expect(
      vi
        .mocked(logger)
        .mock.calls.filter(([, message]) => message.includes("pings")),
    ).toEqual([["debug", "The server sends WebSocket pings"]]);
  });

  it("never fires with idleTimeoutMs 0", async () => {
    const { closed } = await openSession({ idleTimeoutMs: 0 });
    await delay(150);
    expect(closed).toEqual([]);
  });
});

describe("closing", () => {
  it("close() sends a close frame and resolves once the socket closed", async () => {
    const { session, closed, connection } = await openSession();
    const serverClosed = new Promise<number>((resolve) =>
      connection.socket.once("close", resolve),
    );
    await session.close();
    expect(await serverClosed).toBe(1000);
    expect(closed).toEqual([
      {
        reason: "close",
        code: 1000,
        error: expect.objectContaining({ code: "WEBSOCKET", closeCode: 1000 }),
      },
    ]);
  });

  it("close() terminates a socket the server doesn't close", async () => {
    expect(CLOSE_GRACE_MS).toBe(2_000);
    // Heartbeats fall due while the socket is closing: none is sent.
    const { session, closed, connection } = await openSession({
      closeGraceMs: 100,
      heartbeatIntervalMs: 20,
    });
    connection.socket.pause();
    const started = Date.now();
    await session.close();
    expect(Date.now() - started).toBeGreaterThanOrEqual(90);
    expect(closed).toEqual([
      expect.objectContaining({ reason: "close", code: 1006 }),
    ]);
  });

  it("close() is idempotent while the socket closes", async () => {
    const { session, closed } = await openSession();
    const first = session.close();
    const second = session.close();
    await Promise.all([first, second]);
    expect(closed).toEqual([
      expect.objectContaining({ reason: "close", code: 1000 }),
    ]);
  });

  it("ignores the frames and pings that arrive once closing", async () => {
    const { session, batches, logger, connection } = await openSession({
      idleTimeoutMs: 1_000,
    });
    // Sent before the server reads the close frame, read after close().
    fake.push([chat("1")]);
    connection.socket.ping();
    await session.close();
    expect(batches).toEqual([]);
    expect(logger).not.toHaveBeenCalledWith(
      "debug",
      "The server sends WebSocket pings",
    );
  });

  it("reports a socket failing after the entry", async () => {
    const { session, connection } = await openSession();
    const ended = next(session, "closed");
    // A WebSocket frame with opcode 15, which doesn't exist.
    const { _socket: tcp } = connection.socket as unknown as {
      _socket: { write(bytes: Uint8Array): void };
    };
    tcp.write(Uint8Array.of(0x8f, 0x00));
    expect(await ended).toMatchObject({
      reason: "error",
      error: {
        code: "WEBSOCKET",
        message: expect.stringMatching(/^The WebSocket failed: /),
      },
    });
  });

  it("terminate() ends the session at once", async () => {
    const { session, closed } = await openSession();
    const ended = next(session, "closed");
    session.terminate();
    expect(await ended).toMatchObject({
      reason: "terminated",
      code: 1006,
      error: { code: "WEBSOCKET", message: "The WebSocket was terminated" },
    });
    expect(closed).toHaveLength(1);
  });

  it("reports the server's close code and reason", async () => {
    const { session, connection } = await openSession();
    const ended = next(session, "closed");
    connection.socket.close(4000, "bye");
    expect(await ended).toMatchObject({
      reason: "close",
      code: 4000,
      reasonText: "bye",
      error: {
        code: "WEBSOCKET",
        closeCode: 4000,
        message: "The WebSocket closed with code 4000 (bye)",
      },
    });
  });

  it("reports a dropped connection", async () => {
    const { session } = await openSession();
    const ended = next(session, "closed");
    fake.dropSocket();
    const event = await ended;
    expect(["close", "error"]).toContain(event.reason);
    expect(event.code).toBe(1006);
    expect(event.error.code).toBe("WEBSOCKET");
  });

  it("emits closed exactly once, whatever is called", async () => {
    const { session, closed } = await openSession();
    session.terminate();
    const closing = session.close();
    session.terminate();
    await closing;
    await session.close();
    await delay(20);
    expect(closed).toHaveLength(1);
  });

  it("emits closed once even if the socket reported closing twice", async () => {
    let socket: WebSocket | undefined;
    class Session extends WebcastSession {
      protected override openSocket(
        url: string,
        headers: Record<string, string>,
      ): WebSocket {
        socket = super.openSocket(url, headers);
        return socket;
      }
    }
    const { session, closed } = track(new Session());
    await session.open(sessionOptions());
    await session.close();
    socket!.emit("close", 1000, Buffer.alloc(0));
    expect(closed).toHaveLength(1);
  });

  it("ends a session that never opened", async () => {
    const { session, closed } = track();
    await session.close();
    session.terminate();
    expect(closed).toEqual([expect.objectContaining({ reason: "close" })]);
    await expect(session.open(sessionOptions())).rejects.toMatchObject({
      code: "INTERNAL",
    });
    const other = track();
    other.session.terminate();
    expect(other.closed).toEqual([
      expect.objectContaining({ reason: "terminated" }),
    ]);
  });

  it("clears every timer when it ends", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    });
    try {
      const { session, connection } = await openSession({
        heartbeatIntervalMs: 50,
        idleTimeoutMs: 1_000,
      });
      // The heartbeat and the idle watchdog; the connect timer is gone.
      expect(vi.getTimerCount()).toBe(2);
      // The server's ws runs a close timer of its own until its side closes.
      const serverClosed = new Promise((resolve) =>
        connection.socket.once("close", resolve),
      );
      await session.close();
      await serverClosed;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
