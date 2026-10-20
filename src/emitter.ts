import { EventEmitter } from "node:events";

/**
 * A listener for one event. It may be async: a rejected promise is caught and
 * reported like a thrown error.
 */
export type Listener<T> = (payload: T) => unknown;

/** The event names of an event map. */
export type EventName<Events> = keyof Events & string;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A typed event emitter on top of `node:events`. Each event has one payload
 * argument, typed by the `Events` map.
 *
 * Unlike `EventEmitter`, `emit` never throws: a listener that throws, or
 * returns a promise that rejects, is reported through
 * {@link TypedEmitter.onListenerError} and the other listeners still run.
 * Emitting `error` without a listener is not an error either.
 */
export class TypedEmitter<Events extends object> {
  readonly #events = new EventEmitter();

  /** Adds a listener for `event`. */
  on<K extends EventName<Events>>(
    event: K,
    listener: Listener<Events[K]>,
  ): this {
    this.#events.on(event, listener);
    return this;
  }

  /** Adds a listener that runs on the next `event` only. */
  once<K extends EventName<Events>>(
    event: K,
    listener: Listener<Events[K]>,
  ): this {
    // Marked with the listener it wraps, the way node:events marks its own
    // once wrappers, so off(event, listener) removes it.
    const wrapper = Object.assign(
      (payload: Events[K]) => {
        this.#events.removeListener(event, wrapper);
        return listener.call(this, payload);
      },
      { listener },
    );
    this.#events.on(event, wrapper);
    return this;
  }

  /** Removes a listener added with `on` or `once`. */
  off<K extends EventName<Events>>(
    event: K,
    listener: Listener<Events[K]>,
  ): this {
    this.#events.removeListener(event, listener);
    return this;
  }

  /** Removes every listener of `event`, or of every event when `event` is omitted. */
  removeAllListeners(event?: EventName<Events>): this {
    if (event === undefined) this.#events.removeAllListeners();
    else this.#events.removeAllListeners(event);
    return this;
  }

  /** How many listeners `event` has. */
  listenerCount(event: EventName<Events>): number {
    return this.#events.listenerCount(event);
  }

  /**
   * Calls every listener of `event` with `payload`, synchronously and in the
   * order they were added. Returns whether `event` had listeners. Listeners
   * added while it runs are called from the next emit on.
   */
  emit<K extends EventName<Events>>(event: K, payload: Events[K]): boolean {
    const listeners = this.#events.rawListeners(event);
    for (const listener of listeners) {
      try {
        const result: unknown = listener.call(this, payload);
        if (isThenable(result)) {
          result.then(undefined, (error: unknown) => {
            this.#report(error, event);
          });
        }
      } catch (error) {
        this.#report(error, event);
      }
    }
    return listeners.length > 0;
  }

  /**
   * Called when a listener of `event` throws or rejects. The default emits a
   * process warning; subclasses override it to log instead.
   */
  protected onListenerError(error: unknown, event: EventName<Events>): void {
    process.emitWarning(
      `A listener of the "${event}" event threw: ${describe(error)}`,
      { type: "ListenerError" },
    );
  }

  #report(error: unknown, event: EventName<Events>): void {
    try {
      this.onListenerError(error, event);
    } catch {
      // The hook itself failed: nothing left to report to, and emit must not throw.
    }
  }
}
