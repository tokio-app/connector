// Which group each event belongs to: the connection's own events, then the
// four LIVE groups (the files of src/events/, src/codec/messages/ and
// src/routes/). Every key of WebcastEventMap but `raw` is in exactly one list
// (groups.test.ts checks it at the type level), so the smoke run and the
// describers can be derived from them.

/** The connection's own events: not LIVE messages. */
export const CONNECTION_EVENTS = Object.freeze([
  "connected",
  "disconnected",
  "reconnecting",
  "error",
] as const);

/** The chat group: chat, reactions and moderation. */
export const CHAT_EVENTS = Object.freeze([
  "chat",
  "like",
  "follow",
  "share",
] as const);

/** The gift group: gifts, money and membership. */
export const GIFT_EVENTS = Object.freeze([
  "gift",
  "member",
  "envelope",
  "superFan",
  "superFanJoin",
  "superFanBox",
] as const);

/** The link group: link-mic and battles. */
export const LINK_EVENTS = Object.freeze([] as const);

/** The room group: the room's state, ranks, polls, shopping and system messages. */
export const ROOM_EVENTS = Object.freeze(["streamEnd", "roomUser"] as const);

/** The four LIVE groups, in order. */
export const LIVE_GROUPS = Object.freeze([
  CHAT_EVENTS,
  GIFT_EVENTS,
  LINK_EVENTS,
  ROOM_EVENTS,
] as const);

/** A connection event. */
export type ConnectionEvent = (typeof CONNECTION_EVENTS)[number];
/** An event of the chat group. */
export type ChatEvent = (typeof CHAT_EVENTS)[number];
/** An event of the gift group. */
export type GiftEvent = (typeof GIFT_EVENTS)[number];
/** An event of the link group. */
export type LinkEvent = (typeof LINK_EVENTS)[number];
/** An event of the room group. */
export type RoomEvent = (typeof ROOM_EVENTS)[number];
/** An event a LIVE message leads to: every event but the connection's and `raw`. */
export type LiveEvent = (typeof LIVE_GROUPS)[number][number];
