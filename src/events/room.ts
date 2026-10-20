// The room group: the room's state, ranks, polls, shopping and system
// messages. The tables are in src/codec/messages/room/, the routes in
// src/routes/room.ts.
import type { Common, PunishEventInfo, Text, User } from "./shared.js";

/**
 * The values of {@link ControlMessage.action} TikTok defines
 * (`webcast.im.ControlAction`). `STREAM_ENDED` and `STREAM_SUSPENDED` end the
 * LIVE: the connection emits `streamEnd` (`ended` or `suspended`) and stops.
 */
export const ControlAction = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** The host paused the LIVE. */
  PAUSED: 1,
  /** The host resumed the LIVE. */
  UNPAUSED: 2,
  /** The host ended the LIVE. */
  STREAM_ENDED: 3,
  /** TikTok ended the LIVE (a moderator or a ban). */
  STREAM_SUSPENDED: 4,
} as const);

/** The notice TikTok shows the host with a control message, such as why the LIVE was suspended. */
export interface ControlExtra {
  /** The notice's title. */
  title?: Text;
  /** The violation behind it, when there is one. */
  violationReason?: Text;
  /** The notice's text. */
  content?: Text;
}

/** A change to the LIVE's state, such as a pause or the LIVE ending (`controlMessage` event; the end is also `streamEnd`). */
export interface ControlMessage {
  /** Data every message carries. */
  common?: Common;
  /** What happened: `1` paused, `2` resumed, `3` ended, `4` suspended ({@link ControlAction}). */
  action: number;
  /** A short text TikTok shows for the change, when there is one. */
  tips: string;
  /** The notice shown to the host, when there is one. */
  extra?: ControlExtra;
  /** The punishment behind the change, when there is one. */
  punishInfo?: PunishEventInfo;
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

/**
 * The values of {@link RankUpdate.rankType} and {@link RankTextMessage.rankType}
 * TikTok defines (`webcast.model.data.ProfitRankType`).
 */
export const ProfitRankType = Object.freeze({
  /** The hourly rank. */
  HOURLY_RANK: 0,
  /** The weekly rank. */
  WEEKLY_RANK: 1,
  /** The hourly star rank. */
  HOURLY_STAR_RANK: 2,
  /** The weekly rising rank, as an activity. */
  WEEKLY_RISING_RANK_ACTIVITY: 3,
  /** The weekly rising rank. */
  WEEKLY_RISING_RANK: 4,
  /** The weekly rookie rank. */
  WEEKLY_ROOKIE: 5,
  /** The weekly e-commerce rank. */
  E_COMMERCE_WEEKLY: 6,
  /** The daily e-commerce rank. */
  E_COMMERCE_DAILY: 7,
  /** The daily rank. */
  DAILY_RANK: 8,
  /** The first gift rank. */
  FIRST_GIFT_RANK: 9,
  /** The game rank. */
  GAME_RANK: 10,
  /** The daily game rank. */
  DAILY_GAME: 11,
  /** The hall of fame. */
  HALL_OF_FAME_RANK: 12,
  /** The rank league. */
  RANK_LEAGUE: 13,
  /** The daily rookie rank. */
  DAILY_ROOKIE: 14,
  /** The team rank. */
  TEAM_RANK: 15,
  /** The class rank. */
  CLASS_RANK: 16,
  /** The daily PUBG rank. */
  DAILY_GAME_PUB_G: 20,
  /** The daily MLBB rank. */
  DAILY_GAME_MLB_B: 21,
  /** The daily Free Fire rank. */
  DAILY_GAME_FREE_FIRE: 22,
  /** The weekly rank of the first game subcategory. */
  WEEKLY_GAME_SUBCATEGORY_ONE: 23,
  /** The weekly rank of the second game subcategory. */
  WEEKLY_GAME_SUBCATEGORY_TWO: 24,
  /** The weekly rank of the third game subcategory. */
  WEEKLY_GAME_SUBCATEGORY_THREE: 25,
  /** The weekly collectibles rank. */
  WEEKLY_E_COMMERCE_COLLECTIBLES: 26,
  /** The weekly beauty and personal care rank. */
  WEEKLY_E_COMMERCE_BEAUTY_PERSONAL_CARE: 27,
  /** The weekly women's wear and underwear rank. */
  WEEKLY_E_COMMERCE_WOMEN_WEAR_UNDERWEAR: 28,
  /** A league match campaign rank. */
  CAMPAIGN_LEAGUEMATCH_RANK: 101,
} as const);

/**
 * The values of {@link RankUpdateMessage.opType} TikTok defines
 * (`webcast.im.OpType`).
 */
export const RankOpType = Object.freeze({
  /** TikTok's default. */
  DEFAULT: 0,
  /** A rank was added. */
  ADD: 1,
  /** A rank was removed. */
  REMOVE: 2,
  /** The ranks were reloaded. */
  RELOAD: 3,
  /** A basic effect. */
  BASIC_EFFECT: 4,
} as const);

/**
 * The values of {@link ClassInfo.classType} TikTok defines
 * (`webcast.model.data.ClassType`): the host's class, from D5 up to S.
 */
export const ClassType = Object.freeze({
  /** No class. */
  NONE: 0,
  D_5: 100,
  D_4: 200,
  D_3: 300,
  D_2: 400,
  D_1: 500,
  C_5: 600,
  C_4: 700,
  C_3: 800,
  C_2: 900,
  C_1: 1000,
  B_5: 1100,
  B_4: 1200,
  B_3: 1300,
  B_2: 1400,
  B_1: 1500,
  A_5: 1600,
  A_4: 1700,
  A_3: 1800,
  A_2: 1900,
  A_1: 2000,
  /** The top class. */
  S: 2100,
} as const);

/**
 * The values of {@link RankTextMessage.scene} TikTok defines
 * (`webcast.im.RankTextMessage_RankTestMessageScene`).
 */
export const RankTextScene = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** The top viewers changed, on the public screen. */
  ONLINE_AUDIENCE_TOP_N_UPDATE_PUBLIC_SCREEN: 1,
  /** Mid-peak motivation, at the top of the public screen. */
  MID_PEAK_MOTIVATION_PUBLIC_SCREEN_TOP: 2,
  /** Mid-peak motivation, on entering. */
  MID_PEAK_MOTIVATION_PUBLIC_SCREEN_ENTER: 3,
  /** A tile reward guide. */
  TILE_REWARD_GUIDE: 4,
} as const);

/**
 * The values of {@link GameRankNotifyMessage.msgType} TikTok defines
 * (`webcast.im.GameRankNotifyMessage_MsgType`).
 */
export const GameRankMsgType = Object.freeze({
  /** The host entered or left the rank. */
  RANK_IN_OUT: 0,
  /** The host's rank changed. */
  RANK_CHANGE: 1,
  /** Encouragement to the host. */
  ANCHOR_ENCOURAGE: 2,
  /** TikTok didn't say. */
  UNKNOWN: 255,
} as const);

/**
 * The values of {@link PollMessage.pollKind} TikTok defines
 * (`webcast.model.data.PollKind`).
 */
export const PollKind = Object.freeze({
  /** A normal poll. */
  NORMAL: 0,
  /** A gift poll. */
  GIFT: 1,
  /** A customizable poll. */
  CUSTOMIZABLE: 2,
  /** A customizable gift poll. */
  CUSTOMIZABLE_GIFT: 3,
  /** A quick gift poll. */
  QUICK_GIFT: 4,
  /** An emote poll. */
  EMOTE: 5,
} as const);

/**
 * The values of {@link PollEndContent.endType} TikTok defines
 * (`webcast.model.data.PollEndType`).
 */
export const PollEndType = Object.freeze({
  /** The time ran out. */
  BY_TIME: 0,
  /** The host ended it. */
  BY_OWNER: 1,
  /** Someone else ended it. */
  BY_OTHER: 2,
  /** A moderator ended it. */
  BY_ADMIN: 3,
} as const);

/**
 * The values of {@link PerceptionDialog.iconType} TikTok defines
 * (`webcast.model.data.PerceptionDialogIconType`).
 */
export const PerceptionIconType = Object.freeze({
  /** No icon. */
  NONE: 0,
  WARNING: 1,
  LINKMIC: 2,
  GUEST_LINKMIC: 3,
  LIVE: 4,
  TREASURE_BOX: 5,
  MUTE: 6,
  GAMEPAD_ACCESS_REVOKED: 7,
  BAN_REPORT_LIVE_SINGLE_ROOM: 8,
  BAN_REPORT_LIVE_ALL_ROOM: 9,
  BAN_REPORT_LIVE_GREEN_SCREEN: 10,
  GIFT: 11,
  APPEAL_SUCCESS: 12,
  MATCH: 13,
  LIVE_GOAL: 14,
  SUBSCRIPTION: 15,
  STAR_COMMENT: 16,
  RANKING: 17,
  COMMON: 18,
} as const);

/**
 * The values of {@link PartnershipDropsUpdateMessage.changeMode} TikTok
 * defines (`webcast.im.PartnershipDropsUpdateMessage_ChangeMode`).
 */
export const PartnershipChangeMode = Object.freeze({
  /** The drops are shown. */
  SHOW: 0,
  /** The drops changed. */
  UPDATE: 1,
  /** The drops closed. */
  CLOSE: 2,
} as const);

/**
 * The values of {@link OfflineGameInfo.offlineType} TikTok defines
 * (`webcast.im.PartnershipGameOfflineMessage_OfflineGameInfo_OfflineType`).
 */
export const OfflineType = Object.freeze({
  /** A task went offline. */
  TASK_OFFLINE: 0,
  /** An event went offline. */
  EVENT_OFFLINE: 1,
  /** Drops went offline. */
  DROPS_OFFLINE: 2,
} as const);

/** A dialog TikTok shows the host about a violation. */
export interface PerceptionDialog {
  /**
   * The dialog's icon: `1` a warning, `6` mute ({@link PerceptionIconType}).
   * Other values may come: it stays a number.
   */
  iconType: number;
  /** The dialog's title. */
  title?: Text;
  /** The dialog's subtitle. */
  subTitle?: Text;
  /** TikTok's scene code. */
  scene: number;
}

/** A violation notice to the host (`perception` event). */
export interface PerceptionMessage {
  /** Data every message carries. */
  common?: Common;
  /** The dialog TikTok shows. */
  dialog?: PerceptionDialog;
  /** The punishment, when there is one. */
  punishInfo?: PunishEventInfo;
}

/** The host's class on a class rank. */
export interface ClassInfo {
  /**
   * The class: `100` D5 up to `2100` S ({@link ClassType}). Other values may
   * come: it stays a number.
   */
  classType: number;
  /** The host's stars. */
  starCount: number;
}

/** One rank's update. */
export interface RankUpdate {
  /**
   * Which rank: `0` hourly, `1` weekly ({@link ProfitRankType}). Other values
   * may come: it stays a number.
   */
  rankType: number;
  /** The host's position on it. */
  ownRank: number;
  /** The text TikTok shows for it. */
  defaultContent?: Text;
  /** The host's class, on a class rank. */
  classInfo?: ClassInfo;
  /** The host's score on it. */
  currentScore: number;
}

/** The host's ranks changed (`rankUpdate` event). */
export interface RankUpdateMessage {
  /** Data every message carries. */
  common?: Common;
  /** Each rank's update. */
  updates: RankUpdate[];
  /**
   * What happened: `1` added, `2` removed, `3` reloaded ({@link RankOpType}).
   * Other values may come: it stays a number.
   */
  opType: number;
}

/** A rank notice shown in the chat (`rankText` event). */
export interface RankTextMessage {
  /** Data every message carries. */
  common?: Common;
  /**
   * Where it shows: `1` the top viewers changed ({@link RankTextScene}).
   * Other values may come: it stays a number.
   */
  scene: number;
  /** The host's position before. */
  ownerIdxBefore: number;
  /** The host's position after. */
  ownerIdxAfter: number;
  /** The viewer the notice is about. */
  curUserId: string;
  /** The notice text. */
  content?: Text;
  /**
   * Which rank: `0` hourly, `1` weekly ({@link ProfitRankType}). Other values
   * may come: it stays a number.
   */
  rankType: number;
}

/** A game rank notice (`gameRankNotify` event). */
export interface GameRankNotifyMessage {
  /** Data every message carries. */
  common?: Common;
  /**
   * What happened: `0` entered or left, `1` changed ({@link GameRankMsgType}).
   * Other values may come: it stays a number.
   */
  msgType: number;
  /** The notice text. */
  notifyText?: Text;
}

/** One option of a poll. */
export interface PollOption {
  /** How many votes it has. */
  votes: number;
  /** The option text. */
  displayContent: string;
  /** The option's index. */
  optionIdx: number;
}

/** A poll started. */
export interface PollStartContent {
  /** When it started, as a decimal string (a timestamp). */
  startTime: string;
  /** When it ends, as a decimal string (a timestamp). */
  endTime: string;
  /** The options. */
  optionList: PollOption[];
  /** The question. */
  title: string;
  /** Who started it. */
  operator?: User;
}

/** A poll ended. */
export interface PollEndContent {
  /**
   * Why: `0` the time ran out, `1` the host ended it ({@link PollEndType}).
   * Other values may come: it stays a number.
   */
  endType: number;
  /** The options with their final votes. */
  optionList: PollOption[];
}

/** A poll's votes changed. */
export interface PollUpdateVotesContent {
  /** The options with their votes. */
  optionList: PollOption[];
}

/** A poll started, changed or ended (`pollMessage` event). */
export interface PollMessage {
  /** Data every message carries. */
  common?: Common;
  /** TikTok's message type code: which of the contents applies. */
  messageType: number;
  /** The poll id. */
  pollId: string;
  /** The start, when the poll started. */
  startContent?: PollStartContent;
  /** The end, when the poll ended. */
  endContent?: PollEndContent;
  /** The votes, when they changed. */
  updateVotesContent?: PollUpdateVotesContent;
  /**
   * The poll's kind: `0` normal, `1` gift ({@link PollKind}). Other values
   * may come: it stays a number.
   */
  pollKind: number;
}

/** A product pinned to the LIVE. */
export interface PopProduct {
  /** The product's title. */
  title: string;
  /** The price, as TikTok formats it. */
  price: string;
  /** The product image's URL. */
  imageUrl: string;
  /** The product id. */
  productId: string;
}

/** A snapshot of a product. */
export interface ProductSnapShot {
  /** The product id. */
  productId: string;
  /** The product's title. */
  title: string;
}

/** A shopping event: a product pinned, the product count (`oecLiveShopping` event). */
export interface OecLiveShoppingMessage {
  /** Data every message carries. */
  common?: Common;
  /** TikTok's action type code. */
  actionType: number;
  /** How many products the LIVE sells. */
  liveProductNumber: number;
  /** The pinned product. */
  popProduct?: PopProduct;
  /** The product snapshot. */
  productSnapShot?: ProductSnapShot;
}

/** A capsule (a small prompt) TikTok shows (`capsule` event). */
export interface CapsuleMessage {
  /** Data every message carries. */
  common?: Common;
  /** The capsule's text. */
  desc?: Text;
  /** TikTok's capsule type code. */
  type: number;
  /** TikTok's scene name. */
  scene: string;
  /** TikTok's sub-scene name. */
  subScene: string;
}

/** A marquee announcement (`marqueeAnnouncement` event). */
export interface MarqueeAnnouncementMessage {
  /** Data every message carries. */
  common?: Common;
  /** TikTok's scene name. */
  messageScene: string;
}

/** A speaker message (`speaker` event). The proto holds only the common data. */
export interface SpeakerMessage {
  /** Data every message carries. */
  common?: Common;
}

/** An in-room banner (`inRoomBanner` event). The proto holds only the common data. */
export interface InRoomBannerMessage {
  /** Data every message carries. */
  common?: Common;
}

/** A captcha the viewer must solve. */
export interface AccessControlCaptcha {
  /** The captcha's record id. */
  captchaRecordId: string;
  /** The room. */
  roomId: string;
  /** How long the viewer has to solve it, in seconds. */
  verifyDurationInSec: number;
}

/** An access control, such as a captcha (`accessControl` event). */
export interface AccessControlMessage {
  /** Data every message carries. */
  common?: Common;
  /** The captcha. */
  captcha?: AccessControlCaptcha;
}

/** Access was revoked or restored (`accessRecall` event). */
export interface AccessRecallMessage {
  /** Data every message carries. */
  common?: Common;
  /** TikTok's status code. */
  status: number;
  /** How long it lasts. */
  duration: number;
  /** When it ends, as a decimal string (a timestamp). */
  endTime: string;
  /** TikTok's scene name. */
  scene: string;
  /** The notice. */
  notice?: Text;
  /** The notice's content. */
  content?: Text;
  /** The punishment behind it. */
  punishInfo?: PunishEventInfo;
}

/** A game partnership's drops changed (`partnershipDropsUpdate` event). */
export interface PartnershipDropsUpdateMessage {
  /** Data every message carries. */
  common?: Common;
  /**
   * What happened: `0` shown, `1` changed, `2` closed
   * ({@link PartnershipChangeMode}). Other values may come: it stays a number.
   */
  changeMode: number;
  /** The drops id. */
  dropsId: string;
  /** The task id. */
  taskId: string;
  /** The event id. */
  eventId: string;
  /** The host. */
  anchorUid: string;
}

/** A partnership game that went offline. */
export interface OfflineGameInfo {
  /** The task id. */
  taskId: string;
  /** The toast TikTok shows. */
  toastText: string;
  /**
   * What went offline: `0` a task, `1` an event, `2` drops
   * ({@link OfflineType}). Other values may come: it stays a number.
   */
  offlineType: number;
  /** The game id. */
  gameId: string;
}

/** Partnership games went offline (`partnershipGameOffline` event). */
export interface PartnershipGameOfflineMessage {
  /** Data every message carries. */
  common?: Common;
  /** The games. */
  offlineGameList: OfflineGameInfo[];
}

/** A partnership punishment (`partnershipPunish` event). */
export interface PartnershipPunishMessage {
  /** Data every message carries. */
  common?: Common;
  /** The punishment. */
  punishInfo?: PunishEventInfo;
}

/** The LIVE's game intro (`liveGameIntro` event). */
export interface LiveGameIntroMessage {
  /** Data every message carries. */
  common?: Common;
  /** The intro text. */
  content?: Text;
  /** Whether the intro has rank info. */
  hasRankInfo: boolean;
}
