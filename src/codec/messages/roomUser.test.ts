import { describe, expect, it, vi } from "vitest";
import type { RoomUserMessage } from "../../events.js";
import { decodeMessage } from "../decode.js";
import { RoomUserMessageSchema } from "./roomUser.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../test/helpers/encoder.js";
import {
  SAMPLE_USER,
  sampleCommon,
  unknownFields,
} from "../../../test/helpers/samples.js";

// Field numbers: WebcastRoomUserSeqMessage and Contributor in
// webcast/model/message/messages.proto. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(RoomUserMessageSchema, bytes);

describe("RoomUserMessageSchema", () => {
  it("reads common (1), ranks (2: score 1, user 2, rank 3), total (3) and total_user (7)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastRoomUserSeqMessage")),
      fields.message(
        2,
        fields.varint(1, 1_500),
        fields.message(2, fields.string(3, "Top")),
        fields.varint(3, 1),
        fields.varint(4, 10), // delta, not read
      ),
      fields.message(2, fields.varint(1, 700), fields.varint(3, 2)),
      fields.varint(3, 1_234),
      fields.string(4, "1.2K"), // pop_str, not read
      fields.message(5, fields.varint(1, 1)), // seats, not read
      fields.varint(6, 99), // popularity, not read
      fields.varint(7, 56_789),
      fields.varint(8, 3), // anonymous, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastRoomUserSeqMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      ranks: [
        {
          score: 1_500,
          user: { userId: "0", nickname: "Top", displayId: "", badgeList: [] },
          rank: 1,
        },
        { score: 700, rank: 2 },
      ],
      total: 1_234,
      totalUser: 56_789,
    });
  });

  it("reports counts (int64) past Number.MAX_SAFE_INTEGER, with their paths", () => {
    const onUnsafeInteger = vi.fn();
    const unsafe = 2n ** 60n;
    const roomUser = decodeMessage(
      RoomUserMessageSchema,
      concat(
        fields.message(2, fields.varint(1, unsafe), fields.varint(3, unsafe)),
        fields.varint(3, unsafe),
        fields.varint(7, unsafe),
      ),
      { onUnsafeInteger },
    );
    expect(roomUser).toStrictEqual({
      ranks: [{ score: 2 ** 60, rank: 2 ** 60 }],
      total: 2 ** 60,
      totalUser: 2 ** 60,
    });
    expect(onUnsafeInteger.mock.calls).toEqual([
      ["Contributor.score", unsafe],
      ["Contributor.rank", unsafe],
      ["WebcastRoomUserSeqMessage.total", unsafe],
      ["WebcastRoomUserSeqMessage.totalUser", unsafe],
    ]);
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      ranks: [],
      total: 0,
      totalUser: 0,
    });
    expect(decode(fields.message(2)).ranks).toStrictEqual([
      { score: 0, rank: 0 },
    ]);
  });

  it("round-trips every field through the encoder", () => {
    const roomUser: RoomUserMessage = {
      common: sampleCommon("WebcastRoomUserSeqMessage"),
      total: 1_234,
      totalUser: 56_789,
      ranks: [
        { user: SAMPLE_USER, score: 1_500, rank: 1 },
        { score: 700, rank: 2 },
        { user: SAMPLE_USER, score: 0, rank: 3 },
      ],
    };
    expect(
      decode(encodeMessage(RoomUserMessageSchema, roomUser)),
    ).toStrictEqual(roomUser);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(
        2,
        unknownFields(),
        fields.message(2, unknownFields(), fields.string(3, "Ann")),
        fields.varint(3, 1),
      ),
      unknownFields(1_000),
      fields.varint(3, 10),
    );
    expect(decode(bytes)).toStrictEqual({
      ranks: [
        {
          score: 0,
          user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
          rank: 1,
        },
      ],
      total: 10,
      totalUser: 0,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 08", // ranks (2), 8 bytes
        "08 64", //   score (1): 100
        "12 02", //   user (2), 2 bytes
        "08 01", //     id (1): 1
        "18 01", //   rank (3): 1
        "12 04", // ranks (2), 4 bytes
        "08 32", //   score (1): 50
        "18 02", //   rank (3): 2
        "18 c8 01", // total (3): 200
        "38 e8 07", // total_user (7): 1000
      ].join(" "),
    );
    const roomUser: RoomUserMessage = {
      ranks: [
        {
          score: 100,
          user: { userId: "1", nickname: "", displayId: "", badgeList: [] },
          rank: 1,
        },
        { score: 50, rank: 2 },
      ],
      total: 200,
      totalUser: 1_000,
    };
    expect(decode(bytes)).toStrictEqual(roomUser);
    expect(toHex(encodeMessage(RoomUserMessageSchema, roomUser))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with ranks between unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "22 03 31 2e 32", // pop_str (4), not read
        "38 05", // total_user (7): 5
        "12 04", // ranks (2), 4 bytes
        "18 01", //   rank (3): 1
        "20 0a", //   delta (4), not read
        "2a 02", // seats (5), not read, 2 bytes
        "08 09", //   score (1): 9
        "30 63", // popularity (6), not read
        "12 02", // ranks (2), 2 bytes
        "08 07", //   score (1): 7
        "40 01", // anonymous (8), not read
        "18 03", // total (3): 3
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      ranks: [
        { score: 0, rank: 1 },
        { score: 7, rank: 0 },
      ],
      total: 3,
      totalUser: 5,
    });
  });
});
