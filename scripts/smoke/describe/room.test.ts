import { describe, expect, it } from "vitest";
import type { User } from "../../../src/index.js";
import { roomDescribers } from "./room.js";

function user(nickname: string): User {
  return { userId: "1", nickname, displayId: "handle", badgeList: [] };
}

const PUNISH = {
  punishType: "ban_live",
  punishReason: "",
  punishId: "",
  punishTypeId: 9,
  duration: 0,
  endTime: "0",
  showReason: "",
};

describe("roomDescribers", () => {
  it("describes exactly these events", () => {
    expect(Object.keys(roomDescribers)).toEqual([
      "controlMessage",
      "roomUser",
      "perception",
      "rankUpdate",
      "rankText",
      "pollMessage",
      "oecLiveShopping",
    ]);
  });

  it("names the control actions it knows, with the tips", () => {
    expect(roomDescribers.controlMessage({ action: 1, tips: "" })).toBe(
      "paused",
    );
    expect(roomDescribers.controlMessage({ action: 2, tips: "" })).toBe(
      "resumed",
    );
    expect(roomDescribers.controlMessage({ action: 3, tips: "Bye" })).toBe(
      'ended: "Bye"',
    );
    expect(roomDescribers.controlMessage({ action: 4, tips: "" })).toBe(
      "suspended",
    );
    expect(roomDescribers.controlMessage({ action: 9, tips: "" })).toBe(
      "action 9",
    );
  });

  it("describes the viewer counts, with the top viewer when there is one", () => {
    expect(
      roomDescribers.roomUser({
        total: 1_500,
        totalUser: 4_500,
        ranks: [{ user: user("Cy"), score: 10, rank: 1 }],
      }),
    ).toBe("1,500 watching, 4,500 so far, top viewer Cy");
    expect(roomDescribers.roomUser({ total: 3, totalUser: 4, ranks: [] })).toBe(
      "3 watching, 4 so far",
    );
  });

  it("describes a violation notice by its title, scene and punishment", () => {
    expect(
      roomDescribers.perception({
        dialog: {
          iconType: 1,
          title: { key: "pm_violation", defaultPattern: "" },
          scene: 2,
        },
        punishInfo: PUNISH,
      }),
    ).toBe("pm_violation (scene 2), punished: ban_live");
    expect(roomDescribers.perception({})).toBe("(no title) (scene none)");
    expect(
      roomDescribers.perception({
        dialog: { iconType: 0, scene: 0 },
        punishInfo: { ...PUNISH, punishType: "" },
      }),
    ).toBe("(no title) (scene 0)");
  });

  it("describes the rank updates with their operation", () => {
    expect(
      roomDescribers.rankUpdate({
        updates: [
          { rankType: 0, ownRank: 3, currentScore: 1_500 },
          { rankType: 1, ownRank: 12, currentScore: 0 },
        ],
        opType: 1,
      }),
    ).toBe("added: type 0 #3 (1,500), type 1 #12 (0)");
    expect(roomDescribers.rankUpdate({ updates: [], opType: 3 })).toBe(
      "reloaded: no ranks",
    );
    expect(roomDescribers.rankUpdate({ updates: [], opType: 7 })).toBe(
      "op 7: no ranks",
    );
  });

  it("describes a rank notice by its key, scene, rank type and positions", () => {
    expect(
      roomDescribers.rankText({
        scene: 1,
        ownerIdxBefore: 4,
        ownerIdxAfter: 2,
        curUserId: "1",
        content: { key: "pm_rank_up", defaultPattern: "" },
        rankType: 0,
      }),
    ).toBe("pm_rank_up (scene 1, rank type 0, 4 to 2)");
    expect(
      roomDescribers.rankText({
        scene: 0,
        ownerIdxBefore: 0,
        ownerIdxAfter: 0,
        curUserId: "0",
        rankType: 16,
      }),
    ).toBe("(no key) (scene 0, rank type 16, 0 to 0)");
  });

  it("describes a poll's start, votes, end, and anything else", () => {
    const options = [
      { votes: 2, displayContent: "Yes", optionIdx: 1 },
      { votes: 1, displayContent: "No", optionIdx: 2 },
    ];
    const base = { messageType: 1, pollId: "7", pollKind: 0 };
    expect(
      roomDescribers.pollMessage({
        ...base,
        startContent: {
          startTime: "1",
          endTime: "2",
          optionList: options,
          title: "Pizza?",
          operator: user("Host"),
        },
      }),
    ).toBe('poll 7 by Host: "Pizza?", "Yes" 2, "No" 1');
    expect(
      roomDescribers.pollMessage({
        ...base,
        updateVotesContent: { optionList: options },
      }),
    ).toBe('poll 7 votes: "Yes" 2, "No" 1');
    expect(
      roomDescribers.pollMessage({
        ...base,
        endContent: { endType: 1, optionList: options },
      }),
    ).toBe('poll 7 ended by the host: "Yes" 2, "No" 1');
    expect(
      roomDescribers.pollMessage({
        ...base,
        endContent: { endType: 9, optionList: [] },
      }),
    ).toBe("poll 7 ended (type 9): no options");
    expect(roomDescribers.pollMessage({ ...base, messageType: 4 })).toBe(
      "poll 7 (message type 4)",
    );
  });

  it("describes a shopping event by its product", () => {
    expect(
      roomDescribers.oecLiveShopping({
        actionType: 1,
        liveProductNumber: 12,
        popProduct: {
          title: "Mug",
          price: "$9.99",
          imageUrl: "",
          productId: "9",
        },
      }),
    ).toBe('pinned "Mug" $9.99, 12 products');
    expect(
      roomDescribers.oecLiveShopping({
        actionType: 1,
        liveProductNumber: 1_200,
        productSnapShot: { productId: "9", title: "Mug" },
      }),
    ).toBe('product "Mug", 1,200 products');
    expect(
      roomDescribers.oecLiveShopping({ actionType: 3, liveProductNumber: 0 }),
    ).toBe("action 3, 0 products");
  });
});
