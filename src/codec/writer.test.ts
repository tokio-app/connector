import { describe, expect, it } from "vitest";
import { WireReader, WireType } from "./reader.js";
import { WireWriter } from "./writer.js";
import { toHex } from "../../test/helpers/encoder.js";

const hex = (writer: WireWriter) => toHex(writer.finish());

describe("WireWriter", () => {
  it("writes the protobuf spec examples", () => {
    expect(hex(new WireWriter().varint(1, 150))).toBe("08 96 01");
    expect(hex(new WireWriter().string(2, "testing"))).toBe(
      "12 07 74 65 73 74 69 6e 67",
    );
    expect(
      hex(new WireWriter().message(3, (nested) => nested.varint(1, 150))),
    ).toBe("1a 03 08 96 01");
  });

  it("writes bytes fields", () => {
    expect(hex(new WireWriter().bytes(8, Uint8Array.of(1, 2, 3)))).toBe(
      "42 03 01 02 03",
    );
    expect(hex(new WireWriter().bytes(8, new Uint8Array(0)))).toBe("42 00");
  });

  it("writes UTF-8 strings", () => {
    expect(hex(new WireWriter().string(1, "é✓"))).toBe("0a 05 c3 a9 e2 9c 93");
  });

  it("writes 64-bit values given as numbers, bigints or decimal strings", () => {
    const max = "ff ff ff ff ff ff ff ff ff 01";
    expect(hex(new WireWriter().varint(1, 2n ** 64n - 1n))).toBe(`08 ${max}`);
    expect(hex(new WireWriter().varint(1, "18446744073709551615"))).toBe(
      `08 ${max}`,
    );
    expect(hex(new WireWriter().varint(1, 7_140_000_000_000_000_001n))).toBe(
      "08 81 80 a8 82 bb 85 98 8b 63",
    );
    expect(hex(new WireWriter().varint(1, Number.MAX_SAFE_INTEGER))).toBe(
      "08 ff ff ff ff ff ff ff 0f",
    );
    expect(hex(new WireWriter().varint(1, 2n ** 53n))).toBe(
      "08 80 80 80 80 80 80 80 10",
    );
    expect(hex(new WireWriter().varint(1, 0))).toBe("08 00");
  });

  it("writes negative values as their 64-bit two's complement", () => {
    expect(hex(new WireWriter().varint(1, -1))).toBe(
      "08 ff ff ff ff ff ff ff ff ff 01",
    );
    expect(hex(new WireWriter().varint(1, "-9223372036854775808"))).toBe(
      "08 80 80 80 80 80 80 80 80 80 01",
    );
  });

  it("writes the largest field number", () => {
    expect(hex(new WireWriter().varint(2 ** 29 - 1, 1))).toBe(
      "f8 ff ff ff 0f 01",
    );
  });

  it.each([0, -1, 1.5, 2 ** 29])("refuses field number %d", (field) => {
    expect(() => new WireWriter().varint(field, 1)).toThrow(RangeError);
    expect(() => new WireWriter().string(field, "")).toThrow(
      "Field number must be a whole number from 1 to 536870911",
    );
  });

  it.each<[number | bigint | string, string]>([
    [1.5, "must be a safe integer, got 1.5"],
    [Number.NaN, "must be a safe integer"],
    [2 ** 53, "must be a safe integer"],
    ["12a", 'must be a decimal integer, got "12a"'],
    ["", "must be a decimal integer"],
    [2n ** 64n, "doesn't fit in 64 bits"],
    [-(2n ** 63n) - 1n, "doesn't fit in 64 bits"],
  ])("refuses varint value %s", (value, message) => {
    expect(() => new WireWriter().varint(1, value)).toThrow(RangeError);
    expect(() => new WireWriter().varint(1, value)).toThrow(message);
  });

  it("grows past its initial buffer", () => {
    const payload = Uint8Array.from({ length: 300 }, (_, index) => index % 256);
    const writer = new WireWriter();
    for (let field = 1; field <= 40; field++) writer.varint(field, field);
    writer.bytes(41, payload);
    const bytes = writer.finish();

    const reader = new WireReader(bytes);
    for (let field = 1; field <= 40; field++) {
      expect(reader.tag()).toBe(field * 8 + WireType.VARINT);
      expect(reader.varint32()).toBe(field);
    }
    expect(reader.tag()).toBe(41 * 8 + WireType.LEN);
    expect(reader.bytes()).toEqual(payload);
    expect(reader.eof).toBe(true);
  });

  it("returns a copy from finish", () => {
    const writer = new WireWriter().varint(1, 1);
    const first = writer.finish();
    first[0] = 0xff;
    expect(toHex(writer.finish())).toBe("08 01");
  });

  it("round-trips a frame through WireReader", () => {
    const bytes = new WireWriter()
      .varint(2, "7140000000000000001")
      .string(6, "pb")
      .string(7, "ack")
      .bytes(8, new TextEncoder().encode("internal"))
      .finish();
    const reader = new WireReader(bytes);
    expect(reader.tag()).toBe(16);
    expect(reader.varint64()).toBe(7_140_000_000_000_000_001n);
    expect(reader.tag()).toBe(50);
    expect(reader.string()).toBe("pb");
    expect(reader.tag()).toBe(58);
    expect(reader.string()).toBe("ack");
    expect(reader.tag()).toBe(66);
    expect(reader.string()).toBe("internal");
    expect(reader.eof).toBe(true);
  });
});
