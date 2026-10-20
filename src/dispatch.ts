// Routes each LIVE message of a batch to the public events: drops duplicates
// and history, emits `raw`, and decodes a payload only when someone listens
// to an event it can produce. The routes themselves live in src/routes/
// (the rules are PROTOCOL.md's "Routing"); this is the pipeline that runs
// them. The exported names and signatures are a contract with connection.ts:
// keep them.
import { decodeMessage, type DecodeOptions } from "./codec/decode.js";
import { CommonOnlySchema } from "./codec/messages/common.js";
import type { FetchResultMessage } from "./codec/messages/fetchResult.js";
import { ConnectorError, ProtocolError } from "./errors.js";
import type { RawMessage, WebcastEventName } from "./events/index.js";
import { ROUTES } from "./routes/index.js";
import {
  RecentIds,
  type AnyRoute,
  type DispatchContext,
} from "./routes/route.js";

export { RecentIds, type DispatchContext };

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
