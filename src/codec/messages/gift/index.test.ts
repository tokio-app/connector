import { describe, expect, it } from "vitest";
import { giftSchemas } from "./index.js";

describe("giftSchemas", () => {
  it("holds exactly the gift group's tables, keyed by message name", () => {
    expect(Object.keys(giftSchemas)).toEqual([
      "WebcastGiftMessage",
      "WebcastMemberMessage",
      "WebcastEnvelopeMessage",
      "WebcastBarrageMessage",
      "WebcastSubNotifyMessage",
      "WebcastSubPinEventMessage",
      "WebcastGiftBroadcastMessage",
      "WebcastRoomNotifyMessage",
      "WebcastGoalUpdateMessage",
      "WebcastViewerPicksUpdateMessage",
      "WebcastHourlyRankRewardMessage",
      "WebcastGiftPromptMessage",
      "WebcastGiftPanelUpdateMessage",
      "WebcastGiftDynamicRestrictionMessage",
      "WebcastGuideMessage",
      "WebcastBoostCardMessage",
    ]);
    for (const [name, schema] of Object.entries(giftSchemas)) {
      expect(schema.name).toBe(name);
    }
    expect(Object.isFrozen(giftSchemas)).toBe(true);
  });
});
