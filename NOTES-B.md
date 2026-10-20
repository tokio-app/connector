# Notes from track B (gift), for the integrator

Delete this file in Phase 2, with `NOTES-PHASE0.md`. Track B decoded the 16 message types of the gift group (19 events) on `events/gift`; what it couldn't change itself, because the files are frozen or shared, is below.

## Frozen files that need a change

### `scripts/smoke/summary.test.ts` fails to typecheck

`yarn test` passes, but `yarn typecheck` reports 5 errors there: its literals predate the fields `GiftMessage`, `MemberMessage`, `EnvelopeInfo` and `BarrageMessage` gained. Apply this diff (checked: typecheck clean, the file's 24 tests pass). Track A's `social` fields may touch the same test (the `social` literal a few lines above).

```diff
@@ -43,6 +43,9 @@ function gift(overrides: Partial<GiftMessage> = {}): GiftMessage {
       describe: "",
       combo: false,
     },
+    isFirstSent: false,
+    toMemberId: "",
+    toMemberNickname: "",
     ...overrides,
   };
 }
@@ -137,25 +140,54 @@ describe("SmokeRecorder", () => {
       labeled("first share", "Flo shared"),
     );
     expect(
-      recorder.record("member", { user: user("Gus"), actionId: 1 }, 7),
+      recorder.record(
+        "member",
+        {
+          user: user("Gus"),
+          memberCount: 0,
+          isSetToAdmin: false,
+          isTopUser: false,
+          topUserNo: 0,
+          actionId: 1,
+          userShareType: "",
+          kickSource: 0,
+        },
+        7,
+      ),
     ).toBe(labeled("first member", "Gus joined"));
     expect(recorder.record("roomUser", roomUser(1_500), 8)).toBe(
       labeled("first roomUser", "1,500 watching, 4,500 so far, top viewer Cy"),
     );
     expect(
-      recorder.record("envelope", { envelopeInfo: { businessType: 1 } }, 9),
+      recorder.record(
+        "envelope",
+        {
+          envelopeInfo: {
+            envelopeId: "1",
+            businessType: 1,
+            sendUserName: "",
+            diamondCount: 0,
+            peopleCount: 0,
+            unpackAt: 0,
+            sendUserId: "",
+            superFanCount: 0,
+          },
+        },
+        9,
+      ),
     ).toBe(labeled("first envelope", "treasure chest, business type 1"));
     expect(
       recorder.record(
         "superFan",
         {
           user: user("Hal"),
+          msgType: 0,
           content: { key: "ttlive_superfan_x", defaultPattern: "" },
         },
         10,
       ),
     ).toBe(labeled("first superFan", "Hal (ttlive_superfan_x)"));
-    expect(recorder.record("superFanJoin", {}, 11)).toBe(
+    expect(recorder.record("superFanJoin", { msgType: 0 }, 11)).toBe(
       labeled("first superFanJoin", "(no nickname) (no key)"),
     );
     expect(recorder.record("superFanBox", {}, 12)).toBe(
```

No other frozen test breaks: `src/gifts.test.ts`, `src/connection.integration.test.ts`, `src/dispatch.test.ts`, `src/index.test.ts`, `src/routes/{index,groups}.test.ts` and `src/codec/index.test.ts` pass and typecheck unchanged.

### Shared text in `PROTOCOL.md`, `README.md` and `AGENTS.md`

- `PROTOCOL.md`, "Routing", first paragraph: "The base events `social`, `barrage` and `controlMessage` are declared but not emitted yet" is no longer true of `barrage`; drop the sentence once A and D are merged. The paragraph's base-before-derived rule has one exception in the gift group, kept from 0.1.0 as the plan asked: `superFanBox` comes before `envelope` (the gift Routing table says so). Worth a clause there.
- `PROTOCOL.md`, "LIVE messages", and `README.md`, "Events": the sentences about _pending_ messages and events go once every group is merged.
- `AGENTS.md`, Layout: `gift/ (gift, member, envelope, barrage)` is now `gift/ (gift, member, envelope, barrage, subNotify, subPinEvent, giftBroadcast, roomNotify, goalUpdate, viewerPicks, hourlyRank, tail)`.

## Payload types, against the plan

Corrections and additions in `src/events/gift.ts`, each checked against the `.proto` (file and line in `PROTOCOL.md`):

- `SubNotifyMessage.exhibitionType` (3, `ExhibitionType`) added: it attaches the constant Phase 0 left without a field.
- `SubGoalPinCard.desc?: SubPinCardText` (3) and `HourlyRankRewardInfo.notify?: RoomNotifyMessage` (3) added, as Phase 0 noted.
- `BarrageGradeParam` (`currentGrade` 1 int32, `user?` 4) types both `userGradeParam` (`BarrageTypeUserGradeParam`) and `fansLevelParam` (`BarrageTypeFansLevelParam`), which share those fields; `BarrageSubscribeGiftParam` is `giftSubCount` (1, count) and `giftSource` (3, enum, `SubGiftSource`).
- `EnvelopeInfo`: `envelopeId` (1) and `sendUserId` (8) are strings in the proto, `unpackAt` (7) an int32 (not an `id` timestamp), `diamondCount`, `peopleCount` and `superFanCount` int32s.
- `GiftMessage.toMemberId` (45) is a string in the proto; 46 holds the same id as an int64, not read.
- `MemberMessage.memberCount` (3) is an int32 in the proto (the plan said count).
- `SubPinCardText.type` is an enum (`SubPinCardText_TextType` / `SubPinCard_Text_TextType`, same values) with no exported constant: adding one would change the runtime export list `src/index.test.ts` pins. Its JSDoc and `PROTOCOL.md` give the values (1 the text, 2 a translation key). A later `feat` can add a `PinCardTextType` constant together with that test.
- `PayStatus` stays without a field: it describes `SubscribeInfo.status` (11), in the frozen `shared.ts`.
- The tail payloads are Phase 0's: `GiftPromptMessage` (title, body, blockNumDays, orderId), `GiftPanelUpdateMessage` (roomId, timestamp), `GiftDynamicRestrictionMessage` (common only), `GuideMessage` (guideType, giftId, description, scene), `BoostCardMessage` (cards: cardId, taskSource, taskId).

## Behavior changes apps will see

- `barrage` fires for every `WebcastBarrageMessage`, before `superFanJoin`/`superFan`, so a banner is decoded whenever `barrage` has a listener. `superFan`/`superFanJoin` listeners get what they got in 0.1.0.
- `gift`, `member`, `envelope`/`superFanBox` and `superFan`/`superFanJoin` payloads gain fields (none renamed or removed): a minor bump, as planned.
- The `notify` inside `giftBroadcast` and inside `hourlyRank` winners is not emitted again as a `roomNotify`.

## Checks on the branch

`yarn test:coverage`: `src/codec/messages/gift/` 100% lines and branches, `src/routes/gift.ts` 17/17 lines and 14/14 branches. `npx fallow dead-code`: no issues. `npx fallow health`: the 8 functions above threshold are in files outside the track (`scripts/smoke/summary.ts`, `scripts/capture/fixture.ts`, `scripts/reference/index.ts`, `examples/live.ts`); it suggests splitting `scripts/smoke/describe/gift.ts` (99 lines) as a refactoring target, not a finding.
