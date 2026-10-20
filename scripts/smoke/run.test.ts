// `yarn smoke` without a network: the run of run.ts against FakeTikTok, a
// FakeSigner and a stubbed fetch, so its wiring (every listener, the drop,
// the gift list, the disconnect, the summary) runs in every test pass.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMessageSchema } from "../../src/codec/messages/chat.js";
import { LikeMessageSchema } from "../../src/codec/messages/like.js";
import { RoomUserMessageSchema } from "../../src/codec/messages/roomUser.js";
import {
  ControlAction,
  SignError,
  type ConnectOptions,
} from "../../src/index.js";
import { encodeMessage, fields } from "../../test/helpers/encoder.js";
import { FakeSigner } from "../../test/helpers/fakeSigner.js";
import {
  FakeTikTok,
  type FakeConnection,
  type PushMessage,
} from "../../test/helpers/fakeTikTok.js";
import { jsonResponse, stubFetch } from "../../test/helpers/fetchStub.js";
import { SAMPLE_USER, sampleCommon } from "../../test/helpers/samples.js";
import { startClock } from "../lib/cli.js";
import type { SmokeArgs } from "./args.js";
import { runSmoke, type SmokeIo } from "./run.js";

const ROOM_ID = "7140000000000000001";

let fake: FakeTikTok;
let signer: FakeSigner;

beforeEach(async () => {
  fake = await FakeTikTok.start();
  signer = new FakeSigner({ pushServer: fake.url });
});

afterEach(async () => {
  await fake.close();
});

// TikTok as a stubbed fetch: room/info says LIVE, the room's gift list holds
// a Rose.
const tiktok = () =>
  stubFetch(({ url }) => {
    if (url.pathname === "/webcast/room/info/") {
      return jsonResponse({ data: { status: 2 } });
    }
    if (url.pathname === "/webcast/gift/list/") {
      return jsonResponse({
        data: { gifts: [{ id: 5655, name: "Rose", diamond_count: 1 }] },
      });
    }
    return new Response("", { status: 404 });
  });

function smokeArgs(overrides: Partial<SmokeArgs> = {}): SmokeArgs {
  return {
    username: "someone",
    durationMs: 400,
    roomId: ROOM_ID,
    apiKey: undefined,
    host: undefined,
    verbose: false,
    dropAfterMs: undefined,
    gifts: false,
    json: false,
    ...overrides,
  };
}

// The run's I/O: the fakes for the connection, and what it prints.
function smokeIo(options: ConnectOptions = {}) {
  const progress: string[] = [];
  const results: string[] = [];
  let interrupt: (() => void) | undefined;
  const io: SmokeIo = {
    options: {
      signer,
      roomId: ROOM_ID,
      fetch: tiktok().fetch,
      logger: vi.fn(),
      heartbeatIntervalMs: 50,
      idleTimeoutMs: 0,
      reconnect: { baseDelayMs: 10, maxDelayMs: 40, minDelayMs: 0 },
      ...options,
    },
    progress: (line) => progress.push(line),
    result: (text) => results.push(text),
    onInterrupt: (stop) => {
      interrupt = stop;
    },
    clock: startClock(),
  };
  return { io, progress, results, interrupt: () => interrupt?.() };
}

// A chat, a like and a viewer count for each socket, with ids of its own.
function liveMessages(connection: FakeConnection): PushMessage[] {
  const id = (n: number) => String(connection.index * 10 + n);
  return [
    {
      method: "WebcastChatMessage",
      msgId: id(1),
      payload: encodeMessage(ChatMessageSchema, {
        common: sampleCommon("WebcastChatMessage"),
        user: SAMPLE_USER,
        content: "hi",
      }),
    },
    {
      method: "WebcastLikeMessage",
      msgId: id(2),
      payload: encodeMessage(LikeMessageSchema, {
        user: SAMPLE_USER,
        count: 3,
        total: 10,
      }),
    },
    {
      method: "WebcastRoomUserSeqMessage",
      msgId: id(3),
      payload: encodeMessage(RoomUserMessageSchema, { total: 5, totalUser: 9 }),
    },
  ];
}

// Every socket gets the LIVE messages as soon as it connects: they wait for
// the room to be entered, then come right after `connected`.
function pushOnConnect(): void {
  fake.onConnection = (connection) =>
    fake.push(liveMessages(connection), { connection });
}

describe("runSmoke", () => {
  it("passes a run that sees LIVE events, survives a drop and gets the gifts", async () => {
    pushOnConnect();
    const { io, progress, results } = smokeIo();
    const { status, summary } = await runSmoke(
      smokeArgs({ durationMs: 600, dropAfterMs: 150, gifts: true }),
      io,
    );

    expect(summary.reasons).toEqual([]);
    expect(status).toBe(0);
    expect(summary).toMatchObject({
      ok: true,
      username: "someone",
      roomId: ROOM_ID,
      connected: true,
      reconnects: 1,
      interrupted: false,
      drop: { status: "passed", afterMs: 150 },
      gifts: { status: "fetched", source: "room", count: 1, sample: ["Rose"] },
      stoppedBy: { reason: "user" },
      errors: [],
    });
    // One chat, like and viewer count per socket.
    expect(summary.events).toMatchObject({
      connected: 2,
      reconnecting: 1,
      disconnected: 2,
      chat: 2,
      like: 2,
      roomUser: 2,
      raw: 6,
    });
    expect(summary.liveEvents).toBe(6);
    expect(summary.transitions.map(({ event }) => event)).toEqual([
      "connected",
      "drop",
      "disconnected",
      "reconnecting",
      "connected",
      "disconnected",
    ]);
    expect(summary.unroutedMethods).toEqual([]);
    expect(fake.connections).toHaveLength(2);

    expect(progress[0]).toMatch(/connecting to @someone \(room \d+\)$/);
    expect(progress.some((line) => line.includes("dropping"))).toBe(true);
    expect(progress.at(-2)).toMatch(/disconnecting$/);
    expect(progress.at(-1)).toMatch(/disconnected +user/);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatch(/PASSED$/);
  });

  it("prints the summary as JSON with --json", async () => {
    pushOnConnect();
    const { io, results } = smokeIo();
    const { summary } = await runSmoke(smokeArgs({ json: true }), io);
    expect(JSON.parse(results[0]!)).toEqual(summary);
  });

  it("fails a run whose connect fails", async () => {
    signer.failNext(new SignError("Euler Stream is down", { status: 503 }));
    const { io, progress, results } = smokeIo();
    const { status, summary } = await runSmoke(smokeArgs(), io);
    expect(status).toBe(1);
    expect(summary.connected).toBe(false);
    expect(summary.reasons).toEqual([
      "connect() failed: SIGN_FAILED: Euler Stream is down",
    ]);
    expect(progress.some((line) => line.includes("disconnecting"))).toBe(false);
    expect(results[0]).toMatch(/FAILED/);
  });

  it("fails a run that saw no LIVE event", async () => {
    const { io } = smokeIo();
    const { status, summary } = await runSmoke(smokeArgs(), io);
    expect(status).toBe(1);
    expect(summary.reasons).toEqual([
      expect.stringMatching(/^no LIVE event in .*: is @someone LIVE/),
    ]);
  });

  it("stops early when the LIVE ends, and passes", async () => {
    fake.onConnection = (connection) =>
      fake.push(
        [
          ...liveMessages(connection),
          {
            method: "WebcastControlMessage",
            msgId: "99",
            payload: fields.varint(2, ControlAction.STREAM_ENDED),
          },
        ],
        { connection },
      );
    const { io } = smokeIo();
    const started = performance.now();
    const { status, summary } = await runSmoke(
      smokeArgs({ durationMs: 10_000 }),
      io,
    );
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(status).toBe(0);
    expect(summary.stoppedBy).toEqual({ reason: "streamEnd" });
    expect(summary.events.streamEnd).toBe(1);
  });

  it("disconnects a connect that Ctrl-C interrupts, and fails", async () => {
    signer.hold = new Promise(() => {});
    const smoke = smokeIo();
    const running = runSmoke(smokeArgs(), smoke.io);
    await vi.waitFor(() => expect(signer.calls).toHaveLength(1));
    smoke.interrupt();
    const { status, summary } = await running;
    expect(status).toBe(1);
    expect(summary).toMatchObject({
      interrupted: true,
      connected: false,
      reasons: ["interrupted before connecting"],
      connectError: { code: "ABORTED" },
    });
    expect(signer.calls[0]?.context.signal.aborted).toBe(true);
  });
});
