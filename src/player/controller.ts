// First-person controller: walk/sprint/crouch with stamina, head bob, surface-aware
// footsteps, hiding spots, a flashlight with a cookie texture, and scripted camera control.
import * as THREE from 'three';
import { audio } from '../engine/audio';
import type { Input } from '../engine/input';
import type { HideSpot } from '../world/academic';
import type { CollisionWorld } from '../world/collision';
import * as T from '../world/textures';

export type Surface = 'hard' | 'grass' | 'wood' | 'water';

export class Player {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  readonly radius = 0.3;
  stamina = 1;
  crouched = false;
  sensitivity = 0.0022;
  /** Freezes movement and look (cutscenes, dialogue). */
  frozen = false;
  /** Speed multiplier (Act II slows you slightly in "dream" areas). */
  speedScale = 1;
  hidden: HideSpot | null = null;
  readonly flashlight: THREE.SpotLight;
  flashlightOn = false;
  hasFlashlight = false;
  battery = 1;
  moving = false;
  sprinting = false;
  /** 0..1 noise the AI can hear this frame. */
  noise = 0;
  private bob = 0;
  private stepPhase = 0;
  private eye = 1.65;
  private look?: { target: THREE.Vector3; speed: number };
  private shake = 0;
  surfaceAt: (p: THREE.Vector3) => Surface = () => 'hard';

  constructor(
    private camera: THREE.PerspectiveCamera,
    private input: Input,
    private world: CollisionWorld,
  ) {
    this.flashlight = new THREE.SpotLight(0xfff1dc, 0, 32, THREE.MathUtils.degToRad(30), 0.45, 1.6);
    this.flashlight.map = T.cookieTexture();
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.0006;
    this.flashlight.shadow.camera.near = 0.2;
    this.flashlight.position.set(0.18, -0.2, 0.1);
    this.flashlight.target.position.set(0.05, -0.12, -2);
    camera.add(this.flashlight, this.flashlight.target);
  }

  place(p: THREE.Vector3, yaw?: number) {
    this.pos.set(p.x, 0, p.z);
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = 0;
    this.hidden = null;
  }

  /** Turns the camera smoothly toward a point (used for scripted beats). */
  lookAt(target: THREE.Vector3, speed = 3) {
    this.look = { target: target.clone(), speed };
  }

  addShake(amount: number) {
    this.shake = Math.min(1.5, this.shake + amount);
  }

  hide(spot: HideSpot) {
    this.hidden = spot;
    this.crouched = true;
  }

  unhide() {
    if (!this.hidden) return;
    this.pos.set(this.hidden.enter.x, 0, this.hidden.enter.z);
    this.hidden = null;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  update(dt: number, t: number) {
    const inp = this.input;
    if (!this.frozen && inp.locked) {
      this.yaw -= inp.mouseDX * this.sensitivity;
      this.pitch -= inp.mouseDY * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    }
    if (this.look) {
      const d = this.look.target.clone().sub(this.camera.position);
      const ty = Math.atan2(-d.x, -d.z);
      const tp = Math.atan2(d.y, Math.hypot(d.x, d.z));
      let dy = ty - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = Math.min(1, dt * this.look.speed);
      this.yaw += dy * k;
      this.pitch += (tp - this.pitch) * k;
      if (Math.abs(dy) < 0.01 && Math.abs(tp - this.pitch) < 0.01) this.look = undefined;
    }

    // Movement.
    let mx = 0;
    let mz = 0;
    this.moving = false;
    this.sprinting = false;
    if (!this.frozen && !this.hidden) {
      if (inp.held('KeyW')) mz -= 1;
      if (inp.held('KeyS')) mz += 1;
      if (inp.held('KeyA')) mx -= 1;
      if (inp.held('KeyD')) mx += 1;
      if (inp.hit('KeyC') || inp.hit('ControlLeft')) this.crouched = !this.crouched;
    }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      this.moving = true;
      this.sprinting = inp.held('ShiftLeft') && this.stamina > 0.05 && mz < 0 && !this.crouched;
      const speed = (this.crouched ? 1.4 : this.sprinting ? 5.4 : 2.7) * this.speedScale;
      const s = Math.sin(this.yaw);
      const c = Math.cos(this.yaw);
      const dx = (mx * c + mz * s) * speed * dt;
      const dz = (-mx * s + mz * c) * speed * dt;
      const [nx, nz] = this.world.resolveCircle(this.pos.x + dx, this.pos.z + dz, this.radius);
      this.pos.x = nx;
      this.pos.z = nz;
    }
    this.stamina = THREE.MathUtils.clamp(this.stamina + (this.sprinting ? -0.16 : 0.1) * dt, 0, 1);

    // Eye height, bob and footsteps.
    const targetEye = this.hidden ? 0.45 : this.crouched ? 1.0 : 1.65;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 8);
    const stride = this.sprinting ? 2.1 : this.crouched ? 0.9 : 1.5;
    if (this.moving) {
      this.bob += dt * (this.sprinting ? 12 : 8);
      this.stepPhase += (dt * (this.sprinting ? 5.4 : this.crouched ? 1.4 : 2.7)) / stride;
      if (this.stepPhase >= 1) {
        this.stepPhase -= 1;
        audio.footstep(this.surfaceAt(this.pos), this.sprinting ? 1.4 : this.crouched ? 0.35 : 0.8);
      }
    } else this.bob *= 0.9;
    this.noise = this.moving ? (this.sprinting ? 1 : this.crouched ? 0.15 : 0.45) : 0;

    const amp = this.moving ? (this.sprinting ? 0.05 : 0.025) : 0;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sh = this.shake * this.shake;
    if (this.hidden) {
      this.camera.position.copy(this.hidden.cam);
    } else {
      this.camera.position.set(this.pos.x, this.eye + Math.sin(this.bob * 2) * amp, this.pos.z);
    }
    this.camera.position.x += (Math.random() - 0.5) * sh * 0.08;
    this.camera.position.y += (Math.random() - 0.5) * sh * 0.08;
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.camera.rotation.y = this.yaw + Math.cos(this.bob) * amp * 0.2;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = Math.cos(this.bob) * amp * 0.15 + (Math.random() - 0.5) * sh * 0.03;

    // Flashlight.
    if (this.hasFlashlight && !this.frozen && inp.hit('KeyF')) {
      this.flashlightOn = !this.flashlightOn;
      audio.ui('blip');
    }
    if (this.flashlightOn) this.battery = Math.max(0, this.battery - dt / 900);
    const flick = this.battery < 0.15 ? (Math.sin(t * 23) * Math.sin(t * 7.7) > 0.6 ? 0.2 : 1) : 1;
    this.flashlight.intensity = this.flashlightOn && this.battery > 0 ? 38 * flick : 0;
    this.flashlight.visible = this.flashlight.intensity > 0;
  }
}
