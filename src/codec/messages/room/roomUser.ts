// Viewer counts (WebcastRoomUserSeqMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { RoomUserMessage, RoomUserRank } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, UserSchema } from "../common.js";

/** `webcast.model.message.Contributor`: one top viewer. */
const RoomUserRankSchema = defineSchema<RoomUserRank>("Contributor", {
  score: f.count(1),
  user: f.message(2, UserSchema),
  rank: f.count(3),
});

/** `WebcastRoomUserSeqMessage`. */
export const RoomUserMessageSchema = defineSchema<RoomUserMessage>(
  "WebcastRoomUserSeqMessage",
  {
    common: f.message(1, CommonSchema),
    ranks: f.repeated.message(2, RoomUserRankSchema),
    total: f.count(3),
    totalUser: f.count(7),
  },
);
