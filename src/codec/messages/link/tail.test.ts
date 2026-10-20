import { describe, expect, it } from "vitest";
import type { MessageSchema } from "../../schema.js";
import { decodeMessage } from "../../decode.js";
import { LinkMicBattleItemCardSchema } from "./tail.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../../test/helpers/encoder.js";
import {
  sampleCommon,
  unknownFields,
} from "../../../../test/helpers/samples.js";

// Field numbers: WebcastLinkMicBattleItemCard in
// webcast/model/message/messages.proto. The bytes are written by hand, not from the schema, so a
// wrong number in the table fails here.

// The rows hold schemas of different messages: their values are checked as
// plain objects.
interface Row {
  schema: MessageSchema<object>;
  /** Hand-assembled bytes of every field but `common`. */
  hex: string[];
  /** What they decode to; the encoder writes them back the same. */
  expected: object;
  /** The same message with fields the table doesn't read. */
  neighbours: Uint8Array;
  /** The defaults of an empty message. */
  defaults: object;
}

const rows: Row[] = [
  {
    schema: LinkMicBattleItemCardSchema,
    hex: [
      "10 01", // battle_id (2): 1
      "18 02", // msg_type (3): 2, a critical strike card
      "80 01 03", // award_reason (16): 3
    ],
    expected: { battleId: "1", msgType: 2, awardReason: 3 },
    neighbours: concat(
      fields.varint(2, 1),
      fields.varint(3, 2),
      fields.message(4, fields.varint(1, 1)), // card_obtain_guide, not read
      fields.message(5, fields.varint(1, 1)), // use_critical_strike_card, not read
      fields.varint(16, 3),
    ),
    defaults: { battleId: "0", msgType: 0, awardReason: 0 },
  },
];

describe.each(rows)(
  "$schema.name",
  ({ schema, hex, expected, neighbours, defaults }) => {
    const decode = (bytes: Uint8Array) => decodeMessage(schema, bytes);

    it("reads hand-assembled bytes, which the encoder writes the same", () => {
      const bytes = fromHex(hex.join(" "));
      expect(decode(bytes)).toStrictEqual(expected);
      expect(toHex(encodeMessage(schema, expected))).toBe(toHex(bytes));
    });

    it("reads its fields next to fields it doesn't read", () => {
      expect(decode(neighbours)).toStrictEqual(expected);
    });

    it("leaves out what the message leaves out", () => {
      expect(decode(new Uint8Array(0))).toStrictEqual(defaults);
    });

    it("round-trips common (1) and every field through the encoder", () => {
      const value = { common: sampleCommon(schema.name), ...expected };
      expect(decode(encodeMessage(schema, value))).toStrictEqual(value);
    });

    it("skips fields it doesn't read, of every wire type, at every level", () => {
      const bytes = concat(
        unknownFields(),
        fields.message(1, unknownFields(), fields.varint(6, 1)),
        fromHex(hex.join(" ")),
        unknownFields(1_000),
      );
      expect(decode(bytes)).toStrictEqual({
        common: {
          method: "",
          msgId: "0",
          roomId: "0",
          createTime: "0",
          isShowMsg: true,
        },
        ...expected,
      });
    });
  },
);
