// Owned by T2 (Phase 1): cookie parsing and serializing for the HTTP client's
// jar and the signer's cookies (PROTOCOL.md, "Cookies"). A cookie here is a
// name and a value: TikTok's cookies are sent everywhere, so domain, path
// and expiry are ignored.
import { SESSION_COOKIE_NAMES } from "../http/params.js";
import type { SessionCookies } from "../options.js";

/** The cookie that names the session's data center. */
export const TARGET_IDC_COOKIE = "tt-target-idc";

// Set-Cookie attributes (RFC 6265 and the later SameSite, Priority and
// Partitioned): a "name=value" with one of these names describes the cookie
// before it, it isn't a cookie.
const ATTRIBUTES: ReadonlySet<string> = new Set([
  "path",
  "domain",
  "expires",
  "max-age",
  "httponly",
  "secure",
  "samesite",
  "priority",
  "partitioned",
]);

// A comma that starts a new "name=value" in a header holding several
// Set-Cookie lines joined by ", ". The comma of an Expires date ("Wed, 21 Oct
// 2026 …") isn't followed by a name and "=", so it doesn't split.
const COOKIE_COMMA = /,(?=\s*[^\s;,=]+=)/;

// What a cookie name may hold (an RFC 7230 token) and what a value may hold
// (RFC 6265 cookie-octets, plus the double quotes of a quoted value).
// Anything else is percent-encoded.
const NAME_UNSAFE = /[^!#$%&'*+\-.^_`|~0-9A-Za-z]/gu;
const VALUE_UNSAFE = /[^\x21-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]/gu;

const utf8 = new TextEncoder();

function percentEncode(character: string): string {
  let encoded = "";
  for (const byte of utf8.encode(character)) {
    encoded += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return encoded;
}

/**
 * The cookies a session sends: `sessionid`, `sessionid_ss`, `sid_tt` and
 * `sid_guard` set to the session id, and `tt-target-idc`.
 */
export function sessionCookies(
  session: Required<SessionCookies>,
): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const name of SESSION_COOKIE_NAMES) cookies[name] = session.sessionId;
  cookies[TARGET_IDC_COOKIE] = session.ttTargetIdc;
  return cookies;
}

/**
 * Splits `name=value` at its first `=` and trims both sides. `null` when
 * there is no `=`, or when the name is empty or holds whitespace, `;` or `,`.
 */
function parseCookiePair(text: string): [string, string] | null {
  const index = text.indexOf("=");
  if (index < 0) return null;
  const name = text.slice(0, index).trim();
  if (name === "" || /[\s;,]/.test(name)) return null;
  return [name, text.slice(index + 1).trim()];
}

/**
 * The name and value of one `Set-Cookie` line (what comes before its first
 * `;`), or `null` when it has none. The attributes after it are ignored.
 */
export function parseSetCookie(header: string): [string, string] | null {
  return parseCookiePair(header.split(";", 1)[0]!);
}

/**
 * Splits a header holding several `Set-Cookie` lines joined by `, ` (what
 * `Headers.get("set-cookie")` returns) back into the lines.
 */
export function splitSetCookieHeader(header: string): string[] {
  return header
    .split(COOKIE_COMMA)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * The `name=value` pairs in the signer's `x-set-tt-cookie` header, in order.
 *
 * Its format isn't documented (PROTOCOL.md, open item 3): one cookie, a
 * `Cookie`-style list (`a=1; b=2`) or `Set-Cookie` lines joined by `, ` all
 * parse. Every pair is kept, split at `;` and at a comma that starts a new
 * pair; the `Set-Cookie` attributes (`Path`, `Domain`, `Expires`, `Max-Age`,
 * `SameSite`, `Priority`, in any letter case) and the flags without a value
 * (`HttpOnly`, `Secure`, `Partitioned`) are dropped. Values are kept as sent.
 */
export function parseSignerCookies(header: string): string[] {
  const pairs: string[] = [];
  for (const line of splitSetCookieHeader(header)) {
    for (const part of line.split(";")) {
      const pair = parseCookiePair(part);
      if (pair === null || ATTRIBUTES.has(pair[0].toLowerCase())) continue;
      pairs.push(`${pair[0]}=${pair[1]}`);
    }
  }
  return pairs;
}

/**
 * Merges cookie jars into a new one: a later jar's value wins, and each
 * cookie keeps the place it first had.
 */
export function mergeCookies(
  ...jars: readonly Readonly<Record<string, string>>[]
): Record<string, string> {
  const merged = new Map<string, string>();
  for (const jar of jars) {
    for (const [name, value] of Object.entries(jar)) merged.set(name, value);
  }
  return Object.fromEntries(merged);
}

/**
 * A `Cookie` header value: `name=value` pairs joined by `; `. Values go back
 * as TikTok or the signer set them, like a browser sends them; a character a
 * cookie can't hold (a space, `;`, `,`, `\`, a control or non-ASCII
 * character) is percent-encoded, so no value can break the header.
 */
export function serializeCookies(
  cookies: Readonly<Record<string, string>>,
): string {
  return Object.entries(cookies)
    .map(
      ([name, value]) =>
        `${name.replace(NAME_UNSAFE, percentEncode)}=${value.replace(VALUE_UNSAFE, percentEncode)}`,
    )
    .join("; ");
}
