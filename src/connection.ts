// The connection's state machine (PROTOCOL.md, "Overview" and "Reconnects"):
// connect, keep the stream going across drops, stop for good. Its public
// signature and JSDoc are public API: Tokio and other apps build on them.
//
//   idle ─connect()→ connecting ─ok→ connected ─drop→ reconnecting ─ok→ connected
//                         │                │                │
//                         └─fail───────────┴─stop───────────┴─stop/give up→ disconnected
//
// A "run" is one connect() and the reconnects after it. Stopping a run aborts
// its signal, which cancels whatever it is waiting for.
import { setTimeout as sleep } from "node:timers/promises";
import {
  createUnsafeIntegerReporter,
  type DecodeOptions,
} from "./codec/decode.js";
import {
  routeParamsToRecord,
  type FetchResult,
} from "./codec/messages/fetchResult.js";
import { RecentIds, dispatch, type DispatchContext } from "./dispatch.js";
import { TypedEmitter, type EventName } from "./emitter.js";
import {
  AbortError,
  ConnectorError,
  OfflineError,
  ProtocolError,
  RateLimitError,
  ReconnectGiveUpError,
  RoomNotFoundError,
  SignError,
  TimeoutError,
  WebSocketError,
  isConnectorError,
} from "./errors.js";
import type {
  ConnectionState,
  ConnectResult,
  DisconnectReason,
  GiftList,
  StreamEndAction,
  WebcastEventMap,
} from "./events.js";
import { HttpClient } from "./http/client.js";
import {
  WEBSOCKET_URL_SUFFIX,
  mergeHeaders,
  webSocketHeaders,
  webSocketParams,
} from "./http/params.js";
import type { Logger, LogLevel } from "./logger.js";
import {
  DEFAULT_GIFT_OPTIONS,
  normalizeUsername,
  resolveOptions,
  type ConnectOptions,
  type FetchGiftsOptions,
  type ReconnectOptions,
  type ResolvedOptions,
} from "./options.js";
import { fetchGiftList } from "./room/gifts.js";
import { checkLive, resolveRoomId, type RoomContext } from "./room/resolver.js";
import { callSigner } from "./signer/call.js";
import { EulerSigner } from "./signer/euler.js";
import type { SignedConnect, Signer } from "./signer/types.js";
import { backoffDelay, withRetryAfter } from "./util/backoff.js";
import { decodeFetchResult } from "./ws/frames.js";
import {
  WebcastSession,
  type SessionCloseReason,
  type SessionClosed,
} from "./ws/session.js";

// What a session's end means for the connection.
const DROP_REASONS: Readonly<Record<SessionCloseReason, DisconnectReason>> = {
  close: "wsClose",
  terminated: "wsClose",
  error: "wsError",
  idle: "idle",
};

// For fetchGifts() without the signal option: a signal that never aborts.
const NEVER_ABORTED = new AbortController().signal;

const NUMERIC_ID = /^\d+$/;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// A signer written in JavaScript can answer anything: the connection needs
// the body's bytes and a list of cookies.
function checkSigned(signed: SignedConnect | undefined): SignedConnect {
  if (!(signed?.body instanceof Uint8Array)) {
    throw new ProtocolError("The signer answered without a body");
  }
  const { cookies } = signed;
  if (
    !Array.isArray(cookies) ||
    !cookies.every((cookie) => typeof cookie === "string")
  ) {
    throw new ProtocolError("The signer answered without a list of cookies");
  }
  return signed;
}

// The logger option, made safe: a logger that throws can't break a socket
// callback or a reconnect.
function safeLogger(logger: Logger): Logger {
  return (level, message, data) => {
    try {
      logger(level, message, data);
    } catch {
      // Nothing is left to report it to.
    }
  };
}

// Why a failed reconnect attempt failed, as a disconnect reason.
function reasonOf(error: ConnectorError): DisconnectReason {
  if (error instanceof WebSocketError) {
    return error.closeCode === undefined ? "wsError" : "wsClose";
  }
  if (error instanceof TimeoutError && error.phase === "connect") {
    return "wsError";
  }
  return "signError";
}

// A room that can't be found, or a signer answering 4xx (other than 429):
// the room id may have changed (a new LIVE), so resolve it again
// (PROTOCOL.md, "Overview").
function needsNewRoomId(error: ConnectorError): boolean {
  if (error instanceof RoomNotFoundError) return true;
  return (
    error instanceof SignError &&
    !(error instanceof RateLimitError) &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500
  );
}

/** One `connect()` and the reconnects that follow it, until the connection stops. */
class Run {
  /** Aborted when the run stops: cancels requests, socket openings and reconnect waits. */
  readonly controller = new AbortController();
  /** Set when the run stops: what its unfinished steps fail with. */
  stopped: AbortError | undefined;
  /** Removes the run's listener on the `signal` option. */
  unlink: () => void = () => {};
  /** Whether the run got connected at least once (it then ends with a `disconnected` event). */
  established = false;
  /** Where the stream is: the last batch's cursor, sent to the signer to resume. */
  cursor = "";
  /** The session being opened, or the open one. */
  session: WebcastSession | undefined;
  /** Whether `session` is in the room. Until then its batches wait in `pending`. */
  live = false;
  pending: FetchResult[] = [];

  get signal(): AbortSignal {
    return this.controller.signal;
  }
}

/** Where a run's reconnect attempts stand after a drop. */
interface Retry {
  /** Why the connection dropped, or why the last attempt failed. */
  reason: DisconnectReason;
  /** Look the room id up again on the next attempt. */
  resolveRoom: boolean;
  /** The room id was looked up again already: that happens once per drop. */
  resolvedAgain: boolean;
  /** The wait the last `RateLimitError` asked for. */
  retryAfterMs: number | undefined;
  /** The last attempt's failure. */
  lastError: ConnectorError | undefined;
}

/**
 * A connection to one user's TikTok LIVE. Attach listeners, then call
 * {@link TikTokLiveConnection.connect}: every event from then on reaches them.
 *
 * Once connected, the connection reconnects on its own when the WebSocket
 * drops (see `reconnect` in {@link ConnectOptions}), carrying on from where
 * the stream was, without repeating messages. It stops for good on
 * `disconnect()`, when the LIVE ends, when the `signal` aborts, or when the
 * reconnect attempts run out.
 *
 * ```ts
 * const connection = new TikTokLiveConnection("username");
 * connection.on("chat", (chat) => console.log(chat.user?.nickname, chat.content));
 * connection.on("disconnected", ({ reason }) => console.log("stopped:", reason));
 * await connection.connect();
 * ```
 */
export class TikTokLiveConnection extends TypedEmitter<WebcastEventMap> {
  /** The username, normalized: no `@`, no URL. */
  readonly username: string;
  readonly #options: ResolvedOptions;
  readonly #logger: Logger;
  readonly #signer: Signer;
  readonly #http: HttpClient;
  readonly #decodeOptions: DecodeOptions;
  readonly #context: DispatchContext;
  #state: ConnectionState = "idle";
  #roomId: string | null;
  #run: Run | undefined;
  // The last stop's socket closing, for disconnect() calls after it.
  #closing: Promise<void> = Promise.resolve();

  /**
   * @param username A TikTok username: `name`, `@name` or a profile or LIVE URL.
   * @param options How to connect; every option has a default.
   * @throws `InvalidUsernameError` when `username` isn't a username.
   * @throws `RangeError` or `TypeError` when an option is out of range.
   */
  constructor(username: string, options: ConnectOptions = {}) {
    super();
    this.username = normalizeUsername(username);
    this.#options = resolveOptions(options);
    this.#signer = this.#options.signer ?? new EulerSigner();
    this.#roomId = this.#options.roomId ?? null;
    const logger = safeLogger(this.#options.logger);
    this.#logger = logger;
    // One cookie jar and device id for the connection's whole life.
    this.#http = new HttpClient({
      fetch: this.#options.fetch,
      timeoutMs: this.#options.requestTimeoutMs,
      clientParams: this.#options.clientParams,
      headers: this.#options.headers,
      session: this.#options.session,
      logger,
    });
    this.#decodeOptions = {
      onUnsafeInteger: createUnsafeIntegerReporter((path, value) => {
        logger(
          "warn",
          `${path} is ${value}, past Number.MAX_SAFE_INTEGER: its number value is rounded`,
          { path, value: value.toString() },
        );
      }),
    };
    this.#context = {
      processInitialData: this.#options.processInitialData,
      // One set for the connection's life: duplicates are dropped across reconnects.
      recentIds: new RecentIds(this.#options.dedupeSize),
      decodeOptions: this.#decodeOptions,
      listenerCount: (event) => this.listenerCount(event),
      emit: <K extends EventName<WebcastEventMap>>(
        event: K,
        payload: WebcastEventMap[K],
      ): void => {
        this.emit(event, payload);
      },
      reportError: (error) => this.#reportError(error),
      endStream: (action) => {
        if (this.#run !== undefined) this.#endStream(this.#run, action);
      },
    };
  }

  /** Where the connection is in its lifecycle. */
  get state(): ConnectionState {
    return this.#state;
  }

  /**
   * The room id: the `roomId` option, or the one `connect()` resolved. `null`
   * until then.
   */
  get roomId(): string | null {
    return this.#roomId;
  }

  /**
   * Connects: resolves the room id (unless known), checks that the room is
   * LIVE, signs the connection, opens the WebSocket and enters the room. Emits
   * `connected` and resolves with the room id.
   *
   * The first connect is not retried. It rejects with a `ConnectorError` and
   * the state becomes `disconnected`, without a `disconnected` event:
   * `RoomNotFoundError`, `OfflineError`, `SignError` and its subclasses,
   * `TimeoutError`, `WebSocketError`, `ProtocolError` or `AbortError`. It
   * rejects with code `INVALID_STATE`, changing nothing, when the connection
   * isn't `idle` or `disconnected`. Reconnects only follow a successful
   * connect.
   */
  async connect(): Promise<ConnectResult> {
    if (this.#state !== "idle" && this.#state !== "disconnected") {
      throw new ConnectorError(
        "INVALID_STATE",
        `connect() can't be called while the connection is ${this.#state}`,
      );
    }
    const run = new Run();
    this.#run = run;
    this.#state = "connecting";
    const external = this.#options.signal;
    try {
      if (external !== undefined) {
        if (external.aborted) throw this.#abortedBySignal(external);
        const onAbort = () => {
          void this.#stop(run, "aborted", this.#abortedBySignal(external));
        };
        external.addEventListener("abort", onAbort, { once: true });
        run.unlink = () => external.removeEventListener("abort", onAbort);
      }
      this.#log("debug", `Connecting to @${this.username}`);
      return { roomId: await this.#attempt(run, 0, false) };
    } catch (error) {
      const failure = this.#failure(run, error);
      void this.#stop(run, "user");
      throw failure;
    }
  }

  /**
   * Stops the connection for good: cancels a connect or reconnect in
   * progress, closes the WebSocket, and emits `disconnected` with reason
   * `user` when the connection was established. Resolves once the socket is
   * closed. Calling it again, or before `connect()`, does nothing.
   */
  disconnect(): Promise<void> {
    const run = this.#run;
    return run === undefined ? this.#closing : this.#stop(run, "user");
  }

  /**
   * Fetches the gifts TikTok offers. With a room id (after `connect()`, or
   * from the `roomId` option) it tries the room's own list first, then the
   * signer's list for the room; then, or without a room id, the list for
   * `options.region` and `options.language` (default `US` and `en-US`). The
   * result says which source answered. Rejects with a `ConnectorError` with
   * code `GIFTS_UNAVAILABLE` only when every source failed.
   */
  async fetchGifts(options: FetchGiftsOptions = {}): Promise<GiftList> {
    return fetchGiftList(
      {
        roomId: this.#roomId,
        region: options.region ?? DEFAULT_GIFT_OPTIONS.region,
        language: options.language ?? DEFAULT_GIFT_OPTIONS.language,
      },
      this.#roomContext(this.#options.signal ?? NEVER_ABORTED),
    );
  }

  /**
   * Destroys the current socket at once, as a network failure would, so the
   * connection reconnects. For `yarn smoke --drop-after`; not public API.
   *
   * @internal
   */
  _terminateSocket(): void {
    this.#run?.session?.terminate();
  }

  /** Logs a listener that threw, instead of the default process warning. */
  protected override onListenerError(
    error: unknown,
    event: EventName<WebcastEventMap>,
  ): void {
    this.#logger("error", `A listener of the "${event}" event threw`, {
      error,
    });
  }

  // One try at getting into the room: find the room, sign, open the socket.
  // `attempt` is 0 for the first connect, else the reconnect attempt;
  // `resolveRoom` asks for the room id to be looked up again. Resolves with
  // the room id once connected; throws for every failure, an OfflineError
  // when the room isn't LIVE.
  async #attempt(
    run: Run,
    attempt: number,
    resolveRoom: boolean,
  ): Promise<string> {
    const context = this.#roomContext(run.signal);
    const found = await this.#findRoom(run, context, attempt, resolveRoom);
    const { roomId, batch } = await this.#sign(run, context, found);
    await this.#enter(run, roomId, batch, attempt);
    return roomId;
  }

  // The room id, looked up when asked or when none is known, and checked to
  // be LIVE on the first connect and, with checkLiveBeforeRetry, before a
  // reconnect.
  async #findRoom(
    run: Run,
    context: RoomContext,
    attempt: number,
    resolveRoom: boolean,
  ): Promise<string> {
    let roomId = attempt === 0 ? this.#options.roomId : this.#roomId;
    if (resolveRoom || !roomId) {
      roomId = await resolveRoomId(this.username, context);
      this.#check(run);
      this.#log("debug", `@${this.username} is in room ${roomId}`);
    }
    this.#roomId = roomId;
    const reconnect = this.#options.reconnect;
    if (
      attempt === 0 ||
      (reconnect !== false && reconnect.checkLiveBeforeRetry)
    ) {
      const live = await checkLive(roomId, context);
      this.#check(run);
      if (live === false) {
        throw new OfflineError(`@${this.username} isn't LIVE`, { roomId });
      }
    }
    return roomId;
  }

  // Signs the connection, resuming from the run's cursor, within
  // requestTimeoutMs (callSigner also turns what the signer throws into
  // ConnectorErrors). The cookies go to the jar; the body is the first batch,
  // with the push server and cursor the socket needs. The signer may name the
  // room it connected to.
  async #sign(
    run: Run,
    context: RoomContext,
    roomId: string,
  ): Promise<{ roomId: string; batch: FetchResult }> {
    const sessionCookies = this.#http.sessionCookieHeader();
    const request = {
      roomId,
      cursor: run.cursor,
      ...(sessionCookies === undefined ? {} : { sessionCookies }),
    };
    const signed = checkSigned(
      await callSigner("The signed connect", context.signContext, (ctx) =>
        this.#signer.fetchConnect(request, ctx),
      ),
    );
    this.#check(run);
    this.#http.addCookies(signed.cookies);
    const batch = decodeFetchResult(signed.body, this.#decodeOptions);
    if (batch.pushServer === "") {
      throw new ProtocolError("The signed connect has no push server");
    }
    if (batch.cursor === "") {
      throw new ProtocolError("The signed connect has no cursor");
    }
    this.#log("debug", "Signed the connection", {
      roomId,
      requestId: signed.requestId,
      agentId: signed.agentId,
    });
    return { roomId: this.#signedRoom(signed.roomId, roomId), batch };
  }

  // The room the signer says it connected to (Euler Stream's x-room-id)
  // replaces the requested one, when it is a room id.
  #signedRoom(signed: string | undefined, roomId: string): string {
    if (signed === undefined || signed === roomId) return roomId;
    if (!NUMERIC_ID.test(signed)) {
      this.#log("warn", "The signer named a room id that isn't one", {
        roomId: signed,
      });
      return roomId;
    }
    this.#roomId = signed;
    return signed;
  }

  // Opens a session and, once it is in the room, takes it over: state
  // `connected`, the `connected` event, then the signed batch and the batches
  // that arrived meanwhile, in order.
  async #enter(
    run: Run,
    roomId: string,
    batch: FetchResult,
    attempt: number,
  ): Promise<void> {
    const session = new WebcastSession();
    run.session = session;
    run.live = false;
    run.pending = [];
    // Set when the session ends before this attempt takes it over.
    let ended: SessionClosed | undefined;
    // A session emits no batch once it is closing, so these are the run's.
    session.on("batch", ({ result }) => {
      if (run.live) this.#dispatchBatch(run, result);
      else run.pending.push(result);
    });
    session.on("error", (error) => this.#reportError(error));
    session.on("closed", (closed) => {
      if (run.session !== session) return;
      run.session = undefined;
      if (run.live) this.#drop(run, closed);
      else ended = closed;
    });
    await session.open({
      url: this.#webSocketUrl(roomId, batch),
      headers: mergeHeaders(
        webSocketHeaders({ Cookie: this.#http.cookieHeader() }),
        this.#options.headers,
      ),
      roomId,
      connectTimeoutMs: this.#options.connectTimeoutMs,
      heartbeatIntervalMs: this.#options.heartbeatIntervalMs,
      idleTimeoutMs: this.#options.idleTimeoutMs,
      signal: run.signal,
      decodeOptions: this.#decodeOptions,
      logger: this.#logger,
    });
    this.#check(run);
    // The socket closed between entering the room and this line.
    if (ended !== undefined) throw ended.error;

    run.live = true;
    run.established = true;
    this.#state = "connected";
    this.#log("info", `Connected to room ${roomId}`, { attempt });
    this.emit("connected", { roomId, reconnected: attempt > 0, attempt });
    // The signed connect's messages are the room's recent backlog: skipped on
    // the first connect unless processInitialData, always dispatched after a
    // reconnect (they may hold the gap; duplicates are dropped).
    if (attempt > 0 || this.#options.processInitialData) {
      this.#dispatchBatch(run, batch);
    } else {
      this.#skipBatch(run, batch);
    }
    const pending = run.pending;
    run.pending = [];
    for (const result of pending) this.#dispatchBatch(run, result);
  }

  // The live session ended without the connection asking for it.
  #drop(run: Run, closed: SessionClosed): void {
    run.live = false;
    const reason = DROP_REASONS[closed.reason];
    const { error } = closed;
    const reconnect = this.#options.reconnect;
    if (reconnect === false || reconnect.maxAttempts === 0) {
      void this.#stop(run, reason, error);
      return;
    }
    this.#log("warn", `The connection dropped (${reason}): reconnecting`, {
      error,
    });
    this.#state = "reconnecting";
    this.emit("disconnected", { reason, error, willReconnect: true });
    void this.#reconnect(run, reason, reconnect);
  }

  // Reconnect attempts with backoff until one connects, the run stops, or
  // they run out. Never rejects.
  async #reconnect(
    run: Run,
    reason: DisconnectReason,
    options: Readonly<ReconnectOptions>,
  ): Promise<void> {
    const retry: Retry = {
      reason,
      resolveRoom: false,
      resolvedAgain: false,
      retryAfterMs: undefined,
      lastError: undefined,
    };
    for (let attempt = 1; run.stopped === undefined; attempt++) {
      if (attempt > options.maxAttempts) {
        this.#giveUp(run, attempt - 1, retry.lastError);
        return;
      }
      const delayMs = withRetryAfter(
        backoffDelay(attempt, options),
        retry.retryAfterMs,
      );
      this.#log("info", `Reconnecting in ${delayMs} ms (attempt ${attempt})`, {
        reason: retry.reason,
      });
      this.emit("reconnecting", { attempt, delayMs, reason: retry.reason });
      const { resolveRoom } = retry;
      retry.resolveRoom = false;
      if (resolveRoom) retry.resolvedAgain = true;
      try {
        this.#check(run);
        await sleep(delayMs, undefined, { signal: run.signal });
        await this.#attempt(run, attempt, resolveRoom);
        return;
      } catch (error) {
        if (!this.#afterFailure(run, error, retry)) return;
      }
    }
  }

  // Handles a failed reconnect attempt, and sets `retry` up for the next one.
  // False when there is no next one: the run stopped, the LIVE ended, or the
  // failure can't be retried.
  #afterFailure(run: Run, error: unknown, retry: Retry): boolean {
    if (run.stopped !== undefined) return false;
    const failure = this.#failure(run, error);
    // The LIVE ended while the connection was away.
    if (failure instanceof OfflineError) {
      this.#endStream(run, "ended");
      return false;
    }
    retry.lastError = failure;
    this.#reportError(failure);
    if (!retry.resolvedAgain && needsNewRoomId(failure)) {
      retry.resolveRoom = true;
    } else if (!failure.retryable) {
      void this.#stop(run, reasonOf(failure), failure);
      return false;
    }
    retry.retryAfterMs =
      failure instanceof RateLimitError ? failure.retryAfterMs : undefined;
    retry.reason = reasonOf(failure);
    return true;
  }

  #giveUp(run: Run, attempts: number, lastError: ConnectorError | undefined) {
    const error = new ReconnectGiveUpError(
      `Gave up reconnecting after ${attempts} attempts`,
      { attempts, cause: lastError },
    );
    this.#reportError(error);
    void this.#stop(run, "giveUp", error);
  }

  // `run` is the current run.
  #endStream(run: Run, action: StreamEndAction): void {
    this.#log("info", `The LIVE ended (${action})`);
    this.emit("streamEnd", { action });
    void this.#stop(run, "streamEnd");
  }

  // Ends a run for good: cancels what it waits for, closes its socket, and
  // emits `disconnected` when it had connected. Resolves once the socket is
  // closed.
  #stop(
    run: Run,
    reason: DisconnectReason,
    error?: ConnectorError,
  ): Promise<void> {
    if (this.#run !== run) return this.#closing;
    this.#run = undefined;
    run.unlink();
    run.stopped =
      error instanceof AbortError
        ? error
        : new AbortError(
            reason === "user"
              ? "disconnect() was called"
              : `The connection stopped (${reason})`,
          );
    run.controller.abort(run.stopped);
    const session = run.session;
    run.session = undefined;
    run.live = false;
    run.pending = [];
    this.#state = "disconnected";
    this.#closing = session === undefined ? Promise.resolve() : session.close();
    if (run.established) {
      this.#log("info", `Disconnected (${reason})`, { error });
      this.emit("disconnected", {
        reason,
        ...(error === undefined ? {} : { error }),
        willReconnect: false,
      });
    }
    return this.#closing;
  }

  #dispatchBatch(run: Run, batch: FetchResult): void {
    if (batch.cursor !== "") run.cursor = batch.cursor;
    for (const message of batch.messages) {
      // A message may have ended the stream, or a listener disconnected.
      if (run.stopped !== undefined) return;
      try {
        dispatch(this.#context, message);
      } catch (error) {
        this.#reportError(
          new ConnectorError(
            "INTERNAL",
            `Handling a ${message.method} message failed: ${messageOf(error)}`,
            { cause: error },
          ),
        );
      }
    }
  }

  // The first connect's backlog, without processInitialData: its messages
  // count as seen, so a reconnect's backlog doesn't bring them back. (A
  // signed batch always has a cursor.)
  #skipBatch(run: Run, batch: FetchResult): void {
    run.cursor = batch.cursor;
    for (const { msgId } of batch.messages) {
      if (msgId !== "0") this.#context.recentIds.add(msgId);
    }
  }

  // PROTOCOL.md, "WebSocket": the push server, the default params with the
  // clientParams overrides, the connection's own params, the route params,
  // then the second version_code.
  #webSocketUrl(roomId: string, batch: FetchResult): string {
    const params = new Map(
      Object.entries(
        webSocketParams(this.#http.userAgent, this.#options.clientParams),
      ),
    );
    params.set("compress", "gzip");
    params.set("room_id", roomId);
    params.set("internal_ext", batch.internalExt);
    params.set("cursor", batch.cursor);
    // A key that is there already keeps its place.
    for (const [key, value] of Object.entries(
      routeParamsToRecord(batch.routeParams),
    )) {
      if (value !== "") params.set(key, value);
    }
    const query = new URLSearchParams([...params]).toString();
    return `${batch.pushServer}?${query}${WEBSOCKET_URL_SUFFIX}`;
  }

  #roomContext(signal: AbortSignal): RoomContext {
    return {
      http: this.#http,
      signer: this.#signer,
      signContext: {
        fetch: this.#options.fetch,
        signal,
        timeoutMs: this.#options.requestTimeoutMs,
        userAgent: this.#http.userAgent,
        logger: this.#logger,
      },
    };
  }

  // Throws when the run stopped while it was waiting.
  #check(run: Run): void {
    if (run.stopped !== undefined) throw run.stopped;
  }

  // What a run's step threw, as the ConnectorError to report: the stop's
  // AbortError once the run stopped, whatever the step threw.
  #failure(run: Run, error: unknown): ConnectorError {
    if (run.stopped !== undefined) return run.stopped;
    return isConnectorError(error)
      ? error
      : new ConnectorError("INTERNAL", messageOf(error), { cause: error });
  }

  #abortedBySignal(signal: AbortSignal): AbortError {
    return new AbortError("The signal aborted", { cause: signal.reason });
  }

  #reportError(error: ConnectorError): void {
    if (this.listenerCount("error") > 0) this.emit("error", error);
    else this.#log("error", error.message, { error });
  }

  #log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    this.#logger(level, message, data);
  }
}
