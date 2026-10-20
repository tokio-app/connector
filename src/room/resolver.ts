// Owned by T2 (Phase 1): username → room id, and the live check
// (PROTOCOL.md, "Room id" and "Is the room LIVE?"). connection.ts (T3) calls
// both: keep their signatures.
import { ConnectorError } from "../errors.js";
import type { HttpClient } from "../http/client.js";
import type { SignContext, Signer } from "../signer/types.js";

/** What room lookups need: the HTTP client, the signer for fallbacks, and its context (whose `signal` also aborts HTTP requests). */
export interface RoomContext {
  readonly http: HttpClient;
  readonly signer: Signer;
  readonly signContext: SignContext;
}

/**
 * Resolves a username to its room id: the LIVE page, then TikTok's
 * `api-live/user/room` route, then `signer.resolveRoomId`; the first that
 * answers wins, each within `requestTimeoutMs`. Throws `RoomNotFoundError`
 * (with the steps' errors as `cause`) when none does, and `AbortError` when
 * the signal aborts.
 */
export function resolveRoomId(
  username: string,
  context: RoomContext,
): Promise<string> {
  void context;
  return Promise.reject(
    new ConnectorError(
      "NOT_IMPLEMENTED",
      `resolveRoomId(${username}) is not implemented yet`,
    ),
  );
}

/**
 * Whether a room is LIVE: TikTok's `room/info` route (status 4 is offline),
 * then `signer.fetchRoomInfo`. Resolves `null` when neither answers. Throws
 * only `AbortError`.
 */
export function checkLive(
  roomId: string,
  context: RoomContext,
): Promise<boolean | null> {
  void context;
  return Promise.reject(
    new ConnectorError(
      "NOT_IMPLEMENTED",
      `checkLive(${roomId}) is not implemented yet`,
    ),
  );
}
