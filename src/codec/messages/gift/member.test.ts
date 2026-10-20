import { describe, expect, it } from "vitest";
import { MemberAction, type MemberMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { MemberMessageSchema } from "./member.js";
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

// Field numbers: WebcastMemberMessage in webcast/model/message/messages.proto;
// its action (10) is a webcast.im.MemberMessageAction (synthetic_enums.proto).
// The bytes are written field by field (fields.*) or by hand, not from the
// schema, so a wrong number in the table fails here.

const decode = (bytes: Uint8Array) => decodeMessage(MemberMessageSchema, bytes);

const DEFAULTS = {
  memberCount: 0,
  isSetToAdmin: false,
  isTopUser: false,
  topUserNo: 0,
  actionId: 0,
  userShareType: "",
  kickSource: 0,
};

describe("MemberAction", () => {
  it("has the values of webcast.im.MemberMessageAction", () => {
    expect(MemberAction).toEqual({ UNKNOWN: 0, JOINED: 1, SUBSCRIBED: 3 });
    expect(Object.isFrozen(MemberAction)).toBe(true);
  });
});

describe("MemberMessageSchema", () => {
  it("reads common (1), user (2), member_count (3), operator (4), is_set_to_admin (5), is_top_user (6), top_user_no (8), action (10) as actionId, user_share_type (23) and kick_source (26)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastMemberMessage")),
      fields.message(
        2,
        fields.varint(1, 6_900_000_000_000_000_001n),
        fields.string(3, "Nick"),
      ),
      fields.varint(3, 1_200),
      fields.message(4, fields.varint(1, 1)),
      fields.varint(5, 1),
      fields.varint(6, 1),
      fields.varint(7, 50), // rank_score, not read
      fields.varint(8, 2),
      fields.varint(9, 1), // enter_type, not read
      fields.varint(10, 1),
      fields.string(11, "joined"), // action_description, not read
      fields.varint(12, 6_900_000_000_000_000_001n), // user_id, not read
      fields.varint(22, 3_000), // action_duration, not read
      fields.string(23, "share"),
      fields.varint(24, 1), // display_style, not read
      fields.varint(26, 2),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastMemberMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      user: {
        userId: "6900000000000000001",
        nickname: "Nick",
        displayId: "",
        badgeList: [],
      },
      memberCount: 1_200,
      operator: { userId: "1", nickname: "", displayId: "", badgeList: [] },
      isSetToAdmin: true,
      isTopUser: true,
      topUserNo: 2,
      actionId: 1,
      userShareType: "share",
      kickSource: 2,
    });
  });

  it("keeps action values the enum doesn't name", () => {
    // MemberMessageAction: UNKNOWN 0, JOINED 1, SUBSCRIBED 3.
    expect(decode(fields.varint(10, 3)).actionId).toBe(3);
    expect(decode(fields.varint(10, 7)).actionId).toBe(7);
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual(DEFAULTS);
  });

  it("round-trips every field through the encoder", () => {
    const member: MemberMessage = {
      common: sampleCommon("WebcastMemberMessage"),
      user: SAMPLE_USER,
      memberCount: 1_500,
      operator: { ...SAMPLE_USER, userId: "6900000000000000009" },
      isSetToAdmin: true,
      isTopUser: true,
      topUserNo: 1,
      actionId: 3,
      userShareType: "whatsapp",
      kickSource: 1,
    };
    expect(decode(encodeMessage(MemberMessageSchema, member))).toStrictEqual(
      member,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(2, unknownFields(), fields.string(3, "Ann")),
      unknownFields(1_000),
      fields.message(4, unknownFields(), fields.string(38, "mod")),
      fields.varint(10, 1),
    );
    expect(decode(bytes)).toStrictEqual({
      ...DEFAULTS,
      user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
      operator: { userId: "0", nickname: "", displayId: "mod", badgeList: [] },
      actionId: 1,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 05", // user (2), 5 bytes
        "1a 03 42 6f 62", //   nickname (3): "Bob"
        "18 78", // member_count (3): 120
        "22 02", // operator (4), 2 bytes
        "08 02", //   id (1): 2
        "28 01", // is_set_to_admin (5): true
        "30 01", // is_top_user (6): true
        "40 03", // top_user_no (8): 3
        "50 01", // action (10): 1, joined
        "ba 01 02 73 6d", // user_share_type (23): "sm"
        "d0 01 01", // kick_source (26): 1
      ].join(" "),
    );
    const member: MemberMessage = {
      user: { userId: "0", nickname: "Bob", displayId: "", badgeList: [] },
      memberCount: 120,
      operator: { userId: "2", nickname: "", displayId: "", badgeList: [] },
      isSetToAdmin: true,
      isTopUser: true,
      topUserNo: 3,
      actionId: 1,
      userShareType: "sm",
      kickSource: 1,
    };
    expect(decode(bytes)).toStrictEqual(member);
    expect(toHex(encodeMessage(MemberMessageSchema, member))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a 64-bit id, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "18 b0 09", // member_count (3): 1200
        "22 02", // operator (4), 2 bytes
        "08 02", //   id (1): 2
        "48 01", // enter_type (9), not read
        "50 03", // action (10): 3, subscribed
        "5a 01 78", // action_description (11), not read
        "12 0a", // user (2), 10 bytes
        "08 81 80 c8 b1 93 ae ee e0 5f", //   id (1): 6900000000000000001
        "60 81 80 c8 b1 93 ae ee e0 5f", // user_id (12), not read
        "ca 01 04", // admin_permissions (25), not read, 4 bytes
        "08 01", //   key (1): 1
        "10 01", //   value (2): 1
        "d0 01 ff ff ff ff ff ff ff ff ff 01", // kick_source (26): -1
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      ...DEFAULTS,
      user: {
        userId: "6900000000000000001",
        nickname: "",
        displayId: "",
        badgeList: [],
      },
      memberCount: 1_200,
      operator: { userId: "2", nickname: "", displayId: "", badgeList: [] },
      actionId: 3,
      kickSource: -1,
    });
  });
});
