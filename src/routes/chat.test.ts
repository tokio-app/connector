import { describe, expect, it } from "vitest";
import { ChatMessageSchema } from "../codec/messages/chat/chat.js";
import { LikeMessageSchema } from "../codec/messages/chat/like.js";
import { SocialMessageSchema } from "../codec/messages/chat/social.js";
import type { FetchResultMessage } from "../codec/messages/fetchResult.js";
import { dispatch } from "../dispatch.js";
import { chatRoutes } from "./chat.js";
import { encodeMessage } from "../../test/helpers/encoder.js";
import {
  encoded,
  fakeContext,
  message,
  names,
  payloads,
} from "../../test/helpers/dispatchContext.js";
import { SAMPLE_USER } from "../../test/helpers/samples.js";

/** A social message with `key` as its display text key (none when undefined). */
const social = (key?: string) =>
  encoded("WebcastSocialMessage", SocialMessageSchema, {
    common: key === undefined ? undefined : { displayText: { key } },
    user: SAMPLE_USER,
    shareCount: 1,
  });

describe("chatRoutes", () => {
  it("routes the chat group's messages to the events they can lead to", () => {
    expect(
      Object.fromEntries(
        Object.entries(chatRoutes).map(([method, route]) => [
          method,
          route.events,
        ]),
      ),
    ).toEqual({
      WebcastChatMessage: ["chat"],
      WebcastLikeMessage: ["like"],
      WebcastSocialMessage: ["follow", "share"],
    });
  });

  it("emits only the events a route lists", () => {
    const samples = [
      encoded("WebcastChatMessage", ChatMessageSchema, { content: "hi" }),
      encoded("WebcastLikeMessage", LikeMessageSchema, { count: 1 }),
      social("follow"),
      social("share"),
      social("other"),
    ];
    for (const msg of samples) {
      const route = chatRoutes[msg.method]!;
      const { context, emitted, ended } = fakeContext({ listen: route.events });
      dispatch(context, msg);
      for (const event of names(emitted)) expect(route.events).toContain(event);
      expect(ended).toEqual([]);
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
      method: "WebcastLikeMessage",
      event: "like",
      payload: encodeMessage(LikeMessageSchema, {
        user: SAMPLE_USER,
        count: 5,
        total: 105,
      }),
      expected: { user: SAMPLE_USER, count: 5, total: 105 },
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

  it.todo("lists every event of CHAT_EVENTS");
});
