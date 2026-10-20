// The command line of `yarn smoke`. Pure; tested in args.test.ts.
import {
  booleanFlag,
  COMMON_USAGE,
  parseCommand,
  readDuration,
  stringFlag,
  UsageError,
  type Command,
  type CommonArgs,
  type Env,
} from "../lib/cli.js";
import { RECONNECT_BOUND_MS } from "./summary.js";

/** What `yarn smoke` runs with. */
export interface SmokeArgs extends CommonArgs {
  /** `--drop-after`: when to drop the socket, in milliseconds after connecting. */
  dropAfterMs: number | undefined;
  /** `--gifts`: also fetch the gift list. */
  gifts: boolean;
  /** `--json`: print the summary as JSON on stdout. */
  json: boolean;
}

const DEFAULT_SECONDS = 30;

export const SMOKE_USAGE = `Usage: yarn smoke <username> [options]

Connects to a TikTok LIVE with a listener on every event, prints the
connection's transitions and a sample of each LIVE event, then disconnects
and prints a summary. Needs the network, and a user who is LIVE now.

Options:
  --seconds <n>      How long to watch once connected (default ${DEFAULT_SECONDS})
  --drop-after <n>   Drop the socket <n> seconds after connecting, and expect
                     a reconnect within ${RECONNECT_BOUND_MS / 1000} seconds (less than --seconds)
  --gifts            Also fetch the gift list, and print which source answered
  --json             Print the summary as JSON (progress goes to stderr)
${COMMON_USAGE}

Exit status: 0 when the run passed, 1 when it failed (the summary says why),
2 for a usage mistake. A run passes when it connected, no error event came,
at least one LIVE event arrived, the reconnect succeeded (--drop-after) and
the gift list came back (--gifts).`;

/** Parses the arguments of `yarn smoke`. Throws a `UsageError` for a mistake. */
export function parseSmokeArgs(
  argv: readonly string[],
  env: Env,
): Command<SmokeArgs> {
  const command = parseCommand(argv, env, {
    defaultSeconds: DEFAULT_SECONDS,
    flags: {
      "drop-after": { type: "string" },
      gifts: { type: "boolean" },
      json: { type: "boolean" },
    },
  });
  if (command.help) return command;
  const { common, values } = command.args;

  const dropAfter = stringFlag(values, "drop-after");
  const dropAfterMs =
    dropAfter === undefined
      ? undefined
      : readDuration("--drop-after", dropAfter);
  if (dropAfterMs !== undefined && dropAfterMs >= common.durationMs) {
    throw new UsageError(
      `--drop-after (${dropAfterMs / 1000} s) must be less than --seconds (${common.durationMs / 1000} s)`,
    );
  }
  return {
    help: false,
    args: {
      ...common,
      dropAfterMs,
      gifts: booleanFlag(values, "gifts"),
      json: booleanFlag(values, "json"),
    },
  };
}
