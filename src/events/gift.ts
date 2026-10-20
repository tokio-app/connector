// The gift group: gifts, money and membership. The tables are in
// src/codec/messages/gift/, the routes in src/routes/gift.ts.
import type { Common, GiftDetails, Text, User } from "./shared.js";

/**
 * A gift (`gift` event). Streakable gifts arrive several times: once per
 * update of the streak, with a growing `repeatCount`, and a last time with
 * `repeatEnd` set. `isStreakEnd()` says when to count one.
 */
export interface GiftMessage {
  /** Data every message carries. */
  common?: Common;
  /** Who sent the gift. */
  user?: User;
  /** The gift id. */
  giftId: string;
  /** How many of the gift were sent so far in this streak. */
  repeatCount: number;
  /** `true` on the event that ends a streak. */
  repeatEnd: boolean;
  /** TikTok's combo counter for the gift. */
  comboCount: number;
  /** Groups the events of one streak. */
  groupId: string;
  /** The gift. */
  gift?: GiftDetails;
}

/**
 * The values of {@link MemberMessage.actionId} TikTok defines
 * (`webcast.im.MemberMessageAction`), so apps needn't hard-code the numbers:
 *
 * ```ts
 * connection.on("member", (member) => {
 *   if (member.actionId === MemberAction.JOINED) greet(member.user);
 * });
 * ```
 */
export const MemberAction = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** The viewer joined the LIVE. */
  JOINED: 1,
  /** The viewer subscribed to the host. */
  SUBSCRIBED: 3,
} as const);

/** A viewer joining, or another membership change (`member` event). */
export interface MemberMessage {
  /** Data every message carries. */
  common?: Common;
  /** The member. */
  user?: User;
  /**
   * What happened: `1` joined, `3` subscribed, `0` unknown ({@link MemberAction}).
   * Other values may come: it stays a number.
   */
  actionId: number;
}

/**
 * Values of {@link EnvelopeInfo.businessType} (`webcast.model.data.EnvelopeBusinessType`)
 * the library acts on. The other values TikTok uses are kinds of diamond,
 * platform and campaign chests.
 */
export const EnvelopeBusinessType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A super fan box: the envelope is also a `superFanBox` event. */
  SUPER_FAN_BOX: 19,
} as const);

/** Details of a treasure chest. */
export interface EnvelopeInfo {
  /** What kind of chest: `19` is a super fan box ({@link EnvelopeBusinessType}). */
  businessType: number;
}

/** A treasure chest (`envelope` event; also `superFanBox` for super fan boxes). */
export interface EnvelopeMessage {
  /** Data every message carries. */
  common?: Common;
  /** The chest. */
  envelopeInfo?: EnvelopeInfo;
}

/** A banner message (`superFan` and `superFanJoin` events). */
export interface BarrageMessage {
  /** Data every message carries. */
  common?: Common;
  /** The user the banner is about. */
  user?: User;
  /** The banner text. Routing reads its `key`. */
  content?: Text;
  /** The banner's common text. Routing reads its `key` too. */
  commonBarrageContent?: Text;
}
