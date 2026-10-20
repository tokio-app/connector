// Link-mic signals of the older kind (WebcastLinkMicMethod). Field numbers:
// PROTOCOL.md, "LIVE messages", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { LinkMicMethod } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, UserSchema } from "../common.js";

/** `WebcastLinkMicMethod` [proto: webcast/model/message/messages.proto, line 1497]. */
export const LinkMicMethodSchema = defineSchema<LinkMicMethod>(
  "WebcastLinkMicMethod",
  {
    common: f.message(1, CommonSchema),
    messageType: f.int32(2),
    userId: f.id(5),
    channelId: f.id(8),
    inviteUid: f.id(13),
    answer: f.int32(14),
    toUserId: f.id(21),
    fromUserId: f.id(24),
    rivalAnchorId: f.id(38),
    linkedUsers: f.repeated.message(45, UserSchema),
    replyType: f.enum(47),
  },
);
