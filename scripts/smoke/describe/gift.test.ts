import { describe, expect, it } from "vitest";
import type { GiftMessage, User } from "../../../src/index.js";
import { giftDescribers } from "./gift.js";

function user(nickname: string): User {
  return { userId: "1", nickname, displayId: "handle", badgeList: [] };
}

function gift(overrides: Partial<GiftMessage> = {}): GiftMessage {
  return {
    user: user("Ben"),
    giftId: "5655",
    repeatCount: 3,
    repeatEnd: false,
    comboCount: 3,
    groupId: "1",
    gift: {
      id: "5655",
      name: "Rose",
      diamondCount: 1,
      type: 1,
      describe: "",
      combo: false,
    },
    ...overrides,
  };
}

describe("giftDescribers", () => {
  it("describes exactly these events", () => {
    expect(Object.keys(giftDescribers)).toEqual([
      "gift",
      "member",
      "envelope",
      "superFan",
      "superFanJoin",
      "superFanBox",
    ]);
  });

  it("describes a gift, its streak and a gift without a name", () => {
    expect(giftDescribers.gift(gift())).toBe("Ben sent Rose x3, streak");
    expect(giftDescribers.gift(gift({ repeatEnd: true }))).toBe(
      "Ben sent Rose x3, streak end",
    );
    expect(
      giftDescribers.gift(
        gift({
          gift: {
            id: "1",
            name: "",
            diamondCount: 99,
            type: 2,
            describe: "",
            combo: false,
          },
        }),
      ),
    ).toBe("Ben sent gift 5655 x3");
    expect(giftDescribers.gift(gift({ gift: undefined }))).toBe(
      "Ben sent gift 5655 x3",
    );
  });

  it("names the member actions it knows", () => {
    expect(giftDescribers.member({ user: user("Gus"), actionId: 1 })).toBe(
      "Gus joined",
    );
    expect(giftDescribers.member({ user: user("Ivy"), actionId: 3 })).toBe(
      "Ivy subscribed",
    );
    expect(giftDescribers.member({ user: user("Ivy"), actionId: 9 })).toBe(
      "Ivy (action 9)",
    );
  });

  it("describes chests and super fan banners", () => {
    expect(giftDescribers.envelope({ envelopeInfo: { businessType: 1 } })).toBe(
      "treasure chest, business type 1",
    );
    expect(giftDescribers.superFanBox({})).toBe(
      "super fan box, business type unknown",
    );
    expect(
      giftDescribers.superFan({
        user: user("Hal"),
        content: { key: "ttlive_superfan_x", defaultPattern: "" },
      }),
    ).toBe("Hal (ttlive_superfan_x)");
    expect(
      giftDescribers.superFanJoin({
        commonBarrageContent: { key: "ttlive_superfan_y", defaultPattern: "" },
      }),
    ).toBe("(no nickname) (ttlive_superfan_y)");
    expect(giftDescribers.superFanJoin({})).toBe("(no nickname) (no key)");
  });
});
