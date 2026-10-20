import { describe, expect, it, vi } from "vitest";
import { TikTokLiveConnection } from "./connection.js";
import { InvalidUsernameError } from "./errors.js";
import type { Signer } from "./signer/types.js";

// connect(), disconnect() and fetchGifts() are T3's (Phase 1); these cover
// the parts frozen in Phase 0B.

describe("TikTokLiveConnection", () => {
  it("normalizes the username and starts idle", () => {
    const connection = new TikTokLiveConnection(
      "https://www.tiktok.com/@someone/live",
    );
    expect(connection.username).toBe("someone");
    expect(connection.state).toBe("idle");
    expect(connection.roomId).toBe(null);
  });

  it("takes the room id from the options", () => {
    const connection = new TikTokLiveConnection("someone", {
      roomId: "7140000000000000001",
    });
    expect(connection.roomId).toBe("7140000000000000001");
  });

  it("throws for an invalid username or option", () => {
    expect(() => new TikTokLiveConnection("@")).toThrow(InvalidUsernameError);
    expect(
      () => new TikTokLiveConnection("someone", { heartbeatIntervalMs: 0 }),
    ).toThrow(RangeError);
  });

  it("logs a listener that throws instead of breaking the emit", () => {
    const logger = vi.fn();
    const connection = new TikTokLiveConnection("someone", { logger });
    const failure = new Error("listener failed");
    connection.on("streamEnd", () => {
      throw failure;
    });

    connection.emit("streamEnd", { action: "ended" });

    expect(logger).toHaveBeenCalledWith(
      "error",
      'A listener of the "streamEnd" event threw',
      { error: failure },
    );
  });

  it("rejects until Phase 1 implements it", async () => {
    const signer: Signer = { fetchConnect: vi.fn() };
    const connection = new TikTokLiveConnection("someone", { signer });
    await expect(connection.connect()).rejects.toMatchObject({
      code: "NOT_IMPLEMENTED",
    });
    await expect(connection.disconnect()).rejects.toMatchObject({
      code: "NOT_IMPLEMENTED",
    });
    await expect(connection.fetchGifts({ region: "DE" })).rejects.toMatchObject(
      { code: "NOT_IMPLEMENTED" },
    );
  });
});
