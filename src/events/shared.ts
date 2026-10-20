// The building blocks the LIVE messages share: images, texts, the common
// data, users and their badges, emotes and gifts.
//
// Payloads are JSON-safe: 64-bit ids (user, message, room, gift and group ids,
// timestamps) are decimal strings, counters are numbers, and no bigint reaches
// them. Fields TikTok leaves out hold their protobuf defaults ("", 0, "0",
// false, []); nested messages it leaves out are `undefined`.

/** An image TikTok serves from its CDN. */
export interface Image {
  /** The same image at several CDN URLs; any of them works. */
  urlList: string[];
  /** TikTok's path for the image, without a host. */
  uri: string;
}

/** A localized text: a translation key and its fallback pattern. */
export interface Text {
  /** The translation key, such as `pm_mt_msg_viewer_follow`. Routing reads it. */
  key: string;
  /** The fallback pattern, with placeholders such as `{0:user}`. */
  defaultPattern: string;
}

/** Data every LIVE message carries. */
export interface Common {
  /** The message type, such as `WebcastChatMessage`. */
  method: string;
  /** The message id. */
  msgId: string;
  /** The room the message belongs to. */
  roomId: string;
  /** When TikTok created the message, as a decimal string (milliseconds since the epoch in observed traffic). */
  createTime: string;
  /** Whether TikTok shows the message in the LIVE's chat area. */
  isShowMsg: boolean;
  /** The text TikTok displays for the message. */
  displayText?: Text;
}

/** The combined badge (icon and text) shown next to a user's name. */
export interface CombineBadge {
  /** The badge icon. Its `uri` names the badge (fan club badges contain `fans_badge`). */
  icon?: Image;
}

/** Extra data of a badge. */
export interface PrivilegeLogExtra {
  /** The badge level, as a decimal string (gifter or fan club level). */
  level: string;
}

/**
 * The values of {@link Badge.sceneType} TikTok defines
 * (`webcast.model.data.BadgeSceneType`): what a badge stands for.
 */
export const BadgeSceneType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A moderator of the LIVE. */
  ADMIN: 1,
  /** A first recharge. */
  FIRST_RECHARGE: 2,
  /** A friend of the host. */
  FRIENDS: 3,
  /** A subscriber of the host. */
  SUBSCRIBER: 4,
  /** An activity badge. */
  ACTIVITY: 5,
  /** A rank list badge. */
  RANK_LIST: 6,
  /** A new subscriber. */
  NEW_SUBSCRIBER: 7,
  /** The user's grade (gifter level). */
  USER_GRADE: 8,
  /** State-controlled media. */
  STATE_CONTROLLED_MEDIA: 9,
  /** A fan club member (fan level). */
  FANS: 10,
  /** LIVE Pro. */
  LIVE_PRO: 11,
  /** The host. */
  ANCHOR: 12,
  /** A class rank badge. */
  CLASS_RANK: 13,
  /** An enigma (masked) user. */
  ENIGMA: 14,
} as const);

/** A badge shown next to a user's name. */
export interface Badge {
  /**
   * What the badge stands for: `1` moderator, `4` subscriber, `8` user grade,
   * `10` fan club ({@link BadgeSceneType}). Other values may come: it stays a
   * number.
   */
  sceneType: number;
  /** The badge's icon, for combined badges. */
  combine?: CombineBadge;
  /** The badge's level data. */
  privilegeLogExtra?: PrivilegeLogExtra;
}

/** How a user follows and is followed. */
export interface FollowInfo {
  /** How many accounts the user follows. */
  followingCount: number;
  /** How many followers the user has. */
  followerCount: number;
  /** TikTok's follow status code between the user and the host. */
  followStatus: number;
}

/** A user's gifter level (TikTok's "pay grade"). */
export interface PayGrade {
  /** The level, such as `12`. */
  level: number;
  /** The level's name. */
  name: string;
}

/**
 * The values of {@link FansClubData.status} TikTok defines
 * (`webcast.model.data.User_FansClub_FansClubData_UserFansClubStatus`).
 */
export const FansClubStatus = Object.freeze({
  /** Not a member of the fan club. */
  NOT_JOINED: 0,
  /** An active member. */
  ACTIVE: 1,
  /** A member who hasn't been active. */
  INACTIVE: 2,
} as const);

/** A user's membership in the host's fan club. */
export interface FansClubData {
  /** The fan club's name. */
  clubName: string;
  /** The user's fan level. */
  level: number;
  /**
   * The membership: `0` not joined, `1` active, `2` inactive
   * ({@link FansClubStatus}). Other values may come: it stays a number.
   */
  status: number;
}

/** A user's fan club membership. */
export interface FansClub {
  /** The membership. */
  data?: FansClubData;
}

/** A user's standing in the LIVE. */
export interface UserAttr {
  /** The user is muted in this LIVE. */
  isMuted: boolean;
  /** The user moderates this LIVE. */
  isAdmin: boolean;
  /** The user is a super moderator. */
  isSuperAdmin: boolean;
}

/** A user's subscription to the host. */
export interface SubscribeInfo {
  /** The user subscribes. */
  isSubscribe: boolean;
  /** The user subscribes to the host. */
  isSubscribedToAnchor: boolean;
}

/** A user's fan club level and club. */
export interface FansClubInfo {
  /** The user's fan level. */
  fansLevel: number;
  /** The fan club's name. */
  fansClubName: string;
}

/** A TikTok user. */
export interface User {
  /** The numeric user id. */
  userId: string;
  /** The display name. */
  nickname: string;
  /** The username (unique id, the `@handle`), without the `@`. */
  displayId: string;
  /** The small profile picture. */
  avatarThumb?: Image;
  /** The badges shown next to the name. */
  badgeList: Badge[];
  /** Follower counts and the follow status, when TikTok sends them. */
  followInfo?: FollowInfo;
  /** The gifter level, when TikTok sends it. */
  payGrade?: PayGrade;
  /** The fan club membership, when TikTok sends it. */
  fansClub?: FansClub;
  /** Whether the user is muted or moderates, when TikTok sends it. */
  userAttr?: UserAttr;
  /** The subscription to the host, when TikTok sends it. */
  subscribeInfo?: SubscribeInfo;
  /** The fan club level and club, when TikTok sends them. */
  fansClubInfo?: FansClubInfo;
}

/** How a user relates to the host. */
export interface UserIdentity {
  /** Subscribes to the host. */
  isSubscriberOfAnchor: boolean;
  /** Follows the host. */
  isFollowerOfAnchor: boolean;
  /** Moderates the host's LIVE. */
  isModeratorOfAnchor: boolean;
}

/** What a message's sender is to the host, for filtering the chat area. */
export interface MsgFilter {
  /** The sender has sent gifts. */
  isGifter: boolean;
  /** The sender subscribes to the host. */
  isSubscribedToAnchor: boolean;
}

/**
 * The values of {@link PunishEventInfo.punishTypeId} TikTok defines
 * (`webcast.model.data.PunishTypeId`): what a punishment takes away.
 */
export const PunishTypeId = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** Link-mic is banned. */
  BAN_LINKMIC: 9,
  /** Game partnerships are banned. */
  BAN_GAME_PARTNERSHIP: 25,
  /** A game partnership was removed. */
  REMOVE_GAME_PARTNERSHIP: 26,
  /** Co-host link-mic is banned. */
  BAN_COHOST_LINKMIC: 55,
  /** Matches are limited. */
  AUTHORITY_LIMIT_MATCH: 57,
  /** Voice chat is banned. */
  BAN_VOICE_CHAT: 59,
  /** LIVE goals are banned. */
  BAN_LIVE_GOAL: 64,
  /** Viewers are limited. */
  VIEWER_LIMIT: 70,
  /** LIVE Console is banned. */
  LIVE_CONSOLE_BAN: 76,
} as const);

/** A punishment TikTok applied to the LIVE or a user. */
export interface PunishEventInfo {
  /** TikTok's name for the kind of punishment. */
  punishType: string;
  /** Why, as TikTok words it. */
  punishReason: string;
  /** The punishment's id. */
  punishId: string;
  /**
   * What it takes away: `9` link-mic, `70` viewers ({@link PunishTypeId}).
   * Other values may come: it stays a number.
   */
  punishTypeId: number;
  /** How long it lasts. */
  duration: number;
  /** When it ends, as a decimal string (a timestamp). */
  endTime: string;
  /** The reason shown to the user. */
  showReason: string;
}

/** A custom emote. */
export interface Emote {
  /** The emote id. */
  emoteId: string;
  /** The emote image. */
  image?: Image;
}

/** An emote inside a chat comment. */
export interface ChatEmote {
  /** Where the emote goes in `content`, as a character index. */
  index: number;
  /** The emote. */
  emote?: Emote;
}

/** A gift TikTok offers, as gift lists describe it. */
export interface Gift {
  /** The gift id. */
  id: string;
  /** The gift name, such as `Rose`. */
  name: string;
  /** What the gift costs, in coins (TikTok calls them diamonds here). */
  diamondCount: number;
  /** The gift image. */
  image?: Image;
}

/** The gift a {@link GiftMessage} is about. */
export interface GiftDetails extends Gift {
  /** The gift type: `1` for gifts sent in streaks (see `isStreakable`). */
  type: number;
  /** TikTok's description of the gift. */
  describe: string;
  /** Whether the gift can be sent in a combo. */
  combo: boolean;
  /** The gift's icon, when TikTok sends one besides `image`. */
  icon?: Image;
}
