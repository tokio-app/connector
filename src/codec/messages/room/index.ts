// The tables of the room group (room state, ranks, polls, shopping, system),
// by protobuf message name. A new table gets a line here, and its route in
// src/routes/room.ts.
import { ControlMessageSchema } from "./control.js";
import { RoomUserMessageSchema } from "./roomUser.js";

/** The room group's top-level messages, keyed like a batch's `method`. */
export const roomSchemas = Object.freeze({
  WebcastControlMessage: ControlMessageSchema,
  WebcastRoomUserSeqMessage: RoomUserMessageSchema,
});
