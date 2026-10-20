// Sample values for the LIVE message tests: an image, a user and common data
// with every field the tables read set, and fields of every wire type that
// none of the tables reads.
import { WireType } from "../../src/codec/reader.js";
import type { Common, Image, User } from "../../src/events.js";
import {
  concat,
  fixed32,
  fixed64,
  fromHex,
  unknownField,
  varint,
} from "./encoder.js";

/** An image with every field the library reads set. */
export const SAMPLE_IMAGE: Image = {
  urlList: ["https://p16.example/a.webp", "https://p19.example/a.webp"],
  uri: "tos/a",
};

/** A user with every field the library reads set, badges included. */
export const SAMPLE_USER: User = {
  userId: "6900000000000000001",
  nickname: "Nick Name",
  displayId: "nick.name",
  avatarThumb: SAMPLE_IMAGE,
  badgeList: [
    {
      combine: { icon: { urlList: [], uri: "webcast/fans_badge_lv12" } },
      privilegeLogExtra: { level: "12" },
    },
    { privilegeLogExtra: { level: "3" } },
  ],
};

/** Common data of a `method` message, with every field the library reads set. */
export function sampleCommon(method: string, key = "pm_mt_sample"): Common {
  return {
    method,
    msgId: "7400000000000000001",
    roomId: "7140000000000000001",
    createTime: "1760000000123",
    isShowMsg: true,
    displayText: { key, defaultPattern: "{0:user}" },
  };
}

/**
 * One field of each wire type (varint, fixed64, length-delimited, group,
 * fixed32), numbered from `from` up. No table reads them, so a decoder must
 * skip them wherever they are.
 */
export function unknownFields(from = 900): Uint8Array {
  return concat(
    unknownField(from, WireType.VARINT, varint(-1)),
    unknownField(from + 1, WireType.I64, fixed64(-1n)),
    unknownField(from + 2, WireType.LEN, fromHex("0a 01 78")),
    unknownField(
      from + 3,
      WireType.SGROUP,
      unknownField(1, WireType.VARINT, varint(1)),
    ),
    unknownField(from + 4, WireType.I32, fixed32(1)),
  );
}
