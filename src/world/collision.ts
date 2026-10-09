// 2D collision on the ground plane (world X/Z). Floors are flat, so every collider is
// an axis-aligned box with a height range; the player is a circle.

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Top of the box in metres; used for line-of-sight and "can see over" checks. */
  height: number;
  /** Disabled boxes are ignored (e.g. a door that has been unlocked). */
  enabled?: boolean;
  tag?: string;
}

const CELL = 8;

export class CollisionWorld {
  boxes: Box[] = [];
  private grid = new Map<string, Box[]>();

  add(box: Box): Box {
    box.enabled ??= true;
    this.boxes.push(box);
    for (let cx = Math.floor(box.minX / CELL); cx <= Math.floor(box.maxX / CELL); cx++) {
      for (let cz = Math.floor(box.minZ / CELL); cz <= Math.floor(box.maxZ / CELL); cz++) {
        const k = `${cx},${cz}`;
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(box);
      }
    }
    return box;
  }

  addRect(cx: number, cz: number, w: number, d: number, height: number, tag?: string): Box {
    return this.add({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, height, tag });
  }

  /** Boxes whose cells overlap the given area. */
  query(minX: number, minZ: number, maxX: number, maxZ: number): Box[] {
    const out = new Set<Box>();
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        for (const b of this.grid.get(`${cx},${cz}`) ?? []) if (b.enabled) out.add(b);
      }
    }
    return [...out];
  }

  /** Pushes a circle out of every overlapping box. Returns the corrected position. */
  resolveCircle(x: number, z: number, r: number): [number, number] {
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const b of this.query(x - r, z - r, x + r, z + r)) {
        const nx = Math.max(b.minX, Math.min(x, b.maxX));
        const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
        const dx = x - nx;
        const dz = z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          z = nz + (dz / d) * r;
        } else {
          // Centre inside the box: push out along the shallowest axis.
          const pushes: [number, number, number][] = [
            [b.minX - r - x, 0, x - (b.minX - r)],
            [b.maxX + r - x, 0, b.maxX + r - x],
            [0, b.minZ - r - z, z - (b.minZ - r)],
            [0, b.maxZ + r - z, b.maxZ + r - z],
          ];
          pushes.sort((a, c) => Math.abs(a[2]) - Math.abs(c[2]));
          x += pushes[0][0];
          z += pushes[0][1];
        }
        moved = true;
      }
      if (!moved) break;
    }
    return [x, z];
  }

  blocked(x: number, z: number, r = 0): boolean {
    for (const b of this.query(x - r, z - r, x + r, z + r)) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  }

  /** True when the segment between two points at eye height crosses no box taller than `eye`. */
  lineOfSight(ax: number, az: number, bx: number, bz: number, eye = 1.5): boolean {
    for (const b of this.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz))) {
      if (b.height < eye) continue;
      if (segmentHitsBox(ax, az, bx, bz, b)) return false;
    }
    return true;
  }
}

/** Slab test for a 2D segment against an axis-aligned box. */
export function segmentHitsBox(ax: number, az: number, bx: number, bz: number, b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, ax - b.minX) && clip(dx, b.maxX - ax) && clip(-dz, az - b.minZ) && clip(dz, b.maxZ - az) && t0 <= t1;
}
