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

// Field numbers: WebcastControlMessage in
// webcast/model/message/messages.proto; its action (2) is a
// webcast.im.ControlAction (synthetic_enums.proto). The bytes are written
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
  it("reads common (1) and action (2)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastControlMessage"),
        fields.varint(3, 7_140_000_000_000_000_001n),
      ),
      fields.varint(2, 3),
      fields.string(3, "The LIVE has ended"), // tips, not read
      fields.message(4, fields.varint(1, 1)), // extra, not read
      fields.message(6, fields.string(1, "key")), // perception_audience_text, not read
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
      action: 3,
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({ action: 0 });
  });

  it("round-trips every field through the encoder", () => {
    const control: ControlMessage = {
      common: sampleCommon("WebcastControlMessage"),
      action: ControlAction.STREAM_SUSPENDED,
    };
    expect(decode(encodeMessage(ControlMessageSchema, control))).toStrictEqual(
      control,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(4, 1_000)),
      unknownFields(1_000),
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
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const ended = fromHex("10 03"); // action (2): 3, stream ended
    expect(decode(ended)).toStrictEqual({ action: 3 });
    expect(toHex(encodeMessage(ControlMessageSchema, { action: 3 }))).toBe(
      "10 03",
    );

    const suspended = fromHex(
      [
        "0a 03", // common (1), 3 bytes
        "20 e8 07", //   create_time (4): 1000
        "10 04", // action (2): 4, stream suspended
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
    };
    expect(decode(suspended)).toStrictEqual(control);
    expect(toHex(encodeMessage(ControlMessageSchema, control))).toBe(
      toHex(suspended),
    );
  });

  it("reads hand-assembled bytes with unknown fields before the action", () => {
    const bytes = fromHex(
      [
        "1a 03 62 79 65", // tips (3), not read
        "22 02", // extra (4), not read, 2 bytes
        "08 01", //   field 1
        "48 01", // float_style (9), not read
        "10 04", // action (2): 4, stream suspended
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({ action: 4 });
  });
});
