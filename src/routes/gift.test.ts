import { describe, expect, it } from "vitest";
import { BarrageMessageSchema } from "../codec/messages/gift/barrage.js";
import { EnvelopeMessageSchema } from "../codec/messages/gift/envelope.js";
import { GiftMessageSchema } from "../codec/messages/gift/gift.js";
import { MemberMessageSchema } from "../codec/messages/gift/member.js";
import { dispatch } from "../dispatch.js";
import type { EnvelopeMessage } from "../events/index.js";
import { giftRoutes } from "./gift.js";
import { encodeMessage, type EncodeInput } from "../../test/helpers/encoder.js";
import {
  encoded,
  fakeContext,
  message,
  names,
  payloads,
} from "../../test/helpers/dispatchContext.js";
import { SAMPLE_USER } from "../../test/helpers/samples.js";

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
      WebcastBarrageMessage: ["superFanJoin", "superFan"],
    });
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
    ];
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
  });

  describe("WebcastBarrageMessage", () => {
    const route = (contentKey?: string, commonKey?: string) => {
      const { context, emitted } = fakeContext({
        listen: ["superFan", "superFanJoin"],
      });
      dispatch(context, barrage(contentKey, commonKey));
      return emitted;
    };

    it("is a super fan join when a key has the joined key, in any case", () => {
      const emitted = route("ttlive_superfan_commentnotif_superfanjoined");
      expect(names(emitted)).toEqual(["superFanJoin"]);
      expect(payloads(emitted, "superFanJoin")[0]).toMatchObject({
        content: { key: "ttlive_superfan_commentnotif_superfanjoined" },
        user: SAMPLE_USER,
      });
      expect(
        names(route(undefined, "TTLIVE_SuperFan_CommentNotif_SuperFanJoined")),
      ).toEqual(["superFanJoin"]);
      // The joined key wins over a super fan key in the other text.
      expect(
        names(
          route(
            "ttlive_superfan_banner",
            "ttlive_superfan_commentnotif_superfanjoined_v2",
          ),
        ),
      ).toEqual(["superFanJoin"]);
    });

    it("is a super fan banner when a key has ttlive_superfan, in any case", () => {
      expect(names(route("ttlive_superfan_banner"))).toEqual(["superFan"]);
      expect(names(route("pm_mt_gift", "TTLIVE_SUPERFAN"))).toEqual([
        "superFan",
      ]);
    });

    it("is neither otherwise", () => {
      expect(route()).toEqual([]);
      expect(route("", "")).toEqual([]);
      expect(route("pm_mt_gift_gallery", "ttlive_superfa")).toEqual([]);
    });
  });

  it.todo("lists every event of GIFT_EVENTS");
});
