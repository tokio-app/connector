import { describe, expect, it } from "vitest";
import { chatSchemas } from "./index.js";

describe("chatSchemas", () => {
  it("holds exactly the chat group's tables, keyed by message name", () => {
    expect(Object.keys(chatSchemas)).toEqual([
      "WebcastChatMessage",
      "WebcastEmoteChatMessage",
      "WebcastLikeMessage",
      "WebcastSocialMessage",
      "WebcastImDeleteMessage",
      "WebcastRoomPinMessage",
      "WebcastQuestionNewMessage",
      "WebcastCaptionMessage",
      "WebcastRoomMessage",
      "WebcastNoticeMessage",
      "WebcastSystemMessage",
      "WebcastLiveIntroMessage",
      "WebcastUnauthorizedMemberMessage",
      "WebcastMsgDetectMessage",
      "WebcastToastMessage",
      "WebcastBottomMessage",
      "WebcastRoomVerifyMessage",
    ]);
    for (const [name, schema] of Object.entries(chatSchemas)) {
      expect(schema.name).toBe(name);
    }
    expect(Object.isFrozen(chatSchemas)).toBe(true);
  });
});
