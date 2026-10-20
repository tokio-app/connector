// Every event a connection emits, with its payload type: WebcastEventMap,
// the WebcastEvent constant of their names, and the payload types of each
// group (connection.ts, shared.ts, chat.ts, gift.ts, link.ts, room.ts).
import type { EventName } from "../emitter.js";
import type { ConnectorError } from "../errors.js";
import type {
  BottomMessage,
  CaptionMessage,
  ChatMessage,
  EmoteChatMessage,
  ImDeleteMessage,
  LikeMessage,
  LiveIntroMessage,
  MsgDetectMessage,
  NoticeMessage,
  QuestionNewMessage,
  RoomMessage,
  RoomPinMessage,
  RoomVerifyMessage,
  SocialMessage,
  SystemMessage,
  ToastMessage,
  UnauthorizedMemberMessage,
} from "./chat.js";
import type {
  ConnectedEvent,
  DisconnectedEvent,
  RawMessage,
  ReconnectingEvent,
  StreamEndEvent,
} from "./connection.js";
import type {
  BarrageMessage,
  BoostCardMessage,
  EnvelopeMessage,
  GiftBroadcastMessage,
  GiftDynamicRestrictionMessage,
  GiftMessage,
  GiftPanelUpdateMessage,
  GiftPromptMessage,
  GoalUpdateMessage,
  GuideMessage,
  HourlyRankRewardMessage,
  MemberMessage,
  RoomNotifyMessage,
  SubNotifyMessage,
  SubPinEventMessage,
  ViewerPicksUpdateMessage,
} from "./gift.js";
import type {
  LinkLayerMessage,
  LinkMessage,
  LinkMicArmies,
  LinkMicBattle,
  LinkMicBattleItemCard,
  LinkMicBattlePunishFinish,
  LinkMicBattleTask,
  LinkMicFanTicketMethod,
  LinkMicLayoutStateMessage,
  LinkMicMethod,
  LinkStateMessage,
} from "./link.js";
import type {
  AccessControlMessage,
  AccessRecallMessage,
  CapsuleMessage,
  ControlMessage,
  GameRankNotifyMessage,
  InRoomBannerMessage,
  LiveGameIntroMessage,
  MarqueeAnnouncementMessage,
  OecLiveShoppingMessage,
  PartnershipDropsUpdateMessage,
  PartnershipGameOfflineMessage,
  PartnershipPunishMessage,
  PerceptionMessage,
  PollMessage,
  RankTextMessage,
  RankUpdateMessage,
  RoomUserMessage,
  SpeakerMessage,
} from "./room.js";

export * from "./chat.js";
export * from "./connection.js";
export * from "./gift.js";
export * from "./link.js";
export * from "./room.js";
export * from "./shared.js";

/**
 * Every event a {@link TikTokLiveConnection} emits, with its payload.
 *
 * Connection events: `connected`, `disconnected`, `reconnecting`, `error`.
 * LIVE events: the rest, in the order of their groups (chat, gifts, link-mic,
 * room), then `raw`. A LIVE message is only decoded when one of the events it
 * can produce has a listener. A message type may lead to a base event and a
 * derived one (`social` and `follow`); the base one comes first.
 */
export interface WebcastEventMap {
  /**
   * The connection entered the room: after the first `connect()` and after
   * each reconnect.
   */
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
  /** A chat comment. */
  chat: ChatMessage;
  /** A comment made of emotes only. */
  emote: EmoteChatMessage;
  /** Likes. */
  like: LikeMessage;
  /** A follow or share, whatever its text key (also `follow` or `share`). */
  social: SocialMessage;
  /** A user followed the host. */
  follow: SocialMessage;
  /** A user shared the LIVE. */
  share: SocialMessage;
  /** A moderator deleted comments. */
  imDelete: ImDeleteMessage;
  /** A message was pinned to the chat, or unpinned. */
  roomPin: RoomPinMessage;
  /** A new question in the Q&A. */
  questionNew: QuestionNewMessage;
  /** A live caption of what the host says. */
  captionMessage: CaptionMessage;
  /** A message from the room, such as a welcome. */
  roomMessage: RoomMessage;
  /** A notice from TikTok, such as a warning. */
  notice: NoticeMessage;
  /** A system message. */
  system: SystemMessage;
  /** The LIVE's intro text. */
  liveIntro: LiveIntroMessage;
  /** A viewer joined without an account. */
  unauthorizedMember: UnauthorizedMemberMessage;
  /** A detection probe TikTok sends to clients. */
  msgDetect: MsgDetectMessage;
  /** A toast TikTok shows. */
  toast: ToastMessage;
  /** A message shown at the bottom of the LIVE. */
  bottomMessage: BottomMessage;
  /** A verification request from TikTok. */
  roomVerify: RoomVerifyMessage;
  /** A gift (see {@link GiftMessage} for streaks). */
  gift: GiftMessage;
  /** A viewer joined, or another membership change. */
  member: MemberMessage;
  /** A subscription, or a subscription notice. */
  subNotify: SubNotifyMessage;
  /** A subscription card was pinned or unpinned. */
  subPinEvent: SubPinEventMessage;
  /** A banner, whatever its text key (also `superFan` or `superFanJoin`). */
  barrage: BarrageMessage;
  /** A super fan banner. */
  superFan: BarrageMessage;
  /** A user became a super fan. */
  superFanJoin: BarrageMessage;
  /** A treasure chest. */
  envelope: EnvelopeMessage;
  /** A super fan box (also emitted as `envelope`). */
  superFanBox: EnvelopeMessage;
  /** A gift broadcast across rooms. */
  giftBroadcast: GiftBroadcastMessage;
  /** A notice shown in the room, such as a big gift elsewhere. */
  roomNotify: RoomNotifyMessage;
  /** A LIVE goal was set or progressed. */
  goalUpdate: GoalUpdateMessage;
  /** A viewer picks round changed. */
  viewerPicksUpdate: ViewerPicksUpdateMessage;
  /** The hourly rank's rewards. */
  hourlyRank: HourlyRankRewardMessage;
  /** A prompt about gifting, such as a spending block. */
  giftPrompt: GiftPromptMessage;
  /** The gift panel changed. */
  giftPanelUpdate: GiftPanelUpdateMessage;
  /** A gift's restrictions changed. */
  giftDynamicRestriction: GiftDynamicRestrictionMessage;
  /** A guide TikTok shows, such as a gift suggestion. */
  guide: GuideMessage;
  /** Boost cards. */
  boostCard: BoostCardMessage;
  /** A battle between hosts started, changed or ended. */
  linkMicBattle: LinkMicBattle;
  /** The scores of a battle changed. */
  linkMicArmies: LinkMicArmies;
  /** A battle's punishment ended. */
  linkMicBattlePunishFinish: LinkMicBattlePunishFinish;
  /** A battle task started, progressed or settled. */
  linkMicBattleTask: LinkMicBattleTask;
  /** The fan tickets of a link changed. */
  linkMicFanTicketMethod: LinkMicFanTicketMethod;
  /** A link-mic signal of the older kind. */
  linkMicMethod: LinkMicMethod;
  /** A multi-guest link changed: invitations, replies, joins, leaves, mutes. */
  linkMessage: LinkMessage;
  /** A link changed, in the newer link layer. */
  linkLayer: LinkLayerMessage;
  /** The state of a link's users. */
  linkState: LinkStateMessage;
  /** A battle card was used or awarded. */
  linkMicBattleItemCard: LinkMicBattleItemCard;
  /** A link's layout changed. */
  linkMicLayoutState: LinkMicLayoutStateMessage;
  /**
   * The LIVE ended. The connection disconnects (reason `streamEnd`) and
   * doesn't reconnect.
   */
  streamEnd: StreamEndEvent;
  /** The LIVE's state changed: paused, resumed, ended. */
  controlMessage: ControlMessage;
  /** Viewer counts and top viewers. */
  roomUser: RoomUserMessage;
  /** A violation notice to the host. */
  perception: PerceptionMessage;
  /** The host's ranks changed. */
  rankUpdate: RankUpdateMessage;
  /** A rank notice shown in the chat. */
  rankText: RankTextMessage;
  /** A game rank notice. */
  gameRankNotify: GameRankNotifyMessage;
  /** A poll started, changed or ended. */
  pollMessage: PollMessage;
  /** A shopping event: a product pinned, the product count. */
  oecLiveShopping: OecLiveShoppingMessage;
  /** A capsule (a small prompt) TikTok shows. */
  capsule: CapsuleMessage;
  /** A marquee announcement. */
  marqueeAnnouncement: MarqueeAnnouncementMessage;
  /** A speaker message. */
  speaker: SpeakerMessage;
  /** An in-room banner. */
  inRoomBanner: InRoomBannerMessage;
  /** An access control, such as a captcha. */
  accessControl: AccessControlMessage;
  /** Access was revoked or restored. */
  accessRecall: AccessRecallMessage;
  /** A game partnership's drops changed. */
  partnershipDropsUpdate: PartnershipDropsUpdateMessage;
  /** Partnership games went offline. */
  partnershipGameOffline: PartnershipGameOfflineMessage;
  /** A partnership punishment. */
  partnershipPunish: PartnershipPunishMessage;
  /** The LIVE's game intro. */
  liveGameIntro: LiveGameIntroMessage;
  /**
   * Every LIVE message before decoding, including the ones no other event
   * covers and backlog messages (`isHistory`). Duplicates are dropped.
   */
  raw: RawMessage;
}

/** A public event name: a key of {@link WebcastEventMap}. */
export type WebcastEventName = EventName<WebcastEventMap>;

/**
 * Every event name, as a constant, so apps needn't spell them as strings:
 *
 * ```ts
 * connection.on(WebcastEvent.CHAT, (chat) => console.log(chat.content));
 * ```
 *
 * The keys are the names in SCREAMING_CASE; the values are the keys of
 * {@link WebcastEventMap}, in its order. events/index.test.ts fails when one
 * is missing.
 */
export const WebcastEvent = Object.freeze({
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  RECONNECTING: "reconnecting",
  ERROR: "error",
  CHAT: "chat",
  EMOTE: "emote",
  LIKE: "like",
  SOCIAL: "social",
  FOLLOW: "follow",
  SHARE: "share",
  IM_DELETE: "imDelete",
  ROOM_PIN: "roomPin",
  QUESTION_NEW: "questionNew",
  CAPTION_MESSAGE: "captionMessage",
  ROOM_MESSAGE: "roomMessage",
  NOTICE: "notice",
  SYSTEM: "system",
  LIVE_INTRO: "liveIntro",
  UNAUTHORIZED_MEMBER: "unauthorizedMember",
  MSG_DETECT: "msgDetect",
  TOAST: "toast",
  BOTTOM_MESSAGE: "bottomMessage",
  ROOM_VERIFY: "roomVerify",
  GIFT: "gift",
  MEMBER: "member",
  SUB_NOTIFY: "subNotify",
  SUB_PIN_EVENT: "subPinEvent",
  BARRAGE: "barrage",
  SUPER_FAN: "superFan",
  SUPER_FAN_JOIN: "superFanJoin",
  ENVELOPE: "envelope",
  SUPER_FAN_BOX: "superFanBox",
  GIFT_BROADCAST: "giftBroadcast",
  ROOM_NOTIFY: "roomNotify",
  GOAL_UPDATE: "goalUpdate",
  VIEWER_PICKS_UPDATE: "viewerPicksUpdate",
  HOURLY_RANK: "hourlyRank",
  GIFT_PROMPT: "giftPrompt",
  GIFT_PANEL_UPDATE: "giftPanelUpdate",
  GIFT_DYNAMIC_RESTRICTION: "giftDynamicRestriction",
  GUIDE: "guide",
  BOOST_CARD: "boostCard",
  LINK_MIC_BATTLE: "linkMicBattle",
  LINK_MIC_ARMIES: "linkMicArmies",
  LINK_MIC_BATTLE_PUNISH_FINISH: "linkMicBattlePunishFinish",
  LINK_MIC_BATTLE_TASK: "linkMicBattleTask",
  LINK_MIC_FAN_TICKET_METHOD: "linkMicFanTicketMethod",
  LINK_MIC_METHOD: "linkMicMethod",
  LINK_MESSAGE: "linkMessage",
  LINK_LAYER: "linkLayer",
  LINK_STATE: "linkState",
  LINK_MIC_BATTLE_ITEM_CARD: "linkMicBattleItemCard",
  LINK_MIC_LAYOUT_STATE: "linkMicLayoutState",
  STREAM_END: "streamEnd",
  CONTROL_MESSAGE: "controlMessage",
  ROOM_USER: "roomUser",
  PERCEPTION: "perception",
  RANK_UPDATE: "rankUpdate",
  RANK_TEXT: "rankText",
  GAME_RANK_NOTIFY: "gameRankNotify",
  POLL_MESSAGE: "pollMessage",
  OEC_LIVE_SHOPPING: "oecLiveShopping",
  CAPSULE: "capsule",
  MARQUEE_ANNOUNCEMENT: "marqueeAnnouncement",
  SPEAKER: "speaker",
  IN_ROOM_BANNER: "inRoomBanner",
  ACCESS_CONTROL: "accessControl",
  ACCESS_RECALL: "accessRecall",
  PARTNERSHIP_DROPS_UPDATE: "partnershipDropsUpdate",
  PARTNERSHIP_GAME_OFFLINE: "partnershipGameOffline",
  PARTNERSHIP_PUNISH: "partnershipPunish",
  LIVE_GAME_INTRO: "liveGameIntro",
  RAW: "raw",
} as const satisfies Record<string, WebcastEventName>);
