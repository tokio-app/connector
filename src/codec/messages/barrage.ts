// Owned by T1 (Phase 1). Initial table from PROTOCOL.md; T1 checks every field
// number against reference/src/TikTok-Webcast-Protobuf and adds the tests.
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
