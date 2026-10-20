// The sample lines of the link group's events (link-mic and battles). None
// yet: every event of the group gets the generic line. Pure functions;
// link.test.ts checks them.
import type { WebcastEventMap } from "../../../src/index.js";
import type { LinkEvent } from "../../../src/routes/groups.js";

/** The link group's describers: one per event with a sample line of its own. */
export const linkDescribers = {} satisfies {
  [K in LinkEvent]?: (payload: WebcastEventMap[K]) => string;
};
