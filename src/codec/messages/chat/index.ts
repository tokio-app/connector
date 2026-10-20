// The tables of the chat group (chat, reactions, moderation), by protobuf
// message name. A new table gets a line here, and its route in
// src/routes/chat.ts.
import { CaptionMessageSchema } from "./caption.js";
import { ChatMessageSchema } from "./chat.js";
import { EmoteChatMessageSchema } from "./emote.js";
import { ImDeleteMessageSchema } from "./imDelete.js";
import { LikeMessageSchema } from "./like.js";
import { NoticeMessageSchema } from "./notice.js";
import { QuestionNewMessageSchema } from "./questionNew.js";
import { RoomMessageSchema } from "./roomMessage.js";
import { RoomPinMessageSchema } from "./roomPin.js";
import { SocialMessageSchema } from "./social.js";
import {
  BottomMessageSchema,
  LiveIntroMessageSchema,
  MsgDetectMessageSchema,
  RoomVerifyMessageSchema,
  SystemMessageSchema,
  ToastMessageSchema,
  UnauthorizedMemberMessageSchema,
} from "./tail.js";

/** The chat group's top-level messages, keyed like a batch's `method`. */
export const chatSchemas = Object.freeze({
  WebcastChatMessage: ChatMessageSchema,
  WebcastEmoteChatMessage: EmoteChatMessageSchema,
  WebcastLikeMessage: LikeMessageSchema,
  WebcastSocialMessage: SocialMessageSchema,
  WebcastImDeleteMessage: ImDeleteMessageSchema,
  WebcastRoomPinMessage: RoomPinMessageSchema,
  WebcastQuestionNewMessage: QuestionNewMessageSchema,
  WebcastCaptionMessage: CaptionMessageSchema,
  WebcastRoomMessage: RoomMessageSchema,
  WebcastNoticeMessage: NoticeMessageSchema,
  WebcastSystemMessage: SystemMessageSchema,
  WebcastLiveIntroMessage: LiveIntroMessageSchema,
  WebcastUnauthorizedMemberMessage: UnauthorizedMemberMessageSchema,
  WebcastMsgDetectMessage: MsgDetectMessageSchema,
  WebcastToastMessage: ToastMessageSchema,
  WebcastBottomMessage: BottomMessageSchema,
  WebcastRoomVerifyMessage: RoomVerifyMessageSchema,
});
