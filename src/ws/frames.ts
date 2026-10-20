// The frames the client sends (enter room, heartbeat, ack) and reading the
// frames it receives (PROTOCOL.md, "Frames"). Every WebSocket message, both
// ways, is one WebcastPushFrame; the field numbers come from the schemas in
// codec/messages/frame.ts.
import { decodeMessage, type DecodeOptions } from "../codec/decode.js";
import {
  FetchResultSchema,
  type FetchResult,
} from "../codec/messages/fetchResult.js";
import {
  EnterRoomSchema,
  HeartbeatSchema,
  PushFrameSchema,
  type PushFrame,
} from "../codec/messages/frame.js";
import { WireWriter } from "../codec/writer.js";
import { gunzip, isGzip } from "../util/gzip.js";
import { randomEnterUniqueId } from "../util/random.js";

/** The `payloadType` of the frames the library sends and reads. */
export const PayloadType = {
  /** Client → server: enter a room. */
  ENTER_ROOM: "im_enter_room",
  /** Server → client: the room was entered. */
  ENTER_ROOM_RESPONSE: "im_enter_room_resp",
  /** Client → server: a heartbeat. */
  HEARTBEAT: "hb",
  /** Client → server: a batch was received. */
  ACK: "ack",
  /** Server → client: a batch of LIVE messages. */
  BATCH: "msg",
} as const;

/** How every payload is encoded: protobuf. */
export const PROTOBUF_ENCODING = "pb";

// The enter room message's fixed values (PROTOCOL.md, "Enter room").
const LIVE_ID = 12;
const IDENTITY = "audience";
const FILTER_WELCOME_MSG = "0";

const FRAME = PushFrameSchema.fields;
const ENTER = EnterRoomSchema.fields;
const HEARTBEAT = HeartbeatSchema.fields;

const utf8 = new TextEncoder();

// A frame the client sends. Like a proto3 encoder, it leaves out the fields at
// their default: a "0" log id and an empty payload aren't written.
function pushFrame(
  payloadType: string,
  payload: Uint8Array,
  logId = "0",
): Uint8Array {
  const writer = new WireWriter();
  if (logId !== "0") writer.varint(FRAME.logId.no, logId);
  writer
    .string(FRAME.payloadEncoding.no, PROTOBUF_ENCODING)
    .string(FRAME.payloadType.no, payloadType);
  if (payload.length > 0) writer.bytes(FRAME.payload.no, payload);
  return writer.finish();
}

/**
 * The `im_enter_room` frame, sent right after the socket opens: enters
 * `roomId` as an audience member. `enterUniqueId` (a random positive 63-bit
 * integer, as a decimal string) is new for each entry by default.
 */
export function encodeEnterRoom({
  roomId,
  enterUniqueId = randomEnterUniqueId(),
}: {
  roomId: string;
  enterUniqueId?: string;
}): Uint8Array {
  const payload = new WireWriter()
    .varint(ENTER.roomId.no, roomId)
    .varint(ENTER.liveId.no, LIVE_ID)
    .string(ENTER.identity.no, IDENTITY)
    .varint(ENTER.enterUniqueId.no, enterUniqueId)
    .string(ENTER.filterWelcomeMsg.no, FILTER_WELCOME_MSG)
    .finish();
  return pushFrame(PayloadType.ENTER_ROOM, payload);
}

/** The `hb` frame: heartbeat number `seqId` (from 1 after entering) in `roomId`. */
export function encodeHeartbeat({
  roomId,
  seqId,
}: {
  roomId: string;
  seqId: number;
}): Uint8Array {
  const payload = new WireWriter()
    .varint(HEARTBEAT.roomId.no, roomId)
    .varint(HEARTBEAT.sendPacketSeqId.no, seqId)
    .finish();
  return pushFrame(PayloadType.HEARTBEAT, payload);
}

/**
 * The `ack` frame for a batch that asked for one: the received frame's
 * `logId`, and the batch's `internalExt` as UTF-8 bytes.
 */
export function encodeAck({
  logId,
  internalExt,
}: {
  logId: string;
  internalExt: string;
}): Uint8Array {
  return pushFrame(PayloadType.ACK, utf8.encode(internalExt), logId);
}

/** Reads a received frame. Throws a `ProtocolError` when it is malformed. */
export function decodePushFrame(bytes: Uint8Array): PushFrame {
  return decodeMessage(PushFrameSchema, bytes);
}

/**
 * Reads a batch: a `msg` frame's payload or a signed connect's body. Gunzips
 * it first when it starts with `1f 8b 08`. Throws a `ProtocolError` when it
 * can't be decompressed or decoded.
 */
export function decodeFetchResult(
  payload: Uint8Array,
  options?: DecodeOptions,
): FetchResult {
  return decodeMessage(
    FetchResultSchema,
    isGzip(payload) ? gunzip(payload) : payload,
    options,
  );
}
