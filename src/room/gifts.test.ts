import { describe, expect, it, vi } from "vitest";
import {
  jsonResponse,
  never,
  rejectionOf,
  signContextFor,
  stubFetch,
  type StubHandler,
} from "../../test/helpers/fetchStub.js";
import type { Gift } from "../events.js";
import { HttpClient } from "../http/client.js";
import { DEFAULT_GIFT_OPTIONS } from "../options.js";
import type { SignContext, Signer } from "../signer/types.js";
import { fetchGiftList, giftsIn, type GiftListRequest } from "./gifts.js";
import type { RoomContext } from "./resolver.js";

const ROOM_ID = "7140000000000000001";
const GIFT_LIST = "https://webcast.tiktok.com/webcast/gift/list/";

const ROSE = {
  id: 5655,
  name: "Rose",
  diamond_count: 1,
  image: { url_list: ["https://cdn.example/rose.webp", 7], uri: "rose" },
};
const LION = { id: "6369", name: "Lion", diamond_count: 29999 };

const ROSE_GIFT: Gift = {
  id: "5655",
  name: "Rose",
  diamondCount: 1,
  image: { urlList: ["https://cdn.example/rose.webp"], uri: "rose" },
};
const LION_GIFT: Gift = { id: "6369", name: "Lion", diamondCount: 29999 };

interface Routes {
  room?: StubHandler;
  region?: StubHandler;
}

const failing: StubHandler = () => new Response("", { status: 403 });

function setup(
  routes: Routes,
  signer: Signer = { fetchConnect: vi.fn() },
  overrides: Partial<SignContext> = {},
) {
  const stub = stubFetch((request) => {
    if (request.url.origin + request.url.pathname !== GIFT_LIST) {
      throw new Error(`Unexpected request to ${request.url.href}`);
    }
    const route = request.url.searchParams.has("room_id")
      ? routes.room
      : routes.region;
    return (route ?? failing)(request);
  });
  const signContext = signContextFor(stub.fetch, overrides);
  const http = new HttpClient({
    fetch: stub.fetch,
    timeoutMs: signContext.timeoutMs,
    clientParams: {},
    headers: {},
    session: { sessionId: "secret-session", ttTargetIdc: "useast1a" },
    logger: signContext.logger,
    deviceId: "1234567890123456789",
  });
  const context: RoomContext = { http, signer, signContext };
  return { context, logger: signContext.logger, ...stub };
}

const request = (roomId: string | null = ROOM_ID): GiftListRequest => ({
  roomId,
  ...DEFAULT_GIFT_OPTIONS,
});

describe("giftsIn", () => {
  it("reads data.gifts, data.giftList or data.pages[0].gifts", () => {
    expect(giftsIn({ gifts: [ROSE] })).toEqual([ROSE_GIFT]);
    expect(giftsIn({ giftList: [LION] })).toEqual([LION_GIFT]);
    expect(giftsIn({ pages: [{ gifts: [LION] }] })).toEqual([LION_GIFT]);
    expect(giftsIn({ gifts: [], pages: [{ gifts: [ROSE] }] })).toEqual([
      ROSE_GIFT,
    ]);
  });

  it("skips entries without an id and drops repeated ids", () => {
    expect(
      giftsIn({
        gifts: [
          null,
          "x",
          { name: "No id" },
          { id: 0 },
          ROSE,
          { ...ROSE, name: "Again" },
          LION,
        ],
      }),
    ).toEqual([ROSE_GIFT, LION_GIFT]);
  });

  it("fills a missing name and price, unless details are required", () => {
    const bare = { id: 1, image: "not an image" };
    expect(giftsIn({ gifts: [bare] })).toEqual([
      { id: "1", name: "", diamondCount: 0 },
    ]);
    expect(giftsIn({ gifts: [bare, ROSE] }, true)).toEqual([ROSE_GIFT]);
    expect(giftsIn({ gifts: [{ id: 2, image: { uri: 5 } }] })).toEqual([
      { id: "2", name: "", diamondCount: 0, image: { urlList: [], uri: "" } },
    ]);
  });

  it("gives nothing without a gift array", () => {
    expect(giftsIn(undefined)).toEqual([]);
    expect(giftsIn({ gifts: [] })).toEqual([]);
    expect(giftsIn({ gifts: "many" })).toEqual([]);
  });
});

describe("fetchGiftList", () => {
  it("takes the room's own list first", async () => {
    const { context, requests, logger } = setup({
      room: () => jsonResponse({ data: { gifts: [ROSE, LION, ROSE] } }),
    });

    await expect(fetchGiftList(request(), context)).resolves.toEqual({
      gifts: [ROSE_GIFT, LION_GIFT],
      source: "room",
    });

    expect(requests).toHaveLength(1);
    const { url, headers } = requests[0]!;
    expect(url.searchParams.get("room_id")).toBe(ROOM_ID);
    expect(url.searchParams.get("aid")).toBe("1988");
    expect(url.searchParams.get("device_id")).toBe("1234567890123456789");
    expect(headers.get("cookie")).toContain("sessionid=secret-session");
    expect(logger).toHaveBeenCalledWith(
      "debug",
      "Gift list from the room source",
      { source: "room", gifts: 2 },
    );
  });

  it("falls over to the signer, deduplicating its gifts", async () => {
    const fetchGifts = vi.fn<NonNullable<Signer["fetchGifts"]>>(() =>
      Promise.resolve([LION_GIFT, ROSE_GIFT, LION_GIFT]),
    );
    for (const room of [
      failing,
      () => jsonResponse({ data: { gifts: [] } }),
      () => jsonResponse({ status_code: 0, data: { prompts: "sign me" } }),
    ]) {
      const { context } = setup(
        { room },
        { fetchConnect: vi.fn(), fetchGifts },
      );
      await expect(fetchGiftList(request(), context)).resolves.toEqual({
        gifts: [LION_GIFT, ROSE_GIFT],
        source: "signer",
      });
      expect(fetchGifts).toHaveBeenLastCalledWith(ROOM_ID, context.signContext);
    }
  });

  it("falls over to the region list, made like Tokio's request", async () => {
    const { context, requests } = setup(
      {
        room: failing,
        region: () => jsonResponse({ data: { pages: [{ gifts: [LION] }] } }),
      },
      { fetchConnect: vi.fn(), fetchGifts: () => Promise.resolve(null) },
    );

    await expect(
      fetchGiftList(
        { roomId: ROOM_ID, region: "DE", language: "de-DE" },
        context,
      ),
    ).resolves.toEqual({ gifts: [LION_GIFT], source: "region" });

    const { url, headers } = requests[1]!;
    expect(url.href).toBe(
      `${GIFT_LIST}?aid=1988&app_language=de-DE&region=DE&sys_region=DE`,
    );
    expect(Object.fromEntries(headers)).toEqual({
      accept: "application/json",
      "user-agent": context.http.userAgent,
    });
  });

  it("only asks the region list without a room id", async () => {
    const fetchGifts = vi.fn();
    const { context, requests } = setup(
      { region: () => jsonResponse({ data: { gifts: [ROSE] } }) },
      { fetchConnect: vi.fn(), fetchGifts },
    );

    await expect(fetchGiftList(request(null), context)).resolves.toEqual({
      gifts: [ROSE_GIFT],
      source: "region",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url.searchParams.get("region")).toBe("US");
    expect(requests[0]!.url.searchParams.get("app_language")).toBe("en-US");
    expect(fetchGifts).not.toHaveBeenCalled();
  });

  it("skips the signer when it has no gift list", async () => {
    const { context, requests } = setup({
      room: failing,
      region: () => jsonResponse({ data: { gifts: [ROSE] } }),
    });

    await expect(fetchGiftList(request(), context)).resolves.toMatchObject({
      source: "region",
    });
    expect(requests).toHaveLength(2);
  });

  it("throws GIFTS_UNAVAILABLE with every source's error when all fail", async () => {
    const { context } = setup(
      { room: failing, region: () => jsonResponse({ data: {} }) },
      { fetchConnect: vi.fn(), fetchGifts: () => Promise.resolve(null) },
    );

    const error = await rejectionOf(fetchGiftList(request(), context));

    expect(error).toMatchObject({
      name: "ConnectorError",
      code: "GIFTS_UNAVAILABLE",
      retryable: true,
      message:
        "No gift list source answered (room: HTTP, signer: GIFTS_UNAVAILABLE, region: GIFTS_UNAVAILABLE)",
    });
    const causes = error.cause as Error[];
    expect(causes.map((cause) => cause.message)).toEqual([
      `GET ${GIFT_LIST} answered 403`,
      "The signer gift list has no gifts",
      "The region gift list has no gifts",
    ]);
  });

  it("turns a signer's failure that isn't a ConnectorError into a SignError", async () => {
    const failure = new Error("signer bug");
    const { context } = setup(
      {},
      {
        fetchConnect: vi.fn(),
        fetchGifts: () => {
          throw failure;
        },
      },
    );

    const error = await rejectionOf(fetchGiftList(request(), context));

    expect(error.message).toBe(
      "No gift list source answered (room: HTTP, signer: SIGN_FAILED, region: HTTP)",
    );
    expect((error.cause as unknown[])[1]).toMatchObject({
      code: "SIGN_FAILED",
      message: "The signer's gift list failed: signer bug",
      cause: failure,
    });
  });

  it("times out a slow source and moves on", async () => {
    const { context } = setup(
      {
        room: never,
        region: () => jsonResponse({ data: { gifts: [ROSE] } }),
      },
      { fetchConnect: vi.fn(), fetchGifts: () => new Promise(() => {}) },
      { timeoutMs: 50 },
    );

    await expect(fetchGiftList(request(), context)).resolves.toMatchObject({
      source: "region",
    });
  });

  it("stops with AbortError when the signal aborts", async () => {
    const controller = new AbortController();
    const { context, requests } = setup(
      {
        room: (stubRequest) => {
          controller.abort();
          return never(stubRequest);
        },
      },
      { fetchConnect: vi.fn() },
      { signal: controller.signal },
    );

    await expect(fetchGiftList(request(), context)).rejects.toMatchObject({
      code: "ABORTED",
    });
    expect(requests).toHaveLength(1);
  });

  it("stops when the signal aborted while a source answered", async () => {
    const controller = new AbortController();
    const reason = new Error("disconnect");
    const { context, requests } = setup(
      {
        room: () => {
          controller.abort(reason);
          return jsonResponse({ data: { gifts: [] } });
        },
      },
      { fetchConnect: vi.fn() },
      { signal: controller.signal },
    );

    await expect(fetchGiftList(request(), context)).rejects.toMatchObject({
      name: "AbortError",
      cause: reason,
    });
    expect(requests).toHaveLength(1);
  });
});
