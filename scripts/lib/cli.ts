// Shared by `yarn smoke` and `yarn capture`: the flags both take, the
// connection options they build, their logger, their clock, and how they start
// and end. runScript, onInterrupt and the clock touch the process; the rest is
// pure and tested in cli.test.ts.
import { Console } from "node:console";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import {
  createConsoleLogger,
  EulerSigner,
  normalizeUsername,
  type ConnectOptions,
  type Logger,
} from "../../src/index.js";
import { describeError } from "./format.js";

/** A mistake on the command line: printed above the usage, exit status 2. */
export class UsageError extends Error {
  override name = "UsageError";
}

/** Environment variables, as `process.env` holds them. */
export type Env = Readonly<Record<string, string | undefined>>;

/** The flag values `parseArgs` found, for a script to read its own flags. */
export type FlagValues = Readonly<Record<string, unknown>>;

/** The command line of a script: a request for help, or what to run. */
export type Command<T> = { help: true } | { help: false; args: T };

/** What both scripts read from their command line. */
export interface CommonArgs {
  /** The username, normalized (no `@`, no URL). */
  username: string;
  /** How long to run once connected (`--seconds`), in milliseconds. */
  durationMs: number;
  /** `--room-id`: skips the username lookup. */
  roomId: string | undefined;
  /** `--api-key`, else the `EULER_API_KEY` environment variable. */
  apiKey: string | undefined;
  /** `--host`: the Euler Stream server, without a trailing slash. */
  host: string | undefined;
  /** `--verbose`: also print the library's debug and info logs. */
  verbose: boolean;
}

/** The environment variable both scripts read the Euler Stream API key from. The library itself reads none. */
const API_KEY_ENV = "EULER_API_KEY";

const COMMON_FLAGS = {
  seconds: { type: "string" },
  "room-id": { type: "string" },
  "api-key": { type: "string" },
  host: { type: "string" },
  verbose: { type: "boolean", short: "v" },
  help: { type: "boolean", short: "h" },
} satisfies ParseArgsOptionsConfig;

/** The usage lines of the flags every script takes. */
export const COMMON_USAGE = `  --room-id <id>     Skip the username lookup: connect to this room
  --api-key <key>    Euler Stream API key (default: $${API_KEY_ENV}, which keeps
                     it out of your shell history)
  --host <url>       Euler Stream server (default: EulerSigner's)
  -v, --verbose      Also print the library's debug and info logs (to stderr)
  -h, --help         Show this help`;

/** A string flag's value, or `undefined` when it wasn't given. */
export function stringFlag(
  values: FlagValues,
  name: string,
): string | undefined {
  const value = values[name];
  return typeof value === "string" ? value : undefined;
}

/** Whether a boolean flag was given. */
export function booleanFlag(values: FlagValues, name: string): boolean {
  return values[name] === true;
}

/** Reads a number of seconds above 0, as milliseconds. */
export function readDuration(flag: string, value: string): number {
  const seconds = Number(value);
  if (value.trim() === "" || !Number.isFinite(seconds) || seconds <= 0) {
    throw new UsageError(
      `${flag} takes a number of seconds above 0, got "${value}"`,
    );
  }
  return Math.round(seconds * 1000);
}

function readUsername(value: string): string {
  try {
    return normalizeUsername(value);
  } catch (error) {
    throw new UsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function readRoomId(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const roomId = value.trim();
  if (!/^\d+$/.test(roomId)) {
    throw new UsageError(`--room-id takes a numeric room id, got "${value}"`);
  }
  return roomId;
}

function readHost(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const host = value.trim();
  let url: URL;
  try {
    url = new URL(host);
  } catch {
    throw new UsageError(`--host takes a URL, got "${value}"`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UsageError(`--host takes an http(s) URL, got "${value}"`);
  }
  return host.replace(/\/+$/, "");
}

// The flag wins over the environment, even when empty: `--api-key ""` runs
// without the key the environment holds.
function readApiKey(value: string | undefined, env: Env): string | undefined {
  return (value ?? env[API_KEY_ENV])?.trim() || undefined;
}

/**
 * Parses a script's arguments (without the node and script paths): one
 * username, the common flags and the script's own `flags`. Throws a
 * {@link UsageError} for anything else. `--help` wins over every mistake.
 */
export function parseCommand(
  argv: readonly string[],
  env: Env,
  spec: { flags: ParseArgsOptionsConfig; defaultSeconds: number },
): Command<{ common: CommonArgs; values: FlagValues }> {
  let parsed: { values: FlagValues; positionals: string[] };
  try {
    parsed = parseArgs({
      args: [...argv],
      options: { ...spec.flags, ...COMMON_FLAGS },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    // --help with a mistake elsewhere still shows the help.
    if (argv.includes("--help") || argv.includes("-h")) return { help: true };
    throw new UsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
  const { values, positionals } = parsed;
  if (booleanFlag(values, "help")) return { help: true };

  const [username, extra] = positionals;
  if (username === undefined) throw new UsageError("Missing the username");
  if (extra !== undefined) {
    throw new UsageError(`Unexpected argument "${extra}": one username only`);
  }
  const seconds = stringFlag(values, "seconds");
  return {
    help: false,
    args: {
      common: {
        username: readUsername(username),
        durationMs:
          seconds === undefined
            ? spec.defaultSeconds * 1000
            : readDuration("--seconds", seconds),
        roomId: readRoomId(stringFlag(values, "room-id")),
        apiKey: readApiKey(stringFlag(values, "api-key"), env),
        host: readHost(stringFlag(values, "host")),
        verbose: booleanFlag(values, "verbose"),
      },
      values,
    },
  };
}

// Every level to stderr, so stdout stays clean for `--json`.
const STDERR = new Console(process.stderr);

/**
 * The scripts' logger: the library's console logger printing warnings and
 * errors, and with `verbose` its debug and info entries too, all to stderr.
 */
export function createLogger(verbose: boolean): Logger {
  return createConsoleLogger({
    level: verbose ? "debug" : "warn",
    console: STDERR,
  });
}

/**
 * The options both scripts connect with: the room id when given, an
 * `EulerSigner` with the host and API key when given, and the logger.
 */
export function connectionOptions(args: CommonArgs): ConnectOptions {
  return {
    roomId: args.roomId,
    signer: new EulerSigner({ host: args.host, apiKey: args.apiKey }),
    logger: createLogger(args.verbose),
  };
}

/** A run's clock: when it started, and how long ago that was. */
export interface Clock {
  /** When the run started, as `performance.now()` gave it. */
  readonly startedAt: number;
  /** Milliseconds since the start, rounded. */
  elapsed(): number;
}

/** A clock that starts now. */
export function startClock(): Clock {
  const startedAt = performance.now();
  return {
    startedAt,
    elapsed: () => Math.round(performance.now() - startedAt),
  };
}

/**
 * Waits until `promise` settles, `ms` milliseconds at most (none for 0 or
 * less). Never rejects, and leaves no timer behind.
 */
export async function within(
  promise: Promise<unknown>,
  ms: number,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, Math.max(0, ms));
  });
  try {
    await Promise.race([promise.then(ignore, ignore), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function ignore(): void {}

/**
 * Calls `stop` on the first Ctrl-C, so the script can disconnect and report.
 * A second Ctrl-C quits at once (exit status 130).
 */
export function onInterrupt(stop: () => void): void {
  let interrupted = false;
  process.on("SIGINT", () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.error("\nStopping (Ctrl-C again to quit now)");
    stop();
  });
}

/**
 * Exits with `code` once stdout and stderr have flushed: writes to a pipe can
 * be asynchronous, and `process.exit` would cut them short. Exiting at all
 * matters too: a leaked timer or socket mustn't keep the script running.
 */
function exitAfterFlush(code: number): void {
  process.stdout.write("", () => {
    process.stderr.write("", () => process.exit(code));
  });
}

/** A script: its name, its usage text, how to read its arguments and how to run it. */
export interface Script<T> {
  /** The yarn script, such as `smoke`. */
  name: string;
  usage: string;
  /** Reads the arguments. Throws a {@link UsageError} for a mistake. */
  parse(argv: readonly string[], env: Env): Command<T>;
  /** Runs it and resolves with the exit status. */
  run(args: T): Promise<number>;
}

/**
 * Starts a script: prints the usage for `--help` (exit status 0) or above a
 * usage mistake (2), else runs it and exits with the status it resolves with
 * (1 when it throws).
 */
export function runScript<T>(script: Script<T>): void {
  let command: Command<T>;
  try {
    command = script.parse(process.argv.slice(2), process.env);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${error.message}\n\n${script.usage}`);
    exitAfterFlush(2);
    return;
  }
  if (command.help) {
    console.log(script.usage);
    exitAfterFlush(0);
    return;
  }
  script.run(command.args).then(exitAfterFlush, (error: unknown) => {
    console.error(
      `yarn ${script.name} failed unexpectedly: ${describeError(error)}`,
    );
    exitAfterFlush(1);
  });
}
