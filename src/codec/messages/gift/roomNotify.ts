// Notices shown in the room (WebcastRoomNotifyMessage). Field numbers:
// PROTOCOL.md, "Field numbers", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { RoomNotifyMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, UserSchema } from "../common.js";

/**
 * `WebcastRoomNotifyMessage` [proto: webcast/model/message/messages.proto,
 * line 1788]. Also nested in gift broadcasts and hourly rank rewards.
 */
export const RoomNotifyMessageSchema = defineSchema<RoomNotifyMessage>(
  "WebcastRoomNotifyMessage",
  {
    common: f.message(1, CommonSchema),
    notifyType: f.count(3),
    content: f.string(4),
    user: f.message(5, UserSchema),
    fromUserId: f.id(10),
    toAnchorId: f.id(12),
  },
);
