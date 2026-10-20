// Links in the newer link layer (WebcastLinkLayerMessage). Field numbers:
// PROTOCOL.md, "LIVE messages", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  AllListUser,
  GroupChannelAllUser,
  GroupChannelUser,
  GroupPlayer,
  LinkApplyContent,
  LinkCancelJoinGroupContent,
  LinkFinishContent,
  LinkGroupChangeContent,
  LinkGroupUserContent,
  LinkInviteContent,
  LinkJoinGroupContent,
  LinkJoinRoomDirectContent,
  LinkKickOutContent,
  LinkLayerListUser,
  LinkLayerMessage,
  LinkLeaveContent,
  LinkLeaveJoinGroupContent,
  LinkListChangeContent,
  LinkPermitApplyContent,
  LinkPermitJoinGroupContent,
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

/** `webcast.linkmic.common.GroupPlayer` [proto: webcast/linkmic/common.proto, line 319]. */
const GroupPlayerSchema = defineSchema<GroupPlayer>("GroupPlayer", {
  channelId: f.id(1),
  user: f.message(2, PlayerSchema),
});

/** `webcast.linkmic.common.GroupChannelUser` [proto: webcast/linkmic/common_group_channel_user.proto, line 8]. */
const GroupChannelUserSchema = defineSchema<GroupChannelUser>(
  "GroupChannelUser",
  {
    channelId: f.id(1),
    status: f.enum(2),
    type: f.enum(3),
    allUser: f.message(4, AllListUserSchema),
    joinTime: f.id(5),
    linkedTime: f.id(6),
    ownerUser: f.message(7, GroupPlayerSchema),
    groupLinkmicId: f.string(8),
  },
);

/** `webcast.linkmic.common.GroupChannelAllUser` [proto: webcast/linkmic/common_group_channel_all_user.proto, line 7]. */
const GroupChannelAllUserSchema = defineSchema<GroupChannelAllUser>(
  "GroupChannelAllUser",
  {
    groupChannelId: f.id(1),
    user: f.repeated.message(2, GroupChannelUserSchema),
    contentVersion: f.count(3),
  },
);

/** `webcast.im.JoinGroupContent` [proto: webcast/im.proto, line 433]. */
const LinkJoinGroupContentSchema = defineSchema<LinkJoinGroupContent>(
  "JoinGroupContent",
  {
    groupUser: f.message(1, GroupChannelAllUserSchema),
    joinUser: f.message(2, GroupPlayerSchema),
    type: f.enum(3),
  },
);

/** `webcast.im.PermitJoinGroupContent` [proto: webcast/im.proto, line 538]. */
const LinkPermitJoinGroupContentSchema =
  defineSchema<LinkPermitJoinGroupContent>("PermitJoinGroupContent", {
    approver: f.message(1, GroupPlayerSchema),
    agreeStatus: f.enum(2),
    type: f.enum(3),
    groupUser: f.message(5, GroupChannelAllUserSchema),
    linkedUserUiPositions: f.repeated.string(7),
  });

/** `webcast.im.CancelJoinGroupContent` [proto: webcast/im.proto, line 385]. */
const LinkCancelJoinGroupContentSchema =
  defineSchema<LinkCancelJoinGroupContent>("CancelJoinGroupContent", {
    leaver: f.repeated.message(1, GroupPlayerSchema),
    operator: f.message(2, GroupPlayerSchema),
    type: f.enum(3),
    groupUser: f.message(4, GroupChannelAllUserSchema),
  });

/** `webcast.im.LeaveJoinGroupContent` [proto: webcast/im.proto, line 492]. */
const LinkLeaveJoinGroupContentSchema = defineSchema<LinkLeaveJoinGroupContent>(
  "LeaveJoinGroupContent",
  {
    operator: f.message(1, GroupPlayerSchema),
    groupChannelId: f.id(2),
    leaveSource: f.string(3),
    linkedUserUiPositions: f.repeated.string(4),
  },
);

/** `webcast.im.GroupChangeContent` [proto: webcast/im.proto, line 406]. */
const LinkGroupChangeContentSchema = defineSchema<LinkGroupChangeContent>(
  "GroupChangeContent",
  {
    groupUser: f.message(1, GroupChannelAllUserSchema),
    linkedUserUiPositions: f.repeated.string(2),
  },
);

/**
 * `webcast.im.P2PGroupChangeContent` [proto: webcast/im.proto, line 522] and
 * `webcast.im.JoinGroupDirectContent` [line 447]: both hold the group as
 * `group_user` (2).
 */
const LinkGroupUserContentSchema = defineSchema<LinkGroupUserContent>(
  "GroupUserContent",
  { groupUser: f.message(2, GroupChannelAllUserSchema) },
);

/** `webcast.im.JoinRoomDirectContent` [proto: webcast/im.proto, line 469]. */
const LinkJoinRoomDirectContentSchema = defineSchema<LinkJoinRoomDirectContent>(
  "JoinRoomDirectContent",
  {
    joiner: f.message(1, PlayerSchema),
    joinerLinkMicId: f.string(2),
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
    joinGroupContent: f.message(113, LinkJoinGroupContentSchema),
    permitGroupContent: f.message(114, LinkPermitJoinGroupContentSchema),
    cancelGroupContent: f.message(115, LinkCancelJoinGroupContentSchema),
    leaveGroupContent: f.message(116, LinkLeaveJoinGroupContentSchema),
    p2pGroupChangeContent: f.message(117, LinkGroupUserContentSchema),
    groupChangeContent: f.message(118, LinkGroupChangeContentSchema),
    joinGroupDirectContent: f.message(119, LinkGroupUserContentSchema),
    joinRoomDirectContent: f.message(120, LinkJoinRoomDirectContentSchema),
  },
);
