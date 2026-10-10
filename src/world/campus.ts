// The campus exterior, laid out after the architect's aerial render of the school: a symmetric
// plan on one central axis (u = AXIS) with the front facing +v.
//
//   gate + palm-median drive with angled parking, mown lawns either side (football pitch east)
//   forecourt with a semicircular island, two porte-cochères with skylights, front beds + colonnade
//   main building: the Academic Block in the middle under the long pale "spine" roof, two-storey
//     wings either side round green courtyards
//   behind: dark pergolas, grey classroom pavilions, the dining hall, the 25 m pool on the axis,
//     pale tennis courts and the pool house; dense trees all round the fence.
//
// The public roads, the forest and the neighbouring houses still come from data/campus.json
// (© OpenStreetMap contributors, ODbL); the Academic Block, dining hall and plant room keep their
// OSM footprints, which sit where the render puts the matching parts of the school.
import * as THREE from 'three';
import { W, polygonGeometry, ribbonGeometry, metricBox, type Builder } from './builder';
import { campusGridAngle, featureByRole, pointInPolygon, toLocal, type CampusData, type Vec2 } from './geo';
import type { LightPool } from './lights';
import * as P from './props';
import type { Mats } from './props';
import { buildShell } from './shell';
import * as T from './textures';
import { makeWater, type Water } from './water';
import { ACADEMIC_OUTLINE, COURTYARD_PATHS } from './academic';
import { PLANT_SHAFT, buildNeighbours } from './buildings';
import type { MapData } from '../ui/ui';

/** The central axis: gate, drive, entrance, spine and pool all line up on u = AXIS. */
export const AXIS = 43.1;
/** Perimeter fence (local frame). The front (+v) side has the gate across the drive. */
export const FENCE: Vec2[] = [
  [-27, 178],
  [-27, -45],
  [-55, -45],
  [-55, -82],
  [125, -82],
  [125, 85],
  [160, 85],
  [160, 178],
];
export const POOL = { u0: 30.6, u1: 55.6, v0: -62.4, v1: -42.4, depth: 2.0, water: -0.22 };
const DECK = { u0: 24, u1: 62.2, v0: -67.8, v1: -37.3 };
/** The long pale roof down the axis: over the entrance, the Academic courtyard and the library. */
const SPINE = { u0: 34.3, u1: 50.7, v0: -12, v1: 49.2, y: 9.0 };
const FORECOURT = { u0: -4, u1: 90, v0: 61, v1: 93 };
const DRIVE = { v0: 93, v1: 178, walk: [26.6, 59.6], bays: [28.6, 57.6], lanes: [34.1, 52.1], median: [40.6, 45.6] };
const GATE_V = 178;

/** Two-storey wings either side of the Academic Block, each round a courtyard (not enterable). */
const WEST_WING: Vec2[] = [
  [-22, 4],
  [30.3, 4],
  [30.3, 12],
  [1.7, 12],
  [1.7, 37],
  [22.5, 37],
  [22.5, 45.2],
  [-22, 45.2],
];
const EAST_WING: Vec2[] = [
  [66, 4],
  [79, 4],
  [79, 37],
  [97, 37],
  [97, 12],
  [108, 12],
  [108, 45.2],
  [66, 45.2],
];
/** Grey single-storey classroom pavilions: [u0, u1, v0, v1]; the door is on the v1 side. */
const PAVILIONS: [number, number, number, number][] = [
  [-22, -12, -19, -3],
  [-6, 6, -19, -3],
  [-22, 6, -31, -23],
  [81, 90, -20, -3],
  [81, 94, -31, -23],
  [-19, -10.6, 51, 67],
  [98.6, 108, 52, 67],
];
const PERGOLAS: [number, number, number, number][] = [
  [8, 25, -22, -8],
  [61, 78, -22, -8],
];
/** Porte-cochères at the two front corners: [u0, u1]; they run from the façade (v 45.2) to v 68. */
const PORTES: [number, number][] = [
  [1.7, 14.2],
  [72, 84.5],
];
const POOL_HOUSE: [number, number, number, number] = [-8, 9, -70, -46];

export interface CampusRefs {
  water: Water;
  outlines: Record<'academic' | 'dining' | 'plant', Vec2[]>;
  anchors: Record<string, THREE.Vector3>;
  local: (pts: Vec2[]) => Vec2[];
  /** Footstep surface outdoors at a local point. */
  surface: (u: number, v: number) => 'hard' | 'grass';
  /** Minimap geometry for the grounds. */
  map: MapData;
}

// ---------------------------------------------------------------- oriented rectangles
interface ORect {
  c: Vec2;
  ax: Vec2;
  ay: Vec2;
  L: number;
  Wd: number;
}

const PITCH: ORect = { c: [110, 135.5], ax: [1, 0], ay: [0, 1], L: 92, Wd: 48 };

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

function polylineFence(b: Builder, m: Mats, pts: Vec2[], h: number) {
  for (let i = 0; i < pts.length - 1; i++) P.fence(b, m, pts[i], pts[i + 1], h);
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

/** Points along an arc (angles in radians, CCW in the u-v plane). */
function arcPts(cu: number, cv: number, r: number, a0: number, a1: number, n = 16): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r]);
  }
  return pts;
}

/** A parked car, nose along angle `a` (radians from +u). */
function car(b: Builder, m: Mats, u: number, v: number, a: number, body: THREE.Material) {
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
  const put = (g: THREE.BufferGeometry, mat: THREE.Material, du: number, y: number) => {
    const c: Vec2 = [u + Math.cos(a) * du, v + Math.sin(a) * du];
    b.addTransformed(g, mat, new THREE.Matrix4().compose(W(c[0], c[1], y), rot, new THREE.Vector3(1, 1, 1)));
  };
  put(metricBox(4.3, 0.7, 1.8, 1), body, 0, 0.65);
  put(metricBox(2.3, 0.5, 1.6, 1), m.blackTop, -0.2, 1.25);
  for (const du of [-1.4, 1.4]) put(metricBox(0.66, 0.66, 1.84, 1), m.rubber, du, 0.33);
  const hu = Math.abs(Math.cos(a)) * 1.7 + Math.abs(Math.sin(a)) * 0.75;
  const hv = Math.abs(Math.sin(a)) * 1.7 + Math.abs(Math.cos(a)) * 0.75;
  b.world.add({ minX: u - hu, maxX: u + hu, minZ: -v - hv, maxZ: -v + hv, height: 1.5 });
}

export function buildCampus(b: Builder, m: Mats, lights: LightPool, dynamic: THREE.Group, data: CampusData): CampusRefs {
  const angle = campusGridAngle(data);
  const local = (pts: Vec2[]) => pts.map((p) => toLocal(p, angle));
  const outlines = {
    academic: ACADEMIC_OUTLINE,
    dining: local(featureByRole(data, 'dining').points),
    plant: local(featureByRole(data, 'plant').points),
  };
  const S = PLANT_SHAFT;
  const Po = POOL;
  const D = DRIVE;
  const F = FORECOURT;
  const map: MapData = { lines: [], polys: [] };
  const hard: Vec2[][] = [];
  const paved: { pts: Vec2[]; w: number }[] = [];
  const pave = (pts: Vec2[], w: number) => {
    b.add(ribbonGeometry(pts, w, 0.065, 2), m.wavePaving, false);
    paved.push({ pts, w });
    map.lines.push({ pts, w, color: '#d8cfbf' });
  };
  const slab = (u0: number, u1: number, v0: number, v1: number, y: number, mat: THREE.Material, tile = 2) => {
    b.slab(u0, u1, v0, v1, y, mat, tile);
    hard.push(rectPts(u0, u1, v0, v1));
  };

  // ---------------------------------------------------------------- ground
  const lawn = rectPts(-95, 205, -125, 220);
  b.add(groundGeometry(lawn, [rectPts(Po.u0, Po.u1, Po.v0, Po.v1), rectPts(S.u0, S.u1, S.v0, S.v1)], 0, 3), m.grass, false);
  b.add(groundGeometry(rectPts(-480, 540, -540, 660), [[...lawn].reverse()], -0.01, 4), m.forestFloor, false);

  // ---------------------------------------------------------------- public roads (OSM) + the approach road to the gate
  const roads: Vec2[][] = [];
  for (const f of data.features) {
    if (f.kind !== 'road' || (f.tags.highway !== 'primary' && f.tags.highway !== 'residential')) continue;
    const pts = local(f.points);
    roads.push(pts);
    b.add(ribbonGeometry(pts, f.tags.highway === 'primary' ? 9 : 6.5, 0.05, 6), m.asphalt, false);
    map.lines.push({ pts, w: 5, color: '#5a5a5c' });
  }
  {
    // The approach leaves the gate on the axis and turns west to meet Western Road.
    const APPROACH_V = 202;
    let joinU = -120;
    for (const r of roads)
      for (let i = 0; i < r.length - 1; i++) {
        const [a, c] = [r[i], r[i + 1]];
        if (a[1] === c[1] || (a[1] - APPROACH_V) * (c[1] - APPROACH_V) > 0) continue;
        const u = a[0] + ((APPROACH_V - a[1]) / (c[1] - a[1])) * (c[0] - a[0]);
        if (u < AXIS && u > joinU) joinU = u;
      }
    const approach: Vec2[] = [
      [AXIS, GATE_V],
      [AXIS, APPROACH_V - 6],
      [AXIS - 6, APPROACH_V],
      [joinU, APPROACH_V],
    ];
    b.add(ribbonGeometry(approach.slice(0, 2), D.bays[1] - D.bays[0], 0.05, 6), m.asphalt, false);
    b.add(ribbonGeometry(approach.slice(1), 8, 0.05, 6), m.asphalt, false);
    roads.push(approach);
    map.lines.push({ pts: approach, w: 6, color: '#5a5a5c' });
  }

  // ---------------------------------------------------------------- drive: palm median, angled parking, pavements
  for (const [u0, u1] of [
    [D.bays[0], D.median[0]],
    [D.median[1], D.bays[1]],
  ]) {
    slab(u0, u1, D.v0 - 1, D.v1, 0.05, m.asphalt, 6);
    map.polys.push({ pts: rectPts(u0, u1, D.v0, D.v1), fill: '#8a8a8c' });
  }
  for (const [u0, u1] of [
    [D.walk[0], D.bays[0]],
    [D.bays[1], D.walk[1]],
  ])
    slab(u0, u1, D.v0 + 8, D.v1 - 1, 0.06, m.wavePaving, 2);
  // Median: kerbed lawn with a footpath down the middle and a row of palms.
  b.box(D.median[0], D.median[0] + 0.2, D.v0, D.v1 - 1, 0, 0.15, m.concrete, { tile: 1 });
  b.box(D.median[1] - 0.2, D.median[1], D.v0, D.v1 - 1, 0, 0.15, m.concrete, { tile: 1 });
  slab(AXIS - 0.7, AXIS + 0.7, D.v0, D.v1 - 1, 0.07, m.wavePaving, 2);
  // Angled bays (60° to the kerb) down both outer edges, some of them taken.
  const carMats = [0xe6e6e6, 0x1d1f22, 0x8a1c1c, 0x2b4a7a, 0xb8bcc2, 0xd9d0b8].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5 }));
  for (const side of [-1, 1] as const) {
    const [outer, inner] = side < 0 ? [D.bays[0], D.lanes[0]] : [D.bays[1], D.lanes[1]];
    const depth = inner - outer;
    const rise = Math.abs(depth) * 0.58;
    for (let i = 0, v = D.v0 + 9; v < D.v1 - 8; i++, v += 3) {
      b.add(ribbonGeometry([[outer, v], [inner, v + rise]], 0.1, 0.058, 1), m.line, false);
      if ((i * 5 + (side > 0 ? 2 : 0)) % 7 < 3) car(b, m, (outer + inner) / 2, v + 1.5 + rise / 2, Math.atan2(rise, depth), carMats[(i + (side > 0 ? 3 : 0)) % carMats.length]);
    }
    b.add(ribbonGeometry([[inner, D.v0 + 8], [inner, D.v1 - 2]], 0.12, 0.058, 1), m.line, false);
  }
  for (let v = D.v0 + 4; v < D.v1 - 4; v += 9) P.palm(b, m, AXIS + (Math.round(v) % 2 ? 1.3 : -1.3), v, 8 + ((v * 7) % 3));
  for (let v = D.v0 + 8.5; v < D.v1 - 4; v += 27) P.streetLamp(b, m, lights, AXIS + 1.9, v);

  // ---------------------------------------------------------------- mown lawns either side of the drive
  for (const [u0, u1] of [
    [-26.5, D.walk[0] - 0.4],
    [D.walk[1] + 0.4, 159.5],
  ])
    for (let k = 0, v = D.v0 + 1; v < D.v1 - 0.5; k++, v += 5) b.slab(u0, u1, v, Math.min(v + 5, D.v1 - 0.5), 0.02, k % 2 ? m.turfStripe : m.turf, 3);

  // ---------------------------------------------------------------- football pitch (east lawn)
  {
    const paint = new Painter(b, m.line, 0.075);
    const o = PITCH;
    const [hx, hy] = [o.L / 2, o.Wd / 2];
    paint.rect(o, -hx, hx, -hy, hy, 0.12);
    paint.seg(o, 0, -hy, 0, hy, 0.12);
    paint.arc(o, 0, 0, 9.15, 0, Math.PI * 2, 0.12);
    paint.spot(o, 0, 0, 0.15);
    for (const s of [-1, 1]) {
      const gx = s * hx;
      paint.rect(o, Math.min(gx, gx - s * 16.5), Math.max(gx, gx - s * 16.5), -20.15, 20.15, 0.12);
      paint.rect(o, Math.min(gx, gx - s * 5.5), Math.max(gx, gx - s * 5.5), -9.16, 9.16, 0.12);
      paint.spot(o, gx - s * 11, 0, 0.15);
      paint.arc(o, gx - s * 11, 0, 9.15, s > 0 ? Math.PI - 0.93 : -0.93, s > 0 ? Math.PI + 0.93 : 0.93, 0.12);
      goal(b, m, o, s as 1 | -1, 7.32, 2.44, 1.8);
    }
    map.polys.push({ pts: quad(o, -hx, hx, -hy, hy), fill: '#8fcf6a' });
  }

  // ---------------------------------------------------------------- forecourt + island
  {
    const r = 10;
    // Kerbed outline, opening into the drive between two fillets.
    const kerb: Vec2[] = [
      ...arcPts(D.bays[0] - 8, F.v1 + 8, 8, 0, -Math.PI / 2, 8),
      ...arcPts(F.u0 + r, F.v1 - r, r, Math.PI / 2, Math.PI, 8),
      [F.u0, F.v0],
      [F.u1, F.v0],
      ...arcPts(F.u1 - r, F.v1 - r, r, 0, Math.PI / 2, 8),
      ...arcPts(D.bays[1] + 8, F.v1 + 8, 8, -Math.PI / 2, -Math.PI, 8),
    ];
    b.add(polygonGeometry(kerb, 0.046, 6), m.asphalt, false);
    hard.push(kerb);
    map.polys.push({ pts: kerb, fill: '#8a8a8c' });
    b.add(ribbonGeometry(kerb, 0.35, 0.06, 1), m.concrete, false);
    // Semicircular island on the axis: round side to the building, flat side to the drive.
    const isl = arcPts(AXIS, 84, 10.5, Math.PI, Math.PI * 2, 20);
    b.add(polygonGeometry(isl, 0.075, 3), m.grass, false);
    b.add(ribbonGeometry([...isl, isl[0]], 0.4, 0.09, 1), m.white, false);
    b.add(ribbonGeometry([[AXIS, 73.6], [AXIS, 83.8]], 1.6, 0.085, 2), m.wavePaving, false);
    P.palm(b, m, AXIS - 4.5, 80, 9);
    P.palm(b, m, AXIS + 4.5, 80, 8.5);
    for (const du of [-7, -2.5, 2.5, 7]) P.shrub(b, m, AXIS + du, 77.5 + Math.abs(du) * 0.4, 0.7);
    map.polys.push({ pts: isl, fill: '#8fcf6a' });
    P.streetLamp(b, m, lights, F.u0 - 4, 77);
    P.streetLamp(b, m, lights, F.u1 + 4, 77);
  }

  // ---------------------------------------------------------------- front: aprons, beds, colonnade, porte-cochères
  for (const [u0, u1] of PORTES) slab(u0, u1, 45.2, F.v0, 0.06, m.wavePaving, 2);
  slab(PORTES[0][1], PORTES[1][0], 47.6, 49.6, 0.06, m.wavePaving, 2);
  slab(AXIS - 2, AXIS + 2, 49.6, F.v0, 0.065, m.wavePaving, 2);
  slab(PORTES[0][1], PORTES[1][0], 54.3, 55.9, 0.062, m.paving, 2);
  slab(PORTES[0][1], PORTES[1][0], 60.4, F.v0, 0.062, m.paving, 2);
  for (const [u0, u1] of [
    [PORTES[0][1], AXIS - 2],
    [AXIS + 2, PORTES[1][0]],
  ]) {
    for (const [v0, v1] of [
      [49.6, 54.3],
      [55.9, 60.4],
    ])
      b.box(u0, u1, v0, v1, 0, 0.08, m.hedge, { tile: 2 });
    for (let u = u0 + 3.5, i = 0; u < u1 - 1; u += 7, i++) {
      P.palm(b, m, u, i % 2 ? 52 : 58.2, 8 + (i % 3));
      P.shrub(b, m, u + 3.5, i % 2 ? 58.2 : 52, 0.7);
    }
  }
  // Low flat colonnade along the façade, continuing the Academic Block's pergola either side.
  for (const [u0, u1] of [
    [PORTES[0][1], 33.7],
    [52.5, PORTES[1][0]],
  ]) {
    b.box(u0, u1, 45.2, 47.6, 3.4, 3.75, m.stuccoTint, { tile: 2 });
    for (let u = u0 + 0.4; u < u1; u += 6.4) b.box(u - 0.1, u + 0.1, 47.2, 47.4, 0, 3.4, m.darkMetal, { tile: 1, collide: true });
  }
  // Porte-cochères: deep flat canopies on round columns, with a square skylight over a palm.
  for (const [u0, u1] of PORTES) {
    const [v0, v1, y] = [45.2, 68, 4.6];
    const [cu, cv, hs] = [(u0 + u1) / 2, 53, 1.6];
    b.box(u0 - 0.3, u1 + 0.3, cv + hs, v1, y, y + 0.7, m.stuccoTint, { tile: 2 });
    b.box(u0 - 0.3, u1 + 0.3, v0, cv - hs, y, y + 0.7, m.stuccoTint, { tile: 2 });
    b.box(u0 - 0.3, cu - hs, cv - hs, cv + hs, y, y + 0.7, m.stuccoTint, { tile: 2 });
    b.box(cu + hs, u1 + 0.3, cv - hs, cv + hs, y, y + 0.7, m.stuccoTint, { tile: 2 });
    for (const [u, v] of [
      [u0 + 0.5, v1 - 0.6],
      [u1 - 0.5, v1 - 0.6],
      [u0 + 0.5, 58],
      [u1 - 0.5, 58],
    ]) {
      b.addTransformed(new THREE.CylinderGeometry(0.25, 0.25, y, 14), m.whiteGloss, new THREE.Matrix4().makeTranslation(u, y / 2, -v));
      b.world.add({ minX: u - 0.27, maxX: u + 0.27, minZ: -v - 0.27, maxZ: -v + 0.27, height: y });
    }
    b.box(cu - 1.3, cu + 1.3, cv - 1.3, cv + 1.3, 0, 0.45, m.concrete, { tile: 1, collide: true });
    b.slab(cu - 1.2, cu + 1.2, cv - 1.2, cv + 1.2, 0.46, m.forestFloor, 1);
    P.palm(b, m, cu, cv, 9.5);
    P.ceilingLights(b, lights, u0 + 1, u1 - 1, 58.5, v1 - 1, y - 0.02, 5, 4);
  }

  // ---------------------------------------------------------------- main building wings
  for (const [pts, roof] of [
    [WEST_WING, m.roof],
    [EAST_WING, m.roofGrey],
  ] as const) {
    buildShell(b, m, pts, { height: 7.6, windowEvery: 3.4, outer: m.stucco, upperOuter: m.cladding, roof });
    map.polys.push({ pts, fill: '#f4f1ea' });
  }
  // Raised stair and plant volumes on the roofs.
  for (const [u0, u1, v0, v1, h] of [
    [-6, 1.2, 24, 31, 3.2],
    [9, 15, 38, 44.5, 2.4],
    [66.6, 72.5, 29, 36.4, 3.2],
    [99, 107.4, 38, 44.5, 2.4],
  ])
    b.box(u0, u1, v0, v1, 7.6, 7.6 + h, m.stucco, { tile: 2 });
  // Courtyard planting.
  for (const [u, v] of [
    [7, 20],
    [14, 30],
    [21, 17],
    [84, 18],
    [92, 30],
    [88, 24],
  ])
    P.palm(b, m, u, v);
  for (const [u, v, r] of [
    [5, 33, 1.1],
    [18, 24, 0.9],
    [83, 33, 1],
    [94, 15, 0.9],
  ])
    P.shrub(b, m, u, v, r);

  // ---------------------------------------------------------------- the spine
  {
    const Sp = SPINE;
    b.box(Sp.u0 - 0.3, Sp.u1 + 0.3, Sp.v0, Sp.v1, Sp.y, Sp.y + 0.8, m.stuccoTint, { tile: 2 });
    // Ribbed clerestory where the spine rises above the Academic Block's roof.
    b.box(Sp.u1 - 0.1, Sp.u1 + 0.1, 19.7, 45.2, 7.6, Sp.y, m.cladding, { tile: 1 });
    b.box(Sp.u0 - 0.1, Sp.u0 + 0.1, 37, 45.2, 7.6, Sp.y, m.cladding, { tile: 1 });
    b.box(Sp.u0 - 0.1, Sp.u0 + 0.1, -1.6, 20.1, 7.6, Sp.y, m.cladding, { tile: 1 });
    for (const [u, v] of [
      [Sp.u0 + 0.3, 48.9],
      [Sp.u1 - 0.3, 48.9],
      [Sp.u0 + 0.3, 21.2],
      [Sp.u0 + 0.3, 31.5],
      [Sp.u0 + 0.3, 35.6],
      [Sp.u0 + 0.3, -8],
      [Sp.u1 - 0.3, -8],
      [Sp.u0 + 0.3, -11.6],
      [Sp.u1 - 0.3, -11.6],
    ]) {
      b.addTransformed(new THREE.CylinderGeometry(0.3, 0.3, Sp.y, 16), m.whiteGloss, new THREE.Matrix4().makeTranslation(u, Sp.y / 2, -v));
      b.world.add({ minX: u - 0.32, maxX: u + 0.32, minZ: -v - 0.32, maxZ: -v + 0.32, height: Sp.y });
    }
    P.ceilingLights(b, lights, Sp.u0 + 1, 48.5, 21, 36, Sp.y - 0.02, 6, 5);
    P.ceilingLights(b, lights, Sp.u0 + 1, Sp.u1 - 1, Sp.v0 + 1, -2.2, Sp.y - 0.02, 7, 5);
    // Back porch under the spine.
    slab(Sp.u0, Sp.u1, Sp.v0, -1.6, 0.06, m.wavePaving, 2);
    map.polys.push({ pts: rectPts(Sp.u0, Sp.u1, Sp.v0, Sp.v1), fill: '#f6ece6' });
  }

  // ---------------------------------------------------------------- behind the building
  pave(
    [
      [-24, 1.5],
      [28, 1.5],
      [32, -4.5],
      [56, -4.5],
      [60, 1.5],
      [92.5, 1.5],
      [92.5, -10],
      [95.4, -10],
    ],
    3,
  );
  pave(
    [
      [63, 1.5],
      [63, 46],
    ],
    3,
  );
  slab(AXIS - 5, AXIS + 5, DECK.v1, SPINE.v0, 0.065, m.wavePaving, 2);
  // Dark pergolas over paved seating.
  for (const [u0, u1, v0, v1] of PERGOLAS) {
    slab(u0, u1, v0, v1, 0.06, m.paving, 2);
    b.box(u0 - 0.4, u1 + 0.4, v0 - 0.4, v1 + 0.4, 3.2, 3.55, m.roofGrey, { tile: 2 });
    for (const u of [u0 + 0.4, (u0 + u1) / 2, u1 - 0.4]) for (const v of [v0 + 0.4, v1 - 0.4]) b.box(u - 0.12, u + 0.12, v - 0.12, v + 0.12, 0, 3.2, m.darkMetal, { tile: 1, collide: true });
    for (const u of [u0 + 4, u1 - 4]) {
      P.table(b, m, u, (v0 + v1) / 2, 1.8, 0.8, m.wood);
      P.chair(b, m, u, (v0 + v1) / 2 - 0.75, 0);
      P.chair(b, m, u, (v0 + v1) / 2 + 0.75, 2);
    }
    map.polys.push({ pts: rectPts(u0, u1, v0, v1), fill: '#6d6f72' });
  }
  // Grey classroom pavilions: panel walls, dark window bands, a pale overhanging roof and a shut door.
  for (const [u0, u1, v0, v1] of PAVILIONS) {
    buildShell(b, m, rectPts(u0, u1, v0, v1), { height: 3.4, windowEvery: 3.2, outer: m.greyPanel, inner: m.greyPanel, trim: m.greyTrim, fakeDoors: [{ at: [(u0 + u1) / 2, v1], width: 1.4 }] });
    b.box(u0 - 0.9, u1 + 0.9, v0 - 0.9, v1 + 0.9, 3.4, 3.65, m.greyTrim, { tile: 2 });
    slab(u0 - 0.9, u1 + 0.9, v0 - 0.9, v1 + 0.9, 0.04, m.concrete, 2);
    map.polys.push({ pts: rectPts(u0, u1, v0, v1), fill: '#d4d4d0' });
  }
  for (const [u, v] of [
    [-9, -10],
    [-9, -16],
    [-15, 10],
    [16, -27],
    [70, -27],
    [96, -34],
  ])
    P.palm(b, m, u, v);

  // ---------------------------------------------------------------- pool (on the axis, behind the building)
  const lining = (u0: number, u1: number, v0: number, v1: number) => b.box(u0, u1, v0, v1, -Po.depth, 0, m.poolTile, { tile: 0.5, cast: false });
  lining(Po.u0 - 0.3, Po.u0, Po.v0 - 0.3, Po.v1 + 0.3);
  lining(Po.u1, Po.u1 + 0.3, Po.v0 - 0.3, Po.v1 + 0.3);
  lining(Po.u0, Po.u1, Po.v0 - 0.3, Po.v0);
  lining(Po.u0, Po.u1, Po.v1, Po.v1 + 0.3);
  b.slab(Po.u0, Po.u1, Po.v0, Po.v1, -Po.depth, m.poolTile, 0.5);
  // Eight 25 m lanes running along u, red and white ropes between them.
  const laneStripe = new THREE.MeshStandardMaterial({ color: 0x0c2340, roughness: 0.2 });
  const lanes = 8;
  const lw = (Po.v1 - Po.v0) / lanes;
  for (let k = 0; k < lanes; k++) {
    const v = Po.v0 + (k + 0.5) * lw;
    b.slab(Po.u0 + 2, Po.u1 - 2, v - 0.13, v + 0.13, -Po.depth + 0.005, laneStripe, 1);
    b.slab(Po.u0 + 2, Po.u0 + 2.26, v - 0.5, v + 0.5, -Po.depth + 0.005, laneStripe, 1);
    b.slab(Po.u1 - 2.26, Po.u1 - 2, v - 0.5, v + 0.5, -Po.depth + 0.005, laneStripe, 1);
  }
  for (let k = 0; k <= lanes; k++) {
    const v = Po.v0 + k * lw;
    for (let u = Po.u0, i = 0; u < Po.u1 - 0.01; u += 1, i++)
      b.box(u, Math.min(u + 1, Po.u1), v - 0.04, v + 0.04, Po.water - 0.04, Po.water + 0.04, i % 2 ? m.whiteGloss : m.ropeRed, { tile: 1, cast: false });
  }
  const coping = m.whiteGloss;
  b.box(Po.u0 - 0.45, Po.u1 + 0.45, Po.v0 - 0.45, Po.v0, -0.02, 0.06, coping, { tile: 1, cast: false });
  b.box(Po.u0 - 0.45, Po.u1 + 0.45, Po.v1, Po.v1 + 0.45, -0.02, 0.06, coping, { tile: 1, cast: false });
  b.box(Po.u0 - 0.45, Po.u0, Po.v0, Po.v1, -0.02, 0.06, coping, { tile: 1, cast: false });
  b.box(Po.u1, Po.u1 + 0.45, Po.v0, Po.v1, -0.02, 0.06, coping, { tile: 1, cast: false });
  // Pale deck.
  const Dk = DECK;
  slab(Dk.u0, Dk.u1, Dk.v0, Po.v0 - 0.45, 0.04, m.paving, 2);
  slab(Dk.u0, Dk.u1, Po.v1 + 0.45, Dk.v1, 0.04, m.paving, 2);
  slab(Dk.u0, Po.u0 - 0.45, Po.v0 - 0.45, Po.v1 + 0.45, 0.04, m.paving, 2);
  slab(Po.u1 + 0.45, Dk.u1, Po.v0 - 0.45, Po.v1 + 0.45, 0.04, m.paving, 2);
  map.polys.push({ pts: rectPts(Dk.u0, Dk.u1, Dk.v0, Dk.v1), fill: '#e6dfd3' }, { pts: rectPts(Po.u0, Po.u1, Po.v0, Po.v1), fill: '#4fb3e0' });
  // Underwater lights along both long sides.
  for (let u = Po.u0 + 3; u < Po.u1 - 2; u += 5) {
    for (const v of [Po.v0 + 0.01, Po.v1 - 0.01]) {
      b.box(u - 0.15, u + 0.15, v - 0.02, v + 0.02, -0.95, -0.65, lights.glow.pool, { tile: 1, cast: false });
      lights.add({ pos: W(u, v + (v < (Po.v0 + Po.v1) / 2 ? 0.6 : -0.6), -0.8), color: new THREE.Color(0x7fd8ff), intensity: 8, group: 'pool' });
    }
  }
  const water = makeWater(Po.u1 - Po.u0, Po.v1 - Po.v0);
  water.mesh.position.copy(W((Po.u0 + Po.u1) / 2, (Po.v0 + Po.v1) / 2, Po.water));
  dynamic.add(water.mesh);
  b.world.add({ minX: Po.u0 - 0.2, maxX: Po.u1 + 0.2, minZ: -Po.v1 - 0.2, maxZ: -Po.v0 + 0.2, height: 0.3, tag: 'pool' });
  // Pool fence with a gate gap on the axis, facing the building.
  polylineFence(
    b,
    m,
    [
      [AXIS + 2.3, Dk.v1],
      [Dk.u1, Dk.v1],
      [Dk.u1, Dk.v0],
      [Dk.u0, Dk.v0],
      [Dk.u0, Dk.v1],
      [AXIS - 0.5, Dk.v1],
    ],
    1.8,
  );
  // Lifeguard chair on the far side.
  {
    const [lu, lv] = [AXIS + 6, -64.2];
    for (const du of [-0.6, 0.6]) for (const dv of [-0.8, 0.8]) b.box(lu + du - 0.05, lu + du + 0.05, lv + dv - 0.05, lv + dv + 0.05, 0, 2.2, m.white, { tile: 1 });
    b.box(lu - 0.75, lu + 0.75, lv - 0.95, lv + 0.95, 1.6, 1.68, m.white, { tile: 1, collide: true });
  }
  // Loungers down both ends.
  for (const u of [Dk.u0 + 2.4, Dk.u1 - 2.4])
    for (let v = Po.v0 + 2; v < Po.v1 - 1; v += 2.6) {
      const back = u < AXIS ? -1 : 1;
      b.box(u - 0.95, u + 0.95, v - 0.35, v + 0.35, 0.25, 0.38, m.whiteGloss, { tile: 1, collide: true });
      b.box(u + back * 0.95 - 0.2, u + back * 0.95 + 0.2, v - 0.35, v + 0.35, 0.38, 0.85, m.whiteGloss, { tile: 1 });
    }
  // Rules sign on the fence beside the gate, facing the path.
  P.wallPanel(
    dynamic,
    'v',
    Dk.v1,
    AXIS - 3.5,
    1,
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
  for (const [u, v] of [
    [Dk.u0 - 1.5, Dk.v1 + 1.5],
    [Dk.u1 + 1.5, Dk.v1 + 1.5],
    [Dk.u0 - 1.5, Dk.v0 - 1.5],
    [Dk.u1 + 1.5, Dk.v0 - 1.5],
  ])
    P.streetLamp(b, m, lights, u, v);
  for (const [u, v] of [
    [Dk.u0 - 2.5, -46],
    [Dk.u0 - 2.5, -60],
    [Dk.u1 + 2.5, -46],
    [Dk.u1 + 2.5, -60],
  ])
    P.palm(b, m, u, v);
  // Pool house: a low pale block west of the deck.
  {
    const [u0, u1, v0, v1] = POOL_HOUSE;
    buildShell(b, m, rectPts(u0, u1, v0, v1), { height: 3.6, windowEvery: 4, outer: m.stuccoTint, trim: m.white, roof: m.white, fakeDoors: [{ at: [u1, -58], width: 1.6 }] });
    b.box(u0 - 1, u1 + 1.5, v0 - 1, v1 + 1, 3.6, 3.85, m.white, { tile: 2 });
    map.polys.push({ pts: rectPts(u0, u1, v0, v1), fill: '#f4f1ea' });
    pave(
      [
        [u1, -58],
        [Dk.u0, -58],
      ],
      2.5,
    );
  }

  // ---------------------------------------------------------------- pale tennis courts, east of the pool
  {
    const courtInner = new THREE.MeshStandardMaterial({ color: 0xa7b5b1, roughness: 0.75 });
    for (const cu of [74.65, 92.95]) {
      const o: ORect = { c: [cu, -53], ax: [0, 1], ay: [-1, 0], L: 23.77, Wd: 10.97 };
      const outer = quad(o, -o.L / 2 - 5.5, o.L / 2 + 5.5, -o.Wd / 2 - 3.2, o.Wd / 2 + 3.2);
      b.add(polygonGeometry(outer, 0.03, 4), m.courtPale, false);
      b.add(polygonGeometry(quad(o, -o.L / 2, o.L / 2, -o.Wd / 2, o.Wd / 2), 0.035, 4), courtInner, false);
      hard.push(outer);
      map.polys.push({ pts: outer, fill: '#c9d0cc' });
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
    }
    polylineFence(b, m, [...rectPts(65.8, 101.8, -70.6, -35.4), [65.8, -70.6]], 3.6);
  }

  // ---------------------------------------------------------------- perimeter fence + gate
  const G = GATE_V;
  polylineFence(b, m, [[D.walk[0] + 1, G], ...FENCE, [D.walk[1] - 1, G]], 2.6);
  for (const [u0, u1] of [
    [D.walk[0] + 1, D.bays[0]],
    [D.bays[1], D.walk[1] - 1],
  ])
    b.box(u0, u1, G - 0.5, G + 0.5, 0, 3, m.stucco, { tile: 1, collide: true });
  // Median wall with the school sign, facing the approach road.
  b.box(D.median[0], D.median[1], G - 0.3, G + 0.3, 0, 2.4, m.stucco, { tile: 2, collide: true });
  b.box(D.median[0] - 0.1, D.median[1] + 0.1, G - 0.35, G + 0.35, 2.4, 2.55, m.stuccoTint, { tile: 1 });
  P.wallPanel(
    dynamic,
    'v',
    G + 0.3,
    AXIS,
    1,
    4.6,
    1.1,
    1.4,
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
  // Sliding gates across both carriageways (shut; the mag-locks glow red when locked).
  for (const [u0, u1] of [
    [D.bays[0], D.median[0]],
    [D.median[1], D.bays[1]],
  ]) {
    for (const y of [0.1, 1.15, 2.15]) b.box(u0, u1, G - 0.05, G + 0.05, y, y + 0.1, m.darkMetal, { tile: 1 });
    for (let u = u0 + 0.07; u < u1; u += 0.14) b.box(u - 0.015, u + 0.015, G - 0.015, G + 0.015, 0.1, 2.25, m.darkMetal, { tile: 1 });
    b.world.add({ minX: u0, maxX: u1, minZ: -G - 0.1, maxZ: -G + 0.1, height: 2.4, tag: 'gate' });
    b.box(u1 - 0.3, u1 - 0.1, G - 0.3, G - 0.2, 1.9, 2.1, lights.glow.emergency, { tile: 1, cast: false });
  }

  // ---------------------------------------------------------------- trees: groves inside the fence, a dense belt outside
  const fenceRing: Vec2[] = [...FENCE, FENCE[0]];
  const boxOf = (pts: Vec2[], pad: number) => {
    const us = pts.map((p) => p[0]);
    const vs = pts.map((p) => p[1]);
    return [Math.min(...us) - pad, Math.max(...us) + pad, Math.min(...vs) - pad, Math.max(...vs) + pad];
  };
  const neighbours = data.features.filter((f) => f.kind === 'building').map((f) => boxOf(local(f.points), 5));
  const keepOut: number[][] = [
    ...PAVILIONS.map(([u0, u1, v0, v1]) => [u0 - 3, u1 + 3, v0 - 3, v1 + 3]),
    boxOf(outlines.dining, 4),
    boxOf(outlines.plant, 4),
    boxOf(rectPts(...POOL_HOUSE), 4),
    boxOf(rectPts(Dk.u0, Dk.u1, Dk.v0, Dk.v1), 3),
    [64, 104, -73, -33],
    // Forecourt lamps.
    [F.u0 - 6, F.u0 - 2, 75, 79],
    [F.u1 + 2, F.u1 + 6, 75, 79],
  ];
  const free = (p: Vec2, roadGap: number) =>
    !keepOut.some(([a, c, d, e]) => p[0] > a && p[0] < c && p[1] > d && p[1] < e) &&
    !neighbours.some(([a, c, d, e]) => p[0] > a && p[0] < c && p[1] > d && p[1] < e) &&
    !roads.some((r) => distToPolyline(p, r) < roadGap) &&
    !paved.some((r) => distToPolyline(p, r.pts) < r.w / 2 + 2);
  const inside: [number, number][] = [];
  for (const [u0, u1, v0, v1, n] of [
    [111, 123, -80, 83, 70],
    [-53, 123, -80, -72, 60],
    [-25, -7, 70, 92, 10],
    [94, 123, 62, 83, 18],
  ]) {
    for (let i = 0, got = 0; i < n * 8 && got < n; i++) {
      const p: Vec2 = [u0 + T.rand() * (u1 - u0), v0 + T.rand() * (v1 - v0)];
      if (!free(p, 6) || inside.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 4)) continue;
      inside.push(p);
      got++;
    }
  }
  const belt: [number, number][] = [];
  for (let i = 0; i < 9000 && belt.length < 900; i++) {
    const p: Vec2 = [-100 + T.rand() * 310, -130 + T.rand() * 355];
    if (pointInPolygon(p, FENCE)) continue;
    const d = distToPolyline(p, fenceRing);
    if (d < 3 || d > 40 || !free(p, 7)) continue;
    if (belt.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 4.2)) continue;
    belt.push(p);
  }
  P.broadleafGrove(dynamic, m, [...inside, ...belt]);
  for (const [u, v] of [...inside, ...belt]) b.world.add({ minX: u - 0.3, maxX: u + 0.3, minZ: -v - 0.3, maxZ: -v + 0.3, height: 5 });
  for (const [u, v] of inside.filter((_, i) => i % 2 === 0)) P.shrub(b, m, u + 1.8, v - 1.4, 0.8 + T.rand() * 0.6);
  // Caribbean pines further out, inside the mapped forest (way 815703975).
  {
    const forest = local(data.features.find((f) => f.kind === 'forest')!.points);
    const spots: [number, number][] = [];
    for (let i = 0; i < 4000 && spots.length < 1100; i++) {
      const p: Vec2 = [-330 + T.rand() * 660, -320 + T.rand() * 620];
      if (pointInPolygon(p, FENCE) || distToPolyline(p, fenceRing) < 44) continue;
      if (!pointInPolygon(p, forest)) continue;
      if (neighbours.some(([a, c, d, e]) => p[0] > a && p[0] < c && p[1] > d && p[1] < e)) continue;
      if (roads.some((r) => distToPolyline(p, r) < 7)) continue;
      spots.push(p);
    }
    P.pineForest(dynamic, m, spots);
  }

  // ---------------------------------------------------------------- lamps and palms round the grounds
  for (const [u, v] of [
    [12, -0.8],
    [24, -0.8],
    [65, 12],
    [65, 30],
    [74, -0.8],
    [88, -0.8],
    [-14, -0.8],
  ])
    P.streetLamp(b, m, lights, u, v);
  for (const [u, v] of [
    [-24, 60],
    [-24, 30],
    [-24, 10],
    [115, 50],
    [112, 20],
    [62, 108],
    [158, 108],
    [62, 163],
    [158, 163],
    [-20, 100],
    [-20, 160],
    [20, 100],
    [20, 160],
  ])
    P.palm(b, m, u, v);

  // ---------------------------------------------------------------- neighbours (outside the fence)
  buildNeighbours(b, m, data, local, new Set([1492740443, 1492740446, 1492740447, 1492740449, 1492740429, 1492740430, 1492740431]));

  map.polys.push({ pts: ACADEMIC_OUTLINE, fill: '#f4f1ea' }, { pts: outlines.dining, fill: '#f4f1ea' }, { pts: outlines.plant, fill: '#f4f1ea' });
  for (const p of COURTYARD_PATHS) hard.push(rectPts(p[0], p[1], p[2], p[3]));
  hard.push(rectPts(33.7, 52.5, 45.2, 47.6), rectPts(95.4, 107.9, 3.7, 10.5));
  const surface = (u: number, v: number): 'hard' | 'grass' => {
    if (hard.some((h) => pointInPolygon([u, v], h))) return 'hard';
    return paved.some((r) => distToPolyline([u, v], r.pts) < r.w / 2) ? 'hard' : 'grass';
  };

  return {
    surface,
    water,
    outlines,
    local,
    map,
    anchors: {
      spawn: W(AXIS, 64),
      dropoff: W(AXIS, 66),
      gateInside: W(49, 174),
      pitchCentre: W(PITCH.c[0], PITCH.c[1]),
      pitchTouchline: W(PITCH.c[0], PITCH.c[1] - PITCH.Wd / 2 - 2),
      poolGate: W(AXIS + 0.9, Dk.v1 + 1),
      poolEdgeWest: W(AXIS, Po.v1 + 1.2),
      poolEdgeEast: W(AXIS, Po.v0 - 1.2),
      poolCentre: W((Po.u0 + Po.u1) / 2, (Po.v0 + Po.v1) / 2, Po.water),
      walkwayMid: W(AXIS, 55.1),
      porch: W(AXIS, 49),
    },
  };
}
