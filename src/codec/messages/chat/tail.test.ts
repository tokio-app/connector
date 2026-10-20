import { describe, expect, it } from "vitest";
import { BottomBizType, type Common } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import type { Decodable, MessageSchema } from "../../schema.js";
import {
  BottomMessageSchema,
  LiveIntroMessageSchema,
  MsgDetectMessageSchema,
  RoomVerifyMessageSchema,
  SystemMessageSchema,
  ToastMessageSchema,
  UnauthorizedMemberMessageSchema,
} from "./tail.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
  type EncodeInput,
} from "../../../../test/helpers/encoder.js";
import { unknownFields } from "../../../../test/helpers/samples.js";

// Field numbers: WebcastSystemMessage in webcast/synthetic_proto.proto, the
// rest in webcast/model/message/messages.proto; WebcastBottomMessage's
// biz_type (6) is a webcast.im.BizType (im.proto). The bytes are written field
// by field (fields.*) with the neighbours the tables don't read, not from the
// schema, so a wrong number in a table fails here.

/** One tail table: bytes with "not read" neighbours, what they decode to, and the defaults. */
interface Row {
  schema: Decodable<unknown>;
  bytes: Uint8Array;
  expected: { common?: Common };
  defaults: object;
  /** `expected` through the encoder, for the round trip. */
  encoded: Uint8Array;
}

// Typed per row, so a table that drifts from its payload type fails to
// compile; the rows then share a table with the payload type erased.
// `expected` is a whole payload, which the encoder takes too.
function row<T extends { common?: Common }>(
  schema: MessageSchema<T>,
  bytes: Uint8Array,
  expected: T & EncodeInput<T>,
  defaults: T,
): Row {
  return {
    schema,
    bytes,
    expected,
    defaults,
    encoded: encodeMessage(schema, expected),
  };
}

const common = (method: string) =>
  fields.message(1, fields.string(1, method), fields.varint(4, 1_000));

const decodedCommon = (method: string) => ({
  method,
  msgId: "0",
  roomId: "0",
  createTime: "1000",
  isShowMsg: false,
});

const rows: Row[] = [
  row(
    SystemMessageSchema,
    concat(
      common("WebcastSystemMessage"),
      fields.string(2, "Hello"),
      fields.string(3, "x"), // no such field in the proto, not read
    ),
    { common: decodedCommon("WebcastSystemMessage"), message: "Hello" },
    { message: "" },
  ),
  row(
    LiveIntroMessageSchema,
    concat(
      common("WebcastLiveIntroMessage"),
      fields.varint(2, 7), // id, not read
      fields.varint(3, 1), // audit_status, not read
      fields.string(4, "Welcome to my LIVE"),
      fields.message(
        5,
        fields.varint(1, 6_900_000_000_000_000_001n),
        fields.string(3, "Host"),
      ),
      fields.varint(6, 1), // intro_mode, not read
      fields.message(7, fields.varint(3, 1)), // badges, not read
      fields.string(8, "en"), // content_language, not read
    ),
    {
      common: decodedCommon("WebcastLiveIntroMessage"),
      content: "Welcome to my LIVE",
      user: {
        userId: "6900000000000000001",
        nickname: "Host",
        displayId: "",
        badgeList: [],
      },
    },
    { content: "" },
  ),
  row(
    UnauthorizedMemberMessageSchema,
    concat(
      common("WebcastUnauthorizedMemberMessage"),
      fields.varint(2, 1), // action, not read
      fields.message(3, fields.string(1, "k")), // nick_name_prefix, not read
      fields.string(4, "user123"),
      fields.message(5, fields.string(1, "k")), // enter_text, not read
    ),
    {
      common: decodedCommon("WebcastUnauthorizedMemberMessage"),
      nickName: "user123",
    },
    { nickName: "" },
  ),
  row(
    MsgDetectMessageSchema,
    concat(
      common("WebcastMsgDetectMessage"),
      fields.varint(2, 3),
      fields.message(3, fields.varint(1, 1)), // t_condition, not read
      fields.message(4, fields.varint(1, 1)), // t_info, not read
      fields.varint(5, 2),
      fields.string(6, "US"), // from_region, not read
    ),
    {
      common: decodedCommon("WebcastMsgDetectMessage"),
      dType: 3,
      triggerBy: 2,
    },
    { dType: 0, triggerBy: 0 },
  ),
  row(
    ToastMessageSchema,
    concat(
      common("WebcastToastMessage"),
      fields.varint(2, 3_000),
      fields.varint(3, 500), // delay_display_duration_millisecond, not read
      fields.string(4, "scene"), // scene, not read
    ),
    {
      common: decodedCommon("WebcastToastMessage"),
      displayDurationMillisecond: 3_000,
    },
    { displayDurationMillisecond: 0 },
  ),
  row(
    BottomMessageSchema,
    concat(
      common("WebcastBottomMessage"),
      fields.string(2, "Be kind"),
      fields.varint(3, 1), // show_type, not read
      fields.varint(4, 1), // text_type, not read
      fields.varint(5, 5_000), // duration, not read
      fields.varint(6, 1),
      fields.varint(7, 6_900_000_000_000_000_001n), // violation_user_id, not read
      fields.message(8, fields.string(1, "p")), // punish_info, not read
      fields.varint(9, 1), // style, not read
    ),
    {
      common: decodedCommon("WebcastBottomMessage"),
      content: "Be kind",
      bizType: 1,
    },
    { content: "", bizType: 0 },
  ),
  row(
    RoomVerifyMessageSchema,
    concat(
      common("WebcastRoomVerifyMessage"),
      fields.varint(2, 1), // action, not read
      fields.string(3, "Verify your account"),
      fields.varint(4, 2), // notice_type, not read
      fields.varint(5, 1),
    ),
    {
      common: decodedCommon("WebcastRoomVerifyMessage"),
      content: "Verify your account",
      closeRoom: true,
    },
    { content: "", closeRoom: false },
  ),
];

describe("BottomBizType", () => {
  it("has the values of webcast.im.BizType", () => {
    expect(BottomBizType).toEqual({
      DEFAULT: 0,
      RETHINK_CHAT: 1,
      RETHINK_QA: 2,
      WARNING_TAG_CURRENT_ROOM: 3,
      WARNING_TAG_COHOST_ROOM: 4,
      AGS_AT_RISK_OF_UNABLE_TO_COMMENT: 5,
      PERCEPTION_CENTER: 6,
    });
    expect(Object.isFrozen(BottomBizType)).toBe(true);
  });
});

describe.each(rows.map((entry) => [entry.schema.name, entry] as const))(
  "%s",
  (_name, { schema, bytes, expected, defaults, encoded }) => {
    it("reads its fields and skips the neighbours", () => {
      expect(decodeMessage(schema, bytes)).toStrictEqual(expected);
    });

    it("round-trips what it reads through the encoder", () => {
      expect(decodeMessage(schema, encoded)).toStrictEqual(expected);
    });

    it("leaves out what the message leaves out", () => {
      expect(decodeMessage(schema, new Uint8Array(0))).toStrictEqual(defaults);
      expect(decodeMessage(schema, fields.message(1))).toStrictEqual({
        ...defaults,
        common: {
          method: "",
          msgId: "0",
          roomId: "0",
          createTime: "0",
          isShowMsg: false,
        },
      });
    });

    it("skips fields it doesn't read, of every wire type, at every level", () => {
      const noisy = concat(
        unknownFields(),
        fields.message(1, unknownFields(), fields.varint(6, 1)),
        bytes,
        unknownFields(1_000),
      );
      expect(decodeMessage(schema, noisy)).toStrictEqual({
        ...expected,
        common: { ...expected.common, isShowMsg: true },
      });
    });
  },
);

describe("the tail tables' scalars", () => {
  it("read hand-assembled bytes, which the encoder writes the same", () => {
    const toast = fromHex("10 b8 17"); // display_duration_millisecond (2): 3000
    expect(decodeMessage(ToastMessageSchema, toast)).toStrictEqual({
      displayDurationMillisecond: 3_000,
    });
    expect(
      toHex(
        encodeMessage(ToastMessageSchema, {
          displayDurationMillisecond: 3_000,
        }),
      ),
    ).toBe(toHex(toast));

    const bottom = fromHex("12 02 68 69 30 06"); // content (2): "hi", biz_type (6): 6
    const bottomValue = {
      content: "hi",
      bizType: BottomBizType.PERCEPTION_CENTER,
    };
    expect(decodeMessage(BottomMessageSchema, bottom)).toStrictEqual(
      bottomValue,
    );
    expect(toHex(encodeMessage(BottomMessageSchema, bottomValue))).toBe(
      toHex(bottom),
    );

    const verify = fromHex("1a 01 78 28 01"); // content (3): "x", close_room (5): true
    const verifyValue = { content: "x", closeRoom: true };
    expect(decodeMessage(RoomVerifyMessageSchema, verify)).toStrictEqual(
      verifyValue,
    );
    expect(toHex(encodeMessage(RoomVerifyMessageSchema, verifyValue))).toBe(
      toHex(verify),
    );
  });

  it("read large and negative values out of order", () => {
    // display_duration_millisecond (2): 2^40, after a field it doesn't read.
    expect(
      decodeMessage(ToastMessageSchema, fromHex("18 01 10 80 80 80 80 80 20")),
    ).toStrictEqual({ displayDurationMillisecond: 2 ** 40 });
    // d_type (2): -1 as a 64-bit varint, trigger_by (5): 7, out of order.
    expect(
      decodeMessage(
        MsgDetectMessageSchema,
        fromHex("28 07 10 ff ff ff ff ff ff ff ff ff 01"),
      ),
    ).toStrictEqual({ dType: -1, triggerBy: 7 });
    // biz_type (6): a value the enum doesn't name is kept.
    expect(decodeMessage(BottomMessageSchema, fromHex("30 09")).bizType).toBe(
      9,
    );
  });
});
