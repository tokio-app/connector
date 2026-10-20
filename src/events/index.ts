// Every event a connection emits, with its payload type: WebcastEventMap,
// the WebcastEvent constant of their names, and the payload types of each
// group (connection.ts, shared.ts, chat.ts, gift.ts, link.ts, room.ts).
import type { EventName } from "../emitter.js";
import type { ConnectorError } from "../errors.js";
import type { ChatMessage, LikeMessage, SocialMessage } from "./chat.js";
import type {
  ConnectedEvent,
  DisconnectedEvent,
  RawMessage,
  ReconnectingEvent,
  StreamEndEvent,
} from "./connection.js";
import type {
  BarrageMessage,
  EnvelopeMessage,
  GiftMessage,
  MemberMessage,
} from "./gift.js";
import type { RoomUserMessage } from "./room.js";

export * from "./chat.js";
export * from "./connection.js";
export * from "./gift.js";
export * from "./link.js";
export * from "./room.js";
export * from "./shared.js";

/**
 * Every event a {@link TikTokLiveConnection} emits, with its payload.
 *
 * Connection events: `connected`, `disconnected`, `reconnecting`, `error`.
 * LIVE events: the rest. A LIVE message is only decoded when one of the events
 * it can produce has a listener.
 */
export interface WebcastEventMap {
  /** The connection entered the room: after the first `connect()` and after each reconnect. */
  connected: ConnectedEvent;
  /**
   * An established connection ended. Not emitted when the first `connect()`
   * fails: its promise rejects instead.
   */
  disconnected: DisconnectedEvent;
  /** A reconnect attempt is about to run, after `delayMs`. */
  reconnecting: ReconnectingEvent;
  /**
   * A failure no promise reports: a message that couldn't be decoded, a failed
   * reconnect attempt. Only emitted when it has a listener; otherwise logged.
   */
  error: ConnectorError;
  /** The LIVE ended. The connection disconnects (reason `streamEnd`) and doesn't reconnect. */
  streamEnd: StreamEndEvent;
  /** A chat comment. */
  chat: ChatMessage;
  /** A gift (see {@link GiftMessage} for streaks). */
  gift: GiftMessage;
  /** Likes. */
  like: LikeMessage;
  /** A user followed the host. */
  follow: SocialMessage;
  /** A user shared the LIVE. */
  share: SocialMessage;
  /** A viewer joined, or another membership change. */
  member: MemberMessage;
  /** Viewer counts and top viewers. */
  roomUser: RoomUserMessage;
  /** A treasure chest. */
  envelope: EnvelopeMessage;
  /** A super fan banner. */
  superFan: BarrageMessage;
  /** A user became a super fan. */
  superFanJoin: BarrageMessage;
  /** A super fan box (also emitted as `envelope`). */
  superFanBox: EnvelopeMessage;
  /**
   * Every LIVE message before decoding, including the ones no other event
   * covers and backlog messages (`isHistory`). Duplicates are dropped.
   */
  raw: RawMessage;
}

/** A public event name: a key of {@link WebcastEventMap}. */
export type WebcastEventName = EventName<WebcastEventMap>;

/**
 * Every event name, as a constant, so apps needn't spell them as strings:
 *
 * ```ts
 * connection.on(WebcastEvent.CHAT, (chat) => console.log(chat.content));
 * ```
 *
 * The keys are the names in SCREAMING_CASE; the values are the keys of
 * {@link WebcastEventMap}. events/index.test.ts fails when one is missing.
 */
export const WebcastEvent = Object.freeze({
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  RECONNECTING: "reconnecting",
  ERROR: "error",
  STREAM_END: "streamEnd",
  CHAT: "chat",
  GIFT: "gift",
  LIKE: "like",
  FOLLOW: "follow",
  SHARE: "share",
  MEMBER: "member",
  ROOM_USER: "roomUser",
  ENVELOPE: "envelope",
  SUPER_FAN: "superFan",
  SUPER_FAN_JOIN: "superFanJoin",
  SUPER_FAN_BOX: "superFanBox",
  RAW: "raw",
} as const satisfies Record<string, WebcastEventName>);
