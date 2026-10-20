// The wait before each reconnect attempt (`ReconnectOptions` in options.ts).
import { MAX_TIMER_MS, type ReconnectOptions } from "../options.js";
import type { RandomSource } from "./random.js";

/** The options {@link backoffDelay} reads. */
export type BackoffOptions = Pick<
  ReconnectOptions,
  "baseDelayMs" | "maxDelayMs" | "factor"
>;

/**
 * The wait before reconnect attempt `attempt` (from 1), in whole
 * milliseconds: random between 0 and
 * `min(maxDelayMs, baseDelayMs * factor ** (attempt - 1))` ("full jitter"),
 * so clients that dropped together don't come back together.
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
  return Math.floor(random() * ceiling);
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
