import { describe, expect, it } from "vitest";
import type { RoomNotifyMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { RoomNotifyMessageSchema } from "./roomNotify.js";
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

// Field numbers: WebcastRoomNotifyMessage in
// webcast/model/message/messages.proto. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(RoomNotifyMessageSchema, bytes);

const DEFAULTS = {
  notifyType: 0,
  content: "",
  fromUserId: "0",
  toAnchorId: "0",
};

describe("RoomNotifyMessageSchema", () => {
  it("reads common (1), notify_type (3), content (4), user (5), from_user_id (10) and to_anchor_id (12)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastRoomNotifyMessage")),
      fields.string(2, "sslocal://x"), // schema, not read
      fields.varint(3, 1),
      fields.string(4, "Nick sent a Lion"),
      fields.message(5, fields.string(3, "Nick")),
      fields.message(6, fields.varint(1, 1)), // extra, not read
      fields.varint(7, 2), // notify_class, not read
      fields.varint(8, 1), // flex_setting, not read
      fields.varint(8, 2), // flex_setting, not read
      fields.string(9, "gift"), // source, not read
      fields.varint(10, 6_900_000_000_000_000_001n),
      fields.message(11, fields.string(5, "3")), // privilege_log_extra, not read
      fields.varint(12, 6_900_000_000_000_000_002n),
      fields.message(13, fields.string(1, "x")), // event_tracking, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastRoomNotifyMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      notifyType: 1,
      content: "Nick sent a Lion",
      user: { userId: "0", nickname: "Nick", displayId: "", badgeList: [] },
      fromUserId: "6900000000000000001",
      toAnchorId: "6900000000000000002",
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual(DEFAULTS);
  });

  it("round-trips every field through the encoder", () => {
    const notify: RoomNotifyMessage = {
      common: sampleCommon("WebcastRoomNotifyMessage"),
      notifyType: 3,
      content: "A big gift elsewhere",
      user: SAMPLE_USER,
      fromUserId: "6900000000000000001",
      toAnchorId: "6900000000000000002",
    };
    expect(
      decode(encodeMessage(RoomNotifyMessageSchema, notify)),
    ).toStrictEqual(notify);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.string(4, "hi"),
      fields.message(5, unknownFields(), fields.string(3, "Ann")),
      unknownFields(1_000),
    );
    expect(decode(bytes)).toStrictEqual({
      ...DEFAULTS,
      content: "hi",
      user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "18 02", // notify_type (3): 2
        "22 02 68 69", // content (4): "hi"
        "2a 04", // user (5), 4 bytes
        "1a 02 4a 6f", //   nickname (3): "Jo"
        "50 07", // from_user_id (10): 7
        "60 08", // to_anchor_id (12): 8
      ].join(" "),
    );
    const notify: RoomNotifyMessage = {
      notifyType: 2,
      content: "hi",
      user: { userId: "0", nickname: "Jo", displayId: "", badgeList: [] },
      fromUserId: "7",
      toAnchorId: "8",
    };
    expect(decode(bytes)).toStrictEqual(notify);
    expect(toHex(encodeMessage(RoomNotifyMessageSchema, notify))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with 64-bit ids, a packed field it doesn't read and fields out of order", () => {
    const bytes = fromHex(
      [
        "60 81 80 c8 b1 93 ae ee e0 5f", // to_anchor_id (12): 6900000000000000001
        "42 02 01 02", // flex_setting (8), packed, not read
        "18 ff ff ff ff ff ff ff ff ff 01", // notify_type (3): -1
        "50 81 80 c8 b1 93 ae ee e0 5f", // from_user_id (10): 6900000000000000001
        "4a 01 67", // source (9), not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      ...DEFAULTS,
      notifyType: -1,
      fromUserId: "6900000000000000001",
      toAnchorId: "6900000000000000001",
    });
  });
});
