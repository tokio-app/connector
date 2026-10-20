// Violation notices to the host (WebcastPerceptionMessage). Field numbers:
// PROTOCOL.md, "Field numbers", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  PerceptionDialog,
  PerceptionMessage,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, PunishEventInfoSchema, TextSchema } from "../common.js";

/** `webcast.model.message.PerceptionDialogInfo`. `icon_type` (1) is a `webcast.model.data.PerceptionDialogIconType`. */
const PerceptionDialogSchema = defineSchema<PerceptionDialog>(
  "PerceptionDialogInfo",
  {
    iconType: f.enum(1),
    title: f.message(2, TextSchema),
    subTitle: f.message(3, TextSchema),
    scene: f.int32(7),
  },
);

/** `WebcastPerceptionMessage`. */
export const PerceptionMessageSchema = defineSchema<PerceptionMessage>(
  "WebcastPerceptionMessage",
  {
    common: f.message(1, CommonSchema),
    dialog: f.message(2, PerceptionDialogSchema),
    punishInfo: f.message(3, PunishEventInfoSchema),
  },
);
