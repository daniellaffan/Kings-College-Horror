// Sky, sun, fog, rain, lightning and wetness. Moods blend over time so Act I's bright
// tropical noon can slide into overcast, dusk and finally the storm night.
// Indoors, image-based lighting is turned down (IBL ignores walls, so it would otherwise
// light interiors as if they were outside).
import * as THREE from 'three';
import { audio } from '../engine/audio';
import { assets, type SkyKey } from '../engine/assets';
import type { Renderer } from '../engine/renderer';
import { wind } from './props';

export type Mood = 'day' | 'overcast' | 'dusk' | 'storm' | 'dark';

interface MoodSpec {
  sky: SkyKey;
  env: number;
  bg: number;
  sun: number;
  sunColor: number;
  /** Sun elevation and azimuth in degrees (azimuth 0 = local +u). */
  elev: number;
  azim: number;
  fog: number;
  fogColor: number;
  rain: number;
  wind: number;
  hemi: number;
  saturation: number;
  contrast: number;
}

const MOODS: Record<Mood, MoodSpec> = {
  day: { sky: 'day', env: 1.0, bg: 1.0, sun: 3.4, sunColor: 0xfff3df, elev: 62, azim: 210, fog: 0.0012, fogColor: 0xbfd6e8, rain: 0, wind: 0.7, hemi: 0.25, saturation: 0.05, contrast: 0.06 },
  overcast: { sky: 'overcast', env: 0.8, bg: 0.85, sun: 0.6, sunColor: 0xe6ecf2, elev: 50, azim: 230, fog: 0.004, fogColor: 0x9aa4ab, rain: 0.15, wind: 1.3, hemi: 0.2, saturation: -0.15, contrast: 0.04 },
  dusk: { sky: 'dusk', env: 0.55, bg: 0.7, sun: 1.6, sunColor: 0xff9a5a, elev: 6, azim: 280, fog: 0.006, fogColor: 0x6a4a48, rain: 0.25, wind: 1.6, hemi: 0.12, saturation: -0.1, contrast: 0.08 },
  storm: { sky: 'night', env: 0.06, bg: 0.12, sun: 0.05, sunColor: 0x8fa6c8, elev: 40, azim: 140, fog: 0.022, fogColor: 0x0b0f14, rain: 1, wind: 2.8, hemi: 0.02, saturation: -0.35, contrast: 0.12 },
  dark: { sky: 'night', env: 0.02, bg: 0.04, sun: 0.0, sunColor: 0x8fa6c8, elev: 40, azim: 140, fog: 0.03, fogColor: 0x050607, rain: 0.6, wind: 2.2, hemi: 0.01, saturation: -0.5, contrast: 0.14 },
};

type Num = { [K in keyof MoodSpec as MoodSpec[K] extends number ? K : never]: number };

export class Atmosphere {
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a4032, 0.2);
  readonly fog = new THREE.FogExp2(0xbfd6e8, 0.0012);
  readonly rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private cur: Num;
  private from: Num;
  private to: Num;
  private t = 1;
  private dur = 1;
  private skyKey: SkyKey = 'day';
  mood: Mood = 'day';
  /** 0 outside → 1 fully indoors (set by the game from the player's position). */
  indoor = 0;
  private flash = 0;
  private flashQueue: number[] = [];
  private nextStrike = 10;
  private wet: { m: THREE.MeshStandardMaterial; r: number; c: THREE.Color }[] = [];
  wetness = 0;
  /** Gentler lightning for the photosensitivity option. */
  reduceFlashes = false;
  lightningEnabled = true;

  constructor(private r: Renderer) {
    const s = MOODS.day;
    this.cur = pick(s);
    this.from = pick(s);
    this.to = pick(s);
    r.scene.fog = this.fog;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(r.spec.shadowMapSize, r.spec.shadowMapSize);
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -45;
    c.right = c.top = 45;
    c.near = 1;
    c.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    r.scene.add(this.sun, this.sun.target, this.hemi);

    const N = 7000;
    this.rainPos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) this.seedDrop(i, new THREE.Vector3(), true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0xaab8c4, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.rain.frustumCulled = false;
    r.scene.add(this.rain);
    this.applySky('day');
  }

  /** Materials that get darker and glossier in the rain. */
  addWet(...mats: THREE.MeshStandardMaterial[]) {
    for (const m of mats) this.wet.push({ m, r: m.roughness, c: m.color.clone() });
  }

  set(mood: Mood, seconds = 0) {
    this.mood = mood;
    this.from = { ...this.cur };
    this.to = pick(MOODS[mood]);
    this.dur = Math.max(seconds, 1e-3);
    this.t = 0;
    if (seconds <= 0) this.applySky(MOODS[mood].sky);
    else this.pendingSky = MOODS[mood].sky;
  }
  private pendingSky?: SkyKey;

  private applySky(key: SkyKey) {
    this.skyKey = key;
    const sky = assets.sky(key);
    this.r.scene.background = sky?.background ?? new THREE.Color(0x87a9c8);
    this.r.scene.environment = sky?.environment ?? null;
  }

  /** Immediate lightning strike (story beats can call this). */
  strike(distance = Math.random()) {
    if (!this.lightningEnabled) return;
    const k = this.reduceFlashes ? 0.35 : 1;
    // Two pulses ~0.4 s apart keeps flashes well under 3 per second.
    this.flashQueue.push(0, 0.42);
    this.flashPeak = (1 - distance * 0.6) * k;
    setTimeout(() => audio.thunder(distance), 300 + distance * 2500);
  }
  private flashPeak = 1;
  private flashClock = 0;

  private seedDrop(i: number, c: THREE.Vector3, anyHeight: boolean) {
    const x = c.x + (Math.random() - 0.5) * 50;
    const z = c.z + (Math.random() - 0.5) * 50;
    const y = c.y + (anyHeight ? Math.random() * 30 - 8 : 22);
    const p = this.rainPos;
    p.set([x, y, z, x, y - 0.5, z], i * 6);
  }

  update(dt: number, cam: THREE.Vector3) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur);
      const e = this.t * this.t * (3 - 2 * this.t);
      for (const k of Object.keys(this.cur) as (keyof Num)[]) {
        if (k === 'sunColor' || k === 'fogColor') continue;
        this.cur[k] = this.from[k] + (this.to[k] - this.from[k]) * e;
      }
      this.cur.sunColor = lerpColor(this.from.sunColor, this.to.sunColor, e);
      this.cur.fogColor = lerpColor(this.from.fogColor, this.to.fogColor, e);
      if (this.pendingSky && e > 0.5) {
        this.applySky(this.pendingSky);
        this.pendingSky = undefined;
      }
    }
    const c = this.cur;

    // Lightning.
    if (c.rain > 0.7 && this.lightningEnabled) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 9 + Math.random() * 18;
        this.strike(Math.random());
      }
    }
    this.flashClock += dt;
    if (this.flashQueue.length && this.flashClock >= this.flashQueue[0]) {
      this.flashQueue.shift();
      this.flash = this.flashPeak;
      if (!this.flashQueue.length) this.flashClock = 0;
    } else if (!this.flashQueue.length) this.flashClock = 0;
    this.flash = Math.max(0, this.flash - dt * 7);

    const out = 1 - this.indoor * 0.8;
    const scene = this.r.scene;
    scene.environmentIntensity = c.env * out + this.flash * 0.6;
    scene.backgroundIntensity = c.bg + this.flash * 1.5;
    this.sun.intensity = c.sun + this.flash * 5;
    this.sun.color.setHex(this.flash > 0.05 ? 0xcfe0ff : c.sunColor);
    this.hemi.intensity = c.hemi * out + this.flash * 0.4;
    this.fog.color.setHex(c.fogColor);
    if (this.flash > 0.05) this.fog.color.lerp(new THREE.Color(0x8090a8), this.flash * 0.4);
    this.fog.density = c.fog * (1 - this.indoor * 0.6);
    this.r.hueSat.saturation = c.saturation;
    this.r.brightness.contrast = c.contrast;

    // Sun follows the player; snap to shadow texels to stop shimmering.
    const el = THREE.MathUtils.degToRad(c.elev);
    const az = THREE.MathUtils.degToRad(c.azim);
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az));
    const texel = 90 / this.sun.shadow.mapSize.x;
    const tx = Math.round(cam.x / texel) * texel;
    const tz = Math.round(cam.z / texel) * texel;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + dir.x * 120, dir.y * 120, tz + dir.z * 120);
    this.sun.visible = c.sun > 0.01 || this.flash > 0;

    // Rain streaks around the camera.
    const rainVis = c.rain * (1 - this.indoor);
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.35 * rainVis;
    this.rain.visible = rainVis > 0.01;
    if (this.rain.visible) {
      const p = this.rainPos;
      const fall = (18 + c.wind * 2) * dt;
      const drift = c.wind * 0.6 * dt;
      for (let i = 0; i < p.length; i += 6) {
        p[i + 1] -= fall;
        p[i + 4] -= fall;
        p[i] += drift;
        p[i + 3] += drift * 1.4;
        if (p[i + 4] < cam.y - 8 || Math.abs(p[i] - cam.x) > 26 || Math.abs(p[i + 2] - cam.z) > 26) this.seedDrop(i / 6, cam, false);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    audio.setAmbience({ rain: c.rain * (1 - this.indoor * 0.6), wind: Math.min(1, c.wind / 3) * (1 - this.indoor * 0.7), birds: this.mood === 'day' && this.indoor < 0.5 ? 1 : 0 }, 1.5);

    // Wet surfaces.
    this.wetness += ((c.rain > 0.3 ? 1 : 0) - this.wetness) * Math.min(1, dt * 0.08);
    for (const w of this.wet) {
      w.m.roughness = w.r * (1 - 0.55 * this.wetness);
      w.m.color.copy(w.c).multiplyScalar(1 - 0.35 * this.wetness);
    }
    wind.strength.value = c.wind;
    wind.time.value += dt;
  }

  get sky() {
    return this.skyKey;
  }
}

function pick(s: MoodSpec): Num {
  const { sky: _sky, ...rest } = s;
  void _sky;
  return { ...rest };
}

function lerpColor(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}
