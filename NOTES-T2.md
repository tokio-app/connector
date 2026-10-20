# Notes from T2 (Phase 1) for the Phase 2 integrator

T2 wrote `src/http/client.ts`, `src/util/cookies.ts`, `src/room/resolver.ts`, `src/room/gifts.ts` and `src/signer/euler.ts`. No frozen file was edited. Below: where the code differs from `PROTOCOL.md` or the stubs, what T3 needs to know, and the proposed `PROTOCOL.md` changes. Delete this file once they're merged.

## Contract notes for T3 (`connection.ts`)

- **Signatures kept from the stubs.** `resolveRoomId(username, context)` and `checkLive(roomId, context)` are functions (not a `RoomResolver` class); `fetchGiftList(request, context)` too. `RoomContext` is unchanged: `{ http, signer, signContext }`, and `signContext.signal` aborts the HTTP requests as well.
- **`HttpClientOptions.deviceId?`** (new, optional): the `device_id` client param. Without it the client makes 19 random digits once, so one `HttpClient` per connection gives one device id per connection.
- **`HttpClient.getBytes()`** (new) next to `getText()` and `getJson()`.
- **`HttpClient.sessionCookieHeader()`** is `sessionid=…; tt-target-idc=…` (the two cookies `SignRequest.sessionCookies` documents), not the five session cookies.
- **`addCookies(signed.cookies)`** is T3's call after `fetchConnect`; `cookieHeader()` then holds them for the WebSocket's `Cookie`.
- **`checkLive`** resolves `true`, `false` or `null` (inconclusive) and only throws `AbortError`.
- **`resolveRoomId`** throws `RoomNotFoundError` with `cause` = an array of the three steps' errors (in order), and `retryable: true` when any step failed for a reason that can pass (a retryable `ConnectorError`: network, timeout, 429/5xx). `fetchGiftList`'s `GIFTS_UNAVAILABLE` error has the same array `cause` and is `retryable: true`.
- **`EulerSigner` constructor** now throws a `TypeError` for a `host` that isn't a URL, and strips trailing slashes. An empty or blank `apiKey` counts as none.

## Proposed `PROTOCOL.md` changes

### Cookies: values go back as they came

The jar no longer percent-encodes every name and value as 2.4.0 did (`encodeURIComponent` on both, after `decodeURIComponent` on the way in). That changes bytes of values that hold `=`, `+`, `/` or `:` (base64 tokens such as `msToken`), which a browser sends back verbatim. The jar now keeps values as set and percent-encodes only what a cookie can't hold.

```diff
-Every `Set-Cookie` header TikTok answers with updates the jar (its name and value; attributes ignored), and so do the signer's cookies ([Signer](#signer)). The jar is serialized as `name=value` pairs joined by `; `, names and values percent-encoded as in 2.4.0 [TLC: cookie-jar.ts, `serializeCookieObject`]. The `Cookie` header of every request and of the WebSocket is the whole jar.
+Every `Set-Cookie` header TikTok answers with updates the jar (its name and value; attributes ignored), and so do the signer's cookies ([Signer](#signer)). The jar is serialized as `name=value` pairs joined by `; `. Values go back as they were set, like a browser sends them; only characters a cookie can't hold (RFC 6265 cookie-octets, plus `"`) are percent-encoded: spaces, `;`, `,`, `\`, control and non-ASCII characters, and in names anything that isn't a token character. 2.4.0 decoded every value and percent-encoded every name and value [TLC: cookie-jar.ts, `processSetCookieHeader`, `serializeCookieObject`], which changes base64 values (`=`, `+`, `/`). The `Cookie` header of every request and of the WebSocket is the whole jar; a `Cookie` in the `headers` option replaces it on HTTP requests.
```

### `x-set-tt-cookie`

`parseSignerCookies` keeps every `name=value` pair: the header is split at `;` and at a comma that starts a new pair (`, name=`), so one cookie, a `Cookie`-style list and `Set-Cookie` lines joined by `, ` all parse; an `Expires` date's comma doesn't split. Pairs named like a `Set-Cookie` attribute (`Path`, `Domain`, `Expires`, `Max-Age`, `SameSite`, `Priority`, any case) and value-less flags (`HttpOnly`, `Secure`, `Partitioned`) are dropped. A header that is missing, empty, or holds no pair is a `ProtocolError`. Proposed addition after "…`Partitioned`) (see [Open items](#open-items))." in the 200 bullet:

```diff
+  A comma followed by `name=` also starts a new pair, so `Set-Cookie` lines joined by `, ` parse too (an `Expires` date's comma doesn't split). A header without any pair is a `ProtocolError`, like a missing one. An empty body is a `ProtocolError` too.
```

### Euler Stream: no User-Agent of our own

Euler's docs (API reference, quickstart, rate limits, API keys) never ask for a client User-Agent, and the T2 brief said to add one only if they do. `EulerSigner` sets only `Accept` and `x-api-key`; Node's `fetch` sends its default `User-Agent: node`. The `client` query parameter already identifies the library for Euler's metrics.

```diff
-**Requests.** `EulerSigner` names itself in its own `User-Agent` header to Euler Stream (2.4.0 sent `tiktok-live-connector/<version> <platform>` [TLC: euler/config.ts]); the TikTok User-Agent goes in the `user_agent` query parameter.
+**Requests.** `EulerSigner` sends only `Accept` and, with a key, `x-api-key`: the docs ask for no User-Agent, so `fetch`'s default goes (2.4.0 sent `tiktok-live-connector/<version> <platform>` [TLC: euler/config.ts]); the `client` query parameter names the library, and the TikTok User-Agent goes in the `user_agent` query parameter.
```

### Euler fallback routes

`resolveRoomId`, `fetchRoomInfo` and `fetchGifts` return `null` for any 4xx except 429 (401/402/403: the plan lacks the route; 404: no LIVE profile), throw `RateLimitError` on 429, `SignError` on 5xx and `ProtocolError` for a 2xx body that isn't JSON. `fetchGifts` sends no `webcast_language`: `Signer.fetchGifts(roomId, context)` has no language. Proposed text for "Room gifts":

```diff
-`GET {host}/webcast/rooms/{room_id}/gifts?webcast_language={language}` [Euler: …]
+`GET {host}/webcast/rooms/{room_id}/gifts` (without `webcast_language`: `Signer.fetchGifts` takes no language) [Euler: …]
```

and a sentence under "Euler Stream": "The fallback routes answer `null` on any 4xx but 429 (the plan lacks the route, or Euler Stream has no answer); a 429 throws `RateLimitError`, a 5xx `SignError`, a body that isn't JSON `ProtocolError`." If a language matters later, `fetchGifts?(roomId, context, options?: { language?: string })` would be a non-breaking addition to `signer/types.ts`.

### Room id, step 1: the universal data fallback (open item 13)

```diff
-… and read `LiveRoom.liveRoomUserInfo.user.roomId`. A missing tag, invalid JSON or a missing or empty room id fails the step …
+… and read `LiveRoom.liveRoomUserInfo.user.roomId`; when that is missing, the state is searched breadth first (depth 16, 50 000 nodes) for a `liveRoomUserInfo.user.roomId`, or an object whose `uniqueId` is the username (any case) with a `roomId`. When `SIGI_STATE` is missing, invalid or has no room id, the same is tried with the page's `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">` (attributes in any order), whose layout for LIVE pages isn't known yet. A room id is a decimal string other than `0` (or a positive safe integer). Nothing found fails the step …
```

Step 2 keeps 2.4.0's rule (a missing `statusCode` passes; any value but `0` fails), which reads slightly looser than "`statusCode` must be `0`".

### Gift list parsing

```diff
-Parsing: the gift array is `data.gifts`, else `data.giftList`, else `data.pages[0].gifts` (Tokio's rule). Each gift maps …
+Parsing: the gift array is the first non-empty one of `data.gifts`, `data.giftList` and `data.pages[0].gifts` (Tokio's rule took the first present one, even empty). Entries without a usable id (a positive number or a decimal string) are skipped; a missing `name` gives `""` and a missing `diamond_count` `0`. Each gift maps …
```

The region request is exactly what the spec and Tokio send (`aid`, `app_language`, `region`, `sys_region`; `Accept: application/json` and the User-Agent; no cookies), as a `bare` request: neither the default client params nor the `clientParams` option apply. (The T2 brief said "plus the default client params"; `PROTOCOL.md` and the stub's `bare` option say otherwise, and Tokio's working request has none.) The `headers` option's User-Agent does apply.

### HTTP param and header order

Worth a line under "HTTP requests to TikTok": query = defaults with `device_id`, then `clientParams`, then the request's own (`room_id`, `uniqueId`, `sourceType`), so `clientParams` can't override those; headers = defaults and `Cookie`, then `headers`, then the request's own. Non-2xx answers are `HttpError`s quoting the first 200 characters of the body and the URL without its query; a 2xx body that isn't JSON is an `HttpError` too (not retryable). Request URLs are never logged with their query.

## What Euler Stream's docs said on 2026-10-19 (T2's read)

Checked with the docs' "View as Markdown" pages (`/api/docs/md/api/<section>/<Operation>?lang=curl`), which hold the full parameter tables.

- **Connect (`FetchWebcastURL`)**: matches `PROTOCOL.md` (query `client`, `cursor`, `user_agent`, `client_enter`, `platform` `mobile|web`; optional `x-oauth-token` and `x-cookie-header`; 200 `application/protobuf`, 429/500/503 `{ code, message }`; the curl sample sends `x-api-key` to `https://tiktok.eulerstream.com`). But the rendered HTML page now groups the two optional headers under "One of — One authentication header required", and describes `x-cookie-header` as "Raw TikTok cookies for direct authentication". If the anonymous connect starts failing with 401/403, this is why: check it in the smoke run.
- **Room id (`RetrieveRoomId`)**: matches (`creator_id_type`, `{ code, message, ok, routes_attempted, is_live, room_id, room_status, source, detail: { reason } }`, 429/500/503).
- **Room info by room id**: `data` is `{ unique_id, user, room_info: { status, is_live, id, cover_url, title, start_time, stream_urls }, raw }`; optional `x-image-source` header. Matches.
- **Room gifts**: `response` is `{ room_id, page_gifts: number[], gift_overrides, panel_refresh_data }`; the page now says to use `/webcast/gift_info` with it for the full catalog. The Gifts section lists `GET /webcast/gifts/catalog` (paginated), `/webcast/gifts/catalog/{gift_id}` and `POST /webcast/gifts/catalog/search`, which "do not count toward rate limits". Joining `page_gifts` with the catalog could make the signer source real (open item 2); not done.
- **Rate limits**: the page names no headers; it says headers in the response tell when to retry, and points to `/webcast/rate_limits`.
- **User-Agent**: never asked for.

## Open items left for the smoke run

1. `x-set-tt-cookie`'s real format (open item 3): log the pair count and names (not values) in a smoke run.
2. Whether the anonymous connect still works without `x-oauth-token` / `x-cookie-header` (see above).
3. Whether TikTok answers the unsigned room gift list (open item 1).
4. The LIVE page: whether `SIGI_STATE` is still served, and where `__UNIVERSAL_DATA_FOR_REHYDRATION__` keeps the room id if not (open item 13).
5. Whether `ratelimit-reset` from Euler is seconds from now (assumed; a value of 10⁹ or more is read as a Unix time in seconds, 10¹² or more in milliseconds).
