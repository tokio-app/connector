import { describe, expect, it } from "vitest";
import type { NoticeMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { NoticeMessageSchema } from "./notice.js";
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

// Field numbers: WebcastNoticeMessage in webcast/model/message/messages.proto.
// The bytes are written field by field (fields.*) or by hand, not from the
// schema, so a wrong number in the table fails here.

const decode = (bytes: Uint8Array) => decodeMessage(NoticeMessageSchema, bytes);

describe("NoticeMessageSchema", () => {
  it("reads common (1), content (2), notice_type (3), title (5), notice_title (10) and notice_content (11)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastNoticeMessage"),
        fields.varint(4, 1_760_000_000_123),
      ),
      fields.string(2, "Keep it friendly"),
      fields.varint(3, 2),
      fields.string(4, "style"), // style, not read
      fields.message(5, fields.string(1, "k_title"), fields.string(2, "Title")),
      fields.message(6, fields.string(1, "k_reason")), // violation_reason, not read
      fields.message(7, fields.string(1, "k_display")), // display_text, not read
      fields.message(8, fields.string(1, "k_tips")), // tips_title, not read
      fields.string(9, "https://tips"), // tips_url, not read
      fields.message(10, fields.string(1, "k_nt"), fields.string(2, "Notice")),
      fields.message(11, fields.string(1, "k_nc"), fields.string(2, "Body")),
      fields.string(12, "scene"), // scene, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastNoticeMessage",
        msgId: "0",
        roomId: "0",
        createTime: "1760000000123",
        isShowMsg: false,
      },
      content: "Keep it friendly",
      noticeType: 2,
      title: { key: "k_title", defaultPattern: "Title" },
      noticeTitle: { key: "k_nt", defaultPattern: "Notice" },
      noticeContent: { key: "k_nc", defaultPattern: "Body" },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      content: "",
      noticeType: 0,
    });
    expect(decode(fields.message(10)).noticeTitle).toStrictEqual({
      key: "",
      defaultPattern: "",
    });
  });

  it("round-trips every field through the encoder", () => {
    const notice: NoticeMessage = {
      common: sampleCommon("WebcastNoticeMessage"),
      content: "Keep it friendly",
      noticeType: 3,
      title: { key: "k_title", defaultPattern: "Title" },
      noticeTitle: { key: "k_nt", defaultPattern: "Notice" },
      noticeContent: { key: "k_nc", defaultPattern: "Body {0:user}" },
    };
    expect(decode(encodeMessage(NoticeMessageSchema, notice))).toStrictEqual(
      notice,
    );
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(6, 1)),
      fields.varint(3, 1),
      fields.message(5, unknownFields(), fields.string(1, "t")),
      unknownFields(1_000),
      fields.message(11, unknownFields(), fields.string(2, "body")),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: true,
      },
      content: "",
      noticeType: 1,
      title: { key: "t", defaultPattern: "" },
      noticeContent: { key: "", defaultPattern: "body" },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 02 68 69", // content (2): "hi"
        "18 02", // notice_type (3): 2
        "2a 03", // title (5), 3 bytes
        "0a 01 74", //   key (1): "t"
        "52 03", // notice_title (10), 3 bytes
        "0a 01 6e", //   key (1): "n"
        "5a 04", // notice_content (11), 4 bytes
        "12 02 6f 6b", //   default_pattern (2): "ok"
      ].join(" "),
    );
    const notice: NoticeMessage = {
      content: "hi",
      noticeType: 2,
      title: { key: "t", defaultPattern: "" },
      noticeTitle: { key: "n", defaultPattern: "" },
      noticeContent: { key: "", defaultPattern: "ok" },
    };
    expect(decode(bytes)).toStrictEqual(notice);
    expect(toHex(encodeMessage(NoticeMessageSchema, notice))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a negative int32, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "5a 02", // notice_content (11), 2 bytes
        "0a 00", //   key (1): ""
        "18 ff ff ff ff ff ff ff ff ff 01", // notice_type (3): -1
        "22 01 73", // style (4), not read
        "0a 02", // common (1), 2 bytes
        "30 01", //   is_show_msg (6): true
        "45 01 00 00 00", // field 8, fixed32, not read
        "12 04 6f 6c c3 a9", // content (2): "olé"
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: true,
      },
      content: "olé",
      noticeType: -1,
      noticeContent: { key: "", defaultPattern: "" },
    });
  });
});
