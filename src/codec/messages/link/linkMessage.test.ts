import { describe, expect, it } from "vitest";
import type { LinkMessage, User } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LinkMessageSchema } from "./linkMessage.js";
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

// Field numbers: WebcastLinkMessage and LinkerMediaChangeContent in
// webcast/model/message/messages.proto; the contents in
// webcast/model/message/linker/: LinkerInviteContent (invite_message.proto),
// LinkerReplyContent (reply_message.proto), LinkerEnterContent,
// LinkerLeaveContent, LinkerKickOutContent and LinkerMuteContent
// (messages.proto), LinkedListChangeContent and ListUser
// (linked_list_change_message.proto), LinkerListChangeContent and
// LinkListUser (listchangemessage.proto). The bytes are written field by
// field (fields.*) or by hand, not from the schema, so a wrong number in the
// table fails here.

const decode = (bytes: Uint8Array) => decodeMessage(LinkMessageSchema, bytes);

const user = (nickname: string): User => ({
  userId: "0",
  nickname,
  displayId: "",
  badgeList: [],
});

describe("LinkMessageSchema", () => {
  it("reads common (1), message_type (2), linker_id (3), scene (4), invite_content (5), reply_content (6), enter_content (9), leave_content (10), kick_out_content (12), linked_list_change_content (13), mute_content (16), list_change_content (20) and media_change_content (22)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastLinkMessage")),
      fields.varint(2, 1),
      fields.varint(3, 7_300_000_000_000_000_001n),
      fields.varint(4, 4),
      fields.message(
        5,
        fields.varint(1, 6_900_000_000_000_000_001n),
        fields.varint(2, 7_100_000_000_000_000_001n), // from_room_id, not read
        fields.message(8, fields.string(3, "Inviter")),
        fields.varint(17, 1), // action_id, not read
      ),
      fields.message(
        6,
        fields.varint(1, 11), // from_user_id, not read
        fields.varint(6, 1), // link_type, not read
        fields.varint(7, 1),
        fields.message(8, fields.varint(1, 4)), // linker_setting, not read
        fields.message(9, fields.string(3, "Replier")),
        fields.message(10, fields.string(3, "Invitee")),
      ),
      fields.message(7, fields.varint(1, 11)), // create_content, not read
      fields.message(
        9,
        fields.message(
          1,
          fields.message(1, fields.string(3, "Guest")),
          fields.varint(2, 5), // linkmic_id, not read
          fields.string(3, "5"), // linkmic_id_str, not read
          fields.varint(4, 2),
          fields.varint(5, 1),
          fields.varint(6, 3),
          fields.varint(7, 1), // silence_status, not read
          fields.varint(10, 2),
        ),
        fields.varint(2, 1), // anchor_multi_live_enum, not read
      ),
      fields.message(
        10,
        fields.varint(1, 6_900_000_000_000_000_002n),
        fields.string(2, "5"), // linkmic_id_str, not read
        fields.varint(3, 11), // send_leave_uid, not read
        fields.varint(4, 2),
      ),
      fields.message(11, fields.varint(1, 11)), // cancel_content, not read
      fields.message(
        12,
        fields.varint(1, 6_900_000_000_000_000_001n),
        fields.varint(2, 2),
      ),
      fields.message(
        13,
        fields.message(1, fields.varint(4, 2), fields.varint(10, 1)),
        fields.message(1, fields.varint(4, 3)),
      ),
      fields.message(14, fields.varint(1, 11)), // update_user_content, not read
      fields.message(
        16,
        fields.varint(1, 6_900_000_000_000_000_002n),
        fields.varint(2, 1),
      ),
      fields.message(
        20,
        fields.message(
          1,
          fields.message(1, fields.string(3, "Linked")),
          fields.varint(2, 1_760_000_000_000), // modify_time, not read
          fields.varint(3, 1),
          fields.varint(4, 2),
          fields.string(5, "5"), // linkmic_id_str, not read
        ),
        fields.message(2, fields.message(1, fields.string(3, "Applied"))),
        fields.message(3, fields.message(1, fields.string(3, "Connecting"))),
      ),
      fields.message(21, fields.varint(1, 1)), // cohost_list_change_content, not read
      fields.message(
        22,
        fields.varint(1, 2),
        fields.varint(2, 6_900_000_000_000_000_002n),
        fields.varint(3, 6_900_000_000_000_000_001n), // anchor_id, not read
        fields.varint(5, 1), // change_scene, not read
      ),
      fields.string(200, "extra"), // extra, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastLinkMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      messageType: 1,
      linkerId: "7300000000000000001",
      scene: 4,
      inviteContent: {
        fromUserId: "6900000000000000001",
        fromUser: user("Inviter"),
      },
      replyContent: {
        replyStatus: 1,
        fromUser: user("Replier"),
        toUser: user("Invitee"),
      },
      enterContent: {
        linkedUsers: [
          {
            user: user("Guest"),
            linkStatus: 2,
            linkType: 1,
            userPosition: 3,
            roleType: 2,
          },
        ],
      },
      leaveContent: { userId: "6900000000000000002", leaveReason: 2 },
      kickOutContent: { fromUserId: "6900000000000000001", kickoutReason: 2 },
      linkedListChangeContent: {
        linkedUsers: [
          { linkStatus: 2, linkType: 0, userPosition: 0, roleType: 1 },
          { linkStatus: 3, linkType: 0, userPosition: 0, roleType: 0 },
        ],
      },
      muteContent: { userId: "6900000000000000002", muteStatus: 1 },
      listChangeContent: {
        linkedUsers: [{ user: user("Linked"), linkType: 1, roleType: 2 }],
        appliedUsers: [{ user: user("Applied"), linkType: 0, roleType: 0 }],
        connectingUsers: [
          { user: user("Connecting"), linkType: 0, roleType: 0 },
        ],
      },
      mediaChangeContent: { op: 2, toUserId: "6900000000000000002" },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      messageType: 0,
      linkerId: "0",
      scene: 0,
    });
    expect(
      decode(
        concat(
          fields.message(5),
          fields.message(6),
          fields.message(9, fields.message(1)),
          fields.message(10),
          fields.message(12),
          fields.message(13),
          fields.message(16),
          fields.message(20, fields.message(2)),
          fields.message(22),
        ),
      ),
    ).toStrictEqual({
      messageType: 0,
      linkerId: "0",
      scene: 0,
      inviteContent: { fromUserId: "0" },
      replyContent: { replyStatus: 0 },
      enterContent: {
        linkedUsers: [
          { linkStatus: 0, linkType: 0, userPosition: 0, roleType: 0 },
        ],
      },
      leaveContent: { userId: "0", leaveReason: 0 },
      kickOutContent: { fromUserId: "0", kickoutReason: 0 },
      linkedListChangeContent: { linkedUsers: [] },
      muteContent: { userId: "0", muteStatus: 0 },
      listChangeContent: {
        linkedUsers: [],
        appliedUsers: [{ linkType: 0, roleType: 0 }],
        connectingUsers: [],
      },
      mediaChangeContent: { op: 0, toUserId: "0" },
    });
  });

  it("round-trips every field through the encoder", () => {
    const link: LinkMessage = {
      common: sampleCommon("WebcastLinkMessage"),
      messageType: 7,
      linkerId: "7300000000000000001",
      scene: 4,
      inviteContent: {
        fromUserId: "6900000000000000001",
        fromUser: SAMPLE_USER,
      },
      replyContent: {
        replyStatus: 2,
        fromUser: SAMPLE_USER,
        toUser: { ...SAMPLE_USER, userId: "6900000000000000002" },
      },
      enterContent: {
        linkedUsers: [
          {
            user: SAMPLE_USER,
            linkStatus: 2,
            linkType: 1,
            userPosition: 3,
            roleType: 2,
          },
          { linkStatus: 1, linkType: 2, userPosition: 0, roleType: 4 },
        ],
      },
      leaveContent: { userId: "6900000000000000002", leaveReason: 99999 },
      kickOutContent: { fromUserId: "6900000000000000001", kickoutReason: 5 },
      linkedListChangeContent: {
        linkedUsers: [
          {
            user: SAMPLE_USER,
            linkStatus: 2,
            linkType: 1,
            userPosition: 1,
            roleType: 1,
          },
        ],
      },
      muteContent: { userId: "6900000000000000002", muteStatus: 1 },
      listChangeContent: {
        linkedUsers: [{ user: SAMPLE_USER, linkType: 1, roleType: 2 }],
        appliedUsers: [{ linkType: 2, roleType: 4 }],
        connectingUsers: [],
      },
      mediaChangeContent: { op: 4, toUserId: "6900000000000000002" },
    };
    expect(decode(encodeMessage(LinkMessageSchema, link))).toStrictEqual(link);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.varint(2, 3),
      fields.message(
        5,
        unknownFields(),
        fields.message(8, unknownFields(), fields.string(3, "Ann")),
      ),
      fields.message(6, unknownFields(), fields.varint(7, 2)),
      fields.message(
        9,
        unknownFields(),
        fields.message(
          1,
          unknownFields(),
          fields.message(1, unknownFields(), fields.string(3, "Bea")),
          fields.varint(6, 1),
        ),
      ),
      fields.message(10, unknownFields(), fields.varint(4, 1)),
      fields.message(12, unknownFields(), fields.varint(2, 1)),
      fields.message(
        13,
        unknownFields(),
        fields.message(1, unknownFields(), fields.varint(4, 2)),
      ),
      fields.message(16, unknownFields(), fields.varint(2, 1)),
      fields.message(
        20,
        unknownFields(),
        fields.message(
          3,
          unknownFields(),
          fields.message(1, unknownFields(), fields.string(3, "Cal")),
          fields.varint(4, 2),
        ),
      ),
      unknownFields(1_000),
      fields.message(22, unknownFields(), fields.varint(1, 3)),
    );
    expect(decode(bytes)).toStrictEqual({
      messageType: 3,
      linkerId: "0",
      scene: 0,
      inviteContent: { fromUserId: "0", fromUser: user("Ann") },
      replyContent: { replyStatus: 2 },
      enterContent: {
        linkedUsers: [
          {
            user: user("Bea"),
            linkStatus: 0,
            linkType: 0,
            userPosition: 1,
            roleType: 0,
          },
        ],
      },
      leaveContent: { userId: "0", leaveReason: 1 },
      kickOutContent: { fromUserId: "0", kickoutReason: 1 },
      linkedListChangeContent: {
        linkedUsers: [
          { linkStatus: 2, linkType: 0, userPosition: 0, roleType: 0 },
        ],
      },
      muteContent: { userId: "0", muteStatus: 1 },
      listChangeContent: {
        linkedUsers: [],
        appliedUsers: [],
        connectingUsers: [{ user: user("Cal"), linkType: 0, roleType: 2 }],
      },
      mediaChangeContent: { op: 3, toUserId: "0" },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 01", // message_type (2): 1
        "18 05", // linker_id (3): 5
        "20 04", // scene (4): 4
        "2a 08", // invite_content (5), 8 bytes
        "08 0b", //   from_user_id (1): 11
        "42 04", //   from_user (8), 4 bytes
        "1a 02 4a 6f", //     nickname (3): "Jo"
        "32 08", // reply_content (6), 8 bytes
        "38 01", //   reply_status (7): 1
        "4a 04", //   from_user (9), 4 bytes
        "1a 02 4a 6f", //     nickname (3): "Jo"
        "4a 08", // enter_content (9), 8 bytes
        "0a 06", //   linked_users (1), 6 bytes
        "20 02", //     link_status (4): 2, linked
        "30 01", //     user_position (6): 1
        "50 02", //     role_type (10): 2, player
        "52 04", // leave_content (10), 4 bytes
        "08 0b", //   user_id (1): 11
        "20 01", //   leave_reason (4): 1
        "62 04", // kick_out_content (12), 4 bytes
        "08 0b", //   from_user_id (1): 11
        "10 02", //   kickout_reason (2): 2, by the host
        "6a 04", // linked_list_change_content (13), 4 bytes
        "0a 02", //   linked_users (1), 2 bytes
        "28 01", //     link_type (5): 1, video
        "82 01 04", // mute_content (16), 4 bytes
        "08 0b", //   user_id (1): 11
        "10 01", //   mute_status (2): 1, unmuted
        "a2 01 0a", // list_change_content (20), 10 bytes
        "0a 04", //   linked_users (1), 4 bytes
        "18 01", //     link_type (3): 1
        "20 02", //     role_type (4): 2
        "12 00", //   applied_users (2), 0 bytes
        "1a 00", //   connecting_users (3), 0 bytes
        "b2 01 04", // media_change_content (22), 4 bytes
        "08 02", //   op (1): 2, close mic
        "10 0b", //   to_user_id (2): 11
      ].join(" "),
    );
    const link: LinkMessage = {
      messageType: 1,
      linkerId: "5",
      scene: 4,
      inviteContent: { fromUserId: "11", fromUser: user("Jo") },
      replyContent: { replyStatus: 1, fromUser: user("Jo") },
      enterContent: {
        linkedUsers: [
          { linkStatus: 2, linkType: 0, userPosition: 1, roleType: 2 },
        ],
      },
      leaveContent: { userId: "11", leaveReason: 1 },
      kickOutContent: { fromUserId: "11", kickoutReason: 2 },
      linkedListChangeContent: {
        linkedUsers: [
          { linkStatus: 0, linkType: 1, userPosition: 0, roleType: 0 },
        ],
      },
      muteContent: { userId: "11", muteStatus: 1 },
      listChangeContent: {
        linkedUsers: [{ linkType: 1, roleType: 2 }],
        appliedUsers: [{ linkType: 0, roleType: 0 }],
        connectingUsers: [{ linkType: 0, roleType: 0 }],
      },
      mediaChangeContent: { op: 2, toUserId: "11" },
    };
    expect(decode(bytes)).toStrictEqual(link);
    expect(toHex(encodeMessage(LinkMessageSchema, link))).toBe(toHex(bytes));
  });

  it("reads hand-assembled bytes with 64-bit ids, sign-extended int32s, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "b2 01 04", // media_change_content (22), 4 bytes
        "10 0b", //   to_user_id (2): 11
        "08 04", //   op (1): 4, close mic punish
        "3a 00", // create_content (7), not read, 0 bytes
        "18 81 80 e8 e2 aa ea b3 a7 65", // linker_id (3): 7300000000000000001
        "52 0d", // leave_content (10), 13 bytes
        "20 ff ff ff ff ff ff ff ff ff 01", //   leave_reason (4): -1
        "08 16", //   user_id (1): 22
        "4a 0e", // enter_content (9), 14 bytes
        "0a 0c", //   linked_users (1), 12 bytes
        "0a 0a", //     user (1), 10 bytes
        "08 81 80 c8 b1 93 ae ee e0 5f", //       id (1): 6900000000000000001
        "10 ff ff ff ff ff ff ff ff ff 01", // message_type (2): -1
        "c2 0c 01 78", // extra (200), not read: "x"
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      messageType: -1,
      linkerId: "7300000000000000001",
      scene: 0,
      enterContent: {
        linkedUsers: [
          {
            user: { ...user(""), userId: "6900000000000000001" },
            linkStatus: 0,
            linkType: 0,
            userPosition: 0,
            roleType: 0,
          },
        ],
      },
      leaveContent: { userId: "22", leaveReason: -1 },
      mediaChangeContent: { op: 4, toUserId: "11" },
    });
  });
});
