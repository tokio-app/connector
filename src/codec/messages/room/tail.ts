// The room group's tail: messages with a few scalars each (game rank notices,
// capsules, announcements, access controls, partnerships, the game intro).
// Field numbers: PROTOCOL.md, "Field numbers", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  AccessControlCaptcha,
  AccessControlMessage,
  AccessRecallMessage,
  CapsuleMessage,
  GameRankNotifyMessage,
  InRoomBannerMessage,
  LiveGameIntroMessage,
  MarqueeAnnouncementMessage,
  OfflineGameInfo,
  PartnershipDropsUpdateMessage,
  PartnershipGameOfflineMessage,
  PartnershipPunishMessage,
  SpeakerMessage,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, PunishEventInfoSchema, TextSchema } from "../common.js";

/** `WebcastGameRankNotifyMessage`. `msg_type` (2) is a `webcast.im.GameRankNotifyMessage_MsgType`. */
export const GameRankNotifyMessageSchema = defineSchema<GameRankNotifyMessage>(
  "WebcastGameRankNotifyMessage",
  {
    common: f.message(1, CommonSchema),
    msgType: f.enum(2),
    notifyText: f.message(3, TextSchema),
  },
);

/** `WebcastCapsuleMessage`. */
export const CapsuleMessageSchema = defineSchema<CapsuleMessage>(
  "WebcastCapsuleMessage",
  {
    common: f.message(1, CommonSchema),
    desc: f.message(3, TextSchema),
    type: f.int32(6),
    scene: f.string(7),
    subScene: f.string(9),
  },
);

/** `WebcastMarqueeAnnouncementMessage`. */
export const MarqueeAnnouncementMessageSchema =
  defineSchema<MarqueeAnnouncementMessage>(
    "WebcastMarqueeAnnouncementMessage",
    {
      common: f.message(1, CommonSchema),
      messageScene: f.string(2),
    },
  );

/** `WebcastSpeakerMessage`: only the common data. */
export const SpeakerMessageSchema = defineSchema<SpeakerMessage>(
  "WebcastSpeakerMessage",
  { common: f.message(1, CommonSchema) },
);

/** `WebcastInRoomBannerMessage`: only the common data. */
export const InRoomBannerMessageSchema = defineSchema<InRoomBannerMessage>(
  "WebcastInRoomBannerMessage",
  { common: f.message(1, CommonSchema) },
);

/** `webcast.model.message.AccessControlCaptcha`. */
const AccessControlCaptchaSchema = defineSchema<AccessControlCaptcha>(
  "AccessControlCaptcha",
  {
    captchaRecordId: f.id(1),
    roomId: f.id(2),
    verifyDurationInSec: f.count(3),
  },
);

/** `WebcastAccessControlMessage`. */
export const AccessControlMessageSchema = defineSchema<AccessControlMessage>(
  "WebcastAccessControlMessage",
  {
    common: f.message(1, CommonSchema),
    captcha: f.message(2, AccessControlCaptchaSchema),
  },
);

/** `webcast.model.game.WebcastAccessRecallMessage` [proto: webcast/model/game.proto]. */
export const AccessRecallMessageSchema = defineSchema<AccessRecallMessage>(
  "WebcastAccessRecallMessage",
  {
    common: f.message(1, CommonSchema),
    status: f.int32(2),
    duration: f.count(3),
    endTime: f.id(4),
    scene: f.string(5),
    notice: f.message(6, TextSchema),
    content: f.message(7, TextSchema),
    punishInfo: f.message(8, PunishEventInfoSchema),
  },
);

/** `WebcastPartnershipDropsUpdateMessage`. `change_mode` (2) is a `webcast.im.PartnershipDropsUpdateMessage_ChangeMode`. */
export const PartnershipDropsUpdateMessageSchema =
  defineSchema<PartnershipDropsUpdateMessage>(
    "WebcastPartnershipDropsUpdateMessage",
    {
      common: f.message(1, CommonSchema),
      changeMode: f.enum(2),
      dropsId: f.string(3),
      taskId: f.string(4),
      eventId: f.string(5),
      anchorUid: f.id(6),
    },
  );

/** `webcast.model.message.OfflineGameInfo`. `offline_type` (4) is a `webcast.im.PartnershipGameOfflineMessage_OfflineGameInfo_OfflineType`. */
const OfflineGameInfoSchema = defineSchema<OfflineGameInfo>("OfflineGameInfo", {
  taskId: f.string(1),
  toastText: f.string(2),
  offlineType: f.enum(4),
  gameId: f.string(6),
});

/** `WebcastPartnershipGameOfflineMessage`. */
export const PartnershipGameOfflineMessageSchema =
  defineSchema<PartnershipGameOfflineMessage>(
    "WebcastPartnershipGameOfflineMessage",
    {
      common: f.message(1, CommonSchema),
      offlineGameList: f.repeated.message(2, OfflineGameInfoSchema),
    },
  );

/** `WebcastPartnershipPunishMessage`. */
export const PartnershipPunishMessageSchema =
  defineSchema<PartnershipPunishMessage>("WebcastPartnershipPunishMessage", {
    common: f.message(1, CommonSchema),
    punishInfo: f.message(2, PunishEventInfoSchema),
  });

/** `WebcastLiveGameIntroMessage`. */
export const LiveGameIntroMessageSchema = defineSchema<LiveGameIntroMessage>(
  "WebcastLiveGameIntroMessage",
  {
    common: f.message(1, CommonSchema),
    content: f.message(2, TextSchema),
    hasRankInfo: f.bool(3),
  },
);
