import { describe, expect, it } from "vitest";
import { decodeMessage } from "../decode.js";
import { EnterRoomSchema, HeartbeatSchema, PushFrameSchema } from "./frame.js";
import { concat, fields, fromHex } from "../../../test/helpers/encoder.js";

describe("PushFrameSchema", () => {
  it("reads seq_id (1), log_id (2), payload_encoding (6), payload_type (7) and payload (8)", () => {
    const bytes = concat(
      fields.varint(1, 12),
      fields.varint(2, 7_400_000_000_000_000_001n),
      fields.varint(3, 1), // service, not read
      fields.varint(4, 2), // method, not read
      fields.message(
        5,
        fields.string(1, "compress_type"),
        fields.string(2, "gzip"),
      ), // headers, not read
      fields.string(6, "pb"),
      fields.string(7, "msg"),
      fields.bytes(8, fromHex("1f 8b 08 00")),
    );
    expect(decodeMessage(PushFrameSchema, bytes)).toEqual({
      seqId: "12",
      logId: "7400000000000000001",
      payloadEncoding: "pb",
      payloadType: "msg",
      payload: fromHex("1f 8b 08 00"),
    });
  });

  it("exposes the field numbers for the frame encoders", () => {
    expect(PushFrameSchema.fields.logId.no).toBe(2);
    expect(PushFrameSchema.fields.payloadEncoding.no).toBe(6);
    expect(PushFrameSchema.fields.payloadType.no).toBe(7);
    expect(PushFrameSchema.fields.payload.no).toBe(8);
  });
});

describe("HeartbeatSchema", () => {
  it("reads room_id (1) and send_packet_seq_id (2)", () => {
    const bytes = concat(
      fields.varint(1, 7_140_000_000_000_000_001n),
      fields.varint(2, 3),
    );
    expect(decodeMessage(HeartbeatSchema, bytes)).toEqual({
      roomId: "7140000000000000001",
      sendPacketSeqId: 3,
    });
  });
});

describe("EnterRoomSchema", () => {
  it("reads what the enter room message carries on the wire", () => {
    // room_id (1), live_id (4) = 12, identity (5) = "audience",
    // enter_unique_id (8), filter_welcome_msg (9) = "0". The empty fields
    // (room_tag, live_region, cursor, account_type,
    // is_anchor_continue_keep_msg) aren't written.
    const bytes = fromHex(
      [
        "08 81 80 a8 82 bb 85 98 8b 63",
        "20 0c",
        "2a 08 61 75 64 69 65 6e 63 65",
        "40 7b",
        "4a 01 30",
      ].join(" "),
    );
    expect(decodeMessage(EnterRoomSchema, bytes)).toEqual({
      roomId: "7140000000000000001",
      liveId: 12,
      identity: "audience",
      enterUniqueId: "123",
      filterWelcomeMsg: "0",
    });
  });

  it("skips the fields it doesn't read", () => {
    const bytes = concat(
      fields.string(2, "tag"), // room_tag
      fields.string(3, "region"), // live_region
      fields.string(6, "cursor"), // cursor
      fields.varint(7, 1), // account_type
      fields.varint(10, 1), // is_anchor_continue_keep_msg
    );
    expect(decodeMessage(EnterRoomSchema, bytes)).toEqual(
      EnterRoomSchema.create(),
    );
  });
});
