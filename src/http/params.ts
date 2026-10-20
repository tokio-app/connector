// Every query parameter and header the library sends to TikTok by default
// lives here, so the `clientParams` and `headers` options can override any of
// them (PROTOCOL.md, "Client params", "Headers" and "WebSocket"). The values
// are the defaults of tiktok-live-connector 2.4.0, the release Tokio used
// before this library.
import { randomLastRtt } from "../util/random.js";

/** The User-Agent of every request to TikTok and of the WebSocket, and the signer's `user_agent`. */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/128.0.2739.79";

/** The cookies that carry the session id when a session is set (plus `tt-target-idc`). */
export const SESSION_COOKIE_NAMES = [
  "sessionid",
  "sessionid_ss",
  "sid_tt",
  "sid_guard",
] as const;

// What TikTok's web client reports about the browser: an Edge on macOS,
// 1920x1080, English, in Germany. browser_name and browser_version are the
// User-Agent split at its first "/".
const BROWSER_VERSION = DEFAULT_USER_AGENT.slice(
  DEFAULT_USER_AGENT.indexOf("/") + 1,
);

/** Query parameters of every HTTP request to TikTok, without `device_id`. */
export const DEFAULT_HTTP_PARAMS: Readonly<Record<string, string>> =
  Object.freeze({
    aid: "1988",
    app_language: "en",
    app_name: "tiktok_web",
    browser_language: "en-DE",
    browser_name: "Mozilla",
    browser_online: "true",
    browser_platform: "MacIntel",
    browser_version: BROWSER_VERSION,
    cookie_enabled: "true",
    device_platform: "web_pc",
    focus_state: "true",
    from_page: "user",
    history_len: "10",
    is_fullscreen: "false",
    is_page_visible: "true",
    screen_height: "1080",
    screen_width: "1920",
    tz_name: "Europe/Berlin",
    referer: "https://www.tiktok.com/",
    root_referer: "https://www.tiktok.com/",
    channel: "tiktok_web",
    data_collection_enabled: "true",
    os: "mac",
    priority_region: "DE",
    region: "DE",
    user_is_login: "true",
    webcast_language: "en",
  });

/** Headers of every HTTP request to TikTok. The HTTP client adds `Cookie`. */
export const DEFAULT_HTTP_HEADERS: Readonly<Record<string, string>> =
  Object.freeze({
    Connection: "keep-alive",
    "Cache-Control": "max-age=0",
    "User-Agent": DEFAULT_USER_AGENT,
    Accept: "text/html,application/json,application/protobuf",
    Referer: "https://www.tiktok.com/",
    Origin: "https://www.tiktok.com",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Sec-Fetch-Site": "same-site",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Ua-Mobile": "?0",
  });

/**
 * Query parameters of the WebSocket URL, without `last_rtt` and `User-Agent`
 * (added per connection) and the connection's own `compress`, `room_id`,
 * `internal_ext`, `cursor` and route params.
 */
export const DEFAULT_WEBSOCKET_PARAMS: Readonly<Record<string, string>> =
  Object.freeze({
    version_code: "180800",
    aid: "1988",
    app_language: "en",
    app_name: "tiktok_web",
    browser_platform: "MacIntel",
    browser_language: "en-DE",
    browser_name: "Mozilla",
    browser_version: BROWSER_VERSION,
    browser_online: "true",
    cookie_enabled: "true",
    tz_name: "Europe/Berlin",
    device_platform: "web",
    identity: "audience",
    live_id: "12",
    webcast_language: "en",
    ws_direct: "0",
    sup_ws_ds_opt: "1",
    update_version_code: "2.0.0",
    did_rule: "3",
    screen_height: "1080",
    screen_width: "1920",
    heartbeat_duration: "0",
    resp_content_type: "protobuf",
    history_comment_count: "6",
    client_enter: "1",
  });

/** Appended to the WebSocket URL after its query string, as TikTok's web client does. */
export const WEBSOCKET_URL_SUFFIX = "&version_code=270000";

/**
 * Merges headers: `overrides` replace headers of `base` whatever their
 * letter case, so `user-agent` replaces `User-Agent` instead of adding a
 * second one.
 */
export function mergeHeaders(
  base: Readonly<Record<string, string>>,
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const merged: Record<string, string> = { ...base };
  for (const [name, value] of Object.entries(overrides)) {
    const lower = name.toLowerCase();
    for (const existing of Object.keys(merged)) {
      if (existing.toLowerCase() === lower) delete merged[existing];
    }
    merged[name] = value;
  }
  return merged;
}

/** The User-Agent in `headers` (any letter case), or the default one. */
export function userAgentOf(headers: Readonly<Record<string, string>>): string {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "user-agent") return value;
  }
  return DEFAULT_USER_AGENT;
}

/** Query parameters of an HTTP request to TikTok: the defaults, `device_id`, then `overrides`. */
export function httpParams(
  deviceId: string,
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return { ...DEFAULT_HTTP_PARAMS, device_id: deviceId, ...overrides };
}

/** Headers of an HTTP request to TikTok: the defaults, then `overrides`. No `Cookie`. */
export function httpHeaders(
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return mergeHeaders(DEFAULT_HTTP_HEADERS, overrides);
}

/**
 * The WebSocket URL's query parameters that don't depend on the room: the
 * defaults, a random `last_rtt`, `User-Agent` (TikTok's web client sends it
 * as a parameter too), then `overrides`.
 */
export function webSocketParams(
  userAgent: string,
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return {
    ...DEFAULT_WEBSOCKET_PARAMS,
    last_rtt: randomLastRtt(),
    "User-Agent": userAgent,
    ...overrides,
  };
}

/** Headers of the WebSocket upgrade request: the User-Agent, then `overrides`. No `Cookie`. */
export function webSocketHeaders(
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return mergeHeaders({ "User-Agent": DEFAULT_USER_AGENT }, overrides);
}
