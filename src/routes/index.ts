// Every route, by message type: the four groups' tables joined. dispatch.ts
// looks a message's route up here; message types without a route only reach
// `raw`.
import { chatRoutes } from "./chat.js";
import { giftRoutes } from "./gift.js";
import { linkRoutes } from "./link.js";
import { roomRoutes } from "./room.js";
import type { AnyRoute } from "./route.js";

/** The routes, by message type (a batch message's `method`). Message types without a route only reach `raw`. */
export const ROUTES: Readonly<Record<string, AnyRoute>> = Object.freeze({
  ...chatRoutes,
  ...giftRoutes,
  ...linkRoutes,
  ...roomRoutes,
});
