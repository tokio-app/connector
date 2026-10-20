import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { ProtocolError } from "../errors.js";
import { MAX_GUNZIPPED_BYTES, gunzip, isGzip } from "./gzip.js";
import { fromHex } from "../../test/helpers/encoder.js";

// The real zlib, with gunzipSync spied on so a test can make it throw.
vi.mock("node:zlib", async (importOriginal) => {
  const zlib = await importOriginal<typeof import("node:zlib")>();
  return { ...zlib, gunzipSync: vi.fn(zlib.gunzipSync) };
});

describe("isGzip", () => {
  it("recognizes the gzip magic number and the deflate method", () => {
    expect(isGzip(gzipSync(Uint8Array.of(1, 2, 3)))).toBe(true);
    expect(isGzip(fromHex("1f 8b 08"))).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isGzip(new Uint8Array(0))).toBe(false);
    expect(isGzip(fromHex("1f 8b"))).toBe(false);
    expect(isGzip(fromHex("1f 8b 07 00"))).toBe(false);
    expect(isGzip(fromHex("0a 1f 8b 08"))).toBe(false);
    expect(isGzip(fromHex("78 9c 01"))).toBe(false); // zlib, not gzip
  });
});

describe("gunzip", () => {
  it("decompresses gzip data", () => {
    const data = new TextEncoder().encode("hello ".repeat(100));
    expect(gunzip(gzipSync(data))).toEqual(new Uint8Array(data));
  });

  it("throws a ProtocolError with the cause for corrupt data", () => {
    const corrupt = gzipSync(Uint8Array.of(1, 2, 3, 4, 5));
    corrupt.fill(0, 10);
    let thrown: unknown;
    try {
      gunzip(corrupt);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ProtocolError);
    expect(thrown).toMatchObject({ code: "PROTOCOL", retryable: true });
    expect((thrown as Error).message).toMatch(
      /^Can't decompress a gzip payload of \d+ bytes: /,
    );
    expect((thrown as Error).cause).toBeInstanceOf(Error);
  });

  it("throws a ProtocolError for truncated data", () => {
    const data = gzipSync(new Uint8Array(1_000).fill(7));
    expect(() => gunzip(data.subarray(0, data.length - 6))).toThrow(
      ProtocolError,
    );
  });

  it("refuses data that decompresses past the cap", () => {
    const bomb = gzipSync(new Uint8Array(MAX_GUNZIPPED_BYTES + 1));
    expect(() => gunzip(bomb)).toThrow(ProtocolError);
  });

  it("says what went wrong, whatever zlib throws", () => {
    vi.mocked(gunzipSync).mockImplementationOnce(() => {
      // oxlint-disable-next-line no-throw-literal -- a value that isn't an Error
      throw "out of luck";
    });
    expect(() => gunzip(fromHex("1f 8b 08 00"))).toThrow(
      "Can't decompress a gzip payload of 4 bytes: out of luck",
    );
  });
});
