# Notes from track D (room), for the integrator

Changes the room track needs in files it doesn't own. None of them is made on `events/room`; fold them in Phase 2 and delete this file.

## Tests that use `WebcastPollMessage` as "a message without a route" (3 fail on this branch)

`WebcastPollMessage` now has a table and a route (`pollMessage`), so these frozen tests fail. After every track merges, no real message type is left without a route, so the stand-in must be a name no `.proto` defines. The failing three:

`src/codec/index.test.ts`

```diff
   it("returns undefined for messages the library doesn't decode", () => {
-    expect(getSchema("WebcastPollMessage")).toBe(undefined);
+    expect(getSchema("WebcastNoSuchMessage")).toBe(undefined);
```

`scripts/smoke/summary.test.ts` ("counts raw methods and flags the ones no event covers", around line 219; `WebcastLinkMicBattle` there is track C's and needs the same treatment once `link/` lands)

```diff
     for (const method of [
       "WebcastMemberMessage",
-      "WebcastPollMessage",
+      "WebcastNoSuchMessage",
       "WebcastMemberMessage",
-      "WebcastLinkMicBattle",
-      "WebcastPollMessage",
+      "WebcastOtherNoSuchMessage",
+      "WebcastNoSuchMessage",
       "WebcastMemberMessage",
     ]) {
...
     expect(Object.entries(summary.rawMethods)).toEqual([
       ["WebcastMemberMessage", 3],
-      ["WebcastPollMessage", 2],
-      ["WebcastLinkMicBattle", 1],
+      ["WebcastNoSuchMessage", 2],
+      ["WebcastOtherNoSuchMessage", 1],
     ]);
     expect(summary.unroutedMethods).toEqual([
-      "WebcastPollMessage",
-      "WebcastLinkMicBattle",
+      "WebcastNoSuchMessage",
+      "WebcastOtherNoSuchMessage",
     ]);
```

`scripts/smoke/summary.test.ts` ("shows the facts, the counts and the verdict", around line 605 and 624)

```diff
-    recorder.record("raw", raw("WebcastPollMessage"), 1);
+    recorder.record("raw", raw("WebcastNoSuchMessage"), 1);
...
-    expect(text).toContain("  WebcastPollMessage  1  no event");
+    expect(text).toContain("  WebcastNoSuchMessage  1  no event");
```

Two more use `WebcastPollMessage` the same way and still pass only because nobody listens to `pollMessage` in them; rename for the same reason, so their meaning ("no route") stays true:

- `src/dispatch.test.ts` line 131 (the `methods` list of "is all a message without a route leads to") and line 170 ("isn't built without a listener", which now passes for the wrong reason: the message has a route whose event has no listener).
- `src/connection.integration.test.ts` line 272–279 ("gives a raw listener the messages no event covers").

With those two test files fixed, `yarn test:coverage` passes its thresholds: the room folder, `src/routes/**` and `dispatch.ts` are at 100% lines and branches on this branch (checked with the two failing files excluded; `src/codec/index.ts` then shows 50% branches only because its own test was excluded).

## `PROTOCOL.md`, "Routing" intro (shared paragraph, not the room table)

The sentence "The base events `social`, `barrage` and `controlMessage` are declared but not emitted yet (pending, like the new message types)." is wrong for `controlMessage` after this merge. Each track will want to drop its own name; the integrator should end with:

```diff
-... a nested message (the comment inside a pin) is not emitted again as its own event. Routing never branches on enum values only traffic can confirm: text keys and business types only. The base events `social`, `barrage` and `controlMessage` are declared but not emitted yet (pending, like the new message types).
+... a nested message (the comment inside a pin) is not emitted again as its own event. Routing never branches on enum values only traffic can confirm: text keys and business types only.
```

## `README.md`, the constants paragraph under the events tables (shared)

"… and one per enum field of the pending events (`PinAction`, `SubscribeType`, `BattleAction`, `PollKind`…)" — `PollKind` is no longer pending; once every track lands, "of the pending events" should read "of the other events" (or the parenthesis list the room ones: `ProfitRankType`, `RankOpType`, `ClassType`, `RankTextScene`, `GameRankMsgType`, `PollKind`, `PollEndType`, `PerceptionIconType`, `PartnershipChangeMode`, `OfflineType`).

## `AGENTS.md`, Layout (shared)

`codec/messages/` lists `room/ (control, roomUser)`; it is now `room/ (control, roomUser, perception, rankUpdate, rankText, poll, oecLiveShopping, tail)`.

## Design note: `controlMessage` and the `always` route

The control route is decoded without a listener (`always`), so it emits `controlMessage` only when `context.listenerCount("controlMessage") > 0`; every other route emits unconditionally because dispatch only decodes them when one of their events has a listener. This keeps `dispatch.test.ts` "always decodes control messages, listener or not" (`emitted` equals `[]`) true as written. If the integrator prefers the unconditional emit for symmetry, that test's assertion becomes `expect(names(emitted)).toEqual(["controlMessage"])`, and `src/routes/room.ts` drops the `if`; the route tests in `src/routes/room.test.ts` ("is decoded without a listener, for the stream end, and then emits nothing") would change the same way.

## Phase 2's ordering integration test

`src/routes/room.test.ts` already checks, through `dispatch`, that `controlMessage` is emitted before `endStream` is called (the "ends the stream on action %i, after the controlMessage" cases record the order). The planned test in `connection.integration.test.ts` can listen to `["controlMessage", "streamEnd", "disconnected"]` and expect `events` in that order after `fake.push` of a control message with `fields.varint(2, ControlAction.STREAM_ENDED)`; the `controlMessage` payload is `{ action: 3, tips: "" }` (plus `common` when the fixture sets one).
