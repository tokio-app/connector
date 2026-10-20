// Rank notices in the chat (WebcastRankTextMessage). Field numbers:
// PROTOCOL.md, "Field numbers", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { RankTextMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, TextSchema } from "../common.js";

/**
 * `WebcastRankTextMessage`. `scene` (2) is a
 * `webcast.im.RankTextMessage_RankTestMessageScene`, `rank_type` (10) a
 * `webcast.model.data.ProfitRankType`.
 */
export const RankTextMessageSchema = defineSchema<RankTextMessage>(
  "WebcastRankTextMessage",
  {
    common: f.message(1, CommonSchema),
    scene: f.enum(2),
    ownerIdxBefore: f.count(3),
    ownerIdxAfter: f.count(4),
    curUserId: f.id(7),
    content: f.message(9, TextSchema),
    rankType: f.enum(10),
  },
);
