import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { polygonGeometry } from '../src/world/builder';
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
