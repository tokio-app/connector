import { describe, expect, it } from "vitest";
import type {
  BattleUserArmy,
  LinkLayerMessage,
  LinkMessage,
  LinkMicArmies,
  LinkMicBattle,
  Player,
  User,
} from "../../../src/index.js";
import { linkDescribers } from "./link.js";

const user = (nickname: string): User => ({
  userId: "1",
  nickname,
  displayId: "handle",
  badgeList: [],
});

const player = (userId: string): Player => ({ roomId: "7", userId });

const army = (nickname: string, score: number): BattleUserArmy => ({
  userId: "1",
  nickname,
  score,
  diamondScore: 0,
});

function battle(overrides: Partial<LinkMicBattle> = {}): LinkMicBattle {
  return {
    battleId: "73",
    action: 4,
    battleResult: [],
    armies: [],
    anchorsInfo: [],
    teamMember: [],
    actionByUserId: "0",
    teamBattleResult: [],
    ...overrides,
  };
}

function armies(overrides: Partial<LinkMicArmies> = {}): LinkMicArmies {
  return {
    battleId: "73",
    armies: [],
    triggerReason: 1,
    fromUserId: "0",
    giftId: "0",
    giftCount: 0,
    totalDiamondCount: 0,
    ...overrides,
  };
}

function link(overrides: Partial<LinkMessage> = {}): LinkMessage {
  return { messageType: 1, linkerId: "5", scene: 4, ...overrides };
}

function layer(overrides: Partial<LinkLayerMessage> = {}): LinkLayerMessage {
  return {
    messageType: 2,
    channelId: "72",
    scene: 4,
    linkerMode: 1,
    ...overrides,
  };
}

describe("linkDescribers", () => {
  it("describes exactly these events", () => {
    expect(Object.keys(linkDescribers)).toEqual([
      "linkMicBattle",
      "linkMicArmies",
      "linkMicBattlePunishFinish",
      "linkMicBattleTask",
      "linkMicFanTicketMethod",
      "linkMicMethod",
      "linkMessage",
      "linkLayer",
      "linkState",
      "linkMicBattleNotice",
      "linkMicOpponentGifts",
      "battleGameplay",
    ]);
  });

  it("describes a battle: its action, the hosts' names and their scores", () => {
    expect(linkDescribers.linkMicBattle(battle())).toBe("battle 73 started");
    expect(
      linkDescribers.linkMicBattle(
        battle({
          action: 5,
          anchorsInfo: [
            {
              key: "11",
              value: {
                user: {
                  userId: "11",
                  nickName: "Host One",
                  displayId: "",
                  roomId: "0",
                },
              },
            },
            { key: "22", value: {} },
            { key: "33" },
          ],
          battleResult: [
            {
              key: "22",
              value: { userId: "22", result: 0, score: 12345, diamondScore: 0 },
            },
            {
              key: "11",
              value: { userId: "11", result: 1, score: 500, diamondScore: 0 },
            },
            { key: "44" },
          ],
        }),
      ),
    ).toBe("battle 73 finished: Host One 500 vs 22 12,345 vs 33");
    expect(linkDescribers.linkMicBattle(battle({ action: 6 }))).toBe(
      "battle 73 cut short",
    );
    expect(linkDescribers.linkMicBattle(battle({ action: 9 }))).toBe(
      "battle 73 (action 9)",
    );
  });

  it("describes the scores: each host's score and top supporter", () => {
    expect(linkDescribers.linkMicArmies(armies())).toBe("battle 73: no scores");
    expect(
      linkDescribers.linkMicArmies(
        armies({
          triggerReason: 2,
          armies: [
            {
              key: "11",
              value: {
                hostScore: 1500,
                userArmies: [army("Ann", 300), army("Top", 1000), army("", 1)],
              },
            },
            { key: "22", value: { hostScore: 0, userArmies: [] } },
            { key: "33" },
          ],
        }),
      ),
    ).toBe(
      "battle 73 scores: 11 1,500 (top: Top 1,000), 22 0, 33 0, battle end",
    );
  });

  it("describes a punishment's end and a task", () => {
    const finish = { channelId: "72", opUid: "11", battleId: "73" };
    expect(
      linkDescribers.linkMicBattlePunishFinish({ ...finish, reason: 0 }),
    ).toBe("battle 73 punishment over, time up");
    expect(
      linkDescribers.linkMicBattlePunishFinish({ ...finish, reason: 1 }),
    ).toBe("battle 73 punishment over, cut short");
    expect(
      linkDescribers.linkMicBattlePunishFinish({ ...finish, reason: 7 }),
    ).toBe("battle 73 punishment over, (reason 7)");

    const task = (taskMessageType: number) => ({
      taskMessageType,
      battleId: "73",
    });
    expect(linkDescribers.linkMicBattleTask(task(0))).toBe(
      "battle 73 task started",
    );
    expect(
      linkDescribers.linkMicBattleTask({
        ...task(1),
        taskUpdate: { progress: 12345, fromUserId: "1" },
      }),
    ).toBe("battle 73 task progressed to 12,345");
    expect(linkDescribers.linkMicBattleTask(task(1))).toBe(
      "battle 73 task progressed to 0",
    );
    expect(
      linkDescribers.linkMicBattleTask({
        ...task(2),
        taskSettle: { result: 2 },
      }),
    ).toBe("battle 73 task settled: both succeeded");
    expect(linkDescribers.linkMicBattleTask(task(2))).toBe(
      "battle 73 task settled: succeeded",
    );
    expect(linkDescribers.linkMicBattleTask(task(3))).toBe(
      "battle 73 task reward settled",
    );
    expect(linkDescribers.linkMicBattleTask(task(9))).toBe(
      "battle 73 task (type 9)",
    );
  });

  it("describes fan tickets and the older link-mic signals", () => {
    expect(linkDescribers.linkMicFanTicketMethod({})).toBe(
      "fan tickets (no notice)",
    );
    expect(
      linkDescribers.linkMicFanTicketMethod({
        fanTicketRoomNotice: {
          userFanTicket: [{ userId: "1", fanTicket: 1000, matchRank: 1 }],
          totalLinkmicFanTicket: 1000,
        },
      }),
    ).toBe("fan tickets: 1,000 in total, 1 guest");
    expect(
      linkDescribers.linkMicFanTicketMethod({
        fanTicketRoomNotice: { userFanTicket: [], totalLinkmicFanTicket: 0 },
      }),
    ).toBe("fan tickets: 0 in total, 0 guests");

    const method = {
      messageType: 4,
      userId: "11",
      channelId: "72",
      inviteUid: "0",
      answer: 0,
      toUserId: "0",
      fromUserId: "0",
      rivalAnchorId: "0",
      linkedUsers: [],
      replyType: 0,
    };
    expect(linkDescribers.linkMicMethod(method)).toBe(
      "link-mic type 4, user 11",
    );
    expect(
      linkDescribers.linkMicMethod({
        ...method,
        linkedUsers: [user("Ann"), user("Bea")],
      }),
    ).toBe("link-mic type 4, user 11, 2 linked");
  });

  it("describes a multi-guest link message by the contents it carries", () => {
    expect(linkDescribers.linkMessage(link())).toBe(
      "link type 1 (5): no content",
    );
    expect(
      linkDescribers.linkMessage(
        link({
          inviteContent: { fromUserId: "11", fromUser: user("Ann") },
          replyContent: { replyStatus: 1, fromUser: user("Bea") },
          enterContent: {
            linkedUsers: [
              { linkStatus: 2, linkType: 1, userPosition: 0, roleType: 2 },
            ],
          },
          leaveContent: { userId: "22", leaveReason: 1 },
          kickOutContent: { fromUserId: "11", kickoutReason: 2 },
          linkedListChangeContent: { linkedUsers: [] },
          muteContent: { userId: "22", muteStatus: 0 },
          listChangeContent: {
            linkedUsers: [{ linkType: 1, roleType: 2 }],
            appliedUsers: [],
            connectingUsers: [{ linkType: 1, roleType: 4 }],
          },
          mediaChangeContent: { op: 2, toUserId: "22" },
        }),
      ),
    ).toBe(
      "link type 1 (5): invited by Ann; reply 1 from Bea; 1 entered; 22 left; kicked out by 11; 0 linked; 22 muted; 1 linked, 0 applied, 1 connecting; mic off for 22",
    );
    expect(
      linkDescribers.linkMessage(
        link({
          muteContent: { userId: "22", muteStatus: 1 },
          mediaChangeContent: { op: 9, toUserId: "22" },
        }),
      ),
    ).toBe("link type 1 (5): 22 unmuted; (op 9) for 22");
  });

  it("describes a link layer message by its type and the users it names", () => {
    expect(linkDescribers.linkLayer(layer())).toBe("link invite in channel 72");
    expect(
      linkDescribers.linkLayer(
        layer({
          messageType: 11,
          listChangeContent: {
            type: 1,
            list: {
              linkedList: [
                { user: player("11"), linkmicId: "l1", userType: 2 },
                { linkmicId: "", userType: 0 },
              ],
              appliedList: [{ linkmicId: "", userType: 0 }],
              invitedList: [],
              readyList: [],
            },
          },
        }),
      ),
    ).toBe(
      "link list change in channel 72: linked 11, ?, 1 applied, 0 invited",
    );
    expect(
      linkDescribers.linkLayer(
        layer({ messageType: 11, listChangeContent: { type: 1 } }),
      ),
    ).toBe("link list change in channel 72: linked none, 0 applied, 0 invited");
    expect(
      linkDescribers.linkLayer(
        layer({
          messageType: 17,
          inviteContent: { invitor: player("11"), invitee: player("22") },
          applyContent: { applier: player("33") },
          permitApplyContent: {
            permiter: player("11"),
            replyStatus: 1,
            applier: player("33"),
          },
          replyInviteContent: { invitee: player("22"), replyStatus: 2 },
          kickOutContent: { offliner: player("44"), kickoutReason: 2 },
          leaveContent: { leaver: player("22"), leaveReason: 1 },
          finishContent: { owner: player("11"), finishReason: 1 },
        }),
      ),
    ).toBe(
      "link p 2 p group change in channel 72: 11 invited 22; 33 applied; 11 agreed 33; 22 rejected; 44 kicked out (reason 2); 22 left; 11 finished",
    );
    expect(
      linkDescribers.linkLayer(
        layer({
          messageType: 99,
          inviteContent: {},
          permitApplyContent: { replyStatus: 0 },
        }),
      ),
    ).toBe("link (type 99) in channel 72: ? invited ?; ? replied 0 ?");
  });

  it("describes a link state by its type and the users it holds", () => {
    const state = { channelId: "72", scene: 4, stateType: 3 };
    expect(linkDescribers.linkState({ ...state, userStates: [] })).toBe(
      "link state audio mute in channel 72: no users",
    );
    expect(
      linkDescribers.linkState({
        ...state,
        stateType: 100,
        userStates: [
          {
            user: player("11"),
            linkmicId: "l1",
            onlineUserState: 1,
            audioMuted: 1,
            videoMuted: 1,
          },
          { linkmicId: "", onlineUserState: 0, audioMuted: 0, videoMuted: 0 },
        ],
      }),
    ).toBe("link state req batch change in channel 72: users 11, ?");
    expect(
      linkDescribers.linkState({ ...state, stateType: 42, userStates: [] }),
    ).toBe("link state (type 42) in channel 72: no users");
  });

  it("describes a battle notice by its type and text", () => {
    expect(
      linkDescribers.linkMicBattleNotice({
        noticeType: 6,
        commonGuide: {
          displayText: { key: "pm_mt_notice", defaultPattern: "A hammer hit" },
          exceptAnchor: true,
        },
      }),
    ).toBe('battle notice common guide: pm_mt_notice "A hammer hit"');
    expect(linkDescribers.linkMicBattleNotice({ noticeType: 1 })).toBe(
      "battle notice toast",
    );
    expect(linkDescribers.linkMicBattleNotice({ noticeType: 42 })).toBe(
      "battle notice (type 42)",
    );
  });

  it("describes a gift to another host: who, which gift, its price and the streak", () => {
    const gifts = {
      battleId: "73",
      channelId: "72",
      fromUserId: "101",
      giftToUserId: "22",
      giftId: "5655",
      giftCount: 1,
      giftPrice: 1,
      repeatCount: 1,
      sendGiftSuccessTime: "0",
      updateBattleScoreTime: "0",
    };
    expect(linkDescribers.linkMicOpponentGifts(gifts)).toBe(
      "battle 73: 101 sent gift 5655 x1 (1 coin each, streak 1) to 22",
    );
    expect(
      linkDescribers.linkMicOpponentGifts({
        ...gifts,
        giftCount: 3,
        giftPrice: 1_088,
        repeatCount: 12,
      }),
    ).toBe(
      "battle 73: 101 sent gift 5655 x3 (1,088 coins each, streak 12) to 22",
    );
  });

  it("describes a battle gameplay: the ice showdown's setting and lead", () => {
    expect(
      linkDescribers.battleGameplay({
        battleId: "73",
        iceShowdownInfo: {
          settingType: 2,
          promptTimeMs: "1760000000000",
          startTimeMs: "1760000005000",
        },
      }),
    ).toBe("battle 73 ice showdown, system, starts 5,000 ms after its prompt");
    expect(
      linkDescribers.battleGameplay({
        battleId: "73",
        iceShowdownInfo: {
          settingType: 9,
          promptTimeMs: "0",
          startTimeMs: "0",
        },
      }),
    ).toBe("battle 73 ice showdown, (setting 9), starts 0 ms after its prompt");
    expect(linkDescribers.battleGameplay({ battleId: "73" })).toBe(
      "battle 73 gameplay",
    );
  });
});
