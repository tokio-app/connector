# T3 notes for Phase 2

What T3 (WebSocket session, frames, connection) needs from files it doesn't own, and what only a real LIVE can confirm. Nothing below was changed in the frozen files.

## 1. Pings: `ws` keeps `autoPong` on (PROTOCOL.md disagrees)

**Decision.** `WebcastSession.openSocket()` creates the socket with `ws`'s defaults, so it answers the server's pings. RFC 6455 requires a pong for every ping and browsers (TikTok's own web client) always send one; when TikTok doesn't ping, the setting does nothing. 2.4.0 turned automatic pongs off without saying why. The session logs the first ping it gets (`debug`, "The server sends WebSocket pings"), so a smoke run shows whether TikTok pings at all. Pings also reset the idle watchdog.

**Proposed diff, PROTOCOL.md "WebSocket":**

```diff
-Headers: `User-Agent` and `Cookie` (the jar, signer cookies included [TLC: src/lib/client/index.ts, `setupWebsocket`]); `headers` overrides apply. The socket uses the `ws` package (Node's built-in `WebSocket` can't set these headers). 2.4.0 opened it with `autoPong: false` (no automatic replies to pings) [TLC: ws-client.ts]; we do the same.
+Headers: `User-Agent` and `Cookie` (the jar, signer cookies included [TLC: src/lib/client/index.ts, `setupWebsocket`]); `headers` overrides apply. The socket uses the `ws` package (Node's built-in `WebSocket` can't set these headers) with its defaults: it answers pings, as RFC 6455 requires and browsers do. 2.4.0 opened it with `autoPong: false` (no automatic replies to pings) [TLC: ws-client.ts] without saying why; the first ping is logged (`debug`).
```

**Open item 11:**

```diff
-11. **`autoPong: false`.** 2.4.0 turned off `ws`'s automatic pong without saying why; keep it unless a capture shows pings going unanswered.
+11. **Pings.** 2.4.0 turned off `ws`'s automatic pong without saying why; the library answers pings like a browser. A smoke run's debug log shows whether TikTok sends any.
```

## 2. Behaviors PROTOCOL.md should state (proposed wording)

"WebSocket", the connect timeout and the idle timer:

```diff
-The socket must open within `connectTimeoutMs` (default 20 000 ms, 2.4.0's `WS_CONNECT_TIMEOUT_MS`), else `TimeoutError` with phase `connect`.
+The socket must open and enter the room (an `im_enter_room_resp` frame, or the first `msg` frame) within `connectTimeoutMs` (default 20 000 ms, 2.4.0's `WS_CONNECT_TIMEOUT_MS`), else `TimeoutError` with phase `connect`. 2.4.0 only waited for the socket to open.
-While connected, any frame resets the idle timer;
+While connected, any frame (pings included) resets the idle timer;
```

"Batches":

```diff
-- **Cursor.** Every batch's `cursor` replaces the one kept for reconnects;
+- **Cursor.** Every batch's non-empty `cursor` replaces the one kept for reconnects (a new `connect()` starts over from `""`);
-- **Initial batch.** ... On the first connect they are skipped unless `processInitialData`; on a reconnect they go through dispatch ...
+- **Initial batch.** ... On the first connect they are skipped unless `processInitialData` (their ids still count as seen, so a reconnect's backlog doesn't bring them back); on a reconnect they go through dispatch ... They are dispatched right after `connected`, before any batch the socket received while it was entering the room.
```

A paragraph for "Overview" (or a new "Reconnects" section), describing `connection.ts`:

> After a drop (`wsClose`, `wsError`, `idle`), each attempt waits a full-jitter backoff (at least a `RateLimitError`'s `retryAfterMs`) and each failed attempt is reported through `error`. A 4xx from the signer (other than 429) or a `RoomNotFoundError` makes the next attempt look the room id up again, once per drop. A failure that isn't `retryable` stops the connection: `disconnected` with the failure's reason (`signError`; `wsError` or `wsClose` for socket failures). Running out of attempts stops it with `giveUp` and a `ReconnectGiveUpError` (also emitted as `error`). `maxAttempts: 0` behaves like `reconnect: false`. A `connect()` after a stop looks the room id up again unless the `roomId` option is set. The signer's `x-room-id` is used only when it is numeric (else a warning is logged).

## 3. JSDoc in frozen files (wording only)

- `events.ts`, `DisconnectReason`: `signError` is also the reason for a failed reconnect attempt that never reached the socket (the room lookup, an unusable signed batch), not only for the signer itself. Proposed: "`signError`: a reconnect attempt failed before the socket opened: the signer, the room lookup or the signed batch (see the error)."
- `options.ts`, `ReconnectOptions.maxAttempts`: add "`0` turns reconnecting off, like `reconnect: false`."
- `tsconfig.build.json`: `TikTokLiveConnection._terminateSocket()` (for `yarn smoke --drop-after`) is marked `@internal` but still appears in `dist/index.d.ts`. Add `"stripInternal": true` to keep it out, if the TS 7 emit honors it.

## 4. What the connection relies on from T1 and T2

**T1, `dispatch()`:**

- Drops duplicates through `context.recentIds` (`add()` returning `false`). The connection keeps one `RecentIds` for its whole life, and adds the skipped backlog's ids to it, so dedupe must go through that set.
- Never throws. The connection wraps each call anyway and reports a throw as an `INTERNAL` error.
- Calls `context.endStream(action)` for control actions 3 and 4. The connection then emits `streamEnd`, stops dispatching the rest of the batch, closes the socket and emits `disconnected` (`streamEnd`).
- History is dropped by dispatch itself (`context.processInitialData`); the connection only decides whether the first connect's signed batch is dispatched at all.

**T2:**

- `HttpClient`: the constructor takes `{ fetch, timeoutMs, clientParams, headers, session, logger }`. The connection uses `userAgent` (UA for the signer, the WS header and the URL's `User-Agent` param), `cookieHeader()` (WS `Cookie`, after `addCookies(signed.cookies)`), and `sessionCookieHeader()` (passed as `SignRequest.sessionCookies` only when defined). One client per connection.
- `resolveRoomId(username, context)` throws `RoomNotFoundError` or `AbortError`. `checkLive(roomId, context)` resolves `true`, `false` or `null` (inconclusive, the connect goes on) and throws only `AbortError`.
- `fetchGiftList({ roomId: string | null, region, language }, context)`. `fetchGifts()` fills the defaults (`US`, `en-US`) and passes `options.signal` (a `disconnect()` doesn't abort it).
- Signers throw `ConnectorError`s, with `SignError.status` set for HTTP answers (the 4xx check needs it) and `retryable` set correctly (401/403 not retryable). A signer's other throw becomes an `INTERNAL` error.
- The connection checks the signed batch itself (`pushServer` and `cursor` required, else `ProtocolError`), so `EulerSigner` may check it too without conflict.

## 5. Internal API changes from the Phase 0B stubs

These are T3's own files, but check `scripts/` (T4) for imports of the old names when merging:

- `ws/frames.ts`: `encodeEnterRoom({ roomId, enterUniqueId? })`, `encodeHeartbeat({ roomId, seqId })`, `encodeAck({ logId, internalExt })`, `decodePushFrame(bytes)` (was `decodeFrame`), `decodeFetchResult(payload, options?)`, `PayloadType`, `PROTOBUF_ENCODING`.
- `util/gzip.ts`: `gunzip()` is synchronous now (frames stay in order), and capped at `MAX_GUNZIPPED_BYTES` (64 MiB).
- `util/backoff.ts`: `backoffDelay(attempt, options, random?)` and `withRetryAfter(delayMs, retryAfterMs)`.
- `ws/session.ts`: `new WebcastSession()`, `open(options)`, `close(code?)`, `terminate()`; events `batch`, `error`, `closed` (reasons `close`, `error`, `idle`, `terminated`).

## 6. What only a real LIVE can confirm (Phase 2 smoke run)

1. TikTok answers `im_enter_room` with `im_enter_room_resp`. Without it, entering waits for the first `msg` frame, and a quiet room would hit `connectTimeoutMs`.
2. The handshake goes through with our URL (both `version_code`s, the route params), headers and cookies, and `ws`'s permessage-deflate offer.
3. Heartbeats every 10 s keep the socket open, and whether the server answers them (other payload types are logged at `debug`, open item 4).
4. Whether TikTok sends WebSocket pings (the first one is logged at `debug`).
5. Acks (`logId` plus `internalExt`) are accepted: no closes after `needAck` batches.
6. `compress=gzip` batches decompress and decode.
7. The 30 s idle watchdog never fires on a live room, quiet ones included.
8. A reconnect resumes from the cursor: what was said during the gap arrives in the signed batch, with or without `is_history` (open item 5); duplicates are dropped.
9. `--drop-after`: `_terminateSocket()` leads to `reconnecting` then `connected { reconnected: true }`.
10. The signer's `x-room-id` and cookies, and how the reconnect backoff meets Euler Stream's anonymous limit (5 signs per minute): a `RateLimitError`'s wait is honored.
11. The LIVE ending: the control message gives `streamEnd`, then `disconnected` (`streamEnd`), with no reconnect.
