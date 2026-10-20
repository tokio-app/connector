// Hourly rank rewards (WebcastHourlyRankRewardMessage). Field numbers:
// PROTOCOL.md, "Field numbers", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  HourlyRankRewardInfo,
  HourlyRankRewardMessage,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";
import { RoomNotifyMessageSchema } from "./roomNotify.js";

/** `HourlyRankRewardInfo` [proto: webcast/model/message/messages.proto, line 480]. */
const HourlyRankRewardInfoSchema = defineSchema<HourlyRankRewardInfo>(
  "HourlyRankRewardInfo",
  {
    userId: f.id(1),
    assetId: f.id(2),
    notify: f.message(3, RoomNotifyMessageSchema),
  },
);

/** `WebcastHourlyRankRewardMessage` [proto: webcast/model/message/messages.proto, line 1329]. */
export const HourlyRankRewardMessageSchema =
  defineSchema<HourlyRankRewardMessage>("WebcastHourlyRankRewardMessage", {
    common: f.message(1, CommonSchema),
    winners: f.repeated.message(2, HourlyRankRewardInfoSchema),
  });
