import { describe, expect, it } from "vitest";
import type { GiftMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { GiftMessageSchema } from "./gift.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../../test/helpers/encoder.js";
import {
  SAMPLE_IMAGE,
  SAMPLE_USER,
  sampleCommon,
  unknownFields,
} from "../../../../test/helpers/samples.js";

// Field numbers: WebcastGiftMessage in webcast/model/message/messages.proto,
// Gift in webcast/model/gift.proto. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) => decodeMessage(GiftMessageSchema, bytes);

describe("GiftMessageSchema", () => {
  it("reads common (1), gift_id (2), repeat_count (5), combo_count (6), user (7), repeat_end (9), group_id (11) and gift (15)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastGiftMessage")),
      fields.varint(2, 5655),
      fields.varint(3, 1), // fan_ticket_count, not read
      fields.varint(4, 1), // group_count, not read
      fields.varint(5, 3),
      fields.varint(6, 2),
      fields.message(7, fields.string(3, "Nick")),
      fields.message(8, fields.string(3, "Host")), // to_user, not read
      fields.varint(9, 1),
      fields.varint(11, 1_760_000_000_000_000_001n),
      fields.message(
        15,
        fields.message(
          1,
          fields.string(1, "https://p16.example/rose.webp"),
          fields.string(2, "webcast/rose"),
        ),
        fields.string(2, "A rose"), // describe, not read
        fields.varint(5, 5655),
        fields.varint(10, 1), // combo, not read
        fields.varint(11, 1),
        fields.varint(12, 1),
        fields.string(16, "Rose"),
      ),
      fields.message(32, fields.varint(4, 1)), // user_identity, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastGiftMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      giftId: "5655",
      repeatCount: 3,
      comboCount: 2,
      user: { userId: "0", nickname: "Nick", displayId: "", badgeList: [] },
      repeatEnd: true,
      groupId: "1760000000000000001",
      gift: {
        image: {
          urlList: ["https://p16.example/rose.webp"],
          uri: "webcast/rose",
        },
        id: "5655",
        type: 1,
        diamondCount: 1,
        name: "Rose",
      },
    });
  });

  it("reads repeat_end (9), an int32, as a bool: any value but 0 is true", () => {
    const repeatEnd = (hex: string) => decode(fromHex(hex)).repeatEnd;
    expect(repeatEnd("")).toBe(false); // absent
    expect(repeatEnd("48 00")).toBe(false); // 0
    expect(repeatEnd("48 01")).toBe(true); // 1
    expect(repeatEnd("48 02")).toBe(true); // 2
    expect(repeatEnd("48 ff ff ff ff ff ff ff ff ff 01")).toBe(true); // -1
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      giftId: "0",
      repeatCount: 0,
      comboCount: 0,
      repeatEnd: false,
      groupId: "0",
    });
    expect(decode(fields.message(15)).gift).toStrictEqual({
      id: "0",
      type: 0,
      diamondCount: 0,
      name: "",
    });
  });

  it("round-trips every field through the encoder", () => {
    const gift: GiftMessage = {
      common: sampleCommon("WebcastGiftMessage"),
      user: SAMPLE_USER,
      giftId: "5655",
      repeatCount: 99,
      repeatEnd: true,
      comboCount: 99,
      groupId: "7400000000000000001",
      gift: {
        id: "5655",
        name: "Rose",
        diamondCount: 1,
        image: SAMPLE_IMAGE,
        type: 1,
      },
    };
    expect(decode(encodeMessage(GiftMessageSchema, gift))).toStrictEqual(gift);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.varint(2, 5655),
      fields.message(7, unknownFields(), fields.string(3, "Ann")),
      unknownFields(1_000),
      fields.message(
        15,
        unknownFields(),
        fields.message(1, unknownFields(), fields.string(2, "tos/g")),
        fields.varint(12, 30),
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      giftId: "5655",
      repeatCount: 0,
      comboCount: 0,
      user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
      repeatEnd: false,
      groupId: "0",
      gift: {
        image: { urlList: [], uri: "tos/g" },
        id: "0",
        type: 0,
        diamondCount: 30,
        name: "",
      },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 97 2c", // gift_id (2): 5655
        "28 05", // repeat_count (5): 5
        "30 05", // combo_count (6): 5
        "3a 04", // user (7), 4 bytes
        "1a 02 4a 6f", //   nickname (3): "Jo"
        "48 01", // repeat_end (9): 1
        "58 2a", // group_id (11): 42
        "7a 0e", // gift (15), 14 bytes
        "28 97 2c", //   id (5): 5655
        "58 01", //   type (11): 1
        "60 01", //   diamond_count (12): 1
        "82 01 04 52 6f 73 65", //   name (16): "Rose"
      ].join(" "),
    );
    const gift: GiftMessage = {
      giftId: "5655",
      repeatCount: 5,
      comboCount: 5,
      user: { userId: "0", nickname: "Jo", displayId: "", badgeList: [] },
      repeatEnd: true,
      groupId: "42",
      gift: { id: "5655", type: 1, diamondCount: 1, name: "Rose" },
    };
    expect(decode(bytes)).toStrictEqual(gift);
    expect(toHex(encodeMessage(GiftMessageSchema, gift))).toBe(toHex(bytes));
  });

  it("reads hand-assembled bytes with a 64-bit id, a sign-extended int32, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "18 0a", // fan_ticket_count (3), not read
        "10 97 2c", // gift_id (2): 5655
        "42 02", // to_user (8), not read, 2 bytes
        "08 07", //   id (1): 7
        "58 81 80 90 cf b0 99 85 d9 66", // group_id (11): 7400000000000000001
        "48 ff ff ff ff ff ff ff ff ff 01", // repeat_end (9): -1
        "28 01", // repeat_count (5): 1
        "7a 20", // gift (15), 32 bytes
        "0a 0b", //   image (1), 11 bytes
        "0a 02 75 31", //     url_list (1): "u1"
        "0a 02 75 32", //     url_list (1): "u2"
        "12 01 78", //     uri (2): "x"
        "12 01 61", //   describe (2), not read
        "28 97 2c", //   id (5): 5655
        "50 01", //   combo (10), not read
        "58 01", //   type (11): 1
        "60 01", //   diamond_count (12): 1
        "82 01 04 52 6f 73 65", //   name (16): "Rose"
        "a2 06 00", // gift_effect (100), not read, 0 bytes
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      giftId: "5655",
      repeatCount: 1,
      comboCount: 0,
      repeatEnd: true,
      groupId: "7400000000000000001",
      gift: {
        image: { urlList: ["u1", "u2"], uri: "x" },
        id: "5655",
        type: 1,
        diamondCount: 1,
        name: "Rose",
      },
    });
  });
});
