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

/** A badge shown next to a user's name. */
export interface Badge {
  /** The badge's icon, for combined badges. */
  combine?: CombineBadge;
  /** The badge's level data. */
  privilegeLogExtra?: PrivilegeLogExtra;
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
}
