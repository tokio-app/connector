import { describe, expect, expectTypeOf, it } from "vitest";
import type { WebcastEventName } from "../events/index.js";
import {
  CHAT_EVENTS,
  CONNECTION_EVENTS,
  GIFT_EVENTS,
  LINK_EVENTS,
  LIVE_GROUPS,
  ROOM_EVENTS,
  type ChatEvent,
  type ConnectionEvent,
  type GiftEvent,
  type LinkEvent,
  type LiveEvent,
  type RoomEvent,
} from "./groups.js";

type Grouped = ConnectionEvent | LiveEvent | "raw";

const GROUPS = [
  CONNECTION_EVENTS,
  CHAT_EVENTS,
  GIFT_EVENTS,
  LINK_EVENTS,
  ROOM_EVENTS,
];

describe("the event groups", () => {
  it("partition every event of WebcastEventMap but raw", () => {
    // Every event is in a group, and every group member is an event.
    expectTypeOf<Exclude<WebcastEventName, Grouped>>().toBeNever();
    expectTypeOf<Exclude<Grouped, WebcastEventName>>().toBeNever();
    // No event is in two groups, and the groups don't overlap each other.
    expectTypeOf<Extract<ConnectionEvent, LiveEvent>>().toBeNever();
    expectTypeOf<Extract<ChatEvent, GiftEvent>>().toBeNever();
    expectTypeOf<Extract<ChatEvent, LinkEvent>>().toBeNever();
    expectTypeOf<Extract<ChatEvent, RoomEvent>>().toBeNever();
    expectTypeOf<Extract<GiftEvent, LinkEvent>>().toBeNever();
    expectTypeOf<Extract<GiftEvent, RoomEvent>>().toBeNever();
    expectTypeOf<Extract<LinkEvent, RoomEvent>>().toBeNever();
    expectTypeOf<Extract<Grouped, "raw">>().toEqualTypeOf<"raw">();
    expectTypeOf<Extract<LiveEvent, "raw">>().toBeNever();
  });

  it("hold each event once, frozen", () => {
    const all = GROUPS.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain("raw");
    for (const group of GROUPS) expect(Object.isFrozen(group)).toBe(true);
    expect(LIVE_GROUPS).toEqual([
      CHAT_EVENTS,
      GIFT_EVENTS,
      LINK_EVENTS,
      ROOM_EVENTS,
    ]);
    expect(Object.isFrozen(LIVE_GROUPS)).toBe(true);
  });
});
