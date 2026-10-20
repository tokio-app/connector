// Notices (WebcastNoticeMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { NoticeMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, TextSchema } from "../common.js";

/** `WebcastNoticeMessage` [proto: webcast/model/message/messages.proto, line 1661]. */
export const NoticeMessageSchema = defineSchema<NoticeMessage>(
  "WebcastNoticeMessage",
  {
    common: f.message(1, CommonSchema),
    content: f.string(2),
    noticeType: f.int32(3),
    title: f.message(5, TextSchema),
    noticeTitle: f.message(10, TextSchema),
    noticeContent: f.message(11, TextSchema),
  },
);
