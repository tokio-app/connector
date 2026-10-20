// The gift group's tail: messages with a few scalars each (gift prompts, the
// gift panel, gift restrictions, guides, boost cards). Field numbers:
// PROTOCOL.md, "Field numbers", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  BoostCard,
  BoostCardMessage,
  GiftDynamicRestrictionMessage,
  GiftPanelUpdateMessage,
  GiftPromptMessage,
  GuideMessage,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `WebcastGiftPromptMessage` [proto: webcast/model/message/messages.proto, line 1306]. */
export const GiftPromptMessageSchema = defineSchema<GiftPromptMessage>(
  "WebcastGiftPromptMessage",
  {
    common: f.message(1, CommonSchema),
    title: f.string(2),
    body: f.string(3),
    blockNumDays: f.int32(4),
    orderId: f.string(5),
  },
);

/** `WebcastGiftPanelUpdateMessage` [proto: webcast/model/message/messages.proto, line 1295]. */
export const GiftPanelUpdateMessageSchema =
  defineSchema<GiftPanelUpdateMessage>("WebcastGiftPanelUpdateMessage", {
    common: f.message(1, CommonSchema),
    roomId: f.id(2),
    timestamp: f.id(3),
  });

/**
 * `WebcastGiftDynamicRestrictionMessage` [proto:
 * webcast/model/message/messages.proto, line 1225]: only `common` is read.
 */
export const GiftDynamicRestrictionMessageSchema =
  defineSchema<GiftDynamicRestrictionMessage>(
    "WebcastGiftDynamicRestrictionMessage",
    { common: f.message(1, CommonSchema) },
  );

/** `WebcastGuideMessage` [proto: webcast/model/message/messages.proto, line 1318]. */
export const GuideMessageSchema = defineSchema<GuideMessage>(
  "WebcastGuideMessage",
  {
    common: f.message(1, CommonSchema),
    guideType: f.count(2),
    giftId: f.id(3),
    description: f.string(4),
    scene: f.string(7),
  },
);

/** `BoostCard` [proto: webcast/model/message/messages.proto, line 167]: `cardId` is the proto's `m_card_id`. */
const BoostCardSchema = defineSchema<BoostCard>("BoostCard", {
  cardId: f.id(1),
  taskSource: f.int32(2),
  taskId: f.id(3),
});

/** `WebcastBoostCardMessage` [proto: webcast/model/message/messages.proto, line 1099]. */
export const BoostCardMessageSchema = defineSchema<BoostCardMessage>(
  "WebcastBoostCardMessage",
  {
    common: f.message(1, CommonSchema),
    cards: f.repeated.message(3, BoostCardSchema),
  },
);
