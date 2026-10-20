# @tokioapp/connector

Connect to a TikTok LIVE from Node and receive its events: chat, gifts, likes, follows, shares, viewers, treasure chests and super fans. It reconnects on its own, decodes only the messages you listen to, and gives you typed events and errors. It is written from scratch, MIT-licensed, and has one runtime dependency (`ws`). It is the connector behind [Tokio](https://tokio.ialfaro.com).

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

Every event has a name in `WebcastEvent`, so you needn't spell it as a string, and `WebcastEventMap` types its payload:

```ts
import { WebcastEvent } from "@tokioapp/connector";

connection.on(WebcastEvent.CHAT, (chat) => console.log(chat.content));
```

A LIVE message is decoded only when one of the events it leads to has a listener, so listening to many events costs nothing until they fire. The events marked _pending_ are declared (their names and payload types are in the package) but not emitted yet: their messages reach `raw` only, until the next release decodes them.

### Connection

| Event          | Fires when                                                                                                                       | Payload             | Fields you'll use                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------- |
| `connected`    | The connection entered the room: after `connect()` and after each reconnect                                                      | `ConnectedEvent`    | `roomId`, `reconnected`, `attempt`        |
| `disconnected` | An established connection ended. Not when the first `connect()` fails: it rejects instead                                        | `DisconnectedEvent` | `reason`, `willReconnect`, `error`        |
| `reconnecting` | A reconnect attempt is about to run                                                                                              | `ReconnectingEvent` | `attempt`, `delayMs`, `reason`            |
| `error`        | A failure no promise reports: a message that couldn't be decoded, a failed reconnect attempt. Logged instead when nobody listens | `ConnectorError`    | `code`, `message`, `retryable`            |
| `streamEnd`    | The LIVE ended or was suspended. The connection then stops                                                                       | `StreamEndEvent`    | `action`: `ended` or `suspended`          |
| `raw`          | Every message before decoding, history included ([Raw messages](#raw-messages))                                                  | `RawMessage`        | `method`, `payload`, `msgId`, `isHistory` |

### Chat, reactions and moderation

| Event                | Fires when                                    | Payload                     | Fields you'll use                                       |
| -------------------- | --------------------------------------------- | --------------------------- | ------------------------------------------------------- |
| `chat`               | A comment                                     | `ChatMessage`               | `user`, `content`, `emotes`, `mentionUsers`             |
| `emote`              | A comment made of emotes only                 | `EmoteChatMessage`          | `user`, `emoteList`, `userIdentity`                     |
| `like`               | Likes                                         | `LikeMessage`               | `user`, `count`, `total`                                |
| `social`             | A follow or share, whatever its text key      | `SocialMessage`             | `user`, `common.displayText`, `shareType`, `action`     |
| `follow`             | A viewer followed the host                    | `SocialMessage`             | `user`, `followCount`, `targetUserId`                   |
| `share`              | A viewer shared the LIVE                      | `SocialMessage`             | `user`, `shareCount`, `shareTarget`                     |
| `imDelete`           | A moderator deleted comments                  | `ImDeleteMessage`           | `deleteMsgIds`, `deleteUserIds`                         |
| `roomPin`            | A message was pinned to the chat, or unpinned | `RoomPinMessage`            | `action`, `chatMessage`, `operator`, `pinMsgId`         |
| `questionNew`        | A new question in the Q&A                     | `QuestionNewMessage`        | `details.user`, `details.content`                       |
| `captionMessage`     | A live caption of what the host says          | `CaptionMessage`            | `content`, `definite`, `timestampMs`, `durationMs`      |
| `roomMessage`        | A message from the room, such as a welcome    | `RoomMessage`               | `content`, `scene`, `isWelcome`                         |
| `notice`             | A notice from TikTok, such as a warning       | `NoticeMessage`             | `content`, `noticeType`, `noticeTitle`, `noticeContent` |
| `system`             | A system message                              | `SystemMessage`             | `message`                                               |
| `liveIntro`          | The LIVE's intro text                         | `LiveIntroMessage`          | `content`, `user`                                       |
| `unauthorizedMember` | A viewer joined without an account            | `UnauthorizedMemberMessage` | `nickName`                                              |
| `msgDetect`          | A detection probe TikTok sends to clients     | `MsgDetectMessage`          | `dType`, `triggerBy`                                    |
| `toast`              | A toast TikTok shows                          | `ToastMessage`              | `displayDurationMillisecond`                            |
| `bottomMessage`      | A message shown at the bottom of the LIVE     | `BottomMessage`             | `content`, `bizType`                                    |
| `roomVerify`         | A verification request from TikTok            | `RoomVerifyMessage`         | `content`, `closeRoom`                                  |

### Gifts, money and membership

| Event                    | Fires when                                                             | Payload                         | Fields you'll use                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `gift`                   | A gift, once per streak update ([Gift streaks](#gift-streaks))         | `GiftMessage`                   | `user`, `gift` (`name`, `diamondCount`), `repeatCount`, `repeatEnd`                                                      |
| `member`                 | A viewer joined, or another membership change                          | `MemberMessage`                 | `user`, `actionId` (`MemberAction`: `JOINED` 1, `SUBSCRIBED` 3), `operator`, `memberCount`                               |
| `subNotify`              | A subscription, or a subscription notice                               | `SubNotifyMessage`              | `user`, `subMonth`, `isSend` (gifted), `messageType` (`SubNotifyMessageType`)                                            |
| `subPinEvent`            | A subscription card was pinned or unpinned                             | `SubPinEventMessage`            | `actionType` (`SubPinAction`), `card.title.content`, `card.type` (`PinCardType`), `card.goalPinCard`                     |
| `barrage`                | A banner, whatever its text key (before `superFan` and `superFanJoin`) | `BarrageMessage`                | `user`, `msgType` (`BarrageType`), `content.key`, `userGradeParam.currentGrade`                                          |
| `superFan`               | A super fan banner                                                     | `BarrageMessage`                | `user`, `content.key`                                                                                                    |
| `superFanJoin`           | A viewer became a super fan                                            | `BarrageMessage`                | `user`                                                                                                                   |
| `envelope`               | A treasure chest                                                       | `EnvelopeMessage`               | `envelopeInfo`: `businessType` (`EnvelopeBusinessType`), `diamondCount`, `peopleCount`, `sendUserName`                   |
| `superFanBox`            | A super fan box (then emitted as `envelope` too)                       | `EnvelopeMessage`               | `envelopeInfo`: `superFanCount`, `diamondCount`, `sendUserName`                                                          |
| `giftBroadcast`          | A gift broadcast across rooms                                          | `GiftBroadcastMessage`          | `fromUserId`, `notify` (`content`, `user`)                                                                               |
| `roomNotify`             | A notice shown in the room, such as a big gift elsewhere               | `RoomNotifyMessage`             | `content`, `user`, `notifyType`, `fromUserId`                                                                            |
| `goalUpdate`             | A LIVE goal was set or progressed                                      | `GoalUpdateMessage`             | `goal.description`, `goal.subGoals` (`progress`, `target`), `contributorDisplayId`, `updateSource` (`GoalMessageSource`) |
| `viewerPicksUpdate`      | A viewer picks round changed                                           | `ViewerPicksUpdateMessage`      | `info.giftPickList` (`giftPick`, `score`), `info.status`, `updateType`                                                   |
| `hourlyRank`             | The hourly rank's rewards                                              | `HourlyRankRewardMessage`       | `winners` (`userId`, `assetId`, `notify`)                                                                                |
| `giftPrompt`             | A prompt about gifting, such as a spending block                       | `GiftPromptMessage`             | `title`, `body`, `blockNumDays`                                                                                          |
| `giftPanelUpdate`        | The gift panel changed                                                 | `GiftPanelUpdateMessage`        | `roomId`, `timestamp`                                                                                                    |
| `giftDynamicRestriction` | A gift's restrictions changed                                          | `GiftDynamicRestrictionMessage` | `common` (nothing else is decoded)                                                                                       |
| `guide`                  | A guide TikTok shows, such as a gift suggestion                        | `GuideMessage`                  | `giftId`, `description`, `guideType`, `scene`                                                                            |
| `boostCard`              | Boost cards                                                            | `BoostCardMessage`              | `cards` (`cardId`, `taskSource`, `taskId`)                                                                               |

### Link-mic and battles

| Event                       | Fires when                                                      | Payload                     | Fields you'll use                                                                         |
| --------------------------- | --------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| `linkMicBattle`             | A battle between hosts started, changed or ended                | `LinkMicBattle`             | `battleId`, `action` (`BattleAction`), `anchorsInfo`, `battleResult`                      |
| `linkMicArmies`             | The scores of a battle changed                                  | `LinkMicArmies`             | `battleId`, `armies` (per host: `hostScore`, `userArmies`), `triggerReason`               |
| `linkMicBattlePunishFinish` | A battle's punishment ended                                     | `LinkMicBattlePunishFinish` | `battleId`, `reason` (`PunishFinishReason`)                                               |
| `linkMicBattleTask`         | A battle task started, progressed or settled                    | `LinkMicBattleTask`         | `taskMessageType`, `taskUpdate`, `taskSettle`, `battleId`                                 |
| `linkMicFanTicketMethod`    | The fan tickets of a link changed                               | `LinkMicFanTicketMethod`    | `fanTicketRoomNotice.userFanTicket`, `fanTicketRoomNotice.totalLinkmicFanTicket`          |
| `linkMicMethod`             | A link-mic signal of the older kind                             | `LinkMicMethod`             | `messageType`, `userId`, `linkedUsers`, `replyType`                                       |
| `linkMessage`               | A multi-guest link changed: invitations, replies, joins, leaves | `LinkMessage`               | `messageType`, `inviteContent`, `enterContent`, `leaveContent`                            |
| `linkLayer`                 | A link changed, in the newer link layer                         | `LinkLayerMessage`          | `messageType` (`LinkLayerMessageType`), `channelId`, `inviteContent`, `listChangeContent` |
| `linkState`                 | The state of a link's users                                     | `LinkStateMessage`          | `stateType` (`LinkStateType`), `channelId`, `userStates`                                  |
| `linkMicBattleItemCard`     | A battle card was used or awarded                               | `LinkMicBattleItemCard`     | `battleId`, `msgType` (`BattleCardMsgType`)                                               |
| `linkMicLayoutState`        | A link's layout changed                                         | `LinkMicLayoutStateMessage` | `channelId`, `scene`, `version`                                                           |

### Room, ranks, polls, shopping and system

| Event                    | Fires when                                            | Payload                         | Fields you'll use                                                  |
| ------------------------ | ----------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `controlMessage`         | The LIVE's state changed: paused, resumed, ended      | `ControlMessage`                | `action`, `tips`, `extra`, `punishInfo`                            |
| `roomUser`               | Viewer counts and the top viewers                     | `RoomUserMessage`               | `total` (watching now), `totalUser` (so far), `ranks`              |
| `perception`             | A violation notice to the host                        | `PerceptionMessage`             | `dialog`, `punishInfo`                                             |
| `rankUpdate`             | The host's ranks changed                              | `RankUpdateMessage`             | `updates`, `opType`                                                |
| `rankText`               | A rank notice shown in the chat                       | `RankTextMessage`               | `content`, `scene`, `rankType`, `curUserId`                        |
| `gameRankNotify`         | A game rank notice                                    | `GameRankNotifyMessage`         | `msgType`, `notifyText`                                            |
| `pollMessage`            | A poll started, changed or ended                      | `PollMessage`                   | `pollId`, `startContent`, `updateVotesContent`, `endContent`       |
| `oecLiveShopping`        | A shopping event: a product pinned, the product count | `OecLiveShoppingMessage`        | `actionType`, `popProduct`, `productSnapShot`, `liveProductNumber` |
| `capsule`                | A capsule (a small prompt) TikTok shows               | `CapsuleMessage`                | `desc`, `type`, `scene`, `subScene`                                |
| `marqueeAnnouncement`    | A marquee announcement                                | `MarqueeAnnouncementMessage`    | `messageScene`                                                     |
| `speaker`                | A speaker message                                     | `SpeakerMessage`                | `common` only                                                      |
| `inRoomBanner`           | An in-room banner                                     | `InRoomBannerMessage`           | `common` only                                                      |
| `accessControl`          | An access control, such as a captcha                  | `AccessControlMessage`          | `captcha`                                                          |
| `accessRecall`           | Access was revoked or restored                        | `AccessRecallMessage`           | `status`, `duration`, `endTime`, `punishInfo`                      |
| `partnershipDropsUpdate` | A game partnership's drops changed                    | `PartnershipDropsUpdateMessage` | `changeMode`, `dropsId`, `taskId`, `eventId`                       |
| `partnershipGameOffline` | Partnership games went offline                        | `PartnershipGameOfflineMessage` | `offlineGameList`                                                  |
| `partnershipPunish`      | A partnership punishment                              | `PartnershipPunishMessage`      | `punishInfo`                                                       |
| `liveGameIntro`          | The LIVE's game intro                                 | `LiveGameIntroMessage`          | `content`, `hasRankInfo`                                           |

Numeric codes have named constants, so you needn't hard-code them: `MemberAction` (`UNKNOWN` 0, `JOINED` 1, `SUBSCRIBED` 3) for `member.actionId`, `EnvelopeBusinessType` (`UNKNOWN` 0, `SUPER_FAN_BOX` 19) for `envelopeInfo.businessType`, `ControlAction` (`UNKNOWN` 0, `PAUSED` 1, `UNPAUSED` 2, `STREAM_ENDED` 3, `STREAM_SUSPENDED` 4) for the control messages behind `streamEnd`, `BadgeSceneType` for a badge's `sceneType`, and one per enum field of the pending events (`PinAction`, `SubscribeType`, `BattleAction`, `PollKind`…), each documented on its field. The fields stay plain numbers: TikTok may send values the constants don't name.

```ts
import { MemberAction } from "@tokioapp/connector";

connection.on("member", (member) => {
  if (member.actionId === MemberAction.JOINED) {
    console.log(`${member.user?.nickname} joined`);
  }
});
```

LIVE payloads are plain objects you can `JSON.stringify`:

- 64-bit ids (`userId`, `msgId`, `roomId`, `giftId`, `groupId`, `createTime`) are decimal strings, counters are numbers. No `bigint`.
- Fields TikTok leaves out hold their defaults (`""`, `0`, `"0"`, `false`, `[]`). Nested objects it leaves out (`user`, `gift`, `common`) are `undefined`, hence the `?.`.
- `user` is a `User`: `userId`, `nickname` (the display name), `displayId` (the handle, without `@`), `avatarThumb.urlList` and `badgeList` (each badge with its `sceneType`), plus `followInfo`, `payGrade`, `fansClub`, `userAttr`, `subscribeInfo` and `fansClubInfo` when TikTok sends them. `userIdentity` says whether they follow, subscribe to or moderate the host.
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
| `connectTimeoutMs`    | `20000`             | How long the WebSocket may take to open and enter the room                                                                                                      |
| `requestTimeoutMs`    | `10000`             | How long each HTTP request, to TikTok or the signer, may take                                                                                                   |
| `dedupeSize`          | `2048`              | How many recent message ids to remember, to drop duplicates. `0` keeps none                                                                                     |
| `clientParams`        | none                | Query parameters to add to, or replace in, every request to TikTok and the WebSocket URL                                                                        |
| `headers`             | none                | Headers to add to, or replace in, every request to TikTok and the WebSocket                                                                                     |
| `fetch`               | global `fetch`      | The `fetch` for HTTP requests, to instrument or route them. The WebSocket doesn't use it                                                                        |
| `signal`              | none                | An `AbortSignal` that stops the connection for good (`disconnected` with reason `aborted`)                                                                      |
| `logger`              | `consoleLogger`     | `(level, message, data?) => void`. The default prints warnings and errors to the console ([Logging](#logging))                                                  |

The constructor throws a `RangeError` for a number out of range (times go up to 2147483647 ms, about 24.8 days, the longest a Node timer waits) and a `TypeError` for a `roomId` that isn't numeric. `DEFAULT_OPTIONS` holds the defaults.

`clientParams` and `headers` are the way around a TikTok change before a release fixes it: they override the defaults the library sends.

There is no proxy option yet. The `fetch` option can route the HTTP requests (through an undici `ProxyAgent`, say), but the WebSocket always connects directly.

### Logging

The library logs through the `logger` option: `(level, message, data?) => void`, where `level` is `debug`, `info`, `warn` or `error` and `data` holds details such as ids, counts and the `error`. The default, `consoleLogger`, prints warnings and errors to the console. `createConsoleLogger` prints from another level on, to the console or to one you give it:

```ts
import { Console } from "node:console";
import { createConsoleLogger, TikTokLiveConnection } from "@tokioapp/connector";

const connection = new TikTokLiveConnection("username", {
  // Connects, reconnects and stops too; "debug" adds every request and frame.
  logger: createConsoleLogger({ level: "info" }),
});

// Everything on stderr, stdout left alone:
const quiet = createConsoleLogger({
  level: "debug",
  console: new Console(process.stderr),
});
```

Or pass your own function to send entries to your app's logger.

## Reconnecting

Once connected, the connection reconnects by itself when the WebSocket closes or errors, when no frame arrives for `idleTimeoutMs`, or when a retryable signer failure interrupts a reconnect. A drop goes like this:

1. `disconnected`, with the reason and `willReconnect: true`.
2. `reconnecting`, with the attempt number and the wait.
3. `connected`, with `reconnected: true`, once back in the room.

It resumes from the last cursor, so the messages of the gap can still come through, and duplicates are dropped. With `d = min(maxDelayMs, baseDelayMs * factor ** (n - 1))`, the wait before attempt `n` is a random time from `d / 2` up to `d` ("equal jitter"), at least `minDelayMs`, and at least what a `RateLimitError` asks for: with the defaults, the first five attempts wait at least 1, 1, 2, 4 and 8 seconds. The count starts over after each successful reconnect.

Every attempt is a request to the signer. Without an API key, Euler Stream allows 5 a minute: the waits keep a reconnect from spending them all at once, and when its limit is hit anyway, the `RateLimitError` says how long to wait, and the next attempt waits that long.

A reconnect delivers the messages sent while the connection was away (the gap): once the new socket is in the room, it signs a second time, with the last cursor, to get them. That makes a reconnect cost two signs (an attempt whose socket fails costs one). With `resume: false` a reconnect signs once and only delivers the room's recent backlog: the rest of the gap is lost. Choose that when signs are scarce.

```ts
const connection = new TikTokLiveConnection("username", {
  reconnect: { maxAttempts: Infinity, maxDelayMs: 60_000 },
});

connection.on("reconnecting", ({ attempt, delayMs, reason }) => {
  console.log(`dropped (${reason}), attempt ${attempt} in ${delayMs} ms`);
});
```

| `reconnect`            | Default | What it does                                                                                                                  |
| ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `maxAttempts`          | `10`    | Attempts before giving up. `Infinity` never gives up, `0` never reconnects (like `reconnect: false`)                          |
| `baseDelayMs`          | `1000`  | The wait ceiling of the first attempt                                                                                         |
| `maxDelayMs`           | `30000` | The largest wait ceiling                                                                                                      |
| `minDelayMs`           | `1000`  | The shortest wait, whatever the jitter draws (at most `maxDelayMs`). Lower it only with a signer that has no tight rate limit |
| `factor`               | `2`     | How much the ceiling grows per attempt                                                                                        |
| `checkLiveBeforeRetry` | `true`  | Check that the room is still LIVE before each attempt. If it isn't, emit `streamEnd` and stop                                 |
| `resume`               | `true`  | Get the messages of the gap after a reconnect, at the cost of a second sign. `false` signs once and loses them                |

The connection stops for good, with `disconnected` and `willReconnect: false`, for these reasons:

| `reason`                     | When                                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`                       | You called `disconnect()`                                                                                                                                   |
| `streamEnd`                  | The LIVE ended or was suspended, or a reconnect's live check found it offline. `streamEnd` comes first                                                      |
| `giveUp`                     | The attempts ran out. `error` is a `ReconnectGiveUpError` whose `cause` is the last attempt's error                                                         |
| `aborted`                    | The `signal` option aborted                                                                                                                                 |
| `signError`                  | A reconnect attempt failed before the socket opened, in a way retrying can't fix: the signer (a rejected API key, say), the room lookup or the signed batch |
| `wsClose`, `wsError`, `idle` | The connection dropped, with `reconnect: false` or `maxAttempts: 0`                                                                                         |

The first `connect()` is never retried. It rejects, and you decide: an `OfflineError` means waiting for the user to go LIVE, a `RateLimitError` says how long to wait.

## Errors

Everything the library throws, rejects with or emits is a `ConnectorError`:

- `code`: what went wrong, as a stable string (`ERROR_CODES` lists them). Branch on it, not on `message`, which is for people.
- `retryable`: whether trying again later can help.
- `cause`: the underlying error, when there is one.

| Class                                 | `code`              | When                                                                          | Retryable          | Also has                                              |
| ------------------------------------- | ------------------- | ----------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------- |
| `InvalidUsernameError`                | `INVALID_USERNAME`  | The constructor got something that isn't a username                           | no                 |                                                       |
| `RoomNotFoundError`                   | `ROOM_NOT_FOUND`    | No lookup found the user's room: no such user, or TikTok blocked every lookup | no                 |                                                       |
| `OfflineError`                        | `OFFLINE`           | The user exists but isn't LIVE                                                | no                 | `roomId`                                              |
| `HttpError`                           | `HTTP`              | TikTok answered with an unexpected status or body                             | for 429 and 5xx    | `status`                                              |
| `SignError`                           | `SIGN_FAILED`       | The signer failed or couldn't be reached                                      | except 401 and 403 | `status`, `requestId`                                 |
| `RateLimitError` (a `SignError`)      | `RATE_LIMITED`      | The signer's rate limit                                                       | yes                | `retryAfterMs`                                        |
| `PremiumFeatureError` (a `SignError`) | `PREMIUM_REQUIRED`  | The signer needs a paid plan for this request                                 | no                 |                                                       |
| `TimeoutError`                        | `TIMEOUT`           | A request, the socket opening, or a silent stream took too long               | yes                | `phase`: `request`, `sign`, `connect`, `idle`         |
| `WebSocketError`                      | `WEBSOCKET`         | The socket failed to open, errored or closed                                  | yes                | `closeCode`, `status` (an HTTP answer to the upgrade) |
| `ProtocolError`                       | `PROTOCOL`          | TikTok or the signer sent data the library can't read                         | yes                |                                                       |
| `AbortError`                          | `ABORTED`           | The `signal` aborted, or `disconnect()` interrupted the call                  | no                 |                                                       |
| `ReconnectGiveUpError`                | `RECONNECT_GAVE_UP` | Every reconnect attempt failed                                                | no                 | `attempts`                                            |

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
import { RateLimitError, SignError, type Signer } from "@tokioapp/connector";

const signer: Signer = {
  async fetchConnect({ roomId, cursor }, { fetch, signal, userAgent }) {
    const url = new URL(`https://signer.example.com/rooms/${roomId}/connect`);
    url.searchParams.set("cursor", cursor);
    url.searchParams.set("user_agent", userAgent);
    // No try/catch needed: what fetch throws becomes the library's error.
    const response = await fetch(url, { signal });
    if (response.status === 429) {
      throw new RateLimitError("The signer is rate limited", {
        retryAfterMs: Number(response.headers.get("retry-after") ?? 60) * 1000,
      });
    }
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
- Make requests with the context's `fetch` and pass it the context's `signal`, so that `disconnect()` cancels them. Nothing else needs wrapping: the connection runs every call within `timeoutMs` (after that it fails with a `TimeoutError`, phase `sign`) and converts whatever a signer throws. `fetch`'s `AbortError` and `TimeoutError` become the library's `AbortError` and `TimeoutError`, and anything else (a network failure, a bug) a retryable `SignError` with the original as `cause`. To also cancel a request on timeout, pass `AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])`.
- Throw the library's errors for the service's own answers: `RateLimitError` (with `retryAfterMs`, the connection waits at least that long), `PremiumFeatureError`, or `SignError` with the `status` (`retryable` is `false` for 401 and 403, and a 4xx makes the connection look the room id up again before its next attempt).
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

A source that fails or returns no gift hands over to the next, and without a room id only `region` runs. It rejects with a `ConnectorError` with code `GIFTS_UNAVAILABLE` only when every source failed (each source's error is in its `cause`), and with an `AbortError` when the `signal` option aborts. `disconnect()` doesn't stop it.

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

To see the library in action, clone the repository and watch a LIVE from the terminal:

```sh
yarn example <username> [seconds]
```

It is [`examples/live.ts`](examples/live.ts): a listener per event, printed as one line each. Set `EULER_API_KEY` to sign with your own key.

Two more scripts in this repository (not in the package) check the library against real LIVEs. Both need the network and a user who is LIVE now, and take an Euler Stream API key from `EULER_API_KEY` (or `--api-key`). `--help` lists every flag.

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
