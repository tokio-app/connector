// The sample lines of the room group's events (the room's state, ranks,
// polls, shopping, system messages). Pure functions; room.test.ts checks
// them.
import type { RoomUserMessage, WebcastEventMap } from "../../../src/index.js";
import type { RoomEvent } from "../../../src/routes/groups.js";
import { formatCount, nickname } from "../../lib/format.js";

/** The room group's describers: one per event with a sample line of its own. */
export const roomDescribers = {
  roomUser: (roomUser: RoomUserMessage) => {
    const top = roomUser.ranks[0];
    return `${formatCount(roomUser.total)} watching, ${formatCount(roomUser.totalUser)} so far${top ? `, top viewer ${nickname(top.user)}` : ""}`;
  },
} satisfies { [K in RoomEvent]?: (payload: WebcastEventMap[K]) => string };
