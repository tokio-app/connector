// The command line of `yarn capture`. Pure; tested in args.test.ts.
import {
  booleanFlag,
  COMMON_USAGE,
  parseCommand,
  stringFlag,
  type Command,
  type CommonArgs,
  type Env,
} from "../lib/cli.js";

/** What `yarn capture` runs with. */
export interface CaptureArgs extends CommonArgs {
  /** `--out`: the file to write, relative to the working directory. */
  out: string;
  /** `--anonymize`: leave the username out of the file. */
  anonymize: boolean;
}

const DEFAULT_SECONDS = 60;

/** Where captures go by default (gitignored). */
const CAPTURES_DIR = "captures";

export const CAPTURE_USAGE = `Usage: yarn capture <username> [options]

Records the raw messages of a TikTok LIVE into a JSON fixture for tests:
method, ids, flags and the protobuf payload in base64, nothing secret (no
cookies, session, API key or internalExt). Needs the network, and a user who
is LIVE now.

Options:
  --seconds <n>      How long to record once connected (default ${DEFAULT_SECONDS})
  --out <file>       Where to write (default ${CAPTURES_DIR}/<username>-<time>.json,
                     gitignored)
  --anonymize        Leave the username out of the file and its default name.
                     Payloads are raw protobuf and still hold viewers' nicknames,
                     ids and comments: only the username goes, for now
${COMMON_USAGE}

Fixtures committed under test/fixtures/ must come from your own LIVE.
Exit status: 0 when the file was written, 1 when nothing was captured,
2 for a usage mistake.`;

/**
 * The default output file: `captures/<username>-<UTC time>.json`, or
 * `captures/capture-<UTC time>.json` without a username. The time has no
 * colons, which Windows refuses in file names.
 */
export function defaultOutPath(
  username: string | undefined,
  date: Date,
): string {
  const time = date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "-");
  return `${CAPTURES_DIR}/${username ?? "capture"}-${time}.json`;
}

/** Parses the arguments of `yarn capture`. Throws a `UsageError` for a mistake. */
export function parseCaptureArgs(
  argv: readonly string[],
  env: Env,
  now = new Date(),
): Command<CaptureArgs> {
  const command = parseCommand(argv, env, {
    defaultSeconds: DEFAULT_SECONDS,
    flags: { out: { type: "string" }, anonymize: { type: "boolean" } },
  });
  if (command.help) return command;
  const { common, values } = command.args;
  const anonymize = booleanFlag(values, "anonymize");
  const out =
    stringFlag(values, "out")?.trim() ||
    defaultOutPath(anonymize ? undefined : common.username, now);
  return { help: false, args: { ...common, out, anonymize } };
}
