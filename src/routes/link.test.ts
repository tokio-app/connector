import { describe, expect, it } from "vitest";
import { linkRoutes } from "./link.js";

describe("linkRoutes", () => {
  it("routes no message yet", () => {
    expect(
      Object.fromEntries(
        Object.entries(linkRoutes).map(([method, route]) => [
          method,
          route.events,
        ]),
      ),
    ).toEqual({});
  });

  it.todo("lists every event of LINK_EVENTS");
});
