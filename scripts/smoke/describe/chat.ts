// The sample lines of the chat group's events (chat, reactions,
// moderation). Pure functions; chat.test.ts checks them.
import {
  PinAction,
  type CaptionMessage,
  type ChatMessage,
  type EmoteChatMessage,
  type ImDeleteMessage,
  type LikeMessage,
  type NoticeMessage,
  type QuestionNewMessage,
  type RoomMessage,
  type RoomPinMessage,
  type SocialMessage,
  type WebcastEventMap,
} from "../../../src/index.js";
import type { ChatEvent } from "../../../src/routes/groups.js";
import { formatCount, nickname, quote } from "../../lib/format.js";

const PIN_ACTIONS: Readonly<Record<number, string>> = {
  [PinAction.PIN]: "pinned",
  [PinAction.PIN_CANCEL]: "unpinned",
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** What a pin is about: the pinned comment, or the pinned message's type. */
function pinned(pin: RoomPinMessage): string {
  const chat = pin.chatMessage;
  if (chat !== undefined)
    return `${nickname(chat.user)}: ${quote(chat.content)}`;
  return pin.method || "a message";
}

/** The chat group's describers: one per event with a sample line of its own. */
export const chatDescribers = {
  chat: (chat: ChatMessage) => `${nickname(chat.user)}: ${quote(chat.content)}`,
  emote: (emote: EmoteChatMessage) =>
    `${nickname(emote.user)} sent ${plural(emote.emoteList.length, "emote")}`,
  like: (like: LikeMessage) =>
    `${nickname(like.user)} liked x${like.count}, ${formatCount(like.total)} in total`,
  social: (social: SocialMessage) =>
    `${nickname(social.user)} (${social.common?.displayText?.key || "no key"})`,
  follow: (follow: SocialMessage) => `${nickname(follow.user)} followed`,
  share: (share: SocialMessage) => `${nickname(share.user)} shared`,
  imDelete: (imDelete: ImDeleteMessage) =>
    `${plural(imDelete.deleteMsgIds.length, "comment")} deleted, ${plural(imDelete.deleteUserIds.length, "user")}`,
  roomPin: (pin: RoomPinMessage) =>
    `${nickname(pin.operator)} ${PIN_ACTIONS[pin.action] ?? `(action ${pin.action})`} ${pinned(pin)}`,
  questionNew: (question: QuestionNewMessage) =>
    `${nickname(question.details?.user)} asked ${quote(question.details?.content ?? "")}`,
  captionMessage: (caption: CaptionMessage) => {
    const [first] = caption.content;
    const lang = first?.lang ? ` (${first.lang})` : "";
    const partial = caption.definite ? "" : ", partial";
    return `caption${lang}: ${quote(first?.content ?? "")}${partial}`;
  },
  roomMessage: (room: RoomMessage) =>
    `${room.isWelcome ? "welcome" : room.scene || "room message"}: ${quote(room.content)}`,
  notice: (notice: NoticeMessage) => {
    const text =
      notice.content ||
      notice.noticeContent?.defaultPattern ||
      notice.noticeTitle?.defaultPattern ||
      notice.title?.defaultPattern ||
      "";
    return `notice type ${notice.noticeType}: ${quote(text)}`;
  },
} satisfies { [K in ChatEvent]?: (payload: WebcastEventMap[K]) => string };
