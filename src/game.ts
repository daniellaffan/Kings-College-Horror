// Game: builds the world and runs the frame loop. Story beats (src/story) and the mind
// director (src/mind) drive it through the helpers exposed here.
import * as THREE from 'three';
import campusJson from '../data/campus.json';
import { Hollowed } from './ai/hollowed';
import { Lusca } from './ai/lusca';
import { CAST, Character, type CharacterSpec } from './characters/humanoid';
import { assets } from './engine/assets';
import { audio } from './engine/audio';
import { Input } from './engine/input';
import { Renderer } from './engine/renderer';
import { Gore } from './gore/gore';
import { memory } from './mind/memory';
import { Player } from './player/controller';
import { RPG } from './rpg/state';
import { onSettings, settings } from './settings';
import { Runner } from './story/runner';
import { UI, type MapData, type Marker } from './ui/ui';
import { buildAcademic, ACADEMIC_OUTLINE, ROOMS, type AcademicRefs, type HideSpot } from './world/academic';
import { Atmosphere } from './world/atmosphere';
import { Builder } from './world/builder';
import { buildBuildings, PLANT_SHAFT, type BuildingRefs } from './world/buildings';
import { buildCampus, POOL, type CampusRefs } from './world/campus';
import { CollisionWorld } from './world/collision';
import { pointInPolygon, type CampusData, type Vec2 } from './world/geo';
import { LightPool } from './world/lights';
import { NavGrid } from './world/navgrid';
import { makeMats, type Mats } from './world/props';

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  label: string | (() => string);
  enabled?: () => boolean;
  action: () => void | Promise<void>;
}

export interface Trigger {
  id: string;
  test: () => boolean;
  fn: () => void;
  once?: boolean;
}

/** Converts a world position to the local (u, v) campus frame. */
export const toUV = (p: THREE.Vector3): Vec2 => [p.x, -p.z];

export class Game {
  readonly r: Renderer;
  readonly input: Input;
  readonly ui: UI;
  readonly rpg: RPG;
  readonly runner = new Runner();
  world = new CollisionWorld();
  lights!: LightPool;
  mats!: Mats;
  atmo!: Atmosphere;
  player!: Player;
  gore!: Gore;
  nav!: NavGrid;
  campus!: CampusRefs;
  academic!: AcademicRefs;
  buildings!: BuildingRefs;
  dynamic = new THREE.Group();
  npcs: Record<string, Character> = {};
  hollowed!: Hollowed;
  lusca!: Lusca;
  hideSpots: HideSpot[] = [];
  interactables: Interactable[] = [];
  triggers: Trigger[] = [];
  /** Per-frame hooks registered by story / director. */
  hooks = new Map<string, (dt: number, t: number) => void>();
  anchors: Record<string, THREE.Vector3> = {};
  /** Marker target override (the compass lies in Act II). */
  targetOverride: { anchor: string; label?: string } | null = null;
  playing = false;
  /** In Act II the pause menu does not pause. */
  leakyPause = false;
  showNametags = true;
  private clock = new THREE.Clock();
  private t = 0;
  private fpsAcc = { n: 0, t: 0 };
  private focus: Interactable | null = null;
  private interacting = false;
  private indoorPolys: Vec2[][] = [];
  private projected = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.r = new Renderer(container, settings.quality);
    this.input = new Input(this.r.gl.domElement);
    this.ui = new UI(document.body);
    this.rpg = new RPG(typeof localStorage === 'undefined' ? null : localStorage);
    this.rpg.onToast = (text, kind) => {
      this.ui.toast(text, kind ?? '');
      audio.ui(kind === 'gold' ? 'level' : 'quest');
    };
    this.rpg.onChange(() => this.ui.renderHUD(this.rpg, this.player?.stamina ?? 1));
    onSettings((s) => {
      audio.setVolume(s.volume);
      if (this.player) this.player.sensitivity = 0.0022 * s.sensitivity;
      if (this.atmo) this.atmo.reduceFlashes = s.reduceFlashes;
      this.ui.fps(s.showFps ? 0 : null);
    });
    this.ui.onQuality = (q) => this.r.applyQuality(q);
  }

  async load() {
    this.ui.loading(0, 'Loading photoscanned materials…');
    assets.anisotropy = this.r.spec.anisotropy;
    await assets.preload(this.r.gl, (p) => this.ui.loading(p * 0.8));
    this.ui.loading(0.85, 'Building campus from OpenStreetMap data…');
    await new Promise((r) => setTimeout(r, 30));
    this.build();
    this.ui.loading(0.95, 'Compiling shaders…');
    await new Promise((r) => setTimeout(r, 30));
    this.r.gl.compile(this.r.scene, this.r.camera);
    this.ui.loading(1);
  }

  private build() {
    const scene = this.r.scene;
    const data = campusJson as unknown as CampusData;
    this.mats = makeMats();
    this.lights = new LightPool(scene);
    const b = new Builder(this.world);
    this.campus = buildCampus(b, this.mats, this.lights, this.dynamic, data);
    this.academic = buildAcademic(b, this.mats, this.lights, this.dynamic);
    this.buildings = buildBuildings(b, this.mats, this.lights, this.dynamic, this.campus.outlines);
    scene.add(b.finalize(), this.dynamic);
    this.hideSpots = [...this.academic.hideSpots, ...this.buildings.hideSpots];
    this.anchors = { ...this.campus.anchors, ...this.academic.anchors, ...this.buildings.anchors };
    this.indoorPolys = [
      ACADEMIC_OUTLINE.filter((p) => p[1] < 45.3 || p[0] < 33 || p[0] > 53),
      this.campus.outlines.dining,
      this.campus.outlines.plant,
      [
        [-167.5, 3],
        [-164.5, 3],
        [-164.5, 6.5],
        [-167.5, 6.5],
      ],
    ];

    this.atmo = new Atmosphere(this.r);
    const m = this.mats;
    this.atmo.addWet(m.stucco, m.stuccoTint, m.asphalt, m.paving, m.concrete, m.grass, m.turf, m.track, m.hardCourt, m.padelCourt, m.forestFloor, m.roof);
    this.atmo.reduceFlashes = settings.reduceFlashes;

    this.player = new Player(this.r.camera, this.input, this.world);
    this.player.sensitivity = 0.0022 * settings.sensitivity;
    scene.add(this.r.camera);
    this.player.surfaceAt = (p) => {
      if (this.indoorAt(p)) return this.inRoom(p, ['library', 'form12', 'class13', 'staff']) ? 'wood' : 'hard';
      const [u, v] = toUV(p);
      if (u > POOL.u0 && u < POOL.u1 && v > POOL.v0 && v < POOL.v1) return 'water';
      return this.atmo.wetness > 0.5 && this.campus.surface(u, v) === 'grass' ? 'water' : this.campus.surface(u, v);
    };

    this.gore = new Gore(scene, this.ui.lens);
    this.gore.floorAt = (x, z) => {
      const [u, v] = [x, -z];
      if (u > POOL.u0 && u < POOL.u1 && v > POOL.v0 && v < POOL.v1) return POOL.water;
      const S = PLANT_SHAFT;
      if (u > S.u0 && u < S.u1 && v > S.v0 && v < S.v1) return -S.depth;
      return 0;
    };

    // Nav grid over the Academic Block, courtyard, east lawns and pool deck (the chase area).
    this.nav = new NavGrid(15, -55, 95, 30, 0.5, this.world, 0.35);

    for (const spec of Object.values(CAST)) this.addNPC(spec);
    this.hollowed = new Hollowed(this.npcs.sands, this.nav, this.world, this.player);
    this.lusca = new Lusca(scene, this.anchors.poolCentre.clone(), -POOL.depth);

    this.ui.mapData = this.mapData();
  }

  private mapData(): MapData {
    const data = campusJson as unknown as CampusData;
    const lines: MapData['lines'] = [];
    const polys: MapData['polys'] = [];
    for (const f of data.features) {
      const pts = this.campus.local(f.points);
      if (f.kind === 'road') lines.push({ pts, w: f.tags.highway === 'footway' ? 2 : f.tags.highway === 'track' ? 2 : 5, color: f.tags.highway === 'footway' ? '#d8cfbf' : '#5a5a5c' });
      else if (f.kind === 'pitch' || f.kind === 'track') polys.push({ pts, fill: '#8fcf6a' });
      else if (f.kind === 'pool') polys.push({ pts, fill: '#4fb3e0' });
    }
    for (const t of data.features.filter((f) => f.kind === 'track')) lines.push({ pts: this.campus.local(t.points), w: 7, color: '#b5523f' });
    for (const o of [ACADEMIC_OUTLINE, this.campus.outlines.arts, this.campus.outlines.dining, this.campus.outlines.plant]) polys.push({ pts: o, fill: '#f4f1ea' });
    return { lines, polys };
  }

  addNPC(spec: CharacterSpec) {
    const c = new Character(spec);
    c.root.visible = false;
    this.r.scene.add(c.root);
    this.npcs[spec.id] = c;
    return c;
  }

  /** Places an NPC at an anchor/point facing a direction or point. */
  place(id: string, at: THREE.Vector3 | string, face?: THREE.Vector3 | string) {
    const c = this.npcs[id];
    const p = typeof at === 'string' ? this.anchors[at] : at;
    c.root.position.set(p.x, 0, p.z);
    c.path = [];
    c.root.visible = true;
    if (face) c.faceTo(typeof face === 'string' ? this.anchors[face] : face);
    return c;
  }

  hideNPC(id: string) {
    this.npcs[id].root.visible = false;
    this.npcs[id].path = [];
  }

  indoorAt(p: THREE.Vector3) {
    const uv = toUV(p);
    return this.indoorPolys.some((poly) => pointInPolygon(uv, poly));
  }

  inRoom(p: THREE.Vector3, ids: string[]) {
    const [u, v] = toUV(p);
    return ROOMS.some((r) => ids.includes(r.id) && u > r.u0 && u < r.u1 && v > r.v0 && v < r.v1);
  }

  near(a: THREE.Vector3 | string, r: number) {
    const p = typeof a === 'string' ? this.anchors[a] : a;
    return Math.hypot(this.player.pos.x - p.x, this.player.pos.z - p.z) < r;
  }

  interact(i: Interactable) {
    this.interactables = this.interactables.filter((x) => x.id !== i.id);
    this.interactables.push(i);
  }

  removeInteract(id: string) {
    this.interactables = this.interactables.filter((x) => x.id !== id);
  }

  trigger(t: Trigger) {
    this.triggers = this.triggers.filter((x) => x.id !== t.id);
    this.triggers.push({ once: true, ...t });
  }

  clearScript() {
    this.interactables = [];
    this.triggers = [];
    this.hooks.clear();
    this.targetOverride = null;
  }

  // ------------------------------------------------------------ dialogue helpers
  async say(who: string, text: string, o: Parameters<UI['say']>[2] = {}) {
    this.player.frozen = true;
    try {
      await this.runner.guard(this.ui.say(who, text, o));
    } finally {
      this.player.frozen = false;
    }
  }

  async choose(who: string, text: string, options: string[], o: { wrong?: boolean } = {}) {
    this.player.frozen = true;
    try {
      return await this.runner.guard(this.ui.choose(who, text, options, o));
    } finally {
      this.player.frozen = false;
    }
  }

  endTalk() {
    this.ui.endDialogue();
    for (const c of Object.values(this.npcs)) c.talking = false;
  }

  /** A short conversation with an NPC: they face you and their mouth moves. */
  async talk(id: string, lines: (string | { text: string; hold?: number; wrong?: boolean })[], who = this.npcs[id].name) {
    const c = this.npcs[id];
    c.faceTo(this.player.pos);
    c.lookTarget = this.r.camera.position;
    this.player.lookAt(c.root.position.clone().setY(c.height - 0.12), 4);
    try {
      for (const l of lines) {
        const line = typeof l === 'string' ? { text: l } : l;
        c.talking = !line.hold;
        if (line.hold) setTimeout(() => (c.talking = true), line.hold * 1000);
        await this.say(who, line.text, { hold: line.hold, wrong: line.wrong });
      }
    } finally {
      c.talking = false;
      this.endTalk();
    }
  }

  // ------------------------------------------------------------ loop
  start() {
    this.r.gl.setAnimationLoop(() => this.frame());
  }

  private frame() {
    const raw = Math.min(this.clock.getDelta(), 0.1);
    const paused = this.ui.paused && !this.leakyPause;
    const dt = paused ? 0 : raw;
    this.t += dt;
    const t = this.t;

    if (this.playing) this.handleKeys();

    // Player is frozen while any UI owns input.
    const busy = this.ui.busy || this.ui.journalOpen || (this.ui.paused && !this.leakyPause);
    const wasFrozen = this.player.frozen;
    if (busy) this.player.frozen = true;
    if (this.playing) this.player.update(dt, t);
    this.player.frozen = wasFrozen;
    if (this.playing) this.pushFromNPCs();

    for (const c of Object.values(this.npcs)) if (c.root.visible) c.update(dt, t);
    this.hollowed.update(dt);
    this.lusca.update(dt);
    this.campus.water.update(dt);
    this.gore.update(dt);
    this.lights.update(this.r.camera.position, t);
    const indoor = this.indoorAt(this.r.camera.position) ? 1 : 0;
    this.atmo.indoor += (indoor - this.atmo.indoor) * Math.min(1, dt * 3 + (paused ? 0 : 0.02));
    this.atmo.update(dt, this.r.camera.position);
    audio.setListener(this.r.camera);
    audio.update(dt);

    if (!paused) {
      this.runner.tick(dt);
      for (const tr of [...this.triggers]) {
        if (tr.test()) {
          if (tr.once) this.triggers = this.triggers.filter((x) => x !== tr);
          tr.fn();
        }
      }
      for (const h of this.hooks.values()) h(dt, t);
    }

    if (this.playing) {
      this.updateFocus();
      this.updateNametags();
      this.updateMap();
      this.ui.stamina(this.rpg, this.player.stamina);
    }

    this.r.render(raw);
    this.input.endFrame();
    if (settings.showFps) {
      this.fpsAcc.n++;
      this.fpsAcc.t += raw;
      if (this.fpsAcc.t > 0.5) {
        this.ui.fps(this.fpsAcc.n / this.fpsAcc.t);
        this.fpsAcc = { n: 0, t: 0 };
      }
    }
  }

  private handleKeys() {
    const inp = this.input;
    if (inp.hit('Tab') && !this.ui.busy) this.ui.toggleJournal(this.rpg);
    if (!this.ui.busy && !this.ui.journalOpen && !this.ui.paused && this.focus && !this.interacting && inp.hit('KeyE')) {
      const f = this.focus;
      this.interacting = true;
      this.ui.prompt(null);
      void Promise.resolve(this.runner.run(async () => void (await f.action()))).finally(() => (this.interacting = false));
    } else if (this.player.hidden && inp.hit('KeyE') && !this.ui.busy) {
      this.player.unhide();
    }
    // Clicking the canvas re-captures the mouse.
    if (inp.clicked && !inp.locked && !this.ui.busy && !this.ui.paused && !this.ui.journalOpen) inp.lock();
  }

  /** Called when pointer lock is lost (Esc) during play. */
  openPause(onQuit: () => void) {
    if (!this.playing || this.ui.busy) return;
    this.ui.pause(
      true,
      this.leakyPause,
      () => {
        this.ui.pause(false, false, () => undefined, () => undefined);
        this.input.lock();
      },
      onQuit,
    );
  }

  private updateFocus() {
    let best: Interactable | null = null;
    let bestD = Infinity;
    const fwd = this.player.forward().setY(0).normalize();
    if (!this.player.hidden) {
      for (const i of this.interactables) {
        if (i.enabled && !i.enabled()) continue;
        const d = Math.hypot(i.pos.x - this.player.pos.x, i.pos.z - this.player.pos.z);
        if (d > i.radius) continue;
        const to = new THREE.Vector3(i.pos.x - this.player.pos.x, 0, i.pos.z - this.player.pos.z).normalize();
        if (d > 0.8 && fwd.dot(to) < 0.5) continue;
        if (d < bestD) {
          best = i;
          bestD = d;
        }
      }
      // Hiding spots are always interactable.
      if (!best) {
        for (const h of this.hideSpots) {
          const d = Math.hypot(h.enter.x - this.player.pos.x, h.enter.z - this.player.pos.z);
          if (d < 1.1 && d < bestD && this.rpg.act === 3) {
            bestD = d;
            best = { id: `hide:${h.id}`, pos: h.enter, radius: 1.1, label: 'Hide', action: () => this.player.hide(h) };
          }
        }
      }
    }
    this.focus = best;
    const label = this.player.hidden ? 'Leave hiding spot' : best ? (typeof best.label === 'function' ? best.label() : best.label) : null;
    this.ui.prompt(this.ui.busy || this.ui.journalOpen ? null : label);
  }

  private pushFromNPCs() {
    for (const c of Object.values(this.npcs)) {
      if (!c.root.visible || c.variant === 'corpse') continue;
      const dx = this.player.pos.x - c.root.position.x;
      const dz = this.player.pos.z - c.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.55 && d > 1e-4) {
        this.player.pos.x = c.root.position.x + (dx / d) * 0.55;
        this.player.pos.z = c.root.position.z + (dz / d) * 0.55;
      }
    }
  }

  private updateNametags() {
    if (!this.showNametags) return this.ui.nametags([]);
    const tags: { x: number; y: number; text: string; heart?: boolean }[] = [];
    const cam = this.r.camera;
    for (const c of Object.values(this.npcs)) {
      if (!c.root.visible || c.variant === 'corpse' || c.variant === 'hollowed' || c.spec.name === 'Student') continue;
      const d = c.root.position.distanceTo(this.player.pos);
      if (d > 9) continue;
      this.projected.copy(c.root.position).setY(c.height + 0.25).project(cam);
      if (this.projected.z > 1) continue;
      if (!this.world.lineOfSight(this.player.pos.x, this.player.pos.z, c.root.position.x, c.root.position.z, 1.9)) continue;
      const name = c.root.userData.nameOverride ?? c.name;
      if (!name) continue;
      tags.push({ x: (this.projected.x * 0.5 + 0.5) * innerWidth, y: (-this.projected.y * 0.5 + 0.5) * innerHeight, text: name, heart: c.spec.id === 'amara' && (this.rpg.friendship.amara ?? 0) > 50 });
    }
    this.ui.nametags(tags);
  }

  private updateMap() {
    const [u, v] = toUV(this.player.pos);
    const markers: Marker[] = [];
    let target: { u: number; v: number; label: string } | null = null;
    const q = this.rpg.tracked ? this.rpg.quests.get(this.rpg.tracked) : undefined;
    const key = this.targetOverride?.anchor ?? q?.def.target;
    if (key) {
      const p = key in this.npcs ? this.npcs[key].root.position : this.anchors[key];
      if (p) {
        const [tu, tv] = toUV(p);
        markers.push({ u: tu, v: tv, kind: 'quest' });
        target = { u: tu, v: tv, label: this.targetOverride?.label ?? (q?.def.title || 'Objective') };
      }
    }
    for (const c of Object.values(this.npcs)) {
      if (!c.root.visible || c.variant === 'hollowed' || c.variant === 'corpse') continue;
      const [cu, cv] = toUV(c.root.position);
      markers.push({ u: cu, v: cv, kind: 'npc' });
    }
    this.ui.drawMinimap(u, v, this.player.yaw, markers, target);
  }

  get time() {
    return this.t;
  }

  get mem() {
    return memory;
  }
}
