import { describe, expect, it } from "vitest";
import type { ImDeleteMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { ImDeleteMessageSchema } from "./imDelete.js";
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

// Field numbers: WebcastImDeleteMessage in
// webcast/model/message/messages.proto. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(ImDeleteMessageSchema, bytes);

describe("ImDeleteMessageSchema", () => {
  it("reads common (1), delete_msg_ids (2) and delete_user_ids (3)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastImDeleteMessage"),
        fields.varint(4, 1_760_000_000_123),
      ),
      fields.varint(2, 7_400_000_000_000_000_001n),
      fields.varint(2, 7_400_000_000_000_000_002n),
      fields.varint(3, 6_900_000_000_000_000_001n),
      fields.varint(4, 1), // no such field in the proto, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastImDeleteMessage",
        msgId: "0",
        roomId: "0",
        createTime: "1760000000123",
        isShowMsg: false,
      },
      deleteMsgIds: ["7400000000000000001", "7400000000000000002"],
      deleteUserIds: ["6900000000000000001"],
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      deleteMsgIds: [],
      deleteUserIds: [],
    });
  });

  it("round-trips every field through the encoder, packed or not", () => {
    const imDelete: ImDeleteMessage = {
      common: sampleCommon("WebcastImDeleteMessage"),
      deleteMsgIds: ["7400000000000000001", "7400000000000000002", "3"],
      deleteUserIds: ["6900000000000000001"],
    };
    expect(
      decode(encodeMessage(ImDeleteMessageSchema, imDelete)),
    ).toStrictEqual(imDelete);
    expect(
      decode(encodeMessage(ImDeleteMessageSchema, imDelete, { packed: true })),
    ).toStrictEqual(imDelete);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(6, 1)),
      fields.varint(2, 5),
      unknownFields(1_000),
      fields.varint(3, 6),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: true,
      },
      deleteMsgIds: ["5"],
      deleteUserIds: ["6"],
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same, unpacked and packed", () => {
    const unpacked = fromHex(
      [
        "0a 02", // common (1), 2 bytes
        "30 01", //   is_show_msg (6): true
        "10 05", // delete_msg_ids (2): 5
        "10 06", // delete_msg_ids (2): 6
        "18 07", // delete_user_ids (3): 7
      ].join(" "),
    );
    const packed = fromHex(
      [
        "0a 02", // common (1), 2 bytes
        "30 01", //   is_show_msg (6): true
        "12 02 05 06", // delete_msg_ids (2), packed: 5, 6
        "1a 01 07", // delete_user_ids (3), packed: 7
      ].join(" "),
    );
    const imDelete: ImDeleteMessage = {
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: true,
      },
      deleteMsgIds: ["5", "6"],
      deleteUserIds: ["7"],
    };
    expect(decode(unpacked)).toStrictEqual(imDelete);
    expect(decode(packed)).toStrictEqual(imDelete);
    expect(toHex(encodeMessage(ImDeleteMessageSchema, imDelete))).toBe(
      toHex(unpacked),
    );
    expect(
      toHex(encodeMessage(ImDeleteMessageSchema, imDelete, { packed: true })),
    ).toBe(toHex(packed));
  });

  it("reads hand-assembled bytes with 64-bit ids, mixed packing, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "12 03 01 02 03", // delete_msg_ids (2), packed: 1, 2, 3
        "1a 09 81 80 a8 82 bb 85 98 8b 63", // delete_user_ids (3), packed: 7140000000000000001
        "10 ff ff ff ff ff ff ff ff ff 01", // delete_msg_ids (2): -1, read unsigned
        "0a 02", // common (1), 2 bytes
        "30 01", //   is_show_msg (6): true
        "45 01 00 00 00", // field 8, fixed32, not read
        "18 04", // delete_user_ids (3): 4
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
      deleteMsgIds: ["1", "2", "3", "18446744073709551615"],
      deleteUserIds: ["7140000000000000001", "4"],
    });
  });
});
