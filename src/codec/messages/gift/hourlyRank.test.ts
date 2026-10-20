import { describe, expect, it } from "vitest";
import type { HourlyRankRewardMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { HourlyRankRewardMessageSchema } from "./hourlyRank.js";
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

// Field numbers: WebcastHourlyRankRewardMessage, HourlyRankRewardInfo and the
// nested WebcastRoomNotifyMessage in webcast/model/message/messages.proto. The
// bytes are written field by field (fields.*) or by hand, not from the
// schema, so a wrong number in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(HourlyRankRewardMessageSchema, bytes);

const NOTIFY_DEFAULTS = {
  notifyType: 0,
  content: "",
  fromUserId: "0",
  toAnchorId: "0",
};

describe("HourlyRankRewardMessageSchema", () => {
  it("reads common (1) and winners (2: user_id 1, asset_id 2, notify 3)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastHourlyRankRewardMessage")),
      fields.message(
        2,
        fields.varint(1, 6_900_000_000_000_000_001n),
        fields.varint(2, 42),
        fields.message(
          3,
          fields.string(4, "Nick won"),
          fields.message(5, fields.string(3, "Nick")),
        ),
        fields.message(4, fields.varint(1, 1)), // avatar_border, not read
      ),
      fields.message(2, fields.varint(1, 2), fields.varint(2, 43)),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastHourlyRankRewardMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      winners: [
        {
          userId: "6900000000000000001",
          assetId: "42",
          notify: {
            ...NOTIFY_DEFAULTS,
            content: "Nick won",
            user: {
              userId: "0",
              nickname: "Nick",
              displayId: "",
              badgeList: [],
            },
          },
        },
        { userId: "2", assetId: "43" },
      ],
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({ winners: [] });
    expect(decode(fields.message(2, fields.message(3)))).toStrictEqual({
      winners: [{ userId: "0", assetId: "0", notify: NOTIFY_DEFAULTS }],
    });
  });

  it("round-trips every field through the encoder", () => {
    const reward: HourlyRankRewardMessage = {
      common: sampleCommon("WebcastHourlyRankRewardMessage"),
      winners: [
        {
          userId: "6900000000000000001",
          assetId: "7800000000000000001",
          notify: {
            common: sampleCommon("WebcastRoomNotifyMessage"),
            notifyType: 7,
            content: "won the hour",
            user: SAMPLE_USER,
            fromUserId: "6900000000000000001",
            toAnchorId: "6900000000000000002",
          },
        },
        { userId: "6900000000000000003", assetId: "7800000000000000002" },
      ],
    };
    expect(
      decode(encodeMessage(HourlyRankRewardMessageSchema, reward)),
    ).toStrictEqual(reward);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(
        2,
        unknownFields(),
        fields.varint(2, 5),
        fields.message(3, unknownFields(), fields.varint(3, 9)),
      ),
      unknownFields(1_000),
    );
    expect(decode(bytes)).toStrictEqual({
      winners: [
        {
          userId: "0",
          assetId: "5",
          notify: { ...NOTIFY_DEFAULTS, notifyType: 9 },
        },
      ],
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 0a", // winners (2), 10 bytes
        "08 07", //   user_id (1): 7
        "10 08", //   asset_id (2): 8
        "1a 04", //   notify (3), 4 bytes
        "22 02 68 69", //     content (4): "hi"
        "12 02", // winners (2), 2 bytes
        "08 09", //   user_id (1): 9
      ].join(" "),
    );
    const reward: HourlyRankRewardMessage = {
      winners: [
        {
          userId: "7",
          assetId: "8",
          notify: { ...NOTIFY_DEFAULTS, content: "hi" },
        },
        { userId: "9", assetId: "0" },
      ],
    };
    expect(decode(bytes)).toStrictEqual(reward);
    expect(toHex(encodeMessage(HourlyRankRewardMessageSchema, reward))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with 64-bit ids, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "1a 00", // an unknown field (3), 0 bytes
        "12 16", // winners (2), 22 bytes
        "10 81 80 90 cf b0 99 85 d9 66", //   asset_id (2): 7400000000000000001
        "08 81 80 c8 b1 93 ae ee e0 5f", //   user_id (1): 6900000000000000001
        "22 00", //   avatar_border (4), not read, 0 bytes
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      winners: [
        { userId: "6900000000000000001", assetId: "7400000000000000001" },
      ],
    });
  });
});
