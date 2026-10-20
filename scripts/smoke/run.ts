// What `yarn smoke` does once its command line is read: connects with a
// listener on every event, drops the socket (--drop-after), fetches the gift
// list (--gifts), disconnects and prints the summary. index.ts runs it with a
// real connection's options and the console; run.test.ts with the offline
// fakes. The bookkeeping lives in summary.ts.
import { TikTokLiveConnection, type ConnectOptions } from "../../src/index.js";
import { startConnect, within, type Clock } from "../lib/cli.js";
import { describeError, stamp } from "../lib/format.js";
import type { SmokeArgs } from "./args.js";
import {
  formatSummary,
  SMOKE_EVENTS,
  SmokeRecorder,
  type SmokeSummary,
} from "./summary.js";

/**
 * How long to wait at the end for fetchGifts() and for a connect that
 * disconnect() canceled, before reporting them as unfinished.
 */
const SETTLE_MS = 15_000;

/** What a smoke run works with. */
export interface SmokeIo {
  /** The connection's options: its signer, logger and the rest. */
  options: ConnectOptions;
  /** Prints a progress line. */
  progress(line: string): void;
  /** Prints the summary: text, or JSON with `--json`. */
  result(text: string): void;
  /** Calls `stop` on Ctrl-C. */
  onInterrupt(stop: () => void): void;
  /** The run's clock. */
  clock: Clock;
}

/** How a smoke run ended. */
export interface SmokeOutcome {
  /** The exit status: 0 when the run passed, 1 when it failed. */
  status: number;
  summary: SmokeSummary;
}

// The connection's `_terminateSocket()`: an @internal hook that terminates the
// WebSocket abruptly, the way a network drop does, so the connection has to
// reconnect. It isn't in the published types, so it's reached through this
// narrow guard instead of a cast, and the run fails with a clear reason
// without it.
interface SocketTerminator {
  _terminateSocket(): void;
}

function canTerminateSocket(
  connection: TikTokLiveConnection,
): connection is TikTokLiveConnection & SocketTerminator {
  return typeof Reflect.get(connection, "_terminateSocket") === "function";
}

/** One smoke run, from the connect to the summary. */
class SmokeRun {
  readonly #args: SmokeArgs;
  readonly #io: SmokeIo;
  readonly #connection: TikTokLiveConnection;
  readonly #recorder: SmokeRecorder;
  // Settles when the connection stops on its own, or on Ctrl-C.
  readonly #stopped = Promise.withResolvers<void>();
  // Settles when the reconnect check passes or fails.
  readonly #dropSettled = Promise.withResolvers<void>();
  #interrupted = false;

  constructor(args: SmokeArgs, io: SmokeIo) {
    this.#args = args;
    this.#io = io;
    this.#connection = new TikTokLiveConnection(args.username, io.options);
    this.#recorder = new SmokeRecorder({
      username: this.#connection.username,
      dropAfterMs: args.dropAfterMs,
      gifts: args.gifts,
    });
    for (const event of SMOKE_EVENTS) {
      this.#connection.on(event, (payload) => {
        this.#report(this.#recorder.record(event, payload, this.#now()));
      });
    }
    io.onInterrupt(() => {
      this.#interrupted = true;
      this.#stopped.resolve();
    });
  }

  async run(): Promise<SmokeOutcome> {
    const room = this.#args.roomId ? ` (room ${this.#args.roomId})` : "";
    this.#print(`connecting to @${this.#connection.username}${room}`);
    const start = startConnect(
      this.#connection,
      this.#stopped.promise,
      (error) => this.#report(this.#recorder.connectFailed(error)),
    );
    const connected = await start.connected;
    if (connected) await this.#watch();
    // A connect still running (Ctrl-C while connecting) is canceled by
    // disconnect(). After a failed connect there is nothing to disconnect.
    if (connected || this.#interrupted) {
      await this.#disconnect(start.connecting);
    }

    const summary = this.#recorder.summarize(this.#now(), {
      interrupted: this.#interrupted,
    });
    this.#io.result(
      this.#args.json
        ? JSON.stringify(summary, null, 2)
        : `\n${formatSummary(summary)}`,
    );
    return { status: summary.ok ? 0 : 1, summary };
  }

  #now(): number {
    return this.#io.clock.elapsed();
  }

  #print(line: string | undefined): void {
    if (line !== undefined) this.#io.progress(`${stamp(this.#now())}  ${line}`);
  }

  // Prints a line and wakes up whoever waits for the stop or the reconnect.
  #report(line: string | undefined): void {
    this.#print(line);
    if (this.#recorder.stopped) this.#stopped.resolve();
    if (this.#recorder.dropSettled) this.#dropSettled.resolve();
  }

  // Connected: fetch the gifts and drop the socket when asked, watch for
  // --seconds, then wait for the reconnect and the gifts.
  async #watch(): Promise<void> {
    const gifts = this.#args.gifts ? this.#fetchGifts() : undefined;
    const { dropAfterMs } = this.#args;
    const dropTimer =
      dropAfterMs === undefined
        ? undefined
        : setTimeout(() => this.#drop(), dropAfterMs);
    await within(this.#stopped.promise, this.#args.durationMs);
    clearTimeout(dropTimer);
    await this.#awaitReconnect();
    if (gifts) await within(gifts, SETTLE_MS);
  }

  #fetchGifts(): Promise<void> {
    return this.#connection.fetchGifts().then(
      (list) => this.#report(this.#recorder.giftsFetched(list)),
      (error: unknown) => this.#report(this.#recorder.giftsFailed(error)),
    );
  }

  #drop(): void {
    const connection = this.#connection;
    if (connection.state !== "connected") {
      this.#report(
        this.#recorder.dropFailed(
          `not connected when the drop was due (state ${connection.state})`,
        ),
      );
      return;
    }
    if (!canTerminateSocket(connection)) {
      this.#report(
        this.#recorder.dropFailed(
          "TikTokLiveConnection has no _terminateSocket() to drop the socket with",
        ),
      );
      return;
    }
    this.#report(this.#recorder.dropped(this.#now()));
    try {
      connection._terminateSocket();
    } catch (error) {
      this.#report(
        this.#recorder.dropFailed(
          `_terminateSocket() threw: ${describeError(error)}`,
        ),
      );
    }
  }

  // After --seconds, a reconnect still under way gets until its deadline.
  async #awaitReconnect(): Promise<void> {
    const deadline = this.#recorder.reconnectDeadline;
    if (
      this.#interrupted ||
      !this.#recorder.awaitingReconnect ||
      deadline === undefined
    ) {
      return;
    }
    this.#print(this.#recorder.waitingForReconnect());
    await within(
      Promise.race([this.#dropSettled.promise, this.#stopped.promise]),
      deadline - this.#now(),
    );
    this.#report(this.#recorder.reconnectTimedOut());
  }

  async #disconnect(connecting: Promise<boolean>): Promise<void> {
    this.#print("disconnecting");
    try {
      await this.#connection.disconnect();
    } catch (error) {
      this.#report(this.#recorder.disconnectFailed(error));
    }
    await within(connecting, SETTLE_MS);
  }
}

/**
 * Runs `yarn smoke`: connects to `args.username` with `io.options`, records
 * every event, and resolves with the exit status and the summary it printed.
 */
export function runSmoke(args: SmokeArgs, io: SmokeIo): Promise<SmokeOutcome> {
  return new SmokeRun(args, io).run();
}
