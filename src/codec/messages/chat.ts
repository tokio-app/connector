// Chat comments (WebcastChatMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { ChatEmote, ChatMessage, Emote } from "../../events.js";
import { defineSchema, f } from "../schema.js";
import {
  CommonSchema,
  ImageSchema,
  UserIdentitySchema,
  UserSchema,
} from "./common.js";

/** `webcast.model.base.emoji.EmoteModel`. */
const EmoteSchema = defineSchema<Emote>("EmoteModel", {
  emoteId: f.string(1),
  image: f.message(2, ImageSchema),
});

/** `webcast.model.base.emoji.EmoteWithIndex`. */
const ChatEmoteSchema = defineSchema<ChatEmote>("EmoteWithIndex", {
  index: f.int32(1),
  emote: f.message(2, EmoteSchema),
});

/** `WebcastChatMessage`. */
export const ChatMessageSchema = defineSchema<ChatMessage>(
  "WebcastChatMessage",
  {
    common: f.message(1, CommonSchema),
    user: f.message(2, UserSchema),
    content: f.string(3),
    emotes: f.repeated.message(13, ChatEmoteSchema),
    contentLanguage: f.string(14),
    userIdentity: f.message(18, UserIdentitySchema),
  },
);
