// Owned by T1 (Phase 1): implement dispatch() and fill ROUTES. The exported
// names and signatures are a contract with connection.ts (T3): keep them.
import type { DecodeOptions } from "./codec/decode.js";
import type { FetchResultMessage } from "./codec/messages/fetchResult.js";
import type { AnyMessageSchema, MessageSchema } from "./codec/schema.js";
import type { EventName } from "./emitter.js";
import { ConnectorError } from "./errors.js";
import type { StreamEndAction, WebcastEventMap } from "./events.js";

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

/** The routes, by message type (a batch message's `method`). Message types without a route only reach `raw`. */
export const ROUTES: Readonly<Record<string, AnyRoute>> = {};

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

/**
 * Handles one LIVE message from a batch, in this order: drops it when its
 * `msgId` (other than "0") was seen; emits `raw` when it has a listener;
 * drops history messages unless `processInitialData`; looks up its route;
 * skips decoding when none of the route's events has a listener (unless the
 * route is `always`); decodes it and lets the route emit. A payload that
 * can't be decoded is reported through `context.reportError`, never thrown.
 */
export function dispatch(
  context: DispatchContext,
  message: FetchResultMessage,
): void {
  void context;
  throw new ConnectorError(
    "NOT_IMPLEMENTED",
    `dispatch() is not implemented yet (${message.method})`,
  );
}
