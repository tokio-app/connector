# AGENTS.md

## Project

`@tokioapp/connector` is a Node library that connects to a TikTok LIVE and emits its events (chat, gifts, likes, follows, shares, members, viewer counts, envelopes, super fans, stream end) with reconnects, typed events and errors, and lazy decoding. It is written from scratch, MIT-licensed, ESM only, and has one runtime dependency, `ws`. Published to npm as `@tokioapp/connector`; repository `tokio-app/connector`.

It will replace `tiktok-live-connector` (AGPL since 2.4.1) in Tokio, the Electron app at `../tokio`, once it has been proven against real LIVEs. That swap is a separate change in the Tokio repo, not here.

Stack: Node >= 24, TypeScript 7, `ws`, Vitest (on Vite 7), Yarn 1. No Zod or protobuf runtime: the wire codec is hand-written.

## Commands

```sh
yarn build             # tsc -p tsconfig.build.json: dist/ (JS and .d.ts, no maps)
yarn clean             # delete dist/ and coverage/
yarn test              # vitest run (yarn test:watch to watch)
yarn test:coverage     # vitest with a coverage report in coverage/ (text + lcov)
yarn typecheck         # tsc --noEmit over src/, test/, scripts/ and vitest.config.ts
yarn lint              # oxlint --type-aware
yarn format            # prettier --write . (yarn format:check only checks)
yarn reference         # download the MIT reference copies into reference/ (needs network)
yarn smoke <user>      # connect to a real LIVE, print what happens, exit 0 when it works (opt-in, needs network)
yarn capture <user>    # record a LIVE's raw messages into a fixture (opt-in, needs network)
```

Verify changes with `yarn test`, `yarn typecheck`, `yarn lint` and `yarn format:check`, and `yarn build` when the public API changes. The `verify` skill says when `yarn smoke` is needed too.

`yarn smoke <user>` listens to every event and prints the transitions, the first of each LIVE event, every event's count and the raw methods (marking those no event covers). Flags: `--seconds N` (default 30, counted from the connect), `--drop-after N` (N seconds after connecting, terminates the socket through the connection's internal `_terminateSocket()` and expects `reconnecting`, then `connected { reconnected: true }`, within 30 s), `--gifts` (calls `fetchGifts()` and prints the source that answered), `--json` (the summary as JSON on stdout, progress on stderr). Exit status 0 when it connected, no `error` event came, a LIVE event arrived and the requested checks passed; 1 otherwise, with the reasons; 2 for a usage mistake.

`yarn capture <user>` writes the `raw` messages to a version 1 fixture (format and `parseFixture` in `scripts/capture/fixture.ts`): method, ids, flags and the payload in base64, never cookies, the session, the API key, `internalExt` or signer ids. Flags: `--seconds N` (default 60), `--out FILE` (default `captures/<user>-<time>.json`, gitignored), `--anonymize` (leaves out the username; the payloads are raw protobuf and keep viewers' names until anonymizing re-encodes them). Exit status 0 when it wrote the file.

Both take `--room-id ID`, `--api-key KEY` (default `$EULER_API_KEY`: the scripts read it, the library reads no environment variable), `--host URL`, `-v`/`--verbose` (the library's debug and info logs, on stderr) and `--help`. Ctrl-C disconnects and still reports (smoke) or writes what was captured (capture). What both share lives in `scripts/lib/`.

TypeScript 7's `tsc` emits the declarations. `@typescript/typescript6` stays installed as a fallback (`tsc6`) in case a TS 7 emit gap shows up; switch `build` to it only if `dist/index.d.ts` comes out wrong.

## Agent models

- **Planning:** Opus 5.5 at high effort. Be 90–95% confident in the plan before implementing or handing off; otherwise keep reading code or ask the user.
- **Implementation subagents:** Opus 5.5 at xhigh effort. Use max for cross-cutting or protocol-critical work: the wire codec, the WebSocket session and the connection's state machine, dispatch, the public API, and anything licensing-sensitive.

## Layout

```
src/
  index.ts            public exports (the only entry point)
  options.ts          ConnectOptions, ReconnectOptions and their defaults
  events.ts           WebcastEventMap and the event payload types
  errors.ts           ConnectorError and its subclasses
  emitter.ts          TypedEmitter
  logger.ts           the Logger type and the default console logger
  connection.ts       TikTokLiveConnection: connect, reconnect with backoff, disconnect
  dispatch.ts         routes decoded messages to events: dedupe, history, lazy decoding
  gifts.ts            gift helpers (isStreakable, isStreakEnd)
  http/               client.ts (fetch with timeouts and cookies), params.ts (client params and headers, in one place)
  room/               resolver.ts (username → room id, is-live check), gifts.ts (room → signer → region gift list)
  signer/             types.ts (the Signer interface), euler.ts (EulerSigner, the default),
                      call.ts (every signer call: its deadline, and what it throws turned into ConnectorErrors)
  ws/                 frames.ts (enter room, heartbeat, ack), session.ts (one socket's lifetime)
  codec/              reader.ts, writer.ts, schema.ts, decode.ts, index.ts (re-exports, SCHEMAS by message name): the protobuf wire codec
  codec/messages/     one table per message: common, frame, fetchResult, chat, gift, like, social, member, roomUser, control, envelope, barrage
  util/               backoff, random, gzip, cookies
test/
  setup.ts            runs before every test file
  helpers/            encoder.ts (builds fixture bytes from the schemas), samples.ts (sample LIVE message values, unknown fields),
                      fetchStub.ts (a stubbed fetch that records requests), fakeSigner.ts (a Signer without network),
                      fakeTikTok.ts (a local ws server standing in for TikTok's push server)
  fixtures/           recorded pages and captures, replayed by tests
scripts/              reference/, capture/, smoke/: each an index.ts run with tsx
  lib/                shared by capture and smoke: cli.ts (flags, connection options, logger, entry point), format.ts (errors, tables)
reference/            gitignored: the MIT reference copies `yarn reference` downloads (see Licensing)
```

`PROTOCOL.md` describes the protocol the code implements. `THIRD_PARTY_NOTICES.md` credits the references and lists the services. `tsconfig.json` covers `src/`, `test/`, `scripts/` and `vitest.config.ts` for the typecheck and type-aware lint; `tsconfig.build.json` extends it to emit `src/` only (it holds `rootDir`, and leaves out the tests). Generated, don't edit: `dist/`, `coverage/`, `reference/`. The package ships only `dist/`, `THIRD_PARTY_NOTICES.md`, `LICENSE`, `README.md` and `package.json` (`files` in `package.json`).

## Licensing

The library is MIT and must stay clean-room. Treat this as part of every change.

- **The clean-room rule.** The only reference is `reference/` (`tiktok-live-connector` 2.4.0 and `tiktok-live-proto` 0.2.3, both MIT, at the commits `yarn reference` pins). Never read `../tokio/node_modules/tiktok-live-connector` or `../tokio/node_modules/tiktok-live-proto`: they are the AGPL versions (2.4.3 / 0.2.4). The same goes for any later version or commit of those projects, on npm, on GitHub or in `reference/src/` (don't fetch or check out other commits there). No code is copied: read the references to understand the protocol, then write the code yourself. Message tables are written by hand with only the fields the library needs, not transcribed from the `.proto` files. The credit lives in `THIRD_PARTY_NOTICES.md`.
- Euler Stream's public docs (<https://www.eulerstream.com/docs>) are the source for `EulerSigner`.
- **Adding a runtime dependency needs the user's OK.** `ws` is the only one. Dev dependencies need a license check; copyleft (GPL, AGPL, LGPL, MPL, EUPL, CC BY-SA) needs the user's OK too. `vite` (Vitest's peer) stays on 7: Vite 8 depends on `lightningcss`, which is MPL-2.0. The `add-dependency` skill has the steps.
- Keep `THIRD_PARTY_NOTICES.md` in sync: the reference versions and commits, the runtime dependency, and the Services list when the library talks to a new service.

## Protocol

`PROTOCOL.md` is the spec: room id resolution, the is-live check, client params and headers, the signed connect request, the WebSocket URL and frames, heartbeat and ack, message routing, the gift list sources, and the field numbers of every decoded message. Each fact cites its source in `reference/` or Euler's docs, and its Open items list what still needs a capture or a smoke run. Change it together with the code, and check new facts against `reference/` or Euler's docs.

A message table (`src/codec/messages/`) is a `defineSchema<T>()` call keyed by the payload's properties: the compiler checks that every property has a field of the matching kind, and that optional properties are nested messages. Fields a table doesn't list are skipped when decoding.

TikTok changes things without notice. The `clientParams` and `headers` options override the defaults in `src/http/params.ts`, so an app can work around a change before a release (the hotfix path); keep every param and header in that one file so they stay overridable.

Public payloads are JSON-safe: 64-bit ids are decimal strings, 64-bit counters are numbers (checked as safe integers), and no `bigint` reaches the public API.

## Testing

- Vitest. Tests sit next to the code as `*.test.ts`; shared fakes live in `test/helpers`, recorded data in `test/fixtures`.
- Build protobuf bytes with `test/helpers/encoder.ts`: `encodeMessage(schema, value)` for fixtures, and `fields.*` (explicit field numbers, independent of the schemas) to check a table's field numbers against the `.proto`.
- Tests never touch the network, and neither does CI: use `FakeSigner`, the fake TikTok server (`ws` on `127.0.0.1:0`) and stubbed `fetch`. Keep real-timer tests short (50–200 ms values, `vi.waitFor`).
- `yarn smoke` and `yarn capture` are opt-in and need the network and a LIVE. Ask the user before running them. Fixtures from a capture come only from the user's own LIVE, anonymized (`--anonymize`) and kept small. Read one with `parseFixture` and replay its messages with `fromFixtureMessage` (`scripts/capture/fixture.ts`).
- The scripts' pure parts are tested next to them and run with `yarn test`: `scripts/lib/{cli,format}.test.ts` (flags, logger, error and table formatting), `scripts/smoke/{args,summary}.test.ts` (the event bookkeeping, the reconnect check and the verdict) and `scripts/capture/{args,fixture}.test.ts` (the fixture format and its validator). The `index.ts` files only wire them to a real connection; `summary.test.ts` fails to typecheck when `WebcastEventMap` gains an event the smoke run doesn't listen to.
- `restoreMocks` and `unstubGlobals` are on: mocks and stubbed globals reset after each test.
- The codec (`src/codec/`) is kept at 100% coverage (`yarn test:coverage`).

## CI and releases

- `ci.yml` (PRs and `main`): Prettier check (Linux), lint, typecheck, tests and build, on Linux and Windows with Node 24. Linux runs the tests with coverage and uploads `coverage/` as an artifact.
- `publish.yml` runs on a `v<version>` tag matching `package.json`: format, lint, typecheck and tests, then `npm publish` through npm trusted publishing (no token; `prepublishOnly` builds) and a GitHub release with generated notes. Versions with a `-` (`0.2.0-beta.1`) publish under the `next` dist-tag and as a GitHub prerelease. A rerun skips what's already published.
- The user sets up the GitHub repository and npm trusted publishing (package `@tokioapp/connector`, repository `tokio-app/connector`, workflow `publish.yml`). Never push without asking.

To release, use the `release` skill (`/release`).

## Conventions

- Run `yarn format` on files you touch, and fix lint warnings in code you touch. Files use LF line endings.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `feat!:`), enforced by a husky hook (commitlint), with lint-staged running oxlint and Prettier on staged files. Don't bypass hooks. No `Co-Authored-By` or "Generated with" lines in commits.
- ESM with `NodeNext` resolution: relative imports end in `.js`. Type-only imports use `import type` (`verbatimModuleSyntax`).
- Keep the public event names and payload fields stable; Tokio and other apps depend on them. A breaking change is a `feat!:` and a new minor (0.x) or major version.
- Fallible internals throw `ConnectorError` subclasses with a `code`; the connection decides whether to retry from `retryable`.
- `npx fallow health` (also `dead-code`, `dupes`) reports import cycles, dead code and duplication. It reads `.fallowrc.json`, where the scripts and `vitest.config.ts` are entry points and `@typescript/typescript6` (the build fallback) is ignored.

## Skills

Procedures live in `.claude/skills/<name>/SKILL.md`. Claude Code offers each one as `/<name>`.

**Other agents:** before doing one of these tasks, read its `SKILL.md`.

- `release`: publish a version to npm, only when the user asks
- `verify`: run the checks a change needs
- `add-dependency`: add, upgrade or remove a package, with the license checks

When a procedure changes, update its skill with it.
