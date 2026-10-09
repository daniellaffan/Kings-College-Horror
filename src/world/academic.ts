// The Senior Academic Block (OSM way 1492740447), fully modelled inside.
// The outline below is the OSM footprint rotated into the local frame and snapped to
// 0.1 m (tests/academic.test.ts checks it against data/campus.json).
//
//   C  u 26.5–60.1, v 37–45.2   corridor + Form Room 12, Classroom 13, lobby, staff room, stairwell
//   B  u 48.8–60.1, v 19.7–37   corridor + Chemistry Lab (Lab 1) and Biology Lab (Lab 2)
//   A  u 34.3–50.7, v -1.6–20.1  library, archive, quiet study
//   Porch u 33.7–52.5, v 45.2–47.6 (covered entrance canopy)
import * as THREE from 'three';
import { W, polygonGeometry, type Builder, type Opening } from './builder';
import type { Vec2 } from './geo';
import type { LightPool } from './lights';
import * as P from './props';
import type { Mats } from './props';
import * as T from './textures';

export const ACADEMIC_OUTLINE: Vec2[] = [
  [52.5, 45.2],
  [60.1, 45.2],
  [60.1, 19.7],
  [50.7, 19.7],
  [50.7, -1.6],
  [34.3, -1.6],
  [34.3, 20.1],
  [48.8, 20.1],
  [48.8, 37],
  [26.5, 37],
  [26.5, 45.2],
  [33.7, 45.2],
  [33.7, 47.6],
  [52.5, 47.6],
];

const BODY: Vec2[] = [
  [26.5, 45.2],
  [60.1, 45.2],
  [60.1, 19.7],
  [50.7, 19.7],
  [50.7, -1.6],
  [34.3, -1.6],
  [34.3, 20.1],
  [48.8, 20.1],
  [48.8, 37],
  [26.5, 37],
];

export interface Room {
  id: string;
  name: string;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export const ROOMS: Room[] = [
  { id: 'form12', name: 'Form Room 12', u0: 26.5, u1: 34, v0: 39.6, v1: 45.2 },
  { id: 'class13', name: 'Classroom 13', u0: 34, u1: 41.5, v0: 39.6, v1: 45.2 },
  { id: 'lobby', name: 'Entrance Lobby', u0: 41.5, u1: 48.8, v0: 39.6, v1: 45.2 },
  { id: 'staff', name: 'Staff Room', u0: 48.8, u1: 55.2, v0: 39.6, v1: 45.2 },
  { id: 'stairs', name: 'Stairwell', u0: 55.2, u1: 60.1, v0: 39.6, v1: 45.2 },
  { id: 'corridorC', name: 'Main Corridor', u0: 26.5, u1: 60.1, v0: 37, v1: 39.6 },
  { id: 'corridorB', name: 'Science Corridor', u0: 48.8, u1: 51.4, v0: 19.9, v1: 37 },
  { id: 'lab1', name: 'Chemistry Lab', u0: 51.4, u1: 60.1, v0: 28.4, v1: 37 },
  { id: 'lab2', name: 'Biology Lab', u0: 51.4, u1: 60.1, v0: 19.7, v1: 28.4 },
  { id: 'library', name: 'Library', u0: 34.3, u1: 50.7, v0: 4, v1: 19.9 },
  { id: 'archive', name: 'Archive', u0: 34.3, u1: 42, v0: -1.6, v1: 4 },
  { id: 'quiet', name: 'Quiet Study', u0: 42, u1: 50.7, v0: -1.6, v1: 4 },
];

export interface HideSpot {
  id: string;
  /** Where the player stands to use it. */
  enter: THREE.Vector3;
  /** Camera position while hidden. */
  cam: THREE.Vector3;
}

export interface AcademicRefs {
  hideSpots: HideSpot[];
  anchors: Record<string, THREE.Vector3>;
  boards: Record<'form12' | 'class13' | 'lab1', THREE.Mesh>;
  noticeboards: THREE.Mesh[];
  stains: THREE.Mesh[];
  photo: THREE.Mesh;
}

const STOREY = 3.8;
const CEILING = 3.2;

export function buildAcademic(b: Builder, m: Mats, lights: LightPool, dynamic: THREE.Group): AcademicRefs {
  // ------------------------------------------------------------ exterior walls
  const win = (at: number, width: number, bottom = 0.9, top = 2.6): Opening => ({ at, width, bottom, top, glass: true });
  const door = (at: number, width: number, top = 2.3): Opening => ({ at, width, top });
  const ext = (axis: 'u' | 'v', fixed: number, from: number, to: number, outerSide: 1 | -1, ground: Opening[]) => {
    b.wall(axis, fixed, from, to, { height: STOREY, thickness: 0.3, inner: m.plaster, outer: m.stucco, outerSide, openings: ground, tile: 2.5, skirting: true });
    const upper: Opening[] = [];
    const n = Math.floor((to - from - 1) / 3.4);
    for (let i = 0; i < n; i++) upper.push({ at: from + ((i + 0.5) * (to - from)) / n, width: 2, bottom: 0.9, top: 2.6, glass: true, dark: true });
    b.wall(axis, fixed, from, to, { height: STOREY, y0: STOREY, thickness: 0.3, inner: m.plaster, outer: m.stucco, outerSide, openings: upper, tile: 2.5 });
    const off = outerSide * 0.18;
    const band = (y0: number, y1: number, mat: THREE.Material) =>
      axis === 'v'
        ? b.box(from - 0.2, to + 0.2, fixed + off - 0.08, fixed + off + 0.08, y0, y1, mat, { tile: 2 })
        : b.box(fixed + off - 0.08, fixed + off + 0.08, from - 0.2, to + 0.2, y0, y1, mat, { tile: 2 });
    band(STOREY - 0.15, STOREY + 0.12, m.stuccoTint);
    band(STOREY * 2, STOREY * 2 + 0.9, m.stuccoTint);
  };

  ext('v', 45.2, 26.5, 60.1, 1, [win(30.2, 4), win(37.7, 4), door(45.2, 2.4, 2.6), win(51.6, 3), win(57.6, 2.5)]);
  ext('u', 60.1, 19.7, 45.2, 1, [door(21.5, 1.2), win(25.5, 3.5), win(30.7, 3), win(34.6, 3), win(38.3, 1.6), win(42.4, 3)]);
  ext('v', 19.7, 50.7, 60.1, -1, [win(55.5, 4)]);
  ext('u', 50.7, -1.6, 19.7, 1, [win(1.2, 2.5), win(7.5, 3), win(11.5, 3), win(15.5, 3)]);
  ext('v', -1.6, 34.3, 50.7, -1, [win(38, 1.5, 1.8, 2.5), win(44.5, 2), door(47.5, 1.2)]);
  ext('u', 34.3, -1.6, 20.1, -1, [win(1.2, 1.2, 1.8, 2.5), win(8, 3), win(12, 3), win(16, 3)]);
  ext('v', 20.1, 34.3, 48.8, 1, [win(38, 3.2), win(42.5, 3.2), win(46.6, 2.4)]);
  ext('u', 48.8, 20.1, 37, -1, [win(24, 2.6), door(29.5, 1.4), win(33.5, 2.6)]);
  ext('v', 37, 26.5, 48.8, -1, [win(30.5, 3), door(38, 1.8), win(44, 3)]);
  ext('u', 26.5, 37, 45.2, -1, [win(38.3, 1.6), win(42.4, 3)]);

  // ------------------------------------------------------------ interior walls
  const iw = (axis: 'u' | 'v', fixed: number, from: number, to: number, openings: Opening[] = []) =>
    b.wall(axis, fixed, from, to, { height: STOREY, thickness: 0.15, inner: m.plaster, openings, tile: 2.5, skirting: true });
  iw('v', 39.6, 26.5, 41.5, [door(32.5, 1.0), door(39.5, 1.0)]);
  iw('v', 39.6, 48.8, 55.2, [door(50.0, 1.0)]);
  iw('u', 34.0, 39.6, 45.2);
  iw('u', 41.5, 39.6, 45.2);
  iw('u', 48.8, 39.6, 45.2);
  iw('u', 55.2, 39.6, 45.2);
  iw('u', 51.4, 19.7, 37, [door(24.0, 1.1), door(33.5, 1.1)]);
  iw('v', 37, 51.4, 60.1);
  iw('v', 28.4, 51.4, 60.1, [door(58.2, 1.0)]);
  iw('v', 19.9, 48.8, 51.4, [door(49.9, 1.6)]);
  iw('v', 4.0, 34.3, 50.7, [door(38.2, 1.0), door(46.2, 1.0)]);
  iw('u', 42.0, -1.6, 4.0);

  // ------------------------------------------------------------ floors, ceiling, roof
  const floor = (u0: number, u1: number, v0: number, v1: number, mat: THREE.Material, tile = 2) => b.slab(u0, u1, v0, v1, 0.01, mat, tile);
  floor(26.5, 60.1, 37, 39.6, m.corridorFloor, 1.2);
  floor(48.8, 51.4, 19.7, 37, m.corridorFloor, 1.2);
  floor(26.5, 41.5, 39.6, 45.2, m.classFloor, 2);
  floor(41.5, 48.8, 39.6, 45.2, m.terrazzo, 2);
  floor(48.8, 55.2, 39.6, 45.2, m.classFloor, 2);
  floor(55.2, 60.1, 39.6, 45.2, m.terrazzo, 2);
  floor(51.4, 60.1, 19.7, 37, m.corridorFloor, 1.2);
  floor(34.3, 50.7, 4, 19.9, m.classFloor, 2);
  floor(34.3, 42, -1.6, 4, m.concrete, 2);
  floor(42, 50.7, -1.6, 4, m.classFloor, 2);
  b.add(polygonGeometry(BODY, CEILING, 1.2, true), m.ceiling, false);
  // Hidden slab above the ceiling keeps sunlight out of the ground floor.
  b.add(polygonGeometry(BODY, STOREY, 3, true), m.concrete, true);
  b.add(polygonGeometry(BODY, STOREY * 2, 3), m.roof, true);

  // Porch canopy with columns.
  b.box(33.7, 52.5, 45.2, 47.6, 3.4, 3.65, m.stuccoTint, { tile: 2 });
  for (const u of [34.1, 40.2, 50.2, 52.1]) b.box(u - 0.15, u + 0.15, 47.1, 47.4, 0, 3.4, m.stucco, { tile: 1, collide: true });
  b.slab(33.7, 52.5, 45.2, 47.6, 0.02, m.paving, 2);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 0.9),
    new THREE.MeshStandardMaterial({
      map: T.signTexture([{ text: "KING'S HOLLOW COLLEGE", size: 120, color: '#0f2d5c' }], '#f3eee2', 2048, 200),
      roughness: 0.5,
    }),
  );
  sign.position.copy(W(43.1, 47.62, 3.0));
  dynamic.add(sign);

  // ------------------------------------------------------------ lighting
  for (const r of ROOMS) P.ceilingLights(b, lights, r.u0 + 0.2, r.u1 - 0.2, r.v0 + 0.2, r.v1 - 0.2, CEILING, r.id.startsWith('corridor') ? 3.6 : 3.2, r.id === 'archive' ? 3 : 6);

  // ------------------------------------------------------------ rooms
  const hideSpots: HideSpot[] = [];
  const hide = (id: string, under: THREE.Vector3, from: THREE.Vector3) =>
    hideSpots.push({ id, enter: from, cam: new THREE.Vector3(under.x, 0.45, under.z) });

  // Form Room 12 — desks face the whiteboard on the east wall.
  for (const u of [28.0, 30.0]) for (const v of [40.9, 42.4, 43.9]) P.studentDesk(b, m, u, v, 3);
  hide('form12', P.teacherDesk(b, m, 32.9, 42.4, 1), W(32.0, 42.4, 0));
  const boardMat = (lines: string[], color?: string) => new THREE.MeshStandardMaterial({ map: T.whiteboardTexture(lines, color), roughness: 0.15 });
  const boards = {
    form12: P.wallPanel(dynamic, 'u', 34.0, 42.4, -1, 3.2, 1.2, 1.6, boardMat(['Welcome, Year 12!', 'Form 12 · Room 12', 'Timetables on the board ->', 'Have a great first day :)'])),
    class13: P.wallPanel(dynamic, 'u', 41.5, 42.4, -1, 3.2, 1.2, 1.6, boardMat(['English Literature', 'The Tempest — Act I', '"Full fathom five thy father lies"'])),
    lab1: P.wallPanel(dynamic, 'v', 37, 55.8, -1, 3.6, 1.2, 1.7, boardMat(['Chemistry — Ms. Fairweather', 'Lesson: Nassau, 1846', 'Limestone + water = ?'], '#0b5a2a')),
  };
  const nbMat = () => new THREE.MeshStandardMaterial({ map: T.noticeboardTexture({ title: 'WELCOME WEEK' }), roughness: 0.9 });
  const noticeboards = [
    P.wallPanel(dynamic, 'v', 39.6, 29.4, 1, 2.4, 1.2, 1.5, nbMat()),
    P.wallPanel(dynamic, 'u', 48.8, 42.4, -1, 2.4, 1.2, 1.5, nbMat()),
    P.wallPanel(dynamic, 'v', 39.6, 36.6, -1, 2.4, 1.2, 1.5, nbMat()),
  ];
  const clock = (axis: 'u' | 'v', fixed: number, at: number, facing: 1 | -1) =>
    P.wallPanel(dynamic, axis, fixed, at, facing, 0.34, 0.34, 2.75, m.clock);
  clock('u', 34.0, 42.4, -1);
  clock('u', 41.5, 42.4, -1);
  clock('v', 37, 55.8, -1);

  // Classroom 13.
  for (const u of [35.6, 37.6]) for (const v of [40.9, 42.4, 43.9]) P.studentDesk(b, m, u, v, 3);
  hide('class13', P.teacherDesk(b, m, 40.4, 42.4, 1), W(39.5, 42.4, 0));

  // Lobby: reception desk, benches, trophy cabinet, crest.
  P.teacherDesk(b, m, 46.8, 43.6, 2);
  b.box(42.0, 42.5, 40.3, 44.6, 0, 0.45, m.wood, { tile: 1, collide: true });
  b.box(42.0, 42.2, 40.3, 44.6, 0.45, 0.9, m.wood, { tile: 1 });
  b.box(48.2, 48.7, 40.0, 41.4, 0, 1.9, m.wood, { tile: 1, collide: true });
  P.wallPanel(
    dynamic,
    'u',
    41.5,
    42.4,
    1,
    3.0,
    1.2,
    2.2,
    new THREE.MeshStandardMaterial({
      map: T.signTexture(
        [
          { text: "King's Hollow College", size: 70, color: '#0f2d5c' },
          { text: 'Western Road · Nassau · Est. 2022', size: 34, color: '#5a5a5a' },
          { text: 'Welcome, new students!', size: 40, color: '#b8862b' },
        ],
        '#f7f3ea',
        1024,
        400,
        '#0f2d5c',
      ),
      roughness: 0.4,
    }),
  );

  // Staff room.
  P.table(b, m, 51.9, 42.4, 2.2, 1.1);
  for (const [du, dv] of [
    [-0.7, -0.75],
    [0.7, -0.75],
    [-0.7, 0.75],
    [0.7, 0.75],
  ]) P.chair(b, m, 51.9 + du, 42.4 + dv, dv > 0 ? 2 : 0);
  hide('staff', W(51.9, 42.4), W(51.9, 41.2));
  P.lockers(b, m, 52.0, 44.9, 6, 2);
  b.box(53.6, 55.0, 39.8, 40.4, 0, 0.9, m.wood, { tile: 1, collide: true });
  b.box(53.6, 55.0, 39.8, 40.4, 0.9, 0.93, m.blackTop, { tile: 1 });

  // Stairwell: flight up to the closed first floor, barrier tape.
  for (let i = 0; i < 14; i++) {
    const v = 40.4 + i * 0.3;
    b.box(57.6, 60.0, v, v + 0.3, 0, (i + 1) * 0.19, m.terrazzo, { tile: 1 });
  }
  b.box(55.6, 57.5, 43.6, 45.0, 0, 2.66, m.terrazzo, { tile: 1 });
  b.world.add({ minX: 57.5, maxX: 60.1, minZ: -45.2, maxZ: -40.6, height: 2.7 });
  b.box(57.5, 57.55, 40.5, 44.6, 0.9, 1.0, m.steel, { tile: 1 });
  const tape = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6 });
  b.box(57.6, 60.0, 40.45, 40.5, 0.95, 1.05, tape, { tile: 1, cast: false });
  P.wallPanel(
    dynamic,
    'u',
    55.2,
    41.5,
    1,
    0.9,
    0.5,
    1.5,
    new THREE.MeshStandardMaterial({
      map: T.signTexture([{ text: 'FIRST FLOOR CLOSED', size: 70, color: '#111' }, { text: 'Refurbishment in progress', size: 44, color: '#333' }], '#f2c200', 1024, 512),
    }),
  );

  // Corridors: lockers, exit signs, extinguishers.
  P.lockers(b, m, 31.0, 37.4, 18, 0);
  P.lockers(b, m, 44.4, 37.4, 6, 0);
  P.lockers(b, m, 49.1, 32.5, 10, 1);
  for (const [u, v, rot] of [
    [45.2, 44.9, 0],
    [59.8, 21.5, 1],
    [47.5, -1.3, 0],
    [49.9, 19.6, 0],
  ] as const) P.exitSign(b, m, u, v, 2.4, rot);
  for (const [u, v] of [
    [41.3, 39.4],
    [51.2, 26.5],
    [34.6, 19.4],
  ]) {
    b.box(u - 0.09, u + 0.09, v - 0.09, v + 0.09, 0.15, 0.75, m.plasticRed, { tile: 1 });
  }

  // Chemistry Lab (Lab 1).
  P.labBench(b, m, 55.6, 30.4, 3.4, 1.2);
  P.labBench(b, m, 55.6, 33.0, 3.4, 1.2);
  hide('lab1', P.teacherDesk(b, m, 55.8, 35.8, 2), W(55.8, 34.6));
  for (const v of [29.6, 30.4, 31.2, 32.2, 33.0, 33.8]) P.chair(b, m, 53.4, v, 1);
  b.box(59.4, 60.0, 34.6, 36.6, 0, 2.3, m.whiteGloss, { tile: 1, collide: true }); // fume cupboard
  b.box(59.35, 59.4, 34.8, 36.4, 0.95, 2.0, b.glass, { tile: 1, cast: false });
  b.box(59.5, 60.0, 29.0, 31.4, 0, 2.0, m.metalPaint, { tile: 1, collide: true }); // chemical store
  // Bottles on the store's shelves.
  const bottleMats = [0x7a2a10, 0x1f5f8f, 0xd6d6c8, 0x2f6f2f].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.1, transmission: 0.3, thickness: 0.05 }));
  for (let i = 0; i < 18; i++) {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 8), bottleMats[i % 4]);
    bottle.position.copy(W(59.45, 29.2 + (i % 9) * 0.25, 1.1 + Math.floor(i / 9) * 0.5));
    dynamic.add(bottle);
  }

  // Biology Lab (Lab 2): benches, specimen shelf and a teaching skeleton.
  P.labBench(b, m, 55.6, 22.4, 3.4, 1.2);
  P.labBench(b, m, 55.6, 25.2, 3.4, 1.2);
  P.bookshelf(b, m, 52.0, 27.8, 1.2, 0, 1.8);
  const bone = new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.6 });
  const skel = new THREE.Group();
  const limb = (x: number, y: number, z: number, h: number, r = 0.025) => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 6), bone);
    s.position.set(x, y, z);
    skel.add(s);
  };
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), bone);
  skull.position.set(0, 1.62, 0);
  skull.scale.set(0.85, 1.05, 1);
  skel.add(skull);
  limb(0, 1.15, 0, 0.6, 0.02);
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.11 - i * 0.008, 0.008, 4, 12), bone);
    rib.rotation.x = Math.PI / 2;
    rib.position.set(0, 1.4 - i * 0.05, 0.02);
    skel.add(rib);
  }
  for (const s of [-1, 1]) {
    limb(s * 0.2, 1.2, 0, 0.55);
    limb(s * 0.1, 0.55, 0, 0.8);
  }
  limb(0, 0.0, 0, 0.02, 0.15);
  skel.position.copy(W(59.4, 27.6));
  skel.rotation.y = Math.PI / 2;
  dynamic.add(skel);

  // Library: shelving rows, study tables, librarian desk.
  for (const v of [6.0, 8.6, 11.2]) P.bookshelf(b, m, 39.5, v, 8, 0);
  P.bookshelf(b, m, 39.5, 15.4, 8, 0, 1.2);
  for (const [u, v] of [
    [46.2, 7.0],
    [46.2, 10.4],
    [46.2, 13.8],
  ]) {
    P.table(b, m, u, v, 2.0, 1.0);
    P.chair(b, m, u - 0.5, v - 0.75, 0);
    P.chair(b, m, u + 0.5, v - 0.75, 0);
    P.chair(b, m, u - 0.5, v + 0.75, 2);
    P.chair(b, m, u + 0.5, v + 0.75, 2);
  }
  hide('libraryTable', W(46.2, 10.4), W(46.2, 9.1));
  hide('libraryDesk', P.teacherDesk(b, m, 48.6, 17.6, 2), W(48.6, 16.4));
  b.box(49.8, 50.4, 18.6, 19.2, 0, 0.9, m.metalPaint, { tile: 1, collide: true }); // book returns box

  // Archive: filing cabinets, boxes, the 1846 photograph, the floor drain.
  for (let i = 0; i < 5; i++) b.box(34.6, 35.2, -1.2 + i * 0.75, -0.55 + i * 0.75, 0, 1.35, m.metalPaint, { tile: 1, collide: true });
  for (let i = 0; i < 7; i++) {
    const u = 39.5 + (i % 3) * 0.55;
    const v = -1.1 + Math.floor(i / 3) * 0.5;
    b.box(u, u + 0.45, v, v + 0.35, Math.floor(i / 3) === 2 ? 0.32 : 0, Math.floor(i / 3) === 2 ? 0.62 : 0.32, m.paper, { tile: 1 });
  }
  P.table(b, m, 37.6, 1.4, 1.6, 0.8);
  hide('archive', W(37.6, 1.4), W(37.6, 2.5));
  const photo = P.wallPanel(dynamic, 'v', 4.0, 39.0, -1, 0.8, 0.6, 1.7, new THREE.MeshStandardMaterial({ map: T.oldPhotoTexture(), roughness: 0.6 }));
  const drain = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.5 }));
  drain.rotation.x = -Math.PI / 2;
  drain.position.copy(W(40.6, 2.6, 0.015));
  dynamic.add(drain);

  // Quiet study carrels.
  for (let i = 0; i < 4; i++) {
    const u = 43.0 + i * 1.6;
    P.table(b, m, u, 3.3, 1.3, 0.6);
    b.box(u - 0.65, u + 0.65, 3.6, 3.62, 0.74, 1.3, m.fabric, { tile: 1 });
    P.chair(b, m, u, 2.7, 0);
  }

  // Ceiling water stains (revealed during Act II).
  const stainMat = new THREE.MeshStandardMaterial({ map: T.waterStainTexture(), transparent: true, opacity: 0, depthWrite: false, roughness: 1 });
  const stains: THREE.Mesh[] = [];
  for (const [u, v, s] of [
    [30, 38.3, 1.6],
    [38, 38.3, 2.2],
    [46, 38.3, 1.8],
    [53, 38.3, 2.4],
    [50.1, 25, 1.6],
    [50.1, 31, 2.0],
    [30.2, 42.4, 2.6],
    [42, 12, 3.4],
  ]) {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(s, s), stainMat);
    st.rotation.x = Math.PI / 2;
    st.position.copy(W(u, v, CEILING - 0.01));
    dynamic.add(st);
    stains.push(st);
  }

  // ------------------------------------------------------------ courtyard
  b.slab(26.5, 48.8, 20.1, 37, 0.03, m.paving, 2.5);
  for (const [u, v] of [
    [30, 24],
    [44.5, 33],
  ]) {
    b.box(u - 1.2, u + 1.2, v - 1.2, v + 1.2, 0, 0.5, m.stuccoTint, { tile: 1, collide: true });
    b.slab(u - 1.1, u + 1.1, v - 1.1, v + 1.1, 0.48, m.forestFloor, 1);
    P.palm(b, m, u, v, 8);
  }
  for (const [u, v] of [
    [36.5, 27.6],
    [40.5, 27.6],
  ]) {
    b.box(u - 0.9, u + 0.9, v - 0.25, v + 0.25, 0.42, 0.46, m.wood, { tile: 1 });
    b.box(u - 0.8, u - 0.7, v - 0.2, v + 0.2, 0, 0.42, m.darkMetal, { tile: 1 });
    b.box(u + 0.7, u + 0.8, v - 0.2, v + 0.2, 0, 0.42, m.darkMetal, { tile: 1 });
    b.world.add({ minX: u - 0.9, maxX: u + 0.9, minZ: -(v + 0.25), maxZ: -(v - 0.25), height: 0.46 });
  }
  P.shrub(b, m, 33.5, 35.5, 0.9);
  P.shrub(b, m, 47.5, 22, 0.8);

  return {
    hideSpots,
    boards,
    noticeboards,
    stains,
    photo,
    anchors: {
      entrance: W(45.2, 48.5),
      formRoom: W(30.2, 42.4),
      amaraForm: W(29.0, 44.4),
      class13: W(37.7, 42.4),
      libraryDesk: W(48.6, 16.9),
      libraryStart: W(46.2, 9.0),
      archivePhoto: W(39.0, 3.3, 1.6),
      archiveDrain: W(40.6, 2.6),
      lab1Front: W(55.8, 36.3),
      lab1Centre: W(55.8, 31.7),
      flareStation: W(58.9, 30.2),
      lab2FireDoor: W(59.4, 21.5),
      stairBottom: W(56.4, 41.0),
      corridorDrain: W(50.1, 22.5),
      courtyardBench: W(38.5, 27.6),
      courtyardDoor: W(38.0, 37.6),
      corridorBNorth: W(50.1, 36.0),
    },
  };
}
