import { describe, expect, it } from "vitest";
import { PinAction, type RoomPinMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { GiftMessageSchema } from "../gift/gift.js";
import { MemberMessageSchema } from "../gift/member.js";
import { RoomPinMessageSchema } from "./roomPin.js";
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

// Field numbers: WebcastRoomPinMessage in webcast/model/message/messages.proto;
// its action (33) is a webcast.im.PinMessage_actionType (im.proto). The bytes
// are written field by field (fields.*) or by hand, not from the schema, so a
// wrong number in the table fails here. The nested gift and member messages
// are built from their schemas' defaults, so the gift group may extend them.

const decode = (bytes: Uint8Array) =>
  decodeMessage(RoomPinMessageSchema, bytes);

describe("PinAction", () => {
  it("has the values of webcast.im.PinMessage_actionType", () => {
    expect(PinAction).toEqual({ UNKNOWN: 0, PIN: 1, PIN_CANCEL: 2 });
    expect(Object.isFrozen(PinAction)).toBe(true);
  });
});

describe("RoomPinMessageSchema", () => {
  it("reads common (1), the pinned message (2 to 6), method (30), pin_time (31), operator (32), action (33) and pin_msg_id (35)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastRoomPinMessage"),
        fields.varint(4, 1_760_000_000_123),
      ),
      fields.message(
        2,
        fields.message(1, fields.string(1, "WebcastChatMessage")),
        fields.message(2, fields.string(3, "Nick")),
        fields.string(3, "pin me"),
      ),
      fields.message(
        4,
        fields.varint(2, 5_655),
        fields.message(7, fields.string(3, "G")),
      ),
      fields.string(30, "WebcastChatMessage"),
      fields.varint(31, 1_760_000_000_456),
      fields.message(32, fields.varint(1, 1), fields.string(3, "Mod")),
      fields.varint(33, 1),
      fields.varint(34, 30_000), // display_duration, not read
      fields.varint(35, 7_400_000_000_000_000_001n),
      fields.string(36, "key"), // ec_streamer_key, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastRoomPinMessage",
        msgId: "0",
        roomId: "0",
        createTime: "1760000000123",
        isShowMsg: false,
      },
      chatMessage: {
        common: {
          method: "WebcastChatMessage",
          msgId: "0",
          roomId: "0",
          createTime: "0",
          isShowMsg: false,
        },
        user: { userId: "0", nickname: "Nick", displayId: "", badgeList: [] },
        content: "pin me",
        contentLanguage: "",
        emotes: [],
        mentionUsers: [],
      },
      giftMessage: {
        ...GiftMessageSchema.create(),
        giftId: "5655",
        user: { userId: "0", nickname: "G", displayId: "", badgeList: [] },
      },
      method: "WebcastChatMessage",
      pinTime: "1760000000456",
      operator: { userId: "1", nickname: "Mod", displayId: "", badgeList: [] },
      action: 1,
      pinMsgId: "7400000000000000001",
    });
  });

  it("keeps action values the enum doesn't name", () => {
    expect(decode(fields.varint(33, 2)).action).toBe(2);
    expect(decode(fields.varint(33, 7)).action).toBe(7);
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      method: "",
      pinTime: "0",
      action: 0,
      pinMsgId: "0",
    });
    expect(decode(fields.message(6)).likeMessage).toStrictEqual({
      count: 0,
      total: 0,
    });
  });

  it("round-trips every field through the encoder", () => {
    const pin: RoomPinMessage = {
      common: sampleCommon("WebcastRoomPinMessage"),
      chatMessage: {
        common: sampleCommon("WebcastChatMessage"),
        user: SAMPLE_USER,
        content: "pinned",
        contentLanguage: "en",
        emotes: [{ index: 0, emote: { emoteId: "e1" } }],
        mentionUsers: [],
      },
      socialMessage: {
        common: sampleCommon("WebcastSocialMessage", "pm_mt_guidance_share"),
        user: SAMPLE_USER,
        shareType: 1,
        action: 1,
        shareTarget: "",
        followCount: 0,
        shareCount: 2,
        followType: 0,
        targetUserId: "0",
      },
      giftMessage: {
        ...GiftMessageSchema.create(),
        common: sampleCommon("WebcastGiftMessage"),
        giftId: "5655",
        user: SAMPLE_USER,
      },
      memberMessage: {
        ...MemberMessageSchema.create(),
        common: sampleCommon("WebcastMemberMessage"),
        user: SAMPLE_USER,
        actionId: 1,
      },
      likeMessage: {
        common: sampleCommon("WebcastLikeMessage"),
        user: SAMPLE_USER,
        count: 15,
        total: 1_234,
      },
      method: "WebcastChatMessage",
      pinTime: "1760000000456",
      operator: SAMPLE_USER,
      action: 2,
      pinMsgId: "7400000000000000001",
    };
    expect(decode(encodeMessage(RoomPinMessageSchema, pin))).toStrictEqual(pin);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(
        2,
        unknownFields(),
        fields.message(2, unknownFields(), fields.string(3, "Ann")),
        fields.string(3, "hi"),
      ),
      unknownFields(1_000),
      fields.message(32, unknownFields(), fields.string(3, "Mod")),
      fields.varint(33, 1),
    );
    expect(decode(bytes)).toStrictEqual({
      chatMessage: {
        user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
        content: "hi",
        contentLanguage: "",
        emotes: [],
        mentionUsers: [],
      },
      method: "",
      pinTime: "0",
      operator: { userId: "0", nickname: "Mod", displayId: "", badgeList: [] },
      action: 1,
      pinMsgId: "0",
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 0b", // chat_message (2), 11 bytes
        "12 05", //   user (2), 5 bytes
        "1a 03 41 6e 6e", //     nickname (3): "Ann"
        "1a 02 68 69", //   content (3): "hi"
        "f2 01 12 57 65 62 63 61 73 74 43 68 61 74 4d 65 73 73 61 67 65", // method (30): "WebcastChatMessage"
        "f8 01 e8 07", // pin_time (31): 1000
        "82 02 02", // operator (32), 2 bytes
        "08 09", //   id (1): 9
        "88 02 01", // action (33): 1
        "98 02 2a", // pin_msg_id (35): 42
      ].join(" "),
    );
    const pin: RoomPinMessage = {
      chatMessage: {
        user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
        content: "hi",
        contentLanguage: "",
        emotes: [],
        mentionUsers: [],
      },
      method: "WebcastChatMessage",
      pinTime: "1000",
      operator: { userId: "9", nickname: "", displayId: "", badgeList: [] },
      action: 1,
      pinMsgId: "42",
    };
    expect(decode(bytes)).toStrictEqual(pin);
    expect(toHex(encodeMessage(RoomPinMessageSchema, pin))).toBe(toHex(bytes));
  });

  it("reads hand-assembled bytes with every other pinned type, a 64-bit id, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "88 02 02", // action (33): 2
        "32 02", // like_message (6), 2 bytes
        "10 03", //   count (2): 3
        "2a 02", // member_message (5), 2 bytes
        "50 01", //   action (10): 1
        "90 02 05", // display_duration (34), not read
        "22 02", // gift_message (4), 2 bytes
        "10 05", //   gift_id (2): 5
        "1a 02", // social_message (3), 2 bytes
        "40 01", //   share_count (8): 1
        "98 02 81 80 90 cf b0 99 85 d9 66", // pin_msg_id (35): 7400000000000000001
        "a2 02 03 6b 65 79", // ec_streamer_key (36), not read
        "0a 02", // common (1), 2 bytes
        "30 01", //   is_show_msg (6): true
        "45 01 00 00 00", // field 8, fixed32, not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: true,
      },
      socialMessage: {
        shareType: 0,
        action: 0,
        shareTarget: "",
        followCount: 0,
        shareCount: 1,
        followType: 0,
        targetUserId: "0",
      },
      giftMessage: { ...GiftMessageSchema.create(), giftId: "5" },
      memberMessage: { ...MemberMessageSchema.create(), actionId: 1 },
      likeMessage: { count: 3, total: 0 },
      method: "",
      pinTime: "0",
      action: 2,
      pinMsgId: "7400000000000000001",
    });
  });
});
