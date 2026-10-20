// The routes of the chat group: chat, reactions and moderation. The rules
// are PROTOCOL.md's "Routing". A new message type gets its route here and
// its table in src/codec/messages/chat/.
//
// `social` is declared in WebcastEventMap and CHAT_EVENTS, but not emitted
// yet: emitting it before `follow`/`share` is Phase 1 work of this group.
import { ChatMessageSchema } from "../codec/messages/chat/chat.js";
import { LikeMessageSchema } from "../codec/messages/chat/like.js";
import { SocialMessageSchema } from "../codec/messages/chat/social.js";
import { defineRoute, forward, type AnyRoute } from "./route.js";

/** The chat group's routes, by message type (a batch message's `method`). */
export const chatRoutes: Readonly<Record<string, AnyRoute>> = Object.freeze({
  WebcastChatMessage: forward("chat", ChatMessageSchema),
  WebcastLikeMessage: forward("like", LikeMessageSchema),
  // Follows and shares share a message type; the key of the text TikTok
  // shows for them tells them apart (as is, not lowercased, like 2.4.0).
  WebcastSocialMessage: defineRoute({
    schema: SocialMessageSchema,
    events: ["follow", "share"],
    emit(message, context) {
      const key = message.common?.displayText?.key ?? "";
      if (key.includes("follow")) context.emit("follow", message);
      else if (key.includes("share")) context.emit("share", message);
    },
  }),
});
