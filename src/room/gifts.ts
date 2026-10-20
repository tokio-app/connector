// The gift list chain, room → signer → region (PROTOCOL.md, "Gift list"),
// behind the connection's fetchGifts(). src/gifts.ts holds the streak
// helpers.
import { ConnectorError, isConnectorError } from "../errors.js";
import type { Gift, GiftList, GiftSource, Image } from "../events/index.js";
import { callSigner } from "../signer/call.js";
import {
  idOf,
  recordOf,
  throwIfAborted,
  valueAt,
  type RoomContext,
} from "./resolver.js";

/** What gift list to fetch. */
export interface GiftListRequest {
  /** The room, when known: without it, only the region list is tried. */
  roomId: string | null;
  /** The region of the region list, as a country code. */
  region: string;
  /** The language of the region list, as a language tag. */
  language: string;
}

const GIFT_LIST_URL = "https://webcast.tiktok.com/webcast/gift/list/";

function imageOf(value: unknown): Image | undefined {
  const image = recordOf(value);
  if (image === undefined) return undefined;
  const urls = image.url_list;
  return {
    urlList: Array.isArray(urls)
      ? urls.filter((url): url is string => typeof url === "string")
      : [],
    uri: typeof image.uri === "string" ? image.uri : "",
  };
}

function nameOf(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function priceOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

// Whether a gift list entry has a name and a diamond count.
function hasDetails(entry: Record<string, unknown>): boolean {
  return (
    nameOf(entry.name) !== undefined &&
    priceOf(entry.diamond_count) !== undefined
  );
}

// A gift list entry: `id` (a number or a decimal string), `name`,
// `diamond_count` and `image`. `null` without an id, or, with
// `requireDetails`, without a name or a diamond count.
function giftOf(value: unknown, requireDetails: boolean): Gift | null {
  const entry = recordOf(value);
  const id = idOf(entry?.id);
  if (entry === undefined || id === null) return null;
  if (requireDetails && !hasDetails(entry)) return null;
  const gift: Gift = {
    id,
    name: nameOf(entry.name) ?? "",
    diamondCount: priceOf(entry.diamond_count) ?? 0,
  };
  const image = imageOf(entry.image);
  if (image !== undefined) gift.image = image;
  return gift;
}

/** `gifts` without repeated ids, the first of each kept. */
function uniqueGifts(gifts: readonly Gift[]): Gift[] {
  const byId = new Map<string, Gift>();
  for (const gift of gifts) if (!byId.has(gift.id)) byId.set(gift.id, gift);
  return [...byId.values()];
}

/**
 * The gifts of a gift list answer's container (TikTok's `data`): the first
 * non-empty array of `gifts`, `giftList` and `pages[0].gifts`, deduplicated
 * by id. Entries without an id are skipped; with `requireDetails`, so are
 * those without a name or a diamond count.
 */
export function giftsIn(container: unknown, requireDetails = false): Gift[] {
  const list = [
    valueAt(container, "gifts"),
    valueAt(container, "giftList"),
    valueAt(container, "pages", 0, "gifts"),
  ].find((candidate) => Array.isArray(candidate) && candidate.length > 0);
  if (!Array.isArray(list)) return [];
  const gifts: Gift[] = [];
  for (const entry of list) {
    const gift = giftOf(entry, requireDetails);
    if (gift !== null) gifts.push(gift);
  }
  return uniqueGifts(gifts);
}

type Source = readonly [GiftSource, () => Promise<readonly Gift[] | null>];

// The sources that apply to `request`, in order.
function sourcesFor(request: GiftListRequest, context: RoomContext): Source[] {
  const { http, signer, signContext } = context;
  const { signal } = signContext;
  const sources: Source[] = [];
  const { roomId } = request;
  if (roomId !== null) {
    sources.push([
      "room",
      async () =>
        giftsIn(
          valueAt(
            await http.getJson(GIFT_LIST_URL, {
              params: { room_id: roomId },
              signal,
            }),
            "data",
          ),
        ),
    ]);
    const fetchGifts = signer.fetchGifts?.bind(signer);
    if (fetchGifts !== undefined) {
      sources.push([
        "signer",
        () =>
          callSigner("The signer's gift list", signContext, (ctx) =>
            fetchGifts(roomId, ctx),
          ),
      ]);
    }
  }
  sources.push([
    "region",
    async () =>
      giftsIn(
        valueAt(
          await http.getJson(GIFT_LIST_URL, {
            bare: true,
            params: {
              aid: "1988",
              app_language: request.language,
              region: request.region,
              sys_region: request.region,
            },
            headers: { Accept: "application/json" },
            signal,
          }),
          "data",
        ),
      ),
  ]);
  return sources;
}

/**
 * Fetches a gift list, trying in order: the room's own list, the signer's
 * (`signer.fetchGifts`), then the list for a region and language. Each step
 * runs within `requestTimeoutMs`; a step that fails or returns no gifts
 * passes to the next. Gifts are deduplicated by id. Throws a
 * `ConnectorError` with code `GIFTS_UNAVAILABLE` (the steps' errors as
 * `cause`, an array) when every step fails, and `AbortError` when the signal
 * aborts.
 */
export async function fetchGiftList(
  request: GiftListRequest,
  context: RoomContext,
): Promise<GiftList> {
  const { logger, signal } = context.signContext;
  const sources = sourcesFor(request, context);
  const errors: unknown[] = [];
  for (const [source, fetchSource] of sources) {
    try {
      const gifts = uniqueGifts((await fetchSource()) ?? []);
      if (gifts.length === 0) {
        throw new ConnectorError(
          "GIFTS_UNAVAILABLE",
          `The ${source} gift list has no gifts`,
        );
      }
      logger("debug", `Gift list from the ${source} source`, {
        source,
        gifts: gifts.length,
      });
      return { gifts, source };
    } catch (error) {
      throwIfAborted(error, signal);
      logger("debug", `Gift list from the ${source} source failed`, { error });
      errors.push(error);
    }
  }
  const codes = sources.map(
    ([source], index) =>
      `${source}: ${isConnectorError(errors[index]) ? errors[index].code : "failed"}`,
  );
  throw new ConnectorError(
    "GIFTS_UNAVAILABLE",
    `No gift list source answered (${codes.join(", ")})`,
    { retryable: true, cause: errors },
  );
}
