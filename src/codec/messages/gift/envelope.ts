// Treasure chests (WebcastEnvelopeMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { EnvelopeInfo, EnvelopeMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/**
 * `webcast.model.message.redenvelope.MessageRedEnvelopInfo` [proto:
 * webcast/model/message/redenvelope.proto, line 11]. `envelope_id` (1) and
 * `send_user_id` (8) are strings in the proto; `unpack_at` (7) an int32.
 */
const EnvelopeInfoSchema = defineSchema<EnvelopeInfo>("MessageRedEnvelopInfo", {
  envelopeId: f.string(1),
  businessType: f.enum(2),
  sendUserName: f.string(4),
  diamondCount: f.int32(5),
  peopleCount: f.int32(6),
  unpackAt: f.int32(7),
  sendUserId: f.string(8),
  superFanCount: f.int32(16),
});

/** `WebcastEnvelopeMessage` [proto: webcast/model/message/redenvelope.proto, line 33]. */
export const EnvelopeMessageSchema = defineSchema<EnvelopeMessage>(
  "WebcastEnvelopeMessage",
  {
    common: f.message(1, CommonSchema),
    envelopeInfo: f.message(2, EnvelopeInfoSchema),
  },
);
