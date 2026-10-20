import { describe, expect, it } from "vitest";
import type { CaptionMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { CaptionMessageSchema } from "./caption.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../../test/helpers/encoder.js";
import {
  sampleCommon,
  unknownFields,
} from "../../../../test/helpers/samples.js";

// Field numbers: WebcastCaptionMessage and CaptionContent in
// webcast/model/message/messages.proto. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(CaptionMessageSchema, bytes);

describe("CaptionMessageSchema", () => {
  it("reads common (1), timestamp_ms (2), duration_ms (3), content (4) and definite (7)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastCaptionMessage"),
        fields.varint(4, 1_760_000_000_123),
      ),
      fields.varint(2, 1_760_000_000_000),
      fields.varint(3, 1_500),
      fields.message(4, fields.string(1, "en"), fields.string(2, "hello")),
      fields.message(4, fields.string(1, "es"), fields.string(2, "hola")),
      fields.varint(5, 3), // sentence_id, not read
      fields.varint(6, 4), // sequence_id, not read
      fields.varint(7, 1),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastCaptionMessage",
        msgId: "0",
        roomId: "0",
        createTime: "1760000000123",
        isShowMsg: false,
      },
      timestampMs: "1760000000000",
      durationMs: 1_500,
      content: [
        { lang: "en", content: "hello" },
        { lang: "es", content: "hola" },
      ],
      definite: true,
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      timestampMs: "0",
      durationMs: 0,
      content: [],
      definite: false,
    });
    expect(decode(fields.message(4)).content).toStrictEqual([
      { lang: "", content: "" },
    ]);
  });

  it("round-trips every field through the encoder", () => {
    const caption: CaptionMessage = {
      common: sampleCommon("WebcastCaptionMessage"),
      timestampMs: "1760000000000",
      durationMs: 2_000,
      content: [
        { lang: "en", content: "hello there" },
        { lang: "fr", content: "salut" },
      ],
      definite: true,
    };
    expect(decode(encodeMessage(CaptionMessageSchema, caption))).toStrictEqual(
      caption,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(6, 1)),
      fields.message(4, unknownFields(), fields.string(2, "hi")),
      unknownFields(1_000),
      fields.varint(7, 1),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: true,
      },
      timestampMs: "0",
      durationMs: 0,
      content: [{ lang: "", content: "hi" }],
      definite: true,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 e8 07", // timestamp_ms (2): 1000
        "18 64", // duration_ms (3): 100
        "22 0b", // content (4), 11 bytes
        "0a 02 65 6e", //   lang (1): "en"
        "12 05 68 65 6c 6c 6f", //   content (2): "hello"
        "38 01", // definite (7): true
      ].join(" "),
    );
    const caption: CaptionMessage = {
      timestampMs: "1000",
      durationMs: 100,
      content: [{ lang: "en", content: "hello" }],
      definite: true,
    };
    expect(decode(bytes)).toStrictEqual(caption);
    expect(toHex(encodeMessage(CaptionMessageSchema, caption))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with large int64s, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "38 00", // definite (7): false
        "22 04", // content (4), 4 bytes
        "0a 02 66 72", //   lang (1): "fr"
        "18 80 80 80 80 80 20", // duration_ms (3): 2^40
        "28 01", // sentence_id (5), not read
        "10 81 80 90 cf b0 99 85 d9 66", // timestamp_ms (2): 7400000000000000001
        "45 01 00 00 00", // field 8, fixed32, not read
        "0a 02", // common (1), 2 bytes
        "30 01", //   is_show_msg (6): true
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: true,
      },
      timestampMs: "7400000000000000001",
      durationMs: 2 ** 40,
      content: [{ lang: "fr", content: "" }],
      definite: false,
    });
  });
});
