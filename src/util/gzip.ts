// Gzip-compressed frame payloads (PROTOCOL.md, "Received frames").
import { gunzipSync } from "node:zlib";
import { ProtocolError } from "../errors.js";

/**
 * The most a payload may decompress to. A batch is a few kilobytes; the cap
 * keeps a corrupt or hostile payload from filling the memory.
 */
export const MAX_GUNZIPPED_BYTES = 64 * 1024 * 1024;

/** Whether `bytes` starts like gzip data: `1f 8b 08` (the magic number, then the deflate method). */
export function isGzip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0x1f &&
    bytes[1] === 0x8b &&
    bytes[2] === 0x08
  );
}

/**
 * Decompresses gzip data, as a plain `Uint8Array` (not a `Buffer`).
 * Synchronous, so frames are handled in the order they arrive. Throws a
 * `ProtocolError` when the data is corrupt, truncated, or decompresses to
 * more than {@link MAX_GUNZIPPED_BYTES}.
 */
export function gunzip(bytes: Uint8Array): Uint8Array {
  try {
    const out = gunzipSync(bytes, { maxOutputLength: MAX_GUNZIPPED_BYTES });
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ProtocolError(
      `Can't decompress a gzip payload of ${bytes.length} bytes: ${reason}`,
      { cause: error },
    );
  }
}
