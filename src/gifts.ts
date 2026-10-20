import type { GiftMessage } from "./events.js";

/** The gift type of gifts that can be sent in streaks. */
const STREAKABLE_GIFT_TYPE = 1;

/**
 * Whether the gift can be sent in a streak (gift type 1). Each update of a
 * streak arrives as its own `gift` event with a growing `repeatCount`, and the
 * streak ends with one more event that has `repeatEnd` set, even for a streak
 * of one gift.
 */
export function isStreakable(gift: Pick<GiftMessage, "gift">): boolean {
  return gift.gift?.type === STREAKABLE_GIFT_TYPE;
}

/**
 * Whether this `gift` event is the one to count: the end of a streak, or a
 * gift that isn't streakable. Its `repeatCount` is then the final count.
 *
 * ```ts
 * connection.on("gift", (gift) => {
 *   if (isStreakEnd(gift)) thank(gift.user, gift.repeatCount);
 * });
 * ```
 */
export function isStreakEnd(
  gift: Pick<GiftMessage, "gift" | "repeatEnd">,
): boolean {
  return !isStreakable(gift) || gift.repeatEnd;
}
