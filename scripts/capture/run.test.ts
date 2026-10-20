// `yarn capture` without a network: the run of run.ts against FakeTikTok, a
// FakeSigner and a stubbed fetch. The fixture it writes must read back with
// parseFixture and replay through dispatch, as test/fixtures/fixtures.test.ts
// replays the real ones.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMessageSchema } from "../../src/codec/messages/chat/chat.js";
import { GiftMessageSchema } from "../../src/codec/messages/gift/gift.js";
import { SignError } from "../../src/index.js";
import { encodeMessage, fields } from "../../test/helpers/encoder.js";
import { FakeSigner } from "../../test/helpers/fakeSigner.js";
import { FakeTikTok, type PushMessage } from "../../test/helpers/fakeTikTok.js";
import { jsonResponse, stubFetch } from "../../test/helpers/fetchStub.js";
import { replay } from "../lib/replay.js";
import { SAMPLE_USER, sampleCommon } from "../../test/helpers/samples.js";
import { startClock } from "../lib/cli.js";
import type { CaptureArgs } from "./args.js";
import { fromFixtureMessage, parseFixture } from "./fixture.js";
import { runCapture, type CaptureIo } from "./run.js";

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

function captureArgs(overrides: Partial<CaptureArgs> = {}): CaptureArgs {
  return {
    username: "someone",
    durationMs: 300,
    roomId: ROOM_ID,
    apiKey: undefined,
    host: undefined,
    verbose: false,
    out: "captures/someone.json",
    anonymize: false,
    ...overrides,
  };
}

// The capture's I/O: the fakes for the connection, and what it prints and
// saves.
function captureIo() {
  const printed: string[] = [];
  const warnings: string[] = [];
  const saved: { path: string; text: string }[] = [];
  const io: CaptureIo = {
    options: {
      signer,
      roomId: ROOM_ID,
      fetch: stubFetch(() => jsonResponse({ data: { status: 2 } })).fetch,
      logger: vi.fn(),
      heartbeatIntervalMs: 50,
      idleTimeoutMs: 0,
    },
    progress: (line) => printed.push(line),
    result: (text) => printed.push(text),
    warn: (text) => warnings.push(text),
    save: (path, text) => {
      saved.push({ path, text });
      return path;
    },
    onInterrupt: vi.fn(),
    clock: startClock(),
  };
  return { io, printed, warnings, saved };
}

const MESSAGES: PushMessage[] = [
  {
    method: "WebcastChatMessage",
    msgId: "1",
    payload: encodeMessage(ChatMessageSchema, {
      common: sampleCommon("WebcastChatMessage"),
      user: SAMPLE_USER,
      content: "hi",
    }),
  },
  {
    method: "WebcastGiftMessage",
    msgId: "2",
    payload: encodeMessage(GiftMessageSchema, {
      user: SAMPLE_USER,
      giftId: "5655",
      repeatCount: 1,
      repeatEnd: true,
      gift: { id: "5655", type: 1, name: "Rose", diamondCount: 1 },
    }),
  },
  {
    method: "WebcastPollMessage",
    msgId: "3",
    payload: fields.message(1, fields.string(1, "WebcastPollMessage")),
  },
];

describe("runCapture", () => {
  it("writes the raw messages to a fixture that replays through dispatch", async () => {
    fake.onConnection = (connection) => fake.push(MESSAGES, { connection });
    const { io, printed, saved } = captureIo();
    const { status, fixture } = await runCapture(captureArgs(), io);

    expect(status).toBe(0);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.path).toBe("captures/someone.json");
    const read = parseFixture(saved[0]!.text);
    expect(read).toEqual(fixture);
    expect(read).toMatchObject({
      version: 1,
      username: "someone",
      roomId: ROOM_ID,
      counts: {
        WebcastChatMessage: 1,
        WebcastGiftMessage: 1,
        WebcastPollMessage: 1,
      },
    });
    const messages = read.messages.map(fromFixtureMessage);
    expect(messages.map(({ payload }) => payload)).toEqual(
      MESSAGES.map(({ payload }) => payload),
    );

    const replayed = replay(messages);
    expect(replayed.errors).toEqual([]);
    expect(replayed.counts).toEqual(read.counts);
    expect(replayed.firsts).toMatchObject({
      chat: { content: "hi", user: { nickname: "Nick Name" } },
      gift: { repeatEnd: true, gift: { name: "Rose" } },
    });
    expect(
      printed.some((line) => line.includes("Wrote captures/someone.json")),
    ).toBe(true);
  });

  it("leaves the username out with --anonymize", async () => {
    fake.onConnection = (connection) => fake.push(MESSAGES, { connection });
    const { io, warnings } = captureIo();
    const { fixture } = await runCapture(captureArgs({ anonymize: true }), io);
    expect(fixture).toBeDefined();
    expect(fixture).not.toHaveProperty("username");
    expect(warnings[0]).toMatch(/^--anonymize leaves out the username only/);
  });

  it("writes nothing when no message came in", async () => {
    const { io, warnings, saved } = captureIo();
    const { status, fixture } = await runCapture(captureArgs(), io);
    expect(status).toBe(1);
    expect(fixture).toBeUndefined();
    expect(saved).toEqual([]);
    expect(warnings).toEqual(["No message came in: nothing written."]);
  });

  it("writes nothing when the connect fails", async () => {
    signer.failNext(new SignError("down", { status: 503 }));
    const { io, printed, warnings, saved } = captureIo();
    const { status } = await runCapture(captureArgs(), io);
    expect(status).toBe(1);
    expect(saved).toEqual([]);
    expect(printed.some((line) => line.includes("connect failed"))).toBe(true);
    expect(warnings).toEqual(["Nothing written."]);
  });
});
