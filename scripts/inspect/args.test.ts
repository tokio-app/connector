import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.js";
import { INSPECT_USAGE, parseInspectArgs, type InspectArgs } from "./args.js";

function parse(argv: string[]): InspectArgs {
  const command = parseInspectArgs(argv);
  if (command.help) throw new Error("expected a command, got --help");
  return command.args;
}

describe("parseInspectArgs", () => {
  it("inspects every method of the capture by default", () => {
    expect(parse(["captures/live.json"])).toEqual({
      file: "captures/live.json",
      methods: [],
      json: false,
    });
  });

  it("reads --method (repeatable) and --json", () => {
    expect(
      parse([
        "live.json",
        "--method",
        "WebcastLinkMicArmies",
        "--method= LinkMicOpponentGifts ",
        "--method",
        "",
        "--json",
      ]),
    ).toEqual({
      file: "live.json",
      methods: ["WebcastLinkMicArmies", "LinkMicOpponentGifts"],
      json: true,
    });
  });

  it("answers --help with the usage", () => {
    expect(parseInspectArgs(["--help"])).toEqual({ help: true });
    expect(INSPECT_USAGE).toContain("--method");
    expect(INSPECT_USAGE).toContain("don't paste the output");
  });

  it.each([
    [[], "Missing the capture file"],
    [["a.json", "b.json"], 'Unexpected argument "b.json"'],
    [["a.json", "--nope"], "--nope"],
    [["a.json", "--method"], "--method"],
  ])("refuses %j", (argv, message) => {
    expect(() => parseInspectArgs(argv)).toThrow(UsageError);
    expect(() => parseInspectArgs(argv)).toThrow(message);
  });
});
