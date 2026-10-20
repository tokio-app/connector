---
name: verify
description: "Run the checks a change needs before it's done: Prettier, lint, typecheck, tests and the build, plus the live smoke test when the network code changed. Use when finishing a change, before a commit, or when asked to verify or check the work."
---

# Verify a change

## Changed files

!`git status --short`

## Checks

Run them from the repository root, the narrow ones first:

1. Tests: `yarn test <path>` for what you touched, then `yarn test`. Then `yarn test:coverage`, which fails below the thresholds in `vitest.config.ts` (the codec stays at 100%).
2. `yarn typecheck` and `yarn lint`. Fix lint warnings in code you touched.
3. Prettier: `yarn format:check` (CI runs it), and `yarn format` or `npx prettier --write <files>` to fix it.
4. `yarn build`: it must emit `dist/index.js` and `dist/index.d.ts`. When the public API changed, read `dist/index.d.ts` to check it exports what it should.
5. When the changed files call for them:
   - `yarn smoke` when files under `src/http/`, `src/room/`, `src/signer/`, `src/ws/` or `src/connection.ts` changed. It connects to a real LIVE, so it needs the network and a user who is LIVE right now: ask the user first, and for the username. Tests can't replace it: they never touch TikTok or Euler Stream. Run:

     ```sh
     yarn smoke <user> --seconds 30 --drop-after 10 --gifts
     ```

     A good run prints `connecting to @<user>`, then `connected  room <id>, attempt 0, reconnected no`, a `first <event>` line as each kind of LIVE event first arrives (`roomUser`, `member`, `like` and `chat` on any busy LIVE), and `gifts  room: <n> gifts (<three names>)`. Ten seconds after connecting: `dropping the socket`, `disconnected  <reason>, will reconnect`, `reconnecting  attempt 1 in <ms> ms`, then `connected  room <id>, attempt 1, reconnected yes`. The summary ends with `PASSED`, exit status 0. Otherwise it ends with `FAILED` and the reasons, exit status 1. Also report the gift source (`signer` or `region` means the room list failed) and any raw method marked `no event` (a message type no event covers: not a failure, but worth a note). Each connect and reconnect is a request to Euler Stream, whose anonymous limits are low; the script uses `EULER_API_KEY` when it is set.

   - `npx fallow dead-code` after moving, renaming or deleting code.
   - `git ls-files --eol | grep w/crlf` after a script wrote files: the repo uses LF.

## Traps

- "Vitest failed to find the runner" in every suite means the shell's working directory has a lowercase drive letter (`c:\`). Run from `C:\…`; it isn't a real failure.
- Socket tests use real timers. If one is flaky on Windows, raise its timeout or use `vi.waitFor`, don't add a sleep.

## Report

Say what ran and passed, show the output of what failed, and say what you skipped and why (`yarn smoke` included).
