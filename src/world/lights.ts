// Light fixtures. The campus has hundreds of ceiling panels and lamps, but WebGL forward
// rendering can only afford a handful of real lights. A fixed pool of PointLights is
// re-assigned every frame to the powered fixtures nearest the camera (keeping the light
// count constant avoids shader recompiles). Fixture meshes glow via shared emissive materials.
import * as THREE from 'three';

export type FixtureGroup = 'interior' | 'street' | 'emergency' | 'pool';

export interface Fixture {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  group: FixtureGroup;
  /** 0 = steady; higher = more flicker. */
  flicker: number;
}

const POOL_SIZE = 10;

export class LightPool {
  readonly fixtures: Fixture[] = [];
  readonly lights: THREE.PointLight[] = [];
  readonly glow: Record<FixtureGroup, THREE.MeshStandardMaterial>;
  private powered: Record<FixtureGroup, boolean> = { interior: true, street: false, emergency: false, pool: false };
  private flickerAll = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 14, 2);
      scene.add(l);
      this.lights.push(l);
    }
    const glow = (color: number) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 1, roughness: 0.4 });
    this.glow = { interior: glow(0xf4f1ea), street: glow(0xffd9a0), emergency: glow(0xff1a0d), pool: glow(0x9fe0ff) };
    this.applyGlow();
  }

  add(f: Omit<Fixture, 'flicker'> & { flicker?: number }) {
    this.fixtures.push({ flicker: 0, ...f });
  }

  setPowered(group: FixtureGroup, on: boolean) {
    this.powered[group] = on;
    this.applyGlow();
  }

  isPowered(group: FixtureGroup) {
    return this.powered[group];
  }

  /** Global flicker 0..1 (used for the power-cut sequence and corruption events). */
  setFlicker(f: number) {
    this.flickerAll = f;
  }

  private applyGlow() {
    for (const g of Object.keys(this.glow) as FixtureGroup[]) {
      this.glow[g].emissiveIntensity = this.powered[g] ? (g === 'emergency' ? 3 : 2.2) : 0;
      this.glow[g].color.setHex(this.powered[g] ? 0x222222 : 0x777777);
    }
  }

  update(cam: THREE.Vector3, t: number) {
    const candidates = this.fixtures
      .filter((f) => this.powered[f.group])
      .map((f) => ({ f, d: f.pos.distanceToSquared(cam) }))
      .filter((c) => c.d < 40 * 40)
      .sort((a, b) => a.d - b.d)
      .slice(0, POOL_SIZE);
    for (let i = 0; i < POOL_SIZE; i++) {
      const l = this.lights[i];
      const c = candidates[i];
      if (!c) {
        l.intensity = 0;
        continue;
      }
      l.position.copy(c.f.pos);
      l.color.copy(c.f.color);
      let k = 1;
      const fl = Math.max(c.f.flicker, this.flickerAll);
      if (fl > 0) {
        const n = Math.sin(t * 31 + i * 7.1) * Math.sin(t * 17.3 + i * 3.3);
        if (n > 1 - fl * 1.4) k = Math.random() < 0.5 ? 0.05 : 0.4;
      }
      // Fade out the furthest pooled lights to hide re-assignment popping.
      const fade = i >= POOL_SIZE - 2 ? 0.5 : 1;
      l.intensity = c.f.intensity * k * fade;
      l.distance = c.f.group === 'street' ? 22 : 14;
    }
    if (this.flickerAll > 0 && this.powered.interior) {
      this.glow.interior.emissiveIntensity = Math.random() < this.flickerAll * 0.5 ? 0.1 : 2.2;
    }
  }
}
