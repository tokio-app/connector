// A stubbed `fetch` for the HTTP client, room and signer tests: it records
// every request and answers from a handler, so no test touches the network.
import { vi, type Mock } from "vitest";
import type { Logger } from "../../src/logger.js";
import type { SignContext } from "../../src/signer/types.js";

/** A request the stubbed `fetch` received. */
export interface StubRequest {
  url: URL;
  method: string;
  headers: Headers;
  signal: AbortSignal | undefined;
}

/** Answers a request: a response, or a rejection for a network failure. */
export type StubHandler = (
  request: StubRequest,
) => Response | Promise<Response>;

/** A stubbed `fetch` and the requests it received. */
export interface FetchStub {
  fetch: Mock<typeof fetch>;
  requests: StubRequest[];
}

/**
 * A `fetch` that records each request and answers with `handler`. It
 * rejects with the signal's reason when the signal aborted before the call,
 * as the real one does.
 */
export function stubFetch(handler: StubHandler): FetchStub {
  const requests: StubRequest[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request: StubRequest = {
      url: new URL(input instanceof Request ? input.url : input.toString()),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      signal: init?.signal ?? undefined,
    };
    requests.push(request);
    if (request.signal?.aborted) throw request.signal.reason;
    return handler(request);
  });
  return { fetch, requests };
}

/** Answers the requests in order, one handler each (the last one repeats). */
export function stubFetchSequence(...handlers: StubHandler[]): FetchStub {
  let next = 0;
  return stubFetch((request) => {
    const handler = handlers[Math.min(next++, handlers.length - 1)]!;
    return handler(request);
  });
}

/** A response that never comes: rejects with the signal's reason once it aborts. */
export function never(request: StubRequest): Promise<Response> {
  return new Promise((_, reject) => {
    request.signal?.addEventListener("abort", () =>
      reject(request.signal?.reason),
    );
  });
}

/** A response whose headers arrive but whose body never ends: it errors once the signal aborts. */
export function stalledBody(request: StubRequest): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{"));
      request.signal?.addEventListener("abort", () =>
        controller.error(request.signal?.reason),
      );
    },
  });
  return new Response(body, { status: 200 });
}

/** A JSON response. */
export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

/** A network failure, as Node's `fetch` reports one. */
export function networkFailure(code = "ECONNREFUSED"): TypeError {
  return new TypeError("fetch failed", {
    cause: Object.assign(new Error(`connect ${code} 127.0.0.1:443`), { code }),
  });
}

/** A `SignContext` around `fetch`, with a spy logger and a 1 s timeout. */
export function signContextFor(
  fetch: typeof globalThis.fetch,
  overrides: Partial<SignContext> = {},
): SignContext & { logger: Mock<Logger> } {
  return {
    fetch,
    signal: new AbortController().signal,
    timeoutMs: 1_000,
    userAgent: "Test-Agent/1.0",
    logger: vi.fn<Logger>(),
    ...overrides,
  } as SignContext & { logger: Mock<Logger> };
}
