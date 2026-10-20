import { describe, expect, it, vi } from "vitest";
import {
  ProfitRankType,
  RankTextScene,
  type RankTextMessage,
} from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { RankTextMessageSchema } from "./rankText.js";
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

// Field numbers: WebcastRankTextMessage in
// webcast/model/message/messages.proto; scene (2) is a
// webcast.im.RankTextMessage_RankTestMessageScene, rank_type (10) a
// webcast.model.data.ProfitRankType. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(RankTextMessageSchema, bytes);

describe("RankTextScene", () => {
  it("has the values of webcast.im.RankTextMessage_RankTestMessageScene", () => {
    expect(RankTextScene).toEqual({
      UNKNOWN: 0,
      ONLINE_AUDIENCE_TOP_N_UPDATE_PUBLIC_SCREEN: 1,
      MID_PEAK_MOTIVATION_PUBLIC_SCREEN_TOP: 2,
      MID_PEAK_MOTIVATION_PUBLIC_SCREEN_ENTER: 3,
      TILE_REWARD_GUIDE: 4,
    });
    expect(Object.isFrozen(RankTextScene)).toBe(true);
  });
});

describe("RankTextMessageSchema", () => {
  it("reads common (1), scene (2), owner_idx_before_update (3), owner_idx_after_update (4), cur_user_id (7), content (9) and rank_type (10)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastRankTextMessage")),
      fields.varint(2, 1),
      fields.varint(3, 5),
      fields.varint(4, 3),
      fields.message(5, fields.string(1, "self")), // self_get_badge_msg, not read
      fields.message(6, fields.string(1, "other")), // other_get_badge_msg, not read
      fields.varint(7, 6_900_000_000_000_000_001n),
      fields.message(8, fields.string(2, "tos/icon")), // left_icon, not read
      fields.message(9, fields.string(1, "pm_rank_text")),
      fields.varint(10, 1),
      fields.message(11, fields.varint(1, 1)), // user_enigma_info, not read
      fields.message(12, fields.varint(1, 1)), // public_area_msg_common, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastRankTextMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      scene: 1,
      ownerIdxBefore: 5,
      ownerIdxAfter: 3,
      curUserId: "6900000000000000001",
      content: { key: "pm_rank_text", defaultPattern: "" },
      rankType: 1,
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      scene: 0,
      ownerIdxBefore: 0,
      ownerIdxAfter: 0,
      curUserId: "0",
      rankType: 0,
    });
  });

  it("round-trips every field through the encoder", () => {
    const rankText: RankTextMessage = {
      common: sampleCommon("WebcastRankTextMessage"),
      scene: RankTextScene.ONLINE_AUDIENCE_TOP_N_UPDATE_PUBLIC_SCREEN,
      ownerIdxBefore: 4,
      ownerIdxAfter: 2,
      curUserId: "6900000000000000001",
      content: { key: "k", defaultPattern: "{0:user} is No. {1}" },
      rankType: ProfitRankType.WEEKLY_RANK,
    };
    expect(
      decode(encodeMessage(RankTextMessageSchema, rankText)),
    ).toStrictEqual(rankText);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(4, 1_000)),
      fields.varint(4, 1),
      fields.message(9, unknownFields(), fields.string(1, "k")),
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
      scene: 0,
      ownerIdxBefore: 0,
      ownerIdxAfter: 1,
      curUserId: "0",
      content: { key: "k", defaultPattern: "" },
      rankType: 2,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 01", // scene (2): 1, top viewers changed
        "18 03", // owner_idx_before_update (3): 3
        "20 02", // owner_idx_after_update (4): 2
        "38 01", // cur_user_id (7): 1
        "4a 03", // content (9), 3 bytes
        "0a 01 6b", //   key (1): "k"
        "50 01", // rank_type (10): 1, weekly
      ].join(" "),
    );
    const rankText: RankTextMessage = {
      scene: 1,
      ownerIdxBefore: 3,
      ownerIdxAfter: 2,
      curUserId: "1",
      content: { key: "k", defaultPattern: "" },
      rankType: 1,
    };
    expect(decode(bytes)).toStrictEqual(rankText);
    expect(toHex(encodeMessage(RankTextMessageSchema, rankText))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "50 10", // rank_type (10): 16, class rank
        "2a 02 08 01", // self_get_badge_msg (5), not read
        "20 01", // owner_idx_after_update (4): 1
        "42 03 12 01 75", // left_icon (8), not read
        "38 ff ff ff ff ff ff ff ff ff 01", // cur_user_id (7): -1 as a uint64
        "18 02", // owner_idx_before_update (3): 2
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      scene: 0,
      ownerIdxBefore: 2,
      ownerIdxAfter: 1,
      curUserId: "18446744073709551615",
      rankType: 16,
    });
  });

  it("reports counts (int64) past Number.MAX_SAFE_INTEGER, with their paths", () => {
    const onUnsafeInteger = vi.fn();
    const unsafe = 2n ** 60n;
    const rankText = decodeMessage(
      RankTextMessageSchema,
      concat(fields.varint(3, unsafe), fields.varint(4, unsafe)),
      { onUnsafeInteger },
    );
    expect(rankText).toMatchObject({
      ownerIdxBefore: 2 ** 60,
      ownerIdxAfter: 2 ** 60,
    });
    expect(onUnsafeInteger.mock.calls).toEqual([
      ["WebcastRankTextMessage.ownerIdxBefore", unsafe],
      ["WebcastRankTextMessage.ownerIdxAfter", unsafe],
    ]);
  });
});
