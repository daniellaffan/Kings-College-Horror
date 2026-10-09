import { describe, expect, it } from 'vitest';
import { MemoryStore, type KV } from '../src/mind/memory';

class FakeStorage implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  get length() {
    return this.m.size;
  }
}

describe('meta-memory', () => {
  it('persists across sessions and "Erase all game memory" removes every game key only', () => {
    const s = new FakeStorage();
    s.setItem('someone.else', 'keep');
    const a = new MemoryStore(s);
    a.update({ runs: 2, amaraErased: true });
    s.setItem('khc.save.v1', '{}');
    s.setItem('khc.settings.v1', '{}');
    const b = new MemoryStore(s);
    expect(b.data.runs).toBe(2);
    expect(b.haunted).toBe(true);
    b.eraseAll();
    expect([...s.m.keys()]).toEqual(['someone.else']);
    expect(new MemoryStore(s).data.runs).toBe(0);
  });
});
