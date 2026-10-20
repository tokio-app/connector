import { describe, expect, it } from "vitest";
import {
  AbortError,
  ConnectorError,
  ERROR_CODES,
  HttpError,
  InvalidUsernameError,
  OfflineError,
  PremiumFeatureError,
  ProtocolError,
  RateLimitError,
  ReconnectGiveUpError,
  RoomNotFoundError,
  SignError,
  TimeoutError,
  WebSocketError,
  isConnectorError,
} from "./errors.js";

describe("ConnectorError", () => {
  it("carries a code, retryable and cause", () => {
    const cause = new Error("socket hang up");
    const error = new ConnectorError("NETWORK", "Request failed", {
      retryable: true,
      cause,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ConnectorError");
    expect(error.message).toBe("Request failed");
    expect(error.code).toBe("NETWORK");
    expect(error.retryable).toBe(true);
    expect(error.cause).toBe(cause);
  });

  it("isn't retryable and has no cause by default", () => {
    const error = new ConnectorError("INTERNAL", "Bug");
    expect(error.retryable).toBe(false);
    expect("cause" in error).toBe(false);
  });

  it("keeps name off the instance and serializes to JSON", () => {
    const error = new SignError("Sign failed", {
      status: 500,
      requestId: "req-1",
    });
    expect(Object.keys(error)).not.toContain("name");
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: "SignError",
      message: "Sign failed",
      code: "SIGN_FAILED",
      retryable: true,
      status: 500,
      requestId: "req-1",
    });
  });
});

describe("subclasses", () => {
  it.each([
    [
      new InvalidUsernameError("x"),
      "InvalidUsernameError",
      "INVALID_USERNAME",
      false,
    ],
    [new RoomNotFoundError("x"), "RoomNotFoundError", "ROOM_NOT_FOUND", false],
    [new OfflineError("x"), "OfflineError", "OFFLINE", false],
    [new HttpError("x", { status: 503 }), "HttpError", "HTTP", true],
    [new SignError("x"), "SignError", "SIGN_FAILED", true],
    [new RateLimitError("x"), "RateLimitError", "RATE_LIMITED", true],
    [
      new PremiumFeatureError("x"),
      "PremiumFeatureError",
      "PREMIUM_REQUIRED",
      false,
    ],
    [new TimeoutError("x", { phase: "idle" }), "TimeoutError", "TIMEOUT", true],
    [new WebSocketError("x"), "WebSocketError", "WEBSOCKET", true],
    [new ProtocolError("x"), "ProtocolError", "PROTOCOL", true],
    [new AbortError(), "AbortError", "ABORTED", false],
    [
      new ReconnectGiveUpError("x", { attempts: 10 }),
      "ReconnectGiveUpError",
      "RECONNECT_GAVE_UP",
      false,
    ],
  ] as const)(
    "%o has its name, code and default retryable",
    (error, name, code, retryable) => {
      expect(error).toBeInstanceOf(ConnectorError);
      expect(error.name).toBe(name);
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(retryable);
      expect(ERROR_CODES).toContain(code);
    },
  );

  it("keeps the extra fields", () => {
    expect(new OfflineError("x", { roomId: "1" }).roomId).toBe("1");
    expect(new HttpError("x", { status: 404 }).status).toBe(404);
    expect(new TimeoutError("x", { phase: "sign" }).phase).toBe("sign");
    expect(new WebSocketError("x", { closeCode: 1006 }).closeCode).toBe(1006);
    expect(new ReconnectGiveUpError("x", { attempts: 3 }).attempts).toBe(3);
    expect(new RateLimitError("x", { retryAfterMs: 5_000 }).retryAfterMs).toBe(
      5_000,
    );
    expect(new AbortError().message).toBe("The operation was aborted");
  });

  it("derives retryable from the HTTP status", () => {
    expect(new HttpError("x", { status: 429 }).retryable).toBe(true);
    expect(new HttpError("x", { status: 500 }).retryable).toBe(true);
    expect(new HttpError("x", { status: 403 }).retryable).toBe(false);
    expect(new HttpError("x", { status: 403, retryable: true }).retryable).toBe(
      true,
    );
    expect(new SignError("x", { status: 401 }).retryable).toBe(false);
    expect(new SignError("x", { status: 403 }).retryable).toBe(false);
    expect(new SignError("x", { status: 404 }).retryable).toBe(true);
    expect(new SignError("x").status).toBe(undefined);
  });

  it("makes rate limit and premium errors sign errors with their own code", () => {
    const rateLimit = new RateLimitError("x", { requestId: "r" });
    expect(rateLimit).toBeInstanceOf(SignError);
    expect(rateLimit.status).toBe(429);
    expect(rateLimit.requestId).toBe("r");
    const premium = new PremiumFeatureError("x");
    expect(premium).toBeInstanceOf(SignError);
    expect(premium.status).toBe(402);
  });

  it("lets the caller override retryable where it is not fixed", () => {
    expect(new RoomNotFoundError("x", { retryable: true }).retryable).toBe(
      true,
    );
    expect(new OfflineError("x", { retryable: true }).retryable).toBe(true);
    expect(new ProtocolError("x", { retryable: false }).retryable).toBe(false);
    expect(new InvalidUsernameError("x", { retryable: true }).retryable).toBe(
      false,
    );
  });
});

describe("isConnectorError", () => {
  it("accepts instances", () => {
    expect(isConnectorError(new ProtocolError("x"))).toBe(true);
  });

  it("accepts lookalikes from another copy of the library", () => {
    const foreign = Object.assign(new Error("x"), {
      code: "OFFLINE",
      retryable: false,
    });
    expect(isConnectorError(foreign)).toBe(true);
  });

  it("refuses everything else", () => {
    expect(isConnectorError(new Error("x"))).toBe(false);
    expect(
      isConnectorError(Object.assign(new Error("x"), { code: "ECONNRESET" })),
    ).toBe(false);
    expect(
      isConnectorError(
        Object.assign(new Error("x"), { code: "OFFLINE", retryable: "no" }),
      ),
    ).toBe(false);
    expect(isConnectorError({ code: "OFFLINE", retryable: false })).toBe(false);
    expect(isConnectorError(null)).toBe(false);
  });
});
