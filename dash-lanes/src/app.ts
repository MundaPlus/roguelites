import { Bot, GOOD_BOT } from './bot';
import { BOSSES, GOAL, GOAL_STAGES, PERKS, POWERS, RUNNERS, RUNNER_IDS, ZONES, stageInfo, stageStart, type PwId } from './data';
import { createGame, obX, update, type Action, type Game, type GameEvent, type Obstacle } from './game';
import { randomSeedText } from './rng';
import {
  botGate,
  buy,
  finishStage,
  gateReady,
  gemsFor,
  leaveGate,
  loadMeta,
  loadRun,
  newRun,
  saveMeta,
  saveRun,
  setupFor,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'play' | 'gate' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips waits, for bot tests. */
const FAST = PARAMS.has('fast');
const DT = 1 / 60;
/** Lane width in meters for the view. */
const LW = 2.6;
const FAR = 110;
const CAM_BACK = 6.5;
const BOSS_Z = 34;

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

interface P2 {
  x: number;
  y: number;
  s: number;
}

const EMOJI = new Map<string, HTMLCanvasElement>();
function emojiCanvas(e: string): HTMLCanvasElement {
  let c = EMOJI.get(e);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d')!;
  x.font = '78px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(e, 48, 54);
  EMOJI.set(e, c);
  return c;
}

const SHADES = new Map<string, string>();
function shade(hex: string, k: number): string {
  const key = hex + k;
  let v = SHADES.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number): number => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k)));
  v = `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  SHADES.set(key, v);
  return v;
}

function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private g: Game | null = null;
  private end: { victory: boolean; score: number; dist: number; coins: number; gems: number; bosses: number; stage: number; runner: string } | null = null;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private W = 400;
  private H = 700;
  private dpr = 1;
  private f = 300;
  private horizon = 200;
  private camH = 5;
  private camX = 0;
  private camY = 5;
  private camZ = 0;

  private inputQ: Action[] = [];
  private floats: Float[] = [];
  private parts: Part[] = [];
  private shake = 0;
  private flash = 0;
  private flashColor = '#fff';
  private banner: { text: string; sub: string; t: number; color: string } | null = null;
  private swipe: { x: number; y: number; t: number; id: number; fired: boolean } | null = null;
  private botOn = false;
  private bot = new Bot(GOOD_BOT, 7);
  private coinStreak = 0;
  private realT = 0;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => (this.swipe = null));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'play' && !this.modal && !this.botOn) {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
      }
    });
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- DOM ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'play':
        body = '<div class="stage" id="stage"><canvas id="cv"></canvas></div>';
        break;
      case 'gate':
        body = this.gateView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && (this.screen === 'play' || this.screen === 'gate') ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'play') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.resize();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
    }
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const info = stageInfo(r.stage);
    const zone = info.boss ? BOSSES[info.boss].zone : ZONES[r.zone];
    const label = this.screen === 'gate' ? '⛩️ Gate' : `${info.boss ? BOSSES[info.boss].icon : zone.icon} ${info.boss ? BOSSES[info.boss].name : zone.name}`;
    return `<header class="top">
      <span class="tz">${label}</span>
      <span class="ts">${r.stage < GOAL_STAGES ? `Stage ${r.stage + 1}/${GOAL_STAGES}` : `Endless ${r.stage - GOAL_STAGES + 1}`}</span>
      ${this.screen === 'gate' ? `<span>🪙 ${r.coins}</span><span>❤️ ${r.hits}</span>` : ''}
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const runners = RUNNER_IDS.map((id) => {
      const d = RUNNERS[id];
      const own = m.unlocked.includes(id);
      const sel = m.runner === id;
      const btn = own
        ? sel
          ? '<span class="ok">✔ Selected</span>'
          : `<button data-act="runner" data-id="${id}">Select</button>`
        : `<button data-act="runner" data-id="${id}" ${m.gems >= d.cost ? '' : 'disabled'}>💎 ${d.cost}</button>`;
      return `<div class="arm ${sel ? 'sel' : ''} ${own ? '' : 'locked'}" style="--c:${d.color}"><span class="big">${d.icon}</span><span><b>${d.name}</b><small>${d.text}</small></span>${btn}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo"><span>🏃</span><h1>Dash Lanes</h1></div>
      <p class="sub">Three lanes, no brakes. Jump, slide and switch through ${GOAL_STAGES} stages (${GOAL} m) and beat 2 bosses. Pick a zone and a perk at every gate.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (stage ${r.stage + 1}, ${stageStart(r.stage)} m)</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best ${m.bestDist} m · Best score ${m.bestScore}</p>
      <h2>Runners <small>💎 ${m.gems} gems</small></h2>
      <p class="sub">Each run gives gems. Unlock runners with a starting perk.</p>
      <div class="armory">${runners}</div>
    </div>`;
  }

  private gateView(): string {
    const r = this.run!;
    const gt = r.gate!;
    const info = stageInfo(r.stage);
    const goal = r.won && !r.endless;
    const zones = info.boss
      ? `<div class="pick boss-card"><span class="big">${BOSSES[info.boss].icon}</span><b>Boss: ${BOSSES[info.boss].name}</b><small>${BOSSES[info.boss].text}</small><small class="kind">${BOSSES[info.boss].zone.name} · ${info.len} m</small></div>`
      : gt.zones
          .map((id) => {
            const z = ZONES[id];
            return `<button class="pick ${gt.zone === id ? 'sel' : ''}" data-act="zone" data-id="${id}" style="--c:${z.sky[1]}"><span class="big">${z.icon}</span><b>${z.name}</b><small>${z.text}</small><small class="kind">${info.len} m${z.scoreMul > 1 ? ` · score ×${z.scoreMul}` : ''}</small></button>`;
          })
          .join('');
    const perks = gt.perks.length
      ? gt.perks
          .map((id) => {
            const p = PERKS[id];
            const lvl = r.perks[id] ?? 0;
            return `<button class="pick ${gt.perk === id ? 'sel' : ''}" data-act="perk" data-id="${id}"><span class="big">${p.icon}</span><b>${p.name}${lvl ? ` ${lvl + 1}` : ''}</b><small>${p.text}</small></button>`;
          })
          .join('')
      : '<p class="dim">All perks are at max level.</p>';
    const shop = gt.shop
      .map((it, i) => {
        const owned = (it.id === 'shield' && r.startShield) || (it.id === 'jet' && r.startJet);
        const ok = !it.sold && !owned && r.coins >= it.cost && (it.id !== 'reroll' || gt.perks.length > 0);
        return `<button class="shop-item" data-act="buy" data-i="${i}" ${ok ? '' : 'disabled'}><span class="big">${it.icon}</span><span><b>${it.name}</b><small>${it.text}</small></span><span class="cost">${it.sold || owned ? 'Bought' : `🪙 ${it.cost}`}</span></button>`;
      })
      .join('');
    const mine = Object.entries(r.perks)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => `<span class="chip" title="${PERKS[id].text}">${PERKS[id].icon} ${PERKS[id].name}${n > 1 ? ` ×${n}` : ''}</span>`)
      .join('');
    return `<div class="gate">
      ${goal ? `<div class="goal"><h2 class="good">🏁 Goal reached: ${stageStart(r.stage)} m!</h2><p>The run counts as a win. Finish now, or keep running in endless mode for more score.</p><button class="primary" data-act="finish">Finish run 🏆</button></div>` : ''}
      <h2>⛩️ Gate ${r.stage} <small>${stageStart(r.stage)} m · score ${r.score}</small></h2>
      <h3>${info.boss ? 'Next: boss stage' : 'Choose the next zone'}</h3><div class="picks">${zones}</div>
      <h3>Choose a perk</h3><div class="picks">${perks}</div>
      <h3>Shop <small>🪙 ${r.coins}</small></h3><div class="shop">${shop}</div>
      <button class="${goal ? '' : 'primary'} go" data-act="go" ${gateReady(r) ? '' : 'disabled'}>${goal ? 'Keep running (endless) ▶' : 'Run ▶'}</button>
      ${mine ? `<h3>Your perks</h3><div class="chips">${mine}</div>` : ''}
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    const rd = RUNNERS[e.runner] ?? RUNNERS.dash;
    return `<div class="end">
      <span class="huge">${e.victory ? '🏆' : '💥'}</span>
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? 'Victory!' : 'Crashed'}</h1>
      <p>${e.victory ? `${rd.name} made it past the goal of ${GOAL} m.` : `${rd.name} crashed in stage ${e.stage + 1}.`}</p>
      <div class="endstats">
        <div><b>${e.dist} m</b><small>distance</small></div>
        <div><b>${e.coins}</b><small>coins</small></div>
        <div><b>${e.bosses}</b><small>bosses</small></div>
      </div>
      <p class="score">Score <b>${e.score}</b></p>
      <p>💎 +${e.gems} gems</p>
      <button class="primary" data-act="new">▶ New run</button>
      <button data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Keys:</b> <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd> switch lanes. <kbd>↑</kbd> <kbd>W</kbd> <kbd>Space</kbd> jump. <kbd>↓</kbd> <kbd>S</kbd> slide. <kbd>Esc</kbd> opens the menu.</li>
          <li><b>Touch or mouse:</b> swipe left, right, up or down. A tap on the left or right third switches lanes. A tap in the middle jumps.</li>
          <li>Inputs are buffered for a short time. Press jump just before you land and it still counts. Slide in the air to drop fast.</li>
          <li><b>Jump</b> over low barriers 🚧. <b>Slide</b> under high bars. <b>Switch lanes</b> around trains, walls and carts. Oncoming trains have headlights.</li>
          <li>A crash ends the run, unless you have a shield 🛡️ or an extra hit ❤️. If you switch into the side of a train, you bounce back.</li>
          <li>Power-ups: 🧲 magnet, 🛡️ shield, 🚀 jetpack (fly over all), ✖️ double score.</li>
          <li>At each gate ⛩️ choose the next zone and a perk. Spend coins in the shop.</li>
          <li><b>Bosses</b> mark lanes in red before a beam hits. Orange waves mean jump. Blue lasers mean slide.</li>
          <li>Reach ${GOAL} m to win. Then you can keep running in endless mode.</li>
          <li>The run is saved at every gate. If you leave in the middle of a stage, you restart that stage.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Paused</h2>
      <button class="primary" data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends now.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Flow ----------

  private newRunFlow(): void {
    this.run = newRun(randomSeedText(), this.meta.runner);
    saveRun(this.run);
    this.startStage();
  }

  private startStage(): void {
    const r = this.run!;
    if (r.gate) {
      this.screen = 'gate';
      this.render();
      return;
    }
    saveRun(r);
    this.g = createGame(setupFor(r));
    this.bot.reset();
    this.inputQ = [];
    this.floats = [];
    this.parts = [];
    this.acc = 0;
    this.screen = 'play';
    const info = stageInfo(r.stage);
    if (info.boss) {
      const b = BOSSES[info.boss];
      this.banner = { text: `${b.icon} ${b.name}`, sub: 'Boss! Survive its attacks.', t: 0, color: '#ff6b6b' };
      sfx.boss();
    } else {
      const z = ZONES[r.zone];
      this.banner = { text: `${z.icon} ${z.name}`, sub: `Stage ${r.stage + 1} · ${info.len} m`, t: 0, color: '#80ed99' };
    }
    this.render();
  }

  private onStageEnd(): void {
    const g = this.g!;
    const r = this.run!;
    finishStage(r, { coins: g.coinsGot, score: g.score, hits: g.hits, boss: !!g.boss });
    this.g = null;
    saveRun(r);
    this.screen = 'gate';
    if (r.won && !r.endless) sfx.win();
    else sfx.gate();
    this.render();
  }

  private endRun(victory: boolean): void {
    const r = this.run;
    if (!r) return;
    const g = this.g;
    if (g) {
      r.score = Math.round(g.score);
      r.coins += g.coinsGot;
      r.coinsTotal += g.coinsGot;
    }
    const dist = Math.round(stageStart(r.stage) + (g ? g.dist : 0));
    const gems = gemsFor(r);
    const m = this.meta;
    m.runs++;
    if (victory) m.wins++;
    m.gems += gems;
    m.bestDist = Math.max(m.bestDist, dist);
    m.bestScore = Math.max(m.bestScore, r.score);
    saveMeta(m);
    this.end = { victory, score: r.score, dist, coins: r.coinsTotal, gems, bosses: r.bosses, stage: r.stage, runner: r.runner };
    this.run = null;
    this.g = null;
    saveRun(null);
    this.screen = 'end';
    this.modal = null;
    if (victory) sfx.win();
    else sfx.lose();
    this.render();
  }

  // ---------- Loop ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const availW = wrap.clientWidth;
    const availH = Math.max(300, wrap.clientHeight);
    const W = Math.min(availW, availH * 0.85, 760);
    const H = availH;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    cv.width = Math.round(W * this.dpr);
    cv.height = Math.round(H * this.dpr);
    this.W = W;
    this.H = H;
    this.horizon = H * 0.3;
    const runnerY = H * 0.8;
    this.f = (0.94 * W * CAM_BACK) / (3 * LW);
    this.camH = Math.max(2.8, Math.min(9.5, ((runnerY - this.horizon) * CAM_BACK) / this.f));
  }

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (t: number): void => {
      if (this.screen !== 'play' || !this.ctx) {
        this.raf = 0;
        return;
      }
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.realT += dt;
      if (!this.modal) {
        this.acc += dt;
        while (this.acc >= DT && this.screen === 'play') {
          this.stepGame();
          this.acc -= DT;
        }
        this.updateFx(dt);
      }
      if (this.screen === 'play' && this.ctx) this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stepGame(): void {
    const g = this.g;
    if (!g) return;
    let acts: Action[] | null = this.inputQ.length ? this.inputQ.splice(0) : null;
    if (this.botOn && g.state === 'run') {
      const b = this.bot.act(g);
      if (b) acts = acts ? acts.concat(b) : b;
    }
    update(g, DT, acts);
    if (g.ev.length) {
      const evs = g.ev.splice(0);
      for (const e of evs) this.onEvent(e);
    }
    if (this.g === g && g.state === 'crash' && g.crashT > (FAST ? 0.05 : 1.3)) this.endRun(this.run!.won);
  }

  private runnerScreen(): P2 {
    const g = this.g!;
    return this.proj(g.r.x * LW, g.r.y + 1, g.dist) ?? { x: this.W / 2, y: this.H * 0.75, s: 1 };
  }

  private addFloat(text: string, color: string, size = 18, dy = 0): void {
    if (!this.g) return;
    const p = this.runnerScreen();
    this.floats.push({ x: p.x, y: p.y - 40 + dy, text, color, t: 0, size });
  }

  private burst(x: number, y: number, n: number, color: string, speed = 160, size = 4): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, t: 0, life: 0.4 + Math.random() * 0.4, color, size });
    }
  }

  private onEvent(e: GameEvent): void {
    const g = this.g!;
    switch (e.type) {
      case 'jump':
        sfx.jump();
        break;
      case 'djump': {
        sfx.djump();
        const p = this.runnerScreen();
        this.burst(p.x, p.y + 20, 8, '#ffffff', 90, 3);
        break;
      }
      case 'slide':
        sfx.slide();
        break;
      case 'lane':
        sfx.lane();
        break;
      case 'land':
        sfx.land();
        break;
      case 'coin': {
        this.coinStreak++;
        sfx.coin(this.coinStreak);
        const p = this.runnerScreen();
        this.burst(p.x, p.y - 10, 3, '#ffd166', 80, 3);
        break;
      }
      case 'power': {
        const pd = POWERS[e.kind];
        sfx.power();
        this.addFloat(`${pd.icon} ${pd.name}!`, pd.color, 22);
        const p = this.runnerScreen();
        this.burst(p.x, p.y, 16, pd.color, 200, 4);
        break;
      }
      case 'bump':
        sfx.bump();
        this.shake = Math.max(this.shake, 6);
        this.addFloat('Bump!', '#ffd166', 16);
        break;
      case 'shield':
      case 'hit': {
        sfx.shield();
        this.shake = 12;
        this.flash = 0.35;
        this.flashColor = e.type === 'shield' ? '#4cc9f0' : '#ff4d6d';
        this.addFloat(e.type === 'shield' ? '🛡️ Shield broke!' : `❤️ Extra hit used (${g.hits} left)`, e.type === 'shield' ? '#4cc9f0' : '#ff8fa3', 18);
        break;
      }
      case 'smash': {
        const p = this.proj(obX(e.o, g.time) * LW, 1, e.o.z);
        if (p) this.burst(p.x, p.y, 10, g.zone.skin.wall, 220, 5);
        break;
      }
      case 'crash': {
        sfx.crash();
        this.shake = 22;
        this.flash = 0.6;
        this.flashColor = '#ff4d6d';
        const p = this.runnerScreen();
        this.burst(p.x, p.y, 30, '#ff6b6b', 300, 6);
        this.burst(p.x, p.y, 20, '#ffd166', 260, 4);
        this.banner = { text: '💥 CRASH!', sub: '', t: 0, color: '#ff4d6d' };
        break;
      }
      case 'tele':
        sfx.tele();
        break;
      case 'zap':
        sfx.zap();
        this.shake = Math.max(this.shake, 5);
        break;
      case 'dodge':
        sfx.dodge();
        this.addFloat(`Dodged +${e.pts}`, '#80ed99', 15, 20);
        break;
      case 'bossDown': {
        sfx.bossDown();
        const b = g.boss!.def;
        this.banner = { text: `${b.icon} ${b.name} retreats!`, sub: `+${e.pts} score`, t: 0, color: '#ffd166' };
        break;
      }
      case 'stageEnd':
        this.onStageEnd();
        break;
    }
    if (e.type !== 'coin' && e.type !== 'lane') this.coinStreak = Math.max(0, this.coinStreak - 1);
  }

  private updateFx(dt: number): void {
    for (const f of this.floats) {
      f.t += dt;
      f.y -= 40 * dt;
    }
    this.floats = this.floats.filter((f) => f.t < 1.2);
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash = Math.max(0, this.flash - dt);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 2.2) this.banner = null;
    }
  }

  // ---------- Drawing ----------

  private proj(x: number, y: number, z: number): P2 | null {
    const dz = z - this.camZ;
    if (dz < 0.4) return null;
    const s = this.f / dz;
    return { x: this.W / 2 + (x - this.camX) * s, y: this.horizon + (this.camY - y) * s, s };
  }

  private poly(pts: (P2 | null)[], fill: string): void {
    const ctx = this.ctx!;
    if (pts.some((p) => !p)) return;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.closePath();
    ctx.fill();
  }

  /** A box from x0..x1, y0..y1, z0..z1 (meters). Returns the front face rect. */
  private box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string): { x: number; y: number; w: number; h: number; s: number } | null {
    const za = Math.max(z0, this.camZ + 0.6);
    if (z1 <= za) return null;
    const zb = Math.min(z1, this.camZ + FAR + 20);
    const fl = this.proj(x0, y1, za)!;
    const fr = this.proj(x1, y0, za)!;
    if (this.camX < x0) this.poly([this.proj(x0, y0, za), this.proj(x0, y1, za), this.proj(x0, y1, zb), this.proj(x0, y0, zb)], shade(color, 0.6));
    if (this.camX > x1) this.poly([this.proj(x1, y0, za), this.proj(x1, y1, za), this.proj(x1, y1, zb), this.proj(x1, y0, zb)], shade(color, 0.6));
    if (this.camY > y1) this.poly([this.proj(x0, y1, za), this.proj(x1, y1, za), this.proj(x1, y1, zb), this.proj(x0, y1, zb)], shade(color, 1.25));
    const ctx = this.ctx!;
    ctx.fillStyle = color;
    ctx.fillRect(fl.x, fl.y, fr.x - fl.x, fr.y - fl.y);
    return { x: fl.x, y: fl.y, w: fr.x - fl.x, h: fr.y - fl.y, s: fl.s };
  }

  private emoji(e: string, x: number, bottom: number, size: number): void {
    if (size < 2) return;
    this.ctx!.drawImage(emojiCanvas(e), x - size / 2, bottom - size, size, size);
  }

  private draw(): void {
    const ctx = this.ctx!;
    const g = this.g;
    if (!g) return;
    const W = this.W;
    const H = this.H;
    const z = g.zone;
    const r = g.r;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.translate(sx, sy);

    this.camX += (r.x * LW * 0.55 - this.camX) * 0.2;
    this.camY = this.camH + r.y * 0.45;
    this.camZ = g.dist - CAM_BACK;

    // Sky and ground.
    const sky = ctx.createLinearGradient(0, 0, 0, this.horizon);
    sky.addColorStop(0, z.sky[0]);
    sky.addColorStop(1, z.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, this.horizon + 21);
    ctx.fillStyle = z.ground;
    ctx.fillRect(-20, this.horizon, W + 40, H - this.horizon + 20);
    // Far hills.
    ctx.fillStyle = shade(z.sky[0], 0.7);
    ctx.beginPath();
    ctx.moveTo(-20, this.horizon);
    for (let i = 0; i <= 12; i++) {
      const hx = (i / 12) * (W + 40) - 20 - this.camX * 2;
      const hy = this.horizon - (18 + ((hash2(i, 7) % 100) / 100) * this.H * 0.07);
      ctx.lineTo(hx, hy);
    }
    ctx.lineTo(W + 20, this.horizon);
    ctx.fill();
    // Sun or moon.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(W * 0.78 - this.camX * 1.5, this.horizon * 0.45, Math.min(W, H) * 0.06, 0, Math.PI * 2);
    ctx.fill();

    // Road.
    const near = this.camZ + 0.6;
    const far = this.camZ + FAR;
    const rw = LW * 1.5 + 0.5;
    this.poly([this.proj(-rw, 0, near), this.proj(rw, 0, near), this.proj(rw, 0, far), this.proj(-rw, 0, far)], z.road);
    // Gravel edges.
    this.poly([this.proj(-rw - 0.6, 0, near), this.proj(-rw, 0, near), this.proj(-rw, 0, far), this.proj(-rw - 0.6, 0, far)], shade(z.road, 1.3));
    this.poly([this.proj(rw, 0, near), this.proj(rw + 0.6, 0, near), this.proj(rw + 0.6, 0, far), this.proj(rw, 0, far)], shade(z.road, 1.3));
    // Ties.
    const step = 2.2;
    for (let tz = Math.ceil(near / step) * step; tz < far; tz += step) {
      for (let l = -1; l <= 1; l++) {
        const cx = l * LW;
        this.poly([this.proj(cx - 1.05, 0, tz), this.proj(cx + 1.05, 0, tz), this.proj(cx + 1.05, 0, tz + 0.45), this.proj(cx - 1.05, 0, tz + 0.45)], z.tie);
      }
    }
    // Rails.
    for (let l = -1; l <= 1; l++) {
      for (const side of [-0.7, 0.7]) {
        const x = l * LW + side;
        this.poly([this.proj(x - 0.07, 0.05, near), this.proj(x + 0.07, 0.05, near), this.proj(x + 0.07, 0.05, far), this.proj(x - 0.07, 0.05, far)], z.rail);
      }
    }
    this.drawStrikesGround(g);

    // Sprites from far to near.
    const list: { z: number; fn: () => void }[] = [];
    const sStep = 9;
    for (let i = Math.floor(near / sStep); i * sStep < far; i++) {
      for (const side of [-1, 1]) {
        const h = hash2(i, side + 5 + g.stage * 3);
        if (h % 5 === 0) continue;
        const e = z.scenery[h % z.scenery.length];
        const size = 3.5 + ((h >> 13) % 3);
        const x = side * (rw + 1.5 + size / 2 + ((h >> 5) % 5));
        const sz = i * sStep + ((h >> 9) % 5);
        list.push({
          z: sz,
          fn: () => {
            const p = this.proj(x, 0, sz);
            if (p) this.emoji(e, p.x, p.y, size * p.s);
          },
        });
      }
    }
    for (const o of g.obstacles) {
      const zz = o.z;
      if (zz > far || zz + o.len < near - 1) continue;
      if (o.dead >= 0 && g.time - o.dead > 0.5) continue;
      list.push({ z: Math.max(zz, near), fn: () => this.drawObstacle(g, o) });
    }
    for (const c of g.coins) {
      if (c.got || c.z > far) continue;
      const k = c.pull;
      const cx = (c.lane + (r.x - c.lane) * k) * LW;
      const cy = c.y + (r.y + 1 - c.y) * k;
      const cz = c.z + (g.dist + 0.5 - c.z) * k;
      if (cz < near) continue;
      list.push({ z: cz, fn: () => this.drawCoin(cx, cy, cz, g.time) });
    }
    for (const it of g.items) {
      if (it.got || it.z > far || it.z < near) continue;
      list.push({ z: it.z, fn: () => this.drawItem(it.kind, it.lane * LW, it.z, g.time) });
    }
    if (g.len < far + 5 && g.len > near) list.push({ z: g.len, fn: () => this.drawGate(g) });
    if (g.boss && !g.boss.down) list.push({ z: g.dist + BOSS_Z, fn: () => this.drawBoss(g) });
    this.drawStrikesAir(g, list);
    list.push({ z: g.dist, fn: () => this.drawRunner(g) });
    list.sort((a, b) => b.z - a.z);
    for (const d of list) d.fn();

    // Fog at the horizon.
    const fog = ctx.createLinearGradient(0, this.horizon - 4, 0, this.horizon + H * 0.08);
    fog.addColorStop(0, z.sky[1]);
    fog.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = fog;
    ctx.fillRect(-20, this.horizon - 4, W + 40, H * 0.08 + 4);
    ctx.globalAlpha = 1;

    // Speed lines.
    if (g.speed > 20 && g.state === 'run') {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      const n = Math.floor((g.speed - 18) / 2);
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const y = this.horizon + Math.random() * (H - this.horizon);
        const x = W / 2 + side * (W * 0.38 + Math.random() * W * 0.15);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + side * 30, y + 18);
        ctx.stroke();
      }
    }

    // Particles and floats.
    for (const p of this.parts) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      ctx.globalAlpha = Math.min(1, 2.2 - f.t * 1.8);
      ctx.font = `bold ${f.size}px system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.5, this.flash);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawHud(g);
  }

  private drawObstacle(g: Game, o: Obstacle): void {
    const ctx = this.ctx!;
    const sk = g.zone.skin;
    const x = obX(o, g.time) * LW;
    let lift = 0;
    if (o.dead >= 0) {
      const k = (g.time - o.dead) / 0.5;
      ctx.globalAlpha = Math.max(0, 1 - k);
      lift = k * 3;
    }
    const z0 = o.z;
    const z1 = o.z + o.len;
    const dz = z0 - this.camZ;
    if (dz > FAR - 25) ctx.globalAlpha *= Math.max(0, (FAR - dz) / 25);
    switch (o.kind) {
      case 'barrier': {
        this.box(x - 1.0, x - 0.85, lift, 0.9 + lift, z0 + 0.2, z0 + 0.35, '#555');
        this.box(x + 0.85, x + 1.0, lift, 0.9 + lift, z0 + 0.2, z0 + 0.35, '#555');
        const f = this.box(x - 1.1, x + 1.1, 0.4 + lift, 0.9 + lift, z0, z0 + 0.15, sk.barrier);
        if (f && f.w > 8) {
          ctx.fillStyle = '#ffffff';
          const n = 5;
          for (let i = 0; i < n; i += 2) ctx.fillRect(f.x + (f.w / n) * i + f.w / n / 2, f.y, f.w / n / 2, f.h);
        }
        break;
      }
      case 'bar': {
        this.box(x - 1.15, x - 1.0, lift, 1.9 + lift, z0, z0 + 0.15, '#666');
        this.box(x + 1.0, x + 1.15, lift, 1.9 + lift, z0, z0 + 0.15, '#666');
        const f = this.box(x - 1.15, x + 1.15, 1.15 + lift, 1.75 + lift, z0, z0 + 0.3, sk.bar);
        if (f && f.w > 8) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          const n = 6;
          for (let i = 0; i < n; i += 2) ctx.fillRect(f.x + (f.w / n) * i, f.y, f.w / n, f.h);
        }
        break;
      }
      case 'wall': {
        const f = this.box(x - 1.05, x + 1.05, lift, 2.8 + lift, z0, z1, sk.wall);
        if (f && f.w > 10) {
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.lineWidth = 1;
          for (let i = 1; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(f.x, f.y + (f.h * i) / 5);
            ctx.lineTo(f.x + f.w, f.y + (f.h * i) / 5);
            ctx.stroke();
          }
          ctx.fillStyle = '#ffd166';
          ctx.font = `bold ${Math.max(8, f.h * 0.3)}px system-ui`;
          ctx.textAlign = 'center';
          ctx.fillText('⛔', f.x + f.w / 2, f.y + f.h * 0.55);
        }
        break;
      }
      case 'train':
      case 'oncoming': {
        const f = this.box(x - 1.1, x + 1.1, lift, 3.2 + lift, z0, z1, sk.train);
        if (f && f.w > 10) {
          ctx.fillStyle = 'rgba(20,30,40,0.85)';
          ctx.fillRect(f.x + f.w * 0.12, f.y + f.h * 0.14, f.w * 0.76, f.h * 0.3);
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(f.x, f.y + f.h * 0.58, f.w, f.h * 0.06);
          const on = o.kind === 'oncoming';
          ctx.fillStyle = on ? '#fff6a8' : '#888';
          for (const hx of [0.2, 0.8]) {
            ctx.beginPath();
            ctx.arc(f.x + f.w * hx, f.y + f.h * 0.78, Math.max(1.5, f.w * 0.07), 0, Math.PI * 2);
            ctx.fill();
          }
          if (on) {
            const gr = ctx.createRadialGradient(f.x + f.w / 2, f.y + f.h * 0.78, 1, f.x + f.w / 2, f.y + f.h * 0.78, f.w * 0.9);
            gr.addColorStop(0, 'rgba(255,240,150,0.55)');
            gr.addColorStop(1, 'rgba(255,240,150,0)');
            ctx.fillStyle = gr;
            ctx.fillRect(f.x - f.w * 0.4, f.y, f.w * 1.8, f.h * 1.4);
          }
        }
        break;
      }
      case 'shifter': {
        const f = this.box(x - 0.95, x + 0.95, 0.25 + lift, 1.6 + lift, z0, z1, sk.cart);
        if (f && f.w > 8) {
          ctx.fillStyle = '#222';
          for (const hx of [0.18, 0.82]) {
            ctx.beginPath();
            ctx.ellipse(f.x + f.w * hx, f.y + f.h * 1.05, f.w * 0.1, f.h * 0.17, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.font = `bold ${Math.max(8, f.h * 0.5)}px system-ui`;
          ctx.textAlign = 'center';
          ctx.fillText('↔', f.x + f.w / 2, f.y + f.h * 0.7);
        }
        break;
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawCoin(x: number, y: number, z: number, t: number): void {
    const p = this.proj(x, y, z);
    if (!p) return;
    const ctx = this.ctx!;
    const rad = 0.32 * p.s;
    if (rad < 0.7) return;
    const w = Math.abs(Math.cos(t * 5 + z * 0.3)) * rad + rad * 0.15;
    ctx.fillStyle = '#e09f00';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, w, rad, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, w * 0.7, rad * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawItem(kind: PwId, x: number, z: number, t: number): void {
    const y = 1.1 + Math.sin(t * 4 + z) * 0.15;
    const p = this.proj(x, y, z);
    if (!p) return;
    const ctx = this.ctx!;
    const rad = 0.6 * p.s;
    const pd = POWERS[kind];
    const gr = ctx.createRadialGradient(p.x, p.y, rad * 0.2, p.x, p.y, rad * 1.6);
    gr.addColorStop(0, pd.color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fill();
    this.emoji(pd.icon, p.x, p.y + rad * 0.8, rad * 1.6);
  }

  private drawGate(g: Game): void {
    const ctx = this.ctx!;
    const z0 = g.len;
    const col = g.boss ? '#ffd166' : '#80ed99';
    const rw = LW * 1.5 + 0.6;
    this.box(-rw - 0.5, -rw, 0, 6, z0, z0 + 0.5, '#444');
    this.box(rw, rw + 0.5, 0, 6, z0, z0 + 0.5, '#444');
    const f = this.box(-rw - 0.5, rw + 0.5, 5, 6.2, z0, z0 + 0.5, col);
    if (f && f.w > 30) {
      ctx.fillStyle = '#10251a';
      ctx.font = `bold ${Math.max(9, f.h * 0.7)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(g.stage + 1 === GOAL_STAGES ? '🏁 GOAL' : '⛩️ GATE', f.x + f.w / 2, f.y + f.h * 0.75);
    }
  }

  private drawBoss(g: Game): void {
    const ctx = this.ctx!;
    const b = g.boss!;
    const bx = Math.sin(g.time * 0.7) * LW * 0.7;
    const by = 6 + Math.sin(g.time * 2) * 0.4;
    const p = this.proj(bx, by, g.dist + BOSS_Z);
    if (!p) return;
    const size = 5.5 * p.s;
    const charging = g.strikes.some((s) => !s.live && !s.done);
    const gr = ctx.createRadialGradient(p.x, p.y - size / 2, size * 0.1, p.x, p.y - size / 2, size);
    gr.addColorStop(0, charging ? 'rgba(255,60,60,0.65)' : 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(p.x, p.y - size / 2, size, 0, Math.PI * 2);
    ctx.fill();
    this.emoji(b.def.icon, p.x, p.y, size);
  }

  private strikeK(g: Game, s: { start: number; at: number }): number {
    return Math.max(0, Math.min(1, (g.time - s.start) / (s.at - s.start)));
  }

  private drawStrikesGround(g: Game): void {
    const ctx = this.ctx!;
    for (const s of g.strikes) {
      if (s.kind !== 'beam' || s.done) continue;
      const k = this.strikeK(g, s);
      for (const l of s.lanes) {
        const x = l * LW;
        const pts = [this.proj(x - 1.15, 0.02, this.camZ + 0.7), this.proj(x + 1.15, 0.02, this.camZ + 0.7), this.proj(x + 1.15, 0.02, g.dist + BOSS_Z), this.proj(x - 1.15, 0.02, g.dist + BOSS_Z)];
        if (s.live) {
          this.poly(pts, 'rgba(255,90,90,0.75)');
          this.poly([this.proj(x - 0.3, 0.03, this.camZ + 0.7), this.proj(x + 0.3, 0.03, this.camZ + 0.7), this.proj(x + 0.3, 0.03, g.dist + BOSS_Z), this.proj(x - 0.3, 0.03, g.dist + BOSS_Z)], 'rgba(255,255,255,0.9)');
        } else {
          const blink = Math.sin(g.time * (10 + k * 20)) > 0 ? 1 : 0.6;
          this.poly(pts, `rgba(255,40,60,${(0.12 + 0.3 * k) * blink})`);
          const w = this.proj(x, 0.1, g.dist + 7);
          if (w) {
            ctx.font = `bold ${Math.round(w.s * 1.1)}px system-ui`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.fillText('⚠', w.x, w.y);
          }
        }
      }
    }
  }

  private drawStrikesAir(g: Game, list: { z: number; fn: () => void }[]): void {
    for (const s of g.strikes) {
      if (s.kind === 'beam' || s.done) continue;
      const k = this.strikeK(g, s);
      const wz = g.dist + BOSS_Z * (1 - k) + (s.live ? 0 : 0.6);
      if (s.live && g.time > s.at + 0.1) continue;
      const slam = s.kind === 'slam';
      list.push({
        z: wz,
        fn: () => {
          const ctx = this.ctx!;
          const rw = LW * 1.5 + 0.5;
          const y0 = slam ? 0 : 1.0;
          const y1 = slam ? 0.45 : 1.3;
          ctx.globalAlpha = 0.85;
          const f = this.box(-rw, rw, y0, y1, wz, wz + 0.4, slam ? '#ff9e00' : '#4cc9f0');
          ctx.globalAlpha = 1;
          if (f && f.w > 30) {
            ctx.font = `bold ${Math.max(10, Math.min(28, f.s * 0.8))}px system-ui`;
            ctx.textAlign = 'center';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            const txt = slam ? '⤒ JUMP' : '⤓ SLIDE';
            ctx.strokeText(txt, f.x + f.w / 2, f.y - 6);
            ctx.fillStyle = slam ? '#ffd166' : '#a5f3ff';
            ctx.fillText(txt, f.x + f.w / 2, f.y - 6);
          }
        },
      });
    }
  }

  private drawRunner(g: Game): void {
    const ctx = this.ctx!;
    const r = g.r;
    const rd = RUNNERS[this.run?.runner ?? 'dash'] ?? RUNNERS.dash;
    const x = r.x * LW;
    const shadow = this.proj(x, 0, g.dist);
    const p = this.proj(x, r.y, g.dist);
    if (!shadow || !p) return;
    const s = p.s;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, 0.55 * s * Math.max(0.4, 1 - r.y * 0.12), 0.18 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (g.state === 'crash') ctx.globalAlpha = 0.6;
    if (r.inv > 0 && r.jet <= 0 && Math.floor(this.realT * 12) % 2) ctx.globalAlpha = 0.45;
    const fx = p.x;
    const fy = p.y;
    const col = rd.color;
    const dark = shade(col, 0.6);
    const skin = '#f1c27d';
    const phase = g.dist * 0.75;
    const lean = (r.lane - r.x) * -0.25;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(lean);
    if (r.slide > 0) {
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.ellipse(0, -0.28 * s, 0.42 * s, 0.26 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, -0.38 * s, 0.32 * s, 0.22 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rd.hair;
      ctx.beginPath();
      ctx.arc(0, -0.62 * s, 0.16 * s, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const air = r.air;
      const sw = air ? 0 : Math.sin(phase);
      const legH = air ? 0.55 : 0.82;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 0.16 * s;
      for (const side of [-1, 1]) {
        const lift = air ? 0.25 : Math.max(0, sw * side) * 0.3;
        ctx.beginPath();
        ctx.moveTo(side * 0.12 * s, -0.82 * s);
        ctx.lineTo(side * 0.14 * s, -(0.82 - legH + lift) * s - 0.04 * s);
        ctx.stroke();
      }
      // Torso.
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(-0.27 * s, -1.45 * s, 0.54 * s, 0.7 * s, 0.12 * s);
      ctx.fill();
      // Backpack or jetpack.
      ctx.fillStyle = r.jet > 0 ? '#adb5bd' : dark;
      ctx.beginPath();
      ctx.roundRect(-0.17 * s, -1.38 * s, 0.34 * s, 0.42 * s, 0.06 * s);
      ctx.fill();
      if (r.jet > 0) {
        for (const side of [-0.1, 0.1]) {
          const fl = (0.25 + Math.random() * 0.25) * s;
          const gr = ctx.createLinearGradient(0, -0.95 * s, 0, -0.95 * s + fl);
          gr.addColorStop(0, '#fff3b0');
          gr.addColorStop(1, 'rgba(255,90,0,0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.moveTo(side * s - 0.07 * s, -0.95 * s);
          ctx.lineTo(side * s + 0.07 * s, -0.95 * s);
          ctx.lineTo(side * s, -0.95 * s + fl);
          ctx.fill();
        }
      }
      // Arms.
      ctx.strokeStyle = skin;
      ctx.lineWidth = 0.11 * s;
      for (const side of [-1, 1]) {
        const a = air ? -0.9 : sw * side * 0.6;
        ctx.beginPath();
        ctx.moveTo(side * 0.27 * s, -1.38 * s);
        ctx.lineTo(side * (0.36 + Math.abs(a) * 0.05) * s, (-1.0 + a * 0.25) * s);
        ctx.stroke();
      }
      // Head.
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(0, -1.6 * s, 0.17 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rd.hair;
      ctx.beginPath();
      ctx.arc(0, -1.63 * s, 0.17 * s, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
    }
    ctx.restore();
    if (g.pw.shield > 0) {
      ctx.strokeStyle = `rgba(76,201,240,${0.55 + Math.sin(this.realT * 6) * 0.25})`;
      ctx.lineWidth = Math.max(2, 0.08 * s);
      ctx.beginPath();
      ctx.arc(fx, fy - 0.85 * s, 1.0 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(76,201,240,0.1)';
      ctx.fill();
    }
    if (g.pw.magnet > 0) {
      ctx.strokeStyle = 'rgba(255,107,107,0.4)';
      ctx.lineWidth = 2;
      const rr = (0.6 + ((this.realT * 1.5) % 1) * 0.8) * s;
      ctx.beginPath();
      ctx.arc(fx, fy - 0.85 * s, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawHud(g: Game): void {
    const ctx = this.ctx!;
    const W = this.W;
    const run = this.run!;
    const total = g.base + g.dist;
    const pad = 12;
    // Progress bar to the goal.
    const goal = run.stage < GOAL_STAGES;
    const bx = pad;
    const bw = W - pad * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(bx, 8, bw, 8, 4);
    ctx.fill();
    if (goal) {
      ctx.fillStyle = '#80ed99';
      ctx.beginPath();
      ctx.roundRect(bx, 8, (bw * Math.min(1, total / GOAL)) | 0, 8, 4);
      ctx.fill();
      for (let i = 1; i <= GOAL_STAGES; i++) {
        const mx = bx + (bw * stageStart(i)) / GOAL;
        const info = stageInfo(i - 1);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(mx - 1, 6, 2, 12);
        if (info.boss) {
          ctx.font = '13px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(BOSSES[info.boss].icon, bx + (bw * (stageStart(i - 1) + info.len / 2)) / GOAL, 32);
        }
      }
    } else {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.roundRect(bx, 8, (bw * Math.min(1, g.dist / g.len)) | 0, 8, 4);
      ctx.fill();
    }
    const text = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left'): void => {
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(s, x, y);
      ctx.fillStyle = color;
      ctx.fillText(s, x, y);
    };
    text(`${Math.floor(total)} m`, pad, 46, 24, '#ffffff');
    text(`${Math.floor(g.score)}`, pad, 68, 16, '#cfe8d5');
    text(`${Math.round(g.speed)} m/s`, pad, 88, 12, 'rgba(255,255,255,0.75)');
    text(`🪙 ${run.coins + g.coinsGot}`, W - pad, 46, 20, '#ffd166', 'right');
    let hy = 70;
    if (g.hits > 0 || g.pw.shield > 0) {
      text(`${g.pw.shield > 0 ? '🛡️' : ''}${g.hits > 0 ? ` ❤️×${g.hits}` : ''}`, W - pad, hy, 16, '#ff8fa3', 'right');
      hy += 22;
    }
    const timers: [string, number, number, string][] = [];
    if (g.pw.magnet > 0) timers.push([POWERS.magnet.icon, g.pw.magnet, POWERS.magnet.dur * g.mods.durMul, POWERS.magnet.color]);
    if (g.pw.boost > 0) timers.push([POWERS.boost.icon, g.pw.boost, POWERS.boost.dur * g.mods.durMul, POWERS.boost.color]);
    if (g.r.jet > 0) timers.push([POWERS.jet.icon, g.r.jet, POWERS.jet.dur * g.mods.durMul, POWERS.jet.color]);
    if (g.pw.shield > 0 && g.pw.shield < 90) timers.push([POWERS.shield.icon, g.pw.shield, POWERS.shield.dur * g.mods.durMul, POWERS.shield.color]);
    for (const [ic, left, max, color] of timers) {
      ctx.font = '15px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(ic, W - pad - 58, hy);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(W - pad - 54, hy - 9, 54, 7);
      ctx.fillStyle = color;
      ctx.fillRect(W - pad - 54, hy - 9, 54 * Math.max(0, Math.min(1, left / max)), 7);
      hy += 20;
    }
    if (g.boss && !g.boss.down) {
      const b = g.boss.def;
      const k = Math.min(1, g.dist / (g.len - 70));
      text(`${b.icon} ${b.name}`, W / 2, 46, 15, '#ff8fa3', 'center');
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(W / 2 - 60, 54, 120, 6);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(W / 2 - 60, 54, 120 * (1 - k), 6);
    }
    if (this.banner) {
      const bn = this.banner;
      const a = Math.min(1, bn.t * 4, (2.2 - bn.t) * 2);
      ctx.globalAlpha = Math.max(0, a);
      const y = this.H * 0.24 - (1 - Math.min(1, bn.t * 4)) * 20;
      text(bn.text, W / 2, y, Math.min(34, W * 0.08), bn.color, 'center');
      if (bn.sub) text(bn.sub, W / 2, y + 26, 15, '#ffffff', 'center');
      ctx.globalAlpha = 1;
    }
    if (this.botOn) text('BOT', W - pad, this.H - 12, 12, '#ffd166', 'right');
  }

  // ---------- Input ----------

  private push(a: Action): void {
    initAudio();
    if (this.screen !== 'play' || this.modal || !this.g || this.g.state !== 'run') return;
    this.inputQ.push(a);
  }

  private onDown(e: PointerEvent): void {
    if (this.screen !== 'play' || this.modal) return;
    if (!(e.target instanceof HTMLCanvasElement) && !(e.target as HTMLElement).closest?.('.stage')) return;
    initAudio();
    this.swipe = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, fired: false };
    e.preventDefault();
  }

  private onMove(e: PointerEvent): void {
    const s = this.swipe;
    if (!s || s.id !== e.pointerId || s.fired) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) < 28) return;
    s.fired = true;
    if (Math.abs(dx) > Math.abs(dy)) this.push(dx < 0 ? 'left' : 'right');
    else this.push(dy < 0 ? 'jump' : 'slide');
  }

  private onUp(e: PointerEvent): void {
    const s = this.swipe;
    if (!s || s.id !== e.pointerId) return;
    this.swipe = null;
    if (s.fired) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 14 || performance.now() - s.t > 350) return;
    const cv = this.canvas;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    if (fx < 1 / 3) this.push('left');
    else if (fx > 2 / 3) this.push('right');
    else this.push('jump');
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen === 'play') {
      const k = e.key.toLowerCase();
      let a: Action | null = null;
      if (k === 'arrowleft' || k === 'a') a = 'left';
      else if (k === 'arrowright' || k === 'd') a = 'right';
      else if (k === 'arrowup' || k === 'w' || k === ' ') a = 'jump';
      else if (k === 'arrowdown' || k === 's') a = 'slide';
      else if (k === 'escape' || k === 'p') {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
        return;
      }
      if (a) {
        e.preventDefault();
        if (!e.repeat) this.push(a);
      }
    } else if (this.screen === 'gate' && e.key === 'Enter' && this.run && gateReady(this.run)) {
      this.action('go', {});
    }
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    this.action(el.dataset.act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const r = this.run;
    switch (act) {
      case 'mute':
        toggleMute();
        this.render();
        return;
      case 'help':
        this.modal = { kind: 'help' };
        this.render();
        return;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        this.render();
        return;
      case 'modal-close':
        this.modal = null;
        this.last = performance.now();
        this.render();
        return;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        return;
      case 'abandon-yes':
        this.modal = null;
        this.endRun(!!r?.won);
        return;
      case 'title':
        this.modal = null;
        this.g = null;
        this.screen = 'title';
        if (r) saveRun(r);
        this.render();
        return;
      case 'new':
        this.newRunFlow();
        return;
      case 'continue':
        if (r) this.startStage();
        return;
      case 'runner': {
        const id = d.id!;
        const m = this.meta;
        if (!m.unlocked.includes(id)) {
          const cost = RUNNERS[id].cost;
          if (m.gems < cost) {
            sfx.deny();
            return;
          }
          m.gems -= cost;
          m.unlocked.push(id);
          this.toast(`${RUNNERS[id].icon} ${RUNNERS[id].name} unlocked!`);
          sfx.buy();
        }
        m.runner = id;
        saveMeta(m);
        this.render();
        return;
      }
      case 'zone':
        if (r?.gate) {
          r.gate.zone = d.id!;
          sfx.click();
          saveRun(r);
          this.render();
        }
        return;
      case 'perk':
        if (r?.gate) {
          r.gate.perk = d.id!;
          sfx.click();
          saveRun(r);
          this.render();
        }
        return;
      case 'buy':
        if (r && buy(r, Number(d.i))) {
          sfx.buy();
          saveRun(r);
          this.render();
        } else sfx.deny();
        return;
      case 'go':
        if (!r || !gateReady(r)) return;
        if (r.won) r.endless = true;
        if (r.gate?.perk) this.toast(`${PERKS[r.gate.perk].icon} ${PERKS[r.gate.perk].name}`);
        leaveGate(r);
        this.startStage();
        return;
      case 'finish':
        if (r) this.endRun(true);
        return;
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLElement>(sel);
      el?.click();
      return !!el;
    };
    const api = {
      state: () => {
        const g = this.g;
        const r = this.run;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          stage: r?.stage ?? null,
          zone: g ? g.zone.id : (r?.zone ?? null),
          dist: g ? Math.round(g.base + g.dist) : r ? stageStart(r.stage) : null,
          speed: g ? +g.speed.toFixed(1) : null,
          coins: r ? r.coins + (g?.coinsGot ?? 0) : null,
          score: g ? Math.round(g.score) : (r?.score ?? null),
          hits: g ? g.hits : (r?.hits ?? null),
          perks: r ? { ...r.perks } : null,
          won: r?.won ?? null,
          endless: r?.endless ?? null,
          game: g
            ? { state: g.state, time: +g.time.toFixed(2), lane: g.r.lane, x: +g.r.x.toFixed(2), y: +g.r.y.toFixed(2), slide: g.r.slide > 0, jet: g.r.jet > 0, pw: { ...g.pw }, obstacles: g.obstacles.filter((o) => o.dead < 0 && o.z > g.dist).length, boss: g.boss ? g.boss.def.id : null, strikes: g.strikes.length }
            : null,
          end: this.end,
          meta: { ...this.meta },
        };
      },
      gems: (n: number) => {
        this.meta.gems += n;
        saveMeta(this.meta);
        this.render();
      },
      coins: (n: number) => {
        if (this.run) this.run.coins += n;
        this.render();
      },
      /** Toggle the bot that plays in real time. */
      bot: (on = true) => {
        this.botOn = on;
        this.bot.reset();
      },
      power: (k: PwId) => {
        if (!this.g) return;
        this.g.items.push({ kind: k, lane: this.g.r.lane, z: this.g.dist + 1, got: false });
      },
      /** Jump to the end of the current stage. */
      skip: () => {
        const g = this.g;
        if (!g) return;
        g.dist = g.len - 1;
        g.obstacles = [];
        g.strikes = [];
      },
      /** One bot action. In a stage it simulates up to 3 s of game time with the dodging bot. */
      step: () => {
        if (this.modal) {
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            if (!click('[data-act="continue"]')) click('[data-act="new"]');
            return 'start';
          case 'play': {
            const g = this.g;
            if (!g) return 'busy';
            const was = this.botOn;
            this.botOn = true;
            for (let i = 0; i < 180 && this.screen === 'play' && this.g === g; i++) this.stepGame();
            this.botOn = was;
            return this.screen === 'play' ? 'play' : this.screen;
          }
          case 'gate': {
            if (!r?.gate) return 'busy';
            if (r.won && !r.endless) {
              click('[data-act="finish"]');
              return 'finish';
            }
            const c = botGate(r);
            for (const i of c.buy) click(`[data-act="buy"][data-i="${i}"]`);
            if (c.zone) click(`[data-act="zone"][data-id="${c.zone}"]`);
            if (c.perk) click(`[data-act="perk"][data-id="${c.perk}"]`);
            click('[data-act="go"]');
            return 'gate';
          }
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
