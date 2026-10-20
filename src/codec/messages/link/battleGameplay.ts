// A battle's gameplays, such as an ice showdown (WebcastBattleGameplayMessage).
// No MIT reference has its field numbers: they were derived from observed
// traffic, matched against values the library already decodes in the same
// capture and the field names and types of the MIT types-only package. The
// evidence: PROTOCOL.md, "LIVE messages".
import type {
  BattleGameplayMessage,
  IceShowdownInfo,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `IceShowdownInfo`, derived from traffic. */
const IceShowdownInfoSchema = defineSchema<IceShowdownInfo>("IceShowdownInfo", {
  settingType: f.enum(1),
  promptTimeMs: f.id(2),
  startTimeMs: f.id(3),
});

/**
 * `WebcastBattleGameplayMessage`, derived from traffic. Fields 3 and 4 (the
 * gameplay and update types, which traffic can't tell apart) aren't read.
 */
export const BattleGameplayMessageSchema = defineSchema<BattleGameplayMessage>(
  "WebcastBattleGameplayMessage",
  {
    common: f.message(1, CommonSchema),
    battleId: f.id(2),
    iceShowdownInfo: f.message(5, IceShowdownInfoSchema),
  },
);
