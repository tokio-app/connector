import { describe, expect, it } from "vitest";
import {
  DEFAULT_HTTP_HEADERS,
  DEFAULT_HTTP_PARAMS,
  DEFAULT_USER_AGENT,
  DEFAULT_WEBSOCKET_PARAMS,
  SESSION_COOKIE_NAMES,
  WEBSOCKET_URL_SUFFIX,
  httpHeaders,
  httpParams,
  mergeHeaders,
  userAgentOf,
  webSocketHeaders,
  webSocketParams,
} from "./params.js";

describe("defaults", () => {
  it("describe the same browser everywhere", () => {
    expect(DEFAULT_USER_AGENT).toContain("Macintosh");
    expect(`Mozilla/${DEFAULT_HTTP_PARAMS.browser_version}`).toBe(
      DEFAULT_USER_AGENT,
    );
    expect(DEFAULT_WEBSOCKET_PARAMS.browser_version).toBe(
      DEFAULT_HTTP_PARAMS.browser_version,
    );
    expect(DEFAULT_HTTP_HEADERS["User-Agent"]).toBe(DEFAULT_USER_AGENT);
  });

  it("use the web client's platform values", () => {
    expect(DEFAULT_HTTP_PARAMS.device_platform).toBe("web_pc");
    expect(DEFAULT_WEBSOCKET_PARAMS.device_platform).toBe("web");
    expect(DEFAULT_WEBSOCKET_PARAMS.version_code).toBe("180800");
    expect(WEBSOCKET_URL_SUFFIX).toBe("&version_code=270000");
  });

  it("are frozen", () => {
    expect(Object.isFrozen(DEFAULT_HTTP_PARAMS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_HTTP_HEADERS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_WEBSOCKET_PARAMS)).toBe(true);
    expect(SESSION_COOKIE_NAMES).toEqual([
      "sessionid",
      "sessionid_ss",
      "sid_tt",
      "sid_guard",
    ]);
  });
});

describe("mergeHeaders", () => {
  it("replaces headers whatever their letter case", () => {
    expect(
      mergeHeaders(
        { "User-Agent": "a", Accept: "x" },
        { "user-agent": "b", "X-New": "c" },
      ),
    ).toEqual({ Accept: "x", "user-agent": "b", "X-New": "c" });
  });

  it("copies the base without overrides", () => {
    const base = { A: "1" };
    const merged = mergeHeaders(base);
    expect(merged).toEqual(base);
    expect(merged).not.toBe(base);
  });
});

describe("userAgentOf", () => {
  it("finds the User-Agent in any letter case, or falls back to the default", () => {
    expect(userAgentOf({ "USER-AGENT": "custom" })).toBe("custom");
    expect(userAgentOf({ Accept: "x" })).toBe(DEFAULT_USER_AGENT);
  });
});

describe("httpParams", () => {
  it("adds the device id, then the overrides", () => {
    const params = httpParams("1234567890123456789", {
      aid: "9",
      extra: "1",
    });
    expect(params.device_id).toBe("1234567890123456789");
    expect(params.aid).toBe("9");
    expect(params.extra).toBe("1");
    expect(params.app_name).toBe("tiktok_web");
    expect(Object.keys(params)[0]).toBe("aid");
  });

  it("lets overrides replace the device id", () => {
    expect(httpParams("1", { device_id: "2" }).device_id).toBe("2");
  });
});

describe("httpHeaders", () => {
  it("applies the overrides to the defaults", () => {
    const headers = httpHeaders({ "accept-language": "de-DE" });
    expect(headers["accept-language"]).toBe("de-DE");
    expect(headers["Accept-Language"]).toBeUndefined();
    expect(headers.Referer).toBe("https://www.tiktok.com/");
    expect(httpHeaders()).toEqual(DEFAULT_HTTP_HEADERS);
  });
});

describe("webSocketParams", () => {
  it("adds last_rtt and the User-Agent after the defaults, then the overrides", () => {
    const params = webSocketParams("agent", { live_id: "13" });
    const keys = Object.keys(params);
    expect(keys.slice(-2)).toEqual(["last_rtt", "User-Agent"]);
    expect(Number(params.last_rtt)).toBeGreaterThanOrEqual(100);
    expect(params["User-Agent"]).toBe("agent");
    expect(params.live_id).toBe("13");
    expect(params.version_code).toBe("180800");
  });
});

describe("webSocketHeaders", () => {
  it("sends the User-Agent, or the override's", () => {
    expect(webSocketHeaders()).toEqual({ "User-Agent": DEFAULT_USER_AGENT });
    expect(webSocketHeaders({ "user-agent": "x" })).toEqual({
      "user-agent": "x",
    });
  });
});
