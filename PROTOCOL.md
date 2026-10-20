# Protocol

How `@tokioapp/connector` talks to TikTok LIVE and to its signer. The code implements this document; change both together.

TikTok doesn't document any of it. Everything here was learned by reading the MIT-licensed references in `reference/` (see `AGENTS.md`, Licensing) and Euler Stream's public docs, then written down in our own words. Paths in brackets point at the evidence:

- `[TLC: …]`: `reference/src/TikTok-Live-Connector/…`, tiktok-live-connector 2.4.0 at commit `54ff9a9` (the npm build is in `reference/tiktok-live-connector-2.4.0/package`). "2.4.0" below means this release.
- `[proto: …]`: `reference/src/TikTok-Webcast-Protobuf/src/slim/v3/…`, the `.proto` sources of tiktok-live-proto 0.2.3 at commit `9e34a85`.
- `[Euler: …]`: <https://www.eulerstream.com/docs>, read on 2026-10-19 (the API reference pages and the OpenAPI data they embed).

## Contents

- [Overview](#overview)
- [Username](#username)
- [HTTP requests to TikTok](#http-requests-to-tiktok)
- [Room id](#room-id)
- [Is the room LIVE?](#is-the-room-live)
- [Signer](#signer)
- [WebSocket](#websocket)
- [Frames](#frames)
- [Batches](#batches)
- [Field numbers](#field-numbers)
- [Routing](#routing)
- [Reconnects](#reconnects)
- [Gift list](#gift-list)
- [Errors](#errors)
- [What replaces 2.4.0's globals and environment variables](#what-replaces-240s-globals-and-environment-variables)
- [Open items](#open-items)

## Overview

A connection goes through these steps; a reconnect starts again at step 3 (at step 2 after a `RoomNotFoundError` or a 4xx from the signer), carrying the last cursor ([Reconnects](#reconnects)).

1. Normalize the username ([Username](#username)).
2. Resolve the room id, unless the `roomId` option gives it ([Room id](#room-id)).
3. Check that the room is LIVE ([Is the room LIVE?](#is-the-room-live)).
4. Ask the signer for a signed connect: the first batch of messages, the WebSocket push server, its parameters, and cookies ([Signer](#signer)).
5. Open the WebSocket with those ([WebSocket](#websocket)), enter the room, send heartbeats, ack batches that ask for it ([Frames](#frames)).
6. Decode each batch, drop duplicates and history, route each message to its events ([Batches](#batches), [Routing](#routing)).

## Username

`normalizeUsername()` turns what a user types into a username:

1. Trim whitespace.
2. Drop a leading TikTok URL: `http://` or `https://` (optional), `www.` or `m.` (optional), `tiktok.com/`, any letter case.
3. Drop one leading `@`.
4. Cut at the first `/`, `?` or `#` (drops `/live`, a query string, a fragment, a trailing slash), and trim again.
5. What's left must be letters or digits of any script, `_`, `.` or `-`; otherwise `InvalidUsernameError`. This is broader than what TikTok allows (letters, digits, `_` and `.`), so a valid username is never refused.

`@name`, `name`, `https://www.tiktok.com/@name/live?lang=en` and `tiktok.com/@name/` all give `name`, spaces around them included.

2.4.0 did less: it removed the first `https://www.tiktok.com/`, the first `/live` and the first `@`, then trimmed, and only refused non-strings [TLC: src/lib/ws/lib/proto-utils.ts, `validateAndNormalizeUniqueId`].

## HTTP requests to TikTok

Every request goes to `https://www.tiktok.com` or `https://webcast.tiktok.com` with the client params as its query string, the headers below, and the cookie jar. 2.4.0 built `http://` URLs for these hosts by accident (its secure-host check is inverted, so only loopback hosts got `https`) [TLC: src/lib/web/lib/http-client.ts, `isSecure`, `getBaseUrl`]; we always use `https`.

Each request must finish within `requestTimeoutMs` (default 10 000 ms, 2.4.0's `TIKTOK_CLIENT_TIMEOUT`), else `TimeoutError` with phase `request`. A request that fails before any response is a `ConnectorError` with code `NETWORK` (retryable). A status other than 2xx is an `HttpError` whose message quotes the first 200 characters of the body and the URL without its query; a 2xx body that should be JSON and isn't is an `HttpError` too, not retryable. URLs are never logged or quoted with their query (it holds the device id).

The `clientParams` option adds to, or replaces, the query parameters, and `headers` the headers, of every request and of the WebSocket (the hotfix path). Header names are merged case-insensitively: `user-agent` replaces `User-Agent`. All defaults live in `src/http/params.ts`. The order, later winning:

- Query: the defaults with `device_id`, then `clientParams`, then the request's own parameters (`room_id`, `uniqueId`, `sourceType`), so `clientParams` can't change which room or user a request is about.
- Headers: the defaults and `Cookie` (the jar), then `headers`, then the request's own (`Accept` of the region gift list). A `Cookie` in `headers` replaces the jar on HTTP requests.

### Client params

The values are 2.4.0's defaults, the ones Tokio sent before this library [TLC: src/lib/web/defaults.ts, `DEFAULT_HTTP_CLIENT_PARAMS`]. 2.4.0 filled the device, location and screen ones from presets: by default the device is preset 6 (Edge on macOS), the location `en-DE` / `DE` / `Europe/Berlin`, and the screen 1920 × 1080; three environment variables could randomize them [TLC: src/lib/web/config.ts, `getWebConfig`; src/lib/web/lib/device-presets.ts]. We use those defaults, without randomizing. `browser_name` and `browser_version` are the User-Agent split at its first `/`.

| Param                     | Default                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `aid`                     | `1988`                                                                                                                            |
| `app_language`            | `en`                                                                                                                              |
| `app_name`                | `tiktok_web`                                                                                                                      |
| `browser_language`        | `en-DE`                                                                                                                           |
| `browser_name`            | `Mozilla`                                                                                                                         |
| `browser_online`          | `true`                                                                                                                            |
| `browser_platform`        | `MacIntel`                                                                                                                        |
| `browser_version`         | `5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/128.0.2739.79` |
| `cookie_enabled`          | `true`                                                                                                                            |
| `device_platform`         | `web_pc`                                                                                                                          |
| `focus_state`             | `true`                                                                                                                            |
| `from_page`               | `user`                                                                                                                            |
| `history_len`             | `10`                                                                                                                              |
| `is_fullscreen`           | `false`                                                                                                                           |
| `is_page_visible`         | `true`                                                                                                                            |
| `screen_height`           | `1080`                                                                                                                            |
| `screen_width`            | `1920`                                                                                                                            |
| `tz_name`                 | `Europe/Berlin`                                                                                                                   |
| `referer`                 | `https://www.tiktok.com/`                                                                                                         |
| `root_referer`            | `https://www.tiktok.com/`                                                                                                         |
| `channel`                 | `tiktok_web`                                                                                                                      |
| `data_collection_enabled` | `true`                                                                                                                            |
| `os`                      | `mac`                                                                                                                             |
| `priority_region`         | `DE`                                                                                                                              |
| `region`                  | `DE`                                                                                                                              |
| `user_is_login`           | `true` (also without a session, as in 2.4.0)                                                                                      |
| `webcast_language`        | `en`                                                                                                                              |
| `device_id`               | 19 random decimal digits, made once per connection [TLC: src/lib/web/lib/device-presets.ts, `generateDeviceId`]                   |

### Headers

[TLC: src/lib/web/defaults.ts, `DEFAULT_HTTP_CLIENT_HEADERS`]

| Header                | Default                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Connection`          | `keep-alive`                                                                                                                              |
| `Cache-Control`       | `max-age=0`                                                                                                                               |
| `User-Agent`          | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/128.0.2739.79` |
| `Accept`              | `text/html,application/json,application/protobuf`                                                                                         |
| `Referer`             | `https://www.tiktok.com/`                                                                                                                 |
| `Origin`              | `https://www.tiktok.com`                                                                                                                  |
| `Accept-Language`     | `en-US,en;q=0.9`                                                                                                                          |
| `Accept-Encoding`     | `gzip, deflate`                                                                                                                           |
| `Sec-Fetch-Site`      | `same-site`                                                                                                                               |
| `Sec-Fetch-Mode`      | `cors`                                                                                                                                    |
| `Sec-Fetch-Dest`      | `empty`                                                                                                                                   |
| `Sec-Fetch-Ua-Mobile` | `?0`                                                                                                                                      |
| `Cookie`              | the cookie jar (below)                                                                                                                    |

The same User-Agent goes to the signer (`user_agent`) and on the WebSocket: the signed connect is only good for the User-Agent it was made for.

### Cookies

The HTTP client keeps one cookie jar per connection, like 2.4.0's [TLC: src/lib/web/lib/cookie-jar.ts]: a map from cookie name to value, with no domain, path or expiry (TikTok's cookies are all sent everywhere). It starts with:

- `tt-target-idc=useast1a` (the default `Cookie` header in 2.4.0), and
- when a session is set: `sessionid`, `sessionid_ss`, `sid_tt` and `sid_guard`, all set to the session id, and `tt-target-idc` set to the session's (default `useast1a`) [TLC: cookie-jar.ts, `serializeCookieSessionBundle`; defaults.ts, `SESSION_COOKIE_NAMES`]. A real browser's `sid_guard` holds more than the id; 2.4.0 sent the id, and so do we.

Every `Set-Cookie` header TikTok answers with updates the jar (its name and value; attributes ignored), and so do the signer's cookies ([Signer](#signer)). The jar is serialized as `name=value` pairs joined by `; `. Values go back as they were set, like a browser sends them; only what a cookie can't hold is percent-encoded: in values, anything outside RFC 6265's cookie-octets plus `"` (spaces, `;`, `,`, `\`, control and non-ASCII characters), and in names anything that isn't a token character. 2.4.0 decoded every value and percent-encoded every name and value [TLC: cookie-jar.ts, `processSetCookieHeader`, `serializeCookieObject`], which changes base64 values such as `msToken` (`=`, `+`, `/`). The `Cookie` header of every request and of the WebSocket is the whole jar; a `Cookie` in the `headers` option replaces it.

The session never goes to the signer: see `SignRequest.sessionCookies` below.

## Room id

The first step that answers wins; each runs within `requestTimeoutMs` [TLC: src/lib/web/routes/composite/fetch-room-id.ts]. 2.4.0 scraped the LIVE page first; the library asks the API first, since the page as TikTok serves it to the library held no state in the first smoke run, while the API answered in half a second. When none answers, `RoomNotFoundError` with the steps' errors as `cause` (an array, in step order); it is retryable when a step failed for a reason that can pass (a retryable `ConnectorError`: network, timeout, 429 or 5xx). A room id is a decimal string other than `0`, or a positive safe integer.

1. **The API.** `GET https://www.tiktok.com/api-live/user/room/?{client params}&uniqueId={username}&sourceType=54`. JSON: a `statusCode` other than `0` fails the step (`message` says why); a missing one passes, as in 2.4.0. Then `data.user.roomId` [TLC: src/lib/web/routes/base/fetch-room-info-api-live.ts]. `data.liveRoom.status`: 2 is LIVE, 4 ended.
2. **The LIVE page.** `GET https://www.tiktok.com/@{username}/live?{client params}` (2.4.0 sent the client params on this page request too) with the headers. Extract the first match of `/<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/` (2.4.0's pattern; we add the `s` flag so a line break inside can't defeat it), `JSON.parse` it, and read `LiveRoom.liveRoomUserInfo.user.roomId` [TLC: src/lib/web/routes/base/fetch-room-info-html.ts]. When that is missing, the state is searched breadth first (to depth 16, at most 50 000 nodes) for a `liveRoomUserInfo.user.roomId`, or for an object whose `uniqueId` is the username (any letter case) and that has a `roomId`. When `SIGI_STATE` is missing, isn't JSON or holds no room id, the same is tried with the page's `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">` (attributes in any order), whose layout on LIVE pages isn't known yet (see [Open items](#open-items)). Nothing found fails the step. The `SIGI_STATE` object also holds `LiveRoom.liveRoomUserInfo.liveRoom.status` (2 = LIVE, 4 = ended) [TLC: test/lib/fixtures.ts]. In the first smoke run, the page came back (200, 1.1 s) with neither script.
3. **The signer.** `signer.resolveRoomId(username)`; `null` fails the step. Euler Stream's route is below.

The signed connect may name a different room in `x-room-id`; when it is numeric, it replaces the resolved id (otherwise a warning is logged and the resolved id stays).

## Is the room LIVE?

Before signing, and before each reconnect attempt when `reconnect.checkLiveBeforeRetry` is on:

1. `GET https://webcast.tiktok.com/webcast/room/info/?{client params}&room_id={roomId}`, unsigned [TLC: src/lib/web/routes/base/fetch-room-info.ts]. JSON: `data.status === 4` means the LIVE ended; any other status counts as LIVE (2.4.0's rule: only 4 is offline; a LIVE room answered 2 in the first smoke run) [TLC: src/lib/client/index.ts, `_connect`; src/lib/web/routes/composite/fetch-is-live.ts].
2. If that request fails or has no numeric `data.status`: `signer.fetchRoomInfo(roomId)`, `{ isLive }`.

Offline on connect: `OfflineError`. Offline before a reconnect: `streamEnd` (`ended`), then `disconnected` with reason `streamEnd`. When neither source answers, the check is inconclusive and the connect goes on (the signer or the socket fails if the room is gone). The check itself only fails when the connection stops (`AbortError`); the sources' failures are logged at `debug`.

2.4.0 also had a username-based check (`fetchIsLive`: the LIVE page's status, the API's `data.liveRoom.status`, then Euler Stream's `is_live`) that its connect didn't use [TLC: fetch-is-live.ts].

## Signer

The `Signer` interface (`src/signer/types.ts`) has one required method, `fetchConnect`, and three optional fallbacks: `resolveRoomId`, `fetchRoomInfo` and `fetchGifts`. Each gets a `SignContext`: the `fetch` to use, an abort `signal` (disconnect or the `signal` option), `timeoutMs` (`requestTimeoutMs`), the User-Agent and the logger.

The library runs every signer call within `timeoutMs` and the signal itself (`src/signer/call.ts`): a call still running when `timeoutMs` runs out fails with `TimeoutError` (phase `sign`), and one running when the signal aborts with `AbortError`, whether the signer watches them or not. A signer should still pass `signal` to `fetch`, so that a stop cancels its request. Whatever a signer throws that isn't a `ConnectorError` is converted before the library acts on it: an error named `AbortError` (what `fetch` throws when its signal aborts) becomes an `AbortError`; one named `TimeoutError` (what `fetch` throws for an `AbortSignal.timeout()`) a `TimeoutError` with phase `sign`; anything else (a `TypeError` for a network failure, a bug) a retryable `SignError` without a status, with the original as `cause`. So a signer lets `fetch`'s errors through and only throws for the service's answers: `RateLimitError`, `PremiumFeatureError`, or `SignError` with the `status` (a 4xx status makes the connection look the room id up again, [Reconnects](#reconnects)).

`fetchConnect({ roomId, cursor, sessionCookies? })` returns `{ body, cookies, roomId?, requestId?, agentId? }`: `body` is the protobuf `ProtoMessageFetchResult` ([Batches](#batches)), `cookies` are `name=value` pairs for the jar. An answer whose `body` isn't bytes or whose `cookies` isn't a list of strings is a `ProtocolError`. `cursor` is `""` on the first connect and the last cursor seen on reconnects. `sessionCookies` carries the session cookies when a session is set; whoever receives them can act as that TikTok account, so a signer must only forward them to a third party when its user explicitly asks. `EulerSigner` never forwards them (2.4.0 required an `authenticateWs` option and a `WHITELIST_AUTHENTICATED_SESSION_ID_HOST` environment variable matching the sign host before sending them [TLC: src/lib/web/routes/euler/fetch-signed-websocket-euler.ts]).

### Euler Stream

`EulerSigner` is written from Euler Stream's public docs. 2.4.0 used Euler Stream's SDK (`tiktok-live-api-sdk`), which isn't among the references, so its exact requests are only known through how 2.4.0 called it.

**Hosts.** The docs list four servers [Euler: API reference, server list]: `https://tiktok.eulerstream.com` (listed first, no description; the docs' own rate-limit widget calls it), `https://api.eulerstream.com` ("Public Server (Community & Pro)"), `https://tiktok.enterprise.eulerstream.com` ("Enterprise Server") and `https://api.staging.eulerstream.com` ("Staging Server (Private Use)"). `EulerSigner` defaults to `https://tiktok.eulerstream.com`; the `host` option changes it (trailing slashes are dropped, and a `host` that isn't a URL makes the constructor throw a `TypeError`). 2.4.0 defaulted to `https://api.eulerstream.com`, overridable with `SIGN_API_URL` [TLC: src/lib/web/routes/euler/config.ts].

**API key.** The OpenAPI data behind the docs lets a key travel as an `x-api-key` header, an `apiKey` query parameter or an `x-jwt-key` header (a JWT) [Euler: the generated client in the docs' pages sets all three]. `EulerSigner` only ever sends `x-api-key`, so a key never lands in a URL, a log line or a proxy's access log. Without a key (or with an empty one), the anonymous limits apply.

**Requests.** `EulerSigner` sends only `Accept` and, with a key, `x-api-key`. The docs ask for no User-Agent, so `fetch`'s default goes (2.4.0 sent `tiktok-live-connector/<version> <platform>` [TLC: euler/config.ts]); the `client` query parameter names the library, and the TikTok User-Agent goes in the `user_agent` query parameter.

**Fallback routes.** The room id, room info and room gifts routes answer `null` on any 4xx but 429 (the plan lacks the route, or Euler Stream has no answer, such as a 404 for a user who isn't LIVE). A 429 throws `RateLimitError`, a 5xx `SignError`, and a 2xx body that isn't JSON `ProtocolError`.

#### Connect

`GET {host}/webcast/rooms/{room_id}/connect` [Euler: TikTok LIVE Rooms, "Fetch Webcast URL"; scope `PUBLIC`]

| Query          | Value                               | Docs                                                                                                                                            |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`       | `ttlive-node` (the `client` option) | "The client library identifier. Used for metrics." Default `ttlive-other`. 2.4.0 sent `ttlive-node` [TLC: euler/config.ts, `LIBRARY_IDENTITY`]. |
| `cursor`       | the cursor (`""` at first)          | "Starting cursor for the webcast connection, if any"                                                                                            |
| `user_agent`   | the TikTok User-Agent               | "Override the user agent used for signing and fetching"                                                                                         |
| `client_enter` | `true`                              | "Whether the client enters a room after connecting, or if it's done by query parameters" (default `true`)                                       |
| `platform`     | `web`                               | enum `mobile`, `web`                                                                                                                            |

`room_id` must be numeric. Headers: `Accept: application/protobuf, application/json`, and `x-api-key` with a key. The docs also define optional `x-cookie-header` ("Cookie header containing sessionid and tt-target-idc"), `x-oauth-token` and `x-skip-cache` headers; `EulerSigner` sends none of them.

Answers:

- **200**: the body is a protobuf `ProtoMessageFetchResult`. The headers carry what the WebSocket needs (from 2.4.0; the docs don't list response headers) [TLC: fetch-signed-websocket-euler.ts]:
  - `x-set-tt-cookie`: cookies for TikTok, required. Missing: `ProtocolError` (2.4.0 failed the same way). 2.4.0 kept only the first `name=value` of it, as if it were one `Set-Cookie` line [TLC: cookie-jar.ts, `processSetCookieHeader`]. We read every `name=value` pair separated by `;` and drop `Set-Cookie` attributes (`Path`, `Domain`, `Expires`, `Max-Age`, `SameSite`, `Priority`, any letter case) and value-less flags (`HttpOnly`, `Secure`, `Partitioned`) (see [Open items](#open-items)). A comma followed by `name=` also starts a new pair, so `Set-Cookie` lines joined by `, ` parse too (an `Expires` date's comma doesn't split). A header without any pair is a `ProtocolError`, like a missing one, and so is an empty body. Values are kept as sent. `EulerSigner` logs the cookies' names (never their values) at `debug`.
  - `x-room-id`: the room the server connected to; replaces the requested one.
  - `x-request-id`, `x-agent-id`: for support requests; kept in `SignedConnect` and in `SignError.requestId`.
- **429**: rate limited. JSON `{ code: 429, message }` [Euler: every route documents it]; 2.4.0 also read a `limit_label`. `RateLimitError`, `retryAfterMs` from, in order: `retry-after` (seconds or an HTTP date), `ratelimit-reset` (seconds, the header Euler Stream's public endpoints send, see below), `x-ratelimit-reset` (2.4.0 read it as a Unix time in seconds [TLC: src/types/errors.ts, `SignatureRateLimitError`]). 2.4.0 passed the response body where the response was expected, so a 429 surfaced as a `TypeError`.
- **402**: `PremiumFeatureError` (2.4.0's mapping; the docs don't list 402 for this route).
- **401, 403**: `SignError`, not retryable (bad or insufficient API key).
- **500, 503** (`{ code, message }`, 503 is "No agents are currently available") and anything else: `SignError` with the status and the server's `message`, retryable.
- No answer: `SignError` without a status (retryable); timeout: `TimeoutError` with phase `sign`.
- A 200 body that can't be decoded: `ProtocolError`. On a run's first connect (cursor `""`), so is a body without `pushServer` or `cursor` (2.4.0 refused a missing cursor [TLC: src/lib/client/index.ts, `_connect`]). A connect asked for with a cursor comes back without `pushServer`: [Reconnects](#reconnects) says what stands in.

**Rate limits.** Over the limit, every route answers 429 [Euler: API Rate Limits]. `GET https://tiktok.eulerstream.com/webcast/rate_limits` (the docs' widget; it also answers `deprecation: true`) reported these anonymous `WEBCAST` limits on 2026-10-20: 5 per minute, 30 per hour, 100 per day, with IETF-draft headers (`ratelimit-limit`, `ratelimit-policy`, `ratelimit-remaining`, `ratelimit-reset` in seconds). Each connect and each reconnect attempt is one request, so the reconnect backoff and `retryAfterMs` matter.

#### Room id

`GET {host}/webcast/anchors/{creator_id}/room_id` [Euler: TikTok LIVE Anchors, "Retrieve Room ID"; scope `PRO`]. `creator_id` is the username by default (`creator_id_type=unique_id`, or `numeric_id` for a numeric user id). JSON: `{ code, message, ok, routes_attempted, is_live, room_id, room_status, source, detail }`; `detail.reason` is `no_live_profile` on a 404. `resolveRoomId` returns `room_id` when `ok` and non-empty, else `null`; 401, 402 and 403 mean the plan doesn't include the route (2.4.0 treated them as a permission failure [TLC: fetch-room-id.ts]). The scope means a free key can't use it.

#### Room info

`GET {host}/webcast/rooms/{room_id}/room_info` [Euler: TikTok LIVE Rooms, "Retrieve room info by Room ID"; scope `WEBCAST_PREMIUM`]. JSON: `{ code, message, ok, routes_attempted, source, data }` with `data.room_info.is_live` and `data.room_info.status`. `fetchRoomInfo` returns `{ isLive: data.room_info.is_live }` (or `status !== 4` without `is_live`), else `null`. There is also `GET {host}/webcast/anchors/{creator_id}/room_info` by username (same scope); 2.4.0's Euler room info call took a username [TLC: src/lib/web/routes/euler/fetch-room-info-euler.ts].

#### Room gifts

`GET {host}/webcast/rooms/{room_id}/gifts` [Euler: TikTok LIVE Rooms, "Retrieve room gifts"; scope `WEBCAST_PREMIUM`]. The route takes an optional `webcast_language`; `EulerSigner` doesn't send it, since `Signer.fetchGifts(roomId, context)` has no language (an optional third parameter could add one without breaking signers). JSON: `{ code, message, response }` where `response` is `{ room_id, page_gifts: number[], gift_overrides: { [gift id]: { is_displayed_on_panel, is_gallery_gift, gift_sponsor_info } }, panel_refresh_data }`: the room's gift ids in panel order and per-room overrides, **not** names, prices or images. So this route alone can't make a `Gift`. `fetchGifts` returns `null` (the chain moves on) unless `response` also carries gift objects with `id`, a `name` and a `diamond_count` (undocumented; see [Open items](#open-items)). 2.4.0 called the same route [TLC: src/lib/web/routes/euler/fetch-room-gifts-euler.ts].

Euler Stream also has `GET {host}/webcast/gifts?region={country}&webcast_language=en&redirect=false` (scope `PUBLIC`), answering `{ code, message, url }`: a URL of the gift list for a region [Euler: Gifts]. The library doesn't use it. Its Gifts section also lists a gift catalog (`GET /webcast/gifts/catalog`, paginated, `GET /webcast/gifts/catalog/{gift_id}` and `POST /webcast/gifts/catalog/search`, which "do not count toward rate limits"), and the room gifts page now says to combine `page_gifts` with `/webcast/gift_info` for the full gifts [Euler, read on 2026-10-19]; see [Open items](#open-items).

## WebSocket

The URL is the batch's `pushServer`, `?`, the query string, then the literal `&version_code=270000` [TLC: src/lib/ws/lib/ws-client.ts; src/lib/ws/defaults.ts]. The query string is `new URLSearchParams(params)` (spaces as `+`) over, in this order:

| Param                   | Value                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `version_code`          | `180800`                                                                                                                                    |
| `aid`                   | `1988`                                                                                                                                      |
| `app_language`          | `en`                                                                                                                                        |
| `app_name`              | `tiktok_web`                                                                                                                                |
| `browser_platform`      | `MacIntel`                                                                                                                                  |
| `browser_language`      | `en-DE`                                                                                                                                     |
| `browser_name`          | `Mozilla`                                                                                                                                   |
| `browser_version`       | the User-Agent after its first `/` (see [Client params](#client-params))                                                                    |
| `browser_online`        | `true`                                                                                                                                      |
| `cookie_enabled`        | `true`                                                                                                                                      |
| `tz_name`               | `Europe/Berlin`                                                                                                                             |
| `device_platform`       | `web`                                                                                                                                       |
| `identity`              | `audience`                                                                                                                                  |
| `live_id`               | `12`                                                                                                                                        |
| `webcast_language`      | `en`                                                                                                                                        |
| `ws_direct`             | `0`                                                                                                                                         |
| `sup_ws_ds_opt`         | `1`                                                                                                                                         |
| `update_version_code`   | `2.0.0`                                                                                                                                     |
| `did_rule`              | `3`                                                                                                                                         |
| `screen_height`         | `1080`                                                                                                                                      |
| `screen_width`          | `1920`                                                                                                                                      |
| `heartbeat_duration`    | `0`                                                                                                                                         |
| `resp_content_type`     | `protobuf`                                                                                                                                  |
| `history_comment_count` | `6`                                                                                                                                         |
| `client_enter`          | `1`                                                                                                                                         |
| `last_rtt`              | a random number from 100 to 200, as JavaScript prints it (`143.86…`)                                                                        |
| `User-Agent`            | the User-Agent (2.4.0 put it in the query as well as the header [TLC: src/lib/ws/config.ts])                                                |
| `compress`              | `gzip`                                                                                                                                      |
| `room_id`               | the room id                                                                                                                                 |
| `internal_ext`          | the batch's `internalExt`                                                                                                                   |
| `cursor`                | the batch's `cursor`                                                                                                                        |
| _route params_          | every entry of the batch's `routeParams` with a non-empty value; an existing key keeps its place [TLC: src/lib/client/index.ts, `_connect`] |

`version_code` is sent twice (`180800` first, `270000` last), as 2.4.0 did. `clientParams` overrides apply to the params before `compress`.

Headers: `User-Agent` and `Cookie` (the jar, signer cookies included [TLC: src/lib/client/index.ts, `setupWebsocket`]); `headers` overrides apply. The socket uses the `ws` package (Node's built-in `WebSocket` can't set these headers) with its defaults otherwise, so it answers the server's pings. 2.4.0 opened it with `autoPong: false` (no automatic replies to pings) [TLC: ws-client.ts] without saying why. We keep the replies: RFC 6455 requires a pong for every ping, browsers (TikTok's own web client among them) always send one, and when the server doesn't ping, the setting does nothing. The first ping a socket gets is logged at `debug`, so a smoke run shows whether TikTok pings at all (see [Open items](#open-items)).

The socket must open and enter the room (an `im_enter_room_resp` frame, or the first `msg` frame, whichever comes first) within `connectTimeoutMs` (default 20 000 ms, 2.4.0's `WS_CONNECT_TIMEOUT_MS`), else `TimeoutError` with phase `connect`. 2.4.0 only waited for the socket to open. A server that answers the upgrade request with an HTTP response instead of switching protocols (anything but 101) fails the opening with a `WebSocketError` whose `status` is that response's, logged at `debug` with its content type and length ("The server refused the WebSocket with …"). The body isn't read: a server could echo the request's headers in it, the session's cookies among them. To close, send a close frame (code 1000) and terminate the socket if it hasn't closed 2 s later (2.4.0's `WS_DISCONNECT_TIMEOUT_MS`) [TLC: src/lib/client/index.ts, `disconnect`].

Once in the room, any frame (pings included) resets the idle timer; with no frame for `idleTimeoutMs` (default 30 000 ms, `0` turns it off) the socket is terminated and the connection reconnects (reason `idle`). 2.4.0 had no such check.

## Frames

Every WebSocket message, both ways, is one `WebcastPushFrame` [proto: webcast/synthetic_proto.proto]. Frames the client sends leave out every field at its default (proto3: empty strings, zeros and `false` aren't written) [reference/tiktok-live-proto-0.2.3/package/dist/node/v3.js, the generated `encode` functions].

### Enter room

Right after the socket opens: `payloadEncoding` `pb`, `payloadType` `im_enter_room`, `payload` a `WebcastImEnterRoomMessage` [TLC: ws-client.ts, `switchRooms`]:

| Field                                                                                                   | Value                                                                                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `room_id` (1)                                                                                           | the room id                                                                                      |
| `live_id` (4)                                                                                           | `12`                                                                                             |
| `identity` (5)                                                                                          | `audience`                                                                                       |
| `enter_unique_id` (8)                                                                                   | a random positive 63-bit integer, new for each entry (never 0) [TLC: src/lib/ws/lib/ws-utils.ts] |
| `filter_welcome_msg` (9)                                                                                | `"0"` (a string, so it is written)                                                               |
| `room_tag` (2), `live_region` (3), `cursor` (6), `account_type` (7), `is_anchor_continue_keep_msg` (10) | empty, so not written                                                                            |

With room id `7140000000000000001` and enter id `123`, the frame is:

```text
32 02 70 62                                 payload_encoding "pb"
3a 0d 69 6d 5f 65 6e 74 65 72 5f 72 6f 6f 6d payload_type "im_enter_room"
42 1b                                       payload, 27 bytes:
   08 81 80 a8 82 bb 85 98 8b 63            room_id
   20 0c                                    live_id 12
   2a 08 61 75 64 69 65 6e 63 65            identity "audience"
   40 7b                                    enter_unique_id 123
   4a 01 30                                 filter_welcome_msg "0"
```

The server answers with a frame whose `payloadType` is `im_enter_room_resp` [TLC: ws-client.ts, `onMessage`].

### Heartbeat

Every `heartbeatIntervalMs` (default 10 000 ms, 2.4.0's `DEFAULT_WS_PING_INTERVAL`), starting one interval after the enter room frame: `payloadEncoding` `pb`, `payloadType` `hb`, `payload` a `HeartBeatMessage` `{ room_id, send_packet_seq_id }` [TLC: ws-client.ts, `sendHeartbeat`]. `send_packet_seq_id` is 1 for the first heartbeat after entering the room, and grows by one each time; it starts over at 1 on each entry and each new socket. Heartbeat 1 in room `7140000000000000001`:

```text
32 02 70 62 3a 02 68 62 42 0c 08 81 80 a8 82 bb 85 98 8b 63 10 01
```

2.4.0 only starts the heartbeats once it has entered the room; its comment says the server otherwise closes the socket (code 1000, `payload_handler_hb`).

### Received frames

A frame with `payloadType` `msg` and `payloadEncoding` `pb` carries a batch: when its payload starts with `1f 8b 08` (gzip, deflate method) it is gunzipped first [TLC: proto-utils.ts, `deserializeWebSocketMessage`], then decoded as a `ProtoMessageFetchResult` ([Batches](#batches)). A payload that can't be gunzipped or decoded is a `ProtocolError`, reported through `error`; the socket stays open.

`im_enter_room_resp` confirms the entry; the session logs at `debug` whether that or the first batch did (`Entered room …`). The server answers a heartbeat with an `hb` frame of its own (seen in the first smoke run, [Open items](#open-items) 4 and 17); like any frame it resets the idle timer, and the first one is logged at `debug` ("The server answers heartbeats"). Other payload types, and `msg` frames with another `payloadEncoding`, are logged (debug, with their type, encoding and size) and ignored. 2.4.0 decoded every `pb` payload, whatever its type, as a batch; see [Open items](#open-items).

### Ack

When a batch has `needAck` set, the client answers right away with `logId` = the frame's `logId`, `payloadEncoding` `pb`, `payloadType` `ack`, and `payload` = the batch's `internalExt` as UTF-8 bytes [TLC: ws-client.ts, `sendAck`]. No ack when the frame's `logId` is 0 or the batch's `internalExt` is empty (2.4.0 logged a warning for the latter). For log id `7400000000000000001` and `internalExt` `abc`:

```text
10 81 80 90 cf b0 99 85 d9 66 32 02 70 62 3a 03 61 63 6b 42 03 61 62 63
```

## Batches

A `ProtoMessageFetchResult` is both the signed connect's body and every `msg` frame's payload.

- **Cursor.** Every batch's non-empty `cursor` replaces the one kept for reconnects; a reconnect sends it to the signer to get the messages of the gap ([Reconnects](#reconnects)). A new `connect()` starts over from `""`, and so does a reconnect to another room (the room id looked up again changed): a cursor is a place in one room's stream. 2.4.0 only read the cursor of the signed connect and dropped it on disconnect, so it never resumed [TLC: src/lib/client/index.ts, `_connect`, `setDisconnected`].
- **`internalExt`, `routeParams`, `pushServer`:** from the signed connect, for the WebSocket URL; `internalExt` of each batch for its ack.
- **Initial batch.** The signed connect's messages are the room's recent backlog. On the first connect they are skipped unless `processInitialData` (their ids still count as seen, so a reconnect's backlog doesn't bring them back); on a reconnect they go through dispatch (they may hold what was said during the gap; duplicates are dropped). They are dispatched right after `connected`, before any batch the socket received while it was entering the room. 2.4.0 processed them by default.
- **Messages.** Each goes through dispatch in order: dropped when its `msgId` (other than `"0"` and `""`, which are never deduplicated) is among the last `dedupeSize` seen (one set per connection, kept across reconnects and new `connect()` calls); `raw` emitted when it has a listener; dropped when `isHistory` is set unless `processInitialData` (its id still counts as seen); then routed ([Routing](#routing)). A message that ends the stream drops the rest of its batch.
- **Failures.** A payload a route can't decode is dropped and reported through `error` as a `ProtocolError` (`Dropped message <msgId> (<method>): <reason>`). Only payloads that get decoded are checked: a malformed message whose events have no listener goes unnoticed (`raw` only reads its `common`, and an unreadable one gives `createTime` `"0"` without a report). Anything else that fails inside dispatch is reported as a `ConnectorError` with code `INTERNAL`; dispatch never throws.

A batch message has no creation time of its own (`BaseProtoMessage` has no such field): `raw.createTime` is read from the payload's `common.createTime` (field 1, then field 4; every LIVE message starts with its `common`), or `"0"`.

`heartbeatDuration` and `fetchInterval` are TikTok's suggestions for polling clients; the library ignores them, like 2.4.0.

## Field numbers

Only the fields in these tables are decoded; every other field is skipped. Each table lists the field number, the name and type in the `.proto` file, and the property and kind in our schema (`src/codec/messages/`). Kinds: `id` is a 64-bit integer read as an unsigned decimal string; `count` a 64-bit integer read as a number (unsafe values reported once); `bool` reads any varint, non-zero is `true`.

### Frames and batches

`webcast.im.WebcastPushFrame` [proto: webcast/synthetic_proto.proto] (`PushFrameSchema`, `src/codec/messages/frame.ts`)

| No. | Proto field        | Type                                                | Property          | Kind   |
| --- | ------------------ | --------------------------------------------------- | ----------------- | ------ |
| 1   | `seq_id`           | int64                                               | `seqId`           | id     |
| 2   | `log_id`           | int64                                               | `logId`           | id     |
| 3   | `service`          | int64                                               | (not read)        |        |
| 4   | `method`           | int64                                               | (not read)        |        |
| 5   | `headers`          | repeated `PushHeader` (`key` 1, `value` 2, strings) | (not read)        |        |
| 6   | `payload_encoding` | string                                              | `payloadEncoding` | string |
| 7   | `payload_type`     | string                                              | `payloadType`     | string |
| 8   | `payload`          | bytes                                               | `payload`         | bytes  |

`webcast.im.HeartBeatMessage` [proto: webcast/synthetic_proto.proto] (`HeartbeatSchema`)

| No. | Proto field          | Type  | Property          | Kind  |
| --- | -------------------- | ----- | ----------------- | ----- |
| 1   | `room_id`            | int64 | `roomId`          | id    |
| 2   | `send_packet_seq_id` | int64 | `sendPacketSeqId` | count |

`webcast.im.WebcastImEnterRoomMessage` [proto: webcast/synthetic_proto.proto] (`EnterRoomSchema`)

| No. | Proto field                   | Type   | Property           | Kind   |
| --- | ----------------------------- | ------ | ------------------ | ------ |
| 1   | `room_id`                     | int64  | `roomId`           | id     |
| 2   | `room_tag`                    | string | (not read)         |        |
| 3   | `live_region`                 | string | (not read)         |        |
| 4   | `live_id`                     | int64  | `liveId`           | count  |
| 5   | `identity`                    | string | `identity`         | string |
| 6   | `cursor`                      | string | (not read)         |        |
| 7   | `account_type`                | int64  | (not read)         |        |
| 8   | `enter_unique_id`             | int64  | `enterUniqueId`    | id     |
| 9   | `filter_welcome_msg`          | string | `filterWelcomeMsg` | string |
| 10  | `is_anchor_continue_keep_msg` | bool   | (not read)         |        |

`webcast.shared.message.ProtoMessageFetchResult` [proto: webcast/shared/message.proto] (`FetchResultSchema`, `src/codec/messages/fetchResult.ts`)

| No. | Proto field              | Type                        | Property            | Kind                                  |
| --- | ------------------------ | --------------------------- | ------------------- | ------------------------------------- |
| 1   | `messages`               | repeated `BaseProtoMessage` | `messages`          | repeated message                      |
| 2   | `cursor`                 | string                      | `cursor`            | string                                |
| 3   | `fetch_interval`         | int64                       | `fetchInterval`     | count                                 |
| 4   | `now`                    | int64                       | `now`               | count                                 |
| 5   | `internal_ext`           | string                      | `internalExt`       | string                                |
| 6   | `fetch_type`             | int32                       | `fetchType`         | int32                                 |
| 7   | `route_params`           | map<string, string>         | `routeParams`       | repeated message (`key` 1, `value` 2) |
| 8   | `heartbeat_duration`     | int64                       | `heartbeatDuration` | count                                 |
| 9   | `need_ack`               | bool                        | `needAck`           | bool                                  |
| 10  | `push_server`            | string                      | `pushServer`        | string                                |
| 11  | `is_first`               | bool                        | `isFirst`           | bool                                  |
| 12  | `history_comment_cursor` | string                      | (not read)          |                                       |
| 13  | `history_no_more`        | bool                        | (not read)          |                                       |

Field 7 is called `wsParams` and field 10 `wsUrl` in the older protos [reference/src/TikTok-Webcast-Protobuf/src/slim/v2/webcast.proto]: the plan's "`wsParams`/`routeParams`" are the same field. A map is a repeated message of `key` (1) and `value` (2) entries; `routeParamsToRecord` turns it into an object, the last entry of a key winning.

`webcast.shared.message.BaseProtoMessage` [proto: webcast/shared/message.proto] (`FetchResultMessageSchema`)

| No. | Proto field   | Type   | Property    | Kind   |
| --- | ------------- | ------ | ----------- | ------ |
| 1   | `method`      | string | `method`    | string |
| 2   | `payload`     | bytes  | `payload`   | bytes  |
| 3   | `msg_id`      | int64  | `msgId`     | id     |
| 4   | `msg_type`    | int32  | `msgType`   | int32  |
| 5   | `offset`      | int64  | (not read)  |        |
| 6   | `is_history`  | bool   | `isHistory` | bool   |
| 7   | `sample_flag` | int32  | (not read)  |        |

### Shared building blocks

In `src/codec/messages/common.ts`.

`webcast.shared.message.CommonMessageData` [proto: webcast/shared/message.proto] (`CommonSchema`), field 1 of every LIVE message

| No.  | Proto field                 | Type                                | Property      | Kind    |
| ---- | --------------------------- | ----------------------------------- | ------------- | ------- |
| 1    | `method`                    | string                              | `method`      | string  |
| 2    | `msg_id`                    | int64                               | `msgId`       | id      |
| 3    | `room_id`                   | int64                               | `roomId`      | id      |
| 4    | `create_time`               | int64                               | `createTime`  | id      |
| 5    | `monitor`                   | int32                               | (not read)    |         |
| 6    | `is_show_msg`               | bool                                | `isShowMsg`   | bool    |
| 7    | `describe`                  | string                              | (not read)    |         |
| 8    | `display_text`              | `webcast.model.message.common.Text` | `displayText` | message |
| 9–26 | (filters, priorities, ids…) |                                     | (not read)    |         |

`webcast.model.message.common.Text` [proto: webcast/model/message/common.proto] (`TextSchema`)

| No. | Proto field       | Type                 | Property         | Kind   |
| --- | ----------------- | -------------------- | ---------------- | ------ |
| 1   | `key`             | string               | `key`            | string |
| 2   | `default_pattern` | string               | `defaultPattern` | string |
| 3   | `default_format`  | `TextFormat`         | (not read)       |        |
| 4   | `pieces`          | repeated `TextPiece` | (not read)       |        |

`webcast.model.base.ImageModel` [proto: webcast/model/base/messages.proto] (`ImageSchema`)

| No. | Proto field                                                                            | Type            | Property   | Kind            |
| --- | -------------------------------------------------------------------------------------- | --------------- | ---------- | --------------- |
| 1   | `url_list`                                                                             | repeated string | `urlList`  | repeated string |
| 2   | `uri`                                                                                  | string          | `uri`      | string          |
| 3–9 | `height`, `width`, `avg_color`, `image_type`, `open_web_url`, `content`, `is_animated` |                 | (not read) |                 |

`webcast.model.base.user.User` [proto: webcast/model/base/user_2.proto] (`UserSchema`)

| No. | Proto field      | Type                           | Property        | Kind             |
| --- | ---------------- | ------------------------------ | --------------- | ---------------- |
| 1   | `id`             | int64                          | `userId`        | id               |
| 3   | `nickname`       | string                         | `nickname`      | string           |
| 9   | `avatar_thumb`   | `ImageModel`                   | `avatarThumb`   | message          |
| 22  | `follow_info`    | `FollowInfo`                   | `followInfo`    | message          |
| 23  | `pay_grade`      | `webcast.model.UserHonor`      | `payGrade`      | message          |
| 24  | `fans_club`      | `webcast.model.FansClubMember` | `fansClub`      | message          |
| 32  | `user_attr`      | `webcast.model.UserAttr`       | `userAttr`      | message          |
| 38  | `display_id`     | string                         | `displayId`     | string           |
| 63  | `subscribe_info` | `SubscribeInfo`                | `subscribeInfo` | message          |
| 64  | `badge_list`     | repeated `BadgeStruct`         | `badgeList`     | repeated message |
| 66  | `fans_club_info` | `FansClubInfo`                 | `fansClubInfo`  | message          |

`display_id` is the username (unique id); older protos called field 38 `uniqueId`. Not read, among others: `avatar_medium` (10), `avatar_large` (11), `verified` (12), `sec_uid` (46), `id_str` (1028).

`webcast.model.base.user.FollowInfo` [proto: webcast/model/base/user.proto, line 110] (`FollowInfoSchema`): `following_count` (1, int64) → `followingCount`, count; `follower_count` (2, int64) → `followerCount`, count; `follow_status` (3, int64) → `followStatus`, count. Not read: `push_status` (4).
`webcast.model.UserHonor` [proto: webcast/model/messages.proto, line 252] (`PayGradeSchema`): `name` (3, string) → `name`, string; `level` (6, int32) → `level`, int32. Not read: the icons and the rest.
`webcast.model.FansClubMember` [proto: webcast/model/messages.proto, line 85] (`FansClubSchema`): `data` (1, `FansClubData`) → `data`, message. Not read: `prefer_data` (2).
`webcast.model.FansClubData` [proto: webcast/model/messages.proto, line 75] (`FansClubDataSchema`): `club_name` (1, string) → `clubName`, string; `level` (2, int32) → `level`, int32; `user_fans_club_status` (3, `webcast.model.data.User_FansClub_FansClubData_UserFansClubStatus`: `NOT_JOINED` 0, `ACTIVE` 1, `INACTIVE` 2, exported as `FansClubStatus`) → `status`, enum. Not read: `badge` (4), `available_gift_ids` (5), `anchor_id` (6).
`webcast.model.UserAttr` [proto: webcast/model/messages.proto, line 237] (`UserAttrSchema`): `is_muted` (1), `is_admin` (2), `is_super_admin` (3), bools → `isMuted`, `isAdmin`, `isSuperAdmin`. Not read: `mute_duration` (4), `admin_permissions` (5), 6, 7.
`webcast.model.base.user.SubscribeInfo` [proto: webcast/model/base/user.proto, line 224] (`SubscribeInfoSchema`): `is_subscribe` (2, bool) → `isSubscribe`; `is_subscribed_to_anchor` (7, bool) → `isSubscribedToAnchor`. Not read: `status` (11, `User_SubscribeInfo_PayStatus`, exported as `PayStatus` for a later release), and the rest.
`webcast.model.base.user.FansClubInfo` [proto: webcast/model/base/user.proto, line 101] (`FansClubInfoSchema`): `fans_level` (2, int64) → `fansLevel`, count; `fans_club_name` (6, string) → `fansClubName`, string. Not read: `is_sleeping` (1), `fans_score` (3), `badge` (4), `fans_count` (5).

`webcast.model.base.user.BadgeStruct` [proto: webcast/model/base/user.proto, line 13] (`BadgeSchema`)

| No. | Proto field           | Type                                | Property            | Kind    |
| --- | --------------------- | ----------------------------------- | ------------------- | ------- |
| 3   | `scene_type`          | `webcast.model.data.BadgeSceneType` | `sceneType`         | enum    |
| 12  | `privilege_log_extra` | `PrivilegeLogExtra`                 | `privilegeLogExtra` | message |
| 23  | `combine`             | `CombineBadgeStruct`                | `combine`           | message |

`BadgeSceneType` [proto: webcast/model/data/messages.proto, line 68]: `BADGE_SCENE_TYPE_UNKNOWN` 0, `ADMIN` 1, `FIRST_RECHARGE` 2, `FRIENDS` 3, `SUBSCRIBER` 4, `BADGE_SCENE_TYPE_ACTIVITY` 5, `BADGE_SCENE_TYPE_RANK_LIST` 6, `NEW_SUBSCRIBER` 7, `USER_GRADE` 8, `STATE_CONTROLLED_MEDIA` 9, `FANS` 10, `LIVE_PRO` 11, `ANCHOR` 12, `CLASS_RANK` 13, `ENIGMA` 14; exported as `BadgeSceneType` without the prefixes. Not read: `display_type` (1), `priority_type` (2), `image` (20), `text` (21), `str` (22).

`webcast.model.base.user.PrivilegeLogExtra` [proto: webcast/model/base/user.proto] (`PrivilegeLogExtraSchema`): `level` (5, string) → `level`, string. Not read: 1–4, 6, 7.

`webcast.model.base.user.CombineBadgeStruct` [proto: webcast/model/base/user.proto] (`CombineBadgeSchema`): `icon` (2, `ImageModel`) → `icon`, message. Not read: the rest.

`webcast.model.data.MsgFilter` [proto: webcast/model/data/messages.proto, line 989] (`MsgFilterSchema`, exported for the tables that carry it): `is_gifter` (1, bool) → `isGifter`; `is_subscribed_to_anchor` (2, bool) → `isSubscribedToAnchor`.

`webcast.model.message.PunishEventInfo` [proto: webcast/model/message/invite_top_host_info.proto, line 40] (`PunishEventInfoSchema`, exported for the tables that carry it)

| No. | Proto field      | Type                              | Property       | Kind   |
| --- | ---------------- | --------------------------------- | -------------- | ------ |
| 1   | `punish_type`    | string                            | `punishType`   | string |
| 2   | `punish_reason`  | string                            | `punishReason` | string |
| 3   | `punish_id`      | string                            | `punishId`     | string |
| 5   | `punish_type_id` | `webcast.model.data.PunishTypeId` | `punishTypeId` | enum   |
| 6   | `duration`       | int64                             | `duration`     | count  |
| 8   | `end_time`       | int64                             | `endTime`      | id     |
| 10  | `show_reason`    | string                            | `showReason`   | string |

`PunishTypeId` [proto: webcast/model/data/messages.proto, line 657]: `PUNISH_TYPE_IDUN_KNOWN` 0, `BAN_LINKMIC` 9, `BAN_GAME_PARTNERSHIP` 25, `REMOVE_GAME_PARTNERSHIP` 26, `BAN_COHOST_LINKMIC` 55, `AUTHORITY_LIMIT_MATCH` 57, `BAN_VOICE_CHAT` 59, `BAN_LIVE_GOAL` 64, `VIEWER_LIMIT` 70, `LIVE_CONSOLE_BAN` 76; exported as `PunishTypeId` (`UNKNOWN` for 0). Not read: `violation_uid` (4), `punish_perception_code` (7), `violation_uid_str` (9).

`webcast.model.data.UserIdentity` [proto: webcast/model/data/messages.proto] (`UserIdentitySchema`)

| No. | Proto field                       | Type | Property               | Kind |
| --- | --------------------------------- | ---- | ---------------------- | ---- |
| 1   | `is_gift_giver_of_anchor`         | bool | (not read)             |      |
| 2   | `is_subscriber_of_anchor`         | bool | `isSubscriberOfAnchor` | bool |
| 3   | `is_mutual_following_with_anchor` | bool | (not read)             |      |
| 4   | `is_follower_of_anchor`           | bool | `isFollowerOfAnchor`   | bool |
| 5   | `is_moderator_of_anchor`          | bool | `isModeratorOfAnchor`  | bool |
| 6   | `is_anchor`                       | bool | (not read)             |      |

### LIVE messages

All in package `webcast.model.message` [proto: webcast/model/message/messages.proto] unless noted. Field 1 is always `common` (`CommonMessageData`, → `common`, message). The tables are in `src/codec/messages/<group>/`, one file per message (tail messages, with a few scalars each, share `tail.ts`), registered in the group's `index.ts`. A message marked _pending_ has its payload type in `src/events/<group>.ts` and no table yet: it reaches `raw` only.

#### Chat, reactions and moderation (`messages/chat/`)

`WebcastChatMessage` (`chat/chat.ts`)

| No. | Proto field        | Type                      | Property          | Kind             |
| --- | ------------------ | ------------------------- | ----------------- | ---------------- |
| 2   | `user`             | `User`                    | `user`            | message          |
| 3   | `content`          | string                    | `content`         | string           |
| 13  | `emotes`           | repeated `EmoteWithIndex` | `emotes`          | repeated message |
| 14  | `content_language` | string                    | `contentLanguage` | string           |
| 18  | `user_identity`    | `UserIdentity`            | `userIdentity`    | message          |

`webcast.model.base.emoji.EmoteWithIndex` [proto: webcast/model/base/emoji.proto]: `index` (1, int32) → `index`, int32; `emote` (2, `EmoteModel`) → `emote`, message.
`webcast.model.base.emoji.EmoteModel` [proto: webcast/model/base/emoji.proto]: `emote_id` (1, string) → `emoteId`, string; `image` (2, `ImageModel`) → `image`, message.

`WebcastLikeMessage` (`chat/like.ts`)

| No. | Proto field | Type   | Property | Kind    |
| --- | ----------- | ------ | -------- | ------- |
| 2   | `count`     | int32  | `count`  | int32   |
| 3   | `total`     | int64  | `total`  | count   |
| 5   | `user`      | `User` | `user`   | message |

`WebcastSocialMessage` (`chat/social.ts`)

| No. | Proto field    | Type   | Property      | Kind    |
| --- | -------------- | ------ | ------------- | ------- |
| 2   | `user`         | `User` | `user`        | message |
| 3   | `share_type`   | int64  | `shareType`   | count   |
| 4   | `action`       | int64  | `action`      | count   |
| 5   | `share_target` | string | `shareTarget` | string  |
| 8   | `share_count`  | int32  | `shareCount`  | int32   |

Not read: `follow_count` (6), `share_display_style` (7), `follow_type` (13), `target_user_id` (14), and the rest.

`WebcastEmoteChatMessage` (`chat/emote.ts`): pending.
`WebcastImDeleteMessage` (`chat/imDelete.ts`): pending.
`WebcastRoomPinMessage` (`chat/roomPin.ts`): pending.
`WebcastQuestionNewMessage` (`chat/questionNew.ts`): pending.
`WebcastCaptionMessage` (`chat/caption.ts`): pending.
`WebcastRoomMessage` (`chat/roomMessage.ts`): pending.
`WebcastNoticeMessage` (`chat/notice.ts`): pending.
`WebcastSystemMessage` [proto: webcast/synthetic_proto.proto] (`chat/tail.ts`): pending.
`WebcastLiveIntroMessage` (`chat/tail.ts`): pending.
`WebcastUnauthorizedMemberMessage` (`chat/tail.ts`): pending.
`WebcastMsgDetectMessage` (`chat/tail.ts`): pending.
`WebcastToastMessage` (`chat/tail.ts`): pending.
`WebcastBottomMessage` (`chat/tail.ts`): pending.
`WebcastRoomVerifyMessage` (`chat/tail.ts`): pending.

#### Gifts, money and membership (`messages/gift/`)

`WebcastGiftMessage` (`gift/gift.ts`)

| No. | Proto field    | Type                 | Property      | Kind    |
| --- | -------------- | -------------------- | ------------- | ------- |
| 2   | `gift_id`      | int64                | `giftId`      | id      |
| 5   | `repeat_count` | int32                | `repeatCount` | int32   |
| 6   | `combo_count`  | int32                | `comboCount`  | int32   |
| 7   | `user`         | `User`               | `user`        | message |
| 9   | `repeat_end`   | int32                | `repeatEnd`   | bool    |
| 11  | `group_id`     | int64                | `groupId`     | id      |
| 15  | `gift`         | `webcast.model.Gift` | `gift`        | message |

`repeat_end` is an int32 on the wire; non-zero is `true`. Not read: `fan_ticket_count` (3), `group_count` (4), `to_user` (8), `user_identity` (32), and the rest.

`webcast.model.Gift` [proto: webcast/model/gift.proto, line 10] (`GiftDetailsSchema`)

| No. | Proto field     | Type         | Property       | Kind    |
| --- | --------------- | ------------ | -------------- | ------- |
| 1   | `image`         | `ImageModel` | `image`        | message |
| 2   | `describe`      | string       | `describe`     | string  |
| 5   | `id`            | int64        | `id`           | id      |
| 10  | `combo`         | bool         | `combo`        | bool    |
| 11  | `type`          | int32        | `type`         | int32   |
| 12  | `diamond_count` | int32        | `diamondCount` | int32   |
| 16  | `name`          | string       | `name`         | string  |
| 21  | `icon`          | `ImageModel` | `icon`         | message |

`type` 1 marks a gift sent in streaks: `isStreakable()`. During a streak each update arrives as its own gift message with a growing `repeat_count`, and the streak ends with one more message with `repeat_end` set, even for a single gift; a gift of another type arrives once [TLC: README.md, the gift event's notes].

`WebcastMemberMessage` (`gift/member.ts`)

| No. | Proto field | Type                                  | Property   | Kind    |
| --- | ----------- | ------------------------------------- | ---------- | ------- |
| 2   | `user`      | `User`                                | `user`     | message |
| 10  | `action`    | `webcast.im.MemberMessageAction` enum | `actionId` | enum    |

`MemberMessageAction` [proto: webcast/synthetic_enums.proto]: `MEMBER_MESSAGE_ACTION_UNKNOWN` 0, `MEMBER_MESSAGE_ACTION_JOINED` 1, `MEMBER_MESSAGE_ACTION_SUBSCRIBED` 3; exported as `MemberAction` (`UNKNOWN`, `JOINED`, `SUBSCRIBED`). The property keeps the name older protos gave field 10, `actionId` [reference/src/TikTok-Webcast-Protobuf/src/slim/v1/webcast.proto]. Not read: `member_count` (3), `operator` (4), `enter_type` (9), `user_id` (12), and the rest.

`WebcastEnvelopeMessage` [proto: webcast/model/message/redenvelope.proto, package `webcast.model.message.redenvelope`] (`gift/envelope.ts`)

| No. | Proto field     | Type                    | Property       | Kind    |
| --- | --------------- | ----------------------- | -------------- | ------- |
| 2   | `envelope_info` | `MessageRedEnvelopInfo` | `envelopeInfo` | message |

`MessageRedEnvelopInfo` (same file): `business_type` (2, `webcast.model.data.EnvelopeBusinessType` enum) → `businessType`, enum. Not read: `envelope_id` (1), `send_user_name` (4), `diamond_count` (5), `people_count` (6), `unpack_at` (7), and the rest.
`EnvelopeBusinessType` [proto: webcast/model/data/messages.proto]: 0 unknown, 1 user diamond, 2 platform diamond, 3 platform shell, 4 portal, 5 platform merch, 6, 7 and 9–14 event and campaign types, **`SUPER_FAN_BOX` 19**. Exported as `EnvelopeBusinessType` with the values the library uses: `UNKNOWN` 0 and `SUPER_FAN_BOX` 19.

`WebcastBarrageMessage` (`gift/barrage.ts`)

| No. | Proto field              | Type                                | Property               | Kind    |
| --- | ------------------------ | ----------------------------------- | ---------------------- | ------- |
| 5   | `content`                | `webcast.model.message.common.Text` | `content`              | message |
| 24  | `common_barrage_content` | `webcast.model.message.common.Text` | `commonBarrageContent` | message |
| 50  | `user`                   | `User`                              | `user`                 | message |

Not read: `msg_type` (3, `BarrageMessage_BarrageType`), `icon` (4), and the rest.

`WebcastSubNotifyMessage` (`gift/subNotify.ts`): pending.
`WebcastSubPinEventMessage` (`gift/subPinEvent.ts`): pending.
`WebcastGiftBroadcastMessage` (`gift/giftBroadcast.ts`): pending.
`WebcastRoomNotifyMessage` (`gift/roomNotify.ts`): pending.
`WebcastGoalUpdateMessage` [proto: webcast/model/gift/model_webcast_goal_update_message.proto] (`gift/goalUpdate.ts`): pending.
`WebcastViewerPicksUpdateMessage` (`gift/viewerPicks.ts`): pending.
`WebcastHourlyRankRewardMessage` (`gift/hourlyRank.ts`): pending.
`WebcastGiftPromptMessage` (`gift/tail.ts`): pending.
`WebcastGiftPanelUpdateMessage` (`gift/tail.ts`): pending.
`WebcastGiftDynamicRestrictionMessage` (`gift/tail.ts`): pending.
`WebcastGuideMessage` (`gift/tail.ts`): pending.
`WebcastBoostCardMessage` (`gift/tail.ts`): pending.

#### Link-mic and battles (`messages/link/`)

The nested types several tables share are in `link/shared.ts`: `Player`, `BattleSetting`, a host's supporters (`BattleArmiesEntry`) and a linked user (`LinkUser`).

Two kinds of participant appear. The link-layer and link-state messages carry a `webcast.model.message.linkcore.Player` [proto: webcast/model/message/linkcore_player.proto, line 5] (`PlayerSchema`): `room_id` (1, int64) → `roomId`, id; `user_id` (2, int64) → `userId`, id. It has no name or picture: an app matches the ids against a `User` it saw elsewhere ([Open items](#open-items) 44). The older link messages (`WebcastLinkMessage`, `WebcastLinkMicMethod`) carry full `User`s, and battles their own `BattleBaseUserInfo` (a name, a username and a picture).

A `map<int64, X>` field is read as its entries, a repeated message of `key` (1, int64) → `key`, id and `value` (2, `X`) → `value`, message, in wire order; a key that comes twice is kept twice.

`WebcastLinkMicBattle` [proto: webcast/model/message/messages.proto, line 1423] (`link/linkMicBattle.ts`)

| No. | Proto field          | Type                                         | Property           | Kind                       |
| --- | -------------------- | -------------------------------------------- | ------------------ | -------------------------- |
| 2   | `battle_id`          | int64                                        | `battleId`         | id                         |
| 3   | `battle_settings`    | `battle.BattleSetting`                       | `battleSettings`   | message                    |
| 4   | `action`             | `webcast.im.LinkMicBattle_BattleAction` enum | `action`           | enum                       |
| 5   | `battle_result`      | `map<int64, battle.BattleResult>`            | `battleResult`     | repeated message (entries) |
| 9   | `armies`             | repeated `battle.UserArmiesWrapper`          | `armies`           | repeated message           |
| 10  | `anchors_info`       | repeated `battle.BattleUserInfoWrapper`      | `anchorsInfo`      | repeated message           |
| 14  | `team_member`        | repeated `TeamUsersInfo`                     | `teamMember`       | repeated message           |
| 16  | `action_by_user_id`  | int64                                        | `actionByUserId`   | id                         |
| 17  | `team_battle_result` | repeated `live.match.BattleTeamResult`       | `teamBattleResult` | repeated message           |

`armies` and `anchors_info` are repeated wrapper messages with a map entry's shape (`key` 1, `value` 2), read the same way. Not read: `fuzzy_display_config` (6), `invitee_gift_permission_type` (8), `bubble_text` (11), `supported_actions` (12), `battle_combo_v2` (13), `invitees_gift_permission_type` (15), `team_armies` (18), and 19–30 (A/B settings, campaigns, league and enigma data, the cross-room layout, tracking).
`webcast.model.message.battle.BattleSetting` [proto: webcast/model/message/battle.proto, line 35] (`BattleSettingSchema`): `battle_id` (1, int64) → `battleId`, id; `start_time_ms` (2, int64) → `startTimeMs`, id; `duration` (3, int32) → `duration`, int32; `channel_id` (4, int64) → `channelId`, id; `status` (5, `webcast.model.data.BattleSettings_BattleStatus`) → `status`, enum; `battle_type` (8, `webcast.model.data.BattleType`) → `battleType`, enum; `end_time_ms` (10, int64) → `endTimeMs`, id. Not read: `invite_type` (6), `gift_mode_meta` (7), `extra_duration_second` (9), `scene` (11), `source_type` (12), 13–15.
`webcast.model.message.battle.BattleResult` [battle.proto, line 18] (`BattleUserResultSchema`, the `BattleUserResult` type): `user_id` (1, int64) → `userId`, id; `result` (2, `webcast.model.data.BattleResult_Result`) → `result`, enum; `score` (3, int64) → `score`, count; `diamond_score` (4, int64) → `diamondScore`, count. Not read: `enigma_score` (5), `enigma_uv` (6). The entries of `battle_result` are `BattleResultEntrySchema` (`BattleResultEntry`).
`webcast.model.message.battle.UserArmiesWrapper` [battle.proto, line 111] (`BattleArmiesEntrySchema`, the `BattleArmiesEntry` type): `key` (1, int64) → `key`, id; `value` (2, `BattleUserArmies`) → `value`, message. An entry of `WebcastLinkMicArmies.armies` has the same shape and shares the table.
`webcast.model.message.battle.BattleUserArmies` [battle.proto, line 77] (`BattleUserArmiesSchema`): `user_armies` (1, repeated `BattleUserArmy`) → `userArmies`, repeated message; `hostscore` (2, int64) → `hostScore`, count. Not read: `anchor_id_str` (3), `host_enigma_score` (4), `host_enigma_uv` (5).
`webcast.model.message.battle.BattleUserArmy` [battle.proto, line 85] (`BattleUserArmySchema`): `user_id` (1, int64) → `userId`, id; `score` (2, int64) → `score`, count; `nickname` (3, string) → `nickname`; `avatar_thumb` (4, `ImageModel`) → `avatarThumb`, message; `diamond_score` (5, int64) → `diamondScore`, count. Not read: `user_id_str` (6), `enigma_score` (7).
`webcast.model.message.battle.BattleUserInfoWrapper` [battle.proto, line 95] (`BattleUserInfoEntrySchema`): `key` (1, int64) → `key`, id; `value` (2, `live.match.BattleUserInfo`) → `value`, message.
`webcast.model.live.match.BattleUserInfo` [proto: webcast/model/live_match.proto, line 121] (`BattleUserInfoSchema`): `user` (1, `BattleBaseUserInfo`) → `user`, message. Not read: `tags` (2).
`webcast.model.live.match.BattleBaseUserInfo` [live_match.proto, line 32] (`BattleBaseUserInfoSchema`): `user_id` (1, int64) → `userId`, id; `nick_name` (2, string) → `nickName`; `avatar_thumb` (3, `ImageModel`) → `avatarThumb`, message; `display_id` (4, string) → `displayId` (the username); `room_id` (5, int64) → `roomId`, id. Not read: `invitation_role` (6).
`webcast.model.message.TeamUsersInfo` [messages.proto, line 856] (`TeamUsersInfoSchema`): `team_id` (1, int64) → `teamId`, id; `user_id` (2, repeated int64, packed or not) → `userId`, repeated id.
`webcast.model.live.match.BattleTeamResult` [live_match.proto, line 105] (`BattleTeamResultSchema`): `team_id` (1, int64) → `teamId`, id; `team_user` (2, repeated `BattleTeamUser`) → `teamUser`, repeated message; `result` (3, int32) → `result`, int32 (an int32, not `BattleResult_Result`); `total_score` (4, int64) → `totalScore`, count. Not read: `total_enigma_score` (5), `total_enigma_uv` (6).
`webcast.model.live.match.BattleTeamUser` [live_match.proto, line 114] (`BattleTeamUserSchema`): `user_id` (1, int64) → `userId`, id; `score` (2, int64) → `score`, count. Not read: `user_id_str` (3), `enigma_score` (4).
`LinkMicBattle_BattleAction` [proto: webcast/im.proto, line 224]: `LINK_MIC_BATTLE_BATTLE_ACTION_UNKNOWN` 0, `INVITE` 1, `REJECT` 2, `CANCEL` 3, `OPEN` 4, `FINISH` 5, `LINK_MIC_BATTLE_BATTLE_ACTION_CUT_SHORT` 6, `ACCEPT` 7, `QUIT_APPLY` 8, `DECLINE_QUIT` 9, `DECLINE_OFF_QUIT` 10, `LEAVE_LINKMIC` 11; exported as `BattleAction` (`UNKNOWN`, `CUT_SHORT` without the prefix). `BattleSettings_BattleStatus` [proto: webcast/model/data/messages.proto, line 126]: `BATTLE_NOT_STARTED` 0, `BATTLE_STARTED` 1, `BATTLE_FINISHED` 2, `BATTLE_PUNISH_STARTED` 3, `BATTLE_PUNISH_FINISHED` 4; exported as `BattleStatus` without the `BATTLE_` prefix. `BattleResult_Result` [line 115]: **`WIN` 0**, `LOSE` 1, `DRAW` 2; exported as `BattleResult`: a result left out reads as a win ([Open items](#open-items) 43). `BattleType` [line 134]: `UNKNOWN_BATTLE_TYPE` 0, `NORMAL_BATTLE` 1, `TEAM_BATTLE` 2, `INDIVIDUAL_BATTLE` 3, `NUM_1_VN` 4, `TAKE_THE_STAGE` 51, `GROUP_SHOW` 52, `BEANS` 53, `GROUP_RANK_LIST` 54; exported as `BattleType` (`UNKNOWN` for 0).

`WebcastLinkMicArmies` [proto: webcast/model/message/messages.proto, line 1397] (`link/linkMicArmies.ts`)

| No. | Proto field           | Type                                          | Property            | Kind                       |
| --- | --------------------- | --------------------------------------------- | ------------------- | -------------------------- |
| 2   | `battle_id`           | int64                                         | `battleId`          | id                         |
| 3   | `armies`              | `map<int64, battle.BattleUserArmies>`         | `armies`            | repeated message (entries) |
| 7   | `trigger_reason`      | `webcast.im.LinkMicArmies_TriggerReason` enum | `triggerReason`     | enum                       |
| 8   | `from_user_id`        | int64                                         | `fromUserId`        | id                         |
| 9   | `gift_id`             | int64                                         | `giftId`            | id                         |
| 10  | `gift_count`          | int32                                         | `giftCount`         | int32                      |
| 12  | `total_diamond_count` | int32                                         | `totalDiamondCount` | int32                      |

`armies` entries are read by `BattleArmiesEntrySchema` (above): the host's user id, and the host's score and top supporters. Not read: `channel_id` (4), `send_gift_success_time` (5), `update_battle_score_time` (6), `gift_icon_image` (11), `repeat_count` (13), `team_armies` (14), `trigger_critical_strike` (15), `has_team_match_mvp_sfx` (16), `log_id` (17), `battle_settings` (18), 19–21.
`LinkMicArmies_TriggerReason` [proto: webcast/im.proto, line 210]: `LINK_MIC_ARMIES_TRIGGER_REASON_UNKNOWN` 0, `SCORE_UPDATE` 1, `BATTLE_END` 2, `OPT_OUT_UPDATE` 3, `KEEP_ALIVE` 4, `EFFECT_UPDATE` 5; exported as `ArmiesTriggerReason` (`UNKNOWN` for 0).

`WebcastLinkMicBattlePunishFinish` [proto: webcast/model/message/messages.proto, line 1479] (`link/linkMicBattlePunishFinish.ts`)

| No. | Proto field  | Type                                               | Property    | Kind |
| --- | ------------ | -------------------------------------------------- | ----------- | ---- |
| 2   | `channel_id` | int64                                              | `channelId` | id   |
| 3   | `op_uid`     | int64                                              | `opUid`     | id   |
| 4   | `reason`     | `webcast.im.LinkMicBattlePunishFinish_Reason` enum | `reason`    | enum |
| 5   | `battle_id`  | int64                                              | `battleId`  | id   |

Not read: `battle_settings` (6), `match_punish_extra_info` (7).
`LinkMicBattlePunishFinish_Reason` [proto: webcast/im.proto, line 219]: `TIME_UP` 0, `CUT_SHORT` 1; exported as `PunishFinishReason`.

`WebcastLinkmicBattleTaskMessage` [proto: webcast/model/message/messages.proto, line 1569] (`link/linkMicBattleTask.ts`). The lowercase `mic` is the message's own name, and the batch's `method`.

| No. | Proto field         | Type                                    | Property          | Kind    |
| --- | ------------------- | --------------------------------------- | ----------------- | ------- |
| 2   | `task_message_type` | `webcast.im.BattleTaskMessageType` enum | `taskMessageType` | enum    |
| 4   | `task_update`       | `battle.BattleTaskUpdate`               | `taskUpdate`      | message |
| 5   | `task_settle`       | `battle.BattleTaskSettle`               | `taskSettle`      | message |
| 20  | `battle_id`         | int64                                   | `battleId`        | id      |

Not read: `start` (3, `BattleTaskStart`, the bonus settings), `reward` (6, `BattleRewardSettle`).
`webcast.model.message.battle.BattleTaskUpdate` [proto: webcast/model/message/battle.proto, line 70] (`BattleTaskUpdateSchema`): `progress` (1, int64) → `progress`, count; `from_user_id` (2, int64) → `fromUserId`, id. Not read: `prompt_key` (3), `log_id` (21).
`webcast.model.message.battle.BattleTaskSettle` [battle.proto, line 59] (`BattleTaskSettleSchema`): `result` (1, `webcast.im.BattleTaskSettle_Result`) → `result`, enum. Not read: `reward_start_time` (2), `reward_start_timestamp` (3).
`BattleTaskMessageType` [proto: webcast/im.proto, line 76]: `START` 0, `TASK_UPDATE` 1, `TASK_SETTLE` 2, `REWARD_SETTLE` 3; exported as `BattleTaskMessageType`. `BattleTaskSettle_Result` [line 83]: `SUCCEED` 0, `FAILED` 1, `BOTH_SUCCEED` 2; exported as `BattleTaskResult`.

`WebcastLinkMicFanTicketMethod` [proto: webcast/model/message/messages.proto, line 1491] (`link/linkMicFanTicketMethod.ts`)

| No. | Proto field              | Type                         | Property              | Kind    |
| --- | ------------------------ | ---------------------------- | --------------------- | ------- |
| 2   | `fan_ticket_room_notice` | `FanTicketRoomNoticeContent` | `fanTicketRoomNotice` | message |

`webcast.model.message.FanTicketRoomNoticeContent` [messages.proto, line 382] (`FanTicketRoomNoticeSchema`, the `FanTicketRoomNotice` type): `user_fan_ticket` (1, repeated `UserFanTicket`) → `userFanTicket`, repeated message; `total_linkmic_fan_ticket` (2, int64) → `totalLinkmicFanTicket`, count. Not read: `match_id` (3), `event_time` (4), `fan_ticket_icon_url` (5), `play_id` (6), `play_scene` (7), `version` (8), `score_type` (9).
`webcast.model.message.UserFanTicket` [messages.proto, line 983] (`UserFanTicketSchema`): `user_id` (1, int64) → `userId`, id; `fan_ticket` (2, int64) → `fanTicket`, count; `match_rank` (4, int32) → `matchRank`, int32. Not read: `match_total_score` (3), `countdown_info` (5), `play_info` (6), and 7–12 (icons, animations and styles).

`WebcastLinkMicMethod` [proto: webcast/model/message/messages.proto, line 1497] (`link/linkMicMethod.ts`)

| No. | Proto field       | Type                                       | Property        | Kind             |
| --- | ----------------- | ------------------------------------------ | --------------- | ---------------- |
| 2   | `message_type`    | int32                                      | `messageType`   | int32            |
| 5   | `user_id`         | int64                                      | `userId`        | id               |
| 8   | `channel_id`      | int64                                      | `channelId`     | id               |
| 13  | `invite_uid`      | int64                                      | `inviteUid`     | id               |
| 14  | `answer`          | int32                                      | `answer`        | int32            |
| 21  | `to_user_id`      | int64                                      | `toUserId`      | id               |
| 24  | `from_user_id`    | int64                                      | `fromUserId`    | id               |
| 38  | `rival_anchor_id` | int64                                      | `rivalAnchorId` | id               |
| 45  | `linked_users`    | repeated `User`                            | `linkedUsers`   | repeated message |
| 47  | `reply_type`      | `webcast.model.data.LinkmicReplyType` enum | `replyType`     | enum             |

`message_type` and `answer` are int32s with no enum in the 0.2.3 protos ([Open items](#open-items) 40). Not read: everything else, among it the RTC and app credentials (`access_key` 3, `rtc_ext_info` 32, `rtc_app_id` 33, `app_id` 34, `app_sign` 35, `rtc_app_sign` 36), which the library never reads, `fan_ticket` (6), `total_linkmic_fan_ticket` (7), `start_time` (15), `duration` (16), `match_type` (18), `win` (19), `tips` (25), `from_room_id` (28) and `scene` (43).
`LinkmicReplyType` [proto: webcast/model/data/messages.proto, line 471]: `RT_UNKNOWN` 0, `RT_AGREE` 1, `RT_REJECT` 2; exported as `LinkmicReplyType` without the `RT_` prefix.

`WebcastLinkMessage` [proto: webcast/model/message/messages.proto, line 1363] (`link/linkMessage.ts`)

| No. | Proto field                  | Type                                                        | Property                  | Kind    |
| --- | ---------------------------- | ----------------------------------------------------------- | ------------------------- | ------- |
| 2   | `message_type`               | int32                                                       | `messageType`             | int32   |
| 3   | `linker_id`                  | int64                                                       | `linkerId`                | id      |
| 4   | `scene`                      | int32                                                       | `scene`                   | int32   |
| 5   | `invite_content`             | `linker.invite_message.LinkerInviteContent`                 | `inviteContent`           | message |
| 6   | `reply_content`              | `linker.reply_message.LinkerReplyContent`                   | `replyContent`            | message |
| 9   | `enter_content`              | `linker.LinkerEnterContent`                                 | `enterContent`            | message |
| 10  | `leave_content`              | `linker.LinkerLeaveContent`                                 | `leaveContent`            | message |
| 12  | `kick_out_content`           | `linker.LinkerKickOutContent`                               | `kickOutContent`          | message |
| 13  | `linked_list_change_content` | `linker.linked_list_change_message.LinkedListChangeContent` | `linkedListChangeContent` | message |
| 16  | `mute_content`               | `linker.LinkerMuteContent`                                  | `muteContent`             | message |
| 20  | `list_change_content`        | `linker.listchangemessage.LinkerListChangeContent`          | `listChangeContent`       | message |
| 22  | `media_change_content`       | `LinkerMediaChangeContent`                                  | `mediaChangeContent`      | message |

`message_type` and `scene` are int32s with no enum ([Open items](#open-items) 40); the content that is set says what happened. Not read: `create_content` (7), `close_content` (8), `cancel_content` (11), `update_user_content` (14), `waiting_list_change_content` (15), `random_match_content` (17), `update_user_setting_content` (18), `mic_idx_update_content` (19), `cohost_list_change_content` (21), `reply_accept_notice_content` (23), `sys_kick_out_content` (101), `user_toast_content` (102), `extra` (200), `expire_timestamp` (201), `transfer_extra` (202), `version` (203).
Every content but `LinkerMediaChangeContent` is in package `webcast.model.message.linker` (files in `webcast/model/message/linker/`):
`invite_message.LinkerInviteContent` [proto: webcast/model/message/linker/invite_message.proto, line 32] (`LinkerInviteContentSchema`): `from_user_id` (1, int64) → `fromUserId`, id; `from_user` (8, `User`) → `fromUser`, message. Not read: `from_room_id` (2), the RTC fields (3–5, 7), `sec_from_user_id` (6), 9–23 and 101.
`reply_message.LinkerReplyContent` [linker/reply_message.proto, line 11] (`LinkerReplyContentSchema`): `reply_status` (7, int32) → `replyStatus`, int32 (an int32, not an enum); `from_user` (9, `User`) → `fromUser`, message; `to_user` (10, `User`) → `toUser`, message. Not read: `from_user_id` (1), `from_room_id` (2), `from_user_linkmic_info` (3), `to_user_id` (4), `to_user_linkmic_info` (5), `link_type` (6), `linker_setting` (8), 11–18.
`LinkerEnterContent` [linker/messages.proto, line 26] (`LinkerEnterContentSchema`): `linked_users` (1, repeated `linked_list_change_message.ListUser`) → `linkedUsers`, repeated message. Not read: `anchor_multi_live_enum` (2), `anchor_setting_info` (3).
`LinkerLeaveContent` [linker/messages.proto, line 39] (`LinkerLeaveContentSchema`): `user_id` (1, int64) → `userId`, id; `leave_reason` (4, int64) → `leaveReason`, count. Not read: `linkmic_id_str` (2), `send_leave_uid` (3).
`LinkerKickOutContent` [linker/messages.proto, line 33] (`LinkerKickOutContentSchema`): `from_user_id` (1, int64) → `fromUserId`, id; `kickout_reason` (2, `webcast.linkmic.common.KickoutReason`) → `kickoutReason`, enum.
`linked_list_change_message.LinkedListChangeContent` [linker/linked_list_change_message.proto, line 8] (`LinkedListChangeContentSchema`): `linked_users` (1, repeated `ListUser`) → `linkedUsers`, repeated message.
`linked_list_change_message.ListUser` [linker/linked_list_change_message.proto, line 12] (`LinkUserSchema`, the `LinkUser` type): `user` (1, `User`) → `user`, message; `link_status` (4, `webcast.model.data.LinkListStatus`) → `linkStatus`, enum; `link_type` (5, `webcast.model.data.LinkType`) → `linkType`, enum; `user_position` (6, int32) → `userPosition`, int32; `role_type` (10, `webcast.model.data.LinkRoleType`) → `roleType`, enum. Not read: `linkmic_id` (2), `linkmic_id_str` (3), `silence_status` (7), `modify_time` (8), `linker_id` (9).
`LinkerMuteContent` [linker/messages.proto, line 46] (`LinkerMuteContentSchema`): `user_id` (1, int64) → `userId`, id; `mute_status` (2, `webcast.im.MuteStatus`) → `muteStatus`, enum.
`listchangemessage.LinkerListChangeContent` [linker/listchangemessage.proto, line 21] (`LinkerListChangeContentSchema`): `linked_users` (1), `applied_users` (2) and `connecting_users` (3), each repeated `LinkListUser` → `linkedUsers`, `appliedUsers`, `connectingUsers`, repeated message.
`listchangemessage.LinkListUser` [linker/listchangemessage.proto, line 8] (`LinkListUserSchema`): `user` (1, `User`) → `user`, message; `link_type` (3, int32) → `linkType`, int32; `role_type` (4, int32) → `roleType`, int32. A different message from `ListUser`: its link and role types are plain int32s. Not read: `modify_time` (2), `linkmic_id_str` (5), `payed_money` (6), `fan_ticket` (7), `fan_ticket_icon_type` (8), `link_user_type` (9), `blurred_avatar` (10).
`webcast.model.message.LinkerMediaChangeContent` [messages.proto, line 530] (`LinkerMediaChangeContentSchema`): `op` (1, `webcast.model.data.GuestMicCameraManageOp`) → `op`, enum; `to_user_id` (2, int64) → `toUserId`, id. Not read: `anchor_id` (3), `room_id` (4), `change_scene` (5), `operator_info` (7).
`KickoutReason` [proto: webcast/linkmic/common.proto, line 39]: `KICK_OUT_REASON_UNKNOWN` 0, `KICK_OUT_REASON_FIRST_FRAME_TIME_OUT` 1, `KICK_OUT_REASON_BY_HOST` 2, `KICK_OUT_REASON_RTC_LOST_CONNECTION` 3, `KICK_OUT_REASON_BY_PUNISH` 4, `KICK_OUT_REASON_BY_ADMIN` 5, `KICK_OUT_REASON_HOST_REMOVE_ALL_GUESTS` 6, `KICK_OUT_REASON_ENIGMA_EXPIRE` 7; exported as `KickoutReason` without the `KICK_OUT_REASON_` prefix. `LinkListStatus` [proto: webcast/model/data/messages.proto, line 413]: `STATUS_UN_KOWN` 0, `STATUS_WAITING` 1, `STATUS_LINKED` 2, `STATUS_FINISHED` 3, `STATUS_WAITING_OR_LINKED` 4; exported as `LinkListStatus` (`UNKNOWN`, the others without `STATUS_`). `LinkType` [line 435]: `TYPE_UNKNOWN` 0, `TYPE_VIDEO` 1, `TYPE_AUDIO` 2, `TYPE_VIRTUAL` 3; exported as `LinkType` without `TYPE_`. `LinkRoleType` [line 421]: `TYPE_ROLE_TYPE_UN_KOWN` 0, `TYPE_LEADER` 1, `TYPE_PLAYER` 2, `TYPE_INVITEE` 3, `TYPE_APP_LIER` 4; exported as `LinkRoleType` (`UNKNOWN`, `LEADER`, `PLAYER`, `INVITEE`, `APPLIER`). `MuteStatus` [proto: webcast/synthetic_enums.proto, line 17, package `webcast.im`]: **`MUTE_STATUS_MUTE` 0**, `MUTE_STATUS_UN_MUTE` 1; exported as `MuteStatus` (`MUTE`, `UN_MUTE`): a status left out reads as muted ([Open items](#open-items) 43). `GuestMicCameraManageOp` [proto: webcast/model/data/messages.proto, line 389]: `OPEN_MIC` 0, `OPEN_CAMERA` 1, `CLOSE_MIC` 2, `CLOSE_CAMERA` 3, `CLOSE_MIC_PUNISH` 4; exported as `GuestMicCameraManageOp`.

`WebcastLinkLayerMessage` [proto: webcast/model/message/linkcore_webcast_link_layer_message.proto, line 11, package `webcast.model.message.linkcore`] (`link/linkLayer.ts`)

| No. | Proto field            | Type                                     | Property             | Kind    |
| --- | ---------------------- | ---------------------------------------- | -------------------- | ------- |
| 2   | `message_type`         | `webcast.im.LinkLayerMessageType` enum   | `messageType`        | enum    |
| 3   | `channel_id`           | int64                                    | `channelId`          | id      |
| 4   | `scene`                | `webcast.linkmic.common.Scene` enum      | `scene`              | enum    |
| 9   | `linker_mode`          | `webcast.linkmic.common.LinkerMode` enum | `linkerMode`         | enum    |
| 102 | `list_change_content`  | `LinkListChangeContent`                  | `listChangeContent`  | message |
| 103 | `invite_content`       | `InviteContent`                          | `inviteContent`      | message |
| 104 | `apply_content`        | `ApplyContent`                           | `applyContent`       | message |
| 105 | `permit_apply_content` | `PermitApplyContent`                     | `permitApplyContent` | message |
| 106 | `reply_invite_content` | `ReplyInviteContent`                     | `replyInviteContent` | message |
| 107 | `kick_out_content`     | `KickOutContent`                         | `kickOutContent`     | message |
| 110 | `leave_content`        | `LeaveContent`                           | `leaveContent`       | message |
| 111 | `finish_content`       | `FinishChannelContent`                   | `finishContent`      | message |

Every participant here is a `Player`. Not read: `source` (5), `centerized_idc` (6), `rtc_room_id` (7), `version` (8), `wait_cross_data` (10), `create_channel_content` (100), `cancel_apply_content` (108), `cancel_invite_content` (109), `join_direct_content` (112), the group contents (113–120), `link_envelope_content` (150), and `business_content` (200, `chatroom.model.multiguestv3.BusinessContent`: the multi-guest and co-host contents, several levels deep, where the users' names are; [Open items](#open-items) 44).
The contents are in package `webcast.model.message.linkcore` [proto: webcast/model/message/linkcore.proto]:
`LinkListChangeContent` [line 107] (`LinkListChangeContentSchema`): `type` (1, int32) → `type`, int32; `list` (2, `AllListUser`) → `list`, message. Not read: `linked_user_ui_positions` (3), `content_pos` (4).
`AllListUser` [line 9] (`AllListUserSchema`): `linked_list` (2), `applied_list` (3), `invited_list` (4) and `ready_list` (5), each repeated `LinkLayerListUser` → `linkedList`, `appliedList`, `invitedList`, `readyList`, repeated message.
`LinkLayerListUser` [line 96] (`LinkLayerListUserSchema`): `user` (1, `Player`) → `user`, message; `linkmic_id` (2, string) → `linkmicId`; `user_type` (6, `webcast.linkmic.common.LinkerUserType`) → `userType`, enum. Not read: `pos` (3), `linked_time_nano` (4), `app_version` (5), `linker_session_id` (7).
`InviteContent` [line 57] (`LinkInviteContentSchema`, the `LinkInviteContent` type): `invitor` (1, `Player`) → `invitor`, message; `invitee` (8, `Player`) → `invitee`, message. Not read: `invitee_rtc_ext_info` (2), `invitor_link_mic_id` (3), `invitee_link_mic_id` (4), `is_owner` (5), `pos` (6), `dsl` (7), `operator` (9), `invitee_linker_session_id` (10).
`ApplyContent` [line 16] (`LinkApplyContentSchema`): `applier` (1, `Player`) → `applier`, message. Not read: `applier_link_mic_id` (2), `applier_linker_session_id` (3).
`PermitApplyContent` [line 114] (`LinkPermitApplyContentSchema`): `permiter` (1, `Player`) → `permiter`, message; `reply_status` (4, `webcast.linkmic.common.AgreeStatus`) → `replyStatus`, enum; `applier` (6, `Player`) → `applier`, message. Not read: `permiter_link_mic_id` (2), `applier_pos` (3), `dsl` (5), `operator` (7), 8–14.
`ReplyInviteContent` [line 183] (`LinkReplyInviteContentSchema`): `invitee` (1, `Player`) → `invitee`, message; `reply_status` (2, `AgreeStatus`) → `replyStatus`, enum. Not read: `invitee_link_mic_id` (3), `invitee_pos` (4), `invite_operator_user` (5), 6–10.
`KickOutContent` [line 75] (`LinkKickOutContentSchema`): `offliner` (1, `Player`) → `offliner`, message; `kickout_reason` (2, `KickoutReason`) → `kickoutReason`, enum. Not read: 3–7 (layout positions, the session id).
`LeaveContent` [line 86] (`LinkLeaveContentSchema`): `leaver` (1, `Player`) → `leaver`, message; `leave_reason` (2, int64) → `leaveReason`, count. Not read: 3–7 (layout positions, the session id).
`FinishChannelContent` [line 52] (`LinkFinishContentSchema`): `owner` (1, `Player`) → `owner`, message; `finish_reason` (2, int64) → `finishReason`, count.
`LinkLayerMessageType` [proto: webcast/im.proto, line 188]: `LINKER_UNKNOWN` 0, `LINKER_CREATE` 1, `LINKER_INVITE` 2, `LINKER_APPLY` 3, `LINKER_PERMIT` 4, `LINKER_REPLY` 5, `LINKER_KICK_OUT` 6, `LINKER_CANCEL_APPLY` 7, `LINKER_CANCEL_INVITE` 8, `LINKER_LEAVE` 9, `LINKER_FINISH` 10, `LINKER_LIST_CHANGE` 11, `LINKER_JOIN_DIRECT` 12, `LINKER_JOIN_GROUP` 13, `LINKER_PERMIT_GROUP` 14, `LINKER_CANCEL_GROUP` 15, `LINKER_LEAVE_GROUP` 16, `LINKER_P_2_P_GROUP_CHANGE` 17, `LINKER_GROUP_CHANGE` 18; exported as `LinkLayerMessageType` without the `LINKER_` prefix. `Scene` [proto: webcast/linkmic/common.proto, line 155]: `SCENE_UNKNOWN` 0, `CO_HOST` 2, `MULTI_LIVE` 4; exported as `LinkScene` (`UNKNOWN` for 0). `LinkerMode` [line 70]: `LINKER_MODE_UNKNOWN` 0, `INNER` 1, `CROSS` 2, `MIXED` 3; exported as `LinkerMode` (`UNKNOWN` for 0). `AgreeStatus` [line 9]: `AGREE_UNKNOWN` 0, `AGREE` 1, `REJECT` 2; exported as `AgreeStatus` (`UNKNOWN` for 0). `LinkerUserType` [line 77]: `LINKER_USER_TYPE_UNKNOWN` 0, `GUEST` 1, `HOST` 2; spelled out on `LinkLayerListUser.userType`, not exported as a constant.

`WebcastLinkStateMessage` [proto: webcast/im.proto, line 602, package `webcast.im`] (`link/linkState.ts`)

| No. | Proto field   | Type                                            | Property     | Kind             |
| --- | ------------- | ----------------------------------------------- | ------------ | ---------------- |
| 2   | `channel_id`  | int64                                           | `channelId`  | id               |
| 3   | `scene`       | `webcast.linkmic.common.Scene` enum             | `scene`      | enum             |
| 7   | `user_states` | repeated `webcast.linkmic.common.LinkUserState` | `userStates` | repeated message |
| 9   | `state_type`  | `webcast.linkmic.common.StateType` enum         | `stateType`  | enum             |

Not read: `version` (4), `need_ack` (5), `layout` (6), `client_send_time` (8), `background` (10), `wallpaper_url` (12), `ui_pos` (13), `spot_list` (14), `audio_muted_remote_channels` (15), `linker_mode` (16).
`webcast.linkmic.common.LinkUserState` [proto: webcast/linkmic/common.proto, line 362] (`LinkUserStateSchema`): `user` (1, `Player`) → `user`, message; `linkmic_id` (2, string) → `linkmicId`; `pos` (3, `linkcore.MicPositionData`) → `pos`, message; `online_user_state` (5, `OnlineUserState`) → `onlineUserState`, enum; `audio_muted` (6, `MediaState`) → `audioMuted`, enum; `video_muted` (7, `MediaState`) → `videoMuted`, enum. Not read: `linked_time_nano` (4), `rtc_connection` (8), `network_state` (9), `avatar` (10), `linker_session_id` (11).
`webcast.model.message.linkcore.MicPositionData` [proto: webcast/model/message/linkcore_mic_position_data.proto, line 7] (`MicPositionDataSchema`): `link` (2, `LinkPosition`) → `link`, message. Not read: `type` (1).
`webcast.model.message.linkcore.LinkPosition` [proto: webcast/model/message/linkcore_link_position.proto, line 5] (`LinkPositionSchema`): `position` (1, int32) → `position`, int32. Not read: `opt` (2).
`StateType` [proto: webcast/linkmic/common.proto, line 222]: `STATE_INVALID` 0, `STATE_LAYOUT` 1, `STATE_ONLINE_USER_STATE` 2, `STATE_AUDIO_MUTE` 3, `STATE_VIDEO_MUTE` 4, `STATE_RTC_CONNECTION` 5, `STATE_NETWORK` 6, `STATE_BACKGROUND_IMAGE` 7, `STATE_SCREEN_ORIENTATION` 8, `STATE_AVATAR_ID` 9, `STATE_AUDIO_MUTE_CHANNELS` 10, `STATE_REQ_BATCH_CHANGE` 100; exported as `LinkStateType` without the `STATE_` prefix. `OnlineUserState` [line 101]: `STATE_UNDEFINED` 0, `STATE_NORMAL` 1, `STATE_PAUSED` 2; exported as `OnlineUserState` without `STATE_`. `MediaState` [line 83]: `MEDIA_UNDEFINED` 0, `MEDIA_NORMAL` 1, `MEDIA_MUTED` 2, `MEDIA_UN_MUTE_OCCUPIED` 3, `MEDIA_MUTED_OCCUPIED` 4; exported as `MediaState` without `MEDIA_`.

The tail (`link/tail.ts`), each with `common` (1):

- `WebcastLinkMicBattleItemCard` [proto: webcast/model/message/messages.proto, line 1458] (`LinkMicBattleItemCardSchema`): `battle_id` (2, int64) → `battleId`, id; `msg_type` (3, `webcast.im.BattleCardMsgType`) → `msgType`, enum; `award_reason` (16, int32) → `awardReason`, int32. Not read: the card contents (4–15, one message per kind of card). 2.4.0 has no route for it ([Open items](#open-items) 45). `BattleCardMsgType` [proto: webcast/im.proto, line 55]: `UNKNOWN_CARD_ACTION` 0, `CARD_OBTAIN_GUIDE` 1, `USE_CRITICAL_STRIKE_CARD` 2, `USE_SMOKE_CARD` 3, `AWARD_CARD_NOTICE` 4, `USE_EXTRA_TIME_CARD` 5, `USE_SPECIAL_EFFECT_CARD` 6, `USE_POTION_CARD` 7, `USE_WAVE_CARD` 8, `SPECIAL_EFFECT_NOTICE` 9, `USE_TOP_2_CARD` 10, `USE_TOP_3_CARD` 11, `USE_VAULT_GLOVE_CARD` 12; exported as `BattleCardMsgType` (`UNKNOWN` for 0).
- `WebcastLinkMicLayoutStateMessage` [proto: webcast/im.proto, line 592, package `webcast.im`] (`LinkMicLayoutStateMessageSchema`): `channel_id` (2, int64) → `channelId`, id; `scene` (3, int32) → `scene`, int32 (an int32 here, not the `Scene` enum of the link-layer and link-state messages); `version` (4, int64) → `version`, count. Not read: `biz_layout_state` (5), `biz_spot_list` (6).

#### Room, ranks, polls, shopping and system (`messages/room/`)

`WebcastRoomUserSeqMessage` (`room/roomUser.ts`)

| No. | Proto field  | Type                   | Property    | Kind             |
| --- | ------------ | ---------------------- | ----------- | ---------------- |
| 2   | `ranks`      | repeated `Contributor` | `ranks`     | repeated message |
| 3   | `total`      | int64                  | `total`     | count            |
| 7   | `total_user` | int64                  | `totalUser` | count            |

`total` is the viewers watching now, `total_user` the viewers so far (how Tokio reads them). Not read: `pop_str` (4), `seats` (5), `popularity` (6), `anonymous` (8).
`webcast.model.message.Contributor`: `score` (1, int64) → `score`, count; `user` (2, `User`) → `user`, message; `rank` (3, int64) → `rank`, count. Not read: `delta` (4).

`WebcastControlMessage` [proto: webcast/model/message/messages.proto, line 1186] (`room/control.ts`)

| No. | Proto field   | Type                            | Property     | Kind    |
| --- | ------------- | ------------------------------- | ------------ | ------- |
| 2   | `action`      | `webcast.im.ControlAction` enum | `action`     | enum    |
| 3   | `tips`        | string                          | `tips`       | string  |
| 4   | `extra`       | `Extra`                         | `extra`      | message |
| 7   | `punish_info` | `PunishEventInfo`               | `punishInfo` | message |

`ControlAction` [proto: webcast/synthetic_enums.proto, line 22]: `CONTROL_ACTION_FALLBACK_UNKNOWN` 0, `CONTROL_ACTION_STREAM_PAUSED` 1, `CONTROL_ACTION_STREAM_UNPAUSED` 2, **`CONTROL_ACTION_STREAM_ENDED` 3**, **`CONTROL_ACTION_STREAM_SUSPENDED` 4**; exported as `ControlAction` (`UNKNOWN`, `PAUSED`, `UNPAUSED`, `STREAM_ENDED`, `STREAM_SUSPENDED`). 2.4.0's legacy client spells out 3 as ended by the host and 4 as ended by a moderator (a ban) [TLC: src/lib/client/legacy/index.ts]. Not read: `perception_dialog` (5), `perception_audience_text` (6), `float_text` (8), `float_style` (9).
`webcast.model.message.Extra` [proto: webcast/model/message/messages.proto, line 368] (`ControlExtraSchema`, the `ControlExtra` type): `title` (3, `Text`) → `title`, message; `violation_reason` (4, `Text`) → `violationReason`, message; `content` (5, `Text`) → `content`, message. Not read: `ban_info_url` (1), `reason_no` (2), `got_it_button` (6) and the rest.

`WebcastPerceptionMessage` [proto: webcast/model/message/messages.proto, line 1700] (`room/perception.ts`)

| No. | Proto field   | Type                   | Property     | Kind    |
| --- | ------------- | ---------------------- | ------------ | ------- |
| 2   | `dialog`      | `PerceptionDialogInfo` | `dialog`     | message |
| 3   | `punish_info` | `PunishEventInfo`      | `punishInfo` | message |

Not read: `end_time` (4), `show_violation_warning` (5), `toast` (6), `float_style` (7), `float_text` (8), `sheet` (9), `float_icon_type` (10).
`webcast.model.message.PerceptionDialogInfo` [proto: webcast/model/message/invite_top_host_info.proto, line 21] (`PerceptionDialogSchema`): `icon_type` (1, `webcast.model.data.PerceptionDialogIconType`) → `iconType`, enum; `title` (2, `Text`) → `title`, message; `sub_title` (3, `Text`) → `subTitle`, message; `scene` (7, int32) → `scene`, int32. Not read: `advice_action_text` (4), `default_action_text` (5), `violation_detail_url` (6), `target_user_id` (8), `target_room_id` (9), `count_down_time` (10), and the rest.
`PerceptionDialogIconType` [proto: webcast/model/data/messages.proto, line 560]: `ICON_TYPE_NONE` 0, `ICON_TYPE_WARNING` 1, `ICON_TYPE_LINKMIC` 2, `ICON_TYPE_GUEST_LINKMIC` 3, `ICON_TYPE_LIVE` 4, `ICON_TYPE_TREASURE_BOX` 5, `ICON_TYPE_MUTE` 6, `ICON_GAMEPAD_ACCESS_REVOKED` 7, `ICON_TYPE_BAN_REPORT_LIVE_SINGLE_ROOM` 8, `ICON_TYPE_BAN_REPORT_LIVE_ALL_ROOM` 9, `ICON_TYPE_BAN_REPORT_LIVE_GREEN_SCREEN` 10, `ICON_TYPE_GIFT` 11, `ICON_TYPE_APPEAL_SUCCESS` 12, `ICON_TYPE_MATCH` 13, `ICON_TYPE_LIVE_GOAL` 14, `ICON_TYPE_SUBSCRIPTION` 15, `ICON_TYPE_STAR_COMMENT` 16, `ICON_TYPE_RANKING` 17, `ICON_TYPE_COMMON` 18; exported as `PerceptionIconType` without the prefixes.

`WebcastRankUpdateMessage` [proto: webcast/model/message/messages.proto, line 1754] (`room/rankUpdate.ts`)

| No. | Proto field | Type                     | Property  | Kind             |
| --- | ----------- | ------------------------ | --------- | ---------------- |
| 2   | `updates`   | repeated `RankUpdate`    | `updates` | repeated message |
| 4   | `op_type`   | `webcast.im.OpType` enum | `opType`  | enum             |

Not read: `group_type` (3), `rank_priority` (5), `tabs` (6), `is_animation_loop_play` (7), `animation_loop_for_off` (8), `union_animation` (9), `tab_info` (10), `valid_ranks` (11).
`webcast.model.message.RankUpdate` [proto: webcast/model/message/messages.proto, line 759] (`RankUpdateSchema`): `rank_type` (1, `webcast.model.data.ProfitRankType`) → `rankType`, enum; `own_rank` (2, int64) → `ownRank`, count; `default_content` (3, `Text`) → `defaultContent`, message; `class_info` (14, `webcast.model.rank.ClassInfo`) → `classInfo`, message; `current_score` (15, int64) → `currentScore`, count. Not read: `prompt` (4), `show_entrance_animation` (5), `countdown` (6), `animation_info` (7), `belong_type` (8), `request_first_show_type` (9), `supported_version` (10), `owneronrank` (11), `entranceicon` (12), `affiliated_info` (13), `list_schema` (16).
`webcast.model.rank.ClassInfo` [proto: webcast/model/rank.proto, line 8] (`ClassInfoSchema`): `class_type` (1, `webcast.model.data.ClassType`) → `classType`, enum; `star_count` (2, int64) → `starCount`, count.
`OpType` [proto: webcast/im.proto, line 275]: `OP_TYPE_DEFAULT` 0, `ADD` 1, `REMOVE` 2, `RELOAD` 3, `BASIC_EFFECT` 4; exported as `RankOpType` (`DEFAULT` for 0). `ProfitRankType` [proto: webcast/model/data/messages.proto, line 627]: 27 values from `TYPE_HOURLY_RANK` 0, `TYPE_WEEKLY_RANK` 1 … `TYPE_CLASS_RANK` 16, `TYPE_DAILY_GAME_PUB_G` 20 … `TYPE_WEEKLY_E_COMMERCE_WOMEN_WEAR_UNDERWEAR` 28 to `TYPE_CAMPAIGN_LEAGUEMATCH_RANK` 101; exported as `ProfitRankType` without the `TYPE_` prefix. `ClassType` [proto: webcast/model/data/messages.proto, line 146]: `NONE` 0, `D_5` 100, `D_4` 200 … `A_1` 2000, `S` 2100 (one every 100); exported as `ClassType`.

`WebcastRankTextMessage` [proto: webcast/model/message/messages.proto, line 1736] (`room/rankText.ts`)

| No. | Proto field               | Type                                                   | Property         | Kind    |
| --- | ------------------------- | ------------------------------------------------------ | ---------------- | ------- |
| 2   | `scene`                   | `webcast.im.RankTextMessage_RankTestMessageScene` enum | `scene`          | enum    |
| 3   | `owner_idx_before_update` | int64                                                  | `ownerIdxBefore` | count   |
| 4   | `owner_idx_after_update`  | int64                                                  | `ownerIdxAfter`  | count   |
| 7   | `cur_user_id`             | int64                                                  | `curUserId`      | id      |
| 9   | `content`                 | `Text`                                                 | `content`        | message |
| 10  | `rank_type`               | `webcast.model.data.ProfitRankType` enum               | `rankType`       | enum    |

Not read: `self_get_badge_msg` (5), `other_get_badge_msg` (6), `left_icon` (8), `user_enigma_info` (11), `public_area_msg_common` (12).
`RankTextMessage_RankTestMessageScene` [proto: webcast/im.proto, line 317]: `RANK_TEXT_MESSAGE_RANK_TEST_MESSAGE_SCENE_UNKNOWN` 0, `ONLINE_AUDIENCE_TOP_N_UPDATE_PUBLIC_SCREEN` 1, `MID_PEAK_MOTIVATION_PUBLIC_SCREEN_TOP` 2, `MID_PEAK_MOTIVATION_PUBLIC_SCREEN_ENTER` 3, `TILE_REWARD_GUIDE` 4; exported as `RankTextScene` (`UNKNOWN` for 0).

`WebcastPollMessage` [proto: webcast/model/message/messages.proto, line 1715] (`room/poll.ts`)

| No. | Proto field            | Type                               | Property             | Kind    |
| --- | ---------------------- | ---------------------------------- | -------------------- | ------- |
| 2   | `message_type`         | int64                              | `messageType`        | count   |
| 3   | `poll_id`              | int64                              | `pollId`             | id      |
| 4   | `start_content`        | `PollStartContent`                 | `startContent`       | message |
| 5   | `end_content`          | `PollEndContent`                   | `endContent`         | message |
| 6   | `update_votes_content` | `PollUpdateVotesContent`           | `updateVotesContent` | message |
| 7   | `poll_kind`            | `webcast.model.data.PollKind` enum | `pollKind`           | enum    |

`message_type` is an int64 on the wire, not an enum; which values mean a start, a votes update and an end is [Open items](#open-items) 51, and the content that is set tells them apart meanwhile. Not read: `poll_basic_info` (8), `template_content` (9).
`webcast.model.message.PollStartContent` [proto: webcast/model/message/messages.proto, line 663] (`PollStartContentSchema`): `start_time` (1, int64) → `startTime`, id; `end_time` (2, int64) → `endTime`, id; `option_list` (3, repeated `PollOptionInfo`) → `optionList`, repeated message; `title` (4, string) → `title`, string; `operator` (5, `User`) → `operator`, message.
`webcast.model.message.PollEndContent` [line 649] (`PollEndContentSchema`): `end_type` (1, `webcast.model.data.PollEndType`) → `endType`, enum; `option_list` (2, repeated `PollOptionInfo`) → `optionList`, repeated message. Not read: `operator` (3).
`webcast.model.message.PollUpdateVotesContent` [line 671] (`PollUpdateVotesContentSchema`): `option_list` (2, repeated `PollOptionInfo`) → `optionList`, repeated message. Not read: `operator` (3).
`webcast.model.message.PollOptionInfo` [line 656] (`PollOptionSchema`): `votes` (1, int64) → `votes`, count; `display_content` (2, string) → `displayContent`, string; `option_idx` (3, int32) → `optionIdx`, int32. Not read: `vote_user_list` (4).
`PollKind` [proto: webcast/model/data/messages.proto, line 605]: `POLL_KIND_NORMAL` 0, `POLL_KIND_GIFT` 1, `CUSTOMIZABLE` 2, `CUSTOMIZABLE_GIFT` 3, `QUICK_GIFT` 4, `EMOTE` 5; exported as `PollKind` (`NORMAL`, `GIFT` for the first two). `PollEndType` [line 598]: `POLL_END_BY_TIME` 0, `POLL_END_BY_OWNER` 1, `POLL_END_BY_OTHER` 2, `POLL_END_BY_ADMIN` 3; exported as `PollEndType` without the prefix.

`WebcastOecLiveShoppingMessage` [proto: webcast/model/message/ext.proto, line 34, package `webcast.model.message.ext`] (`room/oecLiveShopping.ts`)

| No. | Proto field           | Type                                    | Property            | Kind    |
| --- | --------------------- | --------------------------------------- | ------------------- | ------- |
| 2   | `action_type`         | int32                                   | `actionType`        | int32   |
| 3   | `live_product_number` | int32                                   | `liveProductNumber` | int32   |
| 4   | `pop_product`         | `PopProduct`                            | `popProduct`        | message |
| 9   | `product_snap_shot`   | `webcast.model.message.ProductSnapShot` | `productSnapShot`   | message |

Not read: `trace_info` (5), `hot_tags` (6), `atmosphere_tag_info` (7), `live_permission_info` (8), `pin_card_delay_time` (10), 11–21, `oec_live_shopping_message_v2` (100).
`webcast.model.message.ext.PopProduct` [proto: webcast/model/message/ext.proto, line 14] (`PopProductSchema`): `title` (1, string) → `title`; `price` (2, string) → `price`; `image_url` (3, string) → `imageUrl`; `product_id` (6, int64) → `productId`, id. Not read: `open_url` (4), `product_type` (5), `source` (7), `source_from` (8), `schema` (9), `platform` (10), `product_status` (11).
`webcast.model.message.ProductSnapShot` [proto: webcast/model/message/messages.proto, line 694] (`ProductSnapShotSchema`): `product_id` (1, string) → `productId`, string (a string here, an int64 in `PopProduct`); `title` (2, string) → `title`. Not read: `cover` (3), `stock_type` (4), `timestamp` (5), `add_to_cart_button` (6).

The tail (`room/tail.ts`), each with `common` (1) [proto: webcast/model/message/messages.proto unless noted]:

- `WebcastGameRankNotifyMessage` [line 1209] (`GameRankNotifyMessageSchema`): `msg_type` (2, `webcast.im.GameRankNotifyMessage_MsgType`) → `msgType`, enum; `notify_text` (3, `Text`) → `notifyText`, message. `GameRankNotifyMessage_MsgType` [proto: webcast/im.proto, line 126]: `MSG_TYPE_RANK_IN_OUT` 0, `MSG_TYPE_RANK_CHANGE` 1, `MSG_TYPE_ANCHOR_ENCOURAGE` 2, **`MSG_TYPE_UN_KNOW` 255**; exported as `GameRankMsgType` (`UNKNOWN` for 255, not 0).
- `WebcastCapsuleMessage` [line 1125] (`CapsuleMessageSchema`): `desc` (3, `Text`) → `desc`, message; `type` (6, int32) → `type`, int32; `scene` (7, string) → `scene`; `sub_scene` (9, string) → `subScene`. Not read: `icon` (2), `button_text` (4), `schema` (5), `biz_params` (8), `style` (10), `skip_fc` (11), `public_area_message_common` (12), `report_action` (13).
- `WebcastMarqueeAnnouncementMessage` [line 1600] (`MarqueeAnnouncementMessageSchema`): `message_scene` (2, string) → `messageScene`. Not read: `message_entity` (3).
- `WebcastSpeakerMessage` [line 1865] (`SpeakerMessageSchema`) and `WebcastInRoomBannerMessage` [line 1342] (`InRoomBannerMessageSchema`): only `common` (1); the 0.2.3 protos give them no other field ([Open items](#open-items) 55).
- `WebcastAccessControlMessage` [line 1053] (`AccessControlMessageSchema`): `captcha` (2, `AccessControlCaptcha`) → `captcha`, message. `AccessControlCaptcha` [line 42] (`AccessControlCaptchaSchema`): `captcha_record_id` (1, int64) → `captchaRecordId`, id; `room_id` (2, int64) → `roomId`, id; `verify_duration_in_sec` (3, int64) → `verifyDurationInSec`, count.
- `WebcastAccessRecallMessage` [proto: webcast/model/game.proto, line 9, package `webcast.model.game`] (`AccessRecallMessageSchema`): `status` (2, int32) → `status`, int32; `duration` (3, int64) → `duration`, count; `end_time` (4, int64) → `endTime`, id; `scene` (5, string) → `scene`; `notice` (6, `Text`) → `notice`, message; `content` (7, `Text`) → `content`, message; `punish_info` (8, `PunishEventInfo`) → `punishInfo`, message.
- `WebcastPartnershipDropsUpdateMessage` [line 1677] (`PartnershipDropsUpdateMessageSchema`): `change_mode` (2, `webcast.im.PartnershipDropsUpdateMessage_ChangeMode`) → `changeMode`, enum; `drops_id` (3), `task_id` (4), `event_id` (5), strings → `dropsId`, `taskId`, `eventId`; `anchor_uid` (6, int64) → `anchorUid`, id. `PartnershipDropsUpdateMessage_ChangeMode` [proto: webcast/im.proto, line 283]: `CHANGE_MODE_SHOW` 0, `CHANGE_MODE_UPDATE` 1, `CHANGE_MODE_CLOSE` 2; exported as `PartnershipChangeMode` without the prefix.
- `WebcastPartnershipGameOfflineMessage` [line 1688] (`PartnershipGameOfflineMessageSchema`): `offline_game_list` (2, repeated `OfflineGameInfo`) → `offlineGameList`, repeated message. `OfflineGameInfo` [line 606] (`OfflineGameInfoSchema`): `task_id` (1, string) → `taskId`; `toast_text` (2, string) → `toastText`; `offline_type` (4, `webcast.im.PartnershipGameOfflineMessage_OfflineGameInfo_OfflineType`) → `offlineType`, enum; `game_id` (6, string) → `gameId`. Not read: `task_list_len` (3), `toast_title` (5), `task_type` (7). `PartnershipGameOfflineMessage_OfflineGameInfo_OfflineType` [proto: webcast/im.proto, line 289]: `TASK_OFFLINE` 0, `EVENT_OFFLINE` 1, `DROPS_OFFLINE` 2; exported as `OfflineType`.
- `WebcastPartnershipPunishMessage` [line 1694] (`PartnershipPunishMessageSchema`): `punish_info` (2, `PunishEventInfo`) → `punishInfo`, message.
- `WebcastLiveGameIntroMessage` [line 1581] (`LiveGameIntroMessageSchema`): `content` (2, `Text`) → `content`, message; `has_rank_info` (3, bool) → `hasRankInfo`, bool.

## Routing

Rules from 2.4.0 [TLC: src/lib/client/index.ts, `processDecodedData`], one table per group (`src/routes/<group>.ts`). A message is decoded only when one of its route's events has a listener; control messages are always decoded. When a message type leads to a base event and a derived one (`social` and `follow`, `barrage` and `superFan`, `controlMessage` and `streamEnd`), the base event is emitted first, then the derived one; a nested message (the comment inside a pin) is not emitted again as its own event. Routing never branches on enum values only traffic can confirm: text keys and business types only. The base events `social`, `barrage` and `controlMessage` are declared but not emitted yet (pending, like the new message types).

`raw` comes first, for every message that survives the duplicate check, history included. Anything without a route reaches only `raw`.

### Chat, reactions and moderation

| Message                | Events              | Rule                                                                                                                                     |
| ---------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `WebcastChatMessage`   | `chat`              | always                                                                                                                                   |
| `WebcastLikeMessage`   | `like`              | always                                                                                                                                   |
| `WebcastSocialMessage` | `follow` or `share` | `common.displayText.key` contains `follow` → `follow`; else contains `share` → `share`; else nothing (`social`, before them, is pending) |

### Gifts, money and membership

| Message                  | Events                       | Rule                                                                                                                                                                                                                                                          |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WebcastGiftMessage`     | `gift`                       | always                                                                                                                                                                                                                                                        |
| `WebcastMemberMessage`   | `member`                     | always, whatever `actionId`                                                                                                                                                                                                                                   |
| `WebcastEnvelopeMessage` | `superFanBox`, `envelope`    | `superFanBox` first when the lowercased `common.displayText.key` contains `ttlive_superfanbox` or `envelopeInfo.businessType` is 19; then `envelope`, always                                                                                                  |
| `WebcastBarrageMessage`  | `superFanJoin` or `superFan` | over the lowercased, non-empty `content.key` and `commonBarrageContent.key`: one contains `ttlive_superfan_commentnotif_superfanjoined` → `superFanJoin`; else one contains `ttlive_superfan` → `superFan`; else nothing (`barrage`, before them, is pending) |

### Link-mic and battles

| Message                            | Events                      | Rule                                                                       |
| ---------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `WebcastLinkMicBattle`             | `linkMicBattle`             | always, whatever `action`                                                  |
| `WebcastLinkMicArmies`             | `linkMicArmies`             | always                                                                     |
| `WebcastLinkMicBattlePunishFinish` | `linkMicBattlePunishFinish` | always                                                                     |
| `WebcastLinkmicBattleTaskMessage`  | `linkMicBattleTask`         | always                                                                     |
| `WebcastLinkMicFanTicketMethod`    | `linkMicFanTicketMethod`    | always                                                                     |
| `WebcastLinkMicMethod`             | `linkMicMethod`             | always, whatever `messageType`                                             |
| `WebcastLinkMessage`               | `linkMessage`               | always, whatever `messageType`: the content that is set says what happened |
| `WebcastLinkLayerMessage`          | `linkLayer`                 | always, whatever `messageType`                                             |
| `WebcastLinkStateMessage`          | `linkState`                 | always, whatever `stateType`                                               |
| `WebcastLinkMicBattleItemCard`     | `linkMicBattleItemCard`     | always (not routed by 2.4.0; the `method` is the message's name)           |
| `WebcastLinkMicLayoutStateMessage` | `linkMicLayoutState`        | always                                                                     |

### Room, ranks, polls, shopping and system

| Message                                | Events                        | Rule                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WebcastRoomUserSeqMessage`            | `roomUser`                    | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastControlMessage`                | `controlMessage`, `streamEnd` | `controlMessage` first, for every action (pauses and resumes included). The message is decoded without a listener (the only `always` route: the connection must see the LIVE end), so the route emits `controlMessage` only when someone listens. Then `action` 3 → `streamEnd` `{ action: "ended" }`, 4 → `{ action: "suspended" }` and disconnect (reason `streamEnd`) without reconnecting |
| `WebcastPerceptionMessage`             | `perception`                  | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastRankUpdateMessage`             | `rankUpdate`                  | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastRankTextMessage`               | `rankText`                    | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastGameRankNotifyMessage`         | `gameRankNotify`              | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastPollMessage`                   | `pollMessage`                 | always, whatever `messageType`: the content that is set says what happened                                                                                                                                                                                                                                                                                                                    |
| `WebcastOecLiveShoppingMessage`        | `oecLiveShopping`             | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastCapsuleMessage`                | `capsule`                     | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastMarqueeAnnouncementMessage`    | `marqueeAnnouncement`         | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastSpeakerMessage`                | `speaker`                     | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastInRoomBannerMessage`           | `inRoomBanner`                | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastAccessControlMessage`          | `accessControl`               | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastAccessRecallMessage`           | `accessRecall`                | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastPartnershipDropsUpdateMessage` | `partnershipDropsUpdate`      | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastPartnershipGameOfflineMessage` | `partnershipGameOffline`      | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastPartnershipPunishMessage`      | `partnershipPunish`           | always                                                                                                                                                                                                                                                                                                                                                                                        |
| `WebcastLiveGameIntroMessage`          | `liveGameIntro`               | always                                                                                                                                                                                                                                                                                                                                                                                        |

## Reconnects

How the connection (`src/connection.ts`) gets back into the room after a drop. 2.4.0 had no reconnect of its own; this is the library's design.

- **Drops.** Once connected, the connection reconnects when the socket closes (`wsClose`), errors (`wsError`) or goes quiet for `idleTimeoutMs` (`idle`): `disconnected` with that reason and `willReconnect: true`, then one `reconnecting` per attempt. With `reconnect: false` or `maxAttempts: 0`, a drop stops the connection with that reason instead.
- **Waits.** With `d = min(maxDelayMs, baseDelayMs * factor ** (n - 1))`, attempt `n` (from 1) waits a random time from `d / 2` up to `d` ("equal jitter"), at least `minDelayMs` (default 1 000 ms), and at least the `retryAfterMs` of a `RateLimitError` from the attempt before. With the defaults, the first five attempts wait at least 1, 1, 2, 4 and 8 s. Every attempt signs again, and Euler Stream allows 5 signs a minute without an API key: full jitter (anywhere from 0) let the first smoke run's attempts 2 to 4 come within 8 s, and the fifth hit a 429 (`rate_limit_account_minute`, 20 s to wait). The count starts over after each successful reconnect.
- **Attempts.** An attempt runs steps 3 to 5 of the [Overview](#overview): the live check (when `reconnect.checkLiveBeforeRetry` is on), a fresh signed connect (cursor `""`), the socket, then the gap (below). Each failed attempt is reported through `error`, and its reason (below) is the next `reconnecting` event's. A `RoomNotFoundError`, or a `SignError` with a 4xx status other than 429, makes the next attempt look the room id up again first (step 2), once per drop. The signer's `x-room-id` replaces the room id only when it is numeric; otherwise a warning is logged.
- **Stops.** Otherwise, and once the room id was looked up again, a failure that isn't `retryable` stops the connection: `disconnected` with the failure as `error`, and the reason `signError` when the attempt failed before the socket (the signer, the room lookup or the signed batch) or `wsError` / `wsClose` when the socket failed. A live check that finds the room offline emits `streamEnd` (`ended`) and stops with reason `streamEnd`, without an `error`. Running out of attempts stops it with reason `giveUp` and a `ReconnectGiveUpError` (`cause`: the last failure), also emitted as `error`. `disconnect()` and the `signal` option stop it at any point (`user`, `aborted`), canceling the wait or the attempt in progress.
- **The gap.** A batch signed with a cursor (a resumed batch) holds the messages sent since that cursor, as normal messages, not history (105 and 88 in the smoke runs, none history), but no `pushServer`, and TikTok refuses a socket opened from it: the second and third smoke runs got an HTTP `200` instead of a WebSocket every time, even with the first connect's push server and route params (which include `X-Bogus` and `X-Gnarly`, signatures of the URL they were made for). So every socket comes from a fresh signed connect, and with `reconnect.resume` (the default) a reconnect signs a second time, with the run's last cursor, only for the gap: once the fresh socket is in the room, while its batches wait. Then comes `connected`, and the gap's messages go out first, then the fresh batch's (the room's recent backlog), then the socket's; duplicates are dropped. A reconnect thus costs two signs (Euler Stream allows 5 a minute without an API key); a socket that fails costs only its fresh one. If the gap's sign fails, the reconnect goes on without it (a `warn` log). With `resume: false`, a reconnect signs once and delivers only the recent backlog: the rest of the gap is lost.
- **Logs.** Each signed batch is described at `debug` ("Signed the connection": whether it was signed with a cursor, how many messages and history messages it holds, and whether it has a cursor, an `internalExt`, a push server and route params), and each socket's URL too ("Opening the WebSocket": the push server's host and path, the names of the route params it carries, never their values, which hold signatures, and whether it has an `internalExt`). Neither holds a cookie or the session.
- **New starts.** A `connect()` after a stop starts over: the cursor is `""` (no gap), and the room id is looked up again unless the `roomId` option is set. Only the duplicate check's memory carries over.

## Gift list

`fetchGifts({ region?, language? })` tries, in order, until one returns gifts; each step runs within `requestTimeoutMs`, and a step that fails or returns no gift fails over to the next. Without a room id (no `connect()` yet and no `roomId` option), only step 3 runs. Every source is parsed the same way, then deduplicated by id (first wins). All steps failing: `ConnectorError` with code `GIFTS_UNAVAILABLE`, the steps' errors as `cause`.

1. **Room** (`source: "room"`): `GET https://webcast.tiktok.com/webcast/gift/list/?{client params}&room_id={roomId}` with the headers and the cookie jar, unsigned.
2. **Signer** (`source: "signer"`): `signer.fetchGifts(roomId)` ([Room gifts](#room-gifts) for Euler Stream).
3. **Region** (`source: "region"`): `GET https://webcast.tiktok.com/webcast/gift/list/?aid=1988&app_language={language}&region={region}&sys_region={region}` with only `Accept: application/json` and the User-Agent (the `headers` option's, when it sets one), and no cookies: the request Tokio makes today, which works without a room. Neither the default client params nor `clientParams` apply. Defaults `US` and `en-US` (Tokio's fallbacks when its geo-IP lookup fails).

Parsing: the gift array is the first non-empty one of `data.gifts`, `data.giftList` and `data.pages[0].gifts` (Tokio's rule took the first present one, even empty). Entries without a usable id (a positive number or a decimal string) are skipped; a missing `name` gives `""` and a missing `diamond_count` `0`. Each gift maps `id` → `id` (as a string), `name` → `name`, `diamond_count` → `diamondCount`, `image.url_list` / `image.uri` → `image.urlList` / `image.uri` (absent without `image`).

**What 2.4.0 did.** Its room gift list made the same request as step 1 (client params plus `room_id`, read `data.gifts`), but **signed** it: the request ran with `signRequest: true`, which sent the full URL (minus any `X-Bogus`, `X-Gnarly` and `msToken`) to the signer's sign-URL route with the method, the User-Agent and, when the jar had both, `sessionid` and `tt-target-idc`, then fetched the signed URL it got back (and its User-Agent, if any) [TLC: src/lib/web/routes/base/fetch-room-gifts.ts, "Request must now be signed from TikTok to work"; src/lib/web/lib/http-client.ts, `request`; src/lib/web/routes/euler/fetch-webcast-signature-euler.ts]. That route is `POST /tiktok/signing/encrypt/sign_url` (`client` query, `{ url, method, userAgent, sessionId, ttTargetIdc, … }` body), which the docs say is "NOT available to customers in any public package" [Euler: TikTok Signing]. So 2.4.0's room list only worked for accounts Euler Stream approved; the library tries the request unsigned and falls back. TikTok answers it unsigned: the first smoke run got 718 gifts from it ([Open items](#open-items), 1).

## Errors

| Error                  | Code                | Raised by                                                                                                         |
| ---------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `InvalidUsernameError` | `INVALID_USERNAME`  | the constructor (`normalizeUsername`)                                                                             |
| `ConnectorError`       | `INVALID_STATE`     | `connect()` while not `idle` or `disconnected`                                                                    |
| `RoomNotFoundError`    | `ROOM_NOT_FOUND`    | room id resolution, when every step fails                                                                         |
| `OfflineError`         | `OFFLINE`           | the live check on connect                                                                                         |
| `ConnectorError`       | `NETWORK`           | an HTTP request to TikTok without a response                                                                      |
| `HttpError`            | `HTTP`              | an unexpected status or body from TikTok                                                                          |
| `SignError`            | `SIGN_FAILED`       | the signer: 401/403 (not retryable), 5xx and others, no answer, anything else a signer throws                     |
| `RateLimitError`       | `RATE_LIMITED`      | the signer: 429                                                                                                   |
| `PremiumFeatureError`  | `PREMIUM_REQUIRED`  | the signer: 402                                                                                                   |
| `TimeoutError`         | `TIMEOUT`           | phase `request`, `sign`, `connect` or `idle`                                                                      |
| `WebSocketError`       | `WEBSOCKET`         | the socket failing to open (`status`: the server's HTTP answer to the upgrade), erroring, or closing              |
| `ProtocolError`        | `PROTOCOL`          | malformed protobuf, a payload that can't be gunzipped, a signed connect without cookies, `pushServer` or `cursor` |
| `AbortError`           | `ABORTED`           | the `signal` option, or `disconnect()` during a call                                                              |
| `ReconnectGiveUpError` | `RECONNECT_GAVE_UP` | the reconnect attempts running out                                                                                |
| `ConnectorError`       | `GIFTS_UNAVAILABLE` | `fetchGifts()`, when every source fails                                                                           |
| `ConnectorError`       | `INTERNAL`          | an unexpected exception inside the library                                                                        |

## What replaces 2.4.0's globals and environment variables

2.4.0 read these at import or call time [TLC: `grep -rn process.env src`; src/lib/web/config.ts, `RouteConfig`]. The library reads no environment variable and has no global state: everything is per connection.

| 2.4.0                                                                                       | Default                       | Here                                                                       |
| ------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| `SIGN_API_URL`, `SignConfig.basePath`                                                       | `https://api.eulerstream.com` | `new EulerSigner({ host })`                                                |
| `SIGN_API_KEY`, `SignConfig.apiKey`, the `signApiKey` option (written to the global)        | none                          | `new EulerSigner({ apiKey })`                                              |
| `SignConfig.cachedInstance`, `eulerApiInstance` (one shared Euler client)                   |                               | the `signer` option                                                        |
| `RANDOMIZE_TIKTOK_DEVICE`, `_LOCATION`, `_SCREEN`; `clientPresets`                          | off                           | fixed defaults; `clientParams` and `headers` override them                 |
| `TIKTOK_CLIENT_TIMEOUT`                                                                     | 10 000 ms                     | `requestTimeoutMs`                                                         |
| `WS_CONNECT_TIMEOUT_MS`                                                                     | 20 000 ms                     | `connectTimeoutMs`                                                         |
| `WS_DISCONNECT_TIMEOUT_MS`                                                                  | 2 000 ms                      | fixed 2 s close grace in `disconnect()`                                    |
| `DEFAULT_WS_PING_INTERVAL`                                                                  | 10 000 ms                     | `heartbeatIntervalMs`                                                      |
| `WHITELIST_AUTHENTICATED_SESSION_ID_HOST`, `authenticateWs`, `useMobile`                    |                               | not supported: the session never goes to the signer                        |
| `SIGN_SERVER_MESSAGE_DISABLED`                                                              | shown                         | the signer's `message` is part of the error message                        |
| `DISABLE_ACK_LOG_WARNING`                                                                   | warn                          | logged at `debug`                                                          |
| `DEBUG_DESERIALIZE_XD`                                                                      | off                           | the `raw` event and the `logger`                                           |
| `WebcastDeserializeConfig` (skip or include message types, base64 on decode errors)         |                               | lazy decoding by listener                                                  |
| `RouteConfig` (swappable routes)                                                            |                               | the `Signer` interface, `clientParams`, `headers`                          |
| `RoomIdRouteConfig`, `IsLiveRouteConfig` (skip steps)                                       |                               | the `roomId` option skips the lookup                                       |
| `RoomInfoFromHtmlRouteConfig.extractionPattern`                                             | SIGI_STATE regex              | fixed (a release changes it)                                               |
| `fetchRoomInfoOnConnect`                                                                    | `true`                        | always checked on connect; `reconnect.checkLiveBeforeRetry` for reconnects |
| `processInitialData`                                                                        | `true`                        | `processInitialData`, default `false`                                      |
| `enableExtendedGiftInfo`                                                                    | `false`                       | `fetchGifts()`                                                             |
| `webClientOptions` (got), `wsClientOptions` (ws), `webConfigOverrides`, `wsConfigOverrides` |                               | `fetch`, `clientParams`, `headers`                                         |

## Open items

What the references and docs can't settle. `yarn capture` on the user's own LIVE and `yarn smoke` (with `-v` for the `debug` logs) answer most of them. The numbers stay put (the code cites them); settled items say so.

**The first smoke run** (2026-10-20, `yarn smoke tv_asahi_news --seconds 30 --drop-after 10 --gifts -v`, Euler Stream without an API key) connected in 4.8 s: api-live gave the room id, `room/info` said status 2 (LIVE), Euler Stream signed it, and the WebSocket handshake (both `version_code`s, the route params, our headers and cookies, `ws`'s permessage-deflate offer), the room entry and the gzipped batches all worked; chat, member and viewer count messages decoded. It settled items 1, 3 and 14, half of 4 and 13, most likely 17, and found two bugs: a reconnect's signed connect has no push server (see [Reconnects](#reconnects), "Resumed signed connects"), and full jitter let the reconnect attempts spend Euler Stream's anonymous limit (see [Reconnects](#reconnects), "Waits"). No reconnect succeeded, so item 5 waited for the next run.

**The second smoke run** (2026-10-20, `yarn smoke tv_asahi_news --seconds 40 --drop-after 15 --gifts -v`, Euler Stream without an API key) connected in 3.9 s. The room entry was confirmed by `im_enter_room_resp` (item 16) and the server answered heartbeats; no ping came in the 15 s before the drop (item 11). The first signed batch held 15 messages (6 of them history), a cursor, an `internalExt`, a push server and 4 route params. The resumed one held 105 messages, none history (item 5), a cursor and an `internalExt`, no push server and 2 route params; the backoff waited 1.0, 1.3, 2.1 and 4.9 s as designed. Every resumed socket then got an HTTP `200` instead of a WebSocket, so the reconnect failed. The library had sent the kept push server with only the resumed batch's 2 route params. Resumes then merged the route params, with a fresh sign when the push server still refused (item 18).

**The third smoke run** (2026-10-20, `yarn smoke tv_asahi_news --seconds 45 --drop-after 15 --gifts -v`, Euler Stream without an API key) passed. It connected in 3.2 s (`im_enter_room_resp`), got 139 LIVE events and 718 gifts from the `room` list, and no error. After the drop, the merged resume was refused with `200` (an empty body, no content type), the fresh sign connected, and `connected { reconnected: true }` came 5.6 s after the drop. No ping came in 45 s (item 11). Since TikTok refuses every resumed socket (item 18), a reconnect now opens no socket from a resumed batch: it signs fresh for its socket and with the cursor for the gap ([Reconnects](#reconnects), "The gap").

1. **Unsigned room gift list.** _Settled: TikTok answers it._ 2.4.0 said TikTok needs the `webcast/gift/list/?room_id=` request signed; the first smoke run got 718 gifts from it unsigned (`source: "room"`, 0.8 s).
2. **Euler Stream's room gifts.** The documented answer holds gift ids and overrides, not gifts, and needs `WEBCAST_PREMIUM`. With such a key, check what `response` really holds. If it is ids only, `EulerSigner.fetchGifts` stays `null`, or could join `page_gifts` with Euler Stream's gift catalog (which doesn't count toward rate limits) or the region list to give a room-ordered list.
3. **`x-set-tt-cookie`.** _Settled: one cookie, `ttwid`._ Its format isn't documented, and 2.4.0 kept only its first pair; every signed connect of the first smoke run held exactly one cookie, `ttwid`. The parser still reads several, in case that changes.
4. **Received payload types.** _Partly settled._ Besides `msg` (and `im_enter_room_resp`, which the session handles), the server answered the first smoke run's heartbeat with an `hb` frame of its own (the run's socket lived for one heartbeat); no other type came. Whether any other type ever comes, or carries a batch (2.4.0 decoded every `pb` payload as one), stays open: the session logs every other type at `debug`. A capture only holds the messages inside `msg` frames.
5. **History after a reconnect.** _Settled: the gap comes as normal messages._ A reconnect's signed batch, asked for with the last cursor, holds the messages of the gap, not marked `is_history`: 105 messages, none history, in the second smoke run. They are dispatched like any (duplicates dropped).
6. **`common.createTime` unit.** Assumed milliseconds since the epoch, as `now` is.
7. **Super fan keys.** `ttlive_superfanbox`, `ttlive_superfan_commentnotif_superfanjoined`, `ttlive_superfan` and business type 19 come from 2.4.0 and the 0.2.3 protos; confirm with a capture of a LIVE with super fans.
8. **Euler Stream `client`.** The docs say it only feeds metrics (default `ttlive-other`); 2.4.0 sent `ttlive-node`, and `EulerSigner` does too by default. Decide whether to identify as this library instead.
9. **402 from the connect route.** Kept from 2.4.0; the docs list only 200, 429, 500 and 503.
10. **Euler Stream host.** `tiktok.eulerstream.com` (the docs' first server, `EulerSigner`'s default) signs without a key, as the first smoke run showed; whether `api.eulerstream.com` (2.4.0's default, "Community & Pro") serves the connect route the same way for free use is unchecked.
11. **Pings.** _Settled: TikTok doesn't ping._ 2.4.0 turned off `ws`'s automatic pong without saying why; the library answers pings like a browser anyway, and logs the first at `debug`. No ping came in any smoke run, 45 s in the third: the heartbeat, which the server answers, is what shows the socket is alive.
12. **`version_code` twice.** Kept as 2.4.0 sends it; nothing says which one TikTok reads. The handshake works with both.
13. **The LIVE page markup.** _Partly settled._ In the first smoke run the LIVE page came back (200, 1.1 s) with neither `SIGI_STATE` nor `__UNIVERSAL_DATA_FOR_REHYDRATION__`, while api-live answered the room id in 0.5 s, so api-live is now the first step and the page the fallback. Whether the page carries its state for other users or clients (with a session, say), and where `__UNIVERSAL_DATA_FOR_REHYDRATION__` keeps the room id when it does, stays open.
14. **Anonymous signing.** _Settled: it works._ The connect route's docs page groups `x-oauth-token` and `x-cookie-header` under "One authentication header required", but every signed connect of the first smoke run answered 200 without either. Without an API key, Euler Stream allows 5 connects a minute (`rate_limit_account_minute`): the sixth within a minute got a 429 asking to wait 20 s.
15. **`ratelimit-reset`.** Read as seconds from now (the IETF draft); a value of 10⁹ or more is read as a Unix time in seconds, 10¹² or more in milliseconds. The first smoke run's 429 asked for 20 s, a plausible wait, but which header said so isn't logged yet.
16. **Entering the room.** _Settled: TikTok confirms it._ The second smoke run logged `Entered room …: the server's im_enter_room_resp`, so entering doesn't wait for a batch, and a quiet room doesn't run into `connectTimeoutMs`.
17. **Quiet rooms.** _Most likely settled (the server answered heartbeats in the second smoke run too)._ The server answered the first smoke run's heartbeat with an `hb` frame. If it answers every heartbeat (10 s apart by default), a healthy socket gets a frame well within `idleTimeoutMs` (30 s) even in a LIVE where nothing happens, so the idle check never fires on it. A longer run confirms it: the session logs the first reply at `debug`, and an idle drop shows as `disconnected` with reason `idle`.
18. **Resuming.** _Settled: TikTok refuses it._ A socket opened from a resumed batch, on the old push server, gets an HTTP `200` instead of a WebSocket, even with the first connect's route params merged in (third smoke run, an empty body). Reconnects sign fresh for their socket, and sign with the cursor only for the gap ([Reconnects](#reconnects), "The gap").
19. **`Text.pieces`.** A display text's `pieces` (4, repeated `TextPiece`: typed parts such as a user, a gift or a pattern reference) aren't read: `key` and `default_pattern` are enough for routing and for showing the text. Read them if an app needs the parts (the user a text names, say). Items 20–59 are reserved for the groups: chat 20–29, gift 30–39, link 40–49, room 50–59.

**Link-mic and battles** (items 40–49):

40. **Link message types.** `WebcastLinkMessage.message_type` (2) and `scene` (4), and `WebcastLinkMicMethod.message_type` (2) and `answer` (14), are int32s with no enum in the 0.2.3 protos. The content that is set (`invite_content`, `enter_content`, `leave_content`…) says what a link message is about; `WebcastLinkMicMethod` has no such contents, so its `message_type` is the only clue. A capture of a LIVE with guests tells which values go with invitations, replies, joins and leaves, and whether the int32 `scene`s (here and in `WebcastLinkMicLayoutStateMessage`) hold the values of `linkmic.common.Scene` (2 co-host, 4 multi-guest) that `WebcastLinkLayerMessage` and `WebcastLinkStateMessage` use. `LinkerReplyContent.reply_status`, `LinkListUser.link_type` and `role_type`, `LinkListChangeContent.type`, and the int64 leave and finish reasons have no enum either.
41. **Which link messages a viewer gets.** 2.4.0 routes all of them, but the protos hold two generations: `WebcastLinkMicMethod` (the older one, with RTC credentials) and `WebcastLinkMessage`, next to the link layer's `WebcastLinkLayerMessage` and `WebcastLinkStateMessage`. Which ones an audience connection still receives, and whether invitations and applications reach the audience or only the hosts involved, needs captures of a co-host LIVE and a multi-guest one.
42. **Battles in traffic.** Which `BattleAction` values a viewer sees (`OPEN` 4 and `FINISH` 5 at least); whether `battle_result` comes on `FINISH` only; whether the keys of `battle_result`, `armies` and `anchors_info` are the hosts' user ids (assumed: `BattleResult.user_id` and `BattleBaseUserInfo.user_id` say so); whether `BattleSetting.duration` is in seconds (assumed) and `start_time_ms`/`end_time_ms` in milliseconds; whether `score` (battle points) and `diamond_score` (coins) differ in a normal battle; and how often `WebcastLinkMicArmies` comes (on every gift, `SCORE_UPDATE` 1, or throttled). A capture of a LIVE that battles settles them.
43. **Enums whose 0 means something.** `BattleResult_Result` (`WIN` 0), `MuteStatus` (`MUTE` 0), `GuestMicCameraManageOp` (`OPEN_MIC` 0), `BattleTaskMessageType` (`START` 0), `BattleTaskSettle_Result` (`SUCCEED` 0) and `LinkMicBattlePunishFinish_Reason` (`TIME_UP` 0) give 0 a meaning. Proto3 never writes a field at 0, so these values always arrive as a missing field, and a field TikTok really left unset reads the same: a battle result without `result` is a win, a mute without `mute_status` a mute. A capture of a battle that ends (with a loss or a draw) and of a guest being muted and unmuted checks that the payloads read right.
44. **Names in the link layer.** `WebcastLinkLayerMessage` and `WebcastLinkStateMessage` carry `Player`s (a room id and a user id), no names. The names are in `WebcastLinkLayerMessage.business_content` (200, `chatroom.model.multiguestv3.BusinessContent`), several levels deep and skipped. If apps need them, a later version reads the part that holds them; a capture shows how often it is set and how big it is.
45. **`WebcastLinkMicBattleItemCard`.** The 0.2.3 protos have the message, but 2.4.0 has no route for it [TLC: src/types/events.ts], so its `method` (the message's name, as for every other message) and when it comes are unconfirmed. `award_reason` (16) has no enum, and the card contents (4–15) aren't read: `msg_type` says which card.

**Room, ranks, polls, shopping and system** (items 50–59):

50. **Control messages besides the end.** `ControlAction` has `PAUSED` 1 and `UNPAUSED` 2, and `WebcastControlMessage` carries `tips`, `extra` and `punish_info`; the only control message seen so far is the end of a LIVE (action 3, in the smoke runs' fixtures). Whether an audience connection gets 1 and 2 when the host pauses, and what `tips`, `extra` and `punish_info` hold on a 3 or a 4 (the ban notice is the host's, most likely), needs a capture of a LIVE that pauses and one that ends. `controlMessage` is emitted for every action regardless.
51. **`WebcastPollMessage.message_type`.** An int64 in the 0.2.3 protos, with no enum naming its values. The content that is set (`start_content`, `update_votes_content`, `end_content`) says what happened; a capture of a LIVE with a poll tells which `message_type` goes with each, and whether `poll_kind` 1 (gift polls) comes with `start_content.option_list` votes already set.
52. **Rank updates in traffic.** `WebcastRankUpdateMessage` was declared from the protos only: which `op_type` values come (the hourly rank's `ADD`/`REMOVE`/`RELOAD`), which `rank_type` values a typical LIVE sees, whether `class_info` comes outside class ranks (`rank_type` 16), and whether `current_score` is coins. `WebcastRankTextMessage`'s `scene` values and `cur_user_id` (the viewer a top-N notice is about, or the host) are open too.
53. **Shopping messages.** `WebcastOecLiveShoppingMessage.action_type` is an int32 with no enum; which values mean a pin, an unpin and a product count change, and whether `pop_product.product_id` (an int64) and `product_snap_shot.product_id` (a string) name the same product, need a capture of a LIVE that sells.
54. **Host-side messages.** `WebcastPerceptionMessage` (violation notices), `WebcastAccessControlMessage` (captchas), `WebcastAccessRecallMessage`, `WebcastPartnershipPunishMessage` and the partnership messages look addressed to the host's own client. Whether an audience connection ever receives them is unknown; the events exist so an app that connects as the host (with a session) can see them.
55. **`WebcastSpeakerMessage` and `WebcastInRoomBannerMessage`.** The 0.2.3 protos give them only `common`. If traffic holds more (a payload longer than its `common`, which `raw` shows), a later version of the reference may name the fields; until then they are skipped.
56. **`GameRankNotifyMessage_MsgType` 255.** The proto's unknown value is 255 (`MSG_TYPE_UN_KNOW`), not 0 (`MSG_TYPE_RANK_IN_OUT`): a message that leaves `msg_type` out reads as 0, "entered or left the rank". Whether TikTok ever sends 255, or leaves the field out, is unchecked.
