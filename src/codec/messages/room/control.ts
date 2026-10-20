// The LIVE's state (WebcastControlMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { ControlMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `WebcastControlMessage`. */
export const ControlMessageSchema = defineSchema<ControlMessage>(
  "WebcastControlMessage",
  {
    common: f.message(1, CommonSchema),
    action: f.enum(2),
  },
);
