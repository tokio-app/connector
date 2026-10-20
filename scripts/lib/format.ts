// Text and JSON shapes shared by `yarn smoke` and `yarn capture`: errors,
// times, aligned tables and the connection's transitions. Pure; tested in
// format.test.ts.
import {
  isConnectorError,
  type ConnectedEvent,
  type DisconnectedEvent,
  type ReconnectingEvent,
  type StreamEndEvent,
} from "../../src/index.js";

/** An error as plain JSON, for `--json` and the summaries. */
export interface ErrorInfo {
  /** The class name, such as `RateLimitError`. */
  name: string;
  message: string;
  /** A `ConnectorError`'s code. */
  code?: string;
  /** A `ConnectorError`'s `retryable`. */
  retryable?: boolean;
  /** The error's other fields, such as `status`, `phase`, `retryAfterMs` or a system error's `code`. */
  details?: Record<string, string | number | boolean>;
  /** What caused it (`cause`, or an `AggregateError`'s errors), three levels deep at most. */
  causes?: ErrorInfo[];
}

const MAX_CAUSE_DEPTH = 3;

function causesOf(error: Error): unknown[] {
  const causes: unknown[] =
    error instanceof AggregateError ? [...error.errors] : [];
  if (Array.isArray(error.cause)) causes.push(...(error.cause as unknown[]));
  else if (error.cause !== undefined) causes.push(error.cause);
  return causes;
}

/** `error` as {@link ErrorInfo}. */
export function errorInfo(error: unknown, depth = 0): ErrorInfo {
  if (!(error instanceof Error)) {
    return { name: typeof error, message: String(error) };
  }
  const info: ErrorInfo = { name: error.name, message: error.message };
  const connectorError = isConnectorError(error);
  if (connectorError) {
    info.code = error.code;
    info.retryable = error.retryable;
  }
  const details: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(error)) {
    if (connectorError && (key === "code" || key === "retryable")) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      details[key] = value;
    }
  }
  if (Object.keys(details).length > 0) info.details = details;
  const causes = causesOf(error);
  if (causes.length > 0 && depth < MAX_CAUSE_DEPTH) {
    info.causes = causes.map((cause) => errorInfo(cause, depth + 1));
  }
  return info;
}

/** One line: `CODE: message` (or the class name without a code). */
export function shortError(info: ErrorInfo): string {
  return `${info.code ?? info.name}: ${info.message}`;
}

function formatErrorInfo(info: ErrorInfo, indent: string): string {
  const tags: string[] = [];
  if (info.code !== undefined) tags.push(info.code);
  if (info.retryable !== undefined) {
    tags.push(info.retryable ? "retryable" : "not retryable");
  }
  for (const [key, value] of Object.entries(info.details ?? {})) {
    tags.push(`${key} ${String(value)}`);
  }
  const head = `${info.name}${tags.length > 0 ? ` (${tags.join(", ")})` : ""}: ${info.message}`;
  const causes = (info.causes ?? []).map(
    (cause) =>
      `\n${indent}  caused by ${formatErrorInfo(cause, `${indent}  `)}`,
  );
  return head + causes.join("");
}

/**
 * An error for people: class, code, whether it's retryable, its fields, and
 * its causes on the lines below.
 */
export function describeError(error: unknown): string {
  return formatErrorInfo(errorInfo(error), "");
}

/** `1234` (ms) → `"1.2 s"`. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** The time column of a progress line: `1234` (ms) → `"   1.2s"`. */
export function stamp(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`.padStart(7);
}

/** A count with thousands separators: `1234` → `"1,234"`. */
export function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

/** A file size: `"512 B"`, `"1.5 KB"`, `"2.3 MB"`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Two aligned columns. Names are padded to the longest; numbers are
 * formatted with separators and right-aligned, text is left as it is. A third
 * column, when given, is a note after the value.
 */
export function formatRows(
  rows: readonly (readonly [
    name: string,
    value: string | number,
    note?: string,
  ])[],
  indent = "  ",
): string[] {
  const nameWidth = Math.max(0, ...rows.map(([name]) => name.length));
  const numberWidth = Math.max(
    0,
    ...rows.map(([, value]) =>
      typeof value === "number" ? formatCount(value).length : 0,
    ),
  );
  return rows.map(([name, value, note]) => {
    const text =
      typeof value === "number"
        ? formatCount(value).padStart(numberWidth)
        : value;
    return `${indent}${name.padEnd(nameWidth)}  ${text}${note ? `  ${note}` : ""}`.trimEnd();
  });
}

const LABEL_WIDTH = 18;

/** A progress line's text: a label padded to a column, then the details. */
export function labeled(label: string, text: string): string {
  return `${label.padEnd(LABEL_WIDTH)} ${text}`;
}

/** The `connected` event as a progress line. */
export function describeConnected(event: ConnectedEvent): string {
  return labeled(
    "connected",
    `room ${event.roomId}, attempt ${event.attempt}, reconnected ${event.reconnected ? "yes" : "no"}`,
  );
}

/** The `reconnecting` event as a progress line. */
export function describeReconnecting(event: ReconnectingEvent): string {
  return labeled(
    "reconnecting",
    `attempt ${event.attempt} in ${event.delayMs} ms (after ${event.reason})`,
  );
}

/** The `disconnected` event as a progress line. */
export function describeDisconnected(event: DisconnectedEvent): string {
  const error = event.error ? ` (${shortError(errorInfo(event.error))})` : "";
  return labeled(
    "disconnected",
    `${event.reason}${error}, ${event.willReconnect ? "will reconnect" : "stopped"}`,
  );
}

/** The `streamEnd` event as a progress line. */
export function describeStreamEnd(event: StreamEndEvent): string {
  return labeled("stream ended", event.action);
}
