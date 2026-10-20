// Viewer picks rounds (WebcastViewerPicksUpdateMessage). Field numbers:
// PROTOCOL.md, "Field numbers", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  GiftPick,
  GiftPickWithScore,
  ViewerPicksInfo,
  ViewerPicksUpdateMessage,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `webcast.model.viewer_picks.GiftPick` [proto: webcast/model/viewer_picks.proto, line 17]. */
const GiftPickSchema = defineSchema<GiftPick>("GiftPick", {
  giftId: f.id(1),
  customizedDesc: f.string(2),
  giftPrice: f.count(4),
});

/** `webcast.model.viewer_picks.GiftPickWithScore` [proto: webcast/model/viewer_picks.proto, line 60]. */
const GiftPickWithScoreSchema = defineSchema<GiftPickWithScore>(
  "GiftPickWithScore",
  {
    giftPick: f.message(1, GiftPickSchema),
    score: f.count(2),
  },
);

/** `webcast.model.viewer_picks.ViewerPicksInfo` [proto: webcast/model/viewer_picks.proto, line 131]. */
const ViewerPicksInfoSchema = defineSchema<ViewerPicksInfo>("ViewerPicksInfo", {
  viewerPicksId: f.id(1),
  giftPickList: f.repeated.message(2, GiftPickWithScoreSchema),
  status: f.int32(3),
});

/** `WebcastViewerPicksUpdateMessage` [proto: webcast/model/message/messages.proto, line 1923]. */
export const ViewerPicksUpdateMessageSchema =
  defineSchema<ViewerPicksUpdateMessage>("WebcastViewerPicksUpdateMessage", {
    common: f.message(1, CommonSchema),
    updateType: f.int32(2),
    info: f.message(3, ViewerPicksInfoSchema),
  });
