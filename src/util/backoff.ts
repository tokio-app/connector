// The wait before each reconnect attempt (`ReconnectOptions` in options.ts).
import { MAX_TIMER_MS, type ReconnectOptions } from "../options.js";
import type { RandomSource } from "./random.js";

/** The options {@link backoffDelay} reads. */
export type BackoffOptions = Pick<
  ReconnectOptions,
  "baseDelayMs" | "maxDelayMs" | "factor" | "minDelayMs"
>;

/**
 * The wait before reconnect attempt `attempt` (from 1), in whole
 * milliseconds. With `d = min(maxDelayMs, baseDelayMs * factor ** (attempt - 1))`,
 * a random time from `d / 2` up to `d` ("equal jitter": clients that dropped
 * together don't come back together, and none comes back at once), and at
 * least `minDelayMs`. Every attempt is a request to the signer, whose
 * limits are low without an API key.
 */
export function backoffDelay(
  attempt: number,
  options: BackoffOptions,
  random: RandomSource = Math.random,
): number {
  const ceiling = Math.min(
    options.maxDelayMs,
    options.baseDelayMs * options.factor ** Math.max(0, attempt - 1),
  );
  const half = ceiling / 2;
  return Math.max(options.minDelayMs, Math.floor(half + random() * half));
}

/**
 * `delayMs`, or the wait the signer asked for (a `RateLimitError`'s
 * `retryAfterMs`) when that is longer, up to {@link MAX_TIMER_MS}: a timer
 * fires a longer wait at once.
 */
export function withRetryAfter(
  delayMs: number,
  retryAfterMs: number | undefined,
): number {
  return retryAfterMs !== undefined &&
    Number.isFinite(retryAfterMs) &&
    retryAfterMs > delayMs
    ? Math.min(Math.ceil(retryAfterMs), MAX_TIMER_MS)
    : delayMs;
}
