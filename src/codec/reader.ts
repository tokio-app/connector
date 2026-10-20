import { ProtocolError } from "../errors.js";

/** The protobuf wire types: how a field's value is laid out after its tag. */
export const WireType = {
  /** A varint: int32, int64, uint32, uint64, bool and enum fields. */
  VARINT: 0,
  /** 8 bytes, little-endian: fixed64, sfixed64 and double fields. */
  I64: 1,
  /** A varint length, then that many bytes: strings, bytes, messages and packed repeated fields. */
  LEN: 2,
  /** Start of a group (deprecated, skipped). */
  SGROUP: 3,
  /** End of a group. */
  EGROUP: 4,
  /** 4 bytes, little-endian: fixed32, sfixed32 and float fields. */
  I32: 5,
} as const;

/** A protobuf wire type. */
export type WireType = (typeof WireType)[keyof typeof WireType];

/** How many levels of nested messages and groups a message may have below it. */
export const MAX_DEPTH = 32;

// Every string is UTF-8; a byte order mark is kept as part of the text.
const utf8 = new TextDecoder("utf-8", { ignoreBOM: true });

function join64(lo: number, hi: number): bigint {
  return (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
}

/**
 * Reads the protobuf wire format from a byte array. Every read checks its
 * bounds and throws a `ProtocolError` on malformed input: a value running past
 * the end, a varint longer than 10 bytes, an invalid tag, or nesting deeper
 * than {@link MAX_DEPTH}. Byte strings come back as views into the input, not
 * copies.
 */
export class WireReader {
  /** How deep this message is nested: 0 for the top-level one. */
  readonly depth: number;
  readonly #buf: Uint8Array;
  readonly #end: number;
  #pos = 0;
  #view: DataView | undefined;

  constructor(bytes: Uint8Array, depth = 0) {
    if (depth > MAX_DEPTH) {
      throw new ProtocolError(
        `Messages are nested more than ${MAX_DEPTH} levels deep`,
      );
    }
    this.#buf = bytes;
    this.#end = bytes.length;
    this.depth = depth;
  }

  /** The read position, in bytes from the start. */
  get pos(): number {
    return this.#pos;
  }

  /** Whether everything has been read. */
  get eof(): boolean {
    return this.#pos >= this.#end;
  }

  /**
   * Reads a field tag: `field << 3 | wire`. Split it with `tag >>> 3` (the
   * field number) and `tag & 7` (the wire type). Throws for field number 0,
   * wire types 6 and 7, and tags longer than 32 bits.
   */
  tag(): number {
    const start = this.#pos;
    let value = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = this.#byte();
      if (shift === 28 && byte > 0x0f) {
        throw this.#error("Tag is longer than 32 bits", start);
      }
      value |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte >= 0x80);
    value >>>= 0;
    if (value >>> 3 === 0) throw this.#error("Field number 0", start);
    if ((value & 7) > WireType.I32) {
      throw this.#error(`Invalid wire type ${value & 7}`, start);
    }
    return value;
  }

  /**
   * Reads a varint and returns its low 32 bits as a signed integer: the value
   * of an int32 or enum field (`>>> 0` gives a uint32's).
   */
  varint32(): number {
    let value = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      const byte = this.#byte();
      value |= (byte & 0x7f) << shift;
      if (byte < 0x80) return value;
    }
    // A negative int32 is sign-extended to 10 bytes: drop the high bytes.
    this.#skipVarintBytes(5);
    return value;
  }

  /**
   * Reads a varint as an unsigned 64-bit integer. `BigInt.asIntN(64, value)`
   * gives an int64's value.
   */
  varint64(): bigint {
    let lo = 0;
    let byte: number;
    // Bytes 1 to 4: bits 0 to 27.
    for (let shift = 0; shift < 28; shift += 7) {
      byte = this.#byte();
      lo |= (byte & 0x7f) << shift;
      if (byte < 0x80) return BigInt(lo >>> 0);
    }
    // Byte 5: bits 28 to 34, across both halves.
    byte = this.#byte();
    lo |= (byte & 0x0f) << 28;
    let hi = (byte & 0x7f) >> 4;
    if (byte < 0x80) return join64(lo, hi);
    // Bytes 6 to 10: bits 35 to 63. Bits past 63 are dropped.
    for (let shift = 3; shift < 32; shift += 7) {
      byte = this.#byte();
      hi |= (byte & 0x7f) << shift;
      if (byte < 0x80) return join64(lo, hi);
    }
    throw this.#error("Varint is longer than 10 bytes");
  }

  /** Reads a varint as a bool: whether any of its 64 bits is set. */
  bool(): boolean {
    let set = false;
    for (let index = 0; index < 10; index++) {
      const byte = this.#byte();
      // The 10th byte only carries bit 63.
      if ((index === 9 ? byte & 0x01 : byte & 0x7f) !== 0) set = true;
      if (byte < 0x80) return set;
    }
    throw this.#error("Varint is longer than 10 bytes");
  }

  /** Reads 4 bytes as an unsigned 32-bit integer (a fixed32 field). */
  fixed32(): number {
    return this.#uint32At(this.#take(4));
  }

  /** Reads 8 bytes as an unsigned 64-bit integer (a fixed64 field). */
  fixed64(): bigint {
    const start = this.#take(8);
    return join64(this.#uint32At(start), this.#uint32At(start + 4));
  }

  /** Reads 4 bytes as a float. */
  float(): number {
    return this.#dataView().getFloat32(this.#take(4), true);
  }

  /** Reads 8 bytes as a double. */
  double(): number {
    return this.#dataView().getFloat64(this.#take(8), true);
  }

  /** Reads a length-delimited value and returns a view of its bytes (no copy). */
  bytes(): Uint8Array {
    const length = this.#length();
    const start = this.#take(length);
    return this.#buf.subarray(start, start + length);
  }

  /** Reads a length-delimited value as UTF-8 text. Invalid sequences become U+FFFD. */
  string(): string {
    return utf8.decode(this.bytes());
  }

  /** Reads a length-delimited value and returns a reader over it, one level deeper. */
  message(): WireReader {
    return new WireReader(this.bytes(), this.depth + 1);
  }

  /**
   * Skips a value of the given wire type: the rest of a field whose tag was
   * just read. A group is skipped up to its matching end tag, which must have
   * the same `field` number. Throws for an end group without a start group.
   */
  skip(wire: number, field = 0): void {
    switch (wire) {
      case WireType.VARINT:
        this.#skipVarintBytes(10);
        return;
      case WireType.I64:
        this.#take(8);
        return;
      case WireType.LEN:
        this.#take(this.#length());
        return;
      case WireType.SGROUP:
        this.#skipGroup(field);
        return;
      case WireType.I32:
        this.#take(4);
        return;
      default:
        throw this.#error(
          wire === WireType.EGROUP
            ? `End of group ${field} without a start`
            : `Invalid wire type ${wire}`,
        );
    }
  }

  #skipGroup(field: number): void {
    const open = [field];
    while (open.length > 0) {
      if (this.depth + open.length > MAX_DEPTH) {
        throw this.#error(
          `Messages are nested more than ${MAX_DEPTH} levels deep`,
        );
      }
      const tag = this.tag();
      const number = tag >>> 3;
      const wire = tag & 7;
      if (wire === WireType.EGROUP) {
        const start = open.pop();
        if (number !== start) {
          throw this.#error(
            `Group ${start} ended by an end of group ${number}`,
          );
        }
      } else if (wire === WireType.SGROUP) {
        open.push(number);
      } else {
        this.skip(wire, number);
      }
    }
  }

  // Reads the rest of a varint, which may have `left` more bytes at most.
  #skipVarintBytes(left: number): void {
    for (let index = 0; index < left; index++) {
      if (this.#byte() < 0x80) return;
    }
    throw this.#error("Varint is longer than 10 bytes");
  }

  // A length prefix: exact up to 2^53, and never more than what is left.
  #length(): number {
    const start = this.#pos;
    let length = 0;
    let scale = 1;
    for (let index = 0; index < 10; index++) {
      const byte = this.#byte();
      length += (byte & 0x7f) * scale;
      if (byte < 0x80) {
        if (length > this.#end - this.#pos) {
          throw this.#error(
            `Length ${length} runs past the end of the message`,
            start,
          );
        }
        return length;
      }
      scale *= 128;
    }
    throw this.#error("Varint is longer than 10 bytes", start);
  }

  #byte(): number {
    if (this.#pos >= this.#end) {
      throw this.#error("Unexpected end of message");
    }
    return this.#buf[this.#pos++]!;
  }

  // Advances past `count` bytes and returns where they start.
  #take(count: number): number {
    const start = this.#pos;
    if (this.#end - start < count) {
      throw this.#error(
        `Unexpected end of message: ${count} bytes needed, ${this.#end - start} left`,
      );
    }
    this.#pos += count;
    return start;
  }

  #uint32At(start: number): number {
    const b = this.#buf;
    return (
      (b[start]! |
        (b[start + 1]! << 8) |
        (b[start + 2]! << 16) |
        (b[start + 3]! << 24)) >>>
      0
    );
  }

  #dataView(): DataView {
    this.#view ??= new DataView(
      this.#buf.buffer,
      this.#buf.byteOffset,
      this.#buf.byteLength,
    );
    return this.#view;
  }

  #error(message: string, at = this.#pos): ProtocolError {
    return new ProtocolError(`${message} (byte ${at})`);
  }
}
