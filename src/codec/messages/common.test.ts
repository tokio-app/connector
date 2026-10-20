import { describe, expect, it } from "vitest";
import {
  BadgeSceneType,
  FansClubStatus,
  PunishTypeId,
  type MsgFilter,
  type PunishEventInfo,
  type User,
} from "../../events/index.js";
import { decodeMessage } from "../decode.js";
import { WireType } from "../reader.js";
import {
  BadgeSchema,
  CommonOnlySchema,
  CommonSchema,
  ImageSchema,
  MsgFilterSchema,
  PunishEventInfoSchema,
  TextSchema,
  UserIdentitySchema,
  UserSchema,
} from "./common.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
  unknownField,
} from "../../../test/helpers/encoder.js";
import { SAMPLE_USER, unknownFields } from "../../../test/helpers/samples.js";

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

describe("BadgeSceneType", () => {
  it("has the values of webcast.model.data.BadgeSceneType", () => {
    expect(BadgeSceneType).toEqual({
      UNKNOWN: 0,
      ADMIN: 1,
      FIRST_RECHARGE: 2,
      FRIENDS: 3,
      SUBSCRIBER: 4,
      ACTIVITY: 5,
      RANK_LIST: 6,
      NEW_SUBSCRIBER: 7,
      USER_GRADE: 8,
      STATE_CONTROLLED_MEDIA: 9,
      FANS: 10,
      LIVE_PRO: 11,
      ANCHOR: 12,
      CLASS_RANK: 13,
      ENIGMA: 14,
    });
    expect(Object.isFrozen(BadgeSceneType)).toBe(true);
  });
});

describe("BadgeSchema", () => {
  it("reads scene_type (3), privilege_log_extra (12).level (5) and combine (23).icon (2)", () => {
    const bytes = concat(
      fields.varint(1, 4), // display_type, not read
      fields.varint(3, 10),
      fields.message(12, fields.string(2, "privilege"), fields.string(5, "12")),
      fields.message(23, fields.varint(1, 4), fields.message(2, image)),
    );
    expect(decodeMessage(BadgeSchema, bytes)).toStrictEqual({
      sceneType: 10,
      privilegeLogExtra: { level: "12" },
      combine: {
        icon: {
          urlList: ["https://p16.example/a.webp", "https://p19.example/a.webp"],
          uri: "tos/a",
        },
      },
    });
  });

  it("defaults scene_type to 0 and leaves the nested messages out", () => {
    expect(decodeMessage(BadgeSchema, new Uint8Array(0))).toStrictEqual({
      sceneType: 0,
    });
  });
});

describe("FansClubStatus", () => {
  it("has the values of webcast.model.data.User_FansClub_FansClubData_UserFansClubStatus", () => {
    expect(FansClubStatus).toEqual({ NOT_JOINED: 0, ACTIVE: 1, INACTIVE: 2 });
    expect(Object.isFrozen(FansClubStatus)).toBe(true);
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
    expect(decodeMessage(UserSchema, bytes)).toStrictEqual({
      userId: "6900000000000000001",
      nickname: "Nick Name",
      avatarThumb: {
        urlList: ["https://p16.example/a.webp", "https://p19.example/a.webp"],
        uri: "tos/a",
      },
      displayId: "nick.name",
      badgeList: [
        { sceneType: 0, privilegeLogExtra: { level: "3" } },
        { sceneType: 0, combine: {} },
      ],
    });
  });

  it("reads follow_info (22), pay_grade (23), fans_club (24), user_attr (32), subscribe_info (63) and fans_club_info (66)", () => {
    const bytes = concat(
      fields.varint(1, 7),
      fields.message(
        22,
        fields.varint(1, 120),
        fields.varint(2, 4_500),
        fields.varint(3, 1),
        fields.varint(4, 1), // push_status, not read
      ),
      fields.message(
        23,
        fields.message(2, image), // diamond_icon, not read
        fields.string(3, "Level 12"),
        fields.varint(6, 12),
        fields.varint(25, 9_999), // score, not read
      ),
      fields.message(
        24,
        fields.message(
          1,
          fields.string(1, "Fans"),
          fields.varint(2, 5),
          fields.varint(3, 1),
          fields.varint(6, 9), // anchor_id, not read
        ),
      ),
      fields.message(
        32,
        fields.varint(1, 0),
        fields.varint(2, 1),
        fields.varint(3, 0),
        fields.varint(4, 60), // mute_duration, not read
      ),
      fields.message(
        63,
        fields.varint(1, 1), // qualification, not read
        fields.varint(2, 1),
        fields.varint(7, 1),
        fields.varint(11, 2), // status, not read
      ),
      fields.message(
        66,
        fields.varint(1, 0), // is_sleeping, not read
        fields.varint(2, 7),
        fields.string(6, "The Fans"),
      ),
    );
    expect(decodeMessage(UserSchema, bytes)).toStrictEqual({
      userId: "7",
      nickname: "",
      displayId: "",
      badgeList: [],
      followInfo: {
        followingCount: 120,
        followerCount: 4_500,
        followStatus: 1,
      },
      payGrade: { name: "Level 12", level: 12 },
      fansClub: { data: { clubName: "Fans", level: 5, status: 1 } },
      userAttr: { isMuted: false, isAdmin: true, isSuperAdmin: false },
      subscribeInfo: { isSubscribe: true, isSubscribedToAnchor: true },
      fansClubInfo: { fansLevel: 7, fansClubName: "The Fans" },
    });
  });

  it("leaves the nested messages out when the user has none", () => {
    expect(decodeMessage(UserSchema, new Uint8Array(0))).toStrictEqual({
      userId: "0",
      nickname: "",
      displayId: "",
      badgeList: [],
    });
    expect(
      decodeMessage(UserSchema, concat(fields.message(24), fields.message(63))),
    ).toStrictEqual({
      userId: "0",
      nickname: "",
      displayId: "",
      badgeList: [],
      fansClub: {},
      subscribeInfo: { isSubscribe: false, isSubscribedToAnchor: false },
    });
  });

  it("round-trips a user with every nested message through the encoder", () => {
    const user: User = {
      ...SAMPLE_USER,
      followInfo: { followingCount: 1, followerCount: 2, followStatus: 2 },
      payGrade: { name: "", level: 3 },
      fansClub: { data: { clubName: "c", level: 1, status: 2 } },
      userAttr: { isMuted: true, isAdmin: false, isSuperAdmin: true },
      subscribeInfo: { isSubscribe: false, isSubscribedToAnchor: true },
      fansClubInfo: { fansLevel: 4, fansClubName: "c" },
    };
    expect(
      decodeMessage(UserSchema, encodeMessage(UserSchema, user)),
    ).toStrictEqual(user);
  });

  it("skips fields it doesn't read inside the nested messages", () => {
    const bytes = concat(
      fields.message(22, unknownFields(), fields.varint(2, 5)),
      fields.message(32, unknownFields(), fields.varint(1, 1)),
      fields.message(66, unknownFields(), fields.varint(2, 2)),
      unknownFields(1_000),
    );
    expect(decodeMessage(UserSchema, bytes)).toStrictEqual({
      userId: "0",
      nickname: "",
      displayId: "",
      badgeList: [],
      followInfo: { followingCount: 0, followerCount: 5, followStatus: 0 },
      userAttr: { isMuted: true, isAdmin: false, isSuperAdmin: false },
      fansClubInfo: { fansLevel: 2, fansClubName: "" },
    });
  });
});

describe("MsgFilterSchema", () => {
  const decode = (bytes: Uint8Array) => decodeMessage(MsgFilterSchema, bytes);

  it("reads is_gifter (1) and is_subscribed_to_anchor (2)", () => {
    const bytes = concat(
      fields.varint(1, 1),
      fields.varint(2, 0),
      fields.varint(3, 1), // not in the proto, skipped
    );
    expect(decode(bytes)).toStrictEqual({
      isGifter: true,
      isSubscribedToAnchor: false,
    });
  });

  it("defaults both to false", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      isGifter: false,
      isSubscribedToAnchor: false,
    });
  });

  it("round-trips through the encoder", () => {
    const filter: MsgFilter = { isGifter: true, isSubscribedToAnchor: true };
    expect(decode(encodeMessage(MsgFilterSchema, filter))).toStrictEqual(
      filter,
    );
  });

  it("skips fields it doesn't read, of every wire type", () => {
    expect(
      decode(
        concat(unknownFields(), fields.varint(2, 1), unknownFields(1_000)),
      ),
    ).toStrictEqual({ isGifter: false, isSubscribedToAnchor: true });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex("08 01 10 01"); // is_gifter (1): true, is_subscribed_to_anchor (2): true
    const filter: MsgFilter = { isGifter: true, isSubscribedToAnchor: true };
    expect(decode(bytes)).toStrictEqual(filter);
    expect(toHex(encodeMessage(MsgFilterSchema, filter))).toBe(toHex(bytes));
  });

  it("reads the fields out of order, any non-zero varint as true", () => {
    expect(decode(fromHex("10 02 08 00"))).toStrictEqual({
      isGifter: false,
      isSubscribedToAnchor: true,
    });
  });
});

describe("PunishTypeId", () => {
  it("has the values of webcast.model.data.PunishTypeId", () => {
    expect(PunishTypeId).toEqual({
      UNKNOWN: 0,
      BAN_LINKMIC: 9,
      BAN_GAME_PARTNERSHIP: 25,
      REMOVE_GAME_PARTNERSHIP: 26,
      BAN_COHOST_LINKMIC: 55,
      AUTHORITY_LIMIT_MATCH: 57,
      BAN_VOICE_CHAT: 59,
      BAN_LIVE_GOAL: 64,
      VIEWER_LIMIT: 70,
      LIVE_CONSOLE_BAN: 76,
    });
    expect(Object.isFrozen(PunishTypeId)).toBe(true);
  });
});

describe("PunishEventInfoSchema", () => {
  const decode = (bytes: Uint8Array) =>
    decodeMessage(PunishEventInfoSchema, bytes);

  it("reads punish_type (1), punish_reason (2), punish_id (3), punish_type_id (5), duration (6), end_time (8) and show_reason (10)", () => {
    const bytes = concat(
      fields.string(1, "ban_linkmic"),
      fields.string(2, "violation"),
      fields.string(3, "p1"),
      fields.varint(4, 6_900_000_000_000_000_001n), // violation_uid, not read
      fields.varint(5, 9),
      fields.varint(6, 86_400),
      fields.string(7, "code"), // punish_perception_code, not read
      fields.varint(8, 1_760_086_400_000),
      fields.string(9, "6900000000000000001"), // violation_uid_str, not read
      fields.string(10, "Link-mic is off for a day"),
    );
    expect(decode(bytes)).toStrictEqual({
      punishType: "ban_linkmic",
      punishReason: "violation",
      punishId: "p1",
      punishTypeId: 9,
      duration: 86_400,
      endTime: "1760086400000",
      showReason: "Link-mic is off for a day",
    });
  });

  it('defaults the strings to empty, the numbers to 0 and end_time to "0"', () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      punishType: "",
      punishReason: "",
      punishId: "",
      punishTypeId: 0,
      duration: 0,
      endTime: "0",
      showReason: "",
    });
  });

  it("round-trips through the encoder", () => {
    const info: PunishEventInfo = {
      punishType: "viewer_limit",
      punishReason: "r",
      punishId: "2",
      punishTypeId: PunishTypeId.VIEWER_LIMIT,
      duration: 3_600,
      endTime: "1760000000000",
      showReason: "s",
    };
    expect(decode(encodeMessage(PunishEventInfoSchema, info))).toStrictEqual(
      info,
    );
  });

  it("skips fields it doesn't read, of every wire type", () => {
    expect(
      decode(
        concat(unknownFields(), fields.varint(5, 70), unknownFields(1_000)),
      ),
    ).toMatchObject({ punishTypeId: 70, duration: 0 });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "0a 03 62 61 6e", // punish_type (1): "ban"
        "28 09", // punish_type_id (5): 9
        "30 3c", // duration (6): 60
        "40 e8 07", // end_time (8): 1000
      ].join(" "),
    );
    const info: PunishEventInfo = {
      punishType: "ban",
      punishReason: "",
      punishId: "",
      punishTypeId: 9,
      duration: 60,
      endTime: "1000",
      showReason: "",
    };
    expect(decode(bytes)).toStrictEqual(info);
    expect(toHex(encodeMessage(PunishEventInfoSchema, info))).toBe(
      toHex(bytes),
    );
  });

  it("reads a 64-bit end time and fields out of order", () => {
    const bytes = fromHex(
      [
        "52 01 78", // show_reason (10): "x"
        "40 81 80 90 cf b0 99 85 d9 66", // end_time (8): 7400000000000000001
        "20 01", // violation_uid (4), not read
        "28 4c", // punish_type_id (5): 76
      ].join(" "),
    );
    expect(decode(bytes)).toMatchObject({
      showReason: "x",
      endTime: "7400000000000000001",
      punishTypeId: 76,
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
