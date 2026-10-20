import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ConnectorError,
  RateLimitError,
  ReconnectGiveUpError,
  WebSocketError,
  type ChatMessage,
  type GiftMessage,
  type RoomUserMessage,
  type User,
  type WebcastEventMap,
} from "../../src/index.js";
import { labeled } from "../lib/format.js";
import {
  formatSummary,
  RECONNECT_BOUND_MS,
  SMOKE_EVENTS,
  SmokeRecorder,
  type SmokeEvent,
} from "./summary.js";

function user(nickname: string): User {
  return { userId: "1", nickname, displayId: "handle", badgeList: [] };
}

function chat(content: string, nickname = "Ana"): ChatMessage {
  return {
    user: user(nickname),
    content,
    contentLanguage: "",
    emotes: [],
    commentTag: [],
    mentionUsers: [],
  };
}

function gift(overrides: Partial<GiftMessage> = {}): GiftMessage {
  return {
    user: user("Ben"),
    giftId: "5655",
    repeatCount: 3,
    repeatEnd: false,
    comboCount: 3,
    groupId: "1",
    gift: {
      id: "5655",
      name: "Rose",
      diamondCount: 1,
      type: 1,
      describe: "",
      combo: false,
    },
    isFirstSent: false,
    toMemberId: "",
    toMemberNickname: "",
    ...overrides,
  };
}

function roomUser(total: number): RoomUserMessage {
  return {
    total,
    totalUser: 4_500,
    ranks: [{ user: user("Cy"), score: 10, rank: 1 }],
  };
}

function raw(method: string): WebcastEventMap["raw"] {
  return {
    method,
    payload: new Uint8Array(),
    msgId: "1",
    isHistory: false,
    createTime: "0",
  };
}

const first = { roomId: "7140", attempt: 0, reconnected: false };
const again = { roomId: "7140", attempt: 1, reconnected: true };

describe("SMOKE_EVENTS", () => {
  it("lists every event of WebcastEventMap once", () => {
    expectTypeOf<Exclude<keyof WebcastEventMap, SmokeEvent>>().toBeNever();
    expect(new Set(SMOKE_EVENTS).size).toBe(SMOKE_EVENTS.length);
  });
});

describe("SmokeRecorder", () => {
  it("passes a run that connected and saw LIVE events", () => {
    const recorder = new SmokeRecorder({ username: "someone" });
    expect(recorder.record("connected", first, 1_000)).toBe(
      labeled("connected", "room 7140, attempt 0, reconnected no"),
    );
    recorder.record("roomUser", roomUser(120), 1_200);
    recorder.record("raw", raw("WebcastRoomUserSeqMessage"), 1_200);
    recorder.record(
      "disconnected",
      { reason: "user", willReconnect: false },
      31_000,
    );

    const summary = recorder.summarize(31_000, { interrupted: false });
    expect(summary).toMatchObject({
      ok: true,
      reasons: [],
      username: "someone",
      roomId: "7140",
      durationMs: 31_000,
      connected: true,
      reconnects: 0,
      liveEvents: 1,
      stoppedBy: { reason: "user" },
    });
    expect(summary.events).toEqual(
      Object.fromEntries(
        SMOKE_EVENTS.map((event) => [
          event,
          ["connected", "roomUser", "raw", "disconnected"].includes(event)
            ? 1
            : 0,
        ]),
      ),
    );
    expect(summary.drop).toBeUndefined();
    expect(summary.gifts).toBeUndefined();
    // --json prints it as is.
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });

  it("prints the first of each LIVE event, nicknames only", () => {
    const recorder = new SmokeRecorder({ username: "someone" });
    expect(recorder.record("chat", chat("hello\n  there"), 1)).toBe(
      labeled("first chat", 'Ana: "hello there"'),
    );
    expect(recorder.record("chat", chat("again"), 2)).toBeUndefined();
    expect(recorder.record("gift", gift(), 3)).toBe(
      labeled("first gift", "Ben sent Rose x3, streak"),
    );
    expect(
      recorder.record("like", { user: user("Di"), count: 15, total: 1_234 }, 4),
    ).toBe(labeled("first like", "Di liked x15, 1,234 in total"));
    const social = {
      shareType: 0,
      action: 1,
      shareTarget: "",
      followCount: 0,
      shareCount: 0,
      followType: 0,
      targetUserId: "0",
    };
    expect(recorder.record("follow", { ...social, user: user("Ed") }, 5)).toBe(
      labeled("first follow", "Ed followed"),
    );
    expect(recorder.record("share", { ...social, user: user("Flo") }, 6)).toBe(
      labeled("first share", "Flo shared"),
    );
    expect(
      recorder.record(
        "member",
        {
          user: user("Gus"),
          memberCount: 0,
          isSetToAdmin: false,
          isTopUser: false,
          topUserNo: 0,
          actionId: 1,
          userShareType: "",
          kickSource: 0,
        },
        7,
      ),
    ).toBe(labeled("first member", "Gus joined"));
    expect(recorder.record("roomUser", roomUser(1_500), 8)).toBe(
      labeled("first roomUser", "1,500 watching, 4,500 so far, top viewer Cy"),
    );
    expect(
      recorder.record(
        "envelope",
        {
          envelopeInfo: {
            envelopeId: "1",
            businessType: 1,
            sendUserName: "",
            diamondCount: 0,
            peopleCount: 0,
            unpackAt: 0,
            sendUserId: "",
            superFanCount: 0,
          },
        },
        9,
      ),
    ).toBe(labeled("first envelope", "treasure chest, business type 1"));
    expect(
      recorder.record(
        "superFan",
        {
          user: user("Hal"),
          msgType: 0,
          content: { key: "ttlive_superfan_x", defaultPattern: "" },
        },
        10,
      ),
    ).toBe(labeled("first superFan", "Hal (ttlive_superfan_x)"));
    expect(recorder.record("superFanJoin", { msgType: 0 }, 11)).toBe(
      labeled("first superFanJoin", "(no nickname) (no key)"),
    );
    expect(recorder.record("superFanBox", {}, 12)).toBe(
      labeled("first superFanBox", "super fan box, business type unknown"),
    );
    expect(
      recorder.record("raw", raw("WebcastChatMessage"), 13),
    ).toBeUndefined();

    const { samples } = recorder.summarize(14, { interrupted: false });
    expect(Object.keys(samples)).toEqual([
      "chat",
      "gift",
      "like",
      "follow",
      "share",
      "member",
      "roomUser",
      "envelope",
      "superFan",
      "superFanJoin",
      "superFanBox",
    ]);
    expect(samples.chat).toBe('Ana: "hello there"');
  });

  it("describes gifts, members and long comments", () => {
    const line = (event: "gift" | "member" | "chat", payload: object) => {
      const recorder = new SmokeRecorder({ username: "someone" });
      return recorder.record(event, payload as never, 0);
    };
    expect(line("gift", gift({ repeatEnd: true }))).toContain(
      "Rose x3, streak end",
    );
    expect(
      line(
        "gift",
        gift({
          gift: {
            id: "1",
            name: "",
            diamondCount: 99,
            type: 2,
            describe: "",
            combo: false,
          },
        }),
      ),
    ).toContain("Ben sent gift 5655 x3");
    expect(line("member", { user: user("Ivy"), actionId: 3 })).toContain(
      "Ivy subscribed",
    );
    expect(line("member", { user: user("Ivy"), actionId: 9 })).toContain(
      "Ivy (action 9)",
    );
    expect(line("chat", chat("x".repeat(80)))).toContain(
      `"${"x".repeat(59)}…"`,
    );
  });

  it("counts raw methods and flags the ones no event covers", () => {
    const recorder = new SmokeRecorder({ username: "someone" });
    recorder.record("connected", first, 0);
    for (const method of [
      "WebcastMemberMessage",
      "WebcastNoSuchMessage",
      "WebcastMemberMessage",
      "WebcastOtherUnknownMessage",
      "WebcastNoSuchMessage",
      "WebcastMemberMessage",
    ]) {
      recorder.record("raw", raw(method), 1);
    }
    const summary = recorder.summarize(2, { interrupted: false });
    expect(Object.entries(summary.rawMethods)).toEqual([
      ["WebcastMemberMessage", 3],
      ["WebcastNoSuchMessage", 2],
      ["WebcastOtherUnknownMessage", 1],
    ]);
    expect(summary.unroutedMethods).toEqual([
      "WebcastNoSuchMessage",
      "WebcastOtherUnknownMessage",
    ]);
    // Raw messages alone aren't LIVE events.
    expect(summary.ok).toBe(false);
    expect(summary.reasons).toEqual([
      "no LIVE event in 0.0 s: is @someone LIVE, with viewers?",
    ]);
  });

  it("fails on error events, printing the first few", () => {
    const recorder = new SmokeRecorder({ username: "someone" });
    recorder.record("connected", first, 0);
    recorder.record("chat", chat("hi"), 1);
    const lines = Array.from({ length: 8 }, (_, index) =>
      recorder.record(
        "error",
        new ConnectorError("PROTOCOL", `bad ${index}`),
        2,
      ),
    );
    expect(lines.slice(0, 5).every((line) => line?.includes("PROTOCOL"))).toBe(
      true,
    );
    expect(lines[5]).toBe(
      labeled("error", "more errors: counted, not printed"),
    );
    expect(lines.slice(6)).toEqual([undefined, undefined]);

    const summary = recorder.summarize(3, { interrupted: false });
    expect(summary.errors).toHaveLength(8);
    expect(summary.reasons).toEqual([
      "8 error events (first: PROTOCOL: bad 0)",
    ]);
  });

  it("fails when connect() rejects", () => {
    const recorder = new SmokeRecorder({ username: "someone", gifts: true });
    const error = new ConnectorError("OFFLINE", "someone isn't LIVE");
    expect(recorder.connectFailed(error)).toBe(
      labeled(
        "connect failed",
        "ConnectorError (OFFLINE, not retryable): someone isn't LIVE",
      ),
    );
    const summary = recorder.summarize(500, { interrupted: false });
    expect(summary.ok).toBe(false);
    expect(summary.connected).toBe(false);
    expect(summary.roomId).toBeNull();
    // Only the connect failure: the gift list never had a chance.
    expect(summary.reasons).toEqual([
      "connect() failed: OFFLINE: someone isn't LIVE",
    ]);
  });

  it("fails when interrupted before connecting, or never connected", () => {
    const interrupted = new SmokeRecorder({ username: "someone" });
    interrupted.connectFailed(new ConnectorError("ABORTED", "aborted"));
    expect(interrupted.summarize(1, { interrupted: true }).reasons).toEqual([
      "interrupted before connecting",
    ]);
    const never = new SmokeRecorder({ username: "someone" });
    expect(never.summarize(1, { interrupted: false }).reasons).toEqual([
      "never connected",
    ]);
  });

  it("fails when the connection stops on its own, but not when the LIVE ends", () => {
    const gaveUp = new SmokeRecorder({ username: "someone" });
    gaveUp.record("connected", first, 0);
    gaveUp.record("chat", chat("hi"), 1);
    gaveUp.record(
      "disconnected",
      {
        reason: "giveUp",
        willReconnect: false,
        error: new ReconnectGiveUpError("Gave up", { attempts: 10 }),
      },
      2,
    );
    expect(gaveUp.stopped).toBe(true);
    expect(gaveUp.summarize(3, { interrupted: false }).reasons).toEqual([
      "the connection stopped: giveUp (RECONNECT_GAVE_UP: Gave up)",
    ]);

    const ended = new SmokeRecorder({ username: "someone" });
    ended.record("connected", first, 0);
    expect(ended.record("streamEnd", { action: "ended" }, 1)).toBe(
      labeled("stream ended", "ended"),
    );
    ended.record(
      "disconnected",
      { reason: "streamEnd", willReconnect: false },
      1,
    );
    const summary = ended.summarize(2, { interrupted: false });
    expect(summary.ok).toBe(true);
    expect(summary.transitions.map((transition) => transition.event)).toEqual([
      "connected",
      "streamEnd",
      "disconnected",
    ]);
  });

  it("reports a failed disconnect()", () => {
    const recorder = new SmokeRecorder({ username: "someone" });
    recorder.record("connected", first, 0);
    recorder.record("chat", chat("hi"), 1);
    recorder.disconnectFailed(new ConnectorError("INTERNAL", "stuck"));
    expect(recorder.summarize(2, { interrupted: false }).reasons).toEqual([
      "disconnect() failed: INTERNAL: stuck",
    ]);
  });

  describe("with --gifts", () => {
    it("reports the source, count and three names", () => {
      const recorder = new SmokeRecorder({ username: "someone", gifts: true });
      recorder.record("connected", first, 0);
      recorder.record("chat", chat("hi"), 1);
      const gifts = ["Rose", "TikTok", "Finger Heart", "Perfume"].map(
        (name, index) => ({ id: String(index), name, diamondCount: 1 }),
      );
      expect(recorder.giftsFetched({ gifts, source: "room" })).toBe(
        labeled("gifts", "room: 4 gifts (Rose, TikTok, Finger Heart)"),
      );
      const summary = recorder.summarize(2, { interrupted: false });
      expect(summary.ok).toBe(true);
      expect(summary.gifts).toEqual({
        status: "fetched",
        source: "room",
        count: 4,
        sample: ["Rose", "TikTok", "Finger Heart"],
      });
    });

    it("fails when fetchGifts() rejects or doesn't finish", () => {
      const failed = new SmokeRecorder({ username: "someone", gifts: true });
      failed.record("connected", first, 0);
      failed.record("chat", chat("hi"), 1);
      failed.giftsFailed(new ConnectorError("GIFTS_UNAVAILABLE", "No source"));
      expect(failed.summarize(2, { interrupted: false }).reasons).toEqual([
        "fetchGifts() failed: GIFTS_UNAVAILABLE: No source",
      ]);

      const pending = new SmokeRecorder({ username: "someone", gifts: true });
      pending.record("connected", first, 0);
      pending.record("chat", chat("hi"), 1);
      expect(pending.summarize(2, { interrupted: false }).reasons).toEqual([
        "fetchGifts() didn't finish",
      ]);
    });
  });

  describe("with --drop-after", () => {
    function droppedRun() {
      const recorder = new SmokeRecorder({
        username: "someone",
        dropAfterMs: 10_000,
      });
      recorder.record("connected", first, 1_000);
      recorder.record("chat", chat("hi"), 2_000);
      expect(recorder.awaitingReconnect).toBe(false);
      expect(recorder.reconnectDeadline).toBeUndefined();
      expect(recorder.dropped(11_000)).toContain("--drop-after 10");
      expect(recorder.awaitingReconnect).toBe(true);
      expect(recorder.reconnectDeadline).toBe(11_000 + RECONNECT_BOUND_MS);
      return recorder;
    }

    it("passes on reconnecting, then connected again", () => {
      const recorder = droppedRun();
      recorder.record(
        "disconnected",
        {
          reason: "wsClose",
          willReconnect: true,
          error: new WebSocketError("closed", { closeCode: 1006 }),
        },
        11_001,
      );
      recorder.record(
        "reconnecting",
        { attempt: 1, delayMs: 532, reason: "wsClose" },
        11_002,
      );
      expect(recorder.dropSettled).toBe(false);
      recorder.record("connected", again, 12_500);
      expect(recorder.dropSettled).toBe(true);
      expect(recorder.reconnectTimedOut()).toBeUndefined();

      const summary = recorder.summarize(31_000, { interrupted: false });
      expect(summary.ok).toBe(true);
      expect(summary.reconnects).toBe(1);
      expect(summary.drop).toEqual({
        afterMs: 10_000,
        status: "passed",
        droppedAt: 11_000,
        reconnectMs: 1_500,
      });
      expect(summary.transitions.map((transition) => transition.event)).toEqual(
        ["connected", "drop", "disconnected", "reconnecting", "connected"],
      );
      expect(summary.transitions[2]).toMatchObject({
        error: { code: "WEBSOCKET", details: { closeCode: 1006 } },
      });
    });

    it("fails when it connects again without a reconnecting event", () => {
      const recorder = droppedRun();
      recorder.record("connected", again, 12_000);
      expect(
        recorder.summarize(31_000, { interrupted: false }).reasons,
      ).toEqual([
        "reconnect check failed: connected again without a reconnecting event",
      ]);
    });

    it("fails when the reconnect comes too late", () => {
      const recorder = droppedRun();
      recorder.record(
        "reconnecting",
        { attempt: 1, delayMs: 1, reason: "idle" },
        11_001,
      );
      recorder.record("connected", again, 11_000 + 45_000);
      expect(
        recorder.summarize(60_000, { interrupted: false }).reasons,
      ).toEqual([
        "reconnect check failed: reconnected 45.0 s after the drop, more than 30.0 s",
      ]);
    });

    it("says when a rate limit is why the reconnect is late", () => {
      const recorder = droppedRun();
      recorder.record(
        "reconnecting",
        { attempt: 1, delayMs: 1_000, reason: "wsClose" },
        11_001,
      );
      expect(recorder.waitingForReconnect()).toBe("waiting for the reconnect");
      recorder.record(
        "error",
        new RateLimitError("slow down", { retryAfterMs: 20_000 }),
        12_000,
      );
      recorder.record(
        "reconnecting",
        { attempt: 2, delayMs: 20_000, reason: "signError" },
        12_001,
      );
      expect(recorder.waitingForReconnect()).toBe(
        "waiting for the reconnect (rate limited: the signer asked to wait 20.0 s)",
      );
      expect(recorder.reconnectTimedOut()).toBe(
        labeled(
          "reconnect check",
          "failed: no reconnect within 30.0 s of the drop (rate limited: the signer asked to wait 20.0 s)",
        ),
      );
    });

    it("fails when the deadline passes", () => {
      const recorder = droppedRun();
      recorder.record(
        "reconnecting",
        { attempt: 1, delayMs: 1, reason: "idle" },
        11_001,
      );
      expect(recorder.reconnectTimedOut()).toBe(
        labeled(
          "reconnect check",
          "failed: no reconnect within 30.0 s of the drop",
        ),
      );
      expect(recorder.dropSettled).toBe(true);
      // A late reconnect doesn't turn it around.
      recorder.record("connected", again, 50_000);
      expect(
        recorder.summarize(60_000, { interrupted: false }).drop?.status,
      ).toBe("failed");
    });

    it("fails when the connection stops instead of reconnecting", () => {
      const recorder = droppedRun();
      recorder.record(
        "disconnected",
        { reason: "signError", willReconnect: false },
        11_500,
      );
      expect(
        recorder.summarize(12_000, { interrupted: false }).reasons,
      ).toEqual([
        "the connection stopped: signError",
        "reconnect check failed: the connection stopped (signError) instead of reconnecting",
      ]);
    });

    it("fails when the LIVE ends before the drop", () => {
      const recorder = new SmokeRecorder({
        username: "someone",
        dropAfterMs: 10_000,
      });
      recorder.record("connected", first, 0);
      recorder.record("streamEnd", { action: "ended" }, 5_000);
      recorder.record(
        "disconnected",
        { reason: "streamEnd", willReconnect: false },
        5_000,
      );
      expect(recorder.summarize(6_000, { interrupted: false }).reasons).toEqual(
        [
          "reconnect check failed: the connection stopped (streamEnd) before the drop",
        ],
      );
    });

    it("fails when the drop can't happen", () => {
      const recorder = new SmokeRecorder({
        username: "someone",
        dropAfterMs: 10_000,
      });
      recorder.record("connected", first, 0);
      recorder.record("chat", chat("hi"), 1);
      expect(recorder.dropFailed("no _terminateSocket()")).toBe(
        labeled("reconnect check", "failed: no _terminateSocket()"),
      );
      expect(
        recorder.summarize(30_000, { interrupted: false }).reasons,
      ).toEqual(["reconnect check failed: no _terminateSocket()"]);
    });

    it("fails when the run ends first", () => {
      const waiting = new SmokeRecorder({
        username: "someone",
        dropAfterMs: 10_000,
      });
      waiting.record("connected", first, 0);
      waiting.record("chat", chat("hi"), 1);
      // The script's own disconnect() isn't a failed reconnect.
      waiting.record(
        "disconnected",
        { reason: "user", willReconnect: false },
        5_000,
      );
      expect(waiting.summarize(5_000, { interrupted: true }).reasons).toEqual([
        "reconnect check failed: the run ended before the drop",
      ]);

      const dropped = droppedRun();
      expect(dropped.summarize(12_000, { interrupted: true }).reasons).toEqual([
        "reconnect check failed: the run ended before the reconnect",
      ]);
    });
  });
});

describe("formatSummary", () => {
  it("shows the facts, the counts and the verdict", () => {
    const recorder = new SmokeRecorder({
      username: "someone",
      gifts: true,
      dropAfterMs: 10_000,
    });
    recorder.record("connected", first, 0);
    recorder.record("chat", chat("hi"), 1);
    recorder.record("raw", raw("WebcastChatMessage"), 1);
    recorder.record("raw", raw("WebcastNoSuchMessage"), 1);
    recorder.dropped(10_000);
    recorder.record(
      "reconnecting",
      { attempt: 1, delayMs: 10, reason: "wsClose" },
      10_001,
    );
    recorder.record("connected", again, 11_000);
    recorder.giftsFetched({ gifts: [], source: "region" });

    const text = formatSummary(
      recorder.summarize(30_000, { interrupted: false }),
    );
    expect(text).toContain("Summary: @someone, room 7140, 30.0 s");
    expect(text).toContain("  connected    yes, 1 reconnect");
    expect(text).toContain("  LIVE events  1");
    expect(text).toContain("  reconnect    passed: back 1.0 s after the drop");
    expect(text).toContain("  gifts        region: 0 gifts");
    expect(text).toMatch(/\n {2}chat +1\n/);
    expect(text).toContain("  WebcastNoSuchMessage  1  no event");
    expect(text.endsWith("\nPASSED")).toBe(true);
  });

  it("lists the reasons of a failed run, without tables when it never connected", () => {
    const recorder = new SmokeRecorder({ username: "someone" });
    recorder.connectFailed(new ConnectorError("OFFLINE", "not LIVE"));
    const text = formatSummary(recorder.summarize(100, { interrupted: false }));
    expect(text).toBe(
      [
        "Summary: @someone, 0.1 s",
        "  connected  no",
        "",
        "FAILED",
        "  - connect() failed: OFFLINE: not LIVE",
      ].join("\n"),
    );
  });

  it("says when there was no raw message and the run was interrupted", () => {
    const recorder = new SmokeRecorder({ username: "someone" });
    recorder.record("connected", first, 0);
    recorder.record("chat", chat("hi"), 1);
    const text = formatSummary(
      recorder.summarize(2_000, { interrupted: true }),
    );
    expect(text).toContain("2.0 s (interrupted)");
    expect(text).toContain("Raw methods\n  none");
  });
});
