// Builds protobuf bytes from a schema and a value: the inverse of
// decodeMessage, for test fixtures. It writes its own bytes (it doesn't use
// WireWriter), so the codec tests check the decoder against an independent
// encoder.
import { WireType } from "../../src/codec/reader.js";
import type {
  AnyMessageSchema,
  CompiledField,
  MessageSchema,
} from "../../src/codec/schema.js";

/** A value to encode: any subset of the fields, nested messages included. */
export type EncodeInput<T> = {
  [K in keyof T]?: EncodeValue<T[K]>;
};

type EncodeValue<V> = V extends Uint8Array
  ? Uint8Array
  : V extends readonly (infer E)[]
    ? EncodeValue<E>[]
    : V extends object
      ? EncodeInput<V>
      : V;

/** Options of {@link encodeMessage}. */
export interface EncodeOptions {
  /** Write repeated numeric fields packed (one length-delimited field). Default `false`. */
  packed?: boolean;
  /** Also write fields holding their default value, as a non-proto3 encoder may. Default `false`. */
  emitDefaults?: boolean;
}

const utf8 = new TextEncoder();

/** The bytes of a varint holding `value` as a 64-bit two's complement integer. */
export function varint(value: number | bigint): Uint8Array {
  let rest = BigInt.asUintN(64, BigInt(value));
  const bytes: number[] = [];
  while (rest > 0x7fn) {
    bytes.push(Number(rest & 0x7fn) | 0x80);
    rest >>= 7n;
  }
  bytes.push(Number(rest));
  return Uint8Array.from(bytes);
}

/** The bytes of a field tag. */
export function tag(field: number, wire: number): Uint8Array {
  return varint(BigInt(field) * 8n + BigInt(wire));
}

/** 4 bytes, little-endian. */
export function fixed32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

/** 8 bytes, little-endian. */
export function fixed64(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt.asUintN(64, value), true);
  return bytes;
}

/** Joins byte arrays. */
export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Parses hex like `"08 96 01"` (spaces optional). */
export function fromHex(hex: string): Uint8Array {
  const digits = hex.replace(/\s+/g, "");
  if (!/^(?:[0-9a-f]{2})*$/i.test(digits)) throw new Error(`Bad hex: ${hex}`);
  return Uint8Array.from(digits.match(/../g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
}

/** Formats bytes as lowercase hex pairs separated by spaces. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    " ",
  );
}

/**
 * A complete field the schema may not know: its tag, then `payload`. For
 * `LEN`, the length prefix is added; for `SGROUP`, `payload` holds the group's
 * fields and the end tag is added. For the other wire types, `payload` is the
 * already-encoded value (see {@link varint}, {@link fixed32}, {@link fixed64}).
 */
export function unknownField(
  field: number,
  wire: number,
  payload: Uint8Array = new Uint8Array(0),
): Uint8Array {
  switch (wire) {
    case WireType.LEN:
      return concat(tag(field, wire), varint(payload.length), payload);
    case WireType.SGROUP:
      return concat(tag(field, wire), payload, tag(field, WireType.EGROUP));
    default:
      return concat(tag(field, wire), payload);
  }
}

/**
 * Hand-assembled fields with explicit field numbers, independent of any
 * schema: tests build bytes with them to check a schema's field numbers.
 */
export const fields = {
  /** A varint field (int32, int64, uint64, enum, bool); negatives as 64-bit two's complement. */
  varint: (field: number, value: number | bigint) =>
    unknownField(field, WireType.VARINT, varint(value)),
  /** A string field. */
  string: (field: number, value: string) =>
    unknownField(field, WireType.LEN, utf8.encode(value)),
  /** A bytes field. */
  bytes: (field: number, value: Uint8Array) =>
    unknownField(field, WireType.LEN, value),
  /** A nested message field holding `parts`. */
  message: (field: number, ...parts: Uint8Array[]) =>
    unknownField(field, WireType.LEN, concat(...parts)),
  /** A fixed32 field. */
  fixed32: (field: number, value: number) =>
    unknownField(field, WireType.I32, fixed32(value)),
  /** A fixed64 field. */
  fixed64: (field: number, value: bigint) =>
    unknownField(field, WireType.I64, fixed64(value)),
};

function isDefault(field: CompiledField, value: unknown): boolean {
  switch (field.kind) {
    case "string":
      return value === "";
    case "bytes":
      return (value as Uint8Array).length === 0;
    case "bool":
      return value === false;
    case "id":
      return value === "0";
    default:
      return value === 0;
  }
}

// The value of a scalar field, without its tag.
function scalar(field: CompiledField, value: unknown): Uint8Array {
  switch (field.kind) {
    case "string":
      return lengthDelimited(utf8.encode(value as string));
    case "bytes":
      return lengthDelimited(value as Uint8Array);
    case "bool":
      return varint(value ? 1 : 0);
    case "uint32":
      return varint((value as number) >>> 0);
    case "id":
      return varint(BigInt(value as string));
    case "float": {
      const bytes = new Uint8Array(4);
      new DataView(bytes.buffer).setFloat32(0, value as number, true);
      return bytes;
    }
    case "double": {
      const bytes = new Uint8Array(8);
      new DataView(bytes.buffer).setFloat64(0, value as number, true);
      return bytes;
    }
    default:
      // int32, enum and count: sign-extended to 64 bits.
      return varint(BigInt(value as number));
  }
}

function lengthDelimited(bytes: Uint8Array): Uint8Array {
  return concat(varint(bytes.length), bytes);
}

function wireOf(field: CompiledField): number {
  switch (field.kind) {
    case "string":
    case "bytes":
    case "message":
      return WireType.LEN;
    case "float":
      return WireType.I32;
    case "double":
      return WireType.I64;
    default:
      return WireType.VARINT;
  }
}

// One message field per item (a repeated message field has several).
function encodeMessages(
  field: CompiledField,
  current: unknown,
  options: EncodeOptions,
): Uint8Array[] {
  const items = field.repeated ? (current as unknown[]) : [current];
  return items.map((item) =>
    concat(
      tag(field.no, WireType.LEN),
      lengthDelimited(
        encodeWith(field.schema!, item as Record<string, unknown>, options),
      ),
    ),
  );
}

// A repeated scalar field: packed into one field, or one field per item.
function encodeRepeated(
  field: CompiledField,
  items: unknown[],
  options: EncodeOptions,
): Uint8Array[] {
  if (options.packed && wireOf(field) !== WireType.LEN) {
    if (items.length === 0) return [];
    const packed = concat(...items.map((item) => scalar(field, item)));
    return [tag(field.no, WireType.LEN), lengthDelimited(packed)];
  }
  return items.map((item) =>
    concat(tag(field.no, wireOf(field)), scalar(field, item)),
  );
}

function encodeField(
  field: CompiledField,
  current: unknown,
  options: EncodeOptions,
): Uint8Array[] {
  if (current === undefined) return [];
  if (field.kind === "message") return encodeMessages(field, current, options);
  if (field.repeated) {
    return encodeRepeated(field, current as unknown[], options);
  }
  if (!options.emitDefaults && isDefault(field, current)) return [];
  return [tag(field.no, wireOf(field)), scalar(field, current)];
}

function encodeWith(
  schema: AnyMessageSchema,
  value: Record<string, unknown>,
  options: EncodeOptions,
): Uint8Array {
  const ordered = [...schema.byNumber.values()].sort((a, b) => a.no - b.no);
  return concat(
    ...ordered.flatMap((field) =>
      encodeField(field, value[field.name], options),
    ),
  );
}

/**
 * Encodes `value` with `schema`, fields in field number order. Like a proto3
 * encoder, it leaves out fields at their default value (unless
 * `emitDefaults`) and empty repeated fields.
 */
export function encodeMessage<T>(
  schema: MessageSchema<T>,
  value: EncodeInput<T>,
  options: EncodeOptions = {},
): Uint8Array {
  return encodeWith(schema, value, options);
}
