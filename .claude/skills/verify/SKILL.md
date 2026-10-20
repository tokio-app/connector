---
name: verify
description: "Run the checks a change needs before it's done: Prettier, lint, typecheck, tests and the build, plus the live smoke test when the network code changed. Use when finishing a change, before a commit, or when asked to verify or check the work."
---

# Verify a change

## Changed files

!`git status --short`

## Checks

Run them from the repository root, the narrow ones first:

1. Tests: `yarn test <path>` for what you touched, then `yarn test`. For the codec, `yarn test:coverage` too: it should stay fully covered.
2. `yarn typecheck` and `yarn lint`. Fix lint warnings in code you touched.
3. Prettier: `yarn format:check` (CI runs it), and `yarn format` or `npx prettier --write <files>` to fix it.
4. `yarn build`: it must emit `dist/index.js` and `dist/index.d.ts`. When the public API changed, read `dist/index.d.ts` to check it exports what it should.
5. When the changed files call for them:
   - `yarn smoke <user>` when files under `src/http/`, `src/signer/`, `src/ws/` or `src/connection.ts` changed: it connects to a real LIVE, so it needs the network and a user who is LIVE right now. Ask the user first, and for the username. `--drop-after 10` also checks the reconnect. Tests can't replace it: they never touch TikTok or Euler Stream.
   - `npx fallow dead-code` after moving, renaming or deleting code.
   - `git ls-files --eol | grep w/crlf` after a script wrote files: the repo uses LF.

## Traps

- "Vitest failed to find the runner" in every suite means the shell's working directory has a lowercase drive letter (`c:\`). Run from `C:\…`; it isn't a real failure.
- Socket tests use real timers. If one is flaky on Windows, raise its timeout or use `vi.waitFor`, don't add a sleep.

## Report

Say what ran and passed, show the output of what failed, and say what you skipped and why (`yarn smoke` included).
