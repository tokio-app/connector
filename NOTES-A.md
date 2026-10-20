# Notes from track A (chat), for the integrator

Changes the chat track needed outside its files. None was made; apply them when merging `events/chat`, then delete this file.

## 1. Frozen tests that hold `ChatMessage` and `SocialMessage` literals, or the old social routing

**What.** The plan's "extend" rows add required fields to two public payloads: `ChatMessage.mentionUsers: User[]` (28) and `SocialMessage.followCount` (6, count), `followType` (13, int32), `targetUserId` (14, id). `defineSchema` requires a field per property, so they can't be optional. And the plan's routing emits `social` for every social message, before `follow` or `share`. Four files the track doesn't own hold typed literals or strict decoded equality of these payloads, or the old routing, and break:

- `scripts/smoke/summary.test.ts`: `yarn typecheck` (`chat()` returns a `ChatMessage`; the `social` literal is passed as a `SocialMessage`).
- `scripts/smoke/describe/index.test.ts`: `yarn typecheck` (the `describeLive("chat", …)` literal).
- `test/helpers/encoder.test.ts`: `yarn test`, "encodeMessage > encodes nested and repeated messages" (`toEqual` on a decoded chat message, which now holds `mentionUsers: []`).
- `src/dispatch.test.ts`: `yarn test`, "dispatch > lazy decoding > decodes when any of the route's events has a listener" (a follow now emits `["social", "follow"]`, not `["follow"]`; the fake context records every emit, listened to or not).

With the four diffs below applied, every check passes in the track's worktree (`format:check`, `lint`, `typecheck`, `test:coverage`, `fallow health`, `fallow dead-code`). The branch's commits don't include them, so on `events/chat` alone `yarn typecheck` reports the two smoke test files and `yarn test` (and `yarn test:coverage`) the two tests above. The gift track's "extend" rows (`GiftMessage`, `MemberMessage`) will need the same kind of edit in `summary.test.ts` and `describe/index.test.ts`.

**Why not made.** The files are frozen for every track, and `summary.test.ts` is touched by more than one group.

**Diffs.**

`scripts/smoke/summary.test.ts`:

```diff
 function chat(content: string, nickname = "Ana"): ChatMessage {
-  return { user: user(nickname), content, contentLanguage: "", emotes: [] };
+  return {
+    user: user(nickname),
+    content,
+    contentLanguage: "",
+    emotes: [],
+    mentionUsers: [],
+  };
 }
```

```diff
-    const social = { shareType: 0, action: 1, shareTarget: "", shareCount: 0 };
+    const social = {
+      shareType: 0,
+      action: 1,
+      shareTarget: "",
+      followCount: 0,
+      shareCount: 0,
+      followType: 0,
+      targetUserId: "0",
+    };
```

`scripts/smoke/describe/index.test.ts`:

```diff
       describeLive("chat", {
         user: { userId: "1", nickname: "Ana", displayId: "", badgeList: [] },
         content: "hi",
         contentLanguage: "",
         emotes: [],
+        mentionUsers: [],
       }),
```

`src/dispatch.test.ts` (around line 81):

```diff
     it("decodes when any of the route's events has a listener", () => {
       const { context, emitted } = fakeContext({ listen: ["share"] });
       dispatch(context, social("pm_main_follow_message_viewer_2"));
-      expect(names(emitted)).toEqual(["follow"]);
+      expect(names(emitted)).toEqual(["social", "follow"]);
     });
```

`test/helpers/encoder.test.ts` (the chat round trip, around line 192):

```diff
       content: "hi",
       contentLanguage: "",
       emotes: [{ index: 0, emote: { emoteId: "e1" } }],
+      mentionUsers: [],
     });
```

## 2. `PROTOCOL.md`, the "Routing" intro

**What.** The paragraph above the four routing tables ends with "The base events `social`, `barrage` and `controlMessage` are declared but not emitted yet (pending, like the new message types)." The chat table now says `social` is emitted first, always; the sentence stays true for `barrage` and `controlMessage` until their tracks merge.

**Why not made.** The paragraph is shared by the four groups.

**Diff** (once every track is in):

```diff
-… text keys and business types only. The base events `social`, `barrage` and `controlMessage` are declared but not emitted yet (pending, like the new message types).
+… text keys and business types only.
```

## 3. `src/routes/chat.ts` header comment

Already done in the track: the "`social` … not emitted yet" note in the file header is gone. Nothing to do.

## 4. Constants without a field (for a later release, not Phase 2)

`EmoteType`, `EmoteScene` and `AuditStatus` describe fields of `EmoteModel` (`emote_type` 5, `emote_scene` 13, `audit_status` 3), and `CommentTag` describes `WebcastChatMessage.comment_tag` (20). None is decoded: `Emote` lives in `src/events/shared.ts` (frozen), and adding scalars to it changes the decoded shape of every emote (the chat tables' tests, `test/helpers/encoder.test.ts`). The track kept the constants as Phase 0 exported them (their JSDoc says "not decoded yet") and recorded the choice as Open item 26. If the integrator prefers to attach them in Phase 2: `Emote` gains `emoteType: number` (enum 5), `emoteScene: number` (enum 13), `auditStatus: number` (enum 3) in `shared.ts`; `EmoteSchema` in `src/codec/messages/chat/chat.ts` gains `f.enum(5)`, `f.enum(13)`, `f.enum(3)`; `ChatMessage` gains `commentTag: number[]` with `f.repeated.enum(20)`; and every `Emote` literal in `chat.test.ts`, `emote.test.ts`, `roomPin.test.ts`, `routes/chat.test.ts`, `encoder.test.ts` and `describe/chat.test.ts` gets the three zeros.
