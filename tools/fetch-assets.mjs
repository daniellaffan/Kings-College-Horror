// Downloads the CC0 Poly Haven textures and HDRIs listed in data/assets.json into public/assets/ph/.
// Usage: node tools/fetch-assets.mjs [--res 1k|2k]
// If Node's fetch can't reach the network behind a proxy, run with NODE_USE_ENV_PROXY=1.
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../data/assets.json', import.meta.url), 'utf8'));
const res = process.argv.includes('--res') ? process.argv[process.argv.indexOf('--res') + 1] : '1k';
const outDir = new URL('../public/assets/ph/', import.meta.url);
const MAPS = { Diffuse: 'diff', nor_gl: 'nor', arm: 'arm' };

async function get(url, kind, tries = 5) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'hollow-tide-game/0.1' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return kind === 'json' ? r.json() : Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i >= tries) throw new Error(`${url}: ${e.cause?.code ?? e.message}`);
      await new Promise((ok) => setTimeout(ok, 1500 * i));
    }
  }
}

async function save(url, file) {
  if (existsSync(file)) return false;
  writeFileSync(file, await get(url, 'bin'));
  return true;
}

mkdirSync(new URL('hdri/', outDir), { recursive: true });
for (const id of Object.values(manifest.hdri)) {
  const files = await get(`https://api.polyhaven.com/files/${id}`, 'json');
  const fresh = await save(files.hdri[res].hdr.url, new URL(`hdri/${id}.hdr`, outDir));
  console.log(fresh ? 'got' : 'have', 'hdri', id);
}
for (const id of Object.values(manifest.materials)) {
  const files = await get(`https://api.polyhaven.com/files/${id}`, 'json');
  mkdirSync(new URL(`${id}/`, outDir), { recursive: true });
  for (const [key, short] of Object.entries(MAPS)) {
    const fresh = await save(files[key][res].jpg.url, new URL(`${id}/${short}.jpg`, outDir));
    console.log(fresh ? 'got' : 'have', id, short);
  }
}
console.log('done');
