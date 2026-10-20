// The protobuf wire codec: a reader, a writer for the client's frames, the
// schema builders, the decoder, and the message tables. Inside codec/, import
// sibling files directly, never through this file.
import type { MessageSchema } from "./schema.js";
import { BarrageMessageSchema } from "./messages/barrage.js";
import { ChatMessageSchema } from "./messages/chat.js";
import { ControlMessageSchema } from "./messages/control.js";
import { EnvelopeMessageSchema } from "./messages/envelope.js";
import { FetchResultSchema } from "./messages/fetchResult.js";
import {
  EnterRoomSchema,
  HeartbeatSchema,
  PushFrameSchema,
} from "./messages/frame.js";
import { GiftMessageSchema } from "./messages/gift.js";
import { LikeMessageSchema } from "./messages/like.js";
import { MemberMessageSchema } from "./messages/member.js";
import { RoomUserMessageSchema } from "./messages/roomUser.js";
import { SocialMessageSchema } from "./messages/social.js";

export { MAX_DEPTH, WireReader, WireType } from "./reader.js";
export { WireWriter } from "./writer.js";
export {
  defineSchema,
  f,
  type CompiledField,
  type FieldDef,
  type FieldKind,
  type MessageFieldDef,
  type MessageSchema,
  type SchemaFields,
  type ValueFieldDef,
} from "./schema.js";
export {
  createUnsafeIntegerReporter,
  decodeMessage,
  type DecodeOptions,
  type UnsafeIntegerHook,
} from "./decode.js";
export * from "./messages/barrage.js";
export * from "./messages/chat.js";
export * from "./messages/common.js";
export * from "./messages/control.js";
export * from "./messages/envelope.js";
export * from "./messages/fetchResult.js";
export * from "./messages/frame.js";
export * from "./messages/gift.js";
export * from "./messages/like.js";
export * from "./messages/member.js";
export * from "./messages/roomUser.js";
export * from "./messages/social.js";

/**
 * The top-level messages the library decodes, by protobuf message name: the
 * WebSocket's own messages, then the LIVE messages, keyed like a batch's
 * `method`.
 */
export const SCHEMAS = Object.freeze({
  WebcastPushFrame: PushFrameSchema,
  HeartBeatMessage: HeartbeatSchema,
  WebcastImEnterRoomMessage: EnterRoomSchema,
  ProtoMessageFetchResult: FetchResultSchema,
  WebcastChatMessage: ChatMessageSchema,
  WebcastGiftMessage: GiftMessageSchema,
  WebcastLikeMessage: LikeMessageSchema,
  WebcastSocialMessage: SocialMessageSchema,
  WebcastMemberMessage: MemberMessageSchema,
  WebcastRoomUserSeqMessage: RoomUserMessageSchema,
  WebcastControlMessage: ControlMessageSchema,
  WebcastEnvelopeMessage: EnvelopeMessageSchema,
  WebcastBarrageMessage: BarrageMessageSchema,
});

/** The name of a message in {@link SCHEMAS}. */
export type SchemaName = keyof typeof SCHEMAS;

const BY_NAME: Readonly<Record<string, MessageSchema<unknown>>> = SCHEMAS;

/** The schema of the message called `name`, or `undefined` when the library doesn't decode it. */
export function getSchema(name: string): MessageSchema<unknown> | undefined {
  return Object.hasOwn(BY_NAME, name) ? BY_NAME[name] : undefined;
}
