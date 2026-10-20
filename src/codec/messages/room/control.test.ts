import { describe, expect, it } from "vitest";
import { ControlAction, type ControlMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { ControlMessageSchema } from "./control.js";
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

// Field numbers: WebcastControlMessage and Extra in
// webcast/model/message/messages.proto; its action (2) is a
// webcast.im.ControlAction (synthetic_enums.proto); PunishEventInfo is in
// webcast/model/message/invite_top_host_info.proto. The bytes are written
// field by field (fields.*) or by hand, not from the schema, so a wrong number
// in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(ControlMessageSchema, bytes);

describe("ControlAction", () => {
  it("has the values of webcast.im.ControlAction", () => {
    expect(ControlAction).toEqual({
      UNKNOWN: 0,
      PAUSED: 1,
      UNPAUSED: 2,
      STREAM_ENDED: 3,
      STREAM_SUSPENDED: 4,
    });
    expect(Object.isFrozen(ControlAction)).toBe(true);
  });
});

describe("ControlMessageSchema", () => {
  it("reads common (1), action (2), tips (3), extra (4: title 3, violation_reason 4, content 5) and punish_info (7)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastControlMessage"),
        fields.varint(3, 7_140_000_000_000_000_001n),
      ),
      fields.varint(2, 4),
      fields.string(3, "The LIVE was suspended"),
      fields.message(
        4,
        fields.string(1, "https://example/ban"), // ban_info_url, not read
        fields.varint(2, 7), // reason_no, not read
        fields.message(3, fields.string(1, "title_key")),
        fields.message(4, fields.string(2, "Nudity")),
        fields.message(5, fields.string(1, "content_key")),
        fields.message(6, fields.string(1, "got_it")), // got_it_button, not read
      ),
      fields.message(5, fields.varint(1, 1)), // perception_dialog, not read
      fields.message(6, fields.string(1, "key")), // perception_audience_text, not read
      fields.message(
        7,
        fields.string(1, "ban_live"),
        fields.varint(4, 42), // violation_uid, not read
        fields.varint(5, 76),
        fields.varint(6, 3_600),
        fields.varint(8, 1_760_000_003_600n),
      ),
      fields.message(8, fields.string(1, "float")), // float_text, not read
      fields.varint(9, 1), // float_style, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastControlMessage",
        msgId: "0",
        roomId: "7140000000000000001",
        createTime: "0",
        isShowMsg: false,
      },
      action: 4,
      tips: "The LIVE was suspended",
      extra: {
        title: { key: "title_key", defaultPattern: "" },
        violationReason: { key: "", defaultPattern: "Nudity" },
        content: { key: "content_key", defaultPattern: "" },
      },
      punishInfo: {
        punishType: "ban_live",
        punishReason: "",
        punishId: "",
        punishTypeId: 76,
        duration: 3_600,
        endTime: "1760000003600",
        showReason: "",
      },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({ action: 0, tips: "" });
    expect(decode(fields.message(4))).toStrictEqual({
      action: 0,
      tips: "",
      extra: {},
    });
  });

  it("round-trips every field through the encoder", () => {
    const control: ControlMessage = {
      common: sampleCommon("WebcastControlMessage"),
      action: ControlAction.STREAM_SUSPENDED,
      tips: "Suspended",
      extra: {
        title: { key: "t", defaultPattern: "Title" },
        violationReason: { key: "v", defaultPattern: "Reason" },
        content: { key: "c", defaultPattern: "Content" },
      },
      punishInfo: {
        punishType: "ban_live",
        punishReason: "nudity",
        punishId: "p1",
        punishTypeId: 76,
        duration: 86_400,
        endTime: "1760000000000",
        showReason: "Shown",
      },
    };
    expect(decode(encodeMessage(ControlMessageSchema, control))).toStrictEqual(
      control,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(4, 1_000)),
      fields.message(
        4,
        unknownFields(),
        fields.message(5, unknownFields(), fields.string(1, "c")),
      ),
      unknownFields(1_000),
      fields.message(7, unknownFields(), fields.varint(5, 9)),
      fields.varint(2, 4),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: false,
      },
      action: 4,
      tips: "",
      extra: { content: { key: "c", defaultPattern: "" } },
      punishInfo: {
        punishType: "",
        punishReason: "",
        punishId: "",
        punishTypeId: 9,
        duration: 0,
        endTime: "0",
        showReason: "",
      },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const ended = fromHex("10 03"); // action (2): 3, stream ended
    expect(decode(ended)).toStrictEqual({ action: 3, tips: "" });
    expect(toHex(encodeMessage(ControlMessageSchema, { action: 3 }))).toBe(
      "10 03",
    );

    const suspended = fromHex(
      [
        "0a 03", // common (1), 3 bytes
        "20 e8 07", //   create_time (4): 1000
        "10 04", // action (2): 4, stream suspended
        "1a 03 62 79 65", // tips (3): "bye"
        "22 07", // extra (4), 7 bytes
        "1a 05", //   title (3), 5 bytes
        "0a 03 6b 65 79", //     key (1): "key"
        "3a 04", // punish_info (7), 4 bytes
        "28 4c", //   punish_type_id (5): 76
        "30 3c", //   duration (6): 60
      ].join(" "),
    );
    const control: ControlMessage = {
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: false,
      },
      action: 4,
      tips: "bye",
      extra: { title: { key: "key", defaultPattern: "" } },
      punishInfo: {
        punishType: "",
        punishReason: "",
        punishId: "",
        punishTypeId: 76,
        duration: 60,
        endTime: "0",
        showReason: "",
      },
    };
    expect(decode(suspended)).toStrictEqual(control);
    expect(toHex(encodeMessage(ControlMessageSchema, control))).toBe(
      toHex(suspended),
    );
  });

  it("reads hand-assembled bytes with unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "1a 03 62 79 65", // tips (3): "bye"
        "22 02", // extra (4), 2 bytes
        "08 01", //   ban_info_url (1), not read (a 1-byte varint stands in)
        "48 01", // float_style (9), not read
        "10 04", // action (2): 4, stream suspended
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({ action: 4, tips: "bye", extra: {} });
  });
});
