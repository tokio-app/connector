// Gifts broadcast across rooms (WebcastGiftBroadcastMessage). Field numbers:
// PROTOCOL.md, "Field numbers", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { GiftBroadcastMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";
import { RoomNotifyMessageSchema } from "./roomNotify.js";

/** `WebcastGiftBroadcastMessage` [proto: webcast/model/message/messages.proto, line 1217]. */
export const GiftBroadcastMessageSchema = defineSchema<GiftBroadcastMessage>(
  "WebcastGiftBroadcastMessage",
  {
    common: f.message(1, CommonSchema),
    fromUserId: f.id(2),
    notify: f.message(4, RoomNotifyMessageSchema),
  },
);
