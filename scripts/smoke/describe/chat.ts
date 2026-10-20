// The sample lines of the chat group's events (chat, reactions,
// moderation). Pure functions; chat.test.ts checks them.
import type {
  ChatMessage,
  LikeMessage,
  SocialMessage,
  WebcastEventMap,
} from "../../../src/index.js";
import type { ChatEvent } from "../../../src/routes/groups.js";
import { formatCount, nickname, quote } from "../../lib/format.js";

/** The chat group's describers: one per event with a sample line of its own. */
export const chatDescribers = {
  chat: (chat: ChatMessage) => `${nickname(chat.user)}: ${quote(chat.content)}`,
  like: (like: LikeMessage) =>
    `${nickname(like.user)} liked x${like.count}, ${formatCount(like.total)} in total`,
  follow: (follow: SocialMessage) => `${nickname(follow.user)} followed`,
  share: (share: SocialMessage) => `${nickname(share.user)} shared`,
} satisfies { [K in ChatEvent]?: (payload: WebcastEventMap[K]) => string };
