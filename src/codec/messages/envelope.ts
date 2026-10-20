// Treasure chests (WebcastEnvelopeMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { EnvelopeInfo, EnvelopeMessage } from "../../events.js";
import { defineSchema, f } from "../schema.js";
import { CommonSchema } from "./common.js";

/** `webcast.model.message.redenvelope.MessageRedEnvelopInfo`. */
export const EnvelopeInfoSchema = defineSchema<EnvelopeInfo>(
  "MessageRedEnvelopInfo",
  { businessType: f.enum(2) },
);

/** `WebcastEnvelopeMessage`. */
export const EnvelopeMessageSchema = defineSchema<EnvelopeMessage>(
  "WebcastEnvelopeMessage",
  {
    common: f.message(1, CommonSchema),
    envelopeInfo: f.message(2, EnvelopeInfoSchema),
  },
);
