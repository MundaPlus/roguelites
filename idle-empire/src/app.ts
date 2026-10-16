import { Big, fmt, fmtMult } from './big';
import { newMem, smartAct } from './bot';
import { BLESS, CHAL, CHALLENGES, CURSE, GOAL, LAYERS, REGIONS, TIERS, UPGRADES, WONDER, WONDER_BONUS } from './data';
import {
  bestOffer,
  buyDecree,
  buyGen,
  buyMax,
  buyNode,
  buyRegion,
  buySet,
  buyUp,
  buyWonder,
  calcMods,
  canNode,
  click,
  conquestOpen,
  decreeCost,
  deserialize,
  enterChallenge,
  exitChallenge,
  exportSave,
  gainOf,
  genCost,
  goalMet,
  has,
  importSave,
  income,
  layerOpen,
  newGame,
  offline,
  pickOffer,
  prestige,
  regionCost,
  score,
  serialize,
  tick,
  tierOpen,
  tierRate,
  upCost,
  wonderCost,
  wonderOpen,
  type Game,
  type Mods,
  type Offer,
  type OfflineReport,
} from './game';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'game' | 'end';
type Tab = 'realm' | 'upgrades' | 'crown' | 'sigil' | 'star' | 'challenges' | 'save';

type Modal =
  | { kind: 'help' }
  | { kind: 'menu'; confirm: boolean }
  | { kind: 'offline'; rep: OfflineReport }
  | { kind: 'newgame' };

interface Meta {
  games: number;
  finished: number;
  abandoned: number;
  bestTime: number;
  bestScore: number;
  muted: boolean;
}

interface BindOut {
  t?: string;
  d?: boolean;
  on?: boolean;
  w?: number;
}

const RUN_KEY = 'idle-empire.run';
const META_KEY = 'idle-empire.meta';
const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
/** `?debug&fast`: each bot step simulates two minutes of game time. */
const FAST = PARAMS.has('fast');

function loadMeta(): Meta {
  const base: Meta = { games: 0, finished: 0, abandoned: 0, bestTime: 0, bestScore: 0, muted: false };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
  } catch {
    return base;
  }
}

function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* storage can be blocked */
  }
}

function loadGame(): Game | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

function clearGame(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function fmtTime(s: number): string {
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export class App {
  private g: Game | null = loadGame();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private tab: Tab = 'realm';
  private modal: Modal | null = null;
  private end: { victory: boolean; score: number; time: number; layers: number[]; wonder: number } | null = null;

  private binds: ((m: Mods) => BindOut)[] = [];
  private bindEls: HTMLElement[] = [];
  private sig = '';
  private last = Date.now();
  private lastUi = 0;
  private lastSave = Date.now();
  private lastAutoToast = 0;
  private wide = false;
  private ioText = '';
  private botMem = newMem();
  private busy = false;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    setMuted(this.meta.muted);
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    const mq = window.matchMedia('(min-width: 900px)');
    this.wide = mq.matches;
    mq.addEventListener('change', () => {
      this.wide = mq.matches;
      this.render();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
      else this.loop();
    });
    window.addEventListener('beforeunload', () => this.save());
    if (DEBUG) this.installDebug();
    this.render();
    setInterval(() => this.loop(), 100);
  }

  // ---------- Loop ----------

  private loop(): void {
    const now = Date.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (this.screen !== 'game' || !this.g || this.busy) return;
    const g = this.g;
    if (dt > 10) {
      // The tab slept: treat the gap as offline time.
      const rep = offline(g, dt);
      if (dt > 60 && !this.modal) this.modal = { kind: 'offline', rep };
      this.render();
    } else if (dt > 0) {
      const before = g.layers.map((l) => l.count);
      tick(g, dt);
      g.layers.forEach((l, i) => {
        if (l.count > before[i] && now - this.lastAutoToast > 8000) {
          this.lastAutoToast = now;
          this.toast(`${LAYERS[i].curIcon} Auto: ${LAYERS[i].verb.toLowerCase()}`);
        }
      });
    }
    if (g.finished) return this.finish(true);
    if (now - this.lastUi > 200) {
      this.lastUi = now;
      this.update();
    }
    if (now - this.lastSave > 10000) this.save();
  }

  private save(): void {
    this.lastSave = Date.now();
    if (!this.g || this.screen === 'end') return;
    this.g.saved = Date.now();
    try {
      localStorage.setItem(RUN_KEY, serialize(this.g));
    } catch {
      /* storage can be blocked */
    }
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private float(x: number, y: number, text: string, cls = ''): void {
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${x + (Math.random() * 40 - 20)}px`;
    el.style.top = `${y - 10}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  private flash(): void {
    document.body.classList.remove('flash');
    void document.body.offsetWidth;
    document.body.classList.add('flash');
  }

  // ---------- Bindings ----------

  private bind(fn: (m: Mods) => BindOut): string {
    this.binds.push(fn);
    return `data-b="${this.binds.length - 1}"`;
  }

  private signature(): string {
    const g = this.g;
    if (!g || this.screen !== 'game') return this.screen;
    const m = calcMods(g);
    return [
      this.tab,
      this.wide,
      g.offers ? g.offerN : 'x',
      g.challenge,
      g.path?.b,
      TIERS.map((_, t) => (tierOpen(g, t, m) ? 1 : 0)).join(''),
      g.ups.length,
      g.layers.map((l) => `${l.tree.length}/${l.count}`).join(','),
      [0, 1, 2].map((i) => (layerOpen(g, i) ? 1 : 0)).join(''),
      g.regions,
      g.wonder,
      g.chDone.length,
      g.auto,
      g.autoPrestige,
      !!this.modal,
    ].join('|');
  }

  private update(): void {
    if (!this.g || this.screen !== 'game') return;
    if (this.signature() !== this.sig) return this.render();
    const m = calcMods(this.g);
    for (let i = 0; i < this.bindEls.length; i++) {
      const el = this.bindEls[i];
      const o = this.binds[Number(el.dataset.b)](m);
      if (o.t !== undefined && el.textContent !== o.t) el.textContent = o.t;
      if (o.d !== undefined) (el as HTMLButtonElement).disabled = o.d;
      if (o.on !== undefined) el.classList.toggle('on', o.on);
      if (o.w !== undefined) el.style.width = `${Math.max(0, Math.min(100, o.w))}%`;
    }
  }

  // ---------- Views ----------

  private render(): void {
    this.binds = [];
    let body = '';
    if (this.screen === 'title') body = this.titleView();
    else if (this.screen === 'end') body = this.endView();
    else body = this.gameView();
    const top = this.screen === 'game' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    this.bindEls = Array.from(this.root.querySelectorAll<HTMLElement>('[data-b]'));
    this.sig = this.signature();
    if (this.g && this.screen === 'game') {
      const m = calcMods(this.g);
      for (const el of this.bindEls) {
        const o = this.binds[Number(el.dataset.b)](m);
        if (o.t !== undefined) el.textContent = o.t;
        if (o.d !== undefined) (el as HTMLButtonElement).disabled = o.d;
        if (o.on !== undefined) el.classList.toggle('on', o.on);
        if (o.w !== undefined) el.style.width = `${Math.max(0, Math.min(100, o.w))}%`;
      }
    }
  }

  private topBar(): string {
    const g = this.g!;
    const cur = LAYERS.map((l, i) =>
      layerOpen(g, i) || g.layers[i].count > 0 ? `<span class="cur" title="${l.cur}">${l.curIcon} <b ${this.bind(() => ({ t: fmt(g.layers[i].cur) }))}></b></span>` : '',
    ).join('');
    return `<header class="top">
      <span class="gold">🪙 <b ${this.bind(() => ({ t: fmt(g.gold) }))}></b></span>
      <span class="rate" ${this.bind((m) => ({ t: `+${fmt(income(g, m))}/s` }))}></span>
      ${cur}
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const g = this.g;
    const cont = g
      ? `<button class="primary" data-act="continue">▶ Continue empire<small>${fmtTime(g.time)} played · best ${fmt(Big.pow10(g.bestLog))} gold · wonder ${g.wonder}/5</small></button>`
      : '';
    return `<div class="title">
      <div class="logo">🏛️</div>
      <h1>Idle Empire</h1>
      <p class="sub">Click for gold. Hire peasants, build farms and cities. Ascend for crowns, found dynasties, transcend for stars. Then build the Wonder.</p>
      ${cont}
      <button class="${g ? '' : 'primary'}" data-act="new">${g ? 'New empire (ends the current one)' : '▶ New empire'}</button>
      <button data-act="help">How to play</button>
      <div class="stats">
        <div><b>${m.games}</b><small>Empires</small></div>
        <div><b>${m.finished}</b><small>Wonders</small></div>
        <div><b>${m.bestTime ? fmtTime(m.bestTime) : '–'}</b><small>Best time</small></div>
        <div><b>${m.bestScore || '–'}</b><small>Best score</small></div>
      </div>
      <p class="hint">The game saves every 10 seconds and keeps running while you are away (up to a cap).</p>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <div class="logo">${e.victory ? '🗼' : '🏚️'}</div>
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? 'The Wonder stands!' : 'The empire fell'}</h1>
      <p>${e.victory ? 'Your Eternal Spire rises above the clouds. The empire is complete.' : 'You gave up the throne. The next empire starts from nothing.'}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <div class="stats">
        <div><b>${fmtTime(e.time)}</b><small>Time</small></div>
        ${LAYERS.map((l, i) => `<div><b>${e.layers[i]}</b><small>${l.curIcon} ${l.plural}</small></div>`).join('')}
        <div><b>${e.wonder}/5</b><small>Wonder</small></div>
      </div>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private gameView(): string {
    const g = this.g!;
    const tabs: [Tab, string][] = [['realm', '🏰 Realm'], ['upgrades', '⚒️ Upgrades']];
    tabs.push(['crown', '👑 Crowns']);
    if (has(g, 'c_chal')) tabs.push(['challenges', '⚔️ Challenges']);
    if (layerOpen(g, 1)) tabs.push(['sigil', '🏺 Dynasty']);
    if (layerOpen(g, 2)) tabs.push(['star', '✨ Stars']);
    tabs.push(['save', '💾 Save']);
    let tab = this.tab;
    if (!tabs.some(([t]) => t === tab)) tab = this.tab = 'realm';
    const right = this.wide && tab === 'realm' ? 'upgrades' : tab;
    const nav = tabs
      .filter(([t]) => !(this.wide && t === 'realm'))
      .map(([t, label]) => `<button class="tab ${t === right ? 'on' : ''}" data-act="tab" data-tab="${t}">${label}</button>`)
      .join('');
    const realm = this.realmView();
    const panel = right === 'realm' ? '' : this.tabView(right);
    if (this.wide) {
      return `<div class="cols"><section class="col-left">${realm}</section><section class="col-right"><nav class="tabs">${nav}</nav>${panel}</section></div>`;
    }
    return `<nav class="tabs">${nav}</nav>${tab === 'realm' ? realm : panel}`;
  }

  private tabView(t: Tab): string {
    switch (t) {
      case 'upgrades':
        return this.upgradesView();
      case 'crown':
        return this.layerView(0);
      case 'sigil':
        return this.layerView(1);
      case 'star':
        return this.layerView(2);
      case 'challenges':
        return this.challengesView();
      case 'save':
        return this.saveView();
      default:
        return '';
    }
  }

  private offerHtml(o: Offer, i: number): string {
    const b = BLESS[o.b];
    const c = CURSE[o.c];
    const gl = GOAL[o.g];
    return `<button class="offer" data-act="offer" data-i="${i}">
      <span class="good">${b.icon} <b>${b.name}</b> ${b.text}</span>
      <span class="bad">${c.icon} <b>${c.name}</b> ${c.text}</span>
      <span class="goal">🎯 ${gl.icon} <b>${gl.name}</b> ${gl.text} <i>Gain ×1.5.</i></span>
    </button>`;
  }

  private runInfo(): string {
    const g = this.g!;
    if (g.offers) {
      return `<div class="paths"><h3>Choose a path for this run</h3><div class="offers">${g.offers.map((o, i) => this.offerHtml(o, i)).join('')}</div></div>`;
    }
    if (g.challenge) {
      const c = CHAL[g.challenge];
      return `<div class="runinfo chal"><span>${c.icon} <b>Challenge: ${c.name}</b> ${c.rule} Reach ${fmt(Big.pow10(LAYERS[0].req))} gold to complete it.</span><button data-act="exit-chal">Give up</button></div>`;
    }
    if (g.path) {
      const b = BLESS[g.path.b];
      const c = CURSE[g.path.c];
      const gl = GOAL[g.path.g];
      return `<div class="runinfo">
        <span class="chip good" title="${esc(b.text)}">${b.icon} ${b.name}: ${b.text}</span>
        <span class="chip bad" title="${esc(c.text)}">${c.icon} ${c.name}: ${c.text}</span>
        <span class="chip goal" title="${esc(gl.text)}">🎯 ${gl.name}: ${gl.text} <b ${this.bind(() => ({ t: goalMet(g, 0) ? '✔' : '…' }))}></b></span>
      </div>`;
    }
    return '';
  }

  private prestigeBtn(i: number, small = false): string {
    const g = this.g!;
    const l = LAYERS[i];
    return `<button class="prestige p${i} ${small ? 'small' : ''}" data-act="prestige" data-i="${i}" ${this.bind((m) => {
      const gain = gainOf(g, i, m);
      const ok = gain.gte(1);
      return { d: !ok, t: ok ? `${l.verb}: +${fmt(gain)} ${l.curIcon}` : `${l.verb} at ${fmt(Big.pow10(l.req))} 🪙` };
    })}></button>`;
  }

  private realmView(): string {
    const g = this.g!;
    const m = calcMods(g);
    const autos = has(g, 'c_auto1') || has(g, 'c_auto2');
    const autoP = has(g, 's_auto') || has(g, 't_auto');
    const pBtns = [0, 1, 2].filter((i) => layerOpen(g, i) && !(i > 0 && g.challenge)).map((i) => this.prestigeBtn(i, true)).join('');
    const rows = TIERS.map((d, t) => {
      if (t >= m.maxTier) return '';
      if (!tierOpen(g, t, m)) {
        return t > 0 && tierOpen(g, t - 1, m) ? `<div class="gen locked"><span class="gi">🔒</span><span>Buy a ${TIERS[t - 1].name} to unlock ${d.icon} ${d.name}.</span></div>` : '';
      }
      const what = t === 0 ? 'gold' : TIERS[t - 1].name;
      return `<div class="gen">
        <span class="gi">${d.icon}</span>
        <div class="gm">
          <div><b>${d.name}</b> <span class="amt" ${this.bind(() => ({ t: fmt(g.gens[t].amt) }))}></span> <small class="dim" ${this.bind(() => ({ t: `(${g.gens[t].bought} bought)` }))}></small></div>
          <small class="dim" ${this.bind((mm) => ({ t: `${fmtMult(mm.tier[t])} · +${fmt(t === 0 ? income(g, mm) : tierRate(g, t, mm))} ${what}/s` }))}></small>
          <div class="setbar"><i ${this.bind(() => ({ w: (g.gens[t].bought % 10) * 10 }))}></i></div>
        </div>
        <button class="buy" data-act="gen" data-t="${t}" ${this.bind((mm) => {
          const c = genCost(g, t, mm);
          return { t: `1 · ${fmt(c)}`, d: g.gold.lt(c) };
        })}></button>
        <button class="buy set" data-act="set" data-t="${t}" ${this.bind((mm) => {
          const left = 10 - (g.gens[t].bought % 10);
          const c = genCost(g, t, mm).mul(left);
          return { t: `+${left} · ${fmt(c)}`, d: g.gold.lt(c) };
        })}></button>
      </div>`;
    }).join('');
    return `<div class="realm">
      ${this.runInfo()}
      <div class="coin-row">
        <button class="coin" data-coin ${m.noClick ? 'disabled' : ''} aria-label="Collect gold">🪙</button>
        <div class="coin-info">
          <div class="big-gold">🪙 <b ${this.bind(() => ({ t: fmt(g.gold) }))}></b></div>
          <div class="dim" ${this.bind((mm) => ({ t: `${fmt(income(g, mm))} gold/s · click ${mm.noClick ? 'disabled' : fmt(mm.click.max(Big.ONE).add(income(g, mm).mul(mm.clickPct)))}` }))}></div>
          <div class="goalbar"><i ${this.bind(() => ({ w: (Math.max(0, g.best.log10()) / this.nextGoal()) * 100 }))}></i></div>
          <div class="dim small" ${this.bind(() => ({ t: this.goalText() }))}></div>
        </div>
      </div>
      <div class="pbtns">${pBtns}</div>
      <div class="controls">
        <button data-act="max" title="Key M">⏫ Max all</button>
        ${autos ? `<button class="toggle ${g.auto ? 'on' : ''}" data-act="auto">🤖 Autobuy ${g.auto ? 'on' : 'off'}</button>` : ''}
        ${autoP ? `<button class="toggle ${g.autoPrestige ? 'on' : ''}" data-act="autop">🔁 Auto-prestige ${g.autoPrestige ? 'on' : 'off'}</button>` : ''}
      </div>
      <div class="gen decree">
        <span class="gi">⚖️</span>
        <div class="gm"><div><b>Decrees</b> <span class="amt" ${this.bind(() => ({ t: String(g.decrees) }))}></span></div>
        <small class="dim" ${this.bind((mm) => ({ t: mm.noDecree ? 'Banned in this challenge.' : `Gold income ×${mm.decree.toFixed(3)} each · total ${fmtMult(Big.pow10(Math.log10(mm.decree) * g.decrees))}` }))}></small></div>
        <button class="buy wide" data-act="decree" ${this.bind((mm) => {
          const c = decreeCost(g, mm);
          return { t: `Pass · ${fmt(c)}`, d: mm.noDecree || g.gold.lt(c) };
        })}></button>
      </div>
      <div class="gens">${rows}</div>
      <p class="hint">Each full set of 10 of a tier multiplies it by the set bonus (now ${fmtMult(m.setBonus)}). The cost jumps after each set. Keys: Space click · M max all · 1–8 fill a set · D decree.</p>
    </div>`;
  }

  /** The next big target in digits, for the progress bar. */
  private nextGoal(): number {
    const g = this.g!;
    if (g.challenge) return LAYERS[0].req;
    for (let i = 2; i >= 0; i--) if (layerOpen(g, i) && g.best.log10() < LAYERS[i].req) return LAYERS[i].req;
    if (wonderOpen(g) && g.wonder < WONDER.length) return wonderCost(g).log10();
    if (conquestOpen(g) && g.regions < REGIONS.length) return regionCost(g).log10();
    return Math.max(LAYERS[0].req, g.best.log10() + 1);
  }

  private goalText(): string {
    const g = this.g!;
    const d = g.best.log10();
    if (g.challenge) return `Challenge goal: ${fmt(Big.pow10(LAYERS[0].req))} gold`;
    for (let i = 2; i >= 0; i--) {
      if (!layerOpen(g, i)) continue;
      if (d < LAYERS[i].req) return `${LAYERS[i].verb} at ${fmt(Big.pow10(LAYERS[i].req))} gold`;
    }
    if (wonderOpen(g) && g.wonder < WONDER.length) return `Wonder: ${WONDER[g.wonder].name} costs ${fmt(wonderCost(g))}`;
    return `Best this run: ${fmt(g.best)} gold`;
  }

  private upgradesView(): string {
    const g = this.g!;
    const m = calcMods(g);
    const list = [...UPGRADES]
      .sort((a, b) => Number(g.ups.includes(a.id)) - Number(g.ups.includes(b.id)) || a.cost - b.cost)
      .map((u) => {
        const own = g.ups.includes(u.id);
        return `<div class="card up ${own ? 'own' : ''}"><span class="big">${u.icon}</span><div><b>${u.name}</b><small>${u.text}</small></div>
          ${own ? '<span class="ok">✔</span>' : `<button data-act="up" data-id="${u.id}" ${this.bind((mm) => ({ t: fmt(upCost(g, u.id, mm)), d: mm.noUps || g.gold.lt(upCost(g, u.id, mm)) }))}></button>`}</div>`;
      })
      .join('');
    return `<div class="panel"><h2>Upgrades</h2><p class="sub">${m.noUps ? 'Upgrades are banned in this challenge.' : 'Upgrades reset when you ascend (the Archives skill keeps them).'}</p><div class="grid">${list}</div></div>`;
  }

  private treeView(i: number): string {
    const g = this.g!;
    const L = LAYERS[i];
    const rows = Math.max(...L.tree.map((n) => n.y)) + 1;
    const RH = 104;
    const lines = L.tree
      .flatMap((n) =>
        n.req.map((r) => {
          const p = L.tree.find((x) => x.id === r)!;
          const own = g.layers[i].tree.includes(r);
          return `<line x1="${(p.x + 0.5) * 100}" y1="${p.y * RH + 46}" x2="${(n.x + 0.5) * 100}" y2="${n.y * RH + 46}" class="${own ? 'lit' : ''}"/>`;
        }),
      )
      .join('');
    const nodes = L.tree
      .map((n) => {
        const own = g.layers[i].tree.includes(n.id);
        const reqOk = n.req.every((r) => g.layers[i].tree.includes(r));
        return `<button class="node ${own ? 'own' : reqOk ? '' : 'locked'}" style="left:calc(${n.x * 33.333}% + 3px);top:${n.y * RH}px" data-act="node" data-l="${i}" data-id="${n.id}" title="${esc(n.text)}"
          ${own ? '' : this.bind(() => ({ d: !canNode(g, i, n.id) }))}>
          <span class="ni">${n.icon} <b>${n.name}</b></span><small>${n.text}</small><span class="nc">${own ? '✔ Owned' : `${L.curIcon} ${n.cost}`}</span></button>`;
      })
      .join('');
    return `<div class="tree" style="height:${rows * RH}px"><svg viewBox="0 0 300 ${rows * RH}" preserveAspectRatio="none">${lines}</svg>${nodes}</div>`;
  }

  private layerView(i: number): string {
    const g = this.g!;
    const L = LAYERS[i];
    const S = g.layers[i];
    const keeps = ['Resets gold, generators, upgrades and decrees.', 'Also resets crowns, the crown tree (unless Old Blood) and regions (unless Star Maps).', 'Also resets sigils and the sigil tree (unless Eternal Line).'][i];
    let extra = '';
    if (i === 0 && !layerOpen(g, 1)) extra = `<p class="hint">Buy <b>Bloodline</b> to unlock the Dynasty layer (${fmt(Big.pow10(LAYERS[1].req))} gold).</p>`;
    if (i === 1) extra = this.conquestView() + (layerOpen(g, 2) ? '' : `<p class="hint">Buy <b>Starborn</b> to unlock Transcendence (${fmt(Big.pow10(LAYERS[2].req))} gold).</p>`);
    if (i === 2) extra = this.wonderView();
    const open = layerOpen(g, i);
    return `<div class="panel">
      <h2>${L.curIcon} ${L.name} <small ${this.bind(() => ({ t: `${fmt(S.cur)} ${L.cur}` }))}></small></h2>
      <p class="sub">${L.mechanic} Each ${L.cur.toLowerCase().replace(/s$/, '')} ever earned (since the last bigger reset) boosts gold income: now <b ${this.bind(() => ({ t: fmtMult(S.earned.add(1).pow(L.pow)) }))}></b>. ${L.plural}: ${S.count}.</p>
      ${open ? `<div class="pbox">${this.prestigeBtn(i)}<small class="dim">${keeps} Gain grows ×10 for every ${L.div} more digits of gold.</small></div>` : ''}
      ${extra}
      <h3>Skill tree</h3>
      ${this.treeView(i)}
    </div>`;
  }

  private conquestView(): string {
    const g = this.g!;
    const list = REGIONS.map((r, k) => {
      const own = k < g.regions;
      const next = k === g.regions;
      return `<div class="card region ${own ? 'own' : next ? '' : 'locked'}"><span class="big">${r.icon}</span><div><b>${r.name}</b><small>${r.text}</small></div>
        ${own ? '<span class="ok">✔</span>' : next ? `<button data-act="region" ${this.bind(() => ({ t: `⚔️ ${fmt(regionCost(g))}`, d: g.gold.lt(regionCost(g)) }))}></button>` : `<span class="dim">${fmt(regionCost(g, k))}</span>`}</div>`;
    }).join('');
    return `<h3>⚔️ Conquest <small class="dim">${g.regions}/${REGIONS.length}</small></h3><p class="sub">Spend gold to conquer regions in order. They stay through ascensions.</p><div class="grid">${list}</div>`;
  }

  private wonderView(): string {
    const g = this.g!;
    const list = WONDER.map((s, k) => {
      const own = k < g.wonder;
      const next = k === g.wonder;
      return `<div class="card stage ${own ? 'own' : next ? '' : 'locked'}"><span class="big">${s.icon}</span><div><b>${s.name}</b><small>${k === WONDER.length - 1 ? 'The last stage. Build it to finish the game.' : `All production ×1e${WONDER_BONUS}.`}</small></div>
        ${own ? '<span class="ok">✔</span>' : next ? `<button class="primary" data-act="wonder" ${this.bind(() => ({ t: `🏗️ ${fmt(wonderCost(g))}`, d: g.gold.lt(wonderCost(g)) }))}></button>` : `<span class="dim">${fmt(wonderCost(g, k))}</span>`}</div>`;
    }).join('');
    const pct = (g.wonder / WONDER.length) * 100;
    return `<h3>🗼 The Wonder <small class="dim">${g.wonder}/5</small></h3><div class="wonderbar"><i style="width:${pct}%"></i></div><p class="sub">Each stage costs gold and is never lost. Build all 5 stages to win.</p><div class="grid">${list}</div>`;
  }

  private challengesView(): string {
    const g = this.g!;
    const list = CHALLENGES.map((c) => {
      const isOn = g.challenge === c.id;
      const ok = g.chDone.includes(c.id);
      return `<div class="card chal ${ok ? 'own' : ''} ${isOn ? 'active' : ''}"><span class="big">${c.icon}</span><div><b>${c.name}</b><small>Rule: ${c.rule}</small><small class="good">Reward: ${c.reward}</small></div>
        ${isOn ? '<button data-act="exit-chal">Give up</button>' : `<button data-act="chal" data-id="${c.id}" ${g.challenge ? 'disabled' : ''}>${ok ? '✔ Again' : 'Enter'}</button>`}</div>`;
    }).join('');
    return `<div class="panel"><h2>⚔️ Challenges</h2><p class="sub">Entering a challenge resets this run without a gain. Reach ${fmt(Big.pow10(LAYERS[0].req))} gold under the rule to complete it. You then ascend as usual and keep the reward forever.</p><div class="grid">${list}</div></div>`;
  }

  private saveView(): string {
    const g = this.g!;
    return `<div class="panel">
      <h2>💾 Save</h2>
      <p class="sub">The game saves itself every 10 seconds. Copy the text below to keep a backup or move your empire to another device.</p>
      <div class="io">
        <button data-act="export">Export to text</button>
        <button data-act="import">Import from text</button>
      </div>
      <textarea id="io" rows="4" placeholder="Save text appears here. Paste a save here to import it.">${esc(this.ioText)}</textarea>
      <h3>Stats</h3>
      <div class="stats">
        <div><b ${this.bind(() => ({ t: fmtTime(g.time) }))}></b><small>Played</small></div>
        <div><b ${this.bind(() => ({ t: fmtTime(g.runTime) }))}></b><small>This run</small></div>
        <div><b ${this.bind(() => ({ t: String(g.clicks) }))}></b><small>Clicks</small></div>
        <div><b ${this.bind(() => ({ t: fmt(g.totalGold) }))}></b><small>Gold earned</small></div>
        ${LAYERS.map((l, i) => `<div><b>${g.layers[i].count}</b><small>${l.curIcon} ${l.plural}</small></div>`).join('')}
        <div><b>${g.chDone.length}/${CHALLENGES.length}</b><small>Challenges</small></div>
      </div>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Click the coin</b> (or press Space) for gold. Buy <b>Peasants</b>: they make gold every second.</li>
          <li>Each tier makes the tier below: Farms make Peasants, Mills make Farms, and so on up to Provinces.</li>
          <li>Every <b>full set of 10</b> of a tier multiplies its output. After each set the price jumps.</li>
          <li><b>Decrees</b> multiply all gold income. <b>Upgrades</b> multiply output and add new tricks such as crits.</li>
          <li>At ${fmt(Big.pow10(LAYERS[0].req))} gold you can <b>Ascend</b>: the run resets, but you get 👑 crowns. Crowns buy skills and boost all income.</li>
          <li>After each prestige, <b>choose a path</b>: a blessing, a curse and a goal. Meet the goal for ×1.5 gain.</li>
          <li><b>Challenges</b> change the rules for one run and give a lasting reward.</li>
          <li>Later layers: <b>Dynasty</b> 🏺 adds Conquest, <b>Transcendence</b> ✨ adds the Wonder. Build all 5 Wonder stages to win.</li>
          <li>The game runs while you are away (offline progress, with a cap). Export your save in the Save tab.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'offline') {
      const r = m.rep;
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>🌙 Welcome back</h2>
        <p>You were away for <b>${fmtTime(r.away)}</b>.</p>
        <p>Your empire worked for <b>${fmtTime(r.used)}</b>${r.used < r.away ? ' (offline time has a cap and a speed limit, see Night Watch)' : ''}.</p>
        <p class="big-gold">+${fmt(r.gold)} 🪙</p>
        ${r.prestiges ? `<p>Auto-prestiges while away: <b>${r.prestiges}</b></p>` : ''}
        <button class="primary" data-act="modal-close">Collect</button>
      </div></div>`;
    }
    if (m.kind === 'newgame') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>New empire?</h2>
        <p class="warn">This ends your current empire. It counts as fallen.</p>
        <button class="danger" data-act="new-yes">Yes, start over</button>
        <button data-act="modal-close">Cancel</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this empire? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon empire</button>'}
      <button data-act="title">Title screen (keeps the empire)</button>
    </div></div>`;
  }

  // ---------- Flow ----------

  private startNew(): void {
    if (this.g && this.screen !== 'end') {
      this.meta.abandoned++;
    }
    this.g = newGame();
    this.meta.games++;
    saveMeta(this.meta);
    this.screen = 'game';
    this.tab = 'realm';
    this.modal = null;
    this.botMem = newMem();
    this.last = Date.now();
    this.save();
    this.render();
  }

  private continueGame(): void {
    const g = this.g!;
    this.screen = 'game';
    this.modal = null;
    const away = (Date.now() - g.saved) / 1000;
    if (away > 60) {
      const rep = offline(g, away);
      this.modal = { kind: 'offline', rep };
    }
    this.last = Date.now();
    if (g.finished) return this.finish(true);
    this.render();
  }

  private finish(victory: boolean): void {
    const g = this.g!;
    const sc = score(g);
    this.end = { victory, score: sc, time: g.time, layers: g.layers.map((l) => l.count), wonder: g.wonder };
    if (victory) {
      this.meta.finished++;
      if (!this.meta.bestTime || g.time < this.meta.bestTime) this.meta.bestTime = Math.floor(g.time);
      sfx.win();
    } else {
      this.meta.abandoned++;
      g.abandoned = true;
      sfx.lose();
    }
    this.meta.bestScore = Math.max(this.meta.bestScore, sc);
    saveMeta(this.meta);
    clearGame();
    this.g = null;
    this.screen = 'end';
    this.modal = null;
    this.render();
  }

  private doPrestige(i: number): void {
    const g = this.g!;
    const wasChal = g.challenge;
    const gain = prestige(g, i);
    if (gain.lt(1)) return sfx.deny();
    sfx.prestige();
    this.flash();
    this.toast(`${LAYERS[i].verb}! +${fmt(gain)} ${LAYERS[i].curIcon}${wasChal && i === 0 ? ` · ${CHAL[wasChal].name} complete` : ''}`);
    if (has(g, 's_auto') && g.autoPrestige && g.offers) pickOffer(g, bestOffer(g.offers));
    this.tab = 'realm';
    this.save();
    this.render();
  }

  // ---------- Input ----------

  private onDown(e: PointerEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-coin]');
    if (!el || !this.g || this.screen !== 'game') return;
    e.preventDefault();
    initAudio();
    this.doClick(e.clientX, e.clientY);
  }

  private doClick(x: number, y: number): void {
    const g = this.g!;
    const r = click(g);
    if (r.v.isZero()) return sfx.deny();
    if (r.crit) sfx.crit();
    else sfx.click();
    this.float(x, y, `+${fmt(r.v)}`, r.crit ? 'crit' : '');
    const coin = this.root.querySelector<HTMLElement>('.coin');
    if (coin) {
      coin.classList.remove('pop');
      void coin.offsetWidth;
      coin.classList.add('pop');
    }
    this.update();
  }

  private onKey(e: KeyboardEvent): void {
    const tgt = e.target as HTMLElement;
    if (tgt.tagName === 'TEXTAREA' || tgt.tagName === 'INPUT') return;
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'game' || !this.g) return;
    if (e.key === 'Escape') {
      this.modal = { kind: 'menu', confirm: false };
      this.render();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (tgt.tagName === 'BUTTON' && e.key === 'Enter') return;
      e.preventDefault();
      initAudio();
      const coin = this.root.querySelector<HTMLElement>('.coin');
      const r = coin?.getBoundingClientRect();
      this.doClick(r ? r.left + r.width / 2 : 100, r ? r.top : 100);
    } else if (e.key === 'm' || e.key === 'M') {
      this.action('max', {});
    } else if (e.key === 'd' || e.key === 'D') {
      this.action('decree', {});
    } else if (/^[1-8]$/.test(e.key)) {
      this.action('set', { t: String(Number(e.key) - 1) });
    }
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    this.action(el.dataset.act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const g = this.g;
    switch (act) {
      case 'mute':
        this.meta.muted = toggleMute();
        saveMeta(this.meta);
        this.render();
        return;
      case 'help':
        this.modal = { kind: 'help' };
        return this.render();
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        return this.render();
      case 'modal-close':
        this.modal = null;
        return this.render();
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        return this.render();
      case 'abandon-yes':
        if (g) this.finish(false);
        return;
      case 'title':
        this.save();
        this.screen = 'title';
        this.modal = null;
        return this.render();
      case 'continue':
        return this.continueGame();
      case 'new':
        if (this.g) {
          this.modal = { kind: 'newgame' };
          return this.render();
        }
        return this.startNew();
      case 'new-yes':
        return this.startNew();
    }
    if (!g || this.screen !== 'game') return;
    const m = calcMods(g);
    switch (act) {
      case 'tab':
        this.tab = d.tab as Tab;
        return this.render();
      case 'gen': {
        const n = buyGen(g, Number(d.t), 1, m);
        if (!n) return sfx.deny();
        if (g.gens[Number(d.t)].bought % 10 === 0) sfx.set();
        else sfx.buy();
        break;
      }
      case 'set': {
        const t = Number(d.t);
        if (!tierOpen(g, t, m) || !buySet(g, t, m)) return sfx.deny();
        sfx.set();
        break;
      }
      case 'decree':
        if (!buyDecree(g, 1, m)) return sfx.deny();
        sfx.buy();
        break;
      case 'max': {
        const n = buyMax(g, [0, 1, 2, 3, 4, 5, 6, 7], true, false);
        if (!n) return sfx.deny();
        sfx.set();
        break;
      }
      case 'up':
        if (!buyUp(g, d.id!, m)) return sfx.deny();
        sfx.upgrade();
        this.toast(`⚒️ ${UPGRADES.find((u) => u.id === d.id)!.name}`);
        break;
      case 'node':
        if (!buyNode(g, Number(d.l), d.id!)) return sfx.deny();
        sfx.node();
        break;
      case 'region':
        if (!buyRegion(g)) return sfx.deny();
        sfx.region();
        this.toast(`⚔️ ${REGIONS[g.regions - 1].name} conquered`);
        break;
      case 'wonder':
        if (!buyWonder(g)) return sfx.deny();
        sfx.prestige();
        this.flash();
        if (g.finished) return this.finish(true);
        this.toast(`🏗️ ${WONDER[g.wonder - 1].name} built`);
        break;
      case 'prestige':
        return this.doPrestige(Number(d.i));
      case 'offer':
        pickOffer(g, Number(d.i));
        sfx.pick();
        break;
      case 'chal':
        enterChallenge(g, d.id!);
        sfx.pick();
        this.tab = 'realm';
        this.toast(`⚔️ Challenge: ${CHAL[d.id!].name}`);
        break;
      case 'exit-chal':
        exitChallenge(g);
        sfx.deny();
        break;
      case 'auto':
        g.auto = !g.auto;
        break;
      case 'autop':
        g.autoPrestige = !g.autoPrestige;
        break;
      case 'export':
        this.ioText = exportSave(g);
        this.render();
        try {
          void navigator.clipboard?.writeText(this.ioText).then(() => this.toast('📋 Save copied'));
        } catch {
          /* clipboard can be blocked */
        }
        return;
      case 'import': {
        const ta = this.root.querySelector<HTMLTextAreaElement>('#io');
        const ng = ta ? importSave(ta.value) : null;
        if (!ng) {
          sfx.deny();
          return this.toast('❌ That save text is not valid');
        }
        this.g = ng;
        this.ioText = '';
        this.save();
        this.toast('✅ Save imported');
        return this.render();
      }
      default:
        return;
    }
    this.update();
  }

  // ---------- Debug ----------

  private installDebug(): void {
    const api = {
      state: () => {
        const g = this.g;
        return {
          screen: this.screen,
          tab: this.tab,
          modal: this.modal?.kind ?? null,
          time: g ? Math.floor(g.time) : null,
          gold: g ? fmt(g.gold) : null,
          best: g ? g.best.log10() : null,
          layers: g ? g.layers.map((l) => ({ cur: fmt(l.cur), count: l.count, tree: l.tree.length })) : null,
          challenge: g?.challenge ?? null,
          chDone: g?.chDone.length ?? null,
          regions: g?.regions ?? null,
          wonder: g?.wonder ?? null,
          offers: !!g?.offers,
          end: this.end,
        };
      },
      gold: (digits: number) => {
        if (!this.g) return;
        this.g.gold = this.g.gold.add(Big.pow10(digits));
        this.g.best = this.g.best.max(this.g.gold);
        this.update();
      },
      /** One bot action. In a game it simulates a chunk of time with a good bot. */
      step: () => {
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        if (this.screen === 'title') {
          if (this.g) this.continueGame();
          else this.startNew();
          return 'start';
        }
        if (this.screen === 'end') return 'end';
        const g = this.g!;
        if (g.offers) {
          pickOffer(g, bestOffer(g.offers));
          this.render();
          return 'pick';
        }
        this.busy = true;
        const secs = FAST ? 120 : 10;
        for (let s = 0; s < secs && !g.finished; s++) {
          tick(g, 1);
          smartAct(g, this.botMem);
        }
        this.busy = false;
        this.last = Date.now();
        if (g.finished) {
          this.finish(true);
          return 'end';
        }
        this.render();
        return 'tick';
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
