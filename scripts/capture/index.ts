// `yarn capture <username>`: records the raw messages of a LIVE into a JSON
// fixture that tests replay (format and validator in fixture.ts, command line
// in args.ts). Opt-in: it needs the network and a user who is LIVE now.
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
import { TikTokLiveConnection } from "../../src/index.js";
import {
  connectionOptions,
  elapsed,
  onInterrupt,
  runScript,
  sleep,
  startedAt,
} from "../lib/cli.js";
import {
  describeConnected,
  describeDisconnected,
  describeError,
  describeReconnecting,
  describeStreamEnd,
  labeled,
  stamp,
} from "../lib/format.js";
import { CAPTURE_USAGE, parseCaptureArgs, type CaptureArgs } from "./args.js";
import {
  buildFixture,
  formatCaptureSummary,
  serializeFixture,
  toFixtureMessage,
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

async function run(args: CaptureArgs): Promise<number> {
  const print = (line: string) => console.log(`${stamp(elapsed())}  ${line}`);
  if (args.anonymize) console.warn(`${ANONYMIZE_WARNING}\n`);

  const connection = new TikTokLiveConnection(
    args.username,
    connectionOptions(args),
  );
  const capturedAt = new Date();
  const messages: FixtureMessage[] = [];
  let errors = 0;
  // Settles when the connection stops on its own, or on Ctrl-C.
  const stopped = Promise.withResolvers<void>();
  let interrupted = false;

  connection.on("raw", (raw) => {
    messages.push(toFixtureMessage(raw, startedAt));
  });
  connection.on("connected", (event) => print(describeConnected(event)));
  connection.on("reconnecting", (event) => print(describeReconnecting(event)));
  connection.on("streamEnd", (event) => print(describeStreamEnd(event)));
  connection.on("disconnected", (event) => {
    print(describeDisconnected(event));
    if (!event.willReconnect) stopped.resolve();
  });
  connection.on("error", (error) => {
    errors++;
    if (errors <= PRINTED_ERRORS) print(labeled("error", describeError(error)));
  });
  onInterrupt(() => {
    interrupted = true;
    stopped.resolve();
  });

  print(`connecting to @${connection.username}`);
  const connecting = connection.connect().then(
    () => true,
    (error: unknown) => {
      print(labeled("connect failed", describeError(error)));
      return false;
    },
  );
  const connected = await Promise.race([
    connecting,
    stopped.promise.then(() => false),
  ]);

  if (connected) {
    const progress = setInterval(
      () => print(`${messages.length.toLocaleString("en-US")} messages`),
      PROGRESS_MS,
    );
    await Promise.race([sleep(args.durationMs), stopped.promise]);
    clearInterval(progress);
  }
  if (connected || interrupted) {
    print("disconnecting");
    try {
      await connection.disconnect();
    } catch (error) {
      print(labeled("disconnect failed", describeError(error)));
    }
  }
  const durationMs = elapsed();

  if (errors > 0) {
    console.warn(
      `${errors} error event${errors === 1 ? "" : "s"}: the messages of a batch that failed to decode are missing.`,
    );
  }
  if (messages.length === 0) {
    console.error(
      connected ? "No message came in: nothing written." : "Nothing written.",
    );
    return 1;
  }

  const fixture = buildFixture({
    capturedAt,
    username: connection.username,
    roomId: connection.roomId ?? "0",
    durationMs,
    messages,
    anonymize: args.anonymize,
  });
  const text = serializeFixture(fixture);
  const path = resolve(args.out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  // Relative to the working directory when inside it, else absolute.
  const inside = relative(process.cwd(), path);
  const shown =
    inside && !inside.startsWith("..") && !isAbsolute(inside)
      ? inside.replaceAll("\\", "/")
      : path;
  console.log(
    `\n${formatCaptureSummary(fixture, shown, Buffer.byteLength(text))}\n`,
  );
  console.log(OWN_LIVE_REMINDER);
  return 0;
}

runScript({
  name: "capture",
  usage: CAPTURE_USAGE,
  parse: parseCaptureArgs,
  run,
});
