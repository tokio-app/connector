import { describe, expect, it, vi } from "vitest";
import * as decode from "./codec/decode.js";
import { ChatMessageSchema } from "./codec/messages/chat/chat.js";
import { SocialMessageSchema } from "./codec/messages/chat/social.js";
import { CommonOnlySchema } from "./codec/messages/common.js";
import type { FetchResultMessage } from "./codec/messages/fetchResult.js";
import { ControlMessageSchema } from "./codec/messages/room/control.js";
import { RecentIds, dispatch, type DispatchContext } from "./dispatch.js";
import { ProtocolError } from "./errors.js";
import type { ChatMessage, WebcastEventName } from "./events/index.js";
import { LIVE_GROUPS } from "./routes/groups.js";
import { ROUTES } from "./routes/index.js";
import {
  encoded,
  fakeContext,
  message,
  names,
  payloads,
} from "../test/helpers/dispatchContext.js";
import { fields, fromHex, type EncodeInput } from "../test/helpers/encoder.js";
import { SAMPLE_USER, sampleCommon } from "../test/helpers/samples.js";

// The events a LIVE message can lead to: `raw` and every group's events.
const LIVE_EVENTS: readonly WebcastEventName[] = ["raw", ...LIVE_GROUPS.flat()];

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

// A payload cut short: content (3) says 5 bytes, 2 follow.
const TRUNCATED = fromHex("1a 05 68 69");

describe("dispatch", () => {
  it("re-exports what the connection needs from the routes", () => {
    const context: DispatchContext = fakeContext().context;
    expect(context.recentIds).toBeInstanceOf(RecentIds);
  });

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
      expect(names(emitted)).toEqual(["social", "follow"]);
    });

    it("always decodes control messages, listener or not", () => {
      const { context, emitted, ended } = fakeContext();
      dispatch(context, control(3));
      expect(ended).toEqual(["ended"]);
      expect(names(emitted)).toEqual(["controlMessage"]);
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
        "WebcastNoSuchMessage",
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
      dispatch(
        context,
        message("WebcastNoSuchMessage", fromHex("0a 02 20 01")),
      );
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

    // Every route, with every event listened to: a few seconds under load.
    it(
      "never throws on random or truncated payloads",
      { timeout: 30_000 },
      () => {
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
      },
    );
  });
});
