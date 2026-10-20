import { describe, expect, it } from "vitest";
import { ChatMessageSchema } from "../../src/codec/messages/chat/chat.js";
import { LikeMessageSchema } from "../../src/codec/messages/chat/like.js";
import { SocialMessageSchema } from "../../src/codec/messages/chat/social.js";
import { ControlMessageSchema } from "../../src/codec/messages/room/control.js";
import { ProtocolError } from "../../src/errors.js";
import { encodeMessage, fields, fromHex } from "../../test/helpers/encoder.js";
import { SAMPLE_USER, sampleCommon } from "../../test/helpers/samples.js";
import { replay, unroutedMethods, type CapturedMessage } from "./replay.js";

// Synthetic messages: made-up values, never bytes from a capture.

function message(
  method: string,
  payload: Uint8Array,
  msgId = "1",
  isHistory = false,
): CapturedMessage {
  return { method, payload, msgId, isHistory };
}

describe("replay", () => {
  it("counts the messages by method and the events they fire, and keeps the first payload of each event", () => {
    const result = replay([
      message(
        "WebcastChatMessage",
        encodeMessage(ChatMessageSchema, { user: SAMPLE_USER, content: "hi" }),
        "1",
      ),
      message(
        "WebcastChatMessage",
        encodeMessage(ChatMessageSchema, { content: "again" }),
        "1", // the same id: a capture's messages aren't duplicates
        true, // history is decoded too
      ),
      message(
        "WebcastSocialMessage",
        encodeMessage(SocialMessageSchema, {
          common: sampleCommon(
            "WebcastSocialMessage",
            "pm_mt_msg_viewer_follow",
          ),
        }),
        "2",
      ),
      message("WebcastSomethingNew", fields.varint(1, 1), "3"),
    ]);
    expect(result.counts).toEqual({
      WebcastChatMessage: 2,
      WebcastSocialMessage: 1,
      WebcastSomethingNew: 1,
    });
    expect(result.events).toEqual({ chat: 2, social: 1, follow: 1 });
    expect(result.firsts).toMatchObject({
      chat: { content: "hi", user: { nickname: SAMPLE_USER.nickname } },
      follow: { common: { method: "WebcastSocialMessage" } },
    });
    expect(result.errors).toEqual([]);
    expect(result.streamEnds).toEqual([]);
    expect(result.unsafe).toEqual([]);
  });

  it("names the method and message id of each payload that fails to decode", () => {
    const result = replay([
      message("WebcastChatMessage", fromHex("12 05 68 69"), "71"), // content runs past the end
      message("WebcastLikeMessage", encodeMessage(LikeMessageSchema, {}), "72"),
    ]);
    expect(result.counts).toEqual({
      WebcastChatMessage: 1,
      WebcastLikeMessage: 1,
    });
    expect(result.events).toEqual({ like: 1 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      method: "WebcastChatMessage",
      msgId: "71",
    });
    expect(result.errors[0]?.error).toBeInstanceOf(ProtocolError);
    expect(result.errors[0]?.error.message).toMatch(
      /^Dropped message 71 \(WebcastChatMessage\): Can't decode/,
    );
  });

  it("reports stream ends and counters past Number.MAX_SAFE_INTEGER", () => {
    const result = replay([
      message(
        "WebcastLikeMessage",
        fields.varint(3, 2n ** 60n), // total (3)
        "1",
      ),
      message(
        "WebcastControlMessage",
        encodeMessage(ControlMessageSchema, { action: 3 }),
        "2",
      ),
    ]);
    expect(result.unsafe).toEqual(["WebcastLikeMessage.total"]);
    expect(result.streamEnds).toEqual(["ended"]);
    expect(result.events).toEqual({ like: 1, controlMessage: 1 });
  });

  it("replays nothing to nothing", () => {
    expect(replay([])).toEqual({
      counts: {},
      events: {},
      firsts: {},
      errors: [],
      streamEnds: [],
      unsafe: [],
    });
  });
});

describe("unroutedMethods", () => {
  it("lists the methods no route covers, in alphabetical order", () => {
    expect(
      unroutedMethods({
        WebcastZetaMessage: 1,
        WebcastChatMessage: 3,
        WebcastAlphaMessage: 2,
        toString: 1,
      }),
    ).toEqual(["WebcastAlphaMessage", "WebcastZetaMessage", "toString"]);
    expect(unroutedMethods({})).toEqual([]);
  });
});
