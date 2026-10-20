// The routes of the room group: the room's state, ranks, polls, shopping and
// system messages. The rules are PROTOCOL.md's "Routing". A new message type
// gets its route here and its table in src/codec/messages/room/.
//
// `controlMessage` is declared in WebcastEventMap and ROOM_EVENTS, but not
// emitted yet: emitting it before the stream end is Phase 1 work of this
// group.
import { ControlMessageSchema } from "../codec/messages/room/control.js";
import { RoomUserMessageSchema } from "../codec/messages/room/roomUser.js";
import { ControlAction } from "../events/index.js";
import { defineRoute, forward, type AnyRoute } from "./route.js";

/** The room group's routes, by message type (a batch message's `method`). */
export const roomRoutes: Readonly<Record<string, AnyRoute>> = Object.freeze({
  WebcastRoomUserSeqMessage: forward("roomUser", RoomUserMessageSchema),
  // Decoded without listeners: the connection must see the LIVE end. The
  // connection emits `streamEnd` itself, then disconnects.
  WebcastControlMessage: defineRoute({
    schema: ControlMessageSchema,
    events: ["streamEnd"],
    always: true,
    emit(message, context) {
      if (message.action === ControlAction.STREAM_ENDED) {
        context.endStream("ended");
      } else if (message.action === ControlAction.STREAM_SUSPENDED) {
        context.endStream("suspended");
      }
    },
  }),
});
