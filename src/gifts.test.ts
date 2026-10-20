import { describe, expect, it } from "vitest";
import { decodeMessage } from "./codec/decode.js";
import { GiftMessageSchema } from "./codec/messages/gift/gift.js";
import type { GiftDetails } from "./events/index.js";
import { isStreakEnd, isStreakable } from "./gifts.js";
import { concat, fields } from "../test/helpers/encoder.js";

const details = (type: number): GiftDetails => ({
  id: "5655",
  name: "Rose",
  diamondCount: 1,
  type,
  describe: "",
  combo: false,
});

describe("isStreakable", () => {
  it("is true for gift type 1 only", () => {
    expect(isStreakable({ gift: details(1) })).toBe(true);
    expect(isStreakable({ gift: details(2) })).toBe(false);
    expect(isStreakable({ gift: details(0) })).toBe(false);
  });

  it("is false when the gift details are missing", () => {
    expect(isStreakable({})).toBe(false);
  });
});

describe("isStreakEnd", () => {
  it("waits for repeatEnd on streakable gifts", () => {
    expect(isStreakEnd({ gift: details(1), repeatEnd: false })).toBe(false);
    expect(isStreakEnd({ gift: details(1), repeatEnd: true })).toBe(true);
  });

  it("is true for every event of a gift that isn't streakable", () => {
    expect(isStreakEnd({ gift: details(2), repeatEnd: false })).toBe(true);
    expect(isStreakEnd({ gift: details(2), repeatEnd: true })).toBe(true);
    expect(isStreakEnd({ repeatEnd: false })).toBe(true);
  });
});

describe("on decoded gift messages", () => {
  // A gift message as TikTok sends it: gift_id (2), repeat_count (5),
  // repeat_end (9, an int32) and the gift (15) with its id (5) and type (11).
  const giftMessage = (type: number, repeatCount: number, repeatEnd: number) =>
    decodeMessage(
      GiftMessageSchema,
      concat(
        fields.varint(2, 5655),
        fields.varint(5, repeatCount),
        fields.varint(9, repeatEnd),
        fields.message(15, fields.varint(5, 5655), fields.varint(11, type)),
      ),
    );

  it("counts a streak once, at its end, with its final count", () => {
    // Three roses in a streak: one message per update, then one more with
    // repeat_end set.
    const streak = [
      giftMessage(1, 1, 0),
      giftMessage(1, 2, 0),
      giftMessage(1, 3, 0),
      giftMessage(1, 3, 1),
    ];
    expect(streak.map((gift) => isStreakable(gift))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    const counted = streak.filter((gift) => isStreakEnd(gift));
    expect(counted.map((gift) => gift.repeatCount)).toEqual([3]);
  });

  it("counts a streak of one gift at its end too", () => {
    const streak = [giftMessage(1, 1, 0), giftMessage(1, 1, 1)];
    expect(streak.map((gift) => isStreakEnd(gift))).toEqual([false, true]);
  });

  it("counts each message of a gift that isn't streakable", () => {
    const gifts = [giftMessage(2, 1, 0), giftMessage(2, 1, 1)];
    expect(gifts.map((gift) => isStreakEnd(gift))).toEqual([true, true]);
  });
});
