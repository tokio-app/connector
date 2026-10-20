import { describe, expect, it } from "vitest";
import { ProtocolError } from "../../src/errors.js";
import type { Fixture } from "../capture/fixture.js";
import type { Replay } from "../lib/replay.js";
import { compactJson, formatReplay, replayStatus } from "./summary.js";

// Synthetic results: made-up values, never data from a capture.

const fixture: Fixture = {
  version: 1,
  capturedAt: "2026-10-20T12:00:00.000Z",
  username: "someone",
  roomId: "7140000000000000001",
  durationMs: 61_234,
  counts: {},
  messages: [],
};

function result(overrides: Partial<Replay> = {}): Replay {
  return {
    counts: {},
    events: {},
    firsts: {},
    errors: [],
    streamEnds: [],
    unsafe: [],
    ...overrides,
  };
}

describe("formatReplay", () => {
  it("prints the capture, the messages by method, the events, the methods without an event and no errors", () => {
    const text = formatReplay(
      "live.json",
      fixture,
      result({
        counts: {
          WebcastMemberMessage: 1_200,
          WebcastChatMessage: 3,
          WebcastSomethingNew: 2,
          WebcastLikeMessage: 3,
        },
        events: { member: 1_200, chat: 3, like: 3 },
      }),
      { samples: false },
    );
    expect(text).toBe(
      [
        "live.json: 1,208 messages in 61.2 s, room 7140000000000000001, @someone, captured 2026-10-20T12:00:00.000Z",
        "",
        "Messages by method",
        "  WebcastMemberMessage  1,200",
        "  WebcastChatMessage        3",
        "  WebcastLikeMessage        3",
        "  WebcastSomethingNew       2",
        "",
        "Events",
        "  member  1,200",
        "  chat        3",
        "  like        3",
        "",
        "No event (raw only)",
        "  WebcastSomethingNew  2",
        "",
        "Decode errors: 0",
        "  none",
      ].join("\n"),
    );
  });

  it("lists each decode error with its method and message id, the unsafe counters, the stream end and the samples", () => {
    const anonymized: Fixture = {
      version: 1,
      capturedAt: fixture.capturedAt,
      roomId: fixture.roomId,
      durationMs: fixture.durationMs,
      counts: {},
      messages: [],
    };
    const text = formatReplay(
      "anon.json",
      anonymized,
      result({
        counts: { WebcastChatMessage: 2, WebcastControlMessage: 1 },
        events: { chat: 1, controlMessage: 1 },
        firsts: {
          chat: { content: "hi", bytes: Uint8Array.of(1, 2, 3) },
          controlMessage: { action: 3 },
        },
        errors: [
          {
            method: "WebcastChatMessage",
            msgId: "71",
            error: new ProtocolError("Dropped message 71: bad bytes"),
          },
        ],
        streamEnds: ["ended"],
        unsafe: ["WebcastLikeMessage.total"],
      }),
      { samples: true },
    );
    expect(text.split("\n")).toEqual([
      "anon.json: 3 messages in 61.2 s, room 7140000000000000001, anonymized, captured 2026-10-20T12:00:00.000Z",
      "",
      "Messages by method",
      "  WebcastChatMessage     2",
      "  WebcastControlMessage  1",
      "",
      "Events",
      "  chat            1",
      "  controlMessage  1",
      "",
      "No event (raw only)",
      "  none",
      "",
      "Decode errors: 1",
      "  WebcastChatMessage 71: Dropped message 71: bad bytes",
      "",
      "Counters past Number.MAX_SAFE_INTEGER",
      "  WebcastLikeMessage.total",
      "",
      "Stream ended: ended",
      "",
      "First payload of each event",
      '  chat  {"content":"hi","bytes":"<3 bytes>"}',
      '  controlMessage  {"action":3}',
    ]);
  });

  it("says when nothing was replayed", () => {
    expect(
      formatReplay("empty.json", fixture, result(), { samples: true }),
    ).toBe(
      [
        "empty.json: 0 messages in 61.2 s, room 7140000000000000001, @someone, captured 2026-10-20T12:00:00.000Z",
        "",
        "Messages by method",
        "  none",
        "",
        "Events",
        "  none",
        "",
        "No event (raw only)",
        "  none",
        "",
        "Decode errors: 0",
        "  none",
        "",
        "First payload of each event",
        "  none",
      ].join("\n"),
    );
  });
});

describe("compactJson", () => {
  it("writes one line, with byte fields as their length", () => {
    expect(
      compactJson({ a: [1, { b: new Uint8Array(0) }], c: "x", d: undefined }),
    ).toBe('{"a":[1,{"b":"<0 bytes>"}],"c":"x"}');
    expect(compactJson(undefined)).toBe("undefined");
  });
});

describe("replayStatus", () => {
  it("is 1 when a message failed to decode, else 0", () => {
    expect(replayStatus(result())).toBe(0);
    expect(
      replayStatus(
        result({
          errors: [
            {
              method: "WebcastChatMessage",
              msgId: "1",
              error: new ProtocolError("bad"),
            },
          ],
        }),
      ),
    ).toBe(1);
  });
});
