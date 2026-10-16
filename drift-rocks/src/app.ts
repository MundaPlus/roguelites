import { ENEMIES, HULLS, HULL_IDS, ROCK_INFO, UPGRADES, WAVES, bossFor, isDockWave, type EnemyKind } from './data';
import { botInput, botRank, newBotMem, type BotMem } from './bot';
import { DT, NO_INPUT, newGame, step, type Enemy, type Fx, type Game, type Input, type Rock } from './game';
import { Rng, randomSeedText } from './rng';
import {
  LOCKED,
  MAX_LIVES,
  absorb,
  afterPick,
  applyUp,
  buy,
  clearRun,
  finalScore,
  leaveDock,
  loadMeta,
  loadRun,
  newRun,
  owns,
  saveMeta,
  saveRun,
  shardsFor,
  unlockCost,
  waveCleared,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'play' | 'pick' | 'dock' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

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

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  color: string;
  t: number;
  life: number;
}

interface Btn {
  x: number;
  y: number;
  r: number;
}

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips waits, for bot tests. */
const FAST = PARAMS.has('fast');
const AREA = 960 * 625;

const BOSS_INTRO: Record<string, string> = {
  mother: 'It launches drones and fires rings of bullets.',
  titan: 'It throws rocks and sheds big rocks as it cracks.',
  warden: 'Spread shots, drones, and a bullet spiral when hurt.',
};

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private end: { victory: boolean; score: number; shards: number; wave: number; kills: number } | null = null;

  // Play
  private g: Game | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private scale = 1;
  private cssW = 0;
  private cssH = 0;
  private parts: Part[] = [];
  private floats: Float[] = [];
  private rings: Ring[] = [];
  private stars: { x: number; y: number; s: number; p: number }[] = [];
  private shake = 0;
  private flash = 0;
  private banner: { text: string; sub: string; t: number } | null = null;
  private endT = -1;
  private soundBudget = 4;
  private bot = false;
  private botMem: BotMem = newBotMem();
  private botRng = new Rng(7);

  // Input
  private keys = { left: false, right: false, up: false, fire: false, hyper: false };
  private mouse = { on: false, x: 0, y: 0, fire: false, thrust: false };
  private touch = {
    on: false,
    stick: null as { id: number; ox: number; oy: number; x: number; y: number } | null,
    fire: null as number | null,
    hyper: null as number | null,
  };
  private pad = { on: false, menuWas: false };

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    try {
      this.touch.on = matchMedia('(pointer: coarse)').matches;
    } catch {
      /* ignore */
    }
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'play' && this.g?.state === 'play' && !this.modal && !this.bot) {
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
        body = '<div class="cv-wrap"><canvas id="cv"></canvas></div>';
        break;
      case 'pick':
        body = this.pickView();
        break;
      case 'dock':
        body = this.dockView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'play') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.canvas!.addEventListener('pointerdown', (e) => this.onDown(e));
      this.canvas!.addEventListener('contextmenu', (e) => e.preventDefault());
      this.resize();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
    }
  }

  private refreshTop(): void {
    const top = this.root.querySelector<HTMLElement>('header.top');
    if (top && this.run) top.outerHTML = this.topBar();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private save(): void {
    if (this.run) saveRun(this.run);
  }

  private modsHtml(mods: Record<string, number>): string {
    const ids = Object.keys(mods).filter((id) => mods[id] > 0 && UPGRADES[id]);
    if (!ids.length) return '<span class="dim">No upgrades yet</span>';
    return ids
      .map((id) => {
        const u = UPGRADES[id];
        return `<span class="chip" title="${u.name}: ${u.text[mods[id] - 1]}">${u.icon}${mods[id] > 1 ? `<sup>${mods[id]}</sup>` : ''}</span>`;
      })
      .join('');
  }

  private topBar(): string {
    const r = this.run!;
    const inPlay = this.screen === 'play';
    return `<header class="top">
      <span class="wave" title="Wave">🌊 ${Math.min(r.wave, WAVES)}/${WAVES}</span>
      ${inPlay ? '' : `<span title="Ships">🚀 ${r.lives}</span><span title="Credits" class="gold">¢ ${r.credits}</span>`}
      <span class="mods">${this.modsHtml(r.mods)}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play" aria-label="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound" aria-label="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu" aria-label="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const hulls = HULL_IDS.filter((id) => owns(m, id))
      .map((id) => {
        const h = HULLS[id];
        return `<button class="pick hull ${m.hull === id ? 'sel' : ''}" data-act="hull" data-id="${id}" style="--c:${h.color}"><span class="big">${h.icon}</span><b>${h.name}</b><small>${h.text}</small><small class="kind">${h.lives} ships · turn ${h.turn} · drag ${h.drag}</small></button>`;
      })
      .join('');
    const hangar = LOCKED.map((id) => {
      const item = HULLS[id] ?? UPGRADES[id];
      const own = m.unlocked.includes(id);
      const cost = unlockCost(id);
      const text = HULLS[id] ? `Hull: ${HULLS[id].text}` : `Upgrade: ${UPGRADES[id].text[0]}`;
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${item.icon}</span><span><b>${item.name}</b><small>${text}</small></span>
        ${own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${id}" ${m.shards >= cost ? '' : 'disabled'}>💎 ${cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo" aria-hidden="true"><span class="rock r1"></span><span class="ship">▲</span><span class="rock r2"></span></div>
      <h1>Drift Rocks</h1>
      <p class="sub">Turn, thrust, drift. Break the rocks, beat the saucers, survive ${WAVES} waves and 3 bosses.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (wave ${r.wave}, 🚀 ${r.lives}, ¢ ${r.credits})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best wave ${m.bestWave} · Best score ${m.best} · Kills ${m.kills}</p>
      <h2>Hull</h2>
      <div class="picks">${hulls}</div>
      <h2>Hangar <small>💎 ${m.shards} shards</small></h2>
      <p class="sub">Each run gives shards. Unlock hulls and new upgrades for later runs.</p>
      <div class="armory">${hangar}</div>
    </div>`;
  }

  private upCard(id: string, act: string, extra: string, i: number, disabled = false): string {
    const r = this.run!;
    const u = UPGRADES[id];
    const lvl = r.mods[id] ?? 0;
    const pips = Array.from({ length: u.max }, (_, k) => `<i class="${k < lvl ? 'on' : k === lvl ? 'next' : ''}"></i>`).join('');
    return `<button class="pick" data-act="${act}" data-i="${i}" ${disabled ? 'disabled' : ''}><span class="big">${u.icon}</span><b>${u.name}</b><span class="pips">${pips}</span><small>${u.text[Math.min(lvl, u.max - 1)]}</small>${extra}</button>`;
  }

  private pickView(): string {
    const r = this.run!;
    const cards = r.offers.map((id, i) => this.upCard(id, 'pick', '', i)).join('');
    const boss = bossFor(r.wave + 1);
    return `<div class="pickv">
      <h2 class="good">Wave ${r.wave} clear!</h2>
      <p>🚀 ${r.lives} ships · ¢ ${r.credits} credits · score ${r.score}</p>
      <h3>Choose an upgrade</h3>
      <div class="picks">${cards}</div>
      ${boss && !isDockWave(r.wave) ? `<p class="warn">Next: ${ENEMIES[boss].icon} ${ENEMIES[boss].name}!</p>` : ''}
      <div class="loadout">${HULLS[r.hull].icon} ${HULLS[r.hull].name} ${this.modsHtml(r.mods)}</div>
    </div>`;
  }

  private dockView(): string {
    const r = this.run!;
    const items = r.dock
      .map((it, i) => {
        if (it.kind === 'life') {
          const ok = !it.sold && r.credits >= it.cost && r.lives < MAX_LIVES;
          return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${ok ? '' : 'disabled'}><span class="big">🚀</span><b>Spare ship</b><small>+1 ship (max ${MAX_LIVES}).</small><span class="cost">${it.sold ? 'Sold' : `¢ ${it.cost}`}</span></button>`;
        }
        const ok = !it.sold && r.credits >= it.cost && (r.mods[it.id] ?? 0) < UPGRADES[it.id].max;
        return this.upCard(it.id, 'buy', `<span class="cost">${it.sold ? 'Sold' : `¢ ${it.cost}`}</span>`, i, !ok).replace('class="pick"', `class="pick ${it.sold ? 'off' : ''}"`);
      })
      .join('');
    const boss = bossFor(r.wave + 1);
    return `<div class="dockv">
      <h2>🛰️ Dock</h2>
      <p>Spend the credits from the rocks. <span class="gold">¢ ${r.credits}</span> · 🚀 ${r.lives}</p>
      <div class="picks">${items}</div>
      ${boss ? `<p class="warn">Next: ${ENEMIES[boss].icon} ${ENEMIES[boss].name}!</p>` : ''}
      <button class="primary" data-act="leave">Launch wave ${r.wave + 1} ▶</button>
      <div class="loadout">${HULLS[r.hull].icon} ${HULLS[r.hull].name} ${this.modsHtml(r.mods)}</div>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Victory!' : '💥 Game over'}</h1>
      <p>${e.victory ? 'The Warden breaks apart. The field is yours.' : `Your last ship was lost in wave ${e.wave}.`}</p>
      <p>Kills: <b>${e.kills}</b> · Waves cleared: <b>${e.victory ? WAVES : e.wave - 1}</b></p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>💎 +${e.shards} shards for the Hangar</p>
      <button class="primary" data-act="new">▶ New run</button>
      <button data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const rocks = (Object.keys(ROCK_INFO) as (keyof typeof ROCK_INFO)[])
        .map((k) => `<li><i class="sw" style="background:${ROCK_INFO[k].color}"></i><b>${ROCK_INFO[k].name}</b>: ${ROCK_INFO[k].text}</li>`)
        .join('');
      const foes = (Object.keys(ENEMIES) as EnemyKind[])
        .map((k) => `<li>${ENEMIES[k].icon} <b>${ENEMIES[k].name}</b>: ${ENEMIES[k].text}</li>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Keyboard:</b> ← → or A D turn, ↑ or W thrust, Space or J fire (hold), Shift or K hyperspace, Esc pause.</li>
          <li><b>Mouse:</b> the ship turns to the pointer. Left button fires, right button thrusts.</li>
          <li><b>Touch:</b> drag the left side to steer. The ship turns to the stick and thrusts when you push it far. Hold FIRE on the right. JUMP is hyperspace.</li>
          <li><b>Gamepad:</b> left stick steers and thrusts, A or RB fires, B or LB jumps, Start pauses.</li>
          <li>Your ship keeps its speed. To stop, turn around and thrust the other way. The edges wrap around.</li>
          <li>Big rocks split into smaller rocks. Clear all rocks and enemies to end the wave.</li>
          <li>Pick up the gold credits. After each wave choose an upgrade. Every few waves the dock sells upgrades and spare ships.</li>
          <li>Waves 5, 10 and 15 are boss waves. Beat the boss of wave 15 to win.</li>
        </ul>
        <h3>Rocks</h3><ul class="list">${rocks}</ul>
        <h3>Enemies</h3><ul class="list">${foes}</ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>${this.screen === 'play' ? 'Paused' : 'Menu'}</h2>
      <button class="primary" data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run${this.screen === 'play' ? ', the wave starts again' : ''})</button>
    </div></div>`;
  }

  // ---------- Flow ----------

  private go(screen: Screen): void {
    this.screen = screen;
    this.modal = null;
    if (screen !== 'end') this.save();
    this.render();
  }

  private worldSize(): { W: number; H: number } {
    const top = this.root.querySelector<HTMLElement>('header.top')?.offsetHeight ?? 44;
    const w = Math.max(280, Math.min(window.innerWidth, 1400) - 8);
    const h = Math.max(280, window.innerHeight - top - 10);
    const aspect = Math.max(0.5, Math.min(1.9, w / h));
    const W = Math.round(Math.sqrt(AREA * aspect));
    return { W, H: Math.round(AREA / W) };
  }

  private beginWave(): void {
    const r = this.run!;
    r.stage = 'play';
    this.screen = 'play';
    this.modal = null;
    this.save();
    this.render();
    const { W, H } = this.worldSize();
    this.g = newGame({ seed: r.seed, wave: r.wave, hull: r.hull, mods: r.mods, lives: r.lives, credits: r.credits, score: r.score, W, H });
    const rng = new Rng(r.wave * 31 + 5);
    this.stars = Array.from({ length: 140 }, () => ({ x: rng.next() * W, y: rng.next() * H, s: rng.next() < 0.15 ? 1.6 : 0.9, p: rng.next() * 6 }));
    this.parts = [];
    this.floats = [];
    this.rings = [];
    this.endT = -1;
    this.acc = 0;
    this.botMem = newBotMem();
    const boss = bossFor(r.wave);
    this.banner = boss ? { text: ENEMIES[boss].name, sub: `Boss wave ${r.wave}. ${BOSS_INTRO[boss]}`, t: 0 } : { text: `Wave ${r.wave}`, sub: r.wave === 1 ? 'Break every rock.' : '', t: 0 };
    this.resize();
    if (boss) this.snd(() => sfx.warn());
    else this.snd(() => sfx.wave());
  }

  private finishWave(): void {
    const g = this.g;
    const r = this.run;
    if (!g || !r || this.screen !== 'play') return;
    this.endT = -1;
    absorb(r, g);
    this.g = null;
    if (g.state === 'over') {
      this.endRun(false);
      return;
    }
    if (waveCleared(r)) {
      this.endRun(true);
      return;
    }
    if (r.stage === 'play') this.beginWave();
    else this.go(r.stage);
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const sc = finalScore(r, victory);
    const shards = shardsFor(sc, victory ? WAVES : r.wave - 1);
    const m = this.meta;
    m.runs++;
    if (victory) m.wins++;
    m.bestWave = Math.max(m.bestWave, victory ? WAVES : r.wave);
    m.best = Math.max(m.best, sc);
    m.kills += r.kills;
    m.shards += shards;
    saveMeta(m);
    this.end = { victory, score: sc, shards, wave: r.wave, kills: r.kills };
    this.run = null;
    this.g = null;
    clearRun();
    if (victory) sfx.win();
    else sfx.lose();
    this.go('end');
  }

  private startRun(): void {
    this.run = newRun(randomSeedText(), this.meta);
    this.beginWave();
  }

  // ---------- Loop ----------

  private resize(): void {
    const cv = this.canvas;
    const g = this.g;
    if (!cv) return;
    const W = g?.W ?? 960;
    const H = g?.H ?? 625;
    const top = this.root.querySelector<HTMLElement>('header.top')?.offsetHeight ?? 44;
    const maxW = Math.min(window.innerWidth, 1400) - 8;
    const maxH = window.innerHeight - top - 10;
    const w = Math.max(200, Math.min(maxW, (maxH * W) / H));
    const h = (w * H) / W;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    this.scale = (w / W) * dpr;
    this.cssW = w;
    this.cssH = h;
  }

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (t: number) => {
      if (this.screen !== 'play' || !this.ctx) {
        this.raf = 0;
        return;
      }
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private pollPad(): Input | null {
    let pads: (Gamepad | null)[] = [];
    try {
      pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    } catch {
      return null;
    }
    const p = pads.find((x) => x && x.connected);
    if (!p) return null;
    const b = (i: number): boolean => !!p.buttons[i]?.pressed;
    const menu = b(9);
    if (menu && !this.pad.menuWas) {
      this.pad.menuWas = true;
      this.modal = this.modal ? null : { kind: 'menu', confirm: false };
      this.render();
    }
    this.pad.menuWas = menu;
    const ax = p.axes[0] ?? 0;
    const ay = p.axes[1] ?? 0;
    const mag = Math.hypot(ax, ay);
    const fire = b(0) || b(5) || b(7);
    const hyper = b(1) || b(4);
    const dl = b(14);
    const dr = b(15);
    const du = b(12);
    if (mag < 0.25 && !fire && !hyper && !dl && !dr && !du && !b(6)) return this.pad.on ? { ...NO_INPUT } : null;
    this.pad.on = true;
    return {
      turn: (dr ? 1 : 0) - (dl ? 1 : 0),
      thrust: du || b(6) ? 1 : mag > 0.75 ? 1 : 0,
      fire,
      aim: mag >= 0.25 ? Math.atan2(ay, ax) : null,
      hyper,
    };
  }

  private input(): Input {
    const g = this.g!;
    if (this.bot) return botInput(g, 'good', this.botMem, this.botRng);
    const pad = this.pollPad();
    const k = this.keys;
    const inp: Input = { turn: (k.right ? 1 : 0) - (k.left ? 1 : 0), thrust: k.up ? 1 : 0, fire: k.fire, aim: null, hyper: k.hyper };
    if (this.mouse.on && inp.turn === 0 && g.ship.alive) {
      const s = g.ship;
      const p = this.toWorld(this.mouse.x, this.mouse.y);
      inp.aim = Math.atan2(p.y - s.y, p.x - s.x);
      inp.fire ||= this.mouse.fire;
      if (this.mouse.thrust) inp.thrust = 1;
    }
    const st = this.touch.stick;
    if (st) {
      const dx = st.x - st.ox;
      const dy = st.y - st.oy;
      const mag = Math.hypot(dx, dy) / 56;
      if (mag > 0.2) inp.aim = Math.atan2(dy, dx);
      if (mag > 0.65) inp.thrust = Math.min(1, (mag - 0.4) / 0.6);
    }
    if (this.touch.fire !== null) inp.fire = true;
    if (this.touch.hyper !== null) inp.hyper = true;
    if (pad) {
      if (pad.aim !== null) inp.aim = pad.aim;
      if (pad.turn) inp.turn = pad.turn;
      inp.thrust = Math.max(inp.thrust, pad.thrust);
      inp.fire ||= pad.fire;
      inp.hyper ||= pad.hyper;
    }
    return inp;
  }

  /** Advance the wave by `n` fixed steps. */
  private simulate(n: number): void {
    const g = this.g;
    if (!g) return;
    for (let i = 0; i < n && g.state === 'play'; i++) {
      const inp = this.input();
      step(g, inp);
      this.handleFx(g.fx);
      g.fx.length = 0;
    }
    if (g.state !== 'play' && this.endT < 0) {
      if (g.state === 'clear') {
        this.banner = { text: 'Wave clear!', sub: `+${g.gained.credits} ¢ · +${g.gained.score} points`, t: 0 };
        this.snd(() => sfx.clear());
        this.endT = 1.8;
      } else {
        this.banner = { text: 'Game over', sub: '', t: 0 };
        this.endT = 2.2;
      }
    }
  }

  private update(dt: number): void {
    const g = this.g;
    if (!g) return;
    this.soundBudget = 5;
    const paused = !!this.modal;
    if (!paused) {
      if (g.state === 'play') {
        this.acc += dt;
        const n = Math.floor(this.acc / DT);
        this.acc -= n * DT;
        this.simulate(Math.min(n, 8));
      } else if (this.endT >= 0) {
        this.endT -= dt;
        if (this.endT < 0) this.finishWave();
      }
    } else this.pollPad();
    const fdt = paused ? 0 : dt;
    for (const p of this.parts) {
      p.t += fdt;
      p.x += p.vx * fdt;
      p.y += p.vy * fdt;
      p.vx *= 1 - 1.8 * fdt;
      p.vy *= 1 - 1.8 * fdt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const f of this.floats) {
      f.t += fdt;
      f.y -= 26 * fdt;
    }
    this.floats = this.floats.filter((f) => f.t < 1);
    for (const r of this.rings) r.t += fdt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    this.shake = Math.max(0, this.shake - fdt * 25);
    this.flash = Math.max(0, this.flash - fdt * 2.5);
    if (this.banner) {
      this.banner.t += fdt;
      if (this.banner.t > 2.4) this.banner = null;
    }
  }

  private snd(fn: () => void): void {
    if (FAST || this.soundBudget <= 0) return;
    this.soundBudget--;
    fn();
  }

  private burst(x: number, y: number, color: string, n: number, speed: number, life = 0.6): void {
    if (this.parts.length > 500) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.9);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: life * (0.5 + Math.random() * 0.8), color, size: 1 + Math.random() * 2 });
    }
  }

  private handleFx(list: Fx[]): void {
    for (const f of list) {
      switch (f.k) {
        case 'boom': {
          const big = f.r > 35;
          this.burst(f.x, f.y, f.color, Math.min(40, 6 + f.r * 0.5), 60 + f.r * 3);
          this.rings.push({ x: f.x, y: f.y, r: f.r * 1.3, color: f.color, t: 0, life: 0.35 });
          if (big) this.shake = Math.max(this.shake, Math.min(10, f.r / 8));
          this.snd(() => sfx.boom(f.r > 60 ? 4 : f.r > 35 ? 3 : f.r > 20 ? 2 : 1));
          break;
        }
        case 'hit':
          this.burst(f.x, f.y, f.color, 3, 90, 0.25);
          this.snd(() => sfx.hit());
          break;
        case 'clink':
          this.snd(() => sfx.clink());
          break;
        case 'shoot':
          this.snd(() => (f.enemy ? sfx.enemyShoot() : sfx.shoot()));
          break;
        case 'float':
          this.floats.push({ x: f.x, y: f.y, text: f.text, color: f.color, t: 0 });
          break;
        case 'gem':
          this.burst(f.x, f.y, '#ffd166', 5, 70, 0.3);
          this.snd(() => sfx.gem());
          break;
        case 'lost':
          this.burst(f.x, f.y, '#ffffff', 30, 220, 1);
          this.shake = 14;
          this.flash = 0.6;
          this.snd(() => sfx.lost());
          if (this.g && this.g.lives > 0) this.banner = { text: 'Ship lost', sub: `${this.g.lives} left`, t: 0.6 };
          break;
        case 'shield':
          this.rings.push({ x: f.x, y: f.y, r: 50, color: '#4cc9f0', t: 0, life: 0.5 });
          this.shake = 6;
          this.snd(() => sfx.shield());
          break;
        case 'shieldUp':
          this.snd(() => sfx.shieldUp());
          break;
        case 'hyper':
          this.burst(f.x, f.y, '#c77dff', 18, 160, 0.5);
          this.burst(f.x2, f.y2, '#c77dff', 18, 160, 0.5);
          this.rings.push({ x: f.x2, y: f.y2, r: 40, color: '#c77dff', t: 0, life: 0.4 });
          this.snd(() => sfx.hyper());
          break;
        case 'nova':
          this.rings.push({ x: f.x, y: f.y, r: f.r, color: '#ffd166', t: 0, life: 0.5 });
          this.flash = 0.4;
          this.snd(() => sfx.nova());
          break;
        case 'arm':
          this.snd(() => sfx.arm());
          break;
        case 'spawn':
          if (ENEMIES[f.kind].boss) this.shake = 8;
          else if (f.kind === 'saucer' || f.kind === 'hunter') this.snd(() => sfx.warn());
          break;
        case 'bossDown':
          this.shake = 20;
          this.flash = 1;
          this.burst(f.x, f.y, '#ffffff', 60, 320, 1.4);
          break;
        case 'clear':
          break;
      }
    }
  }

  // ---------- Drawing ----------

  private toWorld(cx: number, cy: number): { x: number; y: number } {
    const rect = this.canvas!.getBoundingClientRect();
    const g = this.g!;
    return { x: ((cx - rect.left) / rect.width) * g.W, y: ((cy - rect.top) / rect.height) * g.H };
  }

  /** Call `fn` at the position and at the wrapped copies near the edges. */
  private wrapped(x: number, y: number, r: number, fn: (x: number, y: number) => void): void {
    const g = this.g!;
    const xs = [x];
    const ys = [y];
    if (x < r) xs.push(x + g.W);
    if (x > g.W - r) xs.push(x - g.W);
    if (y < r) ys.push(y + g.H);
    if (y > g.H - r) ys.push(y - g.H);
    for (const px of xs) for (const py of ys) fn(px, py);
  }

  private draw(): void {
    const ctx = this.ctx;
    const g = this.g;
    const cv = this.canvas;
    if (!ctx || !g || !cv) return;
    const T = performance.now() / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.setTransform(this.scale, 0, 0, this.scale, sx * this.scale, sy * this.scale);

    // Stars.
    for (const s of this.stars) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(T * 1.5 + s.p);
      ctx.fillStyle = '#cfe8ff';
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Player mines.
    for (const m of g.pmines) {
      const on = m.arm <= 0;
      ctx.strokeStyle = '#90f1a4';
      ctx.shadowColor = '#90f1a4';
      ctx.shadowBlur = on ? 8 : 0;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
      ctx.stroke();
      if (on && Math.sin(T * 8) > 0) {
        ctx.fillStyle = '#90f1a4';
        ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
      }
    }

    // Gems.
    for (const gm of g.gems) {
      const blink = gm.life < 2.5 && Math.sin(T * 20) > 0;
      if (blink) continue;
      ctx.fillStyle = '#ffd166';
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 10;
      const r = 4 + Math.min(3, gm.val * 0.4);
      ctx.beginPath();
      ctx.moveTo(gm.x, gm.y - r);
      ctx.lineTo(gm.x + r * 0.7, gm.y);
      ctx.lineTo(gm.x, gm.y + r);
      ctx.lineTo(gm.x - r * 0.7, gm.y);
      ctx.closePath();
      ctx.fill();
    }

    for (const r of g.rocks) this.wrapped(r.x, r.y, r.r + 4, (x, y) => this.drawRock(ctx, r, x, y, T));
    for (const e of g.enemies) this.wrapped(e.x, e.y, e.r + 10, (x, y) => this.drawEnemy(ctx, e, x, y, T));

    // Bullets.
    for (const b of g.bullets) {
      const c = b.enemy ? '#ff4d6d' : '#e0fbfc';
      ctx.strokeStyle = c;
      ctx.shadowColor = b.enemy ? '#ff4d6d' : '#8ecae6';
      ctx.shadowBlur = 10;
      ctx.lineWidth = b.enemy ? 5 : 3;
      ctx.beginPath();
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const len = b.enemy ? 2 : 7;
      ctx.moveTo(b.x - (b.vx / sp) * len, b.y - (b.vy / sp) * len);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    this.drawShip(ctx, g, T);

    // Particles and rings.
    ctx.shadowBlur = 0;
    for (const p of this.parts) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.3 + 0.7 * k), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // Screen space HUD.
    const dpr = cv.width / this.cssW;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    this.drawHud(ctx, g);
    this.drawTouch(ctx, g);
  }

  private drawRock(ctx: CanvasRenderingContext2D, r: Rock, x: number, y: number, T: number): void {
    const info = ROCK_INFO[r.kind];
    const n = r.shape.length;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r.rot);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r.r * r.shape[i];
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = r.hit > 0 ? 'rgba(255,255,255,0.35)' : r.kind === 'explosive' ? `rgba(255,107,53,${0.12 + 0.1 * Math.sin(T * 6 + r.id)})` : 'rgba(142,202,230,0.06)';
    ctx.fill();
    ctx.strokeStyle = r.hit > 0 ? '#ffffff' : info.color;
    ctx.shadowColor = info.color;
    ctx.shadowBlur = 8;
    ctx.lineWidth = r.kind === 'metal' ? 3 : 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (r.kind === 'metal') {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(141,153,174,0.6)';
      ctx.beginPath();
      ctx.arc(0, 0, r.r * 0.45, 0, Math.PI * 2);
      ctx.moveTo(-r.r * 0.3, -r.r * 0.3);
      ctx.lineTo(r.r * 0.3, r.r * 0.3);
      ctx.stroke();
    } else if (r.kind === 'crystal') {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(76,201,240,0.7)';
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r.r * 0.7, Math.sin(a) * r.r * 0.7);
      }
      ctx.stroke();
    } else if (r.kind === 'explosive') {
      ctx.fillStyle = '#ff6b35';
      ctx.shadowColor = '#ff6b35';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, r.r * (0.18 + 0.05 * Math.sin(T * 8 + r.id)), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (r.max > 1.5 && r.hp < r.max) {
      ctx.rotate(-r.rot);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(-r.r * 0.5, r.r + 4, r.r, 3);
      ctx.fillStyle = info.color;
      ctx.fillRect(-r.r * 0.5, r.r + 4, (r.r * Math.max(0, r.hp)) / r.max, 3);
    }
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, x: number, y: number, T: number): void {
    const d = ENEMIES[e.kind];
    ctx.save();
    ctx.translate(x, y);
    if (e.warp > 0) {
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, e.r * (1 + e.warp), T * 4, T * 4 + Math.PI * 1.6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }
    const c = e.hit > 0 ? '#ffffff' : d.color;
    ctx.strokeStyle = c;
    ctx.shadowColor = d.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    const r = e.r;
    switch (e.kind) {
      case 'saucer':
      case 'hunter':
      case 'mother': {
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(-r * 0.55, -r * 0.35);
        ctx.lineTo(r * 0.55, -r * 0.35);
        ctx.lineTo(r, 0);
        ctx.lineTo(r * 0.55, r * 0.35);
        ctx.lineTo(-r * 0.55, r * 0.35);
        ctx.closePath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        ctx.moveTo(-r * 0.35, -r * 0.35);
        ctx.lineTo(-r * 0.25, -r * 0.7);
        ctx.lineTo(r * 0.25, -r * 0.7);
        ctx.lineTo(r * 0.35, -r * 0.35);
        ctx.stroke();
        if (e.kind === 'mother') {
          for (let i = 0; i < 6; i++) {
            const on = Math.floor(T * 6 + i) % 3 === 0;
            ctx.fillStyle = on ? '#ffd166' : 'rgba(255,209,102,0.3)';
            ctx.fillRect(-r * 0.75 + i * r * 0.3 - 2, -2, 4, 4);
          }
        }
        break;
      }
      case 'mine': {
        const armed = e.arm >= 0;
        ctx.strokeStyle = armed && Math.sin(T * 30) > 0 ? '#ffffff' : c;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + T;
          ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
          ctx.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        if (armed) {
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          ctx.arc(0, 0, 75, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'drone': {
        const a = Math.atan2(e.vy, e.vx);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(r * 1.3, 0);
        ctx.lineTo(-r, -r * 0.8);
        ctx.lineTo(-r * 0.4, 0);
        ctx.lineTo(-r, r * 0.8);
        ctx.closePath();
        ctx.stroke();
        break;
      }
      case 'titan': {
        ctx.rotate(e.a);
        ctx.beginPath();
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const rr = r * (0.85 + 0.15 * Math.sin(i * 2.7));
          if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,158,0,0.08)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
        const cracks = Math.round((1 - e.hp / e.max) * 6) + 1;
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(255,${120 + 60 * Math.sin(T * 5)},0,0.9)`;
        ctx.beginPath();
        for (let i = 0; i < cracks; i++) {
          const a = i * 2.1;
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4 + 6);
          ctx.lineTo(Math.cos(a + 0.3) * r * 0.75, Math.sin(a + 0.3) * r * 0.75);
        }
        ctx.stroke();
        ctx.fillStyle = '#ff9e00';
        ctx.beginPath();
        ctx.arc(0, 0, 9 + 2 * Math.sin(T * 4), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'warden': {
        ctx.rotate(e.a);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.6, r * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = e.hp < e.max * 0.33 ? '#ff4d6d' : '#f72585';
        ctx.beginPath();
        ctx.arc(r * 0.18, 0, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  private drawShip(ctx: CanvasRenderingContext2D, g: Game, T: number): void {
    const s = g.ship;
    if (!s.alive) return;
    const h = HULLS[g.hull];
    if (s.inv > 0 && Math.sin(T * 30) > 0.3) return;
    // Wingman.
    if (g.st.wingCd > 0) {
      const wx = s.x + Math.cos(s.wingA) * 34;
      const wy = s.y + Math.sin(s.wingA) * 34;
      ctx.strokeStyle = '#90f1a4';
      ctx.shadowColor = '#90f1a4';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(wx, wy, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.wrapped(s.x, s.y, s.r + 20, (x, y) => {
      ctx.save();
      ctx.translate(x, y);
      if (s.shield > 0) {
        ctx.strokeStyle = 'rgba(76,201,240,0.7)';
        ctx.shadowColor = '#4cc9f0';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, s.r + 8 + Math.sin(T * 4), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(s.a);
      const r = s.r;
      if (s.thrust > 0) {
        ctx.strokeStyle = '#ffb703';
        ctx.shadowColor = '#ff6b35';
        ctx.shadowBlur = 14;
        ctx.lineWidth = 2;
        const fl = r * (0.8 + Math.random() * 0.9) * s.thrust;
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.35);
        ctx.lineTo(-r * 0.7 - fl, 0);
        ctx.lineTo(-r * 0.7, r * 0.35);
        ctx.stroke();
      }
      ctx.strokeStyle = h.color;
      ctx.shadowColor = h.color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (g.hull === 'bulwark') {
        ctx.moveTo(r * 1.3, 0);
        ctx.lineTo(-r * 0.2, -r);
        ctx.lineTo(-r * 0.9, -r * 0.7);
        ctx.lineTo(-r * 0.9, r * 0.7);
        ctx.lineTo(-r * 0.2, r);
      } else if (g.hull === 'lancer') {
        ctx.moveTo(r * 1.8, 0);
        ctx.lineTo(-r * 0.8, -r * 0.7);
        ctx.lineTo(-r * 0.4, 0);
        ctx.lineTo(-r * 0.8, r * 0.7);
      } else {
        ctx.moveTo(r * 1.4, 0);
        ctx.lineTo(-r * 0.9, -r * 0.85);
        ctx.lineTo(-r * 0.5, 0);
        ctx.lineTo(-r * 0.9, r * 0.85);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    });
    ctx.shadowBlur = 0;
  }

  private drawHud(ctx: CanvasRenderingContext2D, g: Game): void {
    const w = this.cssW;
    const small = w < 500;
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.font = `bold ${small ? 13 : 15}px system-ui, sans-serif`;
    ctx.fillStyle = '#e0fbfc';
    ctx.fillText(`${g.score}`, 10, 20);
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`¢ ${g.credits}`, 10, 38);
    // Lives as small ships.
    const h = HULLS[g.hull];
    ctx.strokeStyle = h.color;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < Math.min(g.lives, 8); i++) {
      const x = 16 + i * 16;
      const y = 54;
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 5, y + 5);
      ctx.lineTo(x, y + 2);
      ctx.lineTo(x - 5, y + 5);
      ctx.closePath();
      ctx.stroke();
    }
    // Right side: wave, rocks left, shield and hyper.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8ecae6';
    ctx.fillText(`Wave ${g.wave}`, w - 10, 20);
    ctx.font = `${small ? 11 : 13}px system-ui, sans-serif`;
    ctx.fillStyle = '#9fb3c8';
    const foes = g.enemies.length + g.spawns.reduce((a, s) => a + s.n, 0);
    ctx.fillText(`☄ ${g.rocks.length}  ✦ ${foes}`, w - 10, 37);
    let yy = 54;
    const s = g.ship;
    if (g.st.shieldCd > 0) {
      ctx.fillStyle = s.shield > 0 ? '#4cc9f0' : '#5c6b7a';
      ctx.fillText(s.shield > 0 ? 'SHIELD ●' : `SHIELD ${Math.ceil(s.shieldT)}s`, w - 10, yy);
      yy += 16;
    }
    if (g.st.hyperCd > 0) {
      ctx.fillStyle = s.hyperT <= 0 ? '#c77dff' : '#5c6b7a';
      ctx.fillText(s.hyperT <= 0 ? 'JUMP ●' : `JUMP ${Math.ceil(s.hyperT)}s`, w - 10, yy);
    }
    // Boss bar.
    const boss = g.bossId !== null ? g.enemies.find((e) => e.id === g.bossId) : undefined;
    if (boss && boss.warp <= 0) {
      const bw = Math.min(360, w - 180);
      const bx = (w - bw) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(bx, 12, bw, 8);
      ctx.fillStyle = ENEMIES[boss.kind].color;
      ctx.fillRect(bx, 12, (bw * Math.max(0, boss.hp)) / boss.max, 8);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${small ? 11 : 12}px system-ui, sans-serif`;
      ctx.fillText(ENEMIES[boss.kind].name, w / 2, 34);
    }
    // Banner.
    const b = this.banner;
    if (b) {
      const a = Math.min(1, b.t * 4, (2.4 - b.t) * 2);
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center';
      ctx.font = `bold ${small ? 28 : 40}px system-ui, sans-serif`;
      ctx.fillStyle = '#e0fbfc';
      ctx.shadowColor = '#8ecae6';
      ctx.shadowBlur = 18;
      ctx.fillText(b.text, w / 2, this.cssH * 0.38);
      ctx.shadowBlur = 0;
      if (b.sub) {
        ctx.font = `${small ? 13 : 16}px system-ui, sans-serif`;
        ctx.fillStyle = '#9fb3c8';
        ctx.fillText(b.sub, w / 2, this.cssH * 0.38 + 28, w - 20);
      }
      ctx.globalAlpha = 1;
    }
  }

  private touchButtons(): { fire: Btn; jump: Btn | null } {
    const w = this.cssW;
    const h = this.cssH;
    const fr = Math.min(48, w * 0.12);
    const fire = { x: w - fr - 20, y: h - fr - 28, r: fr };
    const jump = this.g && this.g.st.hyperCd > 0 ? { x: fire.x - fr * 1.9, y: h - fr * 0.7 - 16, r: fr * 0.65 } : null;
    return { fire, jump };
  }

  private drawTouch(ctx: CanvasRenderingContext2D, g: Game): void {
    if (!this.touch.on) return;
    const { fire, jump } = this.touchButtons();
    const btn = (b: Btn, label: string, on: boolean, color: string, ready = true) => {
      ctx.globalAlpha = on ? 0.55 : 0.28;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = ready ? 0.9 : 0.4;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(b.r * 0.38)}px system-ui, sans-serif`;
      ctx.fillText(label, b.x, b.y + b.r * 0.13);
      ctx.globalAlpha = 1;
    };
    btn(fire, 'FIRE', this.touch.fire !== null, '#8ecae6');
    if (jump) btn(jump, 'JUMP', this.touch.hyper !== null, '#c77dff', g.ship.hyperT <= 0);
    const st = this.touch.stick;
    const ox = st ? st.ox : 80;
    const oy = st ? st.oy : this.cssH - 90;
    ctx.globalAlpha = st ? 0.5 : 0.18;
    ctx.strokeStyle = '#8ecae6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ox, oy, 56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(ox, oy, 56 * 0.65, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    let kx = ox;
    let ky = oy;
    if (st) {
      const dx = st.x - st.ox;
      const dy = st.y - st.oy;
      const m = Math.hypot(dx, dy);
      const k = m > 56 ? 56 / m : 1;
      kx = ox + dx * k;
      ky = oy + dy * k;
    }
    ctx.fillStyle = '#8ecae6';
    ctx.beginPath();
    ctx.arc(kx, ky, 20, 0, Math.PI * 2);
    ctx.fill();
    if (!st) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('STEER', ox, oy - 64);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Input ----------

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onDown(e: PointerEvent): void {
    if (this.screen !== 'play' || !this.g || this.modal) return;
    initAudio();
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      this.touch.on = false;
      this.mouse.on = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (e.button === 2) this.mouse.thrust = true;
      else this.mouse.fire = true;
      return;
    }
    this.touch.on = true;
    this.mouse.on = false;
    const p = this.local(e);
    const { fire, jump } = this.touchButtons();
    const inBtn = (b: Btn) => Math.hypot(p.x - b.x, p.y - b.y) < b.r * 1.25;
    if (jump && inBtn(jump)) this.touch.hyper = e.pointerId;
    else if (inBtn(fire) || (p.x > this.cssW * 0.55 && this.touch.stick)) this.touch.fire = e.pointerId;
    else if (p.x < this.cssW * 0.55 && !this.touch.stick) this.touch.stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    else this.touch.fire = e.pointerId;
    try {
      this.canvas!.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.screen !== 'play' || !this.canvas) return;
    if (e.pointerType === 'mouse') {
      const rect = this.canvas.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      if (!this.mouse.on && Math.abs(e.movementX) + Math.abs(e.movementY) < 2) return;
      this.mouse.on = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      return;
    }
    const st = this.touch.stick;
    if (st && st.id === e.pointerId) {
      const p = this.local(e);
      st.x = p.x;
      st.y = p.y;
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      if (e.button === 2) this.mouse.thrust = false;
      else this.mouse.fire = false;
      return;
    }
    if (this.touch.stick?.id === e.pointerId) this.touch.stick = null;
    if (this.touch.fire === e.pointerId) this.touch.fire = null;
    if (this.touch.hyper === e.pointerId) this.touch.hyper = null;
  }

  private releaseAll(): void {
    this.keys = { left: false, right: false, up: false, fire: false, hyper: false };
    this.mouse.fire = false;
    this.mouse.thrust = false;
    this.touch.stick = null;
    this.touch.fire = null;
    this.touch.hyper = null;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const map: Record<string, keyof App['keys']> = {
      ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ' ': 'fire', j: 'fire', Shift: 'hyper', k: 'hyper', ArrowDown: 'hyper', s: 'hyper',
    };
    const key = map[k];
    if (key) {
      this.keys[key] = down;
      if (this.screen === 'play') {
        e.preventDefault();
        if (down && (key === 'left' || key === 'right')) this.mouse.on = false;
        if (down) this.touch.on = false;
      }
    }
    if (!down) return;
    if (this.screen === 'play') initAudio();
    if (k === 'Escape' || k === 'p') {
      if (this.modal) this.modal = null;
      else if (this.run && this.screen !== 'title' && this.screen !== 'end') this.modal = { kind: 'menu', confirm: false };
      else return;
      this.render();
      return;
    }
    if (this.modal) return;
    // Number keys pick upgrade cards. Enter launches from the dock.
    if (this.screen === 'pick' && /^[1-3]$/.test(k)) this.action('pick', { i: String(Number(k) - 1) });
    else if (this.screen === 'dock' && /^[1-4]$/.test(k)) this.action('buy', { i: String(Number(k) - 1) });
    else if (this.screen === 'dock' && k === 'Enter') this.action('leave', {});
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    if (el instanceof HTMLButtonElement && el.disabled) return;
    this.action(el.dataset.act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const r = this.run;
    switch (act) {
      case 'mute':
        toggleMute();
        this.refreshTop();
        break;
      case 'help':
        this.modal = { kind: 'help' };
        this.render();
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        this.render();
        break;
      case 'modal-close':
        this.modal = null;
        this.last = performance.now();
        this.render();
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        break;
      case 'abandon-yes':
        if (r) {
          if (this.g) absorb(r, this.g);
          this.g = null;
          this.endRun(false);
        }
        break;
      case 'title':
        this.g = null;
        this.go('title');
        break;
      case 'new':
        this.startRun();
        break;
      case 'continue':
        if (!r) break;
        if (r.stage === 'play') this.beginWave();
        else this.go(r.stage);
        break;
      case 'hull':
        if (d.id && owns(this.meta, d.id)) {
          this.meta.hull = d.id;
          saveMeta(this.meta);
          this.render();
        }
        break;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.shards < cost || this.meta.unlocked.includes(id)) {
          sfx.deny();
          break;
        }
        this.meta.shards -= cost;
        this.meta.unlocked.push(id);
        if (HULLS[id]) this.meta.hull = id;
        saveMeta(this.meta);
        sfx.buy();
        this.toast(`Unlocked ${(HULLS[id] ?? UPGRADES[id]).name}`);
        this.render();
        break;
      }
      case 'pick': {
        if (!r || this.screen !== 'pick') break;
        const id = r.offers[Number(d.i)];
        if (!id) break;
        applyUp(r, id);
        sfx.pick();
        this.toast(`${UPGRADES[id].icon} ${UPGRADES[id].name} ${r.mods[id] > 1 ? `level ${r.mods[id]}` : ''}`);
        afterPick(r);
        if (r.stage === 'play') this.beginWave();
        else this.go(r.stage);
        break;
      }
      case 'buy': {
        if (!r || this.screen !== 'dock') break;
        if (buy(r, Number(d.i))) {
          sfx.buy();
          this.save();
          this.render();
        } else sfx.deny();
        break;
      }
      case 'leave':
        if (!r || this.screen !== 'dock') break;
        leaveDock(r);
        this.beginWave();
        break;
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
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        wave: this.run?.wave ?? null,
        stage: this.run?.stage ?? null,
        lives: this.g ? this.g.lives : (this.run?.lives ?? null),
        credits: this.g ? this.g.credits : (this.run?.credits ?? null),
        score: this.g ? this.g.score : (this.run?.score ?? null),
        hull: this.run?.hull ?? null,
        mods: this.run ? { ...this.run.mods } : null,
        game: this.g
          ? { state: this.g.state, time: Math.round(this.g.time), ship: { x: Math.round(this.g.ship.x), y: Math.round(this.g.ship.y), a: +this.g.ship.a.toFixed(2), speed: Math.round(Math.hypot(this.g.ship.vx, this.g.ship.vy)), alive: this.g.ship.alive }, bullets: this.g.bullets.filter((b) => !b.enemy).length, W: this.g.W, H: this.g.H, rocks: this.g.rocks.length, enemies: this.g.enemies.map((e) => e.kind), boss: this.g.bossId !== null }
          : null,
        end: this.end,
      }),
      credits: (n: number) => {
        if (this.run) this.run.credits += n;
        if (this.g) this.g.credits += n;
        this.render();
      },
      shards: (n: number) => {
        this.meta.shards += n;
        saveMeta(this.meta);
        this.render();
      },
      /** Jump to wave n at the next wave start. */
      wave: (n: number) => {
        if (!this.run) return;
        this.run.wave = Math.max(1, Math.min(WAVES, n));
        this.beginWave();
      },
      clear: () => {
        if (!this.g) return;
        this.g.rocks = [];
        this.g.enemies = [];
        this.g.spawns = [];
        this.g.bossId = null;
      },
      bot: (on = true) => {
        this.bot = on;
      },
      /** One bot action. In a wave it plays 5 s of game time with the bot. */
      step: () => {
        if (this.modal) {
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            click('[data-act="continue"]') || click('[data-act="new"]');
            return 'start';
          case 'play': {
            const g = this.g;
            if (!g) return 'busy';
            this.bot = true;
            if (g.state !== 'play') {
              if (FAST) this.finishWave();
              return 'busy';
            }
            this.simulate(300);
            // A safety valve: a stuck wave ends after 4 minutes.
            if (g.state === 'play' && g.time > 240) {
              g.lives = 0;
              g.ship.alive = false;
              g.state = 'over';
            }
            if (g.state !== 'play') {
              if (FAST) this.finishWave();
              return 'wave-end';
            }
            return 'play';
          }
          case 'pick': {
            const best = r!.offers.map((id, i) => [id, i] as const).sort((a, b) => botRank(a[0]) - botRank(b[0]))[0];
            this.action('pick', { i: String(best[1]) });
            return 'pick';
          }
          case 'dock': {
            if (r!.lives <= 2 && click('[data-act="buy"][data-i="0"]:not([disabled])')) return 'buy';
            const ups = r!.dock.map((it, i) => [it, i] as const).filter(([it]) => it.kind === 'up' && !it.sold && r!.credits >= it.cost);
            if (ups.length) {
              ups.sort((a, b) => botRank(a[0].id) - botRank(b[0].id));
              this.action('buy', { i: String(ups[0][1]) });
              return 'buy';
            }
            click('[data-act="leave"]');
            return 'leave';
          }
          case 'end':
            return 'end';
        }
        return 'busy';
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
