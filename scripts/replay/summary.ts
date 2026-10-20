// What `yarn replay` prints: a capture's replay as text, and its exit status.
// Pure; tested in summary.test.ts.
import type { Fixture } from "../capture/fixture.js";
import { formatRows, formatSeconds } from "../lib/format.js";
import { unroutedMethods, type Replay } from "../lib/replay.js";

// Counts by name, the largest first, then by name.
function byCount(counts: Record<string, number>): [string, number][] {
  return Object.entries(counts).sort(
    ([a, countA], [b, countB]) => countB - countA || (a < b ? -1 : 1),
  );
}

/**
 * A payload as one line of JSON: byte fields as `<N bytes>`, so a sample
 * stays readable.
 */
export function compactJson(value: unknown): string {
  return (
    JSON.stringify(value, (_key, field: unknown) =>
      field instanceof Uint8Array ? `<${field.length} bytes>` : field,
    ) ?? String(value)
  );
}

function section(title: string, lines: string[]): string[] {
  return ["", title, ...(lines.length > 0 ? lines : ["  none"])];
}

/**
 * The replay of `fixture` (read from `name`) as lines: the capture, the
 * messages per method, the events, the methods without an event, the decode
 * errors, and with `samples` the first payload of each event.
 */
export function formatReplay(
  name: string,
  fixture: Fixture,
  result: Replay,
  options: { samples: boolean },
): string {
  const total = Object.values(result.counts).reduce((sum, n) => sum + n, 0);
  const who =
    fixture.username === undefined ? "anonymized" : `@${fixture.username}`;
  const unrouted = unroutedMethods(result.counts);
  const errors = result.errors.map(
    ({ method, msgId, error }) => `  ${method} ${msgId}: ${error.message}`,
  );
  const lines = [
    `${name}: ${total.toLocaleString("en-US")} messages in ${formatSeconds(fixture.durationMs)}, room ${fixture.roomId}, ${who}, captured ${fixture.capturedAt}`,
    ...section("Messages by method", formatRows(byCount(result.counts))),
    ...section("Events", formatRows(byCount(result.events))),
    ...section(
      "No event (raw only)",
      formatRows(unrouted.map((method) => [method, result.counts[method]!])),
    ),
    ...section(
      `Decode errors: ${result.errors.length.toLocaleString("en-US")}`,
      errors,
    ),
  ];
  if (result.unsafe.length > 0) {
    lines.push(
      ...section(
        "Counters past Number.MAX_SAFE_INTEGER",
        result.unsafe.map((path) => `  ${path}`),
      ),
    );
  }
  if (result.streamEnds.length > 0) {
    lines.push("", `Stream ended: ${result.streamEnds.join(", ")}`);
  }
  if (options.samples) {
    lines.push(
      ...section(
        "First payload of each event",
        Object.entries(result.firsts).map(
          ([event, payload]) => `  ${event}  ${compactJson(payload)}`,
        ),
      ),
    );
  }
  return lines.join("\n");
}

/** `yarn replay`'s exit status: 1 when a message failed to decode, else 0. */
export function replayStatus(result: Replay): number {
  return result.errors.length > 0 ? 1 : 0;
}
