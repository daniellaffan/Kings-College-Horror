// A walkability grid over the ground plane plus A* pathfinding, used by the Hollowed.
import type { CollisionWorld } from './collision';

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly walkable: Uint8Array;

  constructor(
    readonly minX: number,
    readonly minZ: number,
    maxX: number,
    maxZ: number,
    readonly cell: number,
    world: CollisionWorld,
    agentRadius: number,
  ) {
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    this.walkable = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const [x, z] = this.center(c, r);
        this.walkable[r * this.cols + c] = world.blocked(x, z, agentRadius) ? 0 : 1;
      }
    }
  }

  center(c: number, r: number): [number, number] {
    return [this.minX + (c + 0.5) * this.cell, this.minZ + (r + 0.5) * this.cell];
  }

  cellOf(x: number, z: number): [number, number] {
    return [Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell)];
  }

  isWalkable(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.walkable[r * this.cols + c] === 1;
  }

  /** Nearest walkable cell to (c, r), searching outward in rings. */
  nearestWalkable(c: number, r: number, maxRing = 6): [number, number] | null {
    if (this.isWalkable(c, r)) return [c, r];
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dc = -ring; dc <= ring; dc++) {
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          if (this.isWalkable(c + dc, r + dr)) return [c + dc, r + dr];
        }
      }
    }
    return null;
  }

  /** A* with 8-way moves and no corner cutting. Returns world points, or null if unreachable. */
  findPath(sx: number, sz: number, tx: number, tz: number, maxNodes = 20000): [number, number][] | null {
    const s = this.nearestWalkable(...this.cellOf(sx, sz));
    const t = this.nearestWalkable(...this.cellOf(tx, tz));
    if (!s || !t) return null;
    const cols = this.cols;
    const start = s[1] * cols + s[0];
    const goal = t[1] * cols + t[0];
    const g = new Map<number, number>([[start, 0]]);
    const came = new Map<number, number>();
    const open = new MinHeap();
    const h = (i: number) => {
      const dc = Math.abs((i % cols) - t[0]);
      const dr = Math.abs(Math.floor(i / cols) - t[1]);
      return Math.max(dc, dr) + 0.4142 * Math.min(dc, dr);
    };
    open.push(start, h(start));
    const closed = new Set<number>();
    let expanded = 0;
    while (open.size) {
      const cur = open.pop();
      if (cur === goal) return this.smooth(this.rebuild(came, cur));
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (++expanded > maxNodes) return null;
      const cc = cur % cols;
      const cr = Math.floor(cur / cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (!this.isWalkable(nc, nr)) continue;
          if (dc && dr && (!this.isWalkable(cc + dc, cr) || !this.isWalkable(cc, cr + dr))) continue;
          const ni = nr * cols + nc;
          const ng = g.get(cur)! + (dc && dr ? Math.SQRT2 : 1);
          if (ng < (g.get(ni) ?? Infinity)) {
            g.set(ni, ng);
            came.set(ni, cur);
            open.push(ni, ng + h(ni));
          }
        }
      }
    }
    return null;
  }

  private rebuild(came: Map<number, number>, cur: number): [number, number][] {
    const cells = [cur];
    while (came.has(cur)) cells.push((cur = came.get(cur)!));
    cells.reverse();
    return cells.map((i) => this.center(i % this.cols, Math.floor(i / this.cols)));
  }

  /** Drops points that are visible across walkable cells from an earlier point. */
  private smooth(pts: [number, number][]): [number, number][] {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.clearLine(pts[anchor], pts[i])) {
        out.push(pts[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  clearLine(a: [number, number], b: [number, number]): boolean {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (this.cell * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(...this.cellOf(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))) return false;
    }
    return true;
  }
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, p: number) {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastI = this.items.pop()!;
    const lastP = this.prio.pop()!;
    if (this.items.length) {
      this.items[0] = lastI;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}
