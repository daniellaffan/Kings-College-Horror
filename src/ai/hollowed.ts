// The Hollowed: groundskeeper Tally Sands, worn by the Lusca. Patrols, hears noise, sees the
// player (unless hidden), chases with A* on the nav grid, searches, and is driven off by flares.
import * as THREE from 'three';
import { audio } from '../engine/audio';
import type { Character } from '../characters/humanoid';
import type { Player } from '../player/controller';
import type { CollisionWorld } from '../world/collision';
import type { NavGrid } from '../world/navgrid';

export type HollowedState = 'dormant' | 'scripted' | 'patrol' | 'investigate' | 'chase' | 'search' | 'repelled';

export class Hollowed {
  state: HollowedState = 'dormant';
  private repath = 0;
  private stateTime = 0;
  private lastSeen = new THREE.Vector3();
  private patrolIdx = 0;
  private breath?: { move(p: THREE.Vector3): void; stop(): void };
  patrol: THREE.Vector3[] = [];
  /** Position of a burning flare, if any. */
  flare: THREE.Vector3 | null = null;
  onCatch: () => void = () => undefined;
  /** Seconds it stands and roars before a chase starts moving (gives the player a beat to react). */
  windup = 0;
  /** Set when the player is in view (for the UI/music). */
  sees = false;

  constructor(
    readonly body: Character,
    private nav: NavGrid,
    private world: CollisionWorld,
    private player: Player,
  ) {}

  get pos() {
    return this.body.root.position;
  }

  activate(state: HollowedState = 'patrol') {
    this.set(state);
    this.body.root.visible = true;
    this.breath ??= audio.breath(this.pos);
  }

  deactivate() {
    this.state = 'dormant';
    this.windup = 0;
    this.body.path = [];
    this.breath?.stop();
    this.breath = undefined;
  }

  private set(s: HollowedState) {
    this.state = s;
    this.stateTime = 0;
    this.repath = 0;
  }

  private goTo(target: THREE.Vector3) {
    const path = this.nav.findPath(this.pos.x, this.pos.z, target.x, target.z);
    this.body.path = path ? path.map(([x, z]) => new THREE.Vector3(x, 0, z)) : [target.clone()];
  }

  private canSee(): boolean {
    const p = this.player;
    if (p.hidden) return false;
    const d = this.pos.distanceTo(p.pos);
    const range = p.flashlightOn ? 22 : p.crouched ? 8 : 15;
    if (d > range) return false;
    const fwd = new THREE.Vector3(Math.sin(this.body.root.rotation.y), 0, Math.cos(this.body.root.rotation.y));
    const to = p.pos.clone().sub(this.pos).setY(0).normalize();
    if (d > 2.5 && fwd.dot(to) < Math.cos(THREE.MathUtils.degToRad(70))) return false;
    return this.world.lineOfSight(this.pos.x, this.pos.z, p.pos.x, p.pos.z, 1.5);
  }

  update(dt: number) {
    if (this.state === 'dormant' || this.state === 'scripted') return;
    this.stateTime += dt;
    this.breath?.move(this.pos.clone().setY(1.6));
    const p = this.player;
    this.sees = this.canSee();
    const heard = p.noise > 0 && this.pos.distanceTo(p.pos) < p.noise * 16;

    // Flares win over everything.
    if (this.flare && this.flare.distanceTo(this.pos) < 9 && this.state !== 'repelled') {
      this.set('repelled');
      const away = this.pos.clone().sub(this.flare).setY(0).normalize().multiplyScalar(10).add(this.pos);
      this.goTo(away);
      this.body.walkSpeed = 4.2;
      audio.luscaRoar(this.pos.clone().setY(1.6));
    }

    switch (this.state) {
      case 'patrol':
        this.body.walkSpeed = 1.1;
        if (!this.body.path.length && this.patrol.length) {
          this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
          this.goTo(this.patrol[this.patrolIdx]);
        }
        if (this.sees) this.set('chase');
        else if (heard) {
          this.lastSeen.copy(p.pos);
          this.set('investigate');
          this.goTo(this.lastSeen);
        }
        break;
      case 'investigate':
        this.body.walkSpeed = 1.8;
        if (this.sees) this.set('chase');
        else if (!this.body.path.length || this.stateTime > 12) this.set('search');
        break;
      case 'chase':
        if (this.windup > 0) {
          this.windup -= dt;
          this.body.path = [];
          this.body.lookTarget = p.pos;
          break;
        }
        this.body.walkSpeed = p.sprinting ? 4.6 : 3.6;
        this.repath -= dt;
        if (this.sees) this.lastSeen.copy(p.pos);
        if (this.repath <= 0) {
          this.repath = 0.35;
          this.goTo(this.lastSeen);
        }
        if (!this.sees && this.pos.distanceTo(this.lastSeen) < 1) this.set('search');
        if (this.pos.distanceTo(p.pos) < 0.95 && !p.hidden) this.onCatch();
        break;
      case 'search':
        this.body.walkSpeed = 1.2;
        if (this.sees) this.set('chase');
        else if (!this.body.path.length) {
          if (this.stateTime > 10) this.set('patrol');
          else {
            const r = this.lastSeen.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
            this.goTo(r);
          }
        }
        break;
      case 'repelled':
        if (this.stateTime > 5) {
          this.body.walkSpeed = 1.2;
          this.set('search');
        }
        break;
    }
  }
}
