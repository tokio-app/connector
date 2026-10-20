import { describe, expect, it } from "vitest";
import type { User } from "../../../src/index.js";
import { chatDescribers } from "./chat.js";

function user(nickname: string): User {
  return { userId: "1", nickname, displayId: "handle", badgeList: [] };
}

const social = { shareType: 0, action: 1, shareTarget: "", shareCount: 0 };

describe("chatDescribers", () => {
  it("describes exactly these events", () => {
    expect(Object.keys(chatDescribers)).toEqual([
      "chat",
      "like",
      "follow",
      "share",
    ]);
  });

  it("quotes a comment, on one line and cut when long", () => {
    expect(
      chatDescribers.chat({
        user: user("Ana"),
        content: "hello\n  there",
        contentLanguage: "",
        emotes: [],
      }),
    ).toBe('Ana: "hello there"');
    expect(
      chatDescribers.chat({
        content: "x".repeat(80),
        contentLanguage: "",
        emotes: [],
      }),
    ).toBe(`(no nickname): "${"x".repeat(59)}…"`);
  });

  it("describes likes, follows and shares", () => {
    expect(
      chatDescribers.like({ user: user("Di"), count: 15, total: 1_234 }),
    ).toBe("Di liked x15, 1,234 in total");
    expect(chatDescribers.follow({ ...social, user: user("Ed") })).toBe(
      "Ed followed",
    );
    expect(chatDescribers.share({ ...social, user: user("Flo") })).toBe(
      "Flo shared",
    );
  });
});
