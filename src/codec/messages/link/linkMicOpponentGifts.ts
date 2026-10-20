// Gifts to the other hosts of a battle (WebcastLinkMicOpponentGifts). No MIT
// reference has its field numbers: they were derived from observed traffic,
// each matched against values the library already decodes in the same
// capture. The evidence: PROTOCOL.md, "LIVE messages".
import type { LinkMicOpponentGifts } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, ImageSchema } from "../common.js";

/**
 * `WebcastLinkMicOpponentGifts`, derived from traffic. Fields 13 (a log id)
 * and 14 (an empty message) aren't read.
 */
export const LinkMicOpponentGiftsSchema = defineSchema<LinkMicOpponentGifts>(
  "WebcastLinkMicOpponentGifts",
  {
    common: f.message(1, CommonSchema),
    battleId: f.id(2),
    channelId: f.id(3),
    fromUserId: f.id(4),
    giftToUserId: f.id(5),
    giftId: f.id(6),
    giftCount: f.count(7),
    giftPrice: f.count(8),
    giftIconImage: f.message(9, ImageSchema),
    repeatCount: f.count(10),
    sendGiftSuccessTime: f.id(11),
    updateBattleScoreTime: f.id(12),
  },
);
