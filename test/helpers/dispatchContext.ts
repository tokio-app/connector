// A DispatchContext that records what dispatch does with it, and the helpers
// that build batch messages for it: the pipeline tests (src/dispatch.test.ts)
// and the route tests (src/routes/*.test.ts) share them.
import { vi, type Mock } from "vitest";
import type { UnsafeIntegerHook } from "../../src/codec/decode.js";
import type { FetchResultMessage } from "../../src/codec/messages/fetchResult.js";
import type { MessageSchema } from "../../src/codec/schema.js";
import type { ConnectorError } from "../../src/errors.js";
import type {
  StreamEndAction,
  WebcastEventMap,
  WebcastEventName,
} from "../../src/events/index.js";
import { RecentIds, type DispatchContext } from "../../src/routes/route.js";
import { encodeMessage, type EncodeInput } from "./encoder.js";

/** One `emit` call: the event and its payload. */
export type Emitted = {
  [K in WebcastEventName]: [K, WebcastEventMap[K]];
}[WebcastEventName];

export interface FakeOptions {
  /** The events with a listener. */
  listen?: readonly WebcastEventName[];
  processInitialData?: boolean;
  dedupeSize?: number;
}

/** A fake context and what dispatch did with it. */
export interface FakeContext {
  context: DispatchContext;
  /** Every event emitted, in order. */
  emitted: Emitted[];
  /** Every failure reported. */
  errors: ConnectorError[];
  /** Every stream end asked for. */
  ended: StreamEndAction[];
  /** The context's unsafe integer hook. */
  onUnsafeInteger: Mock<UnsafeIntegerHook>;
}

/** A DispatchContext that records what dispatch does with it. */
export function fakeContext({
  listen = [],
  processInitialData = false,
  dedupeSize = 2_048,
}: FakeOptions = {}): FakeContext {
  const emitted: Emitted[] = [];
  const errors: ConnectorError[] = [];
  const ended: StreamEndAction[] = [];
  const onUnsafeInteger = vi.fn<UnsafeIntegerHook>();
  const context: DispatchContext = {
    processInitialData,
    recentIds: new RecentIds(dedupeSize),
    decodeOptions: { onUnsafeInteger },
    listenerCount: (event) => (listen.includes(event) ? 1 : 0),
    emit: (event, payload) => {
      emitted.push([event, payload] as Emitted);
    },
    reportError: (error) => {
      errors.push(error);
    },
    endStream: (action) => {
      ended.push(action);
    },
  };
  return { context, emitted, errors, ended, onUnsafeInteger };
}

/** The names of the emitted events, in order. */
export const names = (emitted: readonly Emitted[]) =>
  emitted.map(([event]) => event);

/** The payloads of one event, in order. */
export function payloads<K extends WebcastEventName>(
  emitted: readonly Emitted[],
  event: K,
): WebcastEventMap[K][] {
  return emitted
    .filter(([name]) => name === event)
    .map(([, payload]) => payload as WebcastEventMap[K]);
}

let lastId = 0;

/** A batch message, with a new msgId unless `options` gives one. */
export function message(
  method: string,
  payload: Uint8Array = new Uint8Array(0),
  options: Partial<FetchResultMessage> = {},
): FetchResultMessage {
  lastId += 1;
  return {
    method,
    payload,
    msgId: String(lastId),
    msgType: 1,
    isHistory: false,
    ...options,
  };
}

/** A batch message holding `value`, encoded with `schema`. */
export function encoded<T>(
  method: string,
  schema: MessageSchema<T>,
  value: EncodeInput<T>,
  options?: Partial<FetchResultMessage>,
): FetchResultMessage {
  return message(method, encodeMessage(schema, value), options);
}
