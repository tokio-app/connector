// Owned by T2 (Phase 1): the gift list chain, room → signer → region
// (PROTOCOL.md, "Gift list"). The connection's fetchGifts() (T3) calls it:
// keep its signature. src/gifts.ts holds the streak helpers.
import { ConnectorError } from "../errors.js";
import type { GiftList } from "../events.js";
import type { RoomContext } from "./resolver.js";

/** What gift list to fetch. */
export interface GiftListRequest {
  /** The room, when known: without it, only the region list is tried. */
  roomId: string | null;
  /** The region of the region list, as a country code. */
  region: string;
  /** The language of the region list, as a language tag. */
  language: string;
}

/**
 * Fetches a gift list, trying in order: the room's own list, the signer's
 * (`signer.fetchGifts`), then the list for a region and language. Each step
 * runs within `requestTimeoutMs`; a step that fails or returns no gifts
 * passes to the next. Gifts are deduplicated by id. Throws a
 * `ConnectorError` with code `GIFTS_UNAVAILABLE` (the steps' errors as
 * `cause`) when every step fails, and `AbortError` when the signal aborts.
 */
export function fetchGiftList(
  request: GiftListRequest,
  context: RoomContext,
): Promise<GiftList> {
  void context;
  return Promise.reject(
    new ConnectorError(
      "NOT_IMPLEMENTED",
      `fetchGiftList(${request.roomId ?? request.region}) is not implemented yet`,
    ),
  );
}
