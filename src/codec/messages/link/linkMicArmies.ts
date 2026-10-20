// Battle scores (WebcastLinkMicArmies). Field numbers: PROTOCOL.md, "LIVE
// messages", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { LinkMicArmies } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";
import { BattleArmiesEntrySchema } from "./shared.js";

/**
 * `WebcastLinkMicArmies` [proto: webcast/model/message/messages.proto, line
 * 1397]. `armies` (3) is a `map<int64, BattleUserArmies>`, read as its
 * entries.
 */
export const LinkMicArmiesSchema = defineSchema<LinkMicArmies>(
  "WebcastLinkMicArmies",
  {
    common: f.message(1, CommonSchema),
    battleId: f.id(2),
    armies: f.repeated.message(3, BattleArmiesEntrySchema),
    triggerReason: f.enum(7),
    fromUserId: f.id(8),
    giftId: f.id(9),
    giftCount: f.int32(10),
    totalDiamondCount: f.int32(12),
  },
);
