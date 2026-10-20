// The command line of `yarn inspect`. Pure; tested in args.test.ts.
import { booleanFlag, parseFileCommand, type Command } from "../lib/cli.js";

/** What `yarn inspect` runs with. */
export interface InspectArgs {
  /** The capture to read. */
  file: string;
  /** `--method`: the methods to inspect (all without one), with or without the `Webcast` prefix. */
  methods: string[];
  /** `--json`: the trees as JSON on stdout. */
  json: boolean;
}

export const INSPECT_USAGE = `Usage: yarn inspect <capture.json> [options]

Reads a capture's payloads without any table, straight from the protobuf wire
format, and prints each method's fields merged over every sample: field
number, wire type, how many samples hold it, whether it repeats, and what the
values look like (varints as unsigned and signed, with their range and
distinct values; length-delimited values as text, else as a nested message,
else as bytes; fixed values as floats too). For working out the fields of a
message no reference describes.

It prints to the terminal only. Captures hold viewers' names and comments:
don't paste the output into the repository.

Options:
  --method <name>    Only this method (repeatable), such as
                     WebcastLinkMicOpponentGifts or LinkMicOpponentGifts
  --json             The trees as JSON
  -h, --help         Show this help

Exit status: 0 when the capture was read, 1 when it couldn't be,
2 for a usage mistake.`;

/** Parses the arguments of `yarn inspect`. Throws a `UsageError` for a mistake. */
export function parseInspectArgs(
  argv: readonly string[],
): Command<InspectArgs> {
  const command = parseFileCommand(argv, {
    method: { type: "string", multiple: true },
    json: { type: "boolean" },
  });
  if (command.help) return command;
  const { file, values } = command.args;
  const methods = Array.isArray(values.method)
    ? values.method
        .filter((method): method is string => typeof method === "string")
        .map((method) => method.trim())
        .filter((method) => method !== "")
    : [];
  return {
    help: false,
    args: { file, methods, json: booleanFlag(values, "json") },
  };
}
