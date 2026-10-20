// Battles between hosts (WebcastLinkMicBattle). Field numbers: PROTOCOL.md,
// "LIVE messages", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  BattleBaseUserInfo,
  BattleResultEntry,
  BattleTeamResult,
  BattleTeamUser,
  BattleUserInfo,
  BattleUserInfoEntry,
  BattleUserResult,
  LinkMicBattle,
  TeamUsersInfo,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, ImageSchema } from "../common.js";
import { BattleArmiesEntrySchema, BattleSettingSchema } from "./shared.js";

/** `webcast.model.message.battle.BattleResult` [proto: webcast/model/message/battle.proto, line 18]. */
const BattleUserResultSchema = defineSchema<BattleUserResult>("BattleResult", {
  userId: f.id(1),
  result: f.enum(2),
  score: f.count(3),
  diamondScore: f.count(4),
});

/** One entry of `battle_result` (5), a `map<int64, BattleResult>`. */
const BattleResultEntrySchema = defineSchema<BattleResultEntry>(
  "BattleResultEntry",
  {
    key: f.id(1),
    value: f.message(2, BattleUserResultSchema),
  },
);

/** `webcast.model.live.match.BattleBaseUserInfo` [proto: webcast/model/live_match.proto, line 32]. */
const BattleBaseUserInfoSchema = defineSchema<BattleBaseUserInfo>(
  "BattleBaseUserInfo",
  {
    userId: f.id(1),
    nickName: f.string(2),
    avatarThumb: f.message(3, ImageSchema),
    displayId: f.string(4),
    roomId: f.id(5),
  },
);

/** `webcast.model.live.match.BattleUserInfo` [proto: webcast/model/live_match.proto, line 121]. */
const BattleUserInfoSchema = defineSchema<BattleUserInfo>("BattleUserInfo", {
  user: f.message(1, BattleBaseUserInfoSchema),
});

/** `webcast.model.message.battle.BattleUserInfoWrapper` [proto: webcast/model/message/battle.proto, line 95]. */
const BattleUserInfoEntrySchema = defineSchema<BattleUserInfoEntry>(
  "BattleUserInfoWrapper",
  {
    key: f.id(1),
    value: f.message(2, BattleUserInfoSchema),
  },
);

/** `webcast.model.message.TeamUsersInfo` [proto: webcast/model/message/messages.proto, line 856]. */
const TeamUsersInfoSchema = defineSchema<TeamUsersInfo>("TeamUsersInfo", {
  teamId: f.id(1),
  userId: f.repeated.id(2),
});

/** `webcast.model.live.match.BattleTeamUser` [proto: webcast/model/live_match.proto, line 114]. */
const BattleTeamUserSchema = defineSchema<BattleTeamUser>("BattleTeamUser", {
  userId: f.id(1),
  score: f.count(2),
});

/** `webcast.model.live.match.BattleTeamResult` [proto: webcast/model/live_match.proto, line 105]. */
const BattleTeamResultSchema = defineSchema<BattleTeamResult>(
  "BattleTeamResult",
  {
    teamId: f.id(1),
    teamUser: f.repeated.message(2, BattleTeamUserSchema),
    result: f.int32(3),
    totalScore: f.count(4),
  },
);

/** `WebcastLinkMicBattle` [proto: webcast/model/message/messages.proto, line 1423]. */
export const LinkMicBattleSchema = defineSchema<LinkMicBattle>(
  "WebcastLinkMicBattle",
  {
    common: f.message(1, CommonSchema),
    battleId: f.id(2),
    battleSettings: f.message(3, BattleSettingSchema),
    action: f.enum(4),
    battleResult: f.repeated.message(5, BattleResultEntrySchema),
    armies: f.repeated.message(9, BattleArmiesEntrySchema),
    anchorsInfo: f.repeated.message(10, BattleUserInfoEntrySchema),
    teamMember: f.repeated.message(14, TeamUsersInfoSchema),
    actionByUserId: f.id(16),
    teamBattleResult: f.repeated.message(17, BattleTeamResultSchema),
  },
);
