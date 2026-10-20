// The fixture format `yarn capture` writes and replay tests read, with its
// builder, serializer and validator. Pure; tested in fixture.test.ts.
//
// A fixture holds the raw LIVE messages of one capture as the `raw` event
// gave them: method, ids, flags and the protobuf payload in base64. Nothing
// else goes in: no cookies, no session, no API key, no `internalExt`, no
// signer request or agent ids. The `raw` event doesn't carry them, the builder
// copies only the fields below, and parseFixture refuses any key it doesn't
// know.
//
// The payloads still hold what viewers sent (nicknames, user ids, avatars,
// comments). Commit a fixture under test/fixtures/ only when it was recorded on
// your own LIVE.
import type { RawMessage } from "../../src/index.js";
import { formatBytes, formatRows, formatSeconds } from "../lib/format.js";

/** The fixture format this file writes and reads. */
export const FIXTURE_VERSION = 1;

/** One raw LIVE message. */
export interface FixtureMessage {
  /** When it arrived, in milliseconds since the capture started. */
  at: number;
  /** The message type, such as `WebcastChatMessage`. */
  method: string;
  /** The message id, a decimal string. */
  msgId: string;
  /** Whether TikTok marked it as backlog. */
  isHistory: boolean;
  /** Its `common.createTime`, a decimal string (`"0"` without one). */
  createTime: string;
  /** The protobuf payload, in base64. */
  payload: string;
}

/** A capture: `yarn capture` writes one per file. */
export interface Fixture {
  version: typeof FIXTURE_VERSION;
  /** When the capture started, as an ISO 8601 date. */
  capturedAt: string;
  /** The LIVE's username; left out with `--anonymize`. */
  username?: string;
  /** The room the capture entered. */
  roomId: string;
  /** How long the capture ran, in milliseconds. */
  durationMs: number;
  /** How many messages of each method `messages` holds, by method name. */
  counts: Record<string, number>;
  /** The messages, in the order they arrived. */
  messages: FixtureMessage[];
}

/** A fixture that doesn't follow the format. */
export class FixtureError extends Error {
  override name = "FixtureError";
}

/**
 * A `raw` event as a fixture message, `now - startedAt` milliseconds into the
 * capture. Copies only the fields of {@link FixtureMessage}, and only the
 * bytes of the payload's view.
 */
export function toFixtureMessage(
  raw: RawMessage,
  startedAt: number,
  now = performance.now(),
): FixtureMessage {
  const { payload } = raw;
  return {
    at: Math.max(0, Math.round(now - startedAt)),
    method: raw.method,
    msgId: raw.msgId,
    isHistory: raw.isHistory,
    createTime: raw.createTime,
    payload: Buffer.from(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    ).toString("base64"),
  };
}

/** A fixture message back as the `raw` event's payload, for replaying it. */
export function fromFixtureMessage(message: FixtureMessage): RawMessage {
  return {
    method: message.method,
    payload: new Uint8Array(Buffer.from(message.payload, "base64")),
    msgId: message.msgId,
    isHistory: message.isHistory,
    createTime: message.createTime,
  };
}

/** How many messages of each method there are, keyed by method name in alphabetical order. */
export function countMethods(
  messages: readonly Pick<FixtureMessage, "method">[],
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const { method } of messages) {
    counts.set(method, (counts.get(method) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/** What {@link buildFixture} needs. */
export interface FixtureInput {
  capturedAt: Date;
  username: string;
  roomId: string;
  durationMs: number;
  messages: FixtureMessage[];
  /** Leave the username out. */
  anonymize: boolean;
}

/** Assembles a fixture; `counts` is computed from the messages. */
export function buildFixture(input: FixtureInput): Fixture {
  return {
    version: FIXTURE_VERSION,
    capturedAt: input.capturedAt.toISOString(),
    ...(input.anonymize ? {} : { username: input.username }),
    roomId: input.roomId,
    durationMs: Math.round(input.durationMs),
    counts: countMethods(input.messages),
    messages: input.messages,
  };
}

/**
 * The fixture as JSON: the header indented, then one message per line, so a
 * diff or a pager shows one message at a time.
 */
export function serializeFixture(fixture: Fixture): string {
  const { messages, ...header } = fixture;
  const head = JSON.stringify(header, null, 2).replace(/\n}$/, "");
  const body =
    messages.length === 0
      ? "[]"
      : `[\n${messages.map((message) => `    ${JSON.stringify(message)}`).join(",\n")}\n  ]`;
  return `${head},\n  "messages": ${body}\n}\n`;
}

const FIXTURE_KEYS = [
  "version",
  "capturedAt",
  "username",
  "roomId",
  "durationMs",
  "counts",
  "messages",
];
const MESSAGE_KEYS = [
  "at",
  "method",
  "msgId",
  "isHistory",
  "createTime",
  "payload",
];
const DECIMAL = /^\d+$/;
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preview(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) return String(value);
  return json.length > 40 ? `${json.slice(0, 37)}...` : json;
}

function invalid(path: string, expected: string, value: unknown): never {
  throw new FixtureError(
    `Invalid fixture: ${path} must be ${expected}, got ${value === undefined ? "nothing" : preview(value)}`,
  );
}

// The path of a field, for error messages: `messages[0].payload`, `roomId`.
function join(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function checkKeys(
  path: string,
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new FixtureError(
        `Invalid fixture: ${path} has an unexpected key "${key}" (it may only hold ${allowed.join(", ")})`,
      );
    }
  }
}

function readString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  pattern?: RegExp,
  expected = "a string",
): string {
  const value = record[key];
  if (typeof value !== "string" || (pattern && !pattern.test(value))) {
    invalid(join(path, key), expected, value);
  }
  return value;
}

function readMilliseconds(
  record: Record<string, unknown>,
  key: string,
  path: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid(join(path, key), "a number of milliseconds of at least 0", value);
  }
  return value;
}

function readMessage(value: unknown, index: number): FixtureMessage {
  const path = `messages[${index}]`;
  if (!isRecord(value)) invalid(path, "an object", value);
  checkKeys(path, value, MESSAGE_KEYS);
  const isHistory = value.isHistory;
  if (typeof isHistory !== "boolean") {
    invalid(`${path}.isHistory`, "a boolean", isHistory);
  }
  return {
    at: readMilliseconds(value, "at", path),
    method: readString(value, "method", path, /./, "a method name"),
    msgId: readString(value, "msgId", path, DECIMAL, "a decimal string"),
    isHistory,
    createTime: readString(
      value,
      "createTime",
      path,
      DECIMAL,
      "a decimal string",
    ),
    payload: readString(value, "payload", path, BASE64, "a base64 string"),
  };
}

function readCounts(
  value: unknown,
  messages: readonly FixtureMessage[],
): Record<string, number> {
  if (!isRecord(value)) invalid("counts", "an object", value);
  const expected = countMethods(messages);
  for (const [method, count] of Object.entries(value)) {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      invalid(`counts.${method}`, "a whole number of at least 0", count);
    }
  }
  for (const method of new Set([
    ...Object.keys(value),
    ...Object.keys(expected),
  ])) {
    const count = value[method] ?? 0;
    const actual = expected[method] ?? 0;
    if (count !== actual) {
      throw new FixtureError(
        `Invalid fixture: counts.${method} is ${preview(count)}, but the messages hold ${actual}`,
      );
    }
  }
  return expected;
}

/**
 * Checks that `json` (a fixture's text, or the value it parses to) follows the
 * format, and returns it as a {@link Fixture} holding only the known keys.
 * Throws a {@link FixtureError} that names the first field that doesn't.
 */
export function parseFixture(json: unknown): Fixture {
  let value = json;
  if (typeof json === "string") {
    try {
      value = JSON.parse(json) as unknown;
    } catch (error) {
      throw new FixtureError(
        `Invalid fixture: not JSON (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }
  if (!isRecord(value)) invalid("the fixture", "an object", value);
  checkKeys("the fixture", value, FIXTURE_KEYS);
  if (value.version !== FIXTURE_VERSION) {
    throw new FixtureError(
      `Unsupported fixture version ${preview(value.version)}: this reader knows version ${FIXTURE_VERSION}`,
    );
  }
  const path = "";
  const capturedAt = readString(value, "capturedAt", path);
  if (Number.isNaN(Date.parse(capturedAt))) {
    invalid("capturedAt", "an ISO 8601 date", capturedAt);
  }
  const username =
    value.username === undefined
      ? undefined
      : readString(value, "username", path);
  const roomId = readString(value, "roomId", path, DECIMAL, "a decimal string");
  const durationMs = readMilliseconds(value, "durationMs", path);
  if (!Array.isArray(value.messages)) {
    invalid("messages", "an array", value.messages);
  }
  const messages = value.messages.map((message: unknown, index) =>
    readMessage(message, index),
  );
  const counts = readCounts(value.counts, messages);
  return {
    version: FIXTURE_VERSION,
    capturedAt,
    ...(username === undefined ? {} : { username }),
    roomId,
    durationMs,
    counts,
    messages,
  };
}

/** What `yarn capture` prints after writing `path` (`bytes` long). */
export function formatCaptureSummary(
  fixture: Fixture,
  path: string,
  bytes: number,
): string {
  const methods = Object.entries(fixture.counts).sort(
    ([a, countA], [b, countB]) => countB - countA || (a < b ? -1 : 1),
  );
  return [
    `Wrote ${path} (${formatBytes(bytes)})`,
    `  ${fixture.messages.length.toLocaleString("en-US")} messages in ${formatSeconds(fixture.durationMs)}, room ${fixture.roomId}${fixture.username === undefined ? ", anonymized" : `, @${fixture.username}`}`,
    "",
    ...formatRows(methods),
  ].join("\n");
}
