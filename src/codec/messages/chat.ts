// Owned by T1 (Phase 1). Initial table from PROTOCOL.md; T1 checks every field
// number against reference/src/TikTok-Webcast-Protobuf and adds the tests.
import type { ChatEmote, ChatMessage, Emote } from "../../events.js";
import { defineSchema, f } from "../schema.js";
import {
  CommonSchema,
  ImageSchema,
  UserIdentitySchema,
  UserSchema,
} from "./common.js";

/** `webcast.model.base.emoji.EmoteModel`. */
export const EmoteSchema = defineSchema<Emote>("EmoteModel", {
  emoteId: f.string(1),
  image: f.message(2, ImageSchema),
});

/** `webcast.model.base.emoji.EmoteWithIndex`. */
export const ChatEmoteSchema = defineSchema<ChatEmote>("EmoteWithIndex", {
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
