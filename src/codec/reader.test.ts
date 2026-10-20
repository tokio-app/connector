import { describe, expect, it } from "vitest";
import { ProtocolError } from "../errors.js";
import { MAX_DEPTH, WireReader, WireType } from "./reader.js";
import {
  concat,
  fromHex,
  tag,
  unknownField,
  varint,
} from "../../test/helpers/encoder.js";

const reader = (hex: string) => new WireReader(fromHex(hex));

describe("WireReader", () => {
  describe("tag", () => {
    it("reads the protobuf spec example: field 1, varint 150", () => {
      const r = reader("08 96 01");
      const t = r.tag();
      expect(t >>> 3).toBe(1);
      expect(t & 7).toBe(WireType.VARINT);
      expect(r.varint32()).toBe(150);
      expect(r.eof).toBe(true);
      expect(r.pos).toBe(3);
    });

    it("reads the largest field number", () => {
      const t = reader("fd ff ff ff 0f").tag();
      expect(t >>> 3).toBe(2 ** 29 - 1);
      expect(t & 7).toBe(WireType.I32);
    });

    it("refuses field number 0", () => {
      expect(() => reader("00").tag()).toThrow("Field number 0 (byte 0)");
      expect(() => reader("02").tag()).toThrow(ProtocolError);
    });

    it("refuses wire types 6 and 7", () => {
      expect(() => reader("0e").tag()).toThrow("Invalid wire type 6");
      expect(() => reader("0f").tag()).toThrow("Invalid wire type 7");
    });

    it("refuses tags longer than 32 bits", () => {
      expect(() => reader("80 80 80 80 10").tag()).toThrow(
        "Tag is longer than 32 bits (byte 0)",
      );
    });

    it("refuses a tag cut short", () => {
      expect(() => reader("80").tag()).toThrow("Unexpected end of message");
    });
  });

  describe("varint32", () => {
    it.each([
      ["00", 0],
      ["01", 1],
      ["7f", 127],
      ["ac 02", 300],
      ["ff ff ff ff 07", 2 ** 31 - 1],
    ])("reads %s as %d", (hex, value) => {
      expect(reader(hex).varint32()).toBe(value);
    });

    it("reads 10-byte negative int32 values", () => {
      expect(reader("ff ff ff ff ff ff ff ff ff 01").varint32()).toBe(-1);
      expect(reader("80 80 80 80 f8 ff ff ff ff 01").varint32()).toBe(
        -(2 ** 31),
      );
    });

    it("keeps the low 32 bits of a 5-byte value", () => {
      // 0xffffffff, a uint32.
      expect(reader("ff ff ff ff 0f").varint32() >>> 0).toBe(2 ** 32 - 1);
      // 2^32 + 5: the high bit is dropped.
      expect(reader("85 80 80 80 10").varint32()).toBe(5);
    });

    it("refuses varints longer than 10 bytes", () => {
      expect(() =>
        reader("ff ff ff ff ff ff ff ff ff ff 01").varint32(),
      ).toThrow("Varint is longer than 10 bytes");
    });

    it("refuses a varint cut short", () => {
      expect(() => reader("ff").varint32()).toThrow(ProtocolError);
      expect(() => reader("ff ff ff ff ff ff").varint32()).toThrow(
        "Unexpected end of message (byte 6)",
      );
    });
  });

  describe("varint64", () => {
    it.each([
      ["00", 0n],
      ["01", 1n],
      ["ff ff ff 7f", 2n ** 28n - 1n],
      ["80 80 80 80 01", 2n ** 28n],
      ["ff ff ff ff 0f", 2n ** 32n - 1n],
      ["80 80 80 80 10", 2n ** 32n],
      ["ff ff ff ff 7f", 2n ** 35n - 1n],
      ["80 80 80 80 80 01", 2n ** 35n],
      ["81 80 80 80 80 80 80 80 80 01", 2n ** 63n + 1n],
      ["ff ff ff ff ff ff ff ff ff 01", 2n ** 64n - 1n],
    ])("reads %s as %d", (hex, value) => {
      expect(reader(hex).varint64()).toBe(value);
    });

    it("reads TikTok-sized ids exactly", () => {
      const id = 7_140_000_000_000_000_001n;
      expect(new WireReader(varint(id)).varint64()).toBe(id);
    });

    it("drops bits past 64 in the 10th byte", () => {
      expect(reader("ff ff ff ff ff ff ff ff ff 7f").varint64()).toBe(
        2n ** 64n - 1n,
      );
    });

    it("refuses varints longer than 10 bytes", () => {
      expect(() =>
        reader("80 80 80 80 80 80 80 80 80 80 01").varint64(),
      ).toThrow("Varint is longer than 10 bytes");
    });

    it("refuses a varint cut short", () => {
      expect(() => reader("80 80 80 80 80").varint64()).toThrow(
        "Unexpected end of message",
      );
    });
  });

  describe("bool", () => {
    it.each([
      ["00", false],
      ["01", true],
      ["02", true],
      ["80 00", false],
      ["80 01", true],
      ["80 80 80 80 80 80 80 80 80 01", true],
      ["80 80 80 80 80 80 80 80 80 02", false],
    ])("reads %s as %s", (hex, value) => {
      expect(reader(hex).bool()).toBe(value);
    });

    it("refuses varints longer than 10 bytes", () => {
      expect(() => reader("80 80 80 80 80 80 80 80 80 80 00").bool()).toThrow(
        "Varint is longer than 10 bytes",
      );
    });
  });

  describe("fixed-size values", () => {
    it("reads fixed32 and fixed64 little-endian", () => {
      expect(reader("01 00 00 80").fixed32()).toBe(2 ** 31 + 1);
      expect(reader("ff ff ff ff").fixed32()).toBe(2 ** 32 - 1);
      expect(reader("01 00 00 00 00 00 00 80").fixed64()).toBe(2n ** 63n + 1n);
      expect(reader("ff ff ff ff ff ff ff ff").fixed64()).toBe(2n ** 64n - 1n);
    });

    it("reads floats and doubles", () => {
      expect(reader("00 00 c0 3f").float()).toBe(1.5);
      expect(reader("9a 99 99 99 99 99 b9 3f").double()).toBe(0.1);
    });

    it("reads them from a view that doesn't start at 0", () => {
      const buffer = fromHex("ff 00 00 c0 3f 9a 99 99 99 99 99 b9 3f");
      const r = new WireReader(buffer.subarray(1));
      expect(r.float()).toBe(1.5);
      expect(r.double()).toBe(0.1);
      expect(r.eof).toBe(true);
    });

    it("refuses values cut short", () => {
      expect(() => reader("01 02 03").fixed32()).toThrow(
        "Unexpected end of message: 4 bytes needed, 3 left (byte 0)",
      );
      expect(() => reader("01 02 03 04 05 06 07").fixed64()).toThrow(
        "8 bytes needed, 7 left",
      );
      expect(() => reader("00 00").float()).toThrow(ProtocolError);
      expect(() => reader("00").double()).toThrow(ProtocolError);
    });
  });

  describe("bytes and string", () => {
    it("returns a view into the input, not a copy", () => {
      const input = fromHex("03 01 02 03 ff");
      const bytes = new WireReader(input).bytes();
      expect([...bytes]).toEqual([1, 2, 3]);
      expect(bytes.buffer).toBe(input.buffer);
      expect(bytes.byteOffset).toBe(1);
    });

    it("reads the spec example string", () => {
      expect(reader("07 74 65 73 74 69 6e 67").string()).toBe("testing");
    });

    it("reads empty values", () => {
      const r = reader("00 00");
      expect(r.bytes()).toHaveLength(0);
      expect(r.string()).toBe("");
    });

    it("decodes UTF-8, keeps a byte order mark and replaces invalid bytes", () => {
      const text = "héllo ✓ 🎁";
      const encoded = new TextEncoder().encode(text);
      expect(
        new WireReader(concat(varint(encoded.length), encoded)).string(),
      ).toBe(text);
      expect(reader("03 ef bb bf").string()).toBe("﻿");
      expect(reader("01 ff").string()).toBe("�");
    });

    it("refuses a length past the end", () => {
      expect(() => reader("05 01 02").bytes()).toThrow(
        "Length 5 runs past the end of the message (byte 0)",
      );
      // A length beyond 2^53 is never exact, and always too long.
      expect(() => reader("ff ff ff ff ff ff ff ff ff 01").bytes()).toThrow(
        ProtocolError,
      );
    });

    it("refuses a length varint longer than 10 bytes", () => {
      expect(() => reader("80 80 80 80 80 80 80 80 80 80 00").bytes()).toThrow(
        "Varint is longer than 10 bytes (byte 0)",
      );
    });
  });

  describe("message", () => {
    it("returns a reader over the nested message, one level deeper", () => {
      const r = reader("03 08 96 01 10 01");
      const nested = r.message();
      expect(nested.depth).toBe(1);
      expect(nested.tag()).toBe(8);
      expect(nested.varint32()).toBe(150);
      expect(nested.eof).toBe(true);
      expect(r.tag()).toBe(16);
    });

    it(`allows ${MAX_DEPTH} levels and refuses more`, () => {
      expect(new WireReader(fromHex("00"), MAX_DEPTH).depth).toBe(MAX_DEPTH);
      expect(() => new WireReader(fromHex("00"), MAX_DEPTH).message()).toThrow(
        `Messages are nested more than ${MAX_DEPTH} levels deep`,
      );
      expect(() => new WireReader(new Uint8Array(0), MAX_DEPTH + 1)).toThrow(
        ProtocolError,
      );
    });
  });

  describe("skip", () => {
    const skipAll = (bytes: Uint8Array, depth = 0) => {
      const r = new WireReader(bytes, depth);
      while (!r.eof) {
        const t = r.tag();
        r.skip(t & 7, t >>> 3);
      }
      return r;
    };

    it("skips every wire type", () => {
      const bytes = concat(
        unknownField(1, WireType.VARINT, varint(-1)),
        unknownField(2, WireType.I64, new Uint8Array(8)),
        unknownField(3, WireType.LEN, fromHex("01 02 03")),
        unknownField(4, WireType.I32, new Uint8Array(4)),
        unknownField(
          5,
          WireType.SGROUP,
          concat(
            unknownField(1, WireType.VARINT, varint(1)),
            unknownField(6, WireType.SGROUP, unknownField(2, WireType.LEN)),
            unknownField(3, WireType.I32, new Uint8Array(4)),
          ),
        ),
        unknownField(7, WireType.VARINT, varint(150)),
      );
      expect(skipAll(bytes).eof).toBe(true);
    });

    it("refuses an end of group without a start", () => {
      expect(() => skipAll(tag(5, WireType.EGROUP))).toThrow(
        "End of group 5 without a start",
      );
    });

    it("refuses an end of group for another field", () => {
      expect(() =>
        skipAll(concat(tag(5, WireType.SGROUP), tag(6, WireType.EGROUP))),
      ).toThrow("Group 5 ended by an end of group 6");
    });

    it("refuses a group that never ends", () => {
      expect(() =>
        skipAll(
          concat(tag(5, WireType.SGROUP), tag(1, WireType.VARINT), varint(1)),
        ),
      ).toThrow("Unexpected end of message");
    });

    it("refuses invalid wire types", () => {
      expect(() => reader("").skip(7, 1)).toThrow("Invalid wire type 7");
      expect(() => reader("").skip(6)).toThrow("Invalid wire type 6");
    });

    it("refuses values cut short", () => {
      expect(() => reader("80").skip(WireType.VARINT)).toThrow(ProtocolError);
      expect(() => reader("00").skip(WireType.I64)).toThrow(ProtocolError);
      expect(() => reader("00 00").skip(WireType.I32)).toThrow(ProtocolError);
      expect(() => reader("02 00").skip(WireType.LEN)).toThrow(ProtocolError);
      expect(() =>
        reader("80 80 80 80 80 80 80 80 80 80 00").skip(WireType.VARINT),
      ).toThrow("Varint is longer than 10 bytes");
    });

    const nestedGroups = (levels: number): Uint8Array => {
      let inner: Uint8Array = new Uint8Array(0);
      for (let level = 0; level < levels; level++) {
        inner = unknownField(1, WireType.SGROUP, inner);
      }
      return inner;
    };

    it(`allows ${MAX_DEPTH} levels of groups and refuses more`, () => {
      expect(skipAll(nestedGroups(MAX_DEPTH)).eof).toBe(true);
      expect(() => skipAll(nestedGroups(MAX_DEPTH + 1))).toThrow(
        `Messages are nested more than ${MAX_DEPTH} levels deep`,
      );
      // The reader's own depth counts too.
      expect(() => skipAll(nestedGroups(2), MAX_DEPTH - 1)).toThrow(
        ProtocolError,
      );
    });
  });
});
