// Random values TikTok's web client makes: the device id, the enter room
// message's id and the WebSocket's last_rtt.
import { randomBytes } from "node:crypto";

/** Returns a random number in [0, 1), like `Math.random`. */
export type RandomSource = () => number;

/** `count` random decimal digits, as TikTok's web client makes its `device_id` (19 digits). */
export function randomDigits(
  count: number,
  random: RandomSource = Math.random,
): string {
  let digits = "";
  for (let index = 0; index < count; index++) {
    digits += Math.floor(random() * 10).toString();
  }
  return digits;
}

/**
 * A random positive 63-bit integer, as a decimal string: the
 * `enter_unique_id` of the enter room message. Never 0.
 */
export function randomEnterUniqueId(
  bytes: (size: number) => Uint8Array = randomBytes,
): string {
  const random = bytes(8);
  let value = 0n;
  for (const byte of random) value = (value << 8n) | BigInt(byte);
  value &= (1n << 63n) - 1n;
  return (value === 0n ? 1n : value).toString();
}

/** A random round-trip time between 100 and 200 ms, as the `last_rtt` WebSocket parameter. */
export function randomLastRtt(random: RandomSource = Math.random): string {
  return (random() * 100 + 100).toString();
}
