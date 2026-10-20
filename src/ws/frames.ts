// Owned by T3 (Phase 1): the frames the client sends (enter room, heartbeat,
// ack) and reading received frames (PROTOCOL.md, "Frames"). Use WireWriter and
// the field numbers in codec/messages/frame.ts.
import type { PushFrame } from "../codec/messages/frame.js";
import { ConnectorError } from "../errors.js";

function notImplemented(what: string): ConnectorError {
  return new ConnectorError(
    "NOT_IMPLEMENTED",
    `${what} is not implemented yet`,
  );
}

/** The `im_enter_room` frame: enters `roomId` with a fresh `enterUniqueId`. */
export function encodeEnterRoom(
  roomId: string,
  enterUniqueId: string,
): Uint8Array {
  throw notImplemented(`encodeEnterRoom(${roomId}, ${enterUniqueId})`);
}

/** The `hb` frame: heartbeat number `sequence` (from 1) in `roomId`. */
export function encodeHeartbeat(roomId: string, sequence: number): Uint8Array {
  throw notImplemented(`encodeHeartbeat(${roomId}, ${sequence})`);
}

/** The `ack` frame for a batch that asked for one: the frame's `logId` and the batch's `internalExt`. */
export function encodeAck(logId: string, internalExt: string): Uint8Array {
  throw notImplemented(`encodeAck(${logId}, ${internalExt.length})`);
}

/** Reads a received frame. Throws a `ProtocolError` when it is malformed. */
export function decodeFrame(bytes: Uint8Array): PushFrame {
  throw notImplemented(`decodeFrame(${bytes.length} bytes)`);
}
