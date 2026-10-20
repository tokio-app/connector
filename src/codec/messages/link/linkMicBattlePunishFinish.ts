// The end of a battle's punishment (WebcastLinkMicBattlePunishFinish). Field
// numbers: PROTOCOL.md, "LIVE messages", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { LinkMicBattlePunishFinish } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `WebcastLinkMicBattlePunishFinish` [proto: webcast/model/message/messages.proto, line 1479]. */
export const LinkMicBattlePunishFinishSchema =
  defineSchema<LinkMicBattlePunishFinish>("WebcastLinkMicBattlePunishFinish", {
    common: f.message(1, CommonSchema),
    channelId: f.id(2),
    opUid: f.id(3),
    reason: f.enum(4),
    battleId: f.id(5),
  });
