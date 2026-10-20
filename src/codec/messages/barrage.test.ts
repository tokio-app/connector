import { describe, expect, it } from "vitest";
import type { BarrageMessage } from "../../events.js";
import { decodeMessage } from "../decode.js";
import { BarrageMessageSchema } from "./barrage.js";
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

// Field numbers: WebcastBarrageMessage in webcast/model/message/messages.proto;
// content (5) and common_barrage_content (24) are webcast.model.message.common
// Texts (model/message/common.proto). The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(BarrageMessageSchema, bytes);

describe("BarrageMessageSchema", () => {
  it("reads common (1), content (5), common_barrage_content (24) and user (50)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastBarrageMessage")),
      fields.message(2, fields.varint(1, 1)), // event, not read
      fields.varint(3, 1), // msg_type, not read
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
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({});
    expect(decode(concat(fields.message(5), fields.message(24)))).toStrictEqual(
      {
        content: { key: "", defaultPattern: "" },
        commonBarrageContent: { key: "", defaultPattern: "" },
      },
    );
  });

  it("round-trips every field through the encoder", () => {
    const barrage: BarrageMessage = {
      common: sampleCommon("WebcastBarrageMessage"),
      user: SAMPLE_USER,
      content: { key: "ttlive_superfan_x", defaultPattern: "{0:user}" },
      commonBarrageContent: { key: "ttlive_superfan_y", defaultPattern: "" },
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
    );
    expect(decode(bytes)).toStrictEqual({
      content: { key: "k1", defaultPattern: "" },
      commonBarrageContent: { key: "k2", defaultPattern: "" },
      user: { userId: "0", nickname: "", displayId: "ann", badgeList: [] },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "2a 04", // content (5), 4 bytes
        "0a 02 6b 31", //   key (1): "k1"
        "c2 01 04", // common_barrage_content (24), 4 bytes
        "0a 02 6b 32", //   key (1): "k2"
        "92 03 02", // user (50), 2 bytes
        "08 05", //   id (1): 5
      ].join(" "),
    );
    const barrage: BarrageMessage = {
      content: { key: "k1", defaultPattern: "" },
      commonBarrageContent: { key: "k2", defaultPattern: "" },
      user: { userId: "5", nickname: "", displayId: "", badgeList: [] },
    };
    expect(decode(bytes)).toStrictEqual(barrage);
    expect(toHex(encodeMessage(BarrageMessageSchema, barrage))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with two-byte tags and unknown fields", () => {
    const bytes = fromHex(
      [
        "18 01", // msg_type (3), not read
        "2a 1b", // content (5), 27 bytes
        "0a 0f 74 74 6c 69 76 65 5f 73 75 70 65 72 66 61 6e", //   key (1): "ttlive_superfan"
        "12 08 7b 30 3a 75 73 65 72 7d", //   default_pattern (2): "{0:user}"
        "50 01", // gallery_gift_id (10), not read
        "82 01 02", // badge (16), not read, 2 bytes
        "18 04", //   scene_type (3): 4
        "92 03 05", // user (50), 5 bytes
        "b2 02 02 6a 6f", //   display_id (38): "jo"
        "ba 06 03", // privilege_log_extra (103), not read, 3 bytes
        "2a 01 39", //   level (5): "9"
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      content: { key: "ttlive_superfan", defaultPattern: "{0:user}" },
      user: { userId: "0", nickname: "", displayId: "jo", badgeList: [] },
    });
  });
});
