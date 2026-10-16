import { GOOD_BOT, botInput, newBotMem, type BotMem } from './bot';
import { ACTS, BOSSES, BRICK_INFO, PADDLES, PADDLE_IDS, POWERS, UPGRADES, type BrickType } from './data';
import {
  BALL_R,
  DANGER_Y,
  DT,
  H,
  MAX_LIVES,
  PADDLE_H,
  PADDLE_Y,
  SHIELD_Y,
  W,
  newGame,
  step,
  type Brick,
  type Fx,
  type Game,
  type Input,
} from './game';
import { Rng, randomSeedText } from './rng';
import {
  LANES,
  LOCKED,
  NODE_INFO,
  ROWS,
  actMap,
  addUpgrade,
  buy,
  buyLife,
  canTake,
  choices,
  clearRun,
  enterNode,
  leaveNode,
  lifePrice,
  loadMeta,
  loadRun,
  loadout,
  lvlTag,
  newRun,
  nodeKind,
  saveMeta,
  saveRun,
  score,
  shardsFor,
  unlockCost,
  upText,
  wallLost,
  wallSeed,
  wallWon,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'wall' | 'reward' | 'shop' | 'rest' | 'treasure' | 'end';

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
}

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips waits, for bot tests. */
const FAST = PARAMS.has('fast');

const HP_COLORS = ['#f4a261', '#f4a261', '#e76f51', '#e63946', '#b5179e', '#7209b7', '#3a0ca3'];

const brickColor = (b: Brick): string => (b.type === 'normal' ? HP_COLORS[Math.min(b.max, HP_COLORS.length - 1)] : BRICK_INFO[b.type].color);

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;

  // Wall
  private g: Game | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private scale = 1;
  private cssScale = 1;
  private endT = -1;
  private parts: Part[] = [];
  private floats: Float[] = [];
  private rings: Ring[] = [];
  private zaps: { x: number; y: number; x2: number; y2: number; t: number }[] = [];
  private trails = new Map<number, { x: number; y: number }[]>();
  private shake = 0;
  private flash = 0;
  private banner: { text: string; t: number } | null = null;
  private soundBudget = 0;

  // Input
  private ptrX: number | null = null;
  private keys = { left: false, right: false };
  private launchReq = false;
  private drag: { id: number; startX: number; startPaddle: number; t: number; moved: number } | null = null;

  // Bot
  private bot = false;
  private botMem: BotMem = newBotMem();
  private botRng = new Rng(12345);

  private end: { victory: boolean; score: number; shards: number; act: number; walls: number; kills: number } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'wall' && this.g?.state === 'play' && !this.modal && !this.bot) {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
      }
    });
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- DOM rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'map':
        body = this.mapView();
        break;
      case 'wall':
        body = `<div class="play"><div class="cv-wrap"><canvas id="cv"></canvas></div><aside class="side" id="side">${this.sideView()}</aside></div><p class="mhint">Drag anywhere to move · tap to launch</p>`;
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'rest':
        body = this.restView();
        break;
      case 'treasure':
        body = this.treasureView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'wall') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.root.querySelector<HTMLElement>('main.s-wall')!.addEventListener('pointerdown', (e) => this.onDown(e));
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

  private save(): void {
    if (this.run) saveRun(this.run);
  }

  private modsHtml(): string {
    const r = this.run!;
    const ids = Object.keys(r.mods).filter((id) => r.mods[id] > 0);
    if (!ids.length) return '<span class="dim">No upgrades yet</span>';
    return ids
      .map((id) => {
        const u = UPGRADES[id];
        return `<span class="chip" title="${u.name}: ${u.text[r.mods[id] - 1]}">${u.icon}${r.mods[id] > 1 ? `<sup>${r.mods[id]}</sup>` : ''}</span>`;
      })
      .join('');
  }

  private topBar(): string {
    const r = this.run!;
    const act = ACTS[Math.min(r.act, ACTS.length - 1)];
    const inWall = this.screen === 'wall';
    const row = r.node >= 0 ? (actMap(r)[r.node]?.row ?? 0) + 1 : 0;
    return `<header class="top">
      ${inWall ? '' : `<span title="Lives">❤️ ${r.lives}</span><span title="Gold">💰 ${r.gold}</span>`}
      <span title="${act.name}">${act.icon} ${Math.min(r.act + 1, 3)}${row > 0 ? `-${row}` : ''}</span>
      <span class="mods">${this.modsHtml()}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const owned = (id: string): boolean => (UPGRADES[id]?.unlock ?? PADDLES[id]?.unlock ?? 0) === 0 || m.unlocked.includes(id);
    const paddles = PADDLE_IDS.filter(owned)
      .map((id) => {
        const p = PADDLES[id];
        return `<button class="pick pad ${m.paddle === id ? 'sel' : ''}" data-act="paddle" data-id="${id}"><span class="big">${p.icon}</span><b>${p.name}</b><small>${p.text}</small></button>`;
      })
      .join('');
    const shop = LOCKED.map((id) => {
      const item = UPGRADES[id] ?? PADDLES[id];
      const own = m.unlocked.includes(id);
      const cost = unlockCost(id);
      const kind = UPGRADES[id] ? (UPGRADES[id].kind === 'ball' ? 'Ball type' : 'Paddle part') : 'Paddle';
      const text = UPGRADES[id] ? UPGRADES[id].text[0] : PADDLES[id].text;
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${item.icon}</span><span><b>${item.name}</b><small>${kind}: ${text}</small></span>
        ${own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${id}" ${m.shards >= cost ? '' : 'disabled'}>💎 ${cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo" aria-hidden="true">${['#e63946', '#f4a261', '#e76f51', '#ffd166', '#4cc9f0']
        .map((c, i) => `<i style="background:${c};animation-delay:${i * 0.12}s"></i>`)
        .join('')}</div>
      <h1>Brick Rogue</h1>
      <p class="sub">Keep the ball alive. Break every wall. The bricks fight back. Clear 3 acts and their boss walls.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (act ${r.act + 1}, ❤️ ${r.lives}, 💰 ${r.gold})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Walls ${m.walls} · Best act ${m.bestAct} · Best score ${m.best}</p>
      <h2>Paddle</h2>
      <div class="picks">${paddles}</div>
      <h2>Workshop <small>💎 ${m.shards} shards</small></h2>
      <p class="sub">Each run gives shards. Unlock ball types, paddle parts and paddles for later runs.</p>
      <div class="armory">${shop}</div>
    </div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const act = ACTS[r.act];
    const nodes = actMap(r);
    const can = new Set(choices(r).map((n) => n.id));
    const pos = (lane: number, row: number): [number, number] => [((lane + 0.5) / LANES) * 100, 6 + (1 - row / (ROWS - 1)) * 88];
    let lines = '';
    for (const n of nodes) {
      const [x1, y1] = pos(n.lane, n.row);
      for (const id of n.next) {
        const m = nodes[id];
        const [x2, y2] = pos(m.lane, m.row);
        const on = r.path.includes(n.id) && (r.path.includes(id) || (n.id === r.at && can.has(id)));
        lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${on ? 'on' : ''}"/>`;
      }
    }
    const btns = nodes
      .map((n) => {
        const [x, y] = pos(n.lane, n.row);
        const info = NODE_INFO[n.kind];
        const cls = [`node`, `k-${n.kind}`, can.has(n.id) ? 'can' : '', r.path.includes(n.id) ? 'done' : '', n.id === r.at ? 'at' : ''].join(' ');
        const label = n.kind === 'boss' ? `${info.name}: ${BOSSES[r.act].name}. ${BOSSES[r.act].text}` : `${info.name}: ${info.text}`;
        return `<button class="${cls}" style="left:${x}%;top:${y}%" ${can.has(n.id) ? `data-act="node" data-id="${n.id}"` : 'disabled'} title="${label}" aria-label="${label}">${n.kind === 'boss' ? BOSSES[r.act].icon : info.icon}</button>`;
      })
      .join('');
    const legend = (['wall', 'elite', 'shop', 'rest', 'treasure', 'boss'] as const).map((k) => `<span>${NODE_INFO[k].icon} ${NODE_INFO[k].name}</span>`).join('');
    return `<div class="map">
      <h2>${act.icon} Act ${r.act + 1}: ${act.name}</h2>
      <p class="sub">Pick a glowing node. The path only goes up.</p>
      <div class="mapbox"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>${btns}</div>
      <div class="legend">${legend}</div>
      <div class="loadout"><span>${PADDLES[r.paddle].icon} ${PADDLES[r.paddle].name} paddle</span> ${this.modsHtml()}</div>
    </div>`;
  }

  private sideView(): string {
    const g = this.g;
    const r = this.run;
    if (!g || !r) return '';
    const kind = g.kind === 'boss' ? `${BOSSES[g.act].icon} ${BOSSES[g.act].name}` : g.kind === 'elite' ? `💀 Elite: ${g.template}` : `🧱 ${g.template}`;
    const mods = Object.keys(r.mods)
      .filter((id) => r.mods[id] > 0)
      .map((id) => `<li>${UPGRADES[id].icon} <b>${UPGRADES[id].name}${lvlTag(r.mods[id])}</b> <small>${UPGRADES[id].text[r.mods[id] - 1]}</small></li>`)
      .join('');
    const types = new Set(g.bricks.map((b) => b.type));
    const legend = [...types]
      .filter((t) => t !== 'normal')
      .map((t) => `<li><i style="background:${BRICK_INFO[t].color}"></i><b>${BRICK_INFO[t].name}</b> <small>${BRICK_INFO[t].text}</small></li>`)
      .join('');
    return `<h3>${kind}</h3>
      ${g.kind === 'boss' ? `<p class="hint">${BOSSES[g.act].text}</p>` : '<p class="hint">Bricks creep down after 35 s. If one reaches the red line, you lose a life.</p>'}
      ${legend ? `<ul class="list">${legend}</ul>` : ''}
      <h3>Upgrades</h3>
      ${mods ? `<ul class="list">${mods}</ul>` : '<p class="hint">None yet. Clear walls to get some.</p>'}
      <p class="hint">Mouse or drag moves the paddle. Click, tap or Space launches. ← → also move. Esc pauses.</p>`;
  }

  private upCard(id: string, act: string, extra = '', disabled = false): string {
    const u = UPGRADES[id];
    const lvl = this.run!.mods[id] ?? 0;
    return `<button class="pick" data-act="${act}" data-id="${id}" ${disabled ? 'disabled' : ''}><span class="big">${u.icon}</span><b>${u.name}${lvlTag(lvl + 1)}</b><small class="kind">${u.kind === 'ball' ? 'Ball type' : 'Paddle part'}</small><small>${upText(this.run!, id)}</small>${extra}</button>`;
  }

  private rewardView(): string {
    const r = this.run!;
    const rw = r.reward!;
    const title = rw.kind === 'boss' ? '👑 Boss wall broken!' : rw.kind === 'elite' ? '💀 Elite wall cleared!' : '🧱 Wall cleared!';
    const cards = rw.offers.map((id) => this.upCard(id, 'reward')).join('');
    return `<div class="reward">
      <h2>${title}</h2>
      <p>💰 +${rw.gold} from bricks · +${rw.bonus} bonus${rw.life ? ' · ❤️ +1 life' : ''}</p>
      <h3>Pick an upgrade</h3>
      <div class="picks">${cards || '<p class="dim">You have every upgrade at max level.</p>'}</div>
      <button data-act="reward-skip">Skip (+15 gold)</button>
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const s = r.shop!;
    const items = s.items
      .map((it, i) => {
        const can = !it.sold && r.gold >= it.cost && canTake(r, it.id);
        const u = UPGRADES[it.id];
        const lvl = r.mods[it.id] ?? 0;
        return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${can ? '' : 'disabled'}><span class="big">${u.icon}</span><b>${u.name}${lvlTag(lvl + (it.sold ? 0 : 1))}</b><small class="kind">${u.kind === 'ball' ? 'Ball type' : 'Paddle part'}</small><small>${it.sold ? 'Sold' : upText(r, it.id)}</small><span class="cost">${it.sold ? '✔' : `💰 ${it.cost}`}</span></button>`;
      })
      .join('');
    const lp = lifePrice(r);
    const life = `<button class="pick" data-act="buy-life" ${r.gold >= lp && r.lives < MAX_LIVES ? '' : 'disabled'}><span class="big">❤️</span><b>Extra life</b><small>+1 life (max ${MAX_LIVES}).</small><span class="cost">💰 ${lp}</span></button>`;
    return `<div class="shopv">
      <h2>🛒 Shop</h2>
      <p>You have 💰 <b>${r.gold}</b> and ❤️ <b>${r.lives}</b>.</p>
      <div class="picks">${items}${life}</div>
      <button class="primary" data-act="leave">Leave the shop ▶</button>
    </div>`;
  }

  private restView(): string {
    const r = this.run!;
    const tune = Object.keys(r.mods)
      .filter((id) => r.mods[id] > 0 && canTake(r, id))
      .map((id) => this.upCard(id, 'tune'))
      .join('');
    return `<div class="restv">
      <h2>🔧 Workshop</h2>
      <p>Choose one: repair the paddle or tune an upgrade you own.</p>
      <div class="picks">
        <button class="pick" data-act="repair" ${r.lives < MAX_LIVES ? '' : 'disabled'}><span class="big">❤️</span><b>Repair</b><small>+1 life (now ${r.lives}, max ${MAX_LIVES}).</small></button>
        ${tune}
      </div>
      <button data-act="leave">Leave</button>
    </div>`;
  }

  private treasureView(): string {
    const r = this.run!;
    const id = r.treasure;
    const u = id ? UPGRADES[id] : null;
    return `<div class="treasure">
      <h2>🎁 Treasure</h2>
      ${u ? `<div class="pick big-card"><span class="huge">${u.icon}</span><b>${u.name}${lvlTag(r.mods[id!] ?? 1)}</b><small>${u.text[(r.mods[id!] ?? 1) - 1]}</small></div>` : '<p>The chest holds no upgrade you can use.</p>'}
      <p>💰 +20 gold</p>
      <button class="primary" data-act="leave">Continue ▶</button>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Victory!' : '💥 Game over'}</h1>
      <p>${e.victory ? 'The Brick Hydra crumbles. Every wall is down.' : `Your last ball fell in act ${e.act + 1}.`}</p>
      <p>Walls cleared: <b>${e.walls}</b> · Bricks broken: <b>${e.kills}</b></p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>💎 +${e.shards} shards for the Workshop</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const bricks = (Object.keys(BRICK_INFO) as BrickType[])
        .map((t) => `<li><i class="sw" style="background:${t === 'normal' ? HP_COLORS[2] : BRICK_INFO[t].color}"></i><b>${BRICK_INFO[t].name}</b>: ${BRICK_INFO[t].text}</li>`)
        .join('');
      const powers = Object.values(POWERS)
        .map((p) => `<li><i class="sw round" style="background:${p.color}"></i><b>${p.name}</b>: ${p.text}</li>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Move the paddle</b> with the mouse, or drag anywhere on the board with a finger (the paddle follows 1:1). Keys: ← → or A D.</li>
          <li><b>Launch</b> the ball with a click, a tap or Space. It also launches by itself after 3 s.</li>
          <li>Where the ball hits the paddle sets the bounce angle. Hit it with the edge to send it sideways.</li>
          <li>Break every brick to clear the wall. In a boss wall, break the boss.</li>
          <li>If the last ball falls, you lose a life. When the lives run out, the run ends.</li>
          <li>After 35 s the bricks creep down. A brick that reaches the red line breaks and costs a life.</li>
          <li>Between walls, choose your path on the map: walls, elite walls, shops, workshops and treasure. Each act ends with a boss wall.</li>
        </ul>
        <h3>Bricks</h3><ul class="list">${bricks}</ul>
        <h3>Power-ups (catch them with the paddle)</h3><ul class="list">${powers}</ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>${this.screen === 'wall' ? 'Paused' : 'Menu'}</h2>
      <button class="primary" data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run${this.screen === 'wall' ? ', the wall starts again' : ''})</button>
    </div></div>`;
  }

  // ---------- Canvas ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const maxW = wrap.clientWidth;
    const top = this.root.querySelector<HTMLElement>('header.top')?.offsetHeight ?? 44;
    const maxH = window.innerHeight - top - 14;
    const w = Math.max(200, Math.min(maxW, (maxH * W) / H, 620));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${w}px`;
    cv.style.height = `${(w * H) / W}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(((w * H) / W) * dpr);
    this.scale = (w / W) * dpr;
    this.cssScale = w / W;
  }

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (t: number) => {
      if (this.screen !== 'wall' || !this.ctx) {
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

  private input(): Input {
    const g = this.g!;
    if (this.bot) return botInput(g, this.botMem, GOOD_BOT, this.botRng);
    const dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    const inp: Input = { x: dir !== 0 ? null : this.ptrX, dir, launch: this.launchReq };
    return inp;
  }

  /** Advance the wall by `n` fixed steps. */
  private simulate(n: number): void {
    const g = this.g;
    if (!g) return;
    for (let i = 0; i < n && g.state === 'play'; i++) {
      const inp = this.input();
      step(g, inp);
      if (inp.launch) this.launchReq = false;
      this.handleFx(g.fx);
      g.fx.length = 0;
    }
  }

  private update(dt: number): void {
    const g = this.g;
    if (!g) return;
    this.soundBudget = 4;
    const paused = !!this.modal;
    if (!paused) {
      if (g.state === 'play') {
        this.acc += dt;
        const n = Math.floor(this.acc / DT);
        this.acc -= n * DT;
        this.simulate(Math.min(n, 24));
      } else if (this.endT >= 0) {
        this.endT -= dt;
        if (this.endT < 0) this.finishWall();
      }
    }
    // Effects.
    const fdt = paused ? 0 : dt;
    for (const p of this.parts) {
      p.t += fdt;
      p.x += p.vx * fdt;
      p.y += p.vy * fdt;
      p.vy += 500 * fdt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const f of this.floats) {
      f.t += fdt;
      f.y -= 30 * fdt;
    }
    this.floats = this.floats.filter((f) => f.t < 0.9);
    for (const r of this.rings) r.t += fdt;
    this.rings = this.rings.filter((r) => r.t < 0.4);
    for (const z of this.zaps) z.t += fdt;
    this.zaps = this.zaps.filter((z) => z.t < 0.2);
    this.shake = Math.max(0, this.shake - fdt * 30);
    this.flash = Math.max(0, this.flash - fdt * 2);
    if (this.banner) {
      this.banner.t += fdt;
      if (this.banner.t > 1.6) this.banner = null;
    }
    // Ball trails.
    const seen = new Set<number>();
    for (const b of g.balls) {
      seen.add(b.id);
      const tr = this.trails.get(b.id) ?? [];
      tr.push({ x: b.x, y: b.y });
      if (tr.length > 7) tr.shift();
      this.trails.set(b.id, tr);
    }
    for (const id of [...this.trails.keys()]) if (!seen.has(id)) this.trails.delete(id);
  }

  private snd(fn: () => void): void {
    if (FAST || this.soundBudget <= 0) return;
    this.soundBudget--;
    fn();
  }

  private burst(x: number, y: number, color: string, n: number, speed = 140): void {
    if (FAST) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, t: 0, life: 0.35 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }

  private handleFx(list: Fx[]): void {
    const g = this.g!;
    for (const f of list) {
      switch (f.k) {
        case 'hit':
          if (f.c === 'fire') this.burst(f.x, f.y, '#ff9f1c', 4, 90);
          else {
            this.burst(f.x, f.y, '#fff', 2, 80);
            this.snd(() => sfx.hit(2));
          }
          break;
        case 'boss':
          this.burst(f.x, f.y + 20, BOSSES[g.act].color, 4);
          this.shake = Math.max(this.shake, 2);
          this.snd(() => sfx.boss());
          break;
        case 'kill': {
          const color = f.c === 'normal' ? '#f4a261' : BRICK_INFO[(f.c ?? 'normal') as BrickType].color;
          this.burst(f.x, f.y, color, 10);
          this.snd(() => sfx.kill(g.kills % 24));
          break;
        }
        case 'gold':
          this.floats.push({ x: f.x, y: f.y, text: `+${f.n} 💰`, color: '#ffd166', t: 0 });
          this.snd(() => sfx.coin());
          break;
        case 'boom':
          this.rings.push({ x: f.x, y: f.y, r: f.n ?? 50, color: '#ff9f1c', t: 0 });
          this.burst(f.x, f.y, '#ff6b35', 14, 200);
          this.shake = Math.max(this.shake, 6);
          this.snd(() => sfx.boom());
          break;
        case 'paddle':
          this.burst(f.x, f.y, '#fff', 3, 70);
          this.snd(() => sfx.paddle());
          break;
        case 'wall':
          this.snd(() => sfx.wall());
          break;
        case 'power': {
          const p = POWERS[f.text as keyof typeof POWERS];
          if (p) {
            this.floats.push({ x: f.x, y: f.y - 14, text: p.name, color: p.color, t: 0 });
            this.rings.push({ x: f.x, y: f.y, r: 40, color: p.color, t: 0 });
          }
          this.snd(() => (f.text === 'coin' ? sfx.coin() : sfx.power()));
          break;
        }
        case 'lost':
          this.shake = 10;
          this.flash = 1;
          this.banner = { text: g.lives > 0 ? `Ball lost! ❤️ ${g.lives}` : 'Out of lives', t: 0 };
          this.snd(() => sfx.lost());
          break;
        case 'breach':
          this.shake = 12;
          this.banner = { text: 'Bricks broke through!', t: 0 };
          this.snd(() => sfx.breach());
          break;
        case 'stun':
          this.burst(f.x, f.y, '#c77dff', 10, 120);
          this.floats.push({ x: f.x, y: f.y - 16, text: 'Stunned!', color: '#c77dff', t: 0 });
          this.snd(() => sfx.stun());
          break;
        case 'zap':
          this.zaps.push({ x: f.x, y: f.y, x2: f.x2 ?? f.x, y2: f.y2 ?? f.y, t: 0 });
          this.snd(() => sfx.zap());
          break;
        case 'laser':
          this.snd(() => sfx.laser());
          break;
        case 'shoot':
          this.snd(() => sfx.shoot());
          break;
        case 'shield':
          this.rings.push({ x: f.x, y: f.y, r: 30, color: '#4cc9f0', t: 0 });
          this.snd(() => sfx.shield());
          break;
        case 'split':
          this.snd(() => sfx.split());
          break;
        case 'clear':
          this.banner = { text: g.kind === 'boss' ? 'BOSS DOWN!' : 'WALL CLEAR!', t: 0 };
          this.snd(() => sfx.clear());
          break;
      }
    }
    if (g.state !== 'play' && this.endT < 0) {
      this.endT = FAST ? 0 : g.state === 'won' ? 1.3 : 1.6;
      if (g.state === 'lost') this.banner = { text: 'Out of lives', t: 0 };
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    const g = this.g;
    if (!ctx || !g) return;
    const act = ACTS[g.act];
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.translate(sx, sy);
    // Background.
    ctx.fillStyle = act.bg;
    ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // Danger line.
    if (g.kind !== 'boss') {
      ctx.strokeStyle = 'rgba(239,71,111,0.45)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, DANGER_Y);
      ctx.lineTo(W, DANGER_Y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Shield.
    if (g.shield > 0) {
      ctx.strokeStyle = '#4cc9f0';
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(g.time * 6);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, SHIELD_Y);
      ctx.lineTo(W, SHIELD_Y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }
    // Bricks.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of g.bricks) this.drawBrick(ctx, g, b);
    // Lasers and bullets.
    ctx.fillStyle = '#ff4d6d';
    for (const l of g.lasers) ctx.fillRect(l.x - 1.5, l.y - 8, 3, 12);
    for (const bu of g.bullets) {
      ctx.fillStyle = '#c77dff';
      ctx.beginPath();
      ctx.arc(bu.x, bu.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(bu.x, bu.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Drops.
    ctx.font = 'bold 10px system-ui, sans-serif';
    for (const d of g.drops) {
      const p = POWERS[d.kind];
      ctx.fillStyle = p.color;
      this.rr(ctx, d.x - 13, d.y - 7, 26, 14, 7);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillText(p.icon, d.x, d.y + 0.5);
    }
    // Paddle.
    const p = g.paddle;
    const pc = PADDLES[this.run?.paddle ?? 'classic'].color;
    ctx.save();
    if (p.stun > 0) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(g.time * 40);
    const grad = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_H);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.3, p.stun > 0 ? '#888' : p.sticky > 0 ? '#ffb703' : pc);
    grad.addColorStop(1, '#3d1f14');
    ctx.fillStyle = grad;
    this.rr(ctx, p.x - p.w / 2, PADDLE_Y, p.w, PADDLE_H, 5);
    ctx.fill();
    if (p.laserT > 0 || (g.mods.cannon ?? 0) > 0) {
      ctx.fillStyle = '#ff4d6d';
      if (p.laserT > 0) {
        ctx.fillRect(p.x - p.w / 2 + 2, PADDLE_Y - 4, 4, 5);
        ctx.fillRect(p.x + p.w / 2 - 6, PADDLE_Y - 4, 4, 5);
      }
      if ((g.mods.cannon ?? 0) > 0) ctx.fillRect(p.x - 2, PADDLE_Y - 5, 4, 6);
    }
    if ((g.mods.magnet ?? 0) > 0) {
      ctx.strokeStyle = 'rgba(76,201,240,0.35)';
      ctx.beginPath();
      ctx.arc(p.x, PADDLE_Y + 30, p.w / 2 + 10, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
    }
    ctx.restore();
    // Balls.
    const fire = (g.mods.fire ?? 0) > 0;
    const ballColor = fire ? '#ffb703' : (g.mods.pierce ?? 0) > 0 ? '#bde0fe' : '#ffffff';
    for (const b of g.balls) {
      const tr = this.trails.get(b.id);
      if (tr && !b.stuck) {
        tr.forEach((q, i) => {
          ctx.globalAlpha = (i / tr.length) * 0.35;
          ctx.fillStyle = fire ? '#ff6b35' : '#9ad1ff';
          ctx.beginPath();
          ctx.arc(q.x, q.y, BALL_R * (0.5 + i / tr.length / 2), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
      ctx.shadowColor = fire ? '#ff6b35' : '#9ad1ff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = ballColor;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // Effects.
    for (const r of this.rings) {
      ctx.globalAlpha = 1 - r.t / 0.4;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.3 + r.t / 0.4), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    for (const z of this.zaps) {
      ctx.globalAlpha = 1 - z.t / 0.2;
      ctx.strokeStyle = '#a0e7ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(z.x, z.y);
      const mx = (z.x + z.x2) / 2 + (Math.random() - 0.5) * 20;
      const my = (z.y + z.y2) / 2 + (Math.random() - 0.5) * 20;
      ctx.lineTo(mx, my);
      ctx.lineTo(z.x2, z.y2);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    for (const q of this.parts) {
      ctx.globalAlpha = 1 - q.t / q.life;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 12px system-ui, sans-serif';
    for (const f of this.floats) {
      ctx.globalAlpha = 1 - f.t / 0.9;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(239,71,111,${this.flash * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }
    this.drawHud(ctx, g);
  }

  private drawBrick(ctx: CanvasRenderingContext2D, g: Game, b: Brick): void {
    if (b.type === 'boss') {
      const def = BOSSES[g.act];
      ctx.fillStyle = def.color;
      this.rr(ctx, b.x, b.y, b.w, b.h, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(b.x + (b.w / 4) * i, b.y + 3);
        ctx.lineTo(b.x + (b.w / 4) * i, b.y + b.h - 3);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.font = '26px system-ui, sans-serif';
      ctx.fillText(def.icon, b.x + b.w / 2, b.y + b.h / 2 + 1);
      if (b.hitT > 0) {
        ctx.fillStyle = `rgba(255,255,255,${b.hitT * 3})`;
        this.rr(ctx, b.x, b.y, b.w, b.h, 8);
        ctx.fill();
      }
      return;
    }
    const c = brickColor(b);
    ctx.fillStyle = c;
    this.rr(ctx, b.x, b.y, b.w, b.h, 3);
    ctx.fill();
    // Bevel.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(b.x + 2, b.y + 1.5, b.w - 4, 2.5);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 2, b.y + b.h - 3, b.w - 4, 2);
    ctx.font = 'bold 9px system-ui, sans-serif';
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2 + 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    switch (b.type) {
      case 'armor':
        ctx.fillStyle = '#2b2d42';
        for (const dx of [4, b.w - 4]) {
          ctx.beginPath();
          ctx.arc(b.x + dx, cy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillText(String(b.hp), cx, cy);
        break;
      case 'bomb':
        ctx.fillStyle = '#fff';
        ctx.fillText('✸', cx, cy);
        break;
      case 'shooter':
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy - 3);
        ctx.lineTo(cx + 5, cy - 3);
        ctx.lineTo(cx, cy + 4);
        ctx.closePath();
        ctx.fill();
        if (b.t < 0.5) {
          ctx.fillStyle = `rgba(255,255,255,${0.6 - b.t})`;
          this.rr(ctx, b.x, b.y, b.w, b.h, 3);
          ctx.fill();
        }
        break;
      case 'regen':
        ctx.fillText(`+${b.hp}`, cx, cy);
        break;
      case 'gold':
        ctx.fillText('$', cx, cy);
        break;
      case 'mover':
        ctx.fillText(b.max > 1 ? `‹${b.hp}›` : '‹›', cx, cy);
        break;
      default:
        if (b.max > 1) ctx.fillText(String(b.hp), cx, cy);
    }
    if (b.hp < b.max && b.type !== 'regen') {
      // Damage darkens the brick.
      ctx.fillStyle = `rgba(0,0,0,${0.3 * (1 - b.hp / b.max)})`;
      this.rr(ctx, b.x, b.y, b.w, b.h, 3);
      ctx.fill();
    }
    if (b.hitT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${b.hitT * 4})`;
      this.rr(ctx, b.x, b.y, b.w, b.h, 3);
      ctx.fill();
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, g: Game): void {
    ctx.textBaseline = 'middle';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${'❤️'.repeat(Math.min(g.lives, MAX_LIVES))}`, 6, 13);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`💰 ${(this.run?.gold ?? 0) + g.gold}`, W - 6, 13);
    ctx.textAlign = 'center';
    const pw: string[] = [];
    const p = g.paddle;
    if (p.wideT > 0) pw.push(`↔${Math.ceil(p.wideT)}`);
    if (p.laserT > 0) pw.push(`⚡${Math.ceil(p.laserT)}`);
    if (g.slowT > 0) pw.push(`🐢${Math.ceil(g.slowT)}`);
    if (p.sticky > 0) pw.push(`🍯${p.sticky}`);
    if (g.shield > 0) pw.push(`🛡️${g.shield}`);
    ctx.fillStyle = '#ddd';
    ctx.font = '11px system-ui, sans-serif';
    if (g.boss && !g.boss.dead) {
      const def = BOSSES[g.act];
      const bw = 150;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      this.rr(ctx, W / 2 - bw / 2, 6, bw, 14, 7);
      ctx.fill();
      ctx.fillStyle = def.color;
      this.rr(ctx, W / 2 - bw / 2, 6, (bw * Math.max(0, g.boss.hp)) / g.boss.max, 14, 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(`${def.name} ${Math.ceil(g.boss.hp)}`, W / 2, 13.5);
      if (pw.length) ctx.fillText(pw.join('  '), W / 2, 32);
    } else {
      ctx.fillText(`${g.bricks.length} bricks${pw.length ? '   ' + pw.join('  ') : ''}`, W / 2, 13);
    }
    if (g.balls.some((b) => b.stuck) && g.state === 'play') {
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillStyle = `rgba(255,255,255,${0.6 + 0.4 * Math.sin(g.time * 6)})`;
      ctx.fillText('Click, tap or Space to launch', W / 2, PADDLE_Y - 60);
    }
    if (this.banner) {
      const t = this.banner.t;
      ctx.globalAlpha = Math.min(1, (1.6 - t) * 3);
      ctx.font = `900 ${28 + Math.max(0, 0.15 - t) * 60}px system-ui, sans-serif`;
      ctx.fillStyle = '#000';
      ctx.fillText(this.banner.text, W / 2 + 2, H / 2 + 42);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(this.banner.text, W / 2, H / 2 + 40);
      ctx.globalAlpha = 1;
    }
  }

  private rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
  }

  // ---------- Flow ----------

  private go(screen: Screen): void {
    this.screen = screen;
    this.modal = null;
    if (screen !== 'end') this.save();
    this.render();
  }

  private beginWall(): void {
    const r = this.run!;
    const kind = nodeKind(r);
    const wk = kind === 'elite' ? 'elite' : kind === 'boss' ? 'boss' : 'wall';
    this.g = newGame(wallSeed(r), r.act, wk, loadout(r));
    this.parts = [];
    this.floats = [];
    this.rings = [];
    this.zaps = [];
    this.trails.clear();
    this.endT = -1;
    this.acc = 0;
    this.launchReq = false;
    this.botMem = newBotMem();
    this.banner = { text: wk === 'boss' ? BOSSES[r.act].name : wk === 'elite' ? 'Elite wall' : this.g.template, t: 0 };
    r.screen = 'wall';
    this.go('wall');
  }

  private finishWall(): void {
    const g = this.g;
    const r = this.run;
    if (!g || !r || this.screen !== 'wall') return;
    this.endT = -1;
    if (g.state === 'won') {
      wallWon(r, g);
      this.g = null;
      this.go('reward');
    } else if (g.state === 'lost') {
      wallLost(r, g);
      this.g = null;
      this.endRun(false);
    }
  }

  private afterNode(): void {
    const r = this.run!;
    const boss = nodeKind(r) === 'boss';
    if (leaveNode(r)) {
      this.endRun(true);
      return;
    }
    if (boss) this.toast(`${ACTS[r.act].icon} Act ${r.act + 1}: ${ACTS[r.act].name}`);
    this.go('map');
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const sc = score(r, victory);
    const shards = shardsFor(sc);
    const m = this.meta;
    m.runs++;
    if (victory) m.wins++;
    m.walls += r.walls;
    m.bestAct = Math.max(m.bestAct, victory ? 3 : r.act + 1);
    m.best = Math.max(m.best, sc);
    m.shards += shards;
    saveMeta(m);
    this.end = { victory, score: sc, shards, act: r.act, walls: r.walls, kills: r.kills };
    this.run = null;
    clearRun();
    if (victory) sfx.win();
    else sfx.lose();
    this.go('end');
  }

  // ---------- Input ----------

  private toBoardX(clientX: number): number {
    const rect = this.canvas!.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }

  private onDown(e: PointerEvent): void {
    if (this.screen !== 'wall' || !this.g || this.modal) return;
    initAudio();
    if ((e.target as HTMLElement).closest('.side')) return;
    if (e.pointerType === 'mouse') {
      this.ptrX = this.toBoardX(e.clientX);
      this.launchReq = true;
      return;
    }
    e.preventDefault();
    this.drag = { id: e.pointerId, startX: e.clientX, startPaddle: this.g.paddle.x, t: performance.now(), moved: 0 };
    this.ptrX = this.g.paddle.x;
  }

  private onMove(e: PointerEvent): void {
    if (this.screen !== 'wall' || !this.canvas || !this.g) return;
    if (e.pointerType === 'mouse') {
      const rect = this.canvas.getBoundingClientRect();
      if (e.clientY < rect.top - 40 || e.clientY > rect.bottom + 80) return;
      this.ptrX = this.toBoardX(e.clientX);
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    d.moved = Math.max(d.moved, Math.abs(dx));
    this.ptrX = d.startPaddle + dx / this.cssScale;
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    if (d.moved < 10 && performance.now() - d.t < 350) this.launchReq = true;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.keys.left = down;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.keys.right = down;
    if (!down) return;
    if (this.screen === 'wall' && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'd' || k === 'A' || k === 'D')) {
      this.ptrX = null;
      e.preventDefault();
    }
    if (k === 'Escape' || k === 'p' || k === 'P') {
      if (this.modal) this.modal = null;
      else if (this.run && this.screen !== 'title' && this.screen !== 'end') this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if ((k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') && this.screen === 'wall' && !this.modal) {
      initAudio();
      this.launchReq = true;
      e.preventDefault();
    }
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
        this.render();
        return;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        return;
      case 'abandon-yes':
        if (r) {
          if (this.g && this.screen === 'wall') wallLost(r, this.g);
          this.g = null;
          this.endRun(false);
        }
        return;
      case 'title':
        this.g = null;
        this.modal = null;
        this.go('title');
        return;
      case 'new':
        this.run = newRun(randomSeedText(), this.meta);
        this.end = null;
        sfx.click();
        this.go('map');
        return;
      case 'continue':
        if (!r) return;
        if (r.screen === 'wall') this.beginWall();
        else this.go(r.screen);
        return;
      case 'paddle':
        this.meta.paddle = d.id!;
        saveMeta(this.meta);
        sfx.click();
        this.render();
        return;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.shards < cost || this.meta.unlocked.includes(id)) return;
        this.meta.shards -= cost;
        this.meta.unlocked.push(id);
        saveMeta(this.meta);
        sfx.buy();
        this.toast(`Unlocked ${(UPGRADES[id] ?? PADDLES[id]).name}`);
        this.render();
        return;
      }
      case 'node': {
        if (!r) return;
        const id = Number(d.id);
        if (!choices(r).some((n) => n.id === id)) return;
        sfx.click();
        const kind = enterNode(r, id);
        if (kind === 'wall' || kind === 'elite' || kind === 'boss') this.beginWall();
        else {
          if (kind === 'treasure') sfx.power();
          this.go(r.screen);
        }
        return;
      }
      case 'reward': {
        if (!r?.reward || r.reward.picked) return;
        r.reward.picked = true;
        addUpgrade(r, d.id!);
        sfx.buy();
        this.toast(`${UPGRADES[d.id!].icon} ${UPGRADES[d.id!].name}${lvlTag(r.mods[d.id!])}`);
        this.afterNode();
        return;
      }
      case 'reward-skip':
        if (!r?.reward) return;
        r.gold += 15;
        this.afterNode();
        return;
      case 'buy':
        if (r && buy(r, Number(d.i))) {
          sfx.buy();
          this.go('shop');
        } else sfx.deny();
        return;
      case 'buy-life':
        if (r && buyLife(r)) {
          sfx.buy();
          this.go('shop');
        } else sfx.deny();
        return;
      case 'repair':
        if (!r || r.lives >= MAX_LIVES) return;
        r.lives++;
        sfx.power();
        this.afterNode();
        return;
      case 'tune':
        if (!r || !canTake(r, d.id!)) return;
        addUpgrade(r, d.id!);
        sfx.buy();
        this.toast(`${UPGRADES[d.id!].icon} ${UPGRADES[d.id!].name}${lvlTag(r.mods[d.id!])}`);
        this.afterNode();
        return;
      case 'leave':
        sfx.click();
        this.afterNode();
        return;
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const PRIO = ['split', 'shield', 'fire', 'pierce', 'wings', 'magnet', 'cannon', 'heavy', 'chain', 'charm'];
    const rank = (id: string): number => {
      const i = PRIO.indexOf(id);
      return i < 0 ? 99 : i;
    };
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLElement>(sel);
      el?.click();
      return !!el;
    };
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        act: this.run?.act ?? null,
        node: this.run?.node ?? null,
        lives: this.g ? this.g.lives : (this.run?.lives ?? null),
        gold: this.run?.gold ?? null,
        mods: this.run ? { ...this.run.mods } : null,
        wall: this.g ? { paddle: Math.round(this.g.paddle.x), kind: this.g.kind, template: this.g.template, bricks: this.g.bricks.length, balls: this.g.balls.length, time: Math.round(this.g.time), state: this.g.state, boss: this.g.boss ? Math.ceil(this.g.boss.hp) : null } : null,
        end: this.end,
      }),
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.render();
      },
      shards: (n: number) => {
        this.meta.shards += n;
        saveMeta(this.meta);
        this.render();
      },
      clear: () => {
        if (!this.g) return;
        for (const b of this.g.bricks) b.dead = true;
        if (this.g.boss) this.g.boss.dead = true;
      },
      bot: (on = true) => {
        this.bot = on;
      },
      /** One bot action. In a wall it plays 5 s of game time with the paddle bot. */
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
            const ch = choices(r!);
            const score = (k: string): number => {
              if (k === 'rest') return r!.lives <= 2 ? 10 : 2;
              if (k === 'shop') return r!.gold >= 80 ? 8 : 1;
              if (k === 'treasure') return 7;
              if (k === 'elite') return r!.lives >= 4 ? 6 : 1;
              return 5;
            };
            const best = [...ch].sort((a, b) => score(b.kind) - score(a.kind))[0];
            click(`[data-act="node"][data-id="${best.id}"]`);
            return 'node';
          }
          case 'wall': {
            const g = this.g;
            if (!g) return 'busy';
            this.bot = true;
            if (g.state !== 'play') {
              if (FAST || this.endT < 0) this.finishWall();
              return 'busy';
            }
            this.simulate(600);
            if (g.state !== 'play') {
              if (FAST) this.finishWall();
              return 'wall-end';
            }
            return 'play';
          }
          case 'reward': {
            const ids = r!.reward!.offers;
            if (!ids.length) click('[data-act="reward-skip"]');
            else {
              const id = [...ids].sort((a, b) => rank(a) - rank(b))[0];
              click(`[data-act="reward"][data-id="${id}"]`);
            }
            return 'reward';
          }
          case 'shop': {
            if (r!.lives <= 3 && click('[data-act="buy-life"]:not([disabled])')) return 'buy';
            const btns = [...this.root.querySelectorAll<HTMLButtonElement>('[data-act="buy"]:not([disabled])')];
            if (btns.length) {
              btns.sort((a, b) => rank(r!.shop!.items[Number(a.dataset.i)].id) - rank(r!.shop!.items[Number(b.dataset.i)].id))[0].click();
              return 'buy';
            }
            click('[data-act="leave"]');
            return 'leave';
          }
          case 'rest':
            if (r!.lives <= 3 && click('[data-act="repair"]:not([disabled])')) return 'repair';
            if (!click('[data-act="tune"]')) if (!click('[data-act="repair"]:not([disabled])')) click('[data-act="leave"]');
            return 'rest';
          case 'treasure':
            click('[data-act="leave"]');
            return 'treasure';
          case 'end':
            return 'end';
        }
        return 'busy';
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
