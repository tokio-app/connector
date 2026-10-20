import { describe, expect, it } from "vitest";
import { roomSchemas } from "./index.js";

describe("roomSchemas", () => {
  it("holds exactly the room group's tables, keyed by message name", () => {
    expect(Object.keys(roomSchemas)).toEqual([
      "WebcastControlMessage",
      "WebcastRoomUserSeqMessage",
    ]);
    for (const [name, schema] of Object.entries(roomSchemas)) {
      expect(schema.name).toBe(name);
    }
    expect(Object.isFrozen(roomSchemas)).toBe(true);
  });
});
