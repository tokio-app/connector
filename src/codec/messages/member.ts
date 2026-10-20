// Owned by T1 (Phase 1). Initial table from PROTOCOL.md; T1 checks every field
// number against reference/src/TikTok-Webcast-Protobuf and adds the tests.
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
