import type { ConnectorError } from "./errors.js";

// Payloads are JSON-safe: 64-bit ids (user, message, room, gift and group ids,
// timestamps) are decimal strings, counters are numbers, and no bigint reaches
// them. Fields TikTok leaves out hold their protobuf defaults ("", 0, "0",
// false, []); nested messages it leaves out are `undefined`.

/**
 * Where a {@link TikTokLiveConnection} is in its lifecycle:
 *
 * - `idle`: created, `connect()` not called yet.
 * - `connecting`: the first `connect()` is running.
 * - `connected`: the WebSocket is open and events flow.
 * - `reconnecting`: the connection dropped and is waiting for, or running, a reconnect attempt.
 * - `disconnected`: stopped: `disconnect()`, the stream ended, the reconnects ran out, the
 *   signal aborted, or the first `connect()` failed. `connect()` can start it again.
 */
export type ConnectionState =
  "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

/**
 * Why a connection ended:
 *
 * - `user`: `disconnect()` was called.
 * - `streamEnd`: the LIVE ended or was suspended, or a reconnect's live check found it offline.
 * - `wsClose`: the WebSocket closed (TikTok or the network closed it).
 * - `wsError`: the WebSocket errored.
 * - `idle`: no frame arrived for `idleTimeoutMs`.
 * - `signError`: the signer failed while reconnecting (see the error).
 * - `giveUp`: the reconnect attempts ran out (`reconnect.maxAttempts`).
 * - `aborted`: the `signal` option aborted.
 */
export type DisconnectReason =
  | "user"
  | "streamEnd"
  | "wsClose"
  | "wsError"
  | "idle"
  | "signError"
  | "giveUp"
  | "aborted";

/** How a LIVE ended: the host ended it, or TikTok suspended it. */
export type StreamEndAction = "ended" | "suspended";

/** Payload of the `connected` event. */
export interface ConnectedEvent {
  /** The room the connection entered. */
  roomId: string;
  /** `false` for the first connect, `true` after a reconnect. */
  reconnected: boolean;
  /** `0` for the first connect, else the number of the reconnect attempt that succeeded (1-based). */
  attempt: number;
}

/** Payload of the `disconnected` event. */
export interface DisconnectedEvent {
  /** Why the connection ended. */
  reason: DisconnectReason;
  /** The failure behind it; absent for `user` and `streamEnd`. */
  error?: ConnectorError;
  /** `true` when a reconnect follows (a `reconnecting` event comes next). */
  willReconnect: boolean;
}

/** Payload of the `reconnecting` event. */
export interface ReconnectingEvent {
  /** The attempt about to run, starting at 1. Resets after a successful reconnect. */
  attempt: number;
  /** How long the connection waits before the attempt, in milliseconds. */
  delayMs: number;
  /** Why the connection dropped, or why the previous attempt failed. */
  reason: DisconnectReason;
}

/** Payload of the `streamEnd` event. */
export interface StreamEndEvent {
  /** How the LIVE ended. */
  action: StreamEndAction;
}

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

/** A chat comment (`chat` event). */
export interface ChatMessage {
  /** Data every message carries. */
  common?: Common;
  /** Who commented. */
  user?: User;
  /** How the commenter relates to the host. */
  userIdentity?: UserIdentity;
  /** The comment text. */
  content: string;
  /** The comment's language code, such as `en`, when TikTok detected one. */
  contentLanguage: string;
  /** The emotes in the comment. */
  emotes: ChatEmote[];
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

/**
 * A gift (`gift` event). Streakable gifts arrive several times: once per
 * update of the streak, with a growing `repeatCount`, and a last time with
 * `repeatEnd` set. `isStreakEnd()` says when to count one.
 */
export interface GiftMessage {
  /** Data every message carries. */
  common?: Common;
  /** Who sent the gift. */
  user?: User;
  /** The gift id. */
  giftId: string;
  /** How many of the gift were sent so far in this streak. */
  repeatCount: number;
  /** `true` on the event that ends a streak. */
  repeatEnd: boolean;
  /** TikTok's combo counter for the gift. */
  comboCount: number;
  /** Groups the events of one streak. */
  groupId: string;
  /** The gift. */
  gift?: GiftDetails;
}

/** Likes (`like` event). */
export interface LikeMessage {
  /** Data every message carries. */
  common?: Common;
  /** Who liked. */
  user?: User;
  /** How many likes this event carries. */
  count: number;
  /** The LIVE's total likes so far. */
  total: number;
}

/** A follow (`follow` event) or share (`share` event). */
export interface SocialMessage {
  /** Data every message carries. `common.displayText.key` tells follows from shares. */
  common?: Common;
  /** Who followed or shared. */
  user?: User;
  /** TikTok's share type code. */
  shareType: number;
  /** TikTok's social action code. */
  action: number;
  /** Where the LIVE was shared to, when TikTok says. */
  shareTarget: string;
  /** How many times the user shared the LIVE. */
  shareCount: number;
}

/** A viewer joining, or another membership change (`member` event). */
export interface MemberMessage {
  /** Data every message carries. */
  common?: Common;
  /** The member. */
  user?: User;
  /** What happened: `1` joined, `3` subscribed, `0` unknown. */
  actionId: number;
}

/** A top viewer, in a {@link RoomUserMessage}. */
export interface RoomUserRank {
  /** The viewer. */
  user?: User;
  /** The viewer's score (coins sent). */
  score: number;
  /** The viewer's position, starting at 1. */
  rank: number;
}

/** Viewer counts and top viewers (`roomUser` event). */
export interface RoomUserMessage {
  /** Data every message carries. */
  common?: Common;
  /** Viewers watching now. */
  total: number;
  /** Viewers so far in this LIVE. */
  totalUser: number;
  /** The top viewers. */
  ranks: RoomUserRank[];
}

/** A change to the LIVE's state, such as the LIVE ending. Decoded for `streamEnd`; not an event of its own. */
export interface ControlMessage {
  /** Data every message carries. */
  common?: Common;
  /** What happened: `1` paused, `2` resumed, `3` ended, `4` suspended. */
  action: number;
}

/** Details of a treasure chest. */
export interface EnvelopeInfo {
  /** What kind of chest: `19` is a super fan box. */
  businessType: number;
}

/** A treasure chest (`envelope` event; also `superFanBox` for super fan boxes). */
export interface EnvelopeMessage {
  /** Data every message carries. */
  common?: Common;
  /** The chest. */
  envelopeInfo?: EnvelopeInfo;
}

/** A banner message (`superFan` and `superFanJoin` events). */
export interface BarrageMessage {
  /** Data every message carries. */
  common?: Common;
  /** The user the banner is about. */
  user?: User;
  /** The banner text. Routing reads its `key`. */
  content?: Text;
  /** The banner's common text. Routing reads its `key` too. */
  commonBarrageContent?: Text;
}

/** Any LIVE message, before decoding (`raw` event). */
export interface RawMessage {
  /** The message type, such as `WebcastChatMessage`. */
  method: string;
  /**
   * The protobuf-encoded message. A view into the received frame: copy it
   * (`payload.slice()`) to keep it beyond the listener call.
   */
  payload: Uint8Array;
  /** The message id. */
  msgId: string;
  /** `true` for backlog messages TikTok replays when the connection enters the room. */
  isHistory: boolean;
  /** When TikTok created the message (its `common.createTime`), or `"0"` when it has none. */
  createTime: string;
}

/** Which source answered a gift list request. */
export type GiftSource = "room" | "signer" | "region";

/** Result of `fetchGifts()`. */
export interface GiftList {
  /** The gifts, without duplicates. */
  gifts: Gift[];
  /**
   * Which source answered: `room` (the LIVE's own list), `signer` (the
   * signer's room gift list) or `region` (the list for a region and language).
   */
  source: GiftSource;
}

/** Result of `connect()`. */
export interface ConnectResult {
  /** The room the connection entered. */
  roomId: string;
}

/**
 * Every event a {@link TikTokLiveConnection} emits, with its payload.
 *
 * Connection events: `connected`, `disconnected`, `reconnecting`, `error`.
 * LIVE events: the rest. A LIVE message is only decoded when one of the events
 * it can produce has a listener.
 */
export interface WebcastEventMap {
  /** The connection entered the room: after the first `connect()` and after each reconnect. */
  connected: ConnectedEvent;
  /**
   * An established connection ended. Not emitted when the first `connect()`
   * fails: its promise rejects instead.
   */
  disconnected: DisconnectedEvent;
  /** A reconnect attempt is about to run, after `delayMs`. */
  reconnecting: ReconnectingEvent;
  /**
   * A failure no promise reports: a message that couldn't be decoded, a failed
   * reconnect attempt. Only emitted when it has a listener; otherwise logged.
   */
  error: ConnectorError;
  /** The LIVE ended. The connection disconnects (reason `streamEnd`) and doesn't reconnect. */
  streamEnd: StreamEndEvent;
  /** A chat comment. */
  chat: ChatMessage;
  /** A gift (see {@link GiftMessage} for streaks). */
  gift: GiftMessage;
  /** Likes. */
  like: LikeMessage;
  /** A user followed the host. */
  follow: SocialMessage;
  /** A user shared the LIVE. */
  share: SocialMessage;
  /** A viewer joined, or another membership change. */
  member: MemberMessage;
  /** Viewer counts and top viewers. */
  roomUser: RoomUserMessage;
  /** A treasure chest. */
  envelope: EnvelopeMessage;
  /** A super fan banner. */
  superFan: BarrageMessage;
  /** A user became a super fan. */
  superFanJoin: BarrageMessage;
  /** A super fan box (also emitted as `envelope`). */
  superFanBox: EnvelopeMessage;
  /**
   * Every LIVE message before decoding, including the ones no other event
   * covers and backlog messages (`isHistory`). Duplicates are dropped.
   */
  raw: RawMessage;
}
