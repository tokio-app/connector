// `yarn capture <username>`: records the raw messages of a LIVE into a JSON
// fixture that tests replay (format and validator in fixture.ts, the run in
// run.ts, the command line in args.ts). Opt-in: it needs the network and a
// user who is LIVE now.
//
// It listens to `raw` only, so nothing is decoded on the way, and writes what
// that event carries: method, ids, flags and the protobuf payload. No cookies,
// session, API key, internalExt or signer ids reach the file. The payloads
// still hold what viewers sent (nicknames, user ids, avatars, comments), and
// --anonymize can't remove that yet: it would mean decoding and re-encoding
// every payload, which only methods with complete tables could get. For now it
// leaves out the username.
//
// Captures go to captures/ (gitignored). A fixture committed under
// test/fixtures/ must come from your own LIVE, kept small.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  connectionOptions,
  onInterrupt,
  runScript,
  startClock,
} from "../lib/cli.js";
import { CAPTURE_USAGE, parseCaptureArgs } from "./args.js";
import { runCapture } from "./run.js";

// Writes the fixture, and gives its path relative to the working directory
// when it's inside it, else absolute.
function save(path: string, text: string): string {
  const full = resolve(path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
  const inside = relative(process.cwd(), full);
  return inside && !inside.startsWith("..") && !isAbsolute(inside)
    ? inside.replaceAll("\\", "/")
    : full;
}

runScript({
  name: "capture",
  usage: CAPTURE_USAGE,
  parse: parseCaptureArgs,
  run: async (args) => {
    const outcome = await runCapture(args, {
      options: connectionOptions(args),
      progress: console.log,
      result: console.log,
      warn: console.warn,
      save,
      onInterrupt,
      clock: startClock(),
    });
    return outcome.status;
  },
});
