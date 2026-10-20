import { describe, expect, it } from "vitest";
import * as api from "./index.js";

// The runtime exports of the package. Removing or renaming one breaks apps:
// that is a `feat!:` change.
describe("public API", () => {
  it("exports exactly these values", () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        "AbortError",
        "ConnectorError",
        "DEFAULT_OPTIONS",
        "ERROR_CODES",
        "EulerSigner",
        "HttpError",
        "InvalidUsernameError",
        "OfflineError",
        "PremiumFeatureError",
        "ProtocolError",
        "RateLimitError",
        "ReconnectGiveUpError",
        "RoomNotFoundError",
        "SignError",
        "TikTokLiveConnection",
        "TimeoutError",
        "TypedEmitter",
        "WebSocketError",
        "consoleLogger",
        "isConnectorError",
        "isStreakEnd",
        "isStreakable",
        "normalizeUsername",
      ].sort(),
    );
  });

  it("makes the connection a typed emitter", () => {
    const connection = new api.TikTokLiveConnection("someone");
    expect(connection).toBeInstanceOf(api.TypedEmitter);
  });
});
