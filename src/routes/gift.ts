// The routes of the gift group: gifts, money and membership. The rules are
// PROTOCOL.md's "Routing". A new message type gets its route here and its
// table in src/codec/messages/gift/.
//
// `barrage` is declared in WebcastEventMap and GIFT_EVENTS, but not emitted
// yet: emitting it before `superFanJoin`/`superFan` is Phase 1 work of this
// group.
import { BarrageMessageSchema } from "../codec/messages/gift/barrage.js";
import { EnvelopeMessageSchema } from "../codec/messages/gift/envelope.js";
import { GiftMessageSchema } from "../codec/messages/gift/gift.js";
import { MemberMessageSchema } from "../codec/messages/gift/member.js";
import {
  EnvelopeBusinessType,
  type BarrageMessage,
  type EnvelopeMessage,
} from "../events/index.js";
import { defineRoute, forward, type AnyRoute } from "./route.js";

// The text keys that mark super fan messages (from 2.4.0), matched lowercased.
// The join key also contains the super fan key, so it is checked first.
const SUPER_FAN_BOX_KEY = "ttlive_superfanbox";
const SUPER_FAN_JOINED_KEY = "ttlive_superfan_commentnotif_superfanjoined";
const SUPER_FAN_KEY = "ttlive_superfan";

/** Whether an envelope is a super fan box: by its text key or its business type. */
function isSuperFanBox(message: EnvelopeMessage): boolean {
  const key = message.common?.displayText?.key ?? "";
  return (
    key.toLowerCase().includes(SUPER_FAN_BOX_KEY) ||
    message.envelopeInfo?.businessType === EnvelopeBusinessType.SUPER_FAN_BOX
  );
}

/** The super fan event a banner is, if any, from its two text keys. */
function superFanEvent(
  message: BarrageMessage,
): "superFanJoin" | "superFan" | undefined {
  const keys = [message.content, message.commonBarrageContent].map(
    (text) => text?.key.toLowerCase() ?? "",
  );
  if (keys.some((key) => key.includes(SUPER_FAN_JOINED_KEY))) {
    return "superFanJoin";
  }
  if (keys.some((key) => key.includes(SUPER_FAN_KEY))) return "superFan";
  return undefined;
}

/** The gift group's routes, by message type (a batch message's `method`). */
export const giftRoutes: Readonly<Record<string, AnyRoute>> = Object.freeze({
  WebcastGiftMessage: forward("gift", GiftMessageSchema),
  WebcastMemberMessage: forward("member", MemberMessageSchema),
  WebcastEnvelopeMessage: defineRoute({
    schema: EnvelopeMessageSchema,
    events: ["superFanBox", "envelope"],
    emit(message, context) {
      if (isSuperFanBox(message)) context.emit("superFanBox", message);
      context.emit("envelope", message);
    },
  }),
  WebcastBarrageMessage: defineRoute({
    schema: BarrageMessageSchema,
    events: ["superFanJoin", "superFan"],
    emit(message, context) {
      const event = superFanEvent(message);
      if (event !== undefined) context.emit(event, message);
    },
  }),
});
