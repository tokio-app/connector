// Live captions (WebcastCaptionMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { CaptionContent, CaptionMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `webcast.model.message.CaptionContent` [proto: webcast/model/message/messages.proto, line 296]. */
const CaptionContentSchema = defineSchema<CaptionContent>("CaptionContent", {
  lang: f.string(1),
  content: f.string(2),
});

/** `WebcastCaptionMessage` [proto: webcast/model/message/messages.proto, line 1142]. */
export const CaptionMessageSchema = defineSchema<CaptionMessage>(
  "WebcastCaptionMessage",
  {
    common: f.message(1, CommonSchema),
    timestampMs: f.id(2),
    durationMs: f.count(3),
    content: f.repeated.message(4, CaptionContentSchema),
    definite: f.bool(7),
  },
);
