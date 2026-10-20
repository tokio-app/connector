import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  jsonResponse,
  never,
  networkFailure,
  rejectionOf,
  signContextFor,
  stubFetch,
  type StubHandler,
} from "../../test/helpers/fetchStub.js";
import type { ConnectorError } from "../errors.js";
import { HttpClient } from "../http/client.js";
import type { SignContext, Signer } from "../signer/types.js";
import {
  checkLive,
  idOf,
  resolveRoomId,
  valueAt,
  withinDeadline,
  type RoomContext,
} from "./resolver.js";

const ROOM_ID = "7140000000000000001";
const LIVE_PAGE = readFileSync(
  new URL("../../test/fixtures/live-page.html", import.meta.url),
  "utf8",
);

interface Routes {
  page?: StubHandler;
  api?: StubHandler;
  info?: StubHandler;
}

const notFound: StubHandler = () => new Response("", { status: 404 });
const html =
  (body: string): StubHandler =>
  () =>
    new Response(body);

function setup(
  routes: Routes,
  signer: Signer = { fetchConnect: vi.fn() },
  overrides: Partial<SignContext> = {},
) {
  const stub = stubFetch((request) => {
    const path = request.url.pathname;
    if (path.endsWith("/live")) return (routes.page ?? notFound)(request);
    if (path === "/api-live/user/room/")
      return (routes.api ?? notFound)(request);
    if (path === "/webcast/room/info/")
      return (routes.info ?? notFound)(request);
    throw new Error(`Unexpected request to ${request.url.href}`);
  });
  const signContext = signContextFor(stub.fetch, overrides);
  const http = new HttpClient({
    fetch: stub.fetch,
    timeoutMs: signContext.timeoutMs,
    clientParams: {},
    headers: {},
    session: undefined,
    logger: signContext.logger,
    deviceId: "1234567890123456789",
  });
  const context: RoomContext = { http, signer, signContext };
  return { context, logger: signContext.logger, ...stub };
}

function pageWith(script: string, json: string): string {
  return `<html><body><script id="${script}" type="application/json">${json}</script></body></html>`;
}

describe("idOf", () => {
  it("takes decimal strings and positive safe integers", () => {
    expect(idOf(" 7140000000000000001 ")).toBe(ROOM_ID);
    expect(idOf(5655)).toBe("5655");
    expect(idOf("007")).toBe("007");
  });

  it("refuses zero, empty, unsafe and other values", () => {
    for (const value of ["", "0", "000", "12a", "-1", 0, -5, 1.5, 2 ** 60]) {
      expect(idOf(value)).toBe(null);
    }
    expect(idOf(null)).toBe(null);
    expect(idOf({ id: 1 })).toBe(null);
  });
});

describe("valueAt", () => {
  it("walks objects and arrays", () => {
    expect(valueAt({ a: [{ b: 1 }] }, "a", 0, "b")).toBe(1);
    expect(valueAt({ a: null }, "a", "b")).toBeUndefined();
    expect(valueAt("text", "length")).toBeUndefined();
  });
});

describe("resolveRoomId", () => {
  it("reads the room id from the LIVE page's SIGI_STATE", async () => {
    const { context, requests, logger } = setup({ page: html(LIVE_PAGE) });

    await expect(resolveRoomId("someone", context)).resolves.toBe(ROOM_ID);

    expect(requests).toHaveLength(1);
    const { url } = requests[0]!;
    expect(url.origin + url.pathname).toBe(
      "https://www.tiktok.com/@someone/live",
    );
    expect(url.searchParams.get("aid")).toBe("1988");
    expect(logger).toHaveBeenCalledWith(
      "debug",
      "Room id of @someone from the LIVE page",
      { roomId: ROOM_ID },
    );
  });

  it("reads a SIGI_STATE with line breaks inside", async () => {
    const json = JSON.stringify(
      { LiveRoom: { liveRoomUserInfo: { user: { roomId: ROOM_ID } } } },
      null,
      2,
    );
    const { context } = setup({ page: html(pageWith("SIGI_STATE", json)) });

    await expect(resolveRoomId("someone", context)).resolves.toBe(ROOM_ID);
  });

  it("encodes the username in the page URL", async () => {
    const { context, requests } = setup({ page: html(LIVE_PAGE) });

    await resolveRoomId("ünïcode.name", context);

    expect(requests[0]!.url.pathname).toBe("/@%C3%BCn%C3%AFcode.name/live");
  });

  it("falls back to the page's __UNIVERSAL_DATA_FOR_REHYDRATION__", async () => {
    const universal = (state: unknown) =>
      html(
        `<script nonce="x" id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(state)}</script>`,
      );

    const byUser = setup({
      page: universal({
        __DEFAULT_SCOPE__: {
          "webapp.user-detail": {
            userInfo: {
              user: { uniqueId: "SomeOne", roomId: ROOM_ID },
              other: { uniqueId: "someone-else", roomId: "1" },
            },
          },
        },
      }),
    });
    await expect(resolveRoomId("someone", byUser.context)).resolves.toBe(
      ROOM_ID,
    );

    const byLiveRoom = setup({
      page: universal({
        scope: [{ liveRoomUserInfo: { user: { roomId: ROOM_ID } } }],
      }),
    });
    await expect(resolveRoomId("someone", byLiveRoom.context)).resolves.toBe(
      ROOM_ID,
    );
  });

  it("searches a SIGI_STATE that moved the room id", async () => {
    const json = JSON.stringify({
      UserModule: {
        users: { someone: { uniqueId: "someone", roomId: ROOM_ID } },
      },
    });
    const { context } = setup({ page: html(pageWith("SIGI_STATE", json)) });

    await expect(resolveRoomId("someone", context)).resolves.toBe(ROOM_ID);
  });

  it("falls over to the api-live route when the page has no room id", async () => {
    const pages = [
      "<html>captcha</html>",
      pageWith("SIGI_STATE", "{not json"),
      pageWith(
        "SIGI_STATE",
        '{"LiveRoom":{"liveRoomUserInfo":{"user":{"roomId":"0"}}}}',
      ),
      pageWith("__UNIVERSAL_DATA_FOR_REHYDRATION__", "{}"),
    ];
    for (const page of pages) {
      const { context, requests } = setup({
        page: html(page),
        api: () =>
          jsonResponse({ statusCode: 0, data: { user: { roomId: ROOM_ID } } }),
      });

      await expect(resolveRoomId("someone", context)).resolves.toBe(ROOM_ID);

      const { url } = requests[1]!;
      expect(url.origin + url.pathname).toBe(
        "https://www.tiktok.com/api-live/user/room/",
      );
      expect(url.searchParams.get("uniqueId")).toBe("someone");
      expect(url.searchParams.get("sourceType")).toBe("54");
      expect(url.searchParams.get("device_id")).toBe("1234567890123456789");
    }
  });

  it("falls over to the signer when the page and the API fail", async () => {
    const resolve = vi.fn<NonNullable<Signer["resolveRoomId"]>>(() =>
      Promise.resolve(ROOM_ID),
    );
    for (const api of [
      () => jsonResponse({ statusCode: 19881007, message: "user not exist" }),
      () => jsonResponse({ statusCode: 0, data: { user: { roomId: "" } } }),
      () => jsonResponse({ data: {} }),
      () => new Response("", { status: 500 }),
    ]) {
      const { context } = setup(
        { page: notFound, api },
        { fetchConnect: vi.fn(), resolveRoomId: resolve },
      );
      await expect(resolveRoomId("someone", context)).resolves.toBe(ROOM_ID);
      expect(resolve).toHaveBeenLastCalledWith("someone", context.signContext);
    }
  });

  it("throws RoomNotFoundError with every step's error when none answers", async () => {
    const { context, logger } = setup(
      {
        page: html("<html></html>"),
        api: () =>
          jsonResponse({ statusCode: 19881007, message: "user not exist" }),
      },
      { fetchConnect: vi.fn(), resolveRoomId: () => Promise.resolve(null) },
    );

    const error = await rejectionOf(resolveRoomId("someone", context));

    expect(error).toMatchObject({
      name: "RoomNotFoundError",
      code: "ROOM_NOT_FOUND",
      retryable: false,
      message:
        "Couldn't find the room of @someone (the LIVE page: PROTOCOL, api-live: PROTOCOL, the signer: ROOM_NOT_FOUND)",
    });
    const causes = (error as Error).cause as Error[];
    expect(causes.map((cause) => cause.message)).toEqual([
      "The LIVE page of @someone has no SIGI_STATE script, no __UNIVERSAL_DATA_FOR_REHYDRATION__ script (blocked by TikTok?)",
      "api-live/user/room answered statusCode 19881007 (user not exist)",
      "The signer has no room id for @someone",
    ]);
    expect(logger).toHaveBeenCalledWith(
      "debug",
      "Room id of @someone from the signer failed",
      { error: causes[2] },
    );
  });

  it("says when the signer can't look up room ids", async () => {
    const { context } = setup({});

    const error = await rejectionOf(resolveRoomId("someone", context));

    expect((error.cause as Error[])[2]!.message).toBe(
      "The signer can't look up room ids",
    );
    expect(
      (error.cause as ConnectorError[]).map((cause) => cause.code),
    ).toEqual(["HTTP", "HTTP", "ROOM_NOT_FOUND"]);
  });

  it("is retryable when a step failed for a passing reason", async () => {
    const { context } = setup({
      page: () => {
        throw networkFailure();
      },
    });

    await expect(resolveRoomId("someone", context)).rejects.toMatchObject({
      code: "ROOM_NOT_FOUND",
      retryable: true,
      message:
        "Couldn't find the room of @someone (the LIVE page: NETWORK, api-live: HTTP, the signer: ROOM_NOT_FOUND)",
    });
  });

  it("keeps an error that isn't a ConnectorError as a cause", async () => {
    const failure = new Error("signer bug");
    const { context } = setup(
      {},
      {
        fetchConnect: vi.fn(),
        resolveRoomId: () => {
          throw failure;
        },
      },
    );

    const error = await rejectionOf(resolveRoomId("someone", context));

    expect(error.message).toContain("the signer: failed");
    expect((error.cause as unknown[])[2]).toBe(failure);
  });

  it("times out a signer that ignores the deadline", async () => {
    const { context } = setup(
      {},
      { fetchConnect: vi.fn(), resolveRoomId: () => new Promise(() => {}) },
      { timeoutMs: 50 },
    );

    const error = await rejectionOf(resolveRoomId("someone", context));

    expect((error.cause as unknown[])[2]).toMatchObject({
      name: "TimeoutError",
      phase: "sign",
      message: "The signer's room id lookup took longer than 50 ms",
    });
  });

  it("stops with AbortError when the signal aborts", async () => {
    const controller = new AbortController();
    const resolve = vi.fn<NonNullable<Signer["resolveRoomId"]>>();
    const { context, requests } = setup(
      {
        page: (request) => {
          controller.abort();
          return never(request);
        },
      },
      { fetchConnect: vi.fn(), resolveRoomId: resolve },
      { signal: controller.signal },
    );

    await expect(resolveRoomId("someone", context)).rejects.toMatchObject({
      name: "AbortError",
      code: "ABORTED",
    });
    expect(requests).toHaveLength(1);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("turns a signer failure after an abort into an AbortError", async () => {
    const controller = new AbortController();
    const reason = new Error("stop");
    const { context } = setup(
      {},
      {
        fetchConnect: vi.fn(),
        resolveRoomId: () => {
          controller.abort(reason);
          throw new Error("interrupted");
        },
      },
      { signal: controller.signal },
    );

    await expect(resolveRoomId("someone", context)).rejects.toMatchObject({
      code: "ABORTED",
      cause: reason,
    });
  });
});

describe("checkLive", () => {
  const info =
    (status: unknown): StubHandler =>
    () =>
      jsonResponse({ data: { status } });

  it("reads the room's status: 4 is offline, anything else LIVE", async () => {
    for (const [status, live] of [
      [2, true],
      [4, false],
      [0, true],
    ] as const) {
      const { context, requests } = setup({ info: info(status) });
      await expect(checkLive(ROOM_ID, context)).resolves.toBe(live);
      const { url } = requests[0]!;
      expect(url.origin + url.pathname).toBe(
        "https://webcast.tiktok.com/webcast/room/info/",
      );
      expect(url.searchParams.get("room_id")).toBe(ROOM_ID);
    }
  });

  it("asks the signer when TikTok doesn't say", async () => {
    const fetchRoomInfo = vi.fn<NonNullable<Signer["fetchRoomInfo"]>>(() =>
      Promise.resolve({ isLive: false }),
    );
    for (const route of [info(undefined), info("4"), notFound, never]) {
      const { context } = setup(
        { info: route },
        { fetchConnect: vi.fn(), fetchRoomInfo },
        { timeoutMs: 50 },
      );
      await expect(checkLive(ROOM_ID, context)).resolves.toBe(false);
      expect(fetchRoomInfo).toHaveBeenLastCalledWith(
        ROOM_ID,
        context.signContext,
      );
    }
  });

  it("resolves null when neither answers", async () => {
    const signers: Signer[] = [
      { fetchConnect: vi.fn() },
      { fetchConnect: vi.fn(), fetchRoomInfo: () => Promise.resolve(null) },
      {
        fetchConnect: vi.fn(),
        fetchRoomInfo: () => Promise.reject(new Error("down")),
      },
    ];
    for (const signer of signers) {
      const { context } = setup({ info: info(null) }, signer);
      await expect(checkLive(ROOM_ID, context)).resolves.toBe(null);
    }
  });

  it("throws AbortError when the signal aborts", async () => {
    const controller = new AbortController();
    const fetchRoomInfo = vi.fn<NonNullable<Signer["fetchRoomInfo"]>>();
    const { context } = setup(
      {
        info: (request) => {
          controller.abort();
          return never(request);
        },
      },
      { fetchConnect: vi.fn(), fetchRoomInfo },
      { signal: controller.signal },
    );
    await expect(checkLive(ROOM_ID, context)).rejects.toMatchObject({
      code: "ABORTED",
    });
    expect(fetchRoomInfo).not.toHaveBeenCalled();

    const late = new AbortController();
    const { context: lateContext } = setup(
      {},
      {
        fetchConnect: vi.fn(),
        fetchRoomInfo: () => {
          late.abort();
          return new Promise(() => {});
        },
      },
      { signal: late.signal },
    );
    await expect(checkLive(ROOM_ID, lateContext)).rejects.toMatchObject({
      code: "ABORTED",
      message: "The signer's room info was aborted",
    });
  });
});

describe("withinDeadline", () => {
  it("passes the result or the error of the call through", async () => {
    const context = signContextFor(vi.fn());
    await expect(
      withinDeadline("call", context, () => Promise.resolve(1)),
    ).resolves.toBe(1);
    const failure = new Error("no");
    await expect(
      withinDeadline("call", context, () => Promise.reject(failure)),
    ).rejects.toBe(failure);
  });

  it("refuses to start once the signal aborted", async () => {
    const call = vi.fn();
    const context = signContextFor(vi.fn(), { signal: AbortSignal.abort() });
    await expect(
      withinDeadline("The call", context, call),
    ).rejects.toMatchObject({
      code: "ABORTED",
      message: "The call was aborted",
    });
    expect(call).not.toHaveBeenCalled();
  });
});
