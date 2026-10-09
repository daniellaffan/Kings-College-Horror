// Fetches the campus area from OpenStreetMap (Overpass) and bakes it to data/campus.json.
// Coordinates are projected to local metres around REF: x = east, y = north.
// Data © OpenStreetMap contributors, ODbL.
import { readFileSync, writeFileSync } from 'node:fs';

const REF = { lat: 25.0225, lon: -77.5175 };
const BBOX = [25.0195, -77.5205, 25.0255, -77.5135];

// Roles for the campus buildings (see plan research table).
const ROLES = {
  1492740447: 'academic',
  1492740446: 'arts',
  1492740443: 'dining',
  1492740449: 'plant',
};

export function project(lat, lon) {
  return [
    (lon - REF.lon) * 111320 * Math.cos((REF.lat * Math.PI) / 180),
    (lat - REF.lat) * 110540,
  ];
}

function classify(tags) {
  if (tags.leisure === 'swimming_pool') return 'pool';
  if (tags.leisure === 'track') return 'track';
  if (tags.leisure === 'pitch') return 'pitch';
  if (tags.building) return 'building';
  if (tags.amenity === 'parking') return 'parking';
  if (tags.landuse === 'forest' || tags.natural === 'wood') return 'forest';
  if (tags.highway) return 'road';
  return null;
}

const b = BBOX.join(',');
const query = `[out:json][timeout:60];(way["building"](${b});way["leisure"](${b});way["highway"](${b});way["amenity"="parking"](${b});way["landuse"](${b});way["natural"](${b}););out geom tags;`;

async function overpass(q, tries = 4) {
  for (let i = 1; ; i++) {
    let err;
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'User-Agent': 'hollow-tide-game/0.1', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
      });
      if (res.ok) return res.json();
      err = `HTTP ${res.status}`;
    } catch (e) {
      err = e.cause?.code ?? e.message;
    }
    if (i >= tries) throw new Error(`Overpass failed: ${err}. Save the response yourself and pass its path (see README).`);
    console.warn(`Overpass ${err}, retrying (${i}/${tries})`);
    await new Promise((r) => setTimeout(r, 5000 * i));
  }
}
// Usage: node tools/fetch-osm.mjs [saved-overpass-response.json]
// With no argument the query is sent to Overpass; with a path, that saved response is used instead.
// The saved file may be Overpass JSON or OSM API XML, e.g.:
//   curl 'https://api.openstreetmap.org/api/0.6/map?bbox=-77.5205,25.0195,-77.5135,25.0255' -o campus.osm
const saved = process.argv[2];
if (process.argv.includes('--print-query')) {
  console.log(query);
  process.exit(0);
}
// Converts an OSM API XML response (/api/0.6/map) into Overpass-style `out geom` elements.
function fromOsmXml(xml) {
  const attrs = (str) => Object.fromEntries([...str.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const nodes = new Map();
  for (const m of xml.matchAll(/<node ([^>]*?)\/?>/g)) {
    const a = attrs(m[1]);
    nodes.set(a.id, { lat: +a.lat, lon: +a.lon });
  }
  const elements = [];
  for (const m of xml.matchAll(/<way ([^>]*)>([\s\S]*?)<\/way>/g)) {
    const refs = [...m[2].matchAll(/<nd ref="(\d+)"/g)].map((r) => r[1]);
    const tags = Object.fromEntries([...m[2].matchAll(/<tag k="([^"]*)" v="([^"]*)"/g)].map((t) => [t[1], t[2]]));
    if (!refs.every((r) => nodes.has(r))) continue;
    elements.push({ type: 'way', id: +attrs(m[1]).id, nodes: refs.map(Number), tags, geometry: refs.map((r) => nodes.get(r)) });
  }
  return { elements };
}

function load(path) {
  const text = readFileSync(path, 'utf8');
  return text.trimStart().startsWith('<') ? fromOsmXml(text) : JSON.parse(text);
}

const osm = saved ? load(saved) : await overpass(query);

const features = [];
for (const el of osm.elements) {
  const tags = el.tags ?? {};
  const kind = classify(tags);
  if (!kind || !el.geometry) continue;
  if (kind === 'road' && !['primary', 'secondary', 'tertiary', 'residential', 'service', 'footway', 'track'].includes(tags.highway)) continue;
  const pts = el.geometry.map((p) => project(p.lat, p.lon).map((v) => Math.round(v * 100) / 100));
  const closed = el.nodes && el.nodes[0] === el.nodes[el.nodes.length - 1];
  if (closed) pts.pop();
  features.push({
    id: el.id,
    kind,
    role: ROLES[el.id] ?? null,
    closed: !!closed,
    tags: Object.fromEntries(Object.entries(tags).filter(([k]) => ['name', 'sport', 'highway', 'building', 'surface', 'leisure'].includes(k))),
    points: pts,
  });
}

const out = {
  attribution: 'Map data © OpenStreetMap contributors, ODbL. https://www.openstreetmap.org/copyright',
  ref: REF,
  bbox: BBOX,
  fetched: osm.osm3s?.timestamp_osm_base ?? new Date().toISOString(),
  features,
};
writeFileSync(new URL('../data/campus.json', import.meta.url), JSON.stringify(out));
console.log(`Wrote ${features.length} features`, Object.entries(features.reduce((a, f) => ((a[f.kind] = (a[f.kind] ?? 0) + 1), a), {})));
