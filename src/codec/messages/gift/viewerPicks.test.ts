import { describe, expect, it } from "vitest";
import type { ViewerPicksUpdateMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { ViewerPicksUpdateMessageSchema } from "./viewerPicks.js";
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

// Field numbers: WebcastViewerPicksUpdateMessage in
// webcast/model/message/messages.proto; ViewerPicksInfo, GiftPickWithScore and
// GiftPick in webcast/model/viewer_picks.proto. The bytes are written field
// by field (fields.*) or by hand, not from the schema, so a wrong number in
// the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(ViewerPicksUpdateMessageSchema, bytes);

const INFO_DEFAULTS = { viewerPicksId: "0", giftPickList: [], status: 0 };

describe("ViewerPicksUpdateMessageSchema", () => {
  it("reads common (1), update_type (2) and info (3: viewer_picks_id 1, gift_pick_list 2 with gift_pick 1 (gift_id 1, customized_desc 2, gift_price 4) and score 2, status 3)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastViewerPicksUpdateMessage")),
      fields.varint(2, 1),
      fields.message(
        3,
        fields.varint(1, 7_700_000_000_000_000_001n),
        fields.message(
          2,
          fields.message(
            1,
            fields.varint(1, 5655),
            fields.string(2, "Sing a song"),
            fields.message(3, fields.string(2, "tos/rose")), // gift_icon, not read
            fields.varint(4, 1),
            fields.varint(5, 3), // gift_pick_id, not read
            fields.string(6, "3"), // gift_pick_id_str, not read
          ),
          fields.varint(2, 12),
        ),
        fields.message(2, fields.varint(2, 3)),
        fields.varint(3, 2),
        fields.varint(4, 300), // round_duration_sec, not read
        fields.string(11, "7700000000000000001"), // viewer_picks_id_str, not read
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastViewerPicksUpdateMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      updateType: 1,
      info: {
        viewerPicksId: "7700000000000000001",
        giftPickList: [
          {
            giftPick: {
              giftId: "5655",
              customizedDesc: "Sing a song",
              giftPrice: 1,
            },
            score: 12,
          },
          { score: 3 },
        ],
        status: 2,
      },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({ updateType: 0 });
    expect(
      decode(fields.message(3, fields.message(2, fields.message(1)))),
    ).toStrictEqual({
      updateType: 0,
      info: {
        ...INFO_DEFAULTS,
        giftPickList: [
          {
            giftPick: { giftId: "0", customizedDesc: "", giftPrice: 0 },
            score: 0,
          },
        ],
      },
    });
  });

  it("round-trips every field through the encoder", () => {
    const update: ViewerPicksUpdateMessage = {
      common: sampleCommon("WebcastViewerPicksUpdateMessage"),
      updateType: 2,
      info: {
        viewerPicksId: "7700000000000000001",
        giftPickList: [
          {
            giftPick: { giftId: "5655", customizedDesc: "Sing", giftPrice: 1 },
            score: 12,
          },
          {
            giftPick: { giftId: "6", customizedDesc: "Dance", giftPrice: 99 },
            score: 3,
          },
        ],
        status: 1,
      },
    };
    expect(
      decode(encodeMessage(ViewerPicksUpdateMessageSchema, update)),
    ).toStrictEqual(update);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.varint(2, 3),
      fields.message(
        3,
        unknownFields(),
        fields.message(
          2,
          unknownFields(),
          fields.message(1, unknownFields(), fields.string(2, "x")),
        ),
      ),
      unknownFields(1_000),
    );
    expect(decode(bytes)).toStrictEqual({
      updateType: 3,
      info: {
        ...INFO_DEFAULTS,
        giftPickList: [
          {
            giftPick: { giftId: "0", customizedDesc: "x", giftPrice: 0 },
            score: 0,
          },
        ],
      },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 01", // update_type (2): 1
        "1a 11", // info (3), 17 bytes
        "08 09", //   viewer_picks_id (1): 9
        "12 0b", //   gift_pick_list (2), 11 bytes
        "0a 07", //     gift_pick (1), 7 bytes
        "08 05", //       gift_id (1): 5
        "12 01 64", //       customized_desc (2): "d"
        "20 02", //       gift_price (4): 2
        "10 07", //     score (2): 7
        "18 01", //   status (3): 1
      ].join(" "),
    );
    const update: ViewerPicksUpdateMessage = {
      updateType: 1,
      info: {
        viewerPicksId: "9",
        giftPickList: [
          {
            giftPick: { giftId: "5", customizedDesc: "d", giftPrice: 2 },
            score: 7,
          },
        ],
        status: 1,
      },
    };
    expect(decode(bytes)).toStrictEqual(update);
    expect(toHex(encodeMessage(ViewerPicksUpdateMessageSchema, update))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with 64-bit ids, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "1a 1d", // info (3), 29 bytes
        "18 02", //   status (3): 2
        "20 ac 02", //   round_duration_sec (4), not read
        "12 0c", //   gift_pick_list (2), 12 bytes
        "10 03", //     score (2): 3
        "0a 08", //     gift_pick (1), 8 bytes
        "28 01", //       gift_pick_id (5), not read
        "20 e8 07", //       gift_price (4): 1000
        "08 97 2c", //       gift_id (1): 5655
        "08 81 80 90 cf b0 99 85 d9 66", //   viewer_picks_id (1): 7400000000000000001
        "10 ff ff ff ff ff ff ff ff ff 01", // update_type (2): -1
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      updateType: -1,
      info: {
        viewerPicksId: "7400000000000000001",
        giftPickList: [
          {
            giftPick: { giftId: "5655", customizedDesc: "", giftPrice: 1_000 },
            score: 3,
          },
        ],
        status: 2,
      },
    });
  });
});
