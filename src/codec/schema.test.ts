import { describe, expect, it } from "vitest";
import { defineSchema, f, type MessageSchema } from "./schema.js";

interface Inner {
  text: string;
}

interface Everything {
  text: string;
  raw: Uint8Array;
  flag: boolean;
  small: number;
  unsigned: number;
  kind: number;
  id: string;
  total: number;
  ratio: number;
  precise: number;
  inner?: Inner;
  texts: string[];
  blobs: Uint8Array[];
  flags: boolean[];
  smalls: number[];
  unsigneds: number[];
  kinds: number[];
  ids: string[];
  totals: number[];
  ratios: number[];
  precises: number[];
  inners: Inner[];
}

const InnerSchema = defineSchema<Inner>("Inner", { text: f.string(1) });

const EverythingSchema = defineSchema<Everything>("Everything", {
  text: f.string(1),
  raw: f.bytes(2),
  flag: f.bool(3),
  small: f.int32(4),
  unsigned: f.uint32(5),
  kind: f.enum(6),
  id: f.id(7),
  total: f.count(8),
  ratio: f.float(9),
  precise: f.double(10),
  inner: f.message(11, InnerSchema),
  texts: f.repeated.string(21),
  blobs: f.repeated.bytes(22),
  flags: f.repeated.bool(23),
  smalls: f.repeated.int32(24),
  unsigneds: f.repeated.uint32(25),
  kinds: f.repeated.enum(26),
  ids: f.repeated.id(27),
  totals: f.repeated.count(28),
  ratios: f.repeated.float(29),
  precises: f.repeated.double(30),
  inners: f.repeated.message(31, InnerSchema),
});

describe("defineSchema", () => {
  it("indexes the fields by number, with their path", () => {
    expect(EverythingSchema.name).toBe("Everything");
    expect(EverythingSchema.byNumber.size).toBe(22);
    expect(EverythingSchema.byNumber.get(7)).toEqual({
      name: "id",
      no: 7,
      kind: "id",
      repeated: false,
      schema: undefined,
      path: "Everything.id",
    });
    expect(EverythingSchema.byNumber.get(31)).toMatchObject({
      name: "inners",
      kind: "message",
      repeated: true,
      schema: InnerSchema,
    });
    expect(EverythingSchema.fields.inner).toMatchObject({
      no: 11,
      kind: "message",
      optional: true,
    });
  });

  it("creates values holding the defaults, nested messages left out", () => {
    const value = EverythingSchema.create();
    expect(value).toStrictEqual({
      text: "",
      raw: new Uint8Array(0),
      flag: false,
      small: 0,
      unsigned: 0,
      kind: 0,
      id: "0",
      total: 0,
      ratio: 0,
      precise: 0,
      texts: [],
      blobs: [],
      flags: [],
      smalls: [],
      unsigneds: [],
      kinds: [],
      ids: [],
      totals: [],
      ratios: [],
      precises: [],
      inners: [],
    });
    expect("inner" in value).toBe(false);
  });

  it("creates new arrays every time and shares one frozen empty byte array", () => {
    const first = EverythingSchema.create();
    const second = EverythingSchema.create();
    expect(first.texts).not.toBe(second.texts);
    expect(first.raw).toBe(second.raw);
    expect(Object.isFrozen(first.raw)).toBe(true);
  });

  it("freezes the schema and its fields", () => {
    expect(Object.isFrozen(EverythingSchema)).toBe(true);
    expect(Object.isFrozen(EverythingSchema.fields.text)).toBe(true);
    expect(Object.isFrozen(f)).toBe(true);
    expect(Object.isFrozen(f.repeated)).toBe(true);
  });

  it("refuses two properties with the same field number", () => {
    expect(() =>
      defineSchema<{ a: string; b: string }>("Twice", {
        a: f.string(1),
        b: f.string(1),
      }),
    ).toThrow("Twice: field 1 is used by both a and b");
  });

  it.each([0, -1, 1.5, 2 ** 29, Number.NaN])(
    "refuses field number %d",
    (no) => {
      const message = "Field number must be a whole number from 1 to 536870911";
      expect(() => f.string(no)).toThrow(RangeError);
      expect(() => f.repeated.count(no)).toThrow(message);
      expect(() => f.message(no, InnerSchema)).toThrow(message);
      expect(() => f.repeated.message(no, InnerSchema)).toThrow(message);
    },
  );

  it("accepts the largest field number", () => {
    expect(f.bool(2 ** 29 - 1).no).toBe(2 ** 29 - 1);
  });
});

// Compile-time checks: `yarn typecheck` fails when one of these compiles.
interface Chat {
  inner?: Inner;
  content: string;
  count: number;
  inners: Inner[];
}

// Never called: only compiled.
export function typeChecks(): MessageSchema<unknown>[] {
  return [
    defineSchema<Chat>(
      "MissingField",
      // @ts-expect-error a property without a field
      {
        inner: f.message(1, InnerSchema),
        count: f.count(2),
        inners: f.repeated.message(3, InnerSchema),
      },
    ),
    defineSchema<Chat>("WrongKind", {
      inner: f.message(1, InnerSchema),
      // @ts-expect-error a field of the wrong type
      content: f.count(2),
      count: f.count(3),
      inners: f.repeated.message(4, InnerSchema),
    }),
    defineSchema<{ inner: Inner }>("RequiredMessage", {
      // @ts-expect-error a message field for a required property
      inner: f.message(1, InnerSchema),
    }),
    defineSchema<{ text?: string }>("OptionalScalar", {
      // @ts-expect-error a scalar field for an optional property
      text: f.string(1),
    }),
    defineSchema<Chat>("WrongSchema", {
      // @ts-expect-error a nested schema of the wrong type
      inner: f.message(1, EverythingSchema),
      content: f.string(2),
      count: f.count(3),
      inners: f.repeated.message(4, InnerSchema),
    }),
    defineSchema<Inner>("ExtraField", {
      text: f.string(1),
      // @ts-expect-error a field for a property the type doesn't have
      other: f.string(2),
    }),
  ];
}
