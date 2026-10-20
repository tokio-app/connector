// Owned by T1 (Phase 1). Initial table from PROTOCOL.md; T1 checks every field
// number against reference/src/TikTok-Webcast-Protobuf and adds the tests.
import type { EnvelopeInfo, EnvelopeMessage } from "../../events.js";
import { defineSchema, f } from "../schema.js";
import { CommonSchema } from "./common.js";

/** `webcast.model.data.EnvelopeBusinessType.SUPER_FAN_BOX`. */
export const SUPER_FAN_BOX_BUSINESS_TYPE = 19;

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
