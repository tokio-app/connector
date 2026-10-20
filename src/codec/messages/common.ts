// The building blocks most LIVE messages share. Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  Badge,
  CombineBadge,
  Common,
  FansClub,
  FansClubData,
  FansClubInfo,
  FollowInfo,
  Image,
  MsgFilter,
  PayGrade,
  PrivilegeLogExtra,
  PunishEventInfo,
  SubscribeInfo,
  Text,
  User,
  UserAttr,
  UserIdentity,
} from "../../events/index.js";
import { defineSchema, f } from "../schema.js";

/** `webcast.model.base.ImageModel`. */
export const ImageSchema = defineSchema<Image>("ImageModel", {
  urlList: f.repeated.string(1),
  uri: f.string(2),
});

/** `webcast.model.message.common.Text`. */
export const TextSchema = defineSchema<Text>("Text", {
  key: f.string(1),
  defaultPattern: f.string(2),
});

/** `webcast.shared.message.CommonMessageData`: field 1 of every LIVE message. */
export const CommonSchema = defineSchema<Common>("CommonMessageData", {
  method: f.string(1),
  msgId: f.id(2),
  roomId: f.id(3),
  createTime: f.id(4),
  isShowMsg: f.bool(6),
  displayText: f.message(8, TextSchema),
});

/** `webcast.model.base.user.CombineBadgeStruct`. */
const CombineBadgeSchema = defineSchema<CombineBadge>("CombineBadgeStruct", {
  icon: f.message(2, ImageSchema),
});

/** `webcast.model.base.user.PrivilegeLogExtra`. */
const PrivilegeLogExtraSchema = defineSchema<PrivilegeLogExtra>(
  "PrivilegeLogExtra",
  { level: f.string(5) },
);

/** `webcast.model.base.user.BadgeStruct`. `scene_type` (3) is a `webcast.model.data.BadgeSceneType`. */
export const BadgeSchema = defineSchema<Badge>("BadgeStruct", {
  sceneType: f.enum(3),
  privilegeLogExtra: f.message(12, PrivilegeLogExtraSchema),
  combine: f.message(23, CombineBadgeSchema),
});

/** `webcast.model.base.user.FollowInfo` [proto: webcast/model/base/user.proto, line 110]. */
const FollowInfoSchema = defineSchema<FollowInfo>("FollowInfo", {
  followingCount: f.count(1),
  followerCount: f.count(2),
  followStatus: f.count(3),
});

/** `webcast.model.UserHonor` [proto: webcast/model/messages.proto, line 252]: the gifter level. */
const PayGradeSchema = defineSchema<PayGrade>("UserHonor", {
  name: f.string(3),
  level: f.int32(6),
});

/** `webcast.model.FansClubData` [proto: webcast/model/messages.proto, line 75]. */
const FansClubDataSchema = defineSchema<FansClubData>("FansClubData", {
  clubName: f.string(1),
  level: f.int32(2),
  status: f.enum(3),
});

/** `webcast.model.FansClubMember` [proto: webcast/model/messages.proto, line 85]. */
const FansClubSchema = defineSchema<FansClub>("FansClubMember", {
  data: f.message(1, FansClubDataSchema),
});

/** `webcast.model.UserAttr` [proto: webcast/model/messages.proto, line 237]. */
const UserAttrSchema = defineSchema<UserAttr>("UserAttr", {
  isMuted: f.bool(1),
  isAdmin: f.bool(2),
  isSuperAdmin: f.bool(3),
});

/** `webcast.model.base.user.SubscribeInfo` [proto: webcast/model/base/user.proto, line 224]. */
const SubscribeInfoSchema = defineSchema<SubscribeInfo>("SubscribeInfo", {
  isSubscribe: f.bool(2),
  isSubscribedToAnchor: f.bool(7),
});

/** `webcast.model.base.user.FansClubInfo` [proto: webcast/model/base/user.proto, line 101]. */
const FansClubInfoSchema = defineSchema<FansClubInfo>("FansClubInfo", {
  fansLevel: f.count(2),
  fansClubName: f.string(6),
});

/** `webcast.model.base.user.User` [proto: webcast/model/base/user_2.proto, line 11]. */
export const UserSchema = defineSchema<User>("User", {
  userId: f.id(1),
  nickname: f.string(3),
  avatarThumb: f.message(9, ImageSchema),
  followInfo: f.message(22, FollowInfoSchema),
  payGrade: f.message(23, PayGradeSchema),
  fansClub: f.message(24, FansClubSchema),
  userAttr: f.message(32, UserAttrSchema),
  displayId: f.string(38),
  subscribeInfo: f.message(63, SubscribeInfoSchema),
  badgeList: f.repeated.message(64, BadgeSchema),
  fansClubInfo: f.message(66, FansClubInfoSchema),
});

/** `webcast.model.data.UserIdentity`. */
export const UserIdentitySchema = defineSchema<UserIdentity>("UserIdentity", {
  isSubscriberOfAnchor: f.bool(2),
  isFollowerOfAnchor: f.bool(4),
  isModeratorOfAnchor: f.bool(5),
});

/** `webcast.model.data.MsgFilter` [proto: webcast/model/data/messages.proto, line 989]. */
export const MsgFilterSchema = defineSchema<MsgFilter>("MsgFilter", {
  isGifter: f.bool(1),
  isSubscribedToAnchor: f.bool(2),
});

/**
 * `webcast.model.message.PunishEventInfo` [proto:
 * webcast/model/message/invite_top_host_info.proto, line 40]. `punish_type_id`
 * (5) is a `webcast.model.data.PunishTypeId`.
 */
export const PunishEventInfoSchema = defineSchema<PunishEventInfo>(
  "PunishEventInfo",
  {
    punishType: f.string(1),
    punishReason: f.string(2),
    punishId: f.string(3),
    punishTypeId: f.enum(5),
    duration: f.count(6),
    endTime: f.id(8),
    showReason: f.string(10),
  },
);

/** Only the `common` field (1) of any LIVE message: what the `raw` event needs from it. */
export interface CommonOnly {
  /** The message's common data, when it has one. */
  common?: Common;
}

/** Reads field 1 of any LIVE message as its `common` data and skips the rest. */
export const CommonOnlySchema = defineSchema<CommonOnly>("CommonOnly", {
  common: f.message(1, CommonSchema),
});
