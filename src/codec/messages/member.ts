// Membership changes (WebcastMemberMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { MemberMessage } from "../../events.js";
import { defineSchema, f } from "../schema.js";
import { CommonSchema, UserSchema } from "./common.js";

/** `WebcastMemberMessage`. `actionId` is the proto's `action` (`MemberMessageAction`). */
export const MemberMessageSchema = defineSchema<MemberMessage>(
  "WebcastMemberMessage",
  {
    common: f.message(1, CommonSchema),
    user: f.message(2, UserSchema),
    actionId: f.enum(10),
  },
);
