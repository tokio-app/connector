import { describe, expect, it } from "vitest";
import type {
  BarrageMessage,
  EnvelopeInfo,
  GiftMessage,
  MemberMessage,
  RoomNotifyMessage,
  SubNotifyMessage,
  User,
} from "../../../src/index.js";
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
    isFirstSent: false,
    toMemberId: "",
    toMemberNickname: "",
    ...overrides,
  };
}

function member(nickname: string, actionId: number): MemberMessage {
  return {
    user: user(nickname),
    memberCount: 0,
    isSetToAdmin: false,
    isTopUser: false,
    topUserNo: 0,
    actionId,
    userShareType: "",
    kickSource: 0,
  };
}

function envelopeInfo(businessType: number): EnvelopeInfo {
  return {
    envelopeId: "1",
    businessType,
    sendUserName: "",
    diamondCount: 0,
    peopleCount: 0,
    unpackAt: 0,
    sendUserId: "",
    superFanCount: 0,
  };
}

function barrage(overrides: Partial<BarrageMessage> = {}): BarrageMessage {
  return { msgType: 0, ...overrides };
}

function subNotify(
  overrides: Partial<SubNotifyMessage> = {},
): SubNotifyMessage {
  return {
    user: user("Kim"),
    exhibitionType: 0,
    subMonth: 1,
    subscribeType: 0,
    oldSubscribeStatus: 0,
    messageType: 0,
    subscribingStatus: 0,
    isSend: false,
    giftSource: 0,
    ...overrides,
  };
}

function roomNotify(
  overrides: Partial<RoomNotifyMessage> = {},
): RoomNotifyMessage {
  return {
    notifyType: 5,
    content: "Nick sent a Lion",
    fromUserId: "7",
    toAnchorId: "8",
    ...overrides,
  };
}

describe("giftDescribers", () => {
  it("describes exactly these events", () => {
    expect(Object.keys(giftDescribers)).toEqual([
      "gift",
      "member",
      "subNotify",
      "subPinEvent",
      "barrage",
      "envelope",
      "superFan",
      "superFanJoin",
      "superFanBox",
      "giftBroadcast",
      "roomNotify",
      "goalUpdate",
      "viewerPicksUpdate",
      "hourlyRank",
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
    expect(giftDescribers.member(member("Gus", 1))).toBe("Gus joined");
    expect(giftDescribers.member(member("Ivy", 3))).toBe("Ivy subscribed");
    expect(giftDescribers.member(member("Ivy", 9))).toBe("Ivy (action 9)");
  });

  it("describes subscriptions and pinned cards", () => {
    expect(giftDescribers.subNotify(subNotify())).toBe(
      "Kim subscribed, month 1 (type 0)",
    );
    expect(
      giftDescribers.subNotify(
        subNotify({ subMonth: 12, isSend: true, messageType: 9 }),
      ),
    ).toBe("Kim subscribed, month 12, gifted (type 9)");
    expect(
      giftDescribers.subPinEvent({
        actionType: 1,
        card: { title: { type: 1, content: "Sub goal" }, type: 2 },
        operatorUserId: "1",
      }),
    ).toBe('card pinned: "Sub goal"');
    expect(
      giftDescribers.subPinEvent({ actionType: 2, operatorUserId: "1" }),
    ).toBe("card unpinned");
    expect(
      giftDescribers.subPinEvent({
        actionType: 7,
        card: { title: { type: 1, content: "" }, type: 0 },
        operatorUserId: "1",
      }),
    ).toBe("card action 7");
  });

  it("describes chests and banners", () => {
    expect(giftDescribers.envelope({ envelopeInfo: envelopeInfo(1) })).toBe(
      "treasure chest, business type 1",
    );
    expect(giftDescribers.superFanBox({})).toBe(
      "super fan box, business type unknown",
    );
    expect(
      giftDescribers.superFan(
        barrage({
          user: user("Hal"),
          content: { key: "ttlive_superfan_x", defaultPattern: "" },
        }),
      ),
    ).toBe("Hal (ttlive_superfan_x)");
    expect(
      giftDescribers.superFanJoin(
        barrage({
          commonBarrageContent: {
            key: "ttlive_superfan_y",
            defaultPattern: "",
          },
        }),
      ),
    ).toBe("(no nickname) (ttlive_superfan_y)");
    expect(giftDescribers.superFanJoin(barrage())).toBe(
      "(no nickname) (no key)",
    );
    expect(
      giftDescribers.barrage(
        barrage({
          user: user("Hal"),
          msgType: 8,
          content: { key: "pm_mt_grade_up", defaultPattern: "" },
        }),
      ),
    ).toBe("Hal (pm_mt_grade_up), type 8");
  });

  it("describes room notices and gift broadcasts", () => {
    expect(giftDescribers.roomNotify(roomNotify())).toBe(
      '"Nick sent a Lion" (type 5)',
    );
    expect(giftDescribers.roomNotify(roomNotify({ user: user("Nick") }))).toBe(
      'Nick: "Nick sent a Lion" (type 5)',
    );
    expect(
      giftDescribers.giftBroadcast({ fromUserId: "7", notify: roomNotify() }),
    ).toBe('"Nick sent a Lion" (type 5)');
    expect(giftDescribers.giftBroadcast({ fromUserId: "7" })).toBe(
      "from user 7",
    );
  });

  it("describes goals, viewer picks and hourly rank rewards", () => {
    const update = {
      contributorId: "1",
      contributorDisplayId: "nick",
      contributeCount: 1,
      contributeScore: 1,
      updateSource: 2,
    };
    expect(giftDescribers.goalUpdate(update)).toBe("goal update, source 2");
    expect(
      giftDescribers.goalUpdate({
        ...update,
        goal: {
          id: "9",
          type: 1,
          status: 1,
          subGoals: [
            { progress: 1_000, target: 5_000 },
            { progress: 1, target: 2 },
          ],
          description: "New mic",
        },
      }),
    ).toBe('"New mic" 1,000/5,000, 1/2 (source 2)');
    expect(
      giftDescribers.goalUpdate({
        ...update,
        goal: { id: "9", type: 1, status: 1, subGoals: [], description: "" },
      }),
    ).toBe('"" no steps (source 2)');
    expect(giftDescribers.viewerPicksUpdate({ updateType: 1 })).toBe(
      "viewer picks ?, 0 picks (update type 1)",
    );
    expect(
      giftDescribers.viewerPicksUpdate({
        updateType: 2,
        info: {
          viewerPicksId: "77",
          giftPickList: [{ score: 1 }, { score: 2 }],
          status: 1,
        },
      }),
    ).toBe("viewer picks 77, 2 picks (update type 2)");
    expect(giftDescribers.hourlyRank({ winners: [] })).toBe("0 winners: none");
    expect(
      giftDescribers.hourlyRank({
        winners: [
          { userId: "1", assetId: "9" },
          { userId: "2", assetId: "9" },
        ],
      }),
    ).toBe("2 winners: 1, 2");
  });
});
