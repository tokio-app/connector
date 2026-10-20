import { describe, expect, it, vi } from "vitest";
import { consoleLogger, createConsoleLogger, type LogLevel } from "./logger.js";

const LEVELS = ["debug", "info", "warn", "error"] as const;

// A console whose methods record what they get.
function recordingConsole() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("consoleLogger", () => {
  it("writes warnings and errors to the console with a prefix", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    consoleLogger("warn", "slow", { ms: 5 });
    consoleLogger("error", "failed");

    expect(warn).toHaveBeenCalledWith("[@tokioapp/connector] slow", { ms: 5 });
    expect(error).toHaveBeenCalledWith("[@tokioapp/connector] failed");
  });

  it("drops debug and info entries", () => {
    const spies = (["log", "info", "debug", "warn", "error"] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => undefined),
    );

    consoleLogger("debug", "details");
    consoleLogger("info", "news", { a: 1 });

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("createConsoleLogger", () => {
  it.each([
    ["debug", ["debug", "info", "warn", "error"]],
    ["info", ["info", "warn", "error"]],
    ["warn", ["warn", "error"]],
    ["error", ["error"]],
  ] as const)(
    "prints %s and the levels above it",
    (level, printed: readonly LogLevel[]) => {
      const target = recordingConsole();
      const logger = createConsoleLogger({ level, console: target });
      for (const entry of LEVELS) logger(entry, `a ${entry} entry`);
      for (const entry of LEVELS) {
        expect(target[entry]).toHaveBeenCalledTimes(
          printed.includes(entry) ? 1 : 0,
        );
      }
    },
  );

  it("names the level of debug and info entries, and passes the data on", () => {
    const target = recordingConsole();
    const logger = createConsoleLogger({ level: "debug", console: target });

    logger("debug", "frame", { bytes: 3 });
    logger("info", "entered");
    logger("warn", "slow", { ms: 5 });
    logger("error", "failed");

    expect(target.debug).toHaveBeenCalledWith(
      "[@tokioapp/connector] debug: frame",
      { bytes: 3 },
    );
    expect(target.info).toHaveBeenCalledWith(
      "[@tokioapp/connector] info: entered",
    );
    expect(target.warn).toHaveBeenCalledWith("[@tokioapp/connector] slow", {
      ms: 5,
    });
    expect(target.error).toHaveBeenCalledWith("[@tokioapp/connector] failed");
  });

  it("prints warnings and errors to the global console by default", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logger = createConsoleLogger();

    logger("info", "news");
    logger("warn", "slow");

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[@tokioapp/connector] slow");
  });

  it("refuses an unknown level", () => {
    expect(() => createConsoleLogger({ level: "verbose" as LogLevel })).toThrow(
      new RangeError("level must be debug, info, warn or error, got verbose"),
    );
    expect(() =>
      createConsoleLogger({ level: "toString" as LogLevel }),
    ).toThrow(RangeError);
    expect(() =>
      createConsoleLogger({ level: 1 as unknown as LogLevel }),
    ).toThrow(RangeError);
  });
});
