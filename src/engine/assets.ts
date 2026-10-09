// Loads the Poly Haven PBR texture sets and HDRIs listed in data/assets.json
// (downloaded by `npm run fetch-assets`). Anything missing falls back to flat colour,
// so the game still runs without the downloads.
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import manifest from '../../data/assets.json';

export type MaterialKey = keyof typeof manifest.materials;
export type SkyKey = keyof typeof manifest.hdri;

const BASE = `${import.meta.env.BASE_URL}assets/ph/`;

interface TextureSet {
  diff?: THREE.Texture;
  nor?: THREE.Texture;
  arm?: THREE.Texture;
}

export interface Sky {
  background: THREE.Texture;
  environment: THREE.Texture;
}

export interface MaterialOptions {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  /** Skip the texture's AO/roughness/metal packing (e.g. for tinted surfaces). */
  noArm?: boolean;
}

class AssetStore {
  private sets = new Map<MaterialKey, TextureSet>();
  private skies = new Map<SkyKey, Sky>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  anisotropy = 8;
  missing: string[] = [];

  async preload(gl: THREE.WebGLRenderer, onProgress: (f: number) => void) {
    const tl = new THREE.TextureLoader();
    const rgbe = new RGBELoader();
    const pmrem = new THREE.PMREMGenerator(gl);
    const jobs: (() => Promise<void>)[] = [];
    for (const [key, id] of Object.entries(manifest.materials) as [MaterialKey, string][]) {
      const set: TextureSet = {};
      this.sets.set(key, set);
      for (const map of ['diff', 'nor', 'arm'] as const) {
        jobs.push(async () => {
          try {
            const t = await tl.loadAsync(`${BASE}${id}/${map}.jpg`);
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.anisotropy = this.anisotropy;
            if (map === 'diff') t.colorSpace = THREE.SRGBColorSpace;
            set[map] = t;
          } catch {
            this.missing.push(`${id}/${map}`);
          }
        });
      }
    }
    for (const [key, id] of Object.entries(manifest.hdri) as [SkyKey, string][]) {
      jobs.push(async () => {
        try {
          const t = await rgbe.loadAsync(`${BASE}hdri/${id}.hdr`);
          t.mapping = THREE.EquirectangularReflectionMapping;
          this.skies.set(key, { background: t, environment: pmrem.fromEquirectangular(t).texture });
        } catch {
          this.missing.push(`hdri/${id}`);
        }
      });
    }
    let done = 0;
    await Promise.all(
      jobs.map((j) =>
        j().then(() => {
          onProgress(++done / jobs.length);
        }),
      ),
    );
    pmrem.dispose();
    if (this.missing.length) console.warn('[assets] missing (run `npm run fetch-assets`):', this.missing);
  }

  sky(key: SkyKey): Sky | undefined {
    return this.skies.get(key);
  }

  /**
   * A shared PBR material. Geometry UVs are in metres / tile size (see geometry.ts),
   * so one material works at any surface size.
   */
  material(key: MaterialKey, opts: MaterialOptions = {}): THREE.MeshStandardMaterial {
    const id = `${key}|${JSON.stringify(opts)}`;
    let m = this.materials.get(id);
    if (m) return m;
    const set = this.sets.get(key) ?? {};
    m = new THREE.MeshStandardMaterial({
      color: opts.color ?? (set.diff ? 0xffffff : FALLBACK[key]),
      map: set.diff ?? null,
      normalMap: set.nor ?? null,
      normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
      roughness: opts.roughness ?? 1,
      metalness: opts.metalness ?? 0,
    });
    if (set.arm && !opts.noArm) {
      m.aoMap = set.arm;
      m.roughnessMap = set.arm;
      if (opts.metalness === undefined) m.metalnessMap = set.arm;
      if (opts.metalness === undefined) m.metalness = 1;
    }
    this.materials.set(id, m);
    return m;
  }
}

const FALLBACK: Record<MaterialKey, number> = {
  stucco: 0xe9e4da,
  plaster: 0xdcd8cf,
  corridorFloor: 0xd0d0cc,
  classFloor: 0xb08a5c,
  terrazzo: 0xc9c1b5,
  ceiling: 0xeeeeea,
  asphalt: 0x3a3a3c,
  grass: 0x4f7a32,
  track: 0x9b3b2c,
  paving: 0xb7ab97,
  poolTile: 0x6fb3c9,
  rust: 0x6e4a33,
  concrete: 0x8b8b88,
  forestFloor: 0x4b4030,
  wood: 0xc9a77c,
};

export const assets = new AssetStore();
