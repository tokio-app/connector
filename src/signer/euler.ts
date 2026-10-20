// Owned by T2 (Phase 1): the Euler Stream signer, from Euler Stream's public
// docs (PROTOCOL.md, "Signer"). EulerSigner and EulerSignerOptions are public
// API, frozen in Phase 0B: keep their signatures.
import { ConnectorError } from "../errors.js";
import type { Gift } from "../events.js";
import type {
  RoomInfo,
  SignContext,
  SignRequest,
  SignedConnect,
  Signer,
} from "./types.js";

/** Euler Stream's API server. */
export const DEFAULT_EULER_HOST = "https://tiktok.eulerstream.com";

/** The `client` query parameter Euler Stream uses for its metrics. */
export const DEFAULT_EULER_CLIENT = "ttlive-node";

/** Options of {@link EulerSigner}. */
export interface EulerSignerOptions {
  /** The API server, without a trailing slash. Default `https://tiktok.eulerstream.com`. */
  host?: string;
  /**
   * An Euler Stream API key. It raises the rate limits and unlocks the paid
   * routes of your plan. Only ever sent in the `x-api-key` header.
   */
  apiKey?: string;
  /** The `client` query parameter (Euler Stream's metrics). Default `ttlive-node`. */
  client?: string;
}

function notImplemented(what: string): ConnectorError {
  return new ConnectorError(
    "NOT_IMPLEMENTED",
    `EulerSigner.${what} is not implemented yet`,
  );
}

/**
 * Signs connections with Euler Stream (https://www.eulerstream.com), the
 * default {@link Signer}. Without an API key it uses Euler Stream's anonymous
 * limits. It never sends the TikTok session to Euler Stream.
 */
export class EulerSigner implements Signer {
  readonly #options: Required<Omit<EulerSignerOptions, "apiKey">> &
    Pick<EulerSignerOptions, "apiKey">;

  constructor(options: EulerSignerOptions = {}) {
    this.#options = {
      host: options.host ?? DEFAULT_EULER_HOST,
      client: options.client ?? DEFAULT_EULER_CLIENT,
      apiKey: options.apiKey,
    };
  }

  /** Signs a connection: `GET {host}/webcast/rooms/{room_id}/connect`. */
  fetchConnect(
    request: SignRequest,
    context: SignContext,
  ): Promise<SignedConnect> {
    void context;
    return Promise.reject(
      notImplemented(
        `fetchConnect(${request.roomId}) via ${this.#options.host}`,
      ),
    );
  }

  /** The room id of a username: `GET {host}/webcast/anchors/{unique_id}/room_id`. */
  resolveRoomId(
    uniqueId: string,
    context: SignContext,
  ): Promise<string | null> {
    void context;
    return Promise.reject(notImplemented(`resolveRoomId(${uniqueId})`));
  }

  /** Whether a room is LIVE: `GET {host}/webcast/rooms/{room_id}/room_info`. */
  fetchRoomInfo(
    roomId: string,
    context: SignContext,
  ): Promise<RoomInfo | null> {
    void context;
    return Promise.reject(notImplemented(`fetchRoomInfo(${roomId})`));
  }

  /** A room's gifts: `GET {host}/webcast/rooms/{room_id}/gifts`. */
  fetchGifts(roomId: string, context: SignContext): Promise<Gift[] | null> {
    void context;
    return Promise.reject(
      notImplemented(`fetchGifts(${roomId}) as ${this.#options.client}`),
    );
  }
}
