import { describe, expect, it } from "vitest";
import {
  AuditStatus,
  CommentTag,
  EmoteScene,
  EmoteType,
  type ChatMessage,
} from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { ChatMessageSchema } from "./chat.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../../test/helpers/encoder.js";
import {
  SAMPLE_IMAGE,
  SAMPLE_USER,
  sampleCommon,
  unknownFields,
} from "../../../../test/helpers/samples.js";

// Field numbers: WebcastChatMessage in webcast/model/message/messages.proto,
// EmoteWithIndex and EmoteModel in webcast/model/base/emoji.proto; the
// constants' values in webcast/model/data/messages.proto and
// webcast/synthetic_enums.proto. The bytes
// are written field by field (fields.*) or by hand, not from the schema, so a
// wrong number in the table fails here.

const decode = (bytes: Uint8Array) => decodeMessage(ChatMessageSchema, bytes);

describe("CommentTag, AuditStatus, EmoteType and EmoteScene", () => {
  it("have the values of webcast.im.CommentTag and webcast.model.data's AuditStatus, EmoteType and EmoteScene", () => {
    expect(CommentTag).toEqual({ NORMAL: 0, CANDIDATE: 1, OVERAGE: 2 });
    expect(AuditStatus).toEqual({
      UNKNOWN: 0,
      PASS: 1,
      FAILED: 2,
      REVIEWING: 3,
      FORBIDDEN: 4,
    });
    expect(EmoteType).toEqual({ NORMAL: 0, WITH_STICKER: 1, FANS: 2 });
    expect(EmoteScene).toEqual({ SUBSCRIPTION: 0, GAME: 1, FANS_CLUB: 2 });
    for (const constant of [CommentTag, AuditStatus, EmoteType, EmoteScene]) {
      expect(Object.isFrozen(constant)).toBe(true);
    }
  });
});

describe("ChatMessageSchema", () => {
  it("reads common (1), user (2), content (3), at_user (12), emotes (13), content_language (14), msg_filter (15), user_identity (18), comment_tag (20) and mention_users (28)", () => {
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
      fields.message(12, fields.varint(1, 1), fields.string(3, "At")),
      fields.message(
        13,
        fields.varint(1, 3),
        fields.message(
          2,
          fields.string(1, "7300000000000000001"),
          fields.message(2, fields.string(2, "tos/e")),
          fields.varint(3, 1),
          fields.string(4, "uuid"), // uuid, not read
          fields.varint(5, 1),
          fields.varint(6, 1), // content_source, not read
          fields.varint(12, 1_760_000_000), // create_time, not read
          fields.varint(13, 2),
        ),
      ),
      fields.message(13, fields.varint(1, 9)),
      fields.string(14, "en"),
      fields.message(15, fields.varint(1, 1), fields.varint(2, 1)),
      fields.varint(16, 1), // quick_chat_scene, not read
      fields.message(
        18,
        fields.varint(1, 1), // is_gift_giver_of_anchor, not read
        fields.varint(2, 1),
        fields.varint(4, 1),
        fields.varint(5, 1),
        fields.varint(6, 1), // is_anchor, not read
      ),
      fields.message(19), // comment_quality_scores, not read
      fields.varint(20, 1),
      fields.varint(20, 2),
      fields.varint(22, 1_760_000_000), // screen_time, not read
      fields.varint(27, 6_900_000_000_000_000_002n), // mention_user_list, not read
      fields.message(
        28,
        fields.varint(1, 6_900_000_000_000_000_002n),
        fields.string(38, "mentioned"),
      ),
      fields.message(28, fields.string(3, "Other")),
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
      atUser: { userId: "1", nickname: "At", displayId: "", badgeList: [] },
      emotes: [
        {
          index: 3,
          emote: {
            emoteId: "7300000000000000001",
            image: { urlList: [], uri: "tos/e" },
            auditStatus: AuditStatus.PASS,
            emoteType: EmoteType.WITH_STICKER,
            emoteScene: EmoteScene.FANS_CLUB,
          },
        },
        { index: 9 },
      ],
      contentLanguage: "en",
      msgFilter: { isGifter: true, isSubscribedToAnchor: true },
      userIdentity: {
        isSubscriberOfAnchor: true,
        isFollowerOfAnchor: true,
        isModeratorOfAnchor: true,
      },
      commentTag: [CommentTag.CANDIDATE, CommentTag.OVERAGE],
      mentionUsers: [
        {
          userId: "6900000000000000002",
          nickname: "",
          displayId: "mentioned",
          badgeList: [],
        },
        { userId: "0", nickname: "Other", displayId: "", badgeList: [] },
      ],
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      content: "",
      contentLanguage: "",
      emotes: [],
      commentTag: [],
      mentionUsers: [],
    });
    expect(
      decode(concat(fields.message(13), fields.message(13, fields.message(2))))
        .emotes,
    ).toStrictEqual([
      { index: 0 },
      {
        index: 0,
        emote: { emoteId: "", auditStatus: 0, emoteType: 0, emoteScene: 0 },
      },
    ]);
    expect(decode(fields.message(28)).mentionUsers).toStrictEqual([
      { userId: "0", nickname: "", displayId: "", badgeList: [] },
    ]);
  });

  it("round-trips every field through the encoder", () => {
    const chat: ChatMessage = {
      common: sampleCommon("WebcastChatMessage"),
      user: SAMPLE_USER,
      atUser: {
        userId: "6900000000000000002",
        nickname: "Bea",
        displayId: "bea",
        badgeList: [],
      },
      msgFilter: { isGifter: true, isSubscribedToAnchor: false },
      userIdentity: {
        isSubscriberOfAnchor: true,
        isFollowerOfAnchor: false,
        isModeratorOfAnchor: true,
      },
      content: "héllo [wave] [smile] @bea",
      contentLanguage: "es",
      emotes: [
        {
          index: 6,
          emote: {
            emoteId: "7300000000000000001",
            image: SAMPLE_IMAGE,
            auditStatus: AuditStatus.REVIEWING,
            emoteType: EmoteType.FANS,
            emoteScene: EmoteScene.GAME,
          },
        },
        {
          index: 14,
          emote: {
            emoteId: "7300000000000000002",
            auditStatus: 0,
            emoteType: 0,
            emoteScene: 7,
          },
        },
        { index: 20 },
      ],
      commentTag: [CommentTag.OVERAGE, CommentTag.NORMAL, 9],
      mentionUsers: [
        SAMPLE_USER,
        {
          userId: "6900000000000000003",
          nickname: "Cal",
          displayId: "cal",
          badgeList: [],
        },
      ],
    };
    expect(decode(encodeMessage(ChatMessageSchema, chat))).toStrictEqual(chat);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.string(3, "hi"),
      fields.message(2, unknownFields(), fields.string(3, "Ann")),
      fields.message(12, unknownFields(), fields.string(3, "At")),
      fields.message(
        13,
        fields.varint(1, 1),
        unknownFields(),
        fields.message(2, unknownFields(), fields.string(1, "e1")),
      ),
      unknownFields(1_000),
      fields.message(15, unknownFields(), fields.varint(2, 1)),
      fields.message(18, unknownFields(), fields.varint(5, 1)),
      fields.message(28, unknownFields(), fields.string(38, "m1")),
    );
    expect(decode(bytes)).toStrictEqual({
      user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
      content: "hi",
      atUser: { userId: "0", nickname: "At", displayId: "", badgeList: [] },
      emotes: [
        {
          index: 1,
          emote: { emoteId: "e1", auditStatus: 0, emoteType: 0, emoteScene: 0 },
        },
      ],
      contentLanguage: "",
      msgFilter: { isGifter: false, isSubscribedToAnchor: true },
      userIdentity: {
        isSubscriberOfAnchor: false,
        isFollowerOfAnchor: false,
        isModeratorOfAnchor: true,
      },
      commentTag: [],
      mentionUsers: [
        { userId: "0", nickname: "", displayId: "m1", badgeList: [] },
      ],
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 07", // user (2), 7 bytes
        "08 01", //   id (1): 1
        "1a 03 41 6e 6e", //   nickname (3): "Ann"
        "1a 02 68 69", // content (3): "hi"
        "62 02", // at_user (12), 2 bytes
        "08 02", //   id (1): 2
        "6a 0e", // emotes (13), 14 bytes
        "08 02", //   index (1): 2
        "12 0a", //   emote (2), 10 bytes
        "0a 02 65 31", //     emote_id (1): "e1"
        "18 01", //     audit_status (3): 1
        "28 02", //     emote_type (5): 2
        "68 01", //     emote_scene (13): 1
        "72 02 65 6e", // content_language (14): "en"
        "7a 02", // msg_filter (15), 2 bytes
        "08 01", //   is_gifter (1): true
        "92 01 02", // user_identity (18), 2 bytes
        "10 01", //   is_subscriber_of_anchor (2): true
        "a0 01 01", // comment_tag (20): 1
        "a0 01 02", // comment_tag (20): 2
        "e2 01 05", // mention_users (28), 5 bytes
        "1a 03 42 6f 62", //   nickname (3): "Bob"
      ].join(" "),
    );
    const chat: ChatMessage = {
      user: { userId: "1", nickname: "Ann", displayId: "", badgeList: [] },
      content: "hi",
      atUser: { userId: "2", nickname: "", displayId: "", badgeList: [] },
      emotes: [
        {
          index: 2,
          emote: { emoteId: "e1", auditStatus: 1, emoteType: 2, emoteScene: 1 },
        },
      ],
      contentLanguage: "en",
      msgFilter: { isGifter: true, isSubscribedToAnchor: false },
      userIdentity: {
        isSubscriberOfAnchor: true,
        isFollowerOfAnchor: false,
        isModeratorOfAnchor: false,
      },
      commentTag: [1, 2],
      mentionUsers: [
        { userId: "0", nickname: "Bob", displayId: "", badgeList: [] },
      ],
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
        "e2 01 02", // mention_users (28), 2 bytes
        "08 09", //   id (1): 9
        "20 01", // visible_to_sender (4), not read
        "12 0e", // user (2), 14 bytes
        "b2 02 03 61 6e 6e", //   display_id (38): "ann"
        "82 04 05", //   badge_list (64), 5 bytes
        "62 03", //     privilege_log_extra (12), 3 bytes
        "2a 01 37", //       level (5): "7"
        "6a 12", // emotes (13), 18 bytes
        "08 00", //   index (1): 0
        "12 0e", //   emote (2), 14 bytes
        "68 02", //     emote_scene (13): 2
        "0a 01 61", //     emote_id (1): "a"
        "18 04", //     audit_status (3): 4
        "12 05", //     image (2), 5 bytes
        "12 03 74 6f 73", //       uri (2): "tos"
        "45 01 00 00 00", // field 8, fixed32, not read
        "a2 01 02 02 00", // comment_tag (20), packed: 2, 0
        "da 01 02 05 06", // mention_user_list (27), packed, not read
        "6a 02", // emotes (13), 2 bytes
        "08 05", //   index (1): 5
        "7a 02", // msg_filter (15), 2 bytes
        "10 01", //   is_subscribed_to_anchor (2): true
        "1a 04 6f 6c c3 a9", // content (3): "olé"
        "99 06 01 00 00 00 00 00 00 00", // field 99, fixed64, not read
        "92 01 04", // user_identity (18), 4 bytes
        "20 01", //   is_follower_of_anchor (4): true
        "28 01", //   is_moderator_of_anchor (5): true
        "e2 01 00", // mention_users (28), empty
        "a0 01 01", // comment_tag (20): 1, after the packed ones
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
        badgeList: [{ sceneType: 0, privilegeLogExtra: { level: "7" } }],
      },
      content: "olé",
      emotes: [
        {
          index: 0,
          emote: {
            emoteId: "a",
            image: { urlList: [], uri: "tos" },
            auditStatus: AuditStatus.FORBIDDEN,
            emoteType: 0,
            emoteScene: 2,
          },
        },
        { index: 5 },
      ],
      contentLanguage: "",
      msgFilter: { isGifter: false, isSubscribedToAnchor: true },
      userIdentity: {
        isSubscriberOfAnchor: false,
        isFollowerOfAnchor: true,
        isModeratorOfAnchor: true,
      },
      commentTag: [2, 0, 1],
      mentionUsers: [
        { userId: "9", nickname: "", displayId: "", badgeList: [] },
        { userId: "0", nickname: "", displayId: "", badgeList: [] },
      ],
    });
  });
});
