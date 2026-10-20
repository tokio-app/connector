import { describe, expect, it } from "vitest";
import type { LinkMicArmies } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LinkMicArmiesSchema } from "./linkMicArmies.js";
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

// Field numbers: WebcastLinkMicArmies in webcast/model/message/messages.proto;
// its armies (3) is a map<int64, BattleUserArmies>, whose entries hold key
// (1) and value (2); BattleUserArmies and BattleUserArmy in
// webcast/model/message/battle.proto. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) => decodeMessage(LinkMicArmiesSchema, bytes);

describe("LinkMicArmiesSchema", () => {
  it("reads common (1), battle_id (2), armies (3), trigger_reason (7), from_user_id (8), gift_id (9), gift_count (10) and total_diamond_count (12)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastLinkMicArmies")),
      fields.varint(2, 7_300_000_000_000_000_001n),
      fields.message(
        3,
        fields.varint(1, 11),
        fields.message(
          2,
          fields.message(
            1,
            fields.varint(1, 101),
            fields.varint(2, 300),
            fields.string(3, "Ann"),
            fields.message(4, fields.string(2, "tos/ann")),
            fields.varint(5, 30),
            fields.varint(7, 1), // enigma_score, not read
          ),
          fields.varint(2, 500),
          fields.varint(4, 1), // host_enigma_score, not read
        ),
      ),
      fields.message(
        3,
        fields.varint(1, 22),
        fields.message(2, fields.varint(2, 900)),
      ),
      fields.varint(4, 7_200_000_000_000_000_001n), // channel_id, not read
      fields.varint(5, 1_760_000_000_000), // send_gift_success_time, not read
      fields.varint(7, 1),
      fields.varint(8, 101),
      fields.varint(9, 5655),
      fields.varint(10, 3),
      fields.message(11, fields.string(2, "tos/rose")), // gift_icon_image, not read
      fields.varint(12, 3),
      fields.varint(13, 1), // repeat_count, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastLinkMicArmies",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      battleId: "7300000000000000001",
      armies: [
        {
          key: "11",
          value: {
            userArmies: [
              {
                userId: "101",
                score: 300,
                nickname: "Ann",
                avatarThumb: { urlList: [], uri: "tos/ann" },
                diamondScore: 30,
              },
            ],
            hostScore: 500,
          },
        },
        { key: "22", value: { userArmies: [], hostScore: 900 } },
      ],
      triggerReason: 1,
      fromUserId: "101",
      giftId: "5655",
      giftCount: 3,
      totalDiamondCount: 3,
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      battleId: "0",
      armies: [],
      triggerReason: 0,
      fromUserId: "0",
      giftId: "0",
      giftCount: 0,
      totalDiamondCount: 0,
    });
    expect(
      decode(
        concat(
          fields.message(3),
          fields.message(3, fields.message(2, fields.message(1))),
        ),
      ).armies,
    ).toStrictEqual([
      { key: "0" },
      {
        key: "0",
        value: {
          userArmies: [
            { userId: "0", score: 0, nickname: "", diamondScore: 0 },
          ],
          hostScore: 0,
        },
      },
    ]);
  });

  it("round-trips every field through the encoder", () => {
    const armies: LinkMicArmies = {
      common: sampleCommon("WebcastLinkMicArmies"),
      battleId: "7300000000000000001",
      armies: [
        {
          key: "6900000000000000001",
          value: {
            userArmies: [
              {
                userId: "6900000000000000003",
                score: 99999,
                nickname: "Top Fan",
                avatarThumb: SAMPLE_IMAGE,
                diamondScore: 9999,
              },
              {
                userId: "6900000000000000004",
                score: 1,
                nickname: "",
                diamondScore: 0,
              },
            ],
            hostScore: 100000,
          },
        },
        { key: "6900000000000000002" },
      ],
      triggerReason: 2,
      fromUserId: "6900000000000000003",
      giftId: "5655",
      giftCount: 99,
      totalDiamondCount: 99,
    };
    expect(decode(encodeMessage(LinkMicArmiesSchema, armies))).toStrictEqual(
      armies,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.varint(2, 1),
      fields.message(
        3,
        unknownFields(),
        fields.varint(1, 11),
        fields.message(
          2,
          unknownFields(),
          fields.message(
            1,
            unknownFields(),
            fields.message(4, unknownFields(), fields.string(2, "tos/a")),
          ),
          fields.varint(2, 5),
        ),
      ),
      unknownFields(1_000),
      fields.varint(10, 2),
    );
    expect(decode(bytes)).toStrictEqual({
      battleId: "1",
      armies: [
        {
          key: "11",
          value: {
            userArmies: [
              {
                userId: "0",
                score: 0,
                nickname: "",
                avatarThumb: { urlList: [], uri: "tos/a" },
                diamondScore: 0,
              },
            ],
            hostScore: 5,
          },
        },
      ],
      triggerReason: 0,
      fromUserId: "0",
      giftId: "0",
      giftCount: 2,
      totalDiamondCount: 0,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 01", // battle_id (2): 1
        "1a 0f", // armies (3), one entry, 15 bytes
        "08 0b", //   key (1): 11
        "12 0b", //   value (2), 11 bytes
        "0a 06", //     user_armies (1), 6 bytes
        "08 65", //       user_id (1): 101
        "10 05", //       score (2): 5
        "28 01", //       diamond_score (5): 1
        "10 e8 07", //     hostscore (2): 1000
        "38 01", // trigger_reason (7): 1, score update
        "40 65", // from_user_id (8): 101
        "48 97 2c", // gift_id (9): 5655
        "50 03", // gift_count (10): 3
        "60 03", // total_diamond_count (12): 3
      ].join(" "),
    );
    const armies: LinkMicArmies = {
      battleId: "1",
      armies: [
        {
          key: "11",
          value: {
            userArmies: [
              { userId: "101", score: 5, nickname: "", diamondScore: 1 },
            ],
            hostScore: 1000,
          },
        },
      ],
      triggerReason: 1,
      fromUserId: "101",
      giftId: "5655",
      giftCount: 3,
      totalDiamondCount: 3,
    };
    expect(decode(bytes)).toStrictEqual(armies);
    expect(toHex(encodeMessage(LinkMicArmiesSchema, armies))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a 64-bit id, a sign-extended int32, map entries out of order, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "60 ff ff ff ff ff ff ff ff ff 01", // total_diamond_count (12): -1
        "1a 04", // armies (3), 4 bytes
        "12 00", //   value (2), 0 bytes, before its key
        "08 16", //   key (1): 22
        "5a 00", // gift_icon_image (11), not read, 0 bytes
        "10 81 80 e8 e2 aa ea b3 a7 65", // battle_id (2): 7300000000000000001
        "1a 02", // armies (3), 2 bytes
        "08 0b", //   key (1): 11
        "38 02", // trigger_reason (7): 2, battle end
        "20 01", // channel_id (4), not read
        "71 01 00 00 00 00 00 00 00", // field 14, fixed64, not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      battleId: "7300000000000000001",
      armies: [
        { key: "22", value: { userArmies: [], hostScore: 0 } },
        { key: "11" },
      ],
      triggerReason: 2,
      fromUserId: "0",
      giftId: "0",
      giftCount: 0,
      totalDiamondCount: -1,
    });
  });
});
