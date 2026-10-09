// Static-geometry builder. Everything is authored in the campus local frame (u, v),
// metres, with world X = u and world Z = -v. Static meshes are merged per material
// on finalize() so the whole campus renders in a few dozen draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Box, CollisionWorld } from './collision';
import type { Vec2 } from './geo';

/** Local (u, v) + height → world position. */
export const W = (u: number, v: number, y = 0) => new THREE.Vector3(u, y, -v);

/** BoxGeometry whose UVs are in metres / tile, so tiling textures keep real-world scale. */
export function metricBox(w: number, h: number, d: number, tile = 2): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
  }
  return g;
}

/** Flat polygon in the local frame at height y, facing up (or down). UVs in metres / tile. */
export function polygonGeometry(pts: Vec2[], y: number, tile = 2, faceDown = false): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  const g = new THREE.ShapeGeometry(shape);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  // Shape lies in XY with y = v; rotate so that it lies in XZ with Z = -v.
  g.rotateX(-Math.PI / 2);
  if (faceDown) {
    // Reverse the winding (a mirror transform would flip it straight back) and point normals down.
    const index = g.index!;
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      index.setX(i, index.getX(i + 2));
      index.setX(i + 2, a);
    }
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, -1, 0);
  }
  g.translate(0, y, 0);
  return g;
}

/** A flat ribbon along a polyline (roads, paths). V runs along the length in metres / tile. */
export function ribbonGeometry(pts: Vec2[], width: number, y: number, tile = 4): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy * (width / 2);
    const ny = dx * (width / 2);
    if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const [u, v] = pts[i];
    pos.push(u + nx, y, -(v + ny), u - nx, y, -(v - ny));
    uvs.push(0, dist / tile, width / tile, dist / tile);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Ensure the ribbon faces up regardless of polyline winding.
  const n = g.getAttribute('normal');
  if (n.count && n.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

export interface Opening {
  /** Centre position along the wall (u for walls along u, v for walls along v). */
  at: number;
  width: number;
  /** Bottom of the opening: 0 for doors, ~0.9 for windows. */
  bottom?: number;
  /** Top of the opening: ~2.2 for doors, ~2.5 for windows. */
  top?: number;
  /** Windows get glass + frame and block movement; doors are open. */
  glass?: boolean;
  /** Opaque tinted glass (upper storeys we never enter). */
  dark?: boolean;
}

export interface WallOptions {
  thickness?: number;
  height: number;
  y0?: number;
  inner: THREE.Material;
  /** Material for the outer skin (exterior walls); the side is given by outerSide. */
  outer?: THREE.Material;
  /** +1: the outside faces +u (or +v), -1: faces -u (or -v). */
  outerSide?: 1 | -1;
  openings?: Opening[];
  tile?: number;
  skirting?: boolean;
  tag?: string;
}

interface Batch {
  geos: THREE.BufferGeometry[];
  cast: boolean;
}

export class Builder {
  readonly root = new THREE.Group();
  private batches = new Map<THREE.Material, Batch>();
  readonly glass: THREE.MeshPhysicalMaterial;
  readonly darkGlass: THREE.MeshStandardMaterial;
  readonly frame: THREE.MeshStandardMaterial;
  readonly skirtingMat: THREE.MeshStandardMaterial;

  constructor(readonly world: CollisionWorld) {
    this.glass = new THREE.MeshPhysicalMaterial({
      color: 0x9fb8c0,
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.22,
      envMapIntensity: 1.6,
      depthWrite: false,
    });
    this.darkGlass = new THREE.MeshStandardMaterial({ color: 0x0d1418, roughness: 0.05, metalness: 0.2, envMapIntensity: 1.4 });
    this.frame = new THREE.MeshStandardMaterial({ color: 0xc9ccce, roughness: 0.35, metalness: 0.8 });
    this.skirtingMat = new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.6 });
  }

  /** Adds a geometry (already in world space) to the merge batch for a material. */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true) {
    let b = this.batches.get(mat);
    if (!b) this.batches.set(mat, (b = { geos: [], cast }));
    b.geos.push(geo);
  }

  /** Adds a geometry transformed by a matrix. */
  addTransformed(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4, cast = true) {
    this.add(geo.clone().applyMatrix4(m), mat, cast);
  }

  /** Axis-aligned box from local extents. Returns its collider if `collide` is set. */
  box(
    u0: number,
    u1: number,
    v0: number,
    v1: number,
    y0: number,
    y1: number,
    mat: THREE.Material,
    opts: { collide?: boolean; tile?: number; cast?: boolean; tag?: string } = {},
  ): Box | undefined {
    const w = Math.abs(u1 - u0);
    const d = Math.abs(v1 - v0);
    const h = y1 - y0;
    if (w < 1e-4 || d < 1e-4 || h < 1e-4) return undefined;
    const g = metricBox(w, h, d, opts.tile ?? 2);
    g.translate((u0 + u1) / 2, (y0 + y1) / 2, -(v0 + v1) / 2);
    this.add(g, mat, opts.cast ?? true);
    if (!opts.collide) return undefined;
    return this.world.add({
      minX: Math.min(u0, u1),
      maxX: Math.max(u0, u1),
      minZ: -Math.max(v0, v1),
      maxZ: -Math.min(v0, v1),
      height: y1,
      tag: opts.tag,
    });
  }

  /** Floor (faces up) or ceiling (faces down) rectangle. */
  slab(u0: number, u1: number, v0: number, v1: number, y: number, mat: THREE.Material, tile = 2, faceDown = false) {
    const pts: Vec2[] = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    this.add(polygonGeometry(pts, y, tile, faceDown), mat, false);
  }

  /**
   * Axis-aligned wall on the line `axis = fixed`, spanning `from..to` along the other axis,
   * with door and window openings. Exterior walls get an outer skin in a different material.
   */
  wall(axis: 'u' | 'v', fixed: number, from: number, to: number, o: WallOptions) {
    const t = o.thickness ?? 0.2;
    const y0 = o.y0 ?? 0;
    const H = o.height;
    const tile = o.tile ?? 2;
    const [a, b] = from < to ? [from, to] : [to, from];
    const ops = [...(o.openings ?? [])].sort((p, q) => p.at - q.at);

    const rects: { s0: number; s1: number; y0: number; y1: number; solid: boolean }[] = [];
    let cursor = a;
    for (const op of ops) {
      const s0 = op.at - op.width / 2;
      const s1 = op.at + op.width / 2;
      const bottom = op.bottom ?? 0;
      const top = op.top ?? (op.glass ? 2.5 : 2.2);
      rects.push({ s0: cursor, s1: s0, y0, y1: y0 + H, solid: true });
      if (bottom > 0) rects.push({ s0, s1, y0, y1: y0 + bottom, solid: true });
      rects.push({ s0, s1, y0: y0 + top, y1: y0 + H, solid: false });
      if (op.glass) {
        this.pane(axis, fixed, s0, s1, y0 + bottom, y0 + top, t, op.dark);
      } else {
        this.doorFrame(axis, fixed, s0, s1, y0, y0 + top, t);
      }
      // Windows block movement; doors don't.
      // Upper storeys sit on the ground wall; their colliders would seal the doorways below.
      if (op.glass && y0 === 0) this.collider(axis, fixed, s0, s1, t, y0 + top, o.tag);
      cursor = s1;
    }
    rects.push({ s0: cursor, s1: b, y0, y1: y0 + H, solid: true });

    for (const r of rects) {
      if (r.s1 - r.s0 < 1e-3) continue;
      if (o.outer && o.outerSide) {
        const skin = 0.06;
        const outerOff = o.outerSide * (t / 2 - skin / 2);
        const innerOff = -o.outerSide * (skin / 2);
        this.wallBox(axis, fixed + outerOff, r.s0, r.s1, r.y0, r.y1, skin, o.outer, tile);
        this.wallBox(axis, fixed + innerOff, r.s0, r.s1, r.y0, r.y1, t - skin, o.inner, tile);
      } else {
        this.wallBox(axis, fixed, r.s0, r.s1, r.y0, r.y1, t, o.inner, tile);
      }
      if (y0 === 0 && r.solid && r.y0 === y0 && r.y1 - r.y0 > 1.5) this.collider(axis, fixed, r.s0, r.s1, t, r.y1, o.tag);
      if (o.skirting && r.y0 === y0 && r.y1 - r.y0 > 1.5) {
        for (const side of o.outer && o.outerSide ? [-o.outerSide] : [1, -1]) {
          this.wallBox(axis, fixed + side * (t / 2 + 0.005), r.s0, r.s1, y0, y0 + 0.1, 0.012, this.skirtingMat, 1);
        }
      }
    }
  }

  private wallBox(axis: 'u' | 'v', fixed: number, s0: number, s1: number, y0: number, y1: number, t: number, mat: THREE.Material, tile: number) {
    if (axis === 'v') this.box(s0, s1, fixed - t / 2, fixed + t / 2, y0, y1, mat, { tile });
    else this.box(fixed - t / 2, fixed + t / 2, s0, s1, y0, y1, mat, { tile });
  }

  private collider(axis: 'u' | 'v', fixed: number, s0: number, s1: number, t: number, height: number, tag?: string) {
    const [u0, u1, v0, v1] = axis === 'v' ? [s0, s1, fixed - t / 2, fixed + t / 2] : [fixed - t / 2, fixed + t / 2, s0, s1];
    this.world.add({ minX: u0, maxX: u1, minZ: -v1, maxZ: -v0, height, tag });
  }

  /** Glass pane with an aluminium frame. */
  private pane(axis: 'u' | 'v', fixed: number, s0: number, s1: number, y0: number, y1: number, t: number, dark = false) {
    const f = 0.05;
    const glassT = 0.012;
    const g =
      axis === 'v'
        ? metricBox(s1 - s0, y1 - y0, glassT).translate((s0 + s1) / 2, (y0 + y1) / 2, -fixed)
        : metricBox(glassT, y1 - y0, s1 - s0).translate(fixed, (y0 + y1) / 2, -(s0 + s1) / 2);
    this.add(g, dark ? this.darkGlass : this.glass, false);
    const ft = Math.min(t, 0.12);
    this.wallBox(axis, fixed, s0, s1, y0, y0 + f, ft, this.frame, 1);
    this.wallBox(axis, fixed, s0, s1, y1 - f, y1, ft, this.frame, 1);
    this.wallBox(axis, fixed, s0, s0 + f, y0, y1, ft, this.frame, 1);
    this.wallBox(axis, fixed, s1 - f, s1, y0, y1, ft, this.frame, 1);
    // Mullions every ~1.5 m.
    const n = Math.floor((s1 - s0) / 1.5);
    for (let i = 1; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / (n + 1);
      this.wallBox(axis, fixed, s - 0.025, s + 0.025, y0, y1, ft, this.frame, 1);
    }
  }

  private doorFrame(axis: 'u' | 'v', fixed: number, s0: number, s1: number, y0: number, y1: number, t: number) {
    const f = 0.06;
    const ft = t + 0.04;
    this.wallBox(axis, fixed, s0 - f, s0, y0, y1 + f, ft, this.skirtingMat, 1);
    this.wallBox(axis, fixed, s1, s1 + f, y0, y1 + f, ft, this.skirtingMat, 1);
    this.wallBox(axis, fixed, s0 - f, s1 + f, y1, y1 + f, ft, this.skirtingMat, 1);
  }

  /** Merges every batch into one mesh per material and attaches them to root. */
  finalize(): THREE.Group {
    for (const [mat, b] of this.batches) {
      // Group geometries by attribute layout so mergeGeometries can combine them.
      const groups = new Map<string, THREE.BufferGeometry[]>();
      for (const geo of b.geos) {
        const key = Object.keys(geo.attributes).sort().join(',') + (geo.index ? '|i' : '|n');
        let list = groups.get(key);
        if (!list) groups.set(key, (list = []));
        list.push(geo);
      }
      for (const list of groups.values()) {
        const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = b.cast && !(mat as THREE.MeshPhysicalMaterial).transparent;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.root.add(mesh);
      }
    }
    this.batches.clear();
    return this.root;
  }
}
