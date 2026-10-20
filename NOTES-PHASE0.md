# Notes from Phase 0, for the tracks and the integrator

Delete this file in Phase 2. Everything below was found while declaring the payload types from the plan's tables against the `.proto` files in `reference/`; each track corrects its own `src/events/<group>.ts` as it writes the tables.

## What Phase 0 left to the tracks, and why

- **The "extend" rows weren't applied** (chat: `atUser?`, `msgFilter?`, `mentionUsers`; gift: `toUser?`, `isFirstSent`, `msgFilter?`, `userIdentity?`, `toMemberId`, `toMemberNickname`; member: `memberCount`, `operator?`, `isSetToAdmin`, `isTopUser`, `topUserNo`, `userShareType`, `kickSource`; social: `followCount`, `followType`, `targetUserId`; barrage: `msgType`, `userGradeParam?`, `fansLevelParam?`, `subscribeGiftParam?`; envelope: the `EnvelopeInfo` fields; control: `tips`, `extra?`, `punishInfo?`). `defineSchema` requires a field for every property, so adding them to an interface means adding them to the table and changing every decoded literal of the existing tests, which was a behavior change Phase 0 had to avoid. Each track adds them with its table changes. `EnvelopeBusinessType`'s other 13 values are track B's too (the existing test pins the two values).
- **Base events** `social`, `barrage` and `controlMessage` are in the map, the groups and `WebcastEvent`, but the routes don't emit them yet (the route files say so). Chat emits `social` before `follow`/`share`, gift `barrage` before `superFanJoin`/`superFan`, room `controlMessage` before `endStream`, and each group's `it.todo` becomes set equality over its `*_EVENTS` list.
- **Count:** `WebcastEventMap` has 73 keys: 4 connection events, 67 LIVE events (11 existing + 3 base + 53 new), `streamEnd` and `raw`. The plan's "66 LIVE" undercounted group A by one (19 events, not 17) and B (19, not 18); group D has 18 plus `streamEnd`. `streamEnd` sits in `ROOM_EVENTS` (it is a LIVE event for the smoke run's verdict), `CONNECTION_EVENTS` holds the four connection events.

## Where the plan's tables and the `.proto` disagree

Group A (chat)

- `WebcastQuestionNewMessage`: the proto calls field 2 `data`; the interface uses the plan's `details`. Rename to `data` if you prefer the proto's names.
- `WebcastLiveIntroMessage.audit_status` (3) is an `int32`, not `AuditStatus`; `AuditStatus` is `EmoteModel.audit_status` (3). `CommentTag` (`WebcastChatMessage.comment_tag` 20, repeated), `EmoteType` (`EmoteModel.emote_type` 5), `EmoteScene` and `AuditStatus` have no field in the plan's payloads: attach them (fields on `Emote`, `comment_tag` on chat) or drop the constants.

Group B (gift)

- `SubPinCard.title` (2) and `desc` (3) are `chatroom.api.Text` messages (`type` enum, `content` string), not strings: declared as `SubPinCardText`. `SubGoalPinCard.desc` (3) is a `SubPinCardText` too (not declared).
- `webcast.im.GiftSource` is exported as `SubGiftSource`: the package already exports the type `GiftSource` (`"room" | "signer" | "region"`, from `fetchGifts()`), and `export *` can't carry both.
- `PayStatus` (`User_SubscribeInfo_PayStatus`) describes `SubscribeInfo.status` (11), which the plan's `SubscribeInfo` doesn't read; `ExhibitionType` describes `WebcastSubNotifyMessage.exhibition_type` (3), not in the plan's payload. Attach or drop. `FansClubStatus` lives in `shared.ts` next to `FansClubData.status`, which it describes.
- `WebcastSubNotifyMessage.message_type` (7) is `webcast.im.MessageType`, exported as `SubNotifyMessageType`.
- `WebcastGoalUpdateMessage` is in `webcast/model/gift/model_webcast_goal_update_message.proto` (package `webcast.model.gift.model`); `LiveStreamGoal` and `LiveStreamSubGoal` in `webcast/model/gift/model.proto` (lines 97 and 141), `GoalStats` in `webcast/model/goal.proto` (line 25).
- `HourlyRankRewardInfo` (messages.proto line 480) also holds `notify` (3, a `WebcastRoomNotifyMessage`); the plan reads `user_id` (1) and `asset_id` (2) only.

Group C (link)

- `WebcastLinkMessage.reply_content.reply_status` (7) is an `int32`, not an enum. `LinkmicReplyType` is `WebcastLinkMicMethod.reply_type` (47).
- `WebcastLinkMessage.list_change_content` (20) holds `listchangemessage.LinkListUser` (user 1, modify_time 2, link_type 3 int32, role_type 4 int32, linkmic_id_str 5…), a different message from `linked_list_change_message.ListUser` (user 1, link_status 4 enum, link_type 5 enum, user_position 6, role_type 10 enum) that `enter_content` (9) and `linked_list_change_content` (13) hold. Declared as `LinkListUser` and `LinkUser`.
- `BattleSetting.duration` (3) is an `int32` (the plan said count). `BattleTeamResult.result` (3) is an `int32`, not `BattleResult_Result`.
- `WebcastLinkLayerMessage.business_content` (200) is `chatroom.model.multiguestv3.BusinessContent` (multi-live and cohost contents, several levels deep): skipped as the plan allowed.
- `webcast.model.data.LinkRoleType`'s `TYPE_APP_LIER` is exported as `APPLIER`; `BattleType` keeps the proto's `NORMAL_BATTLE`, `TEAM_BATTLE`, `INDIVIDUAL_BATTLE`; `LinkLayerMessageType.LINKER_P_2_P_GROUP_CHANGE` is `P_2_P_GROUP_CHANGE`.
- The map fields (`battle_result` 5, `armies` 3 of `WebcastLinkMicArmies`) are declared as `{ key, value? }` entry arrays (`BattleResultEntry`, `BattleArmiesEntry`), per the plan's conventions; `armies` (9) and `anchors_info` (10) of `WebcastLinkMicBattle` are repeated wrapper messages with the same shape.

Group D (room)

- `WebcastInRoomBannerMessage` holds only `common` (1) in the proto: no `string(2)` to try.
- `WebcastPollMessage.message_type` (2) is an `int64` (declared `count`, a number). `PerceptionIconType` describes `PerceptionDialogInfo.icon_type` (1), which the plan's `PerceptionDialog` doesn't read: attach or drop.
- `GameRankMsgType` has `UNKNOWN: 255` last (`MSG_TYPE_UN_KNOW = 255` in the proto), not `0`.
- `WebcastAccessRecallMessage` is in `webcast/model/game.proto` (package `webcast.model.game`), `WebcastOecLiveShoppingMessage` in `webcast/model/message/ext.proto` (`PopProduct`, `ProductSnapShot` there and in messages.proto line 694).

## Smoke describers

`scripts/smoke/describe/<group>.ts` holds the sample line of each event that has one; everything else gets `describeGeneric` (the nickname when the payload has a `user`, then `common.displayText.key` or `common.method`). A full-tier message gets a describer; a tail message can rely on the generic line.
