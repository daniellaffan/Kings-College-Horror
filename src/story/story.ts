// The story: three acts as checkpointed beats.
//   Act I   – a sincere, cheerful school RPG (first day at King's Hollow).
//   Act II  – the same day again; the RPG starts lying (loops, erased friend, wrong HUD).
//   Act III – the disguise drops: lock-in, storm, the Hollowed, the pool, the shaft.
// Every beat stages the world from scratch, so a death or a "Continue" can replay it.
import * as THREE from 'three';
import { Hollowed } from '../ai/hollowed';
import { CAST, type PartName } from '../characters/humanoid';
import { audio } from '../engine/audio';
import type { Game } from '../game';
import { Director } from '../mind/director';
import { memory } from '../mind/memory';
import { QUESTS } from '../rpg/quests';
import { settings } from '../settings';
import type { Box } from '../world/collision';
import * as T from '../world/textures';

type Beat = 'a1' | 'a2' | 'a2b' | 'a3lib' | 'a3cor' | 'a3labs' | 'a3chase' | 'a3pool' | 'a3plant' | 'end';
type Line = string | { text: string; hold?: number; wrong?: boolean };

const ORDER: Beat[] = ['a1', 'a2', 'a2b', 'a3lib', 'a3cor', 'a3labs', 'a3chase', 'a3pool', 'a3plant', 'end'];
const ACT: Record<Beat, number> = { a1: 1, a2: 2, a2b: 2, a3lib: 3, a3cor: 3, a3labs: 3, a3chase: 3, a3pool: 3, a3plant: 3, end: 3 };
const isBeat = (s: string): s is Beat => s !== 'end' && (ORDER as string[]).includes(s);
const idx = (b: Beat) => ORDER.indexOf(b);

const W = (u: number, v: number, y = 0) => new THREE.Vector3(u, y, -v);
/** Player yaw that faces from one point to another (matches Player.lookAt). */
const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
/** Runs a coroutine in the background, ignoring cancellation. */
const bg = (p: Promise<unknown>) => void p.catch(() => undefined);

const STUDENTS = ['studentA', 'studentB', 'studentC', 'studentD'];
const WALKWAY = [W(18, 55.1), W(30, 55.1), W(43.1, 57), W(56, 55.1), W(68, 55.1)];
const PENALTY_SPOT = W(145, 135.5);
const LAB_SEAT = W(57.4, 31.7);

const NOTES: { id: string; at: THREE.Vector3; title: string; body: string }[] = [
  {
    id: 'note1',
    at: W(57.6, 35.9, 0.92),
    title: 'I. Fairweather — notes (1)',
    body: 'The 1846 school was built over a blue hole. The parish records call it "the drowning term".\n\nTwelve pupils enrolled. The register for the last week lists twelve names and eleven ticks. Nobody wrote down which name had no tick.\n\nEvery year since, our register is one name short by Friday.',
  },
  {
    id: 'note2',
    at: W(55.8, 24.4, 0.92),
    title: 'I. Fairweather — notes (2)',
    body: "The pumps aren't keeping the tide out. They are keeping something in.\n\nTally says the water in the shaft is warm, and that it looks back at him.\n\nIt hates light — real light. Magnesium-white. A flare will turn it, for a little while.",
  },
  {
    id: 'note3',
    at: W(49.3, 30.0, 0.02),
    title: 'I. Fairweather — notes (3)',
    body: "FLARE: magnesium ribbon (Chem prep drawer), potassium nitrate (Biology shelf), a card casing (fume cupboard). Pack tight, strike, throw. Don't look at it.\n\nThe plant-room override code is the year.\n\nWhatever you hear down there, DON'T GO DOWN.",
  },
];

const INGREDIENTS: { id: string; name: string; label: string }[] = [
  { id: 'magnesium', name: 'Magnesium ribbon', label: 'Take magnesium ribbon' },
  { id: 'casing', name: 'Card casing', label: 'Take card casing' },
  { id: 'nitrate', name: 'Potassium nitrate', label: 'Take potassium nitrate' },
];

interface Flare {
  light: THREE.PointLight;
  mesh: THREE.Mesh;
  life: number;
  stop: () => void;
}

export class Story {
  private dir: Director;
  /** Objects a beat added to the scene; removed whenever a beat is staged. */
  private extras: THREE.Object3D[] = [];
  private underwater: THREE.Object3D[] = [];
  private door: { pivot: THREE.Group; box: Box; angle: number; target: number };
  private hatchTarget = 0;
  private ball: THREE.Mesh;
  private ballFlight: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private torch: THREE.Mesh;
  private props: Record<string, THREE.Mesh> = {};
  private boardMaps: Record<string, THREE.Texture | null> = {};
  private nbMaps: (THREE.Texture | null)[] = [];
  private nbErased?: THREE.Texture;
  /** Pre-made so throwing a flare never changes the light count (no shader recompiles). */
  private flareLights: THREE.PointLight[] = [];
  private flares: Flare[] = [];
  private flaresOn = false;
  private wander = false;
  private stopRadio: (() => void) | null = null;
  private dying = false;
  private loop = false;
  private amaraStage = 0;
  private tw = 0;

  constructor(private g: Game) {
    this.dir = new Director(g);
    g.hollowed.onCatch = () => this.die();
    const scene = g.r.scene;

    // The plant-room door (locked until Act III; slams behind you).
    const steel = new THREE.MeshStandardMaterial({ color: 0x5d6368, roughness: 0.45, metalness: 0.6 });
    const pivot = new THREE.Group();
    pivot.position.copy(W(-30.8, -65.5));
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.35, 0.06), steel);
    leaf.position.set(0.8, 1.175, 0);
    leaf.castShadow = leaf.receiveShadow = true;
    pivot.add(leaf);
    scene.add(pivot);
    const box = g.world.add({ minX: -30.8, maxX: -29.2, minZ: 65.42, maxZ: 65.58, height: 2.4, tag: 'plantDoor' });
    this.door = { pivot, box, angle: 0, target: 0 };

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
    this.ball.castShadow = true;
    scene.add(this.ball);

    this.torch = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.24, 14), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.35, metalness: 0.5 }));
    this.torch.rotation.z = Math.PI / 2;
    this.torch.position.copy(W(48.4, 17.6, 0.8));
    this.torch.castShadow = true;
    scene.add(this.torch);

    const prop = (id: string, at: THREE.Vector3, geo: THREE.BufferGeometry, color: number) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
      m.position.copy(at);
      m.castShadow = true;
      scene.add(m);
      this.props[id] = m;
    };
    prop('magnesium', W(52.3, 29.3, 0.95), new THREE.BoxGeometry(0.14, 0.03, 0.09), 0xb8bcc0);
    prop('casing', W(59.4, 35.9, 0.97), new THREE.CylinderGeometry(0.03, 0.03, 0.22, 12), 0xb08a5a);
    prop('nitrate', W(52.0, 24.2, 1.0), new THREE.CylinderGeometry(0.05, 0.05, 0.14, 14), 0xe8e8e0);
    const paper = new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.9, side: THREE.DoubleSide });
    for (const n of NOTES) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.3), paper);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.random() * 0.6 - 0.3;
      m.position.copy(n.at).setY(n.at.y + 0.005);
      scene.add(m);
      this.props[n.id] = m;
    }

    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff3a1a, 0, 16, 1.6);
      l.position.set(0, -500, 0);
      scene.add(l);
      this.flareLights.push(l);
    }

    const A = g.academic;
    for (const k of ['form12', 'class13', 'lab1'] as const) this.boardMaps[k] = (A.boards[k].material as THREE.MeshStandardMaterial).map;
    this.nbMaps = A.noticeboards.map((n) => (n.material as THREE.MeshStandardMaterial).map);
  }

  // ================================================================= title + main loop

  /** Slow fly-by of the campus behind the title menu. */
  titleScene() {
    const g = this.g;
    g.playing = false;
    g.clearScript();
    this.resetWorld();
    g.ui.hud(false);
    g.ui.prompt(null);
    g.ui.nametags([]);
    g.player.flashlightOn = false;
    g.player.flashlight.intensity = 0;
    const haunted = memory.haunted;
    g.atmo.lightningEnabled = false;
    g.atmo.set(haunted ? 'dusk' : 'day', 0);
    this.setLights(true, false, haunted, 0);
    audio.setMusic('cheer');
    audio.musicDetune = haunted ? -40 : 0;
    audio.musicWrongness = haunted ? 0.1 : 0;
    audio.musicTempo = 112;
    audio.setAmbience({ birds: haunted ? 0.2 : 1, hum: 0.1 });
    this.setStains(haunted ? 0.3 : 0);
    g.hooks.set('story', (dt) => this.tick(dt));
    this.placeStudents();
    g.place('amara', W(44.5, 48.6), W(44.5, 60));
    if (haunted) g.place('wet', W(41.5, 50.5), W(41.5, 70)).setVariant('wet');
    const c = W(45, 50);
    const cam = g.r.camera;
    let a = 2.2;
    g.hooks.set('title', (dt) => {
      a += dt * 0.03;
      cam.position.set(c.x + Math.cos(a) * 100, 42, c.z + Math.sin(a) * 100);
      cam.lookAt(c.x, 4, c.z);
    });
    void g.ui.fade(0, 1.5);
  }

  /** Plays from a new game or the last checkpoint. Resolves when the chapter ends. */
  async play(choice: 'new' | 'continue'): Promise<boolean> {
    const g = this.g;
    g.hooks.delete('title');
    let beat: Beat = 'a1';
    if (choice === 'continue' && g.rpg.loadSave(QUESTS) && isBeat(g.rpg.checkpoint)) beat = g.rpg.checkpoint;
    else {
      memory.update({ runs: memory.data.runs + 1 });
      g.rpg.reset();
    }
    g.playing = true;
    let fresh = true;
    while (beat !== 'end') {
      this.stage(beat, fresh);
      g.rpg.checkpoint = beat;
      g.rpg.save();
      if (ACT[beat] > memory.data.furthestAct) memory.update({ furthestAct: ACT[beat] });
      void g.ui.fade(0, fresh ? 1.2 : 0.6);
      const next = await this.runBeat(beat);
      if (next) {
        beat = next;
        fresh = false;
      } else {
        await this.afterDeath();
        g.rpg.loadSave(QUESTS);
        fresh = true;
      }
    }
    g.playing = false;
    g.ui.hud(false);
    g.rpg.reset();
    g.rpg.save();
    return true;
  }

  private async runBeat(b: Beat): Promise<Beat | null> {
    let next: Beat | null = null;
    const ok = await this.g.runner.run(async () => {
      next = await this.beat(b);
    });
    return ok ? next : null;
  }

  private beat(b: Beat): Promise<Beat> {
    switch (b) {
      case 'a1':
        return this.a1();
      case 'a2':
        return this.a2();
      case 'a2b':
        return this.a2b();
      case 'a3lib':
        return this.a3lib();
      case 'a3cor':
        return this.a3cor();
      case 'a3labs':
        return this.a3labs();
      case 'a3chase':
        return this.a3chase();
      case 'a3pool':
        return this.a3pool();
      case 'a3plant':
        return this.a3plant();
      default:
        return Promise.resolve('end');
    }
  }

  // ================================================================= death

  private die() {
    if (this.dying) return;
    this.dying = true;
    const g = this.g;
    g.hollowed.deactivate();
    const cam = g.r.camera.position.clone();
    g.gore.lensSplash(1.6);
    // The spray comes from where it bit, between you and it, not from the lens itself.
    const from = g.npcs.sands.root.position.clone().lerp(g.player.pos, 0.6).setY(cam.y - 0.25);
    g.gore.burst(from, new THREE.Vector3(0, 1, 0).addScaledVector(g.player.forward(), -0.5), 60, 3.5);
    audio.gore('crunch', cam);
    audio.gore('rip', cam);
    g.player.addShake(1.5);
    g.ui.redVignette.style.opacity = '1';
    g.runner.cancel();
  }

  private async afterDeath() {
    const g = this.g;
    g.endTalk();
    g.player.frozen = true;
    memory.update({ deaths: memory.data.deaths + 1 });
    await new Promise((r) => setTimeout(r, 900));
    await g.ui.fade(1, 0.8);
    g.player.frozen = false;
    g.ui.redVignette.style.opacity = '0';
    const text = memory.data.deaths > 2 ? 'YOU DROWNED. AGAIN.' : 'YOU DROWNED';
    const shown = g.ui.death(text);
    if (document.pointerLockElement) document.exitPointerLock();
    await shown;
    g.input.lock();
  }

  // ================================================================= staging

  /** Puts the world into the state a beat expects (idempotent; used for replays too). */
  private stage(beat: Beat, fresh: boolean) {
    const g = this.g;
    const i = idx(beat);
    const act = ACT[beat];
    g.clearScript();
    this.dir.install();
    g.hooks.set('story', (dt) => this.tick(dt));
    g.endTalk();
    if (g.ui.journalOpen) g.ui.toggleJournal(g.rpg, false);
    this.resetWorld();
    if (act === 3) this.dir.whispers = true;
    if (act === 3 && i <= idx('a3pool')) g.npcs.sands.setVariant('hollowed');
    g.campus.water.uniforms.blood.value = i >= idx('a3plant') && g.gore.enabled ? 1 : 0;

    // Player.
    const p = g.player;
    p.frozen = false;
    p.crouched = false;
    p.stamina = 1;
    p.hasFlashlight = i > idx('a3lib');
    if (fresh) p.battery = 1;
    p.flashlightOn = p.hasFlashlight && (fresh || p.flashlightOn);
    if (fresh || i <= idx('a3lib')) this.placePlayer(...this.startOf(beat));

    // RPG presentation.
    const rpg = g.rpg;
    rpg.act = act;
    rpg.statNames = { charm: beat === 'a2b' ? 'Breath' : 'Charm', grit: 'Grit', wits: 'Wits' };
    rpg.hpLabel = beat === 'a2b' ? 'OXYGEN' : 'HP';
    rpg.hp = 100;
    // The lock-in journal starts clean: the "days" were never real.
    if (act === 3) for (const id of [...rpg.quests.keys()]) if (!['lockin', 'pratt', 'flare', 'override'].includes(id)) rpg.remove(id);
    rpg.changed();
    g.ui.hud(true);
    g.ui.hudEl.classList.toggle('minimal', act === 3);
    g.showNametags = act < 3;

    // Sky, lights, sound.
    g.atmo.lightningEnabled = act === 3;
    g.atmo.set(beat === 'a1' || beat === 'a2' ? 'day' : beat === 'a2b' ? 'overcast' : 'storm', 0);
    this.setLights(act < 3 || beat === 'a3lib', act === 3 && beat !== 'a3lib', act === 3 || beat === 'a2b', act === 3 ? 0.12 : beat === 'a2b' ? 0.2 : 0);
    if (act === 3) audio.setMusic('drone');
    else {
      audio.setMusic('cheer');
      audio.musicDetune = beat === 'a1' ? 0 : beat === 'a2' ? -50 : -100;
      audio.musicWrongness = beat === 'a1' ? 0 : beat === 'a2' ? 0.12 : 0.3;
      audio.musicTempo = beat === 'a1' ? 112 : beat === 'a2' ? 106 : 96;
    }
    audio.setAmbience({ birds: beat === 'a1' ? 1 : beat === 'a2' ? 0.35 : 0, hum: act === 3 ? 0.4 : 0.12 });

    // Set dressing that changes as the days "repeat".
    this.setStains(beat === 'a1' ? 0 : beat === 'a2' ? 0.25 : beat === 'a2b' ? 0.6 : 0.95);
    this.setNoticeboards(act === 1 || beat === 'a2' ? 'normal' : 'erased');
    if (beat === 'a2') this.setBoard('form12', ['Welcome, Year 12!', 'Form 12 · Room 12', 'Welcome back, Kai.', 'Have a great first day :)']);
    else if (beat === 'a2b') this.setBoard('form12', ['Welcome back, Kai.', 'Welcome back, Kai.', 'Welcome back, Kai.', 'Have a great first day :)']);
    else if (act === 3) this.setBoard('form12', ['', 'Stay.', '', 'It is the first day.']);
    if (beat === 'a2b') this.setBoard('lab1', ['Chemistry — Ms. Fairweather', 'Lesson: Nassau, 1846', 'Twelve pupils. One term.'], '#0b5a2a');
    else if (act === 3) this.setBoard('lab1', ['Twelve went in.', 'Eleven came out.', 'Limestone + water = hollow'], '#0b5a2a');

    this.ball.visible = act === 1 || beat === 'a2';
    this.torch.visible = beat === 'a3lib';
    for (const id of [...INGREDIENTS.map((x) => x.id), ...NOTES.map((n) => n.id)]) this.props[id].visible = beat === 'a3labs';
    if (i >= idx('a3cor')) this.stageCorpse();
  }

  /** Clears everything the story changes in the shared world. */
  private resetWorld() {
    const g = this.g;
    this.dying = false;
    this.wander = false;
    this.flaresOn = false;
    this.loop = false;
    this.amaraStage = 0;
    this.dir.reset();
    for (const o of [...this.extras, ...this.underwater]) o.parent?.remove(o);
    this.extras = [];
    this.underwater = [];
    g.gore.clearAll();
    for (const f of this.flares) this.removeFlare(f);
    this.flares = [];
    this.stopRadio?.();
    this.stopRadio = null;
    g.atmo.rain.visible = true;
    audio.setUnderwater(0);
    g.ui.redVignette.style.opacity = '0';
    g.targetOverride = null;

    for (const id of Object.keys(CAST)) this.freshen(id);
    g.hollowed.deactivate();
    g.hollowed.flare = null;
    g.hollowed.patrol = [];
    this.resetLusca();
    g.campus.water.uniforms.blood.value = 0;
    g.campus.water.uniforms.disturb.value = 0;

    this.door.target = this.door.angle = 0;
    this.door.pivot.rotation.y = 0;
    this.door.box.enabled = true;
    this.hatchTarget = 0;
    g.buildings.hatch.rotation.x = 0;
    g.buildings.shaftBlock.enabled = true;

    const p = g.player;
    p.unhide();
    p.speedScale = 1;

    this.ball.position.copy(PENALTY_SPOT).setY(0.11);
    this.ballFlight = null;
    this.torch.visible = false;
    for (const m of Object.values(this.props)) m.visible = false;
    this.setStains(0);
    this.setNoticeboards('normal');
    this.setBoard('form12');
    this.setBoard('lab1');
  }

  /** Characters that were wet, hollowed, posed or dismembered are rebuilt clean. */
  private freshen(id: string) {
    const g = this.g;
    const old = g.npcs[id];
    if (old.variant !== 'normal' || old.missing.size || old.pose !== 'stand') {
      old.root.parent?.remove(old.root);
      const c = g.addNPC(CAST[id]);
      if (id === 'sands') {
        g.hollowed.deactivate();
        g.hollowed = new Hollowed(c, g.nav, g.world, g.player);
        g.hollowed.onCatch = () => this.die();
      }
    }
    const c = g.npcs[id];
    g.hideNPC(id);
    c.root.position.y = 0;
    c.root.rotation.set(0, 0, 0);
    c.uncanny = 0;
    c.lookTarget = undefined;
    c.walkSpeed = 1.3;
    c.talking = false;
    delete c.root.userData.nameOverride;
  }

  private resetLusca() {
    const L = this.g.lusca;
    L.emerge = 0;
    L.depthOverride = null;
    L.root.position.x = L.centre.x;
    L.root.position.z = L.centre.z;
    for (const t of L.tentacles) {
      t.reach = 0;
      t.target = null;
      t.grip = 0;
      t.coil = null;
    }
  }

  private setLights(interior: boolean, emergency: boolean, street: boolean, flicker: number) {
    const L = this.g.lights;
    L.setPowered('interior', interior);
    L.setPowered('emergency', emergency);
    L.setPowered('street', street);
    L.setPowered('pool', true);
    L.setFlicker(flicker);
  }

  private setStains(opacity: number) {
    const mat = this.g.academic.stains[0]?.material as THREE.MeshStandardMaterial | undefined;
    if (mat) mat.opacity = opacity;
  }

  private setNoticeboards(kind: 'normal' | 'erased') {
    this.g.academic.noticeboards.forEach((n, i) => {
      const m = n.material as THREE.MeshStandardMaterial;
      m.map = kind === 'normal' ? this.nbMaps[i] : (this.nbErased ??= T.noticeboardTexture({ title: 'WELCOME WEEK', erased: true, wet: 0.7 }));
      m.needsUpdate = true;
    });
  }

  private setBoard(k: 'form12' | 'class13' | 'lab1', lines?: string[], color?: string) {
    const m = this.g.academic.boards[k].material as THREE.MeshStandardMaterial;
    if (m.map && m.map !== this.boardMaps[k]) m.map.dispose();
    m.map = lines ? T.whiteboardTexture(lines, color) : this.boardMaps[k];
    m.needsUpdate = true;
  }

  private startOf(b: Beat): [THREE.Vector3, number] {
    const A = this.g.anchors;
    switch (b) {
      case 'a1':
      case 'a2':
        return [A.spawn, Math.PI];
      case 'a2b':
        return [W(39, 0.6), 0];
      case 'a3lib':
        return [A.libraryStart, yawTo(A.libraryStart, A.libraryDesk)];
      case 'a3cor':
        return [W(49.8, 19.4), 0];
      case 'a3labs':
        return [A.corridorBNorth, -Math.PI / 2];
      case 'a3chase':
        return [A.flareStation, yawTo(A.flareStation, W(52.3, 33.2))];
      case 'a3pool':
        return [A.poolGate, Math.PI];
      default:
        return [A.plantDoor, Math.PI];
    }
  }

  private placePlayer(at: THREE.Vector3, yaw: number) {
    const [x, z] = this.g.world.resolveCircle(at.x, at.z, 0.3);
    this.g.player.place(new THREE.Vector3(x, 0, z), yaw);
  }

  /** Mr. Pratt at the foot of the stairwell, and the trail from the drain. */
  private stageCorpse() {
    const g = this.g;
    const c = g.place('pratt', W(55.9, 40.6), W(50, 40.6));
    c.setVariant('corpse');
    c.pose = 'lie';
    c.update(0, 0);
    c.root.updateMatrixWorld(true);
    const torso = c.parts.torso.getWorldPosition(new THREE.Vector3());
    const gut = g.gore.intestines(torso.clone().setY(0.25), W(53.5, 39.0), 2.4);
    this.extras.push(gut);
    g.gore.pool(torso.x, torso.z, 2.4);
    g.gore.wallDecal(W(55.25, 41.8, 1.3), new THREE.Vector3(1, 0, 0), 1.4);
    for (const [u, v] of [
      [50.1, 24.5],
      [50.0, 28.5],
      [50.2, 32.5],
      [50.4, 36.2],
      [52.5, 38.3],
      [54.6, 39.2],
    ])
      g.gore.floorDecal(u, -v, 1.1, 'smear');
  }

  // ================================================================= per-frame + helpers

  private tick(dt: number) {
    const g = this.g;
    const d = this.door;
    d.angle += (d.target - d.angle) * Math.min(1, dt * (d.target === 0 ? 14 : 2.5));
    d.pivot.rotation.y = d.angle;
    const h = g.buildings.hatch;
    h.rotation.x += (this.hatchTarget - h.rotation.x) * Math.min(1, dt * 1.6);

    if (this.ballFlight) {
      const f = this.ballFlight;
      f.t = Math.min(1, f.t + dt / 0.55);
      this.ball.position.lerpVectors(f.from, f.to, f.t);
      this.ball.position.y += Math.sin(f.t * Math.PI) * 0.6;
      this.ball.rotation.x += dt * 20;
      if (f.t >= 1) this.ballFlight = null;
    }

    if (this.wander && !this.dir.stare) {
      for (const id of STUDENTS) {
        const c = g.npcs[id];
        if (!c.root.visible || c.path.length || Math.random() > dt * 0.15) continue;
        const to = WALKWAY[Math.floor(Math.random() * WALKWAY.length)].clone();
        c.moveTo(to.add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.2)));
      }
    }

    if (this.flaresOn && g.playing && !g.ui.busy && !g.ui.paused && g.input.hit('KeyQ')) this.throwFlare();
    for (const f of [...this.flares]) {
      f.life -= dt;
      f.light.intensity = 30 * Math.min(1, f.life) * (0.8 + Math.random() * 0.4);
      if (f.life <= 0) {
        this.removeFlare(f);
        this.flares = this.flares.filter((x) => x !== f);
      }
    }
  }

  private throwFlare() {
    const g = this.g;
    const item = g.rpg.inventory.find((i) => i.id.startsWith('flare'));
    const light = this.flareLights.find((l) => !this.flares.some((f) => f.light === l));
    if (!item || !light) {
      audio.ui('error');
      g.ui.toast('No flares left', 'wrong');
      return;
    }
    g.rpg.take(item.id);
    const fwd = g.player.forward().setY(0).normalize();
    const [x, z] = g.world.resolveCircle(g.player.pos.x + fwd.x * 3, g.player.pos.z + fwd.z * 3, 0.1);
    this.lightFlare(light, x, z);
  }

  /** Light a flare on the ground at (x, z) using one of the pre-made lights. */
  private lightFlare(light: THREE.PointLight, x: number, z: number, y = 0) {
    const g = this.g;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2a10, emissiveIntensity: 6 }));
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(x, y + 0.03, z);
    g.r.scene.add(mesh);
    light.position.set(x, y + 0.3, z);
    this.flares.push({ light, mesh, life: 25, stop: audio.flare() });
    g.hollowed.flare = mesh.position;
  }

  private removeFlare(f: Flare) {
    f.stop();
    f.light.intensity = 0;
    f.light.position.set(0, -500, 0);
    f.mesh.parent?.remove(f.mesh);
    if (this.g.hollowed.flare === f.mesh.position) this.g.hollowed.flare = null;
  }

  /** Runs `fn(k)` with k going 0 → 1 over `seconds` of game time. */
  private tween(seconds: number, fn: (k: number) => void): Promise<void> {
    const g = this.g;
    const id = `tw${this.tw++}`;
    let t = 0;
    fn(0);
    g.hooks.set(id, (dt) => {
      t += dt;
      fn(Math.min(1, t / seconds));
      if (t >= seconds) g.hooks.delete(id);
    });
    return g.runner.until(() => !g.hooks.has(id));
  }

  /** Calls `fn` once after `seconds` of game time (cleared when the beat changes). */
  private after(seconds: number, fn: () => void) {
    const g = this.g;
    const t0 = g.time;
    g.trigger({ id: `after${this.tw++}`, test: () => g.time - t0 > seconds, fn });
  }

  /** Radio static with subtitles. */
  private async radio(who: string, lines: [string, number][]) {
    const g = this.g;
    this.stopRadio?.();
    this.stopRadio = audio.radio();
    try {
      for (const [text, s] of lines) {
        g.ui.subtitle(who, text, s);
        await g.runner.wait(s);
      }
    } finally {
      this.stopRadio?.();
      this.stopRadio = null;
    }
  }

  /** Registers an NPC as talkable. */
  private npc(id: string, label: string, fn: () => Promise<void>, enabled: () => boolean = () => true) {
    const c = this.g.npcs[id];
    this.g.interact({ id: `npc:${id}`, pos: c.root.position, radius: 2.3, label, enabled: () => c.root.visible && enabled(), action: fn });
  }

  /** A dialogue choice spoken by an NPC (they face you while you decide). */
  private async ask(id: string, text: string, options: string[]) {
    const g = this.g;
    const c = g.npcs[id];
    c.faceTo(g.player.pos);
    c.lookTarget = g.r.camera.position;
    g.player.lookAt(c.root.position.clone().setY(c.height - 0.12), 4);
    try {
      return await g.choose(c.name, text, options);
    } finally {
      g.endTalk();
    }
  }

  private async narrate(text: string, o: { hold?: number; wrong?: boolean } = {}) {
    await this.g.say('', text, o);
    this.g.endTalk();
  }

  private placeStudents() {
    STUDENTS.forEach((id, k) => {
      const c = this.g.place(id, WALKWAY[k + 1].clone(), WALKWAY[k]);
      c.walkSpeed = 1.05 + k * 0.08;
    });
    this.wander = true;
  }

  /** A route through the nav grid via waypoints. */
  private route(pts: THREE.Vector3[]) {
    const out: THREE.Vector3[] = [];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1];
      const b = pts[k];
      const path = this.g.nav.findPath(a.x, a.z, b.x, b.z);
      if (path) for (const [x, z] of path) out.push(new THREE.Vector3(x, 0, z));
      else out.push(b.clone());
    }
    return out;
  }

  // ================================================================= ACT I + II: the school day

  /** NPCs and interactions for "Day 1". In the loop (Act II) the same day plays back wrong. */
  private setupDay(loop: boolean) {
    const g = this.g;
    const rpg = g.rpg;
    this.loop = loop;
    this.amaraStage = 0;
    this.placeStudents();

    // Amara waits on the porch of the Academic Block.
    g.place('amara', W(44.5, 48.6), W(30, 55));
    this.npc('amara', 'Talk to Amara', async () => {
      if (this.amaraStage === 0) await this.amaraPorch(loop);
      else if (this.amaraStage === 1) await g.talk('amara', ['Form Room 12! Inside, along the main corridor, on the left.']);
      else if (this.amaraStage === 2) await g.talk('amara', ['Library, pitch, café. Then come find me in the courtyard!']);
      else if (this.amaraStage === 3) await this.amaraBench();
      else await g.talk('amara', ["See you in Chemistry. I'll save you a seat."]);
    });

    // Mr. Pratt at the gate booth.
    g.place('pratt', 'boothDoor', 'gateInside');
    this.npc('pratt', 'Talk to Mr. Pratt', async () => {
      const lines: Line[] = ['Morning, young man. Desmond Pratt, security.', "Gate shuts at four o'clock sharp. Don't let me catch you climbing it."];
      if (loop) lines.push({ text: "Have you seen Tally? Groundskeeper. Didn't clock in this morning.", hold: 0.6 }, { text: "...You're wet, son.", hold: 2.2 });
      await g.talk('pratt', lines);
    });

    // Tally Sands by the plant room (Act I only — by Act II he has gone).
    if (!loop) {
      g.place('sands', W(-33, -62), 'plantDoor');
      this.npc('sands', 'Talk to Tally', () =>
        g.talk('sands', ['Tally Sands. I keep the grounds.', "Plant room's off limits, youngster. Pumps are playing up.", "Tide's been coming up the drains all week. Warm, too. Sea shouldn't be warm like that."]),
      );
    }
    g.interact({
      id: 'plantLocked',
      pos: W(-30, -65.2),
      radius: 1.9,
      label: 'Plant room door',
      action: async () => {
        audio.ui('error');
        await this.narrate(loop ? 'Locked. Something behind it is breathing in time with you.' : 'Locked. The metal is warm, and something behind it hums.');
      },
    });

    // Theo on the pitch.
    g.place('theo', W(142, 139), PENALTY_SPOT);
    this.npc('theo', 'Talk to Theo', () => this.theo(loop));

    // Mrs. Ferguson behind the library desk.
    g.place('librarian', W(48.6, 18.5), 'libraryDesk');
    this.npc('librarian', 'Talk to Mrs. Ferguson', async () => {
      if (rpg.has('tempest') && rpg.isActive('library')) {
        await g.talk('librarian', ['Ah, The Tempest. Let me just scan that in…', { text: "That's odd. The system says this copy was checked out in 1846.", hold: 1.2 }, "…Must be a typo. Thank you, dear. Welcome to King's Hollow."]);
        rpg.take('tempest');
        rpg.complete('library');
        this.checkDay();
      } else await g.talk('librarian', [loop ? "Shh. You're dripping on the carpet, dear." : 'Shh. Mocks are next month, dear.']);
    });

    // Ms. Bain at the Tide Café.
    g.place('cafe', W(111.6, -12), 'cafeCounter');
    this.npc('cafe', 'Talk to Ms. Bain', async () => {
      if (!rpg.isActive('smoothie')) return g.talk('cafe', ['Come back tomorrow, sweetheart. Fresh guava on Thursdays.']);
      const last = memory.data.lastSmoothie;
      if (last && (loop || memory.haunted)) await g.talk('cafe', [{ text: `The usual? ${last}, wasn't it?`, hold: 0.8 }, '…Sorry, sweetheart. Thought you were someone else.']);
      else await g.talk('cafe', ['Welcome to the Tide Café!']);
      const flavours = ['Mango Sunrise', 'Guava Duff', 'Soursop Cream'];
      const pick = await this.ask('cafe', 'What can I get you?', flavours);
      rpg.smoothie = flavours[pick];
      memory.update({ lastSmoothie: flavours[pick] });
      rpg.give({ id: 'smoothie', name: `${flavours[pick]} smoothie`, wet: loop });
      await g.talk('cafe', [pick === 1 ? 'Ooh, a local. Good choice.' : 'Coming right up!']);
      rpg.complete('smoothie');
      this.checkDay();
    });

    // The wet boy by the pool. In Act I he is gone when you get close.
    const wet = g.place('wet', W(38, -36.3), g.anchors.poolCentre);
    wet.setVariant('wet');
    if (loop) {
      wet.lookTarget = g.r.camera.position;
      wet.uncanny = 1;
      g.trigger({ id: 'wetTurn', test: () => g.near(wet.root.position, 25), fn: () => wet.faceTo(g.player.pos) });
      g.trigger({ id: 'wetGone', test: () => g.near(wet.root.position, 7), fn: () => g.hideNPC('wet') });
    } else g.trigger({ id: 'wetGone', test: () => g.near(wet.root.position, 11), fn: () => g.hideNPC('wet') });
  }

  private async amaraPorch(loop: boolean) {
    const g = this.g;
    const options = ["Yeah, that's me.", "Who's asking?"];
    if (loop) options.push('We met yesterday.');
    const pick = await this.ask('amara', 'Hey! You must be Kai — the new boarder?', options);
    if (pick === 2) await g.talk('amara', [{ text: '…', hold: 1.8 }, "No we didn't.", { text: "I'd remember. I'm good with faces.", hold: 0.8 }]);
    await g.talk('amara', [
      pick === 1 ? "Ha! Amara Knowles. Official first-week buddy. You're stuck with me." : "Cool. I'm Amara — Mr. Pratt asked me to look out for you.",
      "Form Room 12 is inside, along the main corridor on the left. I'll meet you there!",
    ]);
    g.rpg.befriend('amara', 20);
    if (!loop) g.rpg.start(QUESTS.friend, { track: false });
    this.amaraStage = 1;
    const a = g.npcs.amara;
    a.moveTo(g.anchors.entrance);
    g.trigger({
      id: 'amaraIn',
      test: () => !a.path.length,
      fn: () => {
        if (!g.inRoom(g.player.pos, ['form12'])) g.place('amara', 'amaraForm', W(34, 42.4));
      },
    });
  }

  /** Act I: arriving in Form 12 hands out the day's quests. */
  private async formArrive() {
    const g = this.g;
    const rpg = g.rpg;
    rpg.complete('formRoom');
    audio.bell();
    const skipped = this.amaraStage === 0;
    if (skipped) rpg.start(QUESTS.friend, { track: false });
    this.amaraStage = 1;
    if (!g.inRoom(g.npcs.amara.root.position, ['form12'])) g.place('amara', 'amaraForm', W(34, 42.4));
    await g.runner.wait(1.2);
    await g.talk('amara', [
      skipped ? "There you are! I waited on the porch for ages. I'm Amara — your buddy this week." : 'You found it! Welcome to Form 12.',
      'Okay. First-day checklist.',
      'Mrs. Ferguson wants that library book back. She WILL find you.',
      "Theo's running football trials on the pitch.",
      'And you have to get a smoothie at the Tide Café. Non-negotiable.',
      'Come find me in the courtyard after!',
    ]);
    rpg.befriend('amara', 15);
    rpg.start(QUESTS.library);
    rpg.start(QUESTS.trials, { track: false });
    rpg.start(QUESTS.smoothie, { track: false });
    this.amaraStage = 2;
    g.trigger({
      id: 'amaraBench',
      test: () => !g.inRoom(g.player.pos, ['form12']) && !g.near('amaraForm', 9),
      fn: () => {
        const a = g.place('amara', 'courtyardBench', 'courtyardDoor');
        a.pose = 'sit';
        this.amaraStage = 3;
      },
    });
  }

  private async amaraBench() {
    const g = this.g;
    await g.talk('amara', [
      'Hey, you! Sit, sit.',
      'Did you know this whole island is limestone? Like Swiss cheese. Ms. Fairweather says there are blue holes under half of Nassau.',
      "My little cousin swears there's a Lusca living under the school pool.",
      { text: 'Big octopus-shark thing. Eats people, keeps their eyes.', hold: 0.6 },
      "…I'm joking. Mostly.",
      "I'll save you a seat in Chemistry.",
    ]);
    g.rpg.befriend('amara', 25);
    g.rpg.complete('friend');
    this.amaraStage = 4;
    this.checkDay();
  }

  /** When the day's quests are done, the bell rings for Chemistry. */
  private checkDay() {
    const g = this.g;
    const rpg = g.rpg;
    if (this.loop || rpg.isActive('chemistry') || rpg.isDone('chemistry')) return;
    if (!['library', 'trials', 'smoothie', 'friend'].every((q) => rpg.isDone(q))) return;
    audio.bell();
    rpg.start(QUESTS.chemistry);
    g.place('fairweather', 'lab1Front', 'lab1Centre');
    g.trigger({
      id: 'amaraLab',
      test: () => !g.near(g.npcs.amara.root.position, 14),
      fn: () => {
        const a = g.place('amara', LAB_SEAT, W(57.4, 37));
        a.pose = 'sit';
      },
    });
  }

  private async theo(loop: boolean) {
    const g = this.g;
    const rpg = g.rpg;
    if (!loop && rpg.isDone('trials')) return g.talk('theo', ["Trials are Saturday. Don't be late, new kid."]);
    if (loop) await g.talk('theo', [{ text: 'New kid! You here for trials?', hold: 1.2 }, { text: 'New kid! You here for trials?', hold: 0.4, wrong: true }]);
    else await g.talk('theo', ['New kid! Theo. Football captain. You here for trials?', "One penalty. Keeper's off sick, so… no pressure."]);
    if (!rpg.isActive('trials')) return;
    if ((await this.ask('theo', 'Ready?', ['Take the penalty', 'Not yet'])) === 1) return;

    const p = g.player;
    p.frozen = true;
    await g.ui.fade(1, 0.35);
    this.placePlayer(W(142.4, 135.5), -Math.PI / 2);
    this.ball.position.copy(PENALTY_SPOT).setY(0.11);
    g.place('theo', W(143, 139.5), PENALTY_SPOT);
    await g.ui.fade(0, 0.35);
    const aim = await g.choose('', 'Where are you putting it?', ['Bottom left', 'Top corner', 'Bottom right']);
    g.endTalk();
    p.frozen = true;
    await g.runner.wait(0.3);
    audio.footstep('grass', 2.4);
    const to = [W(156.1, 137.9, 0.3), W(156.1, 133.6, 2.0), W(156.1, 133.1, 0.3)][aim];
    this.ballFlight = { from: this.ball.position.clone(), to, t: 0 };
    await g.runner.wait(0.7);
    this.ball.position.y = 0.11;
    p.frozen = false;
    if (loop) {
      // The ball is back on the spot. It is always the first day.
      await g.runner.wait(0.6);
      this.ball.position.copy(PENALTY_SPOT).setY(0.11);
      await g.talk('theo', [{ text: 'Unlucky. Again?', hold: 0.8, wrong: true }]);
      return;
    }
    g.ui.toast('GOAL!', 'gold');
    audio.ui('level');
    rpg.complete('trials');
    await g.talk('theo', ["Get in! That's going on the highlight reel.", "Trials are Saturday. Don't be late."]);
    this.checkDay();
  }

  /** Ms. Fairweather's lesson. The second time, it ends differently. */
  private async lesson(second: boolean) {
    const g = this.g;
    const R = g.runner;
    const p = g.player;
    p.frozen = true;
    await g.ui.fade(1, 0.5);
    this.placePlayer(g.anchors.lab1Centre, 0);
    const f = g.place('fairweather', 'lab1Front', 'lab1Centre');
    await g.ui.fade(0, 0.6);
    p.frozen = true;
    await g.talk('fairweather', ['Settle down, everyone. Welcome to Chemistry.', "Today's lesson is a local one."]);

    if (!second) {
      await g.talk('fairweather', [
        'This island is limestone. Rain is very slightly acidic, and over thousands of years it eats the rock away.',
        'Caves. Sinkholes. Blue holes — some of them hundreds of feet deep. Right under our feet.',
      ]);
      const pick = await this.ask('fairweather', 'Pop quiz. Limestone plus slightly acidic rainwater gives you…?', ['Calcium bicarbonate — the rock dissolves', 'Salt water', 'Concrete?']);
      if (pick === 0) {
        await g.talk('fairweather', ['Very good, Kai. The rock dissolves. The ground goes hollow.']);
        g.rpg.addStat('wits', 1);
      } else await g.talk('fairweather', ['Not quite. It dissolves. Give it long enough and the ground goes hollow.']);
      await g.talk('fairweather', ["The first King's College in Nassau opened in 1846. Right about here, as it happens."]);
      audio.setMusic('off');
      await g.talk('fairweather', [{ text: 'They closed that school after one term.', hold: 2.6 }]);
      await R.wait(1.2);
      audio.setMusic('cheer');
      await g.talk('fairweather', ["Right! Homework: chapter one. And welcome to King's Hollow, everyone."]);
      g.rpg.complete('chemistry');
      p.frozen = false;
      return;
    }

    audio.setMusic('off');
    await g.talk('fairweather', ["The first King's College in Nassau opened in 1846.", { text: 'Twelve went in.', hold: 2.2 }]);
    g.atmo.lightningEnabled = true;
    g.atmo.set('storm', 4);
    g.atmo.strike(0.15);
    g.lights.setFlicker(0.8);
    await R.wait(2);
    await g.talk('fairweather', [{ text: 'One of them was called…', hold: 1.6 }]);
    f.uncanny = 1;
    await g.talk('fairweather', [{ text: 'Kai.', hold: 1.4, wrong: true }]);
    this.dir.glitch(1.4);
    await R.wait(0.6);
    await g.ui.fade(1, 0.1);
    await g.ui.fakeCorrupt(9);
  }

  // ----------------------------------------------------------------- Act I

  private async a1(): Promise<Beat> {
    const g = this.g;
    const rpg = g.rpg;
    const R = g.runner;
    this.setupDay(false);
    await g.ui.card("Welcome to King's Hollow!", 'Week 1 · Day 1', 3.2);
    rpg.give({ id: 'tempest', name: 'The Tempest (library copy)' });
    rpg.give({ id: 'timetable', name: 'Timetable' });
    rpg.start(QUESTS.formRoom);
    g.ui.toast('E — talk / interact   ·   Tab — journal', '', 5);
    g.trigger({ id: 'form', test: () => g.inRoom(g.player.pos, ['form12']), fn: () => void R.run(() => this.formArrive()) });
    await R.until(() => rpg.isActive('chemistry') && g.inRoom(g.player.pos, ['lab1']));
    await this.lesson(false);
    await g.ui.fade(1, 1.2);
    rpg.day = 2;
    rpg.changed();
    await g.ui.card('Day 1 complete!', 'See you tomorrow, Kai', 3.4);
    return 'a2';
  }

  // ----------------------------------------------------------------- Act II

  /** The same day again. Nobody mentions it. */
  private async a2(): Promise<Beat> {
    const g = this.g;
    const rpg = g.rpg;
    const R = g.runner;
    rpg.day = 1;
    this.setupDay(true);
    g.atmo.set('overcast', 150);
    await g.ui.card("Welcome to King's Hollow!", 'Week 1 · Day 1', 3.2);
    for (const i of rpg.inventory) i.wet = true;
    rpg.give({ id: 'tempest', name: 'The Tempest (library copy)', wet: true });
    rpg.give({ id: 'timetable', name: 'Timetable', wet: true });
    for (const id of ['library', 'trials', 'smoothie', 'friend', 'chemistry']) rpg.uncomplete(id);
    rpg.start(QUESTS.formRoom);
    this.after(45, () => rpg.start(QUESTS.pool, { you: true, track: false }));
    this.after(70, () => (this.dir.stare = true));

    await R.until(() => g.inRoom(g.player.pos, ['form12']));
    rpg.complete('formRoom');
    audio.bell();
    if (!g.inRoom(g.npcs.amara.root.position, ['form12'])) g.place('amara', 'amaraForm', W(34, 42.4));
    this.amaraStage = 1;
    await R.wait(1.2);
    await g.talk('amara', ['You found it! Welcome to Form 12.']);
    await g.talk('amara', [{ text: 'You found it! Welcome to Form 12.', hold: 1.5, wrong: true }]);
    rpg.start(QUESTS.breathe, { you: true, track: false });
    g.player.frozen = true;
    this.dir.glitch(1);
    await R.wait(1.4);
    this.dir.glitch(1.3);
    g.lights.setFlicker(0.9);
    await R.wait(1.0);
    await g.ui.fade(1, 0.08);
    await g.ui.fakeCrash([
      "King's Hollow College — Student Adventure v1.0.4",
      '[KHC] Unhandled exception in DayCycle.advance(): day == 1',
      '[KHC] Restoring last good state…',
      '[KHC] save slot 1: Kai Rolle · Lv 3 · Day 1',
      '[KHC] save slot 1: Kai Rolle · Lv 3 · Day 1',
      '[KHC] warning: entity "amara" has no references',
      '[KHC] fallback spawn: ARCHIVE',
    ]);
    return 'a2b';
  }

  /** Waking in the archive. Amara has been erased; the RPG keeps lying. */
  private async a2b(): Promise<Beat> {
    const g = this.g;
    const rpg = g.rpg;
    const R = g.runner;
    const d = this.dir;
    g.atmo.set('dusk', 120);
    g.lights.setFlicker(0.7);
    this.after(5, () => g.lights.setFlicker(0.22));
    memory.update({ amaraErased: true });
    d.echoSteps = d.whispers = d.oxygen = d.amaraFade = d.stare = true;
    g.leakyPause = true;
    g.ui.mapLies = 1;
    rpg.remove('friend');
    for (const i of rpg.inventory) i.wet = true;
    rpg.start(QUESTS.remember);
    rpg.uncomplete('chemistry');
    g.targetOverride = { anchor: 'plantDoor', label: 'Chemistry' };

    // Nobody remembers her.
    g.place('librarian', W(48.6, 18.5), 'libraryDesk');
    this.npc('librarian', 'Talk to Mrs. Ferguson', () => g.talk('librarian', ["Amara? There's no Amara at King's Hollow, dear.", { text: "You're dripping on the carpet.", hold: 1 }]));
    const who: [string, THREE.Vector3, Line[]][] = [
      ['studentA', W(31, 38.3), ['Who?']],
      ['studentB', W(45, 38.2), ['Who are you talking to?']],
      ['studentC', W(36, 30), [{ text: 'Stop looking at the pool.', hold: 1.2 }]],
      ['studentD', W(50.1, 30), ['There were only ever eleven of us, Kai.']],
      ['theo', W(38, 38.4), ['Amara? Never heard of her, man.', { text: 'Trials are Saturday.', hold: 2 }]],
    ];
    for (const [id, at, lines] of who) {
      g.place(id, at, g.player.pos);
      this.npc(id, 'Ask about Amara', () => g.talk(id, lines, id === 'theo' ? undefined : 'Student'));
    }
    g.place('fairweather', 'lab1Front', 'lab1Centre');

    g.interact({
      id: 'photo',
      pos: g.anchors.archivePhoto,
      radius: 2,
      label: 'Look at the photograph',
      action: () =>
        g.ui.note(
          "King's College, Nassau · Michaelmas Term 1846",
          'Twelve pupils in two rows, squinting into the sun.\n\nThe girl at the end of the front row has braids and a buddy badge. The boy beside her is wearing your face.\n\nThe tide line on the glass is higher than it was a minute ago.',
        ),
    });
    g.interact({
      id: 'drain',
      pos: g.anchors.archiveDrain,
      radius: 1.6,
      label: 'Listen to the drain',
      action: async () => {
        const at = g.anchors.archiveDrain.clone().setY(0.1);
        audio.gurgle(at, 2.5);
        audio.whisper(at, 2);
        g.ui.subtitle(null, '…kai…', 2.5);
        await R.wait(2.5);
      },
    });
    g.interact({
      id: 'desk',
      pos: g.anchors.amaraForm,
      radius: 1.8,
      label: "Amara's desk",
      action: () => g.ui.note('Her desk', 'There is nothing in it but seawater, and a buddy badge with the name scratched off.\n\nYou can still smell mango.'),
    });
    this.after(100, () => g.ui.toast('Ms. Fairweather is waiting in the Chemistry Lab.', 'wrong', 5));

    await R.until(() => g.inRoom(g.player.pos, ['lab1']));
    await this.lesson(true);
    return 'a3lib';
  }

  // ================================================================= ACT III: the lock-in

  private async a3lib(): Promise<Beat> {
    const g = this.g;
    const rpg = g.rpg;
    const R = g.runner;
    const p = g.player;
    await g.ui.card('LOCK-IN', 'Friday · 7:42 pm', 3.5);
    g.atmo.strike(0.4);
    rpg.start(QUESTS.lockin);
    g.targetOverride = { anchor: 'libraryDesk', label: 'Torch' };
    await this.radio('Mr. Pratt (radio)', [
      ['Kai? Kai, you still in the library? Pick up.', 3.5],
      ["Storm's tripped the gate. Mag-locks are stuck shut. Nobody in, nobody out.", 4.5],
      ["There's a torch on the front desk. Take it and stay put. I'm coming round.", 4.5],
    ]);
    let torch = false;
    g.interact({
      id: 'torch',
      pos: this.torch.position,
      radius: 1.9,
      label: 'Take the torch',
      action: () => {
        torch = true;
        this.torch.visible = false;
        p.hasFlashlight = p.flashlightOn = true;
        audio.ui('blip');
        g.ui.toast('F — torch on / off', '', 5);
        g.removeInteract('torch');
      },
    });
    await R.until(() => torch);
    g.targetOverride = null;

    // Something walks through the library.
    await R.wait(3);
    g.atmo.strike(0.1);
    for (let k = 0; k < 4; k++) {
      audio.footstep('water', 1.2);
      await R.wait(0.7);
    }
    g.ui.subtitle(null, 'Something wet is walking towards the library.', 4);
    g.ui.toast('Hide — press E beside a desk or table', '', 6);
    await R.wait(5);
    const h = g.hollowed;
    const s = g.place('sands', W(50.1, 27), W(50.1, 20));
    h.activate('scripted');
    s.walkSpeed = 0.9;
    s.path = this.route([W(50.1, 23.5), W(49.6, 18.8), W(44.5, 14.5), W(38.5, 11), W(37, 6.5), W(44, 6.0), W(49.6, 18.8), W(50.1, 30)]);
    let spotted = false;
    let seenAt = g.time;
    g.hooks.set('pass', () => {
      if (h.sees) seenAt = g.time;
      if (h.state !== 'scripted' || p.hidden) return;
      const d = s.root.position.distanceTo(p.pos);
      if (d < 6.5 && g.world.lineOfSight(s.root.position.x, s.root.position.z, p.pos.x, p.pos.z, 1.5)) {
        spotted = true;
        seenAt = g.time;
        h.activate('chase');
        audio.stinger();
      }
    });
    await R.until(() => spotted || !s.path.length);
    if (spotted) await R.until(() => g.time - seenAt > 10 && h.state !== 'chase');
    g.hooks.delete('pass');
    h.deactivate();
    g.hideNPC('sands');

    // Power cut.
    g.lights.setFlicker(1);
    audio.glitch(0.5);
    await R.wait(1.4);
    this.setLights(false, true, true, 0.12);
    g.atmo.strike(0.05);
    audio.stinger();
    await R.wait(2);
    await this.radio('Mr. Pratt (radio)', [
      ["Kai, power's gone. I'm at the bottom of the main stairwell, I'll—", 3.5],
      ["Hold on. There's water coming up out of the drain here. Why is it warm—", 3.5],
    ]);
    audio.gurgle(g.r.camera.position.clone(), 3);
    await this.radio('Mr. Pratt (radio)', [
      ['(screaming)', 2.2],
      ['(something like swallowing)', 2.6],
    ]);
    rpg.complete('lockin', false);
    rpg.start(QUESTS.pratt);
    return 'a3cor';
  }

  private async a3cor(): Promise<Beat> {
    const g = this.g;
    const rpg = g.rpg;
    const R = g.runner;
    const drain = g.anchors.corridorDrain;
    g.trigger({
      id: 'drain',
      test: () => g.near(drain, 3.2),
      fn: () => {
        g.gore.pool(drain.x, drain.z, 1.8);
        audio.gurgle(drain.clone().setY(0.1), 3);
        g.ui.subtitle(null, 'The drain is full to the brim. Something warm is coming up through it.', 4);
      },
    });
    const body = g.npcs.pratt.root.position;
    g.trigger({
      id: 'found',
      test: () => g.near(body, 4.5),
      fn: () => {
        audio.stinger();
        audio.heartbeat(0.8);
        g.player.lookAt(body.clone().setY(0.3), 2.5);
        g.player.addShake(0.5);
        g.ui.redVignette.style.opacity = '0.6';
        setTimeout(() => (g.ui.redVignette.style.opacity = '0'), 1500);
      },
    });
    let searched = false;
    g.interact({
      id: 'pratt',
      pos: body,
      radius: 1.9,
      label: 'Search Mr. Pratt',
      action: async () => {
        const text =
          settings.gore === 'extreme'
            ? 'He is on his back at the foot of the stairs. Something opened him from hip to hip and pulled. His insides trail across the tiles towards the drain, as if they were being reeled in.\n\nHis keycard is still clipped to his belt.'
            : settings.gore === 'moderate'
              ? 'He is on his back at the foot of the stairs, in a lot of blood. Something has opened his stomach.\n\nHis keycard is still clipped to his belt.'
              : 'He is on his back at the foot of the stairs. He is not breathing. His eyes are open and wet.\n\nHis keycard is still clipped to his belt.';
        await g.ui.note('Mr. Pratt', text);
        rpg.give({ id: 'keycard', name: 'Plant room keycard' });
        g.removeInteract('pratt');
        searched = true;
      },
    });
    await R.until(() => searched);
    await R.wait(1.5);
    await this.radio('Mr. Pratt (radio)', [
      ['kai', 2],
      ['come down to the water, kai', 3.2],
      ["it's the first day. it's always the first day.", 3.8],
    ]);
    rpg.complete('pratt', false);
    rpg.start(QUESTS.flare);
    return 'a3labs';
  }

  private async a3labs(): Promise<Beat> {
    const g = this.g;
    const rpg = g.rpg;
    const R = g.runner;
    const h = g.hollowed;
    g.place('sands', W(30, 38.3), W(40, 38.3));
    h.patrol = [W(30, 38.3), W(45, 38.3), g.anchors.corridorBNorth, g.anchors.corridorDrain, W(50.1, 30)];
    h.activate('patrol');

    for (const n of NOTES) g.interact({ id: n.id, pos: n.at, radius: 1.6, label: 'Read note', action: () => g.ui.note(n.title, n.body) });
    for (const ing of INGREDIENTS) {
      const m = this.props[ing.id];
      g.interact({
        id: ing.id,
        pos: m.position,
        radius: 1.6,
        label: ing.label,
        enabled: () => m.visible,
        action: () => {
          m.visible = false;
          rpg.give({ id: ing.id, name: ing.name });
        },
      });
    }
    const ready = () => INGREDIENTS.every((i) => rpg.has(i.id));
    let crafted = false;
    g.interact({
      id: 'craft',
      pos: g.anchors.flareStation,
      radius: 1.8,
      label: () => (ready() ? 'Make flares' : 'Fume cupboard (needs magnesium, nitrate, casing)'),
      enabled: () => !crafted,
      action: async () => {
        if (!ready()) return audio.ui('error');
        audio.ui('quest');
        await this.narrate('You pack the casing tight: nitrate, magnesium ribbon, nitrate again. Enough for two.');
        for (const i of INGREDIENTS) rpg.take(i.id);
        rpg.give({ id: 'flare1', name: 'Flare' });
        rpg.give({ id: 'flare2', name: 'Flare' });
        g.ui.toast('Q — throw a flare', '', 5);
        crafted = true;
      },
    });
    await R.until(() => crafted);
    rpg.complete('flare', false);
    return 'a3chase';
  }

  private async a3chase(): Promise<Beat> {
    const g = this.g;
    const R = g.runner;
    const p = g.player;
    const h = g.hollowed;
    this.flaresOn = true;
    await R.wait(1.2);
    const at = W(52.3, 33.2);
    g.place('sands', at, p.pos);
    audio.luscaRoar(at.clone().setY(1.6));
    audio.stinger();
    p.addShake(0.5);
    p.lookAt(at.clone().setY(1.5), 3);
    h.activate('chase');
    h.windup = 1.6;
    g.ui.toast('RUN — Q throws a flare', 'wrong', 4);
    g.targetOverride = { anchor: 'lab2FireDoor', label: 'Fire exit' };
    let out = false;
    g.interact({
      id: 'fireDoor',
      pos: g.anchors.lab2FireDoor,
      radius: 1.8,
      label: 'Push the fire door',
      action: () => {
        audio.thunder(0.05);
        g.atmo.strike(0);
        this.placePlayer(W(61.9, 21.5), Math.PI);
        out = true;
      },
    });
    await R.until(() => out);
    g.removeInteract('fireDoor');
    g.targetOverride = { anchor: 'poolGate', label: 'The pool' };
    this.after(2.5, () => {
      if (h.state === 'dormant') return;
      // Out of the fire door behind you, a few metres back.
      g.place('sands', W(61.9, 25.5), p.pos);
      h.activate('chase');
      h.windup = 0.8;
      audio.luscaRoar(g.npcs.sands.root.position.clone().setY(1.6));
    });
    await R.until(() => g.near('poolGate', 3.2));
    return 'a3pool';
  }

  /** The pool runs red and the Lusca takes the Hollowed apart. */
  private async a3pool(): Promise<Beat> {
    const g = this.g;
    const R = g.runner;
    const p = g.player;
    const L = g.lusca;
    const water = g.campus.water;
    const centre = g.anchors.poolCentre;
    g.hollowed.deactivate();
    p.frozen = true;
    this.placePlayer(W(44, -38.6), Math.PI);
    p.lookAt(centre.clone().setY(0), 1.5);
    // Your first flare, dropped on the deck as you came through the gate: the only light here.
    const spare = this.flareLights.find((l) => !this.flares.some((f) => f.light === l));
    const fp = W(45.8, -40.8);
    if (spare) this.lightFlare(spare, fp.x, fp.z);
    g.ui.subtitle(null, 'The pool is warm. It is the wrong colour.', 4);
    // With gore off the water churns and darkens instead of turning to blood.
    const tide = g.gore.enabled ? 1 : 0;
    bg(this.tween(6, (k) => ((water.uniforms.blood.value = k * tide), (water.uniforms.disturb.value = k * 0.12))));
    bg(
      this.tween(7, (k) => {
        L.emerge = k * 0.75;
        for (const t of L.tentacles) t.reach = k * 0.85;
      }),
    );
    await R.wait(2.5);
    audio.luscaRoar(centre.clone().setY(0.5));
    p.addShake(0.5);
    await R.wait(2);

    // The Hollowed comes for you along the deck.
    const s = g.place('sands', W(46, -30), p.pos);
    s.walkSpeed = 3.8;
    s.moveTo(W(44.6, -39.2));
    audio.stinger();
    g.hooks.set('watch', () => p.lookAt(s.root.position.clone().setY(s.root.position.y + 1.4), 3));
    await R.until(() => !s.path.length);

    // Grabbed.
    const hold = new THREE.Vector3();
    const updHold = () => hold.copy(s.root.position).setY(s.root.position.y + 1.2);
    updHold();
    g.hooks.set('hold', updHold);
    const grabbers = [...L.tentacles].sort((a, b) => a.base.distanceTo(hold) - b.base.distanceTo(hold)).slice(0, 3);
    for (const t of grabbers) {
      t.target = hold;
      t.coil = hold;
      t.reach = 1;
    }
    bg(this.tween(0.45, (k) => grabbers.forEach((t) => (t.grip = k))));
    audio.splash(hold.clone(), 2);
    audio.gore('crunch', hold.clone());
    p.addShake(0.8);
    await R.wait(0.5);
    const start = s.root.position.clone();
    const lifted = W(43.6, -45.2, 2.6);
    g.hooks.set('watch', () => p.lookAt(hold, 2));
    await this.tween(2.2, (k) => {
      s.root.position.lerpVectors(start, lifted, k * k * (3 - 2 * k));
      s.root.rotation.z = Math.sin(k * 9) * 0.25;
    });

    // Torn apart (only if gore is on; otherwise it is simply dragged under whole).
    let gut: THREE.Object3D | null = null;
    if (g.gore.enabled) {
      const parts: [PartName, number][] = [
        ['armL', 1],
        ['legR', -1],
        ['armR', -1],
        ['head', 0],
      ];
      for (const [part, side] of parts) {
        await R.wait(1.15);
        const piece = s.detach(part);
        const from = piece.position.clone();
        const dir = from.clone().sub(hold).setY(0);
        if (dir.lengthSq() < 1e-4) dir.set(side || 1, 0, 0);
        dir.normalize();
        g.gore.gib(piece, dir.clone().multiplyScalar(3 + Math.random() * 2).add(new THREE.Vector3(0, 3 + Math.random() * 2, 0)));
        g.gore.burst(from, dir.clone().setY(0.4).normalize(), 70, 5, 0.5);
        const y = part === 'head' ? 0.55 : part.startsWith('leg') ? -0.3 : 0.42;
        g.gore.spray(s.parts.torso, new THREE.Vector3(side * 0.2, y, 0), new THREE.Vector3(side, part === 'head' ? 1 : 0.3, 0), 3, 1);
        audio.gore('rip', from);
        audio.gore('crunch', from);
        if (from.distanceTo(g.r.camera.position) < 7) g.gore.lensSplash(0.4);
        p.addShake(0.35);
      }
      if (settings.gore === 'extreme') {
        gut = g.gore.intestines(hold.clone(), hold.clone().add(new THREE.Vector3(0.5, 0, 0)), 3.2);
        this.extras.push(gut);
      }
      await R.wait(1.2);
    }

    // Dragged under.
    const top = s.root.position.clone();
    const under = centre.clone().setY(-3.2);
    gut?.parent?.remove(gut);
    await this.tween(1.6, (k) => s.root.position.lerpVectors(top, under, k * k));
    audio.splash(centre.clone(), 3);
    audio.gurgle(centre.clone(), 3);
    g.hideNPC('sands');
    g.hooks.delete('hold');
    g.hooks.delete('watch');
    for (const t of grabbers) {
      t.target = null;
      t.coil = null;
      t.grip = 0;
    }
    bg(
      this.tween(4, (k) => {
        L.emerge = 0.75 - 0.35 * k;
        for (const t of L.tentacles) t.reach = 0.85 - 0.5 * k;
      }),
    );
    L.stare(g.r.camera.position);
    p.lookAt(centre.clone().setY(0), 2);
    await R.wait(2.5);
    g.ui.subtitle('Amara', 'kai', 2.5);
    await R.wait(2);
    p.frozen = false;
    g.rpg.start(QUESTS.override);
    await R.until(() => g.near('plantDoor', 3));
    return 'a3plant';
  }

  private async a3plant(): Promise<Beat> {
    const g = this.g;
    const R = g.runner;
    const rpg = g.rpg;
    const p = g.player;
    if (!rpg.has('keycard')) rpg.give({ id: 'keycard', name: 'Plant room keycard' }, false);
    let slammed = false;
    g.interact({
      id: 'door',
      pos: W(-30, -65.5),
      radius: 1.9,
      label: () => (slammed ? 'Door' : 'Use keycard'),
      enabled: () => this.door.box.enabled !== false,
      action: async () => {
        if (slammed) {
          audio.ui('error');
          return this.narrate("It won't open. Behind you, the water in the shaft breathes out.");
        }
        audio.ui('blip');
        this.door.target = -1.7;
        this.door.box.enabled = false;
      },
    });

    let open = false;
    g.interact({
      id: 'panel',
      pos: g.anchors.plantPanel,
      radius: 2,
      label: 'Gate override panel',
      enabled: () => !open,
      action: async () => {
        const codes = ['0000', '1846', '1492', '2024'];
        const pick = await g.choose('GATE OVERRIDE', 'ENTER 4-DIGIT CODE', codes);
        if (codes[pick] !== '1846') {
          audio.ui('error');
          await g.say('GATE OVERRIDE', 'ACCESS DENIED.');
          return g.endTalk();
        }
        audio.ui('quest');
        await g.say('GATE OVERRIDE', 'CODE ACCEPTED. RELEASING LOCKS…');
        await g.say('GATE OVERRIDE', 'MAIN GATE: NO RESPONSE.', { hold: 1 });
        await g.say('GATE OVERRIDE', 'SHAFT HATCH: OPEN.', { hold: 0.8, wrong: true });
        g.endTalk();
        open = true;
      },
    });
    await R.until(() => open);
    this.hatchTarget = -1.9;
    audio.footstep('hard', 3);
    g.buildings.shaftBlock.enabled = false;
    await R.wait(1.5);
    const top = g.anchors.shaftTop;
    audio.whisper(top.clone().setY(-1), 3);
    g.ui.subtitle('Amara', "Kai? Kai, is that you? I'm down here. It's so cold.", 5);
    await R.wait(2.5);

    // The door slams behind you.
    this.door.target = 0;
    this.door.box.enabled = true;
    slammed = true;
    audio.thunder(0);
    audio.stinger();
    p.addShake(0.8);
    g.lights.setFlicker(0.6);
    rpg.start({ id: 'override', title: 'Lock-In', objective: 'Go down.', xp: 0, target: 'shaftTop' });
    let down = false;
    g.interact({ id: 'down', pos: top, radius: 1.8, label: 'Go down', action: () => void (down = true) });
    await R.until(() => down);
    await this.ending();
    return 'end';
  }

  // ================================================================= ending

  private async ending() {
    const g = this.g;
    const R = g.runner;
    const cam = g.r.camera;
    g.playing = false;
    g.ui.prompt(null);
    g.ui.nametags([]);
    g.ui.hud(false);

    // Down the stairs into the water.
    const top = g.anchors.shaftTop;
    const bottom = g.anchors.shaftBottom;
    const a = new THREE.Vector3(top.x, 1.6, top.z);
    const b = new THREE.Vector3(bottom.x, bottom.y + 1.1, bottom.z);
    const look = new THREE.Vector3(bottom.x, bottom.y - 1, bottom.z + 1.5);
    await this.tween(6.5, (k) => {
      cam.position.lerpVectors(a, b, k);
      cam.position.y += Math.abs(Math.sin(k * 30)) * 0.04;
      cam.lookAt(look);
    });
    audio.splash(b.clone(), 2.5);
    await g.ui.fade(1, 0.5);

    // The blue hole.
    audio.setUnderwater(1);
    const C = new THREE.Vector3(top.x, -80, top.z);
    this.buildCave(C);
    g.atmo.rain.visible = false;
    g.atmo.lightningEnabled = false;
    const fog = g.r.scene.fog as THREE.FogExp2;
    const bgCol = new THREE.Color(0x041c20);
    g.hooks.set('underwater', () => {
      fog.color.setHex(0x06343a);
      fog.density = 0.045;
      g.r.scene.background = bgCol;
    });
    const kai = g.place('kai', C.clone(), C.clone().add(new THREE.Vector3(0, 0, -1)));
    kai.pose = 'float';
    kai.root.position.set(C.x + 0.3, C.y + 6.5, C.z + 0.5);
    const L = g.lusca;
    L.root.position.x = C.x;
    L.root.position.z = C.z;
    L.depthOverride = C.y - 10;
    L.emerge = 1;
    for (const t of L.tentacles) t.reach = 0.7;
    cam.position.copy(C).add(new THREE.Vector3(0, 1.5, 0));
    cam.lookAt(kai.root.position);
    const qUp = cam.quaternion.clone();
    await g.ui.fade(0, 2.5);
    await R.wait(1.5);
    g.ui.subtitle('Amara', 'You came back.', 4);
    audio.whisper(cam.position.clone().add(new THREE.Vector3(0.6, 0, 0)), 2.5);
    await R.wait(4.5);
    g.ui.subtitle('Amara', "It's always the first day, Kai.", 4.5);
    await R.wait(3);

    // Look down: the eyes.
    const m = new THREE.Matrix4().lookAt(cam.position, new THREE.Vector3(C.x, C.y - 9, C.z + 0.01), cam.up);
    const qDown = new THREE.Quaternion().setFromRotationMatrix(m);
    L.stare(cam.position);
    await this.tween(5, (k) => cam.quaternion.slerpQuaternions(qUp, qDown, k * k * (3 - 2 * k)));
    audio.stinger();
    audio.heartbeat(0.9);
    await R.wait(2.5);
    await g.ui.fade(1, 0.12);
    g.hooks.delete('underwater');
    for (const o of this.underwater) o.parent?.remove(o);
    this.underwater = [];
    g.hideNPC('kai');
    this.resetLusca();
    audio.setUnderwater(0);
    g.atmo.rain.visible = true;

    // The game "reboots" into Day 1.
    audio.setMusic('cheer');
    audio.musicDetune = 0;
    audio.musicWrongness = 0;
    await R.wait(1);
    g.ui.toast('New quest: First Day!', '', 3);
    await g.ui.card("Welcome to King's Hollow!", 'Week 1 · Day 1', 3);
    audio.setMusic('off');
    await R.wait(1.2);
    await g.ui.card('CHAPTER 2', 'The Drowning Term', 4.5);
    memory.update({ endings: memory.data.endings + 1 });
    if (document.pointerLockElement) document.exitPointerLock();
    await g.ui.credits();
  }

  private buildCave(C: THREE.Vector3) {
    const g = this.g;
    const scene = g.r.scene;
    const geo = new THREE.CylinderGeometry(10, 24, 80, 64, 32, true);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const a = Math.atan2(v.z, v.x);
      const n = 1 + 0.16 * Math.sin(a * 5 + v.y * 0.21) * Math.cos(a * 3 - v.y * 0.13) + 0.07 * Math.sin(a * 17 + v.y * 0.9);
      pos.setXYZ(i, v.x * n, v.y, v.z * n);
    }
    geo.computeVertexNormals();
    const cave = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9a947c, roughness: 0.95, side: THREE.BackSide, flatShading: true }));
    cave.position.copy(C).add(new THREE.Vector3(0, 10, 0));
    const shaft = new THREE.PointLight(0x7fe0f0, 60, 60, 1.4);
    shaft.position.copy(C).add(new THREE.Vector3(0, 30, 0));
    const glow = new THREE.PointLight(0x40c090, 10, 20, 1.6);
    glow.position.copy(C).add(new THREE.Vector3(0, -6, 0));
    const n = 600;
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pts.set([C.x + (Math.random() - 0.5) * 24, C.y + (Math.random() - 0.5) * 24, C.z + (Math.random() - 0.5) * 24], i * 3);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xcfeee8, size: 0.04, transparent: true, opacity: 0.6, depthWrite: false }));
    scene.add(cave, shaft, glow, motes);
    // Veils around the camera tint everything beyond them blue-green.
    const veil = (r: number, o: number) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color: 0x0a4a50, transparent: true, opacity: o, side: THREE.BackSide, depthWrite: false, fog: false }));
      g.r.camera.add(s);
      return s;
    };
    this.underwater.push(cave, shaft, glow, motes, veil(5, 0.3), veil(14, 0.35));
  }
}
