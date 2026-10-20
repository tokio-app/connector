// What a route is: how one LIVE message type turns into events, and what it
// gets from the connection to do it. The group files (chat.ts, gift.ts,
// link.ts, room.ts) define the routes; dispatch.ts runs them.
import type { DecodeOptions } from "../codec/decode.js";
import type { AnyMessageSchema, MessageSchema } from "../codec/schema.js";
import type { ConnectorError } from "../errors.js";
import type {
  StreamEndAction,
  WebcastEventMap,
  WebcastEventName,
} from "../events/index.js";

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

/** A {@link Route} with its message type erased, as the route tables hold it. */
export interface AnyRoute {
  readonly schema: AnyMessageSchema;
  readonly events: readonly WebcastEventName[];
  readonly always?: boolean;
  emit(message: any, context: DispatchContext): void;
}

/** Checks a route's types against its schema, and erases them for a route table. */
export function defineRoute<T>(route: Route<T>): AnyRoute {
  return route;
}

/** A route that emits every message as one event. */
export function forward<K extends WebcastEventName>(
  event: K,
  schema: MessageSchema<WebcastEventMap[K]>,
): AnyRoute {
  return defineRoute({
    schema,
    events: [event],
    emit: (message, context) => context.emit(event, message),
  });
}
