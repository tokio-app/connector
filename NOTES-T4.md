# Notes from T4 (scripts and docs)

For the Phase 2 integrator. Nothing here changes a frozen file; each item says what, why, and how T4 worked around it.

## Needs a decision or a change outside T4's files

1. **`_terminateSocket()` is reached through a type guard.** `scripts/smoke/index.ts` checks `typeof Reflect.get(connection, "_terminateSocket") === "function"` and narrows to `TikTokLiveConnection & { _terminateSocket(): void }`: no cast, and it compiles both before and after T3 adds the method. If T3 named it differently, `--drop-after` fails with "TikTokLiveConnection has no \_terminateSocket() to drop the socket with". Check the name when merging.
2. **A capture records messages, not frames.** PROTOCOL.md's open item 4 says "The capture records every frame", but the public API only exposes `raw` (the messages inside `msg` frames). Other `payloadType`s, `needAck`, cursors and log ids never reach the scripts. To settle open item 4, the session could log each frame's `payloadType` at `debug` (no payload, no `internalExt`), which `yarn smoke -v` and `yarn capture -v` then show. Open item 3 (`x-set-tt-cookie`) needs the same: a redacted `debug` log in `EulerSigner` (cookie names only).
3. **The first connect's backlog isn't captured.** With `processInitialData: false` the initial batch never reaches `raw` (if T3 skips it before dispatch, as PROTOCOL.md says), so fixtures have no backlog. Passing `processInitialData: true` from `yarn capture` would record it, but `RawMessage` can't tell an initial-batch message from a live one (only `isHistory`). Decide whether capture should record it (a `--backlog` flag, say).
4. **`--anonymize` only drops the username.** Payloads are raw protobuf; anonymizing them means rewriting `User` fields (`nickname` 3, `displayId` 38, `userId` 1, `avatarThumb` 9) and chat `content`. Two ways: decode and re-encode with the tables (`test/helpers/encoder.ts`), which drops unknown fields, so replays would no longer exercise skipping; or patch the length-delimited fields in place, keeping everything else. Only methods with complete tables qualify. `scripts/capture/index.ts` and its usage text say "for now".
5. **AGENTS.md Layout** (not T4's section) should list `scripts/lib/`: `cli.ts` (flags, connection options, logger, clock, entry point) and `format.ts` (errors, tables, transition lines), shared by both scripts. It sits outside the paths T4 was given; no other track touches `scripts/`.

## Public API: what was awkward to document or use

6. **No level on the console logger.** `consoleLogger` prints warnings and errors only; `--verbose` needed a wrapper (`createLogger` in `scripts/lib/cli.ts`). A `createConsoleLogger({ level })` export would serve apps too.
7. **Signer errors from `fetch`.** The `Signer` contract asks for our `AbortError` and `TimeoutError` (phase `sign`), but a signer that calls `fetch(url, { signal })` gets a `DOMException` (`AbortError`, `TimeoutError`). The README's custom signer example does that. Either the connection normalizes what a signer throws (`DOMException` → `AbortError` / `TimeoutError`, any other non-`ConnectorError` → `SignError`), or every signer must wrap its calls. Normalizing would also let `SignContext.signal` include the timeout (`AbortSignal.any`), so signers needn't handle `timeoutMs` themselves.
8. **Numeric codes without constants.** `MemberMessage.actionId` (1 joined, 3 subscribed), `ControlMessage.action`, `EnvelopeInfo.businessType` (19 super fan box), `SocialMessage.shareType` / `action` are bare numbers; the README spells out the values. Exported constants (`MEMBER_ACTION.JOINED`…) would help Tokio and others.
9. **No proxy for the WebSocket.** The `fetch` option can route HTTP requests, but the socket has no agent option; tiktok-live-connector 2.4.0 had one. The README says the WebSocket doesn't use `fetch`.
10. **`RawMessage` has no `msgType`** although the batch decodes it; harmless, but captures can't record it.

## README statements to confirm once T2/T3 are merged

The README describes behavior from the contracts' JSDoc and PROTOCOL.md; these depend on how T2 and T3 implemented them:

- The stop reasons table: `signError` ends the connection only for a signer failure retrying can't fix; with `reconnect: false` a drop ends it with `wsClose`, `wsError` or `idle`.
- `disconnect()` during the first `connect()` makes it reject with `AbortError` (the smoke and capture scripts' Ctrl-C relies on it to report "interrupted before connecting").
- `error` fires for a failed reconnect attempt, and `disconnected.error` carries the failure.
- `fetchGifts()` runs only `region` without a room id, and its `GIFTS_UNAVAILABLE` error holds each source's error as `cause`.
- The comparison table leaves out installed size: add the packed size of 0.1.0 (`npm pack --dry-run`) if wanted.
- The "Pre-release" line goes when 0.1.0 is published.

## Smoke run limits worth knowing

- The reconnect check allows 30 s after the drop (`RECONNECT_BOUND_MS` in `scripts/smoke/summary.ts`). A healthy reconnect is a live check, a signed connect and a socket open; raise it if real runs need more.
- A LIVE event is any decoded LIVE event, `streamEnd` included; raw messages alone don't count (with every listener attached, they would mean routing is broken).
- An anonymous Euler Stream key allows few connects per minute; each smoke run with `--drop-after` uses two.
