import { describe, expect, it, vi } from "vitest";
import {
  never,
  networkFailure,
  stalledBody,
  stubFetch,
  type StubHandler,
} from "../../test/helpers/fetchStub.js";
import type { Logger } from "../logger.js";
import { HttpClient, previewBody, type HttpClientOptions } from "./client.js";
import { DEFAULT_HTTP_PARAMS, DEFAULT_USER_AGENT } from "./params.js";

const URL_LIVE = "https://www.tiktok.com/api-live/user/room/";
const SESSION = { sessionId: "secret-session", ttTargetIdc: "alisg" };

function clientFor(
  handler: StubHandler,
  options: Partial<HttpClientOptions> = {},
) {
  const stub = stubFetch(handler);
  const logger = vi.fn<Logger>();
  const http = new HttpClient({
    fetch: stub.fetch,
    timeoutMs: 1_000,
    clientParams: {},
    headers: {},
    session: undefined,
    logger,
    deviceId: "1234567890123456789",
    ...options,
  });
  return { http, logger, ...stub };
}

const ok = () => new Response("{}");

describe("HttpClient URLs", () => {
  it("sends the default params with device_id, then clientParams, then the request's", async () => {
    const { http, requests } = clientFor(ok, {
      clientParams: { aid: "9", region: "FR", extra: "1" },
    });

    await http.getText(URL_LIVE, {
      params: { uniqueId: "someone", region: "US" },
    });

    const { url } = requests[0]!;
    expect(url.origin + url.pathname).toBe(URL_LIVE);
    const params = Object.fromEntries(url.searchParams);
    expect(params).toMatchObject({
      aid: "9",
      region: "US",
      extra: "1",
      uniqueId: "someone",
      device_id: "1234567890123456789",
      browser_version: DEFAULT_HTTP_PARAMS.browser_version,
    });
    expect([...url.searchParams.keys()][0]).toBe("aid");
    // Spaces are encoded as "+", as URLSearchParams does.
    expect(url.search).toContain("browser_version=5.0+%28Macintosh%3B+");
  });

  it("makes one random device id per client", async () => {
    const { http, requests } = clientFor(ok, { deviceId: undefined });

    await http.getText(URL_LIVE);
    await http.getText(URL_LIVE);

    const ids = requests.map((request) =>
      request.url.searchParams.get("device_id"),
    );
    expect(ids[0]).toMatch(/^\d{19}$/);
    expect(ids[1]).toBe(ids[0]);
  });

  it("keeps the query a URL already has", async () => {
    const { http, requests } = clientFor(ok);

    await http.getText(`${URL_LIVE}?keep=1&aid=7`, { bare: true });

    expect(requests[0]!.url.search).toBe("?keep=1&aid=7");
  });
});

describe("HttpClient headers", () => {
  it("sends the defaults and the jar, then the headers option, then the request's", async () => {
    const { http, requests } = clientFor(ok, {
      headers: { "accept-language": "de-DE", "X-Extra": "1" },
    });

    await http.getText(URL_LIVE, { headers: { "x-extra": "2" } });

    const { headers } = requests[0]!;
    expect(headers.get("user-agent")).toBe(DEFAULT_USER_AGENT);
    expect(headers.get("referer")).toBe("https://www.tiktok.com/");
    expect(headers.get("accept-language")).toBe("de-DE");
    expect(headers.get("x-extra")).toBe("2");
    expect(headers.get("cookie")).toBe("tt-target-idc=useast1a");
  });

  it("lets the headers option replace the jar's Cookie header", async () => {
    const { http, requests } = clientFor(ok, {
      headers: { cookie: "mine=1" },
    });

    await http.getText(URL_LIVE);

    expect(requests[0]!.headers.get("cookie")).toBe("mine=1");
  });

  it("sends a bare request with only its params, the User-Agent and its headers", async () => {
    const { http, requests } = clientFor(ok, {
      clientParams: { region: "FR" },
      headers: { "User-Agent": "Custom/2.0", Referer: "x" },
    });

    await http.getJson("https://webcast.tiktok.com/webcast/gift/list/", {
      bare: true,
      params: { aid: "1988", region: "US" },
      headers: { Accept: "application/json" },
    });

    const { url, headers } = requests[0]!;
    expect(url.search).toBe("?aid=1988&region=US");
    expect([...headers.entries()]).toEqual([
      ["accept", "application/json"],
      ["user-agent", "Custom/2.0"],
    ]);
  });

  it("has the headers option's User-Agent, or the default", () => {
    expect(clientFor(ok).http.userAgent).toBe(DEFAULT_USER_AGENT);
    expect(
      clientFor(ok, { headers: { "user-agent": "Other" } }).http.userAgent,
    ).toBe("Other");
  });
});

describe("HttpClient cookies", () => {
  it("starts with tt-target-idc, and no session", () => {
    const { http } = clientFor(ok);
    expect(http.cookieHeader()).toBe("tt-target-idc=useast1a");
    expect(http.sessionCookieHeader()).toBeUndefined();
  });

  it("sends the session as cookies", async () => {
    const { http, requests } = clientFor(ok, { session: SESSION });

    expect(http.cookieHeader()).toBe(
      "tt-target-idc=alisg; sessionid=secret-session; sessionid_ss=secret-session; sid_tt=secret-session; sid_guard=secret-session",
    );
    expect(http.sessionCookieHeader()).toBe(
      "sessionid=secret-session; tt-target-idc=alisg",
    );
    await http.getText(URL_LIVE);
    expect(requests[0]!.headers.get("cookie")).toBe(http.cookieHeader());
  });

  it("keeps the cookies TikTok sets", async () => {
    const { http, requests } = clientFor(
      () =>
        new Response("", {
          headers: [
            ["set-cookie", "ttwid=1%7Cabc; Path=/; HttpOnly"],
            ["set-cookie", "tt-target-idc=useast2a; Domain=.tiktok.com"],
            ["set-cookie", "Secure"],
          ],
        }),
    );

    await http.getText(URL_LIVE);
    await http.getText(URL_LIVE);

    expect(http.cookieHeader()).toBe("tt-target-idc=useast2a; ttwid=1%7Cabc");
    expect(requests[1]!.headers.get("cookie")).toBe(http.cookieHeader());
  });

  it("reads Set-Cookie from a fetch whose Headers lack getSetCookie()", async () => {
    const { http } = clientFor(() => {
      const response = new Response("", {
        headers: [
          ["set-cookie", "a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT"],
          ["set-cookie", "b=2"],
        ],
      });
      Object.defineProperty(response.headers, "getSetCookie", {
        value: undefined,
      });
      return response;
    });

    await http.getText(URL_LIVE);

    expect(http.cookieHeader()).toBe("tt-target-idc=useast1a; a=1; b=2");
  });

  it("keeps a bare request's cookies too, without sending the jar", async () => {
    const { http, requests } = clientFor(
      () => new Response("", { headers: { "set-cookie": "c=3" } }),
    );

    await http.getText(URL_LIVE, { bare: true });

    expect(requests[0]!.headers.get("cookie")).toBe(null);
    expect(http.cookieHeader()).toBe("tt-target-idc=useast1a; c=3");
  });

  it("adds cookie pairs, a later value winning", () => {
    const { http } = clientFor(ok);

    http.addCookies(["a=1", "b=2; Path=/", "nothing", "", "a=3"]);

    expect(http.cookieHeader()).toBe("tt-target-idc=useast1a; a=3; b=2");
  });
});

describe("HttpClient bodies", () => {
  it("reads text, JSON and bytes", async () => {
    const { http } = clientFor(
      () => new Response('{"data":{"status":2}}', { status: 200 }),
    );

    await expect(http.getText(URL_LIVE)).resolves.toBe('{"data":{"status":2}}');
    await expect(http.getJson(URL_LIVE)).resolves.toEqual({
      data: { status: 2 },
    });
    await expect(http.getBytes(URL_LIVE)).resolves.toEqual(
      new TextEncoder().encode('{"data":{"status":2}}'),
    );
  });

  it("refuses a body that isn't JSON with an HttpError", async () => {
    const { http } = clientFor(() => new Response("<html>captcha</html>"));

    const error = await http
      .getJson(URL_LIVE)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      name: "HttpError",
      code: "HTTP",
      status: 200,
      retryable: false,
    });
    expect((error as Error).message).toBe(
      "GET https://www.tiktok.com/api-live/user/room/ answered with a body that isn't JSON: <html>captcha</html>",
    );
  });

  it("says when the body is empty", async () => {
    const { http } = clientFor(() => new Response(""));
    await expect(http.getJson(URL_LIVE)).rejects.toThrow("isn't JSON: (empty)");
  });
});

describe("HttpClient failures", () => {
  it("maps an error status to an HttpError without the query", async () => {
    const body = `<html>\n  ${"x".repeat(300)}\n</html>`;
    const { http } = clientFor(() => new Response(body, { status: 403 }));

    const error = await http
      .getText(URL_LIVE, { params: { uniqueId: "someone" } })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "HTTP",
      status: 403,
      retryable: false,
    });
    const { message } = error as Error;
    expect(message).toMatch(
      /^GET https:\/\/www\.tiktok\.com\/api-live\/user\/room\/ answered 403: <html> x+…$/,
    );
    expect(message).not.toContain("?");
    expect(message).not.toContain("device_id");
    expect(message.length).toBeLessThan(300);
  });

  it("makes 429 and 5xx retryable", async () => {
    for (const status of [429, 500, 503]) {
      const { http } = clientFor(() => new Response("", { status }));
      await expect(http.getText(URL_LIVE)).rejects.toMatchObject({
        status,
        retryable: true,
        message: `GET ${URL_LIVE} answered ${status}`,
      });
    }
  });

  it("still reports the status when the error body can't be read", async () => {
    const { http } = clientFor(() => {
      const body = new ReadableStream({
        start: (controller) => controller.error(new Error("reset")),
      });
      return new Response(body, { status: 502 });
    });

    await expect(http.getText(URL_LIVE)).rejects.toMatchObject({
      status: 502,
      message: `GET ${URL_LIVE} answered 502`,
    });
  });

  it("maps a request without a response to code NETWORK", async () => {
    const { http } = clientFor(() => {
      throw networkFailure();
    });

    const error = await http
      .getText(URL_LIVE)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      name: "ConnectorError",
      code: "NETWORK",
      retryable: true,
    });
    expect((error as Error).message).toBe(
      `GET ${URL_LIVE} failed: connect ECONNREFUSED 127.0.0.1:443 (ECONNREFUSED)`,
    );
    expect((error as Error).cause).toBeInstanceOf(TypeError);
  });

  it("describes a failure that isn't an Error", async () => {
    const { http } = clientFor(() => Promise.reject("socket hang up"));
    await expect(http.getText(URL_LIVE)).rejects.toThrow(
      `GET ${URL_LIVE} failed: socket hang up`,
    );
    const plain = clientFor(() => Promise.reject(new Error("boom")));
    await expect(plain.http.getText(URL_LIVE)).rejects.toThrow(
      `GET ${URL_LIVE} failed: boom`,
    );
  });

  it("times out after timeoutMs with phase request", async () => {
    const { http } = clientFor(never, { timeoutMs: 50 });

    await expect(http.getText(URL_LIVE)).rejects.toMatchObject({
      name: "TimeoutError",
      code: "TIMEOUT",
      phase: "request",
      retryable: true,
      message: `GET ${URL_LIVE} took longer than 50 ms`,
    });
  });

  it("times out while the body is still arriving", async () => {
    const { http } = clientFor(stalledBody, { timeoutMs: 50 });

    await expect(http.getJson(URL_LIVE)).rejects.toMatchObject({
      code: "TIMEOUT",
      phase: "request",
    });
  });

  it("aborts with the signal, before or during the request", async () => {
    const before = clientFor(ok);
    const reason = new Error("stop");
    await expect(
      before.http.getText(URL_LIVE, { signal: AbortSignal.abort(reason) }),
    ).rejects.toMatchObject({
      name: "AbortError",
      code: "ABORTED",
      cause: reason,
    });
    expect(before.fetch).not.toHaveBeenCalled();

    const during = clientFor(never);
    const controller = new AbortController();
    const pending = during.http.getText(URL_LIVE, {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: "ABORTED",
      message: `GET ${URL_LIVE} was aborted`,
    });
  });

  it("reports an abort rather than a timeout when both happened", async () => {
    const controller = new AbortController();
    const { http } = clientFor(
      (request) =>
        new Promise((_, reject) => {
          request.signal?.addEventListener("abort", () => {
            controller.abort();
            reject(request.signal?.reason);
          });
        }),
      { timeoutMs: 20 },
    );

    await expect(
      http.getText(URL_LIVE, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
  });
});

describe("HttpClient logs", () => {
  it("logs each request at debug, without cookies, session or query", async () => {
    const { http, logger } = clientFor(
      () => new Response("{}", { headers: { "set-cookie": "ttwid=abc" } }),
      { session: SESSION },
    );

    await http.getJson(URL_LIVE, { params: { uniqueId: "someone" } });

    expect(logger).toHaveBeenCalledWith(
      "debug",
      "HTTP GET www.tiktok.com/api-live/user/room/: 200",
      expect.objectContaining({
        method: "GET",
        url: "www.tiktok.com/api-live/user/room/",
        status: 200,
        ms: expect.any(Number),
      }),
    );
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).not.toContain("secret-session");
    expect(logged).not.toContain("ttwid");
    expect(logged).not.toContain("device_id");
  });

  it("logs a failure with its code and status", async () => {
    const { http, logger } = clientFor(() => new Response("", { status: 404 }));

    await http.getText(URL_LIVE).catch(() => undefined);

    expect(logger).toHaveBeenCalledWith(
      "debug",
      "HTTP GET www.tiktok.com/api-live/user/room/ failed: HTTP",
      expect.objectContaining({ status: 404, error: expect.any(Error) }),
    );
  });
});

describe("previewBody", () => {
  it("collapses whitespace and cuts long bodies", () => {
    expect(previewBody("  a \n\t b  ")).toBe("a b");
    expect(previewBody("y".repeat(250))).toBe(`${"y".repeat(200)}…`);
  });
});
