import { chooseShot, GOOD_BOT } from './bot';
import {
  LAUNCHERS,
  LAUNCHER_ORDER,
  NODE_INFO,
  SECTORS,
  SHOTS,
  SPECIALS,
  UPGRADES,
  PLAN,
  type LauncherId,
  type NodeKind,
  type ShotId,
  type UpgId,
} from './data';
import type { Sys } from './gen';
import { H, MAX_STEPS, W, orbitPos, requiredLeft, sceneAt, simulate, type Scene, type ShotIn, type SimEvent, type SimResult } from './physics';
import { Rng, hash, randomSeedText } from './rng';
import {
  applyShot,
  buy,
  canBuy,
  canEvent,
  choices,
  doEvent,
  enterSystem,
  eventDef,
  finishSystem,
  leaveNode,
  loadMeta,
  loadRun,
  lvl,
  makeShop,
  modsFor,
  newRun,
  pickEvent,
  previewSteps,
  recordEnd,
  saveMeta,
  saveRun,
  station,
  stationOpts,
  type Line,
  type Outcome,
  type RunState,
} from './run';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'system' | 'result' | 'shop' | 'station' | 'event' | 'end';
type Phase = 'aim' | 'fly' | 'done';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  size: number;
}

interface Flight {
  res: SimResult;
  shot: ShotIn;
  s: number;
  ei: number;
  dmg: Map<number, number>;
  rocks: Set<number>;
  shields: Set<number>;
  hits: number;
}

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips waits and resolves shots at once, for bot tests. */
const FAST = PARAMS.has('fast');
const DEBUG = PARAMS.has('debug');
const STEPS_PER_SEC = 320;
const KIND_LABEL: Record<string, string> = { system: 'System', hard: 'Hard system', boss: 'Boss system' };
const SHOT_KEYS: ShotId[] = ['std', 'split', 'heavy', 'phase', 'boomer', 'seeker'];
const deg = (a: number): number => Math.round(((((-a * 180) / Math.PI) % 360) + 360) % 360);

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private pick: LauncherId = 'mk1';

  // System play
  private phase: Phase = 'aim';
  private angle = -Math.PI / 2;
  private power = 0.6;
  private type: ShotId = 'std';
  private preview: SimResult | null = null;
  private previewKey = '';
  private flight: Flight | null = null;
  private ff = false;
  private turnVis = 0;
  private floats: Float[] = [];
  private parts: Part[] = [];
  private shake = 0;
  private drag: { sx: number; sy: number; x: number; y: number; id: number } | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  private raf = 0;
  private last = 0;
  private clock = 0;
  private scale = 1;
  private timers: number[] = [];

  // Other screens
  private result: { out: Outcome; name: string; kind: string; shotCredits: number; banks: number; orbits: number } | null = null;
  private end: { won: boolean; score: number; dust: number; sector: number; stats: RunState['stats'] } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    try {
      setMuted(localStorage.getItem('orbit-sling.mute') === '1');
    } catch {
      /* ignore */
    }
    this.pick = this.meta.unlocked.includes(this.meta.last) ? this.meta.last : 'mk1';
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => (this.drag = null));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    if (DEBUG) this.installDebug();
    this.render();
  }

  private get sys(): Sys {
    return this.run!.sys!;
  }

  // ---------- DOM ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'map':
        body = this.mapView();
        break;
      case 'system':
        body = `<div class="play"><div class="cv-wrap"><canvas id="cv"></canvas></div><aside class="side" id="side">${this.sideView()}</aside></div>`;
        break;
      case 'result':
        body = this.resultView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'station':
        body = this.stationView();
        break;
      case 'event':
        body = this.eventView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'system') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.resize();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
    }
  }

  private refresh(): void {
    if (this.screen !== 'system') return this.render();
    const side = this.root.querySelector<HTMLElement>('#side');
    if (side) side.innerHTML = this.sideView();
    const top = this.root.querySelector<HTMLElement>('header.top');
    if (top) top.outerHTML = this.topBar();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const sec = SECTORS[Math.min(r.sector, SECTORS.length - 1)];
    const ups = (Object.keys(UPGRADES) as UpgId[])
      .filter((u) => lvl(r, u) > 0)
      .map((u) => `<span class="relic" title="${UPGRADES[u].name} ${lvl(r, u)}: ${UPGRADES[u].text}">${UPGRADES[u].icon}${lvl(r, u) > 1 ? `<sub>${lvl(r, u)}</sub>` : ''}</span>`)
      .join('');
    return `<header class="top">
      <span title="Hull">🛡️ ${Math.max(0, r.hull)}/${r.maxHull}</span>
      <span title="Credits">💰 ${r.credits}</span>
      <span title="Sector">${sec.icon} ${r.sector + 1}-${Math.min(r.step + 1, PLAN.length)}</span>
      <span class="relics">${ups}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const hangar = LAUNCHER_ORDER.map((id) => {
      const L = LAUNCHERS[id];
      const own = m.unlocked.includes(id);
      const sel = this.pick === id;
      const right = own
        ? `<button class="${sel ? 'primary' : ''}" data-act="pick-launcher" data-id="${id}">${sel ? '✔ Selected' : 'Select'}</button>`
        : `<button data-act="unlock" data-id="${id}" ${m.dust >= L.cost ? '' : 'disabled'}>✨ ${L.cost}</button>`;
      return `<div class="arm ${sel ? 'sel' : ''} ${own ? '' : 'locked'}"><span class="big">${L.icon}</span><span><b>${L.name}</b><small>${L.text}</small></span>${right}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo">🪐</div>
      <h1>Orbit Sling</h1>
      <p class="sub">Pull back, let go, and bend every shot around planets, moons and black holes. Hit every target. Clear 5 sectors.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (sector ${r.sector + 1}, 🛡️ ${r.hull})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best sector ${m.bestSector} · Best score ${m.best} · Targets hit ${m.hits} · Orbit shots ${m.orbits}</p>
      <h2>Hangar <small>✨ ${m.dust} stardust</small></h2>
      <p class="sub">Each run gives stardust. Unlock launchers with new starting kits.</p>
      <div class="armory">${hangar}</div>
    </div>`;
  }

  private loadout(): string {
    const r = this.run!;
    const ammo = SPECIALS.filter((s) => r.ammo[s] > 0)
      .map((s) => `<span class="chip" title="${SHOTS[s].text}">${SHOTS[s].icon} ${SHOTS[s].name} ×${r.ammo[s]}</span>`)
      .join('');
    const ups = (Object.keys(UPGRADES) as UpgId[])
      .filter((u) => lvl(r, u) > 0)
      .map((u) => `<span class="chip" title="${UPGRADES[u].text}">${UPGRADES[u].icon} ${UPGRADES[u].name}${lvl(r, u) > 1 ? ` ${lvl(r, u)}` : ''}</span>`)
      .join('');
    return `<div class="bag"><span class="chip">${LAUNCHERS[r.launcher].icon} ${LAUNCHERS[r.launcher].name}</span>${ammo || '<span class="chip dim">No special shots</span>'}${ups}</div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const sec = SECTORS[r.sector];
    const track = PLAN.map((opts, i) => {
      const state = i < r.step ? 'done' : i === r.step ? 'now' : '';
      return `<span class="node ${state}">${opts.map((o) => NODE_INFO[o].icon).join('/')}</span>`;
    }).join('<span class="link"></span>');
    const sectors = SECTORS.map((s, i) => `<span class="node ${i < r.sector ? 'done' : i === r.sector ? 'now' : ''}" title="${s.name}">${s.icon}</span>`).join('<span class="link"></span>');
    const rooms = choices(r)
      .map((k) => {
        const info = NODE_INFO[k];
        const extra = k === 'boss' ? `<small class="foe">${sec.boss}: ${sec.bossText}</small>${r.bossTries ? `<small class="warn">Attempt ${r.bossTries + 1}</small>` : ''}` : '';
        return `<button class="room" data-act="node" data-kind="${k}"><span class="big">${info.icon}</span><b>${info.name}</b><small>${info.text}</small>${extra}</button>`;
      })
      .join('');
    return `<div class="map">
      <div class="track">${sectors}</div>
      <h2>${sec.icon} Sector ${r.sector + 1}: ${sec.name}</h2>
      <p class="sub">${sec.text}</p>
      <div class="track">${track}</div>
      <h3>Choose your next jump</h3>
      <div class="rooms">${rooms}</div>
      <h3>Loadout</h3>${this.loadout()}
    </div>`;
  }

  private sideView(): string {
    const r = this.run;
    if (!r || !r.sys) return '';
    const sys = r.sys;
    const left = sys.shots - sys.used;
    const pips = Array.from({ length: sys.shots }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('');
    const tleft = requiredLeft(sys);
    const types = SHOT_KEYS.map((t, i) => {
      const n = t === 'std' ? '∞' : String(r.ammo[t]);
      const ok = t === 'std' || r.ammo[t] > 0;
      return `<button class="shot ${this.type === t ? 'sel' : ''}" data-act="type" data-t="${t}" ${ok ? '' : 'disabled'} title="${i + 1}: ${SHOTS[t].name}. ${SHOTS[t].text}" style="--c:${SHOTS[t].color}"><span>${SHOTS[t].icon}</span><small>${n}</small></button>`;
    }).join('');
    const d = SHOTS[this.type];
    return `<div class="sys-head"><b>${sys.name}</b> <span class="dim">${KIND_LABEL[sys.kind]}${sys.kind === 'hard' ? ' ×1.5' : ''}</span></div>
      <div class="row"><span>Shots</span><span class="pips">${pips}</span></div>
      <div class="row"><span>Targets left</span><b>${tleft}</b></div>
      <div class="shots">${types}</div>
      <p class="shot-text"><b style="color:${d.color}">${d.icon} ${d.name}</b> ${d.text}</p>
      <div class="row aimrow"><span>Angle <b>${deg(this.angle)}°</b></span><span>Power <b>${Math.round(this.power * 100)}%</b></span>
      <button class="primary" data-act="fire" ${this.phase === 'aim' ? '' : 'disabled'}>🚀 Fire</button></div>
      <p class="hint">${this.phase === 'fly' ? 'Tap or press Space to speed up.' : 'Drag anywhere and pull back like a sling. Let go to fire. Keys: ← → angle, ↑ ↓ power, 1-6 shot type, Space fires.'}</p>`;
  }

  private linesHtml(lines: Line[]): string {
    return lines.map((l) => `<div class="line"><span>${l.label}</span><b>${l.n ? `+${l.n}` : ''}</b></div>`).join('');
  }

  private resultView(): string {
    const res = this.result!;
    const o = res.out;
    const r = this.run!;
    let head = '';
    if (o.cleared) head = `<h2 class="good">${res.kind === 'boss' ? '💥 Boss destroyed!' : '✨ System cleared!'}</h2>`;
    else head = `<h2 class="bad">💢 Out of shots</h2><p>The targets got away. The hull takes a hit: <b class="bad">−1 hull</b>.</p>`;
    let next = '';
    if (o.sectorDone) next = `<p class="good">Sector cleared! Jumping to ${SECTORS[r.sector].icon} <b>${SECTORS[r.sector].name}</b>.</p>`;
    else if (!o.cleared && res.kind === 'boss') next = '<p class="warn">The boss system is still in your way. Try again with a new approach.</p>';
    return `<div class="reward">
      ${head}<p class="dim">${res.name}</p>
      <div class="lines">
        <div class="line"><span>Shot credits (${res.banks} bank, ${res.orbits} orbit)</span><b>+${res.shotCredits}</b></div>
        ${this.linesHtml(o.lines)}
      </div>
      ${next}
      <button class="primary" data-act="to-map">Continue ▶</button>
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const items = (r.shop ?? [])
      .map((it, i) => {
        let body = '';
        if (it.kind === 'ammo') {
          const d = SHOTS[it.id as ShotId];
          body = `<span class="big">${d.icon}</span><b>${d.name} ×${it.n}</b><small>${d.text}</small><small class="dim">You have ${r.ammo[it.id as ShotId]}</small>`;
        } else if (it.kind === 'upgrade') {
          const u = UPGRADES[it.id as UpgId];
          body = `<span class="big">${u.icon}</span><b>${u.name} ${lvl(r, u.id) + 1}/${u.max}</b><small>${u.text}</small>`;
        } else body = `<span class="big">🔧</span><b>Repair 1 hull</b><small>Now ${r.hull}/${r.maxHull}</small>`;
        return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${canBuy(r, it) ? '' : 'disabled'}>${body}<span class="cost">${it.sold ? 'Sold' : `💰 ${it.cost}`}</span></button>`;
      })
      .join('');
    return `<div class="shopv"><h2>🛒 Trade post</h2><p>💰 ${r.credits} credits</p><div class="picks">${items}</div>
      <h3>Loadout</h3>${this.loadout()}
      <button class="primary" data-act="leave">Leave ▶</button></div>`;
  }

  private stationView(): string {
    const r = this.run!;
    const opts = stationOpts(r)
      .map((o) => `<button class="pick" data-act="station" data-id="${o.id}" ${o.ok ? '' : 'disabled'}><span class="big">${o.icon}</span><b>${o.name}</b><small>${o.text}</small></button>`)
      .join('');
    return `<div class="restv"><h2>🔧 Station</h2><p class="sub">The dock crew can do one job for you.</p><div class="picks">${opts}</div>${this.loadout()}</div>`;
  }

  private eventView(): string {
    const r = this.run!;
    const ev = eventDef(r.event!);
    const opts = r.eventResult
      ? `<p class="result">${r.eventResult}</p><button class="primary" data-act="leave">Continue ▶</button>`
      : ev.options.map((o, i) => `<button data-act="event-opt" data-i="${i}" ${canEvent(r, i) ? '' : 'disabled'}>${o.label}</button>`).join('');
    return `<div class="eventv"><span class="huge">${ev.icon}</span><h2>${ev.title}</h2><p>${ev.text}</p><div class="opts">${opts}</div></div>`;
  }

  private endView(): string {
    const e = this.end!;
    const s = e.stats;
    return `<div class="end">
      <div class="logo">${e.won ? '🏆' : '💀'}</div>
      <h1 class="${e.won ? 'good' : 'bad'}">${e.won ? 'Victory!' : 'Hull breached'}</h1>
      <p>${e.won ? 'The Crown falls. Every sector is clear.' : `Your launcher broke apart in sector ${e.sector + 1}: ${SECTORS[e.sector].name}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>✨ +${e.dust} stardust for the Hangar</p>
      <p class="stats">Shots ${s.shots} · Hits ${s.hits} · Bank shots ${s.banks} · Orbit shots ${s.orbits} · Systems ${s.systems} · Catches ${s.caught}</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Aim:</b> press anywhere on the space map and pull back. The shot flies the other way. A longer pull means more power. Let go to fire. Pull back to the start point to cancel.</li>
          <li><b>Keys:</b> ← → turn the aim (Shift for big steps), ↑ ↓ power, 1-6 pick a shot type, Space or Enter fires. Space during a shot speeds it up.</li>
          <li><b>Gravity:</b> every planet pulls the shot. Black holes pull hard and swallow it. Repulsor stars push it away. The dotted aim line shows the first part of the path.</li>
          <li><b>Moons</b>, drifting targets and turning shields move after each shot. The faint ring shows where they go next.</li>
          <li><b>Targets:</b> hit every beacon 🎯 and core before the shots run out. Shots fly through targets, so one shot can hit several. Orange targets take 2 hits. Gold crates are optional and pay credits.</li>
          <li><b>Blockers:</b> planets, moons, asteroids and shields stop the shot. Heavy shots smash asteroids and shields.</li>
          <li><b>Credits:</b> 6 per hit. A bank shot (the path turns 100°+ before the hit) pays +10. An orbit shot (300°+) pays +22. Several targets in one shot pay a multi bonus. Spare shots and no misses pay at the end.</li>
          <li><b>Out of shots:</b> the hull takes 1 damage and you move on. A boss system must be cleared. At 0 hull the run ends.</li>
          <li><b>Map:</b> 5 sectors with 6 jumps each. Trade posts sell shots and launcher upgrades. Stations repair. The last jump is the boss.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Canvas ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const wide = window.innerWidth > 860;
    const maxW = wrap.clientWidth;
    const maxH = window.innerHeight - (wide ? 76 : 66);
    const w = Math.max(200, Math.min(maxW, (maxH * W) / H, 620));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${w}px`;
    cv.style.height = `${(w * H) / W}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(((w * H) / W) * dpr);
    this.scale = (w / W) * dpr;
    this.bgKey = '';
  }

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (t: number) => {
      if (this.screen !== 'system' || !this.ctx) {
        this.raf = 0;
        return;
      }
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private later(ms: number, fn: () => void): void {
    if (FAST) {
      fn();
      return;
    }
    this.timers.push(window.setTimeout(fn, ms));
  }

  private update(dt: number): void {
    this.clock += dt;
    if (!this.run?.sys) return;
    const target = this.sys.turn;
    if (this.turnVis < target) this.turnVis = Math.min(target, this.turnVis + dt * 2);
    if (this.turnVis > target) this.turnVis = target;
    const f = this.flight;
    if (f && this.phase === 'fly') {
      f.s += dt * STEPS_PER_SEC * (this.ff ? 4 : 1);
      this.flushEvents(f, f.s, true);
      if (f.s >= f.res.steps + 20) this.landShot();
    }
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
      p.vy *= 0.97;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const fl of this.floats) {
      fl.t += dt;
      fl.y -= dt * 22;
    }
    this.floats = this.floats.filter((fl) => fl.t < 1.6);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  private burst(x: number, y: number, color: string, n: number, speed = 90): void {
    if (FAST) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random());
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.4 + Math.random() * 0.5, color, size: 1 + Math.random() * 2 });
    }
  }

  private float(x: number, y: number, text: string, color: string, size = 14): void {
    if (FAST) return;
    this.floats.push({ x, y, text, color, t: 0, size });
  }

  private flushEvents(f: Flight, upTo: number, fx: boolean): void {
    const ev = f.res.events;
    while (f.ei < ev.length && ev[f.ei].s <= upTo) {
      this.onEvent(f, ev[f.ei], fx);
      f.ei++;
    }
  }

  private onEvent(f: Flight, e: SimEvent, fx: boolean): void {
    if (e.kind === 'hit') {
      f.dmg.set(e.ti, (f.dmg.get(e.ti) ?? 0) + 1);
      f.hits++;
      if (!fx) return;
      const t = this.sys.targets[e.ti];
      const col = t.kind === 'crate' ? '#ffd166' : t.kind === 'core' ? '#ff4d6d' : t.kind === 'armored' ? '#ff9f43' : '#4cf0c0';
      this.burst(e.x, e.y, col, e.kill ? 26 : 12, e.kill ? 140 : 80);
      if (e.kill) {
        sfx.kill();
        this.shake = Math.max(this.shake, 5);
      } else sfx.hit(f.hits);
      const turnDeg = (e.turn * 180) / Math.PI;
      if (turnDeg >= 300) {
        this.float(e.x, e.y - 18, 'ORBIT SHOT!', '#c77dff', 16);
        sfx.orbit();
      } else if (turnDeg >= 100) {
        this.float(e.x, e.y - 18, 'BANK SHOT', '#7aa2ff', 14);
        sfx.bank();
      }
      this.float(e.x, e.y, t.kind === 'crate' ? '📦 +15' : e.kill ? '💥' : '-1', col, 14);
      return;
    }
    if (e.kind === 'break') {
      if (e.what === 'rock') f.rocks.add(e.idx);
      else f.shields.add(e.idx);
      if (fx) {
        this.burst(e.x, e.y, e.what === 'rock' ? '#b9a48a' : '#5ee7ff', 16, 110);
        sfx.breakit();
        this.shake = Math.max(this.shake, 3);
      }
      return;
    }
    if (!fx) return;
    switch (e.kind) {
      case 'crash':
        this.burst(e.x, e.y, '#ff9f43', 18, 100);
        this.shake = Math.max(this.shake, 4);
        sfx.crash();
        break;
      case 'swallow':
        this.burst(e.x, e.y, '#c77dff', 20, 40);
        sfx.swallow();
        break;
      case 'lost':
        sfx.lost();
        break;
      case 'caught':
        this.float(e.x, e.y - 14, 'CAUGHT! +1 shot', '#4ce0b3', 15);
        sfx.caught();
        break;
      case 'phase':
        this.burst(e.x, e.y, '#b388ff', 10, 50);
        sfx.phase();
        break;
      case 'split':
        this.burst(e.x, e.y, '#ffd166', 10, 60);
        sfx.split();
        break;
      case 'timeout':
        break;
    }
  }

  private bgCanvas(): HTMLCanvasElement {
    const sys = this.sys;
    const key = `${sys.seed}|${this.scale}`;
    if (this.bg && this.bgKey === key) return this.bg;
    const c = this.bg ?? document.createElement('canvas');
    c.width = Math.round(W * this.scale);
    c.height = Math.round(H * this.scale);
    const g = c.getContext('2d')!;
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const hue = SECTORS[sys.sector].hue;
    g.fillStyle = '#05060f';
    g.fillRect(0, 0, W, H);
    const rng = new Rng(hash(sys.seed, 'bg'));
    for (let i = 0; i < 3; i++) {
      const x = rng.next() * W;
      const y = rng.next() * H;
      const r = 120 + rng.next() * 200;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `hsla(${hue + rng.int(-40, 40)}, 70%, 45%, 0.18)`);
      grd.addColorStop(1, 'hsla(0,0%,0%,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    }
    for (let i = 0; i < 160; i++) {
      const x = rng.next() * W;
      const y = rng.next() * H;
      const s = rng.next();
      g.fillStyle = `rgba(255,255,255,${0.2 + s * 0.6})`;
      g.fillRect(x, y, s > 0.9 ? 1.6 : 0.9, s > 0.9 ? 1.6 : 0.9);
    }
    this.bg = c;
    this.bgKey = key;
    return c;
  }

  private sceneVis(): Scene {
    const sys = this.sys;
    const sc = sceneAt(sys, this.turnVis);
    const f = this.flight;
    if (f && this.phase !== 'aim') {
      sc.targets = sc.targets.filter((t) => t.hp - (f.dmg.get(t.i) ?? 0) > 0).map((t) => ({ ...t, hp: t.hp - (f.dmg.get(t.i) ?? 0) }));
      sc.rocks = sc.rocks.filter((r) => !f.rocks.has(r.i));
      sc.walls = sc.walls.filter((w) => !f.shields.has(w.i));
      sc.arcs = sc.arcs.filter((a) => !f.shields.has(a.i));
    }
    return sc;
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx || !this.run?.sys) return;
    const sys = this.sys;
    const k = this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bgCanvas(), 0, 0);
    const sx = this.shake ? (Math.random() - 0.5) * this.shake * k : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake * k : 0;
    ctx.setTransform(k, 0, 0, k, sx, sy);
    const sc = this.sceneVis();
    const tm = this.clock;

    // Orbit guides and next positions.
    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1;
    for (const b of sys.bodies) {
      if (!b.orbit) continue;
      ctx.strokeStyle = 'rgba(180,200,255,0.16)';
      ctx.beginPath();
      ctx.arc(b.orbit.cx, b.orbit.cy, b.orbit.R, 0, Math.PI * 2);
      ctx.stroke();
      if (this.phase === 'aim') {
        const n = orbitPos(b.orbit, sys.turn + 1);
        ctx.strokeStyle = 'rgba(200,210,255,0.35)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const t of sys.targets) {
      if (!t.orbit || t.hp <= 0) continue;
      ctx.strokeStyle = 'rgba(76,240,192,0.14)';
      ctx.beginPath();
      ctx.arc(t.orbit.cx, t.orbit.cy, t.orbit.R, 0, Math.PI * 2);
      ctx.stroke();
      if (this.phase === 'aim') {
        const n = orbitPos(t.orbit, sys.turn + 1);
        ctx.strokeStyle = 'rgba(76,240,192,0.4)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, t.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Bodies.
    for (const b of sc.bodies) this.drawBody(ctx, b.kind, b.x, b.y, b.r, b.hue, tm);

    // Rocks.
    for (const r of sc.rocks) {
      const rng = new Rng(hash(sys.seed, 'rock', r.i));
      ctx.fillStyle = '#6d5f52';
      ctx.strokeStyle = '#b9a48a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + tm * 0.2 * (r.i % 2 ? 1 : -1);
        const rr = r.r * (0.75 + rng.next() * 0.35);
        const x = r.x + Math.cos(a) * rr;
        const y = r.y + Math.sin(a) * rr;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Shields.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.shadowColor = '#5ee7ff';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = `rgba(94,231,255,${0.75 + Math.sin(tm * 4) * 0.15})`;
    ctx.lineWidth = 3.5;
    for (const w of sc.walls) {
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }
    for (const a of sc.arcs) {
      ctx.beginPath();
      ctx.arc(a.cx, a.cy, a.R, a.a, a.a + a.span);
      ctx.stroke();
    }
    ctx.restore();

    // Targets.
    for (const t of sc.targets) this.drawTarget(ctx, t.kind, t.x, t.y, t.r, t.hp, t.max, tm);

    // Launcher and aim line.
    this.drawLauncher(ctx, sc);
    if (this.phase === 'aim') this.drawPreview(ctx);

    // Shot in flight.
    const f = this.flight;
    if (f && this.phase === 'fly') this.drawFlight(ctx, f);

    // Particles and floats.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.textAlign = 'center';
    for (const fl of this.floats) {
      ctx.globalAlpha = Math.max(0, 1 - fl.t / 1.6);
      ctx.font = `800 ${fl.size}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(fl.text, fl.x, fl.y);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, fl.x, fl.y);
    }
    ctx.globalAlpha = 1;

    // Drag band.
    if (this.drag && this.phase === 'aim') {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.drag.sx, this.drag.sy);
      ctx.lineTo(this.drag.x, this.drag.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(this.drag.sx, this.drag.sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shots left in the corner.
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(220,230,255,0.8)';
    ctx.fillText(`${sys.name} · shots ${sys.shots - sys.used}/${sys.shots} · targets ${requiredLeft(sys)}`, 8, 16);
  }

  private drawBody(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number, hue: number, tm: number): void {
    ctx.save();
    if (kind === 'blackhole') {
      const halo = ctx.createRadialGradient(x, y, r, x, y, r * 6);
      halo.addColorStop(0, 'rgba(199,125,255,0.45)');
      halo.addColorStop(0.4, 'rgba(255,140,66,0.15)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, r * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(x, y);
      ctx.rotate(tm * 0.8);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `hsla(${25 + i * 15}, 100%, ${60 - i * 10}%, ${0.7 - i * 0.2})`;
        ctx.lineWidth = 2.5 - i * 0.6;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * (2 + i * 0.5), r * (0.7 + i * 0.2), i * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.shadowColor = '#c77dff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    if (kind === 'repulsor') {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const ph = (tm * 0.6 + i / 3) % 1;
        ctx.strokeStyle = `rgba(150,220,255,${0.5 * (1 - ph)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r + ph * 50, 0, Math.PI * 2);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, '#bfe9ff');
      g.addColorStop(1, 'rgba(90,170,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    let c1 = `hsl(${hue}, 60%, 62%)`;
    let c2 = `hsl(${hue}, 55%, 22%)`;
    let glow = `hsl(${hue}, 80%, 60%)`;
    if (kind === 'ice') {
      c1 = '#e3f8ff';
      c2 = '#3a7ca5';
      glow = '#9be7ff';
    } else if (kind === 'lava') {
      c1 = '#ffb347';
      c2 = '#5a1406';
      glow = '#ff6b35';
    } else if (kind === 'moon') {
      c1 = '#d6d6de';
      c2 = '#45454f';
      glow = '#a0a0b8';
    }
    // Gravity halo.
    const halo = ctx.createRadialGradient(x, y, r, x, y, r * 2.6);
    halo.addColorStop(0, `hsla(${kind === 'lava' ? 20 : kind === 'ice' ? 195 : hue}, 80%, 60%, ${kind === 'moon' ? 0.08 : 0.16})`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = glow;
    ctx.shadowBlur = kind === 'moon' ? 6 : 18;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (kind === 'giant') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = `hsla(${hue + 30}, 50%, 75%, 0.18)`;
      for (let i = -3; i <= 3; i++) ctx.fillRect(x - r, y + i * r * 0.28, r * 2, r * 0.12);
      ctx.restore();
      ctx.strokeStyle = `hsla(${hue + 40}, 60%, 80%, 0.55)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.6, r * 0.38, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === 'lava') {
      ctx.strokeStyle = 'rgba(255,220,120,0.6)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + Math.cos(i * 2.1) * r * 0.3, y + Math.sin(i * 2.1) * r * 0.3, r * 0.35, i, i + 1.5);
        ctx.stroke();
      }
    } else if (kind === 'moon') {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(x + r * 0.3, y - r * 0.1, r * 0.25, 0, Math.PI * 2);
      ctx.arc(x - r * 0.3, y + r * 0.35, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawTarget(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number, hp: number, max: number, tm: number): void {
    const pulse = 1 + Math.sin(tm * 4 + x) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    const col = kind === 'crate' ? '#ffd166' : kind === 'core' ? '#ff4d6d' : kind === 'armored' ? '#ff9f43' : '#4cf0c0';
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    if (kind === 'crate') {
      ctx.fillStyle = 'rgba(255,209,102,0.25)';
      ctx.rotate(tm * 0.5);
      ctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      ctx.strokeRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
    } else if (kind === 'beacon') {
      ctx.scale(pulse, pulse);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(tm);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
        ctx.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
      }
      ctx.stroke();
    } else {
      ctx.scale(pulse, pulse);
      ctx.fillStyle = kind === 'core' ? 'rgba(255,77,109,0.3)' : 'rgba(255,159,67,0.25)';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + tm * (kind === 'core' ? 0.6 : 0.2);
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (max > 1) {
      for (let i = 0; i < max; i++) {
        ctx.fillStyle = i < hp ? col : 'rgba(255,255,255,0.15)';
        ctx.fillRect(x - (max * 7) / 2 + i * 7, y + r + 5, 5, 3);
      }
    }
  }

  private drawLauncher(ctx: CanvasRenderingContext2D, sc: Scene): void {
    const { lx, ly } = sc;
    const col = SHOTS[this.type].color;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#1b2440';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(lx, ly, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (this.phase === 'aim') {
      // Power arc.
      ctx.strokeStyle = `hsl(${120 - this.power * 120}, 90%, 60%)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(lx, ly, 18, -Math.PI / 2, -Math.PI / 2 + this.power * Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + Math.cos(this.angle) * 20, ly + Math.sin(this.angle) * 20);
      ctx.stroke();
    }
    ctx.restore();
  }

  private previewFor(): SimResult {
    const r = this.run!;
    const sys = this.sys;
    const key = `${this.angle.toFixed(4)}|${this.power.toFixed(3)}|${this.type}|${sys.turn}|${sys.used}`;
    if (this.preview && key === this.previewKey) return this.preview;
    this.preview = simulate(sceneAt(sys, sys.turn), { angle: this.angle, power: this.power, type: this.type }, modsFor(r), previewSteps(r), true);
    this.previewKey = key;
    return this.preview;
  }

  private drawPreview(ctx: CanvasRenderingContext2D): void {
    if (this.turnVis < this.sys.turn) return;
    const pv = this.previewFor();
    const total = previewSteps(this.run!);
    const col = SHOTS[this.type].color;
    ctx.save();
    ctx.fillStyle = col;
    for (const tr of pv.tracks) {
      const n = tr.pts.length / 2;
      for (let i = 4; i < n; i += 4) {
        const s = tr.born + i;
        ctx.globalAlpha = Math.max(0.25, 1 - (0.75 * s) / total);
        ctx.beginPath();
        ctx.arc(tr.pts[i * 2], tr.pts[i * 2 + 1], 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Mark where the preview ends in a crash.
    for (const e of pv.events) {
      if (e.kind === 'crash' || e.kind === 'swallow') {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x - 4, e.y - 4);
        ctx.lineTo(e.x + 4, e.y + 4);
        ctx.moveTo(e.x + 4, e.y - 4);
        ctx.lineTo(e.x - 4, e.y + 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawFlight(ctx: CanvasRenderingContext2D, f: Flight): void {
    const col = SHOTS[f.shot.type].color;
    const cur = Math.floor(f.s);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const tr of f.res.tracks) {
      if (cur < tr.born) continue;
      const end = Math.min(cur, tr.died) - tr.born;
      const start = Math.max(0, end - 70);
      for (let seg = start; seg < end; seg += 5) {
        const a = (seg - start) / Math.max(1, end - start);
        ctx.strokeStyle = col;
        ctx.globalAlpha = a * 0.6;
        ctx.lineWidth = 1 + a * 2.5;
        ctx.beginPath();
        ctx.moveTo(tr.pts[seg * 2], tr.pts[seg * 2 + 1]);
        const e2 = Math.min(end, seg + 5);
        ctx.lineTo(tr.pts[e2 * 2], tr.pts[e2 * 2 + 1]);
        ctx.stroke();
      }
      if (cur <= tr.died) {
        const x = tr.pts[end * 2];
        const y = tr.pts[end * 2 + 1];
        ctx.globalAlpha = f.shot.type === 'phase' ? 0.7 : 1;
        ctx.shadowColor = col;
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, f.shot.type === 'heavy' ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
  }

  // ---------- Game flow ----------

  private fire(): void {
    const r = this.run;
    if (!r?.sys || this.phase !== 'aim' || this.modal) return;
    if (this.type !== 'std' && r.ammo[this.type] <= 0) {
      sfx.deny();
      this.type = 'std';
      this.refresh();
      return;
    }
    initAudio();
    const shot: ShotIn = { angle: this.angle, power: this.power, type: this.type };
    const res = simulate(sceneAt(r.sys, r.sys.turn), shot, modsFor(r), MAX_STEPS, true);
    this.flight = { res, shot, s: 0, ei: 0, dmg: new Map(), rocks: new Set(), shields: new Set(), hits: 0 };
    this.phase = 'fly';
    this.ff = false;
    sfx.launch(this.power);
    if (FAST) {
      this.flushEvents(this.flight, Infinity, false);
      this.landShot();
    } else this.refresh();
  }

  private landShot(): void {
    const r = this.run!;
    const f = this.flight!;
    this.flushEvents(f, Infinity, !FAST);
    this.phase = 'done';
    const rep = applyShot(r, f.shot.type, f.res);
    if (r.ammo[this.type] <= 0 && this.type !== 'std') this.type = 'std';
    let y = r.sys!.ly - 50;
    for (const l of rep.lines) {
      if (l.n) this.float(W / 2, y, `${l.label} +${l.n}`, '#ffd166', 14);
      y -= 18;
    }
    if (rep.credits) sfx.coin();
    if (!f.res.hits && !rep.refund) this.float(r.sys!.lx, r.sys!.ly - 30, 'Miss', '#8892b0', 13);
    if (rep.cleared || rep.failed) {
      if (rep.cleared) sfx.clear();
      else sfx.fail();
      const sys = r.sys!;
      const name = sys.name;
      const kind = sys.kind;
      const shotCredits = sys.credits;
      const banks = sys.banks;
      const orbits = sys.orbits;
      this.later(1100, () => {
        const out = finishSystem(r, rep.cleared);
        this.flight = null;
        if (out.dead || out.won) {
          this.endRun(out.won);
          return;
        }
        saveRun(r);
        this.result = { out, name, kind, shotCredits, banks, orbits };
        this.screen = 'result';
        this.render();
      });
      this.refresh();
      return;
    }
    saveRun(r);
    this.later(250, () => {
      this.flight = null;
      this.phase = 'aim';
      this.preview = null;
      this.refresh();
    });
    this.refresh();
  }

  private enterNode(kind: NodeKind): void {
    const r = this.run!;
    sfx.warp();
    if (kind === 'system' || kind === 'hard' || kind === 'boss') {
      enterSystem(r, kind);
      this.startSystem();
    } else if (kind === 'shop') {
      r.node = 'shop';
      r.shop = makeShop(r);
      this.screen = 'shop';
    } else if (kind === 'station') {
      r.node = 'station';
      this.screen = 'station';
    } else {
      r.node = 'anomaly';
      r.event = pickEvent(r);
      r.eventResult = null;
      this.screen = 'event';
    }
    saveRun(r);
    this.render();
  }

  private startSystem(): void {
    const sys = this.sys;
    this.screen = 'system';
    this.phase = 'aim';
    this.flight = null;
    this.preview = null;
    this.turnVis = sys.turn;
    this.floats = [];
    this.parts = [];
    this.type = 'std';
    // Aim at the closest target as a hint.
    const t = sys.targets.find((x) => x.hp > 0);
    this.angle = t ? Math.atan2(t.y - sys.ly, t.x - sys.lx) : -Math.PI / 2;
    this.power = 0.6;
    this.toast(`${sys.kind === 'boss' ? `💀 ${SECTORS[sys.sector].boss}` : sys.name}: hit ${requiredLeft(sys)} target${requiredLeft(sys) > 1 ? 's' : ''} with ${sys.shots} shots`);
  }

  private resume(): void {
    const r = this.run!;
    if (r.node && r.sys) this.startSystem();
    else if (r.node === 'shop' && r.shop) this.screen = 'shop';
    else if (r.node === 'station') this.screen = 'station';
    else if (r.node === 'anomaly' && r.event) this.screen = 'event';
    else this.screen = 'map';
  }

  private endRun(won: boolean): void {
    const r = this.run!;
    const dust = recordEnd(this.meta, r, won);
    saveMeta(this.meta);
    this.end = { won, score: r.score, dust, sector: Math.min(r.sector, SECTORS.length - 1), stats: { ...r.stats } };
    this.run = null;
    saveRun(null);
    this.screen = 'end';
    this.modal = null;
    this.phase = 'aim';
    this.flight = null;
    if (won) sfx.win();
    else sfx.lose();
    this.render();
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  // ---------- Input ----------

  private toWorld(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const cv = this.canvas;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if (this.screen !== 'system' || this.modal || e.target !== this.canvas) return;
    if (this.phase === 'fly') {
      this.ff = true;
      return;
    }
    if (this.phase !== 'aim') return;
    const p = this.toWorld(e);
    if (!p) return;
    e.preventDefault();
    this.drag = { sx: p.x, sy: p.y, x: p.x, y: p.y, id: e.pointerId };
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id || this.phase !== 'aim') return;
    const p = this.toWorld(e);
    if (!p) return;
    d.x = p.x;
    d.y = p.y;
    const dx = d.sx - d.x;
    const dy = d.sy - d.y;
    const len = Math.hypot(dx, dy);
    if (len >= 10) {
      this.angle = Math.atan2(dy, dx);
      this.power = Math.max(0.2, Math.min(1, (len - 10) / 140));
      this.updateAimText();
    }
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    const len = Math.hypot(d.sx - d.x, d.sy - d.y);
    if (len >= 10 && this.phase === 'aim') this.fire();
  }

  private updateAimText(): void {
    const row = this.root.querySelector<HTMLElement>('.aimrow');
    if (!row) return;
    const b = row.querySelectorAll('b');
    if (b[0]) b[0].textContent = `${deg(this.angle)}°`;
    if (b[1]) b[1].textContent = `${Math.round(this.power * 100)}%`;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.modal) this.modal = null;
      else if (this.run && this.screen !== 'title' && this.screen !== 'end') this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.modal || this.screen !== 'system') return;
    if (this.phase === 'fly' && (e.key === ' ' || e.key === 'Enter')) {
      this.ff = true;
      e.preventDefault();
      return;
    }
    if (this.phase !== 'aim') return;
    const big = e.shiftKey;
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':
        this.angle -= big ? 0.087 : 0.0175 / 2;
        break;
      case 'ArrowRight':
        this.angle += big ? 0.087 : 0.0175 / 2;
        break;
      case 'ArrowUp':
        this.power = Math.min(1, this.power + (big ? 0.1 : 0.02));
        break;
      case 'ArrowDown':
        this.power = Math.max(0.2, this.power - (big ? 0.1 : 0.02));
        break;
      case ' ':
      case 'Enter':
        this.fire();
        break;
      default: {
        const n = Number(e.key);
        if (n >= 1 && n <= SHOT_KEYS.length) this.selectType(SHOT_KEYS[n - 1]);
        else handled = false;
      }
    }
    if (handled) {
      e.preventDefault();
      this.updateAimText();
    }
  }

  private selectType(t: ShotId): void {
    const r = this.run!;
    if (t !== 'std' && r.ammo[t] <= 0) {
      sfx.deny();
      return;
    }
    this.type = t;
    sfx.click();
    this.refresh();
  }

  private onClick(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'modal-close' && (e.target as HTMLElement).closest('[data-stop]') && el.classList.contains('modal')) return;
    initAudio();
    this.action(el.dataset.act!, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const r = this.run;
    switch (act) {
      case 'help':
        this.modal = { kind: 'help' };
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        break;
      case 'modal-close':
        this.modal = null;
        break;
      case 'mute': {
        const m = toggleMute();
        try {
          localStorage.setItem('orbit-sling.mute', m ? '1' : '0');
        } catch {
          /* ignore */
        }
        if (this.screen === 'system') {
          this.refresh();
          return;
        }
        break;
      }
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        break;
      case 'abandon-yes':
        this.clearTimers();
        this.modal = null;
        if (r) this.endRun(false);
        return;
      case 'title':
        this.clearTimers();
        if (this.phase === 'fly' || this.phase === 'done') {
          // Finish the shot at once so the save stays consistent.
          if (this.flight && this.phase === 'fly' && r?.sys) {
            this.flushEvents(this.flight, Infinity, false);
            const rep = applyShot(r, this.flight.shot.type, this.flight.res);
            if (rep.cleared || rep.failed) {
              const out = finishSystem(r, rep.cleared);
              if (out.dead || out.won) {
                this.flight = null;
                this.phase = 'aim';
                this.endRun(out.won);
                this.screen = 'title';
                this.render();
                return;
              }
            }
            saveRun(r);
          }
          this.flight = null;
          this.phase = 'aim';
        }
        if (this.screen === 'result') {
          this.screen = 'map';
        }
        this.modal = null;
        this.screen = 'title';
        break;
      case 'new':
        this.clearTimers();
        this.run = newRun(randomSeedText(), this.pick, this.meta);
        this.meta.last = this.pick;
        saveMeta(this.meta);
        saveRun(this.run);
        this.screen = 'map';
        sfx.warp();
        break;
      case 'continue':
        if (r) this.resume();
        break;
      case 'pick-launcher':
        this.pick = d.id as LauncherId;
        sfx.click();
        break;
      case 'unlock': {
        const id = d.id as LauncherId;
        const L = LAUNCHERS[id];
        if (this.meta.dust >= L.cost && !this.meta.unlocked.includes(id)) {
          this.meta.dust -= L.cost;
          this.meta.unlocked.push(id);
          this.pick = id;
          saveMeta(this.meta);
          sfx.coin();
          this.toast(`${L.icon} ${L.name} unlocked!`);
        }
        break;
      }
      case 'node':
        if (r) this.enterNode(d.kind as NodeKind);
        return;
      case 'type':
        this.selectType(d.t as ShotId);
        return;
      case 'fire':
        this.fire();
        return;
      case 'to-map':
        this.result = null;
        this.screen = 'map';
        break;
      case 'buy': {
        if (!r?.shop) break;
        const it = r.shop[Number(d.i)];
        if (buy(r, it)) {
          sfx.coin();
          saveRun(r);
        } else sfx.deny();
        break;
      }
      case 'leave':
        if (r) {
          leaveNode(r);
          saveRun(r);
          this.screen = 'map';
        }
        break;
      case 'station':
        if (r) {
          station(r, d.id!);
          sfx.coin();
          leaveNode(r);
          saveRun(r);
          this.toast('The dock crew finishes the job.');
          this.screen = 'map';
        }
        break;
      case 'event-opt':
        if (r && canEvent(r, Number(d.i))) {
          doEvent(r, Number(d.i));
          sfx.coin();
          if (r.hull <= 0) {
            this.endRun(false);
            return;
          }
          saveRun(r);
        }
        break;
    }
    this.render();
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLElement>(sel);
      el?.click();
      return !!el;
    };
    const api = {
      state: () => ({
        screen: this.screen,
        phase: this.phase,
        modal: this.modal?.kind ?? null,
        sector: this.run?.sector,
        step: this.run?.step,
        hull: this.run?.hull,
        credits: this.run?.credits,
        score: this.run?.score,
        system: this.run?.sys ? { name: this.run.sys.name, kind: this.run.sys.kind, shots: this.run.sys.shots, used: this.run.sys.used, targets: requiredLeft(this.run.sys) } : null,
        end: this.end,
      }),
      credits: (n: number) => {
        if (this.run) this.run.credits += n;
        this.refresh();
      },
      dust: (n: number) => {
        this.meta.dust += n;
        saveMeta(this.meta);
        this.render();
      },
      win: () => {
        if (!this.run?.sys || this.phase !== 'aim') return;
        for (const t of this.run.sys.targets) t.hp = 0;
        this.fire();
      },
      /** One bot action for automatic tests. */
      step: () => {
        if (this.modal) {
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'map': {
            const opts = choices(r!);
            let k: NodeKind = opts[0];
            if (opts.includes('station') && r!.hull < r!.maxHull) k = 'station';
            else if (opts.includes('shop') && r!.credits >= 30) k = 'shop';
            else if (opts.includes('anomaly')) k = 'anomaly';
            else if (opts.includes('hard') && r!.hull >= 3) k = 'hard';
            click(`[data-act="node"][data-kind="${k}"]`);
            return 'node';
          }
          case 'system': {
            if (this.phase !== 'aim') return 'busy';
            const shot = chooseShot(r!, GOOD_BOT, Math.random);
            this.angle = shot.angle;
            this.power = shot.power;
            this.type = shot.type;
            this.fire();
            return 'shot';
          }
          case 'result':
            click('[data-act="to-map"]');
            return 'result';
          case 'shop':
            if (click('[data-act="buy"]:not([disabled])')) return 'buy';
            click('[data-act="leave"]');
            return 'leave';
          case 'station':
            if (!click('[data-act="station"][data-id="repair"]:not([disabled])')) click('[data-act="station"]:not([disabled])');
            return 'station';
          case 'event':
            if (!click('[data-act="event-opt"]:not([disabled])')) click('[data-act="leave"]');
            return 'event';
          case 'end':
            return 'end';
        }
        return 'idle';
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
