import { describe, expect, it, vi } from "vitest";
import { ProtocolError } from "../errors.js";
import { createUnsafeIntegerReporter, decodeMessage } from "./decode.js";
import { MAX_DEPTH, WireType } from "./reader.js";
import { defineSchema, f, type MessageSchema } from "./schema.js";
import {
  concat,
  encodeMessage,
  fixed32,
  fixed64,
  fromHex,
  tag,
  unknownField,
  varint,
} from "../../test/helpers/encoder.js";

interface Inner {
  text: string;
  number: number;
  list: number[];
}

interface Sample {
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
  flags: boolean[];
  smalls: number[];
  unsigneds: number[];
  ids: string[];
  totals: number[];
  ratios: number[];
  precises: number[];
  inners: Inner[];
}

const InnerSchema = defineSchema<Inner>("Inner", {
  text: f.string(1),
  number: f.int32(2),
  list: f.repeated.int32(3),
});

const SampleSchema = defineSchema<Sample>("Sample", {
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
  flags: f.repeated.bool(23),
  smalls: f.repeated.int32(24),
  unsigneds: f.repeated.uint32(25),
  ids: f.repeated.id(27),
  totals: f.repeated.count(28),
  ratios: f.repeated.float(29),
  precises: f.repeated.double(30),
  inners: f.repeated.message(31, InnerSchema),
});

const decode = (bytes: Uint8Array) =>
  decodeMessage(SampleSchema, bytes, { onUnsafeInteger: () => {} });

describe("decodeMessage", () => {
  it("decodes the protobuf spec example", () => {
    const schema = defineSchema<{ a: number }>("Test1", { a: f.int32(1) });
    expect(decodeMessage(schema, fromHex("08 96 01"))).toEqual({ a: 150 });
  });

  it("fills every absent field with its default", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual(SampleSchema.create());
  });

  it("decodes every kind", () => {
    const value = {
      text: "héllo",
      raw: Uint8Array.of(1, 2, 3),
      flag: true,
      small: -42,
      unsigned: 4_000_000_000,
      kind: 3,
      id: "7140000000000000001",
      total: 123_456_789_012,
      ratio: 1.5,
      precise: 0.1,
      inner: { text: "in", number: 7, list: [1, 2] },
      texts: ["a", "", "c"],
      flags: [true, false, true],
      smalls: [-1, 0, 1],
      unsigneds: [0, 2 ** 32 - 1],
      ids: ["1", "18446744073709551615"],
      totals: [-5, 0, Number.MAX_SAFE_INTEGER],
      ratios: [0.5, -2],
      precises: [Math.PI],
      inners: [
        { text: "x", number: 0, list: [] },
        { text: "", number: 1, list: [9] },
      ],
    } satisfies Sample;
    expect(decode(encodeMessage(SampleSchema, value))).toEqual(value);
    expect(
      decode(encodeMessage(SampleSchema, value, { packed: true })),
    ).toEqual(value);
  });

  it("reads hand-assembled bytes for each wire type", () => {
    const bytes = fromHex(
      [
        "0a 02 68 69", // 1: "hi"
        "12 01 ff", // 2: [0xff]
        "18 01", // 3: true
        "20 fe ff ff ff ff ff ff ff ff 01", // 4: -2
        "28 ff ff ff ff 0f", // 5: 4294967295
        "30 05", // 6: 5
        "38 ff ff ff ff ff ff ff ff ff 01", // 7: 2^64 - 1
        "40 fb ff ff ff ff ff ff ff ff 01", // 8: -5
        "4d 00 00 c0 3f", // 9: 1.5
        "51 00 00 00 00 00 00 f0 3f", // 10: 1
        "5a 04 0a 02 6f 6b", // 11: { text: "ok" }
      ].join(" "),
    );
    expect(decode(bytes)).toMatchObject({
      text: "hi",
      raw: Uint8Array.of(0xff),
      flag: true,
      small: -2,
      unsigned: 2 ** 32 - 1,
      kind: 5,
      id: "18446744073709551615",
      total: -5,
      ratio: 1.5,
      precise: 1,
      inner: { text: "ok", number: 0, list: [] },
    });
  });

  it("reads ids as unsigned decimal strings, whatever their sign as int64", () => {
    const negative = encodeMessage(
      defineSchema<{ total: number }>("Signed", { total: f.count(7) }),
      { total: -1 },
    );
    expect(decode(negative).id).toBe("18446744073709551615");
    expect(decode(concat(tag(7, WireType.VARINT), varint(2n ** 63n))).id).toBe(
      "9223372036854775808",
    );
  });

  it("returns byte fields as views into the input", () => {
    const input = concat(tag(2, WireType.LEN), varint(2), Uint8Array.of(7, 8));
    const { raw } = decode(input);
    expect(raw.buffer).toBe(input.buffer);
    expect([...raw]).toEqual([7, 8]);
  });

  it("skips unknown fields of every wire type, wherever they are", () => {
    const known = encodeMessage(SampleSchema, { text: "a", small: 5 });
    const unknown = [
      unknownField(100, WireType.VARINT, varint(-1)),
      unknownField(101, WireType.I64, fixed64(1n)),
      unknownField(102, WireType.LEN, fromHex("08 01")),
      unknownField(
        103,
        WireType.SGROUP,
        unknownField(1, WireType.VARINT, varint(1)),
      ),
      unknownField(104, WireType.I32, fixed32(1)),
    ];
    const bytes = concat(
      unknown[0]!,
      unknown[1]!,
      known,
      unknown[2]!,
      unknown[3]!,
      unknown[4]!,
    );
    expect(decode(bytes)).toEqual({
      ...SampleSchema.create(),
      text: "a",
      small: 5,
    });
  });

  it("skips known fields that arrive with the wrong wire type", () => {
    const bytes = concat(
      unknownField(1, WireType.VARINT, varint(1)), // string as a varint
      unknownField(4, WireType.LEN, fromHex("01 02")), // int32 as bytes, not repeated
      unknownField(9, WireType.VARINT, varint(1)), // float as a varint
      unknownField(10, WireType.I32, fixed32(1)), // double as 4 bytes
      unknownField(11, WireType.VARINT, varint(1)), // message as a varint
      unknownField(21, WireType.I64, fixed64(1n)), // repeated string as 8 bytes
      unknownField(31, WireType.I32, fixed32(1)), // repeated message as 4 bytes
      unknownField(3, WireType.SGROUP), // bool as a group
      encodeMessage(SampleSchema, { small: 9 }),
    );
    expect(decode(bytes)).toEqual({ ...SampleSchema.create(), small: 9 });
  });

  it("appends repeated fields, packed and unpacked alike", () => {
    const bytes = concat(
      encodeMessage(SampleSchema, { smalls: [1, 2] }),
      encodeMessage(SampleSchema, { smalls: [3, -4] }, { packed: true }),
      encodeMessage(SampleSchema, { smalls: [5], texts: ["x"] }),
      encodeMessage(SampleSchema, { texts: ["y"] }),
    );
    const decoded = decode(bytes);
    expect(decoded.smalls).toEqual([1, 2, 3, -4, 5]);
    expect(decoded.texts).toEqual(["x", "y"]);
  });

  it("reads packed fixed-size and 64-bit values", () => {
    const packed = (field: number, ...values: Uint8Array[]) =>
      unknownField(field, WireType.LEN, concat(...values));
    const bytes = concat(
      packed(29, fixed32(0x3fc00000), fixed32(0)),
      packed(30, fixed64(0x3ff0000000000000n)),
      packed(27, varint(1), varint(2n ** 64n - 1n)),
      packed(28, varint(-3)),
      packed(23, varint(0), varint(2)),
      packed(25, varint(-1)),
    );
    expect(decode(bytes)).toMatchObject({
      ratios: [1.5, 0],
      precises: [1],
      ids: ["1", "18446744073709551615"],
      totals: [-3],
      flags: [false, true],
      unsigneds: [2 ** 32 - 1],
    });
  });

  it("refuses a packed field cut short", () => {
    const bytes = unknownField(29, WireType.LEN, Uint8Array.of(0, 0));
    expect(() => decode(bytes)).toThrow(ProtocolError);
  });

  it("keeps the last value of a scalar field seen twice", () => {
    const bytes = concat(
      encodeMessage(SampleSchema, { text: "first", small: 1 }),
      encodeMessage(SampleSchema, { text: "second" }),
    );
    expect(decode(bytes)).toMatchObject({ text: "second", small: 1 });
  });

  it("merges a message field seen twice", () => {
    const bytes = concat(
      encodeMessage(SampleSchema, { inner: { text: "a", list: [1] } }),
      encodeMessage(SampleSchema, { inner: { number: 2, list: [3] } }),
    );
    expect(decode(bytes).inner).toEqual({ text: "a", number: 2, list: [1, 3] });
  });

  it("decodes an empty nested message to its defaults", () => {
    const bytes = unknownField(11, WireType.LEN);
    expect(decode(bytes).inner).toEqual({ text: "", number: 0, list: [] });
  });

  it("wraps malformed input in a ProtocolError naming the message", () => {
    const truncated = fromHex("0a 05 61 62");
    expect(() => decode(truncated)).toThrow(ProtocolError);
    expect(() => decode(truncated)).toThrow(
      "Can't decode Sample: Length 5 runs past the end of the message (byte 1)",
    );
    try {
      decode(truncated);
    } catch (error) {
      expect((error as ProtocolError).cause).toBeInstanceOf(ProtocolError);
      expect((error as ProtocolError).retryable).toBe(true);
    }
  });

  it("refuses an end of group without a start", () => {
    expect(() => decode(tag(3, WireType.EGROUP))).toThrow(
      "Can't decode Sample: End of group 3 without a start",
    );
  });

  describe("nesting", () => {
    interface Level {
      child?: Level;
      leaf: number;
    }
    // A chain of distinct schemas, `levels` deep below the top.
    const chain = (levels: number): MessageSchema<Level> => {
      let schema = defineSchema<Level>("Level0", {
        child: f.message(1, InnerSchema as unknown as MessageSchema<Level>),
        leaf: f.int32(2),
      });
      for (let level = 1; level <= levels; level++) {
        schema = defineSchema<Level>(`Level${level}`, {
          child: f.message(1, schema),
          leaf: f.int32(2),
        });
      }
      return schema;
    };
    const nested = (levels: number): Uint8Array => {
      let bytes: Uint8Array = fromHex("10 01");
      for (let level = 0; level < levels; level++) {
        bytes = unknownField(1, WireType.LEN, bytes);
      }
      return bytes;
    };

    it(`decodes ${MAX_DEPTH} levels of nested messages`, () => {
      let value: Level | undefined = decodeMessage(
        chain(MAX_DEPTH),
        nested(MAX_DEPTH),
      );
      for (let level = 0; level < MAX_DEPTH; level++) value = value?.child;
      expect(value?.leaf).toBe(1);
    });

    it(`refuses more than ${MAX_DEPTH}`, () => {
      expect(() =>
        decodeMessage(chain(MAX_DEPTH + 1), nested(MAX_DEPTH + 1)),
      ).toThrow(`Messages are nested more than ${MAX_DEPTH} levels deep`);
    });
  });

  describe("unsafe counts", () => {
    const CountSchema = defineSchema<{ total: number; totals: number[] }>(
      "Counts",
      { total: f.count(1), totals: f.repeated.count(2) },
    );

    it("reads safe values exactly and reports unsafe ones", () => {
      const onUnsafeInteger = vi.fn();
      const bytes = encodeMessage(CountSchema, {
        total: Number.MAX_SAFE_INTEGER,
        totals: [-Number.MAX_SAFE_INTEGER],
      });
      expect(decodeMessage(CountSchema, bytes, { onUnsafeInteger })).toEqual({
        total: Number.MAX_SAFE_INTEGER,
        totals: [-Number.MAX_SAFE_INTEGER],
      });
      expect(onUnsafeInteger).not.toHaveBeenCalled();

      const unsafe = concat(
        tag(1, WireType.VARINT),
        varint(2n ** 53n + 1n),
        tag(2, WireType.VARINT),
        varint(-(2n ** 60n)),
      );
      expect(decodeMessage(CountSchema, unsafe, { onUnsafeInteger })).toEqual({
        total: 2 ** 53,
        totals: [-(2 ** 60)],
      });
      expect(onUnsafeInteger).toHaveBeenNthCalledWith(
        1,
        "Counts.total",
        2n ** 53n + 1n,
      );
      expect(onUnsafeInteger).toHaveBeenNthCalledWith(
        2,
        "Counts.totals",
        -(2n ** 60n),
      );
    });

    it("warns once per field by default", () => {
      const warn = vi
        .spyOn(process, "emitWarning")
        .mockImplementation(() => undefined);
      const schema = defineSchema<{ total: number }>("DefaultWarning", {
        total: f.count(1),
      });
      const bytes = concat(tag(1, WireType.VARINT), varint(2n ** 62n));

      decodeMessage(schema, bytes);
      decodeMessage(schema, bytes);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        "DefaultWarning.total is 4611686018427387904, past Number.MAX_SAFE_INTEGER: its number value is rounded",
        { type: "UnsafeIntegerWarning" },
      );
    });
  });
});

describe("createUnsafeIntegerReporter", () => {
  it("reports the first value of each path only", () => {
    const report = vi.fn();
    const hook = createUnsafeIntegerReporter(report);
    hook("A.x", 1n);
    hook("A.x", 2n);
    hook("A.y", 3n);
    expect(report.mock.calls).toEqual([
      ["A.x", 1n],
      ["A.y", 3n],
    ]);
  });
});
