import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS } from "../options.js";
import { backoffDelay, withRetryAfter } from "./backoff.js";

const options = { baseDelayMs: 1_000, maxDelayMs: 30_000, factor: 2 };
// Just under 1: the top of the jitter range.
const top = () => 1 - Number.EPSILON;

describe("backoffDelay", () => {
  it("draws from 0 up to a ceiling that grows by the factor each attempt", () => {
    expect(backoffDelay(1, options, top)).toBe(999);
    expect(backoffDelay(2, options, top)).toBe(1_999);
    expect(backoffDelay(3, options, top)).toBe(3_999);
    expect(backoffDelay(5, options, top)).toBe(15_999);
  });

  it("caps the ceiling at maxDelayMs", () => {
    expect(backoffDelay(6, options, top)).toBe(29_999);
    expect(backoffDelay(50, options, top)).toBe(29_999);
    expect(backoffDelay(5_000, options, top)).toBe(29_999);
  });

  it("is a full jitter: anywhere from 0", () => {
    expect(backoffDelay(4, options, () => 0)).toBe(0);
    expect(backoffDelay(4, options, () => 0.5)).toBe(4_000);
  });

  it("stays in range with the default random source", () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      const delay = backoffDelay(attempt, DEFAULT_OPTIONS.reconnect);
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
    }
  });

  it("keeps the first ceiling for an attempt below 1, and a flat one with factor 1", () => {
    expect(backoffDelay(0, options, top)).toBe(999);
    expect(backoffDelay(9, { ...options, factor: 1 }, top)).toBe(999);
  });

  it("waits nothing with a base delay of 0", () => {
    expect(backoffDelay(3, { ...options, baseDelayMs: 0 }, top)).toBe(0);
  });
});

describe("withRetryAfter", () => {
  it("waits at least what the signer asked for", () => {
    expect(withRetryAfter(500, 2_000)).toBe(2_000);
    expect(withRetryAfter(500, 1_500.2)).toBe(1_501);
  });

  it("keeps the delay when it is longer or nothing was asked", () => {
    expect(withRetryAfter(5_000, 2_000)).toBe(5_000);
    expect(withRetryAfter(500, undefined)).toBe(500);
    expect(withRetryAfter(500, Number.NaN)).toBe(500);
    expect(withRetryAfter(500, Infinity)).toBe(500);
    expect(withRetryAfter(500, -1)).toBe(500);
  });
});
