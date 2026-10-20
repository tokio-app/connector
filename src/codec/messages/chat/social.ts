// Follows and shares (WebcastSocialMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { SocialMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, UserSchema } from "../common.js";

/**
 * `WebcastSocialMessage` [proto: webcast/model/message/messages.proto, line
 * 1846]: follows and shares, told apart by `common.displayText.key`.
 */
export const SocialMessageSchema = defineSchema<SocialMessage>(
  "WebcastSocialMessage",
  {
    common: f.message(1, CommonSchema),
    user: f.message(2, UserSchema),
    shareType: f.count(3),
    action: f.count(4),
    shareTarget: f.string(5),
    followCount: f.count(6),
    shareCount: f.int32(8),
    followType: f.int32(13),
    targetUserId: f.id(14),
  },
);
