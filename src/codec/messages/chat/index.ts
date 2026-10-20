// The tables of the chat group (chat, reactions, moderation), by protobuf
// message name. A new table gets a line here, and its route in
// src/routes/chat.ts.
import { ChatMessageSchema } from "./chat.js";
import { LikeMessageSchema } from "./like.js";
import { SocialMessageSchema } from "./social.js";

/** The chat group's top-level messages, keyed like a batch's `method`. */
export const chatSchemas = Object.freeze({
  WebcastChatMessage: ChatMessageSchema,
  WebcastLikeMessage: LikeMessageSchema,
  WebcastSocialMessage: SocialMessageSchema,
});
