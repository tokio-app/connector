import { describe, expect, it, vi } from "vitest";
import {
  ExhibitionType,
  OldSubscribeStatus,
  SubGiftSource,
  SubNotifyMessageType,
  SubscribeType,
  SubscribingStatus,
  type SubNotifyMessage,
} from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { SubNotifyMessageSchema } from "./subNotify.js";
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

// Field numbers: WebcastSubNotifyMessage in
// webcast/model/message/messages.proto; its enums are webcast.im's
// (im.proto). The bytes are written field by field (fields.*) or by hand,
// not from the schema, so a wrong number in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(SubNotifyMessageSchema, bytes);

const DEFAULTS = {
  exhibitionType: 0,
  subMonth: 0,
  subscribeType: 0,
  oldSubscribeStatus: 0,
  messageType: 0,
  subscribingStatus: 0,
  isSend: false,
  giftSource: 0,
};

describe("the subscription enums", () => {
  it("have the values of webcast.im's SubscribeType, OldSubscribeStatus, SubscribingStatus, MessageType, GiftSource and ExhibitionType", () => {
    expect(SubscribeType).toEqual({ ONCE: 0, AUTO: 1, DEFAULT: 100 });
    expect(OldSubscribeStatus).toEqual({
      FIRST: 0,
      RESUB: 1,
      SUB_IN_GRACE_PERIOD: 2,
      SUB_NOT_IN_GRACE_PERIOD: 3,
      DEFAULT: 100,
    });
    expect(SubscribingStatus).toEqual({
      UNKNOWN: 0,
      ONCE: 1,
      CIRCLE: 2,
      CIRCLE_CANCEL: 3,
      REFUND: 4,
      IN_GRACE_PERIOD: 5,
      NOT_IN_GRACE_PERIOD: 6,
    });
    expect(Object.values(SubNotifyMessageType)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
    expect(SubNotifyMessageType.SUB_SUCCESS).toBe(0);
    expect(SubNotifyMessageType.SUB_MODERATOR_PIN_PERK).toBe(14);
    expect(SubGiftSource).toEqual({
      UNKNOWN: 0,
      PLATFORM: 1,
      USER_BUY_RANDOM: 2,
      USER_BUY_SPECIFIC: 3,
    });
    expect(ExhibitionType).toEqual({ DEFAULT: 0, FOLD: 1, PUBLIC_SCREEN: 2 });
    for (const constant of [
      SubscribeType,
      OldSubscribeStatus,
      SubscribingStatus,
      SubNotifyMessageType,
      SubGiftSource,
      ExhibitionType,
    ]) {
      expect(Object.isFrozen(constant)).toBe(true);
    }
  });
});

describe("SubNotifyMessageSchema", () => {
  it("reads common (1), user (2), exhibition_type (3), sub_month (4), subscribe_type (5), old_subscribe_status (6), message_type (7), subscribing_status (8), is_send (9) and gift_source (11)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastSubNotifyMessage")),
      fields.message(2, fields.string(3, "Nick")),
      fields.varint(3, 2),
      fields.varint(4, 6),
      fields.varint(5, 1),
      fields.varint(6, 1),
      fields.varint(7, 9),
      fields.varint(8, 2),
      fields.varint(9, 1),
      fields.varint(10, 1), // is_custom, not read
      fields.varint(11, 3),
      fields.varint(12, 1), // message_display_style, not read
      fields.string(14, "pkg-1"), // package_id, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastSubNotifyMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      user: { userId: "0", nickname: "Nick", displayId: "", badgeList: [] },
      exhibitionType: 2,
      subMonth: 6,
      subscribeType: 1,
      oldSubscribeStatus: 1,
      messageType: 9,
      subscribingStatus: 2,
      isSend: true,
      giftSource: 3,
    });
  });

  it("keeps enum values the constants don't name", () => {
    expect(decode(fields.varint(5, 100)).subscribeType).toBe(100);
    expect(decode(fields.varint(7, 99)).messageType).toBe(99);
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual(DEFAULTS);
  });

  it("round-trips every field through the encoder", () => {
    const notify: SubNotifyMessage = {
      common: sampleCommon("WebcastSubNotifyMessage"),
      user: SAMPLE_USER,
      exhibitionType: ExhibitionType.PUBLIC_SCREEN,
      subMonth: 12,
      subscribeType: SubscribeType.AUTO,
      oldSubscribeStatus: OldSubscribeStatus.RESUB,
      messageType: SubNotifyMessageType.SUB_GIFTS_END_SUCCEED_ROOM_MESSAGE,
      subscribingStatus: SubscribingStatus.CIRCLE,
      isSend: true,
      giftSource: SubGiftSource.USER_BUY_SPECIFIC,
    };
    expect(decode(encodeMessage(SubNotifyMessageSchema, notify))).toStrictEqual(
      notify,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(2, unknownFields(), fields.string(3, "Ann")),
      unknownFields(1_000),
      fields.varint(4, 3),
    );
    expect(decode(bytes)).toStrictEqual({
      ...DEFAULTS,
      user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
      subMonth: 3,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 04", // user (2), 4 bytes
        "1a 02 4a 6f", //   nickname (3): "Jo"
        "18 01", // exhibition_type (3): 1, fold
        "20 02", // sub_month (4): 2
        "28 01", // subscribe_type (5): 1, auto
        "30 01", // old_subscribe_status (6): 1, resub
        "38 06", // message_type (7): 6, a gifted subscription to the user
        "40 02", // subscribing_status (8): 2, circle
        "48 01", // is_send (9): true
        "58 02", // gift_source (11): 2, a user, random
      ].join(" "),
    );
    const notify: SubNotifyMessage = {
      user: { userId: "0", nickname: "Jo", displayId: "", badgeList: [] },
      exhibitionType: 1,
      subMonth: 2,
      subscribeType: 1,
      oldSubscribeStatus: 1,
      messageType: 6,
      subscribingStatus: 2,
      isSend: true,
      giftSource: 2,
    };
    expect(decode(bytes)).toStrictEqual(notify);
    expect(toHex(encodeMessage(SubNotifyMessageSchema, notify))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a 64-bit count past Number.MAX_SAFE_INTEGER (reported), unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "50 01", // is_custom (10), not read
        "20 81 80 c8 b1 93 ae ee e0 5f", // sub_month (4): 6900000000000000001
        "28 e4 00", // subscribe_type (5): 100, default
        "72 03 70 6b 67", // package_id (14), not read
        "12 02", // user (2), 2 bytes
        "08 07", //   id (1): 7
      ].join(" "),
    );
    const onUnsafeInteger = vi.fn();
    expect(
      decodeMessage(SubNotifyMessageSchema, bytes, { onUnsafeInteger }),
    ).toStrictEqual({
      ...DEFAULTS,
      user: { userId: "7", nickname: "", displayId: "", badgeList: [] },
      subMonth: 6_900_000_000_000_000_000,
      subscribeType: 100,
    });
    expect(onUnsafeInteger).toHaveBeenCalledWith(
      "WebcastSubNotifyMessage.subMonth",
      6_900_000_000_000_000_001n,
    );
  });
});
