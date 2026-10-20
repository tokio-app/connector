// The state of a link's users (WebcastLinkStateMessage). Field numbers:
// PROTOCOL.md, "LIVE messages", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  LinkPosition,
  LinkStateMessage,
  LinkUserState,
  MicPositionData,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";
import { PlayerSchema } from "./shared.js";

/** `webcast.model.message.linkcore.LinkPosition` [proto: webcast/model/message/linkcore_link_position.proto, line 5]. */
const LinkPositionSchema = defineSchema<LinkPosition>("LinkPosition", {
  position: f.int32(1),
});

/** `webcast.model.message.linkcore.MicPositionData` [proto: webcast/model/message/linkcore_mic_position_data.proto, line 7]. */
const MicPositionDataSchema = defineSchema<MicPositionData>("MicPositionData", {
  link: f.message(2, LinkPositionSchema),
});

/** `webcast.linkmic.common.LinkUserState` [proto: webcast/linkmic/common.proto, line 362]. */
const LinkUserStateSchema = defineSchema<LinkUserState>("LinkUserState", {
  user: f.message(1, PlayerSchema),
  linkmicId: f.string(2),
  pos: f.message(3, MicPositionDataSchema),
  onlineUserState: f.enum(5),
  audioMuted: f.enum(6),
  videoMuted: f.enum(7),
});

/** `webcast.im.WebcastLinkStateMessage` [proto: webcast/im.proto, line 602]. */
export const LinkStateMessageSchema = defineSchema<LinkStateMessage>(
  "WebcastLinkStateMessage",
  {
    common: f.message(1, CommonSchema),
    channelId: f.id(2),
    scene: f.enum(3),
    userStates: f.repeated.message(7, LinkUserStateSchema),
    stateType: f.enum(9),
  },
);
