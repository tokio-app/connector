// What `yarn capture` does once its command line is read: connects with a
// `raw` listener only (so nothing is decoded on the way), records each
// message, disconnects, and writes the fixture. index.ts runs it with a real
// connection and the file system; run.test.ts with the offline fakes. The
// fixture format lives in fixture.ts.
import { TikTokLiveConnection, type ConnectOptions } from "../../src/index.js";
import { startConnect, within, type Clock } from "../lib/cli.js";
import {
  describeConnected,
  describeDisconnected,
  describeError,
  describeReconnecting,
  describeStreamEnd,
  labeled,
  stamp,
} from "../lib/format.js";
import type { CaptureArgs } from "./args.js";
import {
  buildFixture,
  formatCaptureSummary,
  serializeFixture,
  toFixtureMessage,
  type Fixture,
  type FixtureMessage,
} from "./fixture.js";

// How often to print the message count while recording.
const PROGRESS_MS = 10_000;

// How many error events are printed; the rest are only counted.
const PRINTED_ERRORS = 5;

const ANONYMIZE_WARNING = `--anonymize leaves out the username only. The payloads are raw protobuf and
still hold viewers' nicknames, user ids, avatars and comments.`;

const OWN_LIVE_REMINDER = `The payloads hold viewers' nicknames, user ids, avatars and comments. Only
commit a capture under test/fixtures/ when it was recorded on your own LIVE,
and keep it small.`;

/** What a capture works with. */
export interface CaptureIo {
  /** The connection's options: its signer, logger and the rest. */
  options: ConnectOptions;
  /** Prints a progress line. */
  progress(line: string): void;
  /** Prints the summary of what was written. */
  result(text: string): void;
  /** Prints a warning or a failure. */
  warn(text: string): void;
  /** Writes the fixture's text to `path`, and returns the path to show. */
  save(path: string, text: string): string;
  /** Calls `stop` on Ctrl-C. */
  onInterrupt(stop: () => void): void;
  /** The capture's clock: message times count from its start. */
  clock: Clock;
}

/** How a capture ended. */
export interface CaptureOutcome {
  /** The exit status: 0 when the file was written, 1 when nothing was captured. */
  status: number;
  /** The fixture written, when one was. */
  fixture?: Fixture;
}

/** One capture, from the connect to the file. */
class CaptureRun {
  readonly #args: CaptureArgs;
  readonly #io: CaptureIo;
  readonly #connection: TikTokLiveConnection;
  readonly #capturedAt = new Date();
  readonly #messages: FixtureMessage[] = [];
  // Settles when the connection stops on its own, or on Ctrl-C.
  readonly #stopped = Promise.withResolvers<void>();
  #interrupted = false;
  #errors = 0;

  constructor(args: CaptureArgs, io: CaptureIo) {
    this.#args = args;
    this.#io = io;
    const connection = new TikTokLiveConnection(args.username, io.options);
    this.#connection = connection;
    connection.on("raw", (raw) => {
      this.#messages.push(toFixtureMessage(raw, io.clock.startedAt));
    });
    connection.on("connected", (event) =>
      this.#print(describeConnected(event)),
    );
    connection.on("reconnecting", (event) =>
      this.#print(describeReconnecting(event)),
    );
    connection.on("streamEnd", (event) =>
      this.#print(describeStreamEnd(event)),
    );
    connection.on("disconnected", (event) => {
      this.#print(describeDisconnected(event));
      if (!event.willReconnect) this.#stopped.resolve();
    });
    connection.on("error", (error) => {
      this.#errors++;
      if (this.#errors <= PRINTED_ERRORS) {
        this.#print(labeled("error", describeError(error)));
      }
    });
    io.onInterrupt(() => {
      this.#interrupted = true;
      this.#stopped.resolve();
    });
  }

  async run(): Promise<CaptureOutcome> {
    if (this.#args.anonymize) this.#io.warn(`${ANONYMIZE_WARNING}\n`);
    this.#print(`connecting to @${this.#connection.username}`);
    // A failed connect has nothing to disconnect; disconnect() cancels one
    // that Ctrl-C interrupted.
    const connected = await startConnect(
      this.#connection,
      this.#stopped.promise,
      (error) => this.#print(labeled("connect failed", describeError(error))),
    ).connected;
    if (connected) await this.#record();
    if (connected || this.#interrupted) await this.#disconnect();
    return this.#write(connected);
  }

  #print(line: string): void {
    this.#io.progress(`${stamp(this.#io.clock.elapsed())}  ${line}`);
  }

  async #record(): Promise<void> {
    const progress = setInterval(
      () =>
        this.#print(
          `${this.#messages.length.toLocaleString("en-US")} messages`,
        ),
      PROGRESS_MS,
    );
    await within(this.#stopped.promise, this.#args.durationMs);
    clearInterval(progress);
  }

  async #disconnect(): Promise<void> {
    this.#print("disconnecting");
    try {
      await this.#connection.disconnect();
    } catch (error) {
      this.#print(labeled("disconnect failed", describeError(error)));
    }
  }

  #write(connected: boolean): CaptureOutcome {
    const durationMs = this.#io.clock.elapsed();
    const errors = this.#errors;
    if (errors > 0) {
      this.#io.warn(
        `${errors} error event${errors === 1 ? "" : "s"}: the messages of a batch that failed to decode are missing.`,
      );
    }
    if (this.#messages.length === 0) {
      this.#io.warn(
        connected ? "No message came in: nothing written." : "Nothing written.",
      );
      return { status: 1 };
    }
    const fixture = buildFixture({
      capturedAt: this.#capturedAt,
      username: this.#connection.username,
      roomId: this.#connection.roomId ?? "0",
      durationMs,
      messages: this.#messages,
      anonymize: this.#args.anonymize,
    });
    const text = serializeFixture(fixture);
    const shown = this.#io.save(this.#args.out, text);
    this.#io.result(
      `\n${formatCaptureSummary(fixture, shown, Buffer.byteLength(text))}\n`,
    );
    this.#io.result(OWN_LIVE_REMINDER);
    return { status: 0, fixture };
  }
}

/**
 * Runs `yarn capture`: connects to `args.username` with `io.options`, records
 * the raw messages, and saves them as a fixture. Resolves with the exit
 * status and the fixture.
 */
export function runCapture(
  args: CaptureArgs,
  io: CaptureIo,
): Promise<CaptureOutcome> {
  return new CaptureRun(args, io).run();
}
