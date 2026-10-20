import { describe, expect, it } from "vitest";
import {
  CAPTURE_USAGE,
  defaultOutPath,
  parseCaptureArgs,
  type CaptureArgs,
} from "./args.js";

const now = new Date("2026-10-19T12:30:05.123Z");

function parse(argv: string[]): CaptureArgs {
  const command = parseCaptureArgs(argv, {}, now);
  if (command.help) throw new Error("expected a command, got --help");
  return command.args;
}

describe("parseCaptureArgs", () => {
  it("records for 60 seconds into captures/ by default", () => {
    expect(parse(["@someone"])).toEqual({
      username: "someone",
      durationMs: 60_000,
      roomId: undefined,
      apiKey: undefined,
      host: undefined,
      verbose: false,
      out: "captures/someone-2026-10-19T12-30-05Z.json",
      anonymize: false,
    });
  });

  it("leaves the username out of the default name with --anonymize", () => {
    expect(parse(["someone", "--anonymize"])).toMatchObject({
      anonymize: true,
      out: "captures/capture-2026-10-19T12-30-05Z.json",
    });
  });

  it("writes where --out says", () => {
    expect(parse(["someone", "--out", " test/fixtures/live.json "]).out).toBe(
      "test/fixtures/live.json",
    );
    expect(parse(["someone", "--out", ""]).out).toBe(
      "captures/someone-2026-10-19T12-30-05Z.json",
    );
  });

  it("answers --help with the usage", () => {
    expect(parseCaptureArgs(["-h"], {})).toEqual({ help: true });
    expect(CAPTURE_USAGE).toContain("--anonymize");
    expect(CAPTURE_USAGE).toContain("your own LIVE");
  });
});

describe("defaultOutPath", () => {
  it("has no colons, which Windows refuses in file names", () => {
    expect(defaultOutPath("someone", now)).not.toMatch(/:/);
    expect(defaultOutPath(undefined, now)).toBe(
      "captures/capture-2026-10-19T12-30-05Z.json",
    );
  });
});
