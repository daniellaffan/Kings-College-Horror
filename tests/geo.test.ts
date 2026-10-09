import { describe, expect, it } from 'vitest';
import campus from '../data/campus.json';
import { bounds, campusGridAngle, featureByRole, pointInPolygon, polygonArea, project, toLocal, type CampusData, type Vec2 } from '../src/world/geo';

const data = campus as unknown as CampusData;

describe('projection', () => {
  it('maps the reference point to the origin and 0.001° lat to ~110 m', () => {
    expect(project(data.ref.lat, data.ref.lon, data.ref)).toEqual([0, 0]);
    const [, y] = project(data.ref.lat + 0.001, data.ref.lon, data.ref);
    expect(y).toBeCloseTo(110.54, 1);
  });
});

describe('baked campus', () => {
  it('has the 25 m pool (about 500 m²)', () => {
    const pool = data.features.find((f) => f.id === 1492740459)!;
    expect(polygonArea(pool.points)).toBeGreaterThan(450);
    expect(polygonArea(pool.points)).toBeLessThan(560);
  });

  it('has the full-size football pitch (~99 m bounding box)', () => {
    const b = bounds(data.features.find((f) => f.id === 1492740458)!.points);
    expect(b.maxX - b.minX).toBeGreaterThan(95);
    expect(b.maxX - b.minX).toBeLessThan(103);
  });

  it('has all four campus buildings with roles', () => {
    for (const role of ['academic', 'arts', 'dining', 'plant']) expect(featureByRole(data, role).kind).toBe('building');
  });

  it('makes every campus building rectilinear in the local frame', () => {
    const angle = campusGridAngle(data);
    for (const role of ['academic', 'arts', 'dining', 'plant']) {
      const pts = featureByRole(data, role).points.map((p) => toLocal(p, angle));
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) return; // skip mapping slivers
        const deg = (Math.atan2(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0])) * 180) / Math.PI;
        expect(Math.min(deg, 90 - deg), `${role} edge ${i}`).toBeLessThan(2);
      });
    }
  });
});

describe('pointInPolygon', () => {
  const sq: Vec2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  it('distinguishes inside from outside', () => {
    expect(pointInPolygon([5, 5], sq)).toBe(true);
    expect(pointInPolygon([15, 5], sq)).toBe(false);
  });
});
