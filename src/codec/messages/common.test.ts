import { describe, expect, it } from "vitest";
import { decodeMessage } from "../decode.js";
import { WireType } from "../reader.js";
import {
  BadgeSchema,
  CommonOnlySchema,
  CommonSchema,
  ImageSchema,
  TextSchema,
  UserIdentitySchema,
  UserSchema,
} from "./common.js";
import {
  concat,
  encodeMessage,
  fields,
  unknownField,
} from "../../../test/helpers/encoder.js";

// The bytes are assembled field by field with the numbers from the .proto
// files (PROTOCOL.md, "Field numbers"), not with the schemas, so a wrong field
// number in a schema fails here.

const image = concat(
  fields.string(1, "https://p16.example/a.webp"),
  fields.string(1, "https://p19.example/a.webp"),
  fields.string(2, "tos/a"),
  fields.varint(3, 100), // height, not read
  fields.varint(9, 1), // is_animated, not read
);

describe("ImageSchema", () => {
  it("reads url_list (1) and uri (2)", () => {
    expect(decodeMessage(ImageSchema, image)).toEqual({
      urlList: ["https://p16.example/a.webp", "https://p19.example/a.webp"],
      uri: "tos/a",
    });
  });
});

describe("TextSchema", () => {
  it("reads key (1) and default_pattern (2)", () => {
    const bytes = concat(
      fields.string(1, "pm_mt_msg_viewer_follow"),
      fields.string(2, "{0:user} followed the host"),
      fields.message(4, fields.varint(1, 1)), // pieces, not read
    );
    expect(decodeMessage(TextSchema, bytes)).toEqual({
      key: "pm_mt_msg_viewer_follow",
      defaultPattern: "{0:user} followed the host",
    });
  });
});

describe("CommonSchema", () => {
  it("reads method (1), msg_id (2), room_id (3), create_time (4), is_show_msg (6) and display_text (8)", () => {
    const bytes = concat(
      fields.string(1, "WebcastSocialMessage"),
      fields.varint(2, 7_400_000_000_000_000_001n),
      fields.varint(3, 7_140_000_000_000_000_001n),
      fields.varint(4, 1_760_000_000_123),
      fields.varint(5, 1), // monitor, not read
      fields.varint(6, 1),
      fields.string(7, "described"), // describe, not read
      fields.message(8, fields.string(1, "pm_main_follow_message_viewer_2")),
    );
    expect(decodeMessage(CommonSchema, bytes)).toEqual({
      method: "WebcastSocialMessage",
      msgId: "7400000000000000001",
      roomId: "7140000000000000001",
      createTime: "1760000000123",
      isShowMsg: true,
      displayText: {
        key: "pm_main_follow_message_viewer_2",
        defaultPattern: "",
      },
    });
  });

  it('defaults ids to "0" and leaves display_text out', () => {
    expect(decodeMessage(CommonSchema, new Uint8Array(0))).toStrictEqual({
      method: "",
      msgId: "0",
      roomId: "0",
      createTime: "0",
      isShowMsg: false,
    });
  });
});

describe("BadgeSchema", () => {
  it("reads privilege_log_extra (12).level (5) and combine (23).icon (2)", () => {
    const bytes = concat(
      fields.varint(3, 10), // scene_type, not read
      fields.message(12, fields.string(2, "privilege"), fields.string(5, "12")),
      fields.message(23, fields.varint(1, 4), fields.message(2, image)),
    );
    expect(decodeMessage(BadgeSchema, bytes)).toEqual({
      privilegeLogExtra: { level: "12" },
      combine: {
        icon: {
          urlList: ["https://p16.example/a.webp", "https://p19.example/a.webp"],
          uri: "tos/a",
        },
      },
    });
  });
});

describe("UserSchema", () => {
  it("reads id (1), nickname (3), avatar_thumb (9), display_id (38) and badge_list (64)", () => {
    const bytes = concat(
      fields.varint(1, 6_900_000_000_000_000_001n),
      fields.string(3, "Nick Name"),
      fields.message(9, image),
      fields.message(10, image), // avatar_medium, not read
      fields.string(38, "nick.name"),
      fields.string(46, "MS4wLjABAAAA"), // sec_uid, not read
      fields.message(64, fields.message(12, fields.string(5, "3"))),
      fields.message(64, fields.message(23)),
      fields.varint(1029, 1), // is_follower, not read
    );
    expect(decodeMessage(UserSchema, bytes)).toEqual({
      userId: "6900000000000000001",
      nickname: "Nick Name",
      avatarThumb: {
        urlList: ["https://p16.example/a.webp", "https://p19.example/a.webp"],
        uri: "tos/a",
      },
      displayId: "nick.name",
      badgeList: [{ privilegeLogExtra: { level: "3" } }, { combine: {} }],
    });
  });
});

describe("UserIdentitySchema", () => {
  it("reads is_subscriber_of_anchor (2), is_follower_of_anchor (4) and is_moderator_of_anchor (5)", () => {
    const bytes = concat(
      fields.varint(1, 1), // is_gift_giver_of_anchor, not read
      fields.varint(2, 1),
      fields.varint(3, 1), // is_mutual_following_with_anchor, not read
      fields.varint(4, 1),
      fields.varint(5, 0),
      fields.varint(6, 1), // is_anchor, not read
    );
    expect(decodeMessage(UserIdentitySchema, bytes)).toEqual({
      isSubscriberOfAnchor: true,
      isFollowerOfAnchor: true,
      isModeratorOfAnchor: false,
    });
  });
});

describe("CommonOnlySchema", () => {
  it("reads field 1 of any message as common and skips the rest", () => {
    const chat = concat(
      fields.message(
        1,
        fields.string(1, "WebcastChatMessage"),
        fields.varint(4, 1_760_000_000_000),
      ),
      fields.message(2, fields.string(3, "user")),
      fields.string(3, "hello"),
    );
    expect(decodeMessage(CommonOnlySchema, chat).common).toMatchObject({
      method: "WebcastChatMessage",
      createTime: "1760000000000",
    });
  });

  it("leaves common out when field 1 isn't a message", () => {
    const bytes = unknownField(1, WireType.VARINT, Uint8Array.of(1));
    expect(decodeMessage(CommonOnlySchema, bytes)).toStrictEqual({});
  });

  it("round-trips through the encoder", () => {
    const common = {
      method: "WebcastLikeMessage",
      msgId: "1",
      roomId: "2",
      createTime: "3",
      isShowMsg: true,
      displayText: { key: "k", defaultPattern: "p" },
    };
    expect(
      decodeMessage(
        CommonOnlySchema,
        encodeMessage(CommonOnlySchema, { common }),
      ),
    ).toEqual({ common });
  });
});
