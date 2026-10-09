// The RPG layer: quests, XP/levels, stats, HP, inventory, friendship and the save slot.
// Everything here is presented honestly in Act I and then bent by the mind director:
// stat labels change, quests un-complete, entries are written "by someone else".
import type { KV } from '../mind/memory';

export type StatKey = 'charm' | 'grit' | 'wits';

export interface QuestDef {
  id: string;
  title: string;
  objective: string;
  xp: number;
  stat?: [StatKey, number];
  /** Anchor key the minimap/compass points at. */
  target?: string;
}

export interface QuestState {
  def: QuestDef;
  status: 'active' | 'done';
  /** Written in second person by "someone else" (Act II). */
  you?: boolean;
  order: number;
}

export interface Item {
  id: string;
  name: string;
  wet?: boolean;
}

export interface SaveData {
  level: number;
  xp: number;
  stats: Record<StatKey, number>;
  inventory: Item[];
  friendship: Record<string, number>;
  quests: { id: string; status: 'active' | 'done'; you?: boolean; title?: string; objective?: string }[];
  act: number;
  day: number;
  checkpoint: string;
  smoothie: string | null;
}

const SAVE_KEY = 'khc.save.v1';

type Listener = () => void;

export class RPG {
  level = 1;
  xp = 0;
  hp = 100;
  stats: Record<StatKey, number> = { charm: 3, grit: 3, wits: 3 };
  statNames: Record<StatKey, string> = { charm: 'Charm', grit: 'Grit', wits: 'Wits' };
  hpLabel = 'HP';
  inventory: Item[] = [];
  friendship: Record<string, number> = { amara: 0 };
  quests = new Map<string, QuestState>();
  tracked: string | null = null;
  act = 1;
  day = 1;
  checkpoint = 'start';
  smoothie: string | null = null;
  private order = 0;
  private listeners: Listener[] = [];
  /** Fired on level-up / quest complete so the UI can toast. */
  onToast: (text: string, kind?: 'gold' | 'wrong' | '') => void = () => undefined;

  constructor(private store: KV | null) {}

  onChange(fn: Listener) {
    this.listeners.push(fn);
  }

  changed() {
    for (const l of this.listeners) l();
  }

  xpToNext(level = this.level) {
    return 60 + level * 40;
  }

  addXP(n: number) {
    this.xp += n;
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level++;
      this.onToast(`LEVEL UP! You are now level ${this.level}`, 'gold');
    }
    this.changed();
  }

  addStat(k: StatKey, n: number) {
    this.stats[k] += n;
    this.onToast(`${this.statNames[k]} +${n}`);
    this.changed();
  }

  start(def: QuestDef, opts: { you?: boolean; track?: boolean } = {}) {
    const existing = this.quests.get(def.id);
    if (existing) {
      existing.status = 'active';
      existing.def = def;
    } else this.quests.set(def.id, { def, status: 'active', you: opts.you, order: this.order++ });
    if (opts.track !== false) this.tracked = def.id;
    if (!opts.you) this.onToast(`New quest: ${def.title}`);
    this.changed();
  }

  complete(id: string, reward = true) {
    const q = this.quests.get(id);
    if (!q || q.status === 'done') return;
    q.status = 'done';
    if (reward) {
      this.onToast(`Quest complete: ${q.def.title}  +${q.def.xp} XP`, 'gold');
      this.addXP(q.def.xp);
      if (q.def.stat) this.addStat(q.def.stat[0], q.def.stat[1]);
    }
    if (this.tracked === id) this.tracked = this.nextActive();
    this.changed();
  }

  /** Act II: a finished quest quietly becomes unfinished again. */
  uncomplete(id: string) {
    const q = this.quests.get(id);
    if (!q) return;
    q.status = 'active';
    this.changed();
  }

  remove(id: string) {
    this.quests.delete(id);
    if (this.tracked === id) this.tracked = this.nextActive();
    this.changed();
  }

  isDone(id: string) {
    return this.quests.get(id)?.status === 'done';
  }

  isActive(id: string) {
    return this.quests.get(id)?.status === 'active';
  }

  nextActive(): string | null {
    const active = [...this.quests.values()].filter((q) => q.status === 'active' && !q.you).sort((a, b) => a.order - b.order);
    return active[0]?.def.id ?? null;
  }

  give(item: Item, toast = true) {
    if (this.has(item.id)) return;
    this.inventory.push(item);
    if (toast) this.onToast(`Got: ${item.name}`);
    this.changed();
  }

  take(id: string) {
    this.inventory = this.inventory.filter((i) => i.id !== id);
    this.changed();
  }

  has(id: string) {
    return this.inventory.some((i) => i.id === id);
  }

  befriend(who: string, n: number) {
    this.friendship[who] = Math.max(0, Math.min(100, (this.friendship[who] ?? 0) + n));
    this.changed();
  }

  damage(n: number) {
    this.hp = Math.max(0, Math.min(100, this.hp - n));
    this.changed();
  }

  serialize(): SaveData {
    return {
      level: this.level,
      xp: this.xp,
      stats: { ...this.stats },
      inventory: this.inventory.map((i) => ({ ...i })),
      friendship: { ...this.friendship },
      quests: [...this.quests.values()].map((q) => ({ id: q.def.id, status: q.status, you: q.you, title: q.def.title, objective: q.def.objective })),
      act: this.act,
      day: this.day,
      checkpoint: this.checkpoint,
      smoothie: this.smoothie,
    };
  }

  save() {
    try {
      this.store?.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
    } catch {
      /* ignore */
    }
  }

  hasSave(): boolean {
    try {
      return !!this.store?.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  loadSave(defs: Record<string, QuestDef>): boolean {
    try {
      const raw = this.store?.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw) as SaveData;
      this.level = s.level;
      this.xp = s.xp;
      this.stats = s.stats;
      this.inventory = s.inventory;
      this.friendship = s.friendship;
      this.quests.clear();
      for (const q of s.quests) {
        const def = defs[q.id] ?? { id: q.id, title: q.title ?? q.id, objective: q.objective ?? '', xp: 0 };
        this.quests.set(q.id, { def, status: q.status, you: q.you, order: this.order++ });
      }
      this.tracked = this.nextActive();
      this.act = s.act;
      this.day = s.day;
      this.checkpoint = s.checkpoint;
      this.smoothie = s.smoothie;
      this.changed();
      return true;
    } catch {
      return false;
    }
  }

  reset() {
    this.level = 1;
    this.xp = 0;
    this.hp = 100;
    this.stats = { charm: 3, grit: 3, wits: 3 };
    this.statNames = { charm: 'Charm', grit: 'Grit', wits: 'Wits' };
    this.hpLabel = 'HP';
    this.inventory = [];
    this.friendship = { amara: 0 };
    this.quests.clear();
    this.tracked = null;
    this.act = 1;
    this.day = 1;
    this.checkpoint = 'start';
    this.smoothie = null;
    this.changed();
  }
}
