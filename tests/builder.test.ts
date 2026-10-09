import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Builder, polygonGeometry } from '../src/world/builder';
import { CollisionWorld } from '../src/world/collision';
import type { Vec2 } from '../src/world/geo';

const L: Vec2[] = [
  [0, 0],
  [10, 0],
  [10, 4],
  [4, 4],
  [4, 9],
  [0, 9],
];

/** Y component of every triangle's winding normal (what back-face culling uses). */
function windingY(g: THREE.BufferGeometry): number[] {
  const pos = g.getAttribute('position');
  const idx = g.index!;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const out: number[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(pos, idx.getX(i));
    b.fromBufferAttribute(pos, idx.getX(i + 1));
    c.fromBufferAttribute(pos, idx.getX(i + 2));
    out.push(b.sub(a).cross(c.sub(a)).y);
  }
  return out;
}

describe('polygonGeometry', () => {
  it('floors face up', () => {
    expect(windingY(polygonGeometry(L, 0)).every((y) => y > 0)).toBe(true);
  });

  it('ceilings face down (winding and normals), so they are visible from below', () => {
    const g = polygonGeometry(L, 3.2, 2, true);
    expect(windingY(g).every((y) => y < 0)).toBe(true);
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBe(-1);
    // Same footprint and height as the floor version: world Z = -v.
    g.computeBoundingBox();
    expect(g.boundingBox!.min.z).toBeCloseTo(-9);
    expect(g.boundingBox!.max.z).toBeCloseTo(0);
    expect(g.boundingBox!.min.y).toBeCloseTo(3.2);
  });
});

describe('Builder.wall', () => {
  it('keeps a doorway walkable when an upper storey wall sits above it', () => {
    const world = new CollisionWorld();
    const b = new Builder(world);
    const mat = new THREE.MeshBasicMaterial();
    const common = { height: 3.8, inner: mat, outer: mat, outerSide: 1 as const, thickness: 0.3 };
    b.wall('v', 0, 0, 10, { ...common, openings: [{ at: 5, width: 2.4, top: 2.3 }] });
    b.wall('v', 0, 0, 10, { ...common, y0: 3.8, openings: [{ at: 5, width: 2, bottom: 0.9, top: 2.6, glass: true }] });
    expect(world.blocked(5, 0, 0.3)).toBe(false);
    expect(world.blocked(2, 0, 0.3)).toBe(true);
  });
});
