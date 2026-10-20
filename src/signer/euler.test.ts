import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  jsonResponse,
  never,
  networkFailure,
  signContextFor,
  stubFetch,
  type StubHandler,
} from "../../test/helpers/fetchStub.js";
import {
  DEFAULT_EULER_CLIENT,
  DEFAULT_EULER_HOST,
  EulerSigner,
} from "./euler.js";
import type { SignContext } from "./types.js";

const ROOM_ID = "7140000000000000001";
const API_KEY = "euler-secret-key";
const BODY = Uint8Array.of(0x12, 0x03, 0x61, 0x62, 0x63);

function setup(
  handler: StubHandler,
  options: ConstructorParameters<typeof EulerSigner>[0] = {},
  context: Partial<SignContext> = {},
) {
  const stub = stubFetch(handler);
  const signer = new EulerSigner(options);
  return { signer, context: signContextFor(stub.fetch, context), ...stub };
}

function connectResponse(headers: Record<string, string> = {}): Response {
  return new Response(BODY, {
    status: 200,
    headers: {
      "content-type": "application/protobuf",
      "x-set-tt-cookie": "ttwid=1%7Cabc; Path=/; HttpOnly",
      ...headers,
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("EulerSigner options", () => {
  it("defaults to Euler Stream's host and the ttlive-node client", async () => {
    expect(DEFAULT_EULER_HOST).toBe("https://tiktok.eulerstream.com");
    expect(DEFAULT_EULER_CLIENT).toBe("ttlive-node");
    const { signer, context, requests } = setup(() => connectResponse());

    await signer.fetchConnect({ roomId: ROOM_ID, cursor: "" }, context);

    expect(requests[0]!.url.origin).toBe(DEFAULT_EULER_HOST);
    expect(requests[0]!.url.searchParams.get("client")).toBe("ttlive-node");
  });

  it("takes a host with trailing slashes and a client", async () => {
    const { signer, context, requests } = setup(() => connectResponse(), {
      host: "http://127.0.0.1:8080/base//",
      client: "my-app",
    });

    await signer.fetchConnect({ roomId: ROOM_ID, cursor: "" }, context);

    expect(
      requests[0]!.url.href.startsWith(
        `http://127.0.0.1:8080/base/webcast/rooms/${ROOM_ID}/connect?client=my-app&`,
      ),
    ).toBe(true);
  });

  it("refuses a host that isn't a URL", () => {
    expect(() => new EulerSigner({ host: "not a url" })).toThrow(TypeError);
  });
});

describe("EulerSigner.fetchConnect", () => {
  it("asks for the signed connect with the query the docs list", async () => {
    const { signer, context, requests } = setup(() => connectResponse(), {
      apiKey: API_KEY,
    });

    await signer.fetchConnect({ roomId: ROOM_ID, cursor: "c-1" }, context);

    const { url, method, headers } = requests[0]!;
    expect(method).toBe("GET");
    expect(url.pathname).toBe(`/webcast/rooms/${ROOM_ID}/connect`);
    expect([...url.searchParams]).toEqual([
      ["client", "ttlive-node"],
      ["cursor", "c-1"],
      ["user_agent", "Test-Agent/1.0"],
      ["client_enter", "true"],
      ["platform", "web"],
    ]);
    expect(headers.get("accept")).toBe(
      "application/protobuf, application/json",
    );
    expect(headers.get("x-api-key")).toBe(API_KEY);
  });

  it("never puts the API key in a URL, nor the session anywhere", async () => {
    const { signer, context, requests } = setup(
      (request) =>
        request.url.pathname.endsWith("/connect")
          ? connectResponse()
          : jsonResponse({ ok: true, room_id: ROOM_ID }),
      { apiKey: API_KEY },
    );
    const sessionCookies = "sessionid=secret-session; tt-target-idc=alisg";

    await signer.fetchConnect(
      { roomId: ROOM_ID, cursor: "", sessionCookies },
      context,
    );
    await signer.resolveRoomId("someone", context);
    await signer.fetchRoomInfo(ROOM_ID, context);
    await signer.fetchGifts(ROOM_ID, context);

    expect(requests).toHaveLength(4);
    for (const { url, headers } of requests) {
      expect(url.href).not.toContain(API_KEY);
      expect(url.searchParams.has("apiKey")).toBe(false);
      expect(url.href).not.toContain("secret-session");
      expect(headers.get("x-api-key")).toBe(API_KEY);
      expect(headers.has("x-cookie-header")).toBe(false);
      expect(headers.has("cookie")).toBe(false);
      expect([...headers.values()].join()).not.toContain("secret-session");
    }
    // Nothing logged holds the key or the session, error causes included.
    const logged = inspect(context.logger.mock.calls, { depth: null });
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain("secret-session");
  });

  it("sends no x-api-key without a key", async () => {
    const { signer, context, requests } = setup(() => connectResponse(), {
      apiKey: "  ",
    });

    await signer.fetchConnect({ roomId: ROOM_ID, cursor: "" }, context);

    expect(requests[0]!.headers.has("x-api-key")).toBe(false);
  });

  it("returns the body, the cookies and the ids of the answer", async () => {
    const { signer, context } = setup(() =>
      connectResponse({
        "x-set-tt-cookie": "ttwid=1%7Cabc; Path=/, msToken=ab+c==; Secure",
        "x-room-id": "7140000000000000002",
        "x-request-id": "req-1",
        "x-agent-id": "agent-1",
      }),
    );

    await expect(
      signer.fetchConnect({ roomId: ROOM_ID, cursor: "" }, context),
    ).resolves.toEqual({
      body: BODY,
      cookies: ["ttwid=1%7Cabc", "msToken=ab+c=="],
      roomId: "7140000000000000002",
      requestId: "req-1",
      agentId: "agent-1",
    });
    expect(context.logger).toHaveBeenCalledWith(
      "debug",
      `Euler Stream GET /webcast/rooms/${ROOM_ID}/connect: 200`,
      expect.objectContaining({ status: 200, requestId: "req-1" }),
    );
    // The cookies' names are logged, never their values.
    expect(context.logger).toHaveBeenCalledWith(
      "debug",
      "The signed connect came with 2 cookies",
      { names: ["ttwid", "msToken"] },
    );
    expect(JSON.stringify(context.logger.mock.calls)).not.toContain("abc");
  });

  it("leaves out the ids the answer doesn't have, and a room id of 0", async () => {
    const { signer, context } = setup(() =>
      connectResponse({ "x-room-id": "0" }),
    );

    await expect(
      signer.fetchConnect({ roomId: ROOM_ID, cursor: "" }, context),
    ).resolves.toEqual({ body: BODY, cookies: ["ttwid=1%7Cabc"] });
  });

  it("refuses an answer without cookies", async () => {
    for (const headers of [
      { "x-set-tt-cookie": "", "x-request-id": "req-2" },
      { "x-set-tt-cookie": "Path=/; HttpOnly", "x-request-id": "req-2" },
    ]) {
      const { signer, context } = setup(() => new Response(BODY, { headers }));
      await expect(
        signer.fetchConnect({ roomId: ROOM_ID, cursor: "" }, context),
      ).rejects.toMatchObject({
        name: "ProtocolError",
        code: "PROTOCOL",
        message:
          "The signed connect came without cookies (x-set-tt-cookie) (request id req-2)",
      });
    }
  });

  it("refuses an empty body", async () => {
    const { signer, context } = setup(
      () => new Response(null, { headers: { "x-set-tt-cookie": "a=1" } }),
    );

    await expect(
      signer.fetchConnect({ roomId: ROOM_ID, cursor: "" }, context),
    ).rejects.toMatchObject({
      code: "PROTOCOL",
      message: "The signed connect came with an empty body",
    });
  });
});

describe("EulerSigner errors", () => {
  const connect = (
    handler: StubHandler,
    context: Partial<SignContext> = {},
  ) => {
    const { signer, context: ctx } = setup(handler, {}, context);
    return signer
      .fetchConnect({ roomId: ROOM_ID, cursor: "" }, ctx)
      .catch((error: unknown) => error);
  };

  it("maps 429 to RateLimitError with Euler Stream's message and retry-after", async () => {
    const error = await connect(() =>
      jsonResponse(
        { code: 429, message: "Too many requests", limit_label: "WEBCAST" },
        {
          status: 429,
          headers: { "retry-after": "30", "x-request-id": "req-3" },
        },
      ),
    );

    expect(error).toMatchObject({
      name: "RateLimitError",
      code: "RATE_LIMITED",
      status: 429,
      retryable: true,
      retryAfterMs: 30_000,
      requestId: "req-3",
      message:
        "The signed connect hit Euler Stream's rate limit (WEBCAST): Too many requests",
    });
  });

  it("reads retry-after as an HTTP date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    const at = (value: string) =>
      connect(
        () =>
          new Response("", { status: 429, headers: { "retry-after": value } }),
      );

    await expect(at("Tue, 20 Oct 2026 10:00:45 GMT")).resolves.toMatchObject({
      retryAfterMs: 45_000,
      message: "The signed connect hit Euler Stream's rate limit",
    });
    await expect(at("Tue, 20 Oct 2026 09:00:00 GMT")).resolves.toMatchObject({
      retryAfterMs: 0,
    });
  });

  it("falls back to ratelimit-reset, then x-ratelimit-reset", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    const now = Date.now();
    const retryAfter = (headers: Record<string, string>) =>
      connect(() => new Response("slow down", { status: 429, headers })).then(
        (error) => (error as { retryAfterMs?: number }).retryAfterMs,
      );

    await expect(
      retryAfter({ "retry-after": "soon", "ratelimit-reset": "12" }),
    ).resolves.toBe(12_000);
    await expect(retryAfter({ "x-ratelimit-reset": "1.5" })).resolves.toBe(
      1_500,
    );
    await expect(
      retryAfter({ "x-ratelimit-reset": String(now / 1000 + 20) }),
    ).resolves.toBe(20_000);
    await expect(
      retryAfter({ "x-ratelimit-reset": String(now + 7_000) }),
    ).resolves.toBe(7_000);
    await expect(
      retryAfter({ "ratelimit-reset": "later", "x-ratelimit-reset": "" }),
    ).resolves.toBeUndefined();
    await expect(retryAfter({})).resolves.toBeUndefined();
  });

  it("quotes a 429 body that isn't JSON", async () => {
    await expect(
      connect(() => new Response("slow  down\n", { status: 429 })),
    ).resolves.toMatchObject({
      message: "The signed connect hit Euler Stream's rate limit: slow down",
    });
  });

  it("maps 402 to PremiumFeatureError", async () => {
    await expect(
      connect(() =>
        jsonResponse({ code: 402, message: "Upgrade" }, { status: 402 }),
      ),
    ).resolves.toMatchObject({
      name: "PremiumFeatureError",
      code: "PREMIUM_REQUIRED",
      status: 402,
      retryable: false,
      message: "The signed connect needs a paid Euler Stream plan: Upgrade",
    });
  });

  it("maps 401 and 403 to a SignError that isn't retryable", async () => {
    for (const status of [401, 403]) {
      await expect(
        connect(() =>
          jsonResponse({ code: status, message: "Bad key" }, { status }),
        ),
      ).resolves.toMatchObject({
        name: "SignError",
        code: "SIGN_FAILED",
        status,
        retryable: false,
        message: `The signed connect answered ${status}: Bad key`,
      });
    }
  });

  it("maps 5xx and other statuses to a retryable SignError", async () => {
    await expect(
      connect(() =>
        jsonResponse(
          { code: 503, message: "No agents are currently available" },
          { status: 503, headers: { "x-request-id": "req-4" } },
        ),
      ),
    ).resolves.toMatchObject({
      name: "SignError",
      status: 503,
      retryable: true,
      requestId: "req-4",
      message:
        "The signed connect answered 503: No agents are currently available",
    });
    await expect(
      connect(() => jsonResponse({ code: 500, message: "" }, { status: 500 })),
    ).resolves.toMatchObject({
      message: 'The signed connect answered 500: {"code":500,"message":""}',
    });
    await expect(
      connect(() => new Response(null, { status: 418 })),
    ).resolves.toMatchObject({
      status: 418,
      retryable: true,
      message: "The signed connect answered 418",
    });
  });

  it("still maps the status when the error body can't be read", async () => {
    await expect(
      connect(
        () =>
          new Response(
            new ReadableStream({
              start: (controller) => controller.error(new Error("reset")),
            }),
            { status: 500 },
          ),
      ),
    ).resolves.toMatchObject({
      status: 500,
      message: "The signed connect answered 500",
    });
  });

  it("maps no answer to a retryable SignError without a status", async () => {
    const error = await connect(() => {
      throw networkFailure("ENOTFOUND");
    });

    expect(error).toMatchObject({
      name: "SignError",
      status: undefined,
      retryable: true,
      message:
        "The signed connect failed: connect ENOTFOUND 127.0.0.1:443 (ENOTFOUND)",
    });
  });

  it("times out after timeoutMs with phase sign", async () => {
    await expect(connect(never, { timeoutMs: 50 })).resolves.toMatchObject({
      name: "TimeoutError",
      phase: "sign",
      message: "The signed connect took longer than 50 ms",
    });
  });

  it("aborts with the context's signal", async () => {
    const reason = new Error("disconnect");
    const before = setup(
      () => connectResponse(),
      {},
      {
        signal: AbortSignal.abort(reason),
      },
    );
    await expect(
      before.signer.fetchConnect(
        { roomId: ROOM_ID, cursor: "" },
        before.context,
      ),
    ).rejects.toMatchObject({ name: "AbortError", cause: reason });
    expect(before.fetch).not.toHaveBeenCalled();

    const controller = new AbortController();
    const during = setup(never, {}, { signal: controller.signal });
    const pending = during.signer.fetchConnect(
      { roomId: ROOM_ID, cursor: "" },
      during.context,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: "ABORTED",
      message: "The signed connect was aborted",
    });
    expect(during.context.logger).toHaveBeenCalledWith(
      "debug",
      `Euler Stream GET /webcast/rooms/${ROOM_ID}/connect failed: ABORTED`,
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});

describe("EulerSigner.resolveRoomId", () => {
  it("returns the room id of an ok answer", async () => {
    const { signer, context, requests } = setup(() =>
      jsonResponse({
        code: 200,
        ok: true,
        is_live: true,
        room_id: ROOM_ID,
        routes_attempted: [],
      }),
    );

    await expect(signer.resolveRoomId("some.one", context)).resolves.toBe(
      ROOM_ID,
    );
    expect(requests[0]!.url.pathname).toBe("/webcast/anchors/some.one/room_id");
    expect(requests[0]!.url.search).toBe("");
    expect(requests[0]!.headers.get("accept")).toBe("application/json");
  });

  it("returns null without an ok answer or a room id", async () => {
    for (const body of [
      { ok: false, room_id: ROOM_ID },
      { ok: true, room_id: "" },
      { ok: true, room_id: "0" },
      { ok: true },
      null,
    ]) {
      const { signer, context } = setup(() => jsonResponse(body));
      await expect(signer.resolveRoomId("someone", context)).resolves.toBe(
        null,
      );
    }
  });

  it("returns null on a 4xx: the plan lacks the route, or no such user", async () => {
    for (const status of [401, 402, 403, 404]) {
      const { signer, context } = setup(() =>
        jsonResponse(
          { code: status, ok: false, detail: { reason: "no_live_profile" } },
          { status },
        ),
      );
      await expect(signer.resolveRoomId("someone", context)).resolves.toBe(
        null,
      );
      expect(context.logger).toHaveBeenCalledWith(
        "debug",
        `Euler Stream's room id lookup: no answer (${status})`,
        { status },
      );
    }
  });

  it("throws on 429 and 5xx", async () => {
    const limited = setup(() => new Response("", { status: 429 }));
    await expect(
      limited.signer.resolveRoomId("someone", limited.context),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });

    const broken = setup(() => new Response("", { status: 500 }));
    await expect(
      broken.signer.resolveRoomId("someone", broken.context),
    ).rejects.toMatchObject({ code: "SIGN_FAILED", status: 500 });
  });

  it("throws ProtocolError for a body that isn't JSON", async () => {
    const { signer, context } = setup(() => new Response("<html>"));
    await expect(
      signer.resolveRoomId("someone", context),
    ).rejects.toMatchObject({
      code: "PROTOCOL",
      message:
        "Euler Stream's room id lookup answered with a body that isn't JSON: <html>",
    });
    const empty = setup(() => new Response(""));
    await expect(
      empty.signer.resolveRoomId("someone", empty.context),
    ).rejects.toThrow("isn't JSON: (empty)");
  });
});

describe("EulerSigner.fetchRoomInfo", () => {
  const roomInfo = async (body: unknown, status = 200) => {
    const { signer, context, requests } = setup(() =>
      jsonResponse(body, { status }),
    );
    const info = await signer.fetchRoomInfo(ROOM_ID, context);
    expect(requests[0]!.url.pathname).toBe(
      `/webcast/rooms/${ROOM_ID}/room_info`,
    );
    return info;
  };

  it("reads is_live, else the status", async () => {
    await expect(
      roomInfo({
        ok: true,
        data: { room_info: { is_live: false, status: 2 } },
      }),
    ).resolves.toEqual({ isLive: false });
    await expect(
      roomInfo({ ok: true, data: { room_info: { is_live: true } } }),
    ).resolves.toEqual({ isLive: true });
    await expect(
      roomInfo({ ok: true, data: { room_info: { status: 4 } } }),
    ).resolves.toEqual({ isLive: false });
    await expect(
      roomInfo({ ok: true, data: { room_info: { status: 2 } } }),
    ).resolves.toEqual({ isLive: true });
  });

  it("returns null when it doesn't say, or on a 4xx", async () => {
    await expect(roomInfo({ ok: true, data: {} })).resolves.toBe(null);
    await expect(roomInfo([])).resolves.toBe(null);
    await expect(roomInfo({ code: 403 }, 403)).resolves.toBe(null);
  });
});

describe("EulerSigner.fetchGifts", () => {
  const gifts = async (body: unknown, status = 200) => {
    const { signer, context, requests } = setup(() =>
      jsonResponse(body, { status }),
    );
    const result = await signer.fetchGifts(ROOM_ID, context);
    expect(requests[0]!.url.pathname).toBe(`/webcast/rooms/${ROOM_ID}/gifts`);
    return result;
  };

  it("returns null for the documented answer: gift ids, not gifts", async () => {
    await expect(
      gifts({
        code: 200,
        response: {
          room_id: ROOM_ID,
          page_gifts: [5655, 5269],
          gift_overrides: {},
        },
      }),
    ).resolves.toBe(null);
  });

  it("returns the gifts when the answer carries full gift objects", async () => {
    await expect(
      gifts({
        code: 200,
        response: {
          page_gifts: [5655],
          gifts: [
            {
              id: 5655,
              name: "Rose",
              diamond_count: 1,
              image: { url_list: ["https://cdn/rose.png"], uri: "rose" },
            },
            { id: 5269, name: "TikTok" },
            { id: 1, diamond_count: 5 },
          ],
        },
      }),
    ).resolves.toEqual([
      {
        id: "5655",
        name: "Rose",
        diamondCount: 1,
        image: { urlList: ["https://cdn/rose.png"], uri: "rose" },
      },
    ]);
  });

  it("returns null on a 4xx", async () => {
    await expect(gifts({ code: 402 }, 402)).resolves.toBe(null);
  });
});
