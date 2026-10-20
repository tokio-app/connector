import { describe, expect, it } from "vitest";
import { BattleGameplayMessageSchema } from "../codec/messages/link/battleGameplay.js";
import { LinkLayerMessageSchema } from "../codec/messages/link/linkLayer.js";
import { LinkMessageSchema } from "../codec/messages/link/linkMessage.js";
import { LinkMicArmiesSchema } from "../codec/messages/link/linkMicArmies.js";
import { LinkMicBattleSchema } from "../codec/messages/link/linkMicBattle.js";
import { LinkMicBattleNoticeSchema } from "../codec/messages/link/linkMicBattleNotice.js";
import { LinkMicBattlePunishFinishSchema } from "../codec/messages/link/linkMicBattlePunishFinish.js";
import { LinkMicBattleTaskSchema } from "../codec/messages/link/linkMicBattleTask.js";
import { LinkMicFanTicketMethodSchema } from "../codec/messages/link/linkMicFanTicketMethod.js";
import { LinkMicMethodSchema } from "../codec/messages/link/linkMicMethod.js";
import { LinkMicOpponentGiftsSchema } from "../codec/messages/link/linkMicOpponentGifts.js";
import { LinkStateMessageSchema } from "../codec/messages/link/linkState.js";
import {
  LinkMicBattleItemCardSchema,
  LinkMicLayoutStateMessageSchema,
} from "../codec/messages/link/tail.js";
import { dispatch } from "../dispatch.js";
import { LINK_EVENTS } from "./groups.js";
import { linkRoutes } from "./link.js";
import { encodeMessage } from "../../test/helpers/encoder.js";
import {
  fakeContext,
  message,
  names,
  payloads,
} from "../../test/helpers/dispatchContext.js";
import { SAMPLE_USER } from "../../test/helpers/samples.js";

const host = { roomId: "7100000000000000001", userId: "6900000000000000001" };
const guest = { roomId: "7100000000000000002", userId: "6900000000000000002" };

/** One row per route: every message of the group is a plain forward. */
const rows = [
  {
    method: "WebcastLinkMicBattle",
    event: "linkMicBattle",
    payload: encodeMessage(LinkMicBattleSchema, {
      battleId: "7300000000000000001",
      action: 4,
      battleResult: [{ key: "6900000000000000001", value: { score: 500 } }],
    }),
    expected: {
      battleId: "7300000000000000001",
      action: 4,
      battleResult: [
        {
          key: "6900000000000000001",
          value: { userId: "0", result: 0, score: 500, diamondScore: 0 },
        },
      ],
    },
  },
  {
    method: "WebcastLinkMicArmies",
    event: "linkMicArmies",
    payload: encodeMessage(LinkMicArmiesSchema, {
      battleId: "7300000000000000001",
      armies: [{ key: "6900000000000000001", value: { hostScore: 500 } }],
      triggerReason: 1,
    }),
    expected: {
      battleId: "7300000000000000001",
      armies: [
        {
          key: "6900000000000000001",
          value: { userArmies: [], hostScore: 500 },
        },
      ],
      triggerReason: 1,
    },
  },
  {
    method: "WebcastLinkMicBattlePunishFinish",
    event: "linkMicBattlePunishFinish",
    payload: encodeMessage(LinkMicBattlePunishFinishSchema, {
      battleId: "7300000000000000001",
      reason: 1,
    }),
    expected: { battleId: "7300000000000000001", reason: 1 },
  },
  {
    method: "WebcastLinkmicBattleTaskMessage",
    event: "linkMicBattleTask",
    payload: encodeMessage(LinkMicBattleTaskSchema, {
      taskMessageType: 1,
      taskUpdate: { progress: 10 },
    }),
    expected: { taskMessageType: 1, taskUpdate: { progress: 10 } },
  },
  {
    method: "WebcastLinkMicFanTicketMethod",
    event: "linkMicFanTicketMethod",
    payload: encodeMessage(LinkMicFanTicketMethodSchema, {
      fanTicketRoomNotice: { totalLinkmicFanTicket: 100 },
    }),
    expected: { fanTicketRoomNotice: { totalLinkmicFanTicket: 100 } },
  },
  {
    method: "WebcastLinkMicMethod",
    event: "linkMicMethod",
    payload: encodeMessage(LinkMicMethodSchema, {
      messageType: 4,
      linkedUsers: [SAMPLE_USER],
    }),
    expected: { messageType: 4, linkedUsers: [SAMPLE_USER] },
  },
  {
    method: "WebcastLinkMessage",
    event: "linkMessage",
    payload: encodeMessage(LinkMessageSchema, {
      messageType: 1,
      inviteContent: { fromUser: SAMPLE_USER },
    }),
    expected: { messageType: 1, inviteContent: { fromUser: SAMPLE_USER } },
  },
  {
    method: "WebcastLinkLayerMessage",
    event: "linkLayer",
    payload: encodeMessage(LinkLayerMessageSchema, {
      messageType: 2,
      inviteContent: { invitor: host, invitee: guest },
    }),
    expected: {
      messageType: 2,
      inviteContent: { invitor: host, invitee: guest },
    },
  },
  {
    method: "WebcastLinkStateMessage",
    event: "linkState",
    payload: encodeMessage(LinkStateMessageSchema, {
      stateType: 3,
      userStates: [{ user: host, audioMuted: 2 }],
    }),
    expected: { stateType: 3, userStates: [{ user: host, audioMuted: 2 }] },
  },
  {
    method: "WebcastLinkMicBattleItemCard",
    event: "linkMicBattleItemCard",
    payload: encodeMessage(LinkMicBattleItemCardSchema, {
      battleId: "7300000000000000001",
      msgType: 2,
    }),
    expected: { battleId: "7300000000000000001", msgType: 2 },
  },
  {
    method: "WebcastLinkMicLayoutStateMessage",
    event: "linkMicLayoutState",
    payload: encodeMessage(LinkMicLayoutStateMessageSchema, {
      channelId: "7200000000000000001",
      version: 3,
    }),
    expected: { channelId: "7200000000000000001", version: 3 },
  },
  {
    method: "WebcastLinkmicBattleNoticeMessage",
    event: "linkMicBattleNotice",
    payload: encodeMessage(LinkMicBattleNoticeSchema, {
      noticeType: 6,
      commonGuide: { displayText: { key: "pm_mt_notice" }, exceptAnchor: true },
    }),
    expected: {
      noticeType: 6,
      commonGuide: {
        displayText: { key: "pm_mt_notice", defaultPattern: "" },
        exceptAnchor: true,
      },
    },
  },
  {
    method: "WebcastLinkMicOpponentGifts",
    event: "linkMicOpponentGifts",
    payload: encodeMessage(LinkMicOpponentGiftsSchema, {
      battleId: "7300000000000000001",
      giftToUserId: "6900000000000000002",
      giftId: "5655",
      repeatCount: 3,
    }),
    expected: {
      battleId: "7300000000000000001",
      giftToUserId: "6900000000000000002",
      giftId: "5655",
      repeatCount: 3,
    },
  },
  {
    method: "WebcastBattleGameplayMessage",
    event: "battleGameplay",
    payload: encodeMessage(BattleGameplayMessageSchema, {
      battleId: "7300000000000000001",
      iceShowdownInfo: { settingType: 2 },
    }),
    expected: {
      battleId: "7300000000000000001",
      iceShowdownInfo: { settingType: 2, promptTimeMs: "0", startTimeMs: "0" },
    },
  },
] as const;

describe("linkRoutes", () => {
  it("routes the link group's messages to the events they can lead to", () => {
    expect(
      Object.fromEntries(
        Object.entries(linkRoutes).map(([method, route]) => [
          method,
          route.events,
        ]),
      ),
    ).toEqual({
      WebcastLinkMicBattle: ["linkMicBattle"],
      WebcastLinkMicArmies: ["linkMicArmies"],
      WebcastLinkMicBattlePunishFinish: ["linkMicBattlePunishFinish"],
      WebcastLinkmicBattleTaskMessage: ["linkMicBattleTask"],
      WebcastLinkMicFanTicketMethod: ["linkMicFanTicketMethod"],
      WebcastLinkMicMethod: ["linkMicMethod"],
      WebcastLinkMessage: ["linkMessage"],
      WebcastLinkLayerMessage: ["linkLayer"],
      WebcastLinkStateMessage: ["linkState"],
      WebcastLinkMicBattleItemCard: ["linkMicBattleItemCard"],
      WebcastLinkMicLayoutStateMessage: ["linkMicLayoutState"],
      WebcastLinkmicBattleNoticeMessage: ["linkMicBattleNotice"],
      WebcastLinkMicOpponentGifts: ["linkMicOpponentGifts"],
      WebcastBattleGameplayMessage: ["battleGameplay"],
    });
  });

  it("emits only the events a route lists", () => {
    const samples = [
      ...rows.map(({ method, payload }) => message(method, payload)),
      ...Object.keys(linkRoutes).map((method) => message(method)),
    ];
    for (const msg of samples) {
      const route = linkRoutes[msg.method]!;
      const { context, emitted, ended, errors } = fakeContext({
        listen: route.events,
      });
      dispatch(context, msg);
      expect(names(emitted)).toEqual(route.events);
      expect(ended).toEqual([]);
      expect(errors).toEqual([]);
    }
  });

  describe.each(rows)("$method", ({ method, event, payload, expected }) => {
    it(`is always a ${event}`, () => {
      const { context, emitted } = fakeContext({ listen: [event] });
      dispatch(context, message(method, payload));
      expect(names(emitted)).toEqual([event]);
      expect(payloads(emitted, event)[0]).toMatchObject(expected);
    });

    it(`isn't decoded without a ${event} listener`, () => {
      const { context, emitted } = fakeContext({ listen: ["raw"] });
      dispatch(context, message(method, payload));
      expect(names(emitted)).toEqual(["raw"]);
    });
  });

  it("lists every event of LINK_EVENTS", () => {
    const events = Object.values(linkRoutes).flatMap((route) => route.events);
    expect(new Set(events)).toEqual(new Set(LINK_EVENTS));
    expect(events).toHaveLength(LINK_EVENTS.length);
  });
});
