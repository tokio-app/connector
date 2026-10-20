import { describe, expect, it } from "vitest";
import { BarrageMessageSchema } from "../codec/messages/gift/barrage.js";
import { EnvelopeMessageSchema } from "../codec/messages/gift/envelope.js";
import { GiftMessageSchema } from "../codec/messages/gift/gift.js";
import { GiftBroadcastMessageSchema } from "../codec/messages/gift/giftBroadcast.js";
import { GoalUpdateMessageSchema } from "../codec/messages/gift/goalUpdate.js";
import { HourlyRankRewardMessageSchema } from "../codec/messages/gift/hourlyRank.js";
import { MemberMessageSchema } from "../codec/messages/gift/member.js";
import { RoomNotifyMessageSchema } from "../codec/messages/gift/roomNotify.js";
import { SubNotifyMessageSchema } from "../codec/messages/gift/subNotify.js";
import { SubPinEventMessageSchema } from "../codec/messages/gift/subPinEvent.js";
import {
  BoostCardMessageSchema,
  GiftDynamicRestrictionMessageSchema,
  GiftPanelUpdateMessageSchema,
  GiftPromptMessageSchema,
  GuideMessageSchema,
} from "../codec/messages/gift/tail.js";
import { ViewerPicksUpdateMessageSchema } from "../codec/messages/gift/viewerPicks.js";
import { dispatch } from "../dispatch.js";
import type { EnvelopeMessage } from "../events/index.js";
import { giftRoutes } from "./gift.js";
import { GIFT_EVENTS } from "./groups.js";
import { encodeMessage, type EncodeInput } from "../../test/helpers/encoder.js";
import {
  encoded,
  fakeContext,
  message,
  names,
  payloads,
} from "../../test/helpers/dispatchContext.js";
import { SAMPLE_USER, sampleCommon } from "../../test/helpers/samples.js";

const envelope = (value: EncodeInput<EnvelopeMessage>) =>
  encoded("WebcastEnvelopeMessage", EnvelopeMessageSchema, value);

/** A banner with these content and common barrage content keys (left out when undefined). */
const barrage = (contentKey?: string, commonKey?: string) =>
  encoded("WebcastBarrageMessage", BarrageMessageSchema, {
    content: contentKey === undefined ? undefined : { key: contentKey },
    commonBarrageContent:
      commonKey === undefined ? undefined : { key: commonKey },
    user: SAMPLE_USER,
  });

const NOTIFY = {
  common: sampleCommon("WebcastRoomNotifyMessage"),
  notifyType: 5,
  content: "A big gift",
  user: SAMPLE_USER,
  fromUserId: "6900000000000000001",
};

describe("giftRoutes", () => {
  it("routes the gift group's messages to the events they can lead to", () => {
    expect(
      Object.fromEntries(
        Object.entries(giftRoutes).map(([method, route]) => [
          method,
          route.events,
        ]),
      ),
    ).toEqual({
      WebcastGiftMessage: ["gift"],
      WebcastMemberMessage: ["member"],
      WebcastEnvelopeMessage: ["superFanBox", "envelope"],
      WebcastBarrageMessage: ["barrage", "superFanJoin", "superFan"],
      WebcastSubNotifyMessage: ["subNotify"],
      WebcastSubPinEventMessage: ["subPinEvent"],
      WebcastGiftBroadcastMessage: ["giftBroadcast"],
      WebcastRoomNotifyMessage: ["roomNotify"],
      WebcastGoalUpdateMessage: ["goalUpdate"],
      WebcastViewerPicksUpdateMessage: ["viewerPicksUpdate"],
      WebcastHourlyRankRewardMessage: ["hourlyRank"],
      WebcastGiftPromptMessage: ["giftPrompt"],
      WebcastGiftPanelUpdateMessage: ["giftPanelUpdate"],
      WebcastGiftDynamicRestrictionMessage: ["giftDynamicRestriction"],
      WebcastGuideMessage: ["guide"],
      WebcastBoostCardMessage: ["boostCard"],
    });
  });

  it("lists every event of GIFT_EVENTS", () => {
    const events = Object.values(giftRoutes).flatMap((route) => route.events);
    expect(new Set(events)).toEqual(new Set(GIFT_EVENTS));
  });

  it("emits only the events a route lists", () => {
    const samples = [
      encoded("WebcastGiftMessage", GiftMessageSchema, { giftId: "5655" }),
      encoded("WebcastMemberMessage", MemberMessageSchema, { actionId: 1 }),
      envelope({}),
      envelope({ envelopeInfo: { businessType: 19 } }),
      barrage("ttlive_superfan_commentnotif_superfanjoined"),
      barrage("ttlive_superfan"),
      barrage("other"),
      encoded("WebcastSubNotifyMessage", SubNotifyMessageSchema, {
        user: SAMPLE_USER,
      }),
      encoded("WebcastSubPinEventMessage", SubPinEventMessageSchema, {
        actionType: 1,
      }),
      encoded("WebcastGiftBroadcastMessage", GiftBroadcastMessageSchema, {
        notify: NOTIFY,
      }),
      encoded("WebcastRoomNotifyMessage", RoomNotifyMessageSchema, NOTIFY),
      encoded("WebcastGoalUpdateMessage", GoalUpdateMessageSchema, {
        updateSource: 2,
      }),
      encoded(
        "WebcastViewerPicksUpdateMessage",
        ViewerPicksUpdateMessageSchema,
        { updateType: 1 },
      ),
      encoded("WebcastHourlyRankRewardMessage", HourlyRankRewardMessageSchema, {
        winners: [{ userId: "1", notify: NOTIFY }],
      }),
      encoded("WebcastGiftPromptMessage", GiftPromptMessageSchema, {
        title: "t",
      }),
      encoded("WebcastGiftPanelUpdateMessage", GiftPanelUpdateMessageSchema, {
        roomId: "1",
      }),
      encoded(
        "WebcastGiftDynamicRestrictionMessage",
        GiftDynamicRestrictionMessageSchema,
        {},
      ),
      encoded("WebcastGuideMessage", GuideMessageSchema, { giftId: "5655" }),
      encoded("WebcastBoostCardMessage", BoostCardMessageSchema, {
        cards: [{ cardId: "1" }],
      }),
    ];
    expect(new Set(samples.map((msg) => msg.method))).toEqual(
      new Set(Object.keys(giftRoutes)),
    );
    for (const msg of samples) {
      const route = giftRoutes[msg.method]!;
      const { context, emitted, ended } = fakeContext({ listen: route.events });
      dispatch(context, msg);
      for (const event of names(emitted)) expect(route.events).toContain(event);
      expect(ended).toEqual([]);
    }
  });

  describe.each([
    {
      method: "WebcastGiftMessage",
      event: "gift",
      payload: encodeMessage(GiftMessageSchema, {
        user: SAMPLE_USER,
        giftId: "5655",
        repeatCount: 2,
        gift: { id: "5655", name: "Rose", type: 1 },
      }),
      expected: {
        user: SAMPLE_USER,
        giftId: "5655",
        repeatCount: 2,
        repeatEnd: false,
        gift: { id: "5655", name: "Rose", type: 1, diamondCount: 0 },
      },
    },
    {
      method: "WebcastMemberMessage",
      event: "member",
      payload: encodeMessage(MemberMessageSchema, {
        user: SAMPLE_USER,
        actionId: 1,
      }),
      expected: { user: SAMPLE_USER, actionId: 1 },
    },
    {
      method: "WebcastMemberMessage",
      event: "member",
      payload: encodeMessage(MemberMessageSchema, { actionId: 3 }),
      expected: { actionId: 3 },
    },
    {
      method: "WebcastMemberMessage",
      event: "member",
      payload: new Uint8Array(0),
      expected: { actionId: 0 },
    },
    {
      method: "WebcastSubNotifyMessage",
      event: "subNotify",
      payload: encodeMessage(SubNotifyMessageSchema, {
        user: SAMPLE_USER,
        subMonth: 3,
        messageType: 0,
      }),
      expected: { user: SAMPLE_USER, subMonth: 3, messageType: 0 },
    },
    {
      method: "WebcastSubPinEventMessage",
      event: "subPinEvent",
      payload: encodeMessage(SubPinEventMessageSchema, {
        actionType: 1,
        card: { type: 2, goalPinCard: { goalId: "9", target: 10 } },
      }),
      expected: {
        actionType: 1,
        card: { type: 2, goalPinCard: { goalId: "9", target: 10 } },
      },
    },
    {
      method: "WebcastGiftBroadcastMessage",
      event: "giftBroadcast",
      payload: encodeMessage(GiftBroadcastMessageSchema, {
        fromUserId: "6900000000000000001",
        notify: NOTIFY,
      }),
      expected: { fromUserId: "6900000000000000001", notify: NOTIFY },
    },
    {
      method: "WebcastRoomNotifyMessage",
      event: "roomNotify",
      payload: encodeMessage(RoomNotifyMessageSchema, NOTIFY),
      expected: NOTIFY,
    },
    {
      method: "WebcastGoalUpdateMessage",
      event: "goalUpdate",
      payload: encodeMessage(GoalUpdateMessageSchema, {
        goal: { id: "7", description: "Goal" },
        contributorDisplayId: "nick.name",
        updateSource: 2,
      }),
      expected: {
        goal: { id: "7", description: "Goal" },
        contributorDisplayId: "nick.name",
        updateSource: 2,
      },
    },
    {
      method: "WebcastViewerPicksUpdateMessage",
      event: "viewerPicksUpdate",
      payload: encodeMessage(ViewerPicksUpdateMessageSchema, {
        updateType: 1,
        info: { viewerPicksId: "9", status: 1 },
      }),
      expected: { updateType: 1, info: { viewerPicksId: "9", status: 1 } },
    },
    {
      method: "WebcastHourlyRankRewardMessage",
      event: "hourlyRank",
      payload: encodeMessage(HourlyRankRewardMessageSchema, {
        winners: [{ userId: "1", assetId: "2" }],
      }),
      expected: { winners: [{ userId: "1", assetId: "2" }] },
    },
    {
      method: "WebcastGiftPromptMessage",
      event: "giftPrompt",
      payload: encodeMessage(GiftPromptMessageSchema, {
        title: "Take a break",
        blockNumDays: 1,
      }),
      expected: { title: "Take a break", blockNumDays: 1 },
    },
    {
      method: "WebcastGiftPanelUpdateMessage",
      event: "giftPanelUpdate",
      payload: encodeMessage(GiftPanelUpdateMessageSchema, { roomId: "7" }),
      expected: { roomId: "7" },
    },
    {
      method: "WebcastGiftDynamicRestrictionMessage",
      event: "giftDynamicRestriction",
      payload: encodeMessage(GiftDynamicRestrictionMessageSchema, {
        common: sampleCommon("WebcastGiftDynamicRestrictionMessage"),
      }),
      expected: {
        common: { method: "WebcastGiftDynamicRestrictionMessage" },
      },
    },
    {
      method: "WebcastGuideMessage",
      event: "guide",
      payload: encodeMessage(GuideMessageSchema, {
        giftId: "5655",
        description: "Send a Rose",
      }),
      expected: { giftId: "5655", description: "Send a Rose" },
    },
    {
      method: "WebcastBoostCardMessage",
      event: "boostCard",
      payload: encodeMessage(BoostCardMessageSchema, {
        cards: [{ cardId: "1", taskSource: 2 }],
      }),
      expected: { cards: [{ cardId: "1", taskSource: 2 }] },
    },
  ] as const)("$method", ({ method, event, payload, expected }) => {
    it(`is always a ${event}`, () => {
      const { context, emitted } = fakeContext({ listen: [event] });
      dispatch(context, message(method, payload));
      expect(names(emitted)).toEqual([event]);
      expect(payloads(emitted, event)[0]).toMatchObject(expected);
    });
  });

  describe("WebcastEnvelopeMessage", () => {
    const route = (value: EncodeInput<EnvelopeMessage>) => {
      const { context, emitted } = fakeContext({
        listen: ["envelope", "superFanBox"],
      });
      dispatch(context, envelope(value));
      return emitted;
    };

    it("is an envelope, whatever it holds", () => {
      expect(names(route({}))).toEqual(["envelope"]);
      expect(
        names(
          route({
            common: { displayText: { key: "pm_mt_envelope_sent" } },
            envelopeInfo: { businessType: 1 },
          }),
        ),
      ).toEqual(["envelope"]);
      const emitted = route({ common: { method: "WebcastEnvelopeMessage" } });
      expect(names(emitted)).toEqual(["envelope"]);
      expect(payloads(emitted, "envelope")[0]).toMatchObject({
        common: { method: "WebcastEnvelopeMessage" },
      });
    });

    it("is a super fan box first when its key has ttlive_superfanbox, in any case", () => {
      const emitted = route({
        common: { displayText: { key: "TTLIVE_SuperFanBox_Sent" } },
      });
      expect(names(emitted)).toEqual(["superFanBox", "envelope"]);
      // Both events get the same message.
      expect(emitted[0]?.[1]).toBe(emitted[1]?.[1]);
    });

    it("is a super fan box when its business type is 19", () => {
      expect(names(route({ envelopeInfo: { businessType: 19 } }))).toEqual([
        "superFanBox",
        "envelope",
      ]);
    });

    it("is a super fan box once when both say so", () => {
      const emitted = route({
        common: { displayText: { key: "ttlive_superfanbox" } },
        envelopeInfo: { businessType: 19 },
      });
      expect(names(emitted)).toEqual(["superFanBox", "envelope"]);
    });

    it("is decoded with a listener on superFanBox alone", () => {
      // The route emits both events; the connection's emitter drops the
      // ones nobody listens to.
      const { context, emitted } = fakeContext({ listen: ["superFanBox"] });
      dispatch(context, envelope({ envelopeInfo: { businessType: 1 } }));
      dispatch(context, envelope({ envelopeInfo: { businessType: 19 } }));
      expect(names(emitted)).toEqual(["envelope", "superFanBox", "envelope"]);
    });
  });

  describe("WebcastBarrageMessage", () => {
    const route = (contentKey?: string, commonKey?: string) => {
      const { context, emitted } = fakeContext({
        listen: ["barrage", "superFan", "superFanJoin"],
      });
      dispatch(context, barrage(contentKey, commonKey));
      return emitted;
    };

    it("is a barrage, whatever its keys", () => {
      expect(names(route())).toEqual(["barrage"]);
      expect(names(route("", ""))).toEqual(["barrage"]);
      const emitted = route("pm_mt_gift_gallery", "ttlive_superfa");
      expect(names(emitted)).toEqual(["barrage"]);
      expect(payloads(emitted, "barrage")[0]).toMatchObject({
        content: { key: "pm_mt_gift_gallery" },
        commonBarrageContent: { key: "ttlive_superfa" },
        user: SAMPLE_USER,
      });
    });

    it("is a super fan join after the barrage when a key has the joined key, in any case", () => {
      const emitted = route("ttlive_superfan_commentnotif_superfanjoined");
      expect(names(emitted)).toEqual(["barrage", "superFanJoin"]);
      expect(payloads(emitted, "superFanJoin")[0]).toMatchObject({
        content: { key: "ttlive_superfan_commentnotif_superfanjoined" },
        user: SAMPLE_USER,
      });
      // Both events get the same message.
      expect(emitted[0]?.[1]).toBe(emitted[1]?.[1]);
      expect(
        names(route(undefined, "TTLIVE_SuperFan_CommentNotif_SuperFanJoined")),
      ).toEqual(["barrage", "superFanJoin"]);
      // The joined key wins over a super fan key in the other text.
      expect(
        names(
          route(
            "ttlive_superfan_banner",
            "ttlive_superfan_commentnotif_superfanjoined_v2",
          ),
        ),
      ).toEqual(["barrage", "superFanJoin"]);
    });

    it("is a super fan banner after the barrage when a key has ttlive_superfan, in any case", () => {
      expect(names(route("ttlive_superfan_banner"))).toEqual([
        "barrage",
        "superFan",
      ]);
      expect(names(route("pm_mt_gift", "TTLIVE_SUPERFAN"))).toEqual([
        "barrage",
        "superFan",
      ]);
    });

    it("is decoded with a listener on superFan alone, and is still a barrage first", () => {
      const { context, emitted } = fakeContext({ listen: ["superFan"] });
      dispatch(context, barrage("pm_mt_other"));
      dispatch(context, barrage("ttlive_superfan_banner"));
      expect(names(emitted)).toEqual(["barrage", "barrage", "superFan"]);
    });
  });

  describe("WebcastGiftBroadcastMessage", () => {
    it("doesn't emit the nested notify as a roomNotify", () => {
      const { context, emitted } = fakeContext({
        listen: ["giftBroadcast", "roomNotify"],
      });
      dispatch(
        context,
        encoded("WebcastGiftBroadcastMessage", GiftBroadcastMessageSchema, {
          fromUserId: "7",
          notify: NOTIFY,
        }),
      );
      expect(names(emitted)).toEqual(["giftBroadcast"]);
      expect(payloads(emitted, "giftBroadcast")[0]).toMatchObject({
        fromUserId: "7",
        notify: { content: "A big gift" },
      });
    });
  });
});
