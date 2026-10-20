// Routes each LIVE message of a batch to the public events: drops duplicates
// and history, emits `raw`, and decodes a payload only when someone listens
// to an event it can produce. The routing rules are PROTOCOL.md's "Routing".
// The exported names and signatures are a contract with connection.ts: keep
// them.
import { decodeMessage, type DecodeOptions } from "./codec/decode.js";
import { BarrageMessageSchema } from "./codec/messages/barrage.js";
import { ChatMessageSchema } from "./codec/messages/chat.js";
import { CommonOnlySchema } from "./codec/messages/common.js";
import {
  ControlAction,
  ControlMessageSchema,
} from "./codec/messages/control.js";
import {
  EnvelopeMessageSchema,
  SUPER_FAN_BOX_BUSINESS_TYPE,
} from "./codec/messages/envelope.js";
import type { FetchResultMessage } from "./codec/messages/fetchResult.js";
import { GiftMessageSchema } from "./codec/messages/gift.js";
import { LikeMessageSchema } from "./codec/messages/like.js";
import { MemberMessageSchema } from "./codec/messages/member.js";
import { RoomUserMessageSchema } from "./codec/messages/roomUser.js";
import { SocialMessageSchema } from "./codec/messages/social.js";
import type { AnyMessageSchema, MessageSchema } from "./codec/schema.js";
import type { EventName } from "./emitter.js";
import { ConnectorError, ProtocolError } from "./errors.js";
import type {
  BarrageMessage,
  EnvelopeMessage,
  RawMessage,
  StreamEndAction,
  WebcastEventMap,
} from "./events.js";

/** A public event name. */
export type WebcastEventName = EventName<WebcastEventMap>;

/** What dispatch needs from the connection. The connection keeps one for its whole life. */
export interface DispatchContext {
  /** The `processInitialData` option: when `false`, history messages are dropped after `raw`. */
  readonly processInitialData: boolean;
  /** The message ids seen recently, for dropping duplicates. Lives across reconnects. */
  readonly recentIds: RecentIds;
  /** Options for decoding payloads (where unsafe counts are reported). */
  readonly decodeOptions: DecodeOptions;
  /** How many listeners an event has: payloads are only decoded for events someone listens to. */
  listenerCount(event: WebcastEventName): number;
  /** Emits a public event. Never throws. */
  emit<K extends WebcastEventName>(event: K, payload: WebcastEventMap[K]): void;
  /** Reports a failure without throwing, such as a payload that can't be decoded. */
  reportError(error: ConnectorError): void;
  /** The LIVE ended: the connection emits `streamEnd` and disconnects without reconnecting. */
  endStream(action: StreamEndAction): void;
}

/** How to handle one LIVE message type. */
export interface Route<T> {
  /** Decodes the payload. */
  readonly schema: MessageSchema<T>;
  /** The events `emit` can produce. With no listener on any of them, the payload isn't decoded. */
  readonly events: readonly WebcastEventName[];
  /** Decode even when no event has a listener (control messages: the stream end must be seen). */
  readonly always?: boolean;
  /** Emits the decoded message: one event, several, or none. */
  emit(message: T, context: DispatchContext): void;
}

/** A {@link Route} with its message type erased, as {@link ROUTES} holds it. */
export interface AnyRoute {
  readonly schema: AnyMessageSchema;
  readonly events: readonly WebcastEventName[];
  readonly always?: boolean;
  emit(message: any, context: DispatchContext): void;
}

/** Checks a route's types against its schema, and erases them for {@link ROUTES}. */
export function defineRoute<T>(route: Route<T>): AnyRoute {
  return route;
}

// The text keys that mark super fan messages (from 2.4.0), matched lowercased.
// The join key also contains the super fan key, so it is checked first.
const SUPER_FAN_BOX_KEY = "ttlive_superfanbox";
const SUPER_FAN_JOINED_KEY = "ttlive_superfan_commentnotif_superfanjoined";
const SUPER_FAN_KEY = "ttlive_superfan";

/** A route that emits every message as one event. */
function forward<K extends WebcastEventName>(
  event: K,
  schema: MessageSchema<WebcastEventMap[K]>,
): AnyRoute {
  return defineRoute({
    schema,
    events: [event],
    emit: (message, context) => context.emit(event, message),
  });
}

/** Whether an envelope is a super fan box: by its text key or its business type. */
function isSuperFanBox(message: EnvelopeMessage): boolean {
  const key = message.common?.displayText?.key ?? "";
  return (
    key.toLowerCase().includes(SUPER_FAN_BOX_KEY) ||
    message.envelopeInfo?.businessType === SUPER_FAN_BOX_BUSINESS_TYPE
  );
}

/** The super fan event a banner is, if any, from its two text keys. */
function superFanEvent(
  message: BarrageMessage,
): "superFanJoin" | "superFan" | undefined {
  const keys = [message.content, message.commonBarrageContent].map(
    (text) => text?.key.toLowerCase() ?? "",
  );
  if (keys.some((key) => key.includes(SUPER_FAN_JOINED_KEY))) {
    return "superFanJoin";
  }
  if (keys.some((key) => key.includes(SUPER_FAN_KEY))) return "superFan";
  return undefined;
}

/** The routes, by message type (a batch message's `method`). Message types without a route only reach `raw`. */
export const ROUTES: Readonly<Record<string, AnyRoute>> = Object.freeze({
  WebcastChatMessage: forward("chat", ChatMessageSchema),
  WebcastGiftMessage: forward("gift", GiftMessageSchema),
  WebcastLikeMessage: forward("like", LikeMessageSchema),
  // Follows and shares share a message type; the key of the text TikTok
  // shows for them tells them apart (as is, not lowercased, like 2.4.0).
  WebcastSocialMessage: defineRoute({
    schema: SocialMessageSchema,
    events: ["follow", "share"],
    emit(message, context) {
      const key = message.common?.displayText?.key ?? "";
      if (key.includes("follow")) context.emit("follow", message);
      else if (key.includes("share")) context.emit("share", message);
    },
  }),
  WebcastMemberMessage: forward("member", MemberMessageSchema),
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
  WebcastEnvelopeMessage: defineRoute({
    schema: EnvelopeMessageSchema,
    events: ["superFanBox", "envelope"],
    emit(message, context) {
      if (isSuperFanBox(message)) context.emit("superFanBox", message);
      context.emit("envelope", message);
    },
  }),
  WebcastBarrageMessage: defineRoute({
    schema: BarrageMessageSchema,
    events: ["superFanJoin", "superFan"],
    emit(message, context) {
      const event = superFanEvent(message);
      if (event !== undefined) context.emit(event, message);
    },
  }),
});

/**
 * The last `capacity` message ids, oldest dropped first. With a capacity of
 * 0 it remembers nothing.
 */
export class RecentIds {
  readonly #capacity: number;
  readonly #ids = new Set<string>();

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  /** How many ids it holds. */
  get size(): number {
    return this.#ids.size;
  }

  /** Whether `id` was added and is still remembered. */
  has(id: string): boolean {
    return this.#ids.has(id);
  }

  /**
   * Remembers `id`. Returns `false` when it was already there (a duplicate),
   * `true` when it is new.
   */
  add(id: string): boolean {
    if (this.#ids.has(id)) return false;
    if (this.#capacity === 0) return true;
    if (this.#ids.size >= this.#capacity) {
      // A Set iterates in insertion order: the first id is the oldest.
      for (const oldest of this.#ids) {
        this.#ids.delete(oldest);
        break;
      }
    }
    this.#ids.add(id);
    return true;
  }

  /** Forgets every id. */
  clear(): void {
    this.#ids.clear();
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// A message id of "0" (or none) means TikTok didn't give the message one: it
// can't be told apart from others, so it is never a duplicate.
function isDuplicate(recentIds: RecentIds, msgId: string): boolean {
  return msgId !== "0" && msgId !== "" && !recentIds.add(msgId);
}

// When TikTok created the message: field 4 of its common data (field 1), or
// "0". A payload that can't be read gives "0" without a report: `raw` hands
// it on as it is, and the route reports it if it decodes the payload.
function createTimeOf(payload: Uint8Array, options: DecodeOptions): string {
  try {
    const { common } = decodeMessage(CommonOnlySchema, payload, options);
    return common?.createTime ?? "0";
  } catch {
    return "0";
  }
}

function toRaw(
  message: FetchResultMessage,
  options: DecodeOptions,
): RawMessage {
  return {
    method: message.method,
    payload: message.payload,
    msgId: message.msgId,
    isHistory: message.isHistory,
    createTime: createTimeOf(message.payload, options),
  };
}

function hasListener(
  context: DispatchContext,
  events: readonly WebcastEventName[],
): boolean {
  return events.some((event) => context.listenerCount(event) > 0);
}

// The route of a message type. Own keys only: "toString" has no route.
function routeOf(method: string): AnyRoute | undefined {
  return Object.hasOwn(ROUTES, method) ? ROUTES[method] : undefined;
}

// Decodes the message with its route's schema and lets the route emit it. A
// payload that can't be decoded is reported and dropped.
function decodeAndEmit(
  context: DispatchContext,
  route: AnyRoute,
  message: FetchResultMessage,
): void {
  let decoded: unknown;
  try {
    decoded = decodeMessage(
      route.schema,
      message.payload,
      context.decodeOptions,
    );
  } catch (error) {
    context.reportError(
      new ProtocolError(
        `Dropped message ${message.msgId} (${message.method}): ${describe(error)}`,
        { cause: error },
      ),
    );
    return;
  }
  route.emit(decoded, context);
}

function handle(context: DispatchContext, message: FetchResultMessage): void {
  if (isDuplicate(context.recentIds, message.msgId)) return;
  if (context.listenerCount("raw") > 0) {
    context.emit("raw", toRaw(message, context.decodeOptions));
  }
  if (message.isHistory && !context.processInitialData) return;
  const route = routeOf(message.method);
  if (route === undefined) return;
  if (!route.always && !hasListener(context, route.events)) return;
  decodeAndEmit(context, route, message);
}

/**
 * Handles one LIVE message from a batch, in this order: drops it when its
 * `msgId` (other than "0" or empty) was seen; emits `raw` when it has a
 * listener; drops history messages unless `processInitialData`; looks up its
 * route; skips decoding when none of the route's events has a listener
 * (unless the route is `always`); decodes it and lets the route emit. A
 * payload that can't be decoded is reported through `context.reportError` as
 * a `ProtocolError`, never thrown. Never throws: anything unexpected is
 * reported as a `ConnectorError` with code `INTERNAL`.
 */
export function dispatch(
  context: DispatchContext,
  message: FetchResultMessage,
): void {
  try {
    handle(context, message);
  } catch (error) {
    context.reportError(
      new ConnectorError(
        "INTERNAL",
        `Couldn't handle message ${message.msgId} (${message.method}): ${describe(error)}`,
        { cause: error },
      ),
    );
  }
}
