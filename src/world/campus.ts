// The campus exterior, generated from data/campus.json (© OpenStreetMap contributors, ODbL)
// in the axis-aligned local frame: ground, roads and footways, the football pitch, five-a-side
// cages, sprint track, tennis and padel courts, the 25 m pool, fences, gate, trees and lamps.
// A few connecting paths and the covered walkway are invented to join the mapped footways, as are
// the details from the architect's aerial render: the front canopy, grey classroom pavilions,
// parking inside the drop-off loop, mowing stripes and the groves along the fence.
import * as THREE from 'three';
import { W, polygonGeometry, ribbonGeometry, metricBox, type Builder } from './builder';
import type { Box } from './collision';
import { bounds, campusGridAngle, featureByRole, pointInPolygon, toLocal, type CampusData, type Vec2 } from './geo';
import type { LightPool } from './lights';
import * as P from './props';
import type { Mats } from './props';
import { buildShell } from './shell';
import * as T from './textures';
import { makeWater, type Water } from './water';
import { ACADEMIC_OUTLINE, COURTYARD_PATHS } from './academic';
import { PLANT_SHAFT, buildNeighbours } from './buildings';

/** Fenced campus perimeter (local frame). The gate is on the west side, facing Western Road. */
export const PERIMETER = { u0: -170, u1: 130, v0: -95, v1: 65, gateV0: -20, gateV1: 2 };
export const POOL = { u0: 68, u1: 88.7, v0: -25, v1: -0.8, depth: 2.0, water: -0.22 };
/** Big flat entrance canopy over the walkway, front-centre of the campus. */
export const FRONT_CANOPY = { u0: 0, u1: 20, v0: -22, v1: -2, h: 4.6 };
/**
 * Grey single-storey classroom pavilions scattered round the grounds: [u0, u1, v0, v1, door side].
 * The north-west cluster lines a paved spine at u = -10; the rest sit along the fence.
 */
export const PAVILIONS: [number, number, number, number, 'u0' | 'u1' | 'v0' | 'v1'][] = [
  [-30, -14, 4, 11, 'u1'],
  [-6, 10, 4, 11, 'u0'],
  [-30, -14, 22, 29, 'u1'],
  [-6, 10, 22, 29, 'u0'],
  [-30, -14, 40, 47, 'u1'],
  [-6, 10, 40, 47, 'u0'],
  [70, 84, 57.5, 63.5, 'v0'],
  [89, 103, 57.8, 63.5, 'v0'],
  [108, 120, 56.5, 63.5, 'v0'],
  [121.5, 128.5, -52, -36, 'u0'],
  [94, 108, -92, -85, 'v1'],
];
/** Parking inside the drop-off loop: rows of bays either side of a palm-lined footpath. */
const PARKING = [
  { v0: 4, v1: 30 },
  { v0: -50, v1: -24 },
];
const PARKING_ROWS = [
  [-52.3, -47.4],
  [-44.6, -39.9],
];

export interface CampusRefs {
  water: Water;
  gate: THREE.Group;
  gateBlock: Box;
  poolBlock: Box;
  outlines: Record<'academic' | 'arts' | 'dining' | 'plant', Vec2[]>;
  anchors: Record<string, THREE.Vector3>;
  local: (pts: Vec2[]) => Vec2[];
  /** Footstep surface outdoors at a local point. */
  surface: (u: number, v: number) => 'hard' | 'grass';
}

// ---------------------------------------------------------------- oriented rectangles
interface ORect {
  c: Vec2;
  ax: Vec2;
  ay: Vec2;
  L: number;
  Wd: number;
}

function orient(pts: Vec2[]): ORect {
  const [p0, p1, p2] = pts;
  const e0: Vec2 = [p1[0] - p0[0], p1[1] - p0[1]];
  const e1: Vec2 = [p2[0] - p1[0], p2[1] - p1[1]];
  const l0 = Math.hypot(...e0);
  const l1 = Math.hypot(...e1);
  const c: Vec2 = [(pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4, (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4];
  const [long, short, L, Wd] = l0 >= l1 ? [e0, e1, l0, l1] : [e1, e0, l1, l0];
  const ax: Vec2 = [long[0] / L, long[1] / L];
  // Perpendicular, CCW of ax, so (ax, ay) is right-handed in (u, v).
  const ay: Vec2 = [-ax[1], ax[0]];
  void short;
  return { c, ax, ay, L, Wd };
}

const at = (o: ORect, x: number, y: number): Vec2 => [o.c[0] + o.ax[0] * x + o.ay[0] * y, o.c[1] + o.ax[1] * x + o.ay[1] * y];
const quad = (o: ORect, x0: number, x1: number, y0: number, y1: number): Vec2[] => [at(o, x0, y0), at(o, x1, y0), at(o, x1, y1), at(o, x0, y1)];
const yaw = (o: ORect) => Math.atan2(o.ax[1], o.ax[0]);

class Painter {
  constructor(
    private b: Builder,
    private mat: THREE.Material,
    private y: number,
  ) {}
  seg(o: ORect, x0: number, y0: number, x1: number, y1: number, w = 0.08) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-3) return;
    const nx = (-(y1 - y0) / len) * (w / 2);
    const ny = ((x1 - x0) / len) * (w / 2);
    this.b.add(polygonGeometry([at(o, x0 + nx, y0 + ny), at(o, x1 + nx, y1 + ny), at(o, x1 - nx, y1 - ny), at(o, x0 - nx, y0 - ny)], this.y, 1), this.mat, false);
  }
  rect(o: ORect, x0: number, x1: number, y0: number, y1: number, w = 0.08) {
    this.seg(o, x0, y0, x1, y0, w);
    this.seg(o, x1, y0, x1, y1, w);
    this.seg(o, x1, y1, x0, y1, w);
    this.seg(o, x0, y1, x0, y0, w);
  }
  arc(o: ORect, cx: number, cy: number, r: number, a0: number, a1: number, w = 0.08) {
    const n = Math.max(6, Math.round(((a1 - a0) * r) / 0.6));
    for (let i = 0; i < n; i++) {
      const t0 = a0 + ((a1 - a0) * i) / n;
      const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
      this.seg(o, cx + Math.cos(t0) * r, cy + Math.sin(t0) * r, cx + Math.cos(t1) * r, cy + Math.sin(t1) * r, w);
    }
  }
  spot(o: ORect, x: number, y: number, r = 0.11) {
    const c = at(o, x, y);
    const pts: Vec2[] = [];
    for (let i = 0; i < 12; i++) pts.push([c[0] + Math.cos((i / 12) * Math.PI * 2) * r, c[1] + Math.sin((i / 12) * Math.PI * 2) * r]);
    this.b.add(polygonGeometry(pts, this.y, 1), this.mat, false);
  }
}

/** A box in an oriented rectangle's frame: centre (x, y), size sx (along ax) × sy, from height y0 to y1. */
function obox(b: Builder, o: ORect, x: number, y: number, sx: number, sy: number, y0: number, y1: number, mat: THREE.Material, tile = 1, cast = true) {
  const c = at(o, x, y);
  const g = metricBox(sx, y1 - y0, sy, tile);
  const m = new THREE.Matrix4().compose(W(c[0], c[1], (y0 + y1) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw(o)), new THREE.Vector3(1, 1, 1));
  b.addTransformed(g, mat, m, cast);
}

/** Goal frame + net at pitch end x = ±L/2 (dir = ±1), opening width w, height h, depth d. */
function goal(b: Builder, m: Mats, o: ORect, dir: 1 | -1, w: number, h: number, d: number) {
  const x = (dir * o.L) / 2;
  const post = 0.12;
  obox(b, o, x + dir * 0.06, -w / 2 - post / 2, post, post, 0, h, m.white);
  obox(b, o, x + dir * 0.06, w / 2 + post / 2, post, post, 0, h, m.white);
  obox(b, o, x + dir * 0.06, 0, post, w + post * 2, h, h + post, m.white);
  obox(b, o, x + dir * (d + 0.06), 0, 0.02, w, 0, h * 0.8, m.net, 0.5, false);
  obox(b, o, x + dir * (d / 2 + 0.06), -w / 2, d, 0.02, 0, h * 0.9, m.net, 0.5, false);
  obox(b, o, x + dir * (d / 2 + 0.06), w / 2, d, 0.02, 0, h * 0.9, m.net, 0.5, false);
  obox(b, o, x + dir * (d / 2 + 0.06), 0, d, w, h * 0.85, h * 0.87, m.net, 0.5, false);
  const c = at(o, x + dir * (d / 2), 0);
  b.world.add({ minX: c[0] - 1, maxX: c[0] + 1, minZ: -c[1] - 1, maxZ: -c[1] + 1, height: h });
}

function polylineFence(b: Builder, m: Mats, pts: Vec2[], h: number, gapEvery?: (a: Vec2, c: Vec2) => boolean) {
  for (let i = 0; i < pts.length - 1; i++) if (!gapEvery?.(pts[i], pts[i + 1])) P.fence(b, m, pts[i], pts[i + 1], h);
}

function groundGeometry(outer: Vec2[], holes: Vec2[][], y: number, tile: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outer.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  const g = new THREE.ShapeGeometry(shape);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

const rectPts = (u0: number, u1: number, v0: number, v1: number): Vec2[] => [
  [u0, v0],
  [u1, v0],
  [u1, v1],
  [u0, v1],
];

function distToPolyline(p: Vec2, pts: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, c] = [pts[i], pts[i + 1]];
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return best;
}

const ROAD_STYLE: Record<string, { w: number; y: number; mat: keyof Mats; tile: number }> = {
  primary: { w: 9, y: 0.05, mat: 'asphalt', tile: 6 },
  residential: { w: 6.5, y: 0.05, mat: 'asphalt', tile: 6 },
  service: { w: 5.5, y: 0.055, mat: 'asphalt', tile: 6 },
  track: { w: 3.2, y: 0.04, mat: 'forestFloor', tile: 3 },
  footway: { w: 2.2, y: 0.065, mat: 'wavePaving', tile: 2 },
};

export function buildCampus(b: Builder, m: Mats, lights: LightPool, dynamic: THREE.Group, data: CampusData): CampusRefs {
  const angle = campusGridAngle(data);
  const local = (pts: Vec2[]) => pts.map((p) => toLocal(p, angle));
  const byId = (id: number) => {
    const f = data.features.find((x) => x.id === id);
    if (!f) throw new Error(`campus.json is missing way ${id}`);
    return local(f.points);
  };
  const outlines = {
    academic: ACADEMIC_OUTLINE,
    arts: local(featureByRole(data, 'arts').points),
    dining: local(featureByRole(data, 'dining').points),
    plant: local(featureByRole(data, 'plant').points),
  };
  const S = PLANT_SHAFT;
  const Pm = PERIMETER;

  // ---------------------------------------------------------------- ground
  const campusRect = rectPts(Pm.u0 - 5, Pm.u1 + 5, Pm.v0 - 5, Pm.v1 + 5);
  b.add(
    groundGeometry(campusRect, [rectPts(POOL.u0, POOL.u1, POOL.v0, POOL.v1), rectPts(S.u0, S.u1, S.v0, S.v1)], 0, 3),
    m.grass,
    false,
  );
  b.add(groundGeometry(rectPts(-480, 540, -540, 660), [[...campusRect].reverse()], -0.01, 4), m.forestFloor, false);

  // ---------------------------------------------------------------- roads + footways (OSM)
  const roads: Vec2[][] = [];
  const paved: { pts: Vec2[]; w: number }[] = [];
  for (const f of data.features) {
    if (f.kind === 'road') {
      const st = ROAD_STYLE[f.tags.highway] ?? ROAD_STYLE.service;
      const pts = local(f.points);
      roads.push(pts);
      if (st.mat !== 'forestFloor') paved.push({ pts, w: st.w });
      b.add(ribbonGeometry(pts, st.w, st.y, st.tile), m[st.mat] as THREE.Material, false);
    } else if (f.kind === 'parking') {
      b.add(polygonGeometry(local(f.points), 0.045, 6), m.asphalt, false);
    }
  }
  // Invented connectors: covered walkway east from the drop-off, a path to the Academic porch.
  const walkway: Vec2[] = [
    [-24, -11.6],
    [33, -11.8],
  ];
  const porchPath: Vec2[] = [
    [22, -11.8],
    [22, 50.5],
    [43.1, 50.5],
    [43.1, 47.6],
  ];
  for (const p of [walkway, porchPath]) {
    roads.push(p);
    paved.push({ pts: p, w: 3 });
    b.add(ribbonGeometry(p, 3, 0.065, 2), m.wavePaving, false);
  }
  // Canopy over the walkway, interrupted by the big entrance canopy.
  const C = FRONT_CANOPY;
  for (let u = -22; u <= 30; u += 4.5) {
    if (u > C.u0 - 1 && u < C.u1 + 1) continue;
    for (const v of [-13.5, -10]) b.box(u - 0.1, u + 0.1, v - 0.1, v + 0.1, 0, 2.9, m.steel, { tile: 1, collide: true });
  }
  b.box(-22.5, C.u0, -14, -9.5, 2.9, 3.05, m.metalPaint, { tile: 2 });
  b.box(C.u1, 30.5, -14, -9.5, 2.9, 3.05, m.metalPaint, { tile: 2 });
  // Front canopy: a deep flat concrete slab on round columns over a wave-mosaic plaza.
  b.slab(C.u0, C.u1, C.v0, C.v1, 0.06, m.wavePaving, 2);
  b.box(C.u0 - 0.6, C.u1 + 0.6, C.v0 - 0.6, C.v1 + 0.6, C.h, C.h + 0.8, m.greyTrim, { tile: 2 });
  b.box(C.u0, C.u1, C.v0, C.v1, C.h - 0.02, C.h, m.ceiling, { tile: 2, cast: false });
  for (const u of [C.u0 + 1.5, (C.u0 + C.u1) / 2, C.u1 - 1.5])
    for (const v of [C.v0 + 1.5, C.v1 - 1.5]) {
      b.addTransformed(new THREE.CylinderGeometry(0.28, 0.28, C.h, 16), m.whiteGloss, new THREE.Matrix4().makeTranslation(u, C.h / 2, -v));
      b.world.add({ minX: u - 0.3, maxX: u + 0.3, minZ: -v - 0.3, maxZ: -v + 0.3, height: C.h });
    }
  P.ceilingLights(b, lights, C.u0 + 1, C.u1 - 1, C.v0 + 1, C.v1 - 1, C.h - 0.03, 6, 4);
  for (const [u, v] of [[C.u0 + 4, C.v0 + 4], [C.u1 - 4, C.v1 - 4]]) {
    b.box(u - 1.1, u + 1.1, v - 1.1, v + 1.1, 0, 0.45, m.concrete, { tile: 1, collide: true });
    b.slab(u - 1, u + 1, v - 1, v + 1, 0.44, m.forestFloor, 1);
    P.shrub(b, m, u, v, 0.9);
  }

  // Kerbs + white edge lines on the drop-off loop.
  const loop = byId(1228972436);
  b.add(ribbonGeometry(loop, 5.9, 0.052, 2), m.concrete, false);

  // ---------------------------------------------------------------- sports
  const paint = new Painter(b, m.line, 0.075);
  // Football pitch (5G turf, 92 × 48 m per OSM): full markings scaled to the real pitch.
  {
    const o = orient(byId(1492740458));
    b.add(polygonGeometry(quad(o, -o.L / 2 - 3, o.L / 2 + 3, -o.Wd / 2 - 3, o.Wd / 2 + 3), 0.03, 3), m.turf, false);
    // Mowing stripes across the pitch, as seen from the air.
    const bands = Math.round(o.L / 6);
    for (let k = 0; k < bands; k += 2) {
      const x0 = -o.L / 2 + (k * o.L) / bands;
      b.add(polygonGeometry(quad(o, x0, x0 + o.L / bands, -o.Wd / 2, o.Wd / 2), 0.045, 3), m.turfStripe, false);
    }
    const [hx, hy] = [o.L / 2 - 1, o.Wd / 2 - 1];
    paint.rect(o, -hx, hx, -hy, hy, 0.12);
    paint.seg(o, 0, -hy, 0, hy, 0.12);
    paint.arc(o, 0, 0, 9.15, 0, Math.PI * 2, 0.12);
    paint.spot(o, 0, 0, 0.15);
    for (const s of [-1, 1]) {
      const gx = s * hx;
      paint.rect(o, Math.min(gx, gx - s * 16.5), Math.max(gx, gx - s * 16.5), -Math.min(20.15, hy - 2), Math.min(20.15, hy - 2), 0.12);
      paint.rect(o, Math.min(gx, gx - s * 5.5), Math.max(gx, gx - s * 5.5), -9.16, 9.16, 0.12);
      paint.spot(o, gx - s * 11, 0, 0.15);
      paint.arc(o, gx - s * 11, 0, 9.15, s > 0 ? Math.PI - 0.93 : -0.93, s > 0 ? Math.PI + 0.93 : 0.93, 0.12);
      goal(b, m, o, s as 1 | -1, 7.32, 2.44, 1.8);
    }
    // Floodlight masts.
    for (const [x, y] of [
      [-o.L / 2 - 4, -o.Wd / 2 - 4],
      [o.L / 2 + 4, -o.Wd / 2 - 4],
      [-o.L / 2 - 4, o.Wd / 2 + 4],
      [o.L / 2 + 4, o.Wd / 2 + 4],
    ]) {
      obox(b, o, x, y, 0.35, 0.35, 0, 16, m.darkMetal);
      obox(b, o, x, y, 2.2, 0.5, 16, 17.2, m.darkMetal);
      obox(b, o, x, y + Math.sign(-y) * 0.27, 2.0, 0.04, 16.1, 17.1, lights.glow.street, 1, false);
      const p = at(o, x, y);
      lights.add({ pos: W(p[0], p[1], 15.5), color: new THREE.Color(0xf4f6ff), intensity: 140, group: 'street' });
      b.world.add({ minX: p[0] - 0.3, maxX: p[0] + 0.3, minZ: -p[1] - 0.3, maxZ: -p[1] + 0.3, height: 16 });
    }
  }
  // Five-a-side cages.
  for (const id of [1492740456, 1492740457]) {
    const o = orient(byId(id));
    b.add(polygonGeometry(quad(o, -o.L / 2, o.L / 2, -o.Wd / 2, o.Wd / 2), 0.03, 3), m.turf, false);
    const [hx, hy] = [o.L / 2 - 1, o.Wd / 2 - 1];
    paint.rect(o, -hx, hx, -hy, hy);
    paint.seg(o, 0, -hy, 0, hy);
    paint.arc(o, 0, 0, 3, 0, Math.PI * 2);
    for (const s of [-1, 1]) {
      paint.arc(o, s * hx, 0, 6, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? (3 * Math.PI) / 2 : Math.PI / 2);
      goal(b, m, o, s as 1 | -1, 3.66, 1.83, 1.0);
    }
    const c = quad(o, -o.L / 2, o.L / 2, -o.Wd / 2, o.Wd / 2);
    const gap = at(o, -o.L / 2 + 3, -o.Wd / 2);
    P.fence(b, m, c[0], [gap[0] - 0.01, gap[1]], 4);
    P.fence(b, m, [gap[0] + 2.4, gap[1]], c[1], 4);
    P.fence(b, m, c[1], c[2], 4);
    P.fence(b, m, c[2], c[3], 4);
    P.fence(b, m, c[3], c[0], 4);
    for (let x = -o.L / 2; x < o.L / 2; x += 2.4) {
      obox(b, o, x + 1.2, -o.Wd / 2 + 0.06, 2.3, 0.04, 0, 1.0, m.wood, 1);
      obox(b, o, x + 1.2, o.Wd / 2 - 0.06, 2.3, 0.04, 0, 1.0, m.wood, 1);
    }
  }
  // Sprint straights (OSM tracks are two straight centre lines).
  for (const [id, lanes] of [
    [1492740455, 6],
    [1492740454, 4],
  ] as const) {
    const line = byId(id);
    const width = lanes * 1.22;
    b.add(ribbonGeometry(line, width + 0.6, 0.032, 3), m.track, false);
    const [a, c] = [line[0], line[line.length - 1]];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const o: ORect = { c: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], ax: [(c[0] - a[0]) / len, (c[1] - a[1]) / len], ay: [-(c[1] - a[1]) / len, (c[0] - a[0]) / len], L: len, Wd: width };
    for (let k = 0; k <= lanes; k++) paint.seg(o, -len / 2, -width / 2 + k * 1.22, len / 2, -width / 2 + k * 1.22, 0.05);
    paint.seg(o, len / 2 - 0.3, -width / 2, len / 2 - 0.3, width / 2, 0.3);
  }
  // Tennis courts (rotated on the ground, as mapped).
  for (const id of [1492740450, 1492740451]) {
    const o = orient(byId(id));
    b.add(polygonGeometry(quad(o, -o.L / 2 - 5.5, o.L / 2 + 5.5, -o.Wd / 2 - 3.2, o.Wd / 2 + 3.2), 0.03, 4), m.padelCourt, false);
    b.add(polygonGeometry(quad(o, -o.L / 2, o.L / 2, -o.Wd / 2, o.Wd / 2), 0.035, 4), m.hardCourt, false);
    const tp = new Painter(b, m.line, 0.078);
    const [hx, hd, hs] = [11.885, 5.485, 4.115];
    tp.rect(o, -hx, hx, -hd, hd, 0.05);
    tp.seg(o, -hx, -hs, hx, -hs, 0.05);
    tp.seg(o, -hx, hs, hx, hs, 0.05);
    tp.seg(o, -6.4, -hs, -6.4, hs, 0.05);
    tp.seg(o, 6.4, -hs, 6.4, hs, 0.05);
    tp.seg(o, -6.4, 0, 6.4, 0, 0.05);
    obox(b, o, 0, 0, 0.02, hd * 2 + 1, 0.15, 0.914, m.net, 0.3, false);
    obox(b, o, 0, 0, 0.04, hd * 2 + 1, 0.914, 0.97, m.white);
    for (const s of [-1, 1]) obox(b, o, 0, s * (hd + 0.6), 0.08, 0.08, 0, 1.07, m.darkMetal);
    const c = quad(o, -o.L / 2 - 5.5, o.L / 2 + 5.5, -o.Wd / 2 - 3.2, o.Wd / 2 + 3.2);
    polylineFence(b, m, [...c, c[0]], 3.6);
  }
  // Padel courts: glass back walls, mesh sides.
  for (const id of [1492740452, 1492740453]) {
    const o = orient(byId(id));
    b.add(polygonGeometry(quad(o, -o.L / 2, o.L / 2, -o.Wd / 2, o.Wd / 2), 0.035, 4), m.padelCourt, false);
    const tp = new Painter(b, m.line, 0.078);
    tp.seg(o, 0, -o.Wd / 2, 0, o.Wd / 2, 0.05);
    for (const s of [-1, 1]) tp.seg(o, s * (o.L / 2 - 3), -o.Wd / 2, s * (o.L / 2 - 3), o.Wd / 2, 0.05);
    tp.seg(o, -(o.L / 2 - 3), 0, o.L / 2 - 3, 0, 0.05);
    obox(b, o, 0, 0, 0.02, o.Wd, 0.1, 0.88, m.net, 0.3, false);
    for (const s of [-1, 1]) {
      obox(b, o, s * (o.L / 2), 0, 0.02, o.Wd, 0, 3, b.glass, 1, false);
      const c0 = at(o, s * (o.L / 2), -o.Wd / 2);
      const c1 = at(o, s * (o.L / 2), o.Wd / 2);
      b.world.add({ minX: Math.min(c0[0], c1[0]) - 0.1, maxX: Math.max(c0[0], c1[0]) + 0.1, minZ: -Math.max(c0[1], c1[1]) - 0.1, maxZ: -Math.min(c0[1], c1[1]) + 0.1, height: 3 });
      for (let k = 0; k <= 4; k++) obox(b, o, s * (o.L / 2), -o.Wd / 2 + (k * o.Wd) / 4, 0.08, 0.08, 0, 3.05, m.darkMetal);
    }
    const c = quad(o, -o.L / 2, o.L / 2, -o.Wd / 2, o.Wd / 2);
    P.fence(b, m, c[0], c[1], 3);
    P.fence(b, m, c[2], c[3], 3);
  }

  // ---------------------------------------------------------------- pool
  const Po = POOL;
  // Basin lining, floor, lane stripes, coping.
  const lining = (u0: number, u1: number, v0: number, v1: number) => b.box(u0, u1, v0, v1, -Po.depth, 0, m.poolTile, { tile: 0.5, cast: false });
  lining(Po.u0 - 0.3, Po.u0, Po.v0 - 0.3, Po.v1 + 0.3);
  lining(Po.u1, Po.u1 + 0.3, Po.v0 - 0.3, Po.v1 + 0.3);
  lining(Po.u0, Po.u1, Po.v0 - 0.3, Po.v0);
  lining(Po.u0, Po.u1, Po.v1, Po.v1 + 0.3);
  b.slab(Po.u0, Po.u1, Po.v0, Po.v1, -Po.depth, m.poolTile, 0.5);
  const stripe = new THREE.MeshStandardMaterial({ color: 0x0c2340, roughness: 0.2 });
  const lanes = 8;
  for (let k = 0; k < lanes; k++) {
    const u = Po.u0 + ((k + 0.5) * (Po.u1 - Po.u0)) / lanes;
    b.slab(u - 0.13, u + 0.13, Po.v0 + 2, Po.v1 - 2, -Po.depth + 0.005, stripe, 1);
    b.slab(u - 0.5, u + 0.5, Po.v0 + 2, Po.v0 + 2.26, -Po.depth + 0.005, stripe, 1);
    b.slab(u - 0.5, u + 0.5, Po.v1 - 2.26, Po.v1 - 2, -Po.depth + 0.005, stripe, 1);
  }
  // Red and white lane ropes.
  for (let k = 0; k <= lanes; k++) {
    const u = Po.u0 + (k * (Po.u1 - Po.u0)) / lanes;
    for (let v = Po.v0, i = 0; v < Po.v1 - 0.01; v += 1, i++)
      b.box(u - 0.04, u + 0.04, v, Math.min(v + 1, Po.v1), Po.water - 0.04, Po.water + 0.04, i % 2 ? m.whiteGloss : m.ropeRed, { tile: 1, cast: false });
  }
  const coping = m.whiteGloss;
  b.box(Po.u0 - 0.45, Po.u1 + 0.45, Po.v0 - 0.45, Po.v0, -0.02, 0.06, coping, { tile: 1, cast: false });
  b.box(Po.u0 - 0.45, Po.u1 + 0.45, Po.v1, Po.v1 + 0.45, -0.02, 0.06, coping, { tile: 1, cast: false });
  b.box(Po.u0 - 0.45, Po.u0, Po.v0, Po.v1, -0.02, 0.06, coping, { tile: 1, cast: false });
  b.box(Po.u1, Po.u1 + 0.45, Po.v0, Po.v1, -0.02, 0.06, coping, { tile: 1, cast: false });
  // Deck.
  const deck = { u0: 64.5, u1: 92.5, v0: -28.5, v1: 2.5 };
  b.slab(deck.u0, deck.u1, deck.v0, Po.v0 - 0.45, 0.04, m.paving, 2);
  b.slab(deck.u0, deck.u1, Po.v1 + 0.45, deck.v1, 0.04, m.paving, 2);
  b.slab(deck.u0, Po.u0 - 0.45, Po.v0 - 0.45, Po.v1 + 0.45, 0.04, m.paving, 2);
  b.slab(Po.u1 + 0.45, deck.u1, Po.v0 - 0.45, Po.v1 + 0.45, 0.04, m.paving, 2);
  // Underwater lights.
  for (let v = Po.v0 + 3; v < Po.v1 - 2; v += 5) {
    for (const u of [Po.u0 + 0.01, Po.u1 - 0.01]) {
      b.box(u - 0.02, u + 0.02, v - 0.15, v + 0.15, -0.95, -0.65, lights.glow.pool, { tile: 1, cast: false });
      lights.add({ pos: W(u + (u < 78 ? 0.6 : -0.6), v, -0.8), color: new THREE.Color(0x7fd8ff), intensity: 8, group: 'pool' });
    }
  }
  const water = makeWater(Po.u1 - Po.u0, Po.v1 - Po.v0);
  water.mesh.position.copy(W((Po.u0 + Po.u1) / 2, (Po.v0 + Po.v1) / 2, Po.water));
  dynamic.add(water.mesh);
  const poolBlock = b.world.add({ minX: Po.u0 - 0.2, maxX: Po.u1 + 0.2, minZ: -Po.v1 - 0.2, maxZ: -Po.v0 + 0.2, height: 0.3, tag: 'pool' });
  // Pool fence with a gate gap facing the walkway (west side).
  polylineFence(b, m, [
    [deck.u0, -10.6],
    [deck.u0, deck.v1],
    [deck.u1, deck.v1],
    [deck.u1, deck.v0],
    [deck.u0, deck.v0],
    [deck.u0, -13.4],
  ], 1.8);
  // Lifeguard chair + sign.
  b.box(88.9, 89.0, -14, -13.9, 0, 2.2, m.white, { tile: 1 });
  b.box(90.1, 90.2, -14, -13.9, 0, 2.2, m.white, { tile: 1 });
  b.box(88.9, 89.0, -12.4, -12.3, 0, 2.2, m.white, { tile: 1 });
  b.box(90.1, 90.2, -12.4, -12.3, 0, 2.2, m.white, { tile: 1 });
  b.box(88.8, 90.3, -14.1, -12.2, 1.6, 1.68, m.white, { tile: 1, collide: true });
  P.wallPanel(
    dynamic,
    'u',
    deck.u0 - 0.1,
    -15.2,
    -1,
    1.2,
    0.8,
    1.4,
    new THREE.MeshStandardMaterial({
      map: T.signTexture(
        [
          { text: 'POOL RULES', size: 64, color: '#b51d1d' },
          { text: 'No lifeguard on duty', size: 40, color: '#111' },
          { text: 'No swimming after dark', size: 40, color: '#111' },
          { text: 'Never swim alone', size: 40, color: '#111' },
        ],
        '#f6f4ee',
        512,
        360,
        '#b51d1d',
      ),
    }),
  );

  // ---------------------------------------------------------------- small campus buildings (stands, kiosk)
  for (const id of [1492740429, 1492740430, 1492740431]) buildShell(b, m, byId(id), { height: 3, windowEvery: 60 });

  // Grey classroom pavilions: panel walls, dark window bands, a pale overhanging roof and a shut door.
  for (const [u0, u1, v0, v1, side] of PAVILIONS) {
    const mid: Vec2 = side === 'u0' ? [u0, (v0 + v1) / 2] : side === 'u1' ? [u1, (v0 + v1) / 2] : [(u0 + u1) / 2, side === 'v0' ? v0 : v1];
    buildShell(b, m, rectPts(u0, u1, v0, v1), { height: 3.4, windowEvery: 3.2, outer: m.greyPanel, inner: m.greyPanel, trim: m.greyTrim, fakeDoors: [{ at: mid, width: 1.4 }] });
    b.box(u0 - 0.9, u1 + 0.9, v0 - 0.9, v1 + 0.9, 3.4, 3.65, m.greyTrim, { tile: 2 });
    b.slab(u0 - 0.9, u1 + 0.9, v0 - 0.9, v1 + 0.9, 0.04, m.concrete, 2);
  }
  // Paved spine through the north-west pavilion cluster, joining the walkway.
  const spine: Vec2[] = [
    [-10, -10.2],
    [-10, 52],
  ];
  roads.push(spine);
  paved.push({ pts: spine, w: 3 });
  b.add(ribbonGeometry(spine, 3, 0.066, 2), m.wavePaving, false);
  for (const v of [7.5, 25.5, 43.5]) {
    b.slab(-14, -11.5, v - 1, v + 1, 0.066, m.wavePaving, 2);
    b.slab(-8.5, -6, v - 1, v + 1, 0.066, m.wavePaving, 2);
  }

  // ---------------------------------------------------------------- parking inside the drop-off loop
  const carMats = [0xe6e6e6, 0x1d1f22, 0x8a1c1c, 0x2b4a7a, 0xb8bcc2, 0xd9d0b8].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5 }));
  for (const [k, pk] of PARKING.entries()) {
    for (const [u0, u1] of PARKING_ROWS) {
      b.slab(u0, u1, pk.v0, pk.v1, 0.05, m.asphalt, 6);
      for (let v = pk.v0; v <= pk.v1 + 0.01; v += 2.6) b.slab(u0 + 0.4, u1 - 0.4, v - 0.05, v + 0.05, 0.058, m.line, 1);
      // A few parked cars, nose to the footpath.
      for (let i = 0, v = pk.v0 + 1.3; v < pk.v1; i++, v += 2.6) {
        if ((i * 7 + k * 3 + (u0 < -50 ? 1 : 0)) % 5 > 1) continue;
        const body = carMats[(i + k * 2) % carMats.length];
        const [cu0, cu1] = u0 < -50 ? [u1 - 4.5, u1 - 0.3] : [u0 + 0.3, u0 + 4.5];
        b.box(cu0, cu1, v - 0.9, v + 0.9, 0.3, 1.0, body, { tile: 1, collide: true });
        b.box(cu0 + 1, cu1 - 1.2, v - 0.8, v + 0.8, 1.0, 1.45, m.blackTop, { tile: 1 });
        for (const wu of [cu0 + 0.8, cu1 - 0.8]) for (const wv of [v - 0.85, v + 0.85]) b.box(wu - 0.33, wu + 0.33, wv - 0.12, wv + 0.12, 0, 0.62, m.rubber, { tile: 1 });
      }
    }
    // Palm-lined footpath down the middle.
    b.slab(-46.6, -45.4, pk.v0, pk.v1, 0.06, m.wavePaving, 2);
    for (let v = pk.v0 + 2; v < pk.v1; v += 6) {
      P.palm(b, m, -47, v, 8 + ((v * 7) % 3));
      P.palm(b, m, -45, v + 3, 8 + ((v * 5) % 3));
    }
  }

  // ---------------------------------------------------------------- pool loungers on the north deck
  for (let u = 70; u < 87; u += 2.4) {
    b.box(u - 0.35, u + 0.35, 0.2, 2.1, 0.25, 0.38, m.whiteGloss, { tile: 1, collide: true });
    b.box(u - 0.35, u + 0.35, 1.7, 2.1, 0.38, 0.85, m.whiteGloss, { tile: 1 });
  }

  // ---------------------------------------------------------------- perimeter fence + gate
  polylineFence(b, m, [
    [Pm.u0, Pm.gateV1 + 0.6],
    [Pm.u0, Pm.v1],
    [Pm.u1, Pm.v1],
    [Pm.u1, Pm.v0],
    [Pm.u0, Pm.v0],
    [Pm.u0, Pm.gateV0 - 0.6],
  ], 2.6);
  for (const v of [Pm.gateV0 - 0.4, Pm.gateV1 + 0.4]) b.box(Pm.u0 - 0.4, Pm.u0 + 0.4, v - 0.4, v + 0.4, 0, 3.0, m.stucco, { tile: 1, collide: true });
  // Entrance wall with the school sign, north of the gate.
  b.box(Pm.u0 - 0.25, Pm.u0 + 0.25, Pm.gateV1 + 0.8, Pm.gateV1 + 9, 0, 2.4, m.stucco, { tile: 2, collide: true });
  b.box(Pm.u0 - 0.3, Pm.u0 + 0.3, Pm.gateV1 + 0.7, Pm.gateV1 + 9.1, 2.4, 2.55, m.stuccoTint, { tile: 1 });
  P.wallPanel(
    dynamic,
    'u',
    Pm.u0 - 0.15,
    Pm.gateV1 + 4.9,
    -1,
    6.6,
    1.3,
    1.45,
    new THREE.MeshStandardMaterial({
      map: T.signTexture(
        [
          { text: "KING'S HOLLOW COLLEGE", size: 96, color: '#0f2d5c' },
          { text: 'Western Road · Nassau · The Bahamas', size: 40, color: '#b8862b' },
        ],
        '#f7f3ea',
        2048,
        400,
      ),
      roughness: 0.5,
    }),
  );
  const gate = new THREE.Group();
  const gateSpan = Pm.gateV1 - Pm.gateV0;
  for (const side of [0, 1]) {
    const leaf = new THREE.Group();
    const lw = gateSpan / 2;
    const frame = (y: number, h: number) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, lw), m.darkMetal);
      bar.position.y = y;
      bar.castShadow = true;
      leaf.add(bar);
    };
    frame(0.15, 0.1);
    frame(2.2, 0.1);
    frame(1.2, 0.06);
    for (let k = 0; k <= Math.floor(lw / 0.14); k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.25, 0.03), m.darkMetal);
      bar.position.set(0, 1.15, -lw / 2 + k * 0.14);
      bar.castShadow = true;
      leaf.add(bar);
    }
    leaf.position.copy(W(Pm.u0, Pm.gateV0 + lw * (side + 0.5)));
    leaf.userData.closedZ = leaf.position.z;
    leaf.userData.openDir = side === 0 ? 1 : -1;
    gate.add(leaf);
  }
  dynamic.add(gate);
  const gateBlock = b.world.add({ minX: Pm.u0 - 0.2, maxX: Pm.u0 + 0.2, minZ: -Pm.gateV1, maxZ: -Pm.gateV0, height: 2.4, tag: 'gate' });
  // Mag-lock boxes on the pillars (red LED when locked, set by game code via glow).
  b.box(Pm.u0 + 0.4, Pm.u0 + 0.5, Pm.gateV0 - 0.1, Pm.gateV0 + 0.1, 1.9, 2.1, lights.glow.emergency, { tile: 1, cast: false });

  // ---------------------------------------------------------------- lamps along the loop road
  {
    let acc = 0;
    for (let i = 0; i < loop.length - 1; i++) {
      const [a, c] = [loop[i], loop[i + 1]];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const nx = (c[1] - a[1]) / len;
      const ny = -(c[0] - a[0]) / len;
      for (let s = 0; s < len; s += 1) {
        acc += 1;
        if (acc % 26 !== 0) continue;
        const t = s / len;
        const p: Vec2 = [a[0] + (c[0] - a[0]) * t + nx * 3.6, a[1] + (c[1] - a[1]) * t + ny * 3.6];
        if (p[0] < Pm.u0 + 2) continue;
        if (PARKING.some((pk) => p[1] > pk.v0 - 1 && p[1] < pk.v1 + 1 && p[0] > PARKING_ROWS[0][0] - 0.5 && p[0] < PARKING_ROWS[1][1] + 0.5)) continue;
        if (roads.some((r) => r !== loop && distToPolyline(p, r) < 1.6)) continue;
        P.streetLamp(b, m, lights, p[0], p[1]);
      }
    }
    for (const [u, v] of [
      [-10, -15],
      [22, -24],
      [24.5, 20],
      [24.5, 40],
      [64, -30],
      [64, 4.5],
      [93, -10],
      [62, 52],
    ]) P.streetLamp(b, m, lights, u, v);
  }

  // ---------------------------------------------------------------- vegetation
  for (let u = Pm.u0 + 8; u < -66; u += 11) {
    if (Math.abs(u + 139) < 5) continue;
    P.palm(b, m, u, -7.6);
  }
  for (const [u, v] of [
    [-51, -10],
    [29, 50],
    [57, 50],
    [92.5, -22],
    [92.5, -2],
    [63, -31],
    [63, 5],
    [94, 5],
    [94, -31],
    [62, -26],
    [24, -27],
    [24, -50],
    [64, -50],
    [-30, -60],
    [-20, -40],
    [119, 10],
    [119, -25],
  ]) P.palm(b, m, u, v);
  for (const [u, v, r] of [
    [-49, -8, 1.1],
    [-53, -12, 0.9],
    [27, -4, 0.9],
    [31, -4, 1],
    [52, -4, 0.8],
    [28, -26.5, 1],
    [42, -26.5, 1.1],
    [56, -26.5, 0.9],
    [36, 50, 0.9],
    [50, 50, 0.9],
    [93.5, -26, 0.8],
    [93.5, 0, 0.8],
    [-30, -62.5, 1],
    [-40, -63, 0.9],
  ]) P.shrub(b, m, u, v, r);

  // Clipped hedges flanking the school entrance.
  for (const [u0, u1] of [[27, 33], [53.5, 59.5]]) b.box(u0, u1, 48.6, 49.4, 0, 0.85, m.hedge, { tile: 1, collide: true });
  // Concrete pavilions on the front lawn: flat canopy with a square roof opening over a planter.
  for (const u of [37, 49]) {
    const v0 = 52, v1 = 58, uu0 = u - 3, uu1 = u + 3;
    b.slab(uu0 - 0.5, uu1 + 0.5, v0 - 0.5, v1 + 0.5, 0.05, m.wavePaving, 2);
    for (const [cu, cv] of [[uu0, v0], [uu1, v0], [uu0, v1], [uu1, v1]]) b.box(cu - 0.2, cu + 0.2, cv - 0.2, cv + 0.2, 0, 3.4, m.concrete, { tile: 1, collide: true });
    // Canopy as four slabs around a 2 m square opening.
    const cu = u, cv = (v0 + v1) / 2;
    b.box(uu0 - 0.4, uu1 + 0.4, v0 - 0.4, cv - 1, 3.4, 3.7, m.concrete, { tile: 2 });
    b.box(uu0 - 0.4, uu1 + 0.4, cv + 1, v1 + 0.4, 3.4, 3.7, m.concrete, { tile: 2 });
    b.box(uu0 - 0.4, cu - 1, cv - 1, cv + 1, 3.4, 3.7, m.concrete, { tile: 2 });
    b.box(cu + 1, uu1 + 0.4, cv - 1, cv + 1, 3.4, 3.7, m.concrete, { tile: 2 });
    b.box(cu - 1.1, cu + 1.1, cv - 1.1, cv + 1.1, 0, 0.45, m.concrete, { tile: 1, collide: true });
    P.shrub(b, m, cu, cv, 0.8);
  }

  // Palms round the lawn between the Academic Block and the arts block.
  for (const [u, v] of [
    [36, -6],
    [57, -6],
    [36, -20],
    [57, -20],
  ]) P.palm(b, m, u, v);

  // Dense groves inside the fence: down the west side and along the south-east corner.
  {
    const keepOut = [
      ...data.features.filter((f) => f.kind === 'building' || f.kind === 'pitch' || f.kind === 'pool').map((f) => bounds(local(f.points))).map((bb) => [bb.minX - 7, bb.maxX + 7, bb.minY - 7, bb.maxY + 7]),
      ...PAVILIONS.map(([u0, u1, v0, v1]) => [u0 - 3, u1 + 3, v0 - 3, v1 + 3]),
      [Pm.u0, Pm.u0 + 10, Pm.gateV0 - 4, Pm.gateV1 + 14],
    ];
    const tracks = data.features.filter((f) => f.kind === 'track').map((f) => local(f.points));
    const spots: [number, number][] = [];
    for (const [u0, u1, v0, v1, n] of [
      [Pm.u0 + 2, Pm.u0 + 14, Pm.v0 + 2, Pm.v1 - 2, 70],
      [Pm.u0 + 2, -60, Pm.v0 + 2, -80, 60],
      [58, Pm.u1 - 2, Pm.v0 + 2, -77, 70],
    ]) {
      for (let i = 0, got = 0; i < n * 6 && got < n; i++) {
        const p: Vec2 = [u0 + T.rand() * (u1 - u0), v0 + T.rand() * (v1 - v0)];
        if (keepOut.some(([a, c, d, e]) => p[0] > a && p[0] < c && p[1] > d && p[1] < e)) continue;
        if (roads.some((r) => distToPolyline(p, r) < 6) || tracks.some((r) => distToPolyline(p, r) < 7)) continue;
        if (spots.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3)) continue;
        spots.push(p);
        got++;
      }
    }
    P.pineForest(dynamic, m, spots);
    for (const [u, v] of spots) b.world.add({ minX: u - 0.25, maxX: u + 0.25, minZ: -v - 0.25, maxZ: -v + 0.25, height: 6 });
    for (const [u, v] of spots.filter((_, i) => i % 3 === 0)) P.shrub(b, m, u + 1.6, v - 1.2, 0.8 + T.rand() * 0.6);
  }

  // Caribbean pine forest round the fence, inside the mapped forest (way 815703975).
  {
    const forest = local(data.features.find((f) => f.kind === 'forest')!.points);
    const blocked = data.features.filter((f) => f.kind === 'building').map((f) => bounds(local(f.points)));
    const spots: [number, number][] = [];
    for (let i = 0; i < 4000 && spots.length < 1100; i++) {
      const p: Vec2 = [-330 + T.rand() * 660, -320 + T.rand() * 620];
      if (p[0] > Pm.u0 - 6 && p[0] < Pm.u1 + 6 && p[1] > Pm.v0 - 6 && p[1] < Pm.v1 + 6) continue;
      if (!pointInPolygon(p, forest)) continue;
      if (blocked.some((bb) => p[0] > bb.minX - 5 && p[0] < bb.maxX + 5 && p[1] > bb.minY - 5 && p[1] < bb.maxY + 5)) continue;
      if (roads.some((r) => distToPolyline(p, r) < 7)) continue;
      spots.push(p);
    }
    P.pineForest(dynamic, m, spots);
  }

  // ---------------------------------------------------------------- neighbours (outside the fence)
  buildNeighbours(b, m, data, local, new Set([1492740443, 1492740446, 1492740447, 1492740449, 1492740429, 1492740430, 1492740431]));

  const hardRects = [
    [64.5, 92.5, -28.5, 2.5],
    [95.4, 107.9, 3.7, 10.5],
    [33.7, 52.5, 45.2, 47.6],
    ...COURTYARD_PATHS,
    [FRONT_CANOPY.u0, FRONT_CANOPY.u1, FRONT_CANOPY.v0, FRONT_CANOPY.v1],
    ...PARKING.map((pk) => [PARKING_ROWS[0][0], PARKING_ROWS[1][1], pk.v0, pk.v1]),
    ...PAVILIONS.map(([u0, u1, v0, v1]) => [u0 - 0.9, u1 + 0.9, v0 - 0.9, v1 + 0.9]),
    [70, 120, 15, 50],
    [70, 112, -65, -41],
  ];
  const surface = (u: number, v: number): 'hard' | 'grass' => {
    if (hardRects.some(([u0, u1, v0, v1]) => u > u0 && u < u1 && v > v0 && v < v1)) return 'hard';
    return paved.some((r) => distToPolyline([u, v], r.pts) < r.w / 2) ? 'hard' : 'grass';
  };

  return {
    surface,
    water,
    gate,
    gateBlock,
    poolBlock,
    outlines,
    local,
    anchors: {
      spawn: W(-41, -11.6, 0),
      dropoff: W(-51, -10),
      gateInside: W(Pm.u0 + 3, (Pm.gateV0 + Pm.gateV1) / 2),
      pitchCentre: W(-114.5, -53.5),
      pitchTouchline: W(-114.5, -27),
      fiveASide: W(-89.5, 21),
      poolGate: W(63, -12),
      poolEdgeWest: W(Po.u0 - 1.2, -12.9),
      poolEdgeEast: W(Po.u1 + 1.2, -12.9),
      poolCentre: W((Po.u0 + Po.u1) / 2, (Po.v0 + Po.v1) / 2, Po.water),
      walkwayMid: W(5, -11.7),
      porch: W(43.1, 49),
    },
  };
}
