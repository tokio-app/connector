import { describe, expect, expectTypeOf, it } from "vitest";
import {
  WebcastEvent,
  type WebcastEventMap,
  type WebcastEventName,
} from "./index.js";

/** The event names {@link WebcastEvent} holds. */
type Named = (typeof WebcastEvent)[keyof typeof WebcastEvent];

/** `superFanJoin` → `SUPER_FAN_JOIN`. */
function screaming(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

describe("WebcastEvent", () => {
  it("names every event of WebcastEventMap, and nothing else", () => {
    // Removing a key from WebcastEvent, or adding an event to the map without
    // one, fails to typecheck here.
    expectTypeOf<Exclude<WebcastEventName, Named>>().toBeNever();
    expectTypeOf<Exclude<Named, WebcastEventName>>().toBeNever();
    expectTypeOf<WebcastEventName>().toEqualTypeOf<keyof WebcastEventMap>();
  });

  it("is frozen, with unique values", () => {
    expect(Object.isFrozen(WebcastEvent)).toBe(true);
    const values = Object.values(WebcastEvent);
    expect(new Set(values).size).toBe(values.length);
  });

  it("keys each name by its SCREAMING_CASE form", () => {
    for (const [key, name] of Object.entries(WebcastEvent)) {
      expect(key).toBe(screaming(name));
    }
    expect(WebcastEvent.SUPER_FAN_JOIN).toBe("superFanJoin");
    expect(WebcastEvent.RAW).toBe("raw");
  });

  it("lists the connection events first, then the LIVE events, then raw", () => {
    const values = Object.values(WebcastEvent);
    expect(values.slice(0, 4)).toEqual([
      "connected",
      "disconnected",
      "reconnecting",
      "error",
    ]);
    expect(values.at(-1)).toBe("raw");
  });
});
