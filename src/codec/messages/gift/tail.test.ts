import { describe, expect, it } from "vitest";
import type {
  BoostCardMessage,
  GiftDynamicRestrictionMessage,
  GiftPanelUpdateMessage,
  GiftPromptMessage,
  GuideMessage,
} from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import type { MessageSchema } from "../../schema.js";
import {
  BoostCardMessageSchema,
  GiftDynamicRestrictionMessageSchema,
  GiftPanelUpdateMessageSchema,
  GiftPromptMessageSchema,
  GuideMessageSchema,
} from "./tail.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../../test/helpers/encoder.js";
import { unknownFields } from "../../../../test/helpers/samples.js";

// Field numbers: the tail messages in webcast/model/message/messages.proto.
// Each case holds hand-assembled bytes (written by hand, not from the schema,
// so a wrong number in the table fails here) with the fields the table reads
// and neighbours it doesn't, the value they decode to, what an empty message
// decodes to, and bytes with unknown fields of every wire type around a read
// one.

interface TailCase<T> {
  schema: MessageSchema<T>;
  /** Hand-assembled bytes with every read field set, which the encoder reproduces. */
  hex: string[];
  expected: T;
  /** Hand-assembled bytes with neighbours the table doesn't read, out of order. */
  neighbours: string[];
  afterNeighbours: T;
  defaults: T;
  unknown: Uint8Array;
  afterUnknown: T;
}

function tailCase<T>(value: TailCase<T>): TailCase<unknown> {
  return value;
}

const COMMON_HEX = "0a 05 0a 03 6b 65 79"; // common (1), 5 bytes: method (1): "key"
const COMMON = {
  method: "key",
  msgId: "0",
  roomId: "0",
  createTime: "0",
  isShowMsg: false,
};

const CASES = [
  tailCase<GiftPromptMessage>({
    schema: GiftPromptMessageSchema,
    hex: [
      COMMON_HEX,
      "12 02 68 69", // title (2): "hi"
      "1a 01 62", // body (3): "b"
      "20 07", // block_num_days (4): 7
      "2a 02 6f 31", // order_id (5): "o1"
    ],
    expected: {
      common: COMMON,
      title: "hi",
      body: "b",
      blockNumDays: 7,
      orderId: "o1",
    },
    neighbours: [
      "30 81 80 c8 b1 93 ae ee e0 5f", // order_timestamp (6), not read
      "20 ff ff ff ff ff ff ff ff ff 01", // block_num_days (4): -1
      "38 01", // in_user_gifting_addiction_expr (7), not read
      "12 01 54", // title (2): "T"
      "42 01 73", // pop_up_schema (8), not read
    ],
    afterNeighbours: { title: "T", body: "", blockNumDays: -1, orderId: "" },
    defaults: { title: "", body: "", blockNumDays: 0, orderId: "" },
    unknown: concat(
      unknownFields(),
      fields.string(3, "x"),
      unknownFields(1_000),
    ),
    afterUnknown: { title: "", body: "x", blockNumDays: 0, orderId: "" },
  }),
  tailCase<GiftPanelUpdateMessage>({
    schema: GiftPanelUpdateMessageSchema,
    hex: [
      COMMON_HEX,
      "10 07", // room_id (2): 7
      "18 fb 80 b3 c1 9c 33", // timestamp (3): 1760000000123
    ],
    expected: { common: COMMON, roomId: "7", timestamp: "1760000000123" },
    neighbours: [
      "52 02 08 01", // gallery_data (10), not read
      "18 01", // timestamp (3): 1
      "a2 06 01 73", // strategy_context (100), not read
      "10 81 80 90 cf b0 99 85 d9 66", // room_id (2): 7400000000000000001
    ],
    afterNeighbours: { roomId: "7400000000000000001", timestamp: "1" },
    defaults: { roomId: "0", timestamp: "0" },
    unknown: concat(unknownFields(), fields.varint(2, 5), unknownFields(1_000)),
    afterUnknown: { roomId: "5", timestamp: "0" },
  }),
  tailCase<GiftDynamicRestrictionMessage>({
    schema: GiftDynamicRestrictionMessageSchema,
    hex: [COMMON_HEX],
    expected: { common: COMMON },
    neighbours: [
      "12 02 08 01", // dynamic_restriction (2), not read
      "0a 02 30 01", // common (1), 2 bytes: is_show_msg (6): true
    ],
    afterNeighbours: { common: { ...COMMON, method: "", isShowMsg: true } },
    defaults: {},
    unknown: concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.string(1, "m")),
      unknownFields(1_000),
    ),
    afterUnknown: { common: { ...COMMON, method: "m" } },
  }),
  tailCase<GuideMessage>({
    schema: GuideMessageSchema,
    hex: [
      COMMON_HEX,
      "10 02", // guide_type (2): 2
      "18 97 2c", // gift_id (3): 5655
      "22 01 64", // description (4): "d"
      "3a 01 73", // scene (7): "s"
    ],
    expected: {
      common: COMMON,
      guideType: 2,
      giftId: "5655",
      description: "d",
      scene: "s",
    },
    neighbours: [
      "28 88 27", // duration (5), not read
      "3a 02 73 63", // scene (7): "sc"
      "30 01", // display_style (6), not read
      "18 81 80 90 cf b0 99 85 d9 66", // gift_id (3): 7400000000000000001
      "10 ff ff ff ff ff ff ff ff ff 01", // guide_type (2): -1
    ],
    afterNeighbours: {
      guideType: -1,
      giftId: "7400000000000000001",
      description: "",
      scene: "sc",
    },
    defaults: { guideType: 0, giftId: "0", description: "", scene: "" },
    unknown: concat(
      unknownFields(),
      fields.string(4, "x"),
      unknownFields(1_000),
    ),
    afterUnknown: { guideType: 0, giftId: "0", description: "x", scene: "" },
  }),
  tailCase<BoostCardMessage>({
    schema: BoostCardMessageSchema,
    hex: [
      COMMON_HEX,
      "1a 06", // cards (3), 6 bytes
      "08 07", //   m_card_id (1): 7
      "10 02", //   task_source (2): 2
      "18 09", //   task_id (3): 9
      "1a 02", // cards (3), 2 bytes
      "08 08", //   m_card_id (1): 8
    ],
    expected: {
      common: COMMON,
      cards: [
        { cardId: "7", taskSource: 2, taskId: "9" },
        { cardId: "8", taskSource: 0, taskId: "0" },
      ],
    },
    neighbours: [
      "12 01 78", // an unknown field (2), not read
      "1a 0e", // cards (3), 14 bytes
      "18 81 80 90 cf b0 99 85 d9 66", //   task_id (3): 7400000000000000001
      "20 01", //   an unknown field (4), not read
      "10 03", //   task_source (2): 3
    ],
    afterNeighbours: {
      cards: [{ cardId: "0", taskSource: 3, taskId: "7400000000000000001" }],
    },
    defaults: { cards: [] },
    unknown: concat(
      unknownFields(),
      fields.message(3, unknownFields(), fields.varint(1, 4)),
      unknownFields(1_000),
    ),
    afterUnknown: { cards: [{ cardId: "4", taskSource: 0, taskId: "0" }] },
  }),
];

describe.each(CASES.map((value) => ({ name: value.schema.name, ...value })))(
  "$name",
  ({
    schema,
    hex,
    expected,
    neighbours,
    afterNeighbours,
    defaults,
    unknown,
    afterUnknown,
  }) => {
    it("reads hand-assembled bytes, which the encoder writes the same", () => {
      const bytes = fromHex(hex.join(" "));
      expect(decodeMessage(schema, bytes)).toStrictEqual(expected);
      expect(toHex(encodeMessage(schema, expected as object))).toBe(
        toHex(bytes),
      );
    });

    it("reads fields out of order among neighbours it doesn't read", () => {
      expect(
        decodeMessage(schema, fromHex(neighbours.join(" "))),
      ).toStrictEqual(afterNeighbours);
    });

    it("leaves out what the message leaves out", () => {
      expect(decodeMessage(schema, new Uint8Array(0))).toStrictEqual(defaults);
    });

    it("skips fields it doesn't read, of every wire type, at every level", () => {
      expect(decodeMessage(schema, unknown)).toStrictEqual(afterUnknown);
    });
  },
);
