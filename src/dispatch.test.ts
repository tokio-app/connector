import { describe, expect, it } from "vitest";
import { LikeMessageSchema } from "./codec/messages/like.js";
import { ROUTES, RecentIds, defineRoute, dispatch } from "./dispatch.js";

// dispatch() and ROUTES are T1's (Phase 1); these cover the parts frozen in
// Phase 0B.

describe("RecentIds", () => {
  it("tells new ids from repeated ones", () => {
    const ids = new RecentIds(3);
    expect(ids.add("a")).toBe(true);
    expect(ids.add("b")).toBe(true);
    expect(ids.add("a")).toBe(false);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("c")).toBe(false);
    expect(ids.size).toBe(2);
  });

  it("forgets the oldest id past its capacity", () => {
    const ids = new RecentIds(2);
    ids.add("a");
    ids.add("b");
    ids.add("c");
    expect(ids.has("a")).toBe(false);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(true);
    expect(ids.size).toBe(2);
    expect(ids.add("a")).toBe(true);
    expect(ids.has("b")).toBe(false);
  });

  it("remembers nothing with a capacity of 0", () => {
    const ids = new RecentIds(0);
    expect(ids.add("a")).toBe(true);
    expect(ids.add("a")).toBe(true);
    expect(ids.size).toBe(0);
  });

  it("forgets everything on clear", () => {
    const ids = new RecentIds(5);
    ids.add("a");
    ids.clear();
    expect(ids.size).toBe(0);
    expect(ids.add("a")).toBe(true);
  });
});

describe("defineRoute", () => {
  it("returns the route as is", () => {
    const route = {
      schema: LikeMessageSchema,
      events: ["like"] as const,
      emit: () => {},
    };
    expect(defineRoute(route)).toBe(route);
  });
});

describe("Phase 0B stubs", () => {
  it("starts with no routes and an unimplemented dispatch", () => {
    expect(ROUTES).toEqual({});
    expect(() =>
      dispatch({} as never, {
        method: "WebcastChatMessage",
        payload: new Uint8Array(0),
        msgId: "1",
        msgType: 0,
        isHistory: false,
      }),
    ).toThrow("dispatch() is not implemented yet (WebcastChatMessage)");
  });
});
