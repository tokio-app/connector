/** How important a log entry is. */
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

const PREFIX = "[@tokioapp/connector]";

/**
 * The default logger: warnings and errors go to the console, debug and info
 * entries are dropped. Pass the `logger` option to route them elsewhere.
 */
export const consoleLogger: Logger = (level, message, data) => {
  if (level !== "warn" && level !== "error") return;
  const args: unknown[] = [`${PREFIX} ${message}`];
  if (data !== undefined) args.push(data);
  if (level === "warn") console.warn(...args);
  else console.error(...args);
};
