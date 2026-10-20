import { describe, expect, it, vi } from "vitest";
import { consoleLogger } from "./logger.js";

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
