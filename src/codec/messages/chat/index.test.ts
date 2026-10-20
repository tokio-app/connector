import { describe, expect, it } from "vitest";
import { chatSchemas } from "./index.js";

describe("chatSchemas", () => {
  it("holds exactly the chat group's tables, keyed by message name", () => {
    expect(Object.keys(chatSchemas)).toEqual([
      "WebcastChatMessage",
      "WebcastLikeMessage",
      "WebcastSocialMessage",
    ]);
    for (const [name, schema] of Object.entries(chatSchemas)) {
      expect(schema.name).toBe(name);
    }
    expect(Object.isFrozen(chatSchemas)).toBe(true);
  });
});
