import { describe, expect, it, vi } from "vitest";
import {
  networkFailure,
  signContextFor,
} from "../../test/helpers/fetchStub.js";
import {
  AbortError,
  ConnectorError,
  RateLimitError,
  SignError,
  TimeoutError,
} from "../errors.js";
import { callSigner, toSignerError } from "./call.js";

describe("toSignerError", () => {
  it("keeps a ConnectorError as it is", () => {
    const failure = new RateLimitError("slow down", { retryAfterMs: 5 });
    expect(toSignerError(failure, "The call")).toBe(failure);
  });

  it("turns fetch's AbortError into an AbortError", () => {
    const failure = new DOMException(
      "This operation was aborted",
      "AbortError",
    );
    const error = toSignerError(failure, "The call");
    expect(error).toBeInstanceOf(AbortError);
    expect(error).toMatchObject({
      code: "ABORTED",
      retryable: false,
      message: "The call was aborted",
      cause: failure,
    });
  });

  it("turns fetch's TimeoutError into a TimeoutError of the sign phase", () => {
    const failure = new DOMException(
      "The operation was aborted due to timeout",
      "TimeoutError",
    );
    const error = toSignerError(failure, "The call");
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error).toMatchObject({
      code: "TIMEOUT",
      phase: "sign",
      retryable: true,
      message: "The call timed out: The operation was aborted due to timeout",
      cause: failure,
    });
  });

  it("reads the name of any error, not only DOMExceptions", () => {
    const failure = Object.assign(new Error("gave up"), {
      name: "TimeoutError",
    });
    expect(toSignerError(failure, "The call")).toBeInstanceOf(TimeoutError);
  });

  it("turns anything else into a retryable SignError without a status", () => {
    const failure = networkFailure();
    const error = toSignerError(failure, "The call");
    expect(error).toBeInstanceOf(SignError);
    expect(error).toMatchObject({
      code: "SIGN_FAILED",
      retryable: true,
      status: undefined,
      message:
        "The call failed: connect ECONNREFUSED 127.0.0.1:443 (ECONNREFUSED)",
      cause: failure,
    });
    expect(toSignerError("text", "The call")).toMatchObject({
      code: "SIGN_FAILED",
      message: "The call failed: text",
      cause: "text",
    });
    expect(toSignerError(null, "The call")).toMatchObject({
      code: "SIGN_FAILED",
      message: "The call failed: null",
    });
  });

  it("never throws, even for a value that can't be read", () => {
    // Reading any property of it throws.
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("no reading");
        },
      },
    );
    expect(toSignerError(Object.create(null), "The call")).toMatchObject({
      code: "SIGN_FAILED",
      message: "The call failed: an error that can't be read",
    });
    const error = toSignerError(hostile, "The call");
    expect(error).toBeInstanceOf(SignError);
    expect(error.message).toBe("The call failed: an error that can't be read");
    expect(error.cause === hostile).toBe(true);
  });
});

describe("callSigner", () => {
  it("passes the result of the call through, with the context", async () => {
    const context = signContextFor(vi.fn());
    const call = vi.fn(() => Promise.resolve(1));
    await expect(callSigner("The call", context, call)).resolves.toBe(1);
    expect(call).toHaveBeenCalledWith(context);
  });

  it("passes a ConnectorError through", async () => {
    const context = signContextFor(vi.fn());
    const failure = new SignError("refused", { status: 401 });
    await expect(
      callSigner("The call", context, () => Promise.reject(failure)),
    ).rejects.toBe(failure);
  });

  it("turns what the call rejects with or throws into a ConnectorError", async () => {
    const context = signContextFor(vi.fn());
    const failure = new TypeError("signer bug");
    await expect(
      callSigner("The call", context, () => Promise.reject(failure)),
    ).rejects.toMatchObject({ code: "SIGN_FAILED", cause: failure });
    await expect(
      callSigner("The call", context, () => {
        throw new DOMException("aborted", "AbortError");
      }),
    ).rejects.toBeInstanceOf(AbortError);
  });

  it("refuses to start once the signal aborted", async () => {
    const call = vi.fn();
    const reason = new Error("stop");
    const context = signContextFor(vi.fn(), {
      signal: AbortSignal.abort(reason),
    });
    await expect(callSigner("The call", context, call)).rejects.toMatchObject({
      code: "ABORTED",
      message: "The call was aborted",
      cause: reason,
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("stops waiting when the signal aborts", async () => {
    const controller = new AbortController();
    const context = signContextFor(vi.fn(), { signal: controller.signal });
    const pending = callSigner(
      "The call",
      context,
      () => new Promise(() => {}),
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: "ABORTED",
      message: "The call was aborted",
    });
  });

  it("times out a call that ignores the deadline", async () => {
    const context = signContextFor(vi.fn(), { timeoutMs: 20 });
    await expect(
      callSigner("The call", context, () => new Promise(() => {})),
    ).rejects.toMatchObject({
      name: "TimeoutError",
      phase: "sign",
      message: "The call took longer than 20 ms",
    });
  });

  it("ignores what a call does once it settled", async () => {
    const controller = new AbortController();
    const context = signContextFor(vi.fn(), { signal: controller.signal });
    const late = Promise.withResolvers<number>();
    const pending = callSigner("The call", context, () => late.promise);
    controller.abort();
    late.reject(new Error("too late"));
    const error = await pending.catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ code: "ABORTED" });
  });
});
