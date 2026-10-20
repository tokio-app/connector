import { describe, expect, it } from "vitest";
import {
  GameRankMsgType,
  OfflineType,
  PartnershipChangeMode,
} from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import type { MessageSchema } from "../../schema.js";
import {
  AccessControlMessageSchema,
  AccessRecallMessageSchema,
  CapsuleMessageSchema,
  GameRankNotifyMessageSchema,
  InRoomBannerMessageSchema,
  LiveGameIntroMessageSchema,
  MarqueeAnnouncementMessageSchema,
  PartnershipDropsUpdateMessageSchema,
  PartnershipGameOfflineMessageSchema,
  PartnershipPunishMessageSchema,
  SpeakerMessageSchema,
} from "./tail.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../../test/helpers/encoder.js";
import { unknownFields } from "../../../../test/helpers/samples.js";

// Field numbers: the messages in webcast/model/message/messages.proto
// (WebcastAccessRecallMessage in webcast/model/game.proto); the enums in
// webcast/im.proto. The bytes are written by hand, not from the schema, so a
// wrong number in a table fails here.

const EMPTY_PUNISH = {
  punishType: "",
  punishReason: "",
  punishId: "",
  punishTypeId: 0,
  duration: 0,
  endTime: "0",
  showReason: "",
};

interface TailCase {
  schema: MessageSchema<object>;
  /** Hand-assembled bytes, with the field numbers of the .proto. */
  hex: string[];
  /** What `hex` decodes to, and what the encoder writes `hex` from. */
  expected: object;
  /** What an empty message decodes to. */
  defaults: object;
}

const CASES: TailCase[] = [
  {
    schema: GameRankNotifyMessageSchema,
    hex: [
      "10 ff 01", // msg_type (2): 255, unknown
      "1a 03", // notify_text (3), 3 bytes
      "0a 01 6b", //   key (1): "k"
    ],
    expected: { msgType: 255, notifyText: { key: "k", defaultPattern: "" } },
    defaults: { msgType: 0 },
  },
  {
    schema: CapsuleMessageSchema,
    hex: [
      "1a 03", // desc (3), 3 bytes
      "0a 01 6b", //   key (1): "k"
      "30 02", // type (6): 2
      "3a 01 73", // scene (7): "s"
      "4a 02 73 73", // sub_scene (9): "ss"
    ],
    expected: {
      desc: { key: "k", defaultPattern: "" },
      type: 2,
      scene: "s",
      subScene: "ss",
    },
    defaults: { type: 0, scene: "", subScene: "" },
  },
  {
    schema: MarqueeAnnouncementMessageSchema,
    hex: [
      "12 02 6d 73", // message_scene (2): "ms"
    ],
    expected: { messageScene: "ms" },
    defaults: { messageScene: "" },
  },
  {
    schema: SpeakerMessageSchema,
    hex: [
      "0a 02", // common (1), 2 bytes
      "30 01", //   is_show_msg (6): true
    ],
    expected: {
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: true,
      },
    },
    defaults: {},
  },
  {
    schema: InRoomBannerMessageSchema,
    hex: [
      "0a 03", // common (1), 3 bytes
      "20 e8 07", //   create_time (4): 1000
    ],
    expected: {
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: false,
      },
    },
    defaults: {},
  },
  {
    schema: AccessControlMessageSchema,
    hex: [
      "12 06", // captcha (2), 6 bytes
      "08 05", //   captcha_record_id (1): 5
      "10 07", //   room_id (2): 7
      "18 1e", //   verify_duration_in_sec (3): 30
    ],
    expected: {
      captcha: { captchaRecordId: "5", roomId: "7", verifyDurationInSec: 30 },
    },
    defaults: {},
  },
  {
    schema: AccessRecallMessageSchema,
    hex: [
      "10 01", // status (2): 1
      "18 3c", // duration (3): 60
      "20 e8 07", // end_time (4): 1000
      "2a 01 73", // scene (5): "s"
      "32 03", // notice (6), 3 bytes
      "0a 01 6e", //   key (1): "n"
      "3a 03", // content (7), 3 bytes
      "0a 01 63", //   key (1): "c"
      "42 02", // punish_info (8), 2 bytes
      "28 09", //   punish_type_id (5): 9, link-mic banned
    ],
    expected: {
      status: 1,
      duration: 60,
      endTime: "1000",
      scene: "s",
      notice: { key: "n", defaultPattern: "" },
      content: { key: "c", defaultPattern: "" },
      punishInfo: { ...EMPTY_PUNISH, punishTypeId: 9 },
    },
    defaults: { status: 0, duration: 0, endTime: "0", scene: "" },
  },
  {
    schema: PartnershipDropsUpdateMessageSchema,
    hex: [
      "10 01", // change_mode (2): 1, update
      "1a 01 64", // drops_id (3): "d"
      "22 01 74", // task_id (4): "t"
      "2a 01 65", // event_id (5): "e"
      "30 2a", // anchor_uid (6): 42
    ],
    expected: {
      changeMode: 1,
      dropsId: "d",
      taskId: "t",
      eventId: "e",
      anchorUid: "42",
    },
    defaults: {
      changeMode: 0,
      dropsId: "",
      taskId: "",
      eventId: "",
      anchorUid: "0",
    },
  },
  {
    schema: PartnershipGameOfflineMessageSchema,
    hex: [
      "12 0b", // offline_game_list (2), 11 bytes
      "0a 01 74", //   task_id (1): "t"
      "12 01 78", //   toast_text (2): "x"
      "20 02", //   offline_type (4): 2, drops
      "32 01 67", //   game_id (6): "g"
    ],
    expected: {
      offlineGameList: [
        { taskId: "t", toastText: "x", offlineType: 2, gameId: "g" },
      ],
    },
    defaults: { offlineGameList: [] },
  },
  {
    schema: PartnershipPunishMessageSchema,
    hex: [
      "12 04", // punish_info (2), 4 bytes
      "0a 02 62 6c", //   punish_type (1): "bl"
    ],
    expected: { punishInfo: { ...EMPTY_PUNISH, punishType: "bl" } },
    defaults: {},
  },
  {
    schema: LiveGameIntroMessageSchema,
    hex: [
      "12 03", // content (2), 3 bytes
      "0a 01 63", //   key (1): "c"
      "18 01", // has_rank_info (3): true
    ],
    expected: { content: { key: "c", defaultPattern: "" }, hasRankInfo: true },
    defaults: { hasRankInfo: false },
  },
];

describe("the tail constants", () => {
  it("have the values of the webcast.im enums", () => {
    expect(GameRankMsgType).toEqual({
      RANK_IN_OUT: 0,
      RANK_CHANGE: 1,
      ANCHOR_ENCOURAGE: 2,
      UNKNOWN: 255,
    });
    expect(PartnershipChangeMode).toEqual({ SHOW: 0, UPDATE: 1, CLOSE: 2 });
    expect(OfflineType).toEqual({
      TASK_OFFLINE: 0,
      EVENT_OFFLINE: 1,
      DROPS_OFFLINE: 2,
    });
    for (const constant of [
      GameRankMsgType,
      PartnershipChangeMode,
      OfflineType,
    ]) {
      expect(Object.isFrozen(constant)).toBe(true);
    }
  });
});

describe.each(CASES)("$schema.name", ({ schema, hex, expected, defaults }) => {
  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(hex.join(" "));
    expect(decodeMessage(schema, bytes)).toStrictEqual(expected);
    expect(toHex(encodeMessage(schema, expected))).toBe(toHex(bytes));
  });

  it("leaves out what the message leaves out", () => {
    expect(decodeMessage(schema, new Uint8Array(0))).toStrictEqual(defaults);
  });

  it("skips fields it doesn't read, of every wire type, around the common data", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(4, 1_000)),
      unknownFields(1_000),
    );
    expect(decodeMessage(schema, bytes)).toStrictEqual({
      ...defaults,
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: false,
      },
    });
  });
});

describe("the tail's nested messages", () => {
  it("skip fields they don't read, of every wire type, and read fields out of order", () => {
    expect(
      decodeMessage(
        AccessControlMessageSchema,
        fields.message(2, unknownFields(), fields.varint(3, 9)),
      ),
    ).toStrictEqual({
      captcha: { captchaRecordId: "0", roomId: "0", verifyDurationInSec: 9 },
    });
    expect(
      decodeMessage(
        PartnershipGameOfflineMessageSchema,
        concat(
          fields.message(
            2,
            fields.varint(3, 2), // task_list_len, not read
            fields.string(6, "g"),
            unknownFields(),
            fields.string(5, "Title"), // toast_title, not read
            fields.varint(7, 1), // task_type, not read
            fields.varint(4, 1),
          ),
          fields.message(2, unknownFields()),
        ),
      ),
    ).toStrictEqual({
      offlineGameList: [
        { taskId: "", toastText: "", offlineType: 1, gameId: "g" },
        { taskId: "", toastText: "", offlineType: 0, gameId: "" },
      ],
    });
    expect(
      decodeMessage(
        AccessRecallMessageSchema,
        concat(
          fields.message(8, unknownFields(), fields.string(10, "Shown")),
          fields.message(6, unknownFields(), fields.string(2, "p")),
          fields.varint(2, -1),
        ),
      ),
    ).toStrictEqual({
      status: -1,
      duration: 0,
      endTime: "0",
      scene: "",
      notice: { key: "", defaultPattern: "p" },
      punishInfo: { ...EMPTY_PUNISH, showReason: "Shown" },
    });
  });

  it("read the capsule's and the announcement's fields among the ones they don't read", () => {
    expect(
      decodeMessage(
        CapsuleMessageSchema,
        concat(
          fields.message(2, fields.string(2, "tos/icon")), // icon, not read
          fields.string(9, "sub"),
          fields.message(4, fields.string(1, "btn")), // button_text, not read
          fields.string(5, "sslocal://x"), // schema, not read
          fields.varint(6, 3),
          fields.message(8, fields.varint(1, 1)), // biz_params, not read
          fields.varint(10, 2), // style, not read
          fields.varint(11, 1), // skip_fc, not read
          fields.string(7, "scene"),
        ),
      ),
    ).toStrictEqual({ type: 3, scene: "scene", subScene: "sub" });
    expect(
      decodeMessage(
        MarqueeAnnouncementMessageSchema,
        concat(
          fields.message(3, fields.string(1, "entity")), // message_entity, not read
          fields.string(2, "scene"),
        ),
      ),
    ).toStrictEqual({ messageScene: "scene" });
  });
});
