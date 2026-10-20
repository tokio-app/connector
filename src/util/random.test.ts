import { describe, expect, it } from "vitest";
import { randomDigits, randomEnterUniqueId, randomLastRtt } from "./random.js";

describe("randomDigits", () => {
  it("makes the asked number of decimal digits", () => {
    expect(randomDigits(19)).toMatch(/^\d{19}$/);
    expect(randomDigits(0)).toBe("");
  });

  it("uses the random source", () => {
    const values = [0, 0.15, 0.999];
    expect(randomDigits(3, () => values.shift()!)).toBe("019");
  });
});

describe("randomEnterUniqueId", () => {
  it("makes a positive 63-bit integer", () => {
    for (let index = 0; index < 20; index++) {
      const id = BigInt(randomEnterUniqueId());
      expect(id).toBeGreaterThan(0n);
      expect(id).toBeLessThan(2n ** 63n);
    }
  });

  it("clears the top bit", () => {
    expect(randomEnterUniqueId(() => new Uint8Array(8).fill(0xff))).toBe(
      (2n ** 63n - 1n).toString(),
    );
    expect(
      randomEnterUniqueId(() => Uint8Array.of(0x80, 0, 0, 0, 0, 0, 0, 2)),
    ).toBe("2");
  });

  it("never returns 0", () => {
    expect(randomEnterUniqueId(() => new Uint8Array(8))).toBe("1");
    expect(
      randomEnterUniqueId(() => Uint8Array.of(0x80, 0, 0, 0, 0, 0, 0, 0)),
    ).toBe("1");
  });
});

describe("randomLastRtt", () => {
  it("is between 100 and 200", () => {
    const rtt = Number(randomLastRtt());
    expect(rtt).toBeGreaterThanOrEqual(100);
    expect(rtt).toBeLessThan(200);
    expect(randomLastRtt(() => 0.5)).toBe("150");
    expect(randomLastRtt(() => 0.123)).toBe("112.3");
  });
});
