// The tables of the link group (link-mic and battles), by protobuf message
// name. A new table gets a line here, and its route in src/routes/link.ts.
import { LinkMicArmiesSchema } from "./linkMicArmies.js";
import { LinkMicBattleSchema } from "./linkMicBattle.js";
import { LinkMicBattlePunishFinishSchema } from "./linkMicBattlePunishFinish.js";
import { LinkMicBattleTaskSchema } from "./linkMicBattleTask.js";
import { LinkMicBattleItemCardSchema } from "./tail.js";

/** The link group's top-level messages, keyed like a batch's `method`. */
export const linkSchemas = Object.freeze({
  WebcastLinkMicBattle: LinkMicBattleSchema,
  WebcastLinkMicArmies: LinkMicArmiesSchema,
  WebcastLinkMicBattlePunishFinish: LinkMicBattlePunishFinishSchema,
  WebcastLinkmicBattleTaskMessage: LinkMicBattleTaskSchema,
  WebcastLinkMicBattleItemCard: LinkMicBattleItemCardSchema,
});
