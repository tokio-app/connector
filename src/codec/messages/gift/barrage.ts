// Banners (WebcastBarrageMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  BarrageGradeParam,
  BarrageMessage,
  BarrageSubscribeGiftParam,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, TextSchema, UserSchema } from "../common.js";

/** `BarrageTypeUserGradeParam` [proto: webcast/model/message/messages.proto, line 140]. */
const UserGradeParamSchema = defineSchema<BarrageGradeParam>(
  "BarrageTypeUserGradeParam",
  {
    currentGrade: f.int32(1),
    user: f.message(4, UserSchema),
  },
);

/** `BarrageTypeFansLevelParam` [proto: webcast/model/message/messages.proto, line 122]: the same shape. */
const FansLevelParamSchema = defineSchema<BarrageGradeParam>(
  "BarrageTypeFansLevelParam",
  {
    currentGrade: f.int32(1),
    user: f.message(4, UserSchema),
  },
);

/** `BarrageTypeSubscribeGiftParam` [proto: webcast/model/message/messages.proto, line 133]. */
const SubscribeGiftParamSchema = defineSchema<BarrageSubscribeGiftParam>(
  "BarrageTypeSubscribeGiftParam",
  {
    giftSubCount: f.count(1),
    giftSource: f.enum(3),
  },
);

/**
 * `WebcastBarrageMessage` [proto: webcast/model/message/messages.proto, line
 * 1059]: banners; super fan ones are told apart by their text keys.
 */
export const BarrageMessageSchema = defineSchema<BarrageMessage>(
  "WebcastBarrageMessage",
  {
    common: f.message(1, CommonSchema),
    msgType: f.enum(3),
    content: f.message(5, TextSchema),
    commonBarrageContent: f.message(24, TextSchema),
    user: f.message(50, UserSchema),
    userGradeParam: f.message(100, UserGradeParamSchema),
    fansLevelParam: f.message(101, FansLevelParamSchema),
    subscribeGiftParam: f.message(102, SubscribeGiftParamSchema),
  },
);
