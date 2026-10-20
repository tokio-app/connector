import { describe, expect, it } from "vitest";
import { decodeMessage } from "./decode.js";
import { FRAME_SCHEMAS, SCHEMAS, getSchema, type SchemaName } from "./index.js";
import { chatSchemas } from "./messages/chat/index.js";
import { ChatMessageSchema } from "./messages/chat/chat.js";
import { giftSchemas } from "./messages/gift/index.js";
import { linkSchemas } from "./messages/link/index.js";
import { roomSchemas } from "./messages/room/index.js";
import type { MessageSchema } from "./schema.js";

const REGISTRIES: readonly Readonly<Record<string, MessageSchema<unknown>>>[] =
  [FRAME_SCHEMAS, chatSchemas, giftSchemas, linkSchemas, roomSchemas];

describe("SCHEMAS", () => {
  it("keys every schema by its protobuf message name", () => {
    for (const [name, schema] of Object.entries(SCHEMAS)) {
      expect(schema.name).toBe(name);
    }
    expect(Object.keys(FRAME_SCHEMAS)).toEqual([
      "WebcastPushFrame",
      "HeartBeatMessage",
      "WebcastImEnterRoomMessage",
      "ProtoMessageFetchResult",
    ] satisfies SchemaName[]);
    expect(Object.isFrozen(SCHEMAS)).toBe(true);
    expect(Object.isFrozen(FRAME_SCHEMAS)).toBe(true);
  });

  it("is the union of the frame schemas and the four group registries, which don't overlap", () => {
    const union = Object.assign({}, ...REGISTRIES);
    expect(SCHEMAS).toEqual(union);
    const sizes = REGISTRIES.reduce(
      (sum, registry) => sum + Object.keys(registry).length,
      0,
    );
    expect(Object.keys(SCHEMAS)).toHaveLength(sizes);
    // The frames come first, then the groups in order.
    expect(Object.keys(SCHEMAS)).toEqual(REGISTRIES.flatMap(Object.keys));
  });

  it("decodes an empty message to the defaults with every schema", () => {
    for (const schema of Object.values(SCHEMAS) as MessageSchema<unknown>[]) {
      expect(decodeMessage(schema, new Uint8Array(0))).toStrictEqual(
        schema.create(),
      );
    }
  });
});

describe("getSchema", () => {
  it("finds a schema by message name", () => {
    expect(getSchema("WebcastChatMessage")).toBe(ChatMessageSchema);
  });

  it("returns undefined for messages the library doesn't decode", () => {
    expect(getSchema("WebcastNoSuchMessage")).toBe(undefined);
    expect(getSchema("toString")).toBe(undefined);
    expect(getSchema("__proto__")).toBe(undefined);
  });
});
