import { describe, expect, it } from "vitest";
import type { SocialMessage, User } from "../../../src/index.js";
import { chatDescribers } from "./chat.js";

function user(nickname: string): User {
  return { userId: "1", nickname, displayId: "handle", badgeList: [] };
}

const social: SocialMessage = {
  shareType: 0,
  action: 1,
  shareTarget: "",
  followCount: 0,
  shareCount: 0,
  followType: 0,
  targetUserId: "0",
};

describe("chatDescribers", () => {
  it("describes exactly these events", () => {
    expect(Object.keys(chatDescribers)).toEqual([
      "chat",
      "emote",
      "like",
      "social",
      "follow",
      "share",
      "imDelete",
      "roomPin",
      "questionNew",
      "captionMessage",
      "roomMessage",
      "notice",
    ]);
  });

  it("quotes a comment, on one line and cut when long", () => {
    expect(
      chatDescribers.chat({
        user: user("Ana"),
        content: "hello\n  there",
        contentLanguage: "",
        emotes: [],
        mentionUsers: [],
      }),
    ).toBe('Ana: "hello there"');
    expect(
      chatDescribers.chat({
        content: "x".repeat(80),
        contentLanguage: "",
        emotes: [],
        mentionUsers: [],
      }),
    ).toBe(`(no nickname): "${"x".repeat(59)}…"`);
  });

  it("counts the emotes of an emote comment", () => {
    expect(
      chatDescribers.emote({ user: user("Bo"), emoteList: [{ emoteId: "1" }] }),
    ).toBe("Bo sent 1 emote");
    expect(
      chatDescribers.emote({
        emoteList: [{ emoteId: "1" }, { emoteId: "2" }],
      }),
    ).toBe("(no nickname) sent 2 emotes");
  });

  it("describes likes, follows, shares and any social message", () => {
    expect(
      chatDescribers.like({ user: user("Di"), count: 15, total: 1_234 }),
    ).toBe("Di liked x15, 1,234 in total");
    expect(chatDescribers.follow({ ...social, user: user("Ed") })).toBe(
      "Ed followed",
    );
    expect(chatDescribers.share({ ...social, user: user("Flo") })).toBe(
      "Flo shared",
    );
    expect(
      chatDescribers.social({
        ...social,
        user: user("Gus"),
        common: {
          method: "WebcastSocialMessage",
          msgId: "1",
          roomId: "2",
          createTime: "3",
          isShowMsg: true,
          displayText: { key: "pm_mt_guidance_share", defaultPattern: "" },
        },
      }),
    ).toBe("Gus (pm_mt_guidance_share)");
    expect(chatDescribers.social({ ...social, user: user("Gus") })).toBe(
      "Gus (no key)",
    );
  });

  it("counts the deleted comments and their users", () => {
    expect(
      chatDescribers.imDelete({
        deleteMsgIds: ["1", "2"],
        deleteUserIds: ["3"],
      }),
    ).toBe("2 comments deleted, 1 user");
    expect(
      chatDescribers.imDelete({ deleteMsgIds: ["1"], deleteUserIds: [] }),
    ).toBe("1 comment deleted, 0 users");
  });

  it("describes a pin by its operator, action and pinned message", () => {
    const pin = {
      method: "WebcastChatMessage",
      pinTime: "0",
      action: 1,
      pinMsgId: "0",
    };
    expect(
      chatDescribers.roomPin({
        ...pin,
        operator: user("Mod"),
        chatMessage: {
          user: user("Hal"),
          content: "pin me",
          contentLanguage: "",
          emotes: [],
          mentionUsers: [],
        },
      }),
    ).toBe('Mod pinned Hal: "pin me"');
    expect(
      chatDescribers.roomPin({
        ...pin,
        action: 2,
        method: "WebcastGiftMessage",
      }),
    ).toBe("(no nickname) unpinned WebcastGiftMessage");
    expect(chatDescribers.roomPin({ ...pin, action: 7, method: "" })).toBe(
      "(no nickname) (action 7) a message",
    );
  });

  it("describes a question by who asked and what", () => {
    expect(
      chatDescribers.questionNew({
        details: {
          questionId: "1",
          content: "Why?",
          answerStatus: 0,
          createTime: "0",
          user: user("Ian"),
        },
      }),
    ).toBe('Ian asked "Why?"');
    expect(chatDescribers.questionNew({})).toBe('(no nickname) asked ""');
  });

  it("describes a caption by its first language and whether it's final", () => {
    expect(
      chatDescribers.captionMessage({
        timestampMs: "0",
        durationMs: 0,
        content: [
          { lang: "en", content: "hello there" },
          { lang: "es", content: "hola" },
        ],
        definite: true,
      }),
    ).toBe('caption (en): "hello there"');
    expect(
      chatDescribers.captionMessage({
        timestampMs: "0",
        durationMs: 0,
        content: [{ lang: "", content: "hel" }],
        definite: false,
      }),
    ).toBe('caption: "hel", partial');
    expect(
      chatDescribers.captionMessage({
        timestampMs: "0",
        durationMs: 0,
        content: [],
        definite: true,
      }),
    ).toBe('caption: ""');
  });

  it("describes a room message by its scene", () => {
    expect(
      chatDescribers.roomMessage({
        content: "Welcome!",
        scene: "welcome",
        isWelcome: true,
      }),
    ).toBe('welcome: "Welcome!"');
    expect(
      chatDescribers.roomMessage({
        content: "x",
        scene: "s",
        isWelcome: false,
      }),
    ).toBe('s: "x"');
    expect(
      chatDescribers.roomMessage({ content: "x", scene: "", isWelcome: false }),
    ).toBe('room message: "x"');
  });

  it("describes a notice by its type and the first text it has", () => {
    expect(chatDescribers.notice({ content: "Be kind", noticeType: 2 })).toBe(
      'notice type 2: "Be kind"',
    );
    expect(
      chatDescribers.notice({
        content: "",
        noticeType: 3,
        title: { key: "t", defaultPattern: "Title" },
        noticeTitle: { key: "n", defaultPattern: "Notice" },
        noticeContent: { key: "c", defaultPattern: "Body" },
      }),
    ).toBe('notice type 3: "Body"');
    expect(
      chatDescribers.notice({
        content: "",
        noticeType: 3,
        title: { key: "t", defaultPattern: "Title" },
        noticeTitle: { key: "n", defaultPattern: "Notice" },
      }),
    ).toBe('notice type 3: "Notice"');
    expect(
      chatDescribers.notice({
        content: "",
        noticeType: 3,
        title: { key: "t", defaultPattern: "Title" },
      }),
    ).toBe('notice type 3: "Title"');
    expect(chatDescribers.notice({ content: "", noticeType: 0 })).toBe(
      'notice type 0: ""',
    );
  });
});
