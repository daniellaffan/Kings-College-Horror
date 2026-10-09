// DOM overlay: the cheerful RPG HUD (the disguise) and every screen. "Crashes" and
// "corrupted saves" are drawn here, inside the page; nothing imitates the OS or browser.
import './style.css';
import type { Vec2 } from '../world/geo';
import type { RPG } from '../rpg/state';
import { settings, updateSettings, type GoreLevel } from '../settings';
import type { Quality } from '../engine/renderer';

export interface MapData {
  polys: { pts: Vec2[]; fill: string }[];
  lines: { pts: Vec2[]; w: number; color: string }[];
}

export interface Marker {
  u: number;
  v: number;
  kind: 'quest' | 'npc' | 'lie';
  label?: string;
}

const h = (tag: string, cls = '', html = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class UI {
  readonly hudEl: HTMLElement;
  private questEl: HTMLElement;
  private statsEl: HTMLElement;
  private minimap: HTMLCanvasElement;
  private compassEl: HTMLElement;
  private promptEl: HTMLElement;
  private toastsEl: HTMLElement;
  private subsEl: HTMLElement;
  private tagsEl: HTMLElement;
  private dialogueEl: HTMLElement;
  private fadeEl: HTMLElement;
  private screens: Record<string, HTMLElement> = {};
  private fpsEl: HTMLElement;
  readonly lens: HTMLCanvasElement;
  readonly redVignette: HTMLElement;
  /** True while dialogue, notes, menus or cards own the input. */
  busy = false;
  journalOpen = false;
  mapData: MapData = { polys: [], lines: [] };
  mapLies = 0;
  onErase: () => void = () => undefined;
  onQuality: (q: Quality) => void = () => undefined;
  private subTimer = 0;
  private advance?: () => void;
  private choiceKeys?: (e: KeyboardEvent) => void;

  constructor(root: HTMLElement) {
    const layer = h('div', 'layer');
    root.appendChild(layer);
    this.hudEl = h('div', 'layer off');
    this.hudEl.id = 'hud';
    layer.appendChild(this.hudEl);
    this.questEl = h('div', 'quest');
    this.statsEl = h('div', 'stats');
    this.minimap = document.createElement('canvas');
    this.minimap.id = 'minimap';
    this.minimap.width = this.minimap.height = 400;
    this.compassEl = h('div', 'compass');
    this.promptEl = h('div', 'prompt');
    this.toastsEl = h('div', 'toasts');
    this.subsEl = h('div', 'subs');
    this.tagsEl = h('div', 'layer');
    this.hudEl.append(this.tagsEl, this.questEl, this.statsEl, this.minimap, this.compassEl, h('div', 'crosshair'));
    layer.append(this.promptEl, this.toastsEl, this.subsEl);

    this.lens = document.createElement('canvas');
    this.lens.id = 'lens';
    this.redVignette = h('div');
    this.redVignette.id = 'vignette-red';
    root.append(this.lens, this.redVignette);

    this.dialogueEl = h('div', '', '<div class="who"></div><div class="text"></div><div class="choices"></div><div class="more">E / Space ▸</div>');
    this.dialogueEl.id = 'dialogue';
    root.appendChild(this.dialogueEl);

    for (const id of ['loading', 'warning', 'title', 'settings', 'journal', 'card', 'note', 'death', 'pause', 'fake', 'credits']) {
      const s = h('div', 'screen');
      s.id = id;
      root.appendChild(s);
      this.screens[id] = s;
    }
    this.fadeEl = h('div');
    this.fadeEl.id = 'fade';
    root.appendChild(this.fadeEl);
    this.fpsEl = h('div', 'fps');
    root.appendChild(this.fpsEl);
    this.screens.loading.innerHTML = '<div style="font-weight:800;letter-spacing:2px">KING\'S HOLLOW COLLEGE</div><div class="bar"><div></div></div><div class="msg" style="opacity:.7;font-size:13px">Loading campus…</div>';

    window.addEventListener('keydown', (e) => {
      if (this.advance && ['KeyE', 'Space', 'Enter'].includes(e.code)) {
        e.preventDefault();
        this.advance();
      }
    });
    window.addEventListener('mousedown', () => this.advance?.());
  }

  private show(id: string, on: boolean) {
    this.screens[id].classList.toggle('on', on);
  }

  // ------------------------------------------------------------- loading / warning / title
  loading(p: number, msg?: string) {
    this.show('loading', p < 1);
    (this.screens.loading.querySelector('.bar div') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
    if (msg) this.screens.loading.querySelector('.msg')!.textContent = msg;
  }

  warning(): Promise<void> {
    const s = this.screens.warning;
    s.innerHTML = `<div class="panel">
      <h1>CONTENT WARNING</h1>
      <p><b>This game is not what it appears to be.</b> It contains extreme graphic gore and violence, body horror, drowning, death, and disturbing psychological content that deliberately manipulates the game's own interface.</p>
      <p>It is <b>not suitable for children</b> or anyone easily disturbed.</p>
      <p><b>Photosensitivity:</b> contains lightning flashes, flickering lights and brief glitch effects (kept below 3 flashes per second). You can soften flashes in Settings.</p>
      <p style="opacity:.75;font-size:14px">Everything stays inside this game: it never reads your files, accounts, camera or microphone. All characters are fictional. Settings (including gore level and "Erase all game memory") always do exactly what they say.</p>
      <div class="row"><label>Gore level</label><div class="seg" data-k="gore"></div></div>
      <button class="btn" id="w-ok">I understand — continue</button></div>`;
    this.fillSeg(s.querySelector('[data-k=gore]')!, ['off', 'moderate', 'extreme'], settings.gore, (v) => updateSettings({ gore: v as GoreLevel }));
    this.show('warning', true);
    return new Promise((res) => {
      s.querySelector('#w-ok')!.addEventListener('click', () => {
        this.show('warning', false);
        res();
      });
    });
  }

  title(o: { hasSave: boolean; haunted: boolean; runs: number; endings: number }): Promise<'new' | 'continue'> {
    const s = this.screens.title;
    s.classList.toggle('memory', o.haunted);
    const sub = o.endings > 0 ? 'Welcome back, Kai. It is the first day.' : o.haunted ? 'Welcome back! Your first day is about to begin!' : 'Your first week at a brand-new school!';
    s.innerHTML = `<div>
      <div class="logo">King's Hollow<small>COLLEGE · FIRST DAY RPG</small></div>
      <div class="tag">${esc(sub)}</div>
      <div class="menu">
        <button class="btn" id="t-new">${o.haunted ? 'New Game?' : 'New Game'}</button>
        ${o.hasSave ? '<button class="btn alt" id="t-cont">Continue</button>' : ''}
        <button class="btn alt" id="t-set">Settings</button>
        <button class="btn alt" id="t-cred">Credits</button>
      </div></div>`;
    this.show('title', true);
    return new Promise((res) => {
      s.querySelector('#t-new')!.addEventListener('click', () => {
        this.show('title', false);
        res('new');
      });
      s.querySelector('#t-cont')?.addEventListener('click', () => {
        this.show('title', false);
        res('continue');
      });
      s.querySelector('#t-set')!.addEventListener('click', () => void this.settingsPanel());
      s.querySelector('#t-cred')!.addEventListener('click', () => void this.credits());
    });
  }

  private fillSeg(el: Element, values: string[], cur: string, set: (v: string) => void) {
    el.innerHTML = values.map((v) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('');
    el.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        el.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        set(b.dataset.v!);
      }),
    );
  }

  /** Settings never lie. */
  settingsPanel(): Promise<void> {
    const s = this.screens.settings;
    s.innerHTML = `<div class="panel" style="width:min(560px,94vw)">
      <h2 style="margin-top:0;color:var(--navy)">Settings</h2>
      <div class="row"><label>Gore level</label><div class="seg" data-k="gore"></div></div>
      <div class="row"><label>Graphics quality</label><div class="seg" data-k="quality"></div></div>
      <div class="row"><label>Mouse sensitivity</label><input type="range" min="0.3" max="2.5" step="0.05" data-k="sensitivity"></div>
      <div class="row"><label>Volume</label><input type="range" min="0" max="1" step="0.02" data-k="volume"></div>
      <div class="row"><label>Reduce flashes</label><input type="checkbox" data-k="reduceFlashes"></div>
      <div class="row"><label>Subtitles</label><input type="checkbox" data-k="subtitles"></div>
      <div class="row"><label>Show FPS</label><input type="checkbox" data-k="showFps"></div>
      <p style="font-size:13px;color:#555">"Erase all game memory" deletes this game's saves, settings and everything it remembers about previous playthroughs (only this game's own browser storage).</p>
      <button class="btn danger" id="s-erase">Erase all game memory</button>
      <button class="btn" id="s-close">Done</button></div>`;
    this.fillSeg(s.querySelector('[data-k=gore]')!, ['off', 'moderate', 'extreme'], settings.gore, (v) => updateSettings({ gore: v as GoreLevel }));
    this.fillSeg(s.querySelector('[data-k=quality]')!, ['low', 'high', 'ultra'], settings.quality, (v) => {
      updateSettings({ quality: v as Quality });
      this.onQuality(v as Quality);
    });
    for (const k of ['sensitivity', 'volume'] as const) {
      const inp = s.querySelector(`[data-k=${k}]`) as HTMLInputElement;
      inp.value = String(settings[k]);
      inp.addEventListener('input', () => updateSettings({ [k]: Number(inp.value) }));
    }
    for (const k of ['reduceFlashes', 'subtitles', 'showFps'] as const) {
      const inp = s.querySelector(`[data-k=${k}]`) as HTMLInputElement;
      inp.checked = settings[k];
      inp.addEventListener('change', () => updateSettings({ [k]: inp.checked }));
    }
    this.show('settings', true);
    return new Promise((res) => {
      s.querySelector('#s-erase')!.addEventListener('click', () => {
        if (confirm('Erase all saves, settings and game memory for King\'s Hollow? This cannot be undone.')) {
          this.onErase();
          this.toast('All game memory erased.', 'gold');
        }
      });
      s.querySelector('#s-close')!.addEventListener('click', () => {
        this.show('settings', false);
        res();
      });
    });
  }

  credits(): Promise<void> {
    const s = this.screens.credits;
    s.innerHTML = `<div class="panel">
      <h2 style="margin-top:0;color:var(--navy)">Credits</h2>
      <p><b>King's Hollow</b> — a fictional horror game. The school, story and every character are invented. The campus layout is modelled on public map data of a real site off Western Road, Nassau; no real people, staff or events are depicted.</p>
      <p><b>Map data</b> © OpenStreetMap contributors, available under the Open Database License (ODbL) — openstreetmap.org/copyright.</p>
      <p><b>Textures and HDRIs</b> from Poly Haven (polyhaven.com), CC0: white stucco, painted plaster wall, long white tiles, laminate floor, terrazzo tiles, ceiling interior, asphalt, leafy grass, rubberized track, patio tiles, rounded square tiled wall, rusty metal, painted concrete floor, forest ground, white oak veneer; skies: Qwantani Noon, Kloofendal Overcast, Qwantani Dusk 2, Kloppenheim 07.</p>
      <p><b>Engine</b>: three.js (MIT), postprocessing (Zlib), N8AO (CC0/MIT). Built with Vite.</p>
      <p><b>Folklore</b>: the Lusca is a creature of Bahamian blue-hole legend.</p>
      <p><b>Audio</b>: all sound and music synthesised in the browser.</p>
      <button class="btn" id="c-close">Close</button></div>`;
    this.show('credits', true);
    return new Promise((res) =>
      s.querySelector('#c-close')!.addEventListener('click', () => {
        this.show('credits', false);
        res();
      }),
    );
  }

  // ------------------------------------------------------------- HUD
  hud(on: boolean) {
    this.hudEl.classList.toggle('off', !on);
  }

  renderHUD(rpg: RPG, stamina: number) {
    const q = rpg.tracked ? rpg.quests.get(rpg.tracked) : undefined;
    const you = [...rpg.quests.values()].filter((x) => x.you && x.status === 'active');
    this.questEl.style.display = q || you.length ? 'block' : 'none';
    this.questEl.innerHTML = q
      ? `<div class="q-title">${esc(q.def.title || 'Quest')}</div><div class="q-obj">${esc(q.def.objective)}</div>${you.length ? `<div class="q-extra">${esc(you[you.length - 1].def.objective)}</div>` : ''}`
      : you.length
        ? `<div class="q-obj" style="font-family:var(--mono);font-size:15px">${esc(you[you.length - 1].def.objective)}</div>`
        : '';
    const next = rpg.xpToNext();
    const friend = rpg.friendship.amara;
    this.statsEl.innerHTML = `<div class="small"><span class="lv">Kai Rolle · Lv ${rpg.level}</span><span>Day ${rpg.day}</span></div>
      <div class="small"><span>${esc(rpg.hpLabel)}</span><span>${Math.round(rpg.hp)}</span></div><div class="bar hp ${rpg.hpLabel !== 'HP' ? 'oxygen' : ''}"><div style="width:${rpg.hp}%"></div></div>
      <div class="small"><span>XP</span><span>${rpg.xp}/${next}</span></div><div class="bar xp"><div style="width:${(rpg.xp / next) * 100}%"></div></div>
      <div class="bar st" style="height:4px"><div style="width:${stamina * 100}%"></div></div>
      <div class="chips">${(['charm', 'grit', 'wits'] as const).map((k) => `<span class="chip">${esc(rpg.statNames[k])} ${rpg.stats[k]}</span>`).join('')}
      ${friend !== undefined ? `<span class="chip" title="Friendship">♥ ${friend === 0 && rpg.act > 1 ? '—' : friend}</span>` : ''}</div>`;
  }

  stamina(rpg: RPG, s: number) {
    const el = this.statsEl.querySelector('.bar.st div') as HTMLElement | null;
    if (el) el.style.width = `${s * 100}%`;
    void rpg;
  }

  fps(v: number | null) {
    this.fpsEl.textContent = v === null ? '' : `${v.toFixed(0)} fps`;
  }

  toast(text: string, kind: 'gold' | 'wrong' | '' = '', seconds = 3.2) {
    const t = h('div', `toast ${kind}`);
    t.textContent = text;
    this.toastsEl.appendChild(t);
    setTimeout(() => t.remove(), seconds * 1000);
  }

  prompt(text: string | null) {
    this.promptEl.style.display = text ? 'block' : 'none';
    if (text) this.promptEl.innerHTML = `<b>E</b>${esc(text)}`;
  }

  subtitle(who: string | null, text: string, seconds = 3.5) {
    if (!settings.subtitles) return;
    this.subsEl.innerHTML = who ? `<i>${esc(who)}:</i> ${esc(text)}` : esc(text);
    clearTimeout(this.subTimer);
    this.subTimer = window.setTimeout(() => (this.subsEl.innerHTML = ''), seconds * 1000);
  }

  nametags(tags: { x: number; y: number; text: string; heart?: boolean }[]) {
    this.tagsEl.innerHTML = tags.map((t) => `<div class="nametag" style="left:${t.x}px;top:${t.y}px">${esc(t.text)}${t.heart ? ' <span class="heart">♥</span>' : ''}</div>`).join('');
  }

  drawMinimap(u: number, v: number, yaw: number, markers: Marker[], target: { u: number; v: number; label: string } | null) {
    const c = this.minimap.getContext('2d')!;
    const S = this.minimap.width;
    const scale = 2.2; // px per metre (canvas is 2x CSS)
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#6f9f4f';
    c.fillRect(0, 0, S, S);
    c.translate(S / 2, S / 2);
    c.rotate(yaw);
    c.scale(scale, -scale);
    c.translate(-u, -v);
    for (const l of this.mapData.lines) {
      c.strokeStyle = l.color;
      c.lineWidth = l.w;
      c.lineCap = 'round';
      c.beginPath();
      l.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();
    }
    for (const p of this.mapData.polys) {
      c.fillStyle = p.fill;
      c.beginPath();
      p.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.fill();
    }
    // Act II: corridors that aren't there.
    if (this.mapLies > 0) {
      c.globalAlpha = Math.min(1, this.mapLies);
      c.fillStyle = '#f4f1ea';
      for (const [x, y, w, hh] of [
        [26.5, 20.1, 22.3, 2.6],
        [-30, -64, 3, 60],
        [-30, -6, 56, 3],
        [60, 45, 30, 3],
      ]) c.fillRect(x, y, w, hh);
      c.globalAlpha = 1;
    }
    for (const m of markers) {
      c.fillStyle = m.kind === 'quest' ? '#f2c200' : m.kind === 'lie' ? '#2a7fc4' : '#ffffff';
      c.beginPath();
      c.arc(m.u, m.v, m.kind === 'quest' ? 3 : 1.6, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    // Player arrow.
    c.fillStyle = '#ff3b3b';
    c.strokeStyle = '#fff';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(S / 2, S / 2 - 14);
    c.lineTo(S / 2 + 10, S / 2 + 10);
    c.lineTo(S / 2, S / 2 + 4);
    c.lineTo(S / 2 - 10, S / 2 + 10);
    c.closePath();
    c.fill();
    c.stroke();
    // Off-map target arrow on the rim.
    if (target) {
      const dx = target.u - u;
      const dy = target.v - v;
      const d = Math.hypot(dx, dy);
      if (d * scale > S / 2 - 12) {
        const a = Math.atan2(dy, dx) + yaw;
        c.fillStyle = '#f2c200';
        c.beginPath();
        c.arc(S / 2 + Math.cos(a) * (S / 2 - 14), S / 2 - Math.sin(a) * (S / 2 - 14), 9, 0, Math.PI * 2);
        c.fill();
      }
      this.compassEl.textContent = `${target.label} · ${Math.round(d)} m`;
    } else this.compassEl.textContent = '';
  }

  // ------------------------------------------------------------- dialogue
  private typeText(el: HTMLElement, text: string, cps: number, hold: number): Promise<void> {
    return new Promise((res) => {
      el.textContent = '';
      let i = 0;
      let done = false;
      let timer = 0;
      const finish = () => {
        if (done) return;
        done = true;
        clearInterval(timer);
        el.textContent = text;
        res();
      };
      this.advance = finish;
      const start = () => {
        timer = window.setInterval(() => {
          i++;
          el.textContent = text.slice(0, i);
          if (i >= text.length) finish();
        }, 1000 / cps);
      };
      if (hold > 0) {
        // A beat too long. The dialogue box just... waits.
        this.advance = () => undefined;
        setTimeout(() => {
          this.advance = finish;
          start();
        }, hold * 1000);
      } else start();
    });
  }

  /** Shows one line; resolves when the player advances. */
  async say(who: string, text: string, o: { wrong?: boolean; cps?: number; hold?: number; auto?: number } = {}) {
    this.busy = true;
    const d = this.dialogueEl;
    d.classList.add('on');
    d.classList.toggle('wrong', !!o.wrong);
    (d.querySelector('.who') as HTMLElement).textContent = who;
    (d.querySelector('.who') as HTMLElement).style.display = who ? 'block' : 'none';
    (d.querySelector('.choices') as HTMLElement).innerHTML = '';
    (d.querySelector('.more') as HTMLElement).style.display = 'block';
    await this.typeText(d.querySelector('.text') as HTMLElement, text, o.cps ?? 55, o.hold ?? 0);
    await new Promise<void>((res) => {
      let t = 0;
      this.advance = () => {
        clearTimeout(t);
        res();
      };
      if (o.auto) t = window.setTimeout(() => this.advance?.(), o.auto * 1000);
    });
    this.advance = undefined;
  }

  async choose(who: string, text: string, options: string[], o: { wrong?: boolean } = {}): Promise<number> {
    this.busy = true;
    const d = this.dialogueEl;
    d.classList.add('on');
    d.classList.toggle('wrong', !!o.wrong);
    (d.querySelector('.who') as HTMLElement).textContent = who;
    (d.querySelector('.more') as HTMLElement).style.display = 'none';
    const ch = d.querySelector('.choices') as HTMLElement;
    ch.innerHTML = '';
    await this.typeText(d.querySelector('.text') as HTMLElement, text, 55, 0);
    this.advance = undefined;
    return new Promise((res) => {
      let sel = 0;
      const buttons = options.map((opt, i) => {
        const b = document.createElement('button');
        b.textContent = `${i + 1}. ${opt}`;
        b.addEventListener('click', () => pick(i));
        b.addEventListener('mouseenter', () => mark(i));
        ch.appendChild(b);
        return b;
      });
      const mark = (i: number) => {
        sel = i;
        buttons.forEach((b, k) => b.classList.toggle('sel', k === i));
      };
      const pick = (i: number) => {
        window.removeEventListener('keydown', this.choiceKeys!);
        this.choiceKeys = undefined;
        ch.innerHTML = '';
        res(i);
      };
      mark(0);
      this.choiceKeys = (e: KeyboardEvent) => {
        const n = Number(e.key);
        if (n >= 1 && n <= options.length) pick(n - 1);
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') mark((sel + 1) % options.length);
        else if (e.code === 'ArrowUp' || e.code === 'KeyW') mark((sel + options.length - 1) % options.length);
        else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') pick(sel);
      };
      window.addEventListener('keydown', this.choiceKeys);
    });
  }

  endDialogue() {
    this.dialogueEl.classList.remove('on');
    this.busy = false;
    this.advance = undefined;
  }

  // ------------------------------------------------------------- journal
  toggleJournal(rpg: RPG, open = !this.journalOpen) {
    this.journalOpen = open;
    const s = this.screens.journal;
    if (open) {
      const qs = [...rpg.quests.values()].sort((a, b) => a.order - b.order);
      s.innerHTML = `<div class="panel"><h2>Journal</h2>
        ${qs.map((q) => `<div class="qrow ${q.status === 'done' ? 'done' : ''} ${q.you ? 'you' : ''}"><div class="box">${q.status === 'done' ? '✓' : ''}</div><div><div class="qt"><b>${esc(q.def.title)}</b> ${esc(q.def.objective)}</div></div></div>`).join('')}
        <h2 style="margin-top:18px">Bag</h2><div class="inv">${rpg.inventory.map((i) => `<span class="item ${i.wet ? 'wet' : ''}">${esc(i.name)}</span>`).join('') || '<i>Empty</i>'}</div>
        <p style="font-size:12px;color:#777;margin-bottom:0">Tab to close</p></div>`;
    }
    this.show('journal', open);
  }

  // ------------------------------------------------------------- overlays
  fade(to: number, seconds = 1): Promise<void> {
    this.fadeEl.style.transition = `opacity ${seconds}s`;
    this.fadeEl.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, seconds * 1000));
  }

  async card(big: string, sub = '', seconds = 3) {
    const s = this.screens.card;
    s.innerHTML = `<div class="big">${esc(big)}</div><div class="sub">${esc(sub)}</div>`;
    this.show('card', true);
    await new Promise((r) => setTimeout(r, seconds * 1000));
    this.show('card', false);
  }

  note(title: string, body: string): Promise<void> {
    this.busy = true;
    const s = this.screens.note;
    s.innerHTML = `<div class="panel"><h3>${esc(title)}</h3>${esc(body)}<p style="font-family:var(--font);font-size:12px;color:#7a6a50;margin-bottom:0">E / click to close</p></div>`;
    this.show('note', true);
    return new Promise((res) => {
      setTimeout(() => {
        this.advance = () => {
          this.advance = undefined;
          this.show('note', false);
          this.busy = false;
          res();
        };
      }, 400);
    });
  }

  death(text: string): Promise<void> {
    this.busy = true;
    const s = this.screens.death;
    s.innerHTML = `<h1>${esc(text)}</h1><button class="btn" style="width:240px" id="d-retry">Try again</button>`;
    this.show('death', true);
    return new Promise((res) =>
      s.querySelector('#d-retry')!.addEventListener('click', () => {
        this.show('death', false);
        this.busy = false;
        res();
      }),
    );
  }

  pause(open: boolean, leaky: boolean, onResume: () => void, onQuit: () => void) {
    const s = this.screens.pause;
    s.classList.toggle('leaky', leaky);
    if (open) {
      s.innerHTML = `<div class="panel"><h2 style="margin-top:0;color:var(--navy)">${leaky ? 'Paused?' : 'Paused'}</h2>
        <button class="btn" id="p-res">Resume</button><button class="btn alt" id="p-set">Settings</button><button class="btn alt" id="p-quit">Quit to title</button></div>`;
      s.querySelector('#p-res')!.addEventListener('click', onResume);
      s.querySelector('#p-set')!.addEventListener('click', () => void this.settingsPanel());
      s.querySelector('#p-quit')!.addEventListener('click', onQuit);
    }
    this.show('pause', open);
  }

  get paused() {
    return this.screens.pause.classList.contains('on');
  }

  /** In-page fake crash: plain text "restarting" screen. */
  async fakeCrash(lines: string[]) {
    const s = this.screens.fake;
    s.className = 'screen on';
    s.textContent = '';
    for (const l of lines) {
      s.textContent += l + '\n';
      await new Promise((r) => setTimeout(r, 380 + Math.random() * 500));
    }
    await new Promise((r) => setTimeout(r, 1200));
    s.className = 'screen';
  }

  /** In-page fake "save corrupted" screen whose text slowly rearranges itself. */
  async fakeCorrupt(seconds = 9) {
    const s = this.screens.fake;
    s.className = 'screen on corrupt';
    const lines = ['Save file could not be loaded.', 'Kai Rolle · Lv 4 · Day 1', 'Kai Rolle · Lv 4 · Day 1', '<s>Amara Knowles</s>', 'Kai Rolle · Day 1 · Lv ∞', 'Kai Rolle · drowned · Day 1'];
    const target = 'you are still in the water kai';
    s.innerHTML = `<div class="savebox"><h3 style="margin-top:0">Load Game</h3><div id="fc-msg"></div>${lines
      .slice(1)
      .map((l) => `<div class="slot">${l}</div>`)
      .join('')}</div>`;
    const msg = s.querySelector('#fc-msg') as HTMLElement;
    let text = lines[0].split('');
    const t0 = performance.now();
    await new Promise<void>((res) => {
      const iv = setInterval(() => {
        const k = (performance.now() - t0) / (seconds * 1000);
        // Swap letters towards the hidden sentence, slowly.
        for (let n = 0; n < 2; n++) {
          const i = Math.floor(Math.random() * Math.max(text.length, target.length));
          if (Math.random() < k) text[i] = target[i] ?? '';
          else if (text.length > 1) {
            const j = Math.floor(Math.random() * text.length);
            [text[i], text[j]] = [text[j], text[i]];
          }
        }
        text = text.slice(0, Math.max(target.length, 8));
        msg.textContent = text.join('');
        if (k >= 1) {
          clearInterval(iv);
          msg.textContent = target;
          setTimeout(res, 1600);
        }
      }, 140);
    });
    s.className = 'screen';
  }
}
