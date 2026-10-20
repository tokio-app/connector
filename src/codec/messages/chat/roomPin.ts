// Pinned messages (WebcastRoomPinMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { RoomPinMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, UserSchema } from "../common.js";
import { GiftMessageSchema } from "../gift/gift.js";
import { MemberMessageSchema } from "../gift/member.js";
import { ChatMessageSchema } from "./chat.js";
import { LikeMessageSchema } from "./like.js";
import { SocialMessageSchema } from "./social.js";

/**
 * `WebcastRoomPinMessage` [proto: webcast/model/message/messages.proto, line
 * 1805]: the pinned message is nested whole, in the field of its type. `action`
 * (33) is a `webcast.im.PinMessage_actionType`.
 */
export const RoomPinMessageSchema = defineSchema<RoomPinMessage>(
  "WebcastRoomPinMessage",
  {
    common: f.message(1, CommonSchema),
    chatMessage: f.message(2, ChatMessageSchema),
    socialMessage: f.message(3, SocialMessageSchema),
    giftMessage: f.message(4, GiftMessageSchema),
    memberMessage: f.message(5, MemberMessageSchema),
    likeMessage: f.message(6, LikeMessageSchema),
    method: f.string(30),
    pinTime: f.id(31),
    operator: f.message(32, UserSchema),
    action: f.enum(33),
    pinMsgId: f.id(35),
  },
);
