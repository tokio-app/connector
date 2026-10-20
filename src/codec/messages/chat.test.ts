import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../events.js";
import { decodeMessage } from "../decode.js";
import { ChatMessageSchema } from "./chat.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../test/helpers/encoder.js";
import {
  SAMPLE_IMAGE,
  SAMPLE_USER,
  sampleCommon,
  unknownFields,
} from "../../../test/helpers/samples.js";

// Field numbers: WebcastChatMessage in webcast/model/message/messages.proto,
// EmoteWithIndex and EmoteModel in webcast/model/base/emoji.proto. The bytes
// are written field by field (fields.*) or by hand, not from the schema, so a
// wrong number in the table fails here.

const decode = (bytes: Uint8Array) => decodeMessage(ChatMessageSchema, bytes);

describe("ChatMessageSchema", () => {
  it("reads common (1), user (2), content (3), emotes (13), content_language (14) and user_identity (18)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastChatMessage"),
        fields.varint(4, 1_760_000_000_123),
      ),
      fields.message(
        2,
        fields.varint(1, 6_900_000_000_000_000_001n),
        fields.string(3, "Nick Name"),
      ),
      fields.string(3, "hi [wave]"),
      fields.varint(4, 1), // visible_to_sender, not read
      fields.message(12, fields.varint(1, 1)), // at_user, not read
      fields.message(
        13,
        fields.varint(1, 3),
        fields.message(
          2,
          fields.string(1, "7300000000000000001"),
          fields.message(2, fields.string(2, "tos/e")),
          fields.varint(5, 1), // emote_type, not read
        ),
      ),
      fields.message(13, fields.varint(1, 9)),
      fields.string(14, "en"),
      fields.message(
        18,
        fields.varint(1, 1), // is_gift_giver_of_anchor, not read
        fields.varint(2, 1),
        fields.varint(4, 1),
        fields.varint(5, 1),
        fields.varint(6, 1), // is_anchor, not read
      ),
      fields.varint(22, 1_760_000_000), // screen_time, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastChatMessage",
        msgId: "0",
        roomId: "0",
        createTime: "1760000000123",
        isShowMsg: false,
      },
      user: {
        userId: "6900000000000000001",
        nickname: "Nick Name",
        displayId: "",
        badgeList: [],
      },
      content: "hi [wave]",
      emotes: [
        {
          index: 3,
          emote: {
            emoteId: "7300000000000000001",
            image: { urlList: [], uri: "tos/e" },
          },
        },
        { index: 9 },
      ],
      contentLanguage: "en",
      userIdentity: {
        isSubscriberOfAnchor: true,
        isFollowerOfAnchor: true,
        isModeratorOfAnchor: true,
      },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      content: "",
      contentLanguage: "",
      emotes: [],
    });
    expect(
      decode(concat(fields.message(13), fields.message(13, fields.message(2))))
        .emotes,
    ).toStrictEqual([{ index: 0 }, { index: 0, emote: { emoteId: "" } }]);
  });

  it("round-trips every field through the encoder", () => {
    const chat: ChatMessage = {
      common: sampleCommon("WebcastChatMessage"),
      user: SAMPLE_USER,
      userIdentity: {
        isSubscriberOfAnchor: true,
        isFollowerOfAnchor: false,
        isModeratorOfAnchor: true,
      },
      content: "héllo [wave] [smile]",
      contentLanguage: "es",
      emotes: [
        {
          index: 6,
          emote: { emoteId: "7300000000000000001", image: SAMPLE_IMAGE },
        },
        { index: 14, emote: { emoteId: "7300000000000000002" } },
        { index: 20 },
      ],
    };
    expect(decode(encodeMessage(ChatMessageSchema, chat))).toStrictEqual(chat);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.string(3, "hi"),
      fields.message(2, unknownFields(), fields.string(3, "Ann")),
      fields.message(
        13,
        fields.varint(1, 1),
        unknownFields(),
        fields.message(2, unknownFields(), fields.string(1, "e1")),
      ),
      unknownFields(1_000),
      fields.message(18, unknownFields(), fields.varint(5, 1)),
    );
    expect(decode(bytes)).toStrictEqual({
      user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
      content: "hi",
      emotes: [{ index: 1, emote: { emoteId: "e1" } }],
      contentLanguage: "",
      userIdentity: {
        isSubscriberOfAnchor: false,
        isFollowerOfAnchor: false,
        isModeratorOfAnchor: true,
      },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 07", // user (2), 7 bytes
        "08 01", //   id (1): 1
        "1a 03 41 6e 6e", //   nickname (3): "Ann"
        "1a 02 68 69", // content (3): "hi"
        "6a 08", // emotes (13), 8 bytes
        "08 02", //   index (1): 2
        "12 04", //   emote (2), 4 bytes
        "0a 02 65 31", //     emote_id (1): "e1"
        "72 02 65 6e", // content_language (14): "en"
        "92 01 02", // user_identity (18), 2 bytes
        "10 01", //   is_subscriber_of_anchor (2): true
      ].join(" "),
    );
    const chat: ChatMessage = {
      user: { userId: "1", nickname: "Ann", displayId: "", badgeList: [] },
      content: "hi",
      emotes: [{ index: 2, emote: { emoteId: "e1" } }],
      contentLanguage: "en",
      userIdentity: {
        isSubscriberOfAnchor: true,
        isFollowerOfAnchor: false,
        isModeratorOfAnchor: false,
      },
    };
    expect(decode(bytes)).toStrictEqual(chat);
    expect(toHex(encodeMessage(ChatMessageSchema, chat))).toBe(toHex(bytes));
  });

  it("reads hand-assembled bytes with two-byte tags, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "0a 05", // common (1), 5 bytes
        "20 e8 07", //   create_time (4): 1000
        "30 01", //   is_show_msg (6): true
        "20 01", // visible_to_sender (4), not read
        "12 0e", // user (2), 14 bytes
        "b2 02 03 61 6e 6e", //   display_id (38): "ann"
        "82 04 05", //   badge_list (64), 5 bytes
        "62 03", //     privilege_log_extra (12), 3 bytes
        "2a 01 37", //       level (5): "7"
        "6a 0e", // emotes (13), 14 bytes
        "08 00", //   index (1): 0
        "12 0a", //   emote (2), 10 bytes
        "0a 01 61", //     emote_id (1): "a"
        "12 05", //     image (2), 5 bytes
        "12 03 74 6f 73", //       uri (2): "tos"
        "45 01 00 00 00", // field 8, fixed32, not read
        "6a 02", // emotes (13), 2 bytes
        "08 05", //   index (1): 5
        "1a 04 6f 6c c3 a9", // content (3): "olé"
        "99 06 01 00 00 00 00 00 00 00", // field 99, fixed64, not read
        "92 01 04", // user_identity (18), 4 bytes
        "20 01", //   is_follower_of_anchor (4): true
        "28 01", //   is_moderator_of_anchor (5): true
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: true,
      },
      user: {
        userId: "0",
        nickname: "",
        displayId: "ann",
        badgeList: [{ privilegeLogExtra: { level: "7" } }],
      },
      content: "olé",
      emotes: [
        {
          index: 0,
          emote: { emoteId: "a", image: { urlList: [], uri: "tos" } },
        },
        { index: 5 },
      ],
      contentLanguage: "",
      userIdentity: {
        isSubscriberOfAnchor: false,
        isFollowerOfAnchor: true,
        isModeratorOfAnchor: true,
      },
    });
  });
});
