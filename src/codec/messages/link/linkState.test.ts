import { describe, expect, it } from "vitest";
import type { LinkStateMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LinkStateMessageSchema } from "./linkState.js";
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

// Field numbers: WebcastLinkStateMessage in webcast/im.proto; LinkUserState
// in webcast/linkmic/common.proto; Player, MicPositionData and LinkPosition
// in webcast/model/message/linkcore_*.proto. The bytes are written field by
// field (fields.*) or by hand, not from the schema, so a wrong number in the
// table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(LinkStateMessageSchema, bytes);

describe("LinkStateMessageSchema", () => {
  it("reads common (1), channel_id (2), scene (3), user_states (7: user 1, linkmic_id 2, pos 3, online_user_state 5, audio_muted 6, video_muted 7) and state_type (9)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastLinkStateMessage")),
      fields.varint(2, 7_200_000_000_000_000_001n),
      fields.varint(3, 4),
      fields.varint(4, 7), // version, not read
      fields.varint(5, 1), // need_ack, not read
      fields.message(6, fields.string(1, "layout")), // layout, not read
      fields.message(
        7,
        fields.message(
          1,
          fields.varint(1, 7_100_000_000_000_000_001n),
          fields.varint(2, 6_900_000_000_000_000_001n),
        ),
        fields.string(2, "linkmic-1"),
        fields.message(
          3,
          fields.varint(1, 1), // type, not read
          fields.message(2, fields.varint(1, 2), fields.varint(2, 1)), // opt (2), not read
        ),
        fields.varint(4, 1_760_000_000_000_000_000n), // linked_time_nano, not read
        fields.varint(5, 1),
        fields.varint(6, 2),
        fields.varint(7, 1),
        fields.varint(8, 1), // rtc_connection, not read
        fields.varint(9, 2), // network_state, not read
      ),
      fields.message(7, fields.varint(5, 2)),
      fields.varint(8, 1_760_000_000_000), // client_send_time, not read
      fields.varint(9, 3),
      fields.message(10, fields.string(1, "sticker")), // background, not read
      fields.varint(16, 1), // linker_mode, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastLinkStateMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      channelId: "7200000000000000001",
      scene: 4,
      userStates: [
        {
          user: {
            roomId: "7100000000000000001",
            userId: "6900000000000000001",
          },
          linkmicId: "linkmic-1",
          pos: { link: { position: 2 } },
          onlineUserState: 1,
          audioMuted: 2,
          videoMuted: 1,
        },
        { linkmicId: "", onlineUserState: 2, audioMuted: 0, videoMuted: 0 },
      ],
      stateType: 3,
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      channelId: "0",
      scene: 0,
      userStates: [],
      stateType: 0,
    });
    expect(
      decode(
        concat(
          fields.message(7),
          fields.message(7, fields.message(1), fields.message(3)),
          fields.message(7, fields.message(3, fields.message(2))),
        ),
      ).userStates,
    ).toStrictEqual([
      { linkmicId: "", onlineUserState: 0, audioMuted: 0, videoMuted: 0 },
      {
        user: { roomId: "0", userId: "0" },
        linkmicId: "",
        pos: {},
        onlineUserState: 0,
        audioMuted: 0,
        videoMuted: 0,
      },
      {
        linkmicId: "",
        pos: { link: { position: 0 } },
        onlineUserState: 0,
        audioMuted: 0,
        videoMuted: 0,
      },
    ]);
  });

  it("round-trips every field through the encoder", () => {
    const state: LinkStateMessage = {
      common: sampleCommon("WebcastLinkStateMessage"),
      channelId: "7200000000000000001",
      scene: 2,
      userStates: [
        {
          user: {
            roomId: "7100000000000000001",
            userId: "6900000000000000001",
          },
          linkmicId: "linkmic-1",
          pos: { link: { position: 1 } },
          onlineUserState: 1,
          audioMuted: 1,
          videoMuted: 2,
        },
        {
          user: {
            roomId: "7100000000000000002",
            userId: "6900000000000000002",
          },
          linkmicId: "linkmic-2",
          onlineUserState: 2,
          audioMuted: 4,
          videoMuted: 3,
        },
      ],
      stateType: 100,
    };
    expect(decode(encodeMessage(LinkStateMessageSchema, state))).toStrictEqual(
      state,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.varint(2, 1),
      fields.message(
        7,
        unknownFields(),
        fields.message(1, unknownFields(), fields.varint(2, 11)),
        fields.message(
          3,
          unknownFields(),
          fields.message(2, unknownFields(), fields.varint(1, 3)),
        ),
        fields.varint(6, 2),
      ),
      unknownFields(1_000),
      fields.varint(9, 1),
    );
    expect(decode(bytes)).toStrictEqual({
      channelId: "1",
      scene: 0,
      userStates: [
        {
          user: { roomId: "0", userId: "11" },
          linkmicId: "",
          pos: { link: { position: 3 } },
          onlineUserState: 0,
          audioMuted: 2,
          videoMuted: 0,
        },
      ],
      stateType: 1,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 01", // channel_id (2): 1
        "18 04", // scene (3): 4, multi-guest
        "3a 16", // user_states (7), 22 bytes
        "0a 04", //   user (1), 4 bytes
        "08 01", //     room_id (1): 1
        "10 0b", //     user_id (2): 11
        "12 02 6c 31", //   linkmic_id (2): "l1"
        "1a 04", //   pos (3), 4 bytes
        "12 02", //     link (2), 2 bytes
        "08 02", //       position (1): 2
        "28 01", //   online_user_state (5): 1, online
        "30 02", //   audio_muted (6): 2, muted
        "38 01", //   video_muted (7): 1, on
        "48 03", // state_type (9): 3, audio mute
      ].join(" "),
    );
    const state: LinkStateMessage = {
      channelId: "1",
      scene: 4,
      userStates: [
        {
          user: { roomId: "1", userId: "11" },
          linkmicId: "l1",
          pos: { link: { position: 2 } },
          onlineUserState: 1,
          audioMuted: 2,
          videoMuted: 1,
        },
      ],
      stateType: 3,
    };
    expect(decode(bytes)).toStrictEqual(state);
    expect(toHex(encodeMessage(LinkStateMessageSchema, state))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with 64-bit ids, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "48 64", // state_type (9): 100, a batch
        "3a 0e", // user_states (7), 14 bytes
        "38 02", //   video_muted (7): 2, muted
        "0a 0a", //   user (1), 10 bytes
        "10 81 80 c8 b1 93 ae ee e0 5f", //     user_id (2): 6900000000000000001
        "20 01", // version (4), not read
        "10 81 80 c0 f6 a4 bb e2 f5 63", // channel_id (2): 7200000000000000001
        "3a 00", // user_states (7), 0 bytes
        "32 00", // layout (6), not read, 0 bytes
        "18 02", // scene (3): 2, co-host
        "80 01 01", // linker_mode (16), not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      channelId: "7200000000000000001",
      scene: 2,
      userStates: [
        {
          user: { roomId: "0", userId: "6900000000000000001" },
          linkmicId: "",
          onlineUserState: 0,
          audioMuted: 0,
          videoMuted: 2,
        },
        { linkmicId: "", onlineUserState: 0, audioMuted: 0, videoMuted: 0 },
      ],
      stateType: 100,
    });
  });
});
