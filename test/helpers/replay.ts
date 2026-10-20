// Replays captured LIVE messages through the real dispatch with a listener on
// every event, the way a connection with every listener attached would see
// them: the fixture tests (test/fixtures/fixtures.test.ts) and the offline
// capture test use it.
import { createUnsafeIntegerReporter } from "../../src/codec/decode.js";
import {
  RecentIds,
  dispatch,
  type DispatchContext,
} from "../../src/dispatch.js";
import type { ConnectorError } from "../../src/errors.js";
import type { RawMessage, StreamEndAction } from "../../src/events.js";

/** What a replay saw. */
export interface Replay {
  /** How many messages of each method dispatch handled (its `raw` events). */
  counts: Record<string, number>;
  /** How many times each LIVE event (every event but `raw`) fired. */
  events: Record<string, number>;
  /** The first payload of each LIVE event that fired, by event name. */
  firsts: Record<string, unknown>;
  /** What dispatch reported: payloads it couldn't decode. */
  errors: ConnectorError[];
  /** The stream ends dispatch asked for (control messages). */
  streamEnds: StreamEndAction[];
  /** The counters past `Number.MAX_SAFE_INTEGER`, by `Message.property`. */
  unsafe: string[];
}

/** A captured message: what a fixture holds of each. */
export type CapturedMessage = Pick<
  RawMessage,
  "method" | "payload" | "msgId" | "isHistory"
>;

/**
 * Dispatches `messages` in order with a listener on every event. History
 * messages are decoded too, and no message counts as a duplicate: a capture's
 * messages went through the duplicate check already.
 */
export function replay(messages: readonly CapturedMessage[]): Replay {
  const result: Replay = {
    counts: {},
    events: {},
    firsts: {},
    errors: [],
    streamEnds: [],
    unsafe: [],
  };
  const context: DispatchContext = {
    processInitialData: true,
    recentIds: new RecentIds(0),
    decodeOptions: {
      onUnsafeInteger: createUnsafeIntegerReporter((path) => {
        result.unsafe.push(path);
      }),
    },
    listenerCount: () => 1,
    emit(event, payload) {
      if (event === "raw") {
        const { method } = payload as RawMessage;
        result.counts[method] = (result.counts[method] ?? 0) + 1;
        return;
      }
      const name: string = event;
      result.events[name] = (result.events[name] ?? 0) + 1;
      if (!Object.hasOwn(result.firsts, name)) result.firsts[name] = payload;
    },
    reportError: (error) => {
      result.errors.push(error);
    },
    endStream: (action) => {
      result.streamEnds.push(action);
    },
  };
  for (const message of messages) {
    dispatch(context, {
      method: message.method,
      payload: message.payload,
      msgId: message.msgId,
      // Captures don't hold it, and dispatch doesn't read it.
      msgType: 0,
      isHistory: message.isHistory,
    });
  }
  return result;
}
