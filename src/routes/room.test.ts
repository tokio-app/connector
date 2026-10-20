import { describe, expect, it } from "vitest";
import type { FetchResultMessage } from "../codec/messages/fetchResult.js";
import { ControlMessageSchema } from "../codec/messages/room/control.js";
import { RoomUserMessageSchema } from "../codec/messages/room/roomUser.js";
import { dispatch } from "../dispatch.js";
import type { WebcastEventName } from "../events/index.js";
import { roomRoutes } from "./room.js";
import { encodeMessage } from "../../test/helpers/encoder.js";
import {
  encoded,
  fakeContext,
  message,
  names,
  payloads,
} from "../../test/helpers/dispatchContext.js";
import { SAMPLE_USER } from "../../test/helpers/samples.js";

// The events a LIVE message can lead to, raw included: a control message
// must emit none of them.
const LIVE_EVENTS = [
  "raw",
  "streamEnd",
  "chat",
  "gift",
  "like",
  "follow",
  "share",
  "member",
  "roomUser",
  "envelope",
  "superFan",
  "superFanJoin",
  "superFanBox",
] as const satisfies readonly WebcastEventName[];

const control = (action: number, options?: Partial<FetchResultMessage>) =>
  encoded("WebcastControlMessage", ControlMessageSchema, { action }, options);

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
      WebcastControlMessage: ["streamEnd"],
    });
    expect(roomRoutes.WebcastControlMessage?.always).toBe(true);
    expect(roomRoutes.WebcastRoomUserSeqMessage?.always).toBeUndefined();
  });

  it("emits only the events a route lists", () => {
    const samples = [
      encoded("WebcastRoomUserSeqMessage", RoomUserMessageSchema, {
        total: 1,
      }),
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

  describe.each([
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
  ] as const)("$method", ({ method, event, payload, expected }) => {
    it(`is always a ${event}`, () => {
      const { context, emitted } = fakeContext({ listen: [event] });
      dispatch(context, message(method, payload));
      expect(names(emitted)).toEqual([event]);
      expect(payloads(emitted, event)[0]).toMatchObject(expected);
    });
  });

  describe("WebcastControlMessage", () => {
    it.each([
      [3, "ended"],
      [4, "suspended"],
    ] as const)(
      "ends the stream on action %i, without an event of its own",
      (action, how) => {
        const { context, emitted, ended } = fakeContext({
          listen: LIVE_EVENTS,
        });
        dispatch(context, control(action));
        expect(ended).toEqual([how]);
        expect(names(emitted)).toEqual(["raw"]);
      },
    );

    it.each([0, 1, 2, 5, -1])("does nothing on action %i", (action) => {
      const { context, emitted, ended } = fakeContext({
        listen: LIVE_EVENTS,
      });
      dispatch(context, control(action));
      expect(ended).toEqual([]);
      expect(names(emitted)).toEqual(["raw"]);
    });
  });

  it.todo("lists every event of ROOM_EVENTS");
});
