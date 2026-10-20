import { describe, expect, it } from "vitest";
import type { RawMessage } from "../../src/index.js";
import {
  buildFixture,
  countMethods,
  FIXTURE_VERSION,
  FixtureError,
  formatCaptureSummary,
  fromFixtureMessage,
  parseFixture,
  serializeFixture,
  toFixtureMessage,
  type Fixture,
  type FixtureMessage,
} from "./fixture.js";

function message(overrides: Partial<FixtureMessage> = {}): FixtureMessage {
  return {
    at: 120,
    method: "WebcastChatMessage",
    msgId: "7400000000000000001",
    isHistory: false,
    createTime: "1760870000000",
    payload: "CgNhYmM=",
    ...overrides,
  };
}

function fixture(messages = [message()], anonymize = false): Fixture {
  return buildFixture({
    capturedAt: new Date("2026-10-19T12:30:05.123Z"),
    username: "someone",
    roomId: "7140000000000000001",
    durationMs: 60_000.4,
    messages,
    anonymize,
  });
}

describe("toFixtureMessage", () => {
  it("copies only the raw message's fields, and only its payload view's bytes", () => {
    const frame = Uint8Array.from([9, 9, 1, 2, 3, 9]);
    const raw = {
      method: "WebcastGiftMessage",
      payload: frame.subarray(2, 5),
      msgId: "42",
      isHistory: true,
      createTime: "0",
      // Whatever else a raw message may carry stays out of the fixture.
      internalExt: "secret",
      cookies: ["sessionid=secret"],
    } satisfies RawMessage & Record<string, unknown>;

    expect(toFixtureMessage(raw, 1_000, 1_250.6)).toEqual({
      at: 251,
      method: "WebcastGiftMessage",
      msgId: "42",
      isHistory: true,
      createTime: "0",
      payload: Buffer.from([1, 2, 3]).toString("base64"),
    });
  });

  it("never goes below 0 ms", () => {
    const raw: RawMessage = {
      method: "m",
      payload: new Uint8Array(),
      msgId: "1",
      isHistory: false,
      createTime: "0",
    };
    expect(toFixtureMessage(raw, 1_000, 999).at).toBe(0);
  });
});

describe("fromFixtureMessage", () => {
  it("turns a fixture message back into a raw message", () => {
    const raw = fromFixtureMessage(message());
    expect(raw).toEqual({
      method: "WebcastChatMessage",
      payload: Uint8Array.from([0x0a, 0x03, 0x61, 0x62, 0x63]),
      msgId: "7400000000000000001",
      isHistory: false,
      createTime: "1760870000000",
    });
    expect(raw.payload.constructor).toBe(Uint8Array);
    expect(toFixtureMessage(raw, 0, 120)).toEqual(message());
  });
});

describe("countMethods", () => {
  it("counts by method, in alphabetical order", () => {
    const counts = countMethods([
      { method: "b" },
      { method: "a" },
      { method: "b" },
    ]);
    expect(Object.entries(counts)).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});

describe("buildFixture", () => {
  it("assembles the header and counts the messages", () => {
    expect(fixture()).toEqual({
      version: FIXTURE_VERSION,
      capturedAt: "2026-10-19T12:30:05.123Z",
      username: "someone",
      roomId: "7140000000000000001",
      durationMs: 60_000,
      counts: { WebcastChatMessage: 1 },
      messages: [message()],
    });
  });

  it("leaves the username out with anonymize", () => {
    const anonymous = buildFixture({
      capturedAt: new Date(0),
      username: "someone",
      roomId: "1",
      durationMs: 1,
      messages: [],
      anonymize: true,
    });
    expect("username" in anonymous).toBe(false);
    expect(serializeFixture(anonymous)).not.toContain("someone");
  });
});

describe("serializeFixture", () => {
  it("writes JSON with one message per line", () => {
    const value = fixture([message(), message({ msgId: "2", at: 130 })]);
    const text = serializeFixture(value);
    expect(JSON.parse(text)).toEqual(value);
    expect(text.endsWith("}\n")).toBe(true);
    const lines = text.split("\n");
    expect(lines).toContain(`    ${JSON.stringify(message())},`);
    expect(lines).toContain(
      `    ${JSON.stringify(message({ msgId: "2", at: 130 }))}`,
    );
  });

  it("writes an empty capture too", () => {
    const value = fixture([]);
    expect(JSON.parse(serializeFixture(value))).toEqual(value);
  });
});

describe("parseFixture", () => {
  it("accepts what serializeFixture writes, as text or as a value", () => {
    const value = fixture([
      message(),
      message({ method: "WebcastLikeMessage" }),
    ]);
    expect(parseFixture(serializeFixture(value))).toEqual(value);
    expect(parseFixture(JSON.parse(JSON.stringify(value)))).toEqual(value);
  });

  it("accepts a fixture without a username", () => {
    const { username, ...anonymous } = fixture();
    expect(username).toBe("someone");
    expect(parseFixture(anonymous)).toEqual(anonymous);
  });

  function broken(change: (value: Record<string, unknown>) => void): unknown {
    const value: Record<string, unknown> = JSON.parse(
      serializeFixture(fixture()),
    ) as Record<string, unknown>;
    change(value);
    return value;
  }

  function firstMessage(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return (value.messages as Record<string, unknown>[])[0]!;
  }

  it.each<[string, unknown, string]>([
    ["text that isn't JSON", "{", "Invalid fixture: not JSON"],
    ["an array", [], "the fixture must be an object, got []"],
    [
      "another version",
      broken((value) => (value.version = 2)),
      "Unsupported fixture version 2: this reader knows version 1",
    ],
    [
      "an unknown key",
      broken((value) => (value.internalExt = "secret")),
      'the fixture has an unexpected key "internalExt"',
    ],
    [
      "a bad date",
      broken((value) => (value.capturedAt = "yesterday")),
      'capturedAt must be an ISO 8601 date, got "yesterday"',
    ],
    [
      "a numeric username",
      broken((value) => (value.username = 5)),
      "username must be a string, got 5",
    ],
    [
      "no room id",
      broken((value) => delete value.roomId),
      "roomId must be a decimal string, got nothing",
    ],
    [
      "a negative duration",
      broken((value) => (value.durationMs = -1)),
      "durationMs must be a number of milliseconds of at least 0, got -1",
    ],
    [
      "no messages",
      broken((value) => delete value.messages),
      "messages must be an array, got nothing",
    ],
    [
      "a message that isn't an object",
      broken((value) => (value.messages = ["x"])),
      'messages[0] must be an object, got "x"',
    ],
    [
      "a message with an unknown key",
      broken((value) => (firstMessage(value).cookies = "sessionid=1")),
      'messages[0] has an unexpected key "cookies"',
    ],
    [
      "a payload that isn't base64",
      broken((value) => (firstMessage(value).payload = "not base64!")),
      'messages[0].payload must be a base64 string, got "not base64!"',
    ],
    [
      "a msgId that isn't decimal",
      broken((value) => (firstMessage(value).msgId = "0x1")),
      'messages[0].msgId must be a decimal string, got "0x1"',
    ],
    [
      "an empty method",
      broken((value) => (firstMessage(value).method = "")),
      'messages[0].method must be a method name, got ""',
    ],
    [
      "a missing isHistory",
      broken((value) => delete firstMessage(value).isHistory),
      "messages[0].isHistory must be a boolean, got nothing",
    ],
    [
      "a negative time",
      broken((value) => (firstMessage(value).at = -5)),
      "messages[0].at must be a number of milliseconds of at least 0, got -5",
    ],
    [
      "counts that aren't an object",
      broken((value) => (value.counts = null)),
      "counts must be an object, got null",
    ],
    [
      "a fractional count",
      broken((value) => (value.counts = { WebcastChatMessage: 0.5 })),
      "counts.WebcastChatMessage must be a whole number of at least 0, got 0.5",
    ],
    [
      "a count that doesn't match",
      broken((value) => (value.counts = { WebcastChatMessage: 2 })),
      "counts.WebcastChatMessage is 2, but the messages hold 1",
    ],
    [
      "a count of a method no message has",
      broken(
        (value) =>
          (value.counts = { WebcastChatMessage: 1, WebcastGiftMessage: 1 }),
      ),
      "counts.WebcastGiftMessage is 1, but the messages hold 0",
    ],
    [
      "a method missing from the counts",
      broken((value) => (value.counts = {})),
      "counts.WebcastChatMessage is 0, but the messages hold 1",
    ],
  ])("refuses %s", (_, value, message) => {
    expect(() => parseFixture(value)).toThrow(FixtureError);
    expect(() => parseFixture(value)).toThrow(message);
  });

  it("drops nothing it accepts and keeps no extra key", () => {
    const parsed = parseFixture(serializeFixture(fixture()));
    expect(Object.keys(parsed)).toEqual([
      "version",
      "capturedAt",
      "username",
      "roomId",
      "durationMs",
      "counts",
      "messages",
    ]);
    expect(Object.keys(parsed.messages[0]!)).toEqual([
      "at",
      "method",
      "msgId",
      "isHistory",
      "createTime",
      "payload",
    ]);
  });
});

describe("formatCaptureSummary", () => {
  it("says what was written, with the methods by count", () => {
    const value = fixture([
      message({ method: "WebcastLikeMessage" }),
      message(),
      message({ method: "WebcastLikeMessage" }),
    ]);
    expect(formatCaptureSummary(value, "captures/x.json", 2_048)).toBe(
      [
        "Wrote captures/x.json (2.0 KB)",
        "  3 messages in 60.0 s, room 7140000000000000001, @someone",
        "",
        "  WebcastLikeMessage  2",
        "  WebcastChatMessage  1",
      ].join("\n"),
    );
  });

  it("says when the capture is anonymized", () => {
    expect(
      formatCaptureSummary(fixture([message()], true), "x.json", 10),
    ).toContain("room 7140000000000000001, anonymized");
  });
});
