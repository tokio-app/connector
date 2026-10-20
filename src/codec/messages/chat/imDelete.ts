// Deleted comments (WebcastImDeleteMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { ImDeleteMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/**
 * `WebcastImDeleteMessage` [proto: webcast/model/message/messages.proto, line
 * 1335]. Both id lists are `repeated int64`, read packed or not.
 */
export const ImDeleteMessageSchema = defineSchema<ImDeleteMessage>(
  "WebcastImDeleteMessage",
  {
    common: f.message(1, CommonSchema),
    deleteMsgIds: f.repeated.id(2),
    deleteUserIds: f.repeated.id(3),
  },
);
