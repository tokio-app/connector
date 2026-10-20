import { afterEach, describe, expect, it, vi } from "vitest";
import { InvalidUsernameError } from "./errors.js";
import { consoleLogger } from "./logger.js";
import {
  DEFAULT_GIFT_OPTIONS,
  DEFAULT_OPTIONS,
  DEFAULT_TARGET_IDC,
  normalizeUsername,
  resolveOptions,
  type ConnectOptions,
} from "./options.js";
import type { Signer } from "./signer/types.js";

describe("normalizeUsername", () => {
  it.each([
    ["username", "username"],
    ["@username", "username"],
    ["  @user.name_1  ", "user.name_1"],
    ["User.Name", "User.Name"],
    ["https://www.tiktok.com/@username/live", "username"],
    ["https://www.tiktok.com/@username/live?lang=en", "username"],
    ["http://tiktok.com/@username", "username"],
    ["HTTPS://WWW.TIKTOK.COM/@username", "username"],
    ["https://m.tiktok.com/@username#top", "username"],
    ["www.tiktok.com/@username/", "username"],
    ["tiktok.com/@username", "username"],
    ["username/live", "username"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeUsername(input)).toBe(expected);
  });

  it.each([
    ["", "No username"],
    ["   ", "No username"],
    ["@", "No username"],
    ["https://www.tiktok.com/", "No username"],
    ["https://www.tiktok.com/@", "No username"],
    ["user name", "isn't a TikTok username"],
    ["@@username", "isn't a TikTok username"],
    ["https://www.youtube.com/@username", "isn't a TikTok username"],
    ["user:name", "isn't a TikTok username"],
  ])("refuses %j", (input, message) => {
    expect(() => normalizeUsername(input)).toThrow(InvalidUsernameError);
    expect(() => normalizeUsername(input)).toThrow(message);
  });

  it("refuses a value that isn't a string", () => {
    const call = () => normalizeUsername(42 as unknown as string);
    expect(call).toThrow(InvalidUsernameError);
    expect(call).toThrow("must be a string, got number");
  });

  it("throws errors with the INVALID_USERNAME code", () => {
    try {
      normalizeUsername("");
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: "INVALID_USERNAME",
        retryable: false,
      });
    }
  });
});

describe("DEFAULT_OPTIONS", () => {
  it("holds the documented defaults, frozen", () => {
    expect(DEFAULT_OPTIONS).toEqual({
      processInitialData: false,
      reconnect: {
        maxAttempts: 10,
        baseDelayMs: 1_000,
        maxDelayMs: 30_000,
        factor: 2,
        checkLiveBeforeRetry: true,
      },
      heartbeatIntervalMs: 10_000,
      idleTimeoutMs: 30_000,
      connectTimeoutMs: 20_000,
      requestTimeoutMs: 10_000,
      dedupeSize: 2_048,
    });
    expect(Object.isFrozen(DEFAULT_OPTIONS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_OPTIONS.reconnect)).toBe(true);
    expect(DEFAULT_GIFT_OPTIONS).toEqual({ region: "US", language: "en-US" });
    expect(DEFAULT_TARGET_IDC).toBe("useast1a");
  });
});

describe("resolveOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies the defaults", () => {
    const resolved = resolveOptions();
    expect(resolved).toEqual({
      signer: undefined,
      session: undefined,
      roomId: undefined,
      processInitialData: false,
      reconnect: DEFAULT_OPTIONS.reconnect,
      heartbeatIntervalMs: 10_000,
      idleTimeoutMs: 30_000,
      connectTimeoutMs: 20_000,
      requestTimeoutMs: 10_000,
      dedupeSize: 2_048,
      clientParams: {},
      headers: {},
      fetch: expect.any(Function),
      signal: undefined,
      logger: consoleLogger,
    });
  });

  it("keeps what the caller set", () => {
    const signer: Signer = { fetchConnect: vi.fn() };
    const logger = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const signal = new AbortController().signal;
    const options: ConnectOptions = {
      signer,
      roomId: " 7140000000000000001 ",
      processInitialData: true,
      reconnect: { maxAttempts: Infinity, baseDelayMs: 0, factor: 1.5 },
      heartbeatIntervalMs: 5_000,
      idleTimeoutMs: 0,
      connectTimeoutMs: 1,
      requestTimeoutMs: 2,
      dedupeSize: 0,
      clientParams: { aid: "1234" },
      headers: { "User-Agent": "test" },
      fetch,
      signal,
      logger,
    };
    const resolved = resolveOptions(options);
    expect(resolved).toMatchObject({
      signer,
      roomId: "7140000000000000001",
      processInitialData: true,
      reconnect: {
        maxAttempts: Infinity,
        baseDelayMs: 0,
        maxDelayMs: 30_000,
        factor: 1.5,
        checkLiveBeforeRetry: true,
      },
      heartbeatIntervalMs: 5_000,
      idleTimeoutMs: 0,
      connectTimeoutMs: 1,
      requestTimeoutMs: 2,
      dedupeSize: 0,
      clientParams: { aid: "1234" },
      headers: { "User-Agent": "test" },
      fetch,
      signal,
      logger,
    });
    expect(Object.isFrozen(resolved.reconnect)).toBe(true);
  });

  it("copies clientParams and headers", () => {
    const clientParams = { aid: "1" };
    const resolved = resolveOptions({ clientParams });
    clientParams.aid = "2";
    expect(resolved.clientParams).toEqual({ aid: "1" });
    expect(Object.isFrozen(resolved.clientParams)).toBe(true);
    expect(Object.isFrozen(resolved.headers)).toBe(true);
  });

  it("turns reconnect off with false", () => {
    expect(resolveOptions({ reconnect: false }).reconnect).toBe(false);
  });

  it("fills the session's tt-target-idc and drops an empty session", () => {
    expect(resolveOptions({ session: { sessionId: " abc " } }).session).toEqual(
      { sessionId: "abc", ttTargetIdc: DEFAULT_TARGET_IDC },
    );
    expect(
      resolveOptions({ session: { sessionId: "abc", ttTargetIdc: " alisg " } })
        .session,
    ).toEqual({ sessionId: "abc", ttTargetIdc: "alisg" });
    expect(
      resolveOptions({ session: { sessionId: "abc", ttTargetIdc: "" } })
        .session,
    ).toEqual({ sessionId: "abc", ttTargetIdc: DEFAULT_TARGET_IDC });
    expect(resolveOptions({ session: { sessionId: "  " } }).session).toBe(
      undefined,
    );
  });

  it("treats a blank roomId as unset and refuses one that isn't numeric", () => {
    expect(resolveOptions({ roomId: "  " }).roomId).toBe(undefined);
    expect(() => resolveOptions({ roomId: "abc" })).toThrow(TypeError);
    expect(() => resolveOptions({ roomId: "12a" })).toThrow(
      'roomId must be a numeric string, got "12a"',
    );
  });

  it.each<[ConnectOptions, string]>([
    [
      { heartbeatIntervalMs: 0 },
      "heartbeatIntervalMs must be a number above 0, got 0",
    ],
    [{ heartbeatIntervalMs: Infinity }, "heartbeatIntervalMs"],
    [{ heartbeatIntervalMs: Number.NaN }, "got NaN"],
    [
      { idleTimeoutMs: -1 },
      "idleTimeoutMs must be a number of at least 0, got -1",
    ],
    [{ connectTimeoutMs: 0 }, "connectTimeoutMs"],
    [{ requestTimeoutMs: -5 }, "requestTimeoutMs"],
    [{ dedupeSize: 1.5 }, "dedupeSize must be a whole number of at least 0"],
    [{ dedupeSize: "10" as unknown as number }, "got 10"],
    [{ reconnect: { maxAttempts: -1 } }, "reconnect.maxAttempts"],
    [{ reconnect: { maxAttempts: 1.5 } }, "reconnect.maxAttempts"],
    [{ reconnect: { baseDelayMs: -1 } }, "reconnect.baseDelayMs"],
    [
      { reconnect: { baseDelayMs: 2_000, maxDelayMs: 1_000 } },
      "reconnect.maxDelayMs",
    ],
    [{ reconnect: { maxDelayMs: Infinity } }, "reconnect.maxDelayMs"],
    [
      { reconnect: { factor: 0.5 } },
      "reconnect.factor must be a number of at least 1",
    ],
    [
      { reconnect: { checkLiveBeforeRetry: "yes" as unknown as boolean } },
      "reconnect.checkLiveBeforeRetry must be a boolean, got yes",
    ],
  ])("refuses %j", (options, message) => {
    expect(() => resolveOptions(options)).toThrow(RangeError);
    expect(() => resolveOptions(options)).toThrow(message);
  });

  it("calls the global fetch at request time by default", async () => {
    const { fetch } = resolveOptions();
    const stub = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", stub);

    const response = await fetch("https://example.com/", { method: "GET" });

    expect(await response.text()).toBe("ok");
    expect(stub).toHaveBeenCalledWith("https://example.com/", {
      method: "GET",
    });
  });
});
