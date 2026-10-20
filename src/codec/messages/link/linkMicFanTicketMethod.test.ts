import { describe, expect, it } from "vitest";
import type { LinkMicFanTicketMethod } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { LinkMicFanTicketMethodSchema } from "./linkMicFanTicketMethod.js";
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

// Field numbers: WebcastLinkMicFanTicketMethod, FanTicketRoomNoticeContent
// and UserFanTicket in webcast/model/message/messages.proto. The bytes are
// written field by field (fields.*) or by hand, not from the schema, so a
// wrong number in the table fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(LinkMicFanTicketMethodSchema, bytes);

describe("LinkMicFanTicketMethodSchema", () => {
  it("reads common (1) and fan_ticket_room_notice (2: user_fan_ticket 1 with user_id 1, fan_ticket 2 and match_rank 4; total_linkmic_fan_ticket 2)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastLinkMicFanTicketMethod")),
      fields.message(
        2,
        fields.message(
          1,
          fields.varint(1, 6_900_000_000_000_000_001n),
          fields.varint(2, 1000),
          fields.varint(3, 2000), // match_total_score, not read
          fields.varint(4, 1),
          fields.string(7, "icon"), // icon_name, not read
        ),
        fields.message(1, fields.varint(1, 22), fields.varint(4, 2)),
        fields.varint(2, 1500),
        fields.varint(3, 7_300_000_000_000_000_001n), // match_id, not read
        fields.string(5, "https://p16.example/ticket.png"), // fan_ticket_icon_url, not read
      ),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastLinkMicFanTicketMethod",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      fanTicketRoomNotice: {
        userFanTicket: [
          { userId: "6900000000000000001", fanTicket: 1000, matchRank: 1 },
          { userId: "22", fanTicket: 0, matchRank: 2 },
        ],
        totalLinkmicFanTicket: 1500,
      },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({});
    expect(decode(fields.message(2))).toStrictEqual({
      fanTicketRoomNotice: { userFanTicket: [], totalLinkmicFanTicket: 0 },
    });
  });

  it("round-trips every field through the encoder", () => {
    const tickets: LinkMicFanTicketMethod = {
      common: sampleCommon("WebcastLinkMicFanTicketMethod"),
      fanTicketRoomNotice: {
        userFanTicket: [
          { userId: "6900000000000000001", fanTicket: 99999, matchRank: 1 },
          { userId: "6900000000000000002", fanTicket: 1, matchRank: 2 },
        ],
        totalLinkmicFanTicket: 100000,
      },
    };
    expect(
      decode(encodeMessage(LinkMicFanTicketMethodSchema, tickets)),
    ).toStrictEqual(tickets);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(
        2,
        unknownFields(),
        fields.message(1, unknownFields(), fields.varint(2, 5)),
        fields.varint(2, 5),
      ),
      unknownFields(1_000),
    );
    expect(decode(bytes)).toStrictEqual({
      fanTicketRoomNotice: {
        userFanTicket: [{ userId: "0", fanTicket: 5, matchRank: 0 }],
        totalLinkmicFanTicket: 5,
      },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "12 0a", // fan_ticket_room_notice (2), 10 bytes
        "0a 06", //   user_fan_ticket (1), 6 bytes
        "08 0b", //     user_id (1): 11
        "10 64", //     fan_ticket (2): 100
        "20 01", //     match_rank (4): 1
        "10 64", //   total_linkmic_fan_ticket (2): 100
      ].join(" "),
    );
    const tickets: LinkMicFanTicketMethod = {
      fanTicketRoomNotice: {
        userFanTicket: [{ userId: "11", fanTicket: 100, matchRank: 1 }],
        totalLinkmicFanTicket: 100,
      },
    };
    expect(decode(bytes)).toStrictEqual(tickets);
    expect(toHex(encodeMessage(LinkMicFanTicketMethodSchema, tickets))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a 64-bit id, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "12 17", // fan_ticket_room_notice (2), 23 bytes
        "10 e8 07", //   total_linkmic_fan_ticket (2): 1000
        "18 01", //   match_id (3), not read
        "0a 0e", //   user_fan_ticket (1), 14 bytes
        "20 02", //     match_rank (4): 2
        "08 81 80 c8 b1 93 ae ee e0 5f", //     user_id (1): 6900000000000000001
        "18 05", //     match_total_score (3), not read
        "0a 00", //   user_fan_ticket (1), 0 bytes
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      fanTicketRoomNotice: {
        userFanTicket: [
          { userId: "6900000000000000001", fanTicket: 0, matchRank: 2 },
          { userId: "0", fanTicket: 0, matchRank: 0 },
        ],
        totalLinkmicFanTicket: 1000,
      },
    });
  });
});
