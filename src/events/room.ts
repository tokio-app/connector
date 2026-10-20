// The room group: the room's state, ranks, polls, shopping and system
// messages. The tables are in src/codec/messages/room/, the routes in
// src/routes/room.ts.
import type { Common, User } from "./shared.js";

/**
 * The values of {@link ControlMessage.action} TikTok defines
 * (`webcast.im.ControlAction`). `STREAM_ENDED` and `STREAM_SUSPENDED` end the
 * LIVE: the connection emits `streamEnd` (`ended` or `suspended`) and stops.
 */
export const ControlAction = Object.freeze({
  /** TikTok didn't say. */
  UNKNOWN: 0,
  /** The host paused the LIVE. */
  PAUSED: 1,
  /** The host resumed the LIVE. */
  UNPAUSED: 2,
  /** The host ended the LIVE. */
  STREAM_ENDED: 3,
  /** TikTok ended the LIVE (a moderator or a ban). */
  STREAM_SUSPENDED: 4,
} as const);

/** A change to the LIVE's state, such as the LIVE ending. Decoded for `streamEnd`; not an event of its own. */
export interface ControlMessage {
  /** Data every message carries. */
  common?: Common;
  /** What happened: `1` paused, `2` resumed, `3` ended, `4` suspended ({@link ControlAction}). */
  action: number;
}

/** A top viewer, in a {@link RoomUserMessage}. */
export interface RoomUserRank {
  /** The viewer. */
  user?: User;
  /** The viewer's score (coins sent). */
  score: number;
  /** The viewer's position, starting at 1. */
  rank: number;
}

/** Viewer counts and top viewers (`roomUser` event). */
export interface RoomUserMessage {
  /** Data every message carries. */
  common?: Common;
  /** Viewers watching now. */
  total: number;
  /** Viewers so far in this LIVE. */
  totalUser: number;
  /** The top viewers. */
  ranks: RoomUserRank[];
}
