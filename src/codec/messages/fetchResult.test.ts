import { describe, expect, it } from "vitest";
import { decodeMessage } from "../decode.js";
import {
  FetchResultMessageSchema,
  FetchResultSchema,
  routeParamsToRecord,
} from "./fetchResult.js";
import { concat, fields, fromHex } from "../../../test/helpers/encoder.js";

const message = (method: string, msgId: bigint, isHistory: boolean) =>
  fields.message(
    1,
    fields.string(1, method),
    fields.bytes(2, fromHex("0a 00")),
    fields.varint(3, msgId),
    fields.varint(4, 1),
    fields.varint(5, 99), // offset, not read
    fields.varint(6, isHistory ? 1 : 0),
    fields.varint(7, 1), // sample_flag, not read
  );

describe("FetchResultMessageSchema", () => {
  it("reads method (1), payload (2), msg_id (3), msg_type (4) and is_history (6)", () => {
    const bytes = concat(
      fields.string(1, "WebcastChatMessage"),
      fields.bytes(2, fromHex("0a 02 08 01")),
      fields.varint(3, 7_400_000_000_000_000_001n),
      fields.varint(4, 2),
      fields.varint(6, 1),
    );
    expect(decodeMessage(FetchResultMessageSchema, bytes)).toEqual({
      method: "WebcastChatMessage",
      payload: fromHex("0a 02 08 01"),
      msgId: "7400000000000000001",
      msgType: 2,
      isHistory: true,
    });
  });
});

describe("FetchResultSchema", () => {
  it("reads every field the connection uses", () => {
    const bytes = concat(
      message("WebcastChatMessage", 1n, true),
      message("WebcastLikeMessage", 2n, false),
      fields.string(2, "1760000000000_7400000000000000001_1_1_0_0"),
      fields.varint(3, 1_000),
      fields.varint(4, 1_760_000_000_123),
      fields.string(5, "internal_src:dim|wss_push_room_id:7140000000000000001"),
      fields.varint(6, 1),
      fields.message(7, fields.string(1, "im-cursor"), fields.string(2, "c1")),
      fields.message(7, fields.string(1, "wrds_v"), fields.string(2, "123")),
      fields.varint(8, 10_000),
      fields.varint(9, 1),
      fields.string(
        10,
        "wss://webcast-ws.tiktok.com/webcast/im/ws_proxy/ws_reuse_supplement/",
      ),
      fields.varint(11, 1),
      fields.string(12, "history-cursor"), // history_comment_cursor, not read
      fields.varint(13, 1), // history_no_more, not read
    );
    expect(decodeMessage(FetchResultSchema, bytes)).toEqual({
      messages: [
        {
          method: "WebcastChatMessage",
          payload: fromHex("0a 00"),
          msgId: "1",
          msgType: 1,
          isHistory: true,
        },
        {
          method: "WebcastLikeMessage",
          payload: fromHex("0a 00"),
          msgId: "2",
          msgType: 1,
          isHistory: false,
        },
      ],
      cursor: "1760000000000_7400000000000000001_1_1_0_0",
      fetchInterval: 1_000,
      now: 1_760_000_000_123,
      internalExt: "internal_src:dim|wss_push_room_id:7140000000000000001",
      fetchType: 1,
      routeParams: [
        { key: "im-cursor", value: "c1" },
        { key: "wrds_v", value: "123" },
      ],
      heartbeatDuration: 10_000,
      needAck: true,
      pushServer:
        "wss://webcast-ws.tiktok.com/webcast/im/ws_proxy/ws_reuse_supplement/",
      isFirst: true,
    });
  });

  it("keeps message payloads as views into the batch", () => {
    const bytes = message("WebcastChatMessage", 1n, false);
    const [first] = decodeMessage(FetchResultSchema, bytes).messages;
    expect(first?.payload.buffer).toBe(bytes.buffer);
  });
});

describe("routeParamsToRecord", () => {
  it("keeps the last value of a key, like a protobuf map", () => {
    expect(
      routeParamsToRecord([
        { key: "a", value: "1" },
        { key: "b", value: "2" },
        { key: "a", value: "3" },
      ]),
    ).toEqual({ a: "3", b: "2" });
  });

  it("makes every key an own property, __proto__ included", () => {
    const record = routeParamsToRecord([
      { key: "__proto__", value: "x" },
      { key: "constructor", value: "y" },
    ]);
    expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
    expect(Object.entries(record)).toEqual([
      ["__proto__", "x"],
      ["constructor", "y"],
    ]);
  });
});
