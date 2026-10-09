// The Lusca: the blue-hole creature of Bahamian folklore. In the pool set piece its body stays
// under the blood-red water; tentacles (instanced segments along procedural curves) rise,
// sway, reach for targets and coil around them. It sees with stolen human eyes.
import * as THREE from 'three';
import * as T from '../world/textures';

const SEGS = 32;
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
const sucker = new THREE.CylinderGeometry(1, 0.8, 0.3, 10);

export class Tentacle {
  readonly mesh: THREE.InstancedMesh;
  readonly suckers: THREE.InstancedMesh;
  reach = 0;
  /** World point the tip reaches for (null = idle sway). */
  target: THREE.Vector3 | null = null;
  /** 0..1 how strongly it follows the target. */
  grip = 0;
  /** When set, the last third coils round this point. */
  coil: THREE.Vector3 | null = null;
  private phase = Math.random() * 10;
  private sway: THREE.Vector3;
  private tmp = new THREE.Object3D();

  constructor(
    readonly base: THREE.Vector3,
    readonly length: number,
    readonly thickness: number,
    mat: THREE.Material,
    suckerMat: THREE.Material,
  ) {
    this.mesh = new THREE.InstancedMesh(unitCyl, mat, SEGS);
    this.suckers = new THREE.InstancedMesh(sucker, suckerMat, SEGS * 2);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = this.suckers.frustumCulled = false;
    const a = Math.random() * Math.PI * 2;
    this.sway = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  }

  point(s: number, t: number, out = new THREE.Vector3()): THREE.Vector3 {
    const L = this.length * this.reach;
    const up = new THREE.Vector3(0, 1, 0);
    // Idle: rises from the base, curls over, sways.
    const w = Math.sin(t * 1.3 + this.phase + s * 4) * s * 1.6 * this.reach;
    const w2 = Math.cos(t * 0.9 + this.phase * 2 + s * 3) * s * 0.9 * this.reach;
    const side = new THREE.Vector3(-this.sway.z, 0, this.sway.x);
    out.copy(this.base)
      .addScaledVector(up, Math.sin(s * Math.PI * 0.62) * L)
      .addScaledVector(this.sway, s * s * L * 0.55 + w)
      .addScaledVector(side, w2);
    if (this.target && this.grip > 0) {
      const b = this.base;
      const c1 = b.clone().addScaledVector(up, this.length * 0.55);
      const c2 = this.target.clone().addScaledVector(up, 1.4);
      const e = this.target;
      const u = 1 - s;
      const bez = b.clone().multiplyScalar(u * u * u)
        .addScaledVector(c1, 3 * u * u * s)
        .addScaledVector(c2, 3 * u * s * s)
        .addScaledVector(e, s * s * s);
      bez.x += Math.sin(t * 6 + s * 9) * 0.05;
      out.lerp(bez, this.grip);
    }
    if (this.coil && s > 0.68) {
      const k = (s - 0.68) / 0.32;
      const a = k * Math.PI * 4 + t * 0.5;
      const coilPt = this.coil.clone().add(new THREE.Vector3(Math.cos(a) * 0.22, (k - 0.5) * 0.5, Math.sin(a) * 0.22));
      out.lerp(coilPt, Math.min(1, k * 3) * this.grip);
    }
    return out;
  }

  update(t: number) {
    this.mesh.visible = this.suckers.visible = this.reach > 0.01;
    if (!this.mesh.visible) return;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < SEGS; i++) {
      const s0 = i / SEGS;
      const s1 = (i + 1) / SEGS;
      this.point(s0, t, a);
      this.point(s1, t, b);
      const d = b.clone().sub(a);
      const len = d.length() + 0.02;
      const r = this.thickness * Math.pow(1 - s0, 0.85) + 0.02;
      this.tmp.position.copy(a).add(b).multiplyScalar(0.5);
      this.tmp.quaternion.setFromUnitVectors(up, d.normalize());
      this.tmp.scale.set(r, len, r);
      this.tmp.updateMatrix();
      this.mesh.setMatrixAt(i, this.tmp.matrix);
      // Two suckers per segment on the underside.
      const under = new THREE.Vector3(0, 0, -1).applyQuaternion(this.tmp.quaternion);
      for (let k = 0; k < 2; k++) {
        const sp = new THREE.Object3D();
        sp.position.copy(a).lerp(b, 0.25 + k * 0.5).addScaledVector(under, r * 0.92);
        sp.quaternion.setFromUnitVectors(up, under);
        sp.scale.setScalar(r * 0.32);
        sp.updateMatrix();
        this.suckers.setMatrixAt(i * 2 + k, sp.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.suckers.instanceMatrix.needsUpdate = true;
  }

  tip(t: number) {
    return this.point(1, t);
  }
}

export class Lusca {
  readonly root = new THREE.Group();
  readonly tentacles: Tentacle[] = [];
  private bodyMesh: THREE.Mesh;
  private eyes: THREE.Mesh[] = [];
  /** 0 = deep, 1 = just under the surface. */
  emerge = 0;
  /** When set, the body sits at this world height instead of in the pool. */
  depthOverride: number | null = null;
  private t = 0;

  constructor(
    scene: THREE.Scene,
    readonly centre: THREE.Vector3,
    readonly floorY: number,
  ) {
    const skinMap = T.fleshTexture();
    const skin = new THREE.MeshPhysicalMaterial({ map: skinMap, color: 0x3a4640, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.6, sheenColor: new THREE.Color(0x6a8a7a) });
    const suckerMat = new THREE.MeshPhysicalMaterial({ color: 0xc8b4a4, roughness: 0.3, clearcoat: 0.8 });
    this.bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), skin);
    this.bodyMesh.scale.set(3.4, 1.2, 4.6);
    this.root.add(this.bodyMesh);
    // Stolen eyes: human eyes of different sizes and colours, set into the mantle.
    const irisCols = [0x3a2a1a, 0x2a4a6a, 0x4a6a3a, 0x1a1a1a, 0x6a4a2a];
    for (let i = 0; i < 17; i++) {
      const a = (i / 17) * Math.PI * 2 + Math.random() * 0.3;
      const ring = 0.45 + Math.random() * 0.4;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11 + Math.random() * 0.05, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0xeee8dc, roughness: 0.05, clearcoat: 1 }));
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshStandardMaterial({ color: irisCols[i % irisCols.length], roughness: 0.2 }));
      iris.position.z = 0.07;
      iris.scale.z = 0.4;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      pupil.position.z = 0.1;
      eye.add(iris, pupil);
      const p = new THREE.Vector3(Math.cos(a) * ring * 3.2, 1.0, Math.sin(a) * ring * 4.2);
      eye.position.copy(p);
      eye.lookAt(p.clone().multiplyScalar(1.5).setY(4));
      this.root.add(eye);
      this.eyes.push(eye);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const base = new THREE.Vector3(Math.cos(a) * 2.6, 0.3, Math.sin(a) * 3.6);
      const ten = new Tentacle(base, 6 + Math.random() * 3, 0.32, skin, suckerMat);
      this.tentacles.push(ten);
      scene.add(ten.mesh, ten.suckers);
    }
    this.root.position.copy(centre).setY(floorY - 2);
    scene.add(this.root);
    this.root.visible = false;
  }

  /** Tentacle bases in world space follow the body. */
  update(dt: number) {
    this.t += dt;
    this.root.visible = this.emerge > 0.01;
    const y = this.depthOverride ?? THREE.MathUtils.lerp(this.floorY - 2.5, this.floorY + 0.25, this.emerge);
    this.root.position.y = y + Math.sin(this.t * 0.7) * 0.08;
    this.bodyMesh.rotation.y = Math.sin(this.t * 0.2) * 0.2;
    this.tentacles.forEach((ten, i) => {
      const a = (i / 8) * Math.PI * 2 + this.bodyMesh.rotation.y;
      ten.base.set(this.root.position.x + Math.cos(a) * 2.6, this.root.position.y + 0.6, this.root.position.z + Math.sin(a) * 3.6);
      ten.update(this.t);
    });
    for (const [i, e] of this.eyes.entries()) {
      // Eyes roll independently, then all snap to the same point.
      const k = Math.sin(this.t * 0.6 + i) > 0.95 ? 0 : Math.sin(this.t * 1.7 + i * 3) * 0.5;
      e.rotation.z = k;
    }
  }

  /** All eyes turn to look at a world point. */
  stare(p: THREE.Vector3) {
    this.root.updateMatrixWorld(true);
    for (const e of this.eyes) e.lookAt(p);
  }

  get time() {
    return this.t;
  }
}
