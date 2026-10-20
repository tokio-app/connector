// Chat comments (WebcastChatMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { ChatEmote, ChatMessage, Emote } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import {
  CommonSchema,
  ImageSchema,
  MsgFilterSchema,
  UserIdentitySchema,
  UserSchema,
} from "../common.js";

/** `webcast.model.base.emoji.EmoteModel` [proto: webcast/model/base/emoji.proto, line 10]. */
export const EmoteSchema = defineSchema<Emote>("EmoteModel", {
  emoteId: f.string(1),
  image: f.message(2, ImageSchema),
});

/** `webcast.model.base.emoji.EmoteWithIndex` [proto: webcast/model/base/emoji.proto, line 32]. */
const ChatEmoteSchema = defineSchema<ChatEmote>("EmoteWithIndex", {
  index: f.int32(1),
  emote: f.message(2, EmoteSchema),
});

/** `WebcastChatMessage` [proto: webcast/model/message/messages.proto, line 1153]. */
export const ChatMessageSchema = defineSchema<ChatMessage>(
  "WebcastChatMessage",
  {
    common: f.message(1, CommonSchema),
    user: f.message(2, UserSchema),
    content: f.string(3),
    atUser: f.message(12, UserSchema),
    emotes: f.repeated.message(13, ChatEmoteSchema),
    contentLanguage: f.string(14),
    msgFilter: f.message(15, MsgFilterSchema),
    userIdentity: f.message(18, UserIdentitySchema),
    mentionUsers: f.repeated.message(28, UserSchema),
  },
);
