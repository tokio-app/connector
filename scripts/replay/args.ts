// The command line of `yarn replay`. Pure; tested in args.test.ts.
import { booleanFlag, parseFileCommand, type Command } from "../lib/cli.js";

/** What `yarn replay` runs with. */
export interface ReplayArgs {
  /** The capture to replay. */
  file: string;
  /** `--samples`: also print the first payload of each event. */
  samples: boolean;
}

export const REPLAY_USAGE = `Usage: yarn replay <capture.json> [--samples]

Replays a capture's messages through the library's dispatch with a listener
on every event, offline, and prints how many messages of each method it held,
how many times each event fired, the methods no event covers (they reach raw
only), and every message that failed to decode (method, message id, error).

Options:
  --samples          Also print the first payload of each event, as JSON.
                     Captures hold viewers' names and comments: keep the
                     output out of the repository
  -h, --help         Show this help

Exit status: 0 when every message decoded, 1 when one didn't or the capture
couldn't be read, 2 for a usage mistake.`;

/** Parses the arguments of `yarn replay`. Throws a `UsageError` for a mistake. */
export function parseReplayArgs(argv: readonly string[]): Command<ReplayArgs> {
  const command = parseFileCommand(argv, { samples: { type: "boolean" } });
  if (command.help) return command;
  const { file, values } = command.args;
  return {
    help: false,
    args: { file, samples: booleanFlag(values, "samples") },
  };
}
