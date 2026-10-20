import { describe, expect, it } from "vitest";
import {
  GoalMessageSource,
  type GoalUpdateMessage,
} from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { GoalUpdateMessageSchema } from "./goalUpdate.js";
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

// Field numbers: WebcastGoalUpdateMessage in
// webcast/model/gift/model_webcast_goal_update_message.proto; LiveStreamGoal,
// LiveStreamSubGoal and LiveStreamSubGoalGift in webcast/model/gift/model.proto;
// GoalStats in webcast/model/goal.proto; update_source (16) is a
// webcast.model.data.GoalMessageSource. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(GoalUpdateMessageSchema, bytes);

const DEFAULTS = {
  contributorId: "0",
  contributorDisplayId: "",
  contributeCount: 0,
  contributeScore: 0,
  updateSource: 0,
};

const GOAL_DEFAULTS = {
  id: "0",
  type: 0,
  status: 0,
  subGoals: [],
  description: "",
};

describe("GoalMessageSource", () => {
  it("has the values of webcast.model.data.GoalMessageSource", () => {
    expect(GoalMessageSource).toEqual({
      UNKNOWN: 0,
      COMMIT: 1,
      PROGRESS_UPDATE: 2,
      PIN: 3,
      UNPIN: 4,
      REVIEW_CALLBACK: 5,
      SUSPEND: 6,
      CHALLENGE_PROMPT: 7,
    });
    expect(Object.isFrozen(GoalMessageSource)).toBe(true);
  });
});

describe("GoalUpdateMessageSchema", () => {
  it("reads common (1), goal (3: id 1, type 2, status 3, sub_goals 4 with progress 3, target 4 and gift 5 (name 1, diamond_count 3), description 5, stats 15 with total_coins 1 and total_contributor 2), contributor_id (4), contributor_display_id (6), contribute_count (9), contribute_score (10) and update_source (16)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastGoalUpdateMessage")),
      fields.message(2, fields.string(1, "k")), // indicator, not read
      fields.message(
        3,
        fields.varint(1, 7_600_000_000_000_000_001n),
        fields.varint(2, 1),
        fields.varint(3, 2),
        fields.message(
          4,
          fields.varint(1, 1), // type, not read
          fields.varint(2, 11), // id, not read
          fields.varint(3, 40),
          fields.varint(4, 100),
          fields.message(
            5,
            fields.string(1, "Rose"),
            fields.message(2, fields.string(2, "tos/rose")), // icon, not read
            fields.varint(3, 1),
            fields.varint(4, 1), // type, not read
          ),
        ),
        fields.message(4, fields.varint(3, 1), fields.varint(4, 5)),
        fields.string(5, "New mic"),
        fields.varint(6, 1), // audit_status, not read
        fields.string(13, "7600000000000000001"), // id_str, not read
        fields.message(
          15,
          fields.varint(1, 41),
          fields.varint(2, 3),
          fields.message(3, fields.varint(1, 1)), // comparison, not read
        ),
      ),
      fields.varint(4, 6_900_000_000_000_000_001n),
      fields.message(5, fields.string(2, "tos/a")), // contributor_avatar, not read
      fields.string(6, "nick.name"),
      fields.message(7, fields.varint(3, 1)), // contribute_subgoal, not read
      fields.varint(9, 1),
      fields.varint(10, 1),
      fields.varint(11, 1), // gift_repeat_count, not read
      fields.string(12, "6900000000000000001"), // contributor_id_str, not read
      fields.message(15, fields.varint(1, 1)), // pin_info, not read
      fields.varint(16, 2),
      fields.string(17, "{}"), // goal_extra, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastGoalUpdateMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      goal: {
        id: "7600000000000000001",
        type: 1,
        status: 2,
        subGoals: [
          {
            progress: 40,
            target: 100,
            gift: { name: "Rose", diamondCount: 1 },
          },
          { progress: 1, target: 5 },
        ],
        description: "New mic",
        stats: { totalCoins: 41, totalContributor: 3 },
      },
      contributorId: "6900000000000000001",
      contributorDisplayId: "nick.name",
      contributeCount: 1,
      contributeScore: 1,
      updateSource: 2,
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual(DEFAULTS);
    expect(
      decode(fields.message(3, fields.message(4), fields.message(15))).goal,
    ).toStrictEqual({
      ...GOAL_DEFAULTS,
      subGoals: [{ progress: 0, target: 0 }],
      stats: { totalCoins: 0, totalContributor: 0 },
    });
  });

  it("round-trips every field through the encoder", () => {
    const update: GoalUpdateMessage = {
      common: sampleCommon("WebcastGoalUpdateMessage"),
      goal: {
        id: "7600000000000000001",
        type: 1,
        status: 2,
        subGoals: [
          {
            progress: 40,
            target: 100,
            gift: { name: "Rose", diamondCount: 1 },
          },
          {
            progress: 1,
            target: 5,
            gift: { name: "Lion", diamondCount: 29_999 },
          },
        ],
        description: "New mic",
        stats: { totalCoins: 41, totalContributor: 3 },
      },
      contributorId: "6900000000000000001",
      contributorDisplayId: "nick.name",
      contributeCount: 2,
      contributeScore: 10,
      updateSource: GoalMessageSource.PROGRESS_UPDATE,
    };
    expect(
      decode(encodeMessage(GoalUpdateMessageSchema, update)),
    ).toStrictEqual(update);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(
        3,
        unknownFields(),
        fields.string(5, "d"),
        fields.message(
          4,
          unknownFields(),
          fields.varint(4, 9),
          fields.message(5, unknownFields(), fields.string(1, "g")),
        ),
        fields.message(15, unknownFields(), fields.varint(2, 1)),
      ),
      unknownFields(1_000),
      fields.varint(16, 1),
    );
    expect(decode(bytes)).toStrictEqual({
      ...DEFAULTS,
      goal: {
        ...GOAL_DEFAULTS,
        subGoals: [
          { progress: 0, target: 9, gift: { name: "g", diamondCount: 0 } },
        ],
        description: "d",
        stats: { totalCoins: 0, totalContributor: 1 },
      },
      updateSource: 1,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "1a 1c", // goal (3), 28 bytes
        "08 09", //   id (1): 9
        "10 01", //   type (2): 1
        "22 0a", //   sub_goals (4), 10 bytes
        "18 02", //     progress (3): 2
        "20 05", //     target (4): 5
        "2a 04", //     gift (5), 4 bytes
        "0a 02 68 69", //       name (1): "hi"
        "2a 04 67 6f 61 6c", //   description (5): "goal"
        "7a 04", //   stats (15), 4 bytes
        "08 0a", //     total_coins (1): 10
        "10 02", //     total_contributor (2): 2
        "20 07", // contributor_id (4): 7
        "32 02 6a 6f", // contributor_display_id (6): "jo"
        "48 01", // contribute_count (9): 1
        "50 05", // contribute_score (10): 5
        "80 01 02", // update_source (16): 2, progress update
      ].join(" "),
    );
    const update: GoalUpdateMessage = {
      goal: {
        id: "9",
        type: 1,
        status: 0,
        subGoals: [
          { progress: 2, target: 5, gift: { name: "hi", diamondCount: 0 } },
        ],
        description: "goal",
        stats: { totalCoins: 10, totalContributor: 2 },
      },
      contributorId: "7",
      contributorDisplayId: "jo",
      contributeCount: 1,
      contributeScore: 5,
      updateSource: 2,
    };
    expect(decode(bytes)).toStrictEqual(update);
    expect(toHex(encodeMessage(GoalUpdateMessageSchema, update))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with 64-bit ids and counts, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "80 01 01", // update_source (16): 1, commit
        "8a 01 02 7b 7d", // goal_extra (17), not read
        "20 81 80 c8 b1 93 ae ee e0 5f", // contributor_id (4): 6900000000000000001
        "1a 13", // goal (3), 19 bytes
        "18 03", //   status (3): 3
        "22 05", //   sub_goals (4), 5 bytes
        "20 e8 07", //     target (4): 1000
        "08 01", //     type (1), not read
        "08 81 80 90 cf b0 99 85 d9 66", //   id (1): 7400000000000000001
        "48 e8 07", // contribute_count (9): 1000
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      ...DEFAULTS,
      goal: {
        ...GOAL_DEFAULTS,
        id: "7400000000000000001",
        status: 3,
        subGoals: [{ progress: 0, target: 1_000 }],
      },
      contributorId: "6900000000000000001",
      contributeCount: 1_000,
      updateSource: 1,
    });
  });
});
