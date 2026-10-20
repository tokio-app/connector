import { describe, expect, it } from "vitest";
import type { LinkLayerMessage, Player } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LinkLayerMessageSchema } from "./linkLayer.js";
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

// Field numbers: WebcastLinkLayerMessage in
// webcast/model/message/linkcore_webcast_link_layer_message.proto; the
// contents, AllListUser and LinkLayerListUser in
// webcast/model/message/linkcore.proto; Player in
// webcast/model/message/linkcore_player.proto. The bytes are written field by
// field (fields.*) or by hand, not from the schema, so a wrong number in the
// table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(LinkLayerMessageSchema, bytes);

const player = (userId: string, roomId = "0"): Player => ({ roomId, userId });

describe("LinkLayerMessageSchema", () => {
  it("reads common (1), message_type (2), channel_id (3), scene (4), linker_mode (9), list_change_content (102), invite_content (103), apply_content (104), permit_apply_content (105), reply_invite_content (106), kick_out_content (107), leave_content (110) and finish_content (111)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastLinkLayerMessage")),
      fields.varint(2, 11),
      fields.varint(3, 7_200_000_000_000_000_001n),
      fields.varint(4, 4),
      fields.string(5, "app"), // source, not read
      fields.varint(8, 3), // version, not read
      fields.varint(9, 2),
      fields.varint(10, 1), // wait_cross_data, not read
      fields.message(100, fields.message(1, fields.varint(2, 11))), // create_channel_content, not read
      fields.message(
        102,
        fields.varint(1, 1),
        fields.message(
          2,
          fields.message(
            2,
            fields.message(
              1,
              fields.varint(1, 7_100_000_000_000_000_001n),
              fields.varint(2, 11),
            ),
            fields.string(2, "linkmic-11"),
            fields.message(3, fields.message(2, fields.varint(1, 1))), // pos, not read
            fields.varint(4, 1_760_000_000_000_000_000n), // linked_time_nano, not read
            fields.varint(6, 2),
          ),
          fields.message(3, fields.message(1, fields.varint(2, 22))),
          fields.message(4, fields.message(1, fields.varint(2, 33))),
          fields.message(5, fields.message(1, fields.varint(2, 44))),
        ),
        fields.string(3, "pos"), // linked_user_ui_positions, not read
      ),
      fields.message(
        103,
        fields.message(1, fields.varint(2, 11)),
        fields.message(2, fields.varint(4, 30)), // invitee_rtc_ext_info, not read
        fields.varint(5, 1), // is_owner, not read
        fields.message(8, fields.varint(2, 22)),
        fields.message(9, fields.varint(2, 11)), // operator, not read
      ),
      fields.message(
        104,
        fields.message(1, fields.varint(2, 22)),
        fields.string(2, "linkmic-22"), // applier_link_mic_id, not read
      ),
      fields.message(
        105,
        fields.message(1, fields.varint(2, 11)),
        fields.message(3, fields.varint(1, 1)), // applier_pos, not read
        fields.varint(4, 1),
        fields.message(6, fields.varint(2, 22)),
        fields.message(7, fields.varint(2, 11)), // operator, not read
      ),
      fields.message(
        106,
        fields.message(1, fields.varint(2, 22)),
        fields.varint(2, 2),
        fields.string(3, "linkmic-22"), // invitee_link_mic_id, not read
      ),
      fields.message(
        107,
        fields.message(1, fields.varint(2, 22)),
        fields.varint(2, 5),
        fields.string(3, "pos"), // linked_user_ui_positions, not read
      ),
      fields.message(108, fields.message(1, fields.varint(2, 22))), // cancel_apply_content, not read
      fields.message(
        110,
        fields.message(1, fields.varint(2, 22)),
        fields.varint(2, 3),
        fields.message(5, fields.string(1, "layout")), // layout, not read
      ),
      fields.message(
        111,
        fields.message(1, fields.varint(2, 11)),
        fields.varint(2, 1),
      ),
      fields.message(200, fields.message(1)), // business_content, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastLinkLayerMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      messageType: 11,
      channelId: "7200000000000000001",
      scene: 4,
      linkerMode: 2,
      listChangeContent: {
        type: 1,
        list: {
          linkedList: [
            {
              user: player("11", "7100000000000000001"),
              linkmicId: "linkmic-11",
              userType: 2,
            },
          ],
          appliedList: [{ user: player("22"), linkmicId: "", userType: 0 }],
          invitedList: [{ user: player("33"), linkmicId: "", userType: 0 }],
          readyList: [{ user: player("44"), linkmicId: "", userType: 0 }],
        },
      },
      inviteContent: { invitor: player("11"), invitee: player("22") },
      applyContent: { applier: player("22") },
      permitApplyContent: {
        permiter: player("11"),
        replyStatus: 1,
        applier: player("22"),
      },
      replyInviteContent: { invitee: player("22"), replyStatus: 2 },
      kickOutContent: { offliner: player("22"), kickoutReason: 5 },
      leaveContent: { leaver: player("22"), leaveReason: 3 },
      finishContent: { owner: player("11"), finishReason: 1 },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      messageType: 0,
      channelId: "0",
      scene: 0,
      linkerMode: 0,
    });
    expect(
      decode(
        concat(
          fields.message(102, fields.message(2, fields.message(4))),
          fields.message(103),
          fields.message(104, fields.message(1)),
          fields.message(105),
          fields.message(106),
          fields.message(107),
          fields.message(110),
          fields.message(111),
        ),
      ),
    ).toStrictEqual({
      messageType: 0,
      channelId: "0",
      scene: 0,
      linkerMode: 0,
      listChangeContent: {
        type: 0,
        list: {
          linkedList: [],
          appliedList: [],
          invitedList: [{ linkmicId: "", userType: 0 }],
          readyList: [],
        },
      },
      inviteContent: {},
      applyContent: { applier: player("0") },
      permitApplyContent: { replyStatus: 0 },
      replyInviteContent: { replyStatus: 0 },
      kickOutContent: { kickoutReason: 0 },
      leaveContent: { leaveReason: 0 },
      finishContent: { finishReason: 0 },
    });
  });

  it("round-trips every field through the encoder", () => {
    const host = player("6900000000000000001", "7100000000000000001");
    const guest = player("6900000000000000002", "7100000000000000002");
    const layer: LinkLayerMessage = {
      common: sampleCommon("WebcastLinkLayerMessage"),
      messageType: 18,
      channelId: "7200000000000000001",
      scene: 2,
      linkerMode: 3,
      listChangeContent: {
        type: 2,
        list: {
          linkedList: [
            { user: host, linkmicId: "linkmic-1", userType: 2 },
            { user: guest, linkmicId: "linkmic-2", userType: 1 },
          ],
          appliedList: [{ linkmicId: "", userType: 0 }],
          invitedList: [],
          readyList: [{ user: guest, linkmicId: "linkmic-2", userType: 1 }],
        },
      },
      inviteContent: { invitor: host, invitee: guest },
      applyContent: { applier: guest },
      permitApplyContent: { permiter: host, replyStatus: 2, applier: guest },
      replyInviteContent: { invitee: guest, replyStatus: 1 },
      kickOutContent: { offliner: guest, kickoutReason: 7 },
      leaveContent: { leaver: guest, leaveReason: 99999 },
      finishContent: { owner: host, finishReason: 99999 },
    };
    expect(decode(encodeMessage(LinkLayerMessageSchema, layer))).toStrictEqual(
      layer,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.varint(2, 9),
      fields.message(
        102,
        unknownFields(),
        fields.message(
          2,
          unknownFields(),
          fields.message(
            5,
            unknownFields(),
            fields.message(1, unknownFields(), fields.varint(2, 11)),
          ),
        ),
      ),
      fields.message(
        103,
        unknownFields(),
        fields.message(8, unknownFields(), fields.varint(2, 22)),
      ),
      fields.message(104, unknownFields(), fields.message(1, unknownFields())),
      fields.message(105, unknownFields(), fields.varint(4, 1)),
      fields.message(106, unknownFields(), fields.varint(2, 2)),
      fields.message(107, unknownFields(), fields.varint(2, 3)),
      fields.message(110, unknownFields(), fields.varint(2, 4)),
      unknownFields(1_000),
      fields.message(
        111,
        unknownFields(),
        fields.message(1, unknownFields(), fields.varint(1, 7)),
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      messageType: 9,
      channelId: "0",
      scene: 0,
      linkerMode: 0,
      listChangeContent: {
        type: 0,
        list: {
          linkedList: [],
          appliedList: [],
          invitedList: [],
          readyList: [{ user: player("11"), linkmicId: "", userType: 0 }],
        },
      },
      inviteContent: { invitee: player("22") },
      applyContent: { applier: player("0") },
      permitApplyContent: { replyStatus: 1 },
      replyInviteContent: { replyStatus: 2 },
      kickOutContent: { kickoutReason: 3 },
      leaveContent: { leaveReason: 4 },
      finishContent: { owner: player("0", "7"), finishReason: 0 },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 02", // message_type (2): 2, invite
        "18 01", // channel_id (3): 1
        "20 04", // scene (4): 4, multi-guest
        "48 01", // linker_mode (9): 1, inner
        "b2 06 12", // list_change_content (102), 18 bytes
        "08 01", //   type (1): 1
        "12 0e", //   list (2), 14 bytes
        "12 0c", //     linked_list (2), 12 bytes
        "0a 04", //       user (1), 4 bytes
        "08 01", //         room_id (1): 1
        "10 0b", //         user_id (2): 11
        "12 02 6c 31", //       linkmic_id (2): "l1"
        "30 02", //       user_type (6): 2, host
        "ba 06 08", // invite_content (103), 8 bytes
        "0a 02", //   invitor (1), 2 bytes
        "10 0b", //     user_id (2): 11
        "42 02", //   invitee (8), 2 bytes
        "10 16", //     user_id (2): 22
        "c2 06 04", // apply_content (104), 4 bytes
        "0a 02", //   applier (1), 2 bytes
        "10 16", //     user_id (2): 22
        "ca 06 0a", // permit_apply_content (105), 10 bytes
        "0a 02", //   permiter (1), 2 bytes
        "10 0b", //     user_id (2): 11
        "20 01", //   reply_status (4): 1, agree
        "32 02", //   applier (6), 2 bytes
        "10 16", //     user_id (2): 22
        "d2 06 06", // reply_invite_content (106), 6 bytes
        "0a 02", //   invitee (1), 2 bytes
        "10 16", //     user_id (2): 22
        "10 02", //   reply_status (2): 2, reject
        "da 06 06", // kick_out_content (107), 6 bytes
        "0a 02", //   offliner (1), 2 bytes
        "10 16", //     user_id (2): 22
        "10 02", //   kickout_reason (2): 2, by the host
        "f2 06 06", // leave_content (110), 6 bytes
        "0a 02", //   leaver (1), 2 bytes
        "10 16", //     user_id (2): 22
        "10 01", //   leave_reason (2): 1
        "fa 06 06", // finish_content (111), 6 bytes
        "0a 02", //   owner (1), 2 bytes
        "10 0b", //     user_id (2): 11
        "10 01", //   finish_reason (2): 1
      ].join(" "),
    );
    const layer: LinkLayerMessage = {
      messageType: 2,
      channelId: "1",
      scene: 4,
      linkerMode: 1,
      listChangeContent: {
        type: 1,
        list: {
          linkedList: [
            { user: player("11", "1"), linkmicId: "l1", userType: 2 },
          ],
          appliedList: [],
          invitedList: [],
          readyList: [],
        },
      },
      inviteContent: { invitor: player("11"), invitee: player("22") },
      applyContent: { applier: player("22") },
      permitApplyContent: {
        permiter: player("11"),
        replyStatus: 1,
        applier: player("22"),
      },
      replyInviteContent: { invitee: player("22"), replyStatus: 2 },
      kickOutContent: { offliner: player("22"), kickoutReason: 2 },
      leaveContent: { leaver: player("22"), leaveReason: 1 },
      finishContent: { owner: player("11"), finishReason: 1 },
    };
    expect(decode(bytes)).toStrictEqual(layer);
    expect(toHex(encodeMessage(LinkLayerMessageSchema, layer))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a 64-bit id, a negative count, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "fa 06 0d", // finish_content (111), 13 bytes
        "10 ff ff ff ff ff ff ff ff ff 01", //   finish_reason (2): -1
        "0a 00", //   owner (1), 0 bytes
        "2a 03 61 70 70", // source (5), not read: "app"
        "18 81 80 c0 f6 a4 bb e2 f5 63", // channel_id (3): 7200000000000000001
        "c2 0c 00", // business_content (200), not read, 0 bytes
        "b2 06 06", // list_change_content (102), 6 bytes
        "12 04", //   list (2), 4 bytes
        "2a 00", //     ready_list (5), 0 bytes
        "1a 00", //     applied_list (3), 0 bytes
        "10 0a", // message_type (2): 10, finish
        "a2 06 00", // create_channel_content (100), not read, 0 bytes
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      messageType: 10,
      channelId: "7200000000000000001",
      scene: 0,
      linkerMode: 0,
      listChangeContent: {
        type: 0,
        list: {
          linkedList: [],
          appliedList: [{ linkmicId: "", userType: 0 }],
          invitedList: [],
          readyList: [{ linkmicId: "", userType: 0 }],
        },
      },
      finishContent: { owner: player("0"), finishReason: -1 },
    });
  });
});
