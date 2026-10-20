import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FetchResultSchema } from "./codec/messages/fetchResult.js";
import { TikTokLiveConnection } from "./connection.js";
import { dispatch } from "./dispatch.js";
import {
  AbortError,
  ConnectorError,
  InvalidUsernameError,
  OfflineError,
  ProtocolError,
  RateLimitError,
  ReconnectGiveUpError,
  RoomNotFoundError,
  SignError,
  TimeoutError,
  WebSocketError,
} from "./errors.js";
import type { WebcastEventMap } from "./events.js";
import { HttpClient } from "./http/client.js";
import { DEFAULT_USER_AGENT } from "./http/params.js";
import type { ConnectOptions } from "./options.js";
import { checkLive, resolveRoomId } from "./room/resolver.js";
import type { SignedConnect } from "./signer/types.js";
import { WebcastSession, type SessionOptions } from "./ws/session.js";
import { encodeMessage, fromHex } from "../test/helpers/encoder.js";
import { FakeSigner } from "../test/helpers/fakeSigner.js";
import { FakeTikTok, serverFrame } from "../test/helpers/fakeTikTok.js";
import {
  jsonResponse,
  never,
  stubFetch,
  type StubHandler,
} from "../test/helpers/fetchStub.js";

// The real modules, with two targeted stand-ins: dispatch is spied on (and
// made to throw where a test needs it), and the room lookup and live check
// answer what each test asks, without HTTP requests. The real lookup and
// check run in connection.integration.test.ts.
vi.mock("./dispatch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./dispatch.js")>();
  return { ...actual, dispatch: vi.fn(actual.dispatch) };
});
vi.mock("./room/resolver.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./room/resolver.js")>()),
  resolveRoomId: vi.fn(),
  checkLive: vi.fn(),
}));

const ROOM_ID = "7140000000000000001";
const OTHER_ROOM_ID = "7140000000000000002";

// A gift list entry, as TikTok's gift lists hold them.
const ROSE = {
  id: 5655,
  name: "Rose",
  diamond_count: 1,
  image: { url_list: ["https://p16.example/rose.webp"], uri: "rose" },
};

// The real WebcastSession.open, for spies that wrap it (called with each
// session as `this`).
// oxlint-disable-next-line typescript/unbound-method
const realOpen = WebcastSession.prototype.open;

let fake: FakeTikTok;
let signer: FakeSigner;
let connections: TikTokLiveConnection[];

beforeEach(async () => {
  // Resets the stand-ins; dispatch's spy goes back to the real dispatch.
  vi.resetAllMocks();
  vi.mocked(resolveRoomId).mockResolvedValue(ROOM_ID);
  vi.mocked(checkLive).mockResolvedValue(true);
  fake = await FakeTikTok.start();
  signer = new FakeSigner({ pushServer: fake.url });
  connections = [];
});

afterEach(async () => {
  await Promise.all(connections.map((connection) => connection.disconnect()));
  await fake.close();
});

type Recorded = {
  [K in keyof WebcastEventMap]: { event: K; payload: WebcastEventMap[K] };
}[keyof WebcastEventMap];

const LIFECYCLE = [
  "connected",
  "disconnected",
  "reconnecting",
  "streamEnd",
] as const;

// A connection with short timers, its lifecycle events and its `raw`
// messages recorded. afterEach disconnects it.
function create(options: ConnectOptions = {}) {
  const logger = vi.fn();
  const connection = new TikTokLiveConnection("@someone", {
    signer,
    logger,
    heartbeatIntervalMs: 50,
    idleTimeoutMs: 0,
    connectTimeoutMs: 2_000,
    ...options,
    reconnect:
      options.reconnect === false
        ? false
        : { baseDelayMs: 10, maxDelayMs: 40, ...options.reconnect },
  });
  connections.push(connection);
  const events: Recorded[] = [];
  for (const event of LIFECYCLE) {
    connection.on(event, (payload) => {
      events.push({ event, payload } as Recorded);
    });
  }
  const raw: string[] = [];
  connection.on("raw", ({ msgId }) => raw.push(msgId));
  const names = () => events.map(({ event }) => event);
  const ofType = <K extends Recorded["event"]>(event: K) =>
    events
      .filter((entry) => entry.event === event)
      .map(({ payload }) => payload as WebcastEventMap[K]);
  return { connection, logger, events, names, ofType, raw };
}

const chat = (msgId: string, isHistory = false) => ({
  method: "WebcastChatMessage",
  msgId,
  isHistory,
  payload: fromHex("0a 00"),
});

const until = (check: () => void, timeout = 3_000) =>
  vi.waitFor(check, { timeout, interval: 5 });

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("TikTokLiveConnection", () => {
  it("normalizes the username and starts idle", () => {
    const connection = new TikTokLiveConnection(
      "https://www.tiktok.com/@someone/live",
    );
    expect(connection.username).toBe("someone");
    expect(connection.state).toBe("idle");
    expect(connection.roomId).toBe(null);
  });

  it("takes the room id from the options", () => {
    const connection = new TikTokLiveConnection("someone", {
      roomId: "7140000000000000001",
    });
    expect(connection.roomId).toBe("7140000000000000001");
  });

  it("throws for an invalid username or option", () => {
    expect(() => new TikTokLiveConnection("@")).toThrow(InvalidUsernameError);
    expect(
      () => new TikTokLiveConnection("someone", { heartbeatIntervalMs: 0 }),
    ).toThrow(RangeError);
  });

  it("logs a listener that throws instead of breaking the emit", () => {
    const logger = vi.fn();
    const connection = new TikTokLiveConnection("someone", { logger });
    const failure = new Error("listener failed");
    connection.on("streamEnd", () => {
      throw failure;
    });

    connection.emit("streamEnd", { action: "ended" });

    expect(logger).toHaveBeenCalledWith(
      "error",
      'A listener of the "streamEnd" event threw',
      { error: failure },
    );
  });

  it("makes its HTTP requests with the fetch, clientParams, headers and session options", async () => {
    const stub = stubFetch(() => jsonResponse({ data: { gifts: [ROSE] } }));
    const { connection, logger } = create({
      fetch: stub.fetch,
      roomId: ROOM_ID,
      clientParams: { app_language: "fr" },
      headers: { "X-Test": "1" },
      session: { sessionId: "sid" },
    });
    await expect(connection.fetchGifts()).resolves.toMatchObject({
      source: "room",
    });
    const [request] = stub.requests;
    expect(request?.url.searchParams.get("room_id")).toBe(ROOM_ID);
    expect(request?.url.searchParams.get("app_language")).toBe("fr");
    expect(request?.headers.get("x-test")).toBe("1");
    expect(request?.headers.get("cookie")).toBe(
      "tt-target-idc=useast1a; sessionid=sid; sessionid_ss=sid; sid_tt=sid; sid_guard=sid",
    );
    // The logger option gets the HTTP client's entries.
    expect(logger).toHaveBeenCalledWith(
      "debug",
      "HTTP GET webcast.tiktok.com/webcast/gift/list/: 200",
      expect.objectContaining({ status: 200 }),
    );
  });

  it("keeps one cookie jar and device id for its whole life", async () => {
    let answered = 0;
    const stub = stubFetch(() =>
      jsonResponse(
        { data: { gifts: [ROSE] } },
        answered++ === 0
          ? { headers: { "set-cookie": "ttwid=abc; Path=/" } }
          : {},
      ),
    );
    const { connection } = create({ fetch: stub.fetch, roomId: ROOM_ID });
    await connection.fetchGifts();
    await connection.fetchGifts();
    const [first, second] = stub.requests;
    expect(second?.headers.get("cookie")).toBe(
      "tt-target-idc=useast1a; ttwid=abc",
    );
    expect(first?.url.searchParams.get("device_id")).toMatch(/^\d{19}$/);
    expect(second?.url.searchParams.get("device_id")).toBe(
      first?.url.searchParams.get("device_id"),
    );
    // The WebSocket gets the same jar, with the signer's cookies.
    await connection.connect();
    expect(fake.last.headers.cookie).toBe(
      "tt-target-idc=useast1a; ttwid=fake-ttwid",
    );
  });

  it("times its HTTP requests out after requestTimeoutMs", async () => {
    const stub = stubFetch(never);
    const { connection } = create({
      fetch: stub.fetch,
      roomId: ROOM_ID,
      requestTimeoutMs: 50,
    });
    const error = await connection
      .fetchGifts()
      .catch((failure: unknown) => failure);
    expect(error).toMatchObject({
      code: "GIFTS_UNAVAILABLE",
      cause: [
        expect.objectContaining({ code: "TIMEOUT", phase: "request" }),
        expect.objectContaining({ code: "TIMEOUT", phase: "request" }),
      ],
    });
  });

  it("keeps going when the logger throws", async () => {
    const { connection, ofType, logger } = create();
    logger.mockImplementation(() => {
      throw new Error("logger broke");
    });
    connection.on("chat", () => {
      throw new Error("listener broke");
    });
    connection.emit("chat", { content: "hi" } as WebcastEventMap["chat"]);
    await connection.connect();
    fake.dropSocket();
    await until(() => expect(ofType("connected")).toHaveLength(2));
    expect(logger).toHaveBeenCalled();
  });
});

describe("connect()", () => {
  it("resolves the room id, checks it is LIVE, signs, and enters the room", async () => {
    const { connection, events } = create();
    const connecting = connection.connect();
    expect(connection.state).toBe("connecting");
    await expect(connecting).resolves.toEqual({ roomId: ROOM_ID });
    expect(connection.state).toBe("connected");
    expect(connection.roomId).toBe(ROOM_ID);
    expect(events).toEqual([
      {
        event: "connected",
        payload: { roomId: ROOM_ID, reconnected: false, attempt: 0 },
      },
    ]);

    expect(resolveRoomId).toHaveBeenCalledTimes(1);
    const [username, context] = vi.mocked(resolveRoomId).mock.calls[0]!;
    expect(username).toBe("someone");
    expect(context.http).toBeInstanceOf(HttpClient);
    expect(context.signer).toBe(signer);
    expect(checkLive).toHaveBeenCalledWith(ROOM_ID, context);

    expect(signer.calls).toHaveLength(1);
    const { request, context: signContext } = signer.calls[0]!;
    expect(request).toEqual({ roomId: ROOM_ID, cursor: "" });
    expect(signContext).toMatchObject({
      timeoutMs: 10_000,
      userAgent: DEFAULT_USER_AGENT,
    });
    expect(signContext.signal.aborted).toBe(false);
    expect(fake.framesOfType("im_enter_room")[0]?.enter?.roomId).toBe(ROOM_ID);
  });

  it("skips the lookup with the roomId option", async () => {
    const { connection } = create({ roomId: OTHER_ROOM_ID });
    await expect(connection.connect()).resolves.toEqual({
      roomId: OTHER_ROOM_ID,
    });
    expect(resolveRoomId).not.toHaveBeenCalled();
    expect(signer.calls[0]?.request.roomId).toBe(OTHER_ROOM_ID);
  });

  it("goes on when the live check is inconclusive", async () => {
    vi.mocked(checkLive).mockResolvedValue(null);
    const { connection } = create();
    await expect(connection.connect()).resolves.toEqual({ roomId: ROOM_ID });
  });

  it("uses the room the signer connected to", async () => {
    signer.roomId = OTHER_ROOM_ID;
    const { connection, ofType } = create();
    await expect(connection.connect()).resolves.toEqual({
      roomId: OTHER_ROOM_ID,
    });
    expect(connection.roomId).toBe(OTHER_ROOM_ID);
    expect(ofType("connected")[0]?.roomId).toBe(OTHER_ROOM_ID);
    expect(fake.framesOfType("im_enter_room")[0]?.enter?.roomId).toBe(
      OTHER_ROOM_ID,
    );
    expect(fake.last.url.searchParams.get("room_id")).toBe(OTHER_ROOM_ID);
  });

  it("ignores a signer room id that isn't one", async () => {
    signer.roomId = "room";
    const { connection, logger } = create();
    await expect(connection.connect()).resolves.toEqual({ roomId: ROOM_ID });
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "The signer named a room id that isn't one",
      { roomId: "room" },
    );
  });

  it("rejects with INVALID_STATE, changing nothing, unless idle or disconnected", async () => {
    const { connection } = create();
    const first = connection.connect();
    await expect(connection.connect()).rejects.toMatchObject({
      code: "INVALID_STATE",
      message: "connect() can't be called while the connection is connecting",
    });
    expect(connection.state).toBe("connecting");
    await first;
    await expect(connection.connect()).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    expect(connection.state).toBe("connected");
    expect(signer.calls).toHaveLength(1);
  });

  describe("when the first connect fails", () => {
    it.each([
      [
        "the room can't be found",
        () => {
          vi.mocked(resolveRoomId).mockRejectedValue(
            new RoomNotFoundError("no room"),
          );
        },
        RoomNotFoundError,
      ],
      [
        "the room isn't LIVE",
        () => vi.mocked(checkLive).mockResolvedValue(false),
        OfflineError,
      ],
      [
        "the signer fails",
        () => signer.failNext(new SignError("down", { status: 503 })),
        SignError,
      ],
      [
        "the signer is rate limited",
        () => signer.failNext(new RateLimitError("slow down")),
        RateLimitError,
      ],
      [
        "the signed body can't be decoded",
        () => {
          signer.body = fromHex("0a 05 01");
        },
        ProtocolError,
      ],
      [
        "the signed body has no push server",
        () => {
          signer.batch = { pushServer: "" };
        },
        ProtocolError,
      ],
      [
        "the signed body has no cursor",
        () => {
          signer.batch = { cursor: "" };
        },
        ProtocolError,
      ],
      [
        "the socket closes before the entry",
        () => {
          fake.answerEnter = false;
          fake.onConnection = (connection) => connection.socket.close(4001);
        },
        WebSocketError,
      ],
      [
        "the room isn't entered in time",
        () => {
          fake.answerEnter = false;
        },
        TimeoutError,
      ],
    ])(
      "rejects when %s, without a disconnected event",
      async (_, arrange, expected) => {
        arrange();
        const { connection, events } = create({ connectTimeoutMs: 200 });
        await expect(connection.connect()).rejects.toBeInstanceOf(expected);
        expect(connection.state).toBe("disconnected");
        expect(events).toEqual([]);
        expect(signer.calls.length).toBeLessThanOrEqual(1);
      },
    );

    it("tells which room isn't LIVE", async () => {
      vi.mocked(checkLive).mockResolvedValue(false);
      const { connection } = create();
      await expect(connection.connect()).rejects.toMatchObject({
        code: "OFFLINE",
        roomId: ROOM_ID,
        message: "@someone isn't LIVE",
      });
      expect(signer.calls).toEqual([]);
    });

    it.each([
      [
        "a network failure",
        new TypeError("fetch failed"),
        { code: "SIGN_FAILED", retryable: true, status: undefined },
      ],
      [
        "fetch's TimeoutError",
        new DOMException("The operation timed out", "TimeoutError"),
        { code: "TIMEOUT", phase: "sign", retryable: true },
      ],
      [
        "fetch's AbortError",
        new DOMException("This operation was aborted", "AbortError"),
        { code: "ABORTED", retryable: false },
      ],
    ])(
      "turns %s from the signer into a ConnectorError",
      async (_, failure, expected) => {
        signer.failNext(failure);
        const { connection } = create();
        await expect(connection.connect()).rejects.toMatchObject({
          ...expected,
          cause: failure,
        });
        expect(connection.state).toBe("disconnected");
      },
    );

    it("wraps an unexpected failure as INTERNAL", async () => {
      const failure = new TypeError("lookup bug");
      vi.mocked(resolveRoomId).mockRejectedValue(failure);
      const { connection } = create();
      await expect(connection.connect()).rejects.toMatchObject({
        code: "INTERNAL",
        message: "lookup bug",
        cause: failure,
      });
    });

    it("times out a signer that doesn't answer", async () => {
      signer.hold = new Promise(() => {});
      const { connection } = create({ requestTimeoutMs: 100 });
      await expect(connection.connect()).rejects.toMatchObject({
        code: "TIMEOUT",
        phase: "sign",
        message: "The signed connect took longer than 100 ms",
      });
    });

    it.each([
      ["nothing", undefined, "The signer answered without a body"],
      ["no body", { cookies: [] }, "The signer answered without a body"],
      [
        "cookies that aren't a list",
        { body: new Uint8Array(0), cookies: "a=1" },
        "The signer answered without a list of cookies",
      ],
      [
        "cookies that aren't strings",
        { body: new Uint8Array(0), cookies: [1] },
        "The signer answered without a list of cookies",
      ],
    ])(
      "refuses a signer answering %s with a ProtocolError",
      async (_, answer, message) => {
        const { connection } = create({
          signer: {
            fetchConnect: () =>
              Promise.resolve(answer as unknown as SignedConnect),
          },
        });
        await expect(connection.connect()).rejects.toMatchObject({
          code: "PROTOCOL",
          message,
        });
      },
    );

    it("can connect again", async () => {
      signer.failNext(new SignError("down", { status: 503 }));
      const { connection, ofType } = create();
      await expect(connection.connect()).rejects.toBeInstanceOf(SignError);
      await expect(connection.connect()).resolves.toEqual({ roomId: ROOM_ID });
      expect(ofType("connected")).toEqual([
        { roomId: ROOM_ID, reconnected: false, attempt: 0 },
      ]);
    });
  });

  it("builds the WebSocket URL and headers PROTOCOL.md describes", async () => {
    signer.cookies = ["ttwid=abc", "msToken=xyz"];
    signer.batch = {
      routeParams: [
        { key: "wrds_v", value: "7" },
        { key: "aid", value: "1989" },
        { key: "empty", value: "" },
        { key: "wrds_v", value: "8" },
      ],
    };
    const { connection } = create();
    await connection.connect();
    const { url, headers } = fake.last;
    expect([...url.searchParams.keys()]).toEqual([
      "version_code",
      "aid",
      "app_language",
      "app_name",
      "browser_platform",
      "browser_language",
      "browser_name",
      "browser_version",
      "browser_online",
      "cookie_enabled",
      "tz_name",
      "device_platform",
      "identity",
      "live_id",
      "webcast_language",
      "ws_direct",
      "sup_ws_ds_opt",
      "update_version_code",
      "did_rule",
      "screen_height",
      "screen_width",
      "heartbeat_duration",
      "resp_content_type",
      "history_comment_count",
      "client_enter",
      "last_rtt",
      "User-Agent",
      "compress",
      "room_id",
      "internal_ext",
      "cursor",
      "wrds_v",
      "version_code",
    ]);
    const params = url.searchParams;
    expect(params.getAll("version_code")).toEqual(["180800", "270000"]);
    expect(url.search.endsWith("&version_code=270000")).toBe(true);
    expect(params.get("aid")).toBe("1989");
    expect(params.get("wrds_v")).toBe("8");
    expect(params.get("compress")).toBe("gzip");
    expect(params.get("room_id")).toBe(ROOM_ID);
    expect(params.get("internal_ext")).toBe("signed-ext-1");
    expect(params.get("cursor")).toBe("signed-cursor-1");
    expect(params.get("User-Agent")).toBe(DEFAULT_USER_AGENT);
    expect(params.get("device_platform")).toBe("web");
    const lastRtt = Number(params.get("last_rtt"));
    expect(lastRtt).toBeGreaterThanOrEqual(100);
    expect(lastRtt).toBeLessThan(200);
    expect(headers["user-agent"]).toBe(DEFAULT_USER_AGENT);
    expect(headers.cookie).toBe(
      "tt-target-idc=useast1a; ttwid=abc; msToken=xyz",
    );
  });

  it("applies the clientParams and headers options, and sends the session", async () => {
    const { connection } = create({
      clientParams: { app_language: "fr", room_id: "1" },
      headers: { "user-agent": "custom-agent", "X-Extra": "1" },
      session: { sessionId: "sid", ttTargetIdc: "alisg" },
    });
    await connection.connect();
    const { url, headers } = fake.last;
    expect(url.searchParams.get("app_language")).toBe("fr");
    // The connection's own parameters win over clientParams.
    expect(url.searchParams.get("room_id")).toBe(ROOM_ID);
    expect(url.searchParams.get("User-Agent")).toBe("custom-agent");
    expect(headers["user-agent"]).toBe("custom-agent");
    expect(headers["x-extra"]).toBe("1");
    expect(headers.cookie).toBe(
      "tt-target-idc=alisg; sessionid=sid; sessionid_ss=sid; sid_tt=sid; sid_guard=sid; ttwid=fake-ttwid",
    );
    expect(signer.calls[0]?.request).toEqual({
      roomId: ROOM_ID,
      cursor: "",
      sessionCookies: "sessionid=sid; tt-target-idc=alisg",
    });
    expect(signer.calls[0]?.context.userAgent).toBe("custom-agent");
  });
});

describe("batches", () => {
  it("reach listeners attached before connect(), with no gap", async () => {
    // A batch the server sends before confirming the entry waits for
    // `connected`, then goes out.
    fake.answerEnter = false;
    fake.onConnection = (connection) => fake.push([chat("1")], { connection });
    const { connection, names, raw } = create();
    await connection.connect();
    expect(raw).toEqual(["1"]);
    expect(names()).toEqual(["connected"]);
  });

  it("dispatches the initial batch first with processInitialData, then every batch in order", async () => {
    signer.batch = { messages: [chat("1"), chat("2", true)] };
    const { connection, raw } = create({ processInitialData: true });
    await connection.connect();
    expect(raw).toEqual(["1", "2"]);
    fake.push([chat("3")]);
    fake.push([chat("4"), chat("5")], { gzip: true });
    await until(() => expect(raw).toEqual(["1", "2", "3", "4", "5"]));
  });

  it("skips the first connect's initial batch without processInitialData", async () => {
    signer.batch = {
      messages: [chat("1"), chat("2", true), { method: "NoId" }],
    };
    const { connection, raw } = create();
    await connection.connect();
    expect(raw).toEqual([]);
    // Its messages count as seen: TikTok sending them again changes nothing.
    fake.push([chat("1"), chat("3")]);
    await until(() => expect(raw).toEqual(["3"]));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("acks the batches that ask for it", async () => {
    const { connection } = create();
    await connection.connect();
    fake.push([chat("1")], { needAck: true, logId: "77", internalExt: "x" });
    await until(() => expect(fake.framesOfType("ack")).toHaveLength(1));
    expect(fake.framesOfType("ack")[0]).toMatchObject({
      ack: "x",
      frame: { logId: "77" },
    });
  });

  it("reports a message dispatch throws for, and goes on", async () => {
    // dispatch() never throws; the connection guards against it anyway.
    vi.mocked(dispatch)
      .mockImplementationOnce(() => {
        throw new Error("dispatch failed");
      })
      .mockImplementationOnce(() => {
        throw "dispatch failed as text";
      });
    const { connection, raw } = create();
    const errors: ConnectorError[] = [];
    connection.on("error", (error) => errors.push(error));
    await connection.connect();
    fake.push([chat("1"), chat("2"), chat("3")]);
    await until(() => expect(raw).toEqual(["3"]));
    expect(errors).toEqual([
      expect.objectContaining({
        code: "INTERNAL",
        message:
          "Handling a WebcastChatMessage message failed: dispatch failed",
      }),
      expect.objectContaining({
        code: "INTERNAL",
        message:
          "Handling a WebcastChatMessage message failed: dispatch failed as text",
      }),
    ]);
  });

  it("gives dispatch a context that follows the connection", async () => {
    signer.batch = { messages: [chat("1")] };
    const { connection, ofType } = create({ processInitialData: true });
    await connection.connect();
    const [context] = vi.mocked(dispatch).mock.calls[0]!;
    expect(context.processInitialData).toBe(true);
    expect(context.listenerCount("raw")).toBe(1);
    expect(context.listenerCount("chat")).toBe(0);
    const chats: unknown[] = [];
    connection.on("chat", (message) => chats.push(message));
    const message = { content: "hi" } as WebcastEventMap["chat"];
    context.emit("chat", message);
    expect(chats).toEqual([message]);
    const errors: ConnectorError[] = [];
    connection.on("error", (error) => errors.push(error));
    const failure = new ProtocolError("bad payload");
    context.reportError(failure);
    expect(errors).toEqual([failure]);
    // Once stopped, a late stream end changes nothing.
    await connection.disconnect();
    context.endStream("ended");
    expect(ofType("streamEnd")).toEqual([]);
  });

  it("logs counters past the safe integer range once per field", async () => {
    const { connection, logger } = create();
    await connection.connect();
    for (let index = 0; index < 2; index++) {
      fake.pushFrame(
        serverFrame({
          payloadType: "msg",
          payload: encodeMessage(FetchResultSchema, { now: 2 ** 60 }),
        }),
      );
    }
    fake.push([chat("1")]);
    await until(() => expect(dispatch).toHaveBeenCalledTimes(1));
    expect(logger.mock.calls.filter(([level]) => level === "warn")).toEqual([
      [
        "warn",
        `ProtoMessageFetchResult.now is ${2n ** 60n}, past Number.MAX_SAFE_INTEGER: its number value is rounded`,
        { path: "ProtoMessageFetchResult.now", value: String(2n ** 60n) },
      ],
    ]);
  });
});

describe("errors", () => {
  it("are emitted when the error event has a listener", async () => {
    const { connection, logger } = create();
    const errors: ConnectorError[] = [];
    connection.on("error", (error) => errors.push(error));
    await connection.connect();
    fake.pushFrame(fromHex("0a ff ff"));
    await until(() => expect(errors).toHaveLength(1));
    expect(errors[0]).toBeInstanceOf(ProtocolError);
    expect(logger).not.toHaveBeenCalledWith(
      "error",
      expect.anything(),
      expect.anything(),
    );
  });

  it("are logged otherwise", async () => {
    const { connection, logger } = create();
    await connection.connect();
    fake.pushFrame(fromHex("0a ff ff"));
    await until(() =>
      expect(logger).toHaveBeenCalledWith(
        "error",
        expect.stringMatching(/^Can't decode WebcastPushFrame/),
        { error: expect.any(ProtocolError) },
      ),
    );
  });
});

describe("reconnecting", () => {
  it("follows a dropped socket, resuming from the last cursor", async () => {
    const { connection, names, ofType, raw } = create();
    await connection.connect();
    fake.push([chat("1")], { cursor: "ws-cursor-a" });
    await until(() => expect(raw).toEqual(["1"]));
    // The reconnect's signed batch holds the gap, and a message seen already.
    signer.batch = { messages: [chat("1"), chat("2")] };

    fake.dropSocket();
    await until(() => expect(ofType("connected")).toHaveLength(2));
    expect(connection.state).toBe("connected");
    expect(names()).toEqual([
      "connected",
      "disconnected",
      "reconnecting",
      "connected",
    ]);
    const [disconnected] = ofType("disconnected");
    expect(disconnected).toMatchObject({
      willReconnect: true,
      error: expect.any(WebSocketError),
    });
    expect(["wsClose", "wsError"]).toContain(disconnected?.reason);
    const [reconnecting] = ofType("reconnecting");
    expect(reconnecting).toMatchObject({
      attempt: 1,
      reason: disconnected?.reason,
    });
    expect(reconnecting?.delayMs).toBeLessThan(10);
    expect(ofType("connected")[1]).toEqual({
      roomId: ROOM_ID,
      reconnected: true,
      attempt: 1,
    });

    expect(signer.calls.map(({ request }) => request.cursor)).toEqual([
      "",
      "ws-cursor-a",
    ]);
    // The reconnect's batch went through dispatch: the duplicate was dropped.
    expect(raw).toEqual(["1", "2"]);
    fake.push([chat("3")]);
    await until(() => expect(raw).toEqual(["1", "2", "3"]));
    expect(fake.connections).toHaveLength(2);
    expect(fake.connections[1]?.url.searchParams.get("cursor")).toBe(
      "signed-cursor-2",
    );
  });

  it("follows an idle stream", async () => {
    const { connection, events } = create({ idleTimeoutMs: 200 });
    await connection.connect();
    fake.goSilent();
    await until(() => expect(events.length).toBeGreaterThanOrEqual(4));
    expect(events.slice(1, 4)).toEqual([
      {
        event: "disconnected",
        payload: {
          reason: "idle",
          willReconnect: true,
          error: expect.any(TimeoutError),
        },
      },
      {
        event: "reconnecting",
        payload: { attempt: 1, delayMs: expect.any(Number), reason: "idle" },
      },
      {
        event: "connected",
        payload: { roomId: ROOM_ID, reconnected: true, attempt: 1 },
      },
    ]);
  });

  it("follows _terminateSocket()", async () => {
    const { connection, events } = create();
    await connection.connect();
    connection._terminateSocket();
    await until(() => expect(events).toHaveLength(4));
    expect(events.slice(1)).toEqual([
      {
        event: "disconnected",
        payload: {
          reason: "wsClose",
          willReconnect: true,
          error: expect.objectContaining({
            message: "The WebSocket was terminated",
          }),
        },
      },
      {
        event: "reconnecting",
        payload: { attempt: 1, delayMs: expect.any(Number), reason: "wsClose" },
      },
      {
        event: "connected",
        payload: { roomId: ROOM_ID, reconnected: true, attempt: 1 },
      },
    ]);
  });

  it("retries with a growing backoff, and counts from 1 again once connected", async () => {
    const { connection, ofType, logger } = create();
    await connection.connect();
    signer.failNext(new SignError("down", { status: 503 }), 2);
    fake.dropSocket();
    await until(() => expect(ofType("connected")).toHaveLength(2));
    const reconnecting = ofType("reconnecting");
    expect(reconnecting.map(({ attempt }) => attempt)).toEqual([1, 2, 3]);
    expect(reconnecting.map(({ reason }) => reason).slice(1)).toEqual([
      "signError",
      "signError",
    ]);
    reconnecting.forEach(({ delayMs }, index) => {
      expect(delayMs).toBeGreaterThanOrEqual(0);
      expect(delayMs).toBeLessThan(Math.min(40, 10 * 2 ** index));
    });
    expect(ofType("connected")[1]).toEqual({
      roomId: ROOM_ID,
      reconnected: true,
      attempt: 3,
    });
    // Each failed attempt is logged: nothing listens to `error`.
    expect(
      logger.mock.calls.filter(
        ([level, message]) => level === "error" && message === "down",
      ),
    ).toHaveLength(2);

    fake.dropSocket();
    await until(() => expect(ofType("connected")).toHaveLength(3));
    expect(ofType("reconnecting").at(-1)?.attempt).toBe(1);
    expect(ofType("connected")[2]?.attempt).toBe(1);
  });

  it("retries an attempt whose signer threw a network failure", async () => {
    const { connection, ofType } = create();
    const errors: ConnectorError[] = [];
    connection.on("error", (error) => errors.push(error));
    await connection.connect();
    const failure = new TypeError("fetch failed");
    signer.failNext(failure);
    fake.dropSocket();
    await until(() => expect(ofType("connected")).toHaveLength(2));
    expect(errors).toEqual([
      expect.objectContaining({
        code: "SIGN_FAILED",
        message: "The signed connect failed: fetch failed",
        cause: failure,
      }),
    ]);
    expect(ofType("reconnecting")[1]?.reason).toBe("signError");
  });

  it("emits each failed attempt as an error", async () => {
    const { connection, ofType } = create();
    const errors: ConnectorError[] = [];
    connection.on("error", (error) => errors.push(error));
    await connection.connect();
    const failure = new SignError("down", { status: 503 });
    signer.failNext(failure);
    fake.dropSocket();
    await until(() => expect(ofType("connected")).toHaveLength(2));
    expect(errors).toEqual([failure]);
  });

  it("gives up after maxAttempts", async () => {
    const { connection, events, ofType } = create({
      reconnect: { maxAttempts: 2 },
    });
    const errors: ConnectorError[] = [];
    connection.on("error", (error) => errors.push(error));
    await connection.connect();
    const failure = new SignError("down", { status: 503 });
    signer.failNext(failure, 5);
    fake.dropSocket();
    await until(() => expect(connection.state).toBe("disconnected"));
    expect(ofType("reconnecting").map(({ attempt }) => attempt)).toEqual([
      1, 2,
    ]);
    expect(signer.calls).toHaveLength(3);
    expect(errors).toHaveLength(3);
    const giveUp = errors[2];
    expect(giveUp).toBeInstanceOf(ReconnectGiveUpError);
    expect(giveUp).toMatchObject({
      attempts: 2,
      cause: failure,
      message: "Gave up reconnecting after 2 attempts",
    });
    expect(events.at(-1)).toEqual({
      event: "disconnected",
      payload: { reason: "giveUp", error: giveUp, willReconnect: false },
    });
  });

  it("waits at least what a RateLimitError asks for", async () => {
    const { connection, ofType } = create();
    await connection.connect();
    signer.failNext(new RateLimitError("slow down", { retryAfterMs: 300 }));
    fake.dropSocket();
    await until(() => expect(ofType("reconnecting")).toHaveLength(2));
    const asked = Date.now();
    expect(ofType("reconnecting")[1]).toMatchObject({
      attempt: 2,
      delayMs: 300,
      reason: "signError",
    });
    await until(() => expect(ofType("connected")).toHaveLength(2));
    expect(Date.now() - asked).toBeGreaterThanOrEqual(280);
    expect(signer.calls).toHaveLength(3);
  });

  it.each([
    ["a 4xx from the signer", new SignError("gone", { status: 404 })],
    ["the signer not finding the room", new RoomNotFoundError("no room")],
  ])("resolves the room id again after %s", async (_, failure) => {
    const { connection, ofType } = create();
    await connection.connect();
    vi.mocked(resolveRoomId).mockResolvedValue(OTHER_ROOM_ID);
    signer.failNext(failure);
    fake.dropSocket();
    await until(() => expect(ofType("connected")).toHaveLength(2));
    expect(resolveRoomId).toHaveBeenCalledTimes(2);
    expect(signer.calls.map(({ request }) => request.roomId)).toEqual([
      ROOM_ID,
      ROOM_ID,
      OTHER_ROOM_ID,
    ]);
    expect(ofType("connected")[1]).toEqual({
      roomId: OTHER_ROOM_ID,
      reconnected: true,
      attempt: 2,
    });
    expect(connection.roomId).toBe(OTHER_ROOM_ID);
  });

  it("resolves the room id only once, then stops on a failure that can't be retried", async () => {
    const { connection, events } = create();
    await connection.connect();
    const refused = new SignError("bad key", { status: 401 });
    signer.failNext(refused, 3);
    fake.dropSocket();
    await until(() => expect(connection.state).toBe("disconnected"));
    expect(resolveRoomId).toHaveBeenCalledTimes(2);
    expect(signer.calls).toHaveLength(3);
    expect(events.at(-1)).toEqual({
      event: "disconnected",
      payload: { reason: "signError", error: refused, willReconnect: false },
    });
  });

  it("stops at once on a failure that can't be retried", async () => {
    const { connection, events } = create();
    await connection.connect();
    const failure = new SignError("refused", { retryable: false });
    signer.failNext(failure);
    fake.dropSocket();
    await until(() => expect(connection.state).toBe("disconnected"));
    expect(signer.calls).toHaveLength(2);
    expect(events.at(-1)).toEqual({
      event: "disconnected",
      payload: { reason: "signError", error: failure, willReconnect: false },
    });
  });

  it("gives a socket closing before the entry as the next attempt's reason", async () => {
    const { connection, ofType } = create();
    await connection.connect();
    fake.onConnection = (connection) => {
      fake.onConnection = undefined;
      connection.socket.close(4002);
    };
    fake.dropSocket();
    await until(() => expect(ofType("connected")).toHaveLength(2));
    expect(ofType("reconnecting")[1]?.reason).toBe("wsClose");
  });

  it("gives an entry that timed out as the next attempt's reason", async () => {
    const { connection, ofType } = create({ connectTimeoutMs: 100 });
    await connection.connect();
    fake.onConnection = (connection) => {
      fake.onConnection = undefined;
      connection.silent = true;
    };
    fake.dropSocket();
    await until(() => expect(ofType("connected")).toHaveLength(2));
    expect(ofType("reconnecting")[1]?.reason).toBe("wsError");
  });

  it("gives a refused WebSocket handshake as the next attempt's reason", async () => {
    // An HTTP server that answers every upgrade with 403.
    const refusing = createServer();
    refusing.on("upgrade", (_request, socket: Duplex) => {
      socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
    });
    await new Promise<void>((resolve) =>
      refusing.listen(0, "127.0.0.1", resolve),
    );
    try {
      const { port } = refusing.address() as AddressInfo;
      const { connection, ofType } = create();
      await connection.connect();
      signer.pushServers = [`ws://127.0.0.1:${port}/`];
      fake.dropSocket();
      await until(() => expect(ofType("connected")).toHaveLength(2));
      expect(ofType("reconnecting")[1]?.reason).toBe("wsError");
    } finally {
      refusing.closeAllConnections();
      await new Promise((resolve) => refusing.close(resolve));
    }
  });

  it("ends the stream when the room went offline (checkLiveBeforeRetry)", async () => {
    const { connection, events, ofType } = create();
    await connection.connect();
    vi.mocked(checkLive).mockResolvedValue(false);
    fake.dropSocket();
    await until(() => expect(connection.state).toBe("disconnected"));
    expect(ofType("streamEnd")).toEqual([{ action: "ended" }]);
    expect(events.at(-1)).toEqual({
      event: "disconnected",
      payload: { reason: "streamEnd", willReconnect: false },
    });
    expect(checkLive).toHaveBeenCalledTimes(2);
    expect(signer.calls).toHaveLength(1);
  });

  it("doesn't check the room without checkLiveBeforeRetry", async () => {
    const { connection, ofType } = create({
      reconnect: { checkLiveBeforeRetry: false },
    });
    await connection.connect();
    vi.mocked(checkLive).mockResolvedValue(false);
    fake.dropSocket();
    await until(() => expect(ofType("connected")).toHaveLength(2));
    expect(checkLive).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["reconnect is false", false as const],
    ["maxAttempts is 0", { maxAttempts: 0 }],
  ])("doesn't happen when %s", async (_, reconnect) => {
    const { connection, events } = create({ reconnect });
    await connection.connect();
    fake.dropSocket();
    await until(() => expect(connection.state).toBe("disconnected"));
    expect(events.slice(1)).toEqual([
      {
        event: "disconnected",
        payload: {
          reason: expect.stringMatching(/^ws(Close|Error)$/),
          error: expect.any(WebSocketError),
          willReconnect: false,
        },
      },
    ]);
    await delay(50);
    expect(signer.calls).toHaveLength(1);
  });
});

describe("streamEnd", () => {
  it.each([
    [3, "ended"],
    [4, "suspended"],
  ] as const)(
    "stops the connection without reconnecting (action %i)",
    async (action, expected) => {
      const { connection, events } = create();
      await connection.connect();
      const serverClosed = new Promise((resolve) =>
        fake.last.socket.once("close", resolve),
      );
      fake.endStream(action);
      await until(() => expect(connection.state).toBe("disconnected"));
      expect(events.slice(1)).toEqual([
        { event: "streamEnd", payload: { action: expected } },
        {
          event: "disconnected",
          payload: { reason: "streamEnd", willReconnect: false },
        },
      ]);
      await serverClosed;
      await delay(50);
      expect(signer.calls).toHaveLength(1);
    },
  );

  it("drops the rest of the batch", async () => {
    const { connection, raw } = create();
    await connection.connect();
    fake.push([
      {
        method: "WebcastControlMessage",
        msgId: "1",
        payload: fromHex("10 03"),
      },
      chat("2"),
    ]);
    await until(() => expect(connection.state).toBe("disconnected"));
    expect(raw).toEqual(["1"]);
  });
});

describe("disconnect()", () => {
  it("closes the socket and emits disconnected once", async () => {
    const { connection, events } = create();
    await connection.connect();
    const serverClosed = new Promise<number>((resolve) =>
      fake.last.socket.once("close", resolve),
    );
    await connection.disconnect();
    expect(connection.state).toBe("disconnected");
    expect(await serverClosed).toBe(1000);
    await connection.disconnect();
    expect(events.slice(1)).toEqual([
      {
        event: "disconnected",
        payload: { reason: "user", willReconnect: false },
      },
    ]);
  });

  it("does nothing before connect()", async () => {
    const { connection, events } = create();
    await connection.disconnect();
    expect(connection.state).toBe("idle");
    expect(events).toEqual([]);
  });

  it("lets connect() start over", async () => {
    const { connection, ofType } = create();
    await connection.connect();
    await connection.disconnect();
    await expect(connection.connect()).resolves.toEqual({ roomId: ROOM_ID });
    expect(ofType("connected")).toEqual([
      { roomId: ROOM_ID, reconnected: false, attempt: 0 },
      { roomId: ROOM_ID, reconnected: false, attempt: 0 },
    ]);
    // A new start: the stream isn't resumed, the room id is looked up again.
    expect(signer.calls.map(({ request }) => request.cursor)).toEqual(["", ""]);
    expect(resolveRoomId).toHaveBeenCalledTimes(2);
  });

  it("cancels the wait before a reconnect attempt", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { connection, ofType, names } = create({
      reconnect: { baseDelayMs: 2_000, maxDelayMs: 2_000 },
    });
    await connection.connect();
    fake.dropSocket();
    await until(() => expect(ofType("reconnecting")).toHaveLength(1));
    expect(ofType("reconnecting")[0]?.delayMs).toBe(1_980);
    const started = Date.now();
    await connection.disconnect();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(connection.state).toBe("disconnected");
    expect(names()).toEqual([
      "connected",
      "disconnected",
      "reconnecting",
      "disconnected",
    ]);
    expect(ofType("disconnected")[1]).toEqual({
      reason: "user",
      willReconnect: false,
    });
    expect(signer.calls).toHaveLength(1);
  });

  it("cancels a reconnect attempt in progress", async () => {
    const { connection, ofType } = create();
    await connection.connect();
    signer.hold = new Promise(() => {});
    fake.dropSocket();
    await until(() => expect(signer.calls).toHaveLength(2));
    await connection.disconnect();
    expect(signer.calls[1]?.context.signal.aborted).toBe(true);
    await delay(50);
    expect(connection.state).toBe("disconnected");
    expect(ofType("connected")).toHaveLength(1);
    expect(ofType("disconnected").at(-1)?.reason).toBe("user");
  });

  it("can be called from a disconnected listener", async () => {
    const { connection, names } = create();
    connection.once("disconnected", () => {
      void connection.disconnect();
    });
    await connection.connect();
    fake.dropSocket();
    await until(() => expect(connection.state).toBe("disconnected"));
    await delay(50);
    expect(names()).toEqual(["connected", "disconnected", "disconnected"]);
    expect(signer.calls).toHaveLength(1);
  });

  it("rejects a first connect still signing with an AbortError", async () => {
    signer.hold = new Promise(() => {});
    const { connection, events } = create();
    const connecting = connection.connect();
    await until(() => expect(signer.calls).toHaveLength(1));
    await connection.disconnect();
    await expect(connecting).rejects.toMatchObject({
      code: "ABORTED",
      message: "disconnect() was called",
    });
    expect(connection.state).toBe("disconnected");
    expect(events).toEqual([]);
  });

  it("rejects a first connect still opening the socket with an AbortError", async () => {
    fake.answerEnter = false;
    const { connection, events } = create();
    const connecting = connection.connect();
    await until(() => expect(fake.connections).toHaveLength(1));
    const serverClosed = new Promise((resolve) =>
      fake.last.socket.once("close", resolve),
    );
    await connection.disconnect();
    await expect(connecting).rejects.toBeInstanceOf(AbortError);
    await serverClosed;
    expect(events).toEqual([]);
  });

  it("rejects a first connect stopped right after the entry", async () => {
    const { connection, events } = create();
    let disconnecting: Promise<void> | undefined;
    vi.spyOn(WebcastSession.prototype, "open").mockImplementation(
      async function (this: WebcastSession, options: SessionOptions) {
        await realOpen.call(this, options);
        // Lands between the entry and the end of connect().
        disconnecting = connection.disconnect();
      },
    );
    await expect(connection.connect()).rejects.toBeInstanceOf(AbortError);
    await disconnecting;
    expect(connection.state).toBe("disconnected");
    expect(events).toEqual([]);
  });

  it("rejects a first connect whose socket closed right after the entry", async () => {
    const { connection, events } = create();
    vi.spyOn(WebcastSession.prototype, "open").mockImplementation(
      async function (this: WebcastSession, options: SessionOptions) {
        await realOpen.call(this, options);
        const closed = new Promise((resolve) => this.once("closed", resolve));
        this.terminate();
        await closed;
      },
    );
    await expect(connection.connect()).rejects.toMatchObject({
      code: "WEBSOCKET",
      message: "The WebSocket was terminated",
    });
    expect(connection.state).toBe("disconnected");
    expect(events).toEqual([]);
  });
});

describe("the signal option", () => {
  it("stops a connected connection for good", async () => {
    const controller = new AbortController();
    const { connection, events } = create({ signal: controller.signal });
    await connection.connect();
    const reason = new Error("shutting down");
    controller.abort(reason);
    expect(connection.state).toBe("disconnected");
    expect(events.at(-1)).toEqual({
      event: "disconnected",
      payload: {
        reason: "aborted",
        error: expect.objectContaining({ code: "ABORTED", cause: reason }),
        willReconnect: false,
      },
    });
    await connection.disconnect();
  });

  it("rejects connect() when it aborted already", async () => {
    const { connection, events } = create({ signal: AbortSignal.abort() });
    await expect(connection.connect()).rejects.toMatchObject({
      code: "ABORTED",
      message: "The signal aborted",
    });
    expect(connection.state).toBe("disconnected");
    expect(events).toEqual([]);
    expect(signer.calls).toEqual([]);
  });

  it("rejects a first connect in progress", async () => {
    signer.hold = new Promise(() => {});
    const controller = new AbortController();
    const { connection, events } = create({ signal: controller.signal });
    const connecting = connection.connect();
    await until(() => expect(signer.calls).toHaveLength(1));
    controller.abort();
    await expect(connecting).rejects.toMatchObject({
      code: "ABORTED",
      message: "The signal aborted",
    });
    expect(events).toEqual([]);
  });

  it("is let go when the connection stops", async () => {
    const controller = new AbortController();
    const { connection, names } = create({ signal: controller.signal });
    await connection.connect();
    await connection.disconnect();
    controller.abort();
    expect(names()).toEqual(["connected", "disconnected"]);
  });
});

describe("fetchGifts()", () => {
  // Answers the room list (a request with a room id) and the region list.
  function giftLists(routes: { room?: StubHandler; region?: StubHandler }) {
    const missing: StubHandler = () => new Response("", { status: 404 });
    return stubFetch((request) =>
      (request.url.searchParams.has("room_id")
        ? (routes.room ?? missing)
        : (routes.region ?? missing))(request),
    );
  }

  it("asks only for the region list without a room id, US and en-US by default", async () => {
    const stub = giftLists({
      region: () => jsonResponse({ data: { gifts: [ROSE] } }),
    });
    const { connection } = create({ fetch: stub.fetch });
    await expect(connection.fetchGifts()).resolves.toEqual({
      gifts: [
        {
          id: "5655",
          name: "Rose",
          diamondCount: 1,
          image: { urlList: ["https://p16.example/rose.webp"], uri: "rose" },
        },
      ],
      source: "region",
    });
    expect(stub.requests).toHaveLength(1);
    const params = stub.requests[0]!.url.searchParams;
    expect(params.get("region")).toBe("US");
    expect(params.get("app_language")).toBe("en-US");
  });

  it("tries the room's list once connected, then the signer's, then the region asked for", async () => {
    const stub = giftLists({
      room: () => jsonResponse({ data: { gifts: [] } }),
      region: () => jsonResponse({ data: { gifts: [ROSE] } }),
    });
    const signerGifts = vi.fn(() => Promise.resolve(null));
    Object.assign(signer, { fetchGifts: signerGifts });
    const { connection } = create({ fetch: stub.fetch });
    await connection.connect();
    await expect(
      connection.fetchGifts({ region: "DE", language: "de-DE" }),
    ).resolves.toMatchObject({ source: "region" });
    const [room, region] = stub.requests;
    expect(room?.url.searchParams.get("room_id")).toBe(ROOM_ID);
    expect(signerGifts).toHaveBeenCalledWith(ROOM_ID, expect.any(Object));
    expect(region?.url.searchParams.get("region")).toBe("DE");
    expect(region?.url.searchParams.get("sys_region")).toBe("DE");
    expect(region?.url.searchParams.get("app_language")).toBe("de-DE");
  });

  it("stops when the signal option aborts", async () => {
    const controller = new AbortController();
    const stub = stubFetch(never);
    const { connection } = create({
      fetch: stub.fetch,
      roomId: ROOM_ID,
      signal: controller.signal,
    });
    const fetching = connection.fetchGifts();
    await until(() => expect(stub.requests).toHaveLength(1));
    controller.abort();
    await expect(fetching).rejects.toBeInstanceOf(AbortError);
  });

  it("rejects with GIFTS_UNAVAILABLE when every source fails", async () => {
    const stub = stubFetch(() => new Response("", { status: 500 }));
    const { connection } = create({ fetch: stub.fetch, roomId: ROOM_ID });
    await expect(connection.fetchGifts()).rejects.toMatchObject({
      code: "GIFTS_UNAVAILABLE",
      message: "No gift list source answered (room: HTTP, region: HTTP)",
    });
  });
});
