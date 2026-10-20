// The tables of the gift group (gifts, money, membership), by protobuf
// message name. A new table gets a line here, and its route in
// src/routes/gift.ts.
import { BarrageMessageSchema } from "./barrage.js";
import { EnvelopeMessageSchema } from "./envelope.js";
import { GiftMessageSchema } from "./gift.js";
import { GiftBroadcastMessageSchema } from "./giftBroadcast.js";
import { GoalUpdateMessageSchema } from "./goalUpdate.js";
import { HourlyRankRewardMessageSchema } from "./hourlyRank.js";
import { MemberMessageSchema } from "./member.js";
import { RoomNotifyMessageSchema } from "./roomNotify.js";
import { SubNotifyMessageSchema } from "./subNotify.js";
import { SubPinEventMessageSchema } from "./subPinEvent.js";
import {
  BoostCardMessageSchema,
  GiftDynamicRestrictionMessageSchema,
  GiftPanelUpdateMessageSchema,
  GiftPromptMessageSchema,
  GuideMessageSchema,
} from "./tail.js";
import { ViewerPicksUpdateMessageSchema } from "./viewerPicks.js";

/** The gift group's top-level messages, keyed like a batch's `method`. */
export const giftSchemas = Object.freeze({
  WebcastGiftMessage: GiftMessageSchema,
  WebcastMemberMessage: MemberMessageSchema,
  WebcastEnvelopeMessage: EnvelopeMessageSchema,
  WebcastBarrageMessage: BarrageMessageSchema,
  WebcastSubNotifyMessage: SubNotifyMessageSchema,
  WebcastSubPinEventMessage: SubPinEventMessageSchema,
  WebcastGiftBroadcastMessage: GiftBroadcastMessageSchema,
  WebcastRoomNotifyMessage: RoomNotifyMessageSchema,
  WebcastGoalUpdateMessage: GoalUpdateMessageSchema,
  WebcastViewerPicksUpdateMessage: ViewerPicksUpdateMessageSchema,
  WebcastHourlyRankRewardMessage: HourlyRankRewardMessageSchema,
  WebcastGiftPromptMessage: GiftPromptMessageSchema,
  WebcastGiftPanelUpdateMessage: GiftPanelUpdateMessageSchema,
  WebcastGiftDynamicRestrictionMessage: GiftDynamicRestrictionMessageSchema,
  WebcastGuideMessage: GuideMessageSchema,
  WebcastBoostCardMessage: BoostCardMessageSchema,
});
