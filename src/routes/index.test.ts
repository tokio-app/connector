import { describe, expect, it } from "vitest";
import { getSchema } from "../codec/index.js";
import { chatRoutes } from "./chat.js";
import { giftRoutes } from "./gift.js";
import { ROUTES } from "./index.js";
import { linkRoutes } from "./link.js";
import { roomRoutes } from "./room.js";

const GROUPS = [chatRoutes, giftRoutes, linkRoutes, roomRoutes];

describe("ROUTES", () => {
  it("is the union of the four groups' routes, which don't overlap", () => {
    expect(ROUTES).toEqual(Object.assign({}, ...GROUPS));
    const sizes = GROUPS.reduce(
      (sum, routes) => sum + Object.keys(routes).length,
      0,
    );
    expect(Object.keys(ROUTES)).toHaveLength(sizes);
    expect(Object.keys(ROUTES)).toEqual(GROUPS.flatMap(Object.keys));
    expect(Object.isFrozen(ROUTES)).toBe(true);
    for (const routes of GROUPS) expect(Object.isFrozen(routes)).toBe(true);
  });

  it("decodes each message with the codec's schema of its name", () => {
    for (const [method, route] of Object.entries(ROUTES)) {
      expect(route.schema).toBe(getSchema(method));
      expect(route.events.length).toBeGreaterThan(0);
    }
  });

  it("decodes only the control message without a listener", () => {
    for (const [method, route] of Object.entries(ROUTES)) {
      expect(route.always === true).toBe(method === "WebcastControlMessage");
    }
  });
});
