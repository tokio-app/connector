// The building blocks most LIVE messages share. Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  Badge,
  CombineBadge,
  Common,
  Image,
  PrivilegeLogExtra,
  Text,
  User,
  UserIdentity,
} from "../../events.js";
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

/** `webcast.model.base.user.BadgeStruct`. */
export const BadgeSchema = defineSchema<Badge>("BadgeStruct", {
  privilegeLogExtra: f.message(12, PrivilegeLogExtraSchema),
  combine: f.message(23, CombineBadgeSchema),
});

/** `webcast.model.base.user.User`. */
export const UserSchema = defineSchema<User>("User", {
  userId: f.id(1),
  nickname: f.string(3),
  avatarThumb: f.message(9, ImageSchema),
  displayId: f.string(38),
  badgeList: f.repeated.message(64, BadgeSchema),
});

/** `webcast.model.data.UserIdentity`. */
export const UserIdentitySchema = defineSchema<UserIdentity>("UserIdentity", {
  isSubscriberOfAnchor: f.bool(2),
  isFollowerOfAnchor: f.bool(4),
  isModeratorOfAnchor: f.bool(5),
});

/** Only the `common` field (1) of any LIVE message: what the `raw` event needs from it. */
export interface CommonOnly {
  /** The message's common data, when it has one. */
  common?: Common;
}

/** Reads field 1 of any LIVE message as its `common` data and skips the rest. */
export const CommonOnlySchema = defineSchema<CommonOnly>("CommonOnly", {
  common: f.message(1, CommonSchema),
});
