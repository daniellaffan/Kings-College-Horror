// Meta-memory: what the game remembers across playthroughs. It lives ONLY in this game's
// own localStorage keys (prefix "khc."), never anywhere else, and "Erase all game memory"
// in Settings removes every one of them.
export interface Memory {
  /** Times a new game was started. */
  runs: number;
  /** Times the chapter was finished. */
  endings: number;
  deaths: number;
  amaraErased: boolean;
  /** Smoothie flavour picked last time (NPCs bring it up). */
  lastSmoothie: string | null;
  /** Act reached on the last run. */
  furthestAct: number;
}

export const PREFIX = 'khc.';
const KEY = `${PREFIX}memory.v1`;
const EMPTY: Memory = { runs: 0, endings: 0, deaths: 0, amaraErased: false, lastSmoothie: null, furthestAct: 0 };

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  key(i: number): string | null;
  readonly length: number;
}

export class MemoryStore {
  data: Memory;
  constructor(private store: KV | null) {
    this.data = this.read();
  }

  private read(): Memory {
    try {
      const raw = this.store?.getItem(KEY);
      if (raw) return { ...EMPTY, ...JSON.parse(raw) };
    } catch {
      /* corrupt or unavailable */
    }
    return { ...EMPTY };
  }

  save() {
    try {
      this.store?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }

  update(patch: Partial<Memory>) {
    Object.assign(this.data, patch);
    this.save();
  }

  /** True when the game has memories of a previous run. */
  get haunted() {
    return this.data.runs > 1 || this.data.endings > 0 || this.data.amaraErased;
  }

  /** Removes every key this game ever wrote (memory, saves, settings). */
  eraseAll() {
    if (this.store) {
      const keys: string[] = [];
      for (let i = 0; i < this.store.length; i++) {
        const k = this.store.key(i);
        if (k?.startsWith(PREFIX)) keys.push(k);
      }
      for (const k of keys) this.store.removeItem(k);
    }
    this.data = { ...EMPTY };
  }
}

function safeStorage(): KV | null {
  try {
    const s = window.localStorage;
    s.getItem(KEY);
    return s;
  } catch {
    return null;
  }
}

export const memory = new MemoryStore(typeof window === 'undefined' ? null : safeStorage());
