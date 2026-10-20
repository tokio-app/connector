// Membership changes (WebcastMemberMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { MemberMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, UserSchema } from "../common.js";

/**
 * `WebcastMemberMessage` [proto: webcast/model/message/messages.proto, line
 * 1607]. `actionId` is the proto's `action` (10, `MemberMessageAction`).
 */
export const MemberMessageSchema = defineSchema<MemberMessage>(
  "WebcastMemberMessage",
  {
    common: f.message(1, CommonSchema),
    user: f.message(2, UserSchema),
    memberCount: f.int32(3),
    operator: f.message(4, UserSchema),
    isSetToAdmin: f.bool(5),
    isTopUser: f.bool(6),
    topUserNo: f.int32(8),
    actionId: f.enum(10),
    userShareType: f.string(23),
    kickSource: f.int32(26),
  },
);
