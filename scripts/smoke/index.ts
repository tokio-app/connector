// `yarn smoke <username>`: connects to a real LIVE with a listener on every
// event, prints the connection's transitions and the first of each LIVE event,
// can drop the socket to check the reconnect (--drop-after) and fetch the gift
// list (--gifts), then disconnects and prints a summary (as JSON with --json).
// Exit status 0 when the run passed, 1 when it failed, 2 for a usage mistake.
//
// Opt-in: it needs the network and a user who is LIVE now, and each connect
// and reconnect is a request to Euler Stream (anonymous limits are low). The
// run lives in run.ts, the bookkeeping in summary.ts, the command line in
// args.ts; this file wires them to the console and a real connection.
import {
  connectionOptions,
  onInterrupt,
  runScript,
  startClock,
} from "../lib/cli.js";
import { parseSmokeArgs, SMOKE_USAGE } from "./args.js";
import { runSmoke } from "./run.js";

runScript({
  name: "smoke",
  usage: SMOKE_USAGE,
  parse: parseSmokeArgs,
  run: async (args) => {
    const outcome = await runSmoke(args, {
      options: connectionOptions(args),
      // With --json, stdout holds only the summary.
      progress: args.json ? console.error : console.log,
      result: console.log,
      onInterrupt,
      clock: startClock(),
    });
    return outcome.status;
  },
});
