// The chat group: chat, reactions and moderation. The tables are in
// src/codec/messages/chat/, the routes in src/routes/chat.ts.
import type { GiftMessage, MemberMessage } from "./gift.js";
import type {
  ChatEmote,
  Common,
  Emote,
  MsgFilter,
  Text,
  User,
  UserIdentity,
} from "./shared.js";

/** A chat comment (`chat` event). */
export interface ChatMessage {
  /** Data every message carries. */
  common?: Common;
  /** Who commented. */
  user?: User;
  /** The user the comment replies to or mentions with `@`, when TikTok sends one. */
  atUser?: User;
  /** What the commenter is to the host, for filtering. */
  msgFilter?: MsgFilter;
  /** How the commenter relates to the host. */
  userIdentity?: UserIdentity;
  /** The comment text. */
  content: string;
  /** The comment's language code, such as `en`, when TikTok detected one. */
  contentLanguage: string;
  /** The emotes in the comment. */
  emotes: ChatEmote[];
  /**
   * TikTok's tags of the comment: `0` normal, `1` candidate, `2` overage
   * ({@link CommentTag}). Other values may come: they stay numbers.
   */
  commentTag: number[];
  /** The users the comment mentions. */
  mentionUsers: User[];
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

/** A follow or share (`social` event; also `follow` or `share`, by its text key). */
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
  /** TikTok's follow counter, as sent (what it counts isn't known yet). */
  followCount: number;
  /** How many times the user shared the LIVE. */
  shareCount: number;
  /** TikTok's follow type code. */
  followType: number;
  /** The id of the user followed, when TikTok says (the host, presumably). */
  targetUserId: string;
}

/**
 * The values of {@link RoomPinMessage.action} TikTok defines
 * (`webcast.im.PinMessage_actionType`).
 */
export const PinAction = Object.freeze({
  /** TikTok didn't say (the proto's `UN_KOWN`). */
  UNKNOWN: 0,
  /** A message was pinned. */
  PIN: 1,
  /** The pinned message was unpinned. */
  PIN_CANCEL: 2,
} as const);

/**
 * The values of {@link ChatMessage.commentTag} TikTok defines
 * (`webcast.im.CommentTag`).
 */
export const CommentTag = Object.freeze({
  /** A normal comment. */
  NORMAL: 0,
  /** A candidate comment. */
  CANDIDATE: 1,
  /** An overage comment. */
  OVERAGE: 2,
} as const);

/**
 * The values of {@link BottomMessage.bizType} TikTok defines
 * (`webcast.im.BizType`).
 */
export const BottomBizType = Object.freeze({
  /** TikTok didn't say. */
  DEFAULT: 0,
  /** A prompt to rethink a comment. */
  RETHINK_CHAT: 1,
  /** A prompt to rethink a question. */
  RETHINK_QA: 2,
  /** A warning tag in this room. */
  WARNING_TAG_CURRENT_ROOM: 3,
  /** A warning tag in the co-host's room. */
  WARNING_TAG_COHOST_ROOM: 4,
  /** The viewer is at risk of losing the ability to comment. */
  AGS_AT_RISK_OF_UNABLE_TO_COMMENT: 5,
  /** A perception center notice. */
  PERCEPTION_CENTER: 6,
} as const);

/** A comment made of emotes only (`emote` event). */
export interface EmoteChatMessage {
  /** Data every message carries. */
  common?: Common;
  /** Who sent the emotes. */
  user?: User;
  /** The emotes, in order. */
  emoteList: Emote[];
  /** What the sender is to the host, for filtering. */
  msgFilter?: MsgFilter;
  /** How the sender relates to the host. */
  userIdentity?: UserIdentity;
}

/** Comments deleted by a moderator (`imDelete` event). */
export interface ImDeleteMessage {
  /** Data every message carries. */
  common?: Common;
  /** The ids of the deleted comments. */
  deleteMsgIds: string[];
  /** The ids of the users whose comments were deleted. */
  deleteUserIds: string[];
}

/** A message pinned to the chat, or unpinned (`roomPin` event). */
export interface RoomPinMessage {
  /** Data every message carries. */
  common?: Common;
  /** The pinned comment, when a comment was pinned. */
  chatMessage?: ChatMessage;
  /** The pinned follow or share, when one was pinned. */
  socialMessage?: SocialMessage;
  /** The pinned gift, when a gift was pinned. */
  giftMessage?: GiftMessage;
  /** The pinned join, when a join was pinned. */
  memberMessage?: MemberMessage;
  /** The pinned likes, when likes were pinned. */
  likeMessage?: LikeMessage;
  /** The message type of the pinned message, such as `WebcastChatMessage`. */
  method: string;
  /** When it was pinned, as a decimal string (a timestamp). */
  pinTime: string;
  /** Who pinned it. */
  operator?: User;
  /**
   * What happened: `1` pinned, `2` unpinned, `0` unknown ({@link PinAction}).
   * Other values may come: it stays a number.
   */
  action: number;
  /** The id of the pinned message. */
  pinMsgId: string;
}

/** A question asked in the Q&A. */
export interface Question {
  /** The question id. */
  questionId: string;
  /** The question text. */
  content: string;
  /** TikTok's answer status code. */
  answerStatus: number;
  /** When it was asked, as a decimal string (a timestamp). */
  createTime: string;
  /** Who asked. */
  user?: User;
}

/** A new question in the Q&A (`questionNew` event). */
export interface QuestionNewMessage {
  /** Data every message carries. */
  common?: Common;
  /** The question (the proto's `data`, field 2). */
  details?: Question;
}

/** One language of a caption. */
export interface CaptionContent {
  /** The language code, such as `en`. */
  lang: string;
  /** The caption text. */
  content: string;
}

/** A live caption of what the host says (`captionMessage` event). */
export interface CaptionMessage {
  /** Data every message carries. */
  common?: Common;
  /** When the caption starts, as a decimal string (milliseconds). */
  timestampMs: string;
  /** How long it lasts, in milliseconds. */
  durationMs: number;
  /** The caption in each language. */
  content: CaptionContent[];
  /** Whether the caption is final, or may still change. */
  definite: boolean;
}

/** A message from the room, such as a welcome (`roomMessage` event). */
export interface RoomMessage {
  /** Data every message carries. */
  common?: Common;
  /** The message text. */
  content: string;
  /** TikTok's scene name for the message. */
  scene: string;
  /** Whether it's the welcome message. */
  isWelcome: boolean;
}

/** A notice from TikTok, such as a warning (`notice` event). */
export interface NoticeMessage {
  /** Data every message carries. */
  common?: Common;
  /** The notice text. */
  content: string;
  /** TikTok's notice type code. */
  noticeType: number;
  /** The notice's title. */
  title?: Text;
  /** The notice's title, in the newer layout. */
  noticeTitle?: Text;
  /** The notice's content, in the newer layout. */
  noticeContent?: Text;
}

/** A system message (`system` event). */
export interface SystemMessage {
  /** Data every message carries. */
  common?: Common;
  /** The message text. */
  message: string;
}

/** The LIVE's intro text (`liveIntro` event). */
export interface LiveIntroMessage {
  /** Data every message carries. */
  common?: Common;
  /** The intro text. */
  content: string;
  /** The host. */
  user?: User;
}

/** A viewer who joined without an account (`unauthorizedMember` event). */
export interface UnauthorizedMemberMessage {
  /** Data every message carries. */
  common?: Common;
  /** The name TikTok shows for the viewer. */
  nickName: string;
}

/** A detection probe TikTok sends to clients (`msgDetect` event). */
export interface MsgDetectMessage {
  /** Data every message carries. */
  common?: Common;
  /** TikTok's detection type code. */
  dType: number;
  /** TikTok's trigger code. */
  triggerBy: number;
}

/** A toast TikTok shows (`toast` event). */
export interface ToastMessage {
  /** Data every message carries. */
  common?: Common;
  /** How long it shows, in milliseconds. */
  displayDurationMillisecond: number;
}

/** A message shown at the bottom of the LIVE (`bottomMessage` event). */
export interface BottomMessage {
  /** Data every message carries. */
  common?: Common;
  /** The message text. */
  content: string;
  /**
   * What it is about: `1` rethink a comment, `6` the perception center
   * ({@link BottomBizType}). Other values may come: it stays a number.
   */
  bizType: number;
}

/** A verification request from TikTok (`roomVerify` event). */
export interface RoomVerifyMessage {
  /** Data every message carries. */
  common?: Common;
  /** The message text. */
  content: string;
  /** Whether the room closes. */
  closeRoom: boolean;
}
