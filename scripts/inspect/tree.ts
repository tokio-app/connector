// The schema-less decoder of `yarn inspect`: walks the protobuf wire format of
// captured payloads with the library's WireReader, without any table, and
// merges every sample of a method into one field tree. Pure; tested in
// tree.test.ts with synthetic bytes.
//
// Each field is told apart by what its bytes allow: a varint, 4 or 8 fixed
// bytes, or a length-delimited value read as printable UTF-8 text, else as a
// nested message (recursively, MAX_INSPECT_DEPTH levels at most), else as
// bytes. A short nested message can pass for text, and a string for a message:
// the tree says what the bytes allow, not what the field is.
import { WireReader, WireType } from "../../src/codec/reader.js";

/** How many levels of nested messages are tried below a method's payload. */
export const MAX_INSPECT_DEPTH = 16;

/** How many distinct values a field keeps (with their counts); the rest are only counted. */
export const MAX_DISTINCT = 32;

/** How many bytes of a `bytes` value an example keeps. */
const MAX_EXAMPLE_BYTES = 24;

/** Distinct values, with how many times each came, `MAX_DISTINCT` at most. */
export interface Distinct {
  /** Value → count, in the order they first came. */
  values: Map<string, number>;
  /** How many values came that weren't kept, the cap being reached. */
  dropped: number;
}

/** What a field's varints held. */
export interface VarintStats {
  count: number;
  /** The smallest and largest, read as uint64. */
  min: bigint;
  max: bigint;
  /** The smallest and largest, read as int64. */
  minSigned: bigint;
  maxSigned: bigint;
  /** The values, as unsigned decimal strings. */
  distinct: Distinct;
}

/** What a field's fixed-size values held. */
export interface FixedStats {
  count: number;
  /** The values as unsigned decimal strings; the format shows them as floats too. */
  distinct: Distinct;
}

/** What a field's length-delimited values held that read as text. */
export interface StringStats {
  count: number;
  /** The shortest and longest, in UTF-16 code units. */
  minLength: number;
  maxLength: number;
  distinct: Distinct;
}

/** What a field's length-delimited values held that were neither text nor a message. */
export interface BytesStats {
  count: number;
  minLength: number;
  maxLength: number;
  /** The first bytes of each value, in hex. */
  distinct: Distinct;
}

/** One field number of a message, merged over every instance of the message. */
export interface FieldStats {
  no: number;
  /** The wire types it came with. */
  wires: Set<number>;
  /** How many instances of the message held it. */
  present: number;
  /** How many times it came in all. */
  occurrences: number;
  /** The most times it came in one instance: above 1, it repeats. */
  maxPerMessage: number;
  varint?: VarintStats;
  i32?: FixedStats;
  i64?: FixedStats;
  string?: StringStats;
  bytes?: BytesStats;
  /** Its values that parsed as nested messages, merged. */
  message?: MessageStats;
  /** Length-delimited values of 0 bytes: an empty string, bytes or message. */
  empty: number;
  /** Groups (wire type 3), skipped. */
  groups: number;
}

/** A message's fields, merged over every instance. */
export interface MessageStats {
  /** How many instances were merged. */
  count: number;
  /** The fields, by number. */
  fields: Map<number, FieldStats>;
}

/** Every sample of one method. */
export interface MethodStats {
  method: string;
  /** How many payloads were read. */
  samples: number;
  /** The payloads that weren't valid protobuf, left out of the tree. */
  errors: number;
  /** What the first of them failed with. */
  firstError?: string;
  root: MessageStats;
}

/** A payload to inspect. */
export interface InspectInput {
  method: string;
  payload: Uint8Array;
}

// One field as it came, before merging.
type Value =
  | { kind: "varint"; value: bigint }
  | { kind: "i32"; value: number }
  | { kind: "i64"; value: bigint }
  | { kind: "string"; value: string }
  | { kind: "message"; entries: Entry[] }
  | { kind: "bytes"; value: Uint8Array }
  | { kind: "empty" }
  | { kind: "group" };

interface Entry {
  no: number;
  wire: number;
  value: Value;
}

const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// Control characters other than tab (9), line feed (10) and carriage return (13).
function isControl(code: number): boolean {
  return (
    (code < 0x20 && code !== 9 && code !== 10 && code !== 13) || code === 0x7f
  );
}

/** `bytes` as text when they are valid UTF-8 without control characters, else `undefined`. */
export function printable(bytes: Uint8Array): string | undefined {
  let text: string;
  try {
    text = strictUtf8.decode(bytes);
  } catch {
    return undefined;
  }
  for (let index = 0; index < text.length; index++) {
    if (isControl(text.charCodeAt(index))) return undefined;
  }
  return text;
}

function lengthDelimited(bytes: Uint8Array, depth: number): Value {
  if (bytes.length === 0) return { kind: "empty" };
  const text = printable(bytes);
  if (text !== undefined) return { kind: "string", value: text };
  if (depth < MAX_INSPECT_DEPTH) {
    try {
      return { kind: "message", entries: parse(bytes, depth + 1) };
    } catch {
      // Not a message: bytes.
    }
  }
  return { kind: "bytes", value: bytes };
}

/**
 * The fields of `bytes`, read without a schema. Throws a `ProtocolError` when
 * they aren't valid protobuf.
 */
function parse(bytes: Uint8Array, depth = 0): Entry[] {
  const reader = new WireReader(bytes);
  const entries: Entry[] = [];
  while (!reader.eof) {
    const tag = reader.tag();
    const no = tag >>> 3;
    const wire = tag & 7;
    let value: Value;
    switch (wire) {
      case WireType.VARINT:
        value = { kind: "varint", value: reader.varint64() };
        break;
      case WireType.I64:
        value = { kind: "i64", value: reader.fixed64() };
        break;
      case WireType.I32:
        value = { kind: "i32", value: reader.fixed32() };
        break;
      case WireType.LEN:
        value = lengthDelimited(reader.bytes(), depth);
        break;
      default:
        // A group, skipped to its end; an end without a start throws.
        reader.skip(wire, no);
        value = { kind: "group" };
    }
    entries.push({ no, wire, value });
  }
  return entries;
}

function newMessage(): MessageStats {
  return { count: 0, fields: new Map() };
}

function newDistinct(): Distinct {
  return { values: new Map(), dropped: 0 };
}

function count(distinct: Distinct, value: string): void {
  const seen = distinct.values.get(value);
  if (seen !== undefined) distinct.values.set(value, seen + 1);
  else if (distinct.values.size < MAX_DISTINCT) distinct.values.set(value, 1);
  else distinct.dropped++;
}

function hex(bytes: Uint8Array): string {
  const head = [...bytes.subarray(0, MAX_EXAMPLE_BYTES)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
  return bytes.length > MAX_EXAMPLE_BYTES ? `${head} …` : head;
}

function addVarint(field: FieldStats, value: bigint): void {
  const signed = BigInt.asIntN(64, value);
  const stats = field.varint;
  if (stats === undefined) {
    field.varint = {
      count: 1,
      min: value,
      max: value,
      minSigned: signed,
      maxSigned: signed,
      distinct: newDistinct(),
    };
  } else {
    stats.count++;
    if (value < stats.min) stats.min = value;
    if (value > stats.max) stats.max = value;
    if (signed < stats.minSigned) stats.minSigned = signed;
    if (signed > stats.maxSigned) stats.maxSigned = signed;
  }
  count(field.varint!.distinct, value.toString());
}

function addFixed(
  stats: FixedStats | undefined,
  value: number | bigint,
): FixedStats {
  const next = stats ?? { count: 0, distinct: newDistinct() };
  next.count++;
  count(next.distinct, value.toString());
  return next;
}

function addSized(
  stats: StringStats | undefined,
  length: number,
  key: string,
): StringStats {
  const next = stats ?? {
    count: 0,
    minLength: length,
    maxLength: length,
    distinct: newDistinct(),
  };
  next.count++;
  next.minLength = Math.min(next.minLength, length);
  next.maxLength = Math.max(next.maxLength, length);
  count(next.distinct, key);
  return next;
}

function addValue(field: FieldStats, value: Value): void {
  switch (value.kind) {
    case "varint":
      addVarint(field, value.value);
      return;
    case "i32":
      field.i32 = addFixed(field.i32, value.value);
      return;
    case "i64":
      field.i64 = addFixed(field.i64, value.value);
      return;
    case "string":
      field.string = addSized(field.string, value.value.length, value.value);
      return;
    case "bytes":
      field.bytes = addSized(field.bytes, value.value.length, hex(value.value));
      return;
    case "message":
      field.message ??= newMessage();
      merge(field.message, value.entries);
      return;
    case "empty":
      field.empty++;
      return;
    case "group":
      field.groups++;
  }
}

/** Merges one instance of a message (its fields as they came) into `stats`. */
function merge(stats: MessageStats, entries: readonly Entry[]): void {
  stats.count++;
  const perMessage = new Map<number, number>();
  for (const { no, wire, value } of entries) {
    let field = stats.fields.get(no);
    if (field === undefined) {
      field = {
        no,
        wires: new Set(),
        present: 0,
        occurrences: 0,
        maxPerMessage: 0,
        empty: 0,
        groups: 0,
      };
      stats.fields.set(no, field);
    }
    field.wires.add(wire);
    field.occurrences++;
    perMessage.set(no, (perMessage.get(no) ?? 0) + 1);
    addValue(field, value);
  }
  for (const [no, times] of perMessage) {
    const field = stats.fields.get(no)!;
    field.present++;
    field.maxPerMessage = Math.max(field.maxPerMessage, times);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads every payload without a schema and merges those of each method into
 * one tree, methods in alphabetical order. A payload that isn't valid protobuf
 * is counted in `errors` and left out of the tree.
 */
export function inspectPayloads(
  inputs: readonly InspectInput[],
): MethodStats[] {
  const methods = new Map<string, MethodStats>();
  for (const { method, payload } of inputs) {
    let stats = methods.get(method);
    if (stats === undefined) {
      stats = { method, samples: 0, errors: 0, root: newMessage() };
      methods.set(method, stats);
    }
    stats.samples++;
    let entries: Entry[];
    try {
      entries = parse(payload);
    } catch (error) {
      stats.errors++;
      stats.firstError ??= describeError(error);
      continue;
    }
    merge(stats.root, entries);
  }
  return [...methods.values()].sort((a, b) =>
    a.method < b.method ? -1 : a.method > b.method ? 1 : 0,
  );
}

/**
 * Whether `method` is one of `filters`: by its full name, or without the
 * `Webcast` prefix. No filters match every method.
 */
export function matchesMethod(
  method: string,
  filters: readonly string[],
): boolean {
  return (
    filters.length === 0 ||
    filters.some((filter) => method === filter || method === `Webcast${filter}`)
  );
}
