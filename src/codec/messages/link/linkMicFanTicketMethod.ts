// Fan tickets of a link (WebcastLinkMicFanTicketMethod). Field numbers:
// PROTOCOL.md, "LIVE messages", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  FanTicketRoomNotice,
  LinkMicFanTicketMethod,
  UserFanTicket,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `webcast.model.message.UserFanTicket` [proto: webcast/model/message/messages.proto, line 983]. */
const UserFanTicketSchema = defineSchema<UserFanTicket>("UserFanTicket", {
  userId: f.id(1),
  fanTicket: f.count(2),
  matchRank: f.int32(4),
});

/** `webcast.model.message.FanTicketRoomNoticeContent` [proto: webcast/model/message/messages.proto, line 382]. */
const FanTicketRoomNoticeSchema = defineSchema<FanTicketRoomNotice>(
  "FanTicketRoomNoticeContent",
  {
    userFanTicket: f.repeated.message(1, UserFanTicketSchema),
    totalLinkmicFanTicket: f.count(2),
  },
);

/** `WebcastLinkMicFanTicketMethod` [proto: webcast/model/message/messages.proto, line 1491]. */
export const LinkMicFanTicketMethodSchema =
  defineSchema<LinkMicFanTicketMethod>("WebcastLinkMicFanTicketMethod", {
    common: f.message(1, CommonSchema),
    fanTicketRoomNotice: f.message(2, FanTicketRoomNoticeSchema),
  });
