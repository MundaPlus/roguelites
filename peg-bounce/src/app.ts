import { ACTS, ENEMIES, ORBS, RELICS, type OrbDef } from './data';
import {
  SLOTS,
  applyAttack,
  computeAttack,
  critCount,
  curOrb,
  def,
  discard,
  drawOrb,
  enemyAtk,
  enemyTurn,
  intent,
  nextOrb,
  shotOpts,
  startFight,
  type Attack,
  type EnemyInst,
  type Fight,
  type FightKind,
  type Hero,
} from './fight';
import { BH, BW, LAUNCH, bucketX, clampAngle, endShot, newShot, runShot, stepShot, tracePath, DT, type Board, type Shot, type ShotOpts } from './physics';
import { randomSeedText } from './rng';
import {
  LOCKED,
  PLAN,
  ROOM_INFO,
  addRelic,
  advance,
  applyPick,
  clearRun,
  fightRewards,
  fightSeed,
  loadMeta,
  loadRun,
  makeShop,
  newRun,
  orbName,
  pickEvent,
  randomRelics,
  rngFor,
  roomKind,
  saveMeta,
  saveRun,
  score,
  shardsFor,
  unlockCost,
  upgradable,
  type EventDef,
  type Pick,
  type Rewards,
  type Room,
  type RunState,
  type ShopItem,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'fight' | 'reward' | 'shop' | 'rest' | 'event' | 'treasure' | 'end';
type Phase = 'aim' | 'shot' | 'resolve' | 'enemy' | 'over';

type Modal =
  | { kind: 'help' }
  | { kind: 'menu'; confirm: boolean }
  | { kind: 'pick'; title: string; filter: (lvl: number) => boolean; done: (index: number) => void };

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  color: string;
  t: number;
}

/** `?debug&fast` skips waits and plays shots at once, for bot tests. */
const FAST = new URLSearchParams(location.search).has('fast');

const STRIP = 150;
const LW = BW;
const LH = STRIP + BH + 8;
const HERO_X = 26;
const slotX = (slot: number): number => 26 + slot * 43;
const LANE_Y = 92;

const PEG_COLOR: Record<string, string> = { normal: '#8ecae6', crit: '#ffb703', refresh: '#06d6a0', bomb: '#ef476f' };

function hpBar(hp: number, max: number): string {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return `<div class="hp"><div class="hp-fill" style="width:${pct}%"></div><span>${hp} / ${max}</span></div>`;
}

const orbStats = (o: OrbDef, lvl: number): string => `${o.dmg[lvl - 1]} per peg · crit ${o.crit[lvl - 1]}`;

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;

  // Fight
  private f: Fight | null = null;
  private phase: Phase = 'aim';
  private shot: Shot | null = null;
  private opts: ShotOpts | null = null;
  private angle = Math.PI / 2;
  private path: { x: number; y: number }[] = [];
  private pathKey = '';
  private atk: Attack | null = null;
  private floats: Float[] = [];
  private rings: Ring[] = [];
  private dying: { icon: string; x: number; t: number; size: number }[] = [];
  private ex = new Map<number, number>();
  private shake = 0;
  private flash = new Map<number, number>();
  private queue: { at: number; fn: () => void }[] = [];
  private clock = 0;
  private acc = 0;
  private fastForward = false;
  private aiming = false;
  private hoverUid: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private scale = 1;

  // Other screens
  private rewards: Rewards | null = null;
  private picked = false;
  private relicPicked = false;
  private shop: ShopItem[] = [];
  private event: { def: EventDef; result: string | null } | null = null;
  private treasure: string | null = null;
  private end: { victory: boolean; score: number; shards: number; act: number } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    if (new URLSearchParams(location.search).has('debug')) this.installDebug();
    this.render();
  }

  private get hero(): Hero {
    return this.run!.hero;
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
      case 'fight':
        body = `<div class="fight"><div class="cv-wrap"><canvas id="cv"></canvas></div><aside class="side" id="side">${this.sideView()}</aside></div>`;
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
      case 'event':
        body = this.eventView();
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
    if (this.screen === 'fight') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.resize();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
    }
  }

  /** Update the parts around the canvas without a full render. */
  private refresh(): void {
    if (this.screen !== 'fight') return this.render();
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
    const h = r.hero;
    const relics = h.relics.map((id) => `<span class="relic" title="${RELICS[id].name}: ${RELICS[id].text}">${RELICS[id].icon}</span>`).join('');
    return `<header class="top">
      <span>❤️ ${Math.max(0, h.hp)}/${h.maxHp}</span>
      <span>💰 ${h.gold}</span>
      <span>${ACTS[Math.min(r.act, ACTS.length - 1)].icon} ${Math.min(r.act + 1, 3)}-${r.step + 1}</span>
      <span class="relics">${relics}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const armory = LOCKED.map((id) => {
      const item = ORBS[id] ?? RELICS[id];
      const own = m.unlocked.includes(id);
      const cost = unlockCost(id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${item.icon}</span><span><b>${item.name}</b><small>${ORBS[id] ? 'Orb' : 'Relic'}: ${item.text}</small></span>
        ${own ? '<span class="ok">✔ Unlocked</span>' : `<button data-act="unlock" data-id="${id}" ${m.shards >= cost ? '' : 'disabled'}>💎 ${cost}</button>`}</div>`;
    }).join('');
    return `<div class="title">
      <h1><span>🔮</span> Peg Bounce</h1>
      <p class="sub">Aim. Drop. Bounce. Every peg your orb hits adds damage. Clear 3 acts and beat their bosses.</p>
      ${this.run ? `<button class="primary" data-act="continue">▶ Continue run (act ${this.run.act + 1}, ❤️ ${this.run.hero.hp})</button>` : ''}
      <button class="${this.run ? '' : 'primary'}" data-act="new">${this.run ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best act ${m.bestAct} · Best score ${m.best}</p>
      <h2>Armory <small>💎 ${m.shards} shards</small></h2>
      <p class="sub">Each run gives shards. Unlock new orbs and relics for later runs.</p>
      <div class="armory">${armory}</div>
    </div>`;
  }

  private bagHtml(): string {
    const h = this.hero;
    return `<div class="bag">${h.bag.map((o) => `<span class="chip" title="${ORBS[o.id].text}">${orbName(o)}</span>`).join('')}</div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const act = ACTS[r.act];
    const track = PLAN.map((opts, i) => {
      const state = i < r.step ? 'done' : i === r.step ? 'now' : '';
      return `<span class="node ${state}">${opts.map((o) => ROOM_INFO[o].icon).join('/')}</span>`;
    }).join('<span class="link"></span>');
    const rooms = PLAN[r.step]
      .map((room) => {
        const info = ROOM_INFO[room];
        let extra = '';
        if (room === 'boss') extra = `<small class="foe">${ENEMIES[act.boss].icon} ${ENEMIES[act.boss].name}</small>`;
        if (room === 'elite') extra = `<small class="foe">${ENEMIES[act.elite].icon} ${ENEMIES[act.elite].name}</small>`;
        return `<button class="room r-${room}" data-act="room" data-room="${room}"><span class="big">${info.icon}</span><b>${info.name}</b><small>${info.text}</small>${extra}</button>`;
      })
      .join('');
    return `<div class="map">
      <h2>${act.icon} Act ${r.act + 1}: ${act.name}</h2>
      <div class="track">${track}</div>
      <div class="rooms">${rooms}</div>
      <h3>Orb bag</h3>${this.bagHtml()}
    </div>`;
  }

  private sideView(): string {
    const f = this.f;
    if (!f) return '';
    const h = this.hero;
    const o = curOrb(h, f);
    const d = ORBS[o.id];
    const n = nextOrb(h, f);
    let info = '<p class="hint">Point at an enemy to see what it does.</p>';
    const e = this.hoverUid !== null ? f.enemies.find((x) => x.uid === this.hoverUid) : undefined;
    if (e) {
      const ed = def(e);
      const it = intent(e, f.act);
      info = `<div class="einfo"><b>${ed.icon} ${ed.name}</b> ${hpBar(e.hp, e.max)}
        <p>Attack ${enemyAtk(e, f.act)} · range ${ed.range} · speed ${ed.speed}${e.shield ? ` · 🛡️ ${e.shield}` : ''}${e.poison ? ` · ☠️ ${e.poison}` : ''}</p>
        <p class="dim">${ed.text}</p>
        <p class="${it.attack ? 'warn' : 'dim'}">Next turn: ${it.attack ? `attacks for ${it.dmg}` : ed.speed ? 'moves closer' : 'charges up'}.</p></div>`;
    }
    return `<div class="orb-card" style="--c:${d.color}">
        <span class="big">${d.icon}</span>
        <div><b>${d.name} ${'★'.repeat(o.lvl - 1)}</b><small>${orbStats(d, o.lvl)}</small><small>${d.text}</small></div>
      </div>
      <div class="next">Next: ${n ? orbName(n) : '🔄 the bag reshuffles'}</div>
      <button data-act="discard" ${f.discards > 0 && this.phase === 'aim' && h.bag.length > 1 ? '' : 'disabled'}>🔁 Swap for the next orb (${f.discards} left)</button>
      ${info}
      <h3>Bag</h3>${this.bagHtml()}
      <p class="hint">${this.phase === 'shot' ? 'Click or press Space to speed up.' : 'Aim with the mouse and click to shoot. On touch, drag and release. Keys: ← → aim, Space shoots.'}</p>
      <p class="legend"><i style="background:${PEG_COLOR.normal}"></i>peg <i style="background:${PEG_COLOR.crit}"></i>crit <i style="background:${PEG_COLOR.refresh}"></i>refresh <i style="background:${PEG_COLOR.bomb}"></i>bomb</p>`;
  }

  private pickHtml(p: Pick, i: number): string {
    const h = this.hero;
    let body = '';
    if (p.kind === 'orb') {
      const d = ORBS[p.id];
      body = `<span class="big">${d.icon}</span><b>New orb: ${d.name}</b><small>${orbStats(d, 1)}</small><small>${d.text}</small>`;
    } else if (p.kind === 'upgrade') {
      const o = h.bag[p.index];
      const d = ORBS[o.id];
      body = `<span class="big">⬆️</span><b>Upgrade ${d.icon} ${d.name}</b><small>${orbStats(d, o.lvl)} → ${orbStats(d, o.lvl + 1)}</small>`;
    } else if (p.kind === 'maxhp') {
      body = `<span class="big">❤️</span><b>+${p.n} max HP</b>`;
    }
    return `<button class="pick" data-act="pick" data-i="${i}">${body}</button>`;
  }

  private rewardView(): string {
    const rw = this.rewards!;
    const relic = rw.relic ? `<p class="good">The elite dropped ${RELICS[rw.relic].icon} <b>${RELICS[rw.relic].name}</b>: ${RELICS[rw.relic].text}</p>` : '';
    const relicChoice = rw.relicChoice.length
      ? `<h3>Choose a relic</h3><div class="picks">${rw.relicChoice
          .map((id) => `<button class="pick ${this.relicPicked ? 'off' : ''}" data-act="relic-pick" data-id="${id}" ${this.relicPicked ? 'disabled' : ''}><span class="big">${RELICS[id].icon}</span><b>${RELICS[id].name}</b><small>${RELICS[id].text}</small></button>`)
          .join('')}</div>`
      : '';
    const picks = this.picked ? '<p class="dim">Reward taken.</p>' : `<div class="picks">${rw.picks.map((p, i) => this.pickHtml(p, i)).join('')}</div>`;
    const canGo = this.picked && (!rw.relicChoice.length || this.relicPicked);
    return `<div class="reward">
      <h2 class="good">Victory!</h2>
      <p>💰 +${rw.gold} gold</p>
      ${relic}${relicChoice}
      <h3>Choose one</h3>${picks}
      ${this.picked ? '' : '<button data-act="skip">Skip</button>'}
      <button class="primary" data-act="advance" ${canGo ? '' : 'disabled'}>Continue ▶</button>
    </div>`;
  }

  private shopView(): string {
    const h = this.hero;
    const items = this.shop
      .map((it, i) => {
        let body = '';
        if (it.kind === 'orb') body = `<span class="big">${ORBS[it.id].icon}</span><b>${ORBS[it.id].name}</b><small>${orbStats(ORBS[it.id], 1)}</small><small>${ORBS[it.id].text}</small>`;
        else if (it.kind === 'relic') body = `<span class="big">${RELICS[it.id].icon}</span><b>${RELICS[it.id].name}</b><small>${RELICS[it.id].text}</small>`;
        else if (it.kind === 'heal') body = `<span class="big">🍖</span><b>Heal ${it.n} HP</b>`;
        else if (it.kind === 'upgrade') body = '<span class="big">⬆️</span><b>Upgrade an orb</b><small>+1 level (max ★★)</small>';
        else body = '<span class="big">🗑️</span><b>Remove an orb</b><small>A smaller bag draws your best orbs more often.</small>';
        const ok = !it.sold && h.gold >= it.cost && (it.kind !== 'remove' || h.bag.length > 2) && (it.kind !== 'upgrade' || upgradable(h).length > 0);
        return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${ok ? '' : 'disabled'}>${body}<span class="cost">${it.sold ? 'Sold' : `💰 ${it.cost}`}</span></button>`;
      })
      .join('');
    return `<div class="shopv"><h2>🛒 Shop</h2><p>💰 ${h.gold} gold</p><div class="picks">${items}</div>
      <h3>Orb bag</h3>${this.bagHtml()}
      <button class="primary" data-act="advance">Leave ▶</button></div>`;
  }

  private restView(): string {
    const h = this.hero;
    const heal = Math.round(h.maxHp * 0.3);
    return `<div class="restv"><h2>🔥 Campfire</h2><p class="sub">Rest by the fire, or work on an orb.</p>
      <div class="picks">
        <button class="pick" data-act="rest-heal"><span class="big">💤</span><b>Rest</b><small>Heal ${heal} HP (now ${h.hp}/${h.maxHp}).</small></button>
        <button class="pick" data-act="rest-up" ${upgradable(h).length ? '' : 'disabled'}><span class="big">⬆️</span><b>Smith</b><small>Upgrade an orb of your choice.</small></button>
      </div>${this.bagHtml()}</div>`;
  }

  private eventView(): string {
    const ev = this.event!;
    const r = this.run!;
    const opts = ev.result
      ? `<p class="result">${ev.result}</p><button class="primary" data-act="advance">Continue ▶</button>`
      : ev.def.options.map((o, i) => `<button data-act="event-opt" data-i="${i}" ${!o.can || o.can(r) ? '' : 'disabled'}>${o.label}</button>`).join('');
    return `<div class="eventv"><span class="huge">${ev.def.icon}</span><h2>${ev.def.title}</h2><p>${ev.def.text}</p><div class="opts">${opts}</div></div>`;
  }

  private treasureView(): string {
    const id = this.treasure;
    return `<div class="eventv"><span class="huge">🎁</span><h2>Treasure</h2>
      ${id ? `<p>You find ${RELICS[id].icon} <b>${RELICS[id].name}</b>: ${RELICS[id].text}</p>` : '<p>The chest is empty.</p>'}<p>💰 +20 gold</p>
      <button class="primary" data-act="advance">Continue ▶</button></div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Victory!' : '💀 Defeat'}</h1>
      <p>${e.victory ? 'The Ember Dragon falls. The pegs are yours.' : `You fell in act ${e.act + 1}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>💎 +${e.shards} shards for the Armory</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Aim and shoot.</b> Each turn you drop one orb from the top. The dotted line shows its path to the first bounce.</li>
          <li><b>Every peg</b> the orb hits adds its damage. When the orb falls out, your hero attacks the closest enemy with the total.</li>
          <li><b>Crit pegs</b> (orange) make every peg of this shot deal crit damage. <b>Refresh pegs</b> (green) bring back all broken pegs. <b>Bombs</b> (red) explode on the second hit, break pegs nearby and hit every enemy.</li>
          <li>Pegs you hit break after the shot. When few pegs are left, the board refreshes by itself.</li>
          <li>Land the orb in the moving <b>bucket</b> for +50% damage.</li>
          <li>Then the enemies act: they walk closer, or attack when in range. The icon above each enemy shows its next move.</li>
          <li>Your orbs come from a bag, like a deck. You can swap the current orb once per fight.</li>
          <li>After fights, take new orbs or upgrades. Relics change the rules. Beat the boss of each act.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'pick') {
      const h = this.hero;
      const list = h.bag
        .map((o, i) => `<button class="pick" data-act="pick-orb" data-i="${i}" ${m.filter(o.lvl) ? '' : 'disabled'}><span class="big">${ORBS[o.id].icon}</span><b>${ORBS[o.id].name} ${'★'.repeat(o.lvl - 1)}</b><small>${orbStats(ORBS[o.id], o.lvl)}</small></button>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop><h2>${m.title}</h2><div class="picks">${list}</div><button data-act="modal-close">Cancel</button></div></div>`;
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
    const maxW = wrap.clientWidth;
    const maxH = window.innerHeight - (window.innerWidth > 860 ? 70 : 60);
    const w = Math.min(maxW, (maxH * LW) / LH, 560);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${w}px`;
    cv.style.height = `${(w * LH) / LW}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(((w * LH) / LW) * dpr);
    this.scale = (w / LW) * dpr;
  }

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (t: number) => {
      if (this.screen !== 'fight' || !this.ctx) {
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

  private update(dt: number): void {
    this.clock += dt * 1000;
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1.1);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < 0.45);
    for (const d of this.dying) d.t += dt;
    this.dying = this.dying.filter((d) => d.t < 0.6);
    for (const [k, v] of this.flash) {
      if (v - dt <= 0) this.flash.delete(k);
      else this.flash.set(k, v - dt);
    }
    this.shake = Math.max(0, this.shake - dt);
    if (this.f) {
      for (const e of this.f.enemies) {
        const target = slotX(e.slot);
        const cur = this.ex.get(e.uid) ?? target + 60;
        this.ex.set(e.uid, cur + (target - cur) * Math.min(1, dt * 8));
      }
    }
    if (this.phase === 'shot' && this.shot && this.f && this.opts) {
      if (FAST) runShot(this.f.board, this.shot, this.opts);
      else {
        this.acc += dt * (this.fastForward ? 3 : 1);
        while (this.acc >= DT && !this.shot.done) {
          stepShot(this.f.board, this.shot, this.opts);
          this.acc -= DT;
        }
      }
      this.shotEvents();
      if (this.shot.done) this.resolveShot();
    }
    const due = this.queue.filter((q) => q.at <= this.clock);
    if (due.length) {
      this.queue = this.queue.filter((q) => q.at > this.clock);
      for (const q of due) q.fn();
    }
  }

  private shotEvents(): void {
    const s = this.shot!;
    if (!s.events.length) return;
    let pings = 0;
    for (const ev of s.events) {
      const y = ev.y + STRIP;
      if (ev.kind === 'peg' || ev.kind === 'crit' || ev.kind === 'refresh' || ev.kind === 'bombhit') {
        this.rings.push({ x: ev.x, y, r: 6, max: 18, color: ev.kind === 'crit' ? PEG_COLOR.crit : ev.kind === 'refresh' ? PEG_COLOR.refresh : '#fff', t: 0 });
        pings++;
      }
      if (ev.kind === 'crit') sfx.crit();
      if (ev.kind === 'refresh') sfx.refresh();
      if (ev.kind === 'bomb') {
        this.rings.push({ x: ev.x, y, r: 10, max: 72, color: PEG_COLOR.bomb, t: 0 });
        sfx.bomb();
      }
      if (ev.kind === 'wall') sfx.wall();
      if (ev.kind === 'bucket') {
        this.floats.push({ x: ev.x, y: y - 20, text: '×1.5!', color: '#ffd166', t: 0, size: 20 });
        sfx.bucket();
      }
    }
    if (pings && !FAST) sfx.peg(s.pegHits);
    s.events = [];
  }

  private draw(): void {
    const ctx = this.ctx;
    const f = this.f;
    if (!ctx || !f) return;
    const h = this.hero;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    const act = ACTS[f.act];

    // Lane
    const g = ctx.createLinearGradient(0, 0, 0, STRIP);
    g.addColorStop(0, act.bg);
    g.addColorStop(1, '#0b0b12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LW, STRIP);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, LANE_Y + 22, LW, 2);
    for (let s = 1; s <= SLOTS; s++) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(slotX(s) - 18, LANE_Y + 24, 36, 3);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sx = this.shake > 0 ? Math.sin(this.clock / 20) * 4 : 0;
    ctx.fillStyle = 'rgba(199, 125, 255, 0.28)';
    ctx.beginPath();
    ctx.arc(HERO_X + sx, LANE_Y, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '30px system-ui';
    ctx.fillText('🦉', HERO_X + sx, LANE_Y + 1);
    this.bar(ctx, HERO_X, LANE_Y + 32, 44, h.hp, h.maxHp, '#7ee08a');
    for (const e of f.enemies) this.drawEnemy(ctx, e);
    for (const d of this.dying) {
      ctx.globalAlpha = 1 - d.t / 0.6;
      ctx.font = `${d.size}px system-ui`;
      ctx.fillText(d.icon, d.x, LANE_Y - d.t * 30);
      ctx.globalAlpha = 1;
    }

    // Damage counter
    const live = this.shot && this.phase === 'shot' ? computeAttack(h, f, this.shot) : this.atk;
    if (live) {
      const parts = [`${live.hits} × ${live.perPeg}`];
      if (live.bucket) parts.push('×1.5');
      if (live.echo) parts.push('×2');
      ctx.font = 'bold 17px system-ui';
      ctx.fillStyle = live.crit ? '#ffb703' : '#fff';
      ctx.fillText(`${live.crit ? 'CRIT! ' : ''}${parts.join(' ')} = ${live.total}${live.bombDmg ? `  💣${live.bombDmg}` : ''}`, LW / 2 + 20, 20);
    }

    // Board
    ctx.save();
    ctx.translate(0, STRIP);
    ctx.fillStyle = '#10131c';
    ctx.fillRect(0, 0, BW, BH + 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(0.5, 0.5, BW - 1, BH + 7);
    for (const p of f.board.pegs) {
      if (p.broken) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      if (p.hit && p.kind !== 'bomb') {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = PEG_COLOR[p.kind];
        ctx.shadowBlur = p.kind === 'normal' ? 0 : 6;
        ctx.shadowColor = PEG_COLOR[p.kind];
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      if (p.kind === 'bomb') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px system-ui';
        ctx.fillText(p.bombHits ? '!' : '✹', p.x, p.y + 0.5);
      }
    }
    // Bucket
    const bt = this.shot ? this.shot.t : 0;
    const bx = bucketX(f.board, bt);
    const bw = f.board.bucketW;
    ctx.fillStyle = 'rgba(255, 209, 102, 0.25)';
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx - bw / 2, BH - 14);
    ctx.lineTo(bx - bw / 2 + 6, BH + 6);
    ctx.lineTo(bx + bw / 2 - 6, BH + 6);
    ctx.lineTo(bx + bw / 2, BH - 14);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1;

    // Aim line and launcher
    const o = ORBS[curOrb(h, f).id];
    if (this.phase === 'aim') {
      this.updatePath();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      this.path.forEach((p, i) => {
        if (i % 2) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.fillStyle = '#2a2f3d';
    ctx.beginPath();
    ctx.arc(LAUNCH.x, LAUNCH.y - 6, 16, 0, Math.PI * 2);
    ctx.fill();
    if (this.phase === 'aim') this.ball(ctx, LAUNCH.x, LAUNCH.y, o.r ?? 7, o.color);
    if (this.shot) for (const b of this.shot.balls) if (b.alive) this.ball(ctx, b.x, b.y, b.r, o.color);
    ctx.restore();

    for (const r of this.rings) {
      const k = r.t / 0.45;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r + (r.max - r.r) * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const fl of this.floats) {
      ctx.globalAlpha = Math.max(0, 1 - fl.t / 1.1);
      ctx.font = `bold ${fl.size}px system-ui`;
      ctx.fillStyle = fl.color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(fl.text, fl.x, fl.y - fl.t * 26);
      ctx.fillText(fl.text, fl.x, fl.y - fl.t * 26);
      ctx.globalAlpha = 1;
    }
  }

  private ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hp: number, max: number, color: string): void {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - w / 2, y - 4, w, 8);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y - 4, (w * Math.max(0, hp)) / max, 8);
    ctx.font = 'bold 9px system-ui';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.max(0, hp)}`, x, y + 0.5);
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: EnemyInst): void {
    const d = def(e);
    const x = this.ex.get(e.uid) ?? slotX(e.slot);
    const big = d.boss ? 40 : 28;
    const fl = this.flash.get(e.uid) ?? 0;
    if (this.hoverUid === e.uid) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x - 22, LANE_Y - 50, 44, 90);
    }
    ctx.font = `${big}px system-ui`;
    ctx.globalAlpha = fl > 0 ? 0.5 + 0.5 * Math.sin(fl * 40) : 1;
    ctx.fillText(d.icon, x, LANE_Y - (d.boss ? 6 : 0));
    ctx.globalAlpha = 1;
    this.bar(ctx, x, LANE_Y + 32, 40, e.hp, e.max, '#ef476f');
    ctx.font = 'bold 11px system-ui';
    if (e.shield) {
      ctx.fillStyle = '#8fd3ff';
      ctx.fillText(`🛡️${e.shield}`, x - 12, LANE_Y + 46);
    }
    if (e.poison) {
      ctx.fillStyle = '#9ef01a';
      ctx.fillText(`☠️${e.poison}`, x + 12, LANE_Y + 46);
    }
    const it = intent(e, this.f!.act);
    ctx.font = 'bold 12px system-ui';
    ctx.fillStyle = it.attack ? '#ff5d7a' : '#93a4bf';
    ctx.fillText(it.attack ? `⚔️${it.dmg}` : d.speed ? '👣' : '⏳', x, LANE_Y - (d.boss ? 38 : 30));
  }

  private updatePath(): void {
    const f = this.f!;
    const h = this.hero;
    const key = `${this.angle.toFixed(4)}|${f.shots}|${f.cur}|${f.board.pegs.filter((p) => p.broken).length}`;
    if (key === this.pathKey) return;
    this.pathKey = key;
    const o = ORBS[curOrb(h, f).id];
    this.path = tracePath(f.board, this.angle, shotOpts(h, o), h.relics.includes('scope') ? 2 : 1);
  }

  // ---------- Fight flow ----------

  private beginFight(room: Room): void {
    const r = this.run!;
    this.f = startFight(r.hero, r.act, roomKind(room), fightSeed(r, room));
    this.phase = 'aim';
    this.shot = null;
    this.atk = null;
    this.floats = [];
    this.rings = [];
    this.dying = [];
    this.ex.clear();
    this.queue = [];
    this.hoverUid = null;
    this.angle = Math.PI / 2;
    this.pathKey = '';
    this.screen = 'fight';
    this.render();
    if (roomKind(room) === 'boss') this.toast(`${ENEMIES[ACTS[r.act].boss].icon} ${ENEMIES[ACTS[r.act].boss].name} blocks the way!`);
  }

  private shoot(): void {
    if (this.phase !== 'aim' || !this.f) return;
    const h = this.hero;
    const o = ORBS[curOrb(h, this.f).id];
    this.opts = shotOpts(h, o);
    this.shot = newShot(this.angle, this.opts);
    this.acc = 0;
    this.fastForward = false;
    this.atk = null;
    this.phase = 'shot';
    sfx.shoot();
    this.refresh();
  }

  private resolveShot(): void {
    const f = this.f!;
    const h = this.hero;
    const s = this.shot!;
    const atk = computeAttack(h, f, s);
    this.atk = atk;
    this.phase = 'resolve';
    const pos = new Map(f.enemies.map((e) => [e.uid, { x: this.ex.get(e.uid) ?? slotX(e.slot), icon: def(e).icon, boss: !!def(e).boss }]));
    this.schedule(250, () => {
      const hits = applyAttack(h, f, atk);
      endShot(f.board, s, f.rng, critCount(h));
      this.shot = null;
      if (!hits.length && atk.total === 0) this.floats.push({ x: LW / 2, y: 60, text: 'Miss', color: '#93a4bf', t: 0, size: 18 });
      for (const hit of hits) {
        const p = pos.get(hit.uid);
        if (!p) continue;
        this.floats.push({ x: p.x, y: LANE_Y - 20, text: hit.dmg > 0 ? `-${hit.dmg}` : '0', color: '#ff5d7a', t: 0, size: 20 });
        if (hit.blocked) this.floats.push({ x: p.x + 16, y: LANE_Y - 40, text: `🛡️${hit.blocked}`, color: '#8fd3ff', t: 0, size: 12 });
        this.flash.set(hit.uid, 0.35);
        if (hit.killed) this.dying.push({ icon: p.icon, x: p.x, t: 0, size: p.boss ? 40 : 28 });
      }
      if (hits.length) sfx.hit();
      if (atk.heal) {
        this.floats.push({ x: HERO_X, y: LANE_Y - 30, text: `+${atk.heal}`, color: '#7ee08a', t: 0, size: 16 });
        sfx.heal();
      }
      if (atk.gold) this.floats.push({ x: HERO_X + 30, y: LANE_Y - 44, text: `+${atk.gold}💰`, color: '#ffd166', t: 0, size: 13 });
      this.refresh();
      this.schedule(650, () => (f.enemies.length ? this.enemyPhase() : this.winFight()));
    });
  }

  private enemyPhase(): void {
    const f = this.f!;
    const h = this.hero;
    this.phase = 'enemy';
    const pos = new Map(f.enemies.map((e) => [e.uid, { x: slotX(e.slot), icon: def(e).icon }]));
    const evs = enemyTurn(h, f);
    let i = 0;
    for (const ev of evs) {
      const p = pos.get(ev.uid);
      const x = p?.x ?? slotX(1);
      this.schedule(i * 240, () => {
        switch (ev.kind) {
          case 'poison':
            this.floats.push({ x, y: LANE_Y - 20, text: `☠️-${ev.dmg}`, color: '#9ef01a', t: 0, size: 15 });
            if (ev.killed && p) this.dying.push({ icon: p.icon, x, t: 0, size: 28 });
            break;
          case 'attack':
            this.shake = 0.3;
            this.floats.push({ x: HERO_X, y: LANE_Y - 26, text: `-${ev.dmg}`, color: '#ff5d7a', t: 0, size: 20 });
            sfx.hurt();
            if (ev.explode && p) this.dying.push({ icon: '💥', x, t: 0, size: 32 });
            if (ev.thorns) this.floats.push({ x, y: LANE_Y - 20, text: `🌹-${ev.thorns.dmg}`, color: '#ff5d7a', t: 0, size: 14 });
            if (ev.thorns?.killed && p) this.dying.push({ icon: p.icon, x, t: 0, size: 28 });
            break;
          case 'heal':
          case 'regen': {
            const tx = this.ex.get(ev.target) ?? x;
            this.floats.push({ x: tx, y: LANE_Y - 20, text: `+${ev.amount}`, color: '#7ee08a', t: 0, size: 15 });
            break;
          }
          case 'shield':
            this.floats.push({ x, y: LANE_Y - 20, text: `🛡️${ev.amount}`, color: '#8fd3ff', t: 0, size: 14 });
            sfx.shield();
            break;
          case 'summon':
            this.floats.push({ x, y: LANE_Y - 40, text: '✨', color: '#fff', t: 0, size: 18 });
            break;
          case 'move':
            sfx.step();
            break;
        }
        this.refresh();
      });
      if (ev.kind !== 'move') i++;
    }
    this.schedule(i * 240 + 350, () => {
      if (h.hp <= 0) return this.loseFight();
      if (!f.enemies.length) return this.winFight();
      drawOrb(h, f);
      this.atk = null;
      this.phase = 'aim';
      this.pathKey = '';
      this.refresh();
    });
  }

  private winFight(): void {
    const r = this.run!;
    const f = this.f!;
    this.phase = 'over';
    sfx.win();
    this.schedule(900, () => {
      r.kills += f.kills;
      r.fights++;
      const kind: FightKind = f.kind;
      this.rewards = fightRewards(r, kind);
      r.hero.gold += this.rewards.gold;
      if (this.rewards.relic) addRelic(r.hero, this.rewards.relic);
      this.picked = false;
      this.relicPicked = false;
      this.f = null;
      this.screen = 'reward';
      this.render();
    });
  }

  private loseFight(): void {
    this.phase = 'over';
    sfx.lose();
    this.schedule(1300, () => {
      this.run!.kills += this.f!.kills;
      this.endRun(false);
    });
  }

  // ---------- Run flow ----------

  private nextStep(): void {
    const r = this.run!;
    if (advance(r)) return this.endRun(true);
    saveRun(r);
    this.screen = 'map';
    this.render();
  }

  private enterRoom(room: Room): void {
    const r = this.run!;
    switch (room) {
      case 'fight':
      case 'elite':
      case 'boss':
        this.beginFight(room);
        return;
      case 'shop':
        this.shop = makeShop(r);
        this.screen = 'shop';
        break;
      case 'rest':
        this.screen = 'rest';
        break;
      case 'event':
        this.event = { def: pickEvent(r), result: null };
        this.screen = 'event';
        break;
      case 'treasure': {
        const id = randomRelics(r, rngFor(r, 'treasure', r.act, r.step), 1)[0] ?? null;
        if (id) addRelic(r.hero, id);
        r.hero.gold += 20;
        this.treasure = id;
        this.screen = 'treasure';
        sfx.item();
        break;
      }
    }
    this.render();
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const sc = score(r, victory);
    const shards = shardsFor(sc);
    const m = this.meta;
    m.shards += shards;
    m.best = Math.max(m.best, sc);
    m.bestAct = Math.max(m.bestAct, Math.min(3, r.act + (victory ? 0 : 1)));
    if (victory) m.wins++;
    saveMeta(m);
    clearRun();
    this.end = { victory, score: sc, shards, act: Math.min(r.act, 2) };
    this.run = null;
    this.f = null;
    this.screen = 'end';
    if (victory) sfx.win();
    this.render();
  }

  // ---------- Input ----------

  private toBoard(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const cv = this.canvas;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * LW, y: ((e.clientY - r.top) / r.height) * LH };
  }

  private aimAt(p: { x: number; y: number }): void {
    const by = p.y - STRIP;
    const a = Math.atan2(Math.max(by - LAUNCH.y, 1), p.x - LAUNCH.x);
    this.angle = clampAngle(a);
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if (this.screen !== 'fight' || e.target !== this.canvas) return;
    const p = this.toBoard(e)!;
    if (this.phase === 'shot') {
      this.fastForward = true;
      return;
    }
    if (this.phase !== 'aim' || p.y < STRIP) return;
    if (e.pointerType !== 'mouse') {
      this.aiming = true;
      this.aimAt(p);
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.screen !== 'fight' || !this.canvas) return;
    const p = this.toBoard(e)!;
    if (p.y < STRIP && p.y > 0 && p.x > 0 && p.x < LW && this.f) {
      const near = this.f.enemies.map((x) => ({ x, d: Math.abs((this.ex.get(x.uid) ?? slotX(x.slot)) - p.x) })).sort((a, b) => a.d - b.d)[0];
      const uid = near && near.d < 24 ? near.x.uid : null;
      if (uid !== this.hoverUid) {
        this.hoverUid = uid;
        this.refresh();
      }
    }
    if (this.phase !== 'aim') return;
    if (e.pointerType === 'mouse' ? e.target === this.canvas && p.y >= STRIP : this.aiming) this.aimAt(p);
  }

  private onUp(e: PointerEvent): void {
    if (this.screen !== 'fight') return;
    if (e.pointerType === 'mouse') {
      if (e.target === this.canvas && this.phase === 'aim' && this.toBoard(e)!.y >= STRIP) this.shoot();
      return;
    }
    if (this.aiming) {
      this.aiming = false;
      this.shoot();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'fight') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const d = (e.shiftKey ? 0.08 : 0.015) * (e.key === 'ArrowLeft' ? 1 : -1);
      this.angle = clampAngle(this.angle + d);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (this.phase === 'aim') this.shoot();
      else if (this.phase === 'shot') this.fastForward = true;
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
        this.endRun(false);
        return;
      case 'title':
        this.modal = null;
        this.f = null;
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
        this.screen = 'map';
        this.render();
        return;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.shards < cost) return sfx.deny();
        this.meta.shards -= cost;
        this.meta.unlocked.push(id);
        saveMeta(this.meta);
        sfx.item();
        this.render();
        return;
      }
      case 'room':
        this.enterRoom(d.room as Room);
        return;
      case 'discard':
        if (this.f && this.phase === 'aim' && discard(this.hero, this.f)) {
          this.pathKey = '';
          sfx.step();
          this.refresh();
        }
        return;
      case 'pick': {
        if (this.picked || !this.rewards) return;
        applyPick(this.hero, this.rewards.picks[+d.i!]);
        this.picked = true;
        sfx.item();
        this.render();
        return;
      }
      case 'skip':
        this.picked = true;
        this.render();
        return;
      case 'relic-pick':
        if (this.relicPicked) return;
        addRelic(this.hero, d.id!);
        this.relicPicked = true;
        sfx.item();
        this.render();
        return;
      case 'advance':
        this.nextStep();
        return;
      case 'buy':
        this.buy(+d.i!);
        return;
      case 'rest-heal':
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.3));
        sfx.heal();
        this.nextStep();
        return;
      case 'rest-up':
        this.modal = {
          kind: 'pick',
          title: 'Upgrade which orb?',
          filter: (lvl) => lvl < 3,
          done: (i) => {
            this.hero.bag[i].lvl++;
            sfx.item();
            this.nextStep();
          },
        };
        this.render();
        return;
      case 'pick-orb': {
        const m = this.modal;
        if (m?.kind !== 'pick') return;
        this.modal = null;
        m.done(+d.i!);
        return;
      }
      case 'event-opt': {
        const ev = this.event!;
        const opt = ev.def.options[+d.i!];
        if (opt.can && !opt.can(r!)) return;
        ev.result = opt.run(r!, rngFor(r!, 'event-result', r!.act, r!.step));
        sfx.item();
        this.render();
        return;
      }
    }
  }

  private buy(i: number): void {
    const h = this.hero;
    const it = this.shop[i];
    if (!it || it.sold || h.gold < it.cost) return sfx.deny();
    const pay = () => {
      h.gold -= it.cost;
      it.sold = true;
      sfx.coin();
    };
    if (it.kind === 'orb') {
      pay();
      h.bag.push({ id: it.id, lvl: 1 });
    } else if (it.kind === 'relic') {
      pay();
      addRelic(h, it.id);
    } else if (it.kind === 'heal') {
      pay();
      h.hp = Math.min(h.maxHp, h.hp + it.n);
    } else {
      const remove = it.kind === 'remove';
      this.modal = {
        kind: 'pick',
        title: remove ? 'Remove which orb?' : 'Upgrade which orb?',
        filter: (lvl) => remove || lvl < 3,
        done: (idx) => {
          pay();
          if (remove) h.bag.splice(idx, 1);
          else h.bag[idx].lvl++;
          this.render();
        },
      };
    }
    this.render();
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const bestAngle = (k: number): number => {
      const f = this.f!;
      const h = this.hero;
      const o = ORBS[curOrb(h, f).id];
      const so = shotOpts(h, o);
      let best = Math.PI / 2;
      let bs = -1;
      for (let i = 0; i < k; i++) {
        const a = 0.15 + Math.random() * (Math.PI - 0.3);
        const b2: Board = { ...f.board, pegs: f.board.pegs.map((p) => ({ ...p })) };
        const s = newShot(a, so);
        runShot(b2, s, so);
        const at = computeAttack(h, f, s);
        const sc = at.total * (o.pierce ? f.enemies.length : 1) + at.bombDmg * f.enemies.length;
        if (sc > bs) {
          bs = sc;
          best = a;
        }
      }
      return best;
    };
    const api = {
      state: () => ({
        screen: this.screen,
        phase: this.phase,
        modal: this.modal?.kind ?? null,
        act: this.run?.act,
        step: this.run?.step,
        hp: this.run?.hero.hp,
        gold: this.run?.hero.gold,
        enemies: this.f?.enemies.map((e) => `${e.id} ${e.hp}/${e.max} @${e.slot}`) ?? null,
        end: this.end,
      }),
      gold: (n: number) => {
        if (this.run) this.run.hero.gold += n;
        this.refresh();
      },
      relic: (id: string) => {
        if (this.run) addRelic(this.run.hero, id);
        this.refresh();
      },
      shards: (n: number) => {
        this.meta.shards += n;
        saveMeta(this.meta);
        this.render();
      },
      win: () => {
        if (!this.f) return;
        this.f.enemies = [];
        this.winFight();
      },
      /** One bot action for automatic tests. */
      step: (k = 6) => {
        const click = (sel: string): boolean => {
          const el = this.root.querySelector<HTMLElement>(sel);
          el?.click();
          return !!el;
        };
        if (this.modal) {
          if (!click('.modal [data-act="pick-orb"]:not([disabled])')) click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'map': {
            const h = this.hero;
            const rest = this.root.querySelector<HTMLElement>('[data-room="rest"]');
            if (rest && h.hp < h.maxHp * 0.7) rest.click();
            else click('[data-act="room"]');
            return 'room';
          }
          case 'fight':
            if (this.phase !== 'aim') return 'busy';
            this.angle = bestAngle(k);
            this.shoot();
            return 'shot';
          case 'reward':
            if (!this.relicPicked && this.rewards?.relicChoice.length) click('[data-act="relic-pick"]');
            if (!this.picked) click('[data-act="pick"]');
            click('[data-act="advance"]');
            return 'reward';
          case 'shop':
          case 'treasure':
            click('[data-act="advance"]');
            return this.screen;
          case 'rest':
            click('[data-act="rest-heal"]');
            return 'rest';
          case 'event':
            if (!click('[data-act="event-opt"]:not([disabled])')) click('[data-act="advance"]');
            return 'event';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { peg: typeof api }).peg = api;
  }
}
