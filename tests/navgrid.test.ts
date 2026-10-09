import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../src/world/collision';
import { NavGrid } from '../src/world/navgrid';

function wallWithGap() {
  // A wall along x = 5 from z = 0..10 with a 2 m gap at z = 8..10.
  const w = new CollisionWorld();
  w.add({ minX: 4.8, maxX: 5.2, minZ: -3, maxZ: 8, height: 3 });
  return w;
}

describe('NavGrid', () => {
  it('routes around a wall through the gap', () => {
    const w = wallWithGap();
    const nav = new NavGrid(0, -2, 10, 12, 0.5, w, 0.3);
    const path = nav.findPath(1, 1, 9, 1)!;
    expect(path).not.toBeNull();
    expect(Math.max(...path.map((p) => p[1]))).toBeGreaterThan(8);
    for (const [x, z] of path) expect(w.blocked(x, z)).toBe(false);
  });

  it('returns null when the goal is sealed off', () => {
    const w = new CollisionWorld();
    w.add({ minX: 6, maxX: 6.5, minZ: -10, maxZ: 20, height: 3 });
    const nav = new NavGrid(0, 0, 10, 10, 0.5, w, 0.3);
    expect(nav.findPath(1, 5, 9, 5)).toBeNull();
  });
});

describe('CollisionWorld', () => {
  it('pushes a circle out of a box and blocks line of sight', () => {
    const w = wallWithGap();
    const [x] = w.resolveCircle(4.9, 3, 0.3);
    expect(x).toBeLessThanOrEqual(4.5 + 1e-6);
    expect(w.lineOfSight(1, 3, 9, 3)).toBe(false);
    expect(w.lineOfSight(1, 9, 9, 9)).toBe(true);
  });
});
