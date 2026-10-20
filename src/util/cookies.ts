// Owned by T2 (Phase 1): cookie parsing and serializing for the HTTP client's
// jar and the signer's cookies (PROTOCOL.md, "Cookies").
import { ConnectorError } from "../errors.js";
import type { SessionCookies } from "../options.js";

function notImplemented(what: string): ConnectorError {
  return new ConnectorError(
    "NOT_IMPLEMENTED",
    `${what} is not implemented yet`,
  );
}

/** The cookies a session sends: `sessionid`, `sessionid_ss`, `sid_tt`, `sid_guard` and `tt-target-idc`. */
export function sessionCookies(
  session: Required<SessionCookies>,
): Record<string, string> {
  throw notImplemented(`sessionCookies(${session.ttTargetIdc})`);
}

/** The name and value of a `Set-Cookie` header, or `null` when it has none. */
export function parseSetCookie(header: string): [string, string] | null {
  throw notImplemented(`parseSetCookie(${header.length})`);
}

/** The `name=value` pairs in the signer's `x-set-tt-cookie` header. */
export function parseSignerCookies(header: string): string[] {
  throw notImplemented(`parseSignerCookies(${header.length})`);
}

/** A `Cookie` header value: `name=value` pairs joined by `; `. */
export function serializeCookies(
  cookies: Readonly<Record<string, string>>,
): string {
  throw notImplemented(`serializeCookies(${Object.keys(cookies).length})`);
}
