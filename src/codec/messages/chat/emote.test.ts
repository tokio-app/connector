import { describe, expect, it } from "vitest";
import type { EmoteChatMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { EmoteChatMessageSchema } from "./emote.js";
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

// Field numbers: WebcastEmoteChatMessage in
// webcast/model/message/messages.proto, EmoteModel in
// webcast/model/base/emoji.proto. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(EmoteChatMessageSchema, bytes);

describe("EmoteChatMessageSchema", () => {
  it("reads common (1), user (2), emote_list (3), msg_filter (4) and user_identity (5)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastEmoteChatMessage"),
        fields.varint(4, 1_760_000_000_123),
      ),
      fields.message(
        2,
        fields.varint(1, 6_900_000_000_000_000_001n),
        fields.string(3, "Nick Name"),
      ),
      fields.message(
        3,
        fields.string(1, "7300000000000000001"),
        fields.message(2, fields.string(2, "tos/e")),
        fields.varint(3, 1),
        fields.string(4, "uuid"), // uuid, not read
        fields.varint(5, 2),
        fields.varint(12, 1_760_000_000), // create_time, not read
        fields.varint(13, 2),
      ),
      fields.message(3, fields.string(1, "7300000000000000002")),
      fields.message(4, fields.varint(1, 1), fields.varint(2, 1)),
      fields.message(
        5,
        fields.varint(1, 1), // is_gift_giver_of_anchor, not read
        fields.varint(2, 1),
        fields.varint(4, 1),
        fields.varint(5, 1),
        fields.varint(6, 1), // is_anchor, not read
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastEmoteChatMessage",
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
      emoteList: [
        {
          emoteId: "7300000000000000001",
          image: { urlList: [], uri: "tos/e" },
          auditStatus: 1,
          emoteType: 2,
          emoteScene: 2,
        },
        {
          emoteId: "7300000000000000002",
          auditStatus: 0,
          emoteType: 0,
          emoteScene: 0,
        },
      ],
      msgFilter: { isGifter: true, isSubscribedToAnchor: true },
      userIdentity: {
        isSubscriberOfAnchor: true,
        isFollowerOfAnchor: true,
        isModeratorOfAnchor: true,
      },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({ emoteList: [] });
    expect(decode(fields.message(3)).emoteList).toStrictEqual([
      { emoteId: "", auditStatus: 0, emoteType: 0, emoteScene: 0 },
    ]);
  });

  it("round-trips every field through the encoder", () => {
    const emote: EmoteChatMessage = {
      common: sampleCommon("WebcastEmoteChatMessage"),
      user: SAMPLE_USER,
      emoteList: [
        {
          emoteId: "7300000000000000001",
          image: SAMPLE_IMAGE,
          auditStatus: 3,
          emoteType: 1,
          emoteScene: 1,
        },
        {
          emoteId: "7300000000000000002",
          auditStatus: 1,
          emoteType: 0,
          emoteScene: 0,
        },
      ],
      msgFilter: { isGifter: false, isSubscribedToAnchor: true },
      userIdentity: {
        isSubscriberOfAnchor: true,
        isFollowerOfAnchor: true,
        isModeratorOfAnchor: false,
      },
    };
    expect(decode(encodeMessage(EmoteChatMessageSchema, emote))).toStrictEqual(
      emote,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(2, unknownFields(), fields.string(3, "Ann")),
      fields.message(
        3,
        unknownFields(),
        fields.string(1, "e1"),
        fields.message(2, unknownFields(), fields.string(2, "tos")),
      ),
      unknownFields(1_000),
      fields.message(4, unknownFields(), fields.varint(1, 1)),
      fields.message(5, unknownFields(), fields.varint(4, 1)),
    );
    expect(decode(bytes)).toStrictEqual({
      user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
      emoteList: [
        {
          emoteId: "e1",
          image: { urlList: [], uri: "tos" },
          auditStatus: 0,
          emoteType: 0,
          emoteScene: 0,
        },
      ],
      msgFilter: { isGifter: true, isSubscribedToAnchor: false },
      userIdentity: {
        isSubscriberOfAnchor: false,
        isFollowerOfAnchor: true,
        isModeratorOfAnchor: false,
      },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 02", // user (2), 2 bytes
        "08 07", //   id (1): 7
        "1a 0b", // emote_list (3), 11 bytes
        "0a 02 65 31", //   emote_id (1): "e1"
        "12 03", //   image (2), 3 bytes
        "12 01 74", //     uri (2): "t"
        "28 01", //   emote_type (5): 1
        "1a 06", // emote_list (3), 6 bytes
        "0a 02 65 32", //   emote_id (1): "e2"
        "68 02", //   emote_scene (13): 2
        "22 02", // msg_filter (4), 2 bytes
        "10 01", //   is_subscribed_to_anchor (2): true
        "2a 02", // user_identity (5), 2 bytes
        "28 01", //   is_moderator_of_anchor (5): true
      ].join(" "),
    );
    const emote: EmoteChatMessage = {
      user: { userId: "7", nickname: "", displayId: "", badgeList: [] },
      emoteList: [
        {
          emoteId: "e1",
          image: { urlList: [], uri: "t" },
          auditStatus: 0,
          emoteType: 1,
          emoteScene: 0,
        },
        { emoteId: "e2", auditStatus: 0, emoteType: 0, emoteScene: 2 },
      ],
      msgFilter: { isGifter: false, isSubscribedToAnchor: true },
      userIdentity: {
        isSubscriberOfAnchor: false,
        isFollowerOfAnchor: false,
        isModeratorOfAnchor: true,
      },
    };
    expect(decode(bytes)).toStrictEqual(emote);
    expect(toHex(encodeMessage(EmoteChatMessageSchema, emote))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a 64-bit id, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "2a 02", // user_identity (5), 2 bytes
        "20 01", //   is_follower_of_anchor (4): true
        "12 0d", // user (2), 13 bytes
        "08 81 80 a8 82 bb 85 98 8b 63", //   id (1): 7140000000000000001
        "1a 01 41", //   nickname (3): "A"
        "0a 05", // common (1), 5 bytes
        "20 e8 07", //   create_time (4): 1000
        "30 01", //   is_show_msg (6): true
        "1a 09", // emote_list (3), 9 bytes
        "18 01", //   audit_status (3): 1
        "0a 01 78", //   emote_id (1): "x"
        "28 02", //   emote_type (5): 2
        "22 00", //   uuid (4), empty, not read
        "45 01 00 00 00", // field 8, fixed32, not read
        "22 02", // msg_filter (4), 2 bytes
        "08 01", //   is_gifter (1): true
        "99 06 01 00 00 00 00 00 00 00", // field 99, fixed64, not read
        "1a 00", // emote_list (3), empty
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
        userId: "7140000000000000001",
        nickname: "A",
        displayId: "",
        badgeList: [],
      },
      emoteList: [
        { emoteId: "x", auditStatus: 1, emoteType: 2, emoteScene: 0 },
        { emoteId: "", auditStatus: 0, emoteType: 0, emoteScene: 0 },
      ],
      msgFilter: { isGifter: true, isSubscribedToAnchor: false },
      userIdentity: {
        isSubscriberOfAnchor: false,
        isFollowerOfAnchor: true,
        isModeratorOfAnchor: false,
      },
    });
  });
});
