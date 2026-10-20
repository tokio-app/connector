// The chat group: chat, reactions and moderation. The tables are in
// src/codec/messages/chat/, the routes in src/routes/chat.ts.
import type { ChatEmote, Common, User, UserIdentity } from "./shared.js";

/** A chat comment (`chat` event). */
export interface ChatMessage {
  /** Data every message carries. */
  common?: Common;
  /** Who commented. */
  user?: User;
  /** How the commenter relates to the host. */
  userIdentity?: UserIdentity;
  /** The comment text. */
  content: string;
  /** The comment's language code, such as `en`, when TikTok detected one. */
  contentLanguage: string;
  /** The emotes in the comment. */
  emotes: ChatEmote[];
}

/** Likes (`like` event). */
export interface LikeMessage {
  /** Data every message carries. */
  common?: Common;
  /** Who liked. */
  user?: User;
  /** How many likes this event carries. */
  count: number;
  /** The LIVE's total likes so far. */
  total: number;
}

/** A follow (`follow` event) or share (`share` event). */
export interface SocialMessage {
  /** Data every message carries. `common.displayText.key` tells follows from shares. */
  common?: Common;
  /** Who followed or shared. */
  user?: User;
  /** TikTok's share type code. */
  shareType: number;
  /** TikTok's social action code. */
  action: number;
  /** Where the LIVE was shared to, when TikTok says. */
  shareTarget: string;
  /** How many times the user shared the LIVE. */
  shareCount: number;
}
