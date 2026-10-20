// Every top-level message table, by protobuf message name. The library's
// modules import the codec's files (reader, writer, schema, decode, the
// tables in messages/) directly; this registry is for code that looks a table
// up by name, such as the tests that check every table at once.
import type { MessageSchema } from "./schema.js";
import { chatSchemas } from "./messages/chat/index.js";
import { FetchResultSchema } from "./messages/fetchResult.js";
import {
  EnterRoomSchema,
  HeartbeatSchema,
  PushFrameSchema,
} from "./messages/frame.js";
import { giftSchemas } from "./messages/gift/index.js";
import { linkSchemas } from "./messages/link/index.js";
import { roomSchemas } from "./messages/room/index.js";

/** The WebSocket's own messages: frames, the heartbeat, the room entry and a batch. */
export const FRAME_SCHEMAS = Object.freeze({
  WebcastPushFrame: PushFrameSchema,
  HeartBeatMessage: HeartbeatSchema,
  WebcastImEnterRoomMessage: EnterRoomSchema,
  ProtoMessageFetchResult: FetchResultSchema,
});

/**
 * The top-level messages the library decodes, by protobuf message name: the
 * WebSocket's own messages, then the LIVE messages of each group
 * (`messages/<group>/index.ts`), keyed like a batch's `method`.
 */
export const SCHEMAS = Object.freeze({
  ...FRAME_SCHEMAS,
  ...chatSchemas,
  ...giftSchemas,
  ...linkSchemas,
  ...roomSchemas,
});

/** The name of a message in {@link SCHEMAS}. */
export type SchemaName = keyof typeof SCHEMAS;

const BY_NAME: Readonly<Record<string, MessageSchema<unknown>>> = SCHEMAS;

/** The schema of the message called `name`, or `undefined` when the library doesn't decode it. */
export function getSchema(name: string): MessageSchema<unknown> | undefined {
  return Object.hasOwn(BY_NAME, name) ? BY_NAME[name] : undefined;
}
