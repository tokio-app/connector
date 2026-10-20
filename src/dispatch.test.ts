import { describe, expect, it, vi } from "vitest";
import * as decode from "./codec/decode.js";
import { getSchema } from "./codec/index.js";
import { BarrageMessageSchema } from "./codec/messages/barrage.js";
import { ChatMessageSchema } from "./codec/messages/chat.js";
import { CommonOnlySchema } from "./codec/messages/common.js";
import { ControlMessageSchema } from "./codec/messages/control.js";
import { EnvelopeMessageSchema } from "./codec/messages/envelope.js";
import type { FetchResultMessage } from "./codec/messages/fetchResult.js";
import { GiftMessageSchema } from "./codec/messages/gift.js";
import { LikeMessageSchema } from "./codec/messages/like.js";
import { MemberMessageSchema } from "./codec/messages/member.js";
import { RoomUserMessageSchema } from "./codec/messages/roomUser.js";
import { SocialMessageSchema } from "./codec/messages/social.js";
import type { MessageSchema } from "./codec/schema.js";
import {
  ROUTES,
  RecentIds,
  defineRoute,
  dispatch,
  type DispatchContext,
  type WebcastEventName,
} from "./dispatch.js";
import { ProtocolError, type ConnectorError } from "./errors.js";
import type {
  ChatMessage,
  EnvelopeMessage,
  StreamEndAction,
  WebcastEventMap,
} from "./events.js";
import {
  encodeMessage,
  fields,
  fromHex,
  type EncodeInput,
} from "../test/helpers/encoder.js";
import { SAMPLE_USER, sampleCommon } from "../test/helpers/samples.js";

// The events a LIVE message can lead to.
const LIVE_EVENTS = [
  "raw",
  "streamEnd",
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
] as const satisfies readonly WebcastEventName[];

/** One `emit` call: the event and its payload. */
type Emitted = {
  [K in WebcastEventName]: [K, WebcastEventMap[K]];
}[WebcastEventName];

interface FakeOptions {
  /** The events with a listener. */
  listen?: readonly WebcastEventName[];
  processInitialData?: boolean;
  dedupeSize?: number;
}

/** A DispatchContext that records what dispatch does with it. */
function fakeContext({
  listen = [],
  processInitialData = false,
  dedupeSize = 2_048,
}: FakeOptions = {}) {
  const emitted: Emitted[] = [];
  const errors: ConnectorError[] = [];
  const ended: StreamEndAction[] = [];
  const onUnsafeInteger = vi.fn();
  const context: DispatchContext = {
    processInitialData,
    recentIds: new RecentIds(dedupeSize),
    decodeOptions: { onUnsafeInteger },
    listenerCount: (event) => (listen.includes(event) ? 1 : 0),
    emit: (event, payload) => {
      emitted.push([event, payload] as Emitted);
    },
    reportError: (error) => {
      errors.push(error);
    },
    endStream: (action) => {
      ended.push(action);
    },
  };
  return { context, emitted, errors, ended, onUnsafeInteger };
}

/** The names of the emitted events, in order. */
const names = (emitted: readonly Emitted[]) => emitted.map(([event]) => event);

/** The payloads of one event, in order. */
function payloads<K extends WebcastEventName>(
  emitted: readonly Emitted[],
  event: K,
): WebcastEventMap[K][] {
  return emitted
    .filter(([name]) => name === event)
    .map(([, payload]) => payload as WebcastEventMap[K]);
}

let lastId = 0;

/** A batch message, with a new msgId unless `options` gives one. */
function message(
  method: string,
  payload: Uint8Array = new Uint8Array(0),
  options: Partial<FetchResultMessage> = {},
): FetchResultMessage {
  lastId += 1;
  return {
    method,
    payload,
    msgId: String(lastId),
    msgType: 1,
    isHistory: false,
    ...options,
  };
}

/** A batch message holding `value`, encoded with `schema`. */
function encoded<T>(
  method: string,
  schema: MessageSchema<T>,
  value: EncodeInput<T>,
  options?: Partial<FetchResultMessage>,
): FetchResultMessage {
  return message(method, encodeMessage(schema, value), options);
}

const chat = (
  value: EncodeInput<ChatMessage> = {},
  options?: Partial<FetchResultMessage>,
) => encoded("WebcastChatMessage", ChatMessageSchema, value, options);

const control = (action: number, options?: Partial<FetchResultMessage>) =>
  encoded("WebcastControlMessage", ControlMessageSchema, { action }, options);

/** A social message with `key` as its display text key (none when undefined). */
const social = (key?: string) =>
  encoded("WebcastSocialMessage", SocialMessageSchema, {
    common: key === undefined ? undefined : { displayText: { key } },
    user: SAMPLE_USER,
    shareCount: 1,
  });

const envelope = (value: EncodeInput<EnvelopeMessage>) =>
  encoded("WebcastEnvelopeMessage", EnvelopeMessageSchema, value);

/** A banner with these content and common barrage content keys (left out when undefined). */
const barrage = (contentKey?: string, commonKey?: string) =>
  encoded("WebcastBarrageMessage", BarrageMessageSchema, {
    content: contentKey === undefined ? undefined : { key: contentKey },
    commonBarrageContent:
      commonKey === undefined ? undefined : { key: commonKey },
    user: SAMPLE_USER,
  });

// A payload cut short: content (3) says 5 bytes, 2 follow.
const TRUNCATED = fromHex("1a 05 68 69");

describe("dispatch", () => {
  describe("lazy decoding", () => {
    it("doesn't decode a message when none of its route's events has a listener", () => {
      const decodeSpy = vi.spyOn(decode, "decodeMessage");
      const { context, emitted, errors } = fakeContext({
        listen: ["gift", "streamEnd", "error"],
      });
      dispatch(context, chat({ content: "hi" }));
      // Decoding this one would report an error.
      dispatch(context, message("WebcastChatMessage", TRUNCATED));
      expect(decodeSpy).not.toHaveBeenCalled();
      expect(emitted).toEqual([]);
      expect(errors).toEqual([]);
    });

    it("decodes when any of the route's events has a listener", () => {
      const { context, emitted } = fakeContext({ listen: ["share"] });
      dispatch(context, social("pm_main_follow_message_viewer_2"));
      expect(names(emitted)).toEqual(["follow"]);
    });

    it("always decodes control messages, listener or not", () => {
      const { context, emitted, ended } = fakeContext();
      dispatch(context, control(3));
      expect(ended).toEqual(["ended"]);
      expect(emitted).toEqual([]);
    });

    it("decodes only the common data for a raw listener", () => {
      const msg = chat({
        common: { createTime: "1760000000123" },
        content: "hi",
      });
      const decodeSpy = vi.spyOn(decode, "decodeMessage");
      const { context, emitted } = fakeContext({ listen: ["raw"] });
      dispatch(context, msg);
      expect(names(emitted)).toEqual(["raw"]);
      expect(decodeSpy.mock.calls).toEqual([
        [CommonOnlySchema, msg.payload, context.decodeOptions],
      ]);
    });
  });

  describe("raw", () => {
    it("comes first, with the message as received and its creation time", () => {
      const { context, emitted } = fakeContext({ listen: ["raw", "chat"] });
      const msg = chat(
        { common: sampleCommon("WebcastChatMessage"), content: "hi" },
        { msgId: "7400000000000000001" },
      );
      dispatch(context, msg);
      expect(names(emitted)).toEqual(["raw", "chat"]);
      const [raw] = payloads(emitted, "raw");
      expect(raw).toStrictEqual({
        method: "WebcastChatMessage",
        payload: msg.payload,
        msgId: "7400000000000000001",
        isHistory: false,
        createTime: "1760000000123",
      });
      // A view into the batch, not a copy.
      expect(raw?.payload).toBe(msg.payload);
    });

    it("is all a message without a route leads to", () => {
      const decodeSpy = vi.spyOn(decode, "decodeMessage");
      const { context, emitted, errors } = fakeContext({ listen: LIVE_EVENTS });
      const methods = [
        "WebcastPollMessage",
        "",
        "toString",
        "__proto__",
        "constructor",
        "hasOwnProperty",
      ];
      for (const method of methods) {
        dispatch(context, message(method, fromHex("0a 00")));
      }
      expect(payloads(emitted, "raw").map((raw) => raw.method)).toEqual(
        methods,
      );
      expect(names(emitted)).toEqual(methods.map(() => "raw"));
      expect(decodeSpy.mock.calls.map(([schema]) => schema)).toEqual(
        methods.map(() => CommonOnlySchema),
      );
      expect(errors).toEqual([]);
    });

    it('has createTime "0" when the payload has none, or can\'t be read', () => {
      const { context, emitted, errors } = fakeContext({ listen: ["raw"] });
      dispatch(context, message("WebcastChatMessage"));
      dispatch(context, chat({ content: "no common" }));
      dispatch(context, chat({ common: { method: "WebcastChatMessage" } }));
      // common (1) says 5 bytes, 2 follow.
      dispatch(context, message("WebcastChatMessage", fromHex("0a 05 20 01")));
      expect(payloads(emitted, "raw").map((raw) => raw.createTime)).toEqual([
        "0",
        "0",
        "0",
        "0",
      ]);
      expect(errors).toEqual([]);
    });

    it("isn't built without a listener", () => {
      const decodeSpy = vi.spyOn(decode, "decodeMessage");
      const { context, emitted } = fakeContext({ listen: ["chat"] });
      dispatch(context, message("WebcastPollMessage", fromHex("0a 02 20 01")));
      expect(emitted).toEqual([]);
      expect(decodeSpy).not.toHaveBeenCalled();
    });
  });

  describe("duplicates", () => {
    it("drops a message whose id was seen, before raw", () => {
      const { context, emitted } = fakeContext({
        listen: ["raw", "chat", "like"],
      });
      const first = chat({ content: "hi" }, { msgId: "7400000000000000001" });
      dispatch(context, first);
      dispatch(context, first);
      // The id counts, not the message type.
      dispatch(context, { ...first, method: "WebcastLikeMessage" });
      expect(names(emitted)).toEqual(["raw", "chat"]);
    });

    it('never drops a message without an id ("0" or empty)', () => {
      const { context, emitted } = fakeContext({ listen: ["chat"] });
      const zero = chat({ content: "hi" }, { msgId: "0" });
      const empty = { ...zero, msgId: "" };
      for (const msg of [zero, zero, empty, empty]) dispatch(context, msg);
      expect(names(emitted)).toEqual(["chat", "chat", "chat", "chat"]);
      expect(context.recentIds.size).toBe(0);
    });

    it("forgets the oldest ids past the context's capacity", () => {
      const { context, emitted } = fakeContext({
        listen: ["raw"],
        dedupeSize: 2,
      });
      for (const msgId of ["1", "2", "3", "1", "3"]) {
        dispatch(context, message("WebcastChatMessage", undefined, { msgId }));
      }
      expect(payloads(emitted, "raw").map((raw) => raw.msgId)).toEqual([
        "1",
        "2",
        "3",
        "1",
      ]);
    });

    it("remembers the ids of the history messages it drops", () => {
      const { context, emitted } = fakeContext({ listen: ["chat"] });
      const old = chat({ content: "old" }, { isHistory: true });
      dispatch(context, old);
      dispatch(context, { ...old, isHistory: false });
      expect(emitted).toEqual([]);
    });
  });

  describe("history", () => {
    it("drops history messages after raw", () => {
      const decodeSpy = vi.spyOn(decode, "decodeMessage");
      const { context, emitted, ended } = fakeContext({
        listen: ["raw", "chat", "streamEnd"],
      });
      dispatch(context, chat({ content: "old" }, { isHistory: true }));
      dispatch(context, control(3, { isHistory: true }));
      expect(names(emitted)).toEqual(["raw", "raw"]);
      expect(payloads(emitted, "raw").map((raw) => raw.isHistory)).toEqual([
        true,
        true,
      ]);
      expect(ended).toEqual([]);
      expect(decodeSpy.mock.calls.map(([schema]) => schema)).toEqual([
        CommonOnlySchema,
        CommonOnlySchema,
      ]);
    });

    it("routes history messages with processInitialData", () => {
      const { context, emitted, ended } = fakeContext({
        listen: ["chat"],
        processInitialData: true,
      });
      dispatch(context, chat({ content: "old" }, { isHistory: true }));
      dispatch(context, control(4, { isHistory: true }));
      expect(payloads(emitted, "chat")).toMatchObject([{ content: "old" }]);
      expect(ended).toEqual(["suspended"]);
    });
  });

  describe("failures", () => {
    it("reports a payload it can't decode as a ProtocolError, and goes on", () => {
      const { context, emitted, errors } = fakeContext({
        listen: ["raw", "chat"],
      });
      const broken = message("WebcastChatMessage", TRUNCATED, {
        msgId: "7400000000000000001",
      });
      expect(() => dispatch(context, broken)).not.toThrow();
      dispatch(context, chat({ content: "next" }));
      expect(names(emitted)).toEqual(["raw", "raw", "chat"]);
      expect(payloads(emitted, "chat")).toMatchObject([{ content: "next" }]);
      expect(errors).toHaveLength(1);
      const [error] = errors;
      expect(error).toBeInstanceOf(ProtocolError);
      expect(error?.message).toBe(
        "Dropped message 7400000000000000001 (WebcastChatMessage): Can't decode WebcastChatMessage: Length 5 runs past the end of the message (byte 1)",
      );
      expect(error?.cause).toBeInstanceOf(ProtocolError);
    });

    it("reports a control message it can't decode", () => {
      const { context, errors, ended } = fakeContext();
      dispatch(
        context,
        message("WebcastControlMessage", fromHex("10"), { msgId: "9" }),
      );
      expect(ended).toEqual([]);
      expect(errors.map((error) => error.message)).toEqual([
        "Dropped message 9 (WebcastControlMessage): Can't decode WebcastControlMessage: Unexpected end of message (byte 1)",
      ]);
    });

    it("decodes with the context's decode options", () => {
      const { context, emitted, onUnsafeInteger } = fakeContext({
        listen: ["like"],
      });
      dispatch(
        context,
        message("WebcastLikeMessage", fields.varint(3, 2n ** 53n + 1n)),
      );
      expect(payloads(emitted, "like")).toMatchObject([{ total: 2 ** 53 }]);
      expect(onUnsafeInteger).toHaveBeenCalledWith(
        "WebcastLikeMessage.total",
        2n ** 53n + 1n,
      );
    });

    it("never throws: anything unexpected is reported with code INTERNAL", () => {
      const { context, errors } = fakeContext();
      const failure = new Error("boom");
      const throwing: DispatchContext = {
        ...context,
        endStream: () => {
          throw failure;
        },
      };
      expect(() =>
        dispatch(throwing, control(3, { msgId: "42" })),
      ).not.toThrow();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        name: "ConnectorError",
        code: "INTERNAL",
        message: "Couldn't handle message 42 (WebcastControlMessage): boom",
      });
      expect(errors[0]?.cause).toBe(failure);
    });

    it("describes a thrown value that isn't an error", () => {
      const { context, errors } = fakeContext({ listen: ["chat"] });
      const thrown: unknown = "a string";
      const throwing: DispatchContext = {
        ...context,
        emit: () => {
          throw thrown;
        },
      };
      dispatch(throwing, chat({}, { msgId: "43" }));
      expect(errors.map((error) => error.message)).toEqual([
        "Couldn't handle message 43 (WebcastChatMessage): a string",
      ]);
    });

    it("never throws on random or truncated payloads", () => {
      // mulberry32: a small seeded generator, so a failure can be replayed.
      let seed = 0x7140;
      const random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
      };
      const { context, errors } = fakeContext({ listen: LIVE_EVENTS });
      const valid = chat({
        common: sampleCommon("WebcastChatMessage"),
        user: SAMPLE_USER,
        content: "hi",
        emotes: [{ index: 0, emote: { emoteId: "1" } }],
      }).payload;
      for (const method of Object.keys(ROUTES)) {
        for (let length = 0; length < valid.length; length++) {
          dispatch(context, message(method, valid.subarray(0, length)));
        }
        for (let run = 0; run < 200; run++) {
          const bytes = Uint8Array.from(
            { length: Math.floor(random() * 48) },
            () => Math.floor(random() * 256),
          );
          dispatch(context, message(method, bytes));
        }
      }
      expect(errors.length).toBeGreaterThan(0);
      for (const error of errors) expect(error).toBeInstanceOf(ProtocolError);
    });
  });
});

describe("ROUTES", () => {
  it("routes the LIVE messages the codec decodes to the events they can lead to", () => {
    expect(
      Object.fromEntries(
        Object.entries(ROUTES).map(([method, route]) => [method, route.events]),
      ),
    ).toEqual({
      WebcastChatMessage: ["chat"],
      WebcastGiftMessage: ["gift"],
      WebcastLikeMessage: ["like"],
      WebcastSocialMessage: ["follow", "share"],
      WebcastMemberMessage: ["member"],
      WebcastRoomUserSeqMessage: ["roomUser"],
      WebcastControlMessage: ["streamEnd"],
      WebcastEnvelopeMessage: ["superFanBox", "envelope"],
      WebcastBarrageMessage: ["superFanJoin", "superFan"],
    });
    for (const [method, route] of Object.entries(ROUTES)) {
      expect(route.schema).toBe(getSchema(method));
      expect(route.always === true).toBe(method === "WebcastControlMessage");
    }
    expect(Object.isFrozen(ROUTES)).toBe(true);
  });

  it("emits only the events a route lists", () => {
    const samples = [
      chat({ content: "hi" }),
      encoded("WebcastGiftMessage", GiftMessageSchema, { giftId: "5655" }),
      encoded("WebcastLikeMessage", LikeMessageSchema, { count: 1 }),
      social("follow"),
      social("share"),
      social("other"),
      encoded("WebcastMemberMessage", MemberMessageSchema, { actionId: 1 }),
      encoded("WebcastRoomUserSeqMessage", RoomUserMessageSchema, {
        total: 1,
      }),
      control(1),
      control(3),
      control(4),
      envelope({}),
      envelope({ envelopeInfo: { businessType: 19 } }),
      barrage("ttlive_superfan_commentnotif_superfanjoined"),
      barrage("ttlive_superfan"),
      barrage("other"),
    ];
    for (const msg of samples) {
      const route = ROUTES[msg.method]!;
      const { context, emitted, ended } = fakeContext({ listen: route.events });
      dispatch(context, msg);
      for (const event of names(emitted)) expect(route.events).toContain(event);
      if (ended.length > 0) expect(route.events).toContain("streamEnd");
    }
  });

  describe.each([
    {
      method: "WebcastChatMessage",
      event: "chat",
      payload: encodeMessage(ChatMessageSchema, {
        user: SAMPLE_USER,
        content: "hi",
      }),
      expected: { user: SAMPLE_USER, content: "hi", emotes: [] },
    },
    {
      method: "WebcastGiftMessage",
      event: "gift",
      payload: encodeMessage(GiftMessageSchema, {
        user: SAMPLE_USER,
        giftId: "5655",
        repeatCount: 2,
        gift: { id: "5655", name: "Rose", type: 1 },
      }),
      expected: {
        user: SAMPLE_USER,
        giftId: "5655",
        repeatCount: 2,
        repeatEnd: false,
        gift: { id: "5655", name: "Rose", type: 1, diamondCount: 0 },
      },
    },
    {
      method: "WebcastLikeMessage",
      event: "like",
      payload: encodeMessage(LikeMessageSchema, {
        user: SAMPLE_USER,
        count: 5,
        total: 105,
      }),
      expected: { user: SAMPLE_USER, count: 5, total: 105 },
    },
    {
      method: "WebcastMemberMessage",
      event: "member",
      payload: encodeMessage(MemberMessageSchema, {
        user: SAMPLE_USER,
        actionId: 1,
      }),
      expected: { user: SAMPLE_USER, actionId: 1 },
    },
    {
      method: "WebcastMemberMessage",
      event: "member",
      payload: encodeMessage(MemberMessageSchema, { actionId: 3 }),
      expected: { actionId: 3 },
    },
    {
      method: "WebcastMemberMessage",
      event: "member",
      payload: new Uint8Array(0),
      expected: { actionId: 0 },
    },
    {
      method: "WebcastRoomUserSeqMessage",
      event: "roomUser",
      payload: encodeMessage(RoomUserMessageSchema, {
        total: 12,
        totalUser: 340,
        ranks: [{ user: SAMPLE_USER, score: 50, rank: 1 }],
      }),
      expected: {
        total: 12,
        totalUser: 340,
        ranks: [{ user: SAMPLE_USER, score: 50, rank: 1 }],
      },
    },
  ] as const)("$method", ({ method, event, payload, expected }) => {
    it(`is always a ${event}`, () => {
      const { context, emitted } = fakeContext({ listen: [event] });
      dispatch(context, message(method, payload));
      expect(names(emitted)).toEqual([event]);
      expect(payloads(emitted, event)[0]).toMatchObject(expected);
    });
  });

  describe("WebcastSocialMessage", () => {
    const route = (msg: FetchResultMessage) => {
      const { context, emitted } = fakeContext({ listen: ["follow", "share"] });
      dispatch(context, msg);
      return emitted;
    };

    it("is a follow when the display text key contains follow", () => {
      const emitted = route(social("pm_main_follow_message_viewer_2"));
      expect(names(emitted)).toEqual(["follow"]);
      expect(payloads(emitted, "follow")[0]).toMatchObject({
        common: {
          displayText: { key: "pm_main_follow_message_viewer_2" },
        },
        user: SAMPLE_USER,
        shareCount: 1,
      });
      // A key with both is a follow.
      expect(names(route(social("follow_share")))).toEqual(["follow"]);
    });

    it("is a share when it contains share instead", () => {
      const emitted = route(social("pm_mt_guidance_share"));
      expect(names(emitted)).toEqual(["share"]);
      expect(payloads(emitted, "share")[0]).toMatchObject({
        user: SAMPLE_USER,
      });
    });

    it("is neither otherwise", () => {
      expect(route(social("pm_mt_msg_viewer_subscribe"))).toEqual([]);
      expect(route(social(""))).toEqual([]);
      expect(route(social(undefined))).toEqual([]);
      const noText = encoded("WebcastSocialMessage", SocialMessageSchema, {
        common: { method: "WebcastSocialMessage" },
      });
      expect(route(noText)).toEqual([]);
    });

    it("compares the key as it is, without lowercasing it (like 2.4.0)", () => {
      expect(route(social("PM_MAIN_FOLLOW_MESSAGE"))).toEqual([]);
      expect(route(social("PM_MT_GUIDANCE_SHARE"))).toEqual([]);
    });
  });

  describe("WebcastControlMessage", () => {
    it.each([
      [3, "ended"],
      [4, "suspended"],
    ] as const)(
      "ends the stream on action %i, without an event of its own",
      (action, how) => {
        const { context, emitted, ended } = fakeContext({
          listen: LIVE_EVENTS,
        });
        dispatch(context, control(action));
        expect(ended).toEqual([how]);
        expect(names(emitted)).toEqual(["raw"]);
      },
    );

    it.each([0, 1, 2, 5, -1])("does nothing on action %i", (action) => {
      const { context, emitted, ended } = fakeContext({
        listen: LIVE_EVENTS,
      });
      dispatch(context, control(action));
      expect(ended).toEqual([]);
      expect(names(emitted)).toEqual(["raw"]);
    });
  });

  describe("WebcastEnvelopeMessage", () => {
    const route = (value: EncodeInput<EnvelopeMessage>) => {
      const { context, emitted } = fakeContext({
        listen: ["envelope", "superFanBox"],
      });
      dispatch(context, envelope(value));
      return emitted;
    };

    it("is an envelope, whatever it holds", () => {
      expect(names(route({}))).toEqual(["envelope"]);
      expect(
        names(
          route({
            common: { displayText: { key: "pm_mt_envelope_sent" } },
            envelopeInfo: { businessType: 1 },
          }),
        ),
      ).toEqual(["envelope"]);
      const emitted = route({ common: { method: "WebcastEnvelopeMessage" } });
      expect(names(emitted)).toEqual(["envelope"]);
      expect(payloads(emitted, "envelope")[0]).toMatchObject({
        common: { method: "WebcastEnvelopeMessage" },
      });
    });

    it("is a super fan box first when its key has ttlive_superfanbox, in any case", () => {
      const emitted = route({
        common: { displayText: { key: "TTLIVE_SuperFanBox_Sent" } },
      });
      expect(names(emitted)).toEqual(["superFanBox", "envelope"]);
      // Both events get the same message.
      expect(emitted[0]?.[1]).toBe(emitted[1]?.[1]);
    });

    it("is a super fan box when its business type is 19", () => {
      expect(names(route({ envelopeInfo: { businessType: 19 } }))).toEqual([
        "superFanBox",
        "envelope",
      ]);
    });

    it("is a super fan box once when both say so", () => {
      const emitted = route({
        common: { displayText: { key: "ttlive_superfanbox" } },
        envelopeInfo: { businessType: 19 },
      });
      expect(names(emitted)).toEqual(["superFanBox", "envelope"]);
    });
  });

  describe("WebcastBarrageMessage", () => {
    const route = (contentKey?: string, commonKey?: string) => {
      const { context, emitted } = fakeContext({
        listen: ["superFan", "superFanJoin"],
      });
      dispatch(context, barrage(contentKey, commonKey));
      return emitted;
    };

    it("is a super fan join when a key has the joined key, in any case", () => {
      const emitted = route("ttlive_superfan_commentnotif_superfanjoined");
      expect(names(emitted)).toEqual(["superFanJoin"]);
      expect(payloads(emitted, "superFanJoin")[0]).toMatchObject({
        content: { key: "ttlive_superfan_commentnotif_superfanjoined" },
        user: SAMPLE_USER,
      });
      expect(
        names(route(undefined, "TTLIVE_SuperFan_CommentNotif_SuperFanJoined")),
      ).toEqual(["superFanJoin"]);
      // The joined key wins over a super fan key in the other text.
      expect(
        names(
          route(
            "ttlive_superfan_banner",
            "ttlive_superfan_commentnotif_superfanjoined_v2",
          ),
        ),
      ).toEqual(["superFanJoin"]);
    });

    it("is a super fan banner when a key has ttlive_superfan, in any case", () => {
      expect(names(route("ttlive_superfan_banner"))).toEqual(["superFan"]);
      expect(names(route("pm_mt_gift", "TTLIVE_SUPERFAN"))).toEqual([
        "superFan",
      ]);
    });

    it("is neither otherwise", () => {
      expect(route()).toEqual([]);
      expect(route("", "")).toEqual([]);
      expect(route("pm_mt_gift_gallery", "ttlive_superfa")).toEqual([]);
    });
  });
});

describe("RecentIds", () => {
  it("tells new ids from repeated ones", () => {
    const ids = new RecentIds(3);
    expect(ids.add("a")).toBe(true);
    expect(ids.add("b")).toBe(true);
    expect(ids.add("a")).toBe(false);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("c")).toBe(false);
    expect(ids.size).toBe(2);
  });

  it("forgets the oldest id past its capacity", () => {
    const ids = new RecentIds(2);
    ids.add("a");
    ids.add("b");
    ids.add("c");
    expect(ids.has("a")).toBe(false);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(true);
    expect(ids.size).toBe(2);
    expect(ids.add("a")).toBe(true);
    expect(ids.has("b")).toBe(false);
  });

  it("remembers nothing with a capacity of 0", () => {
    const ids = new RecentIds(0);
    expect(ids.add("a")).toBe(true);
    expect(ids.add("a")).toBe(true);
    expect(ids.size).toBe(0);
  });

  it("forgets everything on clear", () => {
    const ids = new RecentIds(5);
    ids.add("a");
    ids.clear();
    expect(ids.size).toBe(0);
    expect(ids.add("a")).toBe(true);
  });
});

describe("defineRoute", () => {
  it("returns the route as is", () => {
    const route = {
      schema: LikeMessageSchema,
      events: ["like"] as const,
      emit: () => {},
    };
    expect(defineRoute(route)).toBe(route);
  });
});
