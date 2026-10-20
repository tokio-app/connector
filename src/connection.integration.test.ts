// The whole library against local fakes: a FakeTikTok push server, a
// FakeSigner and a stubbed fetch. Everything else is real: the connection,
// the session, the frames, the codec, the message tables, dispatch and its
// routes, the HTTP client and the room lookup. Messages are built from the
// samples the table tests use.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeMessage } from "./codec/decode.js";
import { ChatMessageSchema } from "./codec/messages/chat/chat.js";
import { GiftMessageSchema } from "./codec/messages/gift/gift.js";
import { LikeMessageSchema } from "./codec/messages/chat/like.js";
import { SocialMessageSchema } from "./codec/messages/chat/social.js";
import { TikTokLiveConnection } from "./connection.js";
import type { ConnectorError } from "./errors.js";
import { ControlAction, type WebcastEventMap } from "./events/index.js";
import { isStreakEnd } from "./gifts.js";
import type { ConnectOptions } from "./options.js";
import { encodeMessage, fields } from "../test/helpers/encoder.js";
import { FakeSigner } from "../test/helpers/fakeSigner.js";
import { FakeTikTok, type PushMessage } from "../test/helpers/fakeTikTok.js";
import {
  jsonResponse,
  stubFetch,
  type StubHandler,
} from "../test/helpers/fetchStub.js";
import { SAMPLE_USER, sampleCommon } from "../test/helpers/samples.js";

// Every decode goes through this spy, which runs the real decoder: the lazy
// decoding test reads which schemas it was called with.
vi.mock("./codec/decode.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./codec/decode.js")>();
  return { ...actual, decodeMessage: vi.fn(actual.decodeMessage) };
});

const ROOM_ID = "7140000000000000001";
const LIVE_PAGE = readFileSync(
  new URL("../test/fixtures/live-page.html", import.meta.url),
  "utf8",
);

// TikTok as a stubbed fetch: api-live (unless `api` is off), the LIVE page
// and room/info (status 2: LIVE); anything else is a 404.
function tiktok({ status = 2, api = true } = {}): StubHandler {
  return (request) => {
    const { hostname, pathname } = request.url;
    if (
      api &&
      hostname === "www.tiktok.com" &&
      pathname === "/api-live/user/room/"
    ) {
      return jsonResponse({
        statusCode: 0,
        data: { user: { roomId: ROOM_ID } },
      });
    }
    if (hostname === "www.tiktok.com" && pathname === "/@someone/live") {
      return new Response(LIVE_PAGE, {
        headers: { "content-type": "text/html" },
      });
    }
    if (
      hostname === "webcast.tiktok.com" &&
      pathname === "/webcast/room/info/"
    ) {
      return jsonResponse({ data: { status } });
    }
    return new Response("", { status: 404 });
  };
}

let fake: FakeTikTok;
let signer: FakeSigner;
const connections: TikTokLiveConnection[] = [];

beforeEach(async () => {
  fake = await FakeTikTok.start();
  signer = new FakeSigner({ pushServer: fake.url });
});

afterEach(async () => {
  await Promise.all(connections.map((connection) => connection.disconnect()));
  connections.length = 0;
  await fake.close();
});

type Recorded = {
  [K in keyof WebcastEventMap]: { event: K; payload: WebcastEventMap[K] };
}[keyof WebcastEventMap];

// A connection to @someone through the fakes, with short timers. It records
// the events named in `listen` (none by default: nothing gets decoded that a
// test doesn't ask for).
function create(
  listen: readonly (keyof WebcastEventMap)[] = [],
  options: ConnectOptions = {},
) {
  const http = stubFetch(tiktok());
  const connection = new TikTokLiveConnection("@someone", {
    signer,
    fetch: http.fetch,
    logger: vi.fn(),
    heartbeatIntervalMs: 50,
    idleTimeoutMs: 0,
    connectTimeoutMs: 2_000,
    reconnect: { baseDelayMs: 10, maxDelayMs: 40, minDelayMs: 0 },
    ...options,
  });
  connections.push(connection);
  const events: Recorded[] = [];
  for (const event of listen) {
    connection.on(event, (payload) => {
      events.push({ event, payload } as Recorded);
    });
  }
  const ofType = <K extends Recorded["event"]>(event: K) =>
    events
      .filter((entry) => entry.event === event)
      .map(({ payload }) => payload as WebcastEventMap[K]);
  return { connection, events, ofType, requests: http.requests };
}

const until = (check: () => void, timeout = 3_000) =>
  vi.waitFor(check, { timeout, interval: 5 });

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function chatMessage(msgId: string, content: string): PushMessage {
  return {
    method: "WebcastChatMessage",
    msgId,
    payload: encodeMessage(ChatMessageSchema, {
      common: sampleCommon("WebcastChatMessage"),
      user: SAMPLE_USER,
      content,
      contentLanguage: "en",
    }),
  };
}

function giftMessage(
  msgId: string,
  repeatCount: number,
  repeatEnd: boolean,
): PushMessage {
  return {
    method: "WebcastGiftMessage",
    msgId,
    payload: encodeMessage(GiftMessageSchema, {
      common: sampleCommon("WebcastGiftMessage"),
      user: SAMPLE_USER,
      giftId: "5655",
      repeatCount,
      repeatEnd,
      groupId: "1760000000000",
      gift: { id: "5655", type: 1, diamondCount: 1, name: "Rose" },
    }),
  };
}

function socialMessage(msgId: string, key: string): PushMessage {
  return {
    method: "WebcastSocialMessage",
    msgId,
    payload: encodeMessage(SocialMessageSchema, {
      common: sampleCommon("WebcastSocialMessage", key),
      user: SAMPLE_USER,
      shareCount: 2,
    }),
  };
}

function likeMessage(msgId: string): PushMessage {
  return {
    method: "WebcastLikeMessage",
    msgId,
    payload: encodeMessage(LikeMessageSchema, {
      common: sampleCommon("WebcastLikeMessage"),
      user: SAMPLE_USER,
      count: 5,
      total: 120,
    }),
  };
}

describe("a LIVE through the fakes", () => {
  it("emits a chat comment with its user and content", async () => {
    const { connection, ofType } = create(["chat"]);
    await connection.connect();
    fake.push([chatMessage("1", "hello there")]);
    await until(() => expect(ofType("chat")).toHaveLength(1));
    const [chat] = ofType("chat");
    expect(chat).toMatchObject({
      content: "hello there",
      contentLanguage: "en",
      user: { nickname: "Nick Name", displayId: "nick.name" },
      common: { method: "WebcastChatMessage", createTime: "1760000000123" },
    });
    expect(chat?.user).toEqual(SAMPLE_USER);
  });

  it("emits every update of a gift streak, the last one ending it", async () => {
    const { connection, ofType } = create(["gift"]);
    await connection.connect();
    fake.push([
      giftMessage("1", 1, false),
      giftMessage("2", 3, false),
      giftMessage("3", 3, true),
    ]);
    await until(() => expect(ofType("gift")).toHaveLength(3));
    const gifts = ofType("gift");
    expect(gifts.map(({ repeatCount }) => repeatCount)).toEqual([1, 3, 3]);
    expect(gifts.map(isStreakEnd)).toEqual([false, false, true]);
    expect(gifts[2]).toMatchObject({
      giftId: "5655",
      repeatEnd: true,
      gift: { name: "Rose", diamondCount: 1, type: 1 },
      user: { nickname: "Nick Name" },
    });
  });

  it("tells follows from shares by their text key", async () => {
    const { connection, ofType } = create(["follow", "share"]);
    await connection.connect();
    fake.push([
      socialMessage("1", "pm_mt_msg_viewer_follow"),
      socialMessage("2", "pm_mt_msg_viewer_share"),
      socialMessage("3", "pm_mt_msg_viewer_other"),
    ]);
    await until(() => expect(ofType("share")).toHaveLength(1));
    const [follow] = ofType("follow");
    const [share] = ofType("share");
    expect(ofType("follow")).toHaveLength(1);
    expect(follow?.common?.msgId).toBe("7400000000000000001");
    expect(follow?.user?.nickname).toBe("Nick Name");
    expect(share?.shareCount).toBe(2);
  });

  it("ends the stream on a control message, without reconnecting", async () => {
    const { connection, events } = create([
      "connected",
      "disconnected",
      "reconnecting",
      "streamEnd",
    ]);
    await connection.connect();
    fake.push([
      {
        method: "WebcastControlMessage",
        msgId: "1",
        payload: fields.varint(2, ControlAction.STREAM_ENDED),
      },
    ]);
    await until(() => expect(connection.state).toBe("disconnected"));
    expect(events.slice(1)).toEqual([
      { event: "streamEnd", payload: { action: "ended" } },
      {
        event: "disconnected",
        payload: { reason: "streamEnd", willReconnect: false },
      },
    ]);
    await delay(50);
    expect(signer.calls).toHaveLength(1);
    expect(fake.connections).toHaveLength(1);
  });

  it("gives a raw listener the messages no event covers", async () => {
    const { connection, ofType } = create(["raw"]);
    await connection.connect();
    const payload = fields.message(
      1,
      fields.string(1, "WebcastNoSuchMessage"),
      fields.varint(4, 1_760_000_000_456n),
    );
    fake.push([{ method: "WebcastNoSuchMessage", msgId: "1", payload }]);
    await until(() => expect(ofType("raw")).toHaveLength(1));
    const [raw] = ofType("raw");
    expect(raw).toEqual({
      method: "WebcastNoSuchMessage",
      payload,
      msgId: "1",
      isHistory: false,
      createTime: "1760000000456",
    });
  });

  it("decodes a message only when one of its events has a listener", async () => {
    const { connection, ofType } = create(["raw"]);
    await connection.connect();
    const likesDecoded = () =>
      vi
        .mocked(decodeMessage)
        .mock.calls.filter(([schema]) => schema === LikeMessageSchema).length;

    fake.push([likeMessage("1")]);
    await until(() => expect(ofType("raw")).toHaveLength(1));
    expect(likesDecoded()).toBe(0);

    const likes: unknown[] = [];
    connection.on("like", (like) => likes.push(like));
    fake.push([likeMessage("2")]);
    await until(() => expect(likes).toHaveLength(1));
    expect(likesDecoded()).toBe(1);
    expect(likes[0]).toMatchObject({ count: 5, total: 120 });
  });

  it("drops a message seen before a reconnect when it comes again after", async () => {
    const { connection, ofType } = create(["chat", "connected"]);
    await connection.connect();
    fake.push([chatMessage("1", "before the drop")]);
    await until(() => expect(ofType("chat")).toHaveLength(1));

    // The reconnect's signed batch holds it again, and so does the new socket.
    signer.batch = { messages: [chatMessage("1", "before the drop")] };
    fake.dropSocket();
    await until(() => expect(ofType("connected")).toHaveLength(2));
    fake.push([chatMessage("1", "before the drop"), chatMessage("2", "after")]);
    await until(() => expect(ofType("chat")).toHaveLength(2));
    expect(ofType("chat").map(({ content }) => content)).toEqual([
      "before the drop",
      "after",
    ]);
    expect(ofType("connected")[1]).toMatchObject({ reconnected: true });
  });

  it("gunzips a batch and acks it with its log id and internalExt", async () => {
    const { connection, ofType } = create(["chat"]);
    await connection.connect();
    fake.push([chatMessage("1", "compressed")], {
      gzip: true,
      needAck: true,
      logId: "7400000000000000077",
      internalExt: "internal-ext-1",
    });
    await until(() => expect(fake.framesOfType("ack")).toHaveLength(1));
    expect(fake.framesOfType("ack")[0]).toMatchObject({
      ack: "internal-ext-1",
      frame: {
        logId: "7400000000000000077",
        payloadType: "ack",
        payloadEncoding: "pb",
      },
    });
    await until(() => expect(ofType("chat")).toHaveLength(1));
    expect(ofType("chat")[0]?.content).toBe("compressed");
  });
});

describe("connect() through the room lookup and the HTTP client", () => {
  it("finds the room through api-live, checks it is LIVE, signs and enters it", async () => {
    const { connection, events, requests } = create(["connected"]);
    await expect(connection.connect()).resolves.toEqual({ roomId: ROOM_ID });
    expect(events).toEqual([
      {
        event: "connected",
        payload: { roomId: ROOM_ID, reconnected: false, attempt: 0 },
      },
    ]);
    expect(requests.map(({ url }) => `${url.host}${url.pathname}`)).toEqual([
      "www.tiktok.com/api-live/user/room/",
      "webcast.tiktok.com/webcast/room/info/",
    ]);
    const [api, info] = requests;
    expect(api?.url.searchParams.get("uniqueId")).toBe("someone");
    expect(api?.url.searchParams.get("aid")).toBe("1988");
    expect(api?.headers.get("cookie")).toBe("tt-target-idc=useast1a");
    expect(info?.url.searchParams.get("room_id")).toBe(ROOM_ID);
    expect(signer.calls[0]?.request).toEqual({ roomId: ROOM_ID, cursor: "" });
    expect(fake.last.url.searchParams.get("room_id")).toBe(ROOM_ID);
    expect(fake.framesOfType("im_enter_room")[0]?.enter?.roomId).toBe(ROOM_ID);
    expect(connection.roomId).toBe(ROOM_ID);
  });

  it("falls back to the LIVE page when api-live doesn't answer", async () => {
    const http = stubFetch(tiktok({ api: false }));
    const { connection } = create([], { fetch: http.fetch });
    await expect(connection.connect()).resolves.toEqual({ roomId: ROOM_ID });
    expect(http.requests.map(({ url }) => url.pathname)).toEqual([
      "/api-live/user/room/",
      "/@someone/live",
      "/webcast/room/info/",
    ]);
  });

  it("rejects with OfflineError when room/info says the LIVE ended", async () => {
    const http = stubFetch(tiktok({ status: 4 }));
    const { connection } = create([], { fetch: http.fetch });
    await expect(connection.connect()).rejects.toMatchObject({
      code: "OFFLINE",
      roomId: ROOM_ID,
    });
    expect(signer.calls).toEqual([]);
  });

  it("rejects with RoomNotFoundError when no lookup finds the room", async () => {
    const http = stubFetch(() => new Response("", { status: 404 }));
    const { connection } = create([], { fetch: http.fetch });
    const error = await connection
      .connect()
      .catch((failure: unknown) => failure as ConnectorError);
    expect(error).toMatchObject({ code: "ROOM_NOT_FOUND" });
    // api-live, the LIVE page, then the signer (which can't look rooms up).
    expect(http.requests).toHaveLength(2);
    expect(signer.calls).toEqual([]);
  });
});
