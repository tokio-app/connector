// Links in the newer link layer (WebcastLinkLayerMessage). Field numbers:
// PROTOCOL.md, "LIVE messages", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  AllListUser,
  LinkApplyContent,
  LinkFinishContent,
  LinkInviteContent,
  LinkKickOutContent,
  LinkLayerListUser,
  LinkLayerMessage,
  LinkLeaveContent,
  LinkListChangeContent,
  LinkPermitApplyContent,
  LinkReplyInviteContent,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";
import { PlayerSchema } from "./shared.js";

/** `webcast.model.message.linkcore.LinkLayerListUser` [proto: webcast/model/message/linkcore.proto, line 96]. */
const LinkLayerListUserSchema = defineSchema<LinkLayerListUser>(
  "LinkLayerListUser",
  {
    user: f.message(1, PlayerSchema),
    linkmicId: f.string(2),
    userType: f.enum(6),
  },
);

/** `webcast.model.message.linkcore.AllListUser` [proto: webcast/model/message/linkcore.proto, line 9]. */
const AllListUserSchema = defineSchema<AllListUser>("AllListUser", {
  linkedList: f.repeated.message(2, LinkLayerListUserSchema),
  appliedList: f.repeated.message(3, LinkLayerListUserSchema),
  invitedList: f.repeated.message(4, LinkLayerListUserSchema),
  readyList: f.repeated.message(5, LinkLayerListUserSchema),
});

/** `webcast.model.message.linkcore.LinkListChangeContent` [proto: webcast/model/message/linkcore.proto, line 107]. */
const LinkListChangeContentSchema = defineSchema<LinkListChangeContent>(
  "LinkListChangeContent",
  {
    type: f.int32(1),
    list: f.message(2, AllListUserSchema),
  },
);

/** `webcast.model.message.linkcore.InviteContent` [proto: webcast/model/message/linkcore.proto, line 57]. */
const LinkInviteContentSchema = defineSchema<LinkInviteContent>(
  "InviteContent",
  {
    invitor: f.message(1, PlayerSchema),
    invitee: f.message(8, PlayerSchema),
  },
);

/** `webcast.model.message.linkcore.ApplyContent` [proto: webcast/model/message/linkcore.proto, line 16]. */
const LinkApplyContentSchema = defineSchema<LinkApplyContent>("ApplyContent", {
  applier: f.message(1, PlayerSchema),
});

/** `webcast.model.message.linkcore.PermitApplyContent` [proto: webcast/model/message/linkcore.proto, line 114]. */
const LinkPermitApplyContentSchema = defineSchema<LinkPermitApplyContent>(
  "PermitApplyContent",
  {
    permiter: f.message(1, PlayerSchema),
    replyStatus: f.enum(4),
    applier: f.message(6, PlayerSchema),
  },
);

/** `webcast.model.message.linkcore.ReplyInviteContent` [proto: webcast/model/message/linkcore.proto, line 183]. */
const LinkReplyInviteContentSchema = defineSchema<LinkReplyInviteContent>(
  "ReplyInviteContent",
  {
    invitee: f.message(1, PlayerSchema),
    replyStatus: f.enum(2),
  },
);

/** `webcast.model.message.linkcore.KickOutContent` [proto: webcast/model/message/linkcore.proto, line 75]. */
const LinkKickOutContentSchema = defineSchema<LinkKickOutContent>(
  "KickOutContent",
  {
    offliner: f.message(1, PlayerSchema),
    kickoutReason: f.enum(2),
  },
);

/** `webcast.model.message.linkcore.LeaveContent` [proto: webcast/model/message/linkcore.proto, line 86]. */
const LinkLeaveContentSchema = defineSchema<LinkLeaveContent>("LeaveContent", {
  leaver: f.message(1, PlayerSchema),
  leaveReason: f.count(2),
});

/** `webcast.model.message.linkcore.FinishChannelContent` [proto: webcast/model/message/linkcore.proto, line 52]. */
const LinkFinishContentSchema = defineSchema<LinkFinishContent>(
  "FinishChannelContent",
  {
    owner: f.message(1, PlayerSchema),
    finishReason: f.count(2),
  },
);

/**
 * `WebcastLinkLayerMessage` [proto:
 * webcast/model/message/linkcore_webcast_link_layer_message.proto, line 11].
 */
export const LinkLayerMessageSchema = defineSchema<LinkLayerMessage>(
  "WebcastLinkLayerMessage",
  {
    common: f.message(1, CommonSchema),
    messageType: f.enum(2),
    channelId: f.id(3),
    scene: f.enum(4),
    linkerMode: f.enum(9),
    listChangeContent: f.message(102, LinkListChangeContentSchema),
    inviteContent: f.message(103, LinkInviteContentSchema),
    applyContent: f.message(104, LinkApplyContentSchema),
    permitApplyContent: f.message(105, LinkPermitApplyContentSchema),
    replyInviteContent: f.message(106, LinkReplyInviteContentSchema),
    kickOutContent: f.message(107, LinkKickOutContentSchema),
    leaveContent: f.message(110, LinkLeaveContentSchema),
    finishContent: f.message(111, LinkFinishContentSchema),
  },
);
