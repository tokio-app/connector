import { describe, expect, it } from "vitest";
import {
  EnvelopeBusinessType,
  type EnvelopeMessage,
} from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { EnvelopeMessageSchema } from "./envelope.js";
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

// Field numbers: WebcastEnvelopeMessage and MessageRedEnvelopInfo in
// webcast/model/message/redenvelope.proto; business_type (2) is a
// webcast.model.data.EnvelopeBusinessType (model/data/messages.proto). The
// bytes are written field by field (fields.*) or by hand, not from the schema,
// so a wrong number in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(EnvelopeMessageSchema, bytes);

const INFO_DEFAULTS = {
  envelopeId: "",
  businessType: 0,
  sendUserName: "",
  diamondCount: 0,
  peopleCount: 0,
  unpackAt: 0,
  sendUserId: "",
  superFanCount: 0,
};

describe("EnvelopeBusinessType", () => {
  it("has the values of webcast.model.data.EnvelopeBusinessType", () => {
    expect(EnvelopeBusinessType).toEqual({
      UNKNOWN: 0,
      USER_DIAMOND: 1,
      PLATFORM_DIAMOND: 2,
      PLATFORM_SHELL: 3,
      PORTAL: 4,
      PLATFORM_MERCH: 5,
      EOY_DIAMOND: 6,
      FANCLUB_GTM: 7,
      PLATFORM_PORTAL: 9,
      EOY_GTM_POPULARITY_TICKET: 10,
      EOY_GTM_REVENUE_DIAMOND: 11,
      EOY_GTM_GAME_DIAMOND: 12,
      CREATOR_LEAGUE_PROMOTION_GTM: 13,
      MOY_GTM_POPULARITY_TICKET: 14,
      SUPER_FAN_BOX: 19,
    });
    expect(Object.isFrozen(EnvelopeBusinessType)).toBe(true);
  });
});

describe("EnvelopeMessageSchema", () => {
  it("reads common (1) and envelope_info (2: envelope_id 1, business_type 2, send_user_name 4, diamond_count 5, people_count 6, unpack_at 7, send_user_id 8, super_fan_count 16)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastEnvelopeMessage"),
        fields.message(8, fields.string(1, "ttlive_superFanBox_sent")),
      ),
      fields.message(
        2,
        fields.string(1, "7500000000000000001"),
        fields.varint(2, 19),
        fields.string(3, "useast5"), // envelope_idc, not read
        fields.string(4, "Nick"),
        fields.varint(5, 100),
        fields.varint(6, 10),
        fields.varint(7, 1_760_000_000),
        fields.string(8, "6900000000000000001"),
        fields.message(9, fields.string(2, "tos/a")), // send_user_avatar, not read
        fields.string(10, "1759999000"), // create_at, not read
        fields.varint(13, 2), // skin_id, not read
        fields.varint(16, 3),
      ),
      fields.varint(3, 1), // display, not read
      fields.message(4, fields.varint(1, 1)), // public_area_msg_common, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastEnvelopeMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
        displayText: { key: "ttlive_superFanBox_sent", defaultPattern: "" },
      },
      envelopeInfo: {
        envelopeId: "7500000000000000001",
        businessType: 19,
        sendUserName: "Nick",
        diamondCount: 100,
        peopleCount: 10,
        unpackAt: 1_760_000_000,
        sendUserId: "6900000000000000001",
        superFanCount: 3,
      },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({});
    expect(decode(fields.message(2))).toStrictEqual({
      envelopeInfo: INFO_DEFAULTS,
    });
  });

  it("round-trips every field through the encoder", () => {
    const envelope: EnvelopeMessage = {
      common: sampleCommon("WebcastEnvelopeMessage", "ttlive_superfanbox"),
      envelopeInfo: {
        envelopeId: "7500000000000000001",
        businessType: EnvelopeBusinessType.SUPER_FAN_BOX,
        sendUserName: "Nick Name",
        diamondCount: 500,
        peopleCount: 20,
        unpackAt: 1_760_000_060,
        sendUserId: "6900000000000000001",
        superFanCount: 5,
      },
    };
    expect(
      decode(encodeMessage(EnvelopeMessageSchema, envelope)),
    ).toStrictEqual(envelope);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(2, unknownFields(), fields.varint(2, 4)),
      unknownFields(1_000),
      fields.message(
        1,
        unknownFields(),
        fields.message(8, unknownFields(), fields.string(2, "{0:user}")),
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
        displayText: { key: "", defaultPattern: "{0:user}" },
      },
      envelopeInfo: { ...INFO_DEFAULTS, businessType: 4 },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "0a 16", // common (1), 22 bytes
        "42 14", //   display_text (8), 20 bytes
        "0a 12 74 74 6c 69 76 65 5f 73 75 70 65 72 66 61 6e 62 6f 78", //     key (1): "ttlive_superfanbox"
        "12 1c", // envelope_info (2), 28 bytes
        "0a 03 31 32 33", //   envelope_id (1): "123"
        "10 13", //   business_type (2): 19, super fan box
        "22 03 41 6e 6e", //   send_user_name (4): "Ann"
        "28 64", //   diamond_count (5): 100
        "30 05", //   people_count (6): 5
        "38 80 f0 9d c7 06", //   unpack_at (7): 1760000000
        "42 01 37", //   send_user_id (8): "7"
        "80 01 02", //   super_fan_count (16): 2
      ].join(" "),
    );
    const envelope: EnvelopeMessage = {
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
        displayText: { key: "ttlive_superfanbox", defaultPattern: "" },
      },
      envelopeInfo: {
        envelopeId: "123",
        businessType: 19,
        sendUserName: "Ann",
        diamondCount: 100,
        peopleCount: 5,
        unpackAt: 1_760_000_000,
        sendUserId: "7",
        superFanCount: 2,
      },
    };
    expect(decode(bytes)).toStrictEqual(envelope);
    expect(toHex(encodeMessage(EnvelopeMessageSchema, envelope))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with the envelope's fields out of order and unknown ones around them", () => {
    const bytes = fromHex(
      [
        "18 01", // display (3), not read
        "12 23", // envelope_info (2), 35 bytes
        "28 64", //   diamond_count (5): 100
        "0a 03 31 32 33", //   envelope_id (1): "123"
        "22 03 41 6e 6e", //   send_user_name (4): "Ann"
        "1a 02 69 64", //   envelope_idc (3), not read
        "10 01", //   business_type (2): 1, user diamond
        "30 05", //   people_count (6): 5
        "4a 02 08 01", //   send_user_avatar (9), not read, 2 bytes
        "38 ff ff ff ff ff ff ff ff ff 01", //   unpack_at (7): -1
        "22 00", // public_area_msg_common (4), not read, 0 bytes
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      envelopeInfo: {
        ...INFO_DEFAULTS,
        envelopeId: "123",
        businessType: 1,
        sendUserName: "Ann",
        diamondCount: 100,
        peopleCount: 5,
        unpackAt: -1,
      },
    });
  });
});
