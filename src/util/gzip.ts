// Owned by T3 (Phase 1): gzip-compressed frame payloads.
import { ConnectorError } from "../errors.js";

/** Whether `bytes` starts like gzip data: `1f 8b 08`. */
export function isGzip(bytes: Uint8Array): boolean {
  throw new ConnectorError(
    "NOT_IMPLEMENTED",
    `isGzip(${bytes.length} bytes) is not implemented yet`,
  );
}

/** Decompresses gzip data. Rejects with a `ProtocolError` when it is corrupt. */
export function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return Promise.reject(
    new ConnectorError(
      "NOT_IMPLEMENTED",
      `gunzip(${bytes.length} bytes) is not implemented yet`,
    ),
  );
}
