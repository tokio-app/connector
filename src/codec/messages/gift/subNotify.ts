// Subscriptions and their notices (WebcastSubNotifyMessage). Field numbers:
// PROTOCOL.md, "Field numbers", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { SubNotifyMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, UserSchema } from "../common.js";

/**
 * `WebcastSubNotifyMessage` [proto: webcast/model/message/messages.proto,
 * line 1870]. The enums are `webcast.im`'s: `ExhibitionType` (3),
 * `SubscribeType` (5), `OldSubscribeStatus` (6), `MessageType` (7),
 * `SubscribingStatus` (8) and `GiftSource` (11).
 */
export const SubNotifyMessageSchema = defineSchema<SubNotifyMessage>(
  "WebcastSubNotifyMessage",
  {
    common: f.message(1, CommonSchema),
    user: f.message(2, UserSchema),
    exhibitionType: f.enum(3),
    subMonth: f.count(4),
    subscribeType: f.enum(5),
    oldSubscribeStatus: f.enum(6),
    messageType: f.enum(7),
    subscribingStatus: f.enum(8),
    isSend: f.bool(9),
    giftSource: f.enum(11),
  },
);
