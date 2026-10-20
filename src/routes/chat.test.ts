import { describe, expect, it } from "vitest";
import { CaptionMessageSchema } from "../codec/messages/chat/caption.js";
import { ChatMessageSchema } from "../codec/messages/chat/chat.js";
import { EmoteChatMessageSchema } from "../codec/messages/chat/emote.js";
import { ImDeleteMessageSchema } from "../codec/messages/chat/imDelete.js";
import { LikeMessageSchema } from "../codec/messages/chat/like.js";
import { NoticeMessageSchema } from "../codec/messages/chat/notice.js";
import { QuestionNewMessageSchema } from "../codec/messages/chat/questionNew.js";
import { RoomMessageSchema } from "../codec/messages/chat/roomMessage.js";
import { RoomPinMessageSchema } from "../codec/messages/chat/roomPin.js";
import { SocialMessageSchema } from "../codec/messages/chat/social.js";
import {
  BottomMessageSchema,
  LiveIntroMessageSchema,
  MsgDetectMessageSchema,
  RoomVerifyMessageSchema,
  SystemMessageSchema,
  ToastMessageSchema,
  UnauthorizedMemberMessageSchema,
} from "../codec/messages/chat/tail.js";
import type { FetchResultMessage } from "../codec/messages/fetchResult.js";
import { dispatch } from "../dispatch.js";
import { chatRoutes } from "./chat.js";
import { CHAT_EVENTS } from "./groups.js";
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

/** A pin of a comment, which travels inside the pin. */
const pinnedChat = () =>
  encoded("WebcastRoomPinMessage", RoomPinMessageSchema, {
    chatMessage: { user: SAMPLE_USER, content: "pinned" },
    method: "WebcastChatMessage",
    action: 1,
    pinMsgId: "7400000000000000001",
  });

// The plain forwards: one event each, always.
const forwards = [
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
    method: "WebcastEmoteChatMessage",
    event: "emote",
    payload: encodeMessage(EmoteChatMessageSchema, {
      user: SAMPLE_USER,
      emoteList: [{ emoteId: "e1" }],
    }),
    expected: { user: SAMPLE_USER, emoteList: [{ emoteId: "e1" }] },
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
    method: "WebcastImDeleteMessage",
    event: "imDelete",
    payload: encodeMessage(ImDeleteMessageSchema, {
      deleteMsgIds: ["7400000000000000001"],
      deleteUserIds: ["6900000000000000001"],
    }),
    expected: {
      deleteMsgIds: ["7400000000000000001"],
      deleteUserIds: ["6900000000000000001"],
    },
  },
  {
    method: "WebcastRoomPinMessage",
    event: "roomPin",
    payload: pinnedChat().payload,
    expected: {
      chatMessage: { user: SAMPLE_USER, content: "pinned" },
      method: "WebcastChatMessage",
      action: 1,
      pinMsgId: "7400000000000000001",
    },
  },
  {
    method: "WebcastQuestionNewMessage",
    event: "questionNew",
    payload: encodeMessage(QuestionNewMessageSchema, {
      details: { questionId: "1", content: "Why?", user: SAMPLE_USER },
    }),
    expected: {
      details: { questionId: "1", content: "Why?", user: SAMPLE_USER },
    },
  },
  {
    method: "WebcastCaptionMessage",
    event: "captionMessage",
    payload: encodeMessage(CaptionMessageSchema, {
      content: [{ lang: "en", content: "hello" }],
      definite: true,
    }),
    expected: { content: [{ lang: "en", content: "hello" }], definite: true },
  },
  {
    method: "WebcastRoomMessage",
    event: "roomMessage",
    payload: encodeMessage(RoomMessageSchema, {
      content: "Welcome",
      isWelcome: true,
    }),
    expected: { content: "Welcome", isWelcome: true },
  },
  {
    method: "WebcastNoticeMessage",
    event: "notice",
    payload: encodeMessage(NoticeMessageSchema, {
      content: "Be kind",
      noticeType: 2,
    }),
    expected: { content: "Be kind", noticeType: 2 },
  },
  {
    method: "WebcastSystemMessage",
    event: "system",
    payload: encodeMessage(SystemMessageSchema, { message: "Hello" }),
    expected: { message: "Hello" },
  },
  {
    method: "WebcastLiveIntroMessage",
    event: "liveIntro",
    payload: encodeMessage(LiveIntroMessageSchema, {
      content: "Welcome to my LIVE",
      user: SAMPLE_USER,
    }),
    expected: { content: "Welcome to my LIVE", user: SAMPLE_USER },
  },
  {
    method: "WebcastUnauthorizedMemberMessage",
    event: "unauthorizedMember",
    payload: encodeMessage(UnauthorizedMemberMessageSchema, {
      nickName: "user123",
    }),
    expected: { nickName: "user123" },
  },
  {
    method: "WebcastMsgDetectMessage",
    event: "msgDetect",
    payload: encodeMessage(MsgDetectMessageSchema, { dType: 3, triggerBy: 2 }),
    expected: { dType: 3, triggerBy: 2 },
  },
  {
    method: "WebcastToastMessage",
    event: "toast",
    payload: encodeMessage(ToastMessageSchema, {
      displayDurationMillisecond: 3_000,
    }),
    expected: { displayDurationMillisecond: 3_000 },
  },
  {
    method: "WebcastBottomMessage",
    event: "bottomMessage",
    payload: encodeMessage(BottomMessageSchema, {
      content: "Be kind",
      bizType: 1,
    }),
    expected: { content: "Be kind", bizType: 1 },
  },
  {
    method: "WebcastRoomVerifyMessage",
    event: "roomVerify",
    payload: encodeMessage(RoomVerifyMessageSchema, {
      content: "Verify",
      closeRoom: true,
    }),
    expected: { content: "Verify", closeRoom: true },
  },
] as const;

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
      WebcastEmoteChatMessage: ["emote"],
      WebcastLikeMessage: ["like"],
      WebcastSocialMessage: ["social", "follow", "share"],
      WebcastImDeleteMessage: ["imDelete"],
      WebcastRoomPinMessage: ["roomPin"],
      WebcastQuestionNewMessage: ["questionNew"],
      WebcastCaptionMessage: ["captionMessage"],
      WebcastRoomMessage: ["roomMessage"],
      WebcastNoticeMessage: ["notice"],
      WebcastSystemMessage: ["system"],
      WebcastLiveIntroMessage: ["liveIntro"],
      WebcastUnauthorizedMemberMessage: ["unauthorizedMember"],
      WebcastMsgDetectMessage: ["msgDetect"],
      WebcastToastMessage: ["toast"],
      WebcastBottomMessage: ["bottomMessage"],
      WebcastRoomVerifyMessage: ["roomVerify"],
    });
  });

  it("emits only the events a route lists", () => {
    const samples = [
      ...forwards.map(({ method, payload }) => message(method, payload)),
      social("follow"),
      social("share"),
      social("other"),
      social(undefined),
    ];
    // Every route has a sample.
    expect(new Set(samples.map((msg) => msg.method))).toEqual(
      new Set(Object.keys(chatRoutes)),
    );
    for (const msg of samples) {
      const route = chatRoutes[msg.method]!;
      const { context, emitted, ended } = fakeContext({ listen: route.events });
      dispatch(context, msg);
      expect(emitted.length).toBeGreaterThan(0);
      for (const event of names(emitted)) expect(route.events).toContain(event);
      expect(ended).toEqual([]);
    }
  });

  describe.each(forwards)("$method", ({ method, event, payload, expected }) => {
    it(`is always a ${event}`, () => {
      const { context, emitted } = fakeContext({ listen: [event] });
      dispatch(context, message(method, payload));
      expect(names(emitted)).toEqual([event]);
      expect(payloads(emitted, event)[0]).toMatchObject(expected);
    });
  });

  describe("WebcastSocialMessage", () => {
    const route = (
      msg: FetchResultMessage,
      listen: ("social" | "follow" | "share")[] = ["social", "follow", "share"],
    ) => {
      const { context, emitted } = fakeContext({ listen });
      dispatch(context, msg);
      return emitted;
    };

    it("is always a social, before the derived event", () => {
      expect(names(route(social("pm_main_follow_message_viewer_2")))).toEqual([
        "social",
        "follow",
      ]);
      expect(names(route(social("pm_mt_guidance_share")))).toEqual([
        "social",
        "share",
      ]);
      const emitted = route(social("pm_mt_msg_viewer_subscribe"));
      expect(names(emitted)).toEqual(["social"]);
      expect(payloads(emitted, "social")[0]).toMatchObject({
        common: { displayText: { key: "pm_mt_msg_viewer_subscribe" } },
        user: SAMPLE_USER,
        shareCount: 1,
      });
    });

    it("is decoded for a social listener alone, and for a derived one alone", () => {
      expect(names(route(social("follow"), ["social"]))).toEqual([
        "social",
        "follow",
      ]);
      // The connection's emitter drops the events nobody listens to.
      expect(names(route(social("follow"), ["follow"]))).toEqual([
        "social",
        "follow",
      ]);
      expect(names(route(social("other"), ["share"]))).toEqual(["social"]);
    });

    it("is a follow when the display text key contains follow", () => {
      const emitted = route(social("pm_main_follow_message_viewer_2"));
      expect(payloads(emitted, "follow")[0]).toMatchObject({
        common: {
          displayText: { key: "pm_main_follow_message_viewer_2" },
        },
        user: SAMPLE_USER,
        shareCount: 1,
      });
      expect(payloads(emitted, "follow")[0]).toBe(
        payloads(emitted, "social")[0],
      );
      // A key with both is a follow.
      expect(names(route(social("follow_share")))).toEqual([
        "social",
        "follow",
      ]);
    });

    it("is a share when it contains share instead", () => {
      const emitted = route(social("pm_mt_guidance_share"));
      expect(names(emitted)).toEqual(["social", "share"]);
      expect(payloads(emitted, "share")[0]).toMatchObject({
        user: SAMPLE_USER,
      });
    });

    it("is neither otherwise", () => {
      expect(names(route(social("pm_mt_msg_viewer_subscribe")))).toEqual([
        "social",
      ]);
      expect(names(route(social("")))).toEqual(["social"]);
      expect(names(route(social(undefined)))).toEqual(["social"]);
      const noText = encoded("WebcastSocialMessage", SocialMessageSchema, {
        common: { method: "WebcastSocialMessage" },
      });
      expect(names(route(noText))).toEqual(["social"]);
    });

    it("compares the key as it is, without lowercasing it (like 2.4.0)", () => {
      expect(names(route(social("PM_MAIN_FOLLOW_MESSAGE")))).toEqual([
        "social",
      ]);
      expect(names(route(social("PM_MT_GUIDANCE_SHARE")))).toEqual(["social"]);
    });
  });

  describe("WebcastRoomPinMessage", () => {
    it("doesn't emit the pinned message as its own event", () => {
      const { context, emitted } = fakeContext({
        listen: ["chat", "roomPin", "gift", "like", "member", "social"],
      });
      dispatch(context, pinnedChat());
      expect(names(emitted)).toEqual(["roomPin"]);
      expect(payloads(emitted, "roomPin")[0]).toMatchObject({
        chatMessage: { content: "pinned" },
        action: 1,
      });
    });

    it("isn't decoded for a chat listener alone", () => {
      const { context, emitted } = fakeContext({ listen: ["chat"] });
      dispatch(context, pinnedChat());
      expect(emitted).toEqual([]);
    });
  });

  it("lists every event of CHAT_EVENTS", () => {
    const events = Object.values(chatRoutes).flatMap((route) => route.events);
    expect(new Set(events)).toEqual(new Set(CHAT_EVENTS));
  });
});
