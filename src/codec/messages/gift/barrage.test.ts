import { describe, expect, it, vi } from "vitest";
import { BarrageType, type BarrageMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { BarrageMessageSchema } from "./barrage.js";
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

// Field numbers: WebcastBarrageMessage and its BarrageType*Param messages in
// webcast/model/message/messages.proto; content (5) and
// common_barrage_content (24) are webcast.model.message.common Texts
// (model/message/common.proto); msg_type (3) is a
// webcast.im.BarrageMessage_BarrageType (im.proto). The bytes are written
// field by field (fields.*) or by hand, not from the schema, so a wrong
// number in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(BarrageMessageSchema, bytes);

describe("BarrageType", () => {
  it("has the values of webcast.im.BarrageMessage_BarrageType", () => {
    expect(BarrageType).toEqual({
      UNKNOWN: 0,
      E_COM_ORDERING: 1,
      E_COM_BUYING: 2,
      NORMAL: 3,
      SUBSCRIBE: 4,
      EVENT_VIEW: 5,
      EVENT_REGISTERED: 6,
      SUBSCRIBE_GIFT: 7,
      USER_UPGRADE: 8,
      GRADE_USER_ENTRANCE_NOTIFICATION: 9,
      FANS_LEVEL_UPGRADE: 10,
      FANS_LEVEL_ENTRANCE: 11,
      GAME_PARTNERSHIP: 12,
      GIFT_GALLERY: 13,
      E_COM_BOUGHT: 14,
      ENIGMA_ENTRANCE: 15,
      COMMON_BARRAGE: 100,
    });
    expect(Object.isFrozen(BarrageType)).toBe(true);
  });
});

describe("BarrageMessageSchema", () => {
  it("reads common (1), msg_type (3), content (5), common_barrage_content (24), user (50), user_grade_param (100), fans_level_param (101: current_grade 1, user 4) and subscribe_gift_param (102: gift_sub_count 1, gift_source 3)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastBarrageMessage")),
      fields.message(2, fields.varint(1, 1)), // event, not read
      fields.varint(3, 8),
      fields.message(4, fields.string(2, "tos/icon")), // icon, not read
      fields.message(
        5,
        fields.string(1, "ttlive_superfan_commentnotif_superfanjoined"),
        fields.string(2, "{0:user} joined the super fans"),
      ),
      fields.varint(6, 5_000), // duration, not read
      fields.message(16, fields.varint(3, 4)), // badge, not read
      fields.string(23, "superfan"), // sub_type, not read
      fields.message(24, fields.string(1, "ttlive_superfan_banner")),
      fields.message(
        50,
        fields.varint(1, 6_900_000_000_000_000_001n),
        fields.string(3, "Nick"),
      ),
      fields.message(
        100,
        fields.varint(1, 12),
        fields.varint(2, 1), // display_config, not read
        fields.string(3, "6900000000000000001"), // user_id, not read
        fields.message(4, fields.string(3, "Nick")),
      ),
      fields.message(
        101,
        fields.varint(1, 3),
        fields.varint(2, 1), // display_config, not read
        fields.message(4, fields.string(38, "nick.name")),
      ),
      fields.message(
        102,
        fields.varint(1, 5),
        fields.varint(2, 1), // show_gift_sub_count, not read
        fields.varint(3, 2),
      ),
      fields.message(103, fields.string(5, "2")), // privilege_log_extra, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastBarrageMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      msgType: 8,
      content: {
        key: "ttlive_superfan_commentnotif_superfanjoined",
        defaultPattern: "{0:user} joined the super fans",
      },
      commonBarrageContent: {
        key: "ttlive_superfan_banner",
        defaultPattern: "",
      },
      user: {
        userId: "6900000000000000001",
        nickname: "Nick",
        displayId: "",
        badgeList: [],
      },
      userGradeParam: {
        currentGrade: 12,
        user: { userId: "0", nickname: "Nick", displayId: "", badgeList: [] },
      },
      fansLevelParam: {
        currentGrade: 3,
        user: {
          userId: "0",
          nickname: "",
          displayId: "nick.name",
          badgeList: [],
        },
      },
      subscribeGiftParam: { giftSubCount: 5, giftSource: 2 },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({ msgType: 0 });
    expect(
      decode(
        concat(
          fields.message(5),
          fields.message(24),
          fields.message(100),
          fields.message(102),
        ),
      ),
    ).toStrictEqual({
      msgType: 0,
      content: { key: "", defaultPattern: "" },
      commonBarrageContent: { key: "", defaultPattern: "" },
      userGradeParam: { currentGrade: 0 },
      subscribeGiftParam: { giftSubCount: 0, giftSource: 0 },
    });
  });

  it("round-trips every field through the encoder", () => {
    const barrage: BarrageMessage = {
      common: sampleCommon("WebcastBarrageMessage"),
      user: SAMPLE_USER,
      msgType: BarrageType.SUBSCRIBE_GIFT,
      content: { key: "ttlive_superfan_x", defaultPattern: "{0:user}" },
      commonBarrageContent: { key: "ttlive_superfan_y", defaultPattern: "" },
      userGradeParam: { currentGrade: 20, user: SAMPLE_USER },
      fansLevelParam: { currentGrade: 7, user: SAMPLE_USER },
      subscribeGiftParam: { giftSubCount: 10, giftSource: 3 },
    };
    expect(decode(encodeMessage(BarrageMessageSchema, barrage))).toStrictEqual(
      barrage,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(5, unknownFields(), fields.string(1, "k1")),
      unknownFields(1_000),
      fields.message(24, unknownFields(), fields.string(1, "k2")),
      fields.message(50, unknownFields(), fields.string(38, "ann")),
      fields.message(
        101,
        unknownFields(),
        fields.varint(1, 2),
        fields.message(4, unknownFields(), fields.string(3, "Ann")),
      ),
      fields.message(102, unknownFields(), fields.varint(3, 1)),
    );
    expect(decode(bytes)).toStrictEqual({
      msgType: 0,
      content: { key: "k1", defaultPattern: "" },
      commonBarrageContent: { key: "k2", defaultPattern: "" },
      user: { userId: "0", nickname: "", displayId: "ann", badgeList: [] },
      fansLevelParam: {
        currentGrade: 2,
        user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
      },
      subscribeGiftParam: { giftSubCount: 0, giftSource: 1 },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "18 03", // msg_type (3): 3, normal
        "2a 04", // content (5), 4 bytes
        "0a 02 6b 31", //   key (1): "k1"
        "c2 01 04", // common_barrage_content (24), 4 bytes
        "0a 02 6b 32", //   key (1): "k2"
        "92 03 02", // user (50), 2 bytes
        "08 05", //   id (1): 5
        "a2 06 06", // user_grade_param (100), 6 bytes
        "08 0c", //   current_grade (1): 12
        "22 02", //   user (4), 2 bytes
        "08 05", //     id (1): 5
        "aa 06 02", // fans_level_param (101), 2 bytes
        "08 02", //   current_grade (1): 2
        "b2 06 04", // subscribe_gift_param (102), 4 bytes
        "08 03", //   gift_sub_count (1): 3
        "18 01", //   gift_source (3): 1, platform
      ].join(" "),
    );
    const barrage: BarrageMessage = {
      msgType: 3,
      content: { key: "k1", defaultPattern: "" },
      commonBarrageContent: { key: "k2", defaultPattern: "" },
      user: { userId: "5", nickname: "", displayId: "", badgeList: [] },
      userGradeParam: {
        currentGrade: 12,
        user: { userId: "5", nickname: "", displayId: "", badgeList: [] },
      },
      fansLevelParam: { currentGrade: 2 },
      subscribeGiftParam: { giftSubCount: 3, giftSource: 1 },
    };
    expect(decode(bytes)).toStrictEqual(barrage);
    expect(toHex(encodeMessage(BarrageMessageSchema, barrage))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with two-byte tags, a 64-bit count and unknown fields", () => {
    const bytes = fromHex(
      [
        "18 64", // msg_type (3): 100, common barrage
        "2a 1b", // content (5), 27 bytes
        "0a 0f 74 74 6c 69 76 65 5f 73 75 70 65 72 66 61 6e", //   key (1): "ttlive_superfan"
        "12 08 7b 30 3a 75 73 65 72 7d", //   default_pattern (2): "{0:user}"
        "50 01", // gallery_gift_id (10), not read
        "82 01 02", // badge (16), not read, 2 bytes
        "18 04", //   scene_type (3): 4
        "b2 06 0a", // subscribe_gift_param (102), 10 bytes
        "08 81 80 90 cf b0 99 85 d9 66", //   gift_sub_count (1): 7400000000000000001, rounded
        "92 03 05", // user (50), 5 bytes
        "b2 02 02 6a 6f", //   display_id (38): "jo"
        "ba 06 03", // privilege_log_extra (103), not read, 3 bytes
        "2a 01 39", //   level (5): "9"
      ].join(" "),
    );
    const onUnsafeInteger = vi.fn();
    expect(
      decodeMessage(BarrageMessageSchema, bytes, { onUnsafeInteger }),
    ).toStrictEqual({
      msgType: 100,
      content: { key: "ttlive_superfan", defaultPattern: "{0:user}" },
      user: { userId: "0", nickname: "", displayId: "jo", badgeList: [] },
      subscribeGiftParam: {
        giftSubCount: 7_400_000_000_000_000_000,
        giftSource: 0,
      },
    });
    expect(onUnsafeInteger).toHaveBeenCalledWith(
      "BarrageTypeSubscribeGiftParam.giftSubCount",
      7_400_000_000_000_000_001n,
    );
  });
});
