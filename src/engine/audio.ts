// Procedural audio: everything is synthesised with WebAudio, so the game ships no sound files.
// - A cheerful steel-pan calypso theme that can be detuned/slowed/corrupted (the "mind" layer).
// - Layered ambience (birds, wind, sea, rain, building hum).
// - Positional (HRTF) effects: whispers, gore, the Lusca, the Hollowed's breathing.
import * as THREE from 'three';

type Ambience = { birds: number; wind: number; sea: number; rain: number; hum: number };

const MELODY: (number | null)[][] = [
  [72, null, 69, 72, 74, null, 72, 69],
  [70, null, 74, null, 77, 74, null, 70],
  [72, null, 76, null, 79, null, 76, 72],
  [77, null, null, 76, 74, null, 72, null],
  [74, null, 69, 74, 77, null, 74, 69],
  [70, 74, null, 77, null, 74, 70, null],
  [72, null, 74, 76, null, 79, null, 76],
  [72, null, null, null, 67, 69, 70, null],
];
// Chord tones per bar (F, Bb, C, F, Dm, Bb, C, C).
const CHORDS = [
  [53, 57, 60],
  [46, 50, 53],
  [48, 52, 55],
  [53, 57, 60],
  [50, 53, 57],
  [46, 50, 53],
  [48, 52, 55],
  [48, 52, 58],
];

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx!: AudioContext;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private underwater!: BiquadFilterNode;
  private white!: AudioBuffer;
  private brown!: AudioBuffer;
  private amb!: Record<keyof Ambience, GainNode>;
  private droneNodes: AudioScheduledSourceNode[] = [];
  private droneGain?: GainNode;
  started = false;

  // Music state, driven by the mind director.
  musicMode: 'cheer' | 'drone' | 'off' = 'off';
  musicDetune = 0; // cents
  musicTempo = 112; // bpm
  musicWrongness = 0; // 0..1 chance of a wrong note
  private step = 0;
  private nextNote = 0;
  private birdTimer = 0;
  private ambLevel: Ambience = { birds: 0, wind: 0, sea: 0, rain: 0, hum: 0 };

  start() {
    if (this.started) return;
    this.started = true;
    this.ctx = new AudioContext();
    const c = this.ctx;
    this.underwater = c.createBiquadFilter();
    this.underwater.type = 'lowpass';
    this.underwater.frequency.value = 20000;
    this.master = c.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.underwater).connect(c.destination);
    const comp = c.createDynamicsCompressor();
    comp.connect(this.master);
    this.musicBus = this.bus(0.35, comp);
    this.sfxBus = this.bus(0.9, comp);
    this.ambBus = this.bus(0.6, comp);
    this.white = this.noise(false);
    this.brown = this.noise(true);
    this.amb = {
      wind: this.loopNoise(this.brown, 'lowpass', 500, this.ambBus),
      sea: this.loopNoise(this.brown, 'lowpass', 220, this.ambBus),
      rain: this.loopNoise(this.white, 'bandpass', 2600, this.ambBus, 0.5),
      hum: this.hum(),
      birds: this.bus(0, this.ambBus),
    };
    this.nextNote = c.currentTime + 0.1;
  }

  setVolume(v: number) {
    if (this.started) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setUnderwater(amount: number) {
    if (this.started) this.underwater.frequency.setTargetAtTime(20000 * Math.pow(0.02, amount), this.ctx.currentTime, 0.3);
  }

  setAmbience(target: Partial<Ambience>, fade = 2) {
    if (!this.started) return;
    for (const [k, v] of Object.entries(target) as [keyof Ambience, number][]) {
      this.ambLevel[k] = v;
      if (k !== 'birds') this.amb[k].gain.setTargetAtTime(v * AMB_SCALE[k], this.ctx.currentTime, fade / 3);
    }
  }

  setListener(cam: THREE.Camera) {
    if (!this.started) return;
    const l = this.ctx.listener;
    const p = cam.getWorldPosition(new THREE.Vector3());
    const f = cam.getWorldDirection(new THREE.Vector3());
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02);
      l.forwardY.setTargetAtTime(f.y, t, 0.02);
      l.forwardZ.setTargetAtTime(f.z, t, 0.02);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  /** Called every frame: schedules music notes and random ambience events. */
  update(dt: number) {
    if (!this.started) return;
    const c = this.ctx;
    if (this.musicMode === 'cheer') {
      const stepDur = 60 / this.musicTempo / 2;
      while (this.nextNote < c.currentTime + 0.2) {
        this.playStep(this.step, this.nextNote);
        this.step = (this.step + 1) % (MELODY.length * 8);
        this.nextNote += stepDur;
      }
    } else {
      this.nextNote = c.currentTime + 0.1;
    }
    this.birdTimer -= dt;
    if (this.ambLevel.birds > 0 && this.birdTimer <= 0) {
      this.birdTimer = 0.4 + Math.random() * (3 / this.ambLevel.birds);
      this.chirp();
    }
  }

  setMusic(mode: 'cheer' | 'drone' | 'off') {
    if (!this.started || mode === this.musicMode) return;
    this.musicMode = mode;
    const t = this.ctx.currentTime;
    if (this.droneGain) {
      this.droneGain.gain.setTargetAtTime(0, t, 0.8);
      const nodes = this.droneNodes;
      setTimeout(() => nodes.forEach((n) => n.stop()), 4000);
      this.droneNodes = [];
      this.droneGain = undefined;
    }
    if (mode === 'drone') this.startDrone();
    if (mode === 'cheer') this.step = 0;
  }

  // ---------------------------------------------------------------- music

  private playStep(step: number, t: number) {
    const bar = Math.floor(step / 8);
    const beat = step % 8;
    let note = MELODY[bar][beat];
    const detune = this.musicDetune;
    if (note !== null) {
      if (Math.random() < this.musicWrongness) note += Math.random() < 0.5 ? 1 : -1;
      this.pan(midiHz(note), t, 0.5, 0.22, detune);
    }
    if (beat % 2 === 1) for (const m of CHORDS[bar]) this.pan(midiHz(m + 12), t, 0.25, 0.05, detune);
    if (beat === 0 || beat === 3 || beat === 6) this.bass(midiHz(CHORDS[bar][0] - 12), t, detune);
    this.shaker(t, beat % 2 ? 0.05 : 0.025);
  }

  /** Steel-pan-like tone: sine fundamental with slightly inharmonic overtones. */
  private pan(f: number, t: number, dur: number, vel: number, detune = 0) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.musicBus);
    for (const [mult, amp] of [
      [1, 1],
      [2.005, 0.35],
      [3.98, 0.12],
    ]) {
      const o = c.createOscillator();
      o.frequency.value = f * mult;
      o.detune.value = detune;
      const og = c.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private bass(f: number, t: number, detune: number) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.4);
  }

  private shaker(t: number, vel: number) {
    const src = this.src(this.white);
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = this.env(t, vel, 0.004, 0.06);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t, Math.random());
    src.stop(t + 0.1);
  }

  private startDrone() {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.25, c.currentTime, 2);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.connect(g).connect(this.musicBus);
    for (const f of [41.2, 43.65, 61.7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      this.droneNodes.push(o);
    }
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    this.droneNodes.push(lfo);
    this.droneGain = g;
  }

  // ------------------------------------------------------------- one-shots

  /** Creates an HRTF panner at a world position, connected to the sfx bus. */
  at(pos: THREE.Vector3, refDistance = 2): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.rolloffFactor = 1.2;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    p.connect(this.sfxBus);
    return p;
  }

  footstep(surface: 'hard' | 'grass' | 'wood' | 'water', loud = 1) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const spec = { hard: [1800, 3, 0.07, 0.25], grass: [3200, 1, 0.12, 0.12], wood: [700, 2, 0.09, 0.3], water: [1100, 1.5, 0.22, 0.3] }[surface];
    const src = this.src(this.white);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = spec[0] * (0.85 + Math.random() * 0.3);
    f.Q.value = spec[1];
    src.connect(f).connect(this.env(t, spec[3] * loud, 0.003, spec[2])).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + spec[2] + 0.05);
  }

  ui(kind: 'blip' | 'quest' | 'level' | 'error') {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const seqs = { blip: [84], quest: [76, 81], level: [72, 76, 79, 84], error: [62, 61] };
    seqs[kind].forEach((m, i) => this.panTo(this.sfxBus, midiHz(m), t + i * 0.09, 0.6, 0.18, this.musicDetune));
  }

  private panTo(bus: AudioNode, f: number, t: number, dur: number, vel: number, detune: number) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus);
    const o = c.createOscillator();
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  bell(duration = 2.5) {
    if (!this.started) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = 940;
    const trem = c.createOscillator();
    trem.frequency.value = 24;
    const tg = c.createGain();
    tg.gain.value = 0.5;
    const g = c.createGain();
    g.gain.value = 0.5;
    trem.connect(tg).connect(g.gain);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    const out = this.env(t, 0.12, 0.01, duration);
    o.connect(bp).connect(g).connect(out).connect(this.sfxBus);
    o.start(t);
    trem.start(t);
    o.stop(t + duration);
    trem.stop(t + duration);
  }

  thunder(distance = 0.5) {
    if (!this.started) return;
    const t = this.ctx.currentTime + distance * 1.5;
    const src = this.src(this.brown);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900 * (1 - distance) + 120, t);
    lp.frequency.exponentialRampToValueAtTime(60, t + 4);
    src.connect(lp).connect(this.env(t, 1.4 * (1.2 - distance), 0.02, 5)).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + 5.5);
  }

  /** A breathy, formant-filtered whisper at a position (usually just behind the player). */
  whisper(pos: THREE.Vector3, seconds = 2) {
    if (!this.started) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = this.src(this.white);
    const out = this.at(pos, 1);
    const g = c.createGain();
    g.gain.value = 0;
    for (let s = 0; s < seconds; s += 0.16) {
      g.gain.setTargetAtTime(Math.random() < 0.7 ? 0.25 + Math.random() * 0.3 : 0, t + s, 0.03);
    }
    g.gain.setTargetAtTime(0, t + seconds, 0.05);
    for (const [f, q] of [
      [700 + Math.random() * 300, 6],
      [1500 + Math.random() * 600, 8],
      [2600, 10],
    ]) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      src.connect(bp).connect(g);
    }
    g.connect(out);
    src.start(t, Math.random());
    src.stop(t + seconds + 0.3);
  }

  heartbeat(volume = 0.6) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    for (const [dt, v] of [
      [0, 1],
      [0.22, 0.7],
    ]) {
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(70, t + dt);
      o.frequency.exponentialRampToValueAtTime(35, t + dt + 0.15);
      o.connect(this.env(t + dt, volume * v, 0.005, 0.18)).connect(this.sfxBus);
      o.start(t + dt);
      o.stop(t + dt + 0.25);
    }
  }

  stinger() {
    if (!this.started) return;
    const c = this.ctx;
    const t = c.currentTime;
    const g = this.env(t, 0.5, 0.01, 2.2);
    g.connect(this.sfxBus);
    for (const f of [311, 330, 466, 622, 659]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.frequency.linearRampToValueAtTime(f * 0.94, t + 2);
      const lp = c.createBiquadFilter();
      lp.frequency.value = 2400;
      o.connect(lp).connect(g);
      o.start(t);
      o.stop(t + 2.3);
    }
  }

  glitch(seconds = 0.35) {
    if (!this.started) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'square';
    for (let s = 0; s < seconds; s += 0.03) o.frequency.setValueAtTime(80 + Math.random() * 1600, t + s);
    const crush = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.round(((i / 255) * 2 - 1) * 4) / 4;
    crush.curve = curve;
    o.connect(crush).connect(this.env(t, 0.15, 0.002, seconds)).connect(this.sfxBus);
    o.start(t);
    o.stop(t + seconds + 0.05);
  }

  /** Wet impact, ripping flesh or bone crunch at a world position. */
  gore(kind: 'splat' | 'rip' | 'crunch', pos: THREE.Vector3) {
    if (!this.started) return;
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.at(pos);
    if (kind === 'splat') {
      const src = this.src(this.brown);
      const lp = c.createBiquadFilter();
      lp.frequency.value = 900;
      src.connect(lp).connect(this.env(t, 1.2, 0.002, 0.35)).connect(out);
      src.start(t, Math.random());
      src.stop(t + 0.4);
      const o = c.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.2);
      o.connect(this.env(t, 0.8, 0.002, 0.25)).connect(out);
      o.start(t);
      o.stop(t + 0.3);
    } else if (kind === 'rip') {
      const src = this.src(this.white);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2;
      bp.frequency.setValueAtTime(350, t);
      bp.frequency.exponentialRampToValueAtTime(2400, t + 0.7);
      const g = c.createGain();
      for (let s = 0; s < 0.8; s += 0.02) g.gain.setValueAtTime(Math.random() * 1.2, t + s);
      g.gain.setValueAtTime(0, t + 0.82);
      src.connect(bp).connect(g).connect(out);
      src.start(t, Math.random());
      src.stop(t + 0.9);
    } else {
      for (let i = 0; i < 6; i++) {
        const ti = t + Math.random() * 0.18;
        const src = this.src(this.white);
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900 + Math.random() * 1500;
        bp.Q.value = 3;
        src.connect(bp).connect(this.env(ti, 0.9, 0.001, 0.04)).connect(out);
        src.start(ti, Math.random());
        src.stop(ti + 0.06);
      }
    }
  }

  gurgle(pos: THREE.Vector3, seconds = 2) {
    if (!this.started) return;
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.at(pos);
    for (let s = 0; s < seconds; s += 0.05 + Math.random() * 0.12) {
      const o = c.createOscillator();
      const f = 150 + Math.random() * 350;
      o.frequency.setValueAtTime(f, t + s);
      o.frequency.exponentialRampToValueAtTime(f * 1.8, t + s + 0.05);
      o.connect(this.env(t + s, 0.25, 0.005, 0.06)).connect(out);
      o.start(t + s);
      o.stop(t + s + 0.08);
    }
  }

  splash(pos: THREE.Vector3, size = 1) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const src = this.src(this.white);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2200, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.6 * size);
    src.connect(bp).connect(this.env(t, 0.9 * size, 0.005, 0.7 * size)).connect(this.at(pos, 3));
    src.start(t, Math.random());
    src.stop(t + size + 0.1);
  }

  /** Radio static bed; returns a function that stops it. */
  radio(): () => void {
    if (!this.started) return () => undefined;
    const src = this.src(this.white, true);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.value = 0.07;
    src.connect(bp).connect(g).connect(this.sfxBus);
    src.start();
    return () => {
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      setTimeout(() => src.stop(), 400);
    };
  }

  luscaRoar(pos: THREE.Vector3) {
    if (!this.started) return;
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.at(pos, 8);
    const lp = c.createBiquadFilter();
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(900, t + 1);
    lp.frequency.linearRampToValueAtTime(200, t + 3.5);
    const g = this.env(t, 1.4, 0.3, 3.5);
    lp.connect(g).connect(out);
    for (const f of [38, 41, 57, 76]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 0.8, t + 3.5);
      o.connect(lp);
      o.start(t);
      o.stop(t + 3.8);
    }
    const n = this.src(this.brown);
    n.connect(lp);
    n.start(t, Math.random());
    n.stop(t + 3.8);
    this.gurgle(pos, 3);
  }

  /** Looping ragged breath at a moving position; returns a handle to move or stop it. */
  breath(pos: THREE.Vector3): { move(p: THREE.Vector3): void; stop(): void } {
    if (!this.started) return { move() {}, stop() {} };
    const c = this.ctx;
    const src = this.src(this.white, true);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 1.5;
    const g = c.createGain();
    g.gain.value = 0;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.55;
    const lg = c.createGain();
    lg.gain.value = 0.35;
    lfo.connect(lg).connect(g.gain);
    const out = this.at(pos, 1.5);
    src.connect(bp).connect(g).connect(out);
    src.start();
    lfo.start();
    return {
      move: (p) => {
        const t = c.currentTime;
        out.positionX.setTargetAtTime(p.x, t, 0.05);
        out.positionY.setTargetAtTime(p.y, t, 0.05);
        out.positionZ.setTargetAtTime(p.z, t, 0.05);
      },
      stop: () => {
        src.stop();
        lfo.stop();
      },
    };
  }

  flare(): () => void {
    if (!this.started) return () => undefined;
    const t = this.ctx.currentTime;
    const src = this.src(this.white, true);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.6);
    src.connect(hp).connect(g).connect(this.sfxBus);
    src.start();
    return () => src.stop();
  }

  // --------------------------------------------------------------- helpers

  private bus(gain: number, to: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(to);
    return g;
  }

  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private src(buf: AudioBuffer, loop = false): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    return s;
  }

  private noise(brown: boolean): AudioBuffer {
    const len = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  private loopNoise(buf: AudioBuffer, type: BiquadFilterType, freq: number, to: AudioNode, q = 1): GainNode {
    const s = this.src(buf, true);
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    s.connect(f).connect(g).connect(to);
    s.start(0, Math.random() * 2);
    return g;
  }

  private hum(): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.ambBus);
    for (const [f, a] of [
      [60, 0.6],
      [120, 0.3],
      [180, 0.1],
    ]) {
      const o = this.ctx.createOscillator();
      o.frequency.value = f;
      const og = this.ctx.createGain();
      og.gain.value = a;
      o.connect(og).connect(g);
      o.start();
    }
    return g;
  }

  private chirp() {
    const c = this.ctx;
    const t = c.currentTime;
    const base = 2600 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    pan.connect(this.ambBus);
    for (let i = 0; i < n; i++) {
      const ti = t + i * (0.07 + Math.random() * 0.05);
      const o = c.createOscillator();
      o.frequency.setValueAtTime(base, ti);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), ti + 0.05);
      o.connect(this.env(ti, 0.04 * this.ambLevel.birds, 0.005, 0.06)).connect(pan);
      o.start(ti);
      o.stop(ti + 0.09);
    }
  }
}

const AMB_SCALE: Record<keyof Ambience, number> = { birds: 1, wind: 0.5, sea: 0.4, rain: 0.35, hum: 0.05 };

export const audio = new AudioEngine();
