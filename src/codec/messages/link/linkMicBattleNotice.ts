// Battle notices (WebcastLinkmicBattleNoticeMessage). No MIT reference has
// its field numbers: they were derived from observed traffic, matched against
// the field names and types of the MIT types-only package. The evidence:
// PROTOCOL.md, "LIVE messages".
import type {
  BattleNoticeCommonGuide,
  LinkMicBattleNotice,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, TextSchema } from "../common.js";

/** `BattleNoticeCommonGuide`, derived from traffic. */
const BattleNoticeCommonGuideSchema = defineSchema<BattleNoticeCommonGuide>(
  "BattleNoticeCommonGuide",
  {
    displayText: f.message(1, TextSchema),
    exceptAnchor: f.bool(2),
  },
);

/**
 * `WebcastLinkmicBattleNoticeMessage`, derived from traffic. Only the notice
 * in the chat (`common_guide`, 8) has been seen; the other kinds' fields
 * aren't read.
 */
export const LinkMicBattleNoticeSchema = defineSchema<LinkMicBattleNotice>(
  "WebcastLinkmicBattleNoticeMessage",
  {
    common: f.message(1, CommonSchema),
    noticeType: f.enum(2),
    commonGuide: f.message(8, BattleNoticeCommonGuideSchema),
  },
);
