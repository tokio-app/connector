import { describe, expect, it } from "vitest";
import type { QuestionNewMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { QuestionNewMessageSchema } from "./questionNew.js";
import {
  concat,
  encodeMessage,
  fields,
  fromHex,
  toHex,
} from "../../../../test/helpers/encoder.js";
import {
  SAMPLE_USER,
  sampleCommon,
  unknownFields,
} from "../../../../test/helpers/samples.js";

// Field numbers: WebcastQuestionNewMessage and Question in
// webcast/model/message/messages.proto. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(QuestionNewMessageSchema, bytes);

describe("QuestionNewMessageSchema", () => {
  it("reads common (1) and data (2) as details: question_id (1), content (2), answer_status (3), create_time (4) and user (5)", () => {
    const bytes = concat(
      fields.message(
        1,
        fields.string(1, "WebcastQuestionNewMessage"),
        fields.varint(4, 1_760_000_000_123),
      ),
      fields.message(
        2,
        fields.varint(1, 7_400_000_000_000_000_001n),
        fields.string(2, "Why?"),
        fields.varint(3, 1),
        fields.varint(4, 1_760_000_000_100),
        fields.message(
          5,
          fields.varint(1, 6_900_000_000_000_000_001n),
          fields.string(3, "Nick"),
        ),
        fields.varint(20, 1), // create_from, not read
        fields.varint(21, 2), // answer_from, not read
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastQuestionNewMessage",
        msgId: "0",
        roomId: "0",
        createTime: "1760000000123",
        isShowMsg: false,
      },
      details: {
        questionId: "7400000000000000001",
        content: "Why?",
        answerStatus: 1,
        createTime: "1760000000100",
        user: {
          userId: "6900000000000000001",
          nickname: "Nick",
          displayId: "",
          badgeList: [],
        },
      },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({});
    expect(decode(fields.message(2)).details).toStrictEqual({
      questionId: "0",
      content: "",
      answerStatus: 0,
      createTime: "0",
    });
  });

  it("round-trips every field through the encoder", () => {
    const question: QuestionNewMessage = {
      common: sampleCommon("WebcastQuestionNewMessage"),
      details: {
        questionId: "7400000000000000001",
        content: "¿Qué tal?",
        answerStatus: 2,
        createTime: "1760000000100",
        user: SAMPLE_USER,
      },
    };
    expect(
      decode(encodeMessage(QuestionNewMessageSchema, question)),
    ).toStrictEqual(question);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(6, 1)),
      fields.message(
        2,
        unknownFields(),
        fields.string(2, "Q"),
        fields.message(5, unknownFields(), fields.string(3, "Ann")),
      ),
      unknownFields(1_000),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: true,
      },
      details: {
        questionId: "0",
        content: "Q",
        answerStatus: 0,
        createTime: "0",
        user: { userId: "0", nickname: "Ann", displayId: "", badgeList: [] },
      },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 0d", // data (2), 13 bytes
        "08 01", //   question_id (1): 1
        "12 03 48 69 3f", //   content (2): "Hi?"
        "18 01", //   answer_status (3): 1
        "2a 02", //   user (5), 2 bytes
        "08 02", //     id (1): 2
      ].join(" "),
    );
    const question: QuestionNewMessage = {
      details: {
        questionId: "1",
        content: "Hi?",
        answerStatus: 1,
        createTime: "0",
        user: { userId: "2", nickname: "", displayId: "", badgeList: [] },
      },
    };
    expect(decode(bytes)).toStrictEqual(question);
    expect(toHex(encodeMessage(QuestionNewMessageSchema, question))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a 64-bit timestamp, a negative int32, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "12 13", // data (2), 19 bytes
        "20 81 80 90 cf b0 99 85 d9 66", //   create_time (4): 7400000000000000001
        "18 ff ff ff ff 0f", //   answer_status (3): -1
        "a0 01 01", //   create_from (20), not read
        "0a 02", // common (1), 2 bytes
        "30 01", //   is_show_msg (6): true
        "45 01 00 00 00", // field 8, fixed32, not read
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
      details: {
        questionId: "0",
        content: "",
        answerStatus: -1,
        createTime: "7400000000000000001",
      },
    });
  });
});
