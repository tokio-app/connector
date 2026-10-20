// The host's ranks (WebcastRankUpdateMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  ClassInfo,
  RankUpdate,
  RankUpdateMessage,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, TextSchema } from "../common.js";

/** `webcast.model.rank.ClassInfo`. `class_type` (1) is a `webcast.model.data.ClassType`. */
const ClassInfoSchema = defineSchema<ClassInfo>("ClassInfo", {
  classType: f.enum(1),
  starCount: f.count(2),
});

/** `webcast.model.message.RankUpdate`: one rank. `rank_type` (1) is a `webcast.model.data.ProfitRankType`. */
const RankUpdateSchema = defineSchema<RankUpdate>("RankUpdate", {
  rankType: f.enum(1),
  ownRank: f.count(2),
  defaultContent: f.message(3, TextSchema),
  classInfo: f.message(14, ClassInfoSchema),
  currentScore: f.count(15),
});

/** `WebcastRankUpdateMessage`. `op_type` (4) is a `webcast.im.OpType`. */
export const RankUpdateMessageSchema = defineSchema<RankUpdateMessage>(
  "WebcastRankUpdateMessage",
  {
    common: f.message(1, CommonSchema),
    updates: f.repeated.message(2, RankUpdateSchema),
    opType: f.enum(4),
  },
);
