import { describe, expect, it } from "vitest";
import { decodeMessage } from "../../src/codec/decode.js";
import { ChatMessageSchema } from "../../src/codec/messages/chat/chat.js";
import { FetchResultSchema } from "../../src/codec/messages/fetchResult.js";
import { WireType } from "../../src/codec/reader.js";
import { defineSchema, f } from "../../src/codec/schema.js";
import type { ChatMessage } from "../../src/events/index.js";
import {
  concat,
  encodeMessage,
  fields,
  fixed32,
  fixed64,
  fromHex,
  tag,
  toHex,
  unknownField,
  varint,
  type EncodeInput,
} from "./encoder.js";

interface Numbers {
  flag: boolean;
  small: number;
  unsigned: number;
  id: string;
  total: number;
  ratio: number;
  precise: number;
  smalls: number[];
  ratios: number[];
  ids: string[];
  texts: string[];
  raws: Uint8Array[];
}

const NumbersSchema = defineSchema<Numbers>("Numbers", {
  flag: f.bool(1),
  small: f.int32(2),
  unsigned: f.uint32(3),
  id: f.id(4),
  total: f.count(5),
  ratio: f.float(6),
  precise: f.double(7),
  smalls: f.repeated.int32(8),
  ratios: f.repeated.float(9),
  ids: f.repeated.id(10),
  texts: f.repeated.string(11),
  raws: f.repeated.bytes(12),
});

describe("byte helpers", () => {
  it("encodes varints as 64-bit two's complement", () => {
    expect(toHex(varint(150))).toBe("96 01");
    expect(toHex(varint(0))).toBe("00");
    expect(toHex(varint(-1))).toBe("ff ff ff ff ff ff ff ff ff 01");
    expect(toHex(varint(2n ** 64n - 1n))).toBe("ff ff ff ff ff ff ff ff ff 01");
  });

  it("encodes tags and fixed-size values", () => {
    expect(toHex(tag(1, WireType.VARINT))).toBe("08");
    expect(toHex(tag(38, WireType.LEN))).toBe("b2 02");
    expect(toHex(fixed32(1))).toBe("01 00 00 00");
    expect(toHex(fixed64(-1n))).toBe("ff ff ff ff ff ff ff ff");
  });

  it("converts hex both ways and refuses bad hex", () => {
    expect(toHex(fromHex("0A0b 0c"))).toBe("0a 0b 0c");
    expect(fromHex("")).toEqual(new Uint8Array(0));
    expect(() => fromHex("abc")).toThrow("Bad hex: abc");
    expect(() => fromHex("zz")).toThrow("Bad hex");
  });

  it("joins byte arrays", () => {
    expect(
      toHex(concat(fromHex("01"), new Uint8Array(0), fromHex("02 03"))),
    ).toBe("01 02 03");
  });

  it("builds unknown fields of every wire type", () => {
    expect(toHex(unknownField(1, WireType.VARINT, varint(1)))).toBe("08 01");
    expect(toHex(unknownField(2, WireType.LEN, fromHex("aa")))).toBe(
      "12 01 aa",
    );
    expect(toHex(unknownField(3, WireType.SGROUP, fromHex("08 01")))).toBe(
      "1b 08 01 1c",
    );
    expect(toHex(unknownField(4, WireType.EGROUP))).toBe("24");
    expect(toHex(unknownField(5, WireType.I32, fixed32(0)))).toBe(
      "2d 00 00 00 00",
    );
    expect(toHex(unknownField(6, WireType.LEN))).toBe("32 00");
  });

  it("builds fields with explicit numbers", () => {
    expect(toHex(fields.varint(1, 150))).toBe("08 96 01");
    expect(toHex(fields.string(2, "hi"))).toBe("12 02 68 69");
    expect(toHex(fields.bytes(3, fromHex("ff")))).toBe("1a 01 ff");
    expect(toHex(fields.message(4, fields.varint(1, 1)))).toBe("22 02 08 01");
    expect(toHex(fields.fixed32(5, 1))).toBe("2d 01 00 00 00");
    expect(toHex(fields.fixed64(6, 1n))).toBe("31 01 00 00 00 00 00 00 00");
  });
});

describe("encodeMessage", () => {
  it("writes the protobuf spec example", () => {
    const schema = defineSchema<{ a: number }>("Test1", { a: f.int32(1) });
    expect(toHex(encodeMessage(schema, { a: 150 }))).toBe("08 96 01");
  });

  it("leaves out defaults and empty repeated fields, like proto3", () => {
    expect(
      encodeMessage(NumbersSchema, {
        flag: false,
        small: 0,
        id: "0",
        texts: [],
        smalls: [],
      }),
    ).toEqual(new Uint8Array(0));
  });

  it("writes defaults when asked to", () => {
    const bytes = encodeMessage(
      NumbersSchema,
      { flag: false, id: "0", small: 0 },
      { emitDefaults: true },
    );
    expect(toHex(bytes)).toBe("08 00 10 00 20 00");
  });

  it("round-trips every kind through decodeMessage", () => {
    const value: Numbers = {
      flag: true,
      small: -7,
      unsigned: 3_000_000_000,
      id: "18446744073709551615",
      total: -(2 ** 40),
      ratio: -0.25,
      precise: 1e300,
      smalls: [0, -1, 2 ** 31 - 1],
      ratios: [1.5],
      ids: ["0", "9223372036854775808"],
      texts: ["", "a"],
      raws: [new Uint8Array(0), Uint8Array.of(1)],
    };
    expect(
      decodeMessage(NumbersSchema, encodeMessage(NumbersSchema, value)),
    ).toEqual(value);
  });

  it("writes repeated numbers packed when asked to", () => {
    const value = { smalls: [1, 2, 3], ratios: [1.5, 2.5], texts: ["x"] };
    const unpacked = encodeMessage(NumbersSchema, value);
    const packed = encodeMessage(NumbersSchema, value, { packed: true });
    expect(toHex(packed)).toBe(
      "42 03 01 02 03 4a 08 00 00 c0 3f 00 00 20 40 5a 01 78",
    );
    expect(packed.length).toBeLessThan(unpacked.length);
    expect(decodeMessage(NumbersSchema, packed)).toMatchObject(value);
    expect(decodeMessage(NumbersSchema, unpacked)).toMatchObject(value);
  });

  it("encodes nested and repeated messages", () => {
    const chat = {
      common: { method: "WebcastChatMessage", msgId: "5" },
      user: {
        userId: "6900000000000000001",
        displayId: "someone",
        badgeList: [{ privilegeLogExtra: { level: "2" } }],
      },
      content: "hi",
      emotes: [{ index: 0, emote: { emoteId: "e1" } }],
    } satisfies EncodeInput<ChatMessage>;
    expect(
      decodeMessage(ChatMessageSchema, encodeMessage(ChatMessageSchema, chat)),
    ).toEqual({
      common: {
        method: "WebcastChatMessage",
        msgId: "5",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      user: {
        userId: "6900000000000000001",
        nickname: "",
        displayId: "someone",
        badgeList: [{ sceneType: 0, privilegeLogExtra: { level: "2" } }],
      },
      content: "hi",
      contentLanguage: "",
      emotes: [{ index: 0, emote: { emoteId: "e1" } }],
    });
  });

  it("builds fixtures with unknown fields injected", () => {
    const bytes = concat(
      unknownField(99, WireType.LEN, fromHex("01 02")),
      encodeMessage(FetchResultSchema, {
        cursor: "c",
        needAck: true,
        messages: [{ method: "WebcastLikeMessage", msgId: "1" }],
      }),
      unknownField(100, WireType.VARINT, varint(5)),
    );
    expect(decodeMessage(FetchResultSchema, bytes)).toMatchObject({
      cursor: "c",
      needAck: true,
      messages: [
        { method: "WebcastLikeMessage", msgId: "1", isHistory: false },
      ],
    });
  });
});
