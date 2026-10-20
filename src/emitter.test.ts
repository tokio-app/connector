import { describe, expect, it, vi } from "vitest";
import { TypedEmitter, type EventName } from "./emitter.js";

interface TestEvents {
  ping: number;
  pong: string;
  error: Error;
}

class Recorder extends TypedEmitter<TestEvents> {
  readonly failures: { error: unknown; event: EventName<TestEvents> }[] = [];

  protected override onListenerError(
    error: unknown,
    event: EventName<TestEvents>,
  ): void {
    this.failures.push({ error, event });
  }
}

describe("TypedEmitter", () => {
  it("calls listeners in order with the payload and the emitter as this", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const calls: string[] = [];
    let calledOnEmitter = false;
    emitter.on("ping", function (this: unknown, value) {
      calledOnEmitter = this === emitter;
      calls.push(`a${value}`);
    });
    emitter.on("ping", (value) => calls.push(`b${value}`));

    expect(emitter.emit("ping", 1)).toBe(true);
    expect(calls).toEqual(["a1", "b1"]);
    expect(calledOnEmitter).toBe(true);
  });

  it("returns false when the event has no listener, even for error", () => {
    const emitter = new TypedEmitter<TestEvents>();
    expect(emitter.emit("pong", "x")).toBe(false);
    expect(emitter.emit("error", new Error("nobody listens"))).toBe(false);
  });

  it("runs once listeners a single time and counts them until then", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener = vi.fn();
    emitter.once("ping", listener);
    expect(emitter.listenerCount("ping")).toBe(1);

    emitter.emit("ping", 1);
    emitter.emit("ping", 2);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(1);
    expect(emitter.listenerCount("ping")).toBe(0);
  });

  it("calls once listeners with the emitter as this", () => {
    const emitter = new TypedEmitter<TestEvents>();
    let calledOnEmitter = false;
    emitter.once("ping", function (this: unknown) {
      calledOnEmitter = this === emitter;
    });
    emitter.emit("ping", 1);
    expect(calledOnEmitter).toBe(true);
  });

  it("removes listeners with off, once listeners included", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const onListener = vi.fn();
    const onceListener = vi.fn();
    emitter.on("ping", onListener).once("ping", onceListener);

    emitter.off("ping", onListener).off("ping", onceListener);
    emitter.emit("ping", 1);

    expect(onListener).not.toHaveBeenCalled();
    expect(onceListener).not.toHaveBeenCalled();
    expect(emitter.listenerCount("ping")).toBe(0);
  });

  it("removes every listener of one event or of all events", () => {
    const emitter = new TypedEmitter<TestEvents>();
    emitter.on("ping", vi.fn()).on("ping", vi.fn()).on("pong", vi.fn());

    emitter.removeAllListeners("ping");
    expect(emitter.listenerCount("ping")).toBe(0);
    expect(emitter.listenerCount("pong")).toBe(1);

    emitter.removeAllListeners();
    expect(emitter.listenerCount("pong")).toBe(0);
  });

  it("doesn't call listeners added while emitting until the next emit", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const late = vi.fn();
    emitter.on("ping", () => {
      emitter.on("ping", late);
    });

    emitter.emit("ping", 1);
    expect(late).not.toHaveBeenCalled();

    emitter.emit("ping", 2);
    expect(late).toHaveBeenCalledWith(2);
  });

  it("reports a throwing listener and keeps calling the others", () => {
    const emitter = new Recorder();
    const failure = new Error("listener failed");
    const after = vi.fn();
    emitter.on("ping", () => {
      throw failure;
    });
    emitter.on("ping", after);

    expect(() => emitter.emit("ping", 1)).not.toThrow();
    expect(after).toHaveBeenCalledWith(1);
    expect(emitter.failures).toEqual([{ error: failure, event: "ping" }]);
  });

  it("removes a once listener even when it throws", () => {
    const emitter = new Recorder();
    emitter.once("ping", () => {
      throw new Error("once failed");
    });

    emitter.emit("ping", 1);
    emitter.emit("ping", 2);

    expect(emitter.failures).toHaveLength(1);
    expect(emitter.listenerCount("ping")).toBe(0);
  });

  it("reports a listener whose promise rejects", async () => {
    const emitter = new Recorder();
    const failure = new Error("async listener failed");
    emitter.on("pong", async () => {
      throw failure;
    });

    expect(emitter.emit("pong", "x")).toBe(true);
    await vi.waitFor(() => {
      expect(emitter.failures).toEqual([{ error: failure, event: "pong" }]);
    });
  });

  it("ignores promises that resolve", async () => {
    const emitter = new Recorder();
    emitter.on("pong", async () => "done");
    emitter.emit("pong", "x");
    await Promise.resolve();
    expect(emitter.failures).toEqual([]);
  });

  it("emits a process warning by default", () => {
    const warn = vi
      .spyOn(process, "emitWarning")
      .mockImplementation(() => undefined);
    const emitter = new TypedEmitter<TestEvents>();
    emitter.on("ping", () => {
      throw new Error("boom");
    });
    emitter.on("pong", () => {
      // A thrown value that isn't an Error.
      throw "plain";
    });

    emitter.emit("ping", 1);
    emitter.emit("pong", "x");

    expect(warn).toHaveBeenNthCalledWith(
      1,
      'A listener of the "ping" event threw: boom',
      { type: "ListenerError" },
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      'A listener of the "pong" event threw: plain',
      { type: "ListenerError" },
    );
  });

  it("survives a reporting hook that throws", () => {
    class Broken extends TypedEmitter<TestEvents> {
      protected override onListenerError(): void {
        throw new Error("hook failed");
      }
    }
    const emitter = new Broken();
    const after = vi.fn();
    emitter.on("ping", () => {
      throw new Error("listener failed");
    });
    emitter.on("ping", after);

    expect(() => emitter.emit("ping", 1)).not.toThrow();
    expect(after).toHaveBeenCalled();
  });
});
