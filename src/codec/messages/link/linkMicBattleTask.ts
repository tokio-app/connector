// Battle tasks (WebcastLinkmicBattleTaskMessage). Field numbers:
// PROTOCOL.md, "LIVE messages", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  BattleTaskSettle,
  BattleTaskUpdate,
  LinkMicBattleTask,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `webcast.model.message.battle.BattleTaskUpdate` [proto: webcast/model/message/battle.proto, line 70]. */
const BattleTaskUpdateSchema = defineSchema<BattleTaskUpdate>(
  "BattleTaskUpdate",
  {
    progress: f.count(1),
    fromUserId: f.id(2),
  },
);

/** `webcast.model.message.battle.BattleTaskSettle` [proto: webcast/model/message/battle.proto, line 59]. */
const BattleTaskSettleSchema = defineSchema<BattleTaskSettle>(
  "BattleTaskSettle",
  { result: f.enum(1) },
);

/** `WebcastLinkmicBattleTaskMessage` [proto: webcast/model/message/messages.proto, line 1569]. */
export const LinkMicBattleTaskSchema = defineSchema<LinkMicBattleTask>(
  "WebcastLinkmicBattleTaskMessage",
  {
    common: f.message(1, CommonSchema),
    taskMessageType: f.enum(2),
    taskUpdate: f.message(4, BattleTaskUpdateSchema),
    taskSettle: f.message(5, BattleTaskSettleSchema),
    battleId: f.id(20),
  },
);
