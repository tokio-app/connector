import { describe, expect, it, vi } from "vitest";
import {
  PerceptionIconType,
  type PerceptionMessage,
} from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { PerceptionMessageSchema } from "./perception.js";
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

// Field numbers: WebcastPerceptionMessage in
// webcast/model/message/messages.proto, PerceptionDialogInfo and
// PunishEventInfo in webcast/model/message/invite_top_host_info.proto;
// icon_type (1) is a webcast.model.data.PerceptionDialogIconType. The bytes
// are written field by field (fields.*) or by hand, not from the schema, so a
// wrong number in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(PerceptionMessageSchema, bytes);

const EMPTY_PUNISH = {
  punishType: "",
  punishReason: "",
  punishId: "",
  punishTypeId: 0,
  duration: 0,
  endTime: "0",
  showReason: "",
};

describe("PerceptionIconType", () => {
  it("has the values of webcast.model.data.PerceptionDialogIconType", () => {
    expect(PerceptionIconType).toEqual({
      NONE: 0,
      WARNING: 1,
      LINKMIC: 2,
      GUEST_LINKMIC: 3,
      LIVE: 4,
      TREASURE_BOX: 5,
      MUTE: 6,
      GAMEPAD_ACCESS_REVOKED: 7,
      BAN_REPORT_LIVE_SINGLE_ROOM: 8,
      BAN_REPORT_LIVE_ALL_ROOM: 9,
      BAN_REPORT_LIVE_GREEN_SCREEN: 10,
      GIFT: 11,
      APPEAL_SUCCESS: 12,
      MATCH: 13,
      LIVE_GOAL: 14,
      SUBSCRIPTION: 15,
      STAR_COMMENT: 16,
      RANKING: 17,
      COMMON: 18,
    });
    expect(Object.isFrozen(PerceptionIconType)).toBe(true);
  });
});

describe("PerceptionMessageSchema", () => {
  it("reads common (1), dialog (2: icon_type 1, title 2, sub_title 3, scene 7) and punish_info (3)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastPerceptionMessage")),
      fields.message(
        2,
        fields.varint(1, 1),
        fields.message(2, fields.string(1, "title_key")),
        fields.message(3, fields.string(2, "Sub title")),
        fields.message(4, fields.string(1, "advice")), // advice_action_text, not read
        fields.message(5, fields.string(1, "default")), // default_action_text, not read
        fields.string(6, "https://example/detail"), // violation_detail_url, not read
        fields.varint(7, 12),
        fields.varint(8, 6_900_000_000_000_000_001n), // target_user_id, not read
        fields.varint(10, 30), // count_down_time, not read
        fields.varint(11, 1), // show_feedback, not read
      ),
      fields.message(
        3,
        fields.string(1, "ban_live"),
        fields.string(2, "nudity"),
        fields.string(3, "p1"),
        fields.varint(5, 70),
        fields.varint(6, 600),
        fields.string(7, "code"), // punish_perception_code, not read
        fields.varint(8, 1_760_000_000_600n),
        fields.string(10, "Shown"),
      ),
      fields.varint(4, 1_760_000_000), // end_time, not read
      fields.varint(5, 1), // show_violation_warning, not read
      fields.message(6, fields.string(1, "toast")), // toast, not read
      fields.varint(10, 1), // float_icon_type, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastPerceptionMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      dialog: {
        iconType: 1,
        title: { key: "title_key", defaultPattern: "" },
        subTitle: { key: "", defaultPattern: "Sub title" },
        scene: 12,
      },
      punishInfo: {
        punishType: "ban_live",
        punishReason: "nudity",
        punishId: "p1",
        punishTypeId: 70,
        duration: 600,
        endTime: "1760000000600",
        showReason: "Shown",
      },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({});
    expect(decode(concat(fields.message(2), fields.message(3)))).toStrictEqual({
      dialog: { iconType: 0, scene: 0 },
      punishInfo: EMPTY_PUNISH,
    });
  });

  it("round-trips every field through the encoder", () => {
    const perception: PerceptionMessage = {
      common: sampleCommon("WebcastPerceptionMessage"),
      dialog: {
        iconType: PerceptionIconType.WARNING,
        title: { key: "t", defaultPattern: "Title" },
        subTitle: { key: "s", defaultPattern: "Sub" },
        scene: 3,
      },
      punishInfo: {
        punishType: "ban_live",
        punishReason: "nudity",
        punishId: "p1",
        punishTypeId: 76,
        duration: 86_400,
        endTime: "1760000000000",
        showReason: "Shown",
      },
    };
    expect(
      decode(encodeMessage(PerceptionMessageSchema, perception)),
    ).toStrictEqual(perception);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(4, 1_000)),
      fields.message(
        2,
        unknownFields(),
        fields.message(2, unknownFields(), fields.string(1, "t")),
        fields.varint(7, 2),
      ),
      unknownFields(1_000),
      fields.message(3, unknownFields(), fields.varint(5, 9)),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: false,
      },
      dialog: {
        iconType: 0,
        title: { key: "t", defaultPattern: "" },
        scene: 2,
      },
      punishInfo: { ...EMPTY_PUNISH, punishTypeId: 9 },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 0b", // dialog (2), 11 bytes
        "08 01", //   icon_type (1): 1, warning
        "12 05", //   title (2), 5 bytes
        "0a 03 6b 65 79", //     key (1): "key"
        "38 02", //   scene (7): 2
        "1a 02", // punish_info (3), 2 bytes
        "28 46", //   punish_type_id (5): 70, viewer limit
      ].join(" "),
    );
    const perception: PerceptionMessage = {
      dialog: {
        iconType: 1,
        title: { key: "key", defaultPattern: "" },
        scene: 2,
      },
      punishInfo: { ...EMPTY_PUNISH, punishTypeId: 70 },
    };
    expect(decode(bytes)).toStrictEqual(perception);
    expect(toHex(encodeMessage(PerceptionMessageSchema, perception))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "28 01", // show_violation_warning (5), not read
        "1a 04", // punish_info (3), 4 bytes
        "30 3c", //   duration (6): 60
        "28 09", //   punish_type_id (5): 9
        "20 e8 07", // end_time (4), not read
        "12 07", // dialog (2), 7 bytes
        "38 01", //   scene (7): 1
        "32 01 75", //   violation_detail_url (6), not read
        "08 06", //   icon_type (1): 6, mute
        "50 01", // float_icon_type (10), not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      dialog: { iconType: 6, scene: 1 },
      punishInfo: { ...EMPTY_PUNISH, punishTypeId: 9, duration: 60 },
    });
  });

  it("reports a duration (int64) past Number.MAX_SAFE_INTEGER, with its path", () => {
    const onUnsafeInteger = vi.fn();
    const unsafe = 2n ** 60n;
    const perception = decodeMessage(
      PerceptionMessageSchema,
      fields.message(3, fields.varint(6, unsafe)),
      { onUnsafeInteger },
    );
    expect(perception).toStrictEqual({
      punishInfo: { ...EMPTY_PUNISH, duration: 2 ** 60 },
    });
    expect(onUnsafeInteger.mock.calls).toEqual([
      ["PunishEventInfo.duration", unsafe],
    ]);
  });
});
