// Owned by T1 (Phase 1). Initial table from PROTOCOL.md; T1 checks every field
// number against reference/src/TikTok-Webcast-Protobuf and adds the tests.
import type { SocialMessage } from "../../events.js";
import { defineSchema, f } from "../schema.js";
import { CommonSchema, UserSchema } from "./common.js";

/** `WebcastSocialMessage`: follows and shares, told apart by `common.displayText.key`. */
export const SocialMessageSchema = defineSchema<SocialMessage>(
  "WebcastSocialMessage",
  {
    common: f.message(1, CommonSchema),
    user: f.message(2, UserSchema),
    shareType: f.count(3),
    action: f.count(4),
    shareTarget: f.string(5),
    shareCount: f.int32(8),
  },
);
