// The public API: everything else in src/ is internal.
export { TikTokLiveConnection } from "./connection.js";
export { TypedEmitter, type EventName, type Listener } from "./emitter.js";
export {
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
  type ConnectorErrorOptions,
  type ErrorCode,
  type HttpErrorOptions,
  type OfflineErrorOptions,
  type RateLimitErrorOptions,
  type ReconnectGiveUpErrorOptions,
  type SignErrorOptions,
  type TimeoutErrorOptions,
  type TimeoutPhase,
  type WebSocketErrorOptions,
} from "./errors.js";
// The events, their payload types and the constants of their enum fields.
export * from "./events/index.js";
export { isStreakEnd, isStreakable } from "./gifts.js";
export {
  consoleLogger,
  createConsoleLogger,
  type ConsoleLoggerOptions,
  type Logger,
  type LogLevel,
} from "./logger.js";
export {
  DEFAULT_OPTIONS,
  normalizeUsername,
  type ConnectOptions,
  type FetchGiftsOptions,
  type ReconnectOptions,
  type SessionCookies,
} from "./options.js";
export { EulerSigner, type EulerSignerOptions } from "./signer/euler.js";
export type {
  RoomInfo,
  SignContext,
  SignedConnect,
  SignRequest,
  Signer,
} from "./signer/types.js";
