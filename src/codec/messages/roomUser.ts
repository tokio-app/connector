// Owned by T1 (Phase 1). Initial table from PROTOCOL.md; T1 checks every field
// number against reference/src/TikTok-Webcast-Protobuf and adds the tests.
import type { RoomUserMessage, RoomUserRank } from "../../events.js";
import { defineSchema, f } from "../schema.js";
import { CommonSchema, UserSchema } from "./common.js";

/** `webcast.model.message.Contributor`: one top viewer. */
export const RoomUserRankSchema = defineSchema<RoomUserRank>("Contributor", {
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
