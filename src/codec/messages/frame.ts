// The WebSocket's own messages: the frame every message travels in, and the
// two the client sends inside frames. Field numbers: PROTOCOL.md, "Frames".
import { defineSchema, f } from "../schema.js";

/** A WebSocket frame (`webcast.im.WebcastPushFrame`), in either direction. */
export interface PushFrame {
  /** The frame's sequence id. */
  seqId: string;
  /** The frame's log id: an ack sends it back. */
  logId: string;
  /** How `payload` is encoded: `pb` (protobuf). */
  payloadEncoding: string;
  /** What `payload` is: `msg`, `im_enter_room_resp` from the server; `im_enter_room`, `hb`, `ack` from the client. */
  payloadType: string;
  /** The payload, gzip-compressed when it starts with `1f 8b 08`. */
  payload: Uint8Array;
}

/** `webcast.im.WebcastPushFrame`. Its `service`, `method` and `headers` aren't read. */
export const PushFrameSchema = defineSchema<PushFrame>("WebcastPushFrame", {
  seqId: f.id(1),
  logId: f.id(2),
  payloadEncoding: f.string(6),
  payloadType: f.string(7),
  payload: f.bytes(8),
});

/** The heartbeat the client sends every `heartbeatIntervalMs` (`webcast.im.HeartBeatMessage`). */
export interface HeartbeatMessage {
  /** The room the client is in. */
  roomId: string;
  /** Counts the heartbeats sent since entering the room, from 1. */
  sendPacketSeqId: number;
}

/** `webcast.im.HeartBeatMessage`. */
export const HeartbeatSchema = defineSchema<HeartbeatMessage>(
  "HeartBeatMessage",
  {
    roomId: f.id(1),
    sendPacketSeqId: f.count(2),
  },
);

/** What the client sends to enter a room (`webcast.im.WebcastImEnterRoomMessage`). */
export interface EnterRoomMessage {
  /** The room to enter. */
  roomId: string;
  /** Always 12. */
  liveId: number;
  /** Always `audience`. */
  identity: string;
  /** A random positive 63-bit id the client makes for each entry. */
  enterUniqueId: string;
  /** Always `0`. */
  filterWelcomeMsg: string;
}

/** `webcast.im.WebcastImEnterRoomMessage`. Its other fields are sent empty, so aren't read. */
export const EnterRoomSchema = defineSchema<EnterRoomMessage>(
  "WebcastImEnterRoomMessage",
  {
    roomId: f.id(1),
    liveId: f.count(4),
    identity: f.string(5),
    enterUniqueId: f.id(8),
    filterWelcomeMsg: f.string(9),
  },
);
