import { describe, expect, it, vi } from "vitest";
import {
  PollEndType,
  PollKind,
  type PollMessage,
} from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { PollMessageSchema } from "./poll.js";
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

// Field numbers: WebcastPollMessage, PollStartContent, PollEndContent,
// PollUpdateVotesContent and PollOptionInfo in
// webcast/model/message/messages.proto; end_type (1) is a
// webcast.model.data.PollEndType, poll_kind (7) a webcast.model.data.PollKind.
// The bytes are written field by field (fields.*) or by hand, not from the
// schema, so a wrong number in the table fails here.

const decode = (bytes: Uint8Array) => decodeMessage(PollMessageSchema, bytes);

const EMPTY_OPTION = { votes: 0, displayContent: "", optionIdx: 0 };

describe("the poll constants", () => {
  it("have the values of webcast.model.data.PollKind and PollEndType", () => {
    expect(PollKind).toEqual({
      NORMAL: 0,
      GIFT: 1,
      CUSTOMIZABLE: 2,
      CUSTOMIZABLE_GIFT: 3,
      QUICK_GIFT: 4,
      EMOTE: 5,
    });
    expect(PollEndType).toEqual({
      BY_TIME: 0,
      BY_OWNER: 1,
      BY_OTHER: 2,
      BY_ADMIN: 3,
    });
    expect(Object.isFrozen(PollKind)).toBe(true);
    expect(Object.isFrozen(PollEndType)).toBe(true);
  });
});

describe("PollMessageSchema", () => {
  it("reads common (1), message_type (2), poll_id (3), start_content (4), end_content (5), update_votes_content (6) and poll_kind (7)", () => {
    // A PollOptionInfo's fields, for an option_list entry.
    const option = (votes: number, content: string, idx: number) =>
      concat(
        fields.varint(1, votes),
        fields.string(2, content),
        fields.varint(3, idx),
        fields.message(4, fields.varint(1, 1)), // vote_user_list, not read
      );
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastPollMessage")),
      fields.varint(2, 1),
      fields.varint(3, 7_300_000_000_000_000_001n),
      fields.message(
        4,
        fields.varint(1, 1_760_000_000_000n),
        fields.varint(2, 1_760_000_060_000n),
        fields.message(3, option(2, "Yes", 1)),
        fields.message(3, option(1, "No", 2)),
        fields.string(4, "Pizza?"),
        fields.message(5, fields.string(3, "Host")),
      ),
      fields.message(
        5,
        fields.varint(1, 1),
        fields.message(2, option(5, "Yes", 1)),
        fields.message(3, fields.string(3, "Host")), // operator, not read
      ),
      fields.message(
        6,
        fields.message(2, option(3, "No", 2)),
        fields.message(3, fields.string(3, "Host")), // operator, not read
      ),
      fields.varint(7, 1),
      fields.message(8, fields.varint(1, 1)), // poll_basic_info, not read
      fields.message(9, fields.varint(1, 1)), // template_content, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastPollMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      messageType: 1,
      pollId: "7300000000000000001",
      startContent: {
        startTime: "1760000000000",
        endTime: "1760000060000",
        optionList: [
          { votes: 2, displayContent: "Yes", optionIdx: 1 },
          { votes: 1, displayContent: "No", optionIdx: 2 },
        ],
        title: "Pizza?",
        operator: {
          userId: "0",
          nickname: "Host",
          displayId: "",
          badgeList: [],
        },
      },
      endContent: {
        endType: 1,
        optionList: [{ votes: 5, displayContent: "Yes", optionIdx: 1 }],
      },
      updateVotesContent: {
        optionList: [{ votes: 3, displayContent: "No", optionIdx: 2 }],
      },
      pollKind: 1,
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      messageType: 0,
      pollId: "0",
      pollKind: 0,
    });
    expect(
      decode(
        concat(
          fields.message(4, fields.message(3)),
          fields.message(5),
          fields.message(6, fields.message(2)),
        ),
      ),
    ).toStrictEqual({
      messageType: 0,
      pollId: "0",
      startContent: {
        startTime: "0",
        endTime: "0",
        optionList: [EMPTY_OPTION],
        title: "",
      },
      endContent: { endType: 0, optionList: [] },
      updateVotesContent: { optionList: [EMPTY_OPTION] },
      pollKind: 0,
    });
  });

  it("round-trips every field through the encoder", () => {
    const poll: PollMessage = {
      common: sampleCommon("WebcastPollMessage"),
      messageType: 2,
      pollId: "7300000000000000001",
      startContent: {
        startTime: "1760000000000",
        endTime: "1760000060000",
        optionList: [
          { votes: 0, displayContent: "Yes", optionIdx: 1 },
          { votes: 0, displayContent: "No", optionIdx: 2 },
        ],
        title: "Pizza?",
        operator: SAMPLE_USER,
      },
      endContent: {
        endType: PollEndType.BY_OWNER,
        optionList: [{ votes: 9, displayContent: "Yes", optionIdx: 1 }],
      },
      updateVotesContent: {
        optionList: [{ votes: 4, displayContent: "No", optionIdx: 2 }],
      },
      pollKind: PollKind.GIFT,
    };
    expect(decode(encodeMessage(PollMessageSchema, poll))).toStrictEqual(poll);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(4, 1_000)),
      fields.message(
        4,
        unknownFields(),
        fields.message(3, unknownFields(), fields.varint(1, 2)),
        fields.message(5, unknownFields(), fields.string(3, "Ann")),
        fields.string(4, "Q"),
      ),
      fields.message(
        5,
        unknownFields(),
        fields.message(2, unknownFields(), fields.varint(3, 1)),
      ),
      fields.message(
        6,
        unknownFields(),
        fields.message(2, unknownFields(), fields.string(2, "A")),
      ),
      unknownFields(1_000),
      fields.varint(7, 5),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: false,
      },
      messageType: 0,
      pollId: "0",
      startContent: {
        startTime: "0",
        endTime: "0",
        optionList: [{ ...EMPTY_OPTION, votes: 2 }],
        title: "Q",
        operator: {
          userId: "0",
          nickname: "Ann",
          displayId: "",
          badgeList: [],
        },
      },
      endContent: {
        endType: 0,
        optionList: [{ ...EMPTY_OPTION, optionIdx: 1 }],
      },
      updateVotesContent: {
        optionList: [{ ...EMPTY_OPTION, displayContent: "A" }],
      },
      pollKind: 5,
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 01", // message_type (2): 1
        "18 07", // poll_id (3): 7
        "22 18", // start_content (4), 24 bytes
        "08 0a", //   start_time (1): 10
        "10 14", //   end_time (2): 20
        "1a 07", //   option_list (3), 7 bytes
        "08 02", //     votes (1): 2
        "12 01 41", //     display_content (2): "A"
        "18 01", //     option_idx (3): 1
        "1a 02", //   option_list (3), 2 bytes
        "18 02", //     option_idx (3): 2
        "22 01 51", //   title (4): "Q"
        "2a 02", //   operator (5), 2 bytes
        "08 01", //     id (1): 1
        "2a 06", // end_content (5), 6 bytes
        "08 01", //   end_type (1): 1, by the owner
        "12 02", //   option_list (2), 2 bytes
        "08 03", //     votes (1): 3
        "32 04", // update_votes_content (6), 4 bytes
        "12 02", //   option_list (2), 2 bytes
        "08 04", //     votes (1): 4
        "38 01", // poll_kind (7): 1, gift
      ].join(" "),
    );
    const poll: PollMessage = {
      messageType: 1,
      pollId: "7",
      startContent: {
        startTime: "10",
        endTime: "20",
        optionList: [
          { votes: 2, displayContent: "A", optionIdx: 1 },
          { ...EMPTY_OPTION, optionIdx: 2 },
        ],
        title: "Q",
        operator: { userId: "1", nickname: "", displayId: "", badgeList: [] },
      },
      endContent: { endType: 1, optionList: [{ ...EMPTY_OPTION, votes: 3 }] },
      updateVotesContent: { optionList: [{ ...EMPTY_OPTION, votes: 4 }] },
      pollKind: 1,
    };
    expect(decode(bytes)).toStrictEqual(poll);
    expect(toHex(encodeMessage(PollMessageSchema, poll))).toBe(toHex(bytes));
  });

  it("reads hand-assembled bytes with unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "38 02", // poll_kind (7): 2, customizable
        "42 02 08 01", // poll_basic_info (8), not read
        "32 08", // update_votes_content (6), 8 bytes
        "1a 02 08 01", //   operator (3), not read
        "12 02", //   option_list (2), 2 bytes
        "18 03", //     option_idx (3): 3
        "18 ff ff ff ff ff ff ff ff ff 01", // poll_id (3): -1 as a uint64
        "10 02", // message_type (2): 2
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      messageType: 2,
      pollId: "18446744073709551615",
      updateVotesContent: { optionList: [{ ...EMPTY_OPTION, optionIdx: 3 }] },
      pollKind: 2,
    });
  });

  it("reports counts (int64) past Number.MAX_SAFE_INTEGER, with their paths", () => {
    const onUnsafeInteger = vi.fn();
    const unsafe = 2n ** 60n;
    const poll = decodeMessage(
      PollMessageSchema,
      concat(
        fields.varint(2, unsafe),
        fields.message(5, fields.message(2, fields.varint(1, unsafe))),
      ),
      { onUnsafeInteger },
    );
    expect(poll).toStrictEqual({
      messageType: 2 ** 60,
      pollId: "0",
      endContent: {
        endType: 0,
        optionList: [{ ...EMPTY_OPTION, votes: 2 ** 60 }],
      },
      pollKind: 0,
    });
    expect(onUnsafeInteger.mock.calls).toEqual([
      ["WebcastPollMessage.messageType", unsafe],
      ["PollOptionInfo.votes", unsafe],
    ]);
  });
});
