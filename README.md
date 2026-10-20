# @tokioapp/connector

Connect to a TikTok LIVE from Node and receive its events: chat, gifts, likes, follows, shares, viewers, treasure chests and super fans. It reconnects on its own, decodes only the messages you listen to, and gives you typed events and errors. It is written from scratch, MIT-licensed, and has one runtime dependency (`ws`). It is the connector behind [Tokio](https://tokio.ialfaro.com).

Pre-release: nothing is on npm yet. The first version will be `0.1.0`.

## Install

```sh
yarn add @tokioapp/connector
```

Node 24 or later, Electron's main process included. The package is ESM only and ships its TypeScript types.

## Quick start

```ts
import { TikTokLiveConnection, isStreakEnd } from "@tokioapp/connector";

const connection = new TikTokLiveConnection("username");

connection.on("chat", (chat) => {
  console.log(`${chat.user?.nickname}: ${chat.content}`);
});
connection.on("gift", (gift) => {
  // A streak sends one event per update: count the one that ends it.
  if (isStreakEnd(gift)) {
    console.log(
      `${gift.user?.nickname} sent ${gift.repeatCount}x ${gift.gift?.name}`,
    );
  }
});
connection.on("like", (like) => {
  console.log(
    `${like.user?.nickname} liked ${like.count}x (${like.total} in total)`,
  );
});
connection.on("disconnected", ({ reason, willReconnect }) => {
  if (!willReconnect) console.log("stopped:", reason);
});

const { roomId } = await connection.connect();
console.log("connected to room", roomId);

// Later:
await connection.disconnect();
```

The username can be `name`, `@name` or a profile or LIVE URL. Attach listeners before `connect()`: they get every event from the first one on. `connect()` rejects when the first connect fails ([Errors](#errors)); once connected, the connection reconnects by itself ([Reconnecting](#reconnecting)).

`connection.state` is `idle`, `connecting`, `connected`, `reconnecting` or `disconnected`, and `connection.roomId` the room id once known.

## Events

| Event          | Fires when                                                                                                                       | Payload             | Fields you'll use                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| `connected`    | The connection entered the room: after `connect()` and after each reconnect                                                      | `ConnectedEvent`    | `roomId`, `reconnected`, `attempt`                                   |
| `disconnected` | An established connection ended. Not when the first `connect()` fails: it rejects instead                                        | `DisconnectedEvent` | `reason`, `willReconnect`, `error`                                   |
| `reconnecting` | A reconnect attempt is about to run                                                                                              | `ReconnectingEvent` | `attempt`, `delayMs`, `reason`                                       |
| `error`        | A failure no promise reports: a message that couldn't be decoded, a failed reconnect attempt. Logged instead when nobody listens | `ConnectorError`    | `code`, `message`, `retryable`                                       |
| `streamEnd`    | The LIVE ended or was suspended. The connection then stops                                                                       | `StreamEndEvent`    | `action`: `ended` or `suspended`                                     |
| `chat`         | A comment                                                                                                                        | `ChatMessage`       | `user`, `content`, `emotes`, `userIdentity`                          |
| `gift`         | A gift, once per streak update ([Gift streaks](#gift-streaks))                                                                   | `GiftMessage`       | `user`, `gift.name`, `gift.diamondCount`, `repeatCount`, `repeatEnd` |
| `like`         | Likes                                                                                                                            | `LikeMessage`       | `user`, `count`, `total`                                             |
| `follow`       | A viewer followed the host                                                                                                       | `SocialMessage`     | `user`                                                               |
| `share`        | A viewer shared the LIVE                                                                                                         | `SocialMessage`     | `user`, `shareCount`                                                 |
| `member`       | A viewer joined, or another membership change                                                                                    | `MemberMessage`     | `user`, `actionId` (`1` joined, `3` subscribed)                      |
| `roomUser`     | Viewer counts and the top viewers                                                                                                | `RoomUserMessage`   | `total` (watching now), `totalUser` (so far), `ranks`                |
| `envelope`     | A treasure chest                                                                                                                 | `EnvelopeMessage`   | `envelopeInfo.businessType`                                          |
| `superFan`     | A super fan banner                                                                                                               | `BarrageMessage`    | `user`, `content.key`                                                |
| `superFanJoin` | A viewer became a super fan                                                                                                      | `BarrageMessage`    | `user`                                                               |
| `superFanBox`  | A super fan box (also emitted as `envelope`)                                                                                     | `EnvelopeMessage`   | `envelopeInfo`                                                       |
| `raw`          | Every message before decoding, history included ([Raw messages](#raw-messages))                                                  | `RawMessage`        | `method`, `payload`, `msgId`, `isHistory`                            |

LIVE payloads are plain objects you can `JSON.stringify`:

- 64-bit ids (`userId`, `msgId`, `roomId`, `giftId`, `groupId`, `createTime`) are decimal strings, counters are numbers. No `bigint`.
- Fields TikTok leaves out hold their defaults (`""`, `0`, `"0"`, `false`, `[]`). Nested objects it leaves out (`user`, `gift`, `common`) are `undefined`, hence the `?.`.
- `user` is a `User`: `userId`, `nickname` (the display name), `displayId` (the handle, without `@`), `avatarThumb.urlList` and `badgeList`. `userIdentity` says whether they follow, subscribe to or moderate the host.
- `common`, on every LIVE payload, holds the message's `msgId`, `createTime` and `displayText`.

### Gift streaks

A gift of type 1 (`isStreakable(gift)`) can be sent in a streak. Each update of the streak arrives as its own `gift` event with a growing `repeatCount`, and one more event with `repeatEnd: true` ends it, even for a single gift. Other gifts arrive once. `isStreakEnd(gift)` is `true` for the event to count, whose `repeatCount` is the final one.

## Options

`new TikTokLiveConnection(username, options)`. Every option is optional.

| Option                | Default             | What it does                                                                                                                                                    |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signer`              | `new EulerSigner()` | Signs the WebSocket connection ([Signing](#signing))                                                                                                            |
| `session`             | none                | `{ sessionId, ttTargetIdc? }`: a logged-in TikTok web session, sent to TikTok as cookies. Some LIVEs (age-restricted ones) need one. Never sent to Euler Stream |
| `roomId`              | looked up           | The room id, when you know it: skips the username lookup                                                                                                        |
| `processInitialData`  | `false`             | Also emit the backlog TikTok sends on connect (recent comments)                                                                                                 |
| `reconnect`           | see below           | `Partial<ReconnectOptions>`, or `false` to never reconnect ([Reconnecting](#reconnecting))                                                                      |
| `heartbeatIntervalMs` | `10000`             | How often to send a heartbeat                                                                                                                                   |
| `idleTimeoutMs`       | `30000`             | Reconnect when no frame arrives for this long. `0` turns it off                                                                                                 |
| `connectTimeoutMs`    | `20000`             | How long the WebSocket may take to open                                                                                                                         |
| `requestTimeoutMs`    | `10000`             | How long each HTTP request, to TikTok or the signer, may take                                                                                                   |
| `dedupeSize`          | `2048`              | How many recent message ids to remember, to drop duplicates. `0` keeps none                                                                                     |
| `clientParams`        | none                | Query parameters to add to, or replace in, every request to TikTok and the WebSocket URL                                                                        |
| `headers`             | none                | Headers to add to, or replace in, every request to TikTok and the WebSocket                                                                                     |
| `fetch`               | global `fetch`      | The `fetch` for HTTP requests, to instrument or route them. The WebSocket doesn't use it                                                                        |
| `signal`              | none                | An `AbortSignal` that stops the connection for good (`disconnected` with reason `aborted`)                                                                      |
| `logger`              | `consoleLogger`     | `(level, message, data?) => void`. The default prints warnings and errors to the console                                                                        |

The constructor throws a `RangeError` for a number out of range and a `TypeError` for a `roomId` that isn't numeric. `DEFAULT_OPTIONS` holds the defaults.

`clientParams` and `headers` are the way around a TikTok change before a release fixes it: they override the defaults the library sends.

## Reconnecting

Once connected, the connection reconnects by itself when the WebSocket closes or errors, when no frame arrives for `idleTimeoutMs`, or when a retryable signer failure interrupts a reconnect. A drop goes like this:

1. `disconnected`, with the reason and `willReconnect: true`.
2. `reconnecting`, with the attempt number and the wait.
3. `connected`, with `reconnected: true`, once back in the room.

It resumes from the last cursor, so the messages of the gap can still come through, and duplicates are dropped. The wait before attempt `n` is a random value between 0 and `min(maxDelayMs, baseDelayMs * factor ** (n - 1))` ("full jitter"), and at least what a `RateLimitError` asks for. The count starts over after each successful reconnect.

```ts
const connection = new TikTokLiveConnection("username", {
  reconnect: { maxAttempts: Infinity, maxDelayMs: 60_000 },
});

connection.on("reconnecting", ({ attempt, delayMs, reason }) => {
  console.log(`dropped (${reason}), attempt ${attempt} in ${delayMs} ms`);
});
```

| `reconnect`            | Default | What it does                                                                                  |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `maxAttempts`          | `10`    | Attempts before giving up. `Infinity` never gives up                                          |
| `baseDelayMs`          | `1000`  | The wait ceiling of the first attempt                                                         |
| `maxDelayMs`           | `30000` | The largest wait ceiling                                                                      |
| `factor`               | `2`     | How much the ceiling grows per attempt                                                        |
| `checkLiveBeforeRetry` | `true`  | Check that the room is still LIVE before each attempt. If it isn't, emit `streamEnd` and stop |

The connection stops for good, with `disconnected` and `willReconnect: false`, for these reasons:

| `reason`                     | When                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `user`                       | You called `disconnect()`                                                                              |
| `streamEnd`                  | The LIVE ended or was suspended, or a reconnect's live check found it offline. `streamEnd` comes first |
| `giveUp`                     | The attempts ran out. `error` is a `ReconnectGiveUpError` whose `cause` is the last attempt's error    |
| `aborted`                    | The `signal` option aborted                                                                            |
| `signError`                  | The signer failed in a way retrying can't fix, such as a rejected API key                              |
| `wsClose`, `wsError`, `idle` | The connection dropped, with `reconnect: false`                                                        |

The first `connect()` is never retried. It rejects, and you decide: an `OfflineError` means waiting for the user to go LIVE, a `RateLimitError` says how long to wait.

## Errors

Everything the library throws, rejects with or emits is a `ConnectorError`:

- `code`: what went wrong, as a stable string (`ERROR_CODES` lists them). Branch on it, not on `message`, which is for people.
- `retryable`: whether trying again later can help.
- `cause`: the underlying error, when there is one.

| Class                                 | `code`              | When                                                                          | Retryable          | Also has                                      |
| ------------------------------------- | ------------------- | ----------------------------------------------------------------------------- | ------------------ | --------------------------------------------- |
| `InvalidUsernameError`                | `INVALID_USERNAME`  | The constructor got something that isn't a username                           | no                 |                                               |
| `RoomNotFoundError`                   | `ROOM_NOT_FOUND`    | No lookup found the user's room: no such user, or TikTok blocked every lookup | no                 |                                               |
| `OfflineError`                        | `OFFLINE`           | The user exists but isn't LIVE                                                | no                 | `roomId`                                      |
| `HttpError`                           | `HTTP`              | TikTok answered with an unexpected status or body                             | for 429 and 5xx    | `status`                                      |
| `SignError`                           | `SIGN_FAILED`       | The signer failed or couldn't be reached                                      | except 401 and 403 | `status`, `requestId`                         |
| `RateLimitError` (a `SignError`)      | `RATE_LIMITED`      | The signer's rate limit                                                       | yes                | `retryAfterMs`                                |
| `PremiumFeatureError` (a `SignError`) | `PREMIUM_REQUIRED`  | The signer needs a paid plan for this request                                 | no                 |                                               |
| `TimeoutError`                        | `TIMEOUT`           | A request, the socket opening, or a silent stream took too long               | yes                | `phase`: `request`, `sign`, `connect`, `idle` |
| `WebSocketError`                      | `WEBSOCKET`         | The socket failed to open, errored or closed                                  | yes                | `closeCode`                                   |
| `ProtocolError`                       | `PROTOCOL`          | TikTok or the signer sent data the library can't read                         | yes                |                                               |
| `AbortError`                          | `ABORTED`           | The `signal` aborted, or `disconnect()` interrupted the call                  | no                 |                                               |
| `ReconnectGiveUpError`                | `RECONNECT_GAVE_UP` | Every reconnect attempt failed                                                | no                 | `attempts`                                    |

Plain `ConnectorError`s carry the other codes: `INVALID_STATE` (`connect()` while connecting or connected), `NETWORK` (a request failed before any response), `GIFTS_UNAVAILABLE` (`fetchGifts()`) and `INTERNAL` (a bug: please report it).

Telling the usual first-connect failures apart:

```ts
import { RateLimitError, isConnectorError } from "@tokioapp/connector";

try {
  await connection.connect();
} catch (error) {
  if (!isConnectorError(error)) throw error;
  if (error.code === "OFFLINE") {
    console.log("Not LIVE right now");
  } else if (error.code === "ROOM_NOT_FOUND") {
    console.log("No such user, or TikTok blocked the lookup");
  } else if (error instanceof RateLimitError) {
    console.log(
      `Rate limited, retry in ${Math.ceil((error.retryAfterMs ?? 60_000) / 1000)} s`,
    );
  } else {
    console.log(
      `${error.code}: ${error.message}`,
      error.retryable ? "(try again later)" : "",
    );
  }
}
```

`isConnectorError()` also recognizes an error from another copy of the library, which `instanceof` misses. After the first connect, failures go to the `error` event (or the logger, when nobody listens) and to `disconnected`'s `error`.

## Signing

TikTok only accepts the WebSocket connection with a signed request, and signing takes a service. A `Signer` makes that request. The default is `EulerSigner`, for [Euler Stream](https://www.eulerstream.com).

Without an API key, Euler Stream's anonymous limits apply, and they are low: each connect and each reconnect attempt is one request. With a key:

```ts
import { EulerSigner, TikTokLiveConnection } from "@tokioapp/connector";

const connection = new TikTokLiveConnection("username", {
  signer: new EulerSigner({ apiKey: process.env.EULER_API_KEY }),
});
```

- The key only travels in the `x-api-key` header, never in a URL, so it stays out of logs and proxies' access logs.
- The library reads no environment variable: pass the key yourself, as above. Each signer has its own key.
- `host` picks another Euler Stream server, and `client` sets the `client` parameter Euler Stream uses for its metrics.
- The `session` option never reaches Euler Stream.

To sign with another service, implement `Signer`. Only `fetchConnect` is required:

```ts
import { SignError, type Signer } from "@tokioapp/connector";

const signer: Signer = {
  async fetchConnect({ roomId, cursor }, { fetch, signal, userAgent }) {
    const url = new URL(`https://signer.example.com/rooms/${roomId}/connect`);
    url.searchParams.set("cursor", cursor);
    url.searchParams.set("user_agent", userAgent);
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new SignError(`The signer answered ${response.status}`, {
        status: response.status,
      });
    }
    return {
      body: new Uint8Array(await response.arrayBuffer()),
      cookies: response.headers.get("x-set-tt-cookie")?.split("; ") ?? [],
    };
  },
};

const connection = new TikTokLiveConnection("username", { signer });
```

- `body` is the signed connect: TikTok's protobuf `ProtoMessageFetchResult` (the first messages, the cursor, the push server and its parameters). `cookies` are the `name=value` pairs to send on the WebSocket. `roomId`, `requestId` and `agentId` are optional.
- Make requests with the context's `fetch` and stop when its `signal` aborts (`AbortError`). Give up after `timeoutMs` with a `TimeoutError` (phase `sign`), and throw `RateLimitError`, `PremiumFeatureError` or `SignError` for the service's failures.
- `sessionCookies` holds the TikTok session when the connection has one. Whoever gets it can act as that account: only send it to a third party when your user asked for it.
- `resolveRoomId`, `fetchRoomInfo` and `fetchGifts` are optional fallbacks for when TikTok refuses the library's own requests. Return `null` when the service has no answer.

[`PROTOCOL.md`](PROTOCOL.md) describes every request in detail.

## Gifts

```ts
await connection.connect();

const { gifts, source } = await connection.fetchGifts();
console.log(`${gifts.length} gifts from the ${source} list`);
const rose = gifts.find((gift) => gift.name === "Rose"); // { id, name, diamondCount, image }
```

`fetchGifts()` tries three sources in order and says which one answered:

| `source` | The list                                                                                                             | Needs                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `room`   | The LIVE's own gift list, from TikTok                                                                                | A room id: after `connect()`, or the `roomId` option |
| `signer` | The signer's list for the room (`signer.fetchGifts`)                                                                 | A room id, and a signer that has one                 |
| `region` | TikTok's list for a region and language: `fetchGifts({ region: "MX", language: "es-MX" })`, default `US` and `en-US` | Nothing                                              |

A source that fails or returns no gift hands over to the next, and without a room id only `region` runs. It rejects with a `ConnectorError` with code `GIFTS_UNAVAILABLE` only when every source failed.

## Raw messages

The `raw` event gets every message before decoding, including the types no other event covers:

```ts
connection.on("raw", ({ method, msgId, payload }) => {
  if (method === "WebcastPollMessage") savePoll(msgId, payload.slice());
});
```

- It fires for every message that isn't a duplicate, history included, before the other events.
- `payload` is the protobuf message, as a view into the received frame: copy it (`payload.slice()`) to keep it. Decode it with any protobuf library; [`PROTOCOL.md`](PROTOCOL.md) lists the field numbers the library reads.
- Decoding is lazy: a message is decoded only when one of the events it can produce has a listener, so listen only to what you use. `raw` alone decodes nothing, except the control message that ends a LIVE, which is always decoded.

## Scripts

Two scripts in this repository (not in the package) check the library against real LIVEs. Both need the network and a user who is LIVE now, and take an Euler Stream API key from `EULER_API_KEY` (or `--api-key`). `--help` lists every flag.

```sh
yarn smoke <username> --seconds 30 --drop-after 10 --gifts
yarn capture <username> --seconds 60 --anonymize
```

- `yarn smoke` connects with a listener on every event and prints each transition and the first of each LIVE event. `--drop-after` drops the socket to check the reconnect, `--gifts` shows which gift source answered, and `--json` prints the summary as JSON. It exits 0 when it connected, saw a LIVE event and no `error`, and every check passed.
- `yarn capture` records the raw messages into `captures/<username>-<time>.json` (gitignored): method, ids, flags and the payload in base64, without cookies, session, API key or `internalExt`. The payloads still hold viewers' nicknames and comments: `--anonymize` only drops the username for now. A fixture committed under `test/fixtures/` must come from your own LIVE.

## Compared with tiktok-live-connector

This library will replace [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector) in Tokio. Compared with its 2.4.0 release, the last one under MIT:

|                      | `@tokioapp/connector`                                                                                | tiktok-live-connector 2.4.0                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| License              | MIT                                                                                                  | MIT (2.4.1 and later: AGPL-3.0-only)                                                              |
| Runtime dependencies | 1: `ws`                                                                                              | 6: `got`, `ws`, `@bufbuild/protobuf`, `tiktok-live-proto`, `typed-emitter` and Euler Stream's SDK |
| Node                 | 24 and later                                                                                         | 20 and later                                                                                      |
| Reconnecting         | Built in: backoff with jitter, resumes from the cursor, drops duplicates, reconnects a silent stream | Call `connect()` again yourself                                                                   |
| Decoding             | Lazy: only the messages you listen to                                                                | Every known message type, unless configured to skip it                                            |
| Events               | 16, plus `raw` for the rest                                                                          | Over 60: polls, battles, questions, goals and more                                                |
| Errors               | One base class with `code` and `retryable`                                                           | Its own error classes                                                                             |
| Signer API key       | Per signer, sent only in the `x-api-key` header                                                      | The `signApiKey` option, written to a global config, or `SIGN_API_KEY`                            |
| Only there           |                                                                                                      | Sending chat messages, the mobile connection, proxy settings for its HTTP and WebSocket clients   |

## License

MIT, see [`LICENSE`](LICENSE). The protocol was learned from the MIT releases of [TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector) (2.4.0) and [TikTok-Webcast-Protobuf](https://github.com/isaackogan/TikTok-Webcast-Protobuf) (0.2.3); no code was copied. [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) has the credits and the online services the library talks to. This project isn't affiliated with TikTok or Euler Stream.
