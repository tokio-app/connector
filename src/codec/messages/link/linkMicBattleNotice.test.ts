import { describe, expect, it } from "vitest";
import type { LinkMicBattleNotice } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LinkMicBattleNoticeSchema } from "./linkMicBattleNotice.js";
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

// Field numbers: WebcastLinkmicBattleNoticeMessage and its
// BattleNoticeCommonGuide, derived from observed traffic (PROTOCOL.md, "LIVE
// messages"); the display text is a webcast Text. The bytes are written field
// by field (fields.*) or by hand, not from the schema, with made-up values
// shaped like the observed ones: a wrong number in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(LinkMicBattleNoticeSchema, bytes);

describe("LinkMicBattleNoticeSchema", () => {
  it("reads common (1), notice_type (2) and common_guide (8): display_text (1) and except_anchor (2)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastLinkmicBattleNoticeMessage")),
      fields.varint(2, 6),
      fields.message(3, fields.message(1, fields.string(1, "t"))), // field 3, not read
      fields.message(
        8,
        fields.message(
          1,
          fields.string(1, "pm_mt_match_notice"),
          fields.string(2, "A notice"),
          fields.message(3, fields.string(1, "#FFFFFFFF")), // default_format, not read
        ),
        fields.varint(2, 1),
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastLinkmicBattleNoticeMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      noticeType: 6,
      commonGuide: {
        displayText: { key: "pm_mt_match_notice", defaultPattern: "A notice" },
        exceptAnchor: true,
      },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({ noticeType: 0 });
    expect(decode(fields.message(8))).toStrictEqual({
      noticeType: 0,
      commonGuide: { exceptAnchor: false },
    });
  });

  it("round-trips every field through the encoder", () => {
    const notice: LinkMicBattleNotice = {
      common: sampleCommon("WebcastLinkmicBattleNoticeMessage"),
      noticeType: 6,
      commonGuide: {
        displayText: { key: "pm_mt_match_notice", defaultPattern: "{0:user}" },
        exceptAnchor: true,
      },
    };
    expect(
      decode(encodeMessage(LinkMicBattleNoticeSchema, notice)),
    ).toStrictEqual(notice);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(4, 1_000)),
      fields.message(
        8,
        unknownFields(),
        fields.message(1, unknownFields(), fields.string(1, "k")),
      ),
      unknownFields(1_000),
      fields.varint(2, 7),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: false,
      },
      noticeType: 7,
      commonGuide: {
        displayText: { key: "k", defaultPattern: "" },
        exceptAnchor: false,
      },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 06", // notice_type (2): 6, a notice in the chat
        "42 0a", // common_guide (8), 10 bytes
        "0a 06", //   display_text (1), 6 bytes
        "0a 01 6b", //     key (1): "k"
        "12 01 70", //     default_pattern (2): "p"
        "10 01", //   except_anchor (2): true
      ].join(" "),
    );
    const notice: LinkMicBattleNotice = {
      noticeType: 6,
      commonGuide: {
        displayText: { key: "k", defaultPattern: "p" },
        exceptAnchor: true,
      },
    };
    expect(decode(bytes)).toStrictEqual(notice);
    expect(toHex(encodeMessage(LinkMicBattleNoticeSchema, notice))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a sign-extended type, a guide seen twice, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "42 02", // common_guide (8), 2 bytes
        "10 01", //   except_anchor (2): true
        "4a 00", // field 9, not read, 0 bytes
        "42 05", // common_guide (8) again, merged: 5 bytes
        "0a 03", //   display_text (1), 3 bytes
        "12 01 70", //     default_pattern (2): "p"
        "10 ff ff ff ff ff ff ff ff ff 01", // notice_type (2): -1
        "71 01 00 00 00 00 00 00 00", // field 14, fixed64, not read
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      noticeType: -1,
      commonGuide: {
        displayText: { key: "", defaultPattern: "p" },
        exceptAnchor: true,
      },
    });
  });
});
