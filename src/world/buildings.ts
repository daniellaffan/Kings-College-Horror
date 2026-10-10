// The other campus buildings, fitted to their OSM footprints (local frame):
//   Dining hall + café   way 1492740443  hall u 95.4–107.8, v -31.3–3.7; café annex u 107.8–116.8, v -20.5–-2.9
//   Arts & auditorium    way 1492740446  locked two-storey shell
//   Plant room           way 1492740449  u -47.2–-22.4, v -73.3–-65.5; the stair shaft down to the blue hole
// plus the gate security booth and simple massing for the neighbourhood.
import * as THREE from 'three';
import { W, polygonGeometry, type Builder } from './builder';
import type { Box } from './collision';
import type { CampusData, Vec2 } from './geo';
import type { LightPool } from './lights';
import * as P from './props';
import type { Mats } from './props';
import { buildShell } from './shell';
import * as T from './textures';
import type { HideSpot } from './academic';

/** Gate security booth (local frame), just inside the main gate. */
export const BOOTH = { u0: 60, u1: 63, v0: 170, v1: 173.5 };
export const PLANT_SHAFT = { u0: -27.5, u1: -24.5, v0: -72.6, v1: -67.6, depth: 5 };

export interface BuildingRefs {
  hideSpots: HideSpot[];
  anchors: Record<string, THREE.Vector3>;
  shaftBlock: Box;
  hatch: THREE.Object3D;
  boothMonitor: THREE.Mesh;
  menuBoard: THREE.Mesh;
  shaftWater: THREE.Mesh;
}

const hideAt = (list: HideSpot[], id: string, under: THREE.Vector3, from: THREE.Vector3) =>
  list.push({ id, enter: from, cam: new THREE.Vector3(under.x, 0.45, under.z) });

export function buildBuildings(b: Builder, m: Mats, lights: LightPool, dynamic: THREE.Group, outlines: Record<string, Vec2[]>): BuildingRefs {
  const hideSpots: HideSpot[] = [];

  // ------------------------------------------------------------------ dining hall + café
  const HALL_H = 5.2;
  buildShell(b, m, outlines.dining, {
    height: HALL_H,
    storeyHeight: HALL_H,
    enterable: true,
    windowEvery: 3.4,
    doors: [
      { at: [95.4, -10], width: 2.2 },
      { at: [101.5, 3.7], width: 2.2 },
    ],
    fakeDoors: [{ at: [101.6, -31.3], width: 1.4 }],
    floor: m.terrazzo,
  });
  b.wall('u', 107.8, -20.5, -2.9, { height: HALL_H, thickness: 0.2, inner: m.plaster, openings: [{ at: -11.7, width: 11, top: 3.2 }], tile: 2.5, skirting: true });
  P.ceilingLights(b, lights, 95.8, 107.4, -30.9, 3.3, HALL_H - 0.4, 3.6, 7);
  P.ceilingLights(b, lights, 108.2, 116.4, -20.1, -3.3, HALL_H - 0.4, 3.4, 6);
  for (const u of [98.4, 101.6, 104.8]) {
    for (const v of [-24, -19.5, -15, -5.5, -1]) {
      P.table(b, m, u, v, 1.8, 0.8, m.whiteGloss);
      for (const [du, dv, rot] of [
        [-0.45, -0.7, 0],
        [0.45, -0.7, 0],
        [-0.45, 0.7, 2],
        [0.45, 0.7, 2],
      ]) P.chair(b, m, u + du, v + dv, rot);
    }
  }
  hideAt(hideSpots, 'diningTable', W(101.6, -15), W(101.6, -16.6));
  // Servery: steel counter with bain-marie wells, gap at the west end to get behind it.
  b.box(96.8, 107.2, -29.0, -28.2, 0, 0.92, m.steel, { tile: 1, collide: true });
  for (let u = 97.4; u < 106.8; u += 1.3) b.box(u, u + 1.0, -28.9, -28.3, 0.86, 0.93, m.darkMetal, { tile: 1 });
  b.box(96.8, 107.2, -29.0, -28.96, 1.25, 1.6, b.glass, { tile: 1, cast: false });
  hideAt(hideSpots, 'servery', W(102, -30.2), W(96.1, -30.2));
  // Café counter in the annex: glass chiller, blender, coffee machine, menu board.
  b.box(110.2, 110.9, -17.5, -6.5, 0, 1.05, m.wood, { tile: 1, collide: true });
  b.box(110.1, 111.0, -17.6, -6.4, 1.05, 1.09, m.blackTop, { tile: 1 });
  b.box(110.3, 110.8, -16.8, -13.6, 1.09, 1.55, b.glass, { tile: 1, cast: false });
  b.box(111.2, 111.7, -10.0, -9.4, 1.09, 1.55, m.steel, { tile: 1 });
  b.box(110.4, 110.7, -8.0, -7.6, 1.09, 1.42, m.plasticNavy, { tile: 1 });
  b.box(115.9, 116.6, -19.8, -3.6, 0, 0.9, m.whiteGloss, { tile: 1, collide: true });
  const menuBoard = P.wallPanel(
    dynamic,
    'u',
    116.8,
    -11.7,
    -1,
    4.4,
    1.4,
    2.5,
    new THREE.MeshStandardMaterial({
      map: T.signTexture(
        [
          { text: 'TIDE CAFÉ', size: 90, color: '#f2c200' },
          { text: 'Mango Sunrise $4 · Guava Duff Smoothie $4', size: 40, color: '#ffffff' },
          { text: 'Conch Fritters $5 · Johnny Cake $2', size: 40, color: '#ffffff' },
        ],
        '#13324f',
        1024,
        330,
      ),
      roughness: 0.4,
    }),
  );
  for (const [u, v] of [
    [113.2, -16],
    [113.2, -8],
  ]) {
    P.table(b, m, u, v, 0.9, 0.9, m.wood);
    P.chair(b, m, u - 0.8, v, 1);
    P.chair(b, m, u + 0.8, v, 3);
  }
  // Covered outdoor dining on the north side.
  b.box(95.4, 107.9, 3.9, 10.5, 3.3, 3.5, m.stuccoTint, { tile: 2 });
  for (const u of [95.7, 101.6, 107.6]) b.box(u - 0.15, u + 0.15, 10.0, 10.3, 0, 3.3, m.stucco, { tile: 1, collide: true });
  b.slab(95.4, 107.9, 3.7, 10.5, 0.02, m.paving, 2);
  for (const u of [98.4, 104.8]) {
    P.table(b, m, u, 7.2, 1.8, 0.8, m.wood);
    P.chair(b, m, u - 0.45, 6.5, 0);
    P.chair(b, m, u + 0.45, 7.9, 2);
  }

  // ------------------------------------------------------------------ plant room + stair shaft
  const S = PLANT_SHAFT;
  buildShell(b, m, outlines.plant, {
    height: 4.6,
    windowEvery: 60,
    doors: [{ at: [-30, -65.5], width: 1.6 }],
    outer: m.concrete,
    inner: m.concrete,
  });
  // Floor around the shaft, ceiling.
  b.slab(-47.2, S.u0, -73.3, -65.5, 0.02, m.concrete, 2);
  b.slab(S.u1, -22.4, -73.3, -65.5, 0.02, m.concrete, 2);
  b.slab(S.u0, S.u1, -73.3, S.v0, 0.02, m.concrete, 2);
  b.slab(S.u0, S.u1, S.v1, -65.5, 0.02, m.concrete, 2);
  b.add(polygonGeometry(outlines.plant, 4.2, 2, true), m.concrete, false);
  P.ceilingLights(b, lights, -46.8, -22.8, -72.9, -65.9, 4.2, 4, 4);
  // Shaft: concrete walls down, stairs running south, black water at the bottom.
  const D = S.depth;
  b.box(S.u0 - 0.2, S.u0, S.v0, S.v1, -D - 1.5, 0, m.concrete, { tile: 2 });
  b.box(S.u1, S.u1 + 0.2, S.v0, S.v1, -D - 1.5, 0, m.concrete, { tile: 2 });
  b.box(S.u0, S.u1, S.v0 - 0.2, S.v0, -D - 1.5, 0, m.concrete, { tile: 2 });
  b.box(S.u0, S.u1, S.v1, S.v1 + 0.2, -D - 1.5, 0, m.concrete, { tile: 2 });
  const steps = 20;
  const run = (S.v1 - S.v0) / steps;
  for (let i = 0; i < steps; i++) {
    const v = S.v1 - (i + 1) * run;
    b.box(S.u0 + 0.6, S.u1, v, v + run, -D - 1.5, -(i + 1) * (D / steps), m.concrete, { tile: 1 });
  }
  const shaftWater = new THREE.Mesh(
    new THREE.PlaneGeometry(S.u1 - S.u0, S.v1 - S.v0).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x020607, roughness: 0.02, metalness: 0.4 }),
  );
  shaftWater.position.copy(W((S.u0 + S.u1) / 2, (S.v0 + S.v1) / 2, -D + 0.6));
  dynamic.add(shaftWater);
  lights.add({ pos: W(S.u0 + 0.4, S.v0 + 0.5, -D + 1.6), color: new THREE.Color(0xff2a14), intensity: 4, group: 'emergency', flicker: 0.4 });
  // Railing round the shaft (open on the north side, blocked by the collider below).
  for (const [a, c] of [
    [
      [S.u0, S.v0],
      [S.u1, S.v0],
    ],
    [
      [S.u0, S.v0],
      [S.u0, S.v1],
    ],
    [
      [S.u1, S.v0],
      [S.u1, S.v1],
    ],
  ] as [Vec2, Vec2][]) {
    const [u0, u1] = [Math.min(a[0], c[0]) - 0.03, Math.max(a[0], c[0]) + 0.03];
    const [v0, v1] = [Math.min(a[1], c[1]) - 0.03, Math.max(a[1], c[1]) + 0.03];
    b.box(u0, u1, v0, v1, 1.0, 1.06, m.plasticRed, { tile: 1 });
    b.box(u0, u1, v0, v1, 0.5, 0.54, m.plasticRed, { tile: 1 });
  }
  const shaftBlock = b.world.add({ minX: S.u0, maxX: S.u1, minZ: -S.v1 - 0.3, maxZ: -S.v0, height: 1.1, tag: 'shaft' });
  // Hinged grate hatch over the stairs (opens in Act III).
  const hatch = new THREE.Group();
  const grate = new THREE.Mesh(new THREE.BoxGeometry(S.u1 - S.u0 - 0.6, 0.04, 1.4), m.darkMetal);
  grate.position.set((S.u1 - S.u0 - 0.6) / 2, 0, 0.7);
  grate.castShadow = true;
  hatch.add(grate);
  hatch.position.copy(W(S.u0 + 0.6, S.v1, 0.05));
  dynamic.add(hatch);
  // Machinery: pumps, pressure tanks, ducting, the electrical panel with the gate override.
  const pumpMat = new THREE.MeshStandardMaterial({ color: 0x2f5f8a, roughness: 0.4, metalness: 0.5 });
  for (const u of [-44.5, -41.5, -38.5]) {
    b.box(u - 0.8, u + 0.8, -72.6, -70.6, 0, 0.25, m.concrete, { tile: 1, collide: true });
    const motor = new THREE.CylinderGeometry(0.42, 0.42, 1.3, 20).rotateX(Math.PI / 2);
    b.addTransformed(motor, pumpMat, new THREE.Matrix4().makeTranslation(u, 0.75, 71.6));
    b.addTransformed(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 10), m.steel, new THREE.Matrix4().makeTranslation(u, 2.3, 71.0));
  }
  for (const u of [-35.5, -32.5]) {
    b.addTransformed(new THREE.CylinderGeometry(1.0, 1.0, 3.2, 24), m.rust, new THREE.Matrix4().makeTranslation(u, 1.6, 71.6));
    b.world.add({ minX: u - 1, maxX: u + 1, minZ: 70.6, maxZ: 72.6, height: 3.2 });
  }
  for (const v of [-66.4, -72.2]) b.addTransformed(new THREE.CylinderGeometry(0.16, 0.16, 24, 10).rotateZ(Math.PI / 2), m.steel, new THREE.Matrix4().makeTranslation(-34.8, 3.8, -v));
  b.box(-47.0, -46.8, -70.2, -68.2, 0.9, 2.4, m.metalPaint, { tile: 1 });
  hideAt(hideSpots, 'plantTank', W(-34, -73.0), W(-34, -69.8));

  // ------------------------------------------------------------------ gate security booth (just inside the gate, east of the drive)
  const Bo = BOOTH;
  b.wall('v', Bo.v0, Bo.u0, Bo.u1, { height: 2.7, thickness: 0.15, inner: m.plaster, outer: m.stucco, outerSide: -1, openings: [{ at: Bo.u0 + 2.1, width: 0.9 }], tile: 2 });
  b.wall('v', Bo.v1, Bo.u0, Bo.u1, { height: 2.7, thickness: 0.15, inner: m.plaster, outer: m.stucco, outerSide: 1, openings: [{ at: Bo.u0 + 1.5, width: 1.6, bottom: 1.0, top: 2.2, glass: true }], tile: 2 });
  b.wall('u', Bo.u0, Bo.v0, Bo.v1, { height: 2.7, thickness: 0.15, inner: m.plaster, outer: m.stucco, outerSide: -1, openings: [{ at: Bo.v0 + 1.75, width: 2.2, bottom: 1.0, top: 2.2, glass: true }], tile: 2 });
  b.wall('u', Bo.u1, Bo.v0, Bo.v1, { height: 2.7, thickness: 0.15, inner: m.plaster, outer: m.stucco, outerSide: 1, openings: [{ at: Bo.v0 + 1.75, width: 1.6, bottom: 1.0, top: 2.2, glass: true }], tile: 2 });
  b.box(Bo.u0 - 0.3, Bo.u1 + 0.3, Bo.v0 - 0.3, Bo.v1 + 0.3, 2.7, 2.9, m.stuccoTint, { tile: 2 });
  b.slab(Bo.u0, Bo.u1, Bo.v0, Bo.v1, 0.04, m.concrete, 2);
  P.ceilingLights(b, lights, Bo.u0 + 0.2, Bo.u1 - 0.2, Bo.v0 + 0.2, Bo.v1 - 0.2, 2.68, 4, 3);
  b.box(Bo.u0 + 0.2, Bo.u0 + 0.8, Bo.v0 + 0.4, Bo.v1 - 0.3, 0, 0.78, m.wood, { tile: 1, collide: true });
  const boothMonitor = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0x4a6a7a, emissiveIntensity: 1.2, roughness: 0.2 }),
  );
  boothMonitor.position.copy(W(Bo.u0 + 0.5, Bo.v0 + 2.4, 1.05));
  boothMonitor.rotation.y = Math.PI / 2;
  dynamic.add(boothMonitor);

  return {
    hideSpots,
    shaftBlock,
    hatch,
    boothMonitor,
    menuBoard,
    shaftWater,
    anchors: {
      diningDoor: W(94.2, -10),
      diningCentre: W(101.6, -10),
      cafeCounter: W(109.4, -12),
      plantDoor: W(-30, -64.2),
      plantInside: W(-30, -67),
      plantPanel: W(-46.6, -69.2, 1.5),
      shaftTop: W((S.u0 + S.u1) / 2 + 0.3, S.v1 + 0.6),
      shaftBottom: W((S.u0 + S.u1) / 2 + 0.3, S.v0 + 0.4, -D),
      booth: W(Bo.u0 + 1.5, Bo.v0 + 1.75),
      boothDoor: W(Bo.u0 + 2.1, Bo.v0 - 0.8),
    },
  };
}

/** Simple extruded massing for neighbouring buildings outside the fence (not on the campus grid). */
export function buildNeighbours(b: Builder, m: Mats, data: CampusData, toLocalPts: (pts: Vec2[]) => Vec2[], skip: Set<number>) {
  for (const f of data.features) {
    if (f.kind !== 'building' || skip.has(f.id)) continue;
    const pts = toLocalPts(f.points);
    const house = f.tags.building === 'house';
    const h = house ? 3.4 + (f.id % 3) * 0.4 : 4.2 + (f.id % 2) * 3.4;
    const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.5, uv.getY(i) / 2.5);
    // Extrusion is along +Z in shape space (u, v, h) → world (u, h, -v).
    g.rotateX(-Math.PI / 2);
    b.add(g, house ? m.stuccoTint : m.stucco);
    b.add(polygonGeometry(pts, h + 0.01, 3), m.roof);
  }
}
