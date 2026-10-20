// The routes of the link group: link-mic and battles. The rules are
// PROTOCOL.md's "Routing": every message of the group is forwarded as one
// event. A new message type gets its route here and its table in
// src/codec/messages/link/.
import { BattleGameplayMessageSchema } from "../codec/messages/link/battleGameplay.js";
import { LinkLayerMessageSchema } from "../codec/messages/link/linkLayer.js";
import { LinkMessageSchema } from "../codec/messages/link/linkMessage.js";
import { LinkMicArmiesSchema } from "../codec/messages/link/linkMicArmies.js";
import { LinkMicBattleSchema } from "../codec/messages/link/linkMicBattle.js";
import { LinkMicBattleNoticeSchema } from "../codec/messages/link/linkMicBattleNotice.js";
import { LinkMicBattlePunishFinishSchema } from "../codec/messages/link/linkMicBattlePunishFinish.js";
import { LinkMicBattleTaskSchema } from "../codec/messages/link/linkMicBattleTask.js";
import { LinkMicFanTicketMethodSchema } from "../codec/messages/link/linkMicFanTicketMethod.js";
import { LinkMicMethodSchema } from "../codec/messages/link/linkMicMethod.js";
import { LinkMicOpponentGiftsSchema } from "../codec/messages/link/linkMicOpponentGifts.js";
import { LinkStateMessageSchema } from "../codec/messages/link/linkState.js";
import {
  LinkMicBattleItemCardSchema,
  LinkMicLayoutStateMessageSchema,
} from "../codec/messages/link/tail.js";
import { forward, type AnyRoute } from "./route.js";

/** The link group's routes, by message type (a batch message's `method`). */
export const linkRoutes: Readonly<Record<string, AnyRoute>> = Object.freeze({
  WebcastLinkMicBattle: forward("linkMicBattle", LinkMicBattleSchema),
  WebcastLinkMicArmies: forward("linkMicArmies", LinkMicArmiesSchema),
  WebcastLinkMicBattlePunishFinish: forward(
    "linkMicBattlePunishFinish",
    LinkMicBattlePunishFinishSchema,
  ),
  WebcastLinkmicBattleTaskMessage: forward(
    "linkMicBattleTask",
    LinkMicBattleTaskSchema,
  ),
  WebcastLinkMicFanTicketMethod: forward(
    "linkMicFanTicketMethod",
    LinkMicFanTicketMethodSchema,
  ),
  WebcastLinkMicMethod: forward("linkMicMethod", LinkMicMethodSchema),
  WebcastLinkMessage: forward("linkMessage", LinkMessageSchema),
  WebcastLinkLayerMessage: forward("linkLayer", LinkLayerMessageSchema),
  WebcastLinkStateMessage: forward("linkState", LinkStateMessageSchema),
  WebcastLinkMicBattleItemCard: forward(
    "linkMicBattleItemCard",
    LinkMicBattleItemCardSchema,
  ),
  WebcastLinkMicLayoutStateMessage: forward(
    "linkMicLayoutState",
    LinkMicLayoutStateMessageSchema,
  ),
  WebcastLinkmicBattleNoticeMessage: forward(
    "linkMicBattleNotice",
    LinkMicBattleNoticeSchema,
  ),
  WebcastLinkMicOpponentGifts: forward(
    "linkMicOpponentGifts",
    LinkMicOpponentGiftsSchema,
  ),
  WebcastBattleGameplayMessage: forward(
    "battleGameplay",
    BattleGameplayMessageSchema,
  ),
});
