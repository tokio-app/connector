/**
 * How a field's value is read:
 *
 * - `string`: UTF-8 text. Default `""`.
 * - `bytes`: raw bytes, as a view into the input. Default: empty.
 * - `bool`: a varint, `true` when not zero. Default `false`.
 * - `int32`, `enum`: a varint's low 32 bits, signed. Unknown enum values are kept. Default `0`.
 * - `uint32`: a varint's low 32 bits, unsigned. Default `0`.
 * - `id`: a 64-bit varint (an int64 or uint64 id), as an unsigned decimal string. Default `"0"`.
 * - `count`: a 64-bit varint (an int64 counter), as a number. Values past
 *   `Number.MAX_SAFE_INTEGER` are rounded and reported (see `decodeMessage`). Default `0`.
 * - `float`, `double`: IEEE 754, 4 or 8 bytes. Default `0`.
 * - `message`: a nested message, decoded with its own schema. Default: absent.
 *
 * Repeated fields of every kind default to `[]`; repeated numeric fields are
 * read packed or unpacked.
 */
export type FieldKind =
  | "string"
  | "bytes"
  | "bool"
  | "int32"
  | "uint32"
  | "enum"
  | "id"
  | "count"
  | "float"
  | "double"
  | "message";

/**
 * One field of a {@link MessageSchema}, made with the {@link f} builders. `V`
 * is the type the field decodes to; it must match the property it is
 * declared for.
 */
export interface FieldDef<V> {
  /** The protobuf field number. */
  readonly no: number;
  /** How the value is read. */
  readonly kind: FieldKind;
  /** Whether the field repeats: it decodes to an array. */
  readonly repeated: boolean;
  /** Whether the field is a nested message that can be absent. */
  readonly optional: boolean;
  /** The nested message's schema, for `message` fields. */
  readonly schema: AnyMessageSchema | undefined;
  /** Type-level only: the decoded value type. Never set. */
  readonly "~value"?: (value: V) => V;
}

/** A field that always has a value: a scalar or a repeated field. */
export interface ValueFieldDef<V> extends FieldDef<V> {
  readonly optional: false;
}

/** A nested message field: absent (`undefined`) when the message leaves it out. */
export interface MessageFieldDef<M> extends FieldDef<M> {
  readonly kind: "message";
  readonly repeated: false;
  readonly optional: true;
  readonly schema: MessageSchema<M>;
}

/**
 * The fields of a message decoding to `T`, keyed by property name. Every
 * property of `T` needs a field: optional properties take a nested message
 * field ({@link MessageFieldDef}), required ones a scalar or repeated field of
 * the matching type.
 */
export type SchemaFields<T> = {
  readonly [K in keyof T]-?: {} extends Pick<T, K>
    ? MessageFieldDef<Exclude<T[K], undefined>>
    : ValueFieldDef<T[K]>;
};

/** A field as the decoder looks it up, by field number. */
export interface CompiledField {
  /** The property the field decodes to. */
  readonly name: string;
  /** The protobuf field number. */
  readonly no: number;
  /** How the value is read. */
  readonly kind: FieldKind;
  /** Whether the field repeats. */
  readonly repeated: boolean;
  /** The nested message's schema, for `message` fields. */
  readonly schema: AnyMessageSchema | undefined;
  /** `Message.property`, for reports. */
  readonly path: string;
}

/** What the decoder needs from a schema that decodes to `T`. */
export interface Decodable<T> {
  /** The protobuf message name, for errors and reports. */
  readonly name: string;
  /** The fields by field number. */
  readonly byNumber: ReadonlyMap<number, CompiledField>;
  /**
   * Returns a new `T` holding the defaults: `""`, `"0"` for ids, `0`,
   * `false`, empty bytes, and `[]` for repeated fields. Nested messages are
   * left out.
   */
  create(): T;
}

/** A schema whose value type doesn't matter, such as a nested message's. */
export type AnyMessageSchema = Decodable<unknown>;

/**
 * How to decode one protobuf message into a `T`: the fields the library
 * reads. Fields the schema doesn't list are skipped when decoding. Made with
 * {@link defineSchema}.
 */
export interface MessageSchema<T> extends Decodable<T> {
  /** The fields, by property name. */
  readonly fields: SchemaFields<T>;
}

const MAX_FIELD_NUMBER = 2 ** 29 - 1;

// Shared by every empty bytes field. Zero-length, so nothing can change it.
const EMPTY_BYTES = Object.freeze(new Uint8Array(0));

// A message field's default is "absent"; repeated fields default to [].
const DEFAULTS: Record<FieldKind, unknown> = {
  message: undefined,
  string: "",
  bytes: EMPTY_BYTES,
  bool: false,
  int32: 0,
  uint32: 0,
  enum: 0,
  id: "0",
  count: 0,
  float: 0,
  double: 0,
};

function checkFieldNumber(no: number): void {
  if (!Number.isInteger(no) || no < 1 || no > MAX_FIELD_NUMBER) {
    throw new RangeError(
      `Field number must be a whole number from 1 to ${MAX_FIELD_NUMBER}, got ${no}`,
    );
  }
}

function value<V>(
  no: number,
  kind: Exclude<FieldKind, "message">,
  repeated: boolean,
): ValueFieldDef<V> {
  checkFieldNumber(no);
  return Object.freeze({
    no,
    kind,
    repeated,
    optional: false,
    schema: undefined,
  });
}

/**
 * Builders for the fields of a {@link defineSchema} call. Each takes the
 * protobuf field number; `message` also takes the nested message's schema.
 * `f.repeated` has the same builders for repeated fields.
 */
export const f = Object.freeze({
  /** A `string` field. */
  string: (no: number) => value<string>(no, "string", false),
  /** A `bytes` field. */
  bytes: (no: number) => value<Uint8Array>(no, "bytes", false),
  /** A `bool` field. */
  bool: (no: number) => value<boolean>(no, "bool", false),
  /** An `int32` field. */
  int32: (no: number) => value<number>(no, "int32", false),
  /** A `uint32` field. */
  uint32: (no: number) => value<number>(no, "uint32", false),
  /** An enum field, as its number. */
  enum: (no: number) => value<number>(no, "enum", false),
  /** A 64-bit id, as a decimal string. */
  id: (no: number) => value<string>(no, "id", false),
  /** A 64-bit counter, as a number. */
  count: (no: number) => value<number>(no, "count", false),
  /** A `float` field. */
  float: (no: number) => value<number>(no, "float", false),
  /** A `double` field. */
  double: (no: number) => value<number>(no, "double", false),
  /** A nested message, absent when the message leaves it out. */
  message: <M>(no: number, schema: MessageSchema<M>): MessageFieldDef<M> => {
    checkFieldNumber(no);
    return Object.freeze({
      no,
      kind: "message",
      repeated: false,
      optional: true,
      schema,
    });
  },
  /** Repeated fields: each builder decodes to an array. */
  repeated: Object.freeze({
    string: (no: number) => value<string[]>(no, "string", true),
    bytes: (no: number) => value<Uint8Array[]>(no, "bytes", true),
    bool: (no: number) => value<boolean[]>(no, "bool", true),
    int32: (no: number) => value<number[]>(no, "int32", true),
    uint32: (no: number) => value<number[]>(no, "uint32", true),
    enum: (no: number) => value<number[]>(no, "enum", true),
    id: (no: number) => value<string[]>(no, "id", true),
    count: (no: number) => value<number[]>(no, "count", true),
    float: (no: number) => value<number[]>(no, "float", true),
    double: (no: number) => value<number[]>(no, "double", true),
    message: <M>(no: number, schema: MessageSchema<M>): ValueFieldDef<M[]> => {
      checkFieldNumber(no);
      return Object.freeze({
        no,
        kind: "message",
        repeated: true,
        optional: false,
        schema,
      });
    },
  }),
});

/**
 * Defines how to decode the protobuf message `name` into a `T`. `fields` maps
 * every property of `T` to its field (see {@link SchemaFields}); the compiler
 * checks that none is missing and that each field decodes to its property's
 * type. Throws when two properties use the same field number.
 *
 * ```ts
 * const ImageSchema = defineSchema<Image>("ImageModel", {
 *   urlList: f.repeated.string(1),
 *   uri: f.string(2),
 * });
 * ```
 */
export function defineSchema<T>(
  name: string,
  fields: SchemaFields<T>,
): MessageSchema<T> {
  const byNumber = new Map<number, CompiledField>();
  const defaults: [string, unknown, boolean][] = [];
  for (const property in fields) {
    const field: FieldDef<any> = fields[property];
    const taken = byNumber.get(field.no);
    if (taken !== undefined) {
      throw new Error(
        `${name}: field ${field.no} is used by both ${taken.name} and ${property}`,
      );
    }
    byNumber.set(field.no, {
      name: property,
      no: field.no,
      kind: field.kind,
      repeated: field.repeated,
      schema: field.schema,
      path: `${name}.${property}`,
    });
    if (!field.optional) {
      defaults.push([property, DEFAULTS[field.kind], field.repeated]);
    }
  }
  return Object.freeze({
    name,
    fields,
    byNumber,
    create(): T {
      const created: Record<string, unknown> = {};
      for (const [property, initial, repeated] of defaults) {
        created[property] = repeated ? [] : initial;
      }
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fields cover every property of T (SchemaFields)
      return created as T;
    },
  });
}
