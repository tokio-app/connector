// The sample lines of the gift group's events (gifts, money, membership).
// Pure functions; gift.test.ts checks them.
import {
  isStreakable,
  MemberAction,
  type BarrageMessage,
  type EnvelopeMessage,
  type GiftMessage,
  type MemberMessage,
  type WebcastEventMap,
} from "../../../src/index.js";
import type { GiftEvent } from "../../../src/routes/groups.js";
import { nickname } from "../../lib/format.js";

const MEMBER_ACTIONS: Readonly<Record<number, string>> = {
  [MemberAction.JOINED]: "joined",
  [MemberAction.SUBSCRIBED]: "subscribed",
};

function describeSuperFan(barrage: BarrageMessage): string {
  const key =
    barrage.content?.key || barrage.commonBarrageContent?.key || "no key";
  return `${nickname(barrage.user)} (${key})`;
}

function businessType(envelope: EnvelopeMessage): string {
  return String(envelope.envelopeInfo?.businessType ?? "unknown");
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
  envelope: (envelope: EnvelopeMessage) =>
    `treasure chest, business type ${businessType(envelope)}`,
  superFan: describeSuperFan,
  superFanJoin: describeSuperFan,
  superFanBox: (envelope: EnvelopeMessage) =>
    `super fan box, business type ${businessType(envelope)}`,
} satisfies { [K in GiftEvent]?: (payload: WebcastEventMap[K]) => string };
