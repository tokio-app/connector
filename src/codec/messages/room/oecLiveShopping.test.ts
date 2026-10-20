import { describe, expect, it } from "vitest";
import type { OecLiveShoppingMessage } from "../../../events/index.js";
import { decodeMessage } from "../../decode.js";
import { OecLiveShoppingMessageSchema } from "./oecLiveShopping.js";
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

// Field numbers: WebcastOecLiveShoppingMessage and PopProduct in
// webcast/model/message/ext.proto, ProductSnapShot in
// webcast/model/message/messages.proto. The bytes are written field by field
// (fields.*) or by hand, not from the schema, so a wrong number in the table
// fails here.

const decode = (bytes: Uint8Array) =>
  decodeMessage(OecLiveShoppingMessageSchema, bytes);

describe("OecLiveShoppingMessageSchema", () => {
  it("reads common (1), action_type (2), live_product_number (3), pop_product (4: title 1, price 2, image_url 3, product_id 6) and product_snap_shot (9: product_id 1, title 2)", () => {
    const bytes = concat(
      fields.message(1, fields.string(1, "WebcastOecLiveShoppingMessage")),
      fields.varint(2, 2),
      fields.varint(3, 12),
      fields.message(
        4,
        fields.string(1, "Mug"),
        fields.string(2, "$9.99"),
        fields.string(3, "https://p16.example/mug.webp"),
        fields.string(4, "https://shop.example/mug"), // open_url, not read
        fields.string(5, "1"), // product_type, not read
        fields.varint(6, 1_730_000_000_000_000_001n),
        fields.string(7, "shop"), // source, not read
        fields.varint(8, 1), // source_from, not read
        fields.varint(11, 1), // product_status, not read
      ),
      fields.message(5, fields.varint(1, 1_760_000_000)), // trace_info, not read
      fields.message(6, fields.string(1, "1"), fields.varint(2, 3)), // hot_tags, not read
      fields.message(
        9,
        fields.string(1, "1730000000000000001"),
        fields.string(2, "Mug"),
        fields.message(3, fields.string(1, "tos/cover")), // cover, not read
        fields.varint(4, 1), // stock_type, not read
        fields.varint(5, 1_760_000_000), // timestamp, not read
      ),
      fields.varint(10, 3_000), // pin_card_delay_time, not read
      fields.varint(12, 1), // card_type, not read
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "WebcastOecLiveShoppingMessage",
        msgId: "0",
        roomId: "0",
        createTime: "0",
        isShowMsg: false,
      },
      actionType: 2,
      liveProductNumber: 12,
      popProduct: {
        title: "Mug",
        price: "$9.99",
        imageUrl: "https://p16.example/mug.webp",
        productId: "1730000000000000001",
      },
      productSnapShot: { productId: "1730000000000000001", title: "Mug" },
    });
  });

  it("leaves out what the message leaves out", () => {
    expect(decode(new Uint8Array(0))).toStrictEqual({
      actionType: 0,
      liveProductNumber: 0,
    });
    expect(decode(concat(fields.message(4), fields.message(9)))).toStrictEqual({
      actionType: 0,
      liveProductNumber: 0,
      popProduct: { title: "", price: "", imageUrl: "", productId: "0" },
      productSnapShot: { productId: "", title: "" },
    });
  });

  it("round-trips every field through the encoder", () => {
    const shopping: OecLiveShoppingMessage = {
      common: sampleCommon("WebcastOecLiveShoppingMessage"),
      actionType: 1,
      liveProductNumber: 7,
      popProduct: {
        title: "Mug",
        price: "€9,99",
        imageUrl: "https://p16.example/mug.webp",
        productId: "1730000000000000001",
      },
      productSnapShot: { productId: "p-1", title: "Mug" },
    };
    expect(
      decode(encodeMessage(OecLiveShoppingMessageSchema, shopping)),
    ).toStrictEqual(shopping);
  });

  it("skips fields it doesn't read, of every wire type, at every level", () => {
    const bytes = concat(
      unknownFields(),
      fields.message(1, unknownFields(), fields.varint(4, 1_000)),
      fields.message(4, unknownFields(), fields.string(2, "$1")),
      unknownFields(1_000),
      fields.message(9, unknownFields(), fields.string(1, "p")),
      fields.varint(3, 4),
    );
    expect(decode(bytes)).toStrictEqual({
      common: {
        method: "",
        msgId: "0",
        roomId: "0",
        createTime: "1000",
        isShowMsg: false,
      },
      actionType: 0,
      liveProductNumber: 4,
      popProduct: { title: "", price: "$1", imageUrl: "", productId: "0" },
      productSnapShot: { productId: "p", title: "" },
    });
  });

  it("reads hand-assembled bytes, which the encoder writes the same", () => {
    const bytes = fromHex(
      [
        "10 02", // action_type (2): 2
        "18 05", // live_product_number (3): 5
        "22 0c", // pop_product (4), 12 bytes
        "0a 01 54", //   title (1): "T"
        "12 02 24 35", //   price (2): "$5"
        "1a 01 75", //   image_url (3): "u"
        "30 09", //   product_id (6): 9
        "4a 06", // product_snap_shot (9), 6 bytes
        "0a 01 31", //   product_id (1): "1"
        "12 01 54", //   title (2): "T"
      ].join(" "),
    );
    const shopping: OecLiveShoppingMessage = {
      actionType: 2,
      liveProductNumber: 5,
      popProduct: { title: "T", price: "$5", imageUrl: "u", productId: "9" },
      productSnapShot: { productId: "1", title: "T" },
    };
    expect(decode(bytes)).toStrictEqual(shopping);
    expect(toHex(encodeMessage(OecLiveShoppingMessageSchema, shopping))).toBe(
      toHex(bytes),
    );
  });

  it("reads hand-assembled bytes with a negative int32, unknown fields and fields out of order", () => {
    const bytes = fromHex(
      [
        "4a 03", // product_snap_shot (9), 3 bytes
        "12 01 54", //   title (2): "T"
        "2a 02 08 01", // trace_info (5), not read
        "10 ff ff ff ff ff ff ff ff ff 01", // action_type (2): -1
        "32 03 0a 01 31", // hot_tags (6), not read
        "22 0b", // pop_product (4), 11 bytes
        "30 ff ff ff ff ff ff ff ff ff 01", //   product_id (6): -1 as a uint64
        "18 03", // live_product_number (3): 3
      ].join(" "),
    );
    expect(decode(bytes)).toStrictEqual({
      actionType: -1,
      liveProductNumber: 3,
      popProduct: {
        title: "",
        price: "",
        imageUrl: "",
        productId: "18446744073709551615",
      },
      productSnapShot: { productId: "", title: "T" },
    });
  });
});
