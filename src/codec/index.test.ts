import { describe, expect, it } from "vitest";
import {
  ChatMessageSchema,
  SCHEMAS,
  decodeMessage,
  getSchema,
  type MessageSchema,
  type SchemaName,
} from "./index.js";

describe("SCHEMAS", () => {
  it("keys every schema by its protobuf message name", () => {
    for (const [name, schema] of Object.entries(SCHEMAS)) {
      expect(schema.name).toBe(name);
    }
    expect(Object.keys(SCHEMAS)).toEqual([
      "WebcastPushFrame",
      "HeartBeatMessage",
      "WebcastImEnterRoomMessage",
      "ProtoMessageFetchResult",
      "WebcastChatMessage",
      "WebcastGiftMessage",
      "WebcastLikeMessage",
      "WebcastSocialMessage",
      "WebcastMemberMessage",
      "WebcastRoomUserSeqMessage",
      "WebcastControlMessage",
      "WebcastEnvelopeMessage",
      "WebcastBarrageMessage",
    ] satisfies SchemaName[]);
    expect(Object.isFrozen(SCHEMAS)).toBe(true);
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
    expect(getSchema("WebcastPollMessage")).toBe(undefined);
    expect(getSchema("toString")).toBe(undefined);
    expect(getSchema("__proto__")).toBe(undefined);
  });
});
