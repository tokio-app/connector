// Owned by T3 (Phase 1): the connection's state machine. The public signature
// and its JSDoc are frozen since Phase 0B (Tokio and other apps build on them):
// keep them. Phase 2 wires in the resolver, signer, dispatch and gift list.
import { TypedEmitter, type EventName } from "./emitter.js";
import { ConnectorError } from "./errors.js";
import type {
  ConnectionState,
  ConnectResult,
  GiftList,
  WebcastEventMap,
} from "./events.js";
import {
  normalizeUsername,
  resolveOptions,
  type ConnectOptions,
  type FetchGiftsOptions,
  type ResolvedOptions,
} from "./options.js";
import { EulerSigner } from "./signer/euler.js";
import type { Signer } from "./signer/types.js";

function notImplemented(what: string): ConnectorError {
  return new ConnectorError(
    "NOT_IMPLEMENTED",
    `TikTokLiveConnection.${what} is not implemented yet`,
  );
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
  readonly #signer: Signer;
  #state: ConnectionState = "idle";
  #roomId: string | null;

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
  connect(): Promise<ConnectResult> {
    return Promise.reject(notImplemented(`connect() in state ${this.#state}`));
  }

  /**
   * Stops the connection for good: cancels a connect or reconnect in
   * progress, closes the WebSocket, and emits `disconnected` with reason
   * `user` when the connection was established. Resolves once the socket is
   * closed. Calling it again, or before `connect()`, does nothing.
   */
  disconnect(): Promise<void> {
    return Promise.reject(notImplemented("disconnect()"));
  }

  /**
   * Fetches the gifts TikTok offers. With a room id (after `connect()`, or
   * from the `roomId` option) it tries the room's own list first, then the
   * signer's list for the room; then, or without a room id, the list for
   * `options.region` and `options.language` (default `US` and `en-US`). The
   * result says which source answered. Rejects with a `ConnectorError` with
   * code `GIFTS_UNAVAILABLE` only when every source failed.
   */
  fetchGifts(options: FetchGiftsOptions = {}): Promise<GiftList> {
    return Promise.reject(
      notImplemented(
        `fetchGifts(${options.region ?? ""}) with ${this.#signer.constructor.name}`,
      ),
    );
  }

  /** Logs a listener that threw, instead of the default process warning. */
  protected override onListenerError(
    error: unknown,
    event: EventName<WebcastEventMap>,
  ): void {
    this.#options.logger("error", `A listener of the "${event}" event threw`, {
      error,
    });
  }
}
