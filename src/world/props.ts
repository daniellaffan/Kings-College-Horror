// Furniture and fittings. Every prop is merged into the Builder's static batches.
// Rotation `rot` is in quarter turns (0..3) in the local frame.
import * as THREE from 'three';
import { assets } from '../engine/assets';
import { W, metricBox, type Builder } from './builder';
import type { LightPool } from './lights';
import * as T from './textures';

export type Mats = ReturnType<typeof makeMats>;

export function makeMats() {
  const std = (color: number, roughness: number, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const frond = T.frondTexture();
  const foliage = T.foliageTexture(false);
  const pine = T.foliageTexture(true);
  const leafMat = (map: THREE.Texture) =>
    new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  const mats = {
    stucco: assets.material('stucco', { color: 0xe9bfae }),
    stuccoTint: assets.material('stucco', { color: 0xf1d4c6, noArm: true, roughness: 0.92 }),
    plaster: assets.material('plaster', { noArm: true, roughness: 0.9 }),
    corridorFloor: assets.material('corridorFloor', { roughness: 0.25, noArm: true, color: 0xe8e8e4 }),
    classFloor: assets.material('classFloor', { roughness: 0.45, noArm: true }),
    terrazzo: assets.material('terrazzo', { roughness: 0.2, noArm: true }),
    ceiling: assets.material('ceiling', { noArm: true, roughness: 0.95 }),
    asphalt: assets.material('asphalt'),
    grass: assets.material('grass', { color: 0x9cc47a }),
    turf: assets.material('grass', { color: 0x9fd77a, noArm: true, roughness: 0.85 }),
    turfStripe: assets.material('grass', { color: 0x7fbf5c, noArm: true, roughness: 0.85 }),
    greyPanel: std(0x8e9296, 0.75),
    greyTrim: std(0xc9c9c4, 0.8),
    track: assets.material('track'),
    paving: assets.material('paving', { color: 0xd8cfc4 }),
    wavePaving: new THREE.MeshStandardMaterial({ map: T.waveMosaicTexture(), roughness: 0.7 }),
    cladding: new THREE.MeshStandardMaterial({ map: T.ribbedCladdingTexture(), roughness: 0.8 }),
    poolTile: assets.material('poolTile', { roughness: 0.15, noArm: true }),
    rust: assets.material('rust'),
    concrete: assets.material('concrete', { color: 0xb4b4b2 }),
    forestFloor: assets.material('forestFloor'),
    wood: assets.material('wood', { roughness: 0.55, noArm: true }),
    hexBlue: std(0x2e6fd0, 0.45),
    seatOrange: std(0xe0762a, 0.7),
    hedge: std(0x2f5a2c, 0.95),
    ropeRed: std(0xc62828, 0.5),
    hardCourt: assets.material('asphalt', { color: 0x3f8a4e, noArm: true, roughness: 0.7 }),
    padelCourt: assets.material('asphalt', { color: 0x2f7f6a, noArm: true, roughness: 0.7 }),
    metalPaint: std(0x56677a, 0.45, 0.5),
    steel: std(0xb9bec4, 0.3, 1),
    darkMetal: std(0x2b2e33, 0.5, 0.7),
    plasticNavy: std(0x1f2f5a, 0.45),
    plasticRed: std(0x8f1d1d, 0.4),
    blackTop: std(0x111214, 0.18),
    whiteGloss: std(0xf2f2ee, 0.15),
    fabric: std(0x34506b, 0.95),
    paper: std(0xf3efe2, 0.9),
    bark: std(0x6b5e50, 0.95),
    pineBark: std(0x5a4030, 0.95),
    roof: std(0xd9d5cc, 0.85),
    white: std(0xffffff, 0.6),
    line: std(0xf5f5f5, 0.6),
    rubber: std(0x151515, 0.9),
    exitSign: new THREE.MeshStandardMaterial({ color: 0x0a2a10, emissive: 0x22ff55, emissiveIntensity: 2 }),
    books: new THREE.MeshStandardMaterial({ map: T.booksTexture(), roughness: 0.8 }),
    lockerBlue: new THREE.MeshStandardMaterial({ map: T.lockerTexture('#2d5c8a'), roughness: 0.45, metalness: 0.4 }),
    clock: new THREE.MeshStandardMaterial({ map: T.clockTexture(), roughness: 0.3 }),
    frond: leafMat(frond),
    foliage: leafMat(foliage),
    pine: leafMat(pine),
    chainLink: new THREE.MeshStandardMaterial({ map: T.chainLinkTexture(), alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.4 }),
    net: new THREE.MeshStandardMaterial({ map: T.netTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }),
  };
  for (const t of [mats.books.map!, mats.lockerBlue.map!]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  addWindSway(mats.frond, 0.18);
  addWindSway(mats.foliage, 0.06);
  addWindSway(mats.pine, 0.05);
  return mats;
}

/** Shared wind uniforms so storms can whip the palms. */
export const wind = { time: { value: 0 }, strength: { value: 1 } };

function addWindSway(m: THREE.MeshStandardMaterial, amount: number) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind.time;
    shader.uniforms.windStrength = wind.strength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;\nuniform float windStrength;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        float sway = sin(windTime * 1.7 + wp.x * 0.35 + wp.z * 0.21) + 0.5 * sin(windTime * 3.1 + wp.z * 0.5);
        transformed.x += sway * ${amount.toFixed(3)} * windStrength * max(transformed.y, 0.0);
        transformed.z += sway * ${(amount * 0.6).toFixed(3)} * windStrength * max(transformed.y, 0.0);`,
      );
  };
}

/** Rotated footprint helper: returns local extents for a w×d prop centred at (u, v). */
function ext(u: number, v: number, w: number, d: number, rot: number): [number, number, number, number] {
  const [hw, hd] = rot % 2 ? [d / 2, w / 2] : [w / 2, d / 2];
  return [u - hw, u + hw, v - hd, v + hd];
}

/** Offsets a point (du along the prop's width, dv along its depth) by rotation. */
function off(u: number, v: number, du: number, dv: number, rot: number): [number, number] {
  const r = ((rot % 4) + 4) % 4;
  const [x, y] = [
    [du, dv],
    [-dv, du],
    [-du, -dv],
    [dv, -du],
  ][r];
  return [u + x, v + y];
}

export function studentDesk(b: Builder, m: Mats, u: number, v: number, rot = 0) {
  const [u0, u1, v0, v1] = ext(u, v, 1.2, 0.6, rot);
  b.box(u0, u1, v0, v1, 0.72, 0.75, m.wood, { tile: 1 });
  for (const [du, dv] of [
    [-0.55, -0.25],
    [0.55, -0.25],
    [-0.55, 0.25],
    [0.55, 0.25],
  ]) {
    const [lu, lv] = off(u, v, du, dv, rot);
    b.box(lu - 0.02, lu + 0.02, lv - 0.02, lv + 0.02, 0, 0.72, m.steel, { tile: 1, cast: false });
  }
  b.world.add({ minX: u0, maxX: u1, minZ: -v1, maxZ: -v0, height: 0.75 });
  // Chair behind the desk.
  const [cu, cv] = off(u, v, 0, -0.55, rot);
  chair(b, m, cu, cv, rot);
}

export function chair(b: Builder, m: Mats, u: number, v: number, rot = 0) {
  const [s0, s1, t0, t1] = ext(u, v, 0.44, 0.42, rot);
  b.box(s0, s1, t0, t1, 0.43, 0.46, m.plasticNavy, { tile: 1 });
  const [bu, bv] = off(u, v, 0, -0.2, rot);
  const [b0, b1, c0, c1] = ext(bu, bv, 0.42, 0.03, rot);
  b.box(b0, b1, c0, c1, 0.5, 0.86, m.plasticNavy, { tile: 1 });
  for (const [du, dv] of [
    [-0.19, -0.18],
    [0.19, -0.18],
    [-0.19, 0.18],
    [0.19, 0.18],
  ]) {
    const [lu, lv] = off(u, v, du, dv, rot);
    b.box(lu - 0.012, lu + 0.012, lv - 0.012, lv + 0.012, 0, 0.43, m.steel, { tile: 1, cast: false });
  }
}

/** Teacher/librarian desk with a modesty panel. Returns the spot to hide under it. */
export function teacherDesk(b: Builder, m: Mats, u: number, v: number, rot = 0): THREE.Vector3 {
  const [u0, u1, v0, v1] = ext(u, v, 1.6, 0.8, rot);
  b.box(u0, u1, v0, v1, 0.72, 0.76, m.wood, { tile: 1 });
  for (const du of [-0.78, 0.78]) {
    const [lu, lv] = off(u, v, du, 0, rot);
    const [a0, a1, c0, c1] = ext(lu, lv, 0.04, 0.78, rot);
    b.box(a0, a1, c0, c1, 0, 0.72, m.wood, { tile: 1 });
  }
  const [pu, pv] = off(u, v, 0, 0.36, rot);
  const [p0, p1, q0, q1] = ext(pu, pv, 1.5, 0.03, rot);
  b.box(p0, p1, q0, q1, 0.15, 0.72, m.wood, { tile: 1 });
  b.world.add({ minX: u0, maxX: u1, minZ: -v1, maxZ: -v0, height: 0.76 });
  return W(u, v, 0.35);
}

export function labBench(b: Builder, m: Mats, u: number, v: number, w: number, d: number, rot = 0) {
  const [u0, u1, v0, v1] = ext(u, v, w, d, rot);
  b.box(u0 + 0.05, u1 - 0.05, v0 + 0.05, v1 - 0.05, 0.1, 0.88, m.whiteGloss, { tile: 1, collide: true });
  b.box(u0 + 0.08, u1 - 0.08, v0 + 0.08, v1 - 0.08, 0, 0.1, m.darkMetal, { tile: 1 });
  b.box(u0, u1, v0, v1, 0.88, 0.92, m.blackTop, { tile: 1 });
  // Gas taps and a sink bowl along the spine.
  for (let i = -1; i <= 1; i++) {
    const [tu, tv] = off(u, v, (i * w) / 3, 0, rot);
    b.box(tu - 0.03, tu + 0.03, tv - 0.03, tv + 0.03, 0.92, 1.1, m.steel, { tile: 1 });
  }
}

export function bookshelf(b: Builder, m: Mats, u: number, v: number, len: number, rot = 0, height = 2.0) {
  const [u0, u1, v0, v1] = ext(u, v, len, 0.45, rot);
  b.box(u0, u1, v0, v1, 0, height, m.wood, { tile: 1, collide: true });
  // Book faces on both long sides.
  const g = metricBox(rot % 2 ? 0.47 : len - 0.06, height - 0.2, rot % 2 ? len - 0.06 : 0.47, 1);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.6);
  g.translate(u, height / 2, -v);
  b.add(g, m.books, false);
}

export function lockers(b: Builder, m: Mats, u: number, v: number, count: number, rot = 0) {
  const len = count * 0.4;
  const [u0, u1, v0, v1] = ext(u, v, len, 0.5, rot);
  const g = metricBox(u1 - u0, 1.9, v1 - v0, 1);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.5, uv.getY(i) * 0.526);
  g.translate((u0 + u1) / 2, 0.95, -(v0 + v1) / 2);
  b.add(g, m.lockerBlue);
  b.world.add({ minX: u0, maxX: u1, minZ: -v1, maxZ: -v0, height: 1.9 });
}

export function table(b: Builder, m: Mats, u: number, v: number, w: number, d: number, top: THREE.Material = m.wood, h = 0.74) {
  b.box(u - w / 2, u + w / 2, v - d / 2, v + d / 2, h - 0.04, h, top, { tile: 1 });
  for (const [du, dv] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const lu = u + du * (w / 2 - 0.06);
    const lv = v + dv * (d / 2 - 0.06);
    b.box(lu - 0.03, lu + 0.03, lv - 0.03, lv + 0.03, 0, h - 0.04, m.steel, { tile: 1, cast: false });
  }
  b.world.add({ minX: u - w / 2, maxX: u + w / 2, minZ: -(v + d / 2), maxZ: -(v - d / 2), height: h });
}

/** A textured panel on a wall (whiteboard, noticeboard, poster). Kept separate so its texture can change. */
export function wallPanel(
  root: THREE.Object3D,
  axis: 'u' | 'v',
  fixed: number,
  at: number,
  facing: 1 | -1,
  w: number,
  h: number,
  y: number,
  mat: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const off = 0.12 * facing;
  if (axis === 'v') {
    mesh.position.copy(W(at, fixed + off, y));
    mesh.rotation.y = facing > 0 ? Math.PI : 0;
  } else {
    mesh.position.copy(W(fixed + off, at, y));
    mesh.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

/** Recessed ceiling LED panels on a grid, registered as light fixtures. */
export function ceilingLights(b: Builder, lights: LightPool, u0: number, u1: number, v0: number, v1: number, y: number, spacing = 3.2, intensity = 6) {
  const nu = Math.max(1, Math.round((u1 - u0) / spacing));
  const nv = Math.max(1, Math.round((v1 - v0) / spacing));
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const u = u0 + ((i + 0.5) * (u1 - u0)) / nu;
      const v = v0 + ((j + 0.5) * (v1 - v0)) / nv;
      b.box(u - 0.3, u + 0.3, v - 0.3, v + 0.3, y - 0.02, y, lights.glow.interior, { tile: 1, cast: false });
      lights.add({ pos: W(u, v, y - 0.3), color: new THREE.Color(0xfff4e6), intensity, group: 'interior' });
    }
  }
}

export function exitSign(b: Builder, m: Mats, u: number, v: number, y: number, rot = 0) {
  const [u0, u1, v0, v1] = ext(u, v, 0.4, 0.06, rot);
  b.box(u0, u1, v0, v1, y, y + 0.16, m.exitSign, { tile: 1, cast: false });
}

export function palm(b: Builder, m: Mats, u: number, v: number, height = 7 + T.rand() * 4) {
  const lean = (T.rand() - 0.5) * 0.4;
  const dir = T.rand() * Math.PI * 2;
  const segs = 8;
  let x = u;
  let z = -v;
  let top = new THREE.Vector3();
  for (let i = 0; i < segs; i++) {
    const y0 = (i / segs) * height;
    const y1 = ((i + 1) / segs) * height;
    const bend = lean * Math.pow(i / segs, 2);
    const nx = u + Math.cos(dir) * bend * height;
    const nz = -v + Math.sin(dir) * bend * height;
    const r = 0.22 - i * 0.012;
    const g = new THREE.CylinderGeometry(r * 0.92, r, y1 - y0, 10, 1, true);
    const mid = new THREE.Vector3((x + nx) / 2, (y0 + y1) / 2, (z + nz) / 2);
    const axis = new THREE.Vector3(nx - x, y1 - y0, nz - z).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    b.addTransformed(g, m.bark, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    x = nx;
    z = nz;
    top = new THREE.Vector3(nx, y1, nz);
  }
  const frond = new THREE.PlaneGeometry(1.1, 4.2, 1, 6);
  // Bend fronds downward along their length.
  const p = frond.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + 2.1) / 4.2;
    p.setZ(i, -t * t * 1.6);
  }
  frond.translate(0, 2.1, 0);
  frond.rotateX(-Math.PI / 2 + 0.5);
  for (let k = 0; k < 11; k++) {
    const yaw = (k / 11) * Math.PI * 2 + T.rand() * 0.3;
    const pitch = (T.rand() - 0.3) * 0.5;
    const mtx = new THREE.Matrix4().compose(
      top,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    b.addTransformed(frond, m.frond, mtx);
  }
}

export function shrub(b: Builder, m: Mats, u: number, v: number, r = 1) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.9 + T.rand() * 0.3), p.getY(i) * 0.7, p.getZ(i) * (0.9 + T.rand() * 0.3));
  g.computeVertexNormals();
  g.translate(u, r * 0.6, -v);
  b.add(g, m.foliage);
}

/** Instanced Caribbean pines for the surrounding forest. */
export function pineForest(scene: THREE.Object3D, m: Mats, spots: [number, number][]) {
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1, 6);
  trunk.translate(0, 0.5, 0);
  const crown = new THREE.IcosahedronGeometry(1, 0);
  const tm = new THREE.InstancedMesh(trunk, m.pineBark, spots.length);
  const cm = new THREE.InstancedMesh(crown, m.pine, spots.length * 3);
  const mtx = new THREE.Matrix4();
  spots.forEach(([u, v], i) => {
    const h = 9 + T.rand() * 9;
    mtx.compose(W(u, v), new THREE.Quaternion(), new THREE.Vector3(1, h, 1));
    tm.setMatrixAt(i, mtx);
    for (let k = 0; k < 3; k++) {
      const s = 1.6 + T.rand() * 1.6;
      mtx.compose(
        W(u + (T.rand() - 0.5) * 1.5, v + (T.rand() - 0.5) * 1.5, h - k * 1.6 + 0.4),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(T.rand(), T.rand() * 6, 0)),
        new THREE.Vector3(s, s * 0.7, s),
      );
      cm.setMatrixAt(i * 3 + k, mtx);
    }
  });
  tm.castShadow = cm.castShadow = true;
  tm.receiveShadow = cm.receiveShadow = true;
  scene.add(tm, cm);
}

/** Chain-link fence panel run between two local points (posts every ~3 m). */
export function fence(b: Builder, m: Mats, a: [number, number], c: [number, number], height = 2.4, collide = true) {
  const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const g = new THREE.PlaneGeometry(len, height);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 0.6, (uv.getY(i) * height) / 0.6);
  const ang = Math.atan2(-(c[1] - a[1]), c[0] - a[0]);
  b.addTransformed(
    g,
    m.chainLink,
    new THREE.Matrix4().compose(
      W((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, height / 2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0)),
      new THREE.Vector3(1, 1, 1),
    ),
    false,
  );
  const posts = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= posts; i++) {
    const u = a[0] + ((c[0] - a[0]) * i) / posts;
    const v = a[1] + ((c[1] - a[1]) * i) / posts;
    b.box(u - 0.035, u + 0.035, v - 0.035, v + 0.035, 0, height + 0.05, m.steel, { tile: 1 });
  }
  if (collide) {
    b.world.add({
      minX: Math.min(a[0], c[0]) - 0.05,
      maxX: Math.max(a[0], c[0]) + 0.05,
      minZ: -Math.max(a[1], c[1]) - 0.05,
      maxZ: -Math.min(a[1], c[1]) + 0.05,
      height,
    });
  }
}

export function streetLamp(b: Builder, m: Mats, lights: LightPool, u: number, v: number) {
  b.box(u - 0.06, u + 0.06, v - 0.06, v + 0.06, 0, 5.5, m.darkMetal, { tile: 1, collide: true });
  b.box(u - 0.25, u + 0.25, v - 0.12, v + 0.12, 5.4, 5.55, m.darkMetal, { tile: 1 });
  b.box(u - 0.2, u + 0.2, v - 0.09, v + 0.09, 5.37, 5.4, lights.glow.street, { tile: 1, cast: false });
  lights.add({ pos: W(u, v, 5.2), color: new THREE.Color(0xffc98a), intensity: 60, group: 'street' });
}
