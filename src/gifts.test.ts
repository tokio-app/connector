import { describe, expect, it } from "vitest";
import type { GiftDetails } from "./events.js";
import { isStreakEnd, isStreakable } from "./gifts.js";

const details = (type: number): GiftDetails => ({
  id: "5655",
  name: "Rose",
  diamondCount: 1,
  type,
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
    expect(isStreakEnd({ repeatEnd: false })).toBe(true);
  });
});
