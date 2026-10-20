import { describe, expect, it } from "vitest";
import type { RoomMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { RoomMessageSchema } from "./roomMessage.js";
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

// Field numbers: WebcastRoomMessage in webcast/model/message/messages.proto.
// The bytes are written field by field (fields.*) or by hand, not from the
// schema, so a wrong number in the table fails here.

const decode = (bytes: Uint8Array) => decodeMessage(RoomMessageSchema, bytes);

describe("RoomMessageSchema", () => {
  it("reads common (1), content (2), scene (6) and is_welcome (7)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastRoomMessage"),
        fields.varint(4, 1_760_000_000_123),
      ),
      fields.string(2, "Welcome to the LIVE"),
      fields.varint(3, 1), // supprot_landscape, not read
      fields.varint(4, 2), // source, not read
      fields.message(5, fields.string(2, "tos/i")), // icon, not read
      fields.string(6, "welcome"),
      fields.varint(7, 1),
      fields.varint(9, 5_000), // show_duration_ms, not read
      fields.string(10, "sub"), // sub_scene, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastRoomMessage",
        msgId: "0",
        roomId: "0",
        createTime: "1760000000123",
        isShowMsg: false,
      },
      content: "Welcome to the LIVE",
      scene: "welcome",
      isWelcome: true,
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      content: "",
      scene: "",
      isWelcome: false,
    });
  });

  it("round-trips every field through the encoder", () => {
    const room: RoomMessage = {
      common: sampleCommon("WebcastRoomMessage"),
      content: "Bienvenue à tous",
      scene: "welcome",
      isWelcome: true,
    };
    expect(decode(encodeMessage(RoomMessageSchema, room))).toStrictEqual(room);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(6, 1)),
      fields.string(2, "hi"),
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
      content: "hi",
      scene: "",
      isWelcome: true,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 02 68 69", // content (2): "hi"
        "32 07 77 65 6c 63 6f 6d 65", // scene (6): "welcome"
        "38 01", // is_welcome (7): true
      ].join(" "),
    );
    const room: RoomMessage = {
      content: "hi",
      scene: "welcome",
      isWelcome: true,
    };
    expect(decode(bytes)).toStrictEqual(room);
    expect(toHex(encodeMessage(RoomMessageSchema, room))).toBe(toHex(bytes));
  });

  it("reads hand-assembled bytes with a large varint bool, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "38 80 80 80 80 80 20", // is_welcome (7): 2^40, so true
        "32 01 73", // scene (6): "s"
        "20 02", // source (4), not read
        "0a 05", // common (1), 5 bytes
        "20 e8 07", //   create_time (4): 1000
        "30 01", //   is_show_msg (6): true
        "12 04 6f 6c c3 a9", // content (2): "olé"
        "45 01 00 00 00", // field 8, fixed32, not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: true,
      },
      content: "olé",
      scene: "s",
      isWelcome: true,
    });
  });
});
