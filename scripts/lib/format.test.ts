import { describe, expect, it } from "vitest";
import {
  ConnectorError,
  RateLimitError,
  RoomNotFoundError,
  WebSocketError,
} from "../../src/index.js";
import {
  describeConnected,
  describeDisconnected,
  describeError,
  describeReconnecting,
  describeStreamEnd,
  errorInfo,
  formatBytes,
  formatCount,
  formatRows,
  formatSeconds,
  labeled,
  nickname,
  quote,
  shortError,
  stamp,
} from "./format.js";

describe("errorInfo", () => {
  it("keeps a ConnectorError's code, retryable and fields", () => {
    const error = new RateLimitError("Too many requests", {
      retryAfterMs: 5_000,
      requestId: "req-1",
    });
    expect(errorInfo(error)).toEqual({
      name: "RateLimitError",
      message: "Too many requests",
      code: "RATE_LIMITED",
      retryable: true,
      details: { status: 429, requestId: "req-1", retryAfterMs: 5_000 },
    });
  });

  it("follows causes, arrays of causes and AggregateErrors", () => {
    const steps = [new Error("page"), new Error("api")];
    const error = new RoomNotFoundError("No room", {
      cause: new AggregateError(steps, "every step failed"),
    });
    expect(errorInfo(error).causes).toEqual([
      {
        name: "AggregateError",
        message: "every step failed",
        causes: [
          { name: "Error", message: "page" },
          { name: "Error", message: "api" },
        ],
      },
    ]);
    expect(errorInfo(new Error("both", { cause: ["one", 2] })).causes).toEqual([
      { name: "string", message: "one" },
      { name: "number", message: "2" },
    ]);
  });

  it("keeps a system error's code as a detail", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
      port: 443,
      nested: { not: "kept" },
    });
    expect(errorInfo(error)).toEqual({
      name: "Error",
      message: "connect ECONNREFUSED",
      details: { code: "ECONNREFUSED", port: 443 },
    });
  });

  it("stops three causes deep", () => {
    let error = new Error("0");
    for (let level = 1; level <= 5; level++) {
      error = new Error(String(level), { cause: error });
    }
    let info = errorInfo(error);
    let depth = 0;
    while (info.causes?.[0]) {
      info = info.causes[0];
      depth++;
    }
    expect(depth).toBe(3);
  });

  it("describes values that aren't errors", () => {
    expect(errorInfo("boom")).toEqual({ name: "string", message: "boom" });
    expect(errorInfo(undefined)).toEqual({
      name: "undefined",
      message: "undefined",
    });
  });
});

describe("describeError", () => {
  it("prints the class, code, fields and causes", () => {
    const error = new WebSocketError("The socket closed", {
      closeCode: 1006,
      cause: new Error("socket hang up"),
    });
    expect(describeError(error)).toBe(
      "WebSocketError (WEBSOCKET, retryable, closeCode 1006): The socket closed\n" +
        "  caused by Error: socket hang up",
    );
  });

  it("indents nested causes", () => {
    const error = new ConnectorError("INTERNAL", "outer", {
      cause: new Error("middle", { cause: new Error("inner") }),
    });
    expect(describeError(error)).toBe(
      "ConnectorError (INTERNAL, not retryable): outer\n" +
        "  caused by Error: middle\n" +
        "    caused by Error: inner",
    );
  });

  it("prints a plain error and a thrown string", () => {
    expect(describeError(new TypeError("bad"))).toBe("TypeError: bad");
    expect(describeError("bad")).toBe("string: bad");
  });
});

describe("shortError", () => {
  it("prefers the code over the class name", () => {
    expect(
      shortError({ name: "OfflineError", code: "OFFLINE", message: "x" }),
    ).toBe("OFFLINE: x");
    expect(shortError({ name: "TypeError", message: "x" })).toBe(
      "TypeError: x",
    );
  });
});

describe("numbers and times", () => {
  it("formats them", () => {
    expect(formatSeconds(1_234)).toBe("1.2 s");
    expect(stamp(0)).toBe("   0.0s");
    expect(stamp(123_456)).toBe(" 123.5s");
    expect(formatCount(1_234_567)).toBe("1,234,567");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1_536)).toBe("1.5 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("nickname and quote", () => {
  it("prints a trimmed nickname, or says there is none", () => {
    expect(nickname({ nickname: "  Ana " })).toBe("Ana");
    expect(nickname({ nickname: "   " })).toBe("(no nickname)");
    expect(nickname(undefined)).toBe("(no nickname)");
  });

  it("quotes a comment on one line, cut past the limit", () => {
    expect(quote("hello\n  there")).toBe('"hello there"');
    expect(quote("x".repeat(80))).toBe(`"${"x".repeat(59)}…"`);
    expect(quote("abcdef", 4)).toBe('"abc…"');
    expect(quote("abcd", 4)).toBe('"abcd"');
  });
});

describe("formatRows", () => {
  it("aligns names, right-aligns numbers and adds notes", () => {
    expect(
      formatRows([
        ["chat", 1_200],
        ["roomUser", 7, "note"],
        ["gift", "text"],
      ]),
    ).toEqual([
      "  chat      1,200",
      "  roomUser      7  note",
      "  gift      text",
    ]);
  });

  it("handles no rows", () => {
    expect(formatRows([])).toEqual([]);
  });
});

describe("transitions", () => {
  it("describes each connection event on one line", () => {
    expect(
      describeConnected({ roomId: "7", attempt: 0, reconnected: false }),
    ).toBe(labeled("connected", "room 7, attempt 0, reconnected no"));
    expect(
      describeReconnecting({ attempt: 2, delayMs: 830, reason: "wsClose" }),
    ).toBe(labeled("reconnecting", "attempt 2 in 830 ms (after wsClose)"));
    expect(
      describeDisconnected({
        reason: "wsError",
        willReconnect: true,
        error: new WebSocketError("reset"),
      }),
    ).toBe(
      labeled("disconnected", "wsError (WEBSOCKET: reset), will reconnect"),
    );
    expect(describeDisconnected({ reason: "user", willReconnect: false })).toBe(
      labeled("disconnected", "user, stopped"),
    );
    expect(describeStreamEnd({ action: "suspended" })).toBe(
      labeled("stream ended", "suspended"),
    );
  });

  it("pads labels to one column", () => {
    expect(labeled("a", "b")).toBe(`a${" ".repeat(18)}b`);
    expect(labeled("first superFanJoin", "x")).toBe("first superFanJoin x");
  });
});
