// Gore: blood particles, floor/wall decals that dry over time, spreading pools, arterial
// spray, gibs with flesh caps, intestines, and blood on the camera lens.
// Everything scales with the gore setting; at "off" nothing here spawns at all.
import * as THREE from 'three';
import { audio } from '../engine/audio';
import { goreScale, settings } from '../settings';
import * as T from '../world/textures';

interface Drop {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  size: number;
}

interface Decal {
  mesh: THREE.Mesh;
  age: number;
  grow: number;
  target: number;
  mat: THREE.MeshPhysicalMaterial;
}

interface Gib {
  obj: THREE.Object3D;
  v: THREE.Vector3;
  w: THREE.Vector3;
  rest: boolean;
  trail: number;
}

interface LensSplat {
  x: number;
  y: number;
  r: number;
  a: number;
  drip: number;
  seed: number;
}

const MAX_DROPS = 900;

export class Gore {
  private drops: Drop[] = [];
  private dropMesh: THREE.InstancedMesh;
  private decals: Decal[] = [];
  private gibs: Gib[] = [];
  private sprays: { obj: THREE.Object3D; offset: THREE.Vector3; dir: THREE.Vector3; t: number; dur: number; rate: number }[] = [];
  private lens: LensSplat[] = [];
  private tex: Record<'splat' | 'pool' | 'drip' | 'smear', THREE.Texture>;
  readonly flesh: THREE.MeshPhysicalMaterial;
  readonly gut: THREE.MeshPhysicalMaterial;
  readonly bloodMat: THREE.MeshPhysicalMaterial;
  /** Floor height lookup (pool basin, shaft, etc.). */
  floorAt: (x: number, z: number) => number = () => 0;
  private tmp = new THREE.Object3D();

  constructor(
    private scene: THREE.Scene,
    private lensCanvas: HTMLCanvasElement,
  ) {
    this.tex = { splat: T.bloodSplatTexture('splat'), pool: T.bloodSplatTexture('pool'), drip: T.bloodSplatTexture('drip'), smear: T.bloodSplatTexture('smear') };
    this.bloodMat = new THREE.MeshPhysicalMaterial({ color: 0x5a0000, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
    const fleshMap = T.fleshTexture();
    this.flesh = new THREE.MeshPhysicalMaterial({ map: fleshMap, color: 0xffffff, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, sheen: 0.4, sheenColor: new THREE.Color(0xff4040) });
    this.gut = new THREE.MeshPhysicalMaterial({ map: fleshMap, color: 0xd88a8a, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.5, sheenColor: new THREE.Color(0xffb0a0) });
    const drop = new THREE.SphereGeometry(1, 6, 4);
    this.dropMesh = new THREE.InstancedMesh(drop, this.bloodMat, MAX_DROPS);
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    scene.add(this.dropMesh);
  }

  get enabled() {
    return goreScale() > 0;
  }

  /** A burst of blood droplets. */
  burst(pos: THREE.Vector3, dir: THREE.Vector3, count = 40, speed = 4, spread = 0.6) {
    const k = goreScale();
    if (!k) return;
    const n = Math.round(count * (0.4 + k * 0.6));
    for (let i = 0; i < n && this.drops.length < MAX_DROPS; i++) {
      const v = dir
        .clone()
        .normalize()
        .add(new THREE.Vector3((Math.random() - 0.5) * spread * 2, (Math.random() - 0.3) * spread * 2, (Math.random() - 0.5) * spread * 2))
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.drops.push({ p: pos.clone(), v, life: 3, size: 0.008 + Math.random() * 0.02 });
    }
  }

  /** Pulsing arterial spray from a point on an object for `dur` seconds. */
  spray(obj: THREE.Object3D, offset: THREE.Vector3, dir: THREE.Vector3, dur = 3, rate = 1) {
    if (!this.enabled) return;
    this.sprays.push({ obj, offset, dir, t: 0, dur, rate });
  }

  /** Flat decal on a floor at height y. */
  floorDecal(x: number, z: number, size: number, kind: 'splat' | 'pool' | 'smear' = 'splat', grow = 0, y?: number) {
    const k = goreScale();
    if (!k) return;
    const mat = new THREE.MeshPhysicalMaterial({
      map: this.tex[kind],
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      // Tint the albedo darker and more saturated: fresh blood is nearly black-red under light.
      color: 0xa01818,
    });
    const s = size * (0.6 + k * 0.4);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.position.set(x, (y ?? this.floorAt(x, z)) + 0.012 + Math.random() * 0.004, z);
    mesh.scale.setScalar(grow ? s * 0.15 : s);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.decals.push({ mesh, age: 0, grow, target: s, mat });
    if (this.decals.length > 220) {
      const old = this.decals.shift()!;
      this.scene.remove(old.mesh);
      old.mat.dispose();
    }
  }

  /** Vertical decal (wall) with an animated drip. normal = wall facing direction. */
  wallDecal(pos: THREE.Vector3, normal: THREE.Vector3, size: number) {
    const k = goreScale();
    if (!k) return;
    for (const [kind, sx, sy, dy] of [
      ['splat', 1, 1, 0],
      ['drip', 0.6, 1.6, -0.6],
    ] as const) {
      const mat = new THREE.MeshPhysicalMaterial({ map: this.tex[kind], color: 0xa01818, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.15, clearcoat: 1 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.position.copy(pos).addScaledVector(normal, 0.01);
      mesh.position.y += dy * size;
      mesh.lookAt(mesh.position.clone().add(normal));
      mesh.scale.set(size * sx, size * sy, 1);
      if (kind === 'drip') mesh.scale.y = 0.01;
      this.scene.add(mesh);
      this.decals.push({ mesh, age: 0, grow: kind === 'drip' ? 0.15 : 0, target: size * sy, mat });
    }
  }

  /** A spreading pool under a body. */
  pool(x: number, z: number, size: number, y?: number) {
    this.floorDecal(x, z, size, 'pool', 0.25, y);
  }

  /** Throws a detached body part with a raw flesh cap at the cut. */
  gib(obj: THREE.Object3D, v: THREE.Vector3, w = new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4)) {
    if (!this.enabled) return;
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), this.flesh);
    cap.rotation.x = Math.PI / 2;
    obj.add(cap);
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xeee2c8, roughness: 0.4 }));
    bone.position.y = 0.02;
    obj.add(bone);
    obj.traverse((o) => (o.castShadow = true));
    this.scene.add(obj);
    this.gibs.push({ obj, v, w, rest: false, trail: 0 });
    this.spray(obj, new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 1.6, 0.6);
  }

  /** Coiled intestines spilling from `from` towards the floor. Returns the mesh group. */
  intestines(from: THREE.Vector3, towards: THREE.Vector3, length = 2.4): THREE.Group {
    const g = new THREE.Group();
    if (settings.gore !== 'extreme') return g;
    const pts: THREE.Vector3[] = [from.clone()];
    const dir = towards.clone().sub(from).setY(0).normalize();
    let p = from.clone();
    const segs = Math.round(length / 0.12);
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      p = p
        .clone()
        .addScaledVector(dir, 0.06)
        .addScaledVector(side, Math.sin(i * 1.3) * 0.09)
        .setY(Math.max(this.floorAt(p.x, p.z) + 0.04, from.y - t * 2.5) + Math.abs(Math.sin(i * 0.9)) * 0.03);
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, segs * 4, 0.028, 10, false), this.gut);
    tube.castShadow = true;
    g.add(tube);
    // A second, thicker loop (large bowel) bunched near the wound.
    const loop: THREE.Vector3[] = [];
    for (let i = 0; i < 18; i++) {
      const a = i * 0.7;
      loop.push(from.clone().add(new THREE.Vector3(Math.cos(a) * 0.12 + dir.x * i * 0.02, -i * 0.02, Math.sin(a) * 0.12 + dir.z * i * 0.02)));
    }
    const big = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop), 80, 0.04, 10, false), this.gut);
    big.castShadow = true;
    g.add(big);
    this.scene.add(g);
    return g;
  }

  /** Splashes blood onto the camera lens (2D overlay). */
  lensSplash(amount = 1) {
    const k = goreScale();
    if (!k) return;
    const n = Math.round((3 + Math.random() * 5) * amount * k);
    for (let i = 0; i < n; i++) {
      this.lens.push({ x: Math.random(), y: Math.random() * 0.7, r: 0.02 + Math.random() * 0.08 * amount, a: 0.85, drip: 0, seed: Math.random() * 100 });
    }
    audio.gore('splat', new THREE.Vector3());
  }

  clearAll() {
    for (const d of this.decals) {
      this.scene.remove(d.mesh);
      d.mat.dispose();
    }
    for (const g of this.gibs) this.scene.remove(g.obj);
    this.decals = [];
    this.gibs = [];
    this.drops = [];
    this.sprays = [];
    this.lens = [];
  }

  update(dt: number) {
    // Sprays.
    for (const s of this.sprays) {
      s.t += dt;
      const pulse = Math.max(0, Math.sin(s.t * 7.5)) * (1 - s.t / s.dur);
      if (pulse > 0.4 && Math.random() < s.rate) {
        const p = s.offset.clone();
        s.obj.localToWorld(p);
        const d = s.dir.clone().transformDirection(s.obj.matrixWorld);
        this.burst(p, d, 6, 3 + pulse * 3, 0.15);
      }
    }
    this.sprays = this.sprays.filter((s) => s.t < s.dur);

    // Droplets.
    let n = 0;
    const g = 9.8;
    for (const d of this.drops) {
      d.v.y -= g * dt;
      d.p.addScaledVector(d.v, dt);
      d.life -= dt;
      const floor = this.floorAt(d.p.x, d.p.z);
      if (d.p.y <= floor) {
        if (Math.random() < 0.35) this.floorDecal(d.p.x, d.p.z, 0.12 + d.size * 12, 'splat', 0, floor);
        d.life = 0;
      }
      if (d.life <= 0) continue;
      this.tmp.position.copy(d.p);
      const sp = d.v.length();
      this.tmp.scale.set(d.size, d.size * (1 + sp * 0.45), d.size);
      this.tmp.lookAt(d.p.clone().add(d.v));
      this.tmp.rotateX(Math.PI / 2);
      this.tmp.updateMatrix();
      this.dropMesh.setMatrixAt(n++, this.tmp.matrix);
    }
    this.drops = this.drops.filter((d) => d.life > 0);
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;

    // Decals: spread and dry (gloss fades, colour browns).
    for (const d of this.decals) {
      d.age += dt;
      if (d.grow) {
        if (d.mesh.rotation.x !== 0) {
          const s = d.mesh.scale.x + (d.target - d.mesh.scale.x) * Math.min(1, dt * d.grow);
          d.mesh.scale.set(s, s, 1);
        } else d.mesh.scale.y += (d.target - d.mesh.scale.y) * Math.min(1, dt * d.grow);
      }
      const dry = Math.min(1, d.age / 240);
      d.mat.roughness = 0.12 + dry * 0.6;
      d.mat.clearcoat = 1 - dry * 0.9;
      d.mat.color.setRGB(1 - dry * 0.45, 1 - dry * 0.55, 1 - dry * 0.6);
    }

    // Gibs: simple ballistic + bounce, trail smears.
    for (const gb of this.gibs) {
      if (gb.rest) continue;
      gb.v.y -= g * dt;
      gb.obj.position.addScaledVector(gb.v, dt);
      gb.obj.rotation.x += gb.w.x * dt;
      gb.obj.rotation.y += gb.w.y * dt;
      gb.obj.rotation.z += gb.w.z * dt;
      const floor = this.floorAt(gb.obj.position.x, gb.obj.position.z) + 0.05;
      if (gb.obj.position.y < floor) {
        gb.obj.position.y = floor;
        this.floorDecal(gb.obj.position.x, gb.obj.position.z, 0.5, 'smear');
        audio.gore('splat', gb.obj.position);
        if (gb.v.length() < 1.2) {
          gb.rest = true;
          this.pool(gb.obj.position.x, gb.obj.position.z, 0.8);
        }
        gb.v.multiplyScalar(0.35);
        gb.v.y = Math.abs(gb.v.y) * 0.5;
        gb.w.multiplyScalar(0.5);
      }
    }

    this.drawLens(dt);
  }

  private drawLens(dt: number) {
    const c = this.lensCanvas;
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    if (!this.lens.length) return;
    for (const s of this.lens) {
      s.drip += dt * (0.02 + (s.seed % 1) * 0.03);
      s.a -= dt * 0.06;
      const x = s.x * W;
      const y = s.y * H;
      const r = s.r * Math.min(W, H);
      g.globalAlpha = Math.max(0, s.a);
      // Seeded shape so each splat keeps its silhouette from frame to frame.
      let q = s.seed * 9301 + 49297;
      const rnd = () => ((q = (q * 9301 + 49297) % 233280) / 233280);
      // Irregular body: overlapping lobes, dark and thick in the middle.
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * r * 0.45;
        const lr = r * (0.35 + rnd() * 0.4);
        const lx = x + Math.cos(a) * d;
        const ly = y + Math.sin(a) * d * 0.8;
        const grad = g.createRadialGradient(lx, ly, lr * 0.2, lx, ly, lr);
        grad.addColorStop(0, 'rgba(48,0,0,0.9)');
        grad.addColorStop(0.75, 'rgba(85,3,3,0.75)');
        grad.addColorStop(1, 'rgba(95,4,4,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(lx, ly, lr, lr * (0.7 + rnd() * 0.3), a, 0, Math.PI * 2);
        g.fill();
      }
      // Satellite flecks thrown outwards.
      g.fillStyle = 'rgba(70,0,0,0.85)';
      for (let i = 0; i < 9; i++) {
        const a = rnd() * Math.PI * 2;
        const d = r * (0.9 + rnd() * 1.4);
        g.beginPath();
        g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.03 + rnd() * 0.07), 0, Math.PI * 2);
        g.fill();
      }
      // A thin drip that wobbles and tapers as it runs down the glass.
      const len = s.drip * H;
      if (len > 2) {
        const w0 = r * (0.1 + rnd() * 0.08);
        const ox = x + (rnd() - 0.5) * r * 0.6;
        g.strokeStyle = 'rgba(70,0,0,0.8)';
        g.lineCap = 'round';
        let px = ox;
        let py = y + r * 0.4;
        const steps = Math.max(2, Math.ceil(len / 6));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const nx = ox + Math.sin(t * 6 + s.seed) * r * 0.06;
          const ny = y + r * 0.4 + t * len;
          g.lineWidth = Math.max(1, w0 * (1 - t * 0.6));
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(nx, ny);
          g.stroke();
          px = nx;
          py = ny;
        }
        g.fillStyle = 'rgba(60,0,0,0.85)';
        g.beginPath();
        g.arc(px, py, w0 * 0.7, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    this.lens = this.lens.filter((s) => s.a > 0);
  }
}
