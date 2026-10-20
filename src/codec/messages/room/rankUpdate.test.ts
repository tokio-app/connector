import { describe, expect, it, vi } from "vitest";
import {
  ClassType,
  ProfitRankType,
  RankOpType,
  type RankUpdateMessage,
} from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { RankUpdateMessageSchema } from "./rankUpdate.js";
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

// Field numbers: WebcastRankUpdateMessage and RankUpdate in
// webcast/model/message/messages.proto, ClassInfo in webcast/model/rank.proto;
// rank_type (1) is a webcast.model.data.ProfitRankType, class_type (1) a
// webcast.model.data.ClassType, op_type (4) a webcast.im.OpType. The bytes are
// written field by field (fields.*) or by hand, not from the schema, so a
// wrong number in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(RankUpdateMessageSchema, bytes);

describe("the rank constants", () => {
  it("have the values of ProfitRankType, OpType and ClassType", () => {
    expect(ProfitRankType.HOURLY_RANK).toBe(0);
    expect(ProfitRankType.WEEKLY_RANK).toBe(1);
    expect(ProfitRankType.CLASS_RANK).toBe(16);
    expect(ProfitRankType.DAILY_GAME_PUB_G).toBe(20);
    expect(ProfitRankType.CAMPAIGN_LEAGUEMATCH_RANK).toBe(101);
    expect(Object.keys(ProfitRankType)).toHaveLength(27);
    expect(RankOpType).toEqual({
      DEFAULT: 0,
      ADD: 1,
      REMOVE: 2,
      RELOAD: 3,
      BASIC_EFFECT: 4,
    });
    expect(ClassType.NONE).toBe(0);
    expect(ClassType.D_5).toBe(100);
    expect(ClassType.S).toBe(2_100);
    expect(Object.values(ClassType)).toEqual(
      Array.from({ length: 22 }, (_, i) => i * 100),
    );
    for (const constant of [ProfitRankType, RankOpType, ClassType]) {
      expect(Object.isFrozen(constant)).toBe(true);
    }
  });
});

describe("RankUpdateMessageSchema", () => {
  it("reads common (1), updates (2: rank_type 1, own_rank 2, default_content 3, class_info 14, current_score 15) and op_type (4)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastRankUpdateMessage")),
      fields.message(
        2,
        fields.varint(1, 16),
        fields.varint(2, 3),
        fields.message(3, fields.string(1, "pm_rank_content")),
        fields.bytes(4, new Uint8Array([1, 2])), // prompt, not read
        fields.varint(5, 1), // show_entrance_animation, not read
        fields.varint(6, 30), // countdown, not read
        fields.varint(9, 1), // request_first_show_type, not read
        fields.varint(11, 1), // owneronrank, not read
        fields.message(12, fields.string(2, "tos/icon")), // entranceicon, not read
        fields.message(14, fields.varint(1, 1_500), fields.varint(2, 7)),
        fields.varint(15, 12_345),
        fields.string(16, "sslocal://rank"), // list_schema, not read
      ),
      fields.message(2, fields.varint(1, 1), fields.varint(2, 42)),
      fields.varint(3, 2), // group_type, not read
      fields.varint(4, 3),
      fields.varint(5, 10), // rank_priority, not read
      fields.message(6, fields.varint(1, 0)), // tabs, not read
      fields.varint(7, 1), // is_animation_loop_play, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastRankUpdateMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      updates: [
        {
          rankType: 16,
          ownRank: 3,
          defaultContent: { key: "pm_rank_content", defaultPattern: "" },
          classInfo: { classType: 1_500, starCount: 7 },
          currentScore: 12_345,
        },
        { rankType: 1, ownRank: 42, currentScore: 0 },
      ],
      opType: 3,
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      updates: [],
      opType: 0,
    });
    expect(decode(fields.message(2, fields.message(14))).updates).toStrictEqual(
      [
        {
          rankType: 0,
          ownRank: 0,
          classInfo: { classType: 0, starCount: 0 },
          currentScore: 0,
        },
      ],
    );
  });

  it("round-trips every field through the encoder", () => {
    const rankUpdate: RankUpdateMessage = {
      common: sampleCommon("WebcastRankUpdateMessage"),
      updates: [
        {
          rankType: ProfitRankType.CLASS_RANK,
          ownRank: 2,
          defaultContent: { key: "k", defaultPattern: "No. {0}" },
          classInfo: { classType: ClassType.A_1, starCount: 3 },
          currentScore: 99_999,
        },
        { rankType: ProfitRankType.HOURLY_RANK, ownRank: 0, currentScore: 5 },
      ],
      opType: RankOpType.ADD,
    };
    expect(
      decode(encodeMessage(RankUpdateMessageSchema, rankUpdate)),
    ).toStrictEqual(rankUpdate);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(
        2,
        unknownFields(),
        fields.message(3, unknownFields(), fields.string(2, "p")),
        fields.message(14, unknownFields(), fields.varint(2, 4)),
        fields.varint(15, 10),
      ),
      unknownFields(1_000),
      fields.varint(4, 2),
    );
    expect(decode(bytes)).toStrictEqual({
      updates: [
        {
          rankType: 0,
          ownRank: 0,
          defaultContent: { key: "", defaultPattern: "p" },
          classInfo: { classType: 0, starCount: 4 },
          currentScore: 10,
        },
      ],
      opType: 2,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 12", // updates (2), 18 bytes
        "08 01", //   rank_type (1): 1, weekly
        "10 05", //   own_rank (2): 5
        "1a 03", //   default_content (3), 3 bytes
        "0a 01 6b", //     key (1): "k"
        "72 04", //   class_info (14), 4 bytes
        "08 64", //     class_type (1): 100, D5
        "10 03", //     star_count (2): 3
        "78 e8 07", //   current_score (15): 1000
        "20 01", // op_type (4): 1, add
      ].join(" "),
    );
    const rankUpdate: RankUpdateMessage = {
      updates: [
        {
          rankType: 1,
          ownRank: 5,
          defaultContent: { key: "k", defaultPattern: "" },
          classInfo: { classType: 100, starCount: 3 },
          currentScore: 1_000,
        },
      ],
      opType: 1,
    };
    expect(decode(bytes)).toStrictEqual(rankUpdate);
    expect(toHex(encodeMessage(RankUpdateMessageSchema, rankUpdate))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "20 03", // op_type (4): 3, reload
        "18 02", // group_type (3), not read
        "12 07", // updates (2), 7 bytes
        "78 0a", //   current_score (15): 10
        "22 01 ff", //   prompt (4), not read
        "10 02", //   own_rank (2): 2
        "28 05", // rank_priority (5), not read
        "12 02", // updates (2), 2 bytes
        "08 10", //   rank_type (1): 16, class rank
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      updates: [
        { rankType: 0, ownRank: 2, currentScore: 10 },
        { rankType: 16, ownRank: 0, currentScore: 0 },
      ],
      opType: 3,
    });
  });

  it("reports counts (int64) past Number.MAX_SAFE_INTEGER, with their paths", () => {
    const onUnsafeInteger = vi.fn();
    const unsafe = 2n ** 60n;
    const rankUpdate = decodeMessage(
      RankUpdateMessageSchema,
      fields.message(
        2,
        fields.varint(2, unsafe),
        fields.message(14, fields.varint(2, unsafe)),
        fields.varint(15, unsafe),
      ),
      { onUnsafeInteger },
    );
    expect(rankUpdate).toStrictEqual({
      updates: [
        {
          rankType: 0,
          ownRank: 2 ** 60,
          classInfo: { classType: 0, starCount: 2 ** 60 },
          currentScore: 2 ** 60,
        },
      ],
      opType: 0,
    });
    expect(onUnsafeInteger.mock.calls).toEqual([
      ["RankUpdate.ownRank", unsafe],
      ["ClassInfo.starCount", unsafe],
      ["RankUpdate.currentScore", unsafe],
    ]);
  });
});
