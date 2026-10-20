// Polls (WebcastPollMessage). Field numbers: PROTOCOL.md, "Field numbers",
// from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  PollEndContent,
  PollMessage,
  PollOption,
  PollStartContent,
  PollUpdateVotesContent,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema, UserSchema } from "../common.js";

/** `webcast.model.message.PollOptionInfo`: one option. */
const PollOptionSchema = defineSchema<PollOption>("PollOptionInfo", {
  votes: f.count(1),
  displayContent: f.string(2),
  optionIdx: f.int32(3),
});

/** `webcast.model.message.PollStartContent`. */
const PollStartContentSchema = defineSchema<PollStartContent>(
  "PollStartContent",
  {
    startTime: f.id(1),
    endTime: f.id(2),
    optionList: f.repeated.message(3, PollOptionSchema),
    title: f.string(4),
    operator: f.message(5, UserSchema),
  },
);

/** `webcast.model.message.PollEndContent`. `end_type` (1) is a `webcast.model.data.PollEndType`. */
const PollEndContentSchema = defineSchema<PollEndContent>("PollEndContent", {
  endType: f.enum(1),
  optionList: f.repeated.message(2, PollOptionSchema),
});

/** `webcast.model.message.PollUpdateVotesContent`. */
const PollUpdateVotesContentSchema = defineSchema<PollUpdateVotesContent>(
  "PollUpdateVotesContent",
  { optionList: f.repeated.message(2, PollOptionSchema) },
);

/** `WebcastPollMessage`. `message_type` (2) is an int64; `poll_kind` (7) is a `webcast.model.data.PollKind`. */
export const PollMessageSchema = defineSchema<PollMessage>(
  "WebcastPollMessage",
  {
    common: f.message(1, CommonSchema),
    messageType: f.count(2),
    pollId: f.id(3),
    startContent: f.message(4, PollStartContentSchema),
    endContent: f.message(5, PollEndContentSchema),
    updateVotesContent: f.message(6, PollUpdateVotesContentSchema),
    pollKind: f.enum(7),
  },
);
