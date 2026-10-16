import { CARDS, ENEMIES, LAST_WAVE, RELICS, TARGETS, TARGET_NAME, TOWERS, TOWER_IDS, type TowerId } from './data';
import { botCard, botSpend } from './bot';
import {
  DT,
  ENRAGE,
  applyCard,
  battleOver,
  build,
  buildCost,
  canBuildAt,
  crystalsFor,
  finishWave,
  growAfterWave,
  makeOffers,
  mapInfo,
  newRun,
  offerGold,
  score,
  sell,
  sellValue,
  startWave,
  stepBattle,
  towerAt,
  towerStats,
  upgrade,
  upgradeCost,
  waveSpec,
  type Battle,
  type Offer,
  type RunState,
  type Tower,
  type WaveResult,
} from './game';
import { CELLS, TILE, cellIdx, type Cell, type MapInfo } from './map';
import { Rng, hash, randomSeedText } from './rng';
import { UNLOCKS, clearRun, loadMeta, loadRun, saveMeta, saveRun, towerPool, unlockCost } from './run';
import { initAudio, isMuted, setMuted, sfx } from './sfx';

type Screen = 'title' | 'play' | 'cards' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}
interface Fx {
  kind: 'beam' | 'chain' | 'ring' | 'flame' | 'fill';
  t: number;
  max: number;
  color: string;
  pts: number[];
  r: number;
  a: number;
  cone: number;
}

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` lets the bot simulate whole waves in one step. */
const FAST = PARAMS.has('fast');
const DEBUG = PARAMS.has('debug');
const MUTE_KEY = 'last-bastion.mute';

/** Pixels per cell in the cached terrain image. */
const TPX = 32;

const CELL_COLOR: Record<Cell, string> = {
  void: '#0b1414',
  grass: '#2e5e44',
  hill: '#5b7a45',
  forest: '#244a33',
  rock: '#4a5150',
  pond: '#2a6f97',
  path: '#a68a5b',
  ford: '#6f9bb0',
  core: '#a68a5b',
};

const shortNum = (n: number): string => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

function cardText(run: RunState, o: Offer): { icon: string; name: string; text: string; rare: boolean } {
  const c = CARDS[o.id];
  const tn = o.arg ? `${TOWERS[o.arg].icon} ${TOWERS[o.arg].name}` : '';
  let text = c.text.replace(/\{t\}/g, tn);
  if (o.id === 'gold') text = `Gain ${offerGold(run)} gold now.`;
  if (o.id === 'unlock' && o.arg) text += ` ${TOWERS[o.arg].text}`;
  return { icon: o.id === 'unlock' && o.arg ? TOWERS[o.arg].icon : c.icon, name: c.name.replace(/\{t\}/g, o.arg ? TOWERS[o.arg].name : ''), text, rare: !!c.rare };
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private battle: Battle | null = null;
  private speed = 1;
  private paused = false;
  private armed: TowerId | null = null;
  private sel: number | null = null;
  private hover: { x: number; y: number } | null = null;
  private cursor: { x: number; y: number } | null = null;
  private lastWave: WaveResult | null = null;
  private end: { victory: boolean; score: number; crystals: number; wave: number; kills: number } | null = null;

  // Canvas and effects
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private terrain: HTMLCanvasElement | null = null;
  private terrainKey = '';
  private size = 400;
  private cam = { x: 0, y: 0, s: 12 };
  private raf = 0;
  private last = 0;
  private acc = 0;
  private clock = 0;
  private floats: Float[] = [];
  private fx: Fx[] = [];
  private kick = new Map<number, number>();
  private shake = 0;
  private coreFlash = 0;
  private newTile: { i: number; t: number } | null = null;
  private hudKey = '';
  private down: { x: number; y: number; id: number } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === '1');
    } catch {
      /* ignore */
    }
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerup', (e) => this.onUp(e));
    root.addEventListener('pointerleave', () => (this.hover = null));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    if (DEBUG) this.installDebug();
    this.render();
  }

  // ---------- DOM ----------

  private render(): void {
    let body = '';
    const inGame = this.screen === 'play' || this.screen === 'cards';
    if (this.screen === 'title') body = this.titleView();
    else if (this.screen === 'end') body = this.endView();
    else
      body = `<div class="play"><div class="board" id="board"><canvas id="cv"></canvas><div id="banner" class="banner"></div></div>
        <aside class="side" id="side">${this.sideView()}</aside></div>`;
    const top = inGame ? this.topBar() : '';
    const over = this.screen === 'cards' ? this.cardsView() : this.modal ? this.modalView() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${over}`;
    this.hudKey = '';
    if (inGame) {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.resize();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private refreshSide(): void {
    const side = this.root.querySelector<HTMLElement>('#side');
    if (side) side.innerHTML = this.sideView();
    this.hudKey = '';
    this.hud();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private banner(text: string, boss = false): void {
    const el = this.root.querySelector<HTMLElement>('#banner');
    if (!el) return;
    el.textContent = text;
    el.className = `banner ${boss ? 'boss' : ''}`;
    void el.offsetWidth;
    el.classList.add('show');
  }

  private topBar(): string {
    return `<header class="top">
      <span id="h-core" title="Core HP"></span>
      <span id="h-gold" title="Gold"></span>
      <span id="h-wave" title="Wave"></span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play (H)">?</button>
      <button class="icon-btn" data-act="mute" title="Sound (M)">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>
    </header>`;
  }

  /** Update the numbers and button states in place. Cheap, runs every frame but only writes on change. */
  private hud(): void {
    const r = this.run;
    if (!r || (this.screen !== 'play' && this.screen !== 'cards')) return;
    const b = this.battle;
    const left = b ? b.enemies.length + b.spawns.length - b.si : 0;
    const key = `${r.core}|${r.gold}|${r.wave}|${!!b}|${left}|${this.paused}|${this.speed}|${r.coreMax}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    const set = (id: string, html: string): void => {
      const el = this.root.querySelector<HTMLElement>(`#${id}`);
      if (el && el.innerHTML !== html) el.innerHTML = html;
    };
    set('h-core', `❤️ ${Math.max(0, r.core)}/${r.coreMax}`);
    set('h-gold', `💰 ${r.gold}`);
    set('h-wave', `🌊 ${b ? b.wave : r.wave + 1}/${LAST_WAVE}${r.endless ? '+' : ''}`);
    set('go', b ? (this.paused ? '▶ Resume' : '⏸ Pause') : `⚔️ Start wave ${r.wave + 1}`);
    set('left', b ? `Wave ${b.wave}: ${left} enemies left${b.t > ENRAGE ? ' · <b class="bad">enraged!</b>' : ''}` : 'Build, then start the wave.');
    this.root.querySelector('#go')?.classList.toggle('primary', !b || this.paused);
    this.root.querySelectorAll<HTMLButtonElement>('[data-act="speed"]').forEach((el) => el.classList.toggle('on', Number(el.dataset.v) === this.speed));
    this.root.querySelectorAll<HTMLButtonElement>('[data-cost]').forEach((el) => {
      el.disabled = r.gold < Number(el.dataset.cost) || el.dataset.lock === '1';
    });
  }

  private titleView(): string {
    const m = this.meta;
    const armory = UNLOCKS.map((id) => {
      const tw = TOWERS[id as TowerId];
      const rl = RELICS[id];
      const icon = tw ? tw.icon : rl.icon;
      const name = tw ? tw.name : rl.name;
      const text = tw ? `Tower: ${tw.text}` : `Starting relic: ${rl.text}`;
      const own = m.unlocked.includes(id);
      const cost = unlockCost(id);
      let right = own ? '<span class="ok">✔ Unlocked</span>' : `<button data-act="unlock" data-id="${id}" ${m.crystals >= cost ? '' : 'disabled'}>💎 ${cost}</button>`;
      if (own && rl) right = `<button class="${m.relic === id ? 'primary' : ''}" data-act="relic" data-id="${id}">${m.relic === id ? '✔ Taken' : 'Take'}</button>`;
      return `<div class="arm ${own && tw ? 'own' : ''}"><span class="big">${icon}</span><span><b>${name}</b><small>${text}</small></span>${right}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <h1><span>🏰</span> Last Bastion</h1>
      <p class="sub">Enemies walk the path to your core. Build towers next to it. The path grows longer every wave. Hold out for ${LAST_WAVE} waves.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (wave ${r.wave + 1}, ❤️ ${r.core})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best wave ${m.bestWave} · Best score ${m.best} · Kills ${m.kills}</p>
      <h2>Armory <small>💎 ${m.crystals} crystals</small></h2>
      <p class="sub">Each run gives crystals. Unlock towers for later runs, and take one starting relic.</p>
      <div class="armory">${armory}</div>
    </div>`;
  }

  private previewHtml(n: number): string {
    const r = this.run!;
    const spec = waveSpec(r.seed, n);
    const chips = spec.list
      .map(({ type, count }) => {
        const d = ENEMIES[type];
        return `<span class="chip ${d.boss ? 'boss' : ''}" title="${d.name}: ${d.text}">${d.icon} ${d.boss ? d.name : `×${count}`}</span>`;
      })
      .join('');
    return `<div class="preview"><b>${spec.boss ? '☠️ Boss wave' : 'Wave'} ${n}</b><div class="chips">${chips}</div></div>`;
  }

  private sideView(): string {
    const r = this.run;
    if (!r) return '';
    const b = this.battle;
    const controls = `<div class="controls">
      <button id="go" data-act="go"></button>
      ${[1, 2, 3].map((v) => `<button class="spd" data-act="speed" data-v="${v}">${v}×</button>`).join('')}
    </div><p class="hint" id="left"></p>`;
    const next = b ? this.previewHtml(b.wave + 1) : this.previewHtml(r.wave + 1);
    const buildBar = TOWER_IDS.map((id, i) => {
      const d = TOWERS[id];
      const own = r.have.includes(id);
      const cost = buildCost(r, id);
      return `<button class="tw ${this.armed === id ? 'armed' : ''} ${own ? '' : 'locked'}" data-act="arm" data-t="${id}" data-cost="${cost}" data-lock="${own ? 0 : 1}"
        title="${d.name} (${i + 1}): ${d.text}${own ? '' : ' Win it from a card.'}"><span class="ic">${own ? d.icon : '🔒'}</span><small>${own ? `💰${cost}` : d.name}</small></button>`;
    }).join('');
    return `${controls}
      <div class="sect"><h3>${b ? 'Next up' : 'Coming'}</h3>${next}</div>
      <div class="sect"><h3>Build</h3><div class="build">${buildBar}</div></div>
      <div class="sect" id="selp">${this.selView()}</div>`;
  }

  private statLine(t: Tower): string {
    const r = this.run!;
    const s = towerStats(r, t, mapInfo(r));
    const parts = [`⚔️ ${s.dmg.toFixed(s.dmg < 10 ? 1 : 0)}`, `⏱ ${s.rate.toFixed(2)}/s`, `🎯 ${s.range.toFixed(1)}`];
    if (t.type === 'mortar') parts.push(`💥 ${s.splash.toFixed(1)}${s.shells > 1 ? ` ×${s.shells}` : ''}`);
    if (t.type === 'tesla') parts.push(`⛓ ${s.chain}`);
    if (t.type === 'frost') parts.push(`🐌 ${Math.round(Math.min(0.7, s.slow) * 100)}%`);
    if (t.type === 'flame') parts.push(`🔥 ${s.burn.toFixed(0)}/s`);
    if (s.multi > 1) parts.push(`×${s.multi} targets`);
    if (s.pierce) parts.push('ignores armor');
    if (s.stun) parts.push(`stun ${s.stun}s`);
    return parts.join(' · ');
  }

  private selView(): string {
    const r = this.run!;
    const t = this.sel !== null ? r.towers.find((x) => x.id === this.sel) : undefined;
    if (!t) {
      if (this.armed) {
        const d = TOWERS[this.armed];
        return `<p><b>${d.icon} ${d.name}</b> · ${d.text}</p><p class="hint">Tap a free cell next to the path to build. Hills give +1 range. Tap the button again or press Esc to stop.</p>`;
      }
      return `<p class="hint">Pick a tower and tap a green cell to build. Tap a tower to upgrade it, change its target or sell it.<br>Keys: 1–5 towers · Space start/pause · F speed · arrows + Enter build · T target · Q/E upgrade · S sell.</p>`;
    }
    const d = TOWERS[t.type];
    const cost = upgradeCost(r, t);
    let ups = '';
    if (t.lvl >= 4) ups = '<p class="ok">Max level</p>';
    else if (t.branch < 0)
      ups = `<div class="ups">${d.branches
        .map((br, i) => `<button class="up" data-act="up" data-b="${i}" data-cost="${cost}"><b>${br.name}: ${br.nodes[0].name}</b><small>${br.nodes[0].text}</small><span class="cost">💰 ${cost}</span></button>`)
        .join('')}</div>`;
    else {
      const node = d.branches[t.branch].nodes[t.lvl - 1];
      ups = `<div class="ups"><button class="up" data-act="up" data-b="${t.branch}" data-cost="${cost}"><b>${node.name}</b><small>${node.text}</small><span class="cost">💰 ${cost}</span></button></div>`;
    }
    const path = t.branch >= 0 ? d.branches[t.branch].name : 'Base';
    const targets = TARGETS.map((m) => `<button class="tg ${t.target === m ? 'on' : ''}" data-act="target" data-m="${m}">${TARGET_NAME[m]}</button>`).join('');
    return `<div class="tinfo"><span class="big">${d.icon}</span><div><b>${d.name}</b> <span class="lvl">Lv ${t.lvl} · ${path}</span>
        <small>${this.statLine(t)}</small><small>Kills ${t.kills} · damage ${shortNum(t.dmg)}</small></div>
        <button class="icon-btn" data-act="desel" title="Close (Esc)">✕</button></div>
      <div class="tgs">${targets}</div>
      ${ups}
      <button class="sellb" data-act="sell">Sell for 💰 ${sellValue(r, t)}</button>`;
  }

  private cardsView(): string {
    const r = this.run!;
    const lw = this.lastWave;
    const cards = (r.offers ?? [])
      .map((o, i) => {
        const c = cardText(r, o);
        return `<button class="pick card ${c.rare ? 'rare' : ''}" data-act="card" data-i="${i}"><span class="big">${c.icon}</span><b>${c.name}</b><small>${c.text}</small><span class="key">${i + 1}</span></button>`;
      })
      .join('');
    const gold = lw ? `💰 +${lw.bonus} gold${lw.interest ? ` · 🏦 +${lw.interest} interest` : ''}` : '';
    return `<div class="modal cards-m"><div class="sheet">
      <h2 class="good">Wave ${r.wave} cleared!</h2>
      <p>${gold}</p>
      <h3>Choose one card</h3>
      <div class="picks">${cards}</div>
      ${this.previewHtml(r.wave + 1)}
      <p class="hint">After your pick, the path grows by one tile.</p>
    </div></div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Victory!' : '💀 The core falls'}</h1>
      <p>${e.victory ? `You held the bastion for ${e.wave} waves.` : `You held out until wave ${e.wave + 1}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>Waves cleared ${e.wave} · Kills ${e.kills}</p>
      <p>💎 +${e.crystals} crystals for the Armory</p>
      ${e.victory ? '<button class="primary" data-act="endless">♾️ Continue in endless mode</button>' : ''}
      <button class="${e.victory ? '' : 'primary'}" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const towers = TOWER_IDS.map((id) => `<li>${TOWERS[id].icon} <b>${TOWERS[id].name}</b> (💰${TOWERS[id].cost}): ${TOWERS[id].text}</li>`).join('');
      const foes = Object.values(ENEMIES)
        .filter((e) => !e.boss)
        .map((e) => `<li>${e.icon} <b>${e.name}</b>: ${e.text}</li>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Hold the core.</b> Enemies walk the path from the purple portals to your 🏰 core. Each one that gets there costs core HP. At 0 HP the run ends.</li>
          <li><b>Build.</b> Pick a tower below the map, then tap a free green cell. Each tower of a type makes the next one of that type cost 10% more.</li>
          <li><b>Upgrade.</b> Tap a tower. The first upgrade picks one of two branches. Each tower goes up to level 4. You can also set its target (first, last, strong, close) or sell it.</li>
          <li><b>Waves.</b> Press Start wave. Use pause and 1×/2×/3× speed. The panel shows the next wave in advance.</li>
          <li><b>Cards.</b> After each wave, pick one of three cards: a new tower, a tower boost or a global buff. Boss waves give rare cards.</li>
          <li><b>The map grows.</b> After each wave the path gets one more tile. Some waves start a new branch with its own portal.</li>
          <li><b>Terrain.</b> Hills (light green) give +1 range. Forest blocks 30% of straight shots that pass over it. Fords (blue path) slow enemies.</li>
          <li><b>Bosses</b> come every 10 waves. Survive wave ${LAST_WAVE} to win, then go on in endless mode.</li>
        </ul>
        <h3>Towers</h3><ul>${towers}</ul>
        <h3>Enemies</h3><ul>${foes}</ul>
        <p class="hint">Keys: 1–5 pick tower · Esc cancel · Space start wave / pause · F speed · arrows move the cursor, Enter builds or selects · T target · Q/E upgrade left/right branch · S sell · H help · M mute.</p>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run${this.battle ? ', the wave restarts' : ''})</button>
    </div></div>`;
  }

  // ---------- Canvas ----------

  private resize(): void {
    const cv = this.canvas;
    const board = this.root.querySelector<HTMLElement>('#board');
    if (!cv || !board) return;
    const wide = window.innerWidth > 860;
    const availW = board.clientWidth;
    const availH = wide ? window.innerHeight - 70 : availW;
    this.size = Math.max(200, Math.floor(Math.min(availW, availH, 900)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = this.size * dpr;
    cv.height = this.size * dpr;
    cv.style.width = `${this.size}px`;
    cv.style.height = `${this.size}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private camTarget(info: MapInfo): { x: number; y: number; s: number } {
    const bd = info.bounds;
    const s = Math.max(bd.x1 - bd.x0, bd.y1 - bd.y0, 9) + 0.6;
    return { x: (bd.x0 + bd.x1) / 2 - s / 2, y: (bd.y0 + bd.y1) / 2 - s / 2, s };
  }

  private startLoop(): void {
    if (this.raf) return;
    if (this.run) this.cam = this.camTarget(mapInfo(this.run));
    this.last = performance.now();
    const tick = (now: number): void => {
      if (!this.canvas) {
        this.raf = 0;
        return;
      }
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      this.hud();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private update(dt: number): void {
    const r = this.run;
    if (!r) return;
    this.clock += dt;
    const b = this.battle;
    if (b && !this.paused && !this.modal && this.screen === 'play') {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= DT && n++ < 12) {
        this.acc -= DT;
        stepBattle(r, b, DT);
        this.handleEvents(b);
        if (battleOver(r, b)) {
          this.endWave();
          break;
        }
      }
    }
    const fdt = dt * (b && !this.paused ? Math.max(1, this.speed * 0.7) : 1);
    for (const f of this.floats) f.t += fdt;
    this.floats = this.floats.filter((f) => f.t < 1);
    for (const f of this.fx) f.t += fdt;
    this.fx = this.fx.filter((f) => f.t < f.max);
    for (const [id, k] of this.kick) {
      if (k - fdt <= 0) this.kick.delete(id);
      else this.kick.set(id, k - fdt);
    }
    this.shake = Math.max(0, this.shake - dt);
    this.coreFlash = Math.max(0, this.coreFlash - dt);
    if (this.newTile) {
      this.newTile.t += dt;
      if (this.newTile.t > 2) this.newTile = null;
    }
    const tgt = this.camTarget(mapInfo(r));
    const k = Math.min(1, dt * 3);
    this.cam.x += (tgt.x - this.cam.x) * k;
    this.cam.y += (tgt.y - this.cam.y) * k;
    this.cam.s += (tgt.s - this.cam.s) * k;
  }

  private addFx(f: Partial<Fx> & { kind: Fx['kind']; max: number }): void {
    if (this.fx.length > 220) return;
    this.fx.push({ t: 0, color: '#fff', pts: [], r: 0, a: 0, cone: 0, ...f });
  }

  private float(x: number, y: number, text: string, color: string, size = 13): void {
    if (this.floats.length > 70) this.floats.shift();
    this.floats.push({ x, y, text, color, t: 0, size });
  }

  private handleEvents(b: Battle): void {
    for (const ev of b.events) {
      switch (ev.k) {
        case 'fire':
          this.kick.set(ev.id, 0.15);
          if (ev.t === 'mortar') sfx.mortar();
          break;
        case 'shot':
          this.addFx({ kind: 'beam', max: 0.14, color: ev.t === 'frost' ? '#bde0fe' : '#ffe8a3', pts: [ev.x0, ev.y0, ev.x1, ev.y1] });
          if (ev.t === 'frost') sfx.frost();
          else sfx.ballista();
          break;
        case 'chain':
          this.addFx({ kind: 'chain', max: 0.22, color: '#d0b3ff', pts: ev.pts });
          sfx.zap();
          break;
        case 'boom':
          this.addFx({ kind: 'ring', max: 0.35, color: '#ff9f43', pts: [ev.x, ev.y], r: ev.r });
          sfx.boom();
          break;
        case 'frost':
          this.addFx({ kind: 'ring', max: 0.4, color: '#bde0fe', pts: [ev.x, ev.y], r: ev.r });
          sfx.frost();
          break;
        case 'flame':
          this.addFx({ kind: 'flame', max: 0.22, color: '#ff7b00', pts: [ev.x, ev.y], r: ev.r, a: ev.a, cone: ev.cone });
          sfx.flame();
          break;
        case 'kill':
          this.float(ev.x, ev.y - 0.3, `+${ev.gold}`, '#ffd166', ev.boss ? 20 : 12);
          if (ev.boss) {
            this.shake = 0.5;
            this.addFx({ kind: 'ring', max: 0.8, color: '#ffd166', pts: [ev.x, ev.y], r: 3 });
            this.toast('👑 The boss falls!');
            sfx.clear();
          } else sfx.kill();
          break;
        case 'leak': {
          const c = mapInfo(this.run!).core;
          this.float(c.x, c.y - 0.6, `-${ev.n} ❤️`, '#ef476f', 16);
          this.shake = Math.max(this.shake, ev.n >= 5 ? 0.6 : 0.25);
          this.coreFlash = 0.5;
          sfx.leak();
          break;
        }
        case 'heal':
          this.addFx({ kind: 'ring', max: 0.5, color: '#7ee08a', pts: [ev.x, ev.y], r: 1.6 });
          sfx.heal();
          break;
        case 'block':
          this.float(ev.x, ev.y, '🌲 miss', '#a8c6a0', 10);
          sfx.block();
          break;
      }
    }
    b.events.length = 0;
  }

  private buildTerrain(info: MapInfo): void {
    const key = `${this.run!.seed}:${this.run!.map.tiles.length}`;
    if (this.terrain && this.terrainKey === key) return;
    this.terrainKey = key;
    const c = this.terrain ?? document.createElement('canvas');
    c.width = CELLS * TPX;
    c.height = CELLS * TPX;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    const seed = this.run!.seed;
    for (let cy = 0; cy < CELLS; cy++)
      for (let cx = 0; cx < CELLS; cx++) {
        const cell = info.cells[cellIdx(cx, cy)];
        if (cell === 'void') continue;
        const x = cx * TPX;
        const y = cy * TPX;
        const h = hash(seed, 'tx', cx, cy);
        const shade = ((h % 7) - 3) * 3;
        g.fillStyle = this.tint(CELL_COLOR[cell === 'forest' || cell === 'rock' ? 'grass' : cell], shade);
        g.fillRect(x, y, TPX, TPX);
        if (cell === 'hill') {
          g.fillStyle = 'rgba(255,255,220,0.18)';
          g.beginPath();
          g.moveTo(x + 6, y + TPX - 7);
          g.lineTo(x + TPX / 2, y + 7);
          g.lineTo(x + TPX - 6, y + TPX - 7);
          g.fill();
        } else if (cell === 'forest') {
          for (let i = 0; i < 3; i++) {
            const px = x + 8 + ((h >>> (i * 4)) % 16);
            const py = y + 9 + ((h >>> (i * 4 + 2)) % 14);
            g.fillStyle = '#163a24';
            g.beginPath();
            g.arc(px, py + 2, 7, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#2f7d4a';
            g.beginPath();
            g.arc(px - 1, py, 6, 0, Math.PI * 2);
            g.fill();
          }
        } else if (cell === 'rock') {
          g.fillStyle = '#7d8584';
          g.beginPath();
          g.ellipse(x + TPX / 2, y + TPX / 2 + 2, 10, 7, 0.3, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#9aa3a2';
          g.beginPath();
          g.ellipse(x + TPX / 2 - 2, y + TPX / 2, 6, 4, 0.3, 0, Math.PI * 2);
          g.fill();
        } else if (cell === 'pond') {
          g.strokeStyle = 'rgba(255,255,255,0.18)';
          g.beginPath();
          g.moveTo(x + 6, y + 12);
          g.quadraticCurveTo(x + 12, y + 8, x + 18, y + 12);
          g.moveTo(x + 12, y + 22);
          g.quadraticCurveTo(x + 18, y + 18, x + 24, y + 22);
          g.stroke();
        } else if (cell === 'ford') {
          g.fillStyle = 'rgba(255,255,255,0.15)';
          for (let i = 0; i < 3; i++) g.fillRect(x + 4, y + 7 + i * 8, TPX - 8, 2);
        } else if (cell === 'path' || cell === 'core') {
          g.fillStyle = 'rgba(0,0,0,0.08)';
          g.fillRect(x + ((h >>> 3) % 20) + 4, y + ((h >>> 6) % 20) + 4, 3, 3);
        }
        g.strokeStyle = 'rgba(0,0,0,0.13)';
        g.strokeRect(x + 0.5, y + 0.5, TPX - 1, TPX - 1);
      }
    // Darker frame between tiles.
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    for (let ty = 0; ty < CELLS / TILE; ty++)
      for (let tx = 0; tx < CELLS / TILE; tx++) if (info.revealed[ty * (CELLS / TILE) + tx]) g.strokeRect(tx * TILE * TPX, ty * TILE * TPX, TILE * TPX, TILE * TPX);
    this.terrain = c;
  }

  private tint(hex: string, d: number): string {
    const n = parseInt(hex.slice(1), 16);
    const f = (v: number): number => Math.max(0, Math.min(255, v + d));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  private draw(): void {
    const ctx = this.ctx;
    const r = this.run;
    if (!ctx || !r) return;
    const info = mapInfo(r);
    this.buildTerrain(info);
    const S = this.size;
    const k = S / this.cam.s;
    const ox = -this.cam.x * k;
    const oy = -this.cam.y * k;
    const X = (x: number): number => ox + x * k;
    const Y = (y: number): number => oy + y * k;
    ctx.save();
    ctx.fillStyle = '#081010';
    ctx.fillRect(0, 0, S, S);
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * this.shake, (Math.random() - 0.5) * 8 * this.shake);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrain!, X(0), Y(0), CELLS * k, CELLS * k);

    // New tile glow
    if (this.newTile && r.map.tiles[this.newTile.i]) {
      const t = r.map.tiles[this.newTile.i];
      ctx.fillStyle = `rgba(255,230,140,${0.35 * (1 - this.newTile.t / 2)})`;
      ctx.fillRect(X(t.x * TILE), Y(t.y * TILE), TILE * k, TILE * k);
    }

    // Route flow dots
    ctx.fillStyle = 'rgba(255,240,200,0.25)';
    for (let i = 0; i < info.routes.length; i += 2) {
      const rt = info.routes[i];
      for (let d = (this.clock * 0.8) % 1.5; d < rt.total; d += 1.5) {
        let s = 0;
        while (s < rt.pts.length - 2 && rt.cum[s + 1] < d) s++;
        const a = rt.pts[s];
        const bb = rt.pts[s + 1];
        const f = (d - rt.cum[s]) / (rt.cum[s + 1] - rt.cum[s] || 1);
        ctx.beginPath();
        ctx.arc(X(a.x + (bb.x - a.x) * f), Y(a.y + (bb.y - a.y) * f), k * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Portals
    for (const p of info.spawns) {
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 4);
      const g = ctx.createRadialGradient(X(p.x), Y(p.y), 0, X(p.x), Y(p.y), k * 0.7);
      g.addColorStop(0, `rgba(200,120,255,${0.7 + pulse * 0.3})`);
      g.addColorStop(1, 'rgba(120,40,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), k * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Core
    const c = info.core;
    ctx.fillStyle = this.coreFlash > 0 ? `rgba(239,71,111,${this.coreFlash})` : 'rgba(42,157,143,0.35)';
    ctx.beginPath();
    ctx.arc(X(c.x), Y(c.y), k * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a9d8f';
    ctx.lineWidth = Math.max(2, k * 0.08);
    ctx.beginPath();
    ctx.arc(X(c.x), Y(c.y), k * 0.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, r.core / r.coreMax));
    ctx.stroke();
    this.emoji(ctx, '🏰', X(c.x), Y(c.y), k * 0.9);

    // Selection / placement ghost
    const sel = this.sel !== null ? r.towers.find((t) => t.id === this.sel) : undefined;
    const spot = this.cursor ?? this.hover;
    if (this.armed && spot) {
      const ok = canBuildAt(r, spot.x, spot.y);
      ctx.fillStyle = ok ? 'rgba(126,224,138,0.35)' : 'rgba(239,71,111,0.35)';
      ctx.fillRect(X(spot.x), Y(spot.y), k, k);
      if (ok) {
        const rng = TOWERS[this.armed].range + r.mods.range + r.mods.type[this.armed].range + (info.cells[cellIdx(spot.x, spot.y)] === 'hill' ? 1 : 0);
        this.rangeCircle(ctx, X(spot.x + 0.5), Y(spot.y + 0.5), rng * k, TOWERS[this.armed].minRange * k);
        ctx.globalAlpha = 0.6;
        this.emoji(ctx, TOWERS[this.armed].icon, X(spot.x + 0.5), Y(spot.y + 0.5), k * 0.6);
        ctx.globalAlpha = 1;
      }
    } else if (spot) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(X(spot.x) + 1, Y(spot.y) + 1, k - 2, k - 2);
    }

    // Towers
    for (const t of r.towers) {
      const d = TOWERS[t.type];
      const kick = this.kick.get(t.id) ?? 0;
      const pad = k * (0.1 + kick * 0.4);
      ctx.fillStyle = this.tint(d.color, -90);
      this.roundRect(ctx, X(t.x) + pad, Y(t.y) + pad, k - pad * 2, k - pad * 2, k * 0.18);
      ctx.fill();
      ctx.strokeStyle = t.id === this.sel ? '#fff' : d.color;
      ctx.lineWidth = t.id === this.sel ? 2.5 : 1.5;
      ctx.stroke();
      this.emoji(ctx, d.icon, X(t.x + 0.5), Y(t.y + 0.5), k * 0.55);
      for (let i = 1; i < t.lvl; i++) {
        ctx.fillStyle = t.branch === 1 ? '#8ecae6' : '#ffd166';
        ctx.beginPath();
        ctx.arc(X(t.x) + k * (0.22 + (i - 1) * 0.2), Y(t.y) + k * 0.86, Math.max(1.5, k * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (sel) {
      const s = towerStats(r, sel, info);
      this.rangeCircle(ctx, X(sel.x + 0.5), Y(sel.y + 0.5), s.range * k, s.minRange * k);
    }

    // Enemies
    const b = this.battle;
    if (b) {
      for (const e of b.enemies) {
        const d = ENEMIES[e.type];
        const ex = X(e.x);
        let ey = Y(e.y);
        const sz = k * d.size;
        if (d.fly) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.ellipse(ex, ey + sz * 0.45, sz * 0.35, sz * 0.12, 0, 0, Math.PI * 2);
          ctx.fill();
          ey -= sz * 0.3 + Math.sin(this.clock * 8 + e.uid) * k * 0.05;
        }
        if (d.boss) {
          ctx.fillStyle = 'rgba(239,71,111,0.25)';
          ctx.beginPath();
          ctx.arc(ex, ey, sz * 0.65, 0, Math.PI * 2);
          ctx.fill();
        }
        if (e.slowT > 0) {
          ctx.strokeStyle = 'rgba(189,224,254,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ex, ey, sz * 0.55, 0, Math.PI * 2);
          ctx.stroke();
        }
        this.emoji(ctx, d.icon, ex, ey, sz * (e.stunT > 0 ? 0.9 : 1));
        if (e.hitT > 0) {
          ctx.fillStyle = `rgba(255,255,255,${e.hitT * 1.6})`;
          ctx.beginPath();
          ctx.arc(ex, ey, sz * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
        if (e.burnT > 0) this.emoji(ctx, '🔥', ex + sz * 0.35, ey - sz * 0.3, sz * 0.4);
        if (e.stunT > 0) this.emoji(ctx, '💫', ex, ey - sz * 0.6, sz * 0.4);
        if (e.hp < e.max) {
          const w = Math.max(sz, k * 0.6);
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(ex - w / 2, ey - sz * 0.62 - 3, w, 4);
          ctx.fillStyle = d.boss ? '#ef476f' : '#7ee08a';
          ctx.fillRect(ex - w / 2, ey - sz * 0.62 - 3, (w * Math.max(0, e.hp)) / e.max, 4);
        }
      }
      // Mortar shells
      for (const sh of b.shells) {
        const f = sh.t / sh.T;
        const x = sh.x0 + (sh.x - sh.x0) * f;
        const y = sh.y0 + (sh.y - sh.y0) * f - Math.sin(f * Math.PI) * 1.6;
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(X(x), Y(y), Math.max(2, k * 0.1), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff9f43';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Effects
    for (const f of this.fx) {
      const life = 1 - f.t / f.max;
      ctx.globalAlpha = Math.max(0, life);
      if (f.kind === 'beam') {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = Math.max(1.5, k * 0.06);
        ctx.beginPath();
        ctx.moveTo(X(f.pts[0]), Y(f.pts[1]));
        ctx.lineTo(X(f.pts[2]), Y(f.pts[3]));
        ctx.stroke();
      } else if (f.kind === 'chain') {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = Math.max(1.5, k * 0.07);
        ctx.beginPath();
        for (let i = 0; i + 3 < f.pts.length; i += 2) {
          const x0 = f.pts[i];
          const y0 = f.pts[i + 1];
          const x1 = f.pts[i + 2];
          const y1 = f.pts[i + 3];
          ctx.moveTo(X(x0), Y(y0));
          for (let s = 1; s <= 4; s++) {
            const q = s / 4;
            const j = s < 4 ? (Math.random() - 0.5) * 0.35 : 0;
            ctx.lineTo(X(x0 + (x1 - x0) * q + j), Y(y0 + (y1 - y0) * q + j));
          }
        }
        ctx.stroke();
      } else if (f.kind === 'ring') {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = Math.max(2, k * 0.08);
        ctx.beginPath();
        ctx.arc(X(f.pts[0]), Y(f.pts[1]), Math.max(1, f.r * k * (0.4 + 0.6 * (1 - life))), 0, Math.PI * 2);
        ctx.stroke();
        if (f.color === '#ff9f43') {
          ctx.fillStyle = 'rgba(255,159,67,0.25)';
          ctx.fill();
        }
      } else if (f.kind === 'flame') {
        const half = (f.cone / 2) * (Math.PI / 180);
        const g = ctx.createRadialGradient(X(f.pts[0]), Y(f.pts[1]), 0, X(f.pts[0]), Y(f.pts[1]), f.r * k);
        g.addColorStop(0, 'rgba(255,230,120,0.9)');
        g.addColorStop(1, 'rgba(255,90,0,0.1)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(X(f.pts[0]), Y(f.pts[1]));
        ctx.arc(X(f.pts[0]), Y(f.pts[1]), f.r * k, f.a - half, f.a + half);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Floating text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t);
      ctx.font = `700 ${f.size}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(f.text, X(f.x) + 1, Y(f.y) - f.t * 24 + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, X(f.x), Y(f.y) - f.t * 24);
    }
    ctx.globalAlpha = 1;

    if (this.paused && b) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#fff';
      ctx.font = '700 28px system-ui, sans-serif';
      ctx.fillText('⏸ Paused', S / 2, S / 2);
    }
    ctx.restore();
  }

  private emoji(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number): void {
    ctx.font = `${Math.max(8, Math.round(size))}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Color emoji take the alpha of the fill style, so reset it.
    ctx.fillStyle = '#fff';
    ctx.fillText(ch, x, y + size * 0.05);
  }

  private rangeCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, min: number): void {
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (min > 0) {
      ctx.strokeStyle = 'rgba(239,71,111,0.5)';
      ctx.beginPath();
      ctx.arc(x, y, min, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Game flow ----------

  private newGame(): void {
    const seed = randomSeedText();
    const relic = this.meta.relic && this.meta.unlocked.includes(this.meta.relic) ? this.meta.relic : null;
    this.run = newRun(seed, towerPool(this.meta), relic);
    this.resetView();
    saveRun(this.run);
    this.screen = 'play';
    this.render();
    if (relic) this.toast(`${RELICS[relic].icon} ${RELICS[relic].name}: ${RELICS[relic].text}`);
  }

  private resetView(): void {
    this.battle = null;
    this.armed = null;
    this.sel = null;
    this.paused = false;
    this.fx = [];
    this.floats = [];
    this.newTile = null;
    this.cursor = null;
    this.terrain = null;
    this.terrainKey = '';
  }

  private continueRun(): void {
    const r = this.run!;
    this.resetView();
    this.screen = r.offers ? 'cards' : 'play';
    this.render();
  }

  private startWave(): void {
    const r = this.run;
    if (!r || this.battle || this.screen !== 'play') return;
    saveRun(r);
    this.battle = startWave(r);
    this.paused = false;
    this.acc = 0;
    const n = this.battle.wave;
    const spec = waveSpec(r.seed, n);
    if (spec.boss) {
      sfx.boss();
      this.banner(`☠️ ${ENEMIES[spec.boss].name}`, true);
    } else {
      sfx.horn();
      this.banner(`Wave ${n}`);
    }
    this.refreshSide();
  }

  private endWave(): void {
    const r = this.run!;
    const b = this.battle!;
    this.battle = null;
    const res = finishWave(r, b);
    this.lastWave = res;
    if (res.lost) {
      this.endRun(false);
      return;
    }
    if (res.won) {
      this.endRun(true);
      return;
    }
    sfx.clear();
    saveRun(r);
    this.screen = 'cards';
    this.render();
  }

  private pickCard(i: number): void {
    const r = this.run;
    if (!r?.offers || !r.offers[i]) return;
    const o = r.offers[i];
    applyCard(r, o);
    r.cards.push(o.id);
    r.offers = null;
    const leaves = mapInfo(r).leaves.length;
    const g = growAfterWave(r);
    sfx.card();
    const c = cardText(r, o);
    if (g.tile >= 0) {
      this.newTile = { i: g.tile, t: 0 };
      setTimeout(() => sfx.tile(), 250);
    }
    const msgs = [`${c.icon} ${c.name}`];
    if (mapInfo(r).leaves.length > leaves) msgs.push('A new path opens!');
    if (g.refunds) msgs.push(`Towers on the new path were refunded (+${g.refunds} gold).`);
    this.toast(msgs.join(' · '));
    saveRun(r);
    this.screen = 'play';
    this.render();
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const m = this.meta;
    const crystals = crystalsFor(r) - r.paid;
    r.paid += crystals;
    m.crystals += crystals;
    const first = !(r.endless && !victory);
    if (first) m.runs++;
    if (victory) m.wins++;
    m.bestWave = Math.max(m.bestWave, r.wave);
    const sc = score(r);
    m.best = Math.max(m.best, sc);
    if (!victory) m.kills += r.stats.kills;
    saveMeta(m);
    this.end = { victory, score: sc, crystals, wave: r.wave, kills: r.stats.kills };
    if (victory) saveRun(r);
    else {
      clearRun();
      this.run = null;
    }
    this.battle = null;
    this.modal = null;
    this.screen = 'end';
    if (victory) sfx.win();
    else sfx.lose();
    this.render();
  }

  private endless(): void {
    const r = this.run;
    if (!r) return;
    r.endless = true;
    r.offers = makeOffers(r);
    saveRun(r);
    this.resetView();
    this.screen = 'cards';
    this.render();
  }

  private toTitle(): void {
    if (this.run && this.screen === 'end') {
      // A won run that goes back to the title is over. Count its kills now.
      this.meta.kills += this.run.stats.kills;
      saveMeta(this.meta);
      clearRun();
      this.run = null;
    } else if (this.run && this.battle) {
      // The wave restarts from the save made at its start.
      this.run = loadRun();
    }
    this.resetView();
    this.modal = null;
    this.screen = 'title';
    this.render();
  }

  // ---------- Actions ----------

  private selected(): Tower | undefined {
    return this.sel !== null ? this.run?.towers.find((t) => t.id === this.sel) : undefined;
  }

  private tapCell(cx: number, cy: number): void {
    const r = this.run;
    if (!r || this.screen !== 'play') return;
    const t = towerAt(r, cx, cy);
    if (t) {
      this.sel = t.id === this.sel ? null : t.id;
      this.armed = null;
      sfx.click();
      this.refreshSide();
      return;
    }
    if (this.armed) {
      if (!r.have.includes(this.armed)) return;
      const cost = buildCost(r, this.armed);
      if (r.gold < cost) {
        sfx.deny();
        this.toast(`Not enough gold (💰 ${cost}).`);
        return;
      }
      const nt = build(r, this.armed, cx, cy);
      if (!nt) {
        sfx.deny();
        return;
      }
      sfx.build();
      this.kick.set(nt.id, 0.3);
      this.float(cx + 0.5, cy + 0.2, `-${cost}`, '#ffd166', 12);
      if (!this.battle) saveRun(r);
      this.refreshSide();
      return;
    }
    if (this.sel !== null) {
      this.sel = null;
      this.refreshSide();
    }
  }

  private doUpgrade(branch: number): void {
    const r = this.run;
    const t = this.selected();
    if (!r || !t) return;
    const br = t.branch >= 0 ? t.branch : branch;
    const cost = upgradeCost(r, t);
    if (!upgrade(r, t, br)) {
      sfx.deny();
      if (cost) this.toast(`Not enough gold (💰 ${cost}).`);
      return;
    }
    sfx.upgrade();
    this.kick.set(t.id, 0.3);
    this.addFx({ kind: 'ring', max: 0.5, color: '#ffd166', pts: [t.x + 0.5, t.y + 0.5], r: 0.8 });
    if (!this.battle) saveRun(r);
    this.refreshSide();
  }

  private doSell(): void {
    const r = this.run;
    const t = this.selected();
    if (!r || !t) return;
    const v = sell(r, t);
    sfx.sell();
    this.float(t.x + 0.5, t.y + 0.3, `+${v}`, '#ffd166', 13);
    this.sel = null;
    if (!this.battle) saveRun(r);
    this.refreshSide();
  }

  private cycleTarget(): void {
    const t = this.selected();
    if (!t) return;
    t.target = TARGETS[(TARGETS.indexOf(t.target) + 1) % TARGETS.length];
    sfx.click();
    this.refreshSide();
  }

  private arm(type: TowerId): void {
    const r = this.run;
    if (!r || this.screen !== 'play') return;
    if (!r.have.includes(type)) {
      sfx.deny();
      this.toast(`${TOWERS[type].name} is locked. New tower cards unlock it.`);
      return;
    }
    this.armed = this.armed === type ? null : type;
    this.sel = null;
    sfx.click();
    this.refreshSide();
  }

  private goButton(): void {
    if (!this.battle) this.startWave();
    else {
      this.paused = !this.paused;
      this.hud();
    }
  }

  // ---------- Input ----------

  private toCell(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const cv = this.canvas;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null;
    const k = rect.width / this.cam.s;
    const x = Math.floor(this.cam.x + px / k);
    const y = Math.floor(this.cam.y + py / k);
    if (x < 0 || y < 0 || x >= CELLS || y >= CELLS) return null;
    return { x, y };
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if (e.target !== this.canvas) return;
    this.down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }

  private onMove(e: PointerEvent): void {
    if (e.target !== this.canvas) return;
    if (e.pointerType === 'mouse') {
      this.hover = this.toCell(e);
      this.cursor = null;
    }
  }

  private onUp(e: PointerEvent): void {
    const d = this.down;
    this.down = null;
    if (!d || e.target !== this.canvas || d.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14) return;
    const c = this.toCell(e);
    if (c) {
      this.cursor = null;
      this.tapCell(c.x, c.y);
    }
  }

  private onKey(e: KeyboardEvent): void {
    initAudio();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key;
    if (this.modal) {
      if (key === 'Escape') this.closeModal();
      return;
    }
    if (this.screen === 'cards') {
      const n = Number(key);
      if (n >= 1 && n <= 3) this.pickCard(n - 1);
      return;
    }
    if (this.screen === 'title') {
      if (key === 'Enter') this.run ? this.continueRun() : this.newGame();
      return;
    }
    if (this.screen !== 'play' || !this.run) return;
    const r = this.run;
    if (key >= '1' && key <= '5') {
      this.arm(TOWER_IDS[Number(key) - 1]);
      return;
    }
    if (key.startsWith('Arrow')) {
      e.preventDefault();
      const c = this.cursor ?? this.hover ?? { x: Math.floor(mapInfo(r).core.x), y: Math.floor(mapInfo(r).core.y) };
      const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
      const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
      this.cursor = { x: Math.max(0, Math.min(CELLS - 1, c.x + dx)), y: Math.max(0, Math.min(CELLS - 1, c.y + dy)) };
      return;
    }
    switch (key.toLowerCase()) {
      case 'enter':
        if (this.cursor) this.tapCell(this.cursor.x, this.cursor.y);
        else this.goButton();
        e.preventDefault();
        break;
      case ' ':
        e.preventDefault();
        this.goButton();
        break;
      case 'p':
        if (this.battle) this.goButton();
        break;
      case 'f':
        this.speed = (this.speed % 3) + 1;
        this.hud();
        break;
      case 't':
        this.cycleTarget();
        break;
      case 'q':
        this.doUpgrade(0);
        break;
      case 'e':
        this.doUpgrade(1);
        break;
      case 'u':
        this.doUpgrade(this.selected()?.branch ?? 0);
        break;
      case 's':
      case 'delete':
      case 'backspace':
        this.doSell();
        break;
      case 'h':
      case '?':
        this.openModal({ kind: 'help' });
        break;
      case 'm':
        this.toggleMute();
        break;
      case 'escape':
        if (this.armed || this.sel !== null || this.cursor) {
          this.armed = null;
          this.sel = null;
          this.cursor = null;
          this.refreshSide();
        } else this.openModal({ kind: 'menu', confirm: false });
        break;
    }
  }

  private openModal(m: Modal): void {
    this.modal = m;
    this.render();
  }

  private closeModal(): void {
    this.modal = null;
    this.render();
  }

  private toggleMute(): void {
    setMuted(!isMuted());
    try {
      localStorage.setItem(MUTE_KEY, isMuted() ? '1' : '0');
    } catch {
      /* ignore */
    }
    const btn = this.root.querySelector<HTMLElement>('[data-act="mute"]');
    if (btn) btn.textContent = isMuted() ? '🔇' : '🔊';
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'modal-close' && el.classList.contains('modal') && target.closest('[data-stop]')) return;
    if (el instanceof HTMLButtonElement && el.disabled) return;
    this.action(el.dataset.act!, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    switch (act) {
      case 'new':
        this.newGame();
        break;
      case 'continue':
        this.continueRun();
        break;
      case 'help':
        this.openModal({ kind: 'help' });
        break;
      case 'menu':
        this.openModal({ kind: 'menu', confirm: false });
        break;
      case 'modal-close':
        this.closeModal();
        break;
      case 'mute':
        this.toggleMute();
        break;
      case 'abandon':
        this.openModal({ kind: 'menu', confirm: true });
        break;
      case 'abandon-yes':
        this.modal = null;
        if (this.run) {
          this.battle = null;
          this.endRun(false);
        }
        break;
      case 'title':
        this.toTitle();
        break;
      case 'endless':
        this.endless();
        break;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.crystals < cost || this.meta.unlocked.includes(id)) return;
        this.meta.crystals -= cost;
        this.meta.unlocked.push(id);
        if (RELICS[id] && !this.meta.relic) this.meta.relic = id;
        saveMeta(this.meta);
        sfx.upgrade();
        this.render();
        break;
      }
      case 'relic':
        this.meta.relic = this.meta.relic === d.id ? null : d.id!;
        saveMeta(this.meta);
        sfx.click();
        this.render();
        break;
      case 'go':
        this.goButton();
        break;
      case 'speed':
        this.speed = Number(d.v);
        this.hud();
        break;
      case 'arm':
        this.arm(d.t as TowerId);
        break;
      case 'up':
        this.doUpgrade(Number(d.b));
        break;
      case 'sell':
        this.doSell();
        break;
      case 'target': {
        const t = this.selected();
        if (t) {
          t.target = d.m as Tower['target'];
          sfx.click();
          this.refreshSide();
        }
        break;
      }
      case 'desel':
        this.sel = null;
        this.refreshSide();
        break;
      case 'card':
        this.pickCard(Number(d.i));
        break;
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const rng = new Rng(hash('debug-bot', Date.now()));
    const api = {
      state: () => ({
        screen: this.screen,
        phase: this.battle ? 'wave' : 'build',
        modal: this.modal?.kind ?? null,
        wave: this.run?.wave ?? null,
        core: this.run?.core ?? null,
        gold: this.run?.gold ?? null,
        towers: this.run?.towers.length ?? 0,
        have: this.run?.have ?? [],
        enemies: this.battle?.enemies.length ?? 0,
        offers: this.run?.offers?.map((o) => o.id + (o.arg ? `:${o.arg}` : '')) ?? null,
        speed: this.speed,
        paused: this.paused,
        end: this.end,
      }),
      /** Client coordinates of the center of a cell, for click tests. */
      screenOf: (cx: number, cy: number) => {
        const rect = this.canvas?.getBoundingClientRect();
        if (!rect) return null;
        const k = rect.width / this.cam.s;
        return { x: rect.left + (cx + 0.5 - this.cam.x) * k, y: rect.top + (cy + 0.5 - this.cam.y) * k };
      },
      towerCells: () => this.run?.towers.map((t) => ({ x: t.x, y: t.y, lvl: t.lvl, target: t.target })) ?? [],
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.hudKey = '';
      },
      crystals: (n: number) => {
        this.meta.crystals += n;
        saveMeta(this.meta);
        if (this.screen === 'title') this.render();
      },
      /** One bot action. In a wave it simulates a chunk of game time (the whole wave with `&fast`). */
      step: () => {
        if (this.modal) {
          this.closeModal();
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            this.newGame();
            return 'new';
          case 'cards':
            this.pickCard(Math.max(0, botCard(this.run!, 'good', rng)));
            return 'card';
          case 'end':
            return 'end';
          case 'play': {
            const r = this.run!;
            if (!this.battle) {
              botSpend(r, 'good', rng);
              this.refreshSide();
              this.startWave();
              return 'start';
            }
            const b = this.battle;
            b.fx = !FAST;
            const steps = Math.round((FAST ? 200 : 4) / DT);
            for (let i = 0; i < steps; i++) {
              stepBattle(r, b, DT);
              if (FAST) b.events.length = 0;
              else this.handleEvents(b);
              if (i % 60 === 0) botSpend(r, 'good', rng);
              if (battleOver(r, b)) {
                b.fx = true;
                this.endWave();
                return 'wave-end';
              }
            }
            b.fx = true;
            this.refreshSide();
            return 'wave';
          }
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}

