// Owned by T1 (Phase 1). Initial table from PROTOCOL.md; T1 checks every field
// number against reference/src/TikTok-Webcast-Protobuf and adds the tests.
import type { LikeMessage } from "../../events.js";
import { defineSchema, f } from "../schema.js";
import { CommonSchema, UserSchema } from "./common.js";

/** `WebcastLikeMessage`. */
export const LikeMessageSchema = defineSchema<LikeMessage>(
  "WebcastLikeMessage",
  {
    common: f.message(1, CommonSchema),
    count: f.int32(2),
    total: f.count(3),
    user: f.message(5, UserSchema),
  },
);
