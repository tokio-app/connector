// Owned by T2 (Phase 1): fetch with timeouts, the client params and headers,
// and a cookie jar. connection.ts (T3) uses the constructor, userAgent,
// cookieHeader(), sessionCookieHeader() and addCookies(): keep their
// signatures.
import { ConnectorError } from "../errors.js";
import type { Logger } from "../logger.js";
import type { SessionCookies } from "../options.js";

/** What an {@link HttpClient} needs from the connection's options. */
export interface HttpClientOptions {
  /** The `fetch` to use. */
  fetch: typeof fetch;
  /** How long a request may take, in milliseconds (`requestTimeoutMs`). */
  timeoutMs: number;
  /** The `clientParams` option: added to, or replacing, the default query parameters. */
  clientParams: Readonly<Record<string, string>>;
  /** The `headers` option: added to, or replacing, the default headers. */
  headers: Readonly<Record<string, string>>;
  /** The session, sent as cookies. */
  session: Required<SessionCookies> | undefined;
  /** Where to log. */
  logger: Logger;
}

/** Options of one request. */
export interface RequestOptions {
  /** Query parameters added after the client params. */
  params?: Readonly<Record<string, string>>;
  /** Headers added after the default ones. */
  headers?: Readonly<Record<string, string>>;
  /** Send only `params`, without the client params. */
  bare?: boolean;
  /** Aborts the request (throw an `AbortError`). */
  signal?: AbortSignal;
}

function notImplemented(what: string): ConnectorError {
  return new ConnectorError(
    "NOT_IMPLEMENTED",
    `HttpClient.${what} is not implemented yet`,
  );
}

/**
 * Makes the library's HTTP requests to TikTok: adds the client params,
 * headers and cookies, enforces the timeout, keeps the cookies TikTok sets
 * (name and value only, like a browser on one site), and maps failures to
 * `HttpError`, `TimeoutError` (phase `request`), `AbortError` and
 * `ConnectorError` with code `NETWORK`.
 */
export class HttpClient {
  readonly #options: HttpClientOptions;

  constructor(options: HttpClientOptions) {
    this.#options = options;
  }

  /** The User-Agent of every request: the `headers` option's, or the default. */
  get userAgent(): string {
    throw notImplemented(`userAgent (${this.#options.timeoutMs} ms)`);
  }

  /** GETs `url` and returns the body as text. */
  getText(url: string, options?: RequestOptions): Promise<string> {
    void options;
    return Promise.reject(notImplemented(`getText(${url})`));
  }

  /** GETs `url` and parses the body as JSON. */
  getJson(url: string, options?: RequestOptions): Promise<unknown> {
    void options;
    return Promise.reject(notImplemented(`getJson(${url})`));
  }

  /** The `Cookie` header for TikTok: `tt-target-idc`, the session cookies, and every cookie set since. */
  cookieHeader(): string {
    throw notImplemented("cookieHeader()");
  }

  /** The session's cookies only (for `SignRequest.sessionCookies`), or `undefined` without a session. */
  sessionCookieHeader(): string | undefined {
    throw notImplemented("sessionCookieHeader()");
  }

  /** Adds `name=value` pairs to the jar, such as the signer's cookies. */
  addCookies(pairs: readonly string[]): void {
    throw notImplemented(`addCookies(${pairs.length})`);
  }
}
