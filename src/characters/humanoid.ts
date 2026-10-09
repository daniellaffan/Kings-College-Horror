// Characters. If public/assets/characters/manifest.json lists an id, its GLB (e.g. a MetaHuman,
// Character Creator 4 or Renderpeople export of a FICTIONAL person) replaces the procedural body,
// and clips named "idle"/"walk"/"talk" drive it. Otherwise a procedural human is built from
// lathe/capsule parts with physical skin and cloth materials, animated procedurally.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type Outfit = 'uniformM' | 'uniformF' | 'security' | 'labcoat' | 'groundskeeper' | 'casual';
export type Hair = 'short' | 'afro' | 'bun' | 'braids' | 'bald' | 'cap';
export type Variant = 'normal' | 'wet' | 'hollowed' | 'corpse';

export interface CharacterSpec {
  id: string;
  name: string;
  skin: number;
  hair: Hair;
  hairColor?: number;
  outfit: Outfit;
  height?: number;
  build?: number;
}

export type PartName = 'head' | 'jaw' | 'torso' | 'armL' | 'armR' | 'foreL' | 'foreR' | 'legL' | 'legR' | 'shinL' | 'shinR' | 'hips';

const OUTFITS: Record<Outfit, { shirt: number; legs: number; skirt?: boolean; coat?: number; shoes: number; tie?: number; hat?: number; long?: boolean }> = {
  uniformM: { shirt: 0xf4f4f0, legs: 0x1b2440, shoes: 0x111111, tie: 0x0f2d5c },
  uniformF: { shirt: 0xf4f4f0, legs: 0x1b2440, skirt: true, shoes: 0x111111, tie: 0x0f2d5c },
  security: { shirt: 0x2e3338, legs: 0x1c1f22, shoes: 0x0b0b0b, hat: 0x1c1f22, long: true },
  labcoat: { shirt: 0x7b4a6a, legs: 0x262626, coat: 0xf2f2ee, shoes: 0x2a1a12, long: true },
  groundskeeper: { shirt: 0x6b6a3e, legs: 0x4a4a32, shoes: 0x3a2a1a, hat: 0x8a7a50, long: true },
  casual: { shirt: 0x3d6f8f, legs: 0x2b3a55, shoes: 0xe8e8e8 },
};

let manifest: Set<string> | null = null;
async function available(): Promise<Set<string>> {
  if (manifest) return manifest;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}assets/characters/manifest.json`);
    const json = res.headers.get('content-type')?.includes('json') ? await res.json() : [];
    manifest = new Set(Array.isArray(json) ? json : []);
  } catch {
    manifest = new Set();
  }
  return manifest;
}

const fabric = (color: number, rough = 0.92) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).multiplyScalar(0.6) });

export class Character {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly parts = {} as Record<PartName, THREE.Group>;
  readonly skin: THREE.MeshPhysicalMaterial;
  private eyes: THREE.Mesh[] = [];
  private irisMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.2 });
  private scleraMat = new THREE.MeshPhysicalMaterial({ color: 0xf2eee6, roughness: 0.1, clearcoat: 1 });
  private clothes: THREE.MeshPhysicalMaterial[] = [];
  private mixer?: THREE.AnimationMixer;
  private clips: Record<string, THREE.AnimationAction> = {};
  private phase = Math.random() * 10;
  private blink = 0;
  speed = 0;
  walkSpeed = 1.3;
  talking = false;
  variant: Variant = 'normal';
  /** Optional path to follow (world points). */
  path: THREE.Vector3[] = [];
  /** Where to look (head turns toward it). */
  lookTarget?: THREE.Vector3;
  /** Extra wrongness 0..1: twitching, held smiles, mistimed motion (Act II). */
  uncanny = 0;
  /** Body pose override. */
  pose: 'stand' | 'sit' | 'lie' | 'float' = 'stand';
  /** Hidden parts (dismembered). */
  readonly missing = new Set<PartName>();
  readonly height: number;

  constructor(readonly spec: CharacterSpec) {
    this.height = spec.height ?? 1.72;
    this.skin = new THREE.MeshPhysicalMaterial({
      color: spec.skin,
      roughness: 0.52,
      sheen: 0.35,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(0xff6a50),
      clearcoat: 0.08,
      clearcoatRoughness: 0.6,
    });
    this.buildProcedural();
    this.root.add(this.body);
    this.root.userData.character = this;
    void this.tryGLB();
  }

  get name() {
    return this.spec.name;
  }

  private async tryGLB() {
    const ids = await available();
    if (!ids.has(this.spec.id)) return;
    try {
      const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/characters/${this.spec.id}.glb`);
      this.body.visible = false;
      const model = gltf.scene;
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
      });
      this.root.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) this.clips[clip.name.toLowerCase()] = this.mixer.clipAction(clip);
      this.clips.idle?.play();
    } catch (e) {
      console.warn(`[characters] failed to load ${this.spec.id}.glb`, e);
    }
  }

  // --------------------------------------------------------------- procedural body
  private buildProcedural() {
    const H = this.height / 1.72;
    const B = this.spec.build ?? 1;
    const o = OUTFITS[this.spec.outfit];
    const shirt = fabric(o.shirt);
    const legs = fabric(o.legs);
    const shoes = new THREE.MeshPhysicalMaterial({ color: o.shoes, roughness: 0.35, clearcoat: 0.6 });
    this.clothes.push(shirt, legs);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const me = new THREE.Mesh(g, m);
      me.position.set(x, y, z);
      me.castShadow = true;
      me.receiveShadow = true;
      parent.add(me);
      return me;
    };
    const group = (name: PartName, parent: THREE.Object3D, x: number, y: number, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.name = name;
      parent.add(g);
      this.parts[name] = g;
      return g;
    };
    const lathe = (profile: [number, number][], segs = 24) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);

    const hipY = 0.93 * H;
    const hips = group('hips', this.body, 0, hipY);
    // Pelvis.
    mesh(lathe([[0.001, -0.1], [0.12 * B, -0.08], [0.165 * B, 0], [0.155 * B, 0.08], [0.001, 0.1]]).scale(1, 1, 0.72), legs, hips);

    // Legs.
    for (const s of [-1, 1] as const) {
      const leg = group(s < 0 ? 'legL' : 'legR', hips, s * 0.09 * B, -0.03);
      const thigh = lathe([[0.001, 0], [0.06, -0.02], [0.082 * B, -0.08], [0.072 * B, -0.25], [0.056, -0.42], [0.001, -0.45]]);
      mesh(thigh, legs, leg);
      const shin = group(s < 0 ? 'shinL' : 'shinR', leg, 0, -0.44 * H);
      const sh = lathe([[0.001, 0], [0.052, -0.02], [0.058, -0.12], [0.044, -0.3], [0.036, -0.4], [0.001, -0.43]]);
      if (o.skirt) mesh(sh, this.skin, shin);
      else mesh(sh, legs, shin);
      if (o.skirt) {
        // Knee socks.
        mesh(lathe([[0.046, -0.12], [0.05, -0.2], [0.042, -0.32], [0.04, -0.4]]), fabric(0x1b2440), shin);
      }
      const foot = new THREE.CapsuleGeometry(0.045, 0.16, 4, 10).rotateX(Math.PI / 2);
      mesh(foot, shoes, shin, 0, -0.44 * H, 0.05);
      if (o.skirt) mesh(thigh.clone().scale(0.98, 1, 0.98), this.skin, leg);
    }
    if (o.skirt) {
      const skirt = new THREE.CylinderGeometry(0.17 * B, 0.26 * B, 0.42, 24, 1, true);
      const sk = mesh(skirt, legs, hips, 0, -0.17);
      (sk.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide;
    }

    // Torso.
    const torso = group('torso', hips, 0, 0.08);
    const chest = lathe([
      [0.001, 0],
      [0.15 * B, 0.01],
      [0.145 * B, 0.12],
      [0.16 * B, 0.28],
      [0.18 * B, 0.4],
      [0.17 * B, 0.47],
      [0.1, 0.52],
      [0.001, 0.53],
    ]).scale(1, H, 0.66);
    mesh(chest, shirt, torso);
    if (o.coat) {
      const coat = lathe([
        [0.17 * B, -0.62],
        [0.165 * B, -0.2],
        [0.16 * B, 0.12],
        [0.175 * B, 0.28],
        [0.195 * B, 0.41],
        [0.18 * B, 0.48],
        [0.1, 0.53],
      ]).scale(1, H, 0.7);
      const c = fabric(o.coat, 0.8);
      c.side = THREE.DoubleSide;
      mesh(coat, c, torso);
      this.clothes.push(c);
    }
    if (o.tie) mesh(new THREE.BoxGeometry(0.045, 0.32, 0.01), fabric(o.tie, 0.6), torso, 0, 0.3 * H, 0.108 * B);
    if (this.spec.outfit === 'security') mesh(new THREE.CircleGeometry(0.025, 6), new THREE.MeshStandardMaterial({ color: 0xc9a43a, metalness: 1, roughness: 0.3 }), torso, -0.08, 0.38 * H, 0.121 * B);
    // Neck + head.
    mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.12, 14), this.skin, torso, 0, 0.57 * H);
    const head = group('head', torso, 0, 0.62 * H);
    const skull = lathe([
      [0.001, -0.02],
      [0.05, -0.015],
      [0.07, 0.02],
      [0.088, 0.09],
      [0.094, 0.15],
      [0.088, 0.2],
      [0.07, 0.24],
      [0.04, 0.262],
      [0.001, 0.268],
    ], 28).scale(0.92, 1, 1.08);
    mesh(skull, this.skin, head, 0, 0, -0.005);
    // Face: brow, nose, ears, eyes, lips. Kept subtle; realism comes from shading.
    mesh(new THREE.SphereGeometry(0.05, 14, 10).scale(1.55, 0.35, 0.6), this.skin, head, 0, 0.165, 0.067);
    const nose = new THREE.ConeGeometry(0.017, 0.05, 10).rotateX(Math.PI / 2 + 0.35);
    mesh(nose, this.skin, head, 0, 0.12, 0.098);
    mesh(new THREE.SphereGeometry(0.02, 10, 8).scale(1.3, 0.8, 0.9), this.skin, head, 0, 0.1, 0.098);
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.024, 10, 8).scale(0.45, 1.3, 0.9), this.skin, head, s * 0.085, 0.13, -0.005);
      const eye = mesh(new THREE.SphereGeometry(0.0145, 16, 12), this.scleraMat, head, s * 0.033, 0.145, 0.074);
      const iris = mesh(new THREE.SphereGeometry(0.0085, 12, 10), this.irisMat, eye, 0, 0, 0.009);
      iris.scale.set(1, 1, 0.5);
      this.eyes.push(eye);
      // Eyelid that blinks.
      const lid = mesh(new THREE.SphereGeometry(0.016, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.skin, head, s * 0.033, 0.145, 0.073);
      lid.scale.y = 0.3;
      lid.userData.lid = true;
    }
    const jaw = group('jaw', head, 0, 0.06, 0.01);
    mesh(new THREE.SphereGeometry(0.068, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.95, 0.9, 1.0), this.skin, jaw, 0, 0.02, 0);
    mesh(new THREE.TorusGeometry(0.019, 0.006, 6, 16).scale(1.2, 0.5, 1), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(this.spec.skin).multiplyScalar(0.75).getHex(), roughness: 0.4, clearcoat: 0.3 }), jaw, 0, 0.022, 0.07);

    // Hair.
    const hc = this.spec.hairColor ?? 0x15100c;
    const hairMat = new THREE.MeshPhysicalMaterial({ color: hc, roughness: 0.55, sheen: 1, sheenColor: new THREE.Color(0x6a5a4a), sheenRoughness: 0.3 });
    const cap = (r: number, sy: number) => mesh(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.95, sy, 1.08), hairMat, head, 0, 0.13, -0.008);
    switch (this.spec.hair) {
      case 'short':
        cap(0.098, 1.05);
        break;
      case 'afro':
        cap(0.13, 1.0);
        break;
      case 'bun':
        cap(0.099, 1.04);
        mesh(new THREE.SphereGeometry(0.05, 14, 10), hairMat, head, 0, 0.2, -0.09);
        break;
      case 'braids':
        cap(0.1, 1.04);
        for (let i = 0; i < 14; i++) {
          const a = Math.PI * 0.15 + (i / 13) * Math.PI * 0.7;
          const br = new THREE.CylinderGeometry(0.008, 0.006, 0.34, 6);
          mesh(br, hairMat, head, Math.cos(a) * 0.09, -0.02, -Math.sin(a) * 0.08 - 0.02);
        }
        break;
      case 'cap':
      case 'bald':
        break;
    }
    if (o.hat) {
      const hat = fabric(o.hat, 0.85);
      mesh(new THREE.SphereGeometry(0.102, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.95, 0.7, 1.08), hat, head, 0, 0.17, -0.008);
      mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.008, 20, 1, false, -Math.PI / 2, Math.PI).scale(0.8, 1, 0.9), hat, head, 0, 0.175, 0.07);
    }

    // Arms.
    for (const s of [-1, 1] as const) {
      const arm = group(s < 0 ? 'armL' : 'armR', torso, s * 0.2 * B, 0.46 * H);
      mesh(new THREE.SphereGeometry(0.055 * B, 12, 10), o.coat ? this.clothes[this.clothes.length - 1] : shirt, arm);
      const upper = lathe([[0.001, 0], [0.05 * B, -0.02], [0.047 * B, -0.12], [0.038, -0.27], [0.001, -0.29]]);
      const sleeveLong = o.long || !!o.coat;
      mesh(upper, sleeveLong ? (o.coat ? this.clothes[this.clothes.length - 1] : shirt) : shirt, arm);
      if (!sleeveLong) mesh(upper.clone().scale(0.92, 1, 0.92), this.skin, arm);
      const fore = group(s < 0 ? 'foreL' : 'foreR', arm, 0, -0.28 * H);
      const fa = lathe([[0.001, 0], [0.038, -0.02], [0.037, -0.1], [0.028, -0.24], [0.001, -0.26]]);
      mesh(fa, sleeveLong ? (o.coat ? this.clothes[this.clothes.length - 1] : shirt) : this.skin, fore);
      const hand = new THREE.SphereGeometry(0.04, 12, 10).scale(0.62, 1.25, 0.95);
      mesh(hand, this.skin, fore, 0, -0.3, 0.005);
      arm.rotation.z = s * 0.06;
    }
  }

  // --------------------------------------------------------------- state
  setVariant(v: Variant) {
    this.variant = v;
    const wet = v === 'wet' || v === 'hollowed';
    this.skin.roughness = wet ? 0.18 : 0.52;
    this.skin.clearcoat = wet ? 0.8 : 0.08;
    for (const c of this.clothes) {
      c.roughness = wet ? 0.45 : 0.92;
      c.color.multiplyScalar(wet ? 0.7 : 1);
    }
    if (v === 'hollowed') {
      this.skin.color.lerp(new THREE.Color(0x6f7a72), 0.6);
      this.skin.sheenColor.setHex(0x203028);
      this.scleraMat.color.setHex(0x050505);
      this.irisMat.color.setHex(0x000000);
      for (const e of this.eyes) e.scale.setScalar(1.15);
      this.walkSpeed = 3.2;
    }
    if (v === 'corpse') {
      this.skin.color.lerp(new THREE.Color(0x8a8a80), 0.45);
      for (const e of this.eyes) e.rotation.x = -0.6;
    }
  }

  /** Hides a body part (for dismemberment) and returns its world transform. */
  detach(part: PartName): THREE.Group {
    this.missing.add(part);
    const p = this.parts[part];
    p.updateWorldMatrix(true, true);
    const copy = p.clone(true);
    p.getWorldPosition(copy.position);
    p.getWorldQuaternion(copy.quaternion);
    p.visible = false;
    return copy;
  }

  moveTo(p: THREE.Vector3) {
    this.path = [p.clone()];
  }

  faceTo(p: THREE.Vector3) {
    const dx = p.x - this.root.position.x;
    const dz = p.z - this.root.position.z;
    this.root.rotation.y = Math.atan2(dx, dz);
  }

  update(dt: number, t: number) {
    // Path following.
    this.speed = 0;
    if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.root.position.x;
      const dz = target.z - this.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) this.path.shift();
      else {
        const step = Math.min(d, this.walkSpeed * dt);
        this.root.position.x += (dx / d) * step;
        this.root.position.z += (dz / d) * step;
        const want = Math.atan2(dx, dz);
        let dy = want - this.root.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.root.rotation.y += dy * Math.min(1, dt * 8);
        this.speed = this.walkSpeed;
      }
    }
    if (this.mixer) {
      const walk = this.clips.walk;
      const idle = this.clips.idle;
      if (walk && idle) {
        walk.enabled = idle.enabled = true;
        walk.setEffectiveWeight(this.speed > 0 ? 1 : 0);
        idle.setEffectiveWeight(this.speed > 0 ? 0 : 1);
        if (this.speed > 0 && !walk.isRunning()) walk.play();
      }
      this.mixer.update(dt);
      return;
    }
    if (this.pose !== 'stand') return this.applyPose(t);
    if (this.variant === 'corpse') return;
    this.animate(dt, t);
  }

  private applyPose(t: number) {
    const P = this.parts;
    const H = this.height / 1.72;
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    P.head.rotation.set(0, 0, 0);
    if (this.pose === 'sit') {
      P.hips.position.y = 0.47 * H;
      P.legL.rotation.x = P.legR.rotation.x = -Math.PI / 2;
      P.shinL.rotation.x = P.shinR.rotation.x = Math.PI / 2;
      P.armL.rotation.x = P.armR.rotation.x = -0.5;
      P.foreL.rotation.x = P.foreR.rotation.x = -0.9;
      P.torso.rotation.x = Math.sin(t * 1.8) * 0.01;
      P.jaw.rotation.x = this.talking ? Math.max(0, Math.sin(t * 14) * Math.sin(t * 5.3)) * 0.22 : 0;
      if (this.lookTarget) {
        const local = this.root.worldToLocal(this.lookTarget.clone());
        P.head.rotation.y = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.1, 1.1);
      }
    } else if (this.pose === 'lie') {
      // On the back, head towards -Z.
      this.body.rotation.x = -Math.PI / 2;
      this.body.position.set(0, 0.12, 0.93 * H);
      P.hips.position.y = 0.93 * H;
      P.armL.rotation.set(0, 0, -0.5);
      P.armR.rotation.set(0, 0, 0.9);
      P.foreL.rotation.x = -0.2;
      P.legL.rotation.set(0, 0, -0.15);
      P.legR.rotation.set(0.25, 0, 0.1);
      P.shinR.rotation.x = 0.5;
      P.head.rotation.set(0, 0.7, 0);
      P.jaw.rotation.x = 0.35;
    } else if (this.pose === 'float') {
      // Face down, limbs drifting.
      this.body.rotation.x = Math.PI / 2 + Math.sin(t * 0.4) * 0.05;
      this.body.position.y = 0;
      P.armL.rotation.set(-0.3, 0, -1.2 + Math.sin(t * 0.5) * 0.1);
      P.armR.rotation.set(-0.3, 0, 1.2 + Math.sin(t * 0.45) * 0.1);
      P.legL.rotation.x = 0.2 + Math.sin(t * 0.3) * 0.1;
      P.legR.rotation.x = -0.1 + Math.sin(t * 0.35) * 0.1;
      P.head.rotation.x = 0.4;
    }
  }

  private animate(dt: number, t: number) {
    const P = this.parts;
    const hol = this.variant === 'hollowed';
    const moving = this.speed > 0.05;
    this.phase += dt * (moving ? this.speed * (hol ? 4.2 : 5.2) : 0);
    const ph = this.phase;
    const sw = moving ? (hol ? 0.75 : 0.5) : 0;
    const breathe = Math.sin(t * 1.8 + this.phase) * 0.012;
    P.legL.rotation.x = Math.sin(ph) * sw;
    P.legR.rotation.x = -Math.sin(ph) * sw;
    P.shinL.rotation.x = Math.max(0, -Math.cos(ph)) * sw * 1.4;
    P.shinR.rotation.x = Math.max(0, Math.cos(ph)) * sw * 1.4;
    P.armL.rotation.x = hol ? -0.15 + Math.sin(t * 13) * 0.04 : -Math.sin(ph) * sw * 0.7;
    P.armR.rotation.x = hol ? -0.1 + Math.sin(t * 11 + 1) * 0.04 : Math.sin(ph) * sw * 0.7;
    P.foreL.rotation.x = hol ? -0.05 : -0.15 - Math.max(0, Math.sin(ph)) * sw * 0.5;
    P.foreR.rotation.x = hol ? -0.05 : -0.15 - Math.max(0, -Math.sin(ph)) * sw * 0.5;
    P.hips.position.y = 0.93 * (this.height / 1.72) + (moving ? Math.abs(Math.cos(ph)) * 0.03 : 0);
    P.torso.rotation.x = breathe + (hol ? 0.18 : moving ? 0.04 : 0);
    P.torso.rotation.y = moving ? Math.sin(ph) * 0.06 : 0;

    // Head: look-at, talk, uncanny twitch.
    let hy = 0;
    let hx = 0;
    if (this.lookTarget) {
      const local = this.root.worldToLocal(this.lookTarget.clone());
      hy = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.1, 1.1);
      hx = THREE.MathUtils.clamp(-Math.atan2(local.y - 1.6, Math.hypot(local.x, local.z)), -0.4, 0.4);
    }
    P.head.rotation.y += (hy - P.head.rotation.y) * Math.min(1, dt * (this.uncanny > 0.5 ? 30 : 5));
    P.head.rotation.x += (hx - P.head.rotation.x) * Math.min(1, dt * 5);
    P.head.rotation.z = hol ? 0.55 + Math.sin(t * 17) * 0.05 : 0;
    if (this.uncanny > 0 && Math.sin(t * 3.1 + this.phase) > 1 - this.uncanny * 0.08) P.head.rotation.z += (Math.random() - 0.5) * 0.4 * this.uncanny;
    P.jaw.rotation.x = hol ? 0.55 + Math.sin(t * 2) * 0.1 : this.talking ? Math.max(0, Math.sin(t * 14) * Math.sin(t * 5.3)) * 0.22 : 0;

    // Blink (the uncanny never blink).
    this.blink -= dt;
    const closing = this.blink < 0.12 && this.uncanny < 0.5 && !hol;
    if (this.blink < 0) this.blink = 2 + Math.random() * 4;
    for (const child of P.head.children) if (child.userData.lid) child.scale.y = closing ? 1.05 : 0.3;
  }
}

/** The fictional cast (see docs/DESIGN.md). None are based on real people. */
export const CAST: Record<string, CharacterSpec> = {
  amara: { id: 'amara', name: 'Amara Knowles', skin: 0x7a4a32, hair: 'braids', outfit: 'uniformF', height: 1.66 },
  theo: { id: 'theo', name: 'Theo Cartwright', skin: 0xc79a7a, hair: 'short', hairColor: 0x5a3a1e, outfit: 'uniformM', height: 1.81, build: 1.08 },
  fairweather: { id: 'fairweather', name: 'Ms. Fairweather', skin: 0x5e3826, hair: 'bun', hairColor: 0x2a2420, outfit: 'labcoat', height: 1.7 },
  pratt: { id: 'pratt', name: 'Mr. Pratt', skin: 0x4e3022, hair: 'bald', outfit: 'security', height: 1.84, build: 1.15 },
  sands: { id: 'sands', name: 'Tally Sands', skin: 0x8a5a40, hair: 'short', hairColor: 0x9a9a92, outfit: 'groundskeeper', height: 1.78 },
  librarian: { id: 'librarian', name: 'Mrs. Ferguson', skin: 0x9a6a4e, hair: 'bun', hairColor: 0x3a3a3a, outfit: 'casual', height: 1.62 },
  cafe: { id: 'cafe', name: 'Ms. Bain', skin: 0x6a4030, hair: 'cap', outfit: 'casual', height: 1.68 },
  wet: { id: 'wet', name: '???', skin: 0x7a5038, hair: 'short', outfit: 'uniformM', height: 1.75 },
  kai: { id: 'kai', name: 'Kai Rolle', skin: 0x6a4230, hair: 'short', outfit: 'uniformM', height: 1.75 },
  studentA: { id: 'studentA', name: 'Student', skin: 0x5a3626, hair: 'short', outfit: 'uniformM', height: 1.76 },
  studentB: { id: 'studentB', name: 'Student', skin: 0xd8b49a, hair: 'bun', hairColor: 0x6a4a2a, outfit: 'uniformF', height: 1.63 },
  studentC: { id: 'studentC', name: 'Student', skin: 0x8a5a3e, hair: 'afro', outfit: 'uniformM', height: 1.8 },
  studentD: { id: 'studentD', name: 'Student', skin: 0x6e4430, hair: 'braids', outfit: 'uniformF', height: 1.68 },
};
