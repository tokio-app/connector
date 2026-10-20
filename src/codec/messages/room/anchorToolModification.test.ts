import { describe, expect, it } from "vitest";
import type { AnchorToolModificationMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { AnchorToolModificationMessageSchema } from "./anchorToolModification.js";
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

// Field numbers: WebcastAnchorToolModificationMessage and its
// AnchorToolModification, derived from observed traffic (PROTOCOL.md, "LIVE
// messages"). The bytes are written field by field (fields.*) or by hand, not
// from the schema, with made-up values shaped like the observed ones: a wrong
// number in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(AnchorToolModificationMessageSchema, bytes);

describe("AnchorToolModificationMessageSchema", () => {
  it("reads common (1) and modification (2): room_id (1), user_id (2), name (4), start_time (10), end_time (11) and duration (12)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastAnchorToolModificationMessage"),
      ),
      fields.message(
        2,
        fields.varint(1, 7_140_000_000_000_000_001n),
        fields.varint(2, 6_900_000_000_000_000_001n),
        fields.varint(3, 123_456), // not read
        fields.string(4, "A Filter"),
        fields.string(5, "6900000000000000009"), // not read
        fields.varint(8, 2), // not read
        fields.varint(10, 1_760_000_000),
        fields.varint(11, 1_760_000_600),
        fields.varint(12, 600),
        fields.string(21, "tab"), // not read
        fields.string(26, "scene"), // not read
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastAnchorToolModificationMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      modification: {
        roomId: "7140000000000000001",
        userId: "6900000000000000001",
        name: "A Filter",
        startTime: "1760000000",
        endTime: "1760000600",
        duration: 600,
      },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({});
    expect(decode(fields.message(2))).toStrictEqual({
      modification: {
        roomId: "0",
        userId: "0",
        name: "",
        startTime: "0",
        endTime: "0",
        duration: 0,
      },
    });
  });

  it("round-trips every field through the encoder", () => {
    const change: AnchorToolModificationMessage = {
      common: sampleCommon("WebcastAnchorToolModificationMessage"),
      modification: {
        roomId: "7140000000000000001",
        userId: "6900000000000000001",
        name: "A Filter",
        startTime: "1760000000",
        endTime: "1760000600",
        duration: 600,
      },
    };
    expect(
      decode(encodeMessage(AnchorToolModificationMessageSchema, change)),
    ).toStrictEqual(change);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(4, 1_000)),
      fields.message(2, unknownFields(), fields.string(4, "n")),
      unknownFields(1_000),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: false,
      },
      modification: {
        roomId: "0",
        userId: "0",
        name: "n",
        startTime: "0",
        endTime: "0",
        duration: 0,
      },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 0f", // modification (2), 15 bytes
        "08 07", //   room_id (1): 7
        "10 65", //   user_id (2): 101
        "22 01 6e", //   name (4): "n"
        "50 e8 07", //   start_time (10): 1000
        "58 c3 08", //   end_time (11): 1091
        "60 5b", //   duration (12): 91
      ].join(" "),
    );
    const change: AnchorToolModificationMessage = {
      modification: {
        roomId: "7",
        userId: "101",
        name: "n",
        startTime: "1000",
        endTime: "1091",
        duration: 91,
      },
    };
    expect(decode(bytes)).toStrictEqual(change);
    expect(
      toHex(encodeMessage(AnchorToolModificationMessageSchema, change)),
    ).toBe(toHex(bytes));
  });

  it("reads hand-assembled bytes with a 64-bit id, a sign-extended duration, a modification seen twice and fields out of order", () => {
    const bytes = fromHex(
      [
        "12 0b", // modification (2), 11 bytes
        "60 ff ff ff ff ff ff ff ff ff 01", //   duration (12): -1
        "1a 00", // field 3, not read, 0 bytes
        "12 10", // modification (2) again, merged: 16 bytes
        "58 d8 f4 9d c7 06", //   end_time (11): 1760000600
        "10 81 80 c8 b1 93 ae ee e0 5f", //   user_id (2): 6900000000000000001
        "2d 01 00 00 00", // field 5, fixed32, not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      modification: {
        roomId: "0",
        userId: "6900000000000000001",
        name: "",
        startTime: "0",
        endTime: "1760000600",
        duration: -1,
      },
    });
  });
});
