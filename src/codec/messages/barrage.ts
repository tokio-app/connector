// Banners (WebcastBarrageMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { BarrageMessage } from "../../events.js";
import { defineSchema, f } from "../schema.js";
import { CommonSchema, TextSchema, UserSchema } from "./common.js";

/** `WebcastBarrageMessage`: super fan banners, told apart by their text keys. */
export const BarrageMessageSchema = defineSchema<BarrageMessage>(
  "WebcastBarrageMessage",
  {
    common: f.message(1, CommonSchema),
    content: f.message(5, TextSchema),
    commonBarrageContent: f.message(24, TextSchema),
    user: f.message(50, UserSchema),
  },
);
