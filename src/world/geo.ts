// Geometry helpers for the baked OpenStreetMap campus (data/campus.json).
// campus.json stores x = metres east, y = metres north of REF.
// The campus is built on a grid rotated ~45° from north, so the game works in a
// "local" frame (u, v) where every building edge is axis-aligned. In Three.js,
// world X = u and world Z = -v.

export type Vec2 = [number, number];

export type FeatureKind = 'building' | 'pool' | 'pitch' | 'track' | 'road' | 'parking' | 'forest';

export interface CampusFeature {
  id: number;
  kind: FeatureKind;
  role: string | null;
  closed: boolean;
  tags: Record<string, string>;
  points: Vec2[];
}

export interface CampusData {
  attribution: string;
  ref: { lat: number; lon: number };
  bbox: number[];
  fetched: string | null;
  features: CampusFeature[];
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;

/** Equirectangular projection to metres around `ref` (matches tools/fetch-osm.mjs). */
export function project(lat: number, lon: number, ref: { lat: number; lon: number }): Vec2 {
  return [(lon - ref.lon) * M_PER_DEG_LON * Math.cos((ref.lat * Math.PI) / 180), (lat - ref.lat) * M_PER_DEG_LAT];
}

export function polygonArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function centroid(pts: Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

export function bounds(pts: Vec2[]): Bounds {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const [x, y] of pts) {
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y);
    b.maxY = Math.max(b.maxY, y);
  }
  return b;
}

export function pointInPolygon([x, y]: Vec2, pts: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function rotate([x, y]: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c];
}

/** Angle of a polygon's first edge; used to find the campus grid rotation. */
export function edgeAngle(pts: Vec2[]): number {
  return Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
}

/** Converts campus.json metres to the axis-aligned local frame. */
export function toLocal(p: Vec2, gridAngle: number): Vec2 {
  return rotate(p, -gridAngle);
}

export function featureByRole(data: CampusData, role: string): CampusFeature {
  const f = data.features.find((x) => x.role === role);
  if (!f) throw new Error(`campus.json has no feature with role "${role}"`);
  return f;
}

/** The campus grid angle, taken from the Academic Block's first wall. */
export function campusGridAngle(data: CampusData): number {
  return edgeAngle(featureByRole(data, 'academic').points);
}
