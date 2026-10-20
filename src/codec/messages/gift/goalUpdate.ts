// LIVE goals (WebcastGoalUpdateMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  GoalStats,
  GoalSubGoal,
  GoalSubGoalGift,
  GoalUpdateMessage,
  LiveStreamGoal,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `webcast.model.gift.model.LiveStreamSubGoalGift` [proto: webcast/model/gift/model.proto, line 154]. */
const SubGoalGiftSchema = defineSchema<GoalSubGoalGift>(
  "LiveStreamSubGoalGift",
  {
    name: f.string(1),
    diamondCount: f.count(3),
  },
);

/** `webcast.model.gift.model.LiveStreamSubGoal` [proto: webcast/model/gift/model.proto, line 141]. */
const SubGoalSchema = defineSchema<GoalSubGoal>("LiveStreamSubGoal", {
  progress: f.count(3),
  target: f.count(4),
  gift: f.message(5, SubGoalGiftSchema),
});

/** `webcast.model.goal.GoalStats` [proto: webcast/model/goal.proto, line 25]. */
const GoalStatsSchema = defineSchema<GoalStats>("GoalStats", {
  totalCoins: f.count(1),
  totalContributor: f.count(2),
});

/** `webcast.model.gift.model.LiveStreamGoal` [proto: webcast/model/gift/model.proto, line 97]. */
const LiveStreamGoalSchema = defineSchema<LiveStreamGoal>("LiveStreamGoal", {
  id: f.id(1),
  type: f.int32(2),
  status: f.int32(3),
  subGoals: f.repeated.message(4, SubGoalSchema),
  description: f.string(5),
  stats: f.message(15, GoalStatsSchema),
});

/**
 * `webcast.model.gift.model.WebcastGoalUpdateMessage` [proto:
 * webcast/model/gift/model_webcast_goal_update_message.proto, line 11].
 * `update_source` (16) is a `webcast.model.data.GoalMessageSource`.
 */
export const GoalUpdateMessageSchema = defineSchema<GoalUpdateMessage>(
  "WebcastGoalUpdateMessage",
  {
    common: f.message(1, CommonSchema),
    goal: f.message(3, LiveStreamGoalSchema),
    contributorId: f.id(4),
    contributorDisplayId: f.string(6),
    contributeCount: f.count(9),
    contributeScore: f.count(10),
    updateSource: f.enum(16),
  },
);
