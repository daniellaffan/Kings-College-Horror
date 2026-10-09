// The corruption director: per-frame Act II effects that make the RPG lie to the player.
// Everything here stays inside the game: its own UI, audio and world.
import * as THREE from 'three';
import { audio } from '../engine/audio';
import type { Game } from '../game';

export class Director {
  /** Footsteps that follow yours, and stop one step after you do. */
  echoSteps = false;
  /** Whispers placed just behind the listener. */
  whispers = false;
  /** HP is "oxygen" and drains (never below 18: it never actually kills you). */
  oxygen = false;
  /** Amara's friendship meter drains to nothing. */
  amaraFade = false;
  /** Students stop and watch the player. */
  stare = false;
  private lastStep = 0;
  private echoQueue: number[] = [];
  private stepsAfterStop = 0;
  private whisperT = 20;
  private lastGlitch = -10;
  private pauseFigure = false;

  constructor(private g: Game) {}

  install() {
    this.g.hooks.set('director', (dt, t) => this.update(dt, t));
  }

  reset() {
    this.echoSteps = this.whispers = this.oxygen = this.amaraFade = this.stare = false;
    this.echoQueue = [];
    this.g.leakyPause = false;
    this.g.ui.mapLies = 0;
    this.g.r.chroma.offset.set(0.0004, 0.0002);
    this.g.r.noise.blendMode.opacity.value = 0.12;
  }

  /** A visual/audio glitch. Rate-limited to at most one every 1.2 s (photosensitivity). */
  glitch(strength = 1) {
    const now = this.g.time;
    if (now - this.lastGlitch < 1.2) return;
    this.lastGlitch = now;
    audio.glitch(0.25 + strength * 0.2);
    const r = this.g.r;
    const k = this.g.atmo.reduceFlashes ? 0.3 : 1;
    r.chroma.offset.set(0.012 * strength * k, 0.006 * strength * k);
    r.noise.blendMode.opacity.value = 0.12 + 0.5 * strength * k;
    setTimeout(() => {
      r.chroma.offset.set(0.0004, 0.0002);
      r.noise.blendMode.opacity.value = 0.12;
    }, 260);
  }

  private update(dt: number, t: number) {
    const g = this.g;
    const p = g.player;

    if (this.echoSteps) {
      // Detect the player's own steps from audio cadence (moving at walking pace).
      if (p.moving) {
        this.stepsAfterStop = 1;
        if (t - this.lastStep > (p.sprinting ? 0.38 : 0.55)) {
          this.lastStep = t;
          this.echoQueue.push(t + 0.33);
        }
      } else if (this.stepsAfterStop > 0 && t - this.lastStep > 0.6) {
        this.stepsAfterStop--;
        this.lastStep = t;
        this.echoQueue.push(t + 0.2);
      }
      while (this.echoQueue.length && this.echoQueue[0] <= t) {
        this.echoQueue.shift();
        audio.footstep('hard', 0.35);
      }
    }

    if (this.whispers) {
      this.whisperT -= dt;
      if (this.whisperT <= 0) {
        this.whisperT = 16 + Math.random() * 20;
        const behind = p.forward().setY(0).normalize().multiplyScalar(-1.3).add(g.r.camera.position);
        audio.whisper(behind, 2.2);
      }
    }

    if (this.oxygen) {
      const nearWater = g.near('poolCentre', 30) || g.near('archiveDrain', 6) || g.near('corridorDrain', 5);
      const target = 18;
      if (g.rpg.hp > target) g.rpg.hp = Math.max(target, g.rpg.hp - dt * (nearWater ? 2.2 : 0.35));
      if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) g.rpg.changed();
    }

    if (this.amaraFade && (g.rpg.friendship.amara ?? 0) > 0) {
      g.rpg.friendship.amara = Math.max(0, g.rpg.friendship.amara - dt * 6);
      if (Math.floor(t) !== Math.floor(t - dt)) g.rpg.changed();
    }

    if (this.stare) {
      for (const id of ['studentA', 'studentB', 'studentC', 'studentD']) {
        const c = g.npcs[id];
        if (!c.root.visible) continue;
        c.path = [];
        c.lookTarget = g.r.camera.position;
        c.uncanny = 1;
      }
    }

    // The pause menu that doesn't pause: something stands at the edge of the frame.
    if (g.leakyPause && g.ui.paused && !this.pauseFigure) {
      this.pauseFigure = true;
      const fwd = p.forward().setY(0).normalize();
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const pos = g.player.pos.clone().addScaledVector(fwd, 7).addScaledVector(side, 3.4);
      const [x, z] = g.world.resolveCircle(pos.x, pos.z, 0.3);
      g.place('wet', new THREE.Vector3(x, 0, z), g.player.pos);
      g.npcs.wet.lookTarget = g.r.camera.position;
      g.npcs.wet.uncanny = 1;
    } else if (this.pauseFigure && !g.ui.paused) {
      this.pauseFigure = false;
      g.hideNPC('wet');
    }
  }
}
