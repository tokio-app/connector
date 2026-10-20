// The LIVE's state (WebcastControlMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { ControlMessage } from "../../events.js";
import { defineSchema, f } from "../schema.js";
import { CommonSchema } from "./common.js";

/** `webcast.im.ControlAction` values (`synthetic_enums.proto`). */
export const ControlAction = {
  PAUSED: 1,
  UNPAUSED: 2,
  STREAM_ENDED: 3,
  STREAM_SUSPENDED: 4,
} as const;

/** `WebcastControlMessage`. */
export const ControlMessageSchema = defineSchema<ControlMessage>(
  "WebcastControlMessage",
  {
    common: f.message(1, CommonSchema),
    action: f.enum(2),
  },
);
