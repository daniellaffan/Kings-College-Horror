// Cancellable coroutine runner for story scripts. Beats are plain async functions that
// await `wait(seconds)` / `until(cond)`; cancelling (on death or quit) rejects every
// pending await so the beat unwinds, and the checkpoint can be replayed cleanly.
export class Cancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

interface Pending {
  done: () => boolean;
  resolve: () => void;
  reject: (e: Error) => void;
}

export class Runner {
  private pending: Pending[] = [];
  private gen = 0;
  time = 0;

  /** Seconds of game time (pauses with the game). */
  wait(seconds: number): Promise<void> {
    const end = this.time + seconds;
    return this.until(() => this.time >= end);
  }

  until(cond: () => boolean): Promise<void> {
    const gen = this.gen;
    return new Promise<void>((resolve, reject) => {
      if (gen !== this.gen) return reject(new Cancelled());
      this.pending.push({ done: cond, resolve, reject });
    });
  }

  /** Wraps any promise (UI dialogue etc.) so cancellation also aborts it. */
  guard<T>(p: Promise<T>): Promise<T> {
    const gen = this.gen;
    return p.then((v) => {
      if (gen !== this.gen) throw new Cancelled();
      return v;
    });
  }

  tick(dt: number) {
    this.time += dt;
    const ready = this.pending.filter((p) => p.done());
    this.pending = this.pending.filter((p) => !ready.includes(p));
    for (const p of ready) p.resolve();
  }

  cancel() {
    this.gen++;
    const old = this.pending;
    this.pending = [];
    for (const p of old) p.reject(new Cancelled());
  }

  get generation() {
    return this.gen;
  }

  /** Runs a script, swallowing cancellation. */
  async run(fn: () => Promise<void>): Promise<boolean> {
    try {
      await fn();
      return true;
    } catch (e) {
      if (e instanceof Cancelled) return false;
      throw e;
    }
  }
}
