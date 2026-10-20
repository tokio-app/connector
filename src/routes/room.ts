// The routes of the room group: the room's state, ranks, polls, shopping and
// system messages. The rules are PROTOCOL.md's "Routing". A new message type
// gets its route here and its table in src/codec/messages/room/.
import { ControlMessageSchema } from "../codec/messages/room/control.js";
import { OecLiveShoppingMessageSchema } from "../codec/messages/room/oecLiveShopping.js";
import { PerceptionMessageSchema } from "../codec/messages/room/perception.js";
import { PollMessageSchema } from "../codec/messages/room/poll.js";
import { RankTextMessageSchema } from "../codec/messages/room/rankText.js";
import { RankUpdateMessageSchema } from "../codec/messages/room/rankUpdate.js";
import { RoomUserMessageSchema } from "../codec/messages/room/roomUser.js";
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
} from "../codec/messages/room/tail.js";
import { ControlAction } from "../events/index.js";
import { defineRoute, forward, type AnyRoute } from "./route.js";

/** The room group's routes, by message type (a batch message's `method`). */
export const roomRoutes: Readonly<Record<string, AnyRoute>> = Object.freeze({
  WebcastRoomUserSeqMessage: forward("roomUser", RoomUserMessageSchema),
  // Decoded without listeners (`always`): the connection must see the LIVE
  // end. Every control message is a `controlMessage` (an unheard emit costs
  // nothing), then the connection emits `streamEnd` itself on 3 and 4, and
  // disconnects.
  WebcastControlMessage: defineRoute({
    schema: ControlMessageSchema,
    events: ["controlMessage", "streamEnd"],
    always: true,
    emit(message, context) {
      context.emit("controlMessage", message);
      if (message.action === ControlAction.STREAM_ENDED) {
        context.endStream("ended");
      } else if (message.action === ControlAction.STREAM_SUSPENDED) {
        context.endStream("suspended");
      }
    },
  }),
  WebcastPerceptionMessage: forward("perception", PerceptionMessageSchema),
  WebcastRankUpdateMessage: forward("rankUpdate", RankUpdateMessageSchema),
  WebcastRankTextMessage: forward("rankText", RankTextMessageSchema),
  WebcastGameRankNotifyMessage: forward(
    "gameRankNotify",
    GameRankNotifyMessageSchema,
  ),
  WebcastPollMessage: forward("pollMessage", PollMessageSchema),
  WebcastOecLiveShoppingMessage: forward(
    "oecLiveShopping",
    OecLiveShoppingMessageSchema,
  ),
  WebcastCapsuleMessage: forward("capsule", CapsuleMessageSchema),
  WebcastMarqueeAnnouncementMessage: forward(
    "marqueeAnnouncement",
    MarqueeAnnouncementMessageSchema,
  ),
  WebcastSpeakerMessage: forward("speaker", SpeakerMessageSchema),
  WebcastInRoomBannerMessage: forward(
    "inRoomBanner",
    InRoomBannerMessageSchema,
  ),
  WebcastAccessControlMessage: forward(
    "accessControl",
    AccessControlMessageSchema,
  ),
  WebcastAccessRecallMessage: forward(
    "accessRecall",
    AccessRecallMessageSchema,
  ),
  WebcastPartnershipDropsUpdateMessage: forward(
    "partnershipDropsUpdate",
    PartnershipDropsUpdateMessageSchema,
  ),
  WebcastPartnershipGameOfflineMessage: forward(
    "partnershipGameOffline",
    PartnershipGameOfflineMessageSchema,
  ),
  WebcastPartnershipPunishMessage: forward(
    "partnershipPunish",
    PartnershipPunishMessageSchema,
  ),
  WebcastLiveGameIntroMessage: forward(
    "liveGameIntro",
    LiveGameIntroMessageSchema,
  ),
});
