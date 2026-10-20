// Subscription cards pinned to the chat (WebcastSubPinEventMessage). Field
// numbers: PROTOCOL.md, "Field numbers", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  SubGoalPinCard,
  SubPinCard,
  SubPinCardText,
  SubPinEventMessage,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/**
 * `webcast.chatroom.api.Text` [proto: webcast/chatroom/api.proto, line 81]
 * and `SubPinCardText` (line 75): the same shape, a text type and the text.
 */
const SubPinCardTextSchema = defineSchema<SubPinCardText>("SubPinCardText", {
  type: f.enum(1),
  content: f.string(2),
});

/** `webcast.chatroom.api.SubGoalPinCard` [proto: webcast/chatroom/api.proto, line 34]. */
const SubGoalPinCardSchema = defineSchema<SubGoalPinCard>("SubGoalPinCard", {
  goalId: f.id(1),
  desc: f.message(3, SubPinCardTextSchema),
  target: f.count(4),
  progress: f.count(5),
});

/** `webcast.chatroom.api.SubPinCard` [proto: webcast/chatroom/api.proto, line 53]. */
const SubPinCardSchema = defineSchema<SubPinCard>("SubPinCard", {
  title: f.message(2, SubPinCardTextSchema),
  desc: f.message(3, SubPinCardTextSchema),
  type: f.enum(5),
  goalPinCard: f.message(8, SubGoalPinCardSchema),
});

/** `WebcastSubPinEventMessage` [proto: webcast/model/message/messages.proto, line 1896]. */
export const SubPinEventMessageSchema = defineSchema<SubPinEventMessage>(
  "WebcastSubPinEventMessage",
  {
    common: f.message(1, CommonSchema),
    actionType: f.enum(2),
    card: f.message(3, SubPinCardSchema),
    operatorUserId: f.id(4),
  },
);
