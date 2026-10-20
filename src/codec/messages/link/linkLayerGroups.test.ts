import { describe, expect, it } from "vitest";
import {
  GroupJoinType,
  GroupStatus,
  type GroupChannelAllUser,
  type GroupChannelUser,
  type LinkLayerMessage,
} from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LinkLayerMessageSchema } from "./linkLayer.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../../test/helpers/encoder.js";
import { unknownFields } from "../../../../test/helpers/samples.js";

// The group contents of WebcastLinkLayerMessage (113–120, in
// webcast/model/message/linkcore_webcast_link_layer_message.proto): the
// contents in webcast/im.proto, GroupPlayer, GroupStatus and JoinType in
// webcast/linkmic/common.proto, GroupChannelUser in
// webcast/linkmic/common_group_channel_user.proto, GroupChannelAllUser in
// webcast/linkmic/common_group_channel_all_user.proto. The rest of the table
// is in linkLayer.test.ts. The bytes are written field by field (fields.*) or
// by hand, not from the schema, with made-up values: a wrong number in the
// table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(LinkLayerMessageSchema, bytes);

/** What a message without its top-level fields decodes them to. */
const TOP = { messageType: 0, channelId: "0", scene: 0, linkerMode: 0 };

const EMPTY_LISTS = {
  linkedList: [],
  appliedList: [],
  invitedList: [],
  readyList: [],
};

/** A participant's channel, written field by field. */
function channelBytes(room: number, user: number, owner: number): Uint8Array {
  return concat(
    fields.varint(1, room),
    fields.varint(2, 3),
    fields.varint(3, 102),
    fields.message(
      4,
      fields.message(
        2,
        fields.message(1, fields.varint(1, room), fields.varint(2, user)),
        fields.string(2, `l${room}`),
        fields.message(3), // pos, not read
        fields.varint(4, 1_000), // linked_time_nano, not read
        fields.varint(6, 2),
      ),
    ),
    fields.varint(5, 1_760_000_000_000_000_000n),
    fields.varint(6, 1_760_000_000_500_000_000n),
    fields.message(
      7,
      fields.varint(1, owner),
      fields.message(2, fields.varint(1, owner)),
    ),
    fields.string(8, `9_${room}_g`),
  );
}

/** What {@link channelBytes} decodes to. */
function channel(room: number, user: number, owner: number): GroupChannelUser {
  return {
    channelId: String(room),
    status: 3,
    type: 102,
    allUser: {
      ...EMPTY_LISTS,
      linkedList: [
        {
          user: { roomId: String(room), userId: String(user) },
          linkmicId: `l${room}`,
          userType: 2,
        },
      ],
    },
    joinTime: "1760000000000000000",
    linkedTime: "1760000000500000000",
    ownerUser: {
      channelId: String(owner),
      user: { roomId: String(owner), userId: "0" },
    },
    groupLinkmicId: `9_${room}_g`,
  };
}

/** A group of two channels, written field by field, and what it decodes to. */
const GROUP_BYTES = concat(
  fields.varint(1, 9),
  fields.message(2, channelBytes(11, 101, 22)),
  fields.message(2, channelBytes(22, 202, 22)),
  fields.varint(3, 1_760_000_000_123),
);
const GROUP: GroupChannelAllUser = {
  groupChannelId: "9",
  user: [channel(11, 101, 22), channel(22, 202, 22)],
  contentVersion: 1_760_000_000_123,
};

const groupPlayer = (no: number, room: number, user: number) =>
  fields.message(
    no,
    fields.varint(1, room),
    fields.message(2, fields.varint(1, room), fields.varint(2, user)),
  );
const player = (room: number, user: number) => ({
  channelId: String(room),
  user: { roomId: String(room), userId: String(user) },
});

describe("GroupStatus and GroupJoinType", () => {
  it("have the values of webcast.linkmic.common.GroupStatus and JoinType", () => {
    expect(GroupStatus).toEqual({ UNKNOWN: 0, WAITING: 1, LINKED: 3 });
    expect(GroupJoinType).toEqual({
      UNKNOWN: 0,
      CHANNEL_APPLY: 1,
      CHANNEL_INVITE: 2,
      GROUP_APPLY: 100,
      GROUP_APPLY_FOLLOW: 101,
      GROUP_INVITE: 102,
      GROUP_INVITE_FOLLOW: 103,
      GROUP_OWNER_JOIN: 104,
    });
    expect(Object.isFrozen(GroupStatus)).toBe(true);
    expect(Object.isFrozen(GroupJoinType)).toBe(true);
  });
});

describe("LinkLayerMessageSchema's group change (118)", () => {
  it("reads group_change_content (118): group_user (1) with group_channel_id (1), user (2) and content_version (3), and linked_user_ui_positions (2)", () => {
    const bytes = concat(
      fields.varint(2, 18),
      fields.message(
        118,
        fields.message(1, GROUP_BYTES),
        fields.string(2, "1"),
        fields.string(2, "2"),
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      ...TOP,
      messageType: 18,
      groupChangeContent: {
        groupUser: GROUP,
        linkedUserUiPositions: ["1", "2"],
      },
    });
  });

  it("skips fields it doesn't read, of every wire type, at every level of a group", () => {
    const bytes = fields.message(
      118,
      unknownFields(),
      fields.message(
        1,
        unknownFields(),
        fields.message(
          2,
          unknownFields(),
          fields.message(
            4,
            unknownFields(),
            fields.message(
              2,
              unknownFields(),
              fields.message(1, unknownFields(), fields.varint(2, 101)),
            ),
          ),
          fields.message(
            7,
            unknownFields(),
            fields.message(2, unknownFields(), fields.varint(1, 22)),
          ),
        ),
      ),
      unknownFields(1_000),
    );
    expect(decode(bytes).groupChangeContent).toStrictEqual({
      groupUser: {
        groupChannelId: "0",
        user: [
          {
            channelId: "0",
            status: 0,
            type: 0,
            allUser: {
              ...EMPTY_LISTS,
              linkedList: [
                {
                  user: { roomId: "0", userId: "101" },
                  linkmicId: "",
                  userType: 0,
                },
              ],
            },
            joinTime: "0",
            linkedTime: "0",
            ownerUser: { channelId: "0", user: { roomId: "22", userId: "0" } },
            groupLinkmicId: "",
          },
        ],
        contentVersion: 0,
      },
      linkedUserUiPositions: [],
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "b2 07 31", // group_change_content (118), 49 bytes
        "0a 2c", //   group_user (1), 44 bytes
        "08 07", //     group_channel_id (1): 7
        "12 26", //     user (2), 38 bytes
        "08 01", //       channel_id (1): 1
        "10 03", //       status (2): 3, linked
        "18 68", //       type (3): 104, the group's owner
        "22 0d", //       all_user (4), 13 bytes
        "12 0b", //         linked_list (2), 11 bytes
        "0a 04 08 01 10 65", //           user (1): room 1, user 101
        "12 01 6c", //           linkmic_id (2): "l"
        "30 02", //           user_type (6): 2, the host
        "28 e8 07", //       join_time (5): 1000
        "30 e9 07", //       linked_time (6): 1001
        "3a 06", //       owner_user (7), 6 bytes
        "08 01", //         channel_id (1): 1
        "12 02 08 01", //         user (2): room 1
        "42 01 67", //       group_linkmic_id (8): "g"
        "18 05", //     content_version (3): 5
        "12 01 70", //   linked_user_ui_positions (2): "p"
      ].join(" "),
    );
    const message: LinkLayerMessage = {
      ...TOP,
      groupChangeContent: {
        groupUser: {
          groupChannelId: "7",
          user: [
            {
              channelId: "1",
              status: 3,
              type: 104,
              allUser: {
                ...EMPTY_LISTS,
                linkedList: [
                  {
                    user: { roomId: "1", userId: "101" },
                    linkmicId: "l",
                    userType: 2,
                  },
                ],
              },
              joinTime: "1000",
              linkedTime: "1001",
              ownerUser: { channelId: "1", user: { roomId: "1", userId: "0" } },
              groupLinkmicId: "g",
            },
          ],
          contentVersion: 5,
        },
        linkedUserUiPositions: ["p"],
      },
    };
    expect(decode(bytes)).toStrictEqual(message);
    expect(toHex(encodeMessage(LinkLayerMessageSchema, message))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with 64-bit values, sign-extended enums, a negative version and fields out of order", () => {
    const bytes = fromHex(
      [
        "a2 07 0d", // leave_group_content (116), 13 bytes
        "1a 01 73", //   leave_source (3): "s"
        "10 81 80 c0 f6 a4 bb e2 f5 63", //   group_channel_id (2): 7200000000000000001
        "b2 07 30", // group_change_content (118), 48 bytes
        "0a 2e", //   group_user (1), 46 bytes
        "18 ff ff ff ff ff ff ff ff ff 01", //     content_version (3): -1
        "12 1f", //     user (2), 31 bytes
        "28 c0 a9 93 e0 cd d5 b1 b6 18", //       join_time (5): 1760000000123000000
        "10 ff ff ff ff ff ff ff ff ff 01", //       status (2): -1
        "08 82 80 a8 82 bb 85 98 8b 63", //       channel_id (1): 7140000000000000002
        "08 07", //     group_channel_id (1): 7
        "79 01 00 00 00 00 00 00 00", // field 15, fixed64, not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      ...TOP,
      leaveGroupContent: {
        groupChannelId: "7200000000000000001",
        leaveSource: "s",
        linkedUserUiPositions: [],
      },
      groupChangeContent: {
        groupUser: {
          groupChannelId: "7",
          user: [
            {
              channelId: "7140000000000000002",
              status: -1,
              type: 0,
              joinTime: "1760000000123000000",
              linkedTime: "0",
              groupLinkmicId: "",
            },
          ],
          contentVersion: -1,
        },
        linkedUserUiPositions: [],
      },
    });
  });
});

describe("LinkLayerMessageSchema's other group contents (113–117, 119, 120)", () => {
  it("reads the other group contents (113–117, 119, 120) next to the fields it doesn't read", () => {
    const bytes = concat(
      fields.message(
        113,
        fields.message(1, GROUP_BYTES),
        groupPlayer(2, 33, 303),
        fields.varint(3, 100),
        fields.message(4, fields.string(1, "rtc")), // group_ext_info, not read
      ),
      fields.message(
        114,
        groupPlayer(1, 22, 202),
        fields.varint(2, 1),
        fields.varint(3, 101),
        fields.message(4, fields.string(1, "rtc")), // group_ext_info, not read
        fields.message(5, GROUP_BYTES),
        fields.message(6, fields.varint(1, 1)), // migration_details, not read
        fields.string(7, "3"),
        fields.varint(8, 2), // permit_group_type, not read
      ),
      fields.message(
        115,
        groupPlayer(1, 33, 303),
        groupPlayer(1, 44, 404),
        groupPlayer(2, 22, 202),
        fields.varint(3, 103),
        fields.message(4, GROUP_BYTES),
      ),
      fields.message(
        116,
        groupPlayer(1, 11, 101),
        fields.varint(2, 9),
        fields.string(3, "user_leave"),
        fields.string(4, "1"),
      ),
      fields.message(
        117,
        fields.message(1, fields.string(1, "rtc")), // group_ext_info, not read
        fields.message(2, GROUP_BYTES),
        fields.message(5, fields.varint(1, 1)), // cross_room_layout, not read
      ),
      fields.message(
        119,
        fields.message(1, fields.string(1, "rtc")), // group_ext_info, not read
        fields.message(2, GROUP_BYTES),
      ),
      fields.message(
        120,
        fields.message(1, fields.varint(1, 55), fields.varint(2, 505)),
        fields.string(2, "lm55"),
        fields.message(3, fields.string(1, "rtc")), // joiner_ext_info, not read
        fields.message(4, fields.varint(1, 1)), // layout, not read
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      ...TOP,
      joinGroupContent: {
        groupUser: GROUP,
        joinUser: player(33, 303),
        type: 100,
      },
      permitGroupContent: {
        approver: player(22, 202),
        agreeStatus: 1,
        type: 101,
        groupUser: GROUP,
        linkedUserUiPositions: ["3"],
      },
      cancelGroupContent: {
        leaver: [player(33, 303), player(44, 404)],
        operator: player(22, 202),
        type: 103,
        groupUser: GROUP,
      },
      leaveGroupContent: {
        operator: player(11, 101),
        groupChannelId: "9",
        leaveSource: "user_leave",
        linkedUserUiPositions: ["1"],
      },
      p2pGroupChangeContent: { groupUser: GROUP },
      joinGroupDirectContent: { groupUser: GROUP },
      joinRoomDirectContent: {
        joiner: { roomId: "55", userId: "505" },
        joinerLinkMicId: "lm55",
      },
    });
  });

  it("leaves out what the group contents leave out", () => {
    expect(
      decode(
        concat(
          fields.message(113),
          fields.message(114),
          fields.message(115),
          fields.message(116),
          fields.message(117),
          fields.message(
            118,
            fields.message(1, fields.message(2, fields.message(4))),
          ),
          fields.message(
            119,
            fields.message(2, fields.message(2, fields.message(7))),
          ),
          fields.message(120),
        ),
      ),
    ).toStrictEqual({
      ...TOP,
      joinGroupContent: { type: 0 },
      permitGroupContent: {
        agreeStatus: 0,
        type: 0,
        linkedUserUiPositions: [],
      },
      cancelGroupContent: { leaver: [], type: 0 },
      leaveGroupContent: {
        groupChannelId: "0",
        leaveSource: "",
        linkedUserUiPositions: [],
      },
      p2pGroupChangeContent: {},
      groupChangeContent: {
        groupUser: {
          groupChannelId: "0",
          user: [
            {
              channelId: "0",
              status: 0,
              type: 0,
              allUser: EMPTY_LISTS,
              joinTime: "0",
              linkedTime: "0",
              groupLinkmicId: "",
            },
          ],
          contentVersion: 0,
        },
        linkedUserUiPositions: [],
      },
      joinGroupDirectContent: {
        groupUser: {
          groupChannelId: "0",
          user: [
            {
              channelId: "0",
              status: 0,
              type: 0,
              joinTime: "0",
              linkedTime: "0",
              ownerUser: { channelId: "0" },
              groupLinkmicId: "",
            },
          ],
          contentVersion: 0,
        },
      },
      joinRoomDirectContent: { joinerLinkMicId: "" },
    });
  });

  it("round-trips every group content through the encoder", () => {
    const message: LinkLayerMessage = {
      ...TOP,
      messageType: 18,
      channelId: "7140000000000000001",
      joinGroupContent: {
        groupUser: GROUP,
        joinUser: player(33, 303),
        type: 100,
      },
      permitGroupContent: {
        approver: player(22, 202),
        agreeStatus: 2,
        type: 101,
        groupUser: GROUP,
        linkedUserUiPositions: ["1", "2"],
      },
      cancelGroupContent: {
        leaver: [player(33, 303)],
        operator: player(22, 202),
        type: 103,
        groupUser: GROUP,
      },
      leaveGroupContent: {
        operator: player(11, 101),
        groupChannelId: "9",
        leaveSource: "user_leave",
        linkedUserUiPositions: ["1"],
      },
      p2pGroupChangeContent: { groupUser: GROUP },
      groupChangeContent: { groupUser: GROUP, linkedUserUiPositions: ["2"] },
      joinGroupDirectContent: { groupUser: GROUP },
      joinRoomDirectContent: {
        joiner: { roomId: "55", userId: "505" },
        joinerLinkMicId: "lm55",
      },
    };
    expect(
      decode(encodeMessage(LinkLayerMessageSchema, message)),
    ).toStrictEqual(message);
  });
});
