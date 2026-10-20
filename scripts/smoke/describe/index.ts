// How `yarn smoke` prints the first message of each LIVE event: one
// describer per event in the group files (chat.ts, gift.ts, link.ts,
// room.ts), joined here, and a generic line for the events without one.
import type { WebcastEventMap, WebcastEventName } from "../../../src/index.js";
import type { LiveEvent } from "../../../src/routes/groups.js";
import { nickname } from "../../lib/format.js";
import { chatDescribers } from "./chat.js";
import { giftDescribers } from "./gift.js";
import { linkDescribers } from "./link.js";
import { roomDescribers } from "./room.js";

/** A one-line description of an event's payload, per LIVE event that has one. */
export type Describers = {
  [K in LiveEvent]?: (payload: WebcastEventMap[K]) => string;
};

/** The describers of every group. An event without one gets {@link describeGeneric}. */
export const DESCRIBERS: Describers = {
  ...chatDescribers,
  ...giftDescribers,
  ...linkDescribers,
  ...roomDescribers,
};

// A property of a value that may not be an object, as unknown.
function prop(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const got: unknown = Reflect.get(value, key);
  return got;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The line of a LIVE event without a describer: the user's nickname when the
 * payload has a `user`, then the key of the text TikTok displays
 * (`common.displayText.key`), or the message type (`common.method`).
 */
export function describeGeneric(payload: object): string {
  const common = prop(payload, "common");
  const what =
    text(prop(prop(common, "displayText"), "key")) ||
    text(prop(common, "method"));
  if (!("user" in payload)) return what || "(no common)";
  const name = nickname({ nickname: text(prop(payload.user, "nickname")) });
  return `${name} (${what || "no common"})`;
}

/** The line of a LIVE event's payload: its describer's, or the generic one. */
export function describeLive<K extends WebcastEventName>(
  event: K,
  payload: WebcastEventMap[K],
): string {
  const describers: {
    [E in WebcastEventName]?: (payload: WebcastEventMap[E]) => string;
  } = DESCRIBERS;
  const describe = describers[event];
  return describe === undefined ? describeGeneric(payload) : describe(payload);
}
