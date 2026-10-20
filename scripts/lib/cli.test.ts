import { describe, expect, it, vi } from "vitest";
import { consoleLogger, EulerSigner } from "../../src/index.js";
import {
  connectionOptions,
  createLogger,
  parseCommand,
  readDuration,
  UsageError,
  type CommonArgs,
} from "./cli.js";

const spec = { defaultSeconds: 30, flags: {} };

function parse(argv: string[], env: Record<string, string> = {}): CommonArgs {
  const command = parseCommand(argv, env, spec);
  if (command.help) throw new Error("expected a command, got --help");
  return command.args.common;
}

describe("parseCommand", () => {
  it("applies the defaults", () => {
    expect(parse(["someone"])).toEqual({
      username: "someone",
      durationMs: 30_000,
      roomId: undefined,
      apiKey: undefined,
      host: undefined,
      verbose: false,
    });
  });

  it("normalizes the username like the library", () => {
    expect(parse(["@someone"]).username).toBe("someone");
    expect(
      parse(["https://www.tiktok.com/@someone/live?lang=en"]).username,
    ).toBe("someone");
  });

  it("reads every common flag", () => {
    expect(
      parse([
        "someone",
        "--seconds",
        "12.5",
        "--room-id",
        " 7140000000000000001 ",
        "--api-key",
        "key",
        "--host",
        "https://api.eulerstream.com/",
        "-v",
      ]),
    ).toEqual({
      username: "someone",
      durationMs: 12_500,
      roomId: "7140000000000000001",
      apiKey: "key",
      host: "https://api.eulerstream.com",
      verbose: true,
    });
  });

  it("takes the API key from EULER_API_KEY, unless the flag gives one", () => {
    expect(parse(["someone"], { EULER_API_KEY: " env-key " }).apiKey).toBe(
      "env-key",
    );
    expect(
      parse(["someone", "--api-key", "flag-key"], { EULER_API_KEY: "env-key" })
        .apiKey,
    ).toBe("flag-key");
    expect(
      parse(["someone", "--api-key", ""], { EULER_API_KEY: "env-key" }).apiKey,
    ).toBeUndefined();
    expect(parse(["someone"], { EULER_API_KEY: "  " }).apiKey).toBeUndefined();
  });

  it("returns the script's own flags", () => {
    const command = parseCommand(
      ["someone", "--json"],
      {},
      {
        defaultSeconds: 5,
        flags: { json: { type: "boolean" } },
      },
    );
    expect(command.help).toBe(false);
    if (!command.help) {
      expect(command.args.values.json).toBe(true);
      expect(command.args.common.durationMs).toBe(5_000);
    }
  });

  it.each([["--help"], ["-h"], ["someone", "--help"], ["--nope", "-h"]])(
    "asks for help with %j",
    (...argv) => {
      expect(parseCommand(argv, {}, spec)).toEqual({ help: true });
    },
  );

  it.each([
    [[], "Missing the username"],
    [["a", "b"], 'Unexpected argument "b"'],
    [["@"], "No username"],
    [["someone", "--nope"], "--nope"],
    [["someone", "--seconds"], "--seconds"],
    [["someone", "--seconds", "0"], "--seconds takes a number of seconds"],
    [["someone", "--seconds=-3"], "--seconds takes a number of seconds"],
    [["someone", "--seconds", "soon"], "--seconds takes a number of seconds"],
    [["someone", "--room-id", "abc"], "--room-id takes a numeric room id"],
    [["someone", "--host", "not a url"], "--host takes a URL"],
    [["someone", "--host", "ftp://example.com"], "--host takes an http(s) URL"],
  ])("refuses %j", (argv, message) => {
    expect(() => parseCommand(argv, {}, spec)).toThrow(UsageError);
    expect(() => parseCommand(argv, {}, spec)).toThrow(message);
  });
});

describe("readDuration", () => {
  it("turns seconds into milliseconds", () => {
    expect(readDuration("--x", "1")).toBe(1_000);
    expect(readDuration("--x", "0.25")).toBe(250);
  });

  it.each(["", " ", "0", "-1", "Infinity", "NaN", "1s"])(
    "refuses %j",
    (value) => {
      expect(() => readDuration("--x", value)).toThrow(
        `--x takes a number of seconds above 0, got "${value}"`,
      );
    },
  );
});

describe("createLogger", () => {
  it("is the library's console logger without --verbose", () => {
    expect(createLogger(false)).toBe(consoleLogger);
  });

  it("also prints debug and info entries to stderr with --verbose", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = createLogger(true);

    logger("debug", "frame", { bytes: 3 });
    logger("info", "entered");
    logger("warn", "slow");

    expect(error).toHaveBeenCalledWith("[@tokioapp/connector] debug: frame", {
      bytes: 3,
    });
    expect(error).toHaveBeenCalledWith("[@tokioapp/connector] info: entered");
    expect(warn).toHaveBeenCalledWith("[@tokioapp/connector] slow");
    expect(log).not.toHaveBeenCalled();
  });
});

describe("connectionOptions", () => {
  it("signs with Euler Stream and passes the room id and logger", () => {
    const options = connectionOptions({
      username: "someone",
      durationMs: 1_000,
      roomId: "7140000000000000001",
      apiKey: "key",
      host: "https://api.eulerstream.com",
      verbose: false,
    });
    expect(options.roomId).toBe("7140000000000000001");
    expect(options.signer).toBeInstanceOf(EulerSigner);
    expect(options.logger).toBe(consoleLogger);
  });
});
