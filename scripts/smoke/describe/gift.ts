// The sample lines of the gift group's events (gifts, money, membership).
// Pure functions; gift.test.ts checks them.
import {
  isStreakable,
  MemberAction,
  SubPinAction,
  type BarrageMessage,
  type EnvelopeMessage,
  type GiftBroadcastMessage,
  type GiftMessage,
  type GoalUpdateMessage,
  type HourlyRankRewardMessage,
  type MemberMessage,
  type RoomNotifyMessage,
  type SubNotifyMessage,
  type SubPinEventMessage,
  type ViewerPicksUpdateMessage,
  type WebcastEventMap,
} from "../../../src/index.js";
import type { GiftEvent } from "../../../src/routes/groups.js";
import { formatCount, nickname, quote } from "../../lib/format.js";

const MEMBER_ACTIONS: Readonly<Record<number, string>> = {
  [MemberAction.JOINED]: "joined",
  [MemberAction.SUBSCRIBED]: "subscribed",
};

const SUB_PIN_ACTIONS: Readonly<Record<number, string>> = {
  [SubPinAction.PIN]: "pinned",
  [SubPinAction.UNPIN]: "unpinned",
};

function barrageKey(barrage: BarrageMessage): string {
  return barrage.content?.key || barrage.commonBarrageContent?.key || "no key";
}

function describeSuperFan(barrage: BarrageMessage): string {
  return `${nickname(barrage.user)} (${barrageKey(barrage)})`;
}

function businessType(envelope: EnvelopeMessage): string {
  return String(envelope.envelopeInfo?.businessType ?? "unknown");
}

function describeRoomNotify(notify: RoomNotifyMessage): string {
  const who = notify.user ? `${nickname(notify.user)}: ` : "";
  return `${who}${quote(notify.content)} (type ${notify.notifyType})`;
}

/** The gift group's describers: one per event with a sample line of its own. */
export const giftDescribers = {
  gift: (gift: GiftMessage) => {
    const name = gift.gift?.name || `gift ${gift.giftId}`;
    const streak = isStreakable(gift)
      ? gift.repeatEnd
        ? ", streak end"
        : ", streak"
      : "";
    return `${nickname(gift.user)} sent ${name} x${gift.repeatCount}${streak}`;
  },
  member: (member: MemberMessage) =>
    `${nickname(member.user)} ${MEMBER_ACTIONS[member.actionId] ?? `(action ${member.actionId})`}`,
  subNotify: (notify: SubNotifyMessage) =>
    `${nickname(notify.user)} subscribed, month ${notify.subMonth}${notify.isSend ? ", gifted" : ""} (type ${notify.messageType})`,
  subPinEvent: (pin: SubPinEventMessage) => {
    const action =
      SUB_PIN_ACTIONS[pin.actionType] ?? `action ${pin.actionType}`;
    const title = pin.card?.title?.content;
    return `card ${action}${title ? `: ${quote(title)}` : ""}`;
  },
  barrage: (barrage: BarrageMessage) =>
    `${describeSuperFan(barrage)}, type ${barrage.msgType}`,
  envelope: (envelope: EnvelopeMessage) =>
    `treasure chest, business type ${businessType(envelope)}`,
  superFan: describeSuperFan,
  superFanJoin: describeSuperFan,
  superFanBox: (envelope: EnvelopeMessage) =>
    `super fan box, business type ${businessType(envelope)}`,
  giftBroadcast: (broadcast: GiftBroadcastMessage) =>
    broadcast.notify
      ? describeRoomNotify(broadcast.notify)
      : `from user ${broadcast.fromUserId}`,
  roomNotify: describeRoomNotify,
  goalUpdate: (update: GoalUpdateMessage) => {
    const goal = update.goal;
    if (goal === undefined) return `goal update, source ${update.updateSource}`;
    const steps = goal.subGoals
      .map(
        (step) => `${formatCount(step.progress)}/${formatCount(step.target)}`,
      )
      .join(", ");
    return `${quote(goal.description)} ${steps || "no steps"} (source ${update.updateSource})`;
  },
  viewerPicksUpdate: (update: ViewerPicksUpdateMessage) =>
    `viewer picks ${update.info?.viewerPicksId ?? "?"}, ${update.info?.giftPickList.length ?? 0} picks (update type ${update.updateType})`,
  hourlyRank: (reward: HourlyRankRewardMessage) =>
    `${formatCount(reward.winners.length)} winners: ${reward.winners.map((winner) => winner.userId).join(", ") || "none"}`,
} satisfies { [K in GiftEvent]?: (payload: WebcastEventMap[K]) => string };
