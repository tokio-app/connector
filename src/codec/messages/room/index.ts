// The tables of the room group (room state, ranks, polls, shopping, system),
// by protobuf message name. A new table gets a line here, and its route in
// src/routes/room.ts.
import { AnchorToolModificationMessageSchema } from "./anchorToolModification.js";
import { ControlMessageSchema } from "./control.js";
import { OecLiveShoppingMessageSchema } from "./oecLiveShopping.js";
import { PerceptionMessageSchema } from "./perception.js";
import { PollMessageSchema } from "./poll.js";
import { RankTextMessageSchema } from "./rankText.js";
import { RankUpdateMessageSchema } from "./rankUpdate.js";
import { RoomUserMessageSchema } from "./roomUser.js";
import {
  AccessControlMessageSchema,
  AccessRecallMessageSchema,
  CapsuleMessageSchema,
  GameRankNotifyMessageSchema,
  InRoomBannerMessageSchema,
  LiveGameIntroMessageSchema,
  MarqueeAnnouncementMessageSchema,
  PartnershipDropsUpdateMessageSchema,
  PartnershipGameOfflineMessageSchema,
  PartnershipPunishMessageSchema,
  SpeakerMessageSchema,
} from "./tail.js";

/** The room group's top-level messages, keyed like a batch's `method`. */
export const roomSchemas = Object.freeze({
  WebcastControlMessage: ControlMessageSchema,
  WebcastRoomUserSeqMessage: RoomUserMessageSchema,
  WebcastPerceptionMessage: PerceptionMessageSchema,
  WebcastRankUpdateMessage: RankUpdateMessageSchema,
  WebcastRankTextMessage: RankTextMessageSchema,
  WebcastGameRankNotifyMessage: GameRankNotifyMessageSchema,
  WebcastPollMessage: PollMessageSchema,
  WebcastOecLiveShoppingMessage: OecLiveShoppingMessageSchema,
  WebcastCapsuleMessage: CapsuleMessageSchema,
  WebcastMarqueeAnnouncementMessage: MarqueeAnnouncementMessageSchema,
  WebcastSpeakerMessage: SpeakerMessageSchema,
  WebcastInRoomBannerMessage: InRoomBannerMessageSchema,
  WebcastAccessControlMessage: AccessControlMessageSchema,
  WebcastAccessRecallMessage: AccessRecallMessageSchema,
  WebcastPartnershipDropsUpdateMessage: PartnershipDropsUpdateMessageSchema,
  WebcastPartnershipGameOfflineMessage: PartnershipGameOfflineMessageSchema,
  WebcastPartnershipPunishMessage: PartnershipPunishMessageSchema,
  WebcastLiveGameIntroMessage: LiveGameIntroMessageSchema,
  WebcastAnchorToolModificationMessage: AnchorToolModificationMessageSchema,
});
