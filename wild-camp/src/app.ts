import { Bot } from './bot';
import {
  BIOMES,
  CHARS,
  CHAR_IDS,
  CREATURES,
  DAY,
  DT,
  ITEMS,
  MAP,
  NODES,
  PARTS,
  RECIPES,
  SEASON_DAYS,
  SEASON_DEFS,
  STRUCTS,
  type Slot,
} from './data';
import {
  addItem,
  airTemp,
  canCraft,
  cook,
  count,
  craft,
  darkness,
  dayFrac,
  dayNum,
  dropItem,
  foodValue,
  fuelFire,
  lights,
  nearFire,
  nearestAct,
  nearestFoe,
  newGame,
  newStack,
  phase,
  portalStruct,
  seasonDay,
  seasonOf,
  setGoal,
  tick,
  tierAt,
  unequip,
  useItem,
  type Game,
  type Goal,
  type Stack,
} from './game';
import { hash, randomSeedText } from './rng';
import { clearRun, daysSurvived, loadMeta, loadRun, partsDone, recordEnd, saveMeta, saveRun, score, unlocked } from './run';
import { initAudio, isMuted, play, setMuted, toggleMute } from './sfx';
import { BIOME_IDS } from './world';

type Screen = 'title' | 'play' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'craft' };

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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  max: number;
  color: string;
  size: number;
}

const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const FAST = QS.has('fast');
const MUTE_KEY = 'wc.mute';

const SLOT_ICON: Record<Slot, string> = { hand: '✋', head: '🎩', body: '👕' };
const BIOME_RGB: Record<string, [number, number, number]> = {
  grass: [107, 143, 58],
  forest: [47, 90, 46],
  rocky: [125, 116, 102],
  marsh: [76, 91, 69],
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export class App {
  private meta = loadMeta();
  private g: Game | null = loadRun();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private sel: number | null = null;
  private selEq: Slot | null = null;
  private endInfo: { win: boolean; score: number; days: number; unlocked: string[]; cause: string; kills: number; bosses: number; parts: number } | null = null;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private mini: HTMLCanvasElement | null = null;
  private dark: HTMLCanvasElement = document.createElement('canvas');
  private raf = 0;
  private last = 0;
  private acc = 0;
  private ts = 44;
  private cam = { x: 0, y: 0 };
  private shake = 0;
  private floats: Float[] = [];
  private rings: Ring[] = [];
  private parts: Particle[] = [];
  private keys = new Set<string>();
  private stick = { x: 0, y: 0, active: false, id: -1, cx: 0, cy: 0 };
  private sprites = new Map<string, HTMLCanvasElement>();
  private uiSig = '';
  private hudT = 0;
  private miniT = 0;
  private bot = new Bot('good');
  private touch = matchMedia('(pointer: coarse)').matches;
  private clock = 0;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === '1');
    } catch {
      /* ignore */
    }
    if (!CHARS[this.meta.char] || !unlocked(this.meta).includes(this.meta.char)) this.meta.char = 'wren';
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.g && this.screen === 'play' && !this.g.over) saveRun(this.g);
    });
    window.addEventListener('beforeunload', () => {
      if (this.g && this.screen === 'play' && !this.g.over) saveRun(this.g);
    });
    if (DEBUG) this.installDebug();
    this.render();
  }

  // ---------------- screens ----------------

  private render(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    let body = '';
    if (this.screen === 'title') body = this.titleView();
    else if (this.screen === 'end') body = this.endView();
    else body = this.playView();
    this.root.innerHTML = `${body}${this.modal ? this.modalView() : ''}`;
    this.root.className = `s-${this.screen}`;
    if (this.screen === 'play') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.mini = this.root.querySelector<HTMLCanvasElement>('#mini');
      this.uiSig = '';
      this.resize();
      this.updateUi(true);
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    } else {
      this.canvas = null;
      this.ctx = null;
      this.mini = null;
    }
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private titleView(): string {
    const m = this.meta;
    const un = unlocked(m);
    const chars = CHAR_IDS.map((id) => {
      const c = CHARS[id];
      const own = un.includes(id);
      const on = m.char === id;
      return `<button class="char ${on ? 'on' : ''}" data-act="char" data-id="${id}" ${own ? '' : 'disabled'}>
        <span class="big">${own ? c.icon : '🔒'}</span>
        <b>${c.name} <small>${c.title}</small></b>
        <small>${own ? c.text : `Survive ${c.unlock} days in total to unlock (${m.totalDays}/${c.unlock}).`}</small>
        <small class="dim">❤️ ${c.hp} · 🧠 ${c.san}</small>
      </button>`;
    }).join('');
    const g = this.g;
    return `<main class="title">
      <h1><span>🏕️</span> Wild Camp</h1>
      <p class="sub">Gather. Craft. Keep the fire burning. Find the 4 parts of the ancient gate and escape the wild.</p>
      ${g ? `<button class="primary" data-act="continue">▶ Continue: ${CHARS[g.char].icon} ${CHARS[g.char].name}, day ${dayNum(g)}</button>` : ''}
      <button class="${g ? '' : 'primary'}" data-act="new">${g ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Escapes ${m.wins} · Best ${m.bestDays} days · Best score ${m.best} · Total ${m.totalDays} days</p>
      <h2>Survivors</h2>
      <p class="sub">Every day you survive counts. New survivors join as your total grows.</p>
      <div class="chars">${chars}</div>
    </main>`;
  }

  private endView(): string {
    const e = this.endInfo!;
    const news = e.unlocked.map((id) => `<p class="good">New survivor: ${CHARS[id].icon} <b>${CHARS[id].name} ${CHARS[id].title}</b></p>`).join('');
    return `<main class="end">
      <div class="huge">${e.win ? '🌀' : '🪦'}</div>
      <h1 class="${e.win ? 'good' : 'bad'}">${e.win ? 'You escaped!' : 'You died'}</h1>
      <p>${e.win ? 'The ancient gate opens and pulls you home.' : `Killed by ${esc(e.cause)} on day ${Math.floor(e.days) + 1}.`}</p>
      <div class="endstats">
        <span>📅 ${e.days.toFixed(1)} days</span><span>⚔️ ${e.kills} kills</span><span>👑 ${e.bosses} bosses</span><span>🌀 ${e.parts}/4 parts</span>
      </div>
      <p class="score">Score <b>${e.score}</b></p>
      ${news}
      <button class="primary" data-act="title">Title screen</button>
    </main>`;
  }

  private playView(): string {
    return `<div class="play">
      <header class="hud" id="hud"></header>
      <div class="cv-wrap" id="wrap">
        <canvas id="cv"></canvas>
        <canvas id="mini" width="${MAP * 2}" height="${MAP * 2}" title="Map"></canvas>
        <div class="hoverlabel" id="hoverlabel"></div>
        <div class="touch ${this.touch ? 'show' : ''}">
          <div class="stick" id="stick"><div class="knob" id="knob"></div></div>
          <div class="tbtns">
            <button class="tb" data-act="t-attack" title="Attack (F)">⚔️</button>
            <button class="tb big" data-act="t-act" title="Act (Space)">✋</button>
          </div>
        </div>
      </div>
      <footer class="bar" id="bar"></footer>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Move</b> with WASD or the arrow keys. On touch, use the stick. You can also click or tap a spot or a thing to walk there.</li>
          <li><b>Act</b> with Space or E (✋): pick, chop, mine, pick up, feed a fire, open the gate. Click a thing to act on it.</li>
          <li><b>Attack</b> with F (⚔️), or click a creature.</li>
          <li><b>Craft</b> with C (🔨). Tier 1 needs a ⚗️ science machine close by. Tier 2 needs a 🔮 alchemy engine.</li>
          <li><b>Items</b>: keys 1–9 use a slot. Click a slot for more: eat, equip, cook at a fire, burn, drop.</li>
          <li><b>Needs</b>: ❤️ health, 🍖 hunger and 🧠 sanity drop. 🌡️ Body heat follows the air: freeze below 0°, overheat above 70°.</li>
          <li><b>Night</b> is pitch dark. Stand in the light of a fire or hold a torch, or something in the dark attacks you.</li>
          <li><b>Seasons</b> last ${SEASON_DAYS} days: 🍂 autumn, ❄️ winter, 🌱 spring, ☀️ summer. Plants do not grow in winter. Summer shade is in the forest.</li>
          <li><b>Food spoils</b> over days. Cook it at a fire. Tools, armor and torches wear out.</li>
          <li><b>Win</b>: find the 3 ✨ strange mounds (forest, rocky land, marsh) and take an ❤️‍🔥 ancient heart from a season boss. Bring all 4 parts to the 🌀 gate.</li>
          <li>Wolf packs hunt some nights. Low sanity brings shades. The game saves at each dawn.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'menu') {
      return `<div class="modal" data-act="modal-close"><div class="sheet small" data-stop>
        <h2>Menu</h2>
        <button class="primary" data-act="modal-close">▶ Resume</button>
        <button data-act="help">How to play</button>
        <button data-act="to-title">Save and go to title</button>
        ${m.confirm ? '<p class="warn">Abandon this run? It counts as a death.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet craft" data-stop id="craftsheet">${this.craftHtml()}</div></div>`;
  }

  private craftHtml(): string {
    const g = this.g!;
    const tier = tierAt(g);
    const names = ['Basics', 'Science ⚗️', 'Alchemy 🔮'];
    let html = `<div class="crafthead"><h2>🔨 Craft</h2><button class="icon-btn" data-act="modal-close">✕</button></div>`;
    for (let t = 0; t <= 2; t++) {
      const locked = t > tier;
      html += `<h3>${names[t]} ${locked ? `<small class="warn">${t === 1 ? 'Stand near a science machine' : 'Stand near an alchemy engine'}</small>` : ''}</h3><div class="recipes">`;
      for (const r of RECIPES.filter((x) => x.tier === t)) {
        const d = r.place ? STRUCTS[r.place] : ITEMS[r.out];
        const cost = r.cost.map(([it, n]) => `<span class="cost ${count(g, it) >= n ? 'ok' : 'no'}" title="${ITEMS[it].name}">${ITEMS[it].icon}${count(g, it)}/${n}</span>`).join('');
        const ok = canCraft(g, r.id);
        html += `<button class="recipe ${locked ? 'locked' : ''}" data-act="craft" data-id="${r.id}" ${ok ? '' : 'disabled'}>
          <span class="big">${d.icon}</span><span class="rinfo"><b>${d.name}${r.place ? ' <small>(build)</small>' : ''}</b><small>${esc(d.text)}</small><span class="costs">${cost}</span></span></button>`;
      }
      html += '</div>';
    }
    return html;
  }

  // ---------------- HUD and bar ----------------

  private meter(icon: string, v: number, max: number, cls: string): string {
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    return `<div class="meter ${cls} ${pct < 25 ? 'low' : ''}" title="${cls}"><span class="mi">${icon}</span><div class="mbar"><div class="mfill" style="width:${pct}%"></div></div><span class="mv">${Math.max(0, Math.round(v))}</span></div>`;
  }

  private hudHtml(): string {
    const g = this.g!;
    const p = g.p;
    const s = seasonOf(g);
    const sd = SEASON_DEFS[s];
    const ph = phase(g);
    const t = Math.round(p.temp);
    const tcls = t < 5 ? 'cold' : t > 64 ? 'hot' : '';
    const phIcon = ph === 'day' ? '☀️' : ph === 'dusk' ? '🌆' : '🌙';
    const f = dayFrac(g);
    const parts = portalStruct(g).parts ?? [];
    const partIcons = PARTS.map((id) => `<span class="${parts.includes(id) ? 'pon' : count(g, id) > 0 ? 'phold' : 'poff'}" title="${ITEMS[id].name}">${ITEMS[id].icon}</span>`).join('');
    return `${this.meter('❤️', p.hp, p.maxHp, 'hp')}${this.meter('🍖', p.hunger, p.maxHunger, 'hunger')}${this.meter('🧠', p.san, p.maxSan, 'san')}
      <span class="temp ${tcls}" title="Body heat (air ${Math.round(airTemp(g))}°)">🌡️${t}°</span>
      <span class="clock" title="${sd.name}, day ${seasonDay(g)} of ${SEASON_DAYS}"><span class="dial" style="--f:${f}">${phIcon}</span>Day ${dayNum(g)} ${sd.icon}</span>
      <span class="partsbar" title="Gate parts">${partIcons}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>`;
  }

  private slotHtml(s: Stack | null, attrs: string, key: string, on: boolean, empty = ''): string {
    if (!s) return `<button class="slot empty ${on ? 'on' : ''}" ${attrs}>${empty}<i>${key}</i></button>`;
    const d = ITEMS[s.id];
    let bar = '';
    if (s.f !== undefined) bar = `<span class="sbar fresh" style="width:${Math.max(0, s.f * 100)}%;background:${s.f > 0.5 ? '#7ee08a' : s.f > 0.2 ? '#ffd166' : '#ef476f'}"></span>`;
    else if (s.d !== undefined && d.dur) bar = `<span class="sbar" style="width:${Math.max(0, (s.d / d.dur) * 100)}%"></span>`;
    return `<button class="slot ${on ? 'on' : ''} ${d.part ? 'part' : ''}" ${attrs} title="${d.name}"><span class="si">${d.icon}</span>${s.n > 1 ? `<b>${s.n}</b>` : ''}${bar}<i>${key}</i></button>`;
  }

  private barHtml(): string {
    const g = this.g!;
    const p = g.p;
    const eq = (['hand', 'head', 'body'] as Slot[]).map((sl) => this.slotHtml(p.eq[sl], `data-act="eq" data-slot="${sl}"`, '', this.selEq === sl, `<span class="ghost">${SLOT_ICON[sl]}</span>`)).join('');
    const inv = p.inv.map((s, i) => this.slotHtml(s, `data-act="slot" data-i="${i}"`, i < 9 ? String(i + 1) : '', this.sel === i)).join('');
    return `<div class="slots"><div class="eqs">${eq}</div><div class="inv">${inv}</div><button class="craftbtn" data-act="craft-open" title="Craft (C)">🔨<span>Craft</span></button></div>
      <div class="info">${this.infoHtml()}</div>`;
  }

  private infoHtml(): string {
    const g = this.g!;
    const p = g.p;
    let s: Stack | null = null;
    if (this.sel !== null) s = p.inv[this.sel];
    else if (this.selEq) s = p.eq[this.selEq];
    if (!s) {
      const fire = nearFire(g);
      const hint = this.touch ? 'Tap a slot for actions. ✋ acts on the closest thing.' : 'Click a slot for actions. Space acts on the closest thing, F attacks, C crafts.';
      return `<span class="dim">${fire ? '🔥 You are by a fire: cook food, burn fuel. ' : ''}${hint}</span>`;
    }
    const d = ITEMS[s.id];
    let stat = '';
    if (d.food) {
      const v = foodValue(g, s);
      stat = `🍖${v.hunger} ❤️${v.hp} 🧠${v.san} · ${s.f! > 0.5 ? 'fresh' : s.f! > 0.2 ? 'stale' : 'spoiling'}`;
    } else if (d.dur && s.d !== undefined) stat = d.light ? `${Math.ceil(s.d)}s of light` : d.absorb ? `blocks ${Math.round(d.absorb * 100)}% · ${Math.ceil(s.d)} left` : d.san ? `${Math.ceil(s.d)}s left` : `${Math.ceil(s.d)} uses left`;
    if (d.dmg && !d.light) stat += ` · ⚔️${d.dmg}`;
    if (d.warm) stat += ` · warm +${d.warm}`;
    if (d.cool) stat += ` · cool −${d.cool}`;
    const btns: string[] = [];
    const fire = nearFire(g);
    if (this.selEq) btns.push(`<button data-act="unequip">Take off</button>`);
    else {
      const verb = d.food ? 'Eat' : d.slot ? 'Equip' : d.heal ? 'Use' : s.id === 'bedroll' ? 'Sleep' : d.place ? 'Place' : '';
      if (verb) btns.push(`<button class="primary" data-act="use">${verb}</button>`);
      if (d.food?.cook) btns.push(`<button data-act="cook" ${fire ? '' : 'disabled title="Stand by a fire"'}>🔥 Cook</button>`);
      if (d.fuel && fire) btns.push(`<button data-act="burn">Burn</button>`);
      btns.push(`<button data-act="drop">Drop</button>`);
    }
    return `<span class="iname">${d.icon} <b>${d.name}</b>${s.n > 1 ? ` ×${s.n}` : ''} <small class="dim">${esc(d.text)} ${stat}</small></span><span class="ibtns">${btns.join('')}</span>`;
  }

  private uiSignature(): string {
    const g = this.g!;
    const p = g.p;
    const inv = p.inv.map((s) => (s ? `${s.id}${s.n}${s.f !== undefined ? Math.round(s.f * 20) : ''}${s.d !== undefined ? Math.round(s.d / 5) : ''}` : '-')).join(',');
    const eq = Object.values(p.eq).map((s) => (s ? `${s.id}${Math.round((s.d ?? 0) / 5)}` : '-')).join(',');
    return `${inv}|${eq}|${this.sel}|${this.selEq}|${!!nearFire(g)}|${this.touch}`;
  }

  private updateUi(force = false): void {
    if (!this.g || this.screen !== 'play') return;
    const hud = this.root.querySelector<HTMLElement>('#hud');
    if (hud) hud.innerHTML = this.hudHtml();
    const sig = this.uiSignature();
    if (force || sig !== this.uiSig) {
      this.uiSig = sig;
      const bar = this.root.querySelector<HTMLElement>('#bar');
      if (bar) bar.innerHTML = this.barHtml();
    }
    if (this.modal?.kind === 'craft') {
      const cs = this.root.querySelector<HTMLElement>('#craftsheet');
      if (cs) {
        const st = cs.scrollTop;
        cs.innerHTML = this.craftHtml();
        cs.scrollTop = st;
      }
    }
  }

  // ---------------- run flow ----------------

  private startRun(): void {
    clearRun();
    const seed = hash(randomSeedText(), Date.now());
    this.g = newGame(seed, this.meta.char);
    this.bot = new Bot('good');
    this.sel = null;
    this.selEq = null;
    this.floats = [];
    this.rings = [];
    this.parts = [];
    this.screen = 'play';
    this.modal = null;
    saveRun(this.g);
    this.render();
    this.toast(`Day 1 · 🍂 Autumn. Gather twigs 🥢 and flint 🔺 for an axe. Build a fire before night.`);
  }

  private finish(): void {
    const g = this.g!;
    const win = g.over === 'win';
    const news = recordEnd(this.meta, g);
    this.endInfo = { win, score: score(g), days: g.time / DAY, unlocked: news, cause: g.cause || 'the wild', kills: g.kills, bosses: g.bossKills, parts: partsDone(g) };
    clearRun();
    this.g = null;
    this.screen = 'end';
    this.modal = null;
    play(win ? 'win' : 'lose');
    this.render();
  }

  // ---------------- loop ----------------

  private resize(): void {
    if (!this.canvas) return;
    const wrap = this.canvas.parentElement!;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.dark.width = Math.max(1, Math.floor(w / 2));
    this.dark.height = Math.max(1, Math.floor(h / 2));
    const tiles = w < 600 ? 9.5 : 16;
    this.ts = Math.max(30, Math.min(64, (w / tiles) | 0)) * dpr;
    this.sprites.clear();
  }

  private paused(): boolean {
    return !!this.modal || document.hidden;
  }

  private frame(now: number): void {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const g = this.g;
    if (!g || this.screen !== 'play') return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    if (!this.paused()) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 6) {
        this.acc -= DT;
        n++;
        tick(g, this.input());
        this.drainEvents();
        if (g.over) break;
      }
      if (n >= 6) this.acc = 0;
    }
    if (g.over) {
      this.finish();
      return;
    }
    this.draw(dt);
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.2;
      this.updateUi();
    }
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 0.5;
      this.drawMini();
    }
  }

  private input(): { mx: number; my: number } {
    let mx = 0;
    let my = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (k.has('w') || k.has('arrowup')) my -= 1;
    if (k.has('s') || k.has('arrowdown')) my += 1;
    if (this.stick.active) {
      mx += this.stick.x;
      my += this.stick.y;
    }
    const l = Math.hypot(mx, my);
    if (l > 1) {
      mx /= l;
      my /= l;
    }
    return { mx, my };
  }

  private drainEvents(): void {
    const g = this.g!;
    for (const e of g.ev) {
      switch (e.k) {
        case 'float':
          if (this.floats.length > 24) this.floats.shift();
          this.floats.push({ x: e.x, y: e.y, text: e.text, color: e.color, t: 0 });
          break;
        case 'sfx':
          play(e.name);
          if (e.name === 'chop' || e.name === 'mine' || e.name === 'hit') this.burst(g.p.goal?.x ?? g.p.x, (g.p.goal?.y ?? g.p.y) - 0.3, e.name === 'chop' ? '#c8a165' : e.name === 'mine' ? '#bbb' : '#fff', 5);
          break;
        case 'toast':
          this.toast(e.text);
          break;
        case 'shake':
          this.shake = Math.max(this.shake, e.n);
          break;
        case 'craft':
          this.modal = { kind: 'craft' };
          this.render();
          break;
        case 'dawn':
          saveRun(g);
          break;
        case 'ring':
          this.rings.push({ x: e.x, y: e.y, r: e.r, color: e.color, t: 0 });
          break;
      }
    }
    g.ev.length = 0;
  }

  private burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n && this.parts.length < 300; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2.5;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, t: 0, max: 0.4 + Math.random() * 0.3, color, size: 0.06 + Math.random() * 0.06 });
    }
  }

  // ---------------- drawing ----------------

  private sprite(icon: string, px: number): HTMLCanvasElement {
    const size = Math.max(8, Math.round(px));
    const key = `${icon}|${size}`;
    let c = this.sprites.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * 1.3);
    const x = c.getContext('2d')!;
    x.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(icon, c.width / 2, c.height / 2 + size * 0.06);
    if (this.sprites.size > 400) this.sprites.clear();
    this.sprites.set(key, c);
    return c;
  }

  private drawIcon(ctx: CanvasRenderingContext2D, icon: string, sx: number, sy: number, px: number, flip = 1, alpha = 1): void {
    const sp = this.sprite(icon, px);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx, sy);
    if (flip < 0) ctx.scale(-1, 1);
    ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
    ctx.restore();
  }

  private draw(dt: number): void {
    const g = this.g!;
    const ctx = this.ctx!;
    const cv = this.canvas!;
    const W = cv.width;
    const H = cv.height;
    const ts = this.ts;
    const p = g.p;
    const a = Math.min(1, this.acc / DT);
    const ppx = p.px + (p.x - p.px) * a;
    const ppy = p.py + (p.y - p.py) * a;
    this.cam.x += (ppx - this.cam.x) * Math.min(1, dt * 8);
    this.cam.y += (ppy - this.cam.y) * Math.min(1, dt * 8);
    if (Math.abs(this.cam.x - ppx) > 6 || Math.abs(this.cam.y - ppy) > 6) {
      this.cam.x = ppx;
      this.cam.y = ppy;
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    const shx = this.shake ? (Math.random() - 0.5) * this.shake * 2 : 0;
    const shy = this.shake ? (Math.random() - 0.5) * this.shake * 2 : 0;
    const ox = W / 2 - this.cam.x * ts + shx;
    const oy = H / 2 - this.cam.y * ts + shy;
    const sx = (x: number): number => ox + x * ts;
    const sy = (y: number): number => oy + y * ts;
    const season = seasonOf(g);
    const sd = SEASON_DEFS[season];

    // Ground
    ctx.fillStyle = '#1d3b4f';
    ctx.fillRect(0, 0, W, H);
    const x0 = Math.max(0, Math.floor(this.cam.x - W / 2 / ts) - 1);
    const x1 = Math.min(MAP - 1, Math.ceil(this.cam.x + W / 2 / ts) + 1);
    const y0 = Math.max(0, Math.floor(this.cam.y - H / 2 / ts) - 1);
    const y1 = Math.min(MAP - 1, Math.ceil(this.cam.y + H / 2 / ts) + 1);
    const tsz = Math.ceil(ts) + 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * MAP + x;
        const X = Math.floor(sx(x));
        const Y = Math.floor(sy(y));
        if (g.w.water[i]) {
          const wv = Math.sin(this.clock * 1.5 + x * 0.7 + y * 0.4) * 6;
          ctx.fillStyle = season === 'winter' ? `rgb(${150 + wv},${185 + wv},${210 + wv})` : `rgb(${36 + wv},${92 + wv},${122 + wv})`;
          ctx.fillRect(X, Y, tsz, tsz);
          continue;
        }
        const b = BIOME_IDS[g.w.biome[i]];
        const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        ctx.fillStyle = (h & 1) ^ ((x + y) & 1) ? BIOMES[b].color : BIOMES[b].alt;
        ctx.fillRect(X, Y, tsz, tsz);
        // little details
        if ((h & 7) < 3) {
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          const dx = ((h >> 3) & 15) / 16;
          const dy = ((h >> 7) & 15) / 16;
          ctx.fillRect(X + dx * ts, Y + dy * ts, ts * 0.08, ts * 0.18);
        }
      }
    }
    // Shore lines
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * MAP + x;
        if (!g.w.water[i]) continue;
        if (y > 0 && !g.w.water[i - MAP]) ctx.fillRect(sx(x), sy(y), ts, ts * 0.08);
      }
    }
    // Season tint on land
    ctx.fillStyle = sd.tint;
    ctx.fillRect(0, 0, W, H);

    // Rings on the ground (boss slams)
    for (const c of g.cre) {
      if (c.st === 'windup' && c.wx !== undefined) {
        const d = CREATURES[c.k];
        const k = 1 - (c.wind ?? 0) / (d.windup ?? 1);
        ctx.fillStyle = `rgba(255,40,40,${0.15 + 0.25 * k})`;
        ctx.strokeStyle = 'rgba(255,80,80,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx(c.wx), sy(c.wy!), (d.area ?? 2) * ts, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx(c.wx), sy(c.wy!), (d.area ?? 2) * ts * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Collect drawables
    type D = { y: number; f: () => void };
    const list: D[] = [];
    const inView = (x: number, y: number): boolean => x > x0 - 1 && x < x1 + 2 && y > y0 - 1 && y < y1 + 2;
    const goalNode = p.goal?.kind === 'node' ? p.goal.id : -1;
    const working = goalNode >= 0 && p.work > 0;
    for (const n of g.w.nodes) {
      if (!inView(n.x, n.y) || n.s === 2) continue;
      const d = NODES[n.k];
      if (n.s === 1 && d.used === null) continue;
      const icon = n.s === 1 ? d.used! : d.icon;
      if (icon === '·') {
        list.push({ y: n.y, f: () => {
          ctx.fillStyle = 'rgba(40,30,10,0.35)';
          ctx.beginPath();
          ctx.ellipse(sx(n.x), sy(n.y), ts * 0.15, ts * 0.07, 0, 0, Math.PI * 2);
          ctx.fill();
        } });
        continue;
      }
      const size = n.s === 1 ? d.size * 0.5 : d.size;
      const big = n.k === 'vein';
      list.push({
        y: n.y,
        f: () => {
          const wob = working && n.id === goalNode ? Math.sin(this.clock * 40) * ts * 0.04 : 0;
          const X = sx(n.x) + wob;
          const Y = sy(n.y);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath();
          ctx.ellipse(X, Y + ts * 0.05, ts * size * 0.32, ts * size * 0.12, 0, 0, Math.PI * 2);
          ctx.fill();
          const snowy = season === 'winter' && (n.k === 'tree' || n.k === 'oak') && n.s === 0;
          this.drawIcon(ctx, icon, X, Y - ts * size * 0.38, ts * size * 0.8);
          if (snowy) {
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.beginPath();
            ctx.ellipse(X, Y - ts * size * 0.72, ts * size * 0.18, ts * size * 0.07, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          if (big) {
            ctx.fillStyle = '#ffd166';
            ctx.beginPath();
            ctx.arc(X + ts * 0.15, Y - ts * 0.5, ts * 0.07, 0, Math.PI * 2);
            ctx.arc(X - ts * 0.12, Y - ts * 0.35, ts * 0.05, 0, Math.PI * 2);
            ctx.fill();
          }
          if (n.k.startsWith('p') && NODES[n.k].drops[0] && ITEMS[NODES[n.k].drops[0][0]]?.part) {
            const k = 0.5 + 0.5 * Math.sin(this.clock * 4);
            ctx.strokeStyle = `rgba(200,160,255,${0.4 + 0.5 * k})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(X, Y - ts * 0.3, ts * (0.5 + 0.15 * k), 0, Math.PI * 2);
            ctx.stroke();
          }
        },
      });
    }
    for (const s of g.st) {
      if (!inView(s.x, s.y)) continue;
      list.push({ y: s.y, f: () => this.drawStruct(ctx, g, s, sx(s.x), sy(s.y)) });
    }
    for (const d of g.drops) {
      if (!inView(d.x, d.y)) continue;
      list.push({
        y: d.y - 0.1,
        f: () => {
          const bob = Math.sin(this.clock * 3 + d.id) * ts * 0.04;
          this.drawIcon(ctx, ITEMS[d.s.id].icon, sx(d.x), sy(d.y) - ts * 0.2 + bob, ts * 0.42);
          if (ITEMS[d.s.id].part) {
            ctx.strokeStyle = 'rgba(200,160,255,0.8)';
            ctx.beginPath();
            ctx.arc(sx(d.x), sy(d.y) - ts * 0.2, ts * 0.35, 0, Math.PI * 2);
            ctx.stroke();
          }
        },
      });
    }
    for (const c of g.cre) {
      const cx = c.px + (c.x - c.px) * a;
      const cy = c.py + (c.y - c.py) * a;
      if (!inView(cx, cy)) continue;
      list.push({ y: cy, f: () => this.drawCreature(ctx, c, sx(cx), sy(cy)) });
    }
    list.push({ y: ppy, f: () => this.drawPlayer(ctx, g, sx(ppx), sy(ppy)) });
    list.sort((u, v) => u.y - v.y);
    for (const d of list) d.f();

    // Goal marker
    if (p.goal && p.goal.kind === 'pos') {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      const r = ts * (0.18 + 0.05 * Math.sin(this.clock * 8));
      ctx.beginPath();
      ctx.arc(sx(p.goal.x), sy(p.goal.y), r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Particles
    if (season === 'winter' || season === 'autumn') {
      const n = season === 'winter' ? 3 : 0.3;
      for (let i = 0; i < n; i++) {
        if (Math.random() < (n < 1 ? n : 1) && this.parts.length < 280) {
          const wx = this.cam.x + (Math.random() - 0.5) * (W / ts);
          const wy = this.cam.y - H / 2 / ts;
          this.parts.push({ x: wx, y: wy, vx: season === 'winter' ? 0.3 : 0.8, vy: season === 'winter' ? 1.2 + Math.random() : 0.8, t: 0, max: 8, color: season === 'winter' ? '#ffffff' : '#d9822b', size: season === 'winter' ? 0.05 : 0.08 });
        }
      }
    }
    for (const s of g.st) {
      if ((s.k === 'campfire' || s.k === 'firepit') && s.fuel > 0 && Math.random() < 0.3 && inView(s.x, s.y)) {
        this.parts.push({ x: s.x + (Math.random() - 0.5) * 0.3, y: s.y - 0.4, vx: (Math.random() - 0.5) * 0.4, vy: -1 - Math.random(), t: 0, max: 0.8, color: '#ffb347', size: 0.05 });
      }
    }
    this.parts = this.parts.filter((q) => {
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.max < 2) q.vy += 3 * dt * (q.color === '#ffb347' ? -0.2 : 1);
      if (q.t > q.max) return false;
      ctx.globalAlpha = Math.max(0, 1 - q.t / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(sx(q.x), sy(q.y), ts * q.size, ts * q.size);
      return true;
    });
    ctx.globalAlpha = 1;

    // Darkness
    const dk = darkness(g);
    if (dk > 0.01) {
      const dc = this.dark.getContext('2d')!;
      const dw = this.dark.width;
      const dh = this.dark.height;
      const k = dw / W;
      dc.globalCompositeOperation = 'source-over';
      dc.clearRect(0, 0, dw, dh);
      dc.fillStyle = `rgba(6,8,22,${dk})`;
      dc.fillRect(0, 0, dw, dh);
      dc.globalCompositeOperation = 'destination-out';
      for (const l of lights(g)) {
        const lx = (l.x === p.x && l.y === p.y ? sx(ppx) : sx(l.x)) * k;
        const ly = (l.x === p.x && l.y === p.y ? sy(ppy) : sy(l.y)) * k;
        const r = l.r * ts * k * (1 + Math.sin(this.clock * 9 + l.x) * 0.03);
        const grd = dc.createRadialGradient(lx, ly, r * 0.15, lx, ly, r);
        grd.addColorStop(0, 'rgba(0,0,0,1)');
        grd.addColorStop(0.65, 'rgba(0,0,0,0.85)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        dc.fillStyle = grd;
        dc.beginPath();
        dc.arc(lx, ly, r, 0, Math.PI * 2);
        dc.fill();
      }
      ctx.drawImage(this.dark, 0, 0, W, H);
      // Warm glow
      ctx.globalCompositeOperation = 'lighter';
      for (const l of lights(g)) {
        const lx = l.x === p.x && l.y === p.y ? sx(ppx) : sx(l.x);
        const ly = l.x === p.x && l.y === p.y ? sy(ppy) : sy(l.y);
        const r = l.r * ts * 0.7;
        const grd = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
        grd.addColorStop(0, `rgba(255,150,50,${0.18 * dk})`);
        grd.addColorStop(1, 'rgba(255,150,50,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(lx, ly, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // Eyes in the dark
      if (p.dark > 0.5) {
        const ex = sx(ppx) + Math.cos(this.clock * 0.7) * ts * 2.2;
        const ey = sy(ppy) + Math.sin(this.clock * 0.9) * ts * 1.4;
        ctx.fillStyle = `rgba(255,240,180,${Math.min(1, p.dark / 2)})`;
        ctx.beginPath();
        ctx.ellipse(ex - ts * 0.12, ey, ts * 0.06, ts * 0.03, 0, 0, Math.PI * 2);
        ctx.ellipse(ex + ts * 0.12, ey, ts * 0.06, ts * 0.03, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Floats
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(ts * 0.36)}px system-ui, sans-serif`;
    this.floats = this.floats.filter((f) => {
      f.t += dt;
      if (f.t > 1.2) return false;
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      const X = sx(f.x);
      const Y = sy(f.y) - f.t * ts * 0.8;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(f.text, X, Y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, X, Y);
      return true;
    });
    ctx.globalAlpha = 1;
    this.rings = this.rings.filter((r) => {
      r.t += dt;
      return r.t < 0.3;
    });

    // Vignettes
    const vg = (color: string, strength: number): void => {
      const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, color.replace('A', String(strength)));
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
    };
    if (p.hurt > 0) vg('rgba(255,0,0,A)', p.hurt * 1.5);
    if (p.temp < 5) vg('rgba(120,190,255,A)', Math.min(0.6, (5 - p.temp) / 10 + 0.2));
    if (p.temp > 64) vg('rgba(255,120,0,A)', Math.min(0.6, (p.temp - 64) / 10 + 0.2));
    if (p.dark > 0) vg('rgba(80,0,120,A)', Math.min(0.7, p.dark / 3));
    if (g.winT > 0) {
      ctx.fillStyle = `rgba(200,160,255,${Math.min(0.8, (3 - g.winT) / 3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawStruct(ctx: CanvasRenderingContext2D, g: Game, s: Game['st'][number], X: number, Y: number): void {
    const ts = this.ts;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(X, Y + ts * 0.05, ts * 0.45, ts * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    if (s.k === 'campfire' || s.k === 'firepit') {
      if (s.k === 'firepit') {
        ctx.fillStyle = '#6d6a64';
        for (let i = 0; i < 8; i++) {
          const an = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(X + Math.cos(an) * ts * 0.36, Y + Math.sin(an) * ts * 0.16, ts * 0.09, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      this.drawIcon(ctx, '🪵', X, Y - ts * 0.05, ts * 0.45);
      if (s.fuel > 0) {
        const k = Math.min(1, s.fuel / 120);
        const fl = 1 + Math.sin(this.clock * 14 + s.id) * 0.08;
        this.drawIcon(ctx, '🔥', X, Y - ts * (0.25 + 0.2 * k), ts * (0.4 + 0.45 * k) * fl);
        const max = STRUCTS[s.k].maxFuel!;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(X - ts * 0.3, Y + ts * 0.22, ts * 0.6, ts * 0.06);
        ctx.fillStyle = s.fuel / max < 0.25 ? '#ef476f' : '#ffb347';
        ctx.fillRect(X - ts * 0.3, Y + ts * 0.22, ts * 0.6 * (s.fuel / max), ts * 0.06);
      } else {
        ctx.fillStyle = 'rgba(60,60,60,0.8)';
        ctx.beginPath();
        ctx.arc(X, Y - ts * 0.1, ts * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    if (s.k === 'portal') {
      const parts = s.parts ?? [];
      const spin = this.clock * (g.winT > 0 ? 6 : 0.8);
      ctx.strokeStyle = '#8f7fbf';
      ctx.lineWidth = ts * 0.1;
      ctx.beginPath();
      ctx.ellipse(X, Y - ts * 0.5, ts * 0.9, ts * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (parts.length) {
        ctx.fillStyle = `rgba(160,120,255,${0.15 + parts.length * 0.12})`;
        ctx.beginPath();
        ctx.ellipse(X, Y - ts * 0.5, ts * 0.8, ts * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      this.drawIcon(ctx, '🌀', X, Y - ts * 0.5, ts * (0.6 + parts.length * 0.15), Math.cos(spin) > 0 ? 1 : -1, 0.6 + parts.length * 0.1);
      PARTS.forEach((id, i) => {
        const an = (i / 4) * Math.PI * 2 + spin * 0.3;
        const px = X + Math.cos(an) * ts * 1.1;
        const py = Y - ts * 0.5 + Math.sin(an) * ts * 0.8;
        this.drawIcon(ctx, parts.includes(id) ? ITEMS[id].icon : '◽', px, py, ts * 0.35, 1, parts.includes(id) ? 1 : 0.5);
      });
      return;
    }
    if (s.k === 'trap') {
      this.drawIcon(ctx, s.caught ? '🐇' : '🪤', X, Y - ts * 0.2, ts * 0.5);
      return;
    }
    if (s.k === 'rack') {
      this.drawIcon(ctx, '🪝', X, Y - ts * 0.45, ts * 0.7);
      (s.hang ?? []).forEach((h, i) => this.drawIcon(ctx, h.t <= 0 ? '🥓' : '🥩', X - ts * 0.25 + i * ts * 0.25, Y - ts * 0.35, ts * 0.28));
      return;
    }
    const d = STRUCTS[s.k];
    const bob = Math.sin(this.clock * 2 + s.id) * ts * 0.03;
    this.drawIcon(ctx, d.icon, X, Y - ts * 0.45 + bob, ts * 0.85);
  }

  private drawCreature(ctx: CanvasRenderingContext2D, c: Game['cre'][number], X: number, Y: number): void {
    const ts = this.ts;
    const d = CREATURES[c.k];
    const size = d.size;
    const sleeping = c.st === 'sleep';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(X, Y + ts * 0.05, ts * size * 0.32, ts * size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    const hop = c.st === 'chase' || c.st === 'flee' ? Math.abs(Math.sin(this.clock * 12 + c.id)) * ts * 0.08 : 0;
    const wind = c.st === 'windup' ? 1 + Math.sin(this.clock * 40) * 0.06 : 1;
    if (c.k === 'shade') {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#120a1e';
      ctx.beginPath();
      ctx.ellipse(X, Y - ts * 0.5, ts * 0.35, ts * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff4060';
      ctx.fillRect(X - ts * 0.15, Y - ts * 0.75, ts * 0.08, ts * 0.05);
      ctx.fillRect(X + ts * 0.07, Y - ts * 0.75, ts * 0.08, ts * 0.05);
      ctx.globalAlpha = 1;
    } else {
      this.drawIcon(ctx, d.icon, X, Y - ts * size * 0.4 - hop, ts * size * 0.75 * wind, -c.face, sleeping ? 0.85 : 1);
    }
    if (c.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      this.drawIcon(ctx, d.icon, X, Y - ts * size * 0.4, ts * size * 0.75, -c.face, 0.6);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (sleeping) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `bold ${Math.round(ts * 0.25)}px system-ui`;
      ctx.fillText('z', X + ts * 0.3, Y - ts * size * 0.8 - Math.sin(this.clock * 2) * ts * 0.1);
    }
    if (c.angry && d.mood !== 'hostile' && !sleeping) {
      ctx.fillStyle = '#ff5d5d';
      ctx.font = `bold ${Math.round(ts * 0.3)}px system-ui`;
      ctx.fillText('!', X, Y - ts * size * 0.9);
    }
    if (c.hp < c.max) {
      const w = ts * Math.max(0.6, size * 0.6);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(X - w / 2, Y - ts * size * 0.95, w, ts * 0.07);
      ctx.fillStyle = d.boss ? '#ff4d6d' : '#e63946';
      ctx.fillRect(X - w / 2, Y - ts * size * 0.95, w * (c.hp / c.max), ts * 0.07);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, g: Game, X: number, Y: number): void {
    const ts = this.ts;
    const p = g.p;
    const ch = CHARS[g.char];
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(X, Y + ts * 0.05, ts * 0.3, ts * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    const bob = p.moving ? Math.abs(Math.sin(this.clock * 12)) * ts * 0.07 : 0;
    this.drawIcon(ctx, ch.icon, X, Y - ts * 0.45 - bob, ts * 0.7, p.face < 0 ? 1 : -1);
    if (p.hurt > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,40,40,0.4)';
      ctx.beginPath();
      ctx.arc(X, Y - ts * 0.45, ts * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    const hd = p.eq.head;
    if (hd) this.drawIcon(ctx, ITEMS[hd.id].icon, X, Y - ts * 0.85 - bob, ts * 0.38);
    const h = p.eq.hand;
    if (h) {
      const sw = p.swing > 0 ? Math.sin((p.swing / 0.25) * Math.PI) * 1.2 : 0;
      ctx.save();
      ctx.translate(X + p.face * ts * 0.32, Y - ts * 0.4 - bob);
      ctx.rotate(p.face * (0.3 + sw));
      const sp = this.sprite(ITEMS[h.id].icon, ts * 0.42);
      ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
      ctx.restore();
    }
    const body = p.eq.body;
    if (body) this.drawIcon(ctx, ITEMS[body.id].icon, X - p.face * ts * 0.28, Y - ts * 0.25 - bob, ts * 0.28);
  }

  private drawMini(): void {
    const g = this.g;
    const mc = this.mini;
    if (!g || !mc) return;
    const c = mc.getContext('2d')!;
    const img = c.createImageData(MAP, MAP);
    for (let i = 0; i < MAP * MAP; i++) {
      const o = i * 4;
      if (!g.seen[i]) {
        img.data[o + 3] = 0;
        continue;
      }
      if (g.w.water[i]) {
        img.data[o] = 40;
        img.data[o + 1] = 90;
        img.data[o + 2] = 130;
      } else {
        const rgb = BIOME_RGB[BIOME_IDS[g.w.biome[i]]];
        img.data[o] = rgb[0];
        img.data[o + 1] = rgb[1];
        img.data[o + 2] = rgb[2];
      }
      img.data[o + 3] = 230;
    }
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = MAP;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    c.clearRect(0, 0, mc.width, mc.height);
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, mc.width, mc.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(tmp, 0, 0, mc.width, mc.height);
    const k = mc.width / MAP;
    const dot = (x: number, y: number, color: string, r: number): void => {
      c.fillStyle = color;
      c.beginPath();
      c.arc(x * k, y * k, r, 0, Math.PI * 2);
      c.fill();
    };
    for (const s of g.st) {
      if (s.k === 'portal') dot(s.x, s.y, '#b388ff', 4);
      else if (s.k === 'science' || s.k === 'alchemy') dot(s.x, s.y, '#8ecae6', 2.5);
      else if (s.fuel > 0) dot(s.x, s.y, '#ffb347', 2);
    }
    for (const n of g.w.nodes) {
      if (n.s === 0 && n.k.startsWith('p') && ITEMS[NODES[n.k].drops[0]?.[0]]?.part && g.seen[Math.floor(n.y) * MAP + Math.floor(n.x)]) dot(n.x, n.y, '#e0c3ff', 3);
    }
    for (const cr of g.cre) if (CREATURES[cr.k].boss && g.seen[Math.floor(cr.y) * MAP + Math.floor(cr.x)]) dot(cr.x, cr.y, '#ff4d6d', 3);
    dot(g.p.x, g.p.y, '#ffffff', 3);
  }

  // ---------------- input ----------------

  private worldAt(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.canvas) return null;
    const r = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / r.width;
    const px = (clientX - r.left) * dpr;
    const py = (clientY - r.top) * dpr;
    return { x: this.cam.x + (px - this.canvas.width / 2) / this.ts, y: this.cam.y + (py - this.canvas.height / 2) / this.ts };
  }

  /** The thing under a world point, as a goal. */
  private pick(x: number, y: number): Goal | null {
    const g = this.g!;
    let best: Goal | null = null;
    let bd = 0.9;
    for (const c of g.cre) {
      const s = CREATURES[c.k].size;
      const d = Math.hypot(c.x - x, c.y - s * 0.35 - y) / Math.max(0.8, s * 0.6);
      if (d < bd) {
        bd = d;
        best = { kind: 'creature', id: c.id, x: c.x, y: c.y };
      }
    }
    for (const dr of g.drops) {
      const d = Math.hypot(dr.x - x, dr.y - 0.2 - y) / 0.5;
      if (d < bd) {
        bd = d;
        best = { kind: 'drop', id: dr.id, x: dr.x, y: dr.y };
      }
    }
    for (const s of g.st) {
      const d = Math.hypot(s.x - x, s.y - 0.4 - y) / (s.k === 'portal' ? 1.2 : 0.7);
      if (d < bd) {
        bd = d;
        best = { kind: 'struct', id: s.id, x: s.x, y: s.y };
      }
    }
    for (const n of g.w.nodes) {
      if (n.s !== 0 || NODES[n.k].hits <= 0) continue;
      const sz = NODES[n.k].size;
      const d = Math.hypot(n.x - x, n.y - sz * 0.35 - y) / Math.max(0.55, sz * 0.5);
      if (d < bd) {
        bd = d;
        best = { kind: 'node', id: n.id, x: n.x, y: n.y };
      }
    }
    return best;
  }

  private label(goal: Goal | null): string {
    const g = this.g!;
    if (!goal) return '';
    if (goal.kind === 'creature') {
      const c = g.cre.find((x) => x.id === goal.id);
      if (!c) return '';
      const d = CREATURES[c.k];
      return `${d.icon} ${d.name} · ${c.hp}/${c.max} · ${d.mood} · ${d.text}`;
    }
    if (goal.kind === 'node') {
      const n = g.w.nodes.find((x) => x.id === goal.id);
      if (!n) return '';
      const d = NODES[n.k];
      return `${d.icon} ${d.name}${d.tool ? (d.tool === 'chop' ? ' · needs an axe' : ' · needs a pickaxe') : ''}${n.k === 'nest' ? ' · spiders live here' : ''}`;
    }
    if (goal.kind === 'struct') {
      const s = g.st.find((x) => x.id === goal.id);
      if (!s) return '';
      const d = STRUCTS[s.k];
      const fuel = d.maxFuel ? ` · fuel ${Math.ceil(s.fuel)}s` : '';
      const parts = s.k === 'portal' ? ` · ${(s.parts ?? []).length}/4 parts` : '';
      return `${d.icon} ${d.name}${fuel}${parts} · ${d.text}`;
    }
    if (goal.kind === 'drop') {
      const d = g.drops.find((x) => x.id === goal.id);
      return d ? `${ITEMS[d.s.id].icon} ${ITEMS[d.s.id].name} ×${d.s.n}` : '';
    }
    return '';
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    const t = e.target as HTMLElement;
    if (e.pointerType === 'touch' && !this.touch) {
      this.touch = true;
      this.root.querySelector('.touch')?.classList.add('show');
      this.uiSig = '';
    }
    if (this.screen !== 'play' || this.modal) return;
    if (t.closest('#stick')) {
      const r = this.root.querySelector<HTMLElement>('#stick')!.getBoundingClientRect();
      this.stick = { x: 0, y: 0, active: true, id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      this.moveStick(e);
      e.preventDefault();
      return;
    }
    if (t.id === 'cv') {
      const w = this.worldAt(e.clientX, e.clientY);
      if (!w || !this.g) return;
      const goal = this.pick(w.x, w.y) ?? { kind: 'pos' as const, id: 0, x: w.x, y: w.y };
      setGoal(this.g, goal);
      if (goal.kind === 'pos') this.rings.push({ x: w.x, y: w.y, r: 0.3, color: '#fff', t: 0 });
    }
  }

  private moveStick(e: PointerEvent): void {
    const R = 44;
    let dx = e.clientX - this.stick.cx;
    let dy = e.clientY - this.stick.cy;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    this.stick.x = dx / R;
    this.stick.y = dy / R;
    const knob = this.root.querySelector<HTMLElement>('#knob');
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  private onMove(e: PointerEvent): void {
    if (this.stick.active && e.pointerId === this.stick.id) {
      this.moveStick(e);
      return;
    }
    if (this.screen !== 'play' || !this.g || e.pointerType === 'touch') return;
    const lab = this.root.querySelector<HTMLElement>('#hoverlabel');
    if (!lab) return;
    if ((e.target as HTMLElement).id !== 'cv') {
      lab.textContent = '';
      return;
    }
    const w = this.worldAt(e.clientX, e.clientY);
    lab.textContent = w ? this.label(this.pick(w.x, w.y)) : '';
  }

  private onUp(e: PointerEvent): void {
    if (this.stick.active && e.pointerId === this.stick.id) {
      this.stick.active = false;
      this.stick.x = this.stick.y = 0;
      const knob = this.root.querySelector<HTMLElement>('#knob');
      if (knob) knob.style.transform = '';
    }
  }

  private doAct(): void {
    const g = this.g;
    if (!g) return;
    const goal = nearestAct(g, 4.5);
    if (goal) setGoal(g, goal);
    else this.toast('Nothing close by to act on.');
  }

  private doAttack(): void {
    const g = this.g;
    if (!g) return;
    const goal = nearestFoe(g, 7);
    if (goal) setGoal(g, goal);
    else this.toast('No creature close by.');
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if (!down) {
      this.keys.delete(k);
      return;
    }
    initAudio();
    if (this.screen === 'title') {
      if (k === 'enter') (this.root.querySelector<HTMLElement>('[data-act="continue"]') ?? this.root.querySelector<HTMLElement>('[data-act="new"]'))?.click();
      return;
    }
    if (this.screen === 'end') {
      if (k === 'enter') this.root.querySelector<HTMLElement>('[data-act="title"]')?.click();
      return;
    }
    if (k === 'escape') {
      this.modal = this.modal ? null : { kind: 'menu', confirm: false };
      if (this.modal && this.g) saveRun(this.g);
      this.render();
      return;
    }
    if (k === 'c') {
      this.modal = this.modal?.kind === 'craft' ? null : { kind: 'craft' };
      this.render();
      return;
    }
    if (this.modal) return;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      this.keys.add(k);
      e.preventDefault();
      return;
    }
    const g = this.g;
    if (!g) return;
    if (k === ' ' || k === 'e') {
      e.preventDefault();
      if (!e.repeat) this.doAct();
      return;
    }
    if (k === 'f') {
      this.doAttack();
      return;
    }
    if (/^[1-9]$/.test(k)) {
      const i = Number(k) - 1;
      if (g.p.inv[i]) {
        useItem(g, i);
        this.drainEvents();
        this.updateUi();
      }
    }
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t) return;
    if (t.hasAttribute('data-stop') && t.dataset.act !== 'modal-close') return;
    const act = t.dataset.act!;
    if (act === 'modal-close' && (e.target as HTMLElement).closest('[data-stop]') && !(e.target as HTMLElement).closest('button')) return;
    const g = this.g;
    switch (act) {
      case 'new':
        this.startRun();
        break;
      case 'continue':
        if (this.g) {
          this.screen = 'play';
          this.bot = new Bot('good');
          this.render();
          this.toast(`Welcome back. Day ${dayNum(this.g)}.`);
        }
        break;
      case 'char':
        this.meta.char = t.dataset.id!;
        saveMeta(this.meta);
        play('click');
        this.render();
        break;
      case 'help':
        this.modal = { kind: 'help' };
        this.render();
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        if (g) saveRun(g);
        this.render();
        break;
      case 'modal-close':
        this.modal = null;
        this.render();
        break;
      case 'mute': {
        const m = toggleMute();
        try {
          localStorage.setItem(MUTE_KEY, m ? '1' : '0');
        } catch {
          /* ignore */
        }
        t.textContent = m ? '🔇' : '🔊';
        break;
      }
      case 'to-title':
        if (g) saveRun(g);
        this.modal = null;
        this.screen = 'title';
        this.render();
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        break;
      case 'abandon-yes':
        if (g) {
          g.over = 'dead';
          g.cause = 'giving up';
          this.modal = null;
          this.finish();
        }
        break;
      case 'title':
        this.screen = 'title';
        this.render();
        break;
      case 'craft-open':
        this.modal = { kind: 'craft' };
        this.render();
        break;
      case 'craft':
        if (g && craft(g, t.dataset.id!)) {
          this.drainEvents();
          const r = RECIPES.find((x) => x.id === t.dataset.id);
          if (r?.place) {
            this.modal = null;
            this.render();
          } else this.updateUi(true);
        } else play('deny');
        break;
      case 'slot': {
        const i = Number(t.dataset.i);
        if (!g) break;
        if (this.sel === i && g.p.inv[i]) {
          useItem(g, i);
          this.drainEvents();
        } else {
          this.sel = g.p.inv[i] ? i : null;
          this.selEq = null;
        }
        this.updateUi(true);
        break;
      }
      case 'eq': {
        const sl = t.dataset.slot as Slot;
        this.selEq = g?.p.eq[sl] ? sl : null;
        this.sel = null;
        this.updateUi(true);
        break;
      }
      case 'use':
        if (g && this.sel !== null) {
          useItem(g, this.sel);
          this.drainEvents();
          if (!g.p.inv[this.sel]) this.sel = null;
          this.updateUi(true);
        }
        break;
      case 'cook':
        if (g && this.sel !== null) {
          cook(g, this.sel);
          this.drainEvents();
          if (!g.p.inv[this.sel]) this.sel = null;
          this.updateUi(true);
        }
        break;
      case 'burn':
        if (g && this.sel !== null) {
          const f = nearFire(g);
          const s = g.p.inv[this.sel];
          if (f && s) fuelFire(g, f, s.id);
          this.drainEvents();
          if (!g.p.inv[this.sel]) this.sel = null;
          this.updateUi(true);
        }
        break;
      case 'drop':
        if (g && this.sel !== null) {
          dropItem(g, this.sel);
          this.sel = null;
          this.updateUi(true);
        }
        break;
      case 'unequip':
        if (g && this.selEq) {
          unequip(g, this.selEq);
          this.drainEvents();
          this.selEq = null;
          this.updateUi(true);
        }
        break;
      case 't-act':
        this.doAct();
        break;
      case 't-attack':
        this.doAttack();
        break;
    }
  }

  // ---------------- debug ----------------

  private installDebug(): void {
    const api = {
      state: () => {
        const g = this.g;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          char: g?.char ?? this.meta.char,
          day: g ? dayNum(g) : null,
          days: g ? daysSurvived(g) : null,
          season: g ? seasonOf(g) : null,
          phase: g ? phase(g) : null,
          hp: g ? Math.round(g.p.hp) : null,
          hunger: g ? Math.round(g.p.hunger) : null,
          sanity: g ? Math.round(g.p.san) : null,
          temp: g ? Math.round(g.p.temp) : null,
          x: g ? Math.round(g.p.x * 10) / 10 : null,
          y: g ? Math.round(g.p.y * 10) / 10 : null,
          parts: g ? (portalStruct(g).parts ?? []).length : null,
          held: g ? PARTS.filter((id) => count(g, id) > 0) : null,
          creatures: g?.cre.length ?? null,
          bot: this.bot.mode,
          end: this.endInfo,
          meta: this.meta,
        };
      },
      /** One bot action: start a run, or simulate 20 seconds of play with the survival bot. */
      step: (seconds = 20) => {
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        if (this.screen === 'title') {
          this.startRun();
          return 'new';
        }
        if (this.screen === 'end') return 'end';
        const g = this.g!;
        const n = Math.round(seconds / DT);
        for (let i = 0; i < n && !g.over; i++) {
          tick(g, this.bot.input(g));
          if (FAST) {
            for (const ev of g.ev) if (ev.k === 'dawn') saveRun(g);
            g.ev.length = 0;
          } else this.drainEvents();
          if (this.modal) {
            this.modal = null;
            this.render();
          }
        }
        if (g.over) {
          this.finish();
          return 'over';
        }
        this.updateUi();
        return this.bot.mode;
      },
      give: (id: string, n = 1) => {
        if (this.g && ITEMS[id]) addItem(this.g, newStack(id, n));
        this.updateUi(true);
      },
      day: (d: number) => {
        if (this.g) this.g.time = (d - 1) * DAY + 1;
      },
      heal: () => {
        if (!this.g) return;
        const p = this.g.p;
        p.hp = p.maxHp;
        p.hunger = p.maxHunger;
        p.san = p.maxSan;
      },
      win: () => {
        if (!this.g) return;
        portalStruct(this.g).parts = [...PARTS];
        this.g.over = 'win';
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
