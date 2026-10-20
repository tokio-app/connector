import { WireType } from "./reader.js";

const utf8 = new TextEncoder();

const MAX_FIELD_NUMBER = 2 ** 29 - 1;
const MAX_UINT64 = (1n << 64n) - 1n;
const MIN_INT64 = -(1n << 63n);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

// A 64-bit integer as its unsigned bit pattern: negatives become their
// two's complement, as protobuf writes int64 and int32 values.
function toUint64(value: number | bigint | string): bigint {
  let big: bigint;
  if (typeof value === "bigint") {
    big = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`Varint value must be a safe integer, got ${value}`);
    }
    big = BigInt(value);
  } else {
    if (!/^-?\d+$/.test(value)) {
      throw new RangeError(
        `Varint value must be a decimal integer, got "${value}"`,
      );
    }
    big = BigInt(value);
  }
  if (big < MIN_INT64 || big > MAX_UINT64) {
    throw new RangeError(`Varint value ${big} doesn't fit in 64 bits`);
  }
  return BigInt.asUintN(64, big);
}

/**
 * Builds protobuf wire-format bytes, one field at a time. It covers what the
 * library's outgoing frames need: varint, string, bytes and nested message
 * fields.
 */
export class WireWriter {
  #buf = new Uint8Array(64);
  #length = 0;

  /**
   * Writes a varint field. The value is a 64-bit integer, given as a number,
   * a bigint or a decimal string; negatives are written as their 64-bit
   * two's complement, like int64 and int32 fields. Throws a `RangeError` for
   * anything else.
   */
  varint(field: number, value: number | bigint | string): this {
    this.#tag(field, WireType.VARINT);
    this.#varint(toUint64(value));
    return this;
  }

  /** Writes a string field, as UTF-8. */
  string(field: number, value: string): this {
    return this.bytes(field, utf8.encode(value));
  }

  /** Writes a bytes field. */
  bytes(field: number, value: Uint8Array): this {
    this.#tag(field, WireType.LEN);
    this.#varint(BigInt(value.length));
    this.#reserve(value.length);
    this.#buf.set(value, this.#length);
    this.#length += value.length;
    return this;
  }

  /** Writes a nested message field: `build` writes the nested message's fields. */
  message(field: number, build: (writer: WireWriter) => void): this {
    const nested = new WireWriter();
    build(nested);
    return this.bytes(field, nested.finish());
  }

  /** Returns a copy of the bytes written so far. */
  finish(): Uint8Array {
    return this.#buf.slice(0, this.#length);
  }

  #tag(field: number, wire: WireType): void {
    if (!Number.isInteger(field) || field < 1 || field > MAX_FIELD_NUMBER) {
      throw new RangeError(
        `Field number must be a whole number from 1 to ${MAX_FIELD_NUMBER}, got ${field}`,
      );
    }
    this.#varint(BigInt(field) * 8n + BigInt(wire));
  }

  #varint(value: bigint): void {
    if (value <= MAX_SAFE) {
      let rest = Number(value);
      while (rest > 0x7f) {
        this.#byte((rest % 0x80) | 0x80);
        rest = Math.floor(rest / 0x80);
      }
      this.#byte(rest);
      return;
    }
    let rest = value;
    while (rest > 0x7fn) {
      this.#byte(Number(rest & 0x7fn) | 0x80);
      rest >>= 7n;
    }
    this.#byte(Number(rest));
  }

  #byte(value: number): void {
    this.#reserve(1);
    this.#buf[this.#length++] = value;
  }

  #reserve(count: number): void {
    const needed = this.#length + count;
    if (needed <= this.#buf.length) return;
    let size = this.#buf.length * 2;
    while (size < needed) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.#buf.subarray(0, this.#length));
    this.#buf = grown;
  }
}
