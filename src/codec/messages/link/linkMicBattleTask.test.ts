import { describe, expect, it } from "vitest";
import type { LinkMicBattleTask } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LinkMicBattleTaskSchema } from "./linkMicBattleTask.js";
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

// Field numbers: WebcastLinkmicBattleTaskMessage in
// webcast/model/message/messages.proto; BattleTaskUpdate and BattleTaskSettle
// in webcast/model/message/battle.proto. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(LinkMicBattleTaskSchema, bytes);

describe("LinkMicBattleTaskSchema", () => {
  it("reads common (1), task_message_type (2), task_update (4), task_settle (5) and battle_id (20)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastLinkmicBattleTaskMessage")),
      fields.varint(2, 1),
      fields.message(3, fields.message(1)), // start, not read
      fields.message(
        4,
        fields.varint(1, 1000),
        fields.varint(2, 6_900_000_000_000_000_001n),
        fields.string(3, "pm_key"), // prompt_key, not read
        fields.string(21, "log"), // log_id, not read
      ),
      fields.message(
        5,
        fields.varint(1, 2),
        fields.varint(2, 1_760_000_000), // reward_start_time, not read
      ),
      fields.message(6, fields.varint(2, 1)), // reward, not read
      fields.varint(20, 7_300_000_000_000_000_001n),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastLinkmicBattleTaskMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      taskMessageType: 1,
      taskUpdate: { progress: 1000, fromUserId: "6900000000000000001" },
      taskSettle: { result: 2 },
      battleId: "7300000000000000001",
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      taskMessageType: 0,
      battleId: "0",
    });
    expect(decode(concat(fields.message(4), fields.message(5)))).toStrictEqual({
      taskMessageType: 0,
      taskUpdate: { progress: 0, fromUserId: "0" },
      taskSettle: { result: 0 },
      battleId: "0",
    });
  });

  it("round-trips every field through the encoder", () => {
    const task: LinkMicBattleTask = {
      common: sampleCommon("WebcastLinkmicBattleTaskMessage"),
      taskMessageType: 2,
      taskUpdate: { progress: 99999, fromUserId: "6900000000000000001" },
      taskSettle: { result: 1 },
      battleId: "7300000000000000001",
    };
    expect(decode(encodeMessage(LinkMicBattleTaskSchema, task))).toStrictEqual(
      task,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(4, unknownFields(), fields.varint(1, 5)),
      fields.message(5, unknownFields(), fields.varint(1, 1)),
      unknownFields(1_000),
      fields.varint(20, 2),
    );
    expect(decode(bytes)).toStrictEqual({
      taskMessageType: 0,
      taskUpdate: { progress: 5, fromUserId: "0" },
      taskSettle: { result: 1 },
      battleId: "2",
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 01", // task_message_type (2): 1, update
        "22 05", // task_update (4), 5 bytes
        "08 e8 07", //   progress (1): 1000
        "10 0b", //   from_user_id (2): 11
        "a0 01 02", // battle_id (20): 2
      ].join(" "),
    );
    const task: LinkMicBattleTask = {
      taskMessageType: 1,
      taskUpdate: { progress: 1000, fromUserId: "11" },
      battleId: "2",
    };
    expect(decode(bytes)).toStrictEqual(task);
    expect(toHex(encodeMessage(LinkMicBattleTaskSchema, task))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a 64-bit id, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "a0 01 81 80 e8 e2 aa ea b3 a7 65", // battle_id (20): 7300000000000000001
        "2a 02", // task_settle (5), 2 bytes
        "08 02", //   result (1): 2, both succeeded
        "1a 00", // start (3), not read, 0 bytes
        "10 02", // task_message_type (2): 2, settle
        "32 02", // reward (6), not read, 2 bytes
        "10 01", //   status (2): 1
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      taskMessageType: 2,
      taskSettle: { result: 2 },
      battleId: "7300000000000000001",
    });
  });
});
