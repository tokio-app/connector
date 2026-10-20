import { describe, expect, it } from "vitest";
import { linkSchemas } from "./index.js";

describe("linkSchemas", () => {
  it("holds exactly the link group's tables, keyed by message name", () => {
    expect(Object.keys(linkSchemas)).toEqual([
      "WebcastLinkMicBattle",
      "WebcastLinkMicArmies",
      "WebcastLinkMicBattlePunishFinish",
      "WebcastLinkmicBattleTaskMessage",
      "WebcastLinkMicBattleItemCard",
    ]);
    for (const [name, schema] of Object.entries(linkSchemas)) {
      expect(schema.name).toBe(name);
    }
    expect(Object.isFrozen(linkSchemas)).toBe(true);
  });
});
