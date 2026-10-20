// Multi-guest links (WebcastLinkMessage): invitations, replies, joins,
// leaves, mutes. Field numbers: PROTOCOL.md, "LIVE messages", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  LinkedListChangeContent,
  LinkerEnterContent,
  LinkerInviteContent,
  LinkerKickOutContent,
  LinkerLeaveContent,
  LinkerListChangeContent,
  LinkerMediaChangeContent,
  LinkerMuteContent,
  LinkerReplyContent,
  LinkListUser,
  LinkMessage,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, UserSchema } from "../common.js";
import { LinkUserSchema } from "./shared.js";

/** `webcast.model.message.linker.invite_message.LinkerInviteContent` [proto: webcast/model/message/linker/invite_message.proto, line 32]. */
const LinkerInviteContentSchema = defineSchema<LinkerInviteContent>(
  "LinkerInviteContent",
  {
    fromUserId: f.id(1),
    fromUser: f.message(8, UserSchema),
  },
);

/** `webcast.model.message.linker.reply_message.LinkerReplyContent` [proto: webcast/model/message/linker/reply_message.proto, line 11]. */
const LinkerReplyContentSchema = defineSchema<LinkerReplyContent>(
  "LinkerReplyContent",
  {
    replyStatus: f.int32(7),
    fromUser: f.message(9, UserSchema),
    toUser: f.message(10, UserSchema),
  },
);

/** `webcast.model.message.linker.LinkerEnterContent` [proto: webcast/model/message/linker/messages.proto, line 26]. */
const LinkerEnterContentSchema = defineSchema<LinkerEnterContent>(
  "LinkerEnterContent",
  { linkedUsers: f.repeated.message(1, LinkUserSchema) },
);

/** `webcast.model.message.linker.LinkerLeaveContent` [proto: webcast/model/message/linker/messages.proto, line 39]. */
const LinkerLeaveContentSchema = defineSchema<LinkerLeaveContent>(
  "LinkerLeaveContent",
  {
    userId: f.id(1),
    leaveReason: f.count(4),
  },
);

/** `webcast.model.message.linker.LinkerKickOutContent` [proto: webcast/model/message/linker/messages.proto, line 33]. */
const LinkerKickOutContentSchema = defineSchema<LinkerKickOutContent>(
  "LinkerKickOutContent",
  {
    fromUserId: f.id(1),
    kickoutReason: f.enum(2),
  },
);

/** `webcast.model.message.linker.linked_list_change_message.LinkedListChangeContent` [proto: webcast/model/message/linker/linked_list_change_message.proto, line 8]. */
const LinkedListChangeContentSchema = defineSchema<LinkedListChangeContent>(
  "LinkedListChangeContent",
  { linkedUsers: f.repeated.message(1, LinkUserSchema) },
);

/** `webcast.model.message.linker.LinkerMuteContent` [proto: webcast/model/message/linker/messages.proto, line 46]. */
const LinkerMuteContentSchema = defineSchema<LinkerMuteContent>(
  "LinkerMuteContent",
  {
    userId: f.id(1),
    muteStatus: f.enum(2),
  },
);

/** `webcast.model.message.linker.listchangemessage.LinkListUser` [proto: webcast/model/message/linker/listchangemessage.proto, line 8]. */
const LinkListUserSchema = defineSchema<LinkListUser>("LinkListUser", {
  user: f.message(1, UserSchema),
  linkType: f.int32(3),
  roleType: f.int32(4),
});

/** `webcast.model.message.linker.listchangemessage.LinkerListChangeContent` [proto: webcast/model/message/linker/listchangemessage.proto, line 21]. */
const LinkerListChangeContentSchema = defineSchema<LinkerListChangeContent>(
  "LinkerListChangeContent",
  {
    linkedUsers: f.repeated.message(1, LinkListUserSchema),
    appliedUsers: f.repeated.message(2, LinkListUserSchema),
    connectingUsers: f.repeated.message(3, LinkListUserSchema),
  },
);

/** `webcast.model.message.LinkerMediaChangeContent` [proto: webcast/model/message/messages.proto, line 530]. */
const LinkerMediaChangeContentSchema = defineSchema<LinkerMediaChangeContent>(
  "LinkerMediaChangeContent",
  {
    op: f.enum(1),
    toUserId: f.id(2),
  },
);

/** `WebcastLinkMessage` [proto: webcast/model/message/messages.proto, line 1363]. */
export const LinkMessageSchema = defineSchema<LinkMessage>(
  "WebcastLinkMessage",
  {
    common: f.message(1, CommonSchema),
    messageType: f.int32(2),
    linkerId: f.id(3),
    scene: f.int32(4),
    inviteContent: f.message(5, LinkerInviteContentSchema),
    replyContent: f.message(6, LinkerReplyContentSchema),
    enterContent: f.message(9, LinkerEnterContentSchema),
    leaveContent: f.message(10, LinkerLeaveContentSchema),
    kickOutContent: f.message(12, LinkerKickOutContentSchema),
    linkedListChangeContent: f.message(13, LinkedListChangeContentSchema),
    muteContent: f.message(16, LinkerMuteContentSchema),
    listChangeContent: f.message(20, LinkerListChangeContentSchema),
    mediaChangeContent: f.message(22, LinkerMediaChangeContentSchema),
  },
);
