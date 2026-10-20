// Q&A questions (WebcastQuestionNewMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { Question, QuestionNewMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, UserSchema } from "../common.js";

/** `webcast.model.message.Question` [proto: webcast/model/message/messages.proto, line 736]. */
const QuestionSchema = defineSchema<Question>("Question", {
  questionId: f.id(1),
  content: f.string(2),
  answerStatus: f.int32(3),
  createTime: f.id(4),
  user: f.message(5, UserSchema),
});

/**
 * `WebcastQuestionNewMessage` [proto: webcast/model/message/messages.proto,
 * line 1730]. The proto calls field 2 `data`; the payload keeps `details`.
 */
export const QuestionNewMessageSchema = defineSchema<QuestionNewMessage>(
  "WebcastQuestionNewMessage",
  {
    common: f.message(1, CommonSchema),
    details: f.message(2, QuestionSchema),
  },
);
