// The routes of the gift group: gifts, money and membership. The rules are
// PROTOCOL.md's "Routing". A new message type gets its route here and its
// table in src/codec/messages/gift/.
import { BarrageMessageSchema } from "../codec/messages/gift/barrage.js";
import { EnvelopeMessageSchema } from "../codec/messages/gift/envelope.js";
import { GiftMessageSchema } from "../codec/messages/gift/gift.js";
import { GiftBroadcastMessageSchema } from "../codec/messages/gift/giftBroadcast.js";
import { GoalUpdateMessageSchema } from "../codec/messages/gift/goalUpdate.js";
import { HourlyRankRewardMessageSchema } from "../codec/messages/gift/hourlyRank.js";
import { MemberMessageSchema } from "../codec/messages/gift/member.js";
import { RoomNotifyMessageSchema } from "../codec/messages/gift/roomNotify.js";
import { SubNotifyMessageSchema } from "../codec/messages/gift/subNotify.js";
import { SubPinEventMessageSchema } from "../codec/messages/gift/subPinEvent.js";
import {
  BoostCardMessageSchema,
  GiftDynamicRestrictionMessageSchema,
  GiftPanelUpdateMessageSchema,
  GiftPromptMessageSchema,
  GuideMessageSchema,
} from "../codec/messages/gift/tail.js";
import { ViewerPicksUpdateMessageSchema } from "../codec/messages/gift/viewerPicks.js";
import {
  EnvelopeBusinessType,
  type BarrageMessage,
  type EnvelopeMessage,
} from "../events/index.js";
import { defineRoute, forward, type AnyRoute } from "./route.js";

// The text keys that mark super fan messages (from 2.4.0), matched lowercased.
// The join key also contains the super fan key, so it is checked first.
const SUPER_FAN_BOX_KEY = "ttlive_superfanbox";
const SUPER_FAN_JOINED_KEY = "ttlive_superfan_commentnotif_superfanjoined";
const SUPER_FAN_KEY = "ttlive_superfan";

/** Whether an envelope is a super fan box: by its text key or its business type. */
function isSuperFanBox(message: EnvelopeMessage): boolean {
  const key = message.common?.displayText?.key ?? "";
  return (
    key.toLowerCase().includes(SUPER_FAN_BOX_KEY) ||
    message.envelopeInfo?.businessType === EnvelopeBusinessType.SUPER_FAN_BOX
  );
}

/** The super fan event a banner is, if any, from its two text keys. */
function superFanEvent(
  message: BarrageMessage,
): "superFanJoin" | "superFan" | undefined {
  const keys = [message.content, message.commonBarrageContent].map(
    (text) => text?.key.toLowerCase() ?? "",
  );
  if (keys.some((key) => key.includes(SUPER_FAN_JOINED_KEY))) {
    return "superFanJoin";
  }
  if (keys.some((key) => key.includes(SUPER_FAN_KEY))) return "superFan";
  return undefined;
}

/** The gift group's routes, by message type (a batch message's `method`). */
export const giftRoutes: Readonly<Record<string, AnyRoute>> = Object.freeze({
  WebcastGiftMessage: forward("gift", GiftMessageSchema),
  WebcastMemberMessage: forward("member", MemberMessageSchema),
  // Every envelope is an `envelope`; a super fan box is a `superFanBox`
  // first (the order 0.1.0 had, kept).
  WebcastEnvelopeMessage: defineRoute({
    schema: EnvelopeMessageSchema,
    events: ["superFanBox", "envelope"],
    emit(message, context) {
      if (isSuperFanBox(message)) context.emit("superFanBox", message);
      context.emit("envelope", message);
    },
  }),
  // Every banner is a `barrage`; a super fan banner is then a
  // `superFanJoin` or `superFan` (base events before derived ones).
  WebcastBarrageMessage: defineRoute({
    schema: BarrageMessageSchema,
    events: ["barrage", "superFanJoin", "superFan"],
    emit(message, context) {
      context.emit("barrage", message);
      const event = superFanEvent(message);
      if (event !== undefined) context.emit(event, message);
    },
  }),
  WebcastSubNotifyMessage: forward("subNotify", SubNotifyMessageSchema),
  WebcastSubPinEventMessage: forward("subPinEvent", SubPinEventMessageSchema),
  // The notify inside a gift broadcast is not emitted again as a `roomNotify`.
  WebcastGiftBroadcastMessage: forward(
    "giftBroadcast",
    GiftBroadcastMessageSchema,
  ),
  WebcastRoomNotifyMessage: forward("roomNotify", RoomNotifyMessageSchema),
  WebcastGoalUpdateMessage: forward("goalUpdate", GoalUpdateMessageSchema),
  WebcastViewerPicksUpdateMessage: forward(
    "viewerPicksUpdate",
    ViewerPicksUpdateMessageSchema,
  ),
  WebcastHourlyRankRewardMessage: forward(
    "hourlyRank",
    HourlyRankRewardMessageSchema,
  ),
  WebcastGiftPromptMessage: forward("giftPrompt", GiftPromptMessageSchema),
  WebcastGiftPanelUpdateMessage: forward(
    "giftPanelUpdate",
    GiftPanelUpdateMessageSchema,
  ),
  WebcastGiftDynamicRestrictionMessage: forward(
    "giftDynamicRestriction",
    GiftDynamicRestrictionMessageSchema,
  ),
  WebcastGuideMessage: forward("guide", GuideMessageSchema),
  WebcastBoostCardMessage: forward("boostCard", BoostCardMessageSchema),
});
