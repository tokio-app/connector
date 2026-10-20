import { describe, expect, it, vi } from "vitest";
import type { LikeMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LikeMessageSchema } from "./like.js";
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

// Field numbers: WebcastLikeMessage in webcast/model/message/messages.proto.
// The bytes are written field by field (fields.*) or by hand, not from the
// schema, so a wrong number in the table fails here.

const decode = (bytes: Uint8Array) => decodeMessage(LikeMessageSchema, bytes);

describe("LikeMessageSchema", () => {
  it("reads common (1), count (2), total (3) and user (5)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastLikeMessage"),
        fields.message(8, fields.string(1, "pm_mt_msg_viewer_like")),
      ),
      fields.varint(2, 15),
      fields.varint(3, 123_456),
      fields.varint(4, 1), // color, not read
      fields.message(
        5,
        fields.varint(1, 6_900_000_000_000_000_001n),
        fields.string(38, "fan"),
      ),
      fields.string(6, "icon"), // icon, not read
      fields.message(7, fields.string(2, "tos/like")), // icons, not read
      fields.varint(9, 2), // effect_cnt, not read
      fields.varint(12, 3), // room_message_heat_level, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastLikeMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
        displayText: { key: "pm_mt_msg_viewer_like", defaultPattern: "" },
      },
      count: 15,
      total: 123_456,
      user: {
        userId: "6900000000000000001",
        nickname: "",
        displayId: "fan",
        badgeList: [],
      },
    });
  });

  it("reports a total (int64) past Number.MAX_SAFE_INTEGER", () => {
    const onUnsafeInteger = vi.fn();
    const like = decodeMessage(
      LikeMessageSchema,
      fields.varint(3, 2n ** 53n + 1n),
      { onUnsafeInteger },
    );
    expect(like.total).toBe(2 ** 53);
    expect(onUnsafeInteger).toHaveBeenCalledWith(
      "WebcastLikeMessage.total",
      2n ** 53n + 1n,
    );
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({ count: 0, total: 0 });
  });

  it("round-trips every field through the encoder", () => {
    const like: LikeMessage = {
      common: sampleCommon("WebcastLikeMessage"),
      user: SAMPLE_USER,
      count: 15,
      total: Number.MAX_SAFE_INTEGER,
    };
    expect(decode(encodeMessage(LikeMessageSchema, like))).toStrictEqual(like);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.varint(2, 1),
      fields.message(5, unknownFields(), fields.string(3, "Ann")),
      unknownFields(1_000),
      fields.message(1, unknownFields(), fields.varint(2, 5)),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "5",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      count: 1,
      total: 0,
      user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 0f", // count (2): 15
        "18 e8 07", // total (3): 1000
        "2a 04", // user (5), 4 bytes
        "1a 02 4c 69", //   nickname (3): "Li"
      ].join(" "),
    );
    const like: LikeMessage = {
      count: 15,
      total: 1_000,
      user: { userId: "0", nickname: "Li", displayId: "", badgeList: [] },
    };
    expect(decode(bytes)).toStrictEqual(like);
    expect(toHex(encodeMessage(LikeMessageSchema, like))).toBe(toHex(bytes));
  });

  it("reads hand-assembled bytes with the largest safe total, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "0a 02", // common (1), 2 bytes
        "10 05", //   msg_id (2): 5
        "20 03", // color (4), not read
        "18 ff ff ff ff ff ff ff 0f", // total (3): 2^53 - 1
        "10 01", // count (2): 1
        "32 01 78", // icon (6), not read
        "48 02", // effect_cnt (9), not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "5",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      count: 1,
      total: Number.MAX_SAFE_INTEGER,
    });
  });
});
