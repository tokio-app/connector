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

The first step that answers wins; each runs within `requestTimeoutMs` [TLC: src/lib/web/routes/composite/fetch-room-id.ts]. When none answers, `RoomNotFoundError` with the steps' errors as `cause` (an array, in step order); it is retryable when a step failed for a reason that can pass (a retryable `ConnectorError`: network, timeout, 429 or 5xx). A room id is a decimal string other than `0`, or a positive safe integer.

1. **The LIVE page.** `GET https://www.tiktok.com/@{username}/live?{client params}` (2.4.0 sent the client params on this page request too) with the headers. Extract the first match of `/<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/` (2.4.0's pattern; we add the `s` flag so a line break inside can't defeat it), `JSON.parse` it, and read `LiveRoom.liveRoomUserInfo.user.roomId` [TLC: src/lib/web/routes/base/fetch-room-info-html.ts]. When that is missing, the state is searched breadth first (to depth 16, at most 50 000 nodes) for a `liveRoomUserInfo.user.roomId`, or for an object whose `uniqueId` is the username (any letter case) and that has a `roomId`. When `SIGI_STATE` is missing, isn't JSON or holds no room id, the same is tried with the page's `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">` (attributes in any order), whose layout on LIVE pages isn't known yet (see [Open items](#open-items)). Nothing found fails the step. The `SIGI_STATE` object also holds `LiveRoom.liveRoomUserInfo.liveRoom.status` (2 = LIVE, 4 = ended) [TLC: test/lib/fixtures.ts].
2. **The API.** `GET https://www.tiktok.com/api-live/user/room/?{client params}&uniqueId={username}&sourceType=54`. JSON: a `statusCode` other than `0` fails the step (`message` says why); a missing one passes, as in 2.4.0. Then `data.user.roomId` [TLC: src/lib/web/routes/base/fetch-room-info-api-live.ts]. `data.liveRoom.status` has the same meaning as above.
3. **The signer.** `signer.resolveRoomId(username)`; `null` fails the step. Euler Stream's route is below.

The signed connect may name a different room in `x-room-id`; when it is numeric, it replaces the resolved id (otherwise a warning is logged and the resolved id stays).

## Is the room LIVE?

Before signing, and before each reconnect attempt when `reconnect.checkLiveBeforeRetry` is on:

1. `GET https://webcast.tiktok.com/webcast/room/info/?{client params}&room_id={roomId}`, unsigned [TLC: src/lib/web/routes/base/fetch-room-info.ts]. JSON: `data.status === 4` means the LIVE ended; any other status counts as LIVE (2.4.0's rule: only 4 is offline) [TLC: src/lib/client/index.ts, `_connect`; src/lib/web/routes/composite/fetch-is-live.ts].
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

The socket must open and enter the room (an `im_enter_room_resp` frame, or the first `msg` frame, whichever comes first) within `connectTimeoutMs` (default 20 000 ms, 2.4.0's `WS_CONNECT_TIMEOUT_MS`), else `TimeoutError` with phase `connect`. 2.4.0 only waited for the socket to open. To close, send a close frame (code 1000) and terminate the socket if it hasn't closed 2 s later (2.4.0's `WS_DISCONNECT_TIMEOUT_MS`) [TLC: src/lib/client/index.ts, `disconnect`].

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

`im_enter_room_resp` confirms the entry; the session logs at `debug` whether that or the first batch did (`Entered room …`). The server answers each heartbeat with an `hb` frame of its own (seen in the first smoke run); like any frame it resets the idle timer, and the first one is logged at `debug` ("The server answers heartbeats"). Other payload types, and `msg` frames with another `payloadEncoding`, are logged (debug, with their type, encoding and size) and ignored. 2.4.0 decoded every `pb` payload, whatever its type, as a batch; see [Open items](#open-items).

### Ack

When a batch has `needAck` set, the client answers right away with `logId` = the frame's `logId`, `payloadEncoding` `pb`, `payloadType` `ack`, and `payload` = the batch's `internalExt` as UTF-8 bytes [TLC: ws-client.ts, `sendAck`]. No ack when the frame's `logId` is 0 or the batch's `internalExt` is empty (2.4.0 logged a warning for the latter). For log id `7400000000000000001` and `internalExt` `abc`:

```text
10 81 80 90 cf b0 99 85 d9 66 32 02 70 62 3a 03 61 63 6b 42 03 61 62 63
```

## Batches

A `ProtoMessageFetchResult` is both the signed connect's body and every `msg` frame's payload.

- **Cursor.** Every batch's non-empty `cursor` replaces the one kept for reconnects; a reconnect sends it to the signer so TikTok resumes from there. A new `connect()` starts over from `""`, and so does a reconnect to another room (the room id looked up again changed): a cursor is a place in one room's stream. 2.4.0 only read the cursor of the signed connect and dropped it on disconnect, so it never resumed [TLC: src/lib/client/index.ts, `_connect`, `setDisconnected`].
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

| No. | Proto field    | Type                   | Property      | Kind             |
| --- | -------------- | ---------------------- | ------------- | ---------------- |
| 1   | `id`           | int64                  | `userId`      | id               |
| 3   | `nickname`     | string                 | `nickname`    | string           |
| 9   | `avatar_thumb` | `ImageModel`           | `avatarThumb` | message          |
| 38  | `display_id`   | string                 | `displayId`   | string           |
| 64  | `badge_list`   | repeated `BadgeStruct` | `badgeList`   | repeated message |

`display_id` is the username (unique id); older protos called field 38 `uniqueId`. Not read, among others: `avatar_medium` (10), `avatar_large` (11), `follow_info` (22), `sec_uid` (46), `id_str` (1028).

`webcast.model.base.user.BadgeStruct` [proto: webcast/model/base/user.proto] (`BadgeSchema`)

| No. | Proto field           | Type                 | Property            | Kind    |
| --- | --------------------- | -------------------- | ------------------- | ------- |
| 12  | `privilege_log_extra` | `PrivilegeLogExtra`  | `privilegeLogExtra` | message |
| 23  | `combine`             | `CombineBadgeStruct` | `combine`           | message |

Not read: `display_type` (1), `priority_type` (2), `scene_type` (3, `BadgeSceneType`: 1 admin, 4 subscriber, 8 user grade, 10 fans…), `image` (20), `text` (21), `str` (22).

`webcast.model.base.user.PrivilegeLogExtra` [proto: webcast/model/base/user.proto] (`PrivilegeLogExtraSchema`): `level` (5, string) → `level`, string. Not read: 1–4, 6, 7.

`webcast.model.base.user.CombineBadgeStruct` [proto: webcast/model/base/user.proto] (`CombineBadgeSchema`): `icon` (2, `ImageModel`) → `icon`, message. Not read: the rest.

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

All in package `webcast.model.message` [proto: webcast/model/message/messages.proto] unless noted. Field 1 is always `common` (`CommonMessageData`, → `common`, message). The tables are in `src/codec/messages/`, one file per message.

`WebcastChatMessage` (`chat.ts`)

| No. | Proto field        | Type                      | Property          | Kind             |
| --- | ------------------ | ------------------------- | ----------------- | ---------------- |
| 2   | `user`             | `User`                    | `user`            | message          |
| 3   | `content`          | string                    | `content`         | string           |
| 13  | `emotes`           | repeated `EmoteWithIndex` | `emotes`          | repeated message |
| 14  | `content_language` | string                    | `contentLanguage` | string           |
| 18  | `user_identity`    | `UserIdentity`            | `userIdentity`    | message          |

`webcast.model.base.emoji.EmoteWithIndex` [proto: webcast/model/base/emoji.proto]: `index` (1, int32) → `index`, int32; `emote` (2, `EmoteModel`) → `emote`, message.
`webcast.model.base.emoji.EmoteModel` [proto: webcast/model/base/emoji.proto]: `emote_id` (1, string) → `emoteId`, string; `image` (2, `ImageModel`) → `image`, message.

`WebcastGiftMessage` (`gift.ts`)

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

`webcast.model.Gift` [proto: webcast/model/gift.proto] (`GiftDetailsSchema`)

| No. | Proto field     | Type         | Property       | Kind    |
| --- | --------------- | ------------ | -------------- | ------- |
| 1   | `image`         | `ImageModel` | `image`        | message |
| 5   | `id`            | int64        | `id`           | id      |
| 11  | `type`          | int32        | `type`         | int32   |
| 12  | `diamond_count` | int32        | `diamondCount` | int32   |
| 16  | `name`          | string       | `name`         | string  |

`type` 1 marks a gift sent in streaks: `isStreakable()`. During a streak each update arrives as its own gift message with a growing `repeat_count`, and the streak ends with one more message with `repeat_end` set, even for a single gift; a gift of another type arrives once [TLC: README.md, the gift event's notes].

`WebcastLikeMessage` (`like.ts`)

| No. | Proto field | Type   | Property | Kind    |
| --- | ----------- | ------ | -------- | ------- |
| 2   | `count`     | int32  | `count`  | int32   |
| 3   | `total`     | int64  | `total`  | count   |
| 5   | `user`      | `User` | `user`   | message |

`WebcastSocialMessage` (`social.ts`)

| No. | Proto field    | Type   | Property      | Kind    |
| --- | -------------- | ------ | ------------- | ------- |
| 2   | `user`         | `User` | `user`        | message |
| 3   | `share_type`   | int64  | `shareType`   | count   |
| 4   | `action`       | int64  | `action`      | count   |
| 5   | `share_target` | string | `shareTarget` | string  |
| 8   | `share_count`  | int32  | `shareCount`  | int32   |

Not read: `follow_count` (6), `share_display_style` (7), `follow_type` (13), `target_user_id` (14), and the rest.

`WebcastMemberMessage` (`member.ts`)

| No. | Proto field | Type                                  | Property   | Kind    |
| --- | ----------- | ------------------------------------- | ---------- | ------- |
| 2   | `user`      | `User`                                | `user`     | message |
| 10  | `action`    | `webcast.im.MemberMessageAction` enum | `actionId` | enum    |

`MemberMessageAction` [proto: webcast/synthetic_enums.proto]: `MEMBER_MESSAGE_ACTION_UNKNOWN` 0, `MEMBER_MESSAGE_ACTION_JOINED` 1, `MEMBER_MESSAGE_ACTION_SUBSCRIBED` 3; exported as `MemberAction` (`UNKNOWN`, `JOINED`, `SUBSCRIBED`). The property keeps the name older protos gave field 10, `actionId` [reference/src/TikTok-Webcast-Protobuf/src/slim/v1/webcast.proto]. Not read: `member_count` (3), `operator` (4), `enter_type` (9), `user_id` (12), and the rest.

`WebcastRoomUserSeqMessage` (`roomUser.ts`)

| No. | Proto field  | Type                   | Property    | Kind             |
| --- | ------------ | ---------------------- | ----------- | ---------------- |
| 2   | `ranks`      | repeated `Contributor` | `ranks`     | repeated message |
| 3   | `total`      | int64                  | `total`     | count            |
| 7   | `total_user` | int64                  | `totalUser` | count            |

`total` is the viewers watching now, `total_user` the viewers so far (how Tokio reads them). Not read: `pop_str` (4), `seats` (5), `popularity` (6), `anonymous` (8).
`webcast.model.message.Contributor`: `score` (1, int64) → `score`, count; `user` (2, `User`) → `user`, message; `rank` (3, int64) → `rank`, count. Not read: `delta` (4).

`WebcastControlMessage` (`control.ts`)

| No. | Proto field | Type                            | Property | Kind |
| --- | ----------- | ------------------------------- | -------- | ---- |
| 2   | `action`    | `webcast.im.ControlAction` enum | `action` | enum |

`ControlAction` [proto: webcast/synthetic_enums.proto]: `CONTROL_ACTION_FALLBACK_UNKNOWN` 0, `CONTROL_ACTION_STREAM_PAUSED` 1, `CONTROL_ACTION_STREAM_UNPAUSED` 2, **`CONTROL_ACTION_STREAM_ENDED` 3**, **`CONTROL_ACTION_STREAM_SUSPENDED` 4**; exported as `ControlAction` (`UNKNOWN`, `PAUSED`, `UNPAUSED`, `STREAM_ENDED`, `STREAM_SUSPENDED`). 2.4.0's legacy client spells out 3 as ended by the host and 4 as ended by a moderator (a ban) [TLC: src/lib/client/legacy/index.ts].

`WebcastEnvelopeMessage` [proto: webcast/model/message/redenvelope.proto, package `webcast.model.message.redenvelope`] (`envelope.ts`)

| No. | Proto field     | Type                    | Property       | Kind    |
| --- | --------------- | ----------------------- | -------------- | ------- |
| 2   | `envelope_info` | `MessageRedEnvelopInfo` | `envelopeInfo` | message |

`MessageRedEnvelopInfo` (same file): `business_type` (2, `webcast.model.data.EnvelopeBusinessType` enum) → `businessType`, enum. Not read: `envelope_id` (1), `send_user_name` (4), `diamond_count` (5), `people_count` (6), `unpack_at` (7), and the rest.
`EnvelopeBusinessType` [proto: webcast/model/data/messages.proto]: 0 unknown, 1 user diamond, 2 platform diamond, 3 platform shell, 4 portal, 5 platform merch, 6, 7 and 9–14 event and campaign types, **`SUPER_FAN_BOX` 19**. Exported as `EnvelopeBusinessType` with the values the library uses: `UNKNOWN` 0 and `SUPER_FAN_BOX` 19.

`WebcastBarrageMessage` (`barrage.ts`)

| No. | Proto field              | Type                                | Property               | Kind    |
| --- | ------------------------ | ----------------------------------- | ---------------------- | ------- |
| 5   | `content`                | `webcast.model.message.common.Text` | `content`              | message |
| 24  | `common_barrage_content` | `webcast.model.message.common.Text` | `commonBarrageContent` | message |
| 50  | `user`                   | `User`                              | `user`                 | message |

Not read: `msg_type` (3, `BarrageMessage_BarrageType`), `icon` (4), and the rest.

## Routing

Rules from 2.4.0 [TLC: src/lib/client/index.ts, `processDecodedData`]. A message is decoded only when one of its route's events has a listener; control messages are always decoded.

| Message                     | Events                       | Rule                                                                                                                                                                                                                                                                    |
| --------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WebcastChatMessage`        | `chat`                       | always                                                                                                                                                                                                                                                                  |
| `WebcastGiftMessage`        | `gift`                       | always                                                                                                                                                                                                                                                                  |
| `WebcastLikeMessage`        | `like`                       | always                                                                                                                                                                                                                                                                  |
| `WebcastSocialMessage`      | `follow` or `share`          | `common.displayText.key` contains `follow` → `follow`; else contains `share` → `share`; else nothing (2.4.0 emitted a generic `social` event, which we don't have)                                                                                                      |
| `WebcastMemberMessage`      | `member`                     | always, whatever `actionId`                                                                                                                                                                                                                                             |
| `WebcastRoomUserSeqMessage` | `roomUser`                   | always                                                                                                                                                                                                                                                                  |
| `WebcastControlMessage`     | `streamEnd`                  | `action` 3 → `streamEnd` `{ action: "ended" }`, 4 → `{ action: "suspended" }`, then disconnect (reason `streamEnd`) without reconnecting; other actions: nothing                                                                                                        |
| `WebcastEnvelopeMessage`    | `superFanBox`, `envelope`    | `superFanBox` first when the lowercased `common.displayText.key` contains `ttlive_superfanbox` or `envelopeInfo.businessType` is 19; then `envelope`, always                                                                                                            |
| `WebcastBarrageMessage`     | `superFanJoin` or `superFan` | over the lowercased, non-empty `content.key` and `commonBarrageContent.key`: one contains `ttlive_superfan_commentnotif_superfanjoined` → `superFanJoin`; else one contains `ttlive_superfan` → `superFan`; else nothing (2.4.0 also emitted a generic `barrage` event) |
| anything else               | (only `raw`)                 |                                                                                                                                                                                                                                                                         |

`raw` comes first, for every message that survives the duplicate check, history included.

## Reconnects

How the connection (`src/connection.ts`) gets back into the room after a drop. 2.4.0 had no reconnect of its own; this is the library's design.

- **Drops.** Once connected, the connection reconnects when the socket closes (`wsClose`), errors (`wsError`) or goes quiet for `idleTimeoutMs` (`idle`): `disconnected` with that reason and `willReconnect: true`, then one `reconnecting` per attempt. With `reconnect: false` or `maxAttempts: 0`, a drop stops the connection with that reason instead.
- **Waits.** With `d = min(maxDelayMs, baseDelayMs * factor ** (n - 1))`, attempt `n` (from 1) waits a random time from `d / 2` up to `d` ("equal jitter"), at least `minDelayMs` (default 1 000 ms), and at least the `retryAfterMs` of a `RateLimitError` from the attempt before. With the defaults, the first five attempts wait at least 1, 1, 2, 4 and 8 s. Every attempt signs again, and Euler Stream allows 5 signs a minute without an API key: full jitter (anywhere from 0) let the first smoke run's attempts 2 to 4 come within 8 s, and the fifth hit a 429 (`rate_limit_account_minute`, 20 s to wait). The count starts over after each successful reconnect.
- **Attempts.** An attempt runs steps 3 to 5 of the [Overview](#overview) with the last cursor: the live check (when `reconnect.checkLiveBeforeRetry` is on), the signed connect, the socket. Each failed attempt is reported through `error`, and its reason (below) is the next `reconnecting` event's. A `RoomNotFoundError`, or a `SignError` with a 4xx status other than 429, makes the next attempt look the room id up again first (step 2), once per drop. The signer's `x-room-id` replaces the room id only when it is numeric; otherwise a warning is logged.
- **Stops.** Otherwise, and once the room id was looked up again, a failure that isn't `retryable` stops the connection: `disconnected` with the failure as `error`, and the reason `signError` when the attempt failed before the socket (the signer, the room lookup or the signed batch) or `wsError` / `wsClose` when the socket failed. A live check that finds the room offline emits `streamEnd` (`ended`) and stops with reason `streamEnd`, without an `error`. Running out of attempts stops it with reason `giveUp` and a `ReconnectGiveUpError` (`cause`: the last failure), also emitted as `error`. `disconnect()` and the `signal` option stop it at any point (`user`, `aborted`), canceling the wait or the attempt in progress.
- **Resumed signed connects.** A signed connect asked for with a cursor comes back without a `pushServer` (every reconnect of the first smoke run did, through Euler Stream). The run keeps the push server and route params of its last connect that entered the room, and the latest `internalExt` and cursor of its batches. When a reconnect's signed batch leaves one out (a route params list counts as left out when no entry has a value), the kept one stands in; a batch's own values win. The cookies need no keeping: the jar holds the earlier ones, and new ones replace them by name. Each signed batch is described at `debug` ("Signed the connection": whether it resumed, how many messages and history messages it holds, and whether it has a cursor, an `internalExt`, a push server and route params), which tells whether the gap's messages come in it ([Open items](#open-items), 5).
- **New starts.** A `connect()` after a stop starts over: the cursor is `""`, nothing is kept, and the room id is looked up again unless the `roomId` option is set. Only the duplicate check's memory carries over.

## Gift list

`fetchGifts({ region?, language? })` tries, in order, until one returns gifts; each step runs within `requestTimeoutMs`, and a step that fails or returns no gift fails over to the next. Without a room id (no `connect()` yet and no `roomId` option), only step 3 runs. Every source is parsed the same way, then deduplicated by id (first wins). All steps failing: `ConnectorError` with code `GIFTS_UNAVAILABLE`, the steps' errors as `cause`.

1. **Room** (`source: "room"`): `GET https://webcast.tiktok.com/webcast/gift/list/?{client params}&room_id={roomId}` with the headers and the cookie jar, unsigned.
2. **Signer** (`source: "signer"`): `signer.fetchGifts(roomId)` ([Room gifts](#room-gifts) for Euler Stream).
3. **Region** (`source: "region"`): `GET https://webcast.tiktok.com/webcast/gift/list/?aid=1988&app_language={language}&region={region}&sys_region={region}` with only `Accept: application/json` and the User-Agent (the `headers` option's, when it sets one), and no cookies: the request Tokio makes today, which works without a room. Neither the default client params nor `clientParams` apply. Defaults `US` and `en-US` (Tokio's fallbacks when its geo-IP lookup fails).

Parsing: the gift array is the first non-empty one of `data.gifts`, `data.giftList` and `data.pages[0].gifts` (Tokio's rule took the first present one, even empty). Entries without a usable id (a positive number or a decimal string) are skipped; a missing `name` gives `""` and a missing `diamond_count` `0`. Each gift maps `id` → `id` (as a string), `name` → `name`, `diamond_count` → `diamondCount`, `image.url_list` / `image.uri` → `image.urlList` / `image.uri` (absent without `image`).

**What 2.4.0 did.** Its room gift list made the same request as step 1 (client params plus `room_id`, read `data.gifts`), but **signed** it: the request ran with `signRequest: true`, which sent the full URL (minus any `X-Bogus`, `X-Gnarly` and `msToken`) to the signer's sign-URL route with the method, the User-Agent and, when the jar had both, `sessionid` and `tt-target-idc`, then fetched the signed URL it got back (and its User-Agent, if any) [TLC: src/lib/web/routes/base/fetch-room-gifts.ts, "Request must now be signed from TikTok to work"; src/lib/web/lib/http-client.ts, `request`; src/lib/web/routes/euler/fetch-webcast-signature-euler.ts]. That route is `POST /tiktok/signing/encrypt/sign_url` (`client` query, `{ url, method, userAgent, sessionId, ttTargetIdc, … }` body), which the docs say is "NOT available to customers in any public package" [Euler: TikTok Signing]. So 2.4.0's room list only worked for accounts Euler Stream approved; the library tries the request unsigned and falls back. Whether TikTok answers it unsigned is an open item.

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
| `WebSocketError`       | `WEBSOCKET`         | the socket failing to open, erroring, or closing                                                                  |
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

What the references and docs can't settle. `yarn capture` on the user's own LIVE and `yarn smoke` (with `-v` for the `debug` logs) answer most of them.

1. **Unsigned room gift list.** 2.4.0 said TikTok needs the `webcast/gift/list/?room_id=` request signed. If the smoke test shows `source: "region"`, the room step is dead weight; keep it only if TikTok answers it for some rooms.
2. **Euler Stream's room gifts.** The documented answer holds gift ids and overrides, not gifts, and needs `WEBCAST_PREMIUM`. With such a key, check what `response` really holds. If it is ids only, `EulerSigner.fetchGifts` stays `null`, or could join `page_gifts` with Euler Stream's gift catalog (which doesn't count toward rate limits) or the region list to give a room-ordered list.
3. **`x-set-tt-cookie`.** Its format isn't documented; 2.4.0 kept only its first pair. `EulerSigner` logs the names of the cookies it read at `debug`: a smoke run shows whether it holds one cookie or several.
4. **Received payload types.** Which `payloadType` values the server sends besides `msg` and `im_enter_room_resp` (heartbeat replies? a `close`?), and whether any other carries a batch (2.4.0 decoded every `pb` payload as one). The session logs every other type at `debug`. A capture only holds the messages inside `msg` frames.
5. **History after a reconnect.** Whether messages sent during a reconnect's gap come back marked `is_history` (dropped unless `processInitialData`).
6. **`common.createTime` unit.** Assumed milliseconds since the epoch, as `now` is.
7. **Super fan keys.** `ttlive_superfanbox`, `ttlive_superfan_commentnotif_superfanjoined`, `ttlive_superfan` and business type 19 come from 2.4.0 and the 0.2.3 protos; confirm with a capture of a LIVE with super fans.
8. **Euler Stream `client`.** The docs say it only feeds metrics (default `ttlive-other`); 2.4.0 sent `ttlive-node`, and `EulerSigner` does too by default. Decide whether to identify as this library instead.
9. **402 from the connect route.** Kept from 2.4.0; the docs list only 200, 429, 500 and 503.
10. **Euler Stream host.** `tiktok.eulerstream.com` (the docs' first server) versus `api.eulerstream.com` (2.4.0's default, "Community & Pro"): confirm both serve the connect route the same way for free use.
11. **Pings.** 2.4.0 turned off `ws`'s automatic pong without saying why; the library answers pings like a browser. The first ping is logged at `debug`: a smoke run shows whether TikTok sends any.
12. **`version_code` twice.** Kept as 2.4.0 sends it; nothing says which one TikTok reads.
13. **The LIVE page markup.** Whether TikTok still serves `SIGI_STATE` on the LIVE page, and where `__UNIVERSAL_DATA_FOR_REHYDRATION__` keeps the room id if not. If both fail, step 1 of the room id lookup fails and steps 2 and 3 take over until the lookup is updated.
14. **Anonymous signing.** The connect route's docs page now groups `x-oauth-token` and `x-cookie-header` under "One authentication header required", and calls `x-cookie-header` "Raw TikTok cookies for direct authentication" (the OpenAPI data still marks both optional). If anonymous connects start failing with 401 or 403, this is why.
15. **`ratelimit-reset`.** Read as seconds from now (the IETF draft); a value of 10⁹ or more is read as a Unix time in seconds, 10¹² or more in milliseconds. Confirm with a 429 from Euler Stream.
16. **Entering the room.** Whether TikTok answers `im_enter_room` with `im_enter_room_resp`. Without it, entering waits for the first `msg` frame, and a quiet room would hit `connectTimeoutMs`.
17. **Quiet rooms.** Whether a quiet LIVE still sends a frame (a batch, a heartbeat reply or a ping) at least every 30 s, so the idle check (`idleTimeoutMs`) never fires on a healthy socket.
