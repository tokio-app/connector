// `yarn smoke <username>`: connects to a real LIVE with a listener on every
// event, prints the connection's transitions and the first of each LIVE event,
// can drop the socket to check the reconnect (--drop-after) and fetch the gift
// list (--gifts), then disconnects and prints a summary (as JSON with --json).
// Exit status 0 when the run passed, 1 when it failed, 2 for a usage mistake.
//
// Opt-in: it needs the network and a user who is LIVE now, and each connect
// and reconnect is a request to Euler Stream (anonymous limits are low). The
// bookkeeping lives in summary.ts, the command line in args.ts.
import { TikTokLiveConnection } from "../../src/index.js";
import {
  connectionOptions,
  elapsed,
  onInterrupt,
  runScript,
  sleep,
} from "../lib/cli.js";
import { describeError, stamp } from "../lib/format.js";
import { parseSmokeArgs, SMOKE_USAGE, type SmokeArgs } from "./args.js";
import { formatSummary, SMOKE_EVENTS, SmokeRecorder } from "./summary.js";

// How long to wait at the end for fetchGifts() and for a connect that
// disconnect() canceled, before reporting them as unfinished.
const SETTLE_MS = 15_000;

// The connection's `_terminateSocket()`: an @internal hook that terminates the
// WebSocket abruptly, the way a network drop does, so the connection has to
// reconnect. It isn't in the public type, so it's reached through this narrow
// guard instead of a cast, and the run fails with a clear reason without it.
interface SocketTerminator {
  _terminateSocket(): void;
}

function canTerminateSocket(
  connection: TikTokLiveConnection,
): connection is TikTokLiveConnection & SocketTerminator {
  return typeof Reflect.get(connection, "_terminateSocket") === "function";
}

async function run(args: SmokeArgs): Promise<number> {
  // With --json, stdout holds only the summary.
  const write = args.json ? console.error : console.log;
  const print = (line: string | undefined) => {
    if (line !== undefined) write(`${stamp(elapsed())}  ${line}`);
  };

  const connection = new TikTokLiveConnection(
    args.username,
    connectionOptions(args),
  );
  const recorder = new SmokeRecorder({
    username: connection.username,
    dropAfterMs: args.dropAfterMs,
    gifts: args.gifts,
  });
  // Settles when the connection stops on its own, or on Ctrl-C.
  const stopped = Promise.withResolvers<void>();
  // Settles when the reconnect check passes or fails.
  const dropSettled = Promise.withResolvers<void>();
  let interrupted = false;

  const report = (line: string | undefined) => {
    print(line);
    if (recorder.stopped) stopped.resolve();
    if (recorder.dropSettled) dropSettled.resolve();
  };
  for (const event of SMOKE_EVENTS) {
    connection.on(event, (payload) => {
      report(recorder.record(event, payload, elapsed()));
    });
  }
  onInterrupt(() => {
    interrupted = true;
    stopped.resolve();
  });

  const drop = () => {
    if (connection.state !== "connected") {
      report(
        recorder.dropFailed(
          `not connected when the drop was due (state ${connection.state})`,
        ),
      );
      return;
    }
    if (!canTerminateSocket(connection)) {
      report(
        recorder.dropFailed(
          "TikTokLiveConnection has no _terminateSocket() to drop the socket with",
        ),
      );
      return;
    }
    report(recorder.dropped(elapsed()));
    try {
      connection._terminateSocket();
    } catch (error) {
      report(
        recorder.dropFailed(
          `_terminateSocket() threw: ${describeError(error)}`,
        ),
      );
    }
  };

  print(
    `connecting to @${connection.username}${args.roomId ? ` (room ${args.roomId})` : ""}`,
  );
  const connecting = connection.connect().then(
    () => true,
    (error: unknown) => {
      report(recorder.connectFailed(error));
      return false;
    },
  );
  const connected = await Promise.race([
    connecting,
    stopped.promise.then(() => false),
  ]);

  if (connected) {
    const gifts = args.gifts
      ? connection.fetchGifts().then(
          (list) => report(recorder.giftsFetched(list)),
          (error: unknown) => report(recorder.giftsFailed(error)),
        )
      : undefined;
    const dropTimer =
      args.dropAfterMs === undefined
        ? undefined
        : setTimeout(drop, args.dropAfterMs);

    await Promise.race([sleep(args.durationMs), stopped.promise]);
    const deadline = recorder.reconnectDeadline;
    if (!interrupted && recorder.awaitingReconnect && deadline !== undefined) {
      print("waiting for the reconnect");
      await Promise.race([
        dropSettled.promise,
        stopped.promise,
        sleep(deadline - elapsed()),
      ]);
      report(recorder.reconnectTimedOut());
    }
    clearTimeout(dropTimer);
    if (gifts) await Promise.race([gifts, sleep(SETTLE_MS)]);
  }

  // A connect still running (Ctrl-C while connecting) is canceled by
  // disconnect(). After a failed connect there is nothing to disconnect.
  if (connected || interrupted) {
    print("disconnecting");
    try {
      await connection.disconnect();
    } catch (error) {
      report(recorder.disconnectFailed(error));
    }
    await Promise.race([connecting, sleep(SETTLE_MS)]);
  }

  const summary = recorder.summarize(elapsed(), { interrupted });
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else console.log(`\n${formatSummary(summary)}`);
  return summary.ok ? 0 : 1;
}

runScript({ name: "smoke", usage: SMOKE_USAGE, parse: parseSmokeArgs, run });
