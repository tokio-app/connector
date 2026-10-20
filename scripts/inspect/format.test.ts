import { describe, expect, it } from "vitest";
import {
  asDouble,
  asFloat,
  formatInspection,
  formatMethod,
  inspectionJson,
  showText,
  varintHint,
} from "./format.js";
import { inspectPayloads, MAX_DISTINCT, type VarintStats } from "./tree.js";
import { concat, fields, fromHex } from "../../test/helpers/encoder.js";

// Synthetic payloads: made-up values, never bytes from a capture.

function inspect(...payloads: Uint8Array[]) {
  return inspectPayloads(
    payloads.map((payload) => ({ method: "WebcastTest", payload })),
  );
}

describe("formatMethod", () => {
  it("prints a field per line, nested messages below their field", () => {
    const sample = (id: bigint, count: number) =>
      concat(
        fields.message(
          1,
          fields.string(1, "WebcastTest"),
          fields.varint(4, 1_760_000_000_000 + count),
        ),
        fields.varint(2, id),
        fields.message(3, fields.varint(1, count)),
        fields.message(3, fields.varint(1, count + 1)),
        fields.varint(5, count === 1 ? 1 : 0),
      );
    const [stats] = inspect(
      sample(7_300_000_000_000_000_001n, 1),
      sample(7_300_000_000_000_000_002n, 2),
    );
    expect(formatMethod(stats!)).toEqual([
      "WebcastTest  2 samples",
      "  1  message  in 2/2",
      '      1  string  in 2/2  length 11; 1 distinct: "WebcastTest" ×2',
      "      4  varint  in 2/2  2 distinct: 1760000000001 ×1, 1760000000002 ×1; range 1760000000001..1760000000002; times in ms?",
      "  2  varint  in 2/2  2 distinct: 7300000000000000001 ×1, 7300000000000000002 ×1; range 7300000000000000001..7300000000000000002; 64-bit ids?",
      "  3  message  in 2/2, repeated (up to 2)",
      "      1  varint  in 4/4  3 distinct: 2 ×2, 1 ×1, 3 ×1; range 1..3",
      "  5  varint  in 2/2  2 distinct: 1 ×1, 0 ×1; range 0..1; 0/1: a bool?",
    ]);
  });

  it("lists every kind of a field that came as several, and its bytes, fixed values and empties", () => {
    const [stats] = inspect(
      concat(
        fields.varint(1, -2),
        fields.bytes(2, Uint8Array.of(0xff, 0x00)),
        fields.fixed32(3, 0x3f800000),
        fields.fixed64(4, 0x4000000000000000n),
        fields.bytes(5, new Uint8Array(0)),
        fromHex("33 08 01 34"), // group 6 holding field 1
      ),
      concat(fields.string(1, "x"), fields.bytes(2, Uint8Array.of(0xff))),
    );
    expect(formatMethod(stats!)).toEqual([
      "WebcastTest  2 samples",
      "  1  varint+string  in 2/2",
      "     - varint: 1 distinct: 18446744073709551614 ×1; as int64 -2..-2",
      '     - string: length 1; 1 distinct: "x" ×1',
      "  2  bytes  in 2/2  lengths 1..2; 2 distinct: <ff 00> ×1, <ff> ×1",
      "  3  fixed32  in 1/2  1 distinct: 1065353216 (1) ×1",
      "  4  fixed64  in 1/2  1 distinct: 4611686018427387904 (2) ×1",
      "  5  empty  in 1/2  1",
      "  6  group  in 1/2  1",
    ]);
  });

  it("gives examples once a field has more values than a line lists", () => {
    const [stats] = inspect(
      ...Array.from({ length: MAX_DISTINCT + 4 }, (_, index) =>
        fields.varint(1, index < 3 ? 100 : index),
      ),
    );
    expect(formatMethod(stats!)[1]).toBe(
      `  1  varint  in 36/36  ${MAX_DISTINCT}+ distinct, most often 100 ×3, 3 ×1, 4 ×1, 5 ×1, 6 ×1; range 3..100`,
    );
    const [few] = inspect(
      ...Array.from({ length: 9 }, (_, index) => fields.varint(1, index + 2)),
    );
    expect(formatMethod(few!)[1]).toBe(
      "  1  varint  in 9/9  9 distinct, most often 2 ×1, 3 ×1, 4 ×1, 5 ×1, 6 ×1; range 2..10",
    );
  });

  it("says how many payloads weren't protobuf", () => {
    const [stats] = inspect(fromHex("08"));
    expect(formatMethod(stats!)).toEqual([
      "WebcastTest  1 sample, 1 not protobuf (Unexpected end of message (byte 1))",
    ]);
  });
});

describe("formatInspection", () => {
  it("joins the methods with a blank line, and says when there are none", () => {
    const methods = inspectPayloads([
      { method: "WebcastA", payload: fields.varint(1, 3) },
      { method: "WebcastB", payload: new Uint8Array(0) },
    ]);
    expect(formatInspection(methods)).toBe(
      [
        "WebcastA  1 sample",
        "  1  varint  in 1/1  1 distinct: 3 ×1",
        "",
        "WebcastB  1 sample",
      ].join("\n"),
    );
    expect(formatInspection([])).toBe("No messages to inspect.");
  });
});

describe("showText", () => {
  it("keeps whitespace and line breaks visible, and cuts long text", () => {
    expect(showText(" ")).toBe('" "');
    expect(showText("a\nb\t")).toBe(String.raw`"a\nb\t"`);
    expect(showText("x".repeat(61))).toBe(`"${"x".repeat(59)}…"`);
    expect(showText("x".repeat(60))).toBe(`"${"x".repeat(60)}"`);
  });
});

describe("varintHint", () => {
  const stats = (min: bigint, max: bigint, maxSigned = max): VarintStats => ({
    count: 1,
    min,
    max,
    minSigned: min,
    maxSigned,
    distinct: { values: new Map(), dropped: 0 },
  });

  it("guesses bools, times and 64-bit ids from the range", () => {
    expect(varintHint(stats(0n, 1n))).toBe("0/1: a bool?");
    expect(varintHint(stats(1_760_000_000_000n, 1_760_000_000_500n))).toBe(
      "times in ms?",
    );
    expect(varintHint(stats(1_760_000_000n, 1_760_000_100n))).toBe(
      "times in s?",
    );
    expect(varintHint(stats(7_000_000_000_000_000_000n, 7n * 10n ** 18n))).toBe(
      "64-bit ids?",
    );
  });

  it("guesses nothing for other ranges", () => {
    expect(varintHint(stats(2n, 500n))).toBeUndefined();
    expect(varintHint(stats(2n ** 63n, 2n ** 64n - 1n, -1n))).toBeUndefined();
    expect(varintHint(stats(1n, 1_760_000_000_000n))).toBeUndefined();
  });
});

describe("asFloat and asDouble", () => {
  it("read a fixed value's bits as a float or double", () => {
    expect(asFloat("1065353216")).toBe(1);
    expect(asDouble("4611686018427387904")).toBe(2);
  });
});

describe("inspectionJson", () => {
  it("gives the trees as JSON-safe values", () => {
    const methods = inspectPayloads([
      {
        method: "WebcastTest",
        payload: concat(
          fields.varint(1, -1),
          fields.message(2, fields.string(1, "a")),
          fields.message(2, fields.string(1, "a")),
          fields.fixed32(3, 1),
          fields.fixed64(4, 2n),
          fields.bytes(5, Uint8Array.of(0xff)),
          fields.bytes(6, new Uint8Array(0)),
          fromHex("3b 3c"), // an empty group 7
        ),
      },
      { method: "WebcastTest", payload: fromHex("08") },
    ]);
    const json = inspectionJson(methods);
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
    expect(json).toEqual([
      {
        method: "WebcastTest",
        samples: 2,
        errors: 1,
        firstError: "Unexpected end of message (byte 1)",
        root: {
          count: 1,
          fields: [
            {
              no: 1,
              wires: [0],
              present: 1,
              occurrences: 1,
              maxPerMessage: 1,
              varint: {
                count: 1,
                min: "18446744073709551615",
                max: "18446744073709551615",
                minSigned: "-1",
                maxSigned: "-1",
                distinct: {
                  values: [{ value: "18446744073709551615", count: 1 }],
                  dropped: 0,
                },
              },
            },
            {
              no: 2,
              wires: [2],
              present: 1,
              occurrences: 2,
              maxPerMessage: 2,
              message: {
                count: 2,
                fields: [
                  {
                    no: 1,
                    wires: [2],
                    present: 2,
                    occurrences: 2,
                    maxPerMessage: 1,
                    string: {
                      count: 2,
                      minLength: 1,
                      maxLength: 1,
                      distinct: {
                        values: [{ value: "a", count: 2 }],
                        dropped: 0,
                      },
                    },
                  },
                ],
              },
            },
            {
              no: 3,
              wires: [5],
              present: 1,
              occurrences: 1,
              maxPerMessage: 1,
              i32: {
                count: 1,
                distinct: { values: [{ value: "1", count: 1 }], dropped: 0 },
              },
            },
            {
              no: 4,
              wires: [1],
              present: 1,
              occurrences: 1,
              maxPerMessage: 1,
              i64: {
                count: 1,
                distinct: { values: [{ value: "2", count: 1 }], dropped: 0 },
              },
            },
            {
              no: 5,
              wires: [2],
              present: 1,
              occurrences: 1,
              maxPerMessage: 1,
              bytes: {
                count: 1,
                minLength: 1,
                maxLength: 1,
                distinct: { values: [{ value: "ff", count: 1 }], dropped: 0 },
              },
            },
            {
              no: 6,
              wires: [2],
              present: 1,
              occurrences: 1,
              maxPerMessage: 1,
              empty: 1,
            },
            {
              no: 7,
              wires: [3],
              present: 1,
              occurrences: 1,
              maxPerMessage: 1,
              groups: 1,
            },
          ],
        },
      },
    ]);
    expect(
      inspectionJson(inspectPayloads([{ method: "A", payload: fromHex("") }])),
    ).toEqual([
      { method: "A", samples: 1, errors: 0, root: { count: 1, fields: [] } },
    ]);
  });
});
