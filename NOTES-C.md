# Notes from track C (link), for the integrator

Changes track C needs in files it must not edit. Delete this file in Phase 2.

## `scripts/smoke/summary.test.ts`: the "unrouted method" example is routed now

**What:** `SmokeRecorder > counts raw methods and flags the ones no event covers` (line 219) uses `WebcastLinkMicBattle` as a method no route covers, and expects it in `unroutedMethods`. Track C routes it, so the test fails on `events/link` (1 failure, `expected [ 'WebcastPollMessage' ] to deeply equal [ 'WebcastPollMessage', 'WebcastLinkMicBattle' ]`). `WebcastPollMessage` will fail the same way once track D lands.

**Why:** after Phase 1 every real message type has a route, so the test needs a method that will never have one.

**Proposed diff:**

```diff
     for (const method of [
       "WebcastMemberMessage",
-      "WebcastPollMessage",
+      "WebcastNoSuchMessage",
       "WebcastMemberMessage",
-      "WebcastLinkMicBattle",
-      "WebcastPollMessage",
+      "WebcastOtherUnknownMessage",
+      "WebcastNoSuchMessage",
       "WebcastMemberMessage",
     ]) {
       recorder.record("raw", raw(method), 1);
     }
     const summary = recorder.summarize(2, { interrupted: false });
     expect(Object.entries(summary.rawMethods)).toEqual([
       ["WebcastMemberMessage", 3],
-      ["WebcastPollMessage", 2],
-      ["WebcastLinkMicBattle", 1],
+      ["WebcastNoSuchMessage", 2],
+      ["WebcastOtherUnknownMessage", 1],
     ]);
     expect(summary.unroutedMethods).toEqual([
-      "WebcastPollMessage",
-      "WebcastLinkMicBattle",
+      "WebcastNoSuchMessage",
+      "WebcastOtherUnknownMessage",
     ]);
```

## `NOTES-PHASE0.md`, Group C: one more correction

Track C renamed `LinkUserState.player` to `LinkUserState.user` (the proto's name, `webcast.linkmic.common.LinkUserState.user` 1, a `Player`), to match `LinkLayerListUser.user`. Nothing outside `src/events/link.ts` used it. Fold this into the Phase 0 notes if they are kept until Phase 2.

## `PROTOCOL.md`, Open items: keeping the reserved numbers

Prettier renumbers an ordered list from its first item, so items written as `40.` right after item 19 come out as `20.`. Track C's items 40–45 are a list of their own, after a `**Link-mic and battles** (items 40–49):` line, which keeps their numbers. The room branch (`events/room`, `de5e94c`) appended its items to the main list, and Prettier turned its 50–56 into 20–26, while its own text still cites items 51 and 55. When merging, give each group's items the same lead-in line (and check the cross-references), or the groups' numbers collide.

`LinkerUserType` (`webcast.linkmic.common`, GUEST 1, HOST 2) is spelled out on `LinkLayerListUser.userType` but not exported as a constant: the runtime export list in `src/index.test.ts` is frozen. Add it there and in `src/events/link.ts` if the constant is wanted.
