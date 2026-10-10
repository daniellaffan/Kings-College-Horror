// Generic building shell from a rectilinear OSM footprint (in the local frame):
// exterior walls with doors and window bands, floor, ceiling, roof and parapet.
import * as THREE from 'three';
import { polygonGeometry, type Builder, type Opening } from './builder';
import type { Vec2 } from './geo';
import type { Mats } from './props';

export interface ShellDoor {
  /** Any point on the target edge; the door is centred on it. */
  at: Vec2;
  width: number;
}

export interface ShellOptions {
  height: number;
  storeyHeight?: number;
  doors?: ShellDoor[];
  /** Door-shaped panels drawn on the wall that stay shut (no opening). */
  fakeDoors?: ShellDoor[];
  /** If true the ground storey has clear glass and an interior ceiling at storeyHeight. */
  enterable?: boolean;
  windowEvery?: number;
  outer?: THREE.Material;
  inner?: THREE.Material;
  floor?: THREE.Material;
  /** Parapet and floor-band material (default: tinted stucco). */
  trim?: THREE.Material;
  /** Outer skin above the ground storey (default: same as `outer`). */
  upperOuter?: THREE.Material;
  roof?: THREE.Material;
}

interface Edge {
  axis: 'u' | 'v';
  fixed: number;
  from: number;
  to: number;
  outerSide: 1 | -1;
}

/** Splits a rectilinear polygon into axis-aligned edges with their outward side. */
export function edgesOf(pts: Vec2[]): Edge[] {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  const ccw = area > 0;
  const edges: Edge[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (Math.hypot(dx, dy) < 0.5) continue;
    // Outward normal: right of travel for CCW polygons.
    const nx = ccw ? dy : -dy;
    const ny = ccw ? -dx : dx;
    if (Math.abs(dx) > Math.abs(dy)) {
      edges.push({ axis: 'v', fixed: (a[1] + b[1]) / 2, from: Math.min(a[0], b[0]), to: Math.max(a[0], b[0]), outerSide: ny > 0 ? 1 : -1 });
    } else {
      edges.push({ axis: 'u', fixed: (a[0] + b[0]) / 2, from: Math.min(a[1], b[1]), to: Math.max(a[1], b[1]), outerSide: nx > 0 ? 1 : -1 });
    }
  }
  return edges;
}

function onEdge(e: Edge, p: Vec2): number | null {
  const [along, across] = e.axis === 'v' ? [p[0], p[1]] : [p[1], p[0]];
  if (Math.abs(across - e.fixed) > 1.5 || along < e.from || along > e.to) return null;
  return along;
}

export function buildShell(b: Builder, m: Mats, pts: Vec2[], o: ShellOptions) {
  const sh = o.storeyHeight ?? 3.8;
  const storeys = Math.max(1, Math.round(o.height / sh));
  const every = o.windowEvery ?? 3.6;
  const outer = o.outer ?? m.stucco;
  const inner = o.inner ?? m.plaster;
  const trim = o.trim ?? m.stuccoTint;
  for (const e of edgesOf(pts)) {
    const doors = (o.doors ?? []).map((d) => ({ d, at: onEdge(e, d.at) })).filter((x) => x.at !== null);
    const openings: Opening[] = doors.map((x) => ({ at: x.at!, width: x.d.width, top: 2.4 }));
    const n = Math.floor((e.to - e.from - 1.5) / every);
    for (let s = 0; s < storeys; s++) {
      const ops = s === 0 ? openings : [];
      for (let i = 0; i < n; i++) {
        const at = e.from + ((i + 0.5) * (e.to - e.from)) / n;
        if (ops.some((op) => Math.abs(op.at - at) < op.width / 2 + 1.2)) continue;
        ops.push({ at, width: Math.min(2.2, every - 1.2), bottom: 0.9, top: 2.7, glass: true, dark: !(o.enterable && s === 0) });
      }
      b.wall(e.axis, e.fixed, e.from, e.to, {
        height: s === storeys - 1 ? o.height - s * sh : sh,
        y0: s * sh,
        thickness: 0.3,
        inner,
        outer: s > 0 ? (o.upperOuter ?? outer) : outer,
        outerSide: e.outerSide,
        openings: ops,
        tile: 2.5,
      });
      // Floor-line band between storeys, a common detail on Bahamian school blocks.
      if (s > 0) {
        const off = e.outerSide * 0.18;
        if (e.axis === 'v') b.box(e.from - 0.2, e.to + 0.2, e.fixed + off - 0.06, e.fixed + off + 0.06, s * sh - 0.15, s * sh + 0.1, trim, { tile: 2 });
        else b.box(e.fixed + off - 0.06, e.fixed + off + 0.06, e.from - 0.2, e.to + 0.2, s * sh - 0.15, s * sh + 0.1, trim, { tile: 2 });
      }
    }
    for (const fd of o.fakeDoors ?? []) {
      const at = onEdge(e, fd.at);
      if (at === null) continue;
      const off = e.outerSide * 0.16;
      if (e.axis === 'v') b.box(at - fd.width / 2, at + fd.width / 2, e.fixed + off - 0.03, e.fixed + off + 0.03, 0, 2.3, m.darkMetal, { tile: 1 });
      else b.box(e.fixed + off - 0.03, e.fixed + off + 0.03, at - fd.width / 2, at + fd.width / 2, 0, 2.3, m.darkMetal, { tile: 1 });
    }
    // Parapet.
    const pOff = e.outerSide * 0.1;
    if (e.axis === 'v') b.box(e.from - 0.15, e.to + 0.15, e.fixed + pOff - 0.12, e.fixed + pOff + 0.12, o.height, o.height + 0.9, trim, { tile: 2 });
    else b.box(e.fixed + pOff - 0.12, e.fixed + pOff + 0.12, e.from - 0.15, e.to + 0.15, o.height, o.height + 0.9, trim, { tile: 2 });
  }
  b.add(polygonGeometry(pts, o.height, 3), o.roof ?? m.roof, true);
  if (o.enterable) {
    b.add(polygonGeometry(pts, 0.02, 2), o.floor ?? m.terrazzo, false);
    b.add(polygonGeometry(pts, Math.min(sh, o.height) - 0.4, 1.2, true), m.ceiling, false);
  }
}
