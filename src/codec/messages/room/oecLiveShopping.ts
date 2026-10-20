// Shopping events (WebcastOecLiveShoppingMessage). Field numbers:
// PROTOCOL.md, "Field numbers", from
// reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type {
  OecLiveShoppingMessage,
  PopProduct,
  ProductSnapShot,
} from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import { CommonSchema } from "../common.js";

/** `webcast.model.message.ext.PopProduct`: the pinned product. */
const PopProductSchema = defineSchema<PopProduct>("PopProduct", {
  title: f.string(1),
  price: f.string(2),
  imageUrl: f.string(3),
  productId: f.id(6),
});

/** `webcast.model.message.ProductSnapShot`. Its `product_id` (1) is a string on the wire. */
const ProductSnapShotSchema = defineSchema<ProductSnapShot>("ProductSnapShot", {
  productId: f.string(1),
  title: f.string(2),
});

/** `WebcastOecLiveShoppingMessage` [proto: webcast/model/message/ext.proto]. */
export const OecLiveShoppingMessageSchema =
  defineSchema<OecLiveShoppingMessage>("WebcastOecLiveShoppingMessage", {
    common: f.message(1, CommonSchema),
    actionType: f.int32(2),
    liveProductNumber: f.int32(3),
    popProduct: f.message(4, PopProductSchema),
    productSnapShot: f.message(9, ProductSnapShotSchema),
  });
