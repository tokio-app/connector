import { describe, expect, it } from "vitest";
import {
  PinCardType,
  SubPinAction,
  type SubPinEventMessage,
} from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { SubPinEventMessageSchema } from "./subPinEvent.js";
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

// Field numbers: WebcastSubPinEventMessage in
// webcast/model/message/messages.proto; SubPinCard, SubGoalPinCard, Text and
// SubPinCardText in webcast/chatroom/api.proto. The bytes are written field
// by field (fields.*) or by hand, not from the schema, so a wrong number in
// the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(SubPinEventMessageSchema, bytes);

describe("SubPinAction and PinCardType", () => {
  it("have the values of webcast.im.SubPinEventMessage_ActionType and webcast.model.data.PinCardType", () => {
    expect(SubPinAction).toEqual({ UNKNOWN: 0, PIN: 1, UNPIN: 2 });
    expect(PinCardType).toEqual({
      UNKNOWN: 0,
      CUSTOMIZED_BENEFIT_E_NUM: 1,
      SUB_GOAL_E_NUM: 2,
      UP_SELL_DM: 3,
      UP_SELL_LEAD_SGEN: 4,
      SMB_SUB_PLAN: 5,
      SMB_COURSE: 6,
    });
    expect(Object.isFrozen(SubPinAction)).toBe(true);
    expect(Object.isFrozen(PinCardType)).toBe(true);
  });
});

describe("SubPinEventMessageSchema", () => {
  it("reads common (1), action_type (2), card (3: title 2, desc 3, type 5, goal_pin_card 8 with goal_id 1, desc 3, target 4, progress 5) and operator_user_id (4)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastSubPinEventMessage")),
      fields.varint(2, 1),
      fields.message(
        3,
        fields.varint(1, 3_600), // time_to_live, not read
        fields.message(2, fields.varint(1, 1), fields.string(2, "Sub goal")),
        fields.message(3, fields.varint(1, 2), fields.string(2, "pm_mt_goal")),
        fields.message(4, fields.string(2, "tos/card")), // image, not read
        fields.varint(5, 2),
        fields.varint(6, 77), // id, not read
        fields.message(
          8,
          fields.varint(1, 7_600_000_000_000_000_001n),
          fields.varint(2, 3_600), // time_to_live, not read
          fields.message(3, fields.varint(1, 1), fields.string(2, "Reach 10")),
          fields.varint(4, 10),
          fields.varint(5, 4),
        ),
        fields.string(9, "sslocal://x"), // action_schema, not read
      ),
      fields.varint(4, 6_900_000_000_000_000_001n),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastSubPinEventMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      actionType: 1,
      card: {
        title: { type: 1, content: "Sub goal" },
        desc: { type: 2, content: "pm_mt_goal" },
        type: 2,
        goalPinCard: {
          goalId: "7600000000000000001",
          desc: { type: 1, content: "Reach 10" },
          target: 10,
          progress: 4,
        },
      },
      operatorUserId: "6900000000000000001",
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      actionType: 0,
      operatorUserId: "0",
    });
    expect(decode(fields.message(3, fields.message(8))).card).toStrictEqual({
      type: 0,
      goalPinCard: { goalId: "0", target: 0, progress: 0 },
    });
  });

  it("round-trips every field through the encoder", () => {
    const pin: SubPinEventMessage = {
      common: sampleCommon("WebcastSubPinEventMessage"),
      actionType: SubPinAction.PIN,
      card: {
        title: { type: 1, content: "Perk" },
        desc: { type: 1, content: "A perk" },
        type: PinCardType.SUB_GOAL_E_NUM,
        goalPinCard: {
          goalId: "7600000000000000001",
          desc: { type: 2, content: "pm_mt_sub_goal" },
          target: 100,
          progress: 42,
        },
      },
      operatorUserId: "6900000000000000001",
    };
    expect(decode(encodeMessage(SubPinEventMessageSchema, pin))).toStrictEqual(
      pin,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.varint(2, 2),
      fields.message(
        3,
        unknownFields(),
        fields.message(2, unknownFields(), fields.string(2, "T")),
        fields.message(
          8,
          unknownFields(),
          fields.message(3, unknownFields(), fields.varint(1, 2)),
          fields.varint(5, 1),
        ),
      ),
      unknownFields(1_000),
    );
    expect(decode(bytes)).toStrictEqual({
      actionType: 2,
      card: {
        title: { type: 0, content: "T" },
        type: 0,
        goalPinCard: {
          goalId: "0",
          desc: { type: 2, content: "" },
          target: 0,
          progress: 1,
        },
      },
      operatorUserId: "0",
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 01", // action_type (2): 1, pin
        "1a 15", // card (3), 21 bytes
        "12 05", //   title (2), 5 bytes
        "08 01", //     type (1): 1, original text
        "12 01 54", //     content (2): "T"
        "28 02", //   type (5): 2, sub goal
        "42 0a", //   goal_pin_card (8), 10 bytes
        "08 09", //     goal_id (1): 9
        "1a 02 08 02", //     desc (3), 2 bytes: type (1): 2, starling key
        "20 0a", //     target (4): 10
        "28 03", //     progress (5): 3
        "20 2a", // operator_user_id (4): 42
      ].join(" "),
    );
    const pin: SubPinEventMessage = {
      actionType: 1,
      card: {
        title: { type: 1, content: "T" },
        type: 2,
        goalPinCard: {
          goalId: "9",
          desc: { type: 2, content: "" },
          target: 10,
          progress: 3,
        },
      },
      operatorUserId: "42",
    };
    expect(decode(bytes)).toStrictEqual(pin);
    expect(toHex(encodeMessage(SubPinEventMessageSchema, pin))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a 64-bit id, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "20 81 80 c8 b1 93 ae ee e0 5f", // operator_user_id (4): 6900000000000000001
        "1a 0d", // card (3), 13 bytes
        "30 4d", //   id (6), not read
        "1a 04", //   desc (3), 4 bytes
        "12 02 6f 6b", //     content (2): "ok"
        "08 90 1c", //   time_to_live (1), not read
        "28 01", //   type (5): 1
        "10 02", // action_type (2): 2, unpin
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      actionType: 2,
      card: { desc: { type: 0, content: "ok" }, type: 1 },
      operatorUserId: "6900000000000000001",
    });
  });
});
