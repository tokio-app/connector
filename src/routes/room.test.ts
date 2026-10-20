import { describe, expect, it } from "vitest";
import type { FetchResultMessage } from "../codec/messages/fetchResult.js";
import { AnchorToolModificationMessageSchema } from "../codec/messages/room/anchorToolModification.js";
import { ControlMessageSchema } from "../codec/messages/room/control.js";
import { OecLiveShoppingMessageSchema } from "../codec/messages/room/oecLiveShopping.js";
import { PerceptionMessageSchema } from "../codec/messages/room/perception.js";
import { PollMessageSchema } from "../codec/messages/room/poll.js";
import { RankTextMessageSchema } from "../codec/messages/room/rankText.js";
import { RankUpdateMessageSchema } from "../codec/messages/room/rankUpdate.js";
import { RoomUserMessageSchema } from "../codec/messages/room/roomUser.js";
import {
  AccessControlMessageSchema,
  AccessRecallMessageSchema,
  CapsuleMessageSchema,
  GameRankNotifyMessageSchema,
  InRoomBannerMessageSchema,
  LiveGameIntroMessageSchema,
  MarqueeAnnouncementMessageSchema,
  PartnershipDropsUpdateMessageSchema,
  PartnershipGameOfflineMessageSchema,
  PartnershipPunishMessageSchema,
  SpeakerMessageSchema,
} from "../codec/messages/room/tail.js";
import { dispatch } from "../dispatch.js";
import type { WebcastEventName } from "../events/index.js";
import { ROOM_EVENTS } from "./groups.js";
import { roomRoutes } from "./room.js";
import { encodeMessage } from "../../test/helpers/encoder.js";
import {
  encoded,
  fakeContext,
  message,
  names,
  payloads,
} from "../../test/helpers/dispatchContext.js";
import { SAMPLE_USER, sampleCommon } from "../../test/helpers/samples.js";

// The events a LIVE message can lead to, raw included: a control message
// must emit only `controlMessage` among them.
const LIVE_EVENTS = [
  "raw",
  ...ROOM_EVENTS,
  "chat",
  "gift",
  "like",
  "member",
] as const satisfies readonly WebcastEventName[];

const control = (action: number, options?: Partial<FetchResultMessage>) =>
  encoded(
    "WebcastControlMessage",
    ControlMessageSchema,
    { action, tips: "tip" },
    options,
  );

const PUNISH = {
  punishType: "ban",
  punishReason: "",
  punishId: "",
  punishTypeId: 9,
  duration: 0,
  endTime: "0",
  showReason: "",
};

// One sample of every plain forward: the message, its event, the bytes and
// what the event's payload must hold.
const FORWARDS = [
  {
    method: "WebcastRoomUserSeqMessage",
    event: "roomUser",
    payload: encodeMessage(RoomUserMessageSchema, {
      total: 12,
      totalUser: 340,
      ranks: [{ user: SAMPLE_USER, score: 50, rank: 1 }],
    }),
    expected: {
      total: 12,
      totalUser: 340,
      ranks: [{ user: SAMPLE_USER, score: 50, rank: 1 }],
    },
  },
  {
    method: "WebcastPerceptionMessage",
    event: "perception",
    payload: encodeMessage(PerceptionMessageSchema, {
      dialog: { iconType: 1, title: { key: "t" }, scene: 2 },
      punishInfo: PUNISH,
    }),
    expected: {
      dialog: {
        iconType: 1,
        title: { key: "t", defaultPattern: "" },
        scene: 2,
      },
      punishInfo: PUNISH,
    },
  },
  {
    method: "WebcastRankUpdateMessage",
    event: "rankUpdate",
    payload: encodeMessage(RankUpdateMessageSchema, {
      updates: [{ rankType: 1, ownRank: 3, currentScore: 100 }],
      opType: 1,
    }),
    expected: {
      updates: [{ rankType: 1, ownRank: 3, currentScore: 100 }],
      opType: 1,
    },
  },
  {
    method: "WebcastRankTextMessage",
    event: "rankText",
    payload: encodeMessage(RankTextMessageSchema, {
      scene: 1,
      ownerIdxBefore: 2,
      ownerIdxAfter: 1,
      curUserId: "6900000000000000001",
      content: { key: "k" },
      rankType: 0,
    }),
    expected: {
      scene: 1,
      ownerIdxBefore: 2,
      ownerIdxAfter: 1,
      curUserId: "6900000000000000001",
      content: { key: "k", defaultPattern: "" },
      rankType: 0,
    },
  },
  {
    method: "WebcastGameRankNotifyMessage",
    event: "gameRankNotify",
    payload: encodeMessage(GameRankNotifyMessageSchema, {
      msgType: 1,
      notifyText: { key: "k" },
    }),
    expected: { msgType: 1, notifyText: { key: "k", defaultPattern: "" } },
  },
  {
    method: "WebcastPollMessage",
    event: "pollMessage",
    payload: encodeMessage(PollMessageSchema, {
      messageType: 1,
      pollId: "7300000000000000001",
      startContent: {
        startTime: "1",
        endTime: "2",
        optionList: [{ votes: 0, displayContent: "A", optionIdx: 1 }],
        title: "Q",
        operator: SAMPLE_USER,
      },
      pollKind: 0,
    }),
    expected: {
      messageType: 1,
      pollId: "7300000000000000001",
      startContent: {
        startTime: "1",
        endTime: "2",
        optionList: [{ votes: 0, displayContent: "A", optionIdx: 1 }],
        title: "Q",
        operator: SAMPLE_USER,
      },
      pollKind: 0,
    },
  },
  {
    method: "WebcastOecLiveShoppingMessage",
    event: "oecLiveShopping",
    payload: encodeMessage(OecLiveShoppingMessageSchema, {
      actionType: 2,
      liveProductNumber: 3,
      popProduct: { title: "Mug", price: "$9", productId: "9" },
    }),
    expected: {
      actionType: 2,
      liveProductNumber: 3,
      popProduct: { title: "Mug", price: "$9", imageUrl: "", productId: "9" },
    },
  },
  {
    method: "WebcastCapsuleMessage",
    event: "capsule",
    payload: encodeMessage(CapsuleMessageSchema, {
      desc: { key: "k" },
      type: 1,
      scene: "s",
      subScene: "ss",
    }),
    expected: {
      desc: { key: "k", defaultPattern: "" },
      type: 1,
      scene: "s",
      subScene: "ss",
    },
  },
  {
    method: "WebcastMarqueeAnnouncementMessage",
    event: "marqueeAnnouncement",
    payload: encodeMessage(MarqueeAnnouncementMessageSchema, {
      messageScene: "scene",
    }),
    expected: { messageScene: "scene" },
  },
  {
    method: "WebcastSpeakerMessage",
    event: "speaker",
    payload: encodeMessage(SpeakerMessageSchema, {
      common: sampleCommon("WebcastSpeakerMessage"),
    }),
    expected: { common: sampleCommon("WebcastSpeakerMessage") },
  },
  {
    method: "WebcastInRoomBannerMessage",
    event: "inRoomBanner",
    payload: encodeMessage(InRoomBannerMessageSchema, {
      common: sampleCommon("WebcastInRoomBannerMessage"),
    }),
    expected: { common: sampleCommon("WebcastInRoomBannerMessage") },
  },
  {
    method: "WebcastAccessControlMessage",
    event: "accessControl",
    payload: encodeMessage(AccessControlMessageSchema, {
      captcha: { captchaRecordId: "5", roomId: "7", verifyDurationInSec: 30 },
    }),
    expected: {
      captcha: { captchaRecordId: "5", roomId: "7", verifyDurationInSec: 30 },
    },
  },
  {
    method: "WebcastAccessRecallMessage",
    event: "accessRecall",
    payload: encodeMessage(AccessRecallMessageSchema, {
      status: 1,
      duration: 60,
      endTime: "1000",
      scene: "s",
      punishInfo: PUNISH,
    }),
    expected: {
      status: 1,
      duration: 60,
      endTime: "1000",
      scene: "s",
      punishInfo: PUNISH,
    },
  },
  {
    method: "WebcastPartnershipDropsUpdateMessage",
    event: "partnershipDropsUpdate",
    payload: encodeMessage(PartnershipDropsUpdateMessageSchema, {
      changeMode: 1,
      dropsId: "d",
      taskId: "t",
      eventId: "e",
      anchorUid: "42",
    }),
    expected: {
      changeMode: 1,
      dropsId: "d",
      taskId: "t",
      eventId: "e",
      anchorUid: "42",
    },
  },
  {
    method: "WebcastPartnershipGameOfflineMessage",
    event: "partnershipGameOffline",
    payload: encodeMessage(PartnershipGameOfflineMessageSchema, {
      offlineGameList: [
        { taskId: "t", toastText: "x", offlineType: 2, gameId: "g" },
      ],
    }),
    expected: {
      offlineGameList: [
        { taskId: "t", toastText: "x", offlineType: 2, gameId: "g" },
      ],
    },
  },
  {
    method: "WebcastPartnershipPunishMessage",
    event: "partnershipPunish",
    payload: encodeMessage(PartnershipPunishMessageSchema, {
      punishInfo: PUNISH,
    }),
    expected: { punishInfo: PUNISH },
  },
  {
    method: "WebcastLiveGameIntroMessage",
    event: "liveGameIntro",
    payload: encodeMessage(LiveGameIntroMessageSchema, {
      content: { key: "k" },
      hasRankInfo: true,
    }),
    expected: { content: { key: "k", defaultPattern: "" }, hasRankInfo: true },
  },
  {
    method: "WebcastAnchorToolModificationMessage",
    event: "anchorToolModification",
    payload: encodeMessage(AnchorToolModificationMessageSchema, {
      modification: { userId: "6900000000000000001", name: "A Filter" },
    }),
    expected: {
      modification: {
        roomId: "0",
        userId: "6900000000000000001",
        name: "A Filter",
        startTime: "0",
        endTime: "0",
        duration: 0,
      },
    },
  },
] as const;

describe("roomRoutes", () => {
  it("routes the room group's messages to the events they can lead to", () => {
    expect(
      Object.fromEntries(
        Object.entries(roomRoutes).map(([method, route]) => [
          method,
          route.events,
        ]),
      ),
    ).toEqual({
      WebcastRoomUserSeqMessage: ["roomUser"],
      WebcastControlMessage: ["controlMessage", "streamEnd"],
      WebcastPerceptionMessage: ["perception"],
      WebcastRankUpdateMessage: ["rankUpdate"],
      WebcastRankTextMessage: ["rankText"],
      WebcastGameRankNotifyMessage: ["gameRankNotify"],
      WebcastPollMessage: ["pollMessage"],
      WebcastOecLiveShoppingMessage: ["oecLiveShopping"],
      WebcastCapsuleMessage: ["capsule"],
      WebcastMarqueeAnnouncementMessage: ["marqueeAnnouncement"],
      WebcastSpeakerMessage: ["speaker"],
      WebcastInRoomBannerMessage: ["inRoomBanner"],
      WebcastAccessControlMessage: ["accessControl"],
      WebcastAccessRecallMessage: ["accessRecall"],
      WebcastPartnershipDropsUpdateMessage: ["partnershipDropsUpdate"],
      WebcastPartnershipGameOfflineMessage: ["partnershipGameOffline"],
      WebcastPartnershipPunishMessage: ["partnershipPunish"],
      WebcastLiveGameIntroMessage: ["liveGameIntro"],
      WebcastAnchorToolModificationMessage: ["anchorToolModification"],
    });
    for (const [method, route] of Object.entries(roomRoutes)) {
      expect(route.always).toBe(
        method === "WebcastControlMessage" ? true : undefined,
      );
    }
  });

  it("emits only the events a route lists", () => {
    const samples = [
      ...FORWARDS.map(({ method, payload }) => message(method, payload)),
      control(1),
      control(3),
      control(4),
    ];
    for (const msg of samples) {
      const route = roomRoutes[msg.method]!;
      const { context, emitted, ended } = fakeContext({ listen: route.events });
      dispatch(context, msg);
      for (const event of names(emitted)) expect(route.events).toContain(event);
      if (ended.length > 0) expect(route.events).toContain("streamEnd");
    }
  });

  describe.each(FORWARDS)("$method", ({ method, event, payload, expected }) => {
    it(`is always a ${event}`, () => {
      const { context, emitted, ended } = fakeContext({ listen: [event] });
      dispatch(context, message(method, payload));
      expect(names(emitted)).toEqual([event]);
      expect(payloads(emitted, event)[0]).toMatchObject(expected);
      expect(ended).toEqual([]);
    });
  });

  describe("WebcastControlMessage", () => {
    it.each([0, 1, 2, 3, 4, 5, -1])(
      "is a controlMessage on action %i, whatever it is",
      (action) => {
        const { context, emitted } = fakeContext({
          listen: ["controlMessage"],
        });
        dispatch(context, control(action));
        expect(names(emitted)).toEqual(["controlMessage"]);
        expect(payloads(emitted, "controlMessage")[0]).toStrictEqual({
          action,
          tips: "tip",
        });
      },
    );

    it.each([
      [3, "ended"],
      [4, "suspended"],
    ] as const)(
      "ends the stream on action %i, after the controlMessage",
      (action, how) => {
        const { context, emitted, ended } = fakeContext({
          listen: LIVE_EVENTS,
        });
        const order: string[] = [];
        dispatch(
          {
            ...context,
            emit(event, payload) {
              order.push(event);
              context.emit(event, payload);
            },
            endStream(ending) {
              order.push(`endStream ${ending}`);
              context.endStream(ending);
            },
          },
          control(action),
        );
        expect(ended).toEqual([how]);
        expect(names(emitted)).toEqual(["raw", "controlMessage"]);
        expect(order).toEqual(["raw", "controlMessage", `endStream ${how}`]);
      },
    );

    it.each([0, 1, 2, 5, -1])(
      "doesn't end the stream on action %i",
      (action) => {
        const { context, emitted, ended } = fakeContext({
          listen: LIVE_EVENTS,
        });
        dispatch(context, control(action));
        expect(ended).toEqual([]);
        expect(names(emitted)).toEqual(["raw", "controlMessage"]);
      },
    );

    it("is decoded without a listener, for the stream end, and still emitted", () => {
      // The fake context records every emit, heard or not; the connection's
      // emitter drops an unheard one.
      const { context, emitted, ended } = fakeContext();
      dispatch(context, control(3));
      expect(ended).toEqual(["ended"]);
      expect(names(emitted)).toEqual(["controlMessage"]);
      const paused = fakeContext({ listen: ["streamEnd"] });
      dispatch(paused.context, control(1));
      expect(paused.ended).toEqual([]);
      expect(names(paused.emitted)).toEqual(["controlMessage"]);
    });
  });

  it("lists every event of ROOM_EVENTS", () => {
    const events = Object.values(roomRoutes).flatMap((route) => route.events);
    expect(new Set(events)).toEqual(new Set(ROOM_EVENTS));
  });
});
