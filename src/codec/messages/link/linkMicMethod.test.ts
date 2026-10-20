import { describe, expect, it } from "vitest";
import type { LinkMicMethod } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LinkMicMethodSchema } from "./linkMicMethod.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../../test/helpers/encoder.js";
import {
  SAMPLE_USER,
  sampleCommon,
  unknownFields,
} from "../../../../test/helpers/samples.js";

// Field numbers: WebcastLinkMicMethod in webcast/model/message/messages.proto;
// its reply_type (47) is a webcast.model.data.LinkmicReplyType
// (model/data/messages.proto). The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) => decodeMessage(LinkMicMethodSchema, bytes);

describe("LinkMicMethodSchema", () => {
  it("reads common (1), message_type (2), user_id (5), channel_id (8), invite_uid (13), answer (14), to_user_id (21), from_user_id (24), rival_anchor_id (38), linked_users (45) and reply_type (47)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastLinkMicMethod")),
      fields.varint(2, 4),
      fields.string(3, "key"), // access_key, not read
      fields.varint(4, 1), // anchor_linkmic_id, not read
      fields.varint(5, 6_900_000_000_000_000_001n),
      fields.varint(6, 100), // fan_ticket, not read
      fields.varint(8, 7_200_000_000_000_000_001n),
      fields.varint(9, 1), // layout, not read
      fields.varint(13, 6_900_000_000_000_000_002n),
      fields.varint(14, 1),
      fields.varint(15, 1_760_000_000), // start_time, not read
      fields.bytes(17, Uint8Array.of(1, 2)), // user_scores, not read
      fields.varint(21, 6_900_000_000_000_000_002n),
      fields.varint(24, 6_900_000_000_000_000_001n),
      fields.string(25, "tips"), // tips, not read
      fields.varint(38, 6_900_000_000_000_000_002n),
      fields.varint(43, 2), // scene, not read
      fields.message(45, fields.varint(1, 11), fields.string(3, "Ann")),
      fields.message(45, fields.varint(1, 22)),
      fields.varint(47, 1),
      fields.string(48, "ok"), // reply_prompts, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastLinkMicMethod",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      messageType: 4,
      userId: "6900000000000000001",
      channelId: "7200000000000000001",
      inviteUid: "6900000000000000002",
      answer: 1,
      toUserId: "6900000000000000002",
      fromUserId: "6900000000000000001",
      rivalAnchorId: "6900000000000000002",
      linkedUsers: [
        { userId: "11", nickname: "Ann", displayId: "", badgeList: [] },
        { userId: "22", nickname: "", displayId: "", badgeList: [] },
      ],
      replyType: 1,
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      messageType: 0,
      userId: "0",
      channelId: "0",
      inviteUid: "0",
      answer: 0,
      toUserId: "0",
      fromUserId: "0",
      rivalAnchorId: "0",
      linkedUsers: [],
      replyType: 0,
    });
  });

  it("round-trips every field through the encoder", () => {
    const method: LinkMicMethod = {
      common: sampleCommon("WebcastLinkMicMethod"),
      messageType: 12,
      userId: "6900000000000000001",
      channelId: "7200000000000000001",
      inviteUid: "6900000000000000002",
      answer: 2,
      toUserId: "6900000000000000002",
      fromUserId: "6900000000000000001",
      rivalAnchorId: "6900000000000000002",
      linkedUsers: [
        SAMPLE_USER,
        { ...SAMPLE_USER, userId: "6900000000000000002" },
      ],
      replyType: 2,
    };
    expect(decode(encodeMessage(LinkMicMethodSchema, method))).toStrictEqual(
      method,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.varint(2, 1),
      fields.message(45, unknownFields(), fields.string(3, "Ann")),
      unknownFields(1_000),
      fields.varint(47, 2),
    );
    expect(decode(bytes)).toStrictEqual({
      messageType: 1,
      userId: "0",
      channelId: "0",
      inviteUid: "0",
      answer: 0,
      toUserId: "0",
      fromUserId: "0",
      rivalAnchorId: "0",
      linkedUsers: [
        { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
      ],
      replyType: 2,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 04", // message_type (2): 4
        "28 0b", // user_id (5): 11
        "40 01", // channel_id (8): 1
        "68 16", // invite_uid (13): 22
        "70 01", // answer (14): 1
        "a8 01 16", // to_user_id (21): 22
        "c0 01 0b", // from_user_id (24): 11
        "b0 02 16", // rival_anchor_id (38): 22
        "ea 02 04", // linked_users (45), 4 bytes
        "1a 02 4a 6f", //   nickname (3): "Jo"
        "f8 02 01", // reply_type (47): 1, agree
      ].join(" "),
    );
    const method: LinkMicMethod = {
      messageType: 4,
      userId: "11",
      channelId: "1",
      inviteUid: "22",
      answer: 1,
      toUserId: "22",
      fromUserId: "11",
      rivalAnchorId: "22",
      linkedUsers: [
        { userId: "0", nickname: "Jo", displayId: "", badgeList: [] },
      ],
      replyType: 1,
    };
    expect(decode(bytes)).toStrictEqual(method);
    expect(toHex(encodeMessage(LinkMicMethodSchema, method))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with 64-bit ids, a sign-extended int32, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "f8 02 02", // reply_type (47): 2, reject
        "1a 03 6b 65 79", // access_key (3), not read: "key"
        "ea 02 0a", // linked_users (45), 10 bytes
        "08 81 80 c8 b1 93 ae ee e0 5f", //   id (1): 6900000000000000001
        "70 ff ff ff ff ff ff ff ff ff 01", // answer (14): -1
        "ea 02 00", // linked_users (45), 0 bytes
        "8a 01 01 61", // user_scores (17), not read: 1 byte
        "10 01", // message_type (2): 1
        "b0 02 81 80 e8 e2 aa ea b3 a7 65", // rival_anchor_id (38): 7300000000000000001
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      messageType: 1,
      userId: "0",
      channelId: "0",
      inviteUid: "0",
      answer: -1,
      toUserId: "0",
      fromUserId: "0",
      rivalAnchorId: "7300000000000000001",
      linkedUsers: [
        {
          userId: "6900000000000000001",
          nickname: "",
          displayId: "",
          badgeList: [],
        },
        { userId: "0", nickname: "", displayId: "", badgeList: [] },
      ],
      replyType: 2,
    });
  });
});
