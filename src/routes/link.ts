// The routes of the link group: link-mic and battles. The rules are
// PROTOCOL.md's "Routing". None is routed yet: a new message type gets its
// route here and its table in src/codec/messages/link/.
import type { AnyRoute } from "./route.js";

/** The link group's routes, by message type (a batch message's `method`). */
export const linkRoutes: Readonly<Record<string, AnyRoute>> = Object.freeze({});
