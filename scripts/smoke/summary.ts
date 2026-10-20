// The bookkeeping of `yarn smoke`, free of I/O so it can be tested
// (summary.test.ts): SmokeRecorder takes every event with its time and keeps
// the counts, the first sample of each LIVE event, the transitions, the raw
// methods and the reconnect check, then turns them into the summary the script
// prints (as text, or as JSON with --json) and the verdict behind its exit
// status.
import {
  WebcastEvent,
  type DisconnectReason,
  type GiftList,
  type GiftSource,
  type StreamEndAction,
  type WebcastEventMap,
} from "../../src/index.js";
import { CONNECTION_EVENTS } from "../../src/routes/groups.js";
import { ROUTES } from "../../src/routes/index.js";
import {
  describeConnected,
  describeDisconnected,
  describeError,
  describeReconnecting,
  describeStreamEnd,
  errorInfo,
  formatCount,
  formatRows,
  formatSeconds,
  labeled,
  shortError,
  type ErrorInfo,
} from "../lib/format.js";
import { describeLive } from "./describe/index.js";

/**
 * Every event of `WebcastEventMap`, in `WebcastEvent`'s order: the smoke run
 * listens to all of them.
 */
export const SMOKE_EVENTS: readonly SmokeEvent[] = Object.values(WebcastEvent);

export type SmokeEvent = (typeof WebcastEvent)[keyof typeof WebcastEvent];

const CONNECTION: ReadonlySet<string> = new Set(CONNECTION_EVENTS);

/** Events that come from the LIVE itself: a run passes only when one arrived. */
const LIVE_EVENTS: ReadonlySet<SmokeEvent> = new Set(
  SMOKE_EVENTS.filter((event) => !CONNECTION.has(event) && event !== "raw"),
);

/** The methods the library routes to an event (PROTOCOL.md, Routing). Others only reach `raw`. */
const ROUTED_METHODS: ReadonlySet<string> = new Set(Object.keys(ROUTES));

/** How long the reconnect may take after `--drop-after` drops the socket. */
export const RECONNECT_BOUND_MS = 30_000;

/** How many `error` events are printed as they come; the rest are only counted. */
const PRINTED_ERRORS = 5;

/** How many gift names the summary shows. */
const GIFT_SAMPLES = 3;

/** A change in the connection's state, for the summary. */
export type Transition =
  | {
      at: number;
      event: "connected";
      roomId: string;
      attempt: number;
      reconnected: boolean;
    }
  | {
      at: number;
      event: "reconnecting";
      attempt: number;
      delayMs: number;
      reason: DisconnectReason;
    }
  | {
      at: number;
      event: "disconnected";
      reason: DisconnectReason;
      willReconnect: boolean;
      error?: ErrorInfo;
    }
  | { at: number; event: "streamEnd"; action: StreamEndAction }
  | { at: number; event: "drop" };

/** The reconnect check of `--drop-after`. */
export interface DropCheck {
  /** `--drop-after`, in milliseconds after the first connect. */
  afterMs: number;
  /**
   * `waiting` for the drop, `dropped` (waiting for `reconnecting`),
   * `reconnecting` (waiting for `connected`), then `passed` or `failed`.
   */
  status: "waiting" | "dropped" | "reconnecting" | "passed" | "failed";
  /** When the socket was dropped, in milliseconds since the start. */
  droppedAt?: number;
  /** How long after the drop `connected { reconnected: true }` came. */
  reconnectMs?: number;
  /** Why it failed. */
  reason?: string;
}

/** What `--gifts` got. */
export type GiftsCheck =
  | { status: "pending" }
  | { status: "fetched"; source: GiftSource; count: number; sample: string[] }
  | { status: "failed"; error: ErrorInfo };

/** The result of a smoke run; `--json` prints it as is. */
export interface SmokeSummary {
  /** Whether the run passed: exit status 0. */
  ok: boolean;
  /** Why it failed; empty when it passed. */
  reasons: string[];
  username: string;
  /** The room the connection entered, or `null` when it never did. */
  roomId: string | null;
  /** How long the run took, in milliseconds. */
  durationMs: number;
  /** Whether Ctrl-C stopped the run. */
  interrupted: boolean;
  /** Whether the connection entered the room at least once. */
  connected: boolean;
  /** How many reconnects succeeded. */
  reconnects: number;
  transitions: Transition[];
  /** How many times each event fired, every event included. */
  events: Record<string, number>;
  /** How many LIVE events (not connection events, not `raw`) fired. */
  liveEvents: number;
  /** How many raw messages of each method came, most frequent first. */
  rawMethods: Record<string, number>;
  /** The raw methods no event covers. */
  unroutedMethods: string[];
  /** A description of the first event of each LIVE event that fired. */
  samples: Record<string, string>;
  /** The `error` events. */
  errors: ErrorInfo[];
  /** Why `connect()` rejected. */
  connectError?: ErrorInfo;
  /** Why `disconnect()` rejected. */
  disconnectError?: ErrorInfo;
  /** How the connection stopped on its own (`disconnected` without a reconnect), if it did. */
  stoppedBy?: { reason: DisconnectReason; error?: ErrorInfo };
  /** With `--drop-after`. */
  drop?: DropCheck;
  /** With `--gifts`. */
  gifts?: GiftsCheck;
}

/** What the recorder needs to know about the run. */
export interface SmokeRecorderOptions {
  username: string;
  /** `--drop-after`, in milliseconds. */
  dropAfterMs?: number;
  /** `--gifts`. */
  gifts?: boolean;
}

/** The events with a handler of their own: the connection's, the stream end and `raw`. */
type SpecialEvent = (typeof CONNECTION_EVENTS)[number] | "streamEnd" | "raw";

type Handlers = {
  [K in SmokeEvent]?: (
    payload: WebcastEventMap[K],
    at: number,
  ) => string | undefined;
};

type SpecialHandlers = Pick<Required<Handlers>, SpecialEvent>;

function plural(count: number, word: string): string {
  return `${formatCount(count)} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Keeps track of a smoke run. Feed it every event with {@link record} and
 * the script's own steps with the other methods; most return the progress
 * line to print, if any. {@link summarize} gives the result.
 */
export class SmokeRecorder {
  readonly #username: string;
  readonly #counts = new Map<SmokeEvent, number>();
  readonly #rawMethods = new Map<string, number>();
  readonly #samples = new Map<SmokeEvent, string>();
  readonly #transitions: Transition[] = [];
  readonly #errors: ErrorInfo[] = [];
  readonly #drop: DropCheck | undefined;
  #gifts: GiftsCheck | undefined;
  #roomId: string | null = null;
  #connected = false;
  #reconnects = 0;
  #connectError: ErrorInfo | undefined;
  #disconnectError: ErrorInfo | undefined;
  #stoppedBy: SmokeSummary["stoppedBy"];

  constructor(options: SmokeRecorderOptions) {
    this.#username = options.username;
    if (options.dropAfterMs !== undefined) {
      this.#drop = { afterMs: options.dropAfterMs, status: "waiting" };
    }
    if (options.gifts) this.#gifts = { status: "pending" };
  }

  /** Whether the connection stopped on its own: no reconnect follows. */
  get stopped(): boolean {
    return this.#stoppedBy !== undefined;
  }

  /** Whether the socket was dropped and the reconnect hasn't settled yet. */
  get awaitingReconnect(): boolean {
    const status = this.#drop?.status;
    return status === "dropped" || status === "reconnecting";
  }

  /** Whether the reconnect check is over (passed or failed). `false` without `--drop-after`. */
  get dropSettled(): boolean {
    const status = this.#drop?.status;
    return status === "passed" || status === "failed";
  }

  /** When the reconnect must have happened by, in milliseconds since the start; `undefined` before the drop. */
  get reconnectDeadline(): number | undefined {
    const droppedAt = this.#drop?.droppedAt;
    return droppedAt === undefined ? undefined : droppedAt + RECONNECT_BOUND_MS;
  }

  /** Records an event at `at` (milliseconds since the start). Returns a progress line for the notable ones. */
  record<K extends SmokeEvent>(
    event: K,
    payload: WebcastEventMap[K],
    at: number,
  ): string | undefined {
    this.#counts.set(event, (this.#counts.get(event) ?? 0) + 1);
    const handlers: Handlers = this.#handlers;
    const handle = handlers[event];
    if (handle !== undefined) return handle(payload, at);
    // Every other event is a LIVE message: its first one is sampled.
    return this.#sample(event, () => describeLive(event, payload));
  }

  /** `connect()` rejected. */
  connectFailed(error: unknown): string {
    this.#connectError = errorInfo(error);
    return labeled("connect failed", describeError(error));
  }

  /** `disconnect()` rejected. */
  disconnectFailed(error: unknown): string {
    this.#disconnectError = errorInfo(error);
    return labeled("disconnect failed", describeError(error));
  }

  /** The socket is about to be dropped (`--drop-after`). */
  dropped(at: number): string {
    if (this.#drop?.status === "waiting") {
      this.#drop.status = "dropped";
      this.#drop.droppedAt = at;
    }
    this.#transitions.push({ at, event: "drop" });
    return labeled(
      "dropping",
      `the socket (--drop-after ${this.#drop ? this.#drop.afterMs / 1000 : "?"}), expecting a reconnect`,
    );
  }

  /** The drop couldn't happen, or the reconnect check failed outside the events. */
  dropFailed(reason: string): string {
    this.#failDrop(reason);
    return labeled("reconnect check", `failed: ${reason}`);
  }

  /**
   * The progress line while the run waits past `--seconds` for the
   * reconnect. It says when a rate limit is why: the last `error` was a
   * `RateLimitError` that said how long to wait.
   */
  waitingForReconnect(): string {
    const limit = this.#rateLimit();
    return `waiting for the reconnect${limit ? ` (${limit})` : ""}`;
  }

  /** The reconnect deadline passed: fails the check if it's still waiting. */
  reconnectTimedOut(): string | undefined {
    if (!this.awaitingReconnect) return undefined;
    const limit = this.#rateLimit();
    return this.dropFailed(
      `no reconnect within ${formatSeconds(RECONNECT_BOUND_MS)} of the drop${limit ? ` (${limit})` : ""}`,
    );
  }

  // The rate limit the reconnect waits out, when the last error was one.
  #rateLimit(): string | undefined {
    const last = this.#errors.at(-1);
    const wait = last?.details?.retryAfterMs;
    if (last?.code !== "RATE_LIMITED" || typeof wait !== "number") {
      return undefined;
    }
    return `rate limited: the signer asked to wait ${formatSeconds(wait)}`;
  }

  /** `fetchGifts()` answered. */
  giftsFetched(list: GiftList): string {
    const sample = list.gifts
      .slice(0, GIFT_SAMPLES)
      .map((gift) => gift.name || `gift ${gift.id}`);
    this.#gifts = {
      status: "fetched",
      source: list.source,
      count: list.gifts.length,
      sample,
    };
    return labeled("gifts", describeGifts(this.#gifts));
  }

  /** `fetchGifts()` rejected. */
  giftsFailed(error: unknown): string {
    this.#gifts = { status: "failed", error: errorInfo(error) };
    return labeled("gifts failed", describeError(error));
  }

  /** The result of the run, `at` milliseconds after its start. */
  summarize(at: number, options: { interrupted: boolean }): SmokeSummary {
    const events = Object.fromEntries(
      SMOKE_EVENTS.map((event) => [event, this.#counts.get(event) ?? 0]),
    );
    let liveEvents = 0;
    for (const event of LIVE_EVENTS) liveEvents += this.#counts.get(event) ?? 0;
    const methods = [...this.#rawMethods].sort(
      ([a, countA], [b, countB]) => countB - countA || a.localeCompare(b),
    );
    const drop = this.#drop && { ...this.#drop };
    if (drop && !(drop.status === "passed" || drop.status === "failed")) {
      drop.reason =
        drop.status === "waiting"
          ? "the run ended before the drop"
          : "the run ended before the reconnect";
      drop.status = "failed";
    }
    const summary: SmokeSummary = {
      ok: true,
      reasons: [],
      username: this.#username,
      roomId: this.#roomId,
      durationMs: at,
      interrupted: options.interrupted,
      connected: this.#connected,
      reconnects: this.#reconnects,
      transitions: [...this.#transitions],
      events,
      liveEvents,
      rawMethods: Object.fromEntries(methods),
      unroutedMethods: methods
        .map(([method]) => method)
        .filter((method) => !ROUTED_METHODS.has(method)),
      samples: Object.fromEntries(this.#samples),
      errors: [...this.#errors],
    };
    if (this.#connectError) summary.connectError = this.#connectError;
    if (this.#disconnectError) summary.disconnectError = this.#disconnectError;
    if (this.#stoppedBy) summary.stoppedBy = this.#stoppedBy;
    if (drop) summary.drop = drop;
    if (this.#gifts) summary.gifts = this.#gifts;
    summary.reasons = verdict(summary);
    summary.ok = summary.reasons.length === 0;
    return summary;
  }

  #failDrop(reason: string): void {
    if (!this.#drop || this.dropSettled) return;
    this.#drop.status = "failed";
    this.#drop.reason = reason;
  }

  #sample(event: SmokeEvent, describe: () => string): string | undefined {
    if (this.#samples.has(event)) return undefined;
    const text = describe();
    this.#samples.set(event, text);
    return labeled(`first ${event}`, text);
  }

  readonly #handlers: SpecialHandlers = {
    connected: (event, at) => {
      this.#connected = true;
      this.#roomId = event.roomId;
      if (event.reconnected) this.#reconnects++;
      this.#transitions.push({ at, event: "connected", ...event });
      const drop = this.#drop;
      if (drop && event.reconnected && drop.droppedAt !== undefined) {
        const reconnectMs = at - drop.droppedAt;
        if (drop.status === "dropped") {
          this.#failDrop("connected again without a reconnecting event");
        } else if (drop.status === "reconnecting") {
          if (reconnectMs > RECONNECT_BOUND_MS) {
            this.#failDrop(
              `reconnected ${formatSeconds(reconnectMs)} after the drop, more than ${formatSeconds(RECONNECT_BOUND_MS)}`,
            );
          } else {
            drop.status = "passed";
            drop.reconnectMs = reconnectMs;
          }
        }
      }
      return describeConnected(event);
    },
    disconnected: (event, at) => {
      const error = event.error && errorInfo(event.error);
      this.#transitions.push({
        at,
        event: "disconnected",
        reason: event.reason,
        willReconnect: event.willReconnect,
        ...(error && { error }),
      });
      if (!event.willReconnect) {
        this.#stoppedBy = { reason: event.reason, ...(error && { error }) };
        // The script's own disconnect() at the end isn't a failed reconnect.
        if (event.reason !== "user") {
          this.#failDrop(
            this.#drop?.status === "waiting"
              ? `the connection stopped (${event.reason}) before the drop`
              : `the connection stopped (${event.reason}) instead of reconnecting`,
          );
        }
      }
      return describeDisconnected(event);
    },
    reconnecting: (event, at) => {
      this.#transitions.push({ at, event: "reconnecting", ...event });
      if (this.#drop?.status === "dropped") this.#drop.status = "reconnecting";
      return describeReconnecting(event);
    },
    error: (error) => {
      this.#errors.push(errorInfo(error));
      const count = this.#errors.length;
      if (count <= PRINTED_ERRORS)
        return labeled("error", describeError(error));
      if (count === PRINTED_ERRORS + 1) {
        return labeled("error", "more errors: counted, not printed");
      }
      return undefined;
    },
    streamEnd: (event, at) => {
      this.#transitions.push({ at, event: "streamEnd", action: event.action });
      return describeStreamEnd(event);
    },
    raw: (raw) => {
      this.#rawMethods.set(
        raw.method,
        (this.#rawMethods.get(raw.method) ?? 0) + 1,
      );
      return undefined;
    },
  };
}

function describeGifts(gifts: GiftsCheck): string {
  if (gifts.status === "pending") return "didn't finish";
  if (gifts.status === "failed") return `failed: ${shortError(gifts.error)}`;
  const sample = gifts.sample.length > 0 ? ` (${gifts.sample.join(", ")})` : "";
  return `${gifts.source}: ${plural(gifts.count, "gift")}${sample}`;
}

function describeDrop(drop: DropCheck): string {
  if (drop.status === "passed") {
    return `passed: back ${formatSeconds(drop.reconnectMs ?? 0)} after the drop`;
  }
  return `${drop.status}${drop.reason ? `: ${drop.reason}` : ""}`;
}

/** Why the run failed, from its summary; empty when it passed. */
function verdict(summary: SmokeSummary): string[] {
  const reasons = summary.connected
    ? connectedFailures(summary)
    : [connectFailure(summary)];
  if (summary.disconnectError) {
    reasons.push(`disconnect() failed: ${shortError(summary.disconnectError)}`);
  }
  return reasons;
}

// Why a run that never connected failed.
function connectFailure(summary: SmokeSummary): string {
  if (summary.interrupted) return "interrupted before connecting";
  if (summary.connectError) {
    return `connect() failed: ${shortError(summary.connectError)}`;
  }
  return "never connected";
}

// What went wrong in a run that connected.
function connectedFailures(summary: SmokeSummary): string[] {
  const reasons: string[] = [];
  const [firstError] = summary.errors;
  if (firstError) {
    reasons.push(
      `${plural(summary.errors.length, "error event")} (first: ${shortError(firstError)})`,
    );
  }
  if (summary.liveEvents === 0) {
    reasons.push(
      `no LIVE event in ${formatSeconds(summary.durationMs)}: is @${summary.username} LIVE, with viewers?`,
    );
  }
  const { stoppedBy } = summary;
  if (
    stoppedBy &&
    stoppedBy.reason !== "user" &&
    stoppedBy.reason !== "streamEnd"
  ) {
    const error = stoppedBy.error ? ` (${shortError(stoppedBy.error)})` : "";
    reasons.push(`the connection stopped: ${stoppedBy.reason}${error}`);
  }
  if (summary.drop && summary.drop.status !== "passed") {
    reasons.push(`reconnect check ${describeDrop(summary.drop)}`);
  }
  if (summary.gifts && summary.gifts.status !== "fetched") {
    reasons.push(`fetchGifts() ${describeGifts(summary.gifts)}`);
  }
  return reasons;
}

/** The summary as the text `yarn smoke` prints at the end. */
export function formatSummary(summary: SmokeSummary): string {
  const room = summary.roomId === null ? "" : `, room ${summary.roomId}`;
  const lines = [
    `Summary: @${summary.username}${room}, ${formatSeconds(summary.durationMs)}${summary.interrupted ? " (interrupted)" : ""}`,
  ];
  const facts: [string, string][] = [
    [
      "connected",
      summary.connected
        ? `yes${summary.reconnects > 0 ? `, ${plural(summary.reconnects, "reconnect")}` : ""}`
        : "no",
    ],
  ];
  if (summary.connected) {
    facts.push(["LIVE events", formatCount(summary.liveEvents)]);
    facts.push(["errors", formatCount(summary.errors.length)]);
  }
  if (summary.drop) facts.push(["reconnect", describeDrop(summary.drop)]);
  if (summary.gifts) facts.push(["gifts", describeGifts(summary.gifts)]);
  lines.push(...formatRows(facts));

  if (summary.connected) {
    lines.push("", "Events");
    lines.push(...formatRows(Object.entries(summary.events)));
    lines.push("", "Raw methods");
    const methods = Object.entries(summary.rawMethods);
    if (methods.length === 0) lines.push("  none");
    else {
      lines.push(
        ...formatRows(
          methods.map(([method, count]) => [
            method,
            count,
            summary.unroutedMethods.includes(method) ? "no event" : undefined,
          ]),
        ),
      );
    }
  }

  lines.push("");
  if (summary.ok) lines.push("PASSED");
  else {
    lines.push("FAILED");
    lines.push(...summary.reasons.map((reason) => `  - ${reason}`));
  }
  return lines.join("\n");
}
