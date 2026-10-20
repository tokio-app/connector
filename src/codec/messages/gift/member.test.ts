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

describe("MemberAction", () => {
  it("has the values of webcast.im.MemberMessageAction", () => {
    expect(MemberAction).toEqual({ UNKNOWN: 0, JOINED: 1, SUBSCRIBED: 3 });
    expect(Object.isFrozen(MemberAction)).toBe(true);
  });
});

describe("MemberMessageSchema", () => {
  it("reads common (1), user (2) and action (10) as actionId", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastMemberMessage")),
      fields.message(
        2,
        fields.varint(1, 6_900_000_000_000_000_001n),
        fields.string(3, "Nick"),
      ),
      fields.varint(3, 1_200), // member_count, not read
      fields.message(4, fields.varint(1, 1)), // operator, not read
      fields.varint(9, 1), // enter_type, not read
      fields.varint(10, 1),
      fields.string(11, "joined"), // action_description, not read
      fields.varint(12, 6_900_000_000_000_000_001n), // user_id, not read
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
      actionId: 1,
    });
  });

  it("keeps action values the enum doesn't name", () => {
    // MemberMessageAction: UNKNOWN 0, JOINED 1, SUBSCRIBED 3.
    expect(decode(fields.varint(10, 3)).actionId).toBe(3);
    expect(decode(fields.varint(10, 7)).actionId).toBe(7);
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({ actionId: 0 });
  });

  it("round-trips every field through the encoder", () => {
    const member: MemberMessage = {
      common: sampleCommon("WebcastMemberMessage"),
      user: SAMPLE_USER,
      actionId: 3,
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
      fields.varint(10, 1),
    );
    expect(decode(bytes)).toStrictEqual({
      user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
      actionId: 1,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 05", // user (2), 5 bytes
        "1a 03 42 6f 62", //   nickname (3): "Bob"
        "50 01", // action (10): 1, joined
      ].join(" "),
    );
    const member: MemberMessage = {
      user: { userId: "0", nickname: "Bob", displayId: "", badgeList: [] },
      actionId: 1,
    };
    expect(decode(bytes)).toStrictEqual(member);
    expect(toHex(encodeMessage(MemberMessageSchema, member))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a 64-bit id, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "18 78", // member_count (3), not read
        "22 02", // operator (4), not read, 2 bytes
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
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      user: {
        userId: "6900000000000000001",
        nickname: "",
        displayId: "",
        badgeList: [],
      },
      actionId: 3,
    });
  });
});
