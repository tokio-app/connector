import { describe, expect, it } from "vitest";
import {
  mergeCookies,
  parseSetCookie,
  parseSignerCookies,
  serializeCookies,
  sessionCookies,
  splitSetCookieHeader,
} from "./cookies.js";

describe("sessionCookies", () => {
  it("sets every session cookie to the id, and tt-target-idc", () => {
    expect(
      sessionCookies({ sessionId: "abc123", ttTargetIdc: "alisg" }),
    ).toEqual({
      sessionid: "abc123",
      sessionid_ss: "abc123",
      sid_tt: "abc123",
      sid_guard: "abc123",
      "tt-target-idc": "alisg",
    });
  });
});

describe("parseSetCookie", () => {
  it("reads the name and value before the attributes", () => {
    expect(
      parseSetCookie("ttwid=1%7Cabc; Path=/; Domain=.tiktok.com; HttpOnly"),
    ).toEqual(["ttwid", "1%7Cabc"]);
    expect(parseSetCookie("a=1")).toEqual(["a", "1"]);
  });

  it("splits at the first = and trims", () => {
    expect(parseSetCookie(" token = ab+c/d== ; Secure")).toEqual([
      "token",
      "ab+c/d==",
    ]);
    expect(parseSetCookie("empty=")).toEqual(["empty", ""]);
  });

  it("refuses a line without a usable name", () => {
    expect(parseSetCookie("")).toBe(null);
    expect(parseSetCookie("HttpOnly")).toBe(null);
    expect(parseSetCookie("=value")).toBe(null);
    expect(parseSetCookie("two words=1")).toBe(null);
    expect(parseSetCookie("a,b=1")).toBe(null);
  });
});

describe("splitSetCookieHeader", () => {
  it("splits lines joined by commas, but not an Expires date", () => {
    expect(
      splitSetCookieHeader(
        "a=1; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT, b=2; Secure,c=3",
      ),
    ).toEqual([
      "a=1; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
      "b=2; Secure",
      "c=3",
    ]);
  });

  it("gives nothing for an empty header", () => {
    expect(splitSetCookieHeader("")).toEqual([]);
    expect(splitSetCookieHeader(" , ")).toEqual([","]);
  });
});

describe("parseSignerCookies", () => {
  it("reads one cookie", () => {
    expect(parseSignerCookies("ttwid=1%7Cabc%7C123")).toEqual([
      "ttwid=1%7Cabc%7C123",
    ]);
  });

  it("keeps every pair of a Cookie-style list", () => {
    expect(
      parseSignerCookies("ttwid=1; msToken=ab+c/d==;tt_chain_token=x "),
    ).toEqual(["ttwid=1", "msToken=ab+c/d==", "tt_chain_token=x"]);
  });

  it("drops Set-Cookie attributes and flags, in any letter case", () => {
    expect(
      parseSignerCookies(
        "a=1; Path=/; Domain=.tiktok.com; Max-Age=3600; HttpOnly; Secure; SameSite=None; Priority=High; Partitioned; expires=Wed, 21 Oct 2026 07:28:00 GMT; PATH=/x",
      ),
    ).toEqual(["a=1"]);
  });

  it("reads Set-Cookie lines joined by commas", () => {
    expect(
      parseSignerCookies(
        "a=1; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT, b=2; Secure, c=",
      ),
    ).toEqual(["a=1", "b=2", "c="]);
  });

  it("gives nothing for a header without pairs", () => {
    expect(parseSignerCookies("")).toEqual([]);
    expect(parseSignerCookies(" ; ; HttpOnly; =x; Path=/")).toEqual([]);
  });
});

describe("mergeCookies", () => {
  it("lets a later jar win and keeps each cookie's first place", () => {
    const merged = mergeCookies({ a: "1", b: "2" }, {}, { c: "3", a: "4" });
    expect(merged).toEqual({ a: "4", b: "2", c: "3" });
    expect(Object.keys(merged)).toEqual(["a", "b", "c"]);
  });

  it("keeps a cookie named __proto__ as a plain cookie", () => {
    const merged = mergeCookies(JSON.parse('{"__proto__":"x"}'), { a: "1" });
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(Object.entries(merged)).toEqual([
      ["__proto__", "x"],
      ["a", "1"],
    ]);
  });
});

describe("serializeCookies", () => {
  it("joins name=value pairs with '; '", () => {
    expect(serializeCookies({ a: "1", "tt-target-idc": "useast1a" })).toBe(
      "a=1; tt-target-idc=useast1a",
    );
    expect(serializeCookies({})).toBe("");
  });

  it("sends values as they were set", () => {
    expect(
      serializeCookies({ ttwid: "1%7Cabc", msToken: "ab+c/d==", q: '"x"' }),
    ).toBe('ttwid=1%7Cabc; msToken=ab+c/d==; q="x"');
  });

  it("percent-encodes what a cookie can't hold", () => {
    expect(
      serializeCookies({ "a b": "x y;z,w\\é\n", "ok!": "\u{1F600}" }),
    ).toBe("a%20b=x%20y%3Bz%2Cw%5C%C3%A9%0A; ok!=%F0%9F%98%80");
  });
});
