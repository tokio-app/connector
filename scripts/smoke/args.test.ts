import { describe, expect, it } from "vitest";
import { UsageError } from "../lib/cli.js";
import { parseSmokeArgs, SMOKE_USAGE, type SmokeArgs } from "./args.js";

function parse(argv: string[]): SmokeArgs {
  const command = parseSmokeArgs(argv, {});
  if (command.help) throw new Error("expected a command, got --help");
  return command.args;
}

describe("parseSmokeArgs", () => {
  it("watches for 30 seconds, without the extra checks, by default", () => {
    expect(parse(["someone"])).toEqual({
      username: "someone",
      durationMs: 30_000,
      roomId: undefined,
      apiKey: undefined,
      host: undefined,
      verbose: false,
      dropAfterMs: undefined,
      gifts: false,
      json: false,
    });
  });

  it("reads its own flags", () => {
    expect(
      parse([
        "someone",
        "--seconds",
        "60",
        "--drop-after",
        "10",
        "--gifts",
        "--json",
      ]),
    ).toMatchObject({
      durationMs: 60_000,
      dropAfterMs: 10_000,
      gifts: true,
      json: true,
    });
  });

  it("wants the drop before the end of the run", () => {
    expect(() => parse(["someone", "--drop-after", "30"])).toThrow(
      new UsageError("--drop-after (30 s) must be less than --seconds (30 s)"),
    );
    expect(() => parse(["someone", "--drop-after", "0"])).toThrow(
      "--drop-after takes a number of seconds above 0",
    );
  });

  it("answers --help with the usage", () => {
    expect(parseSmokeArgs(["--help"], {})).toEqual({ help: true });
    expect(SMOKE_USAGE).toContain("--drop-after <n>");
    expect(SMOKE_USAGE).toContain("$EULER_API_KEY");
  });
});
