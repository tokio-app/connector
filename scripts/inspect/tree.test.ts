import { describe, expect, it } from "vitest";
import {
  inspectPayloads,
  matchesMethod,
  MAX_DISTINCT,
  MAX_INSPECT_DEPTH,
  printable,
  type MessageStats,
} from "./tree.js";
import {
  concat,
  fields,
  fromHex,
  unknownField,
} from "../../test/helpers/encoder.js";
import { WireType } from "../../src/codec/reader.js";

// Synthetic payloads: made-up values, never bytes from a capture.

function root(...payloads: Uint8Array[]): MessageStats {
  const [stats] = inspectPayloads(
    payloads.map((payload) => ({ method: "WebcastTest", payload })),
  );
  return stats!.root;
}

function field(message: MessageStats | undefined, no: number) {
  const stats = message?.fields.get(no);
  if (stats === undefined) throw new Error(`no field ${no}`);
  return stats;
}

describe("inspectPayloads", () => {
  it("reads varints as unsigned and signed, with their range and distinct values", () => {
    const stats = root(
      concat(fields.varint(2, 5), fields.varint(3, -1)),
      concat(fields.varint(2, 7), fields.varint(3, 1)),
      fields.varint(2, 5),
    );
    expect(stats.count).toBe(3);
    const two = field(stats, 2);
    expect(two).toMatchObject({
      no: 2,
      wires: new Set([WireType.VARINT]),
      present: 3,
      occurrences: 3,
      maxPerMessage: 1,
    });
    expect(two.varint).toEqual({
      count: 3,
      min: 5n,
      max: 7n,
      minSigned: 5n,
      maxSigned: 7n,
      distinct: {
        values: new Map([
          ["5", 2],
          ["7", 1],
        ]),
        dropped: 0,
      },
    });
    expect(field(stats, 3)).toMatchObject({
      present: 2,
      varint: {
        min: 1n,
        max: 18_446_744_073_709_551_615n,
        minSigned: -1n,
        maxSigned: 1n,
      },
    });
  });

  it("reads printable UTF-8 as text, other bytes as a nested message, else as bytes", () => {
    const stats = root(
      concat(
        fields.string(1, "héllo\tworld\n"),
        fields.message(2, fields.varint(1, 9), fields.string(2, "inner")),
        fields.bytes(3, Uint8Array.of(0xff, 0xfe)),
        fields.bytes(4, new Uint8Array(0)),
      ),
    );
    expect(field(stats, 1).string).toEqual({
      count: 1,
      minLength: 12,
      maxLength: 12,
      distinct: { values: new Map([["héllo\tworld\n", 1]]), dropped: 0 },
    });
    const nested = field(stats, 2).message;
    expect(nested?.count).toBe(1);
    expect(field(nested, 1).varint?.max).toBe(9n);
    expect(field(nested, 2).string?.distinct.values).toEqual(
      new Map([["inner", 1]]),
    );
    expect(field(stats, 3).bytes).toEqual({
      count: 1,
      minLength: 2,
      maxLength: 2,
      distinct: { values: new Map([["ff fe", 1]]), dropped: 0 },
    });
    expect(field(stats, 4)).toMatchObject({ empty: 1, occurrences: 1 });
    expect(field(stats, 4).string).toBeUndefined();
  });

  it("merges a nested message over every instance, and counts repeats", () => {
    const entry = (key: number, score?: number) =>
      fields.message(
        3,
        fields.varint(1, key),
        ...(score === undefined ? [] : [fields.varint(2, score)]),
      );
    const stats = root(
      concat(entry(11, 300), entry(22)),
      concat(entry(33, 5), entry(44, 6), entry(55, 7)),
    );
    const three = field(stats, 3);
    expect(three).toMatchObject({
      present: 2,
      occurrences: 5,
      maxPerMessage: 3,
    });
    expect(three.message?.count).toBe(5);
    expect(field(three.message, 1)).toMatchObject({
      present: 5,
      varint: { min: 11n, max: 55n },
    });
    expect(field(three.message, 2)).toMatchObject({
      present: 4,
      varint: { min: 5n, max: 300n },
    });
  });

  it("reads fixed32 and fixed64 values, and skips groups", () => {
    const stats = root(
      concat(
        fields.fixed32(5, 0x3f800000),
        fields.fixed64(6, 0x3ff0000000000000n),
        unknownField(7, WireType.SGROUP, fields.varint(1, 1)),
      ),
    );
    expect(field(stats, 5).i32).toEqual({
      count: 1,
      distinct: { values: new Map([["1065353216", 1]]), dropped: 0 },
    });
    expect(field(stats, 6).i64?.distinct.values).toEqual(
      new Map([["4607182418800017408", 1]]),
    );
    expect(field(stats, 7)).toMatchObject({
      groups: 1,
      wires: new Set([WireType.SGROUP]),
    });
  });

  it("records every wire type a field number comes with", () => {
    const stats = root(fields.varint(4, 1), fields.string(4, "text"));
    expect(field(stats, 4)).toMatchObject({
      wires: new Set([WireType.VARINT, WireType.LEN]),
      present: 2,
      varint: { count: 1 },
      string: { count: 1 },
    });
  });

  it("keeps MAX_DISTINCT values and counts the rest", () => {
    const payloads = Array.from({ length: MAX_DISTINCT + 3 }, (_, index) =>
      fields.varint(1, index),
    );
    const { distinct } = field(root(...payloads), 1).varint!;
    expect(distinct.values.size).toBe(MAX_DISTINCT);
    expect(distinct.dropped).toBe(3);
    // A value already kept is still counted past the cap.
    const again = field(root(...payloads, fields.varint(1, 0)), 1).varint!;
    expect(again.distinct.values.get("0")).toBe(2);
    expect(again.distinct.dropped).toBe(3);
  });

  it("stops trying nested messages MAX_INSPECT_DEPTH levels down", () => {
    let bytes = fields.bytes(1, Uint8Array.of(0x08, 0x01));
    for (let level = 0; level < MAX_INSPECT_DEPTH; level++) {
      bytes = fields.message(1, bytes);
    }
    let stats: MessageStats | undefined = root(bytes);
    for (let level = 0; level < MAX_INSPECT_DEPTH; level++) {
      stats = field(stats, 1).message;
    }
    // The innermost value, one level too deep to try as a message.
    expect(field(stats, 1).message).toBeUndefined();
    expect(field(stats, 1).bytes?.distinct.values).toEqual(
      new Map([["08 01", 1]]),
    );
  });

  it("counts payloads that aren't protobuf and leaves them out of the tree", () => {
    const [stats] = inspectPayloads([
      { method: "WebcastTest", payload: fields.varint(1, 1) },
      { method: "WebcastTest", payload: fromHex("08") },
      { method: "WebcastTest", payload: fromHex("0f") },
    ]);
    expect(stats).toMatchObject({
      method: "WebcastTest",
      samples: 3,
      errors: 2,
      firstError: "Unexpected end of message (byte 1)",
    });
    expect(stats?.root.count).toBe(1);
  });

  it("reads a nested value that isn't valid protobuf as bytes", () => {
    // 0x0c: field 1 ending a group it never started.
    const stats = root(fields.bytes(2, Uint8Array.of(0x0c, 0x01)));
    expect(field(stats, 2).message).toBeUndefined();
    expect(field(stats, 2).bytes?.count).toBe(1);
  });

  it("groups the payloads by method, in alphabetical order", () => {
    const methods = inspectPayloads([
      { method: "WebcastB", payload: fields.varint(1, 1) },
      { method: "WebcastA", payload: new Uint8Array(0) },
      { method: "WebcastB", payload: fields.varint(1, 2) },
    ]);
    expect(methods.map(({ method, samples }) => [method, samples])).toEqual([
      ["WebcastA", 1],
      ["WebcastB", 2],
    ]);
    expect(methods[0]?.root).toEqual({ count: 1, fields: new Map() });
    expect(inspectPayloads([])).toEqual([]);
  });
});

describe("printable", () => {
  it("accepts UTF-8 text with tabs and line breaks", () => {
    const utf8 = new TextEncoder();
    expect(printable(utf8.encode("Ünïcode ✓\r\n\t"))).toBe("Ünïcode ✓\r\n\t");
  });

  it("refuses invalid UTF-8 and control characters", () => {
    expect(printable(Uint8Array.of(0xc3))).toBeUndefined();
    expect(printable(Uint8Array.of(0x61, 0x00))).toBeUndefined();
    expect(printable(Uint8Array.of(0x08, 0x01))).toBeUndefined();
    expect(printable(Uint8Array.of(0x7f))).toBeUndefined();
  });
});

describe("matchesMethod", () => {
  it("matches the full name or the name without Webcast, and everything without filters", () => {
    expect(matchesMethod("WebcastChatMessage", [])).toBe(true);
    expect(matchesMethod("WebcastChatMessage", ["WebcastChatMessage"])).toBe(
      true,
    );
    expect(matchesMethod("WebcastChatMessage", ["ChatMessage"])).toBe(true);
    expect(matchesMethod("WebcastChatMessage", ["Chat", "Like"])).toBe(false);
    expect(matchesMethod("WebcastChatMessage", ["chatmessage"])).toBe(false);
  });
});
