// The link group's tail: messages read as their common data and a few
// scalars. Field numbers: PROTOCOL.md, "LIVE messages", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { LinkMicBattleItemCard } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `WebcastLinkMicBattleItemCard` [proto: webcast/model/message/messages.proto, line 1458]. */
export const LinkMicBattleItemCardSchema = defineSchema<LinkMicBattleItemCard>(
  "WebcastLinkMicBattleItemCard",
  {
    common: f.message(1, CommonSchema),
    battleId: f.id(2),
    msgType: f.enum(3),
    awardReason: f.int32(16),
  },
);
