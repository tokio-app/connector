// The tables of the gift group (gifts, money, membership), by protobuf
// message name. A new table gets a line here, and its route in
// src/routes/gift.ts.
import { BarrageMessageSchema } from "./barrage.js";
import { EnvelopeMessageSchema } from "./envelope.js";
import { GiftMessageSchema } from "./gift.js";
import { MemberMessageSchema } from "./member.js";

/** The gift group's top-level messages, keyed like a batch's `method`. */
export const giftSchemas = Object.freeze({
  WebcastGiftMessage: GiftMessageSchema,
  WebcastMemberMessage: MemberMessageSchema,
  WebcastEnvelopeMessage: EnvelopeMessageSchema,
  WebcastBarrageMessage: BarrageMessageSchema,
});
