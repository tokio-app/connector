import { describe, expect, it } from "vitest";
import type { LinkMicOpponentGifts } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LinkMicOpponentGiftsSchema } from "./linkMicOpponentGifts.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../../test/helpers/encoder.js";
import {
  SAMPLE_IMAGE,
  sampleCommon,
  unknownFields,
} from "../../../../test/helpers/samples.js";

// Field numbers: WebcastLinkMicOpponentGifts, derived from observed traffic
// (PROTOCOL.md, "LIVE messages"); its gift icon is an ImageModel. The bytes
// are written field by field (fields.*) or by hand, not from the schema, with
// made-up values shaped like the observed ones: a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(LinkMicOpponentGiftsSchema, bytes);

describe("LinkMicOpponentGiftsSchema", () => {
  it("reads common (1), battle_id (2), channel_id (3), from_user_id (4), gift_to_user_id (5), gift_id (6), gift_count (7), gift_price (8), gift_icon_image (9), repeat_count (10), send_gift_success_time (11) and update_battle_score_time (12)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastLinkMicOpponentGifts")),
      fields.varint(2, 7_300_000_000_000_000_001n),
      fields.varint(3, 7_200_000_000_000_000_001n),
      fields.varint(4, 6_900_000_000_000_000_003n),
      fields.varint(5, 6_900_000_000_000_000_002n),
      fields.varint(6, 5655),
      fields.varint(7, 3),
      fields.varint(8, 30),
      fields.message(
        9,
        fields.string(1, "https://p16.example/gift.webp"),
        fields.string(2, "tos/gift"),
        fields.string(5, "#FAF0DC"), // avg_color, not read
      ),
      fields.varint(10, 8),
      fields.varint(11, 1_760_000_000_123),
      fields.varint(12, 1_760_000_000_500),
      fields.string(13, "20261020000000ABCDEF"), // log_id, not read
      fields.message(14), // enigma_battle_extra_info, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastLinkMicOpponentGifts",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      battleId: "7300000000000000001",
      channelId: "7200000000000000001",
      fromUserId: "6900000000000000003",
      giftToUserId: "6900000000000000002",
      giftId: "5655",
      giftCount: 3,
      giftPrice: 30,
      giftIconImage: {
        urlList: ["https://p16.example/gift.webp"],
        uri: "tos/gift",
      },
      repeatCount: 8,
      sendGiftSuccessTime: "1760000000123",
      updateBattleScoreTime: "1760000000500",
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      battleId: "0",
      channelId: "0",
      fromUserId: "0",
      giftToUserId: "0",
      giftId: "0",
      giftCount: 0,
      giftPrice: 0,
      repeatCount: 0,
      sendGiftSuccessTime: "0",
      updateBattleScoreTime: "0",
    });
    expect(decode(fields.message(9)).giftIconImage).toStrictEqual({
      urlList: [],
      uri: "",
    });
  });

  it("round-trips every field through the encoder", () => {
    const gifts: LinkMicOpponentGifts = {
      common: sampleCommon("WebcastLinkMicOpponentGifts"),
      battleId: "7300000000000000001",
      channelId: "7200000000000000001",
      fromUserId: "6900000000000000003",
      giftToUserId: "6900000000000000002",
      giftId: "5655",
      giftCount: 99,
      giftPrice: 299,
      giftIconImage: SAMPLE_IMAGE,
      repeatCount: 1000,
      sendGiftSuccessTime: "1760000000123",
      updateBattleScoreTime: "1760000000500",
    };
    expect(
      decode(encodeMessage(LinkMicOpponentGiftsSchema, gifts)),
    ).toStrictEqual(gifts);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(4, 1_000)),
      fields.varint(2, 1),
      fields.message(9, unknownFields(), fields.string(2, "tos/g")),
      unknownFields(1_000),
      fields.varint(10, 2),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: false,
      },
      battleId: "1",
      channelId: "0",
      fromUserId: "0",
      giftToUserId: "0",
      giftId: "0",
      giftCount: 0,
      giftPrice: 0,
      giftIconImage: { urlList: [], uri: "tos/g" },
      repeatCount: 2,
      sendGiftSuccessTime: "0",
      updateBattleScoreTime: "0",
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 01", // battle_id (2): 1
        "18 02", // channel_id (3): 2
        "20 65", // from_user_id (4): 101
        "28 16", // gift_to_user_id (5): 22
        "30 97 2c", // gift_id (6): 5655
        "38 03", // gift_count (7): 3
        "40 1e", // gift_price (8): 30
        "4a 03", // gift_icon_image (9), 3 bytes
        "12 01 67", //   uri (2): "g"
        "50 05", // repeat_count (10): 5
        "58 e8 07", // send_gift_success_time (11): 1000
        "60 e9 07", // update_battle_score_time (12): 1001
      ].join(" "),
    );
    const gifts: LinkMicOpponentGifts = {
      battleId: "1",
      channelId: "2",
      fromUserId: "101",
      giftToUserId: "22",
      giftId: "5655",
      giftCount: 3,
      giftPrice: 30,
      giftIconImage: { urlList: [], uri: "g" },
      repeatCount: 5,
      sendGiftSuccessTime: "1000",
      updateBattleScoreTime: "1001",
    };
    expect(decode(bytes)).toStrictEqual(gifts);
    expect(toHex(encodeMessage(LinkMicOpponentGiftsSchema, gifts))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with 64-bit ids, a sign-extended count, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "60 f4 83 b3 c1 9c 33", // update_battle_score_time (12): 1760000000500
        "40 ff ff ff ff ff ff ff ff ff 01", // gift_price (8): -1
        "72 00", // enigma_battle_extra_info (14), not read, 0 bytes
        "28 82 80 c8 b1 93 ae ee e0 5f", // gift_to_user_id (5): 6900000000000000002
        "6a 01 78", // log_id (13), not read
        "10 81 80 e8 e2 aa ea b3 a7 65", // battle_id (2): 7300000000000000001
        "18 81 80 c0 f6 a4 bb e2 f5 63", // channel_id (3): 7200000000000000001
        "58 fb 80 b3 c1 9c 33", // send_gift_success_time (11): 1760000000123
        "79 01 00 00 00 00 00 00 00", // field 15, fixed64, not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      battleId: "7300000000000000001",
      channelId: "7200000000000000001",
      fromUserId: "0",
      giftToUserId: "6900000000000000002",
      giftId: "0",
      giftCount: 0,
      giftPrice: -1,
      repeatCount: 0,
      sendGiftSuccessTime: "1760000000123",
      updateBattleScoreTime: "1760000000500",
    });
  });
});
