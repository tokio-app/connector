import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeMessage } from "../codec/decode.js";
import { FetchResultSchema } from "../codec/messages/fetchResult.js";
import {
  EnterRoomSchema,
  HeartbeatSchema,
  PushFrameSchema,
} from "../codec/messages/frame.js";
import { ProtocolError } from "../errors.js";
import {
  PayloadType,
  decodeFetchResult,
  decodePushFrame,
  encodeAck,
  encodeEnterRoom,
  encodeHeartbeat,
} from "./frames.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../test/helpers/encoder.js";

const ROOM_ID = "7140000000000000001";
const utf8 = new TextDecoder();

describe("encodeEnterRoom", () => {
  it("writes PROTOCOL.md's example byte for byte", () => {
    expect(
      toHex(encodeEnterRoom({ roomId: ROOM_ID, enterUniqueId: "123" })),
    ).toBe(
      [
        "32 02 70 62",
        "3a 0d 69 6d 5f 65 6e 74 65 72 5f 72 6f 6f 6d",
        "42 1b",
        "08 81 80 a8 82 bb 85 98 8b 63",
        "20 0c",
        "2a 08 61 75 64 69 65 6e 63 65",
        "40 7b",
        "4a 01 30",
      ].join(" "),
    );
  });

  it("puts every field at its number", () => {
    // Hand-assembled with explicit field numbers, independent of the schemas.
    expect(
      encodeEnterRoom({
        roomId: ROOM_ID,
        enterUniqueId: "9223372036854775807",
      }),
    ).toEqual(
      concat(
        fields.string(6, "pb"),
        fields.string(7, "im_enter_room"),
        fields.message(
          8,
          fields.varint(1, 7_140_000_000_000_000_001n),
          fields.varint(4, 12),
          fields.string(5, "audience"),
          fields.varint(8, 2n ** 63n - 1n),
          fields.string(9, "0"),
        ),
      ),
    );
  });

  it("decodes back to the enter room message", () => {
    const frame = decodeMessage(
      PushFrameSchema,
      encodeEnterRoom({ roomId: ROOM_ID, enterUniqueId: "42" }),
    );
    expect(frame).toEqual({
      seqId: "0",
      logId: "0",
      payloadEncoding: "pb",
      payloadType: PayloadType.ENTER_ROOM,
      payload: expect.any(Uint8Array),
    });
    expect(decodeMessage(EnterRoomSchema, frame.payload)).toEqual({
      roomId: ROOM_ID,
      liveId: 12,
      identity: "audience",
      enterUniqueId: "42",
      filterWelcomeMsg: "0",
    });
  });

  it("makes a new random entry id for each entry by default", () => {
    const enterId = () =>
      decodeMessage(
        EnterRoomSchema,
        decodeMessage(PushFrameSchema, encodeEnterRoom({ roomId: ROOM_ID }))
          .payload,
      ).enterUniqueId;
    const first = enterId();
    const second = enterId();
    expect(BigInt(first)).toBeGreaterThan(0n);
    expect(BigInt(first)).toBeLessThan(2n ** 63n);
    expect(second).not.toBe(first);
  });
});

describe("encodeHeartbeat", () => {
  it("writes PROTOCOL.md's example byte for byte", () => {
    expect(toHex(encodeHeartbeat({ roomId: ROOM_ID, seqId: 1 }))).toBe(
      "32 02 70 62 3a 02 68 62 42 0c 08 81 80 a8 82 bb 85 98 8b 63 10 01",
    );
  });

  it("decodes back to the heartbeat message", () => {
    const frame = decodeMessage(
      PushFrameSchema,
      encodeHeartbeat({ roomId: ROOM_ID, seqId: 300 }),
    );
    expect(frame.logId).toBe("0");
    expect(frame.payloadEncoding).toBe("pb");
    expect(frame.payloadType).toBe(PayloadType.HEARTBEAT);
    expect(decodeMessage(HeartbeatSchema, frame.payload)).toEqual({
      roomId: ROOM_ID,
      sendPacketSeqId: 300,
    });
    expect(frame.payload).toEqual(
      concat(
        fields.varint(1, 7_140_000_000_000_000_001n),
        fields.varint(2, 300),
      ),
    );
  });
});

describe("encodeAck", () => {
  it("writes PROTOCOL.md's example byte for byte", () => {
    expect(
      toHex(encodeAck({ logId: "7400000000000000001", internalExt: "abc" })),
    ).toBe(
      "10 81 80 90 cf b0 99 85 d9 66 32 02 70 62 3a 03 61 63 6b 42 03 61 62 63",
    );
  });

  it("decodes back to the log id and internalExt", () => {
    const frame = decodeMessage(
      PushFrameSchema,
      encodeAck({ logId: "18446744073709551615", internalExt: "état|1" }),
    );
    expect(frame.logId).toBe("18446744073709551615");
    expect(frame.payloadEncoding).toBe("pb");
    expect(frame.payloadType).toBe(PayloadType.ACK);
    expect(utf8.decode(frame.payload)).toBe("état|1");
  });

  it("leaves out a zero log id and an empty payload, like proto3", () => {
    expect(encodeAck({ logId: "0", internalExt: "" })).toEqual(
      concat(fields.string(6, "pb"), fields.string(7, "ack")),
    );
  });
});

describe("decodePushFrame", () => {
  it("reads a received frame", () => {
    const bytes = concat(
      fields.varint(1, 5),
      fields.varint(2, 7_400_000_000_000_000_001n),
      fields.string(6, "pb"),
      fields.string(7, "msg"),
      fields.bytes(8, fromHex("0a 00")),
    );
    expect(decodePushFrame(bytes)).toEqual({
      seqId: "5",
      logId: "7400000000000000001",
      payloadEncoding: "pb",
      payloadType: "msg",
      payload: fromHex("0a 00"),
    });
  });

  it("throws a ProtocolError for a malformed frame", () => {
    expect(() => decodePushFrame(fromHex("42 05 01"))).toThrow(ProtocolError);
  });
});

describe("decodeFetchResult", () => {
  const batch = encodeMessage(FetchResultSchema, {
    messages: [
      {
        method: "WebcastChatMessage",
        payload: fromHex("0a 00"),
        msgId: "7400000000000000001",
        isHistory: true,
      },
    ],
    cursor: "c1",
    internalExt: "ext",
    needAck: true,
  });
  const expected = {
    ...FetchResultSchema.create(),
    messages: [
      {
        method: "WebcastChatMessage",
        payload: fromHex("0a 00"),
        msgId: "7400000000000000001",
        msgType: 0,
        isHistory: true,
      },
    ],
    cursor: "c1",
    internalExt: "ext",
    needAck: true,
  };

  it("reads a plain batch", () => {
    expect(decodeFetchResult(batch)).toEqual(expected);
  });

  it("gunzips a batch that starts with 1f 8b 08", () => {
    const compressed = gzipSync(batch);
    expect(toHex(compressed.subarray(0, 3))).toBe("1f 8b 08");
    expect(decodeFetchResult(compressed)).toEqual(expected);
  });

  it("reports unsafe counters through the decode options", () => {
    const reports: string[] = [];
    const bytes = fields.varint(4, 2n ** 60n); // now
    decodeFetchResult(bytes, {
      onUnsafeInteger: (path) => reports.push(path),
    });
    expect(reports).toEqual(["ProtoMessageFetchResult.now"]);
  });

  it("throws a ProtocolError for a corrupt gzip payload", () => {
    const corrupt = gzipSync(batch);
    corrupt.fill(0xff, 10, 20);
    expect(() => decodeFetchResult(corrupt)).toThrow(ProtocolError);
    expect(() => decodeFetchResult(corrupt)).toThrow("Can't decompress");
  });

  it("throws a ProtocolError for a malformed batch", () => {
    expect(() => decodeFetchResult(fromHex("0a 05 01"))).toThrow(
      "Can't decode ProtoMessageFetchResult",
    );
  });
});
