// The LIVE's state (WebcastControlMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { ControlExtra, ControlMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, PunishEventInfoSchema, TextSchema } from "../common.js";

/** `webcast.model.message.Extra`: the notice shown to the host. */
const ControlExtraSchema = defineSchema<ControlExtra>("Extra", {
  title: f.message(3, TextSchema),
  violationReason: f.message(4, TextSchema),
  content: f.message(5, TextSchema),
});

/** `WebcastControlMessage`. `action` (2) is a `webcast.im.ControlAction`. */
export const ControlMessageSchema = defineSchema<ControlMessage>(
  "WebcastControlMessage",
  {
    common: f.message(1, CommonSchema),
    action: f.enum(2),
    tips: f.string(3),
    extra: f.message(4, ControlExtraSchema),
    punishInfo: f.message(7, PunishEventInfoSchema),
  },
);
