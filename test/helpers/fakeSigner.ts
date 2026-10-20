// A Signer for offline tests: its signed connect points the WebSocket at a
// FakeTikTok server, and it can be told to fail or to hang.
import {
  FetchResultSchema,
  type FetchResult,
} from "../../src/codec/messages/fetchResult.js";
import { AbortError } from "../../src/errors.js";
import type {
  SignContext,
  SignRequest,
  SignedConnect,
  Signer,
} from "../../src/signer/types.js";
import { encodeMessage, type EncodeInput } from "./encoder.js";

/** Options of {@link FakeSigner}. */
export interface FakeSignerOptions {
  /** The push server the signed connects name: a FakeTikTok's `url`. */
  pushServer: string;
  /** The cookies every signed connect returns. Default `["ttwid=fake-ttwid"]`. */
  cookies?: string[];
}

/** One `fetchConnect` call. */
export interface FakeSignCall {
  request: SignRequest;
  context: SignContext;
}

/**
 * Signs connections without a network. Each signed connect is a fresh
 * `ProtoMessageFetchResult`: cursor `signed-cursor-<n>`, internalExt
 * `signed-ext-<n>`, the push server, and whatever {@link FakeSigner.batch}
 * adds (messages, route params), or {@link FakeSigner.resumed} for a connect
 * asked for with a cursor. `failNext` makes the next calls throw.
 */
export class FakeSigner implements Signer {
  /** Every call, oldest first. */
  readonly calls: FakeSignCall[] = [];
  /** The push server the signed connects name. */
  pushServer: string;
  /** Push servers for the next signed connects, one each, before `pushServer`. */
  pushServers: string[] = [];
  /** The cookies every signed connect returns. */
  cookies: string[];
  /** Fields added to every signed batch, such as `messages` and `routeParams`. */
  batch: EncodeInput<FetchResult> = {};
  /**
   * When set, the fields of a signed batch asked for with a cursor (a
   * resume), instead of `batch`. TikTok answers those without a push server:
   * `{ pushServer: "" }` does the same.
   */
  resumed: EncodeInput<FetchResult> | undefined;
  /** Replaces the encoded batch of every signed connect, when set. */
  body: Uint8Array | undefined;
  /** The room id the signed connects name (Euler Stream's `x-room-id`), if any. */
  roomId: string | undefined;
  /** While set, calls wait for it (and stop when their signal aborts). */
  hold: Promise<void> | undefined;
  readonly #failures: unknown[] = [];
  #signed = 0;

  constructor(options: FakeSignerOptions) {
    this.pushServer = options.pushServer;
    this.cookies = options.cookies ?? ["ttwid=fake-ttwid"];
  }

  /** Makes the next `times` calls throw `error`. */
  failNext(error: unknown, times = 1): this {
    for (let index = 0; index < times; index++) this.#failures.push(error);
    return this;
  }

  async fetchConnect(
    request: SignRequest,
    context: SignContext,
  ): Promise<SignedConnect> {
    this.calls.push({ request, context });
    if (context.signal.aborted) throw new AbortError();
    if (this.hold !== undefined) {
      const { promise, reject } = Promise.withResolvers<never>();
      const onAbort = () => reject(new AbortError());
      context.signal.addEventListener("abort", onAbort, { once: true });
      try {
        await Promise.race([this.hold, promise]);
      } finally {
        context.signal.removeEventListener("abort", onAbort);
      }
    }
    if (context.signal.aborted) throw new AbortError();
    if (this.#failures.length > 0) throw this.#failures.shift();
    const count = ++this.#signed;
    return {
      body:
        this.body ??
        encodeMessage(FetchResultSchema, {
          cursor: `signed-cursor-${count}`,
          internalExt: `signed-ext-${count}`,
          pushServer: this.pushServers.shift() ?? this.pushServer,
          ...(request.cursor !== "" && this.resumed !== undefined
            ? this.resumed
            : this.batch),
        }),
      cookies: [...this.cookies],
      ...(this.roomId === undefined ? {} : { roomId: this.roomId }),
      requestId: `request-${count}`,
    };
  }
}
