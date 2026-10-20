import { describe, expect, it } from "vitest";
import { EnvelopeBusinessType, type EnvelopeMessage } from "../../events.js";
import { decodeMessage } from "../decode.js";
import { EnvelopeMessageSchema } from "./envelope.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../test/helpers/encoder.js";
import { sampleCommon, unknownFields } from "../../../test/helpers/samples.js";

// Field numbers: WebcastEnvelopeMessage and MessageRedEnvelopInfo in
// webcast/model/message/redenvelope.proto; business_type (2) is a
// webcast.model.data.EnvelopeBusinessType (model/data/messages.proto). The
// bytes are written field by field (fields.*) or by hand, not from the schema,
// so a wrong number in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(EnvelopeMessageSchema, bytes);

describe("EnvelopeBusinessType", () => {
  it("has the values of webcast.model.data.EnvelopeBusinessType the library uses", () => {
    expect(EnvelopeBusinessType).toEqual({ UNKNOWN: 0, SUPER_FAN_BOX: 19 });
    expect(Object.isFrozen(EnvelopeBusinessType)).toBe(true);
  });
});

describe("EnvelopeMessageSchema", () => {
  it("reads common (1) and envelope_info (2) with its business_type (2)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastEnvelopeMessage"),
        fields.message(8, fields.string(1, "ttlive_superFanBox_sent")),
      ),
      fields.message(
        2,
        fields.string(1, "7500000000000000001"), // envelope_id, not read
        fields.varint(2, 19),
        fields.string(4, "Nick"), // send_user_name, not read
        fields.varint(5, 100), // diamond_count, not read
        fields.varint(6, 10), // people_count, not read
        fields.varint(7, 1_760_000_000), // unpack_at, not read
        fields.varint(16, 3), // super_fan_count, not read
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
      envelopeInfo: { businessType: 19 },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({});
    expect(decode(fields.message(2))).toStrictEqual({
      envelopeInfo: { businessType: 0 },
    });
  });

  it("round-trips every field through the encoder", () => {
    const envelope: EnvelopeMessage = {
      common: sampleCommon("WebcastEnvelopeMessage", "ttlive_superfanbox"),
      envelopeInfo: { businessType: EnvelopeBusinessType.SUPER_FAN_BOX },
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
      envelopeInfo: { businessType: 4 },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "0a 16", // common (1), 22 bytes
        "42 14", //   display_text (8), 20 bytes
        "0a 12 74 74 6c 69 76 65 5f 73 75 70 65 72 66 61 6e 62 6f 78", //     key (1): "ttlive_superfanbox"
        "12 02", // envelope_info (2), 2 bytes
        "10 13", //   business_type (2): 19, super fan box
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
      envelopeInfo: { businessType: 19 },
    };
    expect(decode(bytes)).toStrictEqual(envelope);
    expect(toHex(encodeMessage(EnvelopeMessageSchema, envelope))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with the envelope's other fields around its business type", () => {
    const bytes = fromHex(
      [
        "18 01", // display (3), not read
        "12 16", // envelope_info (2), 22 bytes
        "0a 03 31 32 33", //   envelope_id (1), not read
        "10 01", //   business_type (2): 1, user diamond
        "22 03 41 6e 6e", //   send_user_name (4), not read
        "28 64", //   diamond_count (5), not read
        "30 05", //   people_count (6), not read
        "38 80 f0 9d c7 06", //   unpack_at (7), not read
        "22 00", // public_area_msg_common (4), not read, 0 bytes
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({ envelopeInfo: { businessType: 1 } });
  });
});
