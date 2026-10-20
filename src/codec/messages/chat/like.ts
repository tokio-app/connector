// Likes (WebcastLikeMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { LikeMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, UserSchema } from "../common.js";

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
