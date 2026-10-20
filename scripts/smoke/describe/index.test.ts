import { describe, expect, it } from "vitest";
import { ConnectorError } from "../../../src/index.js";
import { chatDescribers } from "./chat.js";
import { giftDescribers } from "./gift.js";
import { DESCRIBERS, describeGeneric, describeLive } from "./index.js";
import { linkDescribers } from "./link.js";
import { roomDescribers } from "./room.js";

const common = {
  method: "WebcastRoomMessage",
  msgId: "1",
  roomId: "2",
  createTime: "3",
  isShowMsg: true,
};

describe("DESCRIBERS", () => {
  it("joins the four groups' describers, which don't overlap", () => {
    const groups: readonly Readonly<Record<string, unknown>>[] = [
      chatDescribers,
      giftDescribers,
      linkDescribers,
      roomDescribers,
    ];
    expect(DESCRIBERS).toEqual(Object.assign({}, ...groups));
    const sizes = groups.reduce(
      (sum, group) => sum + Object.keys(group).length,
      0,
    );
    expect(Object.keys(DESCRIBERS)).toHaveLength(sizes);
  });
});

describe("describeGeneric", () => {
  it("prints the display text key, or the method", () => {
    expect(
      describeGeneric({
        common: {
          ...common,
          displayText: { key: "pm_mt_x", defaultPattern: "" },
        },
      }),
    ).toBe("pm_mt_x");
    expect(describeGeneric({ common })).toBe("WebcastRoomMessage");
    expect(
      describeGeneric({
        common: {
          ...common,
          method: "",
          displayText: { key: "", defaultPattern: "" },
        },
      }),
    ).toBe("(no common)");
    expect(describeGeneric({})).toBe("(no common)");
  });

  it("adds the nickname when the payload has a user", () => {
    expect(
      describeGeneric({
        common,
        user: { userId: "1", nickname: " Ana ", displayId: "", badgeList: [] },
      }),
    ).toBe("Ana (WebcastRoomMessage)");
    expect(describeGeneric({ user: undefined })).toBe(
      "(no nickname) (no common)",
    );
    expect(describeGeneric({ user: { nickname: 5 } })).toBe(
      "(no nickname) (no common)",
    );
  });
});

describe("describeLive", () => {
  it("uses the event's describer when it has one", () => {
    expect(
      describeLive("chat", {
        user: { userId: "1", nickname: "Ana", displayId: "", badgeList: [] },
        content: "hi",
        contentLanguage: "",
        emotes: [],
        commentTag: [],
        mentionUsers: [],
      }),
    ).toBe('Ana: "hi"');
  });

  it("falls back to the generic line", () => {
    expect(describeLive("streamEnd", { action: "ended" })).toBe("(no common)");
    expect(describeLive("error", new ConnectorError("INTERNAL", "x"))).toBe(
      "(no common)",
    );
  });
});
