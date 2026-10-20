// A host's tool changes, such as camera filters
// (WebcastAnchorToolModificationMessage). No MIT reference has its field
// numbers: they were derived from observed traffic, matched against values
// the library already decodes in the same capture and the field names of the
// MIT types-only package. The evidence: PROTOCOL.md, "LIVE messages".
import type {
  AnchorToolModification,
  AnchorToolModificationMessage,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `AnchorToolModification`, derived from traffic. The fields without evidence aren't read. */
const AnchorToolModificationSchema = defineSchema<AnchorToolModification>(
  "AnchorToolModification",
  {
    roomId: f.id(1),
    userId: f.id(2),
    name: f.string(4),
    startTime: f.id(10),
    endTime: f.id(11),
    duration: f.count(12),
  },
);

/** `WebcastAnchorToolModificationMessage`, derived from traffic. */
export const AnchorToolModificationMessageSchema =
  defineSchema<AnchorToolModificationMessage>(
    "WebcastAnchorToolModificationMessage",
    {
      common: f.message(1, CommonSchema),
      modification: f.message(2, AnchorToolModificationSchema),
    },
  );
