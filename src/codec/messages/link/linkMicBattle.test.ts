import { describe, expect, it } from "vitest";
import type { LinkMicBattle } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LinkMicBattleSchema } from "./linkMicBattle.js";
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

// Field numbers: WebcastLinkMicBattle and TeamUsersInfo in
// webcast/model/message/messages.proto; BattleSetting, BattleResult,
// UserArmiesWrapper, BattleUserArmies, BattleUserArmy and
// BattleUserInfoWrapper in webcast/model/message/battle.proto;
// BattleUserInfo, BattleBaseUserInfo, BattleTeamResult and BattleTeamUser in
// webcast/model/live_match.proto. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) => decodeMessage(LinkMicBattleSchema, bytes);

describe("LinkMicBattleSchema", () => {
  it("reads common (1), battle_id (2), battle_settings (3), action (4), battle_result (5), armies (9), anchors_info (10), team_member (14), action_by_user_id (16) and team_battle_result (17)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastLinkMicBattle")),
      fields.varint(2, 7_300_000_000_000_000_001n),
      fields.message(
        3,
        fields.varint(1, 7_300_000_000_000_000_001n),
        fields.varint(2, 1_760_000_000_000),
        fields.varint(3, 300),
        fields.varint(4, 7_200_000_000_000_000_001n),
        fields.varint(5, 1),
        fields.varint(6, 1), // invite_type, not read
        fields.varint(8, 1),
        fields.varint(9, 30), // extra_duration_second, not read
        fields.varint(10, 1_760_000_300_000),
        fields.varint(12, 1), // source_type, not read
      ),
      fields.varint(4, 4),
      fields.message(
        5,
        fields.varint(1, 11),
        fields.message(
          2,
          fields.varint(1, 11),
          fields.varint(2, 1),
          fields.varint(3, 500),
          fields.varint(4, 50),
          fields.varint(5, 1), // enigma_score, not read
        ),
      ),
      fields.message(
        5,
        fields.varint(1, 22),
        fields.message(2, fields.varint(1, 22), fields.varint(3, 900)),
      ),
      fields.message(6, fields.varint(1, 1)), // fuzzy_display_config, not read
      fields.varint(8, 1), // invitee_gift_permission_type, not read
      fields.message(
        9,
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
            fields.string(6, "101"), // user_id_str, not read
          ),
          fields.message(1, fields.varint(1, 102), fields.varint(2, 200)),
          fields.varint(2, 500),
          fields.string(3, "11"), // anchor_id_str, not read
        ),
      ),
      fields.message(
        10,
        fields.varint(1, 11),
        fields.message(
          2,
          fields.message(
            1,
            fields.varint(1, 11),
            fields.string(2, "Host One"),
            fields.message(3, fields.string(2, "tos/h1")),
            fields.string(4, "host.one"),
            fields.varint(5, 7_100_000_000_000_000_001n),
            fields.varint(6, 1), // invitation_role, not read
          ),
          fields.message(2, fields.string(3, "tag")), // tags, not read
        ),
      ),
      fields.string(11, "bubble"), // bubble_text, not read
      fields.message(
        14,
        fields.varint(1, 1),
        fields.varint(2, 11),
        fields.varint(2, 33),
      ),
      fields.message(14, fields.varint(1, 2), fields.varint(2, 22)),
      fields.message(15, fields.varint(1, 1)), // invitees_gift_permission_type, not read
      fields.varint(16, 11),
      fields.message(
        17,
        fields.varint(1, 1),
        fields.message(
          2,
          fields.varint(1, 11),
          fields.varint(2, 500),
          fields.string(3, "11"), // user_id_str, not read
        ),
        fields.message(2, fields.varint(1, 33), fields.varint(2, 100)),
        fields.varint(3, 1),
        fields.varint(4, 600),
        fields.varint(5, 1), // total_enigma_score, not read
      ),
      fields.message(18, fields.varint(1, 1)), // team_armies, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastLinkMicBattle",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      battleId: "7300000000000000001",
      battleSettings: {
        battleId: "7300000000000000001",
        startTimeMs: "1760000000000",
        duration: 300,
        channelId: "7200000000000000001",
        status: 1,
        battleType: 1,
        endTimeMs: "1760000300000",
      },
      action: 4,
      battleResult: [
        {
          key: "11",
          value: { userId: "11", result: 1, score: 500, diamondScore: 50 },
        },
        {
          key: "22",
          value: { userId: "22", result: 0, score: 900, diamondScore: 0 },
        },
      ],
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
              { userId: "102", score: 200, nickname: "", diamondScore: 0 },
            ],
            hostScore: 500,
          },
        },
      ],
      anchorsInfo: [
        {
          key: "11",
          value: {
            user: {
              userId: "11",
              nickName: "Host One",
              avatarThumb: { urlList: [], uri: "tos/h1" },
              displayId: "host.one",
              roomId: "7100000000000000001",
            },
          },
        },
      ],
      teamMember: [
        { teamId: "1", userId: ["11", "33"] },
        { teamId: "2", userId: ["22"] },
      ],
      actionByUserId: "11",
      teamBattleResult: [
        {
          teamId: "1",
          teamUser: [
            { userId: "11", score: 500 },
            { userId: "33", score: 100 },
          ],
          result: 1,
          totalScore: 600,
        },
      ],
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      battleId: "0",
      action: 0,
      battleResult: [],
      armies: [],
      anchorsInfo: [],
      teamMember: [],
      actionByUserId: "0",
      teamBattleResult: [],
    });
    const empties = decode(
      concat(
        fields.message(3),
        fields.message(5),
        fields.message(5, fields.message(2)),
        fields.message(9, fields.message(2)),
        fields.message(10, fields.message(2, fields.message(1))),
        fields.message(14),
        fields.message(17),
      ),
    );
    expect(empties.battleSettings).toStrictEqual({
      battleId: "0",
      startTimeMs: "0",
      duration: 0,
      channelId: "0",
      status: 0,
      battleType: 0,
      endTimeMs: "0",
    });
    expect(empties.battleResult).toStrictEqual([
      { key: "0" },
      {
        key: "0",
        value: { userId: "0", result: 0, score: 0, diamondScore: 0 },
      },
    ]);
    expect(empties.armies).toStrictEqual([
      { key: "0", value: { userArmies: [], hostScore: 0 } },
    ]);
    expect(empties.anchorsInfo).toStrictEqual([
      {
        key: "0",
        value: {
          user: { userId: "0", nickName: "", displayId: "", roomId: "0" },
        },
      },
    ]);
    expect(empties.teamMember).toStrictEqual([{ teamId: "0", userId: [] }]);
    expect(empties.teamBattleResult).toStrictEqual([
      { teamId: "0", teamUser: [], result: 0, totalScore: 0 },
    ]);
  });

  it("round-trips every field through the encoder", () => {
    const battle: LinkMicBattle = {
      common: sampleCommon("WebcastLinkMicBattle"),
      battleId: "7300000000000000001",
      battleSettings: {
        battleId: "7300000000000000001",
        startTimeMs: "1760000000000",
        duration: 300,
        channelId: "7200000000000000001",
        status: 2,
        battleType: 2,
        endTimeMs: "1760000300000",
      },
      action: 5,
      battleResult: [
        {
          key: "6900000000000000001",
          value: {
            userId: "6900000000000000001",
            result: 0,
            score: 12345,
            diamondScore: 1234,
          },
        },
        { key: "6900000000000000002" },
      ],
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
            ],
            hostScore: 12345,
          },
        },
      ],
      anchorsInfo: [
        {
          key: "6900000000000000001",
          value: {
            user: {
              userId: "6900000000000000001",
              nickName: "Host One",
              avatarThumb: SAMPLE_IMAGE,
              displayId: "host.one",
              roomId: "7100000000000000001",
            },
          },
        },
        { key: "6900000000000000002", value: {} },
      ],
      teamMember: [
        { teamId: "1", userId: ["6900000000000000001", "6900000000000000003"] },
      ],
      actionByUserId: "6900000000000000001",
      teamBattleResult: [
        {
          teamId: "1",
          teamUser: [
            { userId: "6900000000000000001", score: 12345 },
            { userId: "6900000000000000003", score: 1 },
          ],
          result: 1,
          totalScore: 12346,
        },
      ],
    };
    expect(decode(encodeMessage(LinkMicBattleSchema, battle))).toStrictEqual(
      battle,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.varint(2, 1),
      fields.message(3, unknownFields(), fields.varint(5, 1)),
      fields.message(
        5,
        unknownFields(),
        fields.varint(1, 11),
        fields.message(2, unknownFields(), fields.varint(3, 5)),
      ),
      fields.message(
        9,
        unknownFields(),
        fields.message(
          2,
          unknownFields(),
          fields.message(1, unknownFields(), fields.string(3, "A")),
        ),
      ),
      fields.message(
        10,
        unknownFields(),
        fields.message(
          2,
          unknownFields(),
          fields.message(1, unknownFields(), fields.string(2, "H")),
        ),
      ),
      fields.message(14, unknownFields(), fields.varint(2, 11)),
      unknownFields(1_000),
      fields.message(
        17,
        unknownFields(),
        fields.message(2, unknownFields(), fields.varint(2, 1)),
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      battleId: "1",
      battleSettings: {
        battleId: "0",
        startTimeMs: "0",
        duration: 0,
        channelId: "0",
        status: 1,
        battleType: 0,
        endTimeMs: "0",
      },
      action: 0,
      battleResult: [
        {
          key: "11",
          value: { userId: "0", result: 0, score: 5, diamondScore: 0 },
        },
      ],
      armies: [
        {
          key: "0",
          value: {
            userArmies: [
              { userId: "0", score: 0, nickname: "A", diamondScore: 0 },
            ],
            hostScore: 0,
          },
        },
      ],
      anchorsInfo: [
        {
          key: "0",
          value: {
            user: { userId: "0", nickName: "H", displayId: "", roomId: "0" },
          },
        },
      ],
      teamMember: [{ teamId: "0", userId: ["11"] }],
      actionByUserId: "0",
      teamBattleResult: [
        {
          teamId: "0",
          teamUser: [{ userId: "0", score: 1 }],
          result: 0,
          totalScore: 0,
        },
      ],
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 01", // battle_id (2): 1
        "1a 07", // battle_settings (3), 7 bytes
        "08 01", //   battle_id (1): 1
        "18 ac 02", //   duration (3): 300
        "28 01", //   status (5): 1, started
        "20 04", // action (4): 4, open
        "2a 08", // battle_result (5), 8 bytes
        "08 0b", //   key (1): 11
        "12 04", //   value (2), 4 bytes
        "08 0b", //     user_id (1): 11
        "18 05", //     score (3): 5
        "4a 0b", // armies (9), 11 bytes
        "08 0b", //   key (1): 11
        "12 07", //   value (2), 7 bytes
        "0a 03", //     user_armies (1), 3 bytes
        "1a 01 41", //       nickname (3): "A"
        "10 05", //     hostscore (2): 5
        "52 0a", // anchors_info (10), 10 bytes
        "08 0b", //   key (1): 11
        "12 06", //   value (2), 6 bytes
        "0a 04", //     user (1), 4 bytes
        "12 02 48 31", //       nick_name (2): "H1"
        "72 04", // team_member (14), 4 bytes
        "08 01", //   team_id (1): 1
        "10 0b", //   user_id (2): 11
        "80 01 0b", // action_by_user_id (16): 11
        "8a 01 08", // team_battle_result (17), 8 bytes
        "08 01", //   team_id (1): 1
        "12 02", //   team_user (2), 2 bytes
        "08 0b", //     user_id (1): 11
        "20 05", //   total_score (4): 5
      ].join(" "),
    );
    const battle: LinkMicBattle = {
      battleId: "1",
      battleSettings: {
        battleId: "1",
        startTimeMs: "0",
        duration: 300,
        channelId: "0",
        status: 1,
        battleType: 0,
        endTimeMs: "0",
      },
      action: 4,
      battleResult: [
        {
          key: "11",
          value: { userId: "11", result: 0, score: 5, diamondScore: 0 },
        },
      ],
      armies: [
        {
          key: "11",
          value: {
            userArmies: [
              { userId: "0", score: 0, nickname: "A", diamondScore: 0 },
            ],
            hostScore: 5,
          },
        },
      ],
      anchorsInfo: [
        {
          key: "11",
          value: {
            user: { userId: "0", nickName: "H1", displayId: "", roomId: "0" },
          },
        },
      ],
      teamMember: [{ teamId: "1", userId: ["11"] }],
      actionByUserId: "11",
      teamBattleResult: [
        {
          teamId: "1",
          teamUser: [{ userId: "11", score: 0 }],
          result: 0,
          totalScore: 5,
        },
      ],
    };
    expect(decode(bytes)).toStrictEqual(battle);
    expect(toHex(encodeMessage(LinkMicBattleSchema, battle))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with 64-bit ids, packed team members, sign-extended int32s, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "80 01 81 80 90 cf b0 99 85 d9 66", // action_by_user_id (16): 7400000000000000001
        "72 0e", // team_member (14), 14 bytes
        "12 0a", //   user_id (2), packed, 10 bytes
        "81 80 90 cf b0 99 85 d9 66", //     7400000000000000001
        "0b", //     11
        "08 02", //   team_id (1): 2
        "20 05", // action (4): 5, finish
        "5a 01 78", // bubble_text (11), not read
        "10 02", // battle_id (2): 2
        "2a 09", // battle_result (5), 9 bytes
        "12 05", //   value (2), 5 bytes, before its key
        "18 e8 07", //     score (3): 1000
        "10 02", //     result (2): 2, draw
        "08 16", //   key (1): 22
        "1a 12", // battle_settings (3), 18 bytes
        "50 e0 a7 c5 c1 9c 33", //   end_time_ms (10): 1760000300000
        "18 ff ff ff ff ff ff ff ff ff 01", //   duration (3): -1
        "4d 01 00 00 00", // armies (9) as a fixed32, the wrong wire type: skipped
        "8a 01 05", // team_battle_result (17), 5 bytes
        "20 e8 07", //   total_score (4): 1000
        "18 01", //   result (3): 1
        "2a 00", // battle_result (5), 0 bytes
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      battleId: "2",
      battleSettings: {
        battleId: "0",
        startTimeMs: "0",
        duration: -1,
        channelId: "0",
        status: 0,
        battleType: 0,
        endTimeMs: "1760000300000",
      },
      action: 5,
      battleResult: [
        {
          key: "22",
          value: { userId: "0", result: 2, score: 1000, diamondScore: 0 },
        },
        { key: "0" },
      ],
      armies: [],
      anchorsInfo: [],
      teamMember: [{ teamId: "2", userId: ["7400000000000000001", "11"] }],
      actionByUserId: "7400000000000000001",
      teamBattleResult: [
        { teamId: "0", teamUser: [], result: 1, totalScore: 1000 },
      ],
    });
  });
});
