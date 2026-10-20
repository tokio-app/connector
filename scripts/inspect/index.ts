// `yarn inspect <capture.json>`: reads a capture's payloads without any table
// and prints each method's fields merged over every sample (the decoder in
// tree.ts, the output in format.ts, the command line in args.ts). Offline: it
// reads a file `yarn capture` wrote. Output goes to the terminal only; it holds
// what viewers sent.
import { readFileSync } from "node:fs";
import {
  fromFixtureMessage,
  parseFixture,
  type Fixture,
} from "../capture/fixture.js";
import { describeError } from "../lib/format.js";
import { runScript } from "../lib/cli.js";
import { INSPECT_USAGE, parseInspectArgs } from "./args.js";
import { formatInspection, inspectionJson } from "./format.js";
import { inspectPayloads, matchesMethod } from "./tree.js";

runScript({
  name: "inspect",
  usage: INSPECT_USAGE,
  parse: (argv) => parseInspectArgs(argv),
  run: async (args) => {
    let fixture: Fixture;
    try {
      fixture = parseFixture(readFileSync(args.file, "utf8"));
    } catch (error) {
      console.error(`Can't read ${args.file}: ${describeError(error)}`);
      return 1;
    }
    const methods = inspectPayloads(
      fixture.messages
        .filter(({ method }) => matchesMethod(method, args.methods))
        .map(fromFixtureMessage),
    );
    console.log(
      args.json
        ? JSON.stringify(inspectionJson(methods), null, 2)
        : formatInspection(methods),
    );
    return 0;
  },
});
