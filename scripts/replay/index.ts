// `yarn replay <capture.json>`: replays a capture's messages through the real
// dispatch with a listener on every event and prints what came of them (the
// replay in ../lib/replay.ts, the output in summary.ts, the command line in
// args.ts). Offline: it reads a file `yarn capture` wrote. Output goes to the
// terminal only; with --samples it holds what viewers sent.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
  fromFixtureMessage,
  parseFixture,
  type Fixture,
} from "../capture/fixture.js";
import { runScript } from "../lib/cli.js";
import { describeError } from "../lib/format.js";
import { replay } from "../lib/replay.js";
import { parseReplayArgs, REPLAY_USAGE } from "./args.js";
import { formatReplay, replayStatus } from "./summary.js";

runScript({
  name: "replay",
  usage: REPLAY_USAGE,
  parse: (argv) => parseReplayArgs(argv),
  run: async (args) => {
    let fixture: Fixture;
    try {
      fixture = parseFixture(readFileSync(args.file, "utf8"));
    } catch (error) {
      console.error(`Can't read ${args.file}: ${describeError(error)}`);
      return 1;
    }
    const result = replay(fixture.messages.map(fromFixtureMessage));
    console.log(
      formatReplay(basename(args.file), fixture, result, {
        samples: args.samples,
      }),
    );
    return replayStatus(result);
  },
});
