// How the library calls a Signer (PROTOCOL.md, "Signer"): within the
// context's `timeoutMs` and `signal`, whether the signer watches them or not,
// and with whatever it throws turned into a ConnectorError. A signer can then
// let `fetch`'s errors through instead of wrapping every call.
import {
  AbortError,
  SignError,
  TimeoutError,
  isConnectorError,
  type ConnectorError,
} from "../errors.js";
import { describeFailure } from "../http/client.js";
import type { SignContext } from "./types.js";

// The error's name and description, read without letting a hostile value
// (a throwing getter or toString) break the conversion.
function inspect(error: unknown): { name: unknown; detail: string } {
  try {
    const name =
      typeof error === "object" && error !== null
        ? Reflect.get(error, "name")
        : undefined;
    return { name, detail: describeFailure(error) };
  } catch {
    return { name: undefined, detail: "an error that can't be read" };
  }
}

/**
 * What a signer threw, as the `ConnectorError` the library acts on: a
 * `ConnectorError` as it is; an error named `AbortError` (what `fetch` throws
 * when its signal aborts) as an `AbortError`; one named `TimeoutError` (what
 * `fetch` throws for an `AbortSignal.timeout()`) as a `TimeoutError` with
 * phase `sign`; anything else as a retryable `SignError` without a status.
 * The original is the `cause`.
 */
export function toSignerError(error: unknown, what: string): ConnectorError {
  if (isConnectorError(error)) return error;
  const { name, detail } = inspect(error);
  switch (name) {
    case "AbortError":
      return new AbortError(`${what} was aborted`, { cause: error });
    case "TimeoutError":
      return new TimeoutError(`${what} timed out: ${detail}`, {
        phase: "sign",
        cause: error,
      });
    default:
      return new SignError(`${what} failed: ${detail}`, { cause: error });
  }
}

/**
 * Calls a signer method (`call`, given `context`). Rejects with an
 * `AbortError` when `context.signal` aborts (at once when it has), with a
 * `TimeoutError` (phase `sign`) when the call takes longer than
 * `context.timeoutMs`, and with {@link toSignerError} of whatever the call
 * throws or rejects with. A signer that ignores its context can't hold the
 * library up.
 */
export function callSigner<T>(
  what: string,
  context: SignContext,
  call: (context: SignContext) => Promise<T>,
): Promise<T> {
  const { signal, timeoutMs } = context;
  if (signal.aborted) {
    return Promise.reject(
      new AbortError(`${what} was aborted`, { cause: signal.reason }),
    );
  }
  return new Promise<T>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      finish();
      reject(new AbortError(`${what} was aborted`, { cause: signal.reason }));
    };
    const timer = setTimeout(() => {
      finish();
      reject(
        new TimeoutError(`${what} took longer than ${timeoutMs} ms`, {
          phase: "sign",
        }),
      );
    }, timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    // A call that throws instead of rejecting fails the same way. Once the
    // promise settled, a late answer or failure changes nothing.
    new Promise<T>((run) => run(call(context))).then(
      (value) => {
        finish();
        resolve(value);
      },
      (error: unknown) => {
        finish();
        reject(toSignerError(error, what));
      },
    );
  });
}
