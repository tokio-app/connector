import { describe, expect, it } from "vitest";
import { LikeMessageSchema } from "../codec/messages/chat/like.js";
import { RecentIds, defineRoute, forward } from "./route.js";
import { encodeMessage } from "../../test/helpers/encoder.js";
import { fakeContext, names } from "../../test/helpers/dispatchContext.js";
import { SAMPLE_USER } from "../../test/helpers/samples.js";

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

describe("forward", () => {
  it("emits every message as the one event, with its schema", () => {
    const route = forward("like", LikeMessageSchema);
    expect(route.schema).toBe(LikeMessageSchema);
    expect(route.events).toEqual(["like"]);
    expect(route.always).toBeUndefined();
    const { context, emitted } = fakeContext({ listen: ["like"] });
    const like = { user: SAMPLE_USER, count: 2, total: 10 };
    route.emit(like, context);
    expect(names(emitted)).toEqual(["like"]);
    expect(emitted[0]?.[1]).toBe(like);
    // Encoding it is what dispatch does before emit; the route doesn't care.
    expect(encodeMessage(LikeMessageSchema, like).length).toBeGreaterThan(0);
  });
});
