// The link group: link-mic and battles. The tables are in
// src/codec/messages/link/, the routes in src/routes/link.ts. Field numbers:
// PROTOCOL.md, "LIVE messages", from reference/src/TikTok-Webcast-Protobuf,
// except the battle notices, opponent gifts and battle gameplay, derived from
// observed traffic.
import type { Common, Image, Text, User } from "./shared.js";

/**
 * The values of {@link LinkMicBattle.action} TikTok defines
 * (`webcast.im.LinkMicBattle_BattleAction`).
 */
export const BattleAction = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A battle was proposed. */
  INVITE: 1,
  /** The proposal was rejected. */
  REJECT: 2,
  /** The proposal was canceled. */
  CANCEL: 3,
  /** The battle started. */
  OPEN: 4,
  /** The battle finished. */
  FINISH: 5,
  /** The battle was cut short. */
  CUT_SHORT: 6,
  /** The proposal was accepted. */
  ACCEPT: 7,
  /** A host asked to quit. */
  QUIT_APPLY: 8,
  /** The quit was declined. */
  DECLINE_QUIT: 9,
  /** The quit was declined, off LIVE. */
  DECLINE_OFF_QUIT: 10,
  /** A host left the link-mic. */
  LEAVE_LINKMIC: 11,
} as const);

/**
 * The values of {@link BattleSetting.status} TikTok defines
 * (`webcast.model.data.BattleSettings_BattleStatus`).
 */
export const BattleStatus = Object.freeze({
  /** Not started. */
  NOT_STARTED: 0,
  /** Running. */
  STARTED: 1,
  /** Finished. */
  FINISHED: 2,
  /** The punishment started. */
  PUNISH_STARTED: 3,
  /** The punishment finished. */
  PUNISH_FINISHED: 4,
} as const);

/**
 * The values of {@link BattleUserResult.result} TikTok defines
 * (`webcast.model.data.BattleResult_Result`).
 */
export const BattleResult = Object.freeze({
  /** Won. */
  WIN: 0,
  /** Lost. */
  LOSE: 1,
  /** A draw. */
  DRAW: 2,
} as const);

/**
 * The values of {@link BattleSetting.battleType} TikTok defines
 * (`webcast.model.data.BattleType`).
 */
export const BattleType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A normal battle. */
  NORMAL_BATTLE: 1,
  /** A team battle. */
  TEAM_BATTLE: 2,
  /** An individual battle. */
  INDIVIDUAL_BATTLE: 3,
  /** A "number 1" battle (Vietnam). */
  NUM_1_VN: 4,
  /** Take the stage. */
  TAKE_THE_STAGE: 51,
  /** A group show. */
  GROUP_SHOW: 52,
  /** Beans. */
  BEANS: 53,
  /** A group rank list. */
  GROUP_RANK_LIST: 54,
} as const);

/**
 * The values of {@link LinkMicArmies.triggerReason} TikTok defines
 * (`webcast.im.LinkMicArmies_TriggerReason`).
 */
export const ArmiesTriggerReason = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A score changed. */
  SCORE_UPDATE: 1,
  /** The battle ended. */
  BATTLE_END: 2,
  /** An opt-out changed. */
  OPT_OUT_UPDATE: 3,
  /** A keep-alive. */
  KEEP_ALIVE: 4,
  /** An effect changed. */
  EFFECT_UPDATE: 5,
} as const);

/**
 * The values of {@link LinkMicBattlePunishFinish.reason} TikTok defines
 * (`webcast.im.LinkMicBattlePunishFinish_Reason`).
 */
export const PunishFinishReason = Object.freeze({
  /** The time ran out. */
  TIME_UP: 0,
  /** It was cut short. */
  CUT_SHORT: 1,
} as const);

/**
 * The values of {@link LinkMicBattleTask.taskMessageType} TikTok defines
 * (`webcast.im.BattleTaskMessageType`).
 */
export const BattleTaskMessageType = Object.freeze({
  /** The task started. */
  START: 0,
  /** The task progressed. */
  TASK_UPDATE: 1,
  /** The task settled. */
  TASK_SETTLE: 2,
  /** The reward settled. */
  REWARD_SETTLE: 3,
} as const);

/**
 * The values of {@link BattleTaskSettle.result} TikTok defines
 * (`webcast.im.BattleTaskSettle_Result`).
 */
export const BattleTaskResult = Object.freeze({
  /** Succeeded. */
  SUCCEED: 0,
  /** Failed. */
  FAILED: 1,
  /** Both sides succeeded. */
  BOTH_SUCCEED: 2,
} as const);

/**
 * The values of {@link LinkMicBattleItemCard.msgType} TikTok defines
 * (`webcast.im.BattleCardMsgType`).
 */
export const BattleCardMsgType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A guide to obtaining cards. */
  CARD_OBTAIN_GUIDE: 1,
  /** A critical strike card was used. */
  USE_CRITICAL_STRIKE_CARD: 2,
  /** A smoke card was used. */
  USE_SMOKE_CARD: 3,
  /** A card was awarded. */
  AWARD_CARD_NOTICE: 4,
  /** An extra time card was used. */
  USE_EXTRA_TIME_CARD: 5,
  /** A special effect card was used. */
  USE_SPECIAL_EFFECT_CARD: 6,
  /** A potion card was used. */
  USE_POTION_CARD: 7,
  /** A wave card was used. */
  USE_WAVE_CARD: 8,
  /** A special effect notice. */
  SPECIAL_EFFECT_NOTICE: 9,
  /** A top 2 card was used. */
  USE_TOP_2_CARD: 10,
  /** A top 3 card was used. */
  USE_TOP_3_CARD: 11,
  /** A vault glove card was used. */
  USE_VAULT_GLOVE_CARD: 12,
} as const);

/**
 * The values of {@link LinkLayerMessage.messageType} TikTok defines
 * (`webcast.im.LinkLayerMessageType`).
 */
export const LinkLayerMessageType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A channel was created. */
  CREATE: 1,
  /** An invitation. */
  INVITE: 2,
  /** An application. */
  APPLY: 3,
  /** An application was permitted. */
  PERMIT: 4,
  /** A reply to an invitation. */
  REPLY: 5,
  /** A user was kicked out. */
  KICK_OUT: 6,
  /** An application was canceled. */
  CANCEL_APPLY: 7,
  /** An invitation was canceled. */
  CANCEL_INVITE: 8,
  /** A user left. */
  LEAVE: 9,
  /** The channel finished. */
  FINISH: 10,
  /** The user list changed. */
  LIST_CHANGE: 11,
  /** A user joined directly. */
  JOIN_DIRECT: 12,
  /** A user joined a group. */
  JOIN_GROUP: 13,
  /** A group join was permitted. */
  PERMIT_GROUP: 14,
  /** A group join was canceled. */
  CANCEL_GROUP: 15,
  /** A user left a group. */
  LEAVE_GROUP: 16,
  /** A peer-to-peer group changed. */
  P_2_P_GROUP_CHANGE: 17,
  /** A group changed. */
  GROUP_CHANGE: 18,
} as const);

/**
 * The values of {@link LinkLayerMessage.scene} and {@link LinkStateMessage.scene}
 * TikTok defines (`webcast.linkmic.common.Scene`).
 */
export const LinkScene = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A co-host (host to host) link. */
  CO_HOST: 2,
  /** A multi-guest link. */
  MULTI_LIVE: 4,
} as const);

/**
 * The values of {@link LinkLayerMessage.linkerMode} TikTok defines
 * (`webcast.linkmic.common.LinkerMode`).
 */
export const LinkerMode = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** Within one room. */
  INNER: 1,
  /** Across rooms. */
  CROSS: 2,
  /** Both. */
  MIXED: 3,
} as const);

/**
 * The values of {@link LinkerKickOutContent.kickoutReason} TikTok defines
 * (`webcast.linkmic.common.KickoutReason`).
 */
export const KickoutReason = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** The first frame timed out. */
  FIRST_FRAME_TIME_OUT: 1,
  /** The host removed the user. */
  BY_HOST: 2,
  /** The RTC connection was lost. */
  RTC_LOST_CONNECTION: 3,
  /** A punishment. */
  BY_PUNISH: 4,
  /** A moderator removed the user. */
  BY_ADMIN: 5,
  /** The host removed every guest. */
  HOST_REMOVE_ALL_GUESTS: 6,
  /** The enigma (mask) expired. */
  ENIGMA_EXPIRE: 7,
} as const);

/**
 * The values of {@link LinkPermitApplyContent.replyStatus} TikTok defines
 * (`webcast.linkmic.common.AgreeStatus`).
 */
export const AgreeStatus = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** Agreed. */
  AGREE: 1,
  /** Rejected. */
  REJECT: 2,
} as const);

/**
 * The values of {@link LinkUser.linkStatus} TikTok defines
 * (`webcast.model.data.LinkListStatus`).
 */
export const LinkListStatus = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** Waiting. */
  WAITING: 1,
  /** Linked. */
  LINKED: 2,
  /** Finished. */
  FINISHED: 3,
  /** Waiting or linked. */
  WAITING_OR_LINKED: 4,
} as const);

/**
 * The values of {@link LinkUser.roleType} TikTok defines
 * (`webcast.model.data.LinkRoleType`).
 */
export const LinkRoleType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** The leader. */
  LEADER: 1,
  /** A player. */
  PLAYER: 2,
  /** An invitee. */
  INVITEE: 3,
  /** An applier. */
  APPLIER: 4,
} as const);

/**
 * The values of {@link LinkUser.linkType} TikTok defines
 * (`webcast.model.data.LinkType`).
 */
export const LinkType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** Video. */
  VIDEO: 1,
  /** Audio. */
  AUDIO: 2,
  /** Virtual. */
  VIRTUAL: 3,
} as const);

/**
 * The values of {@link LinkerMuteContent.muteStatus} TikTok defines
 * (`webcast.im.MuteStatus`).
 */
export const MuteStatus = Object.freeze({
  /** Muted. */
  MUTE: 0,
  /** Unmuted. */
  UN_MUTE: 1,
} as const);

/**
 * The values of {@link LinkLayerListUser.userType} TikTok defines
 * (`webcast.linkmic.common.LinkerUserType`).
 */
export const LinkerUserType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A guest. */
  GUEST: 1,
  /** The host. */
  HOST: 2,
} as const);

/**
 * The values of {@link LinkUserState.audioMuted} and
 * {@link LinkUserState.videoMuted} TikTok defines
 * (`webcast.linkmic.common.MediaState`).
 */
export const MediaState = Object.freeze({
  /** TikTok didn't say. */
  UNDEFINED: 0,
  /** On. */
  NORMAL: 1,
  /** Muted. */
  MUTED: 2,
  /** On, occupied. */
  UN_MUTE_OCCUPIED: 3,
  /** Muted, occupied. */
  MUTED_OCCUPIED: 4,
} as const);

/**
 * The values of {@link LinkStateMessage.stateType} TikTok defines
 * (`webcast.linkmic.common.StateType`).
 */
export const LinkStateType = Object.freeze({
  /** Invalid. */
  INVALID: 0,
  /** The layout. */
  LAYOUT: 1,
  /** A user's online state. */
  ONLINE_USER_STATE: 2,
  /** Audio mute. */
  AUDIO_MUTE: 3,
  /** Video mute. */
  VIDEO_MUTE: 4,
  /** The RTC connection. */
  RTC_CONNECTION: 5,
  /** The network. */
  NETWORK: 6,
  /** The background image. */
  BACKGROUND_IMAGE: 7,
  /** The screen orientation. */
  SCREEN_ORIENTATION: 8,
  /** The avatar id. */
  AVATAR_ID: 9,
  /** The audio mute channels. */
  AUDIO_MUTE_CHANNELS: 10,
  /** A batch of changes. */
  REQ_BATCH_CHANGE: 100,
} as const);

/**
 * The values of {@link LinkUserState.onlineUserState} TikTok defines
 * (`webcast.linkmic.common.OnlineUserState`).
 */
export const OnlineUserState = Object.freeze({
  /** TikTok didn't say. */
  UNDEFINED: 0,
  /** Online. */
  NORMAL: 1,
  /** Paused. */
  PAUSED: 2,
} as const);

/**
 * The values of {@link LinkMicMethod.replyType} TikTok defines
 * (`webcast.model.data.LinkmicReplyType`).
 */
export const LinkmicReplyType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** Agreed. */
  AGREE: 1,
  /** Rejected. */
  REJECT: 2,
} as const);

/**
 * The values of {@link LinkerMediaChangeContent.op} TikTok defines
 * (`webcast.model.data.GuestMicCameraManageOp`).
 */
export const GuestMicCameraManageOp = Object.freeze({
  /** The mic was turned on. */
  OPEN_MIC: 0,
  /** The camera was turned on. */
  OPEN_CAMERA: 1,
  /** The mic was turned off. */
  CLOSE_MIC: 2,
  /** The camera was turned off. */
  CLOSE_CAMERA: 3,
  /** The mic was turned off as a punishment. */
  CLOSE_MIC_PUNISH: 4,
} as const);

/**
 * The values of {@link LinkMicBattleNotice.noticeType} TikTok defines
 * (`BattleNoticeType`, from the names of the MIT types-only package; traffic
 * has only shown `6`).
 */
export const BattleNoticeType = Object.freeze({
  /** A guide for the host. */
  ANCHOR_GUIDE: 0,
  /** A toast. */
  TOAST: 1,
  /** A bubble. */
  BUBBLE_GUIDE: 2,
  /** A gift guide for the host. */
  ANCHOR_GIFT_GUIDE: 3,
  /** The rules. */
  RULE_GUIDE: 4,
  /** A multi-match guide for the host. */
  ANCHOR_MULTI_MATCH_GUIDE: 5,
  /** A notice in the chat ({@link LinkMicBattleNotice.commonGuide}). */
  COMMON_GUIDE: 6,
  /** An extremely high score. */
  EXTREME_HIGH_SCORE: 7,
} as const);

/**
 * The values of {@link IceShowdownInfo.settingType} TikTok defines
 * (`IceShowdownSetting`, from the names of the MIT types-only package; traffic
 * has only shown `2`).
 */
export const IceShowdownSetting = Object.freeze({
  /** Off. */
  OFF: 0,
  /** Started by a host. */
  MANUAL: 1,
  /** Started by TikTok. */
  SYSTEM: 2,
} as const);

/**
 * The values of {@link GroupChannelUser.status} TikTok defines
 * (`webcast.linkmic.common.GroupStatus`).
 */
export const GroupStatus = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** Waiting to link. */
  WAITING: 1,
  /** Linked. */
  LINKED: 3,
} as const);

/**
 * The values of {@link GroupChannelUser.type} and the other group contents'
 * `type` TikTok defines (`webcast.linkmic.common.JoinType`).
 */
export const GroupJoinType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** Applied to a channel. */
  CHANNEL_APPLY: 1,
  /** Invited to a channel. */
  CHANNEL_INVITE: 2,
  /** Applied to the group. */
  GROUP_APPLY: 100,
  /** Applied to the group, following someone. */
  GROUP_APPLY_FOLLOW: 101,
  /** Invited to the group. */
  GROUP_INVITE: 102,
  /** Invited to the group, following someone. */
  GROUP_INVITE_FOLLOW: 103,
  /** The group's owner. */
  GROUP_OWNER_JOIN: 104,
} as const);

/** A participant of a link, by room and user id. */
export interface Player {
  /** The participant's room. */
  roomId: string;
  /** The participant's user id. */
  userId: string;
}

/** A battle's settings. */
export interface BattleSetting {
  /** The battle id. */
  battleId: string;
  /** When it starts, as a decimal string (milliseconds). */
  startTimeMs: string;
  /** How long it lasts, in seconds. */
  duration: number;
  /** The link channel. */
  channelId: string;
  /**
   * Where the battle is: `1` started, `2` finished ({@link BattleStatus}).
   * Other values may come: it stays a number.
   */
  status: number;
  /**
   * The battle's kind: `1` normal, `2` team ({@link BattleType}). Other
   * values may come: it stays a number.
   */
  battleType: number;
  /** When it ends, as a decimal string (milliseconds). */
  endTimeMs: string;
}

/** One host's result in a battle. */
export interface BattleUserResult {
  /** The host. */
  userId: string;
  /**
   * The outcome: `0` won, `1` lost, `2` a draw ({@link BattleResult}). Other
   * values may come: it stays a number.
   */
  result: number;
  /** The host's score. */
  score: number;
  /** The host's score in coins. */
  diamondScore: number;
}

/** A battle result, keyed by host (one entry of the proto's map). */
export interface BattleResultEntry {
  /** The host's user id. */
  key: string;
  /** The host's result. */
  value?: BattleUserResult;
}

/** A supporter of a host in a battle. */
export interface BattleUserArmy {
  /** The supporter. */
  userId: string;
  /** The supporter's score. */
  score: number;
  /** The supporter's display name. */
  nickname: string;
  /** The supporter's small profile picture. */
  avatarThumb?: Image;
  /** The supporter's score in coins. */
  diamondScore: number;
}

/** A host's supporters in a battle. */
export interface BattleUserArmies {
  /** The top supporters. */
  userArmies: BattleUserArmy[];
  /** The host's score. */
  hostScore: number;
}

/** A host's supporters, keyed by host (one entry of the proto's map). */
export interface BattleArmiesEntry {
  /** The host's user id. */
  key: string;
  /** The host's supporters. */
  value?: BattleUserArmies;
}

/** A host in a battle. */
export interface BattleBaseUserInfo {
  /** The host's user id. */
  userId: string;
  /** The host's display name. */
  nickName: string;
  /** The host's small profile picture. */
  avatarThumb?: Image;
  /** The host's username (unique id). */
  displayId: string;
  /** The host's room. */
  roomId: string;
}

/** A host's info in a battle. */
export interface BattleUserInfo {
  /** The host. */
  user?: BattleBaseUserInfo;
}

/** A host's info, keyed by host (one entry of the proto's map). */
export interface BattleUserInfoEntry {
  /** The host's user id. */
  key: string;
  /** The host's info. */
  value?: BattleUserInfo;
}

/** The members of a team in a team battle. */
export interface TeamUsersInfo {
  /** The team id. */
  teamId: string;
  /** The members' user ids. */
  userId: string[];
}

/** A team member's score. */
export interface BattleTeamUser {
  /** The member. */
  userId: string;
  /** The member's score. */
  score: number;
}

/** A team's result in a team battle. */
export interface BattleTeamResult {
  /** The team id. */
  teamId: string;
  /** The members and their scores. */
  teamUser: BattleTeamUser[];
  /** TikTok's result code. */
  result: number;
  /** The team's total score. */
  totalScore: number;
}

/** A battle between hosts started, changed or ended (`linkMicBattle` event). */
export interface LinkMicBattle {
  /** Data every message carries. */
  common?: Common;
  /** The battle id. */
  battleId: string;
  /** The battle's settings. */
  battleSettings?: BattleSetting;
  /**
   * What happened: `4` started, `5` finished ({@link BattleAction}). Other
   * values may come: it stays a number.
   */
  action: number;
  /** The result of each host, at the end. */
  battleResult: BattleResultEntry[];
  /** The supporters of each host. */
  armies: BattleArmiesEntry[];
  /** The hosts. */
  anchorsInfo: BattleUserInfoEntry[];
  /** The teams, in a team battle. */
  teamMember: TeamUsersInfo[];
  /** Who caused the action. */
  actionByUserId: string;
  /** The result of each team, in a team battle. */
  teamBattleResult: BattleTeamResult[];
}

/** The scores of a battle changed (`linkMicArmies` event). */
export interface LinkMicArmies {
  /** Data every message carries. */
  common?: Common;
  /** The battle id. */
  battleId: string;
  /** The supporters of each host. */
  armies: BattleArmiesEntry[];
  /**
   * Why: `1` a score changed, `2` the battle ended
   * ({@link ArmiesTriggerReason}). Other values may come: it stays a number.
   */
  triggerReason: number;
  /** Who sent the gift that changed the score. */
  fromUserId: string;
  /** The gift. */
  giftId: string;
  /** How many of the gift. */
  giftCount: number;
  /** The gift's worth, in coins. */
  totalDiamondCount: number;
}

/** A battle's punishment ended (`linkMicBattlePunishFinish` event). */
export interface LinkMicBattlePunishFinish {
  /** Data every message carries. */
  common?: Common;
  /** The link channel. */
  channelId: string;
  /** Who ended it. */
  opUid: string;
  /**
   * Why: `0` time ran out, `1` cut short ({@link PunishFinishReason}). Other
   * values may come: it stays a number.
   */
  reason: number;
  /** The battle id. */
  battleId: string;
}

/** A battle task's progress. */
export interface BattleTaskUpdate {
  /** The progress so far. */
  progress: number;
  /** Who contributed. */
  fromUserId: string;
}

/** A battle task's outcome. */
export interface BattleTaskSettle {
  /**
   * The outcome: `0` succeeded, `1` failed ({@link BattleTaskResult}). Other
   * values may come: it stays a number.
   */
  result: number;
}

/** A battle task started, progressed or settled (`linkMicBattleTask` event). */
export interface LinkMicBattleTask {
  /** Data every message carries. */
  common?: Common;
  /**
   * What happened: `0` started, `1` progressed, `2` settled
   * ({@link BattleTaskMessageType}). Other values may come: it stays a number.
   */
  taskMessageType: number;
  /** The progress, when it progressed. */
  taskUpdate?: BattleTaskUpdate;
  /** The outcome, when it settled. */
  taskSettle?: BattleTaskSettle;
  /** The battle id. */
  battleId: string;
}

/** A guest's fan tickets in a link. */
export interface UserFanTicket {
  /** The guest. */
  userId: string;
  /** The guest's fan tickets. */
  fanTicket: number;
  /** The guest's rank. */
  matchRank: number;
}

/** The fan tickets of a link's guests. */
export interface FanTicketRoomNotice {
  /** Each guest's fan tickets. */
  userFanTicket: UserFanTicket[];
  /** The fan tickets of every guest together. */
  totalLinkmicFanTicket: number;
}

/** The fan tickets of a link changed (`linkMicFanTicketMethod` event). */
export interface LinkMicFanTicketMethod {
  /** Data every message carries. */
  common?: Common;
  /** The fan tickets. */
  fanTicketRoomNotice?: FanTicketRoomNotice;
}

/** A link-mic signal of the older kind (`linkMicMethod` event). */
export interface LinkMicMethod {
  /** Data every message carries. */
  common?: Common;
  /** TikTok's message type code. */
  messageType: number;
  /** The user the signal is about. */
  userId: string;
  /** The link channel. */
  channelId: string;
  /** Who was invited. */
  inviteUid: string;
  /** TikTok's answer code. */
  answer: number;
  /** The user the signal goes to. */
  toUserId: string;
  /** The user the signal comes from. */
  fromUserId: string;
  /** The other host. */
  rivalAnchorId: string;
  /** The linked users. */
  linkedUsers: User[];
  /**
   * The reply: `1` agreed, `2` rejected ({@link LinkmicReplyType}). Other
   * values may come: it stays a number.
   */
  replyType: number;
}

/** A user in a link, with the link's state. */
export interface LinkUser {
  /** The user. */
  user?: User;
  /**
   * The link's status: `1` waiting, `2` linked ({@link LinkListStatus}).
   * Other values may come: it stays a number.
   */
  linkStatus: number;
  /**
   * The link's kind: `1` video, `2` audio ({@link LinkType}). Other values
   * may come: it stays a number.
   */
  linkType: number;
  /** The user's position in the layout. */
  userPosition: number;
  /**
   * The user's role: `1` leader, `2` player ({@link LinkRoleType}). Other
   * values may come: it stays a number.
   */
  roleType: number;
}

/** A user in a link's user list. */
export interface LinkListUser {
  /** The user. */
  user?: User;
  /** TikTok's link type code. */
  linkType: number;
  /** TikTok's role type code. */
  roleType: number;
}

/** An invitation to a link. */
export interface LinkerInviteContent {
  /** Who invited. */
  fromUserId: string;
  /** Who invited, in full. */
  fromUser?: User;
}

/** A reply to a link invitation. */
export interface LinkerReplyContent {
  /** TikTok's reply status code. */
  replyStatus: number;
  /** Who replied. */
  fromUser?: User;
  /** Who was replied to. */
  toUser?: User;
}

/** Users entered a link. */
export interface LinkerEnterContent {
  /** The linked users. */
  linkedUsers: LinkUser[];
}

/** A user left a link. */
export interface LinkerLeaveContent {
  /** Who left. */
  userId: string;
  /** TikTok's reason code. */
  leaveReason: number;
}

/** A user was removed from a link. */
export interface LinkerKickOutContent {
  /** Who removed them. */
  fromUserId: string;
  /**
   * Why: `2` the host, `5` a moderator ({@link KickoutReason}). Other values
   * may come: it stays a number.
   */
  kickoutReason: number;
}

/** The linked users changed. */
export interface LinkedListChangeContent {
  /** The linked users now. */
  linkedUsers: LinkUser[];
}

/** A user was muted or unmuted in a link. */
export interface LinkerMuteContent {
  /** The user. */
  userId: string;
  /**
   * The state: `0` muted, `1` unmuted ({@link MuteStatus}). Other values may
   * come: it stays a number.
   */
  muteStatus: number;
}

/** A link's user lists changed. */
export interface LinkerListChangeContent {
  /** The linked users. */
  linkedUsers: LinkListUser[];
  /** The users who applied. */
  appliedUsers: LinkListUser[];
  /** The users connecting. */
  connectingUsers: LinkListUser[];
}

/** A guest's mic or camera changed. */
export interface LinkerMediaChangeContent {
  /**
   * What changed: `0` mic on, `2` mic off ({@link GuestMicCameraManageOp}).
   * Other values may come: it stays a number.
   */
  op: number;
  /** The guest. */
  toUserId: string;
}

/** A multi-guest link changed: invitations, replies, joins, leaves, mutes (`linkMessage` event). */
export interface LinkMessage {
  /** Data every message carries. */
  common?: Common;
  /** TikTok's message type code. */
  messageType: number;
  /** The link id. */
  linkerId: string;
  /** TikTok's scene code. */
  scene: number;
  /** The invitation, for invitations. */
  inviteContent?: LinkerInviteContent;
  /** The reply, for replies. */
  replyContent?: LinkerReplyContent;
  /** The users who entered, for entries. */
  enterContent?: LinkerEnterContent;
  /** Who left, for leaves. */
  leaveContent?: LinkerLeaveContent;
  /** Who was removed, for removals. */
  kickOutContent?: LinkerKickOutContent;
  /** The linked users, when they changed. */
  linkedListChangeContent?: LinkedListChangeContent;
  /** The mute, for mutes. */
  muteContent?: LinkerMuteContent;
  /** The user lists, when they changed. */
  listChangeContent?: LinkerListChangeContent;
  /** The mic or camera change, for those. */
  mediaChangeContent?: LinkerMediaChangeContent;
}

/** A user in a link layer's user list. */
export interface LinkLayerListUser {
  /** The user. */
  user?: Player;
  /** The user's link-mic id. */
  linkmicId: string;
  /**
   * What the user is in the link: `1` a guest, `2` the host
   * ({@link LinkerUserType}). Other values may come: it stays a number.
   */
  userType: number;
}

/** Every user list of a link layer. */
export interface AllListUser {
  /** The linked users. */
  linkedList: LinkLayerListUser[];
  /** The users who applied. */
  appliedList: LinkLayerListUser[];
  /** The invited users. */
  invitedList: LinkLayerListUser[];
  /** The users ready to link. */
  readyList: LinkLayerListUser[];
}

/** A link layer's user lists changed. */
export interface LinkListChangeContent {
  /** TikTok's change type code. */
  type: number;
  /** The lists now. */
  list?: AllListUser;
}

/** An invitation in a link layer. */
export interface LinkInviteContent {
  /** Who invited. */
  invitor?: Player;
  /** Who was invited. */
  invitee?: Player;
}

/** An application in a link layer. */
export interface LinkApplyContent {
  /** Who applied. */
  applier?: Player;
}

/** An application was permitted or refused in a link layer. */
export interface LinkPermitApplyContent {
  /** Who decided. */
  permiter?: Player;
  /**
   * The decision: `1` agreed, `2` rejected ({@link AgreeStatus}). Other
   * values may come: it stays a number.
   */
  replyStatus: number;
  /** Who applied. */
  applier?: Player;
}

/** A reply to an invitation in a link layer. */
export interface LinkReplyInviteContent {
  /** Who replied. */
  invitee?: Player;
  /**
   * The reply: `1` agreed, `2` rejected ({@link AgreeStatus}). Other values
   * may come: it stays a number.
   */
  replyStatus: number;
}

/** A user was removed in a link layer. */
export interface LinkKickOutContent {
  /** Who was removed. */
  offliner?: Player;
  /**
   * Why: `2` the host, `5` a moderator ({@link KickoutReason}). Other values
   * may come: it stays a number.
   */
  kickoutReason: number;
}

/** A user left in a link layer. */
export interface LinkLeaveContent {
  /** Who left. */
  leaver?: Player;
  /** TikTok's reason code. */
  leaveReason: number;
}

/** A link layer's channel finished. */
export interface LinkFinishContent {
  /** The channel's owner. */
  owner?: Player;
  /** TikTok's reason code. */
  finishReason: number;
}

/** A participant of a group link: its own channel and who it is. */
export interface GroupPlayer {
  /** The participant's channel (traffic shows its room id). */
  channelId: string;
  /** The participant. */
  user?: Player;
}

/** One participant's channel in a group link (a host's, in a co-host LIVE). */
export interface GroupChannelUser {
  /** The channel (traffic shows the host's room id). */
  channelId: string;
  /**
   * Where it is: `1` waiting, `3` linked ({@link GroupStatus}). Other values
   * may come: it stays a number.
   */
  status: number;
  /**
   * How it joined: `102` invited, `104` the group's owner
   * ({@link GroupJoinType}). Other values may come: it stays a number.
   */
  type: number;
  /** The channel's user lists. */
  allUser?: AllListUser;
  /** When it joined, as a decimal string (nanoseconds, as traffic shows). */
  joinTime: string;
  /** When it linked, as a decimal string (nanoseconds, as traffic shows). */
  linkedTime: string;
  /** Who owns the channel. */
  ownerUser?: GroupPlayer;
  /** The channel's link-mic id in the group. */
  groupLinkmicId: string;
}

/** Every channel of a group link. */
export interface GroupChannelAllUser {
  /** The group's channel (the battle's `channelId` in a co-host battle). */
  groupChannelId: string;
  /** Each participant's channel. */
  user: GroupChannelUser[];
  /** The list's version. */
  contentVersion: number;
}

/** Someone joined a group link. */
export interface LinkJoinGroupContent {
  /** The group now. */
  groupUser?: GroupChannelAllUser;
  /** Who joined. */
  joinUser?: GroupPlayer;
  /** How ({@link GroupJoinType}). Other values may come: it stays a number. */
  type: number;
}

/** A request to join a group link was answered. */
export interface LinkPermitJoinGroupContent {
  /** Who answered. */
  approver?: GroupPlayer;
  /**
   * The answer: `1` agreed, `2` rejected ({@link AgreeStatus}). Other values
   * may come: it stays a number.
   */
  agreeStatus: number;
  /** How the joiner came ({@link GroupJoinType}). Other values may come: it stays a number. */
  type: number;
  /** The group now. */
  groupUser?: GroupChannelAllUser;
  /** The linked users' positions in the layout. */
  linkedUserUiPositions: string[];
}

/** A request to join a group link was canceled. */
export interface LinkCancelJoinGroupContent {
  /** Who left. */
  leaver: GroupPlayer[];
  /** Who canceled. */
  operator?: GroupPlayer;
  /** How they came ({@link GroupJoinType}). Other values may come: it stays a number. */
  type: number;
  /** The group now. */
  groupUser?: GroupChannelAllUser;
}

/** Someone left a group link. */
export interface LinkLeaveJoinGroupContent {
  /** Who left. */
  operator?: GroupPlayer;
  /** The group's channel. */
  groupChannelId: string;
  /** TikTok's code for where the leave came from. */
  leaveSource: string;
  /** The linked users' positions in the layout. */
  linkedUserUiPositions: string[];
}

/** A group link's participants changed (`GROUP_CHANGE`). */
export interface LinkGroupChangeContent {
  /** The group now. */
  groupUser?: GroupChannelAllUser;
  /** The linked users' positions in the layout. */
  linkedUserUiPositions: string[];
}

/** A group's participants changed, peer to peer, or someone joined it directly. */
export interface LinkGroupUserContent {
  /** The group now. */
  groupUser?: GroupChannelAllUser;
}

/** Someone joined the room's link directly. */
export interface LinkJoinRoomDirectContent {
  /** Who joined. */
  joiner?: Player;
  /** Their link-mic id. */
  joinerLinkMicId: string;
}

/** A link changed, in the newer link layer (`linkLayer` event). */
export interface LinkLayerMessage {
  /** Data every message carries. */
  common?: Common;
  /**
   * What happened: `2` an invitation, `9` a leave
   * ({@link LinkLayerMessageType}). Other values may come: it stays a number.
   */
  messageType: number;
  /** The link channel. */
  channelId: string;
  /**
   * The link's kind: `2` co-host, `4` multi-guest ({@link LinkScene}). Other
   * values may come: it stays a number.
   */
  scene: number;
  /**
   * Where the link runs: `1` one room, `2` across rooms ({@link LinkerMode}).
   * Other values may come: it stays a number.
   */
  linkerMode: number;
  /** The user lists, when they changed. */
  listChangeContent?: LinkListChangeContent;
  /** The invitation, for invitations. */
  inviteContent?: LinkInviteContent;
  /** The application, for applications. */
  applyContent?: LinkApplyContent;
  /** The decision, when an application was decided. */
  permitApplyContent?: LinkPermitApplyContent;
  /** The reply, for replies to invitations. */
  replyInviteContent?: LinkReplyInviteContent;
  /** Who was removed, for removals. */
  kickOutContent?: LinkKickOutContent;
  /** Who left, for leaves. */
  leaveContent?: LinkLeaveContent;
  /** The end, when the channel finished. */
  finishContent?: LinkFinishContent;
  /** Who joined, when someone joined a group. */
  joinGroupContent?: LinkJoinGroupContent;
  /** The answer, when a request to join a group was answered. */
  permitGroupContent?: LinkPermitJoinGroupContent;
  /** The cancel, when a request to join a group was canceled. */
  cancelGroupContent?: LinkCancelJoinGroupContent;
  /** Who left, when someone left a group. */
  leaveGroupContent?: LinkLeaveJoinGroupContent;
  /** The group, when it changed peer to peer. */
  p2pGroupChangeContent?: LinkGroupUserContent;
  /** The group, when its participants changed (`GROUP_CHANGE`, 18). */
  groupChangeContent?: LinkGroupChangeContent;
  /** The group, when someone joined it directly. */
  joinGroupDirectContent?: LinkGroupUserContent;
  /** Who joined, when someone joined the room's link directly. */
  joinRoomDirectContent?: LinkJoinRoomDirectContent;
}

/** A position in a link's layout. */
export interface LinkPosition {
  /** The position index. */
  position: number;
}

/** Where a user is in a link's layout. */
export interface MicPositionData {
  /** The position. */
  link?: LinkPosition;
}

/** A user's state in a link. */
export interface LinkUserState {
  /** The user. */
  user?: Player;
  /** The user's link-mic id. */
  linkmicId: string;
  /** Where the user is in the layout. */
  pos?: MicPositionData;
  /**
   * Whether the user is online: `1` online, `2` paused
   * ({@link OnlineUserState}). Other values may come: it stays a number.
   */
  onlineUserState: number;
  /**
   * The user's audio: `1` on, `2` muted ({@link MediaState}). Other values
   * may come: it stays a number.
   */
  audioMuted: number;
  /**
   * The user's video: `1` on, `2` muted ({@link MediaState}). Other values
   * may come: it stays a number.
   */
  videoMuted: number;
}

/** The state of a link's users (`linkState` event). */
export interface LinkStateMessage {
  /** Data every message carries. */
  common?: Common;
  /** The link channel. */
  channelId: string;
  /**
   * The link's kind: `2` co-host, `4` multi-guest ({@link LinkScene}). Other
   * values may come: it stays a number.
   */
  scene: number;
  /** Each user's state. */
  userStates: LinkUserState[];
  /**
   * What changed: `1` the layout, `3` audio mute ({@link LinkStateType}).
   * Other values may come: it stays a number.
   */
  stateType: number;
}

/** A battle card was used or awarded (`linkMicBattleItemCard` event). */
export interface LinkMicBattleItemCard {
  /** Data every message carries. */
  common?: Common;
  /** The battle id. */
  battleId: string;
  /**
   * What happened: `2` a critical strike card, `4` a card awarded
   * ({@link BattleCardMsgType}). Other values may come: it stays a number.
   */
  msgType: number;
  /** TikTok's award reason code. */
  awardReason: number;
}

/** A link's layout changed (`linkMicLayoutState` event). */
export interface LinkMicLayoutStateMessage {
  /** Data every message carries. */
  common?: Common;
  /** The link channel. */
  channelId: string;
  /** TikTok's scene code. */
  scene: number;
  /** The layout's version. */
  version: number;
}

/** A battle notice shown in the chat. */
export interface BattleNoticeCommonGuide {
  /**
   * The text: its key, such as `pm_mt_match_comment_toUpdateApp_hammer`, and
   * its fallback pattern.
   */
  displayText?: Text;
  /** Whether the hosts don't see it. */
  exceptAnchor: boolean;
}

/**
 * A notice TikTok shows during a battle, such as a hammer effect
 * (`linkMicBattleNotice` event). The table was derived from observed traffic:
 * only the notices in the chat (`noticeType` 6) are read.
 */
export interface LinkMicBattleNotice {
  /** Data every message carries. */
  common?: Common;
  /**
   * The kind of notice: `6` a notice in the chat ({@link BattleNoticeType}).
   * Other values may come: it stays a number.
   */
  noticeType: number;
  /** The notice in the chat, when `noticeType` is `6`. */
  commonGuide?: BattleNoticeCommonGuide;
}

/**
 * A gift a viewer sent to another host of the battle, not this room's
 * (`linkMicOpponentGifts` event). The table was derived from observed
 * traffic.
 */
export interface LinkMicOpponentGifts {
  /** Data every message carries. */
  common?: Common;
  /** The battle id. */
  battleId: string;
  /** The link channel. */
  channelId: string;
  /** Who sent the gift. */
  fromUserId: string;
  /** The host the gift went to. */
  giftToUserId: string;
  /** The gift. */
  giftId: string;
  /** How many of the gift this message counts. */
  giftCount: number;
  /** What one gift costs, in coins. */
  giftPrice: number;
  /** The gift's icon. */
  giftIconImage?: Image;
  /** How many of the gift were sent so far in this streak. */
  repeatCount: number;
  /** When the gift was sent, as a decimal string (milliseconds). */
  sendGiftSuccessTime: string;
  /** When the battle score was updated, as a decimal string (milliseconds). */
  updateBattleScoreTime: string;
}

/** An ice showdown in a battle: when it is announced and when it starts. */
export interface IceShowdownInfo {
  /**
   * How it was set: `1` by a host, `2` by TikTok ({@link IceShowdownSetting}).
   * Other values may come: it stays a number.
   */
  settingType: number;
  /** When it is announced, as a decimal string (milliseconds). */
  promptTimeMs: string;
  /** When it starts, as a decimal string (milliseconds). */
  startTimeMs: string;
}

/**
 * A gameplay of a battle changed, such as an ice showdown (`battleGameplay`
 * event). The table was derived from observed traffic.
 */
export interface BattleGameplayMessage {
  /** Data every message carries. */
  common?: Common;
  /** The battle id. */
  battleId: string;
  /** The ice showdown, for one. */
  iceShowdownInfo?: IceShowdownInfo;
}
