// Gifts (WebcastGiftMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { GiftDetails, GiftMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import {
  CommonSchema,
  ImageSchema,
  MsgFilterSchema,
  UserIdentitySchema,
  UserSchema,
} from "../common.js";

/** `webcast.model.Gift` [proto: webcast/model/gift.proto, line 10]: the gift a gift message is about. */
const GiftDetailsSchema = defineSchema<GiftDetails>("Gift", {
  image: f.message(1, ImageSchema),
  describe: f.string(2),
  id: f.id(5),
  combo: f.bool(10),
  type: f.int32(11),
  diamondCount: f.int32(12),
  name: f.string(16),
  icon: f.message(21, ImageSchema),
});

/**
 * `WebcastGiftMessage` [proto: webcast/model/message/messages.proto, line
 * 1231]. `repeat_end` (9) is an int32 on the wire, read as a bool;
 * `to_member_id` (45) is a string in the proto (46 holds it as an int64).
 */
export const GiftMessageSchema = defineSchema<GiftMessage>(
  "WebcastGiftMessage",
  {
    common: f.message(1, CommonSchema),
    giftId: f.id(2),
    repeatCount: f.int32(5),
    comboCount: f.int32(6),
    user: f.message(7, UserSchema),
    toUser: f.message(8, UserSchema),
    repeatEnd: f.bool(9),
    groupId: f.id(11),
    gift: f.message(15, GiftDetailsSchema),
    isFirstSent: f.bool(25),
    msgFilter: f.message(30, MsgFilterSchema),
    userIdentity: f.message(32, UserIdentitySchema),
    toMemberId: f.string(45),
    toMemberNickname: f.string(47),
  },
);
