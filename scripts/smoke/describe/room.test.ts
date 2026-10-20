import { describe, expect, it } from "vitest";
import type { User } from "../../../src/index.js";
import { roomDescribers } from "./room.js";

function user(nickname: string): User {
  return { userId: "1", nickname, displayId: "handle", badgeList: [] };
}

describe("roomDescribers", () => {
  it("describes exactly these events", () => {
    expect(Object.keys(roomDescribers)).toEqual(["roomUser"]);
  });

  it("describes the viewer counts, with the top viewer when there is one", () => {
    expect(
      roomDescribers.roomUser({
        total: 1_500,
        totalUser: 4_500,
        ranks: [{ user: user("Cy"), score: 10, rank: 1 }],
      }),
    ).toBe("1,500 watching, 4,500 so far, top viewer Cy");
    expect(roomDescribers.roomUser({ total: 3, totalUser: 4, ranks: [] })).toBe(
      "3 watching, 4 so far",
    );
  });
});
