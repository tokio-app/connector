// Owned by T1 (Phase 1). Initial table from PROTOCOL.md; T1 checks every field
// number against reference/src/TikTok-Webcast-Protobuf and adds the tests.
import type { GiftDetails, GiftMessage } from "../../events.js";
import { defineSchema, f } from "../schema.js";
import { CommonSchema, ImageSchema, UserSchema } from "./common.js";

/** `webcast.model.Gift`: the gift a gift message is about. */
export const GiftDetailsSchema = defineSchema<GiftDetails>("Gift", {
  image: f.message(1, ImageSchema),
  id: f.id(5),
  type: f.int32(11),
  diamondCount: f.int32(12),
  name: f.string(16),
});

/** `WebcastGiftMessage`. `repeat_end` is an int32 on the wire, read as a bool. */
export const GiftMessageSchema = defineSchema<GiftMessage>(
  "WebcastGiftMessage",
  {
    common: f.message(1, CommonSchema),
    giftId: f.id(2),
    repeatCount: f.int32(5),
    comboCount: f.int32(6),
    user: f.message(7, UserSchema),
    repeatEnd: f.bool(9),
    groupId: f.id(11),
    gift: f.message(15, GiftDetailsSchema),
  },
);
