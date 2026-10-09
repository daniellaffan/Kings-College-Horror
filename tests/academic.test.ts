import { describe, expect, it } from 'vitest';
import campus from '../data/campus.json';
import { ACADEMIC_OUTLINE, ROOMS } from '../src/world/academic';
import { campusGridAngle, featureByRole, pointInPolygon, toLocal, type CampusData, type Vec2 } from '../src/world/geo';

const data = campus as unknown as CampusData;
const angle = campusGridAngle(data);
const osm = featureByRole(data, 'academic').points.map((p) => toLocal(p, angle));

const nearest = (p: Vec2, pts: Vec2[]) => Math.min(...pts.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
const segDist = (p: Vec2, a: Vec2, b: Vec2) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const toOutline = (p: Vec2, pts: Vec2[]) => Math.min(...pts.map((a, i) => segDist(p, a, pts[(i + 1) % pts.length])));

describe('Academic Block', () => {
  it('hand-authored outline matches the OSM footprint within 0.6 m', () => {
    for (const p of ACADEMIC_OUTLINE) expect(nearest(p, osm)).toBeLessThan(0.6);
    // Every OSM node (including collinear mid-wall nodes) lies on the outline.
    for (const p of osm) expect(toOutline(p, ACADEMIC_OUTLINE)).toBeLessThan(0.6);
  });

  it('every room centre lies inside the footprint', () => {
    for (const r of ROOMS) expect(pointInPolygon([(r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2], ACADEMIC_OUTLINE)).toBe(true);
  });
});
