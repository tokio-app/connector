// Room messages (WebcastRoomMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { RoomMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `WebcastRoomMessage` [proto: webcast/model/message/messages.proto, line 1771]. */
export const RoomMessageSchema = defineSchema<RoomMessage>(
  "WebcastRoomMessage",
  {
    common: f.message(1, CommonSchema),
    content: f.string(2),
    scene: f.string(6),
    isWelcome: f.bool(7),
  },
);
