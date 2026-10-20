/** How important a log entry is, from the least: `debug`, `info`, `warn`, `error`. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Receives the library's log entries. `data` holds structured details (ids,
 * counts, the error) and is safe to serialize, except `data.error`, which is
 * an `Error`.
 */
export type Logger = (
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
) => void;

/** Options of {@link createConsoleLogger}. */
export interface ConsoleLoggerOptions {
  /**
   * The least important level printed: `debug` prints every entry, `error`
   * only errors. Default `warn`.
   */
  level?: LogLevel;
  /**
   * Where to print: each entry goes to the method named like its level.
   * Default: the global `console`, whose `debug` and `info` write to stdout.
   * `new Console(process.stderr)` (from `node:console`) keeps stdout clean.
   */
  console?: Pick<Console, LogLevel>;
}

const PREFIX = "[@tokioapp/connector]";

const RANKS: Readonly<Record<LogLevel, number>> = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
});

// Checked: JavaScript callers can pass anything.
function rankOf(level: LogLevel): number {
  if (typeof level !== "string" || !Object.hasOwn(RANKS, level)) {
    throw new RangeError(
      `level must be debug, info, warn or error, got ${level}`,
    );
  }
  return RANKS[level];
}

/**
 * A logger that prints to the console the entries of `level` and above
 * (default `warn`), each with the `[@tokioapp/connector]` prefix and its
 * `data`. Debug and info entries also name their level, which the console
 * doesn't show for them. Throws a `RangeError` for an unknown level.
 *
 * ```ts
 * const connection = new TikTokLiveConnection("username", {
 *   logger: createConsoleLogger({ level: "info" }),
 * });
 * ```
 */
export function createConsoleLogger(
  options: ConsoleLoggerOptions = {},
): Logger {
  const threshold = rankOf(options.level ?? "warn");
  const target = options.console;
  return (level, message, data) => {
    if (RANKS[level] < threshold) return;
    const label = level === "debug" || level === "info" ? `${level}: ` : "";
    const args: unknown[] = [`${PREFIX} ${label}${message}`];
    if (data !== undefined) args.push(data);
    // The global console is looked up at each call, so a console replaced or
    // spied on later is the one written to.
    (target ?? console)[level](...args);
  };
}

/**
 * The default logger: warnings and errors go to the console, debug and info
 * entries are dropped. Pass the `logger` option to route them elsewhere, or
 * {@link createConsoleLogger} for another level.
 */
export const consoleLogger: Logger = createConsoleLogger();
