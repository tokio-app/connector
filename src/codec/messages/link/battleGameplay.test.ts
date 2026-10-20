import { describe, expect, it } from "vitest";
import type { BattleGameplayMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { BattleGameplayMessageSchema } from "./battleGameplay.js";
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

// Field numbers: WebcastBattleGameplayMessage and its IceShowdownInfo, derived
// from observed traffic (PROTOCOL.md, "LIVE messages"). The bytes are written
// field by field (fields.*) or by hand, not from the schema, with made-up
// values shaped like the observed ones: a wrong number in the table fails
// here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(BattleGameplayMessageSchema, bytes);

describe("BattleGameplayMessageSchema", () => {
  it("reads common (1), battle_id (2) and ice_showdown_info (5): setting_type (1), prompt_time_ms (2) and start_time_ms (3)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastBattleGameplayMessage")),
      fields.varint(2, 7_300_000_000_000_000_001n),
      fields.varint(3, 2), // gameplay or update type, not read
      fields.varint(4, 1), // gameplay or update type, not read
      fields.message(
        5,
        fields.varint(1, 2),
        fields.varint(2, 1_760_000_000_123),
        fields.varint(3, 1_760_000_000_500),
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastBattleGameplayMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      battleId: "7300000000000000001",
      iceShowdownInfo: {
        settingType: 2,
        promptTimeMs: "1760000000123",
        startTimeMs: "1760000000500",
      },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({ battleId: "0" });
    expect(decode(fields.message(5))).toStrictEqual({
      battleId: "0",
      iceShowdownInfo: { settingType: 0, promptTimeMs: "0", startTimeMs: "0" },
    });
  });

  it("round-trips every field through the encoder", () => {
    const gameplay: BattleGameplayMessage = {
      common: sampleCommon("WebcastBattleGameplayMessage"),
      battleId: "7300000000000000001",
      iceShowdownInfo: {
        settingType: 1,
        promptTimeMs: "1760000000123",
        startTimeMs: "1760000000500",
      },
    };
    expect(
      decode(encodeMessage(BattleGameplayMessageSchema, gameplay)),
    ).toStrictEqual(gameplay);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(4, 1_000)),
      fields.message(5, unknownFields(), fields.varint(1, 1)),
      unknownFields(1_000),
      fields.varint(2, 9),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: false,
      },
      battleId: "9",
      iceShowdownInfo: { settingType: 1, promptTimeMs: "0", startTimeMs: "0" },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 01", // battle_id (2): 1
        "2a 08", // ice_showdown_info (5), 8 bytes
        "08 02", //   setting_type (1): 2, by TikTok
        "10 e8 07", //   prompt_time_ms (2): 1000
        "18 e9 07", //   start_time_ms (3): 1001
      ].join(" "),
    );
    const gameplay: BattleGameplayMessage = {
      battleId: "1",
      iceShowdownInfo: {
        settingType: 2,
        promptTimeMs: "1000",
        startTimeMs: "1001",
      },
    };
    expect(decode(bytes)).toStrictEqual(gameplay);
    expect(toHex(encodeMessage(BattleGameplayMessageSchema, gameplay))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with 64-bit values, a sign-extended setting, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "2a 19", // ice_showdown_info (5), 25 bytes
        "18 f4 83 b3 c1 9c 33", //   start_time_ms (3): 1760000000500
        "08 ff ff ff ff ff ff ff ff ff 01", //   setting_type (1): -1
        "10 fb 80 b3 c1 9c 33", //   prompt_time_ms (2): 1760000000123
        "20 01", // field 4, not read
        "10 81 80 e8 e2 aa ea b3 a7 65", // battle_id (2): 7300000000000000001
        "35 01 00 00 00", // field 6, fixed32, not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      battleId: "7300000000000000001",
      iceShowdownInfo: {
        settingType: -1,
        promptTimeMs: "1760000000123",
        startTimeMs: "1760000000500",
      },
    });
  });
});
