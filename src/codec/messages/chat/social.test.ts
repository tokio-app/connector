import { describe, expect, it } from "vitest";
import type { SocialMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { SocialMessageSchema } from "./social.js";
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

// Field numbers: WebcastSocialMessage in webcast/model/message/messages.proto.
// The bytes are written field by field (fields.*) or by hand, not from the
// schema, so a wrong number in the table fails here.

const decode = (bytes: Uint8Array) => decodeMessage(SocialMessageSchema, bytes);

describe("SocialMessageSchema", () => {
  it("reads common (1), user (2), share_type (3), action (4), share_target (5), follow_count (6), share_count (8), follow_type (13) and target_user_id (14)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastSocialMessage"),
        fields.message(
          8,
          fields.string(1, "pm_main_follow_message_viewer_2"),
          fields.string(2, "{0:user} followed the LIVE creator"),
        ),
      ),
      fields.message(
        2,
        fields.varint(1, 6_900_000_000_000_000_001n),
        fields.string(3, "Nick"),
      ),
      fields.varint(3, 1),
      fields.varint(4, 1),
      fields.string(5, "whatsapp"),
      fields.varint(6, 12),
      fields.varint(7, 1), // share_display_style, not read
      fields.varint(8, 2),
      fields.varint(12, 3_000), // show_duration_ms, not read
      fields.varint(13, 1),
      fields.varint(14, 7_140_000_000_000_000_001n),
      fields.string(15, "live"), // scene, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastSocialMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
        displayText: {
          key: "pm_main_follow_message_viewer_2",
          defaultPattern: "{0:user} followed the LIVE creator",
        },
      },
      user: {
        userId: "6900000000000000001",
        nickname: "Nick",
        displayId: "",
        badgeList: [],
      },
      shareType: 1,
      action: 1,
      shareTarget: "whatsapp",
      followCount: 12,
      shareCount: 2,
      followType: 1,
      targetUserId: "7140000000000000001",
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      shareType: 0,
      action: 0,
      shareTarget: "",
      followCount: 0,
      shareCount: 0,
      followType: 0,
      targetUserId: "0",
    });
  });

  it("round-trips every field through the encoder", () => {
    const social: SocialMessage = {
      common: sampleCommon("WebcastSocialMessage", "pm_mt_guidance_share"),
      user: SAMPLE_USER,
      shareType: 3,
      action: 3,
      shareTarget: "copy_link",
      followCount: 12,
      shareCount: 4,
      followType: 1,
      targetUserId: "7140000000000000001",
    };
    expect(decode(encodeMessage(SocialMessageSchema, social))).toStrictEqual(
      social,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(
        1,
        unknownFields(),
        fields.message(8, unknownFields(), fields.string(1, "follow")),
      ),
      unknownFields(1_000),
      fields.message(2, unknownFields(), fields.string(38, "ann")),
      fields.varint(8, 1),
      fields.varint(14, 5),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
        displayText: { key: "follow", defaultPattern: "" },
      },
      user: { userId: "0", nickname: "", displayId: "ann", badgeList: [] },
      shareType: 0,
      action: 0,
      shareTarget: "",
      followCount: 0,
      shareCount: 1,
      followType: 0,
      targetUserId: "5",
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "0a 0a", // common (1), 10 bytes
        "42 08", //   display_text (8), 8 bytes
        "0a 06 66 6f 6c 6c 6f 77", //     key (1): "follow"
        "12 02", // user (2), 2 bytes
        "08 07", //   id (1): 7
        "18 01", // share_type (3): 1
        "20 02", // action (4): 2
        "2a 08 77 68 61 74 73 61 70 70", // share_target (5): "whatsapp"
        "30 05", // follow_count (6): 5
        "40 03", // share_count (8): 3
        "68 01", // follow_type (13): 1
        "70 09", // target_user_id (14): 9
      ].join(" "),
    );
    const social: SocialMessage = {
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
        displayText: { key: "follow", defaultPattern: "" },
      },
      user: { userId: "7", nickname: "", displayId: "", badgeList: [] },
      shareType: 1,
      action: 2,
      shareTarget: "whatsapp",
      followCount: 5,
      shareCount: 3,
      followType: 1,
      targetUserId: "9",
    };
    expect(decode(bytes)).toStrictEqual(social);
    expect(toHex(encodeMessage(SocialMessageSchema, social))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with negative and large int64s, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "70 81 80 a8 82 bb 85 98 8b 63", // target_user_id (14): 7140000000000000001
        "30 0c", // follow_count (6): 12
        "20 80 80 80 80 80 20", // action (4): 2^40
        "18 ff ff ff ff ff ff ff ff ff 01", // share_type (3): -1
        "0a 2e", // common (1), 46 bytes
        "0a 14 57 65 62 63 61 73 74 53 6f 63 69 61 6c 4d 65 73 73 61 67 65", //   method (1): "WebcastSocialMessage"
        "42 16", //   display_text (8), 22 bytes
        "0a 14 70 6d 5f 6d 74 5f 67 75 69 64 61 6e 63 65 5f 73 68 61 72 65", //     key (1): "pm_mt_guidance_share"
        "38 01", // share_display_style (7), not read
        "68 ff ff ff ff 0f", // follow_type (13): -1
        "7a 04 6c 69 76 65", // scene (15), not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastSocialMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
        displayText: { key: "pm_mt_guidance_share", defaultPattern: "" },
      },
      shareType: -1,
      action: 2 ** 40,
      shareTarget: "",
      followCount: 12,
      shareCount: 0,
      followType: -1,
      targetUserId: "7140000000000000001",
    });
  });
});
