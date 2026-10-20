// Owned by T3 (Phase 1): the wait before each reconnect attempt.
import { ConnectorError } from "../errors.js";
import type { ReconnectOptions } from "../options.js";
import type { RandomSource } from "./random.js";

/**
 * The wait before reconnect attempt `attempt` (from 1), in milliseconds:
 * random between 0 and `min(maxDelayMs, baseDelayMs * factor ** (attempt - 1))`
 * ("full jitter").
 */
export function backoffDelay(
  attempt: number,
  options: Pick<ReconnectOptions, "baseDelayMs" | "maxDelayMs" | "factor">,
  random?: RandomSource,
): number {
  void options;
  void random;
  throw new ConnectorError(
    "NOT_IMPLEMENTED",
    `backoffDelay(${attempt}) is not implemented yet`,
  );
}
