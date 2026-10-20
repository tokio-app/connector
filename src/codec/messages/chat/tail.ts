// The chat group's tail messages: common data and a few scalars each. Field
// numbers: PROTOCOL.md, "Field numbers", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  BottomMessage,
  LiveIntroMessage,
  MsgDetectMessage,
  RoomVerifyMessage,
  SystemMessage,
  ToastMessage,
  UnauthorizedMemberMessage,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, UserSchema } from "../common.js";

/** `webcast.im.WebcastSystemMessage` [proto: webcast/synthetic_proto.proto, line 32]. */
export const SystemMessageSchema = defineSchema<SystemMessage>(
  "WebcastSystemMessage",
  {
    common: f.message(1, CommonSchema),
    message: f.string(2),
  },
);

/** `WebcastLiveIntroMessage` [proto: webcast/model/message/messages.proto, line 1588]. */
export const LiveIntroMessageSchema = defineSchema<LiveIntroMessage>(
  "WebcastLiveIntroMessage",
  {
    common: f.message(1, CommonSchema),
    content: f.string(4),
    user: f.message(5, UserSchema),
  },
);

/** `WebcastUnauthorizedMemberMessage` [proto: webcast/model/message/messages.proto, line 1913]. */
export const UnauthorizedMemberMessageSchema =
  defineSchema<UnauthorizedMemberMessage>("WebcastUnauthorizedMemberMessage", {
    common: f.message(1, CommonSchema),
    nickName: f.string(4),
  });

/** `WebcastMsgDetectMessage` [proto: webcast/model/message/messages.proto, line 1651]. */
export const MsgDetectMessageSchema = defineSchema<MsgDetectMessage>(
  "WebcastMsgDetectMessage",
  {
    common: f.message(1, CommonSchema),
    dType: f.int32(2),
    triggerBy: f.int32(5),
  },
);

/** `WebcastToastMessage` [proto: webcast/model/message/messages.proto, line 1905]. */
export const ToastMessageSchema = defineSchema<ToastMessage>(
  "WebcastToastMessage",
  {
    common: f.message(1, CommonSchema),
    displayDurationMillisecond: f.count(2),
  },
);

/** `WebcastBottomMessage` [proto: webcast/model/message/messages.proto, line 1105]. `biz_type` (6) is a `webcast.im.BizType`. */
export const BottomMessageSchema = defineSchema<BottomMessage>(
  "WebcastBottomMessage",
  {
    common: f.message(1, CommonSchema),
    content: f.string(2),
    bizType: f.enum(6),
  },
);

/** `WebcastRoomVerifyMessage` [proto: webcast/model/message/messages.proto, line 1837]. */
export const RoomVerifyMessageSchema = defineSchema<RoomVerifyMessage>(
  "WebcastRoomVerifyMessage",
  {
    common: f.message(1, CommonSchema),
    content: f.string(3),
    closeRoom: f.bool(5),
  },
);
