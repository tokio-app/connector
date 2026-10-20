// What `yarn inspect` prints: the field trees of tree.ts as indented text, or
// as JSON-safe values for --json. Pure; tested in format.test.ts.
import { formatCount } from "../lib/format.js";
import type {
  BytesStats,
  Distinct,
  FieldStats,
  FixedStats,
  MessageStats,
  MethodStats,
  StringStats,
  VarintStats,
} from "./tree.js";

/** How many distinct values a line lists before it only gives examples. */
const LISTED = 8;
/** How many examples a line gives past that. */
const EXAMPLES = 5;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

// Times between 2001-09-09 and 2286-11-20, in seconds or milliseconds.
const SECONDS = [1_000_000_000n, 10_000_000_000n] as const;
const MILLISECONDS = [1_000_000_000_000n, 10_000_000_000_000n] as const;

const within = (stats: VarintStats, [low, high]: readonly [bigint, bigint]) =>
  stats.min >= low && stats.max < high;

/** What a field's varints look like, from their range: a guess for people. */
export function varintHint(stats: VarintStats): string | undefined {
  if (stats.max <= 1n) return "0/1: a bool?";
  if (within(stats, MILLISECONDS)) return "times in ms?";
  if (within(stats, SECONDS)) return "times in s?";
  if (stats.min > MAX_SAFE && stats.maxSigned >= 0n) return "64-bit ids?";
  return undefined;
}

// The most frequent values first, then in the order they came.
function ranked(distinct: Distinct): [string, number][] {
  return [...distinct.values].sort(([, a], [, b]) => b - a);
}

function listValues(
  distinct: Distinct,
  show: (value: string) => string,
): string {
  const values = ranked(distinct);
  const kept = distinct.values.size;
  const all = distinct.dropped === 0 && kept <= LISTED;
  const shown = (all ? values : values.slice(0, EXAMPLES))
    .map(([value, times]) => `${show(value)} ×${formatCount(times)}`)
    .join(", ");
  if (all) return `${kept} distinct: ${shown}`;
  const more = distinct.dropped > 0 ? `${kept}+` : `${kept}`;
  return `${more} distinct, most often ${shown}`;
}

function describeVarints(stats: VarintStats): string {
  const parts = [listValues(stats.distinct, (value) => value)];
  if (stats.min !== stats.max) parts.push(`range ${stats.min}..${stats.max}`);
  if (stats.minSigned < 0n) {
    parts.push(`as int64 ${stats.minSigned}..${stats.maxSigned}`);
  }
  const hint = varintHint(stats);
  if (hint !== undefined) parts.push(hint);
  return parts.join("; ");
}

const view = new DataView(new ArrayBuffer(8));

/** A fixed32 value's bits read as a float. */
export function asFloat(value: string): number {
  view.setUint32(0, Number(value), true);
  return view.getFloat32(0, true);
}

/** A fixed64 value's bits read as a double. */
export function asDouble(value: string): number {
  view.setBigUint64(0, BigInt(value), true);
  return view.getFloat64(0, true);
}

function describeFixed(stats: FixedStats, float: (value: string) => number) {
  return listValues(
    stats.distinct,
    (value) => `${value} (${String(float(value))})`,
  );
}

function lengths(stats: StringStats | BytesStats): string {
  return stats.minLength === stats.maxLength
    ? `length ${stats.minLength}`
    : `lengths ${stats.minLength}..${stats.maxLength}`;
}

/** How many characters of a text value a line shows. */
const MAX_TEXT = 60;

/**
 * A text value as JSON, cut to {@link MAX_TEXT} characters: whitespace and
 * line breaks stay visible (a space as `" "`, a line feed as `"\n"`),
 * unlike in a flattened quote.
 */
export function showText(value: string): string {
  return JSON.stringify(
    value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT - 1)}…` : value,
  );
}

function describeStrings(stats: StringStats): string {
  return `${lengths(stats)}; ${listValues(stats.distinct, showText)}`;
}

function describeBytes(stats: BytesStats): string {
  return `${lengths(stats)}; ${listValues(stats.distinct, (value) => `<${value}>`)}`;
}

/** The kinds of value a field held, each with its summary (a message's is its count). */
function kindsOf(field: FieldStats): [kind: string, summary: string][] {
  const kinds: [string, string][] = [];
  if (field.varint) kinds.push(["varint", describeVarints(field.varint)]);
  if (field.i32) kinds.push(["fixed32", describeFixed(field.i32, asFloat)]);
  if (field.i64) kinds.push(["fixed64", describeFixed(field.i64, asDouble)]);
  if (field.string) kinds.push(["string", describeStrings(field.string)]);
  if (field.bytes) kinds.push(["bytes", describeBytes(field.bytes)]);
  if (field.message) {
    kinds.push(["message", `${formatCount(field.message.count)} parsed`]);
  }
  if (field.empty > 0) kinds.push(["empty", formatCount(field.empty)]);
  if (field.groups > 0) kinds.push(["group", formatCount(field.groups)]);
  return kinds;
}

function presence(field: FieldStats, parent: MessageStats): string {
  const present = `in ${formatCount(field.present)}/${formatCount(parent.count)}`;
  return field.maxPerMessage > 1
    ? `${present}, repeated (up to ${formatCount(field.maxPerMessage)})`
    : present;
}

function formatFields(
  message: MessageStats,
  indent: string,
  lines: string[],
): void {
  const fields = [...message.fields.values()].sort((a, b) => a.no - b.no);
  for (const field of fields) {
    const kinds = kindsOf(field);
    const head = `${indent}${field.no}`;
    const [only] = kinds;
    if (kinds.length === 1 && only !== undefined) {
      const [kind, summary] = only;
      lines.push(
        kind === "message"
          ? `${head}  message  ${presence(field, message)}`
          : `${head}  ${kind}  ${presence(field, message)}  ${summary}`,
      );
    } else {
      lines.push(
        `${head}  ${kinds.map(([kind]) => kind).join("+")}  ${presence(field, message)}`,
      );
      for (const [kind, summary] of kinds) {
        lines.push(`${indent}   - ${kind}: ${summary}`);
      }
    }
    if (field.message) formatFields(field.message, `${indent}    `, lines);
  }
}

/** One method's tree as indented lines: a field per line, nested messages below their field. */
export function formatMethod(stats: MethodStats): string[] {
  const errors =
    stats.errors > 0
      ? `, ${formatCount(stats.errors)} not protobuf (${stats.firstError ?? "?"})`
      : "";
  const lines = [
    `${stats.method}  ${formatCount(stats.samples)} sample${stats.samples === 1 ? "" : "s"}${errors}`,
  ];
  formatFields(stats.root, "  ", lines);
  return lines;
}

/** Every method's tree, a blank line between them. */
export function formatInspection(methods: readonly MethodStats[]): string {
  if (methods.length === 0) return "No messages to inspect.";
  return methods.map((stats) => formatMethod(stats).join("\n")).join("\n\n");
}

/** A {@link Distinct} as JSON: the values with their counts, most frequent first. */
interface DistinctJson {
  values: { value: string; count: number }[];
  dropped: number;
}

function distinctJson(distinct: Distinct): DistinctJson {
  return {
    values: ranked(distinct).map(([value, count]) => ({ value, count })),
    dropped: distinct.dropped,
  };
}

function fieldJson(field: FieldStats): Record<string, unknown> {
  const json: Record<string, unknown> = {
    no: field.no,
    wires: [...field.wires].sort((a, b) => a - b),
    present: field.present,
    occurrences: field.occurrences,
    maxPerMessage: field.maxPerMessage,
  };
  if (field.varint) {
    const { count, min, max, minSigned, maxSigned, distinct } = field.varint;
    json.varint = {
      count,
      min: min.toString(),
      max: max.toString(),
      minSigned: minSigned.toString(),
      maxSigned: maxSigned.toString(),
      distinct: distinctJson(distinct),
    };
  }
  for (const key of ["i32", "i64"] as const) {
    const stats = field[key];
    if (stats) {
      json[key] = {
        count: stats.count,
        distinct: distinctJson(stats.distinct),
      };
    }
  }
  for (const key of ["string", "bytes"] as const) {
    const stats = field[key];
    if (stats) {
      json[key] = {
        count: stats.count,
        minLength: stats.minLength,
        maxLength: stats.maxLength,
        distinct: distinctJson(stats.distinct),
      };
    }
  }
  if (field.message) json.message = messageJson(field.message);
  if (field.empty > 0) json.empty = field.empty;
  if (field.groups > 0) json.groups = field.groups;
  return json;
}

function messageJson(message: MessageStats): Record<string, unknown> {
  return {
    count: message.count,
    fields: [...message.fields.values()]
      .sort((a, b) => a.no - b.no)
      .map(fieldJson),
  };
}

/** The trees as JSON-safe values for --json: 64-bit numbers as decimal strings, maps as arrays. */
export function inspectionJson(
  methods: readonly MethodStats[],
): Record<string, unknown>[] {
  return methods.map((stats) => ({
    method: stats.method,
    samples: stats.samples,
    errors: stats.errors,
    ...(stats.firstError === undefined ? {} : { firstError: stats.firstError }),
    root: messageJson(stats.root),
  }));
}
