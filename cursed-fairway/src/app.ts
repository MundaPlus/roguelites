import { GOOD, pickNode, pickReward, plan, shopBot } from './bot';
import { ACES, BOSSES, CHARMS, CLUBS, CURSES, MAX_CLUB_LVL, ZONES } from './data';
import { arcSecs, built, canMulligan, clubAim, courseOf, makeShot, sandPenalty, type Aim, type HoleState } from './golf';
import { DT, PICK_R, R, blockPos, flightAce, stepShot, trace, type Course, type Env, type Shot, type Surface } from './physics';
import { Rng, randomSeedText } from './rng';
import {
  BOSS_AT,
  HOLES,
  LOCKED,
  NODE_INFO,
  ZONE_START,
  afterShot,
  buy,
  canBuy,
  chooseNode,
  clearRun,
  finishHole,
  handMax,
  kit,
  leaveReward,
  leaveShop,
  loadMeta,
  loadRun,
  newRun,
  nodesFor,
  ownedClubs,
  playNowAce,
  saveMeta,
  saveRun,
  score,
  shoot,
  startHole,
  takeReward,
  toggleArm,
  tokensFor,
  unlockCost,
  upgradableClubs,
  useAce,
  zoneName,
  zoneOf,
  type NodeKind,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'hole' | 'reward' | 'shop' | 'end';
type Phase = 'preview' | 'aim' | 'flight' | 'over';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'club'; item: number };

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
  r: number;
}

const QS = new URLSearchParams(location.search);
/** `?debug&fast` skips waits and plays shots at once, for bot tests. */
const FAST = QS.has('fast');

const SURF_COLOR: Record<Surface, string> = {
  grass: '#55b832',
  green: '#86e36a',
  sand: '#e8c872',
  ice: '#bfe9ff',
  water: '#3a8fd9',
  spikes: '#c9ced6',
  rock: '#8a8f9c',
};

const stars = (n: number): string => '★'.repeat(Math.max(0, n - 1));

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private end: { victory: boolean; score: number; tokens: number; holes: number; stats: RunState['stats'] } | null = null;

  // Hole
  private phase: Phase = 'aim';
  private club = 'driver';
  private aim: Aim = { a: 0.6, p: 0.6 };
  private shot: Shot | null = null;
  private env: Env | null = null;
  private arc: { x: number; y: number }[] = [];
  private arcKey = '';
  private drag: { x: number; y: number; id: number } | null = null;
  private acc = 0;
  private fast = false;
  private overview = false;
  private previewT = 0;
  private cam = { x: 0, y: 0, z: 1 };
  private floats: Float[] = [];
  private parts: Part[] = [];
  private queue: { at: number; fn: () => void }[] = [];
  private clock = 0;
  private anim = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private cw = 300;
  private ch = 300;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private botRng = new Rng(Date.now() & 0xffff);

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => (this.drag = null));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    if (QS.has('debug')) this.installDebug();
    this.render();
  }

  private get hs(): HoleState {
    return this.run!.hole!;
  }

  private get course(): Course {
    return courseOf(this.hs);
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
      case 'hole':
        body = `<div class="play"><div class="cv-wrap"><canvas id="cv"></canvas></div><div class="dock" id="dock">${this.dockView()}</div></div>`;
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    if (this.screen !== 'hole') this.toastEl.classList.remove('show');
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'hole') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.resize();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
    }
  }

  /** Update the dock and the top bar without touching the canvas. */
  private refresh(): void {
    if (this.screen !== 'hole') return this.render();
    const dock = this.root.querySelector<HTMLElement>('#dock');
    if (dock) dock.innerHTML = this.dockView();
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
    const charms = r.charms.map((id) => `<span class="charm" title="${CHARMS[id].name}: ${CHARMS[id].text}">${CHARMS[id].icon}</span>`).join('');
    const holeNo = Math.min(r.idx + 1, HOLES);
    return `<header class="top">
      <span title="Hole">⛳ ${holeNo}/${HOLES}</span>
      <span class="zn">${zoneName(r.idx)}</span>
      <span title="Gold">💰 ${r.gold}</span>
      <span class="charms">${charms}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play" aria-label="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound" aria-label="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu" aria-label="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const locker = LOCKED.map((id) => {
      const isClub = !!CLUBS[id];
      const name = isClub ? CLUBS[id].name : ACES[id].name;
      const icon = isClub ? '🏌️' : ACES[id].icon;
      const text = isClub ? CLUBS[id].text : ACES[id].text;
      const own = m.unlocked.includes(id);
      const cost = unlockCost(id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${icon}</span><span><b>${name}</b><small>${isClub ? 'Club' : 'Ace'}: ${text}</small></span>
        ${own ? '<span class="ok">✔ Unlocked</span>' : `<button data-act="unlock" data-id="${id}" ${m.tokens >= cost ? '' : 'disabled'}>🎟️ ${cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo">⛳</div>
      <h1>Cursed Fairway</h1>
      <p class="sub">Side-view golf with a curse. Sink the ball before your shots run out. 18 holes, 4 zones, 4 bosses.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (hole ${Math.min(r.idx + 1, HOLES)}, 💰 ${r.gold})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best hole ${m.bestHole} · Best score ${m.best}</p>
      <h2>Locker <small>🎟️ ${m.tokens} tokens</small></h2>
      <p class="sub">Each run gives tokens. Unlock clubs and aces for later runs.</p>
      <div class="armory">${locker}</div>
    </div>`;
  }

  private kitHtml(): string {
    const r = this.run!;
    const clubs = ownedClubs(r)
      .map((id) => `<span class="chip" title="${CLUBS[id].text}">${CLUBS[id].name} ${stars(r.clubs[id])}</span>`)
      .join('');
    const hand = r.hand.map((id) => `<span class="chip" title="${ACES[id].text}">${ACES[id].icon} ${ACES[id].name}</span>`).join('');
    const charms = r.charms.map((id) => `<span class="chip" title="${CHARMS[id].text}">${CHARMS[id].icon} ${CHARMS[id].name}</span>`).join('');
    return `<h3>Clubs</h3><div class="bag">${clubs}</div>
      <h3>Aces <small>${r.hand.length}/${handMax(r)}</small></h3><div class="bag">${hand || '<span class="dim">No aces.</span>'}</div>
      ${charms ? `<h3>Charms</h3><div class="bag">${charms}</div>` : ''}`;
  }

  private mapView(): string {
    const r = this.run!;
    const z = zoneOf(r.idx);
    const track = Array.from({ length: HOLES }, (_, i) => {
      const state = i < r.idx ? 'done' : i === r.idx ? 'now' : '';
      const zs = ZONE_START.includes(i) && i > 0 ? '<span class="zgap"></span>' : '';
      return `${zs}<span class="node z${zoneOf(i)} ${state}" title="Hole ${i + 1}">${BOSS_AT.includes(i) ? '👑' : i + 1}</span>`;
    }).join('');
    const nodes = nodesFor(r)
      .map((n) => {
        const info = NODE_INFO[n];
        let extra = '';
        if (n === 'boss') {
          const b = BOSSES[ZONES[z].boss];
          extra = `<small class="foe">${b.icon} ${b.name}: ${b.text}</small>`;
        }
        if (n === 'shop' && BOSS_AT.includes(r.idx)) extra = '<small>Then the boss hole.</small>';
        return `<button class="room r-${n}" data-act="node" data-node="${n}"><span class="big">${info.icon}</span><b>${info.name}</b><small>${info.text}</small>${extra}</button>`;
      })
      .join('');
    return `<div class="map">
      <h2>${ZONES[z].icon} ${ZONES[z].name} · Hole ${r.idx + 1}</h2>
      <div class="track">${track}</div>
      <p class="sub">Choose your path.</p>
      <div class="rooms">${nodes}</div>
      ${this.kitHtml()}
    </div>`;
  }

  private dockView(): string {
    const r = this.run;
    if (!r?.hole) return '';
    const hs = r.hole;
    const aimOk = this.phase === 'aim';
    const clubs = ownedClubs(r)
      .map((id, i) => {
        const sand = sandPenalty(hs, kit(r), id);
        return `<button class="club ${this.club === id ? 'sel' : ''}" data-act="club" data-id="${id}" title="${CLUBS[id].name}: ${CLUBS[id].text} (key ${i + 1})">
          <b>${CLUBS[id].short}</b><small>${CLUBS[id].name}${stars(r.clubs[id])}</small>${sand ? '<i class="sandw">🏖️</i>' : ''}</button>`;
      })
      .join('');
    const keys = 'ZXCVBNM';
    const seen = new Set<string>();
    const aces = r.hand
      .map((id, i) => {
        const d = ACES[id];
        const armed = hs.armed.includes(id) && !seen.has(id);
        if (armed) seen.add(id);
        let ok = false;
        if (d.use === 'arm') ok = aimOk;
        else if (d.use === 'now') ok = aimOk && (id !== 'mulligan' || canMulligan(hs)) && (id !== 'freeze' || !hs.frozen);
        else ok = this.phase === 'flight' && !!this.shot && !this.shot.done;
        return `<button class="ace ${armed ? 'armed' : ''} u-${d.use}" data-act="ace" data-i="${i}" ${ok ? '' : 'disabled'} title="${d.name}: ${d.text} (key ${keys[i] ?? ''})">
          <span>${d.icon}</span><small>${d.name}</small></button>`;
      })
      .join('');
    const tip =
      this.phase === 'flight'
        ? 'Tap the course to speed up.'
        : this.phase === 'preview'
          ? 'Tap to skip the preview.'
          : 'Drag back from anywhere and let go to shoot.';
    return `<div class="clubs">${clubs}</div>
      <div class="aces">${aces || '<span class="dim">No aces in hand.</span>'}</div>
      <div class="tools"><button data-act="view" class="${this.overview ? 'sel' : ''}" title="Show the whole hole (key O)">👁 View</button><span class="hint">${tip}</span></div>`;
  }

  private rewardView(): string {
    const r = this.run!;
    const rw = r.reward!;
    const full = r.hand.length >= handMax(r);
    const bonus = rw.bonusAce ? `<p class="good">The lifted curse leaves you ${ACES[rw.bonusAce].icon} <b>${ACES[rw.bonusAce].name}</b>.</p>` : '';
    const charmPicks = rw.charms.length
      ? `<h3>Choose a charm</h3><div class="picks">${rw.charms
          .map((id) => `<button class="pick" data-act="take" data-kind="charm" data-id="${id}" ${rw.taken ? 'disabled' : ''}><span class="big">${CHARMS[id].icon}</span><b>${CHARMS[id].name}</b><small>${CHARMS[id].text}</small></button>`)
          .join('')}</div>`
      : '';
    const acePicks = rw.charms.length
      ? ''
      : `<h3>Choose an ace ${full ? '<small class="warn">(hand full)</small>' : ''}</h3><div class="picks">${rw.aces
          .map((id) => `<button class="pick" data-act="take" data-kind="ace" data-id="${id}" ${rw.taken || full ? 'disabled' : ''}><span class="big">${ACES[id].icon}</span><b>${ACES[id].name}</b><small>${ACES[id].text}</small></button>`)
          .join('')}</div>`;
    return `<div class="reward">
      <h2 class="good">⛳ In the hole!</h2>
      <ul class="lines">${rw.lines.map((l) => `<li>${l}</li>`).join('')}</ul>
      <p class="gold">💰 +${rw.gold} gold</p>
      ${bonus}${charmPicks}${acePicks}
      ${rw.taken ? '<p class="dim">Taken.</p>' : ''}
      <button class="primary" data-act="leave-reward">Continue ▶</button>
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const items = (r.shop ?? [])
      .map((it, i) => {
        let body = '';
        if (it.kind === 'ace') body = `<span class="big">${ACES[it.id].icon}</span><b>${ACES[it.id].name}</b><small>${ACES[it.id].text}</small>`;
        else if (it.kind === 'charm') body = `<span class="big">${CHARMS[it.id].icon}</span><b>${CHARMS[it.id].name}</b><small>Charm: ${CHARMS[it.id].text}</small>`;
        else if (it.kind === 'club') body = `<span class="big">🔧</span><b>Club upgrade</b><small>One club +1 level: +7% power and a 25% longer aim arc (max ★★).</small>`;
        else body = `<span class="big">🎯</span><b>Practice</b><small>+2 shots on the next hole.</small>`;
        return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${canBuy(r, it) ? '' : 'disabled'}>${body}<span class="cost">${it.sold ? 'Sold' : `💰 ${it.cost}`}</span></button>`;
      })
      .join('');
    return `<div class="shopv"><h2>🛒 Pro shop</h2><p>💰 ${r.gold} gold</p><div class="picks">${items}</div>
      ${this.kitHtml()}
      <button class="primary" data-act="leave-shop">To the tee ▶</button></div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <div class="logo">${e.victory ? '🏆' : '💀'}</div>
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? 'Curse broken!' : 'Out of shots'}</h1>
      <p>${e.victory ? 'You played all 18 holes and beat the Cursed Caddie.' : `The curse takes you after ${e.holes} holes.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p class="dim">Holes ${e.stats.holes} · Strokes ${e.stats.strokes} · Idols ${e.stats.idols} · Aces used ${e.stats.aces} · Holes in one ${e.stats.holeInOnes} · Bosses ${e.stats.bosses}</p>
      <p>🎟️ +${e.tokens} tokens for the Locker</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Goal.</b> Get the ball into the cup with the flag. The big number is your shot counter. Each shot costs 1. At 0 shots before the ball drops, the run ends.</li>
          <li><b>Aim.</b> Drag back from anywhere on the course, like a slingshot, and let go. The dots show the first part of the flight. Keys: ← → angle, ↑ ↓ power, Space shoots.</li>
          <li><b>Clubs.</b> Driver goes far but shows a short arc. Iron is in between. Wedge flies high and stops. Putter rolls on the ground. Keys 1–6.</li>
          <li><b>Surfaces.</b> Grass rolls. Sand stops the ball, and shots from sand lose 40% power. Ice slides. Water: the ball goes back and you lose 1 shot. Spikes cost 1 shot.</li>
          <li><b>Idols</b> 🗿 give +2 shots when the ball flies through them. Coins 🪙 give gold.</li>
          <li><b>Wind</b> pushes the ball in the air. The aim arc already includes it.</li>
          <li><b>Aces</b> are one-use cards. Blue cards arm for the next shot. Gold cards act now. Red cards work during the flight. Keys Z X C V B N M.</li>
          <li><b>The run.</b> 18 holes in 4 zones. Each zone ends with a boss hole. Choose curse holes, shortcuts or the pro shop between holes. Leftover shots give gold.</li>
          <li>Press <b>O</b> or 👁 View to see the whole hole.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'club') {
      const r = this.run!;
      const list = ownedClubs(r)
        .map(
          (id) =>
            `<button class="pick" data-act="pick-club" data-id="${id}" ${r.clubs[id] < MAX_CLUB_LVL ? '' : 'disabled'}><span class="big">🏌️</span><b>${CLUBS[id].name} ${stars(r.clubs[id])}</b><small>Level ${r.clubs[id]} → ${Math.min(MAX_CLUB_LVL, r.clubs[id] + 1)}</small></button>`,
        )
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop><h2>Upgrade which club?</h2><div class="picks">${list}</div><button data-act="modal-close">Cancel</button></div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a loss.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Canvas ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const top = this.root.querySelector<HTMLElement>('header.top')?.offsetHeight ?? 0;
    const dock = this.root.querySelector<HTMLElement>('#dock')?.offsetHeight ?? 0;
    const w = wrap.clientWidth;
    const h = Math.max(240, window.innerHeight - top - dock - 22);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    cv.width = Math.round(w * this.dpr);
    cv.height = Math.round(h * this.dpr);
    this.cw = w;
    this.ch = h;
  }

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (t: number) => {
      if (this.screen !== 'hole' || !this.ctx) {
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

  private schedule(ms: number, fn: () => void): void {
    this.queue.push({ at: this.clock + (FAST ? 0 : ms), fn });
  }

  private baseZoom(): number {
    return Math.max(0.45, Math.min(1.3, this.cw / (this.cw < 600 ? 500 : 1150)));
  }

  private fitZoom(): number {
    const c = this.course;
    return Math.min(this.cw / (c.w + 40), this.ch / (c.bottom - c.top + 60));
  }

  private camTarget(): { x: number; y: number; z: number } {
    const c = this.course;
    const hs = this.hs;
    const fit = this.phase === 'preview' ? this.previewT < 1.3 : this.overview && this.phase === 'aim';
    if (fit) {
      const z = this.fitZoom();
      return { x: c.w / 2, y: (c.top + c.bottom) / 2 + 30, z };
    }
    const z = this.baseZoom();
    const vw = this.cw / z;
    const vh = this.ch / z;
    let x: number;
    let y: number;
    if (this.shot && this.phase !== 'aim') {
      x = this.shot.x + this.shot.vx * 0.25;
      y = this.shot.y + this.shot.vy * 0.15;
    } else {
      const { dir } = clubAim(this.club, this.aim.a);
      x = hs.ball.x + dir * vw * 0.2;
      y = hs.ball.y - vh * 0.08;
    }
    if (vw < c.w + 80) x = Math.max(vw / 2 - 40, Math.min(c.w + 40 - vw / 2, x));
    else x = c.w / 2;
    y = Math.min(c.bottom + vh * 0.3 - vh / 2, y);
    return { x, y, z };
  }

  private update(dt: number): void {
    this.clock += dt * 1000;
    this.anim += dt;
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1.4);
    for (const p of this.parts) {
      p.t += dt;
      p.vy += 500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    if (this.run?.hole) this.updateHole(dt);
    const due = this.queue.filter((q) => q.at <= this.clock);
    if (due.length) {
      this.queue = this.queue.filter((q) => q.at > this.clock);
      for (const q of due) q.fn();
    }
  }

  private updateHole(dt: number): void {
    if (this.phase === 'preview') {
      this.previewT += dt;
      if (this.previewT > 2.2) this.endPreview();
    }
    if (this.phase === 'flight' && this.shot && this.env) {
      const c = this.course;
      if (FAST) {
        for (let i = 0; i < 4000 && !this.shot.done; i++) stepShot(c, this.shot, this.env);
      } else {
        this.acc += dt * (this.fast ? 3 : 1);
        let n = 0;
        while (this.acc >= DT && !this.shot.done) {
          stepShot(c, this.shot, this.env);
          this.acc -= DT;
          if (++n % 2 === 0) this.shot.trail.push({ x: this.shot.x, y: this.shot.y });
        }
        if (this.shot.trail.length > 60) this.shot.trail.splice(0, this.shot.trail.length - 60);
      }
      this.shotEvents();
      if (this.shot.done) this.resolve();
    }
    // Camera
    const t = this.camTarget();
    const k = Math.min(1, dt * (this.phase === 'flight' ? 5 : 3));
    this.cam.x += (t.x - this.cam.x) * k;
    this.cam.y += (t.y - this.cam.y) * k;
    this.cam.z += (t.z - this.cam.z) * k;
  }

  private puff(x: number, y: number, color: string, n: number, speed: number): void {
    if (FAST) return;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * Math.random();
      const v = speed * (0.4 + Math.random() * 0.6);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.5 + Math.random() * 0.4, color, r: 1.5 + Math.random() * 2 });
    }
  }

  private float(x: number, y: number, text: string, color: string, size = 18): void {
    this.floats.push({ x, y, text, color, t: 0, size });
  }

  private shotEvents(): void {
    const s = this.shot!;
    if (!s.events.length) return;
    const c = this.course;
    for (const ev of s.events) {
      switch (ev.k) {
        case 'bounce':
          if (!FAST) sfx.bounce(ev.v);
          if (ev.s === 'sand') {
            sfx.sand();
            this.puff(ev.x, ev.y + R, '#e8c872', 10, 120);
          } else if (ev.v > 200) this.puff(ev.x, ev.y + R, SURF_COLOR[ev.s], 5, 80);
          break;
        case 'spike':
          sfx.spike();
          this.float(ev.x, ev.y - 20, this.run!.charms.includes('guard') ? '🛡️ Guarded' : '🦔 -1 shot', '#ff5d7a');
          break;
        case 'water':
          sfx.splash();
          this.puff(ev.x, ev.y, '#7cc4ff', 22, 220);
          break;
        case 'skip':
          sfx.bounce(300);
          this.puff(ev.x, ev.y + R, '#7cc4ff', 8, 120);
          break;
        case 'pickup': {
          const p = c.pickups[ev.i];
          if (p.kind === 'idol') {
            sfx.idol();
            this.float(p.x, p.y - 22, `+${this.run!.charms.includes('magnet') ? 3 : 2} shots`, '#ffd166', 20);
            this.puff(p.x, p.y, '#ffd166', 16, 160);
          } else {
            sfx.coin();
            this.float(p.x, p.y - 16, `+${this.run!.charms.includes('glove') ? 6 : 4}💰`, '#ffd166', 14);
          }
          break;
        }
        case 'cup':
          sfx.cup();
          for (const col of ['#ffd166', '#ef476f', '#38b000', '#4cc9f0']) this.puff(ev.x, ev.y, col, 8, 260);
          break;
      }
    }
    s.events = [];
  }

  private resolve(): void {
    const r = this.run!;
    const hs = this.hs;
    const s = this.shot!;
    const o = afterShot(r, s);
    this.phase = 'over';
    if (o.penalty > 0 && o.reset) this.float(hs.ball.x, hs.ball.y - 30, '💦 -1 shot', '#7cc4ff');
    else if (o.reset && s.end !== 'spikes') this.float(hs.ball.x, hs.ball.y - 30, '🛟 Saved', '#7cc4ff');
    if (o.reset) this.toast(s.end === 'spikes' ? 'Stuck in the spikes. Back to the last spot.' : 'Splash! The ball goes back to the last spot.');
    if (o.bossMsg) this.toast(o.bossMsg);
    if (o.autoExtra) this.toast('➕ Extra Shot saves you!');
    if (hs.done) {
      const msg = hs.strokes === 1 ? 'HOLE IN ONE!' : hs.shots > 0 ? `In! ${hs.shots} left` : 'In!';
      this.float(this.course.cups[hs.open].x, this.course.cups[hs.open].y - 50, msg, '#ffd166', hs.strokes === 1 ? 28 : 22);
      this.schedule(1500, () => {
        sfx.win();
        if (finishHole(r)) return this.endRun(true);
        saveRun(r);
        this.screen = 'reward';
        this.shot = null;
        this.render();
      });
      this.refresh();
      return;
    }
    if (o.out) {
      sfx.lose();
      this.float(hs.ball.x, hs.ball.y - 40, 'Out of shots', '#ff5d7a', 24);
      this.schedule(1600, () => this.endRun(false));
      this.refresh();
      return;
    }
    this.schedule(o.reset ? 500 : 250, () => {
      this.shot = null;
      this.env = null;
      this.phase = 'aim';
      this.arcKey = '';
      this.pickClubForLie();
      saveRun(r);
      this.refresh();
    });
    this.refresh();
  }

  /** On the green, switch to the putter. */
  private pickClubForLie(): void {
    if (this.hs.ball.lie === 'green' && this.run!.clubs.putter) {
      this.club = 'putter';
      const cx = this.course.cups[this.hs.open].x;
      this.aim = { a: cx >= this.hs.ball.x ? 0 : Math.PI, p: Math.min(0.6, this.aim.p) };
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    const r = this.run;
    if (!ctx || !r?.hole) return;
    const hs = r.hole;
    const c = this.course;
    const zone = ZONES[hs.spec.zone];
    const { x: cx, y: cy, z } = this.cam;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Sky
    const g = ctx.createLinearGradient(0, 0, 0, this.ch);
    g.addColorStop(0, zone.sky[0]);
    g.addColorStop(1, zone.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.cw, this.ch);
    // Far hills (parallax)
    ctx.fillStyle = zone.hills;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(0, this.ch);
    for (let sx = 0; sx <= this.cw + 20; sx += 20) {
      const wx = sx / z + cx * 0.6;
      ctx.lineTo(sx, this.ch * 0.62 - (cy - c.top) * 0.05 * z - 60 * Math.sin(wx / 230) * z - 30 * Math.sin(wx / 97) * z);
    }
    ctx.lineTo(this.cw, this.ch);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(this.cw / 2, this.ch / 2);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
    const t = hs.clock + (this.shot && this.phase !== 'aim' ? this.shot.t : 0);
    this.drawGround(ctx, c, zone.dirt, zone.grass, hs);
    // Blocks
    for (const b of c.blocks) {
      const p = blockPos(b, t);
      ctx.fillStyle = '#5b5f6b';
      ctx.fillRect(p.x - b.w / 2, p.y - b.h / 2, b.w, b.h);
      ctx.strokeStyle = '#9aa0ad';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - b.w / 2, p.y - b.h / 2, b.w, b.h);
      if (b.ay) {
        ctx.fillStyle = '#ff9f43';
        ctx.fillRect(p.x - 3, p.y - b.h / 2 + 6, 6, 6);
      }
    }
    // Cups and flag
    c.cups.forEach((cup, i) => {
      if (i === hs.open) {
        ctx.fillStyle = '#0c0f0a';
        ctx.fillRect(cup.x - 12, cup.y, 24, 16);
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cup.x, cup.y + 14);
        ctx.lineTo(cup.x, cup.y - 70);
        ctx.stroke();
        const wave = Math.sin(this.anim * 6) * 3;
        ctx.fillStyle = '#ef476f';
        ctx.beginPath();
        ctx.moveTo(cup.x, cup.y - 70);
        ctx.lineTo(cup.x + (hs.wind >= 0 ? 30 : -30), cup.y - 62 + wave);
        ctx.lineTo(cup.x, cup.y - 54);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(cup.x - 12, cup.y - 2, 24, 4);
      }
    });
    // Tee
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(c.tee.x - 2, c.tee.y + R - 1, 4, 6);
    // Pickups
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    c.pickups.forEach((p, i) => {
      if (hs.taken[i] || this.shot?.got.includes(i)) return;
      const bob = Math.sin(this.anim * 2.5 + i) * 3;
      if (p.kind === 'idol') {
        const glow = ctx.createRadialGradient(p.x, p.y + bob, 2, p.x, p.y + bob, PICK_R + 10);
        glow.addColorStop(0, 'rgba(255, 209, 102, 0.85)');
        glow.addColorStop(1, 'rgba(255, 209, 102, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y + bob, PICK_R + 10 + Math.sin(this.anim * 4) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '26px system-ui';
        ctx.fillText('🗿', p.x, p.y + bob);
        ctx.font = 'bold 11px system-ui';
        ctx.fillStyle = '#ffd166';
        ctx.fillText('+2', p.x, p.y + bob + 24);
      } else {
        const sx = Math.abs(Math.cos(this.anim * 3 + i));
        ctx.fillStyle = '#b8860b';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + bob, 7 * sx + 1, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + bob, 5 * sx + 0.5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // Boss
    if (hs.spec.kind === 'boss') {
      const b = BOSSES[zone.boss];
      const last = c.cups[c.cups.length - 1];
      ctx.font = '54px system-ui';
      ctx.fillText(b.icon, last.x + 150, last.y - 140 + Math.sin(this.anim * 2) * 8);
    }
    // Aim arc
    if (this.phase === 'aim') this.drawAim(ctx);
    // Ball
    const bx = this.shot && this.phase !== 'aim' ? this.shot.x : hs.ball.x;
    const by = this.shot && this.phase !== 'aim' ? this.shot.y : hs.ball.y;
    if (this.shot && this.phase !== 'aim') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.shot.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    if (!(hs.done && this.phase !== 'flight' && this.shot?.end === 'cup')) {
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(R, 4 / z), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // Particles and floats
    for (const p of this.parts) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      ctx.font = `bold ${f.size / Math.max(0.6, z)}px system-ui`;
      ctx.lineWidth = 4 / z;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = f.color;
      ctx.strokeText(f.text, f.x, f.y - f.t * 30);
      ctx.fillText(f.text, f.x, f.y - f.t * 30);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    this.drawHud(ctx, hs);
  }

  private drawGround(ctx: CanvasRenderingContext2D, c: Course, dirt: string, grass: string, hs: HoleState): void {
    const pts = c.pts;
    ctx.fillStyle = dirt;
    ctx.beginPath();
    ctx.moveTo(pts[0].x - 400, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(pts[pts.length - 1].x + 400, pts[pts.length - 1].y);
    ctx.lineTo(pts[pts.length - 1].x + 400, c.bottom + 3000);
    ctx.lineTo(pts[0].x - 400, c.bottom + 3000);
    ctx.closePath();
    ctx.fill();
    // Outside walls
    ctx.fillStyle = '#2a2d36';
    ctx.fillRect(-400, -4000, 400, c.bottom + 7000);
    ctx.fillRect(c.w, -4000, 400, c.bottom + 7000);
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (a.y < -3000 || b.y < -3000) continue;
      let s = b.s;
      if (s === 'water' && hs.frozen) s = 'ice';
      if (s === 'water') {
        const wy = Math.min(a.y, b.y);
        ctx.fillStyle = 'rgba(58, 143, 217, 0.85)';
        ctx.fillRect(a.x - 2, wy - 3, b.x - a.x + 4, 40);
        ctx.strokeStyle = '#9fd4ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = a.x; x <= b.x; x += 6) {
          const y = wy - 3 + Math.sin(x / 9 + this.anim * 3) * 1.5;
          if (x === a.x) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        continue;
      }
      ctx.strokeStyle = s === 'grass' ? grass : SURF_COLOR[s];
      ctx.lineWidth = s === 'rock' ? 4 : 7;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + (s === 'rock' ? 0 : 3));
      ctx.lineTo(b.x, b.y + (s === 'rock' ? 0 : 3));
      ctx.stroke();
      if (s === 'spikes') {
        ctx.fillStyle = '#d9dee6';
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Math.max(1, Math.floor(len / 12));
        for (let k = 0; k < n; k++) {
          const x0 = a.x + ((b.x - a.x) * k) / n;
          const y0 = a.y + ((b.y - a.y) * k) / n;
          const x1 = a.x + ((b.x - a.x) * (k + 1)) / n;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo((x0 + x1) / 2, y0 - 12);
          ctx.lineTo(x1, y0);
          ctx.fill();
        }
      }
    }
    ctx.lineCap = 'butt';
  }

  private drawAim(ctx: CanvasRenderingContext2D): void {
    const r = this.run!;
    const hs = this.hs;
    const key = `${this.club}|${this.aim.a.toFixed(4)}|${this.aim.p.toFixed(4)}|${hs.armed.join()}|${hs.strokes}|${hs.ball.x}|${hs.open}|${hs.wind}|${hs.frozen}`;
    if (key !== this.arcKey) {
      this.arcKey = key;
      const { shot, env } = makeShot(hs, kit(r), this.club, this.aim);
      this.arc = trace(this.course, shot, env, arcSecs(hs, kit(r), this.club), CLUBS[this.club].emax === 0);
    }
    const z = this.cam.z;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    this.arc.forEach((p, i) => {
      ctx.globalAlpha = Math.max(0.25, 1 - i / (this.arc.length + 6));
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, 2.2 / z), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    // Slingshot band: points back from the ball, longer with more power.
    const { dir, e } = clubAim(this.club, this.aim.a);
    const len = (30 + this.aim.p * 70) / Math.max(0.7, z);
    const ux = dir * Math.cos(e);
    const uy = -Math.sin(e);
    const bx = hs.ball.x;
    const by = hs.ball.y;
    ctx.strokeStyle = `hsl(${120 - this.aim.p * 120}, 85%, 60%)`;
    ctx.lineWidth = 3 / Math.max(0.7, z);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - ux * len, by - uy * len);
    ctx.stroke();
  }

  private drawHud(ctx: CanvasRenderingContext2D, hs: HoleState): void {
    const r = this.run!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.textBaseline = 'middle';
    // Shot counter
    const low = hs.shots <= 1;
    ctx.fillStyle = 'rgba(8, 14, 10, 0.72)';
    this.roundRect(ctx, 8, 8, 86, 62, 10);
    ctx.textAlign = 'center';
    ctx.fillStyle = low ? '#ff5d7a' : '#fff';
    ctx.font = 'bold 34px system-ui';
    ctx.fillText(`${hs.shots}`, 51, 34);
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#b9c7b4';
    ctx.fillText(hs.shots === 1 ? 'SHOT LEFT' : 'SHOTS LEFT', 51, 59);
    // Wind
    const w = this.hs.armed.includes('calm') ? 0 : hs.wind;
    ctx.fillStyle = 'rgba(8, 14, 10, 0.72)';
    this.roundRect(ctx, this.cw / 2 - 58, 8, 116, 34, 10);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui';
    const arrow = w === 0 ? '·' : w > 0 ? '→'.repeat(Math.min(3, Math.ceil(Math.abs(w) / 25))) : '←'.repeat(Math.min(3, Math.ceil(Math.abs(w) / 25)));
    ctx.fillText(`💨 ${arrow} ${Math.abs(w) / 5}`, this.cw / 2, 25);
    // Hole info
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px system-ui';
    ctx.fillStyle = '#fff';
    const kindTxt =
      hs.spec.kind === 'boss'
        ? `${BOSSES[ZONES[hs.spec.zone].boss].icon} ${BOSSES[ZONES[hs.spec.zone].boss].name}`
        : hs.spec.kind === 'curse'
          ? `${CURSES[hs.spec.curse!].icon} ${CURSES[hs.spec.curse!].name}`
          : hs.spec.kind === 'shortcut'
            ? '⏩ Shortcut'
            : '';
    ctx.fillText(`Hole ${r.idx + 1} · stroke ${hs.strokes + (this.phase === 'aim' ? 1 : 0)}`, this.cw - 10, 20);
    if (kindTxt) ctx.fillText(kindTxt, this.cw - 10, 40);
    // Aim readout
    if (this.phase === 'aim') {
      const { e } = clubAim(this.club, this.aim.a);
      const sand = sandPenalty(hs, kit(r), this.club);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(8, 14, 10, 0.72)';
      this.roundRect(ctx, 8, this.ch - 40, 240, 32, 10);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui';
      const armed = hs.armed.map((id) => ACES[id].icon).join('');
      ctx.fillText(`${CLUBS[this.club].name} · ${Math.round(this.aim.p * 100)}% · ${CLUBS[this.club].emax ? Math.round((e * 180) / Math.PI) + '°' : 'roll'}${sand ? ' · 🏖️ -40%' : ''} ${armed}`, 18, this.ch - 24);
    }
    if (this.phase === 'preview') {
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px system-ui';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      const msg = `Hole ${r.idx + 1} · ${hs.start} shots`;
      ctx.strokeText(msg, this.cw / 2, this.ch - 40);
      ctx.fillText(msg, this.cw / 2, this.ch - 40);
    }
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number): void {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.fill();
  }

  // ---------- Hole flow ----------

  private enterHole(): void {
    const hs = this.hs;
    this.shot = null;
    this.env = null;
    this.floats = [];
    this.parts = [];
    this.queue = [];
    this.overview = false;
    this.arcKey = '';
    const c = built(hs.spec).course;
    const cupX = c.cups[hs.open].x;
    this.club = hs.ball.lie === 'green' ? 'putter' : 'driver';
    this.aim = { a: cupX >= hs.ball.x ? 0.6 : Math.PI - 0.6, p: 0.6 };
    this.phase = FAST ? 'aim' : 'preview';
    this.previewT = 0;
    this.screen = 'hole';
    this.render();
    this.cam = { x: c.w / 2, y: (c.top + c.bottom) / 2, z: this.fitZoom() };
    if (hs.spec.kind === 'boss') {
      const b = BOSSES[ZONES[hs.spec.zone].boss];
      this.toast(`${b.icon} ${b.name}: ${b.text}`);
      sfx.boss();
    } else if (hs.spec.curse) this.toast(`${CURSES[hs.spec.curse].icon} Curse: ${CURSES[hs.spec.curse].text}`);
  }

  private endPreview(): void {
    if (this.phase !== 'preview') return;
    this.phase = 'aim';
    this.refresh();
  }

  private doShoot(flight: { t: number; kind: 'brake' | 'rocket' } | null = null): void {
    if (this.phase !== 'aim' || !this.run?.hole) return;
    const r = this.run;
    const { shot, env } = shoot(r, this.club, this.aim);
    if (flight) env.plan = [flight];
    this.shot = shot;
    this.env = env;
    this.acc = 0;
    this.fast = false;
    this.overview = false;
    this.phase = 'flight';
    sfx.swing(this.aim.p);
    this.puff(shot.x, shot.y + R, '#9be37a', 6, 90);
    this.refresh();
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const sc = score(r, victory);
    const tokens = tokensFor(sc);
    const m = this.meta;
    m.tokens += tokens;
    m.best = Math.max(m.best, sc);
    m.bestHole = Math.max(m.bestHole, r.stats.holes);
    if (victory) m.wins++;
    saveMeta(m);
    clearRun();
    this.end = { victory, score: sc, tokens, holes: r.stats.holes, stats: { ...r.stats } };
    if (victory) sfx.win();
    this.run = null;
    this.modal = null;
    this.shot = null;
    this.screen = 'end';
    this.render();
  }

  private toStage(): void {
    const r = this.run!;
    if (r.stage === 'hole' && r.hole) return this.enterHole();
    this.screen = r.stage === 'shop' ? 'shop' : r.stage === 'reward' ? 'reward' : 'map';
    this.render();
  }

  private chooseNode(n: NodeKind): void {
    const r = this.run!;
    chooseNode(r, n);
    saveRun(r);
    sfx.click();
    this.toStage();
  }

  // ---------- Input ----------

  private onDown(e: PointerEvent): void {
    initAudio();
    if (this.screen !== 'hole' || e.target !== this.canvas || this.modal) return;
    if (this.phase === 'preview') return this.endPreview();
    if (this.phase === 'flight') {
      this.fast = true;
      return;
    }
    if (this.phase !== 'aim') return;
    this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    this.overview = false;
    e.preventDefault();
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id || this.phase !== 'aim') return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) return;
    // Shot goes opposite to the drag.
    let a = Math.atan2(dy, -dx);
    if (a < 0) a = a > -Math.PI / 2 ? 0 : Math.PI;
    const max = Math.max(110, Math.min(200, Math.min(this.cw, this.ch) * 0.38));
    this.aim = { a, p: Math.min(1, len / max) };
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (this.phase !== 'aim') return;
    const len = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (len >= 12) this.doShoot();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'hole' || !this.run?.hole) return;
    initAudio();
    const big = e.shiftKey ? 4 : 1;
    if (this.phase === 'preview' && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      return this.endPreview();
    }
    if (this.phase === 'aim') {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.aim = { ...this.aim, a: Math.max(0, Math.min(Math.PI, this.aim.a + (e.key === 'ArrowLeft' ? 0.02 : -0.02) * big)) };
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        this.aim = { ...this.aim, p: Math.max(0.03, Math.min(1, this.aim.p + (e.key === 'ArrowUp' ? 0.02 : -0.02) * big)) };
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        return this.doShoot();
      }
      const n = Number(e.key);
      const clubs = ownedClubs(this.run);
      if (n >= 1 && n <= clubs.length) return this.action('club', { id: clubs[n - 1] });
      if (e.key === 'o' || e.key === 'O') return this.action('view', {});
    } else if (this.phase === 'flight' && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      this.fast = true;
      return;
    }
    const slot = 'zxcvbnm'.indexOf(e.key.toLowerCase());
    if (slot >= 0 && slot < this.run.hand.length) this.action('ace', { i: String(slot) });
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
        this.refresh();
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
        this.modal = null;
        if (r) this.endRun(false);
        return;
      case 'title':
        this.modal = null;
        if (r && r.stage === 'hole' && this.phase === 'flight') return; // finish the flight first
        if (r) saveRun(r);
        this.shot = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.run = newRun(randomSeedText(), this.meta);
        this.meta.runs++;
        saveMeta(this.meta);
        saveRun(this.run);
        this.screen = 'map';
        this.render();
        return;
      case 'continue':
        if (r) this.toStage();
        return;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.tokens < cost || this.meta.unlocked.includes(id)) return sfx.deny();
        this.meta.tokens -= cost;
        this.meta.unlocked.push(id);
        saveMeta(this.meta);
        sfx.item();
        this.render();
        return;
      }
      case 'node':
        this.chooseNode(d.node as NodeKind);
        return;
      case 'club':
        if (!r?.hole || this.phase !== 'aim' || !r.clubs[d.id!]) return;
        this.club = d.id!;
        sfx.click();
        this.refresh();
        return;
      case 'view':
        this.overview = !this.overview;
        this.refresh();
        return;
      case 'ace':
        this.playAce(+d.i!);
        return;
      case 'take': {
        if (!r) return;
        if (takeReward(r, d.kind as 'ace' | 'charm', d.id!)) {
          sfx.item();
          saveRun(r);
        } else sfx.deny();
        this.render();
        return;
      }
      case 'leave-reward':
        if (!r) return;
        leaveReward(r);
        saveRun(r);
        this.screen = 'map';
        this.render();
        return;
      case 'buy': {
        if (!r?.shop) return;
        const i = +d.i!;
        const it = r.shop[i];
        if (!canBuy(r, it)) return sfx.deny();
        if (it.kind === 'club') {
          this.modal = { kind: 'club', item: i };
          this.render();
          return;
        }
        buy(r, i);
        sfx.buy();
        saveRun(r);
        this.render();
        return;
      }
      case 'pick-club': {
        const m = this.modal;
        if (!r || m?.kind !== 'club') return;
        this.modal = null;
        if (buy(r, m.item, d.id)) sfx.buy();
        saveRun(r);
        this.render();
        return;
      }
      case 'leave-shop':
        if (!r) return;
        leaveShop(r);
        saveRun(r);
        this.toStage();
        return;
    }
  }

  private playAce(i: number): void {
    const r = this.run;
    if (!r?.hole) return;
    const id = r.hand[i];
    if (!id) return;
    const d = ACES[id];
    if (d.use === 'arm') {
      if (this.phase !== 'aim') return;
      toggleArm(r, i);
      sfx.click();
    } else if (d.use === 'now') {
      if (this.phase !== 'aim' || !playNowAce(r, i)) return sfx.deny();
      sfx.ace();
      this.toast(`${d.icon} ${d.name}!`);
      saveRun(r);
    } else {
      if (this.phase !== 'flight' || !this.shot || this.shot.done) return;
      useAce(r, i);
      flightAce(this.shot, id as 'brake' | 'rocket');
      if (id === 'rocket') sfx.rocket();
      else sfx.brake();
      this.puff(this.shot.x, this.shot.y, id === 'rocket' ? '#ff9f43' : '#ffffff', 10, 140);
    }
    this.arcKey = '';
    this.refresh();
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        phase: this.screen === 'hole' ? this.phase : null,
        modal: this.modal?.kind ?? null,
        hole: this.run ? this.run.idx + 1 : null,
        gold: this.run?.gold ?? null,
        shots: this.run?.hole?.shots ?? null,
        strokes: this.run?.hole?.strokes ?? null,
        kind: this.run?.hole?.spec.kind ?? null,
        hand: this.run?.hand ?? null,
        charms: this.run?.charms ?? null,
        ball: this.run?.hole ? { x: Math.round(this.run.hole.ball.x), y: Math.round(this.run.hole.ball.y), lie: this.run.hole.ball.lie } : null,
        cup: this.run?.hole ? Math.round(this.course.cups[this.run.hole.open].x) : null,
        stats: this.run?.stats ?? null,
        end: this.end,
      }),
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.refresh();
      },
      tokens: (n: number) => {
        this.meta.tokens += n;
        saveMeta(this.meta);
        this.render();
      },
      /** Jump to a hole for tests: debug.jump(12, 'boss'). */
      jump: (idx: number, node: NodeKind = 'hole') => {
        if (!this.run) this.run = newRun(randomSeedText(), this.meta);
        this.run.idx = idx;
        startHole(this.run, node);
        this.enterHole();
      },
      /** One bot action for automatic tests. */
      step: () => {
        const r = this.run;
        if (this.modal) {
          if (this.modal.kind === 'club' && r) {
            const id = upgradableClubs(r)[0];
            if (id) this.action('pick-club', { id });
            else this.action('modal-close', {});
          } else this.action('modal-close', {});
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            this.action('new', {});
            return 'new';
          case 'map':
            this.chooseNode(pickNode(r!, true, this.botRng));
            return 'node';
          case 'shop':
            shopBot(r!);
            this.action('leave-shop', {});
            return 'shop';
          case 'reward':
            pickReward(r!);
            this.action('leave-reward', {});
            return 'reward';
          case 'hole': {
            if (this.phase === 'preview') {
              this.endPreview();
              return 'preview';
            }
            if (this.phase !== 'aim') return 'busy';
            const hs = r!.hole!;
            if (!hs.frozen && this.course.segs.some((s) => s.s === 'water')) {
              const i = r!.hand.indexOf('freeze');
              if (i >= 0) this.playAce(i);
            }
            const p = plan(hs, kit(r!), r!.hand, GOOD, this.botRng);
            this.club = p.club;
            this.aim = p.aim;
            for (const id of p.arm) {
              const i = r!.hand.indexOf(id);
              if (i >= 0 && !hs.armed.includes(id)) toggleArm(r!, i);
            }
            if (p.flight) {
              const i = r!.hand.indexOf(p.flight.kind);
              if (i >= 0) useAce(r!, i);
            }
            this.doShoot(p.flight);
            if (FAST && this.shot && this.env) {
              for (let i = 0; i < 5000 && !this.shot.done; i++) stepShot(this.course, this.shot, this.env);
              this.shotEvents();
              this.resolve();
              this.update(0);
            }
            return 'shot';
          }
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
