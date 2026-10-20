// The decoder fills plain objects whose shape the schema describes, so it
// works with untyped values and asserts the types back at the end.
/* oxlint-disable typescript/no-unsafe-type-assertion */
import { ProtocolError } from "../errors.js";
import { WireReader, WireType } from "./reader.js";
import type {
  AnyMessageSchema,
  CompiledField,
  Decodable,
  FieldKind,
} from "./schema.js";

/**
 * Called when a `count` field holds a value past `Number.MAX_SAFE_INTEGER`
 * (either sign): its number value is rounded. `path` is `Message.property`.
 */
export type UnsafeIntegerHook = (path: string, value: bigint) => void;

/** Options of {@link decodeMessage}. */
export interface DecodeOptions {
  /**
   * Receives unsafe `count` values. Default: a process warning, once per
   * `path` for the life of the process.
   */
  onUnsafeInteger?: UnsafeIntegerHook;
}

/**
 * Wraps `report` so it is called once per `path`: the first unsafe value of
 * each field, not every one.
 */
export function createUnsafeIntegerReporter(
  report: UnsafeIntegerHook,
): UnsafeIntegerHook {
  const reported = new Set<string>();
  return (path, value) => {
    if (reported.has(path)) return;
    reported.add(path);
    report(path, value);
  };
}

const warnOnce = createUnsafeIntegerReporter((path, value) => {
  process.emitWarning(
    `${path} is ${value}, past Number.MAX_SAFE_INTEGER: its number value is rounded`,
    { type: "UnsafeIntegerWarning" },
  );
});

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

type ScalarKind = Exclude<FieldKind, "message">;
type ScalarReader = (
  reader: WireReader,
  field: CompiledField,
  onUnsafe: UnsafeIntegerHook,
) => unknown;

const READ: Record<ScalarKind, ScalarReader> = {
  string: (reader) => reader.string(),
  bytes: (reader) => reader.bytes(),
  bool: (reader) => reader.bool(),
  int32: (reader) => reader.varint32(),
  enum: (reader) => reader.varint32(),
  uint32: (reader) => reader.varint32() >>> 0,
  id: (reader) => reader.varint64().toString(),
  count: (reader, field, onUnsafe) => {
    const value = BigInt.asIntN(64, reader.varint64());
    if (value > MAX_SAFE || value < -MAX_SAFE) onUnsafe(field.path, value);
    return Number(value);
  },
  float: (reader) => reader.float(),
  double: (reader) => reader.double(),
};

// The wire type each kind is written with (unpacked).
const WIRE: Record<FieldKind, number> = {
  string: WireType.LEN,
  bytes: WireType.LEN,
  message: WireType.LEN,
  bool: WireType.VARINT,
  int32: WireType.VARINT,
  uint32: WireType.VARINT,
  enum: WireType.VARINT,
  id: WireType.VARINT,
  count: WireType.VARINT,
  float: WireType.I32,
  double: WireType.I64,
};

type Target = Record<string, unknown>;

// Sets a field's value, or appends it to a repeated field's array.
function store(out: Target, field: CompiledField, value: unknown): void {
  if (field.repeated) (out[field.name] as unknown[]).push(value);
  else out[field.name] = value;
}

function readMessage(
  out: Target,
  field: CompiledField,
  reader: WireReader,
  onUnsafe: UnsafeIntegerHook,
): void {
  const schema = field.schema!;
  // A message field seen twice merges into the first one.
  const target = field.repeated
    ? schema.create()
    : (out[field.name] ?? schema.create());
  store(out, field, decodeInto(schema, reader.message(), target, onUnsafe));
}

// A packed repeated numeric field: its values back to back in one field.
function readPacked(
  out: Target,
  field: CompiledField,
  reader: WireReader,
  onUnsafe: UnsafeIntegerHook,
): void {
  const packed = new WireReader(reader.bytes(), reader.depth);
  const read = READ[field.kind as ScalarKind];
  while (!packed.eof) store(out, field, read(packed, field, onUnsafe));
}

// Reads one field into `out`. False when its wire type doesn't fit its kind.
function readField(
  out: Target,
  field: CompiledField,
  wire: number,
  reader: WireReader,
  onUnsafe: UnsafeIntegerHook,
): boolean {
  if (wire === WIRE[field.kind]) {
    if (field.kind === "message") readMessage(out, field, reader, onUnsafe);
    else store(out, field, READ[field.kind](reader, field, onUnsafe));
    return true;
  }
  if (field.repeated && wire === WireType.LEN) {
    readPacked(out, field, reader, onUnsafe);
    return true;
  }
  return false;
}

function decodeInto(
  schema: AnyMessageSchema,
  reader: WireReader,
  target: unknown,
  onUnsafe: UnsafeIntegerHook,
): unknown {
  const out = target as Target;
  while (!reader.eof) {
    const tag = reader.tag();
    const number = tag >>> 3;
    const wire = tag & 7;
    const field = schema.byNumber.get(number);
    // Fields the library doesn't read, and known ones with an unexpected
    // wire type, are skipped.
    if (field === undefined || !readField(out, field, wire, reader, onUnsafe)) {
      reader.skip(wire, number);
    }
  }
  return target;
}

/**
 * Decodes the protobuf message in `bytes` with `schema`. Every field starts at
 * its default; fields the schema doesn't list, and listed fields with an
 * unexpected wire type, are skipped. Repeated fields collect every
 * occurrence, packed or not, and a nested message seen twice is merged. Byte
 * fields are views into `bytes`. Throws a `ProtocolError` when `bytes` is
 * malformed.
 */
export function decodeMessage<T>(
  schema: Decodable<T>,
  bytes: Uint8Array,
  options: DecodeOptions = {},
): T {
  try {
    return decodeInto(
      schema,
      new WireReader(bytes),
      schema.create(),
      options.onUnsafeInteger ?? warnOnce,
    ) as T;
  } catch (error) {
    throw new ProtocolError(
      `Can't decode ${schema.name}: ${(error as Error).message}`,
      { cause: error },
    );
  }
}
