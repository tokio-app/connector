// The gift group: gifts, money and membership. The tables are in
// src/codec/messages/gift/, the routes in src/routes/gift.ts.
import type {
  Common,
  GiftDetails,
  MsgFilter,
  Text,
  User,
  UserIdentity,
} from "./shared.js";

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
  /** Who received the gift, when it isn't the host (a guest in a link). */
  toUser?: User;
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
  /** Whether this is the sender's first gift to the host. */
  isFirstSent: boolean;
  /** What the sender is to the host, for filtering the chat area. */
  msgFilter?: MsgFilter;
  /** How the sender relates to the host. */
  userIdentity?: UserIdentity;
  /** The id of the member the gift went to, as TikTok spells it (a string field). */
  toMemberId: string;
  /** The display name of the member the gift went to. */
  toMemberNickname: string;
}

/**
 * The values of {@link MemberMessage.actionId} TikTok defines
 * (`webcast.im.MemberMessageAction`), so apps needn't hard-code the numbers:
 *
 * ```ts
 * connection.on("member", (member) => {
 *   if (member.actionId === MemberAction.JOINED) greet(member.user);
 * });
 * ```
 */
export const MemberAction = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** The viewer joined the LIVE. */
  JOINED: 1,
  /** The viewer subscribed to the host. */
  SUBSCRIBED: 3,
} as const);

/** A viewer joining, or another membership change (`member` event). */
export interface MemberMessage {
  /** Data every message carries. */
  common?: Common;
  /** The member. */
  user?: User;
  /** How many viewers are in the LIVE, when TikTok sends it. */
  memberCount: number;
  /** Who made the change, for moderator actions. */
  operator?: User;
  /** The member was made a moderator. */
  isSetToAdmin: boolean;
  /** The member is one of the LIVE's top viewers. */
  isTopUser: boolean;
  /** The member's place among the top viewers, when `isTopUser`. */
  topUserNo: number;
  /**
   * What happened: `1` joined, `3` subscribed, `0` unknown ({@link MemberAction}).
   * Other values may come: it stays a number.
   */
  actionId: number;
  /** How the member shared the LIVE, as TikTok names it. */
  userShareType: string;
  /** TikTok's code for where a kick came from. */
  kickSource: number;
}

/**
 * The values of {@link EnvelopeInfo.businessType} TikTok defines
 * (`webcast.model.data.EnvelopeBusinessType`): what kind of treasure chest
 * it is. The library acts on `SUPER_FAN_BOX`.
 */
export const EnvelopeBusinessType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A chest of coins a viewer sent. */
  USER_DIAMOND: 1,
  /** A chest of coins from TikTok. */
  PLATFORM_DIAMOND: 2,
  /** A chest of shells from TikTok. */
  PLATFORM_SHELL: 3,
  /** A portal. */
  PORTAL: 4,
  /** A merchandise chest from TikTok. */
  PLATFORM_MERCH: 5,
  /** An end-of-year coin chest. */
  EOY_DIAMOND: 6,
  /** A fan club campaign chest. */
  FANCLUB_GTM: 7,
  /** A portal from TikTok. */
  PLATFORM_PORTAL: 9,
  /** An end-of-year campaign popularity ticket. */
  EOY_GTM_POPULARITY_TICKET: 10,
  /** An end-of-year campaign revenue coin chest. */
  EOY_GTM_REVENUE_DIAMOND: 11,
  /** An end-of-year campaign game coin chest. */
  EOY_GTM_GAME_DIAMOND: 12,
  /** A creator league promotion chest. */
  CREATOR_LEAGUE_PROMOTION_GTM: 13,
  /** A month-of-year campaign popularity ticket. */
  MOY_GTM_POPULARITY_TICKET: 14,
  /** A super fan box: the envelope is also a `superFanBox` event. */
  SUPER_FAN_BOX: 19,
} as const);

/** Details of a treasure chest. */
export interface EnvelopeInfo {
  /** The chest id. */
  envelopeId: string;
  /** What kind of chest: `19` is a super fan box ({@link EnvelopeBusinessType}). */
  businessType: number;
  /** The display name of who sent it. */
  sendUserName: string;
  /** How many coins it holds. */
  diamondCount: number;
  /** How many viewers can open it. */
  peopleCount: number;
  /** When it opens, in seconds since the epoch. */
  unpackAt: number;
  /** The id of who sent it, as TikTok spells it (a string field). */
  sendUserId: string;
  /** How many super fans it is for, for super fan boxes. */
  superFanCount: number;
}

/** A treasure chest (`envelope` event; also `superFanBox` for super fan boxes). */
export interface EnvelopeMessage {
  /** Data every message carries. */
  common?: Common;
  /** The chest. */
  envelopeInfo?: EnvelopeInfo;
}

/**
 * The values of {@link BarrageMessage.msgType} TikTok defines
 * (`webcast.im.BarrageMessage_BarrageType`): what a banner is about.
 */
export const BarrageType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** An e-commerce order. */
  E_COM_ORDERING: 1,
  /** An e-commerce purchase in progress. */
  E_COM_BUYING: 2,
  /** A normal banner. */
  NORMAL: 3,
  /** A subscription. */
  SUBSCRIBE: 4,
  /** An event view. */
  EVENT_VIEW: 5,
  /** An event registration. */
  EVENT_REGISTERED: 6,
  /** A gifted subscription. */
  SUBSCRIBE_GIFT: 7,
  /** A user grade upgrade. */
  USER_UPGRADE: 8,
  /** A graded user entering. */
  GRADE_USER_ENTRANCE_NOTIFICATION: 9,
  /** A fan level upgrade. */
  FANS_LEVEL_UPGRADE: 10,
  /** A fan entering. */
  FANS_LEVEL_ENTRANCE: 11,
  /** A game partnership. */
  GAME_PARTNERSHIP: 12,
  /** A gift gallery banner. */
  GIFT_GALLERY: 13,
  /** An e-commerce purchase. */
  E_COM_BOUGHT: 14,
  /** An enigma (masked) user entering. */
  ENIGMA_ENTRANCE: 15,
  /** A common banner. */
  COMMON_BARRAGE: 100,
} as const);

/** The grade a banner is about: a gifter level or a fan level. */
export interface BarrageGradeParam {
  /** The level reached. */
  currentGrade: number;
  /** Whose level it is. */
  user?: User;
}

/** The gifted subscriptions a banner is about. */
export interface BarrageSubscribeGiftParam {
  /** How many subscriptions were gifted. */
  giftSubCount: number;
  /**
   * Who paid them: `1` TikTok, `2` a user ({@link SubGiftSource}). Other
   * values may come: it stays a number.
   */
  giftSource: number;
}

/** A banner message (`barrage` event; also `superFan` or `superFanJoin` for super fans). */
export interface BarrageMessage {
  /** Data every message carries. */
  common?: Common;
  /** The user the banner is about. */
  user?: User;
  /**
   * What the banner is about: `3` normal, `4` a subscription, `8` a user
   * grade upgrade ({@link BarrageType}). Other values may come: it stays a
   * number.
   */
  msgType: number;
  /** The banner text. Routing reads its `key`. */
  content?: Text;
  /** The banner's common text. Routing reads its `key` too. */
  commonBarrageContent?: Text;
  /** The gifter level, for user grade banners. */
  userGradeParam?: BarrageGradeParam;
  /** The fan level, for fan level banners. */
  fansLevelParam?: BarrageGradeParam;
  /** The gifted subscriptions, for gifted subscription banners. */
  subscribeGiftParam?: BarrageSubscribeGiftParam;
}

/**
 * The values of {@link SubNotifyMessage.subscribeType} TikTok defines
 * (`webcast.im.SubscribeType`).
 */
export const SubscribeType = Object.freeze({
  /** A one-time subscription. */
  ONCE: 0,
  /** An auto-renewing subscription. */
  AUTO: 1,
  /** TikTok's default. */
  DEFAULT: 100,
} as const);

/**
 * The values of {@link SubNotifyMessage.oldSubscribeStatus} TikTok defines
 * (`webcast.im.OldSubscribeStatus`).
 */
export const OldSubscribeStatus = Object.freeze({
  /** A first subscription. */
  FIRST: 0,
  /** A resubscription. */
  RESUB: 1,
  /** Subscribed, in the grace period. */
  SUB_IN_GRACE_PERIOD: 2,
  /** Subscribed, past the grace period. */
  SUB_NOT_IN_GRACE_PERIOD: 3,
  /** TikTok's default. */
  DEFAULT: 100,
} as const);

/**
 * The values of {@link SubNotifyMessage.subscribingStatus} TikTok defines
 * (`webcast.im.SubscribingStatus`).
 */
export const SubscribingStatus = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A one-time subscription. */
  ONCE: 1,
  /** A recurring subscription. */
  CIRCLE: 2,
  /** A recurring subscription that was canceled. */
  CIRCLE_CANCEL: 3,
  /** A refund. */
  REFUND: 4,
  /** In the grace period. */
  IN_GRACE_PERIOD: 5,
  /** Past the grace period. */
  NOT_IN_GRACE_PERIOD: 6,
} as const);

/**
 * The values of {@link SubNotifyMessage.messageType} TikTok defines
 * (`webcast.im.MessageType`).
 */
export const SubNotifyMessageType = Object.freeze({
  /** A subscription succeeded. */
  SUB_SUCCESS: 0,
  /** A reminder to the host. */
  ANCHOR_REMINDER: 1,
  /** The subscription expires soon. */
  ENTER_ROOM_EXPIRE_SOON: 2,
  /** A subscription goal was created, to the host. */
  SUB_GOAL_CREATE_TO_ANCHOR: 3,
  /** A subscription goal was completed, to the audience. */
  SUB_GOAL_COMPLETE_TO_AUDIENCE: 4,
  /** A subscription goal was completed, to the host. */
  SUB_GOAL_COMPLETE_TO_ANCHOR: 5,
  /** A gifted subscription from TikTok, to the user. */
  SUB_GIFT_TIKTOK_2_USER_NOTICE: 6,
  /** A gifted subscription from TikTok, to the host. */
  SUB_GIFT_TIKTOK_2_ANCHOR_NOTICE: 7,
  /** A gifted subscription ended. */
  SUB_GIFT_T_RECEIVES_END_NOTICE: 8,
  /** Gifted subscriptions succeeded, to the room. */
  SUB_GIFTS_END_SUCCEED_ROOM_MESSAGE: 9,
  /** Gifted subscriptions succeeded, to the host. */
  SUB_GIFTS_END_SUCCEED_ANCHOR_NOTICE: 10,
  /** The app is too old for gifted subscriptions. */
  SUB_GIFT_LOW_VERSION_UPGRADE_NOTICE: 11,
  /** The user may buy gifted subscriptions. */
  SUB_GIFT_USER_BUY_AU_TH_NOTICE: 12,
  /** A plain text notice. */
  SUB_COMMON_TEXT_NOTICE: 13,
  /** A moderator pinned a perk. */
  SUB_MODERATOR_PIN_PERK: 14,
} as const);

/**
 * The values of {@link SubNotifyMessage.giftSource} and
 * {@link BarrageSubscribeGiftParam.giftSource} TikTok defines
 * (`webcast.im.GiftSource`): who paid a gifted subscription. Named apart
 * from the `GiftSource` of `fetchGifts()`.
 */
export const SubGiftSource = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** TikTok gave it. */
  PLATFORM: 1,
  /** A user bought it for a random viewer. */
  USER_BUY_RANDOM: 2,
  /** A user bought it for a specific viewer. */
  USER_BUY_SPECIFIC: 3,
} as const);

/**
 * The values of {@link SubPinEventMessage.actionType} TikTok defines
 * (`webcast.im.SubPinEventMessage_ActionType`).
 */
export const SubPinAction = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A card was pinned. */
  PIN: 1,
  /** The card was unpinned. */
  UNPIN: 2,
} as const);

/**
 * The values of {@link SubPinCard.type} TikTok defines
 * (`webcast.model.data.PinCardType`).
 */
export const PinCardType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** A customized benefit. */
  CUSTOMIZED_BENEFIT_E_NUM: 1,
  /** A subscription goal. */
  SUB_GOAL_E_NUM: 2,
  /** An upsell by direct message. */
  UP_SELL_DM: 3,
  /** An upsell lead. */
  UP_SELL_LEAD_SGEN: 4,
  /** A business subscription plan. */
  SMB_SUB_PLAN: 5,
  /** A business course. */
  SMB_COURSE: 6,
} as const);

/**
 * The values of {@link GoalUpdateMessage.updateSource} TikTok defines
 * (`webcast.model.data.GoalMessageSource`).
 */
export const GoalMessageSource = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** The goal was set. */
  COMMIT: 1,
  /** The progress changed. */
  PROGRESS_UPDATE: 2,
  /** The goal was pinned. */
  PIN: 3,
  /** The goal was unpinned. */
  UNPIN: 4,
  /** The review finished. */
  REVIEW_CALLBACK: 5,
  /** The goal was suspended. */
  SUSPEND: 6,
  /** A challenge prompt. */
  CHALLENGE_PROMPT: 7,
} as const);

/**
 * The values of {@link SubNotifyMessage.exhibitionType} TikTok defines
 * (`webcast.im.ExhibitionType`): how the notice is shown.
 */
export const ExhibitionType = Object.freeze({
  /** TikTok's default. */
  DEFAULT: 0,
  /** Folded. */
  FOLD: 1,
  /** On the public screen. */
  PUBLIC_SCREEN: 2,
} as const);

/** A subscription, or a subscription notice (`subNotify` event). */
export interface SubNotifyMessage {
  /** Data every message carries. */
  common?: Common;
  /** Who subscribed. */
  user?: User;
  /**
   * How the notice is shown: `1` folded, `2` on the public screen
   * ({@link ExhibitionType}). Other values may come: it stays a number.
   */
  exhibitionType: number;
  /** How many months the user has subscribed. */
  subMonth: number;
  /**
   * The subscription's kind: `0` once, `1` auto ({@link SubscribeType}).
   * Other values may come: it stays a number.
   */
  subscribeType: number;
  /**
   * The subscription before this one: `0` first, `1` resubscribed
   * ({@link OldSubscribeStatus}). Other values may come: it stays a number.
   */
  oldSubscribeStatus: number;
  /**
   * What the notice is: `0` a subscription ({@link SubNotifyMessageType}).
   * Other values may come: it stays a number.
   */
  messageType: number;
  /**
   * The subscription's status: `1` once, `2` recurring
   * ({@link SubscribingStatus}). Other values may come: it stays a number.
   */
  subscribingStatus: number;
  /** Whether the subscription was gifted. */
  isSend: boolean;
  /**
   * Who paid a gifted subscription: `1` TikTok, `2` a user
   * ({@link SubGiftSource}). Other values may come: it stays a number.
   */
  giftSource: number;
}

/**
 * The values of {@link SubPinCardText.type} TikTok defines
 * (`webcast.model.data.SubPinCardText_TextType` and
 * `SubPinCard_Text_TextType`, which have the same values).
 */
export const PinCardTextType = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** `content` is the text itself. */
  ORIGINAL: 1,
  /** `content` is a translation key (a "starling key"). */
  STARLING_KEY: 2,
} as const);

/** A text of a subscription pin card: its content, in a given form. */
export interface SubPinCardText {
  /**
   * How to read `content`: `1` the text itself, `2` a translation key
   * ({@link PinCardTextType}). Other values may come: it stays a number.
   */
  type: number;
  /** The text. */
  content: string;
}

/** A subscription goal on a pin card. */
export interface SubGoalPinCard {
  /** The goal id. */
  goalId: string;
  /** The goal's description. */
  desc?: SubPinCardText;
  /** The target. */
  target: number;
  /** The progress so far. */
  progress: number;
}

/** A subscription card pinned to the chat. */
export interface SubPinCard {
  /** The card's title. */
  title?: SubPinCardText;
  /** The card's description. */
  desc?: SubPinCardText;
  /**
   * The card's kind: `2` a subscription goal ({@link PinCardType}). Other
   * values may come: it stays a number.
   */
  type: number;
  /** The goal, for a subscription goal card. */
  goalPinCard?: SubGoalPinCard;
}

/** A subscription card pinned or unpinned (`subPinEvent` event). */
export interface SubPinEventMessage {
  /** Data every message carries. */
  common?: Common;
  /**
   * What happened: `1` pinned, `2` unpinned ({@link SubPinAction}). Other
   * values may come: it stays a number.
   */
  actionType: number;
  /** The card. */
  card?: SubPinCard;
  /** Who pinned or unpinned it. */
  operatorUserId: string;
}

/** A notice shown in the room, such as a big gift elsewhere (`roomNotify` event). */
export interface RoomNotifyMessage {
  /** Data every message carries. */
  common?: Common;
  /** TikTok's notify type code. */
  notifyType: number;
  /** The notice text. */
  content: string;
  /** The user the notice is about. */
  user?: User;
  /** The user who caused it. */
  fromUserId: string;
  /** The host it's addressed to. */
  toAnchorId: string;
}

/** A gift broadcast across rooms (`giftBroadcast` event). */
export interface GiftBroadcastMessage {
  /** Data every message carries. */
  common?: Common;
  /** Who sent the gift. */
  fromUserId: string;
  /** The notice TikTok shows for it. */
  notify?: RoomNotifyMessage;
}

/** The gift a sub-goal asks for. */
export interface GoalSubGoalGift {
  /** The gift name. */
  name: string;
  /** What the gift costs, in coins. */
  diamondCount: number;
}

/** One step of a LIVE goal. */
export interface GoalSubGoal {
  /** The progress so far. */
  progress: number;
  /** The target. */
  target: number;
  /** The gift it asks for, for gift goals. */
  gift?: GoalSubGoalGift;
}

/** A LIVE goal's totals. */
export interface GoalStats {
  /** The coins received so far. */
  totalCoins: number;
  /** How many viewers contributed. */
  totalContributor: number;
}

/** A LIVE goal the host set. */
export interface LiveStreamGoal {
  /** The goal id. */
  id: string;
  /** TikTok's goal type code. */
  type: number;
  /** TikTok's goal status code. */
  status: number;
  /** The goal's steps. */
  subGoals: GoalSubGoal[];
  /** The goal's description. */
  description: string;
  /** The totals. */
  stats?: GoalStats;
}

/** A LIVE goal was set or progressed (`goalUpdate` event). */
export interface GoalUpdateMessage {
  /** Data every message carries. */
  common?: Common;
  /** The goal. */
  goal?: LiveStreamGoal;
  /** Who contributed. */
  contributorId: string;
  /** The contributor's username. */
  contributorDisplayId: string;
  /** How much the contribution counts. */
  contributeCount: number;
  /** The contribution's score. */
  contributeScore: number;
  /**
   * Why the message came: `1` set, `2` progress ({@link GoalMessageSource}).
   * Other values may come: it stays a number.
   */
  updateSource: number;
}

/** A gift viewers can pick. */
export interface GiftPick {
  /** The gift id. */
  giftId: string;
  /** The host's description of the pick. */
  customizedDesc: string;
  /** What the gift costs, in coins. */
  giftPrice: number;
}

/** A gift pick with its score. */
export interface GiftPickWithScore {
  /** The pick. */
  giftPick?: GiftPick;
  /** The pick's score. */
  score: number;
}

/** The state of a viewer picks round. */
export interface ViewerPicksInfo {
  /** The round id. */
  viewerPicksId: string;
  /** The picks and their scores. */
  giftPickList: GiftPickWithScore[];
  /** TikTok's status code. */
  status: number;
}

/** A viewer picks round changed (`viewerPicksUpdate` event). */
export interface ViewerPicksUpdateMessage {
  /** Data every message carries. */
  common?: Common;
  /** TikTok's update type code. */
  updateType: number;
  /** The round. */
  info?: ViewerPicksInfo;
}

/** A winner of the hourly rank. */
export interface HourlyRankRewardInfo {
  /** The winner. */
  userId: string;
  /** The reward asset. */
  assetId: string;
  /** The notice TikTok shows for the win. */
  notify?: RoomNotifyMessage;
}

/** The hourly rank's rewards (`hourlyRank` event). */
export interface HourlyRankRewardMessage {
  /** Data every message carries. */
  common?: Common;
  /** The winners. */
  winners: HourlyRankRewardInfo[];
}

/** A prompt about gifting, such as a spending block (`giftPrompt` event). */
export interface GiftPromptMessage {
  /** Data every message carries. */
  common?: Common;
  /** The prompt's title. */
  title: string;
  /** The prompt's text. */
  body: string;
  /** How many days gifting is blocked. */
  blockNumDays: number;
  /** The order the prompt is about. */
  orderId: string;
}

/** The gift panel changed (`giftPanelUpdate` event). */
export interface GiftPanelUpdateMessage {
  /** Data every message carries. */
  common?: Common;
  /** The room. */
  roomId: string;
  /** When, as a decimal string (seconds since the epoch, as traffic shows). */
  timestamp: string;
}

/** A gift's restrictions changed (`giftDynamicRestriction` event). */
export interface GiftDynamicRestrictionMessage {
  /** Data every message carries. */
  common?: Common;
}

/** A guide TikTok shows, such as a gift suggestion (`guide` event). */
export interface GuideMessage {
  /** Data every message carries. */
  common?: Common;
  /** TikTok's guide type code. */
  guideType: number;
  /** The gift it suggests. */
  giftId: string;
  /** The guide text. */
  description: string;
  /** TikTok's scene name. */
  scene: string;
}

/** A boost card. */
export interface BoostCard {
  /** The card id. */
  cardId: string;
  /** TikTok's task source code. */
  taskSource: number;
  /** The task id. */
  taskId: string;
}

/** Boost cards (`boostCard` event). */
export interface BoostCardMessage {
  /** Data every message carries. */
  common?: Common;
  /** The cards. */
  cards: BoostCard[];
}
