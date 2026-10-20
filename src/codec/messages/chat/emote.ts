// Emote-only comments (WebcastEmoteChatMessage). Field numbers: PROTOCOL.md,
// "Field numbers", from reference/src/TikTok-Webcast-Protobuf/src/slim/v3.
import type { EmoteChatMessage } from "../../../events/index.js";
import { defineSchema, f } from "../../schema.js";
import {
  CommonSchema,
  MsgFilterSchema,
  UserIdentitySchema,
  UserSchema,
} from "../common.js";
import { EmoteSchema } from "./chat.js";

/** `WebcastEmoteChatMessage` [proto: webcast/model/message/messages.proto, line 1200]. */
export const EmoteChatMessageSchema = defineSchema<EmoteChatMessage>(
  "WebcastEmoteChatMessage",
  {
    common: f.message(1, CommonSchema),
    user: f.message(2, UserSchema),
    emoteList: f.repeated.message(3, EmoteSchema),
    msgFilter: f.message(4, MsgFilterSchema),
    userIdentity: f.message(5, UserIdentitySchema),
  },
);
