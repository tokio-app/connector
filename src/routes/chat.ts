// The routes of the chat group: chat, reactions and moderation. The rules
// are PROTOCOL.md's "Routing". A new message type gets its route here and
// its table in src/codec/messages/chat/.
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
import { defineRoute, forward, type AnyRoute } from "./route.js";

/** The chat group's routes, by message type (a batch message's `method`). */
export const chatRoutes: Readonly<Record<string, AnyRoute>> = Object.freeze({
  WebcastChatMessage: forward("chat", ChatMessageSchema),
  WebcastEmoteChatMessage: forward("emote", EmoteChatMessageSchema),
  WebcastLikeMessage: forward("like", LikeMessageSchema),
  // Every social message is a `social` (2.4.0 emitted it only when the
  // message was neither a follow nor a share). Follows and shares share the
  // message type; the key of the text TikTok shows for them tells them apart
  // (as is, not lowercased, like 2.4.0), and comes after the base event.
  WebcastSocialMessage: defineRoute({
    schema: SocialMessageSchema,
    events: ["social", "follow", "share"],
    emit(message, context) {
      context.emit("social", message);
      const key = message.common?.displayText?.key ?? "";
      if (key.includes("follow")) context.emit("follow", message);
      else if (key.includes("share")) context.emit("share", message);
    },
  }),
  WebcastImDeleteMessage: forward("imDelete", ImDeleteMessageSchema),
  // The pinned message travels inside the pin; it isn't emitted again as a
  // `chat`, `gift`, `like`, `member` or `social` of its own.
  WebcastRoomPinMessage: forward("roomPin", RoomPinMessageSchema),
  WebcastQuestionNewMessage: forward("questionNew", QuestionNewMessageSchema),
  WebcastCaptionMessage: forward("captionMessage", CaptionMessageSchema),
  WebcastRoomMessage: forward("roomMessage", RoomMessageSchema),
  WebcastNoticeMessage: forward("notice", NoticeMessageSchema),
  WebcastSystemMessage: forward("system", SystemMessageSchema),
  WebcastLiveIntroMessage: forward("liveIntro", LiveIntroMessageSchema),
  WebcastUnauthorizedMemberMessage: forward(
    "unauthorizedMember",
    UnauthorizedMemberMessageSchema,
  ),
  WebcastMsgDetectMessage: forward("msgDetect", MsgDetectMessageSchema),
  WebcastToastMessage: forward("toast", ToastMessageSchema),
  WebcastBottomMessage: forward("bottomMessage", BottomMessageSchema),
  WebcastRoomVerifyMessage: forward("roomVerify", RoomVerifyMessageSchema),
});
