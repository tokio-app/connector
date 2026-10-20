import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.js";
import { parseReplayArgs, REPLAY_USAGE, type ReplayArgs } from "./args.js";

function parse(argv: string[]): ReplayArgs {
  const command = parseReplayArgs(argv);
  if (command.help) throw new Error("expected a command, got --help");
  return command.args;
}

describe("parseReplayArgs", () => {
  it("replays the capture without samples by default", () => {
    expect(parse(["captures/live.json"])).toEqual({
      file: "captures/live.json",
      samples: false,
    });
  });

  it("reads --samples", () => {
    expect(parse(["live.json", "--samples"])).toEqual({
      file: "live.json",
      samples: true,
    });
  });

  it("answers --help with the usage", () => {
    expect(parseReplayArgs(["-h"])).toEqual({ help: true });
    expect(REPLAY_USAGE).toContain("--samples");
    expect(REPLAY_USAGE).toContain(
      "keep the\n                     output out of the repository",
    );
  });

  it.each([
    [[], "Missing the capture file"],
    [["a.json", "b.json"], 'Unexpected argument "b.json"'],
    [["a.json", "--json"], "--json"],
  ])("refuses %j", (argv, message) => {
    expect(() => parseReplayArgs(argv)).toThrow(UsageError);
    expect(() => parseReplayArgs(argv)).toThrow(message);
  });
});
