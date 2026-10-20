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
 * `signed-ext-<n>`, then, for a fresh connect (cursor `""`), the push server
 * and whatever {@link FakeSigner.batch} adds (messages, route params). A
 * connect asked for with a cursor has no push server, as TikTok answers it,
 * and {@link FakeSigner.resumed}'s fields. `failNext` and `failResumed` make
 * the next fresh or resumed calls throw.
 */
export class FakeSigner implements Signer {
  /** Every call, oldest first. */
  readonly calls: FakeSignCall[] = [];
  /** The push server the signed connects name. */
  pushServer: string;
  /** Push servers for the next fresh connects, one each, before `pushServer`. */
  pushServers: string[] = [];
  /** The cookies every signed connect returns. */
  cookies: string[];
  /** Fields added to every fresh signed batch, such as `messages` and `routeParams`. */
  batch: EncodeInput<FetchResult> = {};
  /** Fields added to every batch signed with a cursor, such as the gap's `messages`. */
  resumed: EncodeInput<FetchResult> = {};
  /** Replaces the encoded batch of every signed connect, when set. */
  body: Uint8Array | undefined;
  /** The room id the signed connects name (Euler Stream's `x-room-id`), if any. */
  roomId: string | undefined;
  /** While set, calls wait for it (and stop when their signal aborts). */
  hold: Promise<void> | undefined;
  readonly #failures: unknown[] = [];
  readonly #resumedFailures: unknown[] = [];
  #signed = 0;

  constructor(options: FakeSignerOptions) {
    this.pushServer = options.pushServer;
    this.cookies = options.cookies ?? ["ttwid=fake-ttwid"];
  }

  /** Makes the next `times` fresh calls (cursor `""`) throw `error`. */
  failNext(error: unknown, times = 1): this {
    for (let index = 0; index < times; index++) this.#failures.push(error);
    return this;
  }

  /** Makes the next `times` calls with a cursor throw `error`. */
  failResumed(error: unknown, times = 1): this {
    for (let index = 0; index < times; index++) {
      this.#resumedFailures.push(error);
    }
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
    const resumed = request.cursor !== "";
    const failures = resumed ? this.#resumedFailures : this.#failures;
    if (failures.length > 0) throw failures.shift();
    const count = ++this.#signed;
    const fields = resumed
      ? this.resumed
      : {
          pushServer: this.pushServers.shift() ?? this.pushServer,
          ...this.batch,
        };
    return {
      body:
        this.body ??
        encodeMessage(FetchResultSchema, {
          cursor: `signed-cursor-${count}`,
          internalExt: `signed-ext-${count}`,
          ...fields,
        }),
      cookies: [...this.cookies],
      ...(this.roomId === undefined ? {} : { roomId: this.roomId }),
      requestId: `request-${count}`,
    };
  }
}
