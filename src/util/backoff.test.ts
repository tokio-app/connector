import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS } from "../options.js";
import { backoffDelay, withRetryAfter } from "./backoff.js";

const options = {
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  factor: 2,
  minDelayMs: 0,
};
// Just under 1: the top of the jitter range.
const top = () => 1 - Number.EPSILON;
const bottom = () => 0;

describe("backoffDelay", () => {
  it("draws from half the ceiling up to the ceiling, which grows by the factor each attempt", () => {
    expect(backoffDelay(1, options, bottom)).toBe(500);
    expect(backoffDelay(1, options, top)).toBe(999);
    expect(backoffDelay(2, options, bottom)).toBe(1_000);
    expect(backoffDelay(2, options, top)).toBe(1_999);
    expect(backoffDelay(3, options, top)).toBe(3_999);
    expect(backoffDelay(5, options, bottom)).toBe(8_000);
    expect(backoffDelay(5, options, top)).toBe(15_999);
  });

  it("is an equal jitter: half the ceiling, plus up to as much again", () => {
    expect(backoffDelay(4, options, () => 0.5)).toBe(6_000);
  });

  it("caps the ceiling at maxDelayMs", () => {
    expect(backoffDelay(6, options, top)).toBe(29_999);
    expect(backoffDelay(50, options, bottom)).toBe(15_000);
    expect(backoffDelay(5_000, options, top)).toBe(29_999);
  });

  it("waits at least minDelayMs", () => {
    const floored = { ...options, minDelayMs: 1_000 };
    expect(backoffDelay(1, floored, bottom)).toBe(1_000);
    expect(backoffDelay(1, floored, top)).toBe(1_000);
    expect(backoffDelay(2, floored, bottom)).toBe(1_000);
    expect(backoffDelay(2, floored, top)).toBe(1_999);
    expect(backoffDelay(3, floored, bottom)).toBe(2_000);
    expect(
      backoffDelay(3, { ...options, baseDelayMs: 0, minDelayMs: 250 }, top),
    ).toBe(250);
  });

  it("waits at least 1, 1, 2, 4 and 8 seconds with the defaults, and stays in range", () => {
    const { reconnect } = DEFAULT_OPTIONS;
    expect(
      [1, 2, 3, 4, 5].map((attempt) =>
        backoffDelay(attempt, reconnect, bottom),
      ),
    ).toEqual([1_000, 1_000, 2_000, 4_000, 8_000]);
    for (let attempt = 1; attempt <= 10; attempt++) {
      const delay = backoffDelay(attempt, reconnect);
      const ceiling = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(Math.max(1_000, ceiling / 2));
      expect(delay).toBeLessThanOrEqual(Math.max(1_000, ceiling));
    }
  });

  it("keeps the first ceiling for an attempt below 1, and a flat one with factor 1", () => {
    expect(backoffDelay(0, options, top)).toBe(999);
    expect(backoffDelay(9, { ...options, factor: 1 }, top)).toBe(999);
  });

  it("waits nothing with a base delay and a floor of 0", () => {
    expect(backoffDelay(3, { ...options, baseDelayMs: 0 }, top)).toBe(0);
  });
});

describe("withRetryAfter", () => {
  it("waits at least what the signer asked for", () => {
    expect(withRetryAfter(500, 2_000)).toBe(2_000);
    expect(withRetryAfter(500, 1_500.2)).toBe(1_501);
  });

  it("waits no longer than a timer can", () => {
    expect(withRetryAfter(500, 1e12)).toBe(2_147_483_647);
  });

  it("keeps the delay when it is longer or nothing was asked", () => {
    expect(withRetryAfter(5_000, 2_000)).toBe(5_000);
    expect(withRetryAfter(500, undefined)).toBe(500);
    expect(withRetryAfter(500, Number.NaN)).toBe(500);
    expect(withRetryAfter(500, Infinity)).toBe(500);
    expect(withRetryAfter(500, -1)).toBe(500);
  });
});
