// The nested messages the link group's tables share: a link participant
// (Player), a battle's settings, a host's supporters and a linked user.
// Field numbers: PROTOCOL.md, "LIVE messages", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  BattleArmiesEntry,
  BattleSetting,
  BattleUserArmies,
  BattleUserArmy,
  LinkUser,
  Player,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { ImageSchema, UserSchema } from "../common.js";

/** `webcast.model.message.linkcore.Player` [proto: webcast/model/message/linkcore_player.proto, line 5]. */
export const PlayerSchema = defineSchema<Player>("Player", {
  roomId: f.id(1),
  userId: f.id(2),
});

/** `webcast.model.message.battle.BattleSetting` [proto: webcast/model/message/battle.proto, line 35]. */
export const BattleSettingSchema = defineSchema<BattleSetting>(
  "BattleSetting",
  {
    battleId: f.id(1),
    startTimeMs: f.id(2),
    duration: f.int32(3),
    channelId: f.id(4),
    status: f.enum(5),
    battleType: f.enum(8),
    endTimeMs: f.id(10),
  },
);

/** `webcast.model.message.battle.BattleUserArmy` [proto: webcast/model/message/battle.proto, line 85]. */
const BattleUserArmySchema = defineSchema<BattleUserArmy>("BattleUserArmy", {
  userId: f.id(1),
  score: f.count(2),
  nickname: f.string(3),
  avatarThumb: f.message(4, ImageSchema),
  diamondScore: f.count(5),
});

/** `webcast.model.message.battle.BattleUserArmies` [proto: webcast/model/message/battle.proto, line 77]. */
const BattleUserArmiesSchema = defineSchema<BattleUserArmies>(
  "BattleUserArmies",
  {
    userArmies: f.repeated.message(1, BattleUserArmySchema),
    hostScore: f.count(2),
  },
);

/**
 * `webcast.model.message.battle.UserArmiesWrapper` [proto:
 * webcast/model/message/battle.proto, line 111]: a host's supporters keyed by
 * host. The entries of `WebcastLinkMicArmies.armies`, a `map<int64,
 * BattleUserArmies>`, have the same shape (key 1, value 2).
 */
export const BattleArmiesEntrySchema = defineSchema<BattleArmiesEntry>(
  "UserArmiesWrapper",
  {
    key: f.id(1),
    value: f.message(2, BattleUserArmiesSchema),
  },
);

/**
 * `webcast.model.message.linker.linked_list_change_message.ListUser` [proto:
 * webcast/model/message/linker/linked_list_change_message.proto, line 12]: a
 * linked user with the link's state.
 */
export const LinkUserSchema = defineSchema<LinkUser>("ListUser", {
  user: f.message(1, UserSchema),
  linkStatus: f.enum(4),
  linkType: f.enum(5),
  userPosition: f.int32(6),
  roleType: f.enum(10),
});
