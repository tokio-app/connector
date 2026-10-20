// A batch of LIVE messages: the signed connect's body and the payload of
// every `msg` frame. Field numbers: PROTOCOL.md, "ProtoMessageFetchResult".
import { defineSchema, f } from "../schema.js";

/** One LIVE message in a batch (`webcast.shared.message.BaseProtoMessage`). */
export interface FetchResultMessage {
  /** The message type, such as `WebcastChatMessage`. */
  method: string;
  /** The protobuf-encoded message, as a view into the batch. */
  payload: Uint8Array;
  /** The message id, for dropping duplicates. */
  msgId: string;
  /** TikTok's message type number. */
  msgType: number;
  /** `true` for backlog messages replayed on entry. */
  isHistory: boolean;
}

/** `webcast.shared.message.BaseProtoMessage`. */
export const FetchResultMessageSchema = defineSchema<FetchResultMessage>(
  "BaseProtoMessage",
  {
    method: f.string(1),
    payload: f.bytes(2),
    msgId: f.id(3),
    msgType: f.int32(4),
    isHistory: f.bool(6),
  },
);

/** One entry of the `route_params` map. */
export interface RouteParam {
  /** The query parameter name. */
  key: string;
  /** Its value. */
  value: string;
}

/** An entry of a `map<string, string>` field: key 1, value 2. */
const RouteParamSchema = defineSchema<RouteParam>("RouteParamsEntry", {
  key: f.string(1),
  value: f.string(2),
});

/** A batch of LIVE messages and the stream's state (`webcast.shared.message.ProtoMessageFetchResult`). */
export interface FetchResult {
  /** The messages, oldest first. */
  messages: FetchResultMessage[];
  /** Where the stream is: sent back to resume after a reconnect. */
  cursor: string;
  /** How often to poll, in milliseconds (HTTP polling only). */
  fetchInterval: number;
  /** The server's time, in milliseconds since the epoch. */
  now: number;
  /** Opaque state: goes in the WebSocket URL, and back to TikTok in acks. */
  internalExt: string;
  /** TikTok's fetch type. */
  fetchType: number;
  /** Extra WebSocket URL parameters (a map; called `wsParams` in older protos). */
  routeParams: RouteParam[];
  /** A heartbeat interval TikTok suggests, in milliseconds (not used). */
  heartbeatDuration: number;
  /** Whether the client must ack this batch. */
  needAck: boolean;
  /** The WebSocket URL to connect to (only in the signed connect's body). */
  pushServer: string;
  /** Whether this is the first batch. */
  isFirst: boolean;
}

/** `webcast.shared.message.ProtoMessageFetchResult`. */
export const FetchResultSchema = defineSchema<FetchResult>(
  "ProtoMessageFetchResult",
  {
    messages: f.repeated.message(1, FetchResultMessageSchema),
    cursor: f.string(2),
    fetchInterval: f.count(3),
    now: f.count(4),
    internalExt: f.string(5),
    fetchType: f.int32(6),
    routeParams: f.repeated.message(7, RouteParamSchema),
    heartbeatDuration: f.count(8),
    needAck: f.bool(9),
    pushServer: f.string(10),
    isFirst: f.bool(11),
  },
);

/**
 * Turns `routeParams` into an object, the way a protobuf map reads: the last
 * entry of a key wins. Every key becomes an own property, `__proto__`
 * included.
 */
export function routeParamsToRecord(
  params: readonly RouteParam[],
): Record<string, string> {
  return Object.fromEntries(params.map(({ key, value }) => [key, value]));
}
