import { describe, expect, it } from "vitest";
import { linkDescribers } from "./link.js";

describe("linkDescribers", () => {
  it("describes no event yet", () => {
    expect(Object.keys(linkDescribers)).toEqual([]);
  });
});
