import { describe, expect, it } from "vitest";
import type { LinkMicBattlePunishFinish } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LinkMicBattlePunishFinishSchema } from "./linkMicBattlePunishFinish.js";
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

// Field numbers: WebcastLinkMicBattlePunishFinish in
// webcast/model/message/messages.proto; its reason (4) is a
// webcast.im.LinkMicBattlePunishFinish_Reason (im.proto). The bytes are
// written field by field (fields.*) or by hand, not from the schema, so a
// wrong number in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(LinkMicBattlePunishFinishSchema, bytes);

describe("LinkMicBattlePunishFinishSchema", () => {
  it("reads common (1), channel_id (2), op_uid (3), reason (4) and battle_id (5)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastLinkMicBattlePunishFinish")),
      fields.varint(2, 7_200_000_000_000_000_001n),
      fields.varint(3, 6_900_000_000_000_000_001n),
      fields.varint(4, 1),
      fields.varint(5, 7_300_000_000_000_000_001n),
      fields.message(6, fields.varint(1, 1)), // battle_settings, not read
      fields.message(7, fields.message(1)), // match_punish_extra_info, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastLinkMicBattlePunishFinish",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      channelId: "7200000000000000001",
      opUid: "6900000000000000001",
      reason: 1,
      battleId: "7300000000000000001",
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      channelId: "0",
      opUid: "0",
      reason: 0,
      battleId: "0",
    });
  });

  it("round-trips every field through the encoder", () => {
    const finish: LinkMicBattlePunishFinish = {
      common: sampleCommon("WebcastLinkMicBattlePunishFinish"),
      channelId: "7200000000000000001",
      opUid: "6900000000000000001",
      reason: 1,
      battleId: "7300000000000000001",
    };
    expect(
      decode(encodeMessage(LinkMicBattlePunishFinishSchema, finish)),
    ).toStrictEqual(finish);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.varint(3, 11),
      fields.message(1, unknownFields(), fields.varint(6, 1)),
      unknownFields(1_000),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: true,
      },
      channelId: "0",
      opUid: "11",
      reason: 0,
      battleId: "0",
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 01", // channel_id (2): 1
        "18 0b", // op_uid (3): 11
        "20 01", // reason (4): 1, cut short
        "28 02", // battle_id (5): 2
      ].join(" "),
    );
    const finish: LinkMicBattlePunishFinish = {
      channelId: "1",
      opUid: "11",
      reason: 1,
      battleId: "2",
    };
    expect(decode(bytes)).toStrictEqual(finish);
    expect(toHex(encodeMessage(LinkMicBattlePunishFinishSchema, finish))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with 64-bit ids, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "28 81 80 e8 e2 aa ea b3 a7 65", // battle_id (5): 7300000000000000001
        "32 02", // battle_settings (6), not read, 2 bytes
        "08 01", //   battle_id (1): 1
        "10 81 80 c0 f6 a4 bb e2 f5 63", // channel_id (2): 7200000000000000001
        "3a 00", // match_punish_extra_info (7), not read, 0 bytes
        "18 0b", // op_uid (3): 11
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      channelId: "7200000000000000001",
      opUid: "11",
      reason: 0,
      battleId: "7300000000000000001",
    });
  });
});
