import { describe, expect, it } from "vitest";
import type { GiftBroadcastMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { GiftBroadcastMessageSchema } from "./giftBroadcast.js";
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

// Field numbers: WebcastGiftBroadcastMessage and the nested
// WebcastRoomNotifyMessage in webcast/model/message/messages.proto. The bytes
// are written field by field (fields.*) or by hand, not from the schema, so a
// wrong number in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(GiftBroadcastMessageSchema, bytes);

const NOTIFY_DEFAULTS = {
  notifyType: 0,
  content: "",
  fromUserId: "0",
  toAnchorId: "0",
};

describe("GiftBroadcastMessageSchema", () => {
  it("reads common (1), from_user_id (2) and notify (4: a room notify message)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastGiftBroadcastMessage")),
      fields.varint(2, 6_900_000_000_000_000_001n),
      fields.message(3, fields.string(2, "tos/icon")), // left_icon, not read
      fields.message(
        4,
        fields.message(1, fields.string(1, "WebcastRoomNotifyMessage")),
        fields.varint(3, 5),
        fields.string(4, "Nick sent a Universe"),
        fields.message(5, fields.string(3, "Nick")),
        fields.varint(10, 6_900_000_000_000_000_001n),
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastGiftBroadcastMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      fromUserId: "6900000000000000001",
      notify: {
        common: {
          method: "WebcastRoomNotifyMessage",
          msgId: "0",
          roomId: "0",
          createTime: "0",
          isShowMsg: false,
        },
        notifyType: 5,
        content: "Nick sent a Universe",
        user: { userId: "0", nickname: "Nick", displayId: "", badgeList: [] },
        fromUserId: "6900000000000000001",
        toAnchorId: "0",
      },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({ fromUserId: "0" });
    expect(decode(fields.message(4))).toStrictEqual({
      fromUserId: "0",
      notify: NOTIFY_DEFAULTS,
    });
  });

  it("round-trips every field through the encoder", () => {
    const broadcast: GiftBroadcastMessage = {
      common: sampleCommon("WebcastGiftBroadcastMessage"),
      fromUserId: "6900000000000000001",
      notify: {
        common: sampleCommon("WebcastRoomNotifyMessage"),
        notifyType: 5,
        content: "A Universe",
        user: SAMPLE_USER,
        fromUserId: "6900000000000000001",
        toAnchorId: "6900000000000000002",
      },
    };
    expect(
      decode(encodeMessage(GiftBroadcastMessageSchema, broadcast)),
    ).toStrictEqual(broadcast);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.varint(2, 7),
      fields.message(
        4,
        unknownFields(),
        fields.string(4, "x"),
        fields.message(5, unknownFields(), fields.string(3, "Ann")),
      ),
      unknownFields(1_000),
    );
    expect(decode(bytes)).toStrictEqual({
      fromUserId: "7",
      notify: {
        ...NOTIFY_DEFAULTS,
        content: "x",
        user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
      },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 07", // from_user_id (2): 7
        "22 08", // notify (4), 8 bytes
        "18 01", //   notify_type (3): 1
        "22 02 68 69", //   content (4): "hi"
        "50 07", //   from_user_id (10): 7
      ].join(" "),
    );
    const broadcast: GiftBroadcastMessage = {
      fromUserId: "7",
      notify: {
        notifyType: 1,
        content: "hi",
        fromUserId: "7",
        toAnchorId: "0",
      },
    };
    expect(decode(bytes)).toStrictEqual(broadcast);
    expect(toHex(encodeMessage(GiftBroadcastMessageSchema, broadcast))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a 64-bit id, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "1a 02 12 00", // left_icon (3), not read
        "22 0c", // notify (4), 12 bytes
        "60 81 80 c8 b1 93 ae ee e0 5f", //   to_anchor_id (12): 6900000000000000001
        "18 02", //   notify_type (3): 2
        "10 81 80 c8 b1 93 ae ee e0 5f", // from_user_id (2): 6900000000000000001
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      fromUserId: "6900000000000000001",
      notify: {
        ...NOTIFY_DEFAULTS,
        notifyType: 2,
        toAnchorId: "6900000000000000001",
      },
    });
  });
});
