import { smartBot } from './bot';
import {
  BIOMES,
  BUILDINGS,
  CURSES,
  EVENTS,
  GOODS,
  GOOD_IDS,
  METAS,
  META_IDS,
  PERKS,
  RES_ICON,
  RES_IDS,
  SEASONS,
  SPECIES,
  type Bag,
  type BuildingId,
  type GoodId,
  type MetaId,
  type SpeciesId,
} from './data';
import { randomSeedText } from './rng';
import {
  SETTLEMENTS,
  buyMeta,
  clearRun,
  endSettlement,
  finishRun,
  isFinal,
  loadMeta,
  loadRun,
  metaCost,
  newRun,
  saveMeta,
  saveRun,
  startSettlement,
  takePerk,
  type RunState,
} from './run';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';
import {
  H,
  TPS,
  TRIBUTE,
  T_FOREST,
  T_ROAD,
  T_WATER,
  W,
  assign,
  avgResolve,
  bById,
  bagTotal,
  buy,
  canAfford,
  canPlace,
  demolish,
  eventCost,
  free,
  housedCount,
  housing,
  idx,
  orderProgress,
  orderTarget,
  pickBlueprint,
  pickOrder,
  place,
  removeRoad,
  resolveTarget,
  seasonAt,
  secs,
  sell,
  solveEvent,
  tick,
  tribute,
  unassign,
  type Building,
  type Settlement,
} from './sim';

type Screen = 'title' | 'world' | 'settle' | 'result' | 'reward' | 'end';
type Tab = 'build' | 'orders' | 'goods' | 'info';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'bp' };

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

const PARAMS = new URLSearchParams(location.search);
const FAST = PARAMS.has('fast');
const T = 32;
const MUTE_KEY = 'storm-haven.mute';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

function costHtml(s: Settlement | null, cost: Bag): string {
  const parts = (Object.keys(cost) as GoodId[]).map((g) => {
    const n = cost[g] ?? 0;
    const ok = !s || s.stock[g] >= n;
    return `<span class="${ok ? '' : 'bad'}">${n}${GOODS[g].icon}</span>`;
  });
  return parts.length ? parts.join(' ') : '<span class="dim">free</span>';
}

function bagHtml(b: Bag): string {
  const keys = (Object.keys(b) as GoodId[]).filter((g) => (b[g] ?? 0) > 0);
  return keys.length ? keys.map((g) => `${b[g]}${GOODS[g].icon}`).join(' ') : '—';
}

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private tab: Tab = 'build';
  private speed = 1;
  private mode: BuildingId | 'demolish' | null = null;
  private sel: { kind: 'b'; id: number } | { kind: 'g'; id: number } | null = null;
  private cam = { x: W / 2, y: H / 2, z: 1 };
  private hover: { x: number; y: number } | null = null;
  private floats: Float[] = [];
  private rain: { x: number; y: number }[] = [];
  private flash = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private cw = 0;
  private ch = 0;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private uiTimer = 0;
  private saveTimer = 0;
  private lastPanel = '';
  private lastTop = '';
  private ptrs = new Map<number, { x: number; y: number }>();
  private drag: { sx: number; sy: number; cx: number; cy: number; moved: boolean; pinch: number; z: number } | null = null;
  private sideDown = false;
  private keys = new Set<string>();
  private result: { won: boolean; why: string; rep: number; goal: number; pop: number; left: number; time: number } | null = null;
  private end: { victory: boolean; score: number; crowns: number } | null = null;
  private soundGate = new Map<string, number>();

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
    root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.side')) this.sideDown = true;
    });
    window.addEventListener('pointerup', () => (this.sideDown = false));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('resize', () => this.resize());
    const save = (): void => {
      if (this.run && this.screen !== 'end' && this.screen !== 'title') saveRun(this.run);
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) save();
    });
    if (PARAMS.has('debug')) this.installDebug();
    if (this.run?.phase === 'settle' && this.run.settle) this.speed = 0;
    this.render();
  }

  private get s(): Settlement | null {
    return this.run?.settle ?? null;
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'world':
        body = this.worldView();
        break;
      case 'settle':
        body = `<div class="play"><div class="cv-wrap" id="wrap"><canvas id="cv"></canvas><div class="mode" id="mode"></div></div><aside class="side" id="side">${this.sideView()}</aside></div>`;
        break;
      case 'result':
        body = this.resultView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.lastTop = top;
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'settle') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.bindCanvas(this.canvas!);
      this.resize();
      this.updateMode();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  /** Update top bar and side panel without touching the canvas. */
  private refresh(force = false): void {
    if (this.screen !== 'settle') return this.render();
    const top = this.topBar();
    if (force || top !== this.lastTop) {
      const el = this.root.querySelector<HTMLElement>('header.top');
      if (el) el.outerHTML = top;
      this.lastTop = top;
    }
    if (this.sideDown && !force) return;
    const side = this.sideView();
    if (force || side !== this.lastPanel) {
      const el = this.root.querySelector<HTMLElement>('#side');
      if (el) {
        const sc = el.querySelector<HTMLElement>('.panel')?.scrollTop ?? 0;
        el.innerHTML = side;
        const p = el.querySelector<HTMLElement>('.panel');
        if (p) p.scrollTop = sc;
      }
      this.lastPanel = side;
    }
    const m = this.root.querySelector('.modal');
    if (!!m !== !!this.modal || force) {
      m?.remove();
      if (this.modal) this.root.insertAdjacentHTML('beforeend', this.modalView());
    }
    this.updateMode();
  }

  private updateMode(): void {
    const el = this.root.querySelector<HTMLElement>('#mode');
    if (!el) return;
    if (!this.mode) {
      el.innerHTML = this.speed === 0 && !this.modal ? '<span class="paused">⏸ Paused — press Space or ▶</span>' : '';
      return;
    }
    const name = this.mode === 'demolish' ? '🗑️ Demolish' : `${BUILDINGS[this.mode].icon} ${BUILDINGS[this.mode].name}`;
    el.innerHTML = `<span>Placing ${name}: tap the map</span><button data-act="cancel-mode">✕ Done</button>`;
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private bar(v: number, max: number, cls: string, label: string): string {
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    return `<div class="bar ${cls}" title="${label}"><div style="width:${pct}%"></div><span>${label}</span></div>`;
  }

  private topBar(): string {
    const run = this.run!;
    const btns = `<button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>`;
    const s = this.s;
    if (this.screen !== 'settle' || !s) {
      return `<header class="top"><span>💠 ${run.favor}</span><span>🗺️ ${Math.min(run.step + 1, SETTLEMENTS)}/${SETTLEMENTS}</span><span>👑 ${run.crowns}</span>
        <span class="perks">${run.perks.map((p) => `<span title="${PERKS[p].name}: ${PERKS[p].text}">${PERKS[p].icon}</span>`).join('')}</span><span class="grow"></span>${btns}</header>`;
    }
    const sa = seasonAt(s, secs(s));
    const speeds = [0, 1, 2, 3]
      .map((v) => `<button class="sp ${this.speed === v ? 'on' : ''}" data-act="speed" data-v="${v}" title="${v ? `Speed ${v}×` : 'Pause'}">${v ? `${v}×` : '⏸'}</button>`)
      .join('');
    return `<header class="top settle">
      <span class="sname">${BIOMES[s.biome].icon} ${esc(s.name)}</span>
      <span class="season s-${sa.season}" title="${SEASONS[sa.season].text}">${SEASONS[sa.season].icon} Y${sa.year} ${SEASONS[sa.season].name} ${sa.left}s</span>
      ${this.bar(s.rep, s.repGoal, 'rep', `⭐ ${s.rep.toFixed(1)}/${s.repGoal}`)}
      ${this.bar(s.imp, 100, 'imp', `😠 ${Math.floor(s.imp)}%`)}
      <span title="Villagers (free)">👥 ${s.v.length} <small>(${free(s).length} free)</small></span>
      <span class="speeds">${speeds}</span>
      ${btns}
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const shop = META_IDS.map((id) => {
      const d = METAS[id];
      const lvl = m.levels[id] ?? 0;
      const cost = metaCost(m, id);
      return `<div class="arm"><span class="big">${d.icon}</span><span><b>${d.name}</b> <small class="dim">${lvl}/${d.costs.length}</small><small>${d.text}</small></span>
        ${cost === null ? '<span class="ok">✔ Max</span>' : `<button data-act="meta" data-id="${id}" ${m.crowns >= cost ? '' : 'disabled'}>👑 ${cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <h1><span>🏘️</span> Storm Haven</h1>
      <p class="sub">Found towns in the cursed forest. Build production chains, keep your villagers happy and meet the Queen's orders before her patience runs out.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (settlement ${Math.min(r.step + 1, SETTLEMENTS)}/${SETTLEMENTS}, 💠 ${r.favor})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Settlements founded ${m.settled} · Best score ${m.best}</p>
      <h2>The Capital <small>👑 ${m.crowns} crowns</small></h2>
      <p class="sub">Each run gives crowns. Spend them on lasting upgrades.</p>
      <div class="armory">${shop}</div>
    </div>`;
  }

  private worldView(): string {
    const run = this.run!;
    const path = Array.from({ length: SETTLEMENTS }, (_, i) => {
      const h = run.history[i];
      const cls = h ? (h.won ? 'won' : 'lost') : i === run.step ? 'cur' : '';
      const icon = h ? BIOMES[h.biome].icon : i === SETTLEMENTS - 1 ? '⛈️' : '❔';
      return `<div class="node ${cls}" title="${h ? `${h.name}: ${h.won ? 'won' : 'lost'}` : ''}">${icon}<small>${h ? (h.won ? '✔' : '✗') : i + 1}</small></div>`;
    }).join('<div class="link"></div>');
    const cards = run.choices
      .map((n, i) => {
        const b = BIOMES[n.biome];
        return `<div class="card biome-${n.biome}">
        <div class="big">${b.icon}</div>
        <h3>${esc(n.name)}</h3>
        <p class="dim">${b.name}</p>
        <p>${b.text}</p>
        <p>Villagers: ${b.species.map((sp) => `<span title="${SPECIES[sp].name}">${SPECIES[sp].icon}</span>`).join(' ')}</p>
        <div class="chips">${n.curses.length ? n.curses.map((c) => `<span class="chip bad" title="${CURSES[c].text}">${CURSES[c].icon} ${CURSES[c].name}<small>${CURSES[c].text}</small></span>`).join('') : '<span class="chip ok">No curses</span>'}</div>
        <p>Reward: 👑 ${n.crowns}</p>
        <button class="primary" data-act="found" data-i="${i}">Found settlement</button>
      </div>`;
      })
      .join('');
    return `<div class="world">
      <h2>${isFinal(run) ? '⛈️ The final settlement' : 'Choose the next settlement'}</h2>
      <div class="path">${path}</div>
      <p class="sub">${isFinal(run) ? 'Win this settlement to win the run.' : `A lost settlement costs 1 favor 💠. At 0 favor the run ends. You have ${run.favor}.`}</p>
      <div class="cards">${cards}</div>
    </div>`;
  }

  private resultView(): string {
    const r = this.result!;
    return `<div class="end">
      <h1 class="${r.won ? 'good' : 'bad'}">${r.won ? '🎉 Settlement won' : '🌧️ Settlement lost'}</h1>
      <p>${esc(r.why)}</p>
      <p>⭐ ${r.rep.toFixed(1)}/${r.goal} reputation · 👥 ${r.pop} villagers · 💔 ${r.left} left · ⏱️ ${Math.floor(r.time / 60)}m ${r.time % 60}s</p>
      <button class="primary" data-act="result-next">Continue</button>
    </div>`;
  }

  private rewardView(): string {
    const run = this.run!;
    const cards = run.rewards
      .map((p, i) => `<button class="pick" data-act="perk" data-i="${i}"><span class="big">${PERKS[p].icon}</span><b>${PERKS[p].name}</b><small>${PERKS[p].text}</small></button>`)
      .join('');
    return `<div class="reward">
      <h2>Capital upgrade</h2>
      <p class="sub">The capital grows. Choose one upgrade. It helps in all later settlements of this run.</p>
      <div class="picks">${cards}</div>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    const hist = this.run
      ? this.run.history.map((h) => `<li>${BIOMES[h.biome].icon} ${esc(h.name)} — ${h.won ? '<span class="good">won</span>' : '<span class="bad">lost</span>'} (⭐ ${h.rep})</li>`).join('')
      : '';
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Victory!' : '💀 Run lost'}</h1>
      <p>${e.victory ? 'The storm breaks. Your haven stands at the eye of the storm.' : 'The Queen sends another viceroy.'}</p>
      <ul class="hist">${hist}</ul>
      <p class="score">Score <b>${e.score}</b></p>
      <p>👑 +${e.crowns} crowns for the capital</p>
      <button class="primary" data-act="to-title">Title screen</button>
    </div>`;
  }

  // ---------- Side panel ----------

  private sideView(): string {
    const s = this.s;
    if (!s) return '';
    const pendingOrder = s.orders.some((o, i) => i < s.unlocked && o.opts);
    const tabs: [Tab, string][] = [
      ['build', '🔨 Build'],
      ['orders', `📜 Orders${pendingOrder ? ' <i class="dot"></i>' : ''}`],
      ['goods', '📦 Goods'],
      ['info', 'ℹ️ Info'],
    ];
    const head = `<nav class="tabs">${tabs.map(([t, l]) => `<button class="${this.tab === t ? 'on' : ''}" data-act="tab" data-tab="${t}">${l}</button>`).join('')}</nav>`;
    const bp = s.bpOffer ? `<button class="primary bp-btn" data-act="bp">📐 Choose a new blueprint</button>` : '';
    let body = '';
    if (this.tab === 'build') body = this.buildTab(s);
    else if (this.tab === 'orders') body = this.ordersTab(s);
    else if (this.tab === 'goods') body = this.goodsTab(s);
    else body = this.infoTab(s);
    return `${head}${bp}<div class="panel">${body}</div>`;
  }

  private buildTab(s: Settlement): string {
    const list = s.blueprints
      .map((id) => {
        const d = BUILDINGS[id];
        const ok = canAfford(s, d.cost);
        return `<button class="bld ${this.mode === id ? 'on' : ''} ${ok ? '' : 'poor'}" data-act="build" data-id="${id}" title="${esc(d.text)}">
          <span class="bi">${d.icon}</span><span class="bn">${d.name}<small>${costHtml(s, d.cost)}</small></span></button>`;
      })
      .join('');
    return `<div class="blds">${list}<button class="bld ${this.mode === 'demolish' ? 'on' : ''}" data-act="build" data-id="demolish"><span class="bi">🗑️</span><span class="bn">Demolish<small>50% refund</small></span></button></div>
      <p class="hint">Build on cleared ground. Woodcutters clear the forest and open hidden glades. Free villagers construct new buildings.</p>`;
  }

  private ordersTab(s: Settlement): string {
    const rows = s.orders
      .map((o, i) => {
        if (i >= s.unlocked) return `<div class="order locked">🔒 Order ${i + 1} <small>(⭐ ${o.rep}) unlocks when an order is done</small></div>`;
        if (o.opts)
          return `<div class="order pick"><b>Order ${i + 1}: choose one (⭐ ${o.rep})</b>${o.opts.map((p, k) => `<button data-act="order-pick" data-o="${i}" data-k="${k}">${p.text}</button>`).join('')}</div>`;
        const p = o.o!;
        const prog = Math.min(orderTarget(p), orderProgress(s, p, o));
        return `<div class="order ${o.done ? 'done' : ''}">${o.done ? '✔' : '📜'} ${p.text} <small>⭐ ${o.rep}</small>${o.done ? '' : this.bar(prog, orderTarget(p), 'prog', `${prog}/${orderTarget(p)}`)}</div>`;
      })
      .join('');
    const evs = s.glades
      .filter((g) => g.ev && (g.es === 'active' || g.es === 'solving'))
      .map((g) => {
        const e = EVENTS[g.ev!];
        const c = eventCost(s, g);
        return `<div class="order ${e.danger ? 'danger' : ''}"><b>${e.icon} ${e.name}</b> <small>${e.danger ? this.dangerText(g.ev!) : ''} Reward: ${e.reward}</small>
          ${g.es === 'solving' ? `<small>⏳ solving… ${g.et}s</small>` : `<span class="row"><button data-act="solve" data-g="${g.id}" ${canAfford(s, c) ? '' : 'disabled'}>Solve ${costHtml(s, c)}</button><button data-act="goto" data-x="${g.x}" data-y="${g.y}">📍</button></span>`}</div>`;
      })
      .join('');
    return `<p class="hint">Reach ⭐ ${s.repGoal} reputation before impatience 😠 hits 100%. Orders give reputation and lower impatience. Villagers with resolve ≥ 10 also add reputation slowly.</p>
      ${rows}
      <h4>Glade events</h4>${evs || '<p class="hint">None found yet. Cut the forest to discover glades.</p>'}`;
  }

  private dangerText(id: string): string {
    const e = EVENTS[id as keyof typeof EVENTS];
    const p: string[] = [];
    if (e.resolve) p.push(`${e.resolve} resolve`);
    if (e.imp) p.push(`+${Math.round(e.imp * 100)}% impatience`);
    if (e.work) p.push(`${Math.round(e.work * 100)}% work speed`);
    return `Danger: ${p.join(', ')} (×2 in storm).`;
  }

  private goodsTab(s: Settlement): string {
    const goods = GOOD_IDS.filter((g) => s.stock[g] > 0 || ['wood', 'planks', 'berries'].includes(g))
      .map((g) => `<div class="gd" title="${GOODS[g].name}"><span>${GOODS[g].icon}</span><b>${s.stock[g]}</b><small>${GOODS[g].name}</small></div>`)
      .join('');
    const sp = (Object.keys(SPECIES) as SpeciesId[])
      .map((id) => {
        const vs = s.v.filter((v) => v.sp === id);
        if (!vs.length) return '';
        const d = SPECIES[id];
        const avg = vs.reduce((a, v) => a + v.resolve, 0) / vs.length;
        const rt = resolveTarget(s, vs[0]);
        return `<div class="spec"><b>${d.icon} ${d.name} ×${vs.length}</b> <span class="${avg < 2 ? 'bad' : avg >= 10 ? 'good' : ''}">resolve ${avg.toFixed(1)}</span>
          <small>Likes ${d.likes.map((g) => GOODS[g].icon).join('')} · luxury ${GOODS[d.lux].icon} · skilled at ${d.skills.map((b) => BUILDINGS[b].icon).join('')}</small>
          <small class="dim">${rt.parts.map(([n, v]) => `${n} ${v >= 0 ? '+' : ''}${v}`).join(' · ')}</small></div>`;
      })
      .join('');
    return `<div class="goods">${goods}</div>
      <p>🏠 Housed ${housedCount(s)}/${s.v.length} (beds ${housing(s)}) · 😊 average resolve ${avgResolve(s).toFixed(1)}</p>
      <p class="hint">Villagers leave when resolve stays below 0. At resolve 10 or more they add reputation. Newcomers arrive every 95 s while average resolve is 2 or more.</p>
      ${sp}`;
  }

  private infoTab(s: Settlement): string {
    const sel = this.sel;
    if (!sel) return '<p class="hint">Tap a building or a glade event on the map to see it here.</p>';
    if (sel.kind === 'g') {
      const g = s.glades[sel.id];
      if (!g?.ev) return '';
      const e = EVENTS[g.ev];
      const c = eventCost(s, g);
      return `<h3>${e.icon} ${e.name}</h3>
        ${e.danger ? `<p class="bad">${this.dangerText(g.ev)}</p>` : '<p>No danger.</p>'}
        <p>Reward: ${e.reward}</p>
        ${g.es === 'active' ? `<button class="primary" data-act="solve" data-g="${g.id}" ${canAfford(s, c) ? '' : 'disabled'}>Solve: ${costHtml(s, c)}</button>` : g.es === 'solving' ? `<p>⏳ Solving… ${g.et}s</p>` : '<p class="ok">✔ Solved</p>'}`;
    }
    const b = bById(s, sel.id);
    if (!b) return '<p class="hint">The building is gone.</p>';
    const d = BUILDINGS[b.def];
    let h = `<h3>${d.icon} ${d.name}</h3><p class="dim">${d.text}</p>`;
    if (!b.built) {
      const builders = s.v.filter((v) => v.job < 0 && v.tgt === b.id && v.act === 'build').length;
      h += `<p>🚧 Under construction: ${Math.floor(b.prog * 100)}% · ${builders} builder${builders === 1 ? '' : 's'}</p>${builders ? '' : '<p class="warn">Needs a free villager. Remove a worker from a building.</p>'}`;
    } else if (d.workers) {
      const ws = b.w.map((id) => s.v.find((v) => v.id === id)).filter((v) => !!v);
      const slots = Array.from({ length: d.workers }, (_, i) => {
        const v = ws[i];
        if (!v) return '<span class="slot empty">—</span>';
        const skill = SPECIES[v.sp].skills.includes(b.def);
        return `<span class="slot" title="${SPECIES[v.sp].name}${skill ? ' (skilled, +40%)' : ''}">${SPECIES[v.sp].icon}${skill ? '<i>⭐</i>' : ''}</span>`;
      }).join('');
      const fr = free(s);
      h += `<div class="workers">${slots}
        <button data-act="assign" data-b="${b.id}" ${fr.length && ws.length < d.workers ? '' : 'disabled'}>＋</button>
        <button data-act="unassign" data-b="${b.id}" ${ws.length ? '' : 'disabled'}>－</button></div>
        <p class="hint">${fr.length} free villager${fr.length === 1 ? '' : 's'}${fr.length ? ': ' + fr.map((v) => SPECIES[v.sp].icon).join('') : ''}</p>`;
      if (d.gathers) h += `<p>Collects ${d.gathers.map((g) => (g === 'wood' ? '🪵' : RES_ICON[g])).join(' ')} within ${d.radius} tiles.</p>`;
      if (d.output) {
        h += `<p>Recipe: ${bagTotal(d.input ?? {}) ? bagHtml(d.input!) : '—'} → ${bagHtml(d.output)} in ${d.time}s</p>`;
        h += `<p class="dim">In: ${bagHtml(b.inb)} · Out: ${bagHtml(b.out)}</p>`;
      }
      const notes = [...new Set(ws.map((v) => v.note).filter((n) => n))];
      if (notes.length) h += `<p class="warn">${notes.join('. ')}</p>`;
      else if (ws.length) h += `<p class="ok">Working</p>`;
    } else if (d.cap) {
      const res = s.v.filter((v) => v.home === b.id);
      h += `<p>Residents: ${res.map((v) => SPECIES[v.sp].icon).join(' ') || '—'} (${res.length}/${d.cap})</p>`;
    } else if (b.def === 'hearth') {
      h += `<p>👥 ${s.v.length} villagers · 🏠 ${housing(s)} beds · resolve ${avgResolve(s).toFixed(1)}</p>`;
    }
    if (b.def === 'trading' && b.built) h += this.tradeHtml(s);
    if (b.def !== 'hearth') h += `<button class="danger small" data-act="demolish" data-b="${b.id}">🗑️ Demolish (${b.built ? '50%' : 'full'} refund)</button>`;
    return h;
  }

  private tradeHtml(s: Settlement): string {
    let h = `<p>🪙 ${s.stock.coins} coins</p><button data-act="tribute" ${s.stock.coins >= TRIBUTE ? '' : 'disabled'}>👑 Tribute ${TRIBUTE}🪙: −8% impatience</button>`;
    if (!s.caravan) return h + '<p class="hint">The caravan comes in each clearance ☀️.</p>';
    h += `<h4>⚖️ Caravan (${s.caravan.left}s)</h4><p class="hint">Sell 5 units:</p><div class="trade">`;
    h += GOOD_IDS.filter((g) => g !== 'coins' && s.stock[g] >= 5)
      .map((g) => `<button data-act="sell" data-g="${g}">${GOODS[g].icon} +${GOODS[g].value * 5}🪙</button>`)
      .join('');
    h += '</div><p class="hint">Buy:</p><div class="trade">';
    h += s.caravan.offers
      .map((o, k) => `<button data-act="buy" data-k="${k}" ${!o.sold && s.stock.coins >= o.price ? '' : 'disabled'}>${o.sold ? '✔' : ''} ${o.n}${GOODS[o.good].icon} for ${o.price}🪙</button>`)
      .join('');
    return h + '</div>';
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Goal.</b> Each settlement needs ⭐ reputation before the Queen's 😠 impatience fills. Orders give most of the reputation. Win 4 settlements; the 4th is at the eye of the storm.</li>
          <li><b>Build.</b> Pick a building in the Build tab and tap cleared ground. Free villagers walk over and construct it.</li>
          <li><b>Work.</b> Select a building and press ＋ to add a worker. Workers gather or craft and carry the goods to the Hearth or a Warehouse. ⭐ marks a skilled species (+40%).</li>
          <li><b>Chains.</b> Wood → planks. Grain → flour → bread. Clay → bricks. Herbs → tea. Grain → ale. Mushrooms + herbs → stew. Planks + stone → tools.</li>
          <li><b>Forest and glades.</b> Woodcutters clear trees. Hidden glades open when the clearing reaches them. They hold resource nodes and events: some are dangers that hurt you until you solve them.</li>
          <li><b>Needs.</b> Villagers eat food (liked food and bread/stew are better), want a home and enjoy a luxury (tea or ale). Resolve below 0 makes them leave. Resolve 10+ adds reputation.</li>
          <li><b>Seasons.</b> 🌦️ Drizzle: farms grow fast. ☀️ Clearance: the caravan visits. ⛈️ Storm: −2 resolve, farms stop, dangers double. Each new year brings a new blueprint.</li>
          <li><b>Between settlements</b> choose a capital upgrade. Lost settlements cost 💠 favor. Crowns 👑 buy lasting upgrades on the title screen.</li>
          <li><b>Controls.</b> Drag to pan, wheel or pinch to zoom. Keys: WASD/arrows pan, +/− zoom, Space pause, 1–3 speed, Esc cancels.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'bp') {
      const s = this.s;
      const offer = s?.bpOffer ?? [];
      return `<div class="modal"><div class="sheet" data-stop>
        <h2>📐 Choose a blueprint</h2>
        <p class="sub">You keep it for this settlement.</p>
        <div class="picks">${offer
          .map((id, i) => {
            const d = BUILDINGS[id];
            const recipe = d.output ? `${bagTotal(d.input ?? {}) ? bagHtml(d.input!) : ''} → ${bagHtml(d.output)}` : '';
            return `<button class="pick" data-act="bp-pick" data-i="${i}"><span class="big">${d.icon}</span><b>${d.name}</b><small>${d.text}</small><small>${recipe}</small><small>Cost ${costHtml(null, d.cost)}</small></button>`;
          })
          .join('')}</div>
        <button data-act="modal-close">Later</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="to-title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Loop ----------

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw(dt);
      if (this.screen === 'settle') this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    const s = this.s;
    if (!s) return;
    // Keyboard panning.
    const pan = (8 * dt) / this.cam.z;
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.cam.x -= pan;
    if (this.keys.has('d') || this.keys.has('arrowright')) this.cam.x += pan;
    if (this.keys.has('w') || this.keys.has('arrowup')) this.cam.y -= pan;
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.cam.y += pan;
    this.clampCam();
    if (!this.modal && this.speed > 0 && !s.done) {
      this.acc += dt * TPS * this.speed;
      let n = 0;
      while (this.acc >= 1 && n < 40) {
        tick(s);
        this.acc--;
        n++;
        if (s.done) break;
      }
      if (n >= 40) this.acc = 0;
    }
    this.drain(s);
    this.uiTimer -= dt;
    if (this.uiTimer <= 0) {
      this.uiTimer = 0.3;
      this.refresh();
    }
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 10;
      saveRun(this.run!);
    }
    if (s.done) this.finishSettlement();
  }

  private drain(s: Settlement): void {
    for (const f of s.fx) this.floats.push({ ...f, t: 0 });
    s.fx.length = 0;
    if (this.floats.length > 60) this.floats.splice(0, this.floats.length - 60);
    const now = performance.now();
    for (const e of s.ev) {
      const gate = this.soundGate.get(e) ?? 0;
      if (now < gate) continue;
      this.soundGate.set(e, now + (e === 'chop' || e === 'drop' ? 180 : 300));
      const fn = (sfx as Record<string, () => void>)[e];
      if (fn) fn();
      if (e === 'storm') this.flash = 1;
      if (e === 'built' || e === 'order') this.lastPanel = '';
    }
    s.ev.length = 0;
    if (s.msgs.length) {
      this.toast(s.msgs[s.msgs.length - 1]);
      s.msgs.length = 0;
    }
  }

  private finishSettlement(): void {
    const s = this.s!;
    if (this.screen !== 'settle') return;
    this.result = { won: s.done === 'win', why: s.why, rep: s.rep, goal: s.repGoal, pop: s.v.length, left: s.left, time: secs(s) };
    if (s.done === 'win') sfx.win();
    else sfx.lose();
    this.mode = null;
    this.sel = null;
    this.screen = 'result';
    this.render();
  }

  private resultNext(): void {
    const run = this.run!;
    const res = endSettlement(run);
    if (res === 'next') {
      saveRun(run);
      this.screen = run.phase === 'reward' ? 'reward' : 'world';
      this.render();
      return;
    }
    const won = res === 'won';
    const crowns = finishRun(run, this.meta, won);
    saveMeta(this.meta);
    clearRun();
    this.end = { victory: won, score: run.score, crowns };
    this.screen = 'end';
    this.render();
  }

  // ---------- Canvas ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = wrap.clientWidth;
    this.ch = wrap.clientHeight;
    cv.width = Math.round(this.cw * dpr);
    cv.height = Math.round(this.ch * dpr);
    cv.style.width = `${this.cw}px`;
    cv.style.height = `${this.ch}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private clampCam(): void {
    this.cam.z = Math.max(0.45, Math.min(2.6, this.cam.z));
    this.cam.x = Math.max(0, Math.min(W, this.cam.x));
    this.cam.y = Math.max(0, Math.min(H, this.cam.y));
  }

  private toScreen(x: number, y: number): [number, number] {
    const k = T * this.cam.z;
    return [(x - this.cam.x) * k + this.cw / 2, (y - this.cam.y) * k + this.ch / 2];
  }

  private toTile(px: number, py: number): { x: number; y: number } {
    const k = T * this.cam.z;
    return { x: Math.round((px - this.cw / 2) / k + this.cam.x), y: Math.round((py - this.ch / 2) / k + this.cam.y) };
  }

  private draw(dt: number): void {
    const ctx = this.ctx;
    const s = this.s;
    if (!ctx || !s) return;
    const k = T * this.cam.z;
    const bio = BIOMES[s.biome];
    ctx.fillStyle = '#071110';
    ctx.fillRect(0, 0, this.cw, this.ch);
    const x0 = Math.max(0, Math.floor(this.cam.x - this.cw / 2 / k) - 1);
    const x1 = Math.min(W - 1, Math.ceil(this.cam.x + this.cw / 2 / k) + 1);
    const y0 = Math.max(0, Math.floor(this.cam.y - this.ch / 2 / k) - 1);
    const y1 = Math.min(H - 1, Math.ceil(this.cam.y + this.ch / 2 / k) + 1);
    const now = performance.now() / 1000;
    // Tiles.
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = idx(x, y);
        const [sx, sy] = this.toScreen(x - 0.5, y - 0.5);
        const t = s.tiles[i];
        const hsh = hash2(x, y);
        if (t === T_WATER) {
          ctx.fillStyle = '#1d4e66';
          ctx.fillRect(sx, sy, k + 1, k + 1);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(sx + k * 0.2, sy + k * (0.3 + 0.1 * Math.sin(now + hsh * 6)), k * 0.4, k * 0.05);
          continue;
        }
        if (t === T_FOREST || s.fog[i]) {
          ctx.fillStyle = shade(bio.forest, 0.8 + hsh * 0.2);
          ctx.fillRect(sx, sy, k + 1, k + 1);
          const trees = s.fog[i] ? 3 : Math.min(3, Math.max(1, Math.ceil(s.amt[i] / 2)));
          for (let n = 0; n < trees; n++) {
            const ox = (hash2(x * 3 + n, y) - 0.5) * 0.5;
            const oy = (hash2(x, y * 3 + n) - 0.5) * 0.5;
            ctx.fillStyle = shade(bio.forest, 1.4 + hash2(n, x + y) * 0.5);
            ctx.beginPath();
            ctx.arc(sx + k * (0.5 + ox), sy + k * (0.5 + oy), k * 0.24, 0, Math.PI * 2);
            ctx.fill();
          }
          continue;
        }
        ctx.fillStyle = shade(bio.ground, 0.9 + hsh * 0.15);
        ctx.fillRect(sx, sy, k + 1, k + 1);
        if (t === T_ROAD) {
          ctx.fillStyle = '#9c8461';
          ctx.fillRect(sx + k * 0.12, sy + k * 0.12, k * 0.76, k * 0.76);
          ctx.fillStyle = '#b39b74';
          ctx.fillRect(sx + k * 0.25, sy + k * 0.25, k * 0.5, k * 0.5);
        }
        if (s.res[i] >= 0) {
          const rk = RES_IDS[s.res[i]];
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.arc(sx + k / 2, sy + k / 2, k * 0.42, 0, Math.PI * 2);
          ctx.fill();
          this.emoji(ctx, RES_ICON[rk], sx + k / 2, sy + k / 2, k * 0.6);
          ctx.fillStyle = '#9be564';
          ctx.fillRect(sx + k * 0.15, sy + k * 0.88, k * 0.7 * Math.min(1, s.amt[i] / 36), k * 0.07);
        }
      }
    // Glade events.
    for (const g of s.glades) {
      if (!g.ev || !g.open) continue;
      const [gx, gy] = this.toScreen(g.x, g.y);
      const e = EVENTS[g.ev];
      if (g.es === 'active' && e.danger) {
        ctx.strokeStyle = `rgba(239,71,111,${0.5 + 0.4 * Math.sin(now * 4)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(gx, gy, k * (0.55 + 0.08 * Math.sin(now * 4)), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = g.es === 'done' ? 0.4 : 1;
      this.emoji(ctx, e.icon, gx, gy, k * 0.75);
      ctx.globalAlpha = 1;
      if (g.es === 'solving') this.emoji(ctx, '⏳', gx + k * 0.35, gy - k * 0.35, k * 0.4);
      if (g.es === 'done') this.emoji(ctx, '✔️', gx + k * 0.35, gy - k * 0.35, k * 0.35);
      if (this.sel?.kind === 'g' && this.sel.id === g.id) this.ring(ctx, gx, gy, k * 0.6, '#ffd166');
    }
    // Selection radius.
    const selB = this.sel?.kind === 'b' ? bById(s, this.sel.id) : undefined;
    if (selB && BUILDINGS[selB.def].radius) this.radius(ctx, selB.x, selB.y, BUILDINGS[selB.def].radius!, 'rgba(255,209,102,0.7)');
    // Buildings.
    for (const b of s.b) {
      if (b.x < x0 - 1 || b.x > x1 + 1 || b.y < y0 - 1 || b.y > y1 + 1) continue;
      this.drawBuilding(ctx, s, b, k);
    }
    // Villagers.
    for (const v of s.v) {
      const [vx, vy] = this.toScreen(v.x, v.y);
      if (vx < -20 || vy < -20 || vx > this.cw + 20 || vy > this.ch + 20) continue;
      const bob = v.st === 'go' ? Math.abs(Math.sin(now * 10 + v.id)) * k * 0.05 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(vx, vy + k * 0.12, k * 0.12, k * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SPECIES[v.sp].color;
      ctx.beginPath();
      ctx.arc(vx, vy - bob, k * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = v.resolve < 0 ? '#ef476f' : v.resolve >= 10 ? '#ffd166' : 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (v.st === 'work') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const a = now * 8 + v.id;
        ctx.moveTo(vx + k * 0.1, vy - k * 0.1);
        ctx.lineTo(vx + k * 0.1 + Math.cos(a) * k * 0.12, vy - k * 0.1 - Math.abs(Math.sin(a)) * k * 0.12);
        ctx.stroke();
      }
      if (this.cam.z >= 0.9) {
        const g = (Object.keys(v.carry) as GoodId[]).find((x) => (v.carry[x] ?? 0) > 0);
        if (g) this.emoji(ctx, GOODS[g].icon, vx, vy - k * 0.28 - bob, k * 0.26);
      }
    }
    // Ghost.
    if (this.mode && this.hover) {
      const { x, y } = this.hover;
      const [gx, gy] = this.toScreen(x - 0.5, y - 0.5);
      let ok: boolean;
      if (this.mode === 'demolish') ok = !!s.b.find((b) => b.x === x && b.y === y && b.def !== 'hearth') || (inMapTile(x, y) && s.tiles[idx(x, y)] === T_ROAD);
      else ok = !canPlace(s, this.mode, x, y);
      ctx.fillStyle = ok ? 'rgba(126,224,138,0.35)' : 'rgba(239,71,111,0.35)';
      ctx.fillRect(gx, gy, k, k);
      if (this.mode !== 'demolish') {
        ctx.globalAlpha = 0.7;
        this.emoji(ctx, BUILDINGS[this.mode].icon, gx + k / 2, gy + k / 2, k * 0.6);
        ctx.globalAlpha = 1;
        const r = BUILDINGS[this.mode].radius;
        if (r) this.radius(ctx, x, y, r, 'rgba(255,255,255,0.5)');
      }
    }
    // Weather.
    const sa = s.season;
    if (sa !== 'clearance') {
      const n = sa === 'storm' ? 140 : 50;
      while (this.rain.length < n) this.rain.push({ x: Math.random() * this.cw, y: Math.random() * this.ch });
      this.rain.length = n;
      ctx.strokeStyle = sa === 'storm' ? 'rgba(180,200,255,0.45)' : 'rgba(180,210,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const sp = (sa === 'storm' ? 700 : 400) * dt;
      for (const r of this.rain) {
        r.y += sp;
        r.x -= sp * 0.25;
        if (r.y > this.ch) {
          r.y = -10;
          r.x = Math.random() * (this.cw + 100);
        }
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + 3, r.y - 10);
      }
      ctx.stroke();
      if (sa === 'storm') {
        ctx.fillStyle = 'rgba(10,15,40,0.28)';
        ctx.fillRect(0, 0, this.cw, this.ch);
        if (Math.random() < dt * 0.15 * Math.max(1, this.speed)) {
          this.flash = 1;
          sfx.thunder();
        }
      }
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(220,230,255,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, this.cw, this.ch);
      this.flash = Math.max(0, this.flash - dt * 3);
    }
    // Floats.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      f.t += dt;
      const [fx, fy] = this.toScreen(f.x, f.y);
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      ctx.font = `bold ${Math.max(11, k * 0.36)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(f.text, fx + 1, fy - f.t * 26 + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, fx, fy - f.t * 26);
    }
    ctx.globalAlpha = 1;
    this.floats = this.floats.filter((f) => f.t < 1.4);
  }

  private drawBuilding(ctx: CanvasRenderingContext2D, s: Settlement, b: Building, k: number): void {
    const d = BUILDINGS[b.def];
    const [sx, sy] = this.toScreen(b.x - 0.5, b.y - 0.5);
    const pad = k * 0.08;
    ctx.globalAlpha = b.built ? 1 : 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    this.rrect(ctx, sx + pad + 2, sy + pad + 3, k - pad * 2, k - pad * 2, k * 0.15);
    ctx.fill();
    ctx.fillStyle = d.color;
    this.rrect(ctx, sx + pad, sy + pad, k - pad * 2, k - pad * 2, k * 0.15);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    this.emoji(ctx, d.icon, sx + k / 2, sy + k / 2, k * 0.58);
    ctx.globalAlpha = 1;
    if (!b.built) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(sx + pad, sy + k - pad - k * 0.12, k - pad * 2, k * 0.12);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(sx + pad, sy + k - pad - k * 0.12, (k - pad * 2) * b.prog, k * 0.12);
      this.emoji(ctx, '🚧', sx + k * 0.82, sy + k * 0.18, k * 0.3);
    } else if (d.workers) {
      for (let n = 0; n < d.workers; n++) {
        ctx.fillStyle = n < b.w.length ? '#7ee08a' : 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.arc(sx + k * (0.25 + n * 0.16), sy + k * 0.86, k * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      const idle = b.w.length && b.w.every((id) => s.v.find((v) => v.id === id)?.note);
      if (idle) this.emoji(ctx, '💤', sx + k * 0.82, sy + k * 0.18, k * 0.3);
    }
    if (this.sel?.kind === 'b' && this.sel.id === b.id) {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      this.rrect(ctx, sx + 1, sy + 1, k - 2, k - 2, k * 0.18);
      ctx.stroke();
    }
  }

  private emoji(ctx: CanvasRenderingContext2D, e: string, x: number, y: number, size: number): void {
    ctx.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(e, x, y + size * 0.05);
  }

  private ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string): void {
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  private radius(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string): void {
    const [cx, cy] = this.toScreen(x, y);
    ctx.setLineDash([6, 5]);
    this.ring(ctx, cx, cy, (r + 0.5) * T * this.cam.z, c);
    ctx.setLineDash([]);
  }

  private rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Input ----------

  private bindCanvas(cv: HTMLCanvasElement): void {
    const pos = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener('pointerdown', (e) => {
      initAudio();
      cv.setPointerCapture(e.pointerId);
      const p = pos(e);
      this.ptrs.set(e.pointerId, p);
      if (this.ptrs.size === 1) this.drag = { sx: p.x, sy: p.y, cx: this.cam.x, cy: this.cam.y, moved: false, pinch: 0, z: this.cam.z };
      else if (this.ptrs.size === 2 && this.drag) {
        const [a, b] = [...this.ptrs.values()];
        this.drag.pinch = Math.hypot(a.x - b.x, a.y - b.y);
        this.drag.z = this.cam.z;
        this.drag.moved = true;
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e);
      this.hover = this.toTile(p.x, p.y);
      if (!this.ptrs.has(e.pointerId) || !this.drag) return;
      this.ptrs.set(e.pointerId, p);
      if (this.ptrs.size >= 2 && this.drag.pinch) {
        const [a, b] = [...this.ptrs.values()];
        this.cam.z = this.drag.z * (Math.hypot(a.x - b.x, a.y - b.y) / this.drag.pinch);
        this.clampCam();
        return;
      }
      const dx = p.x - this.drag.sx;
      const dy = p.y - this.drag.sy;
      if (!this.drag.moved && Math.hypot(dx, dy) > 8) this.drag.moved = true;
      if (this.drag.moved) {
        const k = T * this.cam.z;
        this.cam.x = this.drag.cx - dx / k;
        this.cam.y = this.drag.cy - dy / k;
        this.clampCam();
      }
    });
    const up = (e: PointerEvent): void => {
      const d = this.drag;
      this.ptrs.delete(e.pointerId);
      if (this.ptrs.size === 0) {
        this.drag = null;
        if (d && !d.moved) {
          const p = pos(e);
          this.tap(this.toTile(p.x, p.y));
        }
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => {
      this.ptrs.delete(e.pointerId);
      if (!this.ptrs.size) this.drag = null;
    });
    cv.addEventListener('pointerleave', () => (this.hover = null));
    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = pos(e);
        const k0 = T * this.cam.z;
        const wx = (p.x - this.cw / 2) / k0 + this.cam.x;
        const wy = (p.y - this.ch / 2) / k0 + this.cam.y;
        this.cam.z *= e.deltaY < 0 ? 1.12 : 1 / 1.12;
        this.clampCam();
        const k1 = T * this.cam.z;
        this.cam.x = wx - (p.x - this.cw / 2) / k1;
        this.cam.y = wy - (p.y - this.ch / 2) / k1;
        this.clampCam();
      },
      { passive: false },
    );
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.mode = null;
      this.updateMode();
    });
  }

  private tap(t: { x: number; y: number }): void {
    const s = this.s;
    if (!s || this.modal) return;
    if (this.mode === 'demolish') {
      const b = s.b.find((x) => x.x === t.x && x.y === t.y);
      if (b && b.def !== 'hearth') {
        demolish(s, b.id);
        sfx.place();
        this.toast(`${BUILDINGS[b.def].name} demolished.`);
      } else if (inMapTile(t.x, t.y) && s.tiles[idx(t.x, t.y)] === T_ROAD) {
        removeRoad(s, t.x, t.y);
        sfx.place();
      } else sfx.deny();
      this.refresh(true);
      return;
    }
    if (this.mode) {
      const why = canPlace(s, this.mode, t.x, t.y);
      if (why) {
        sfx.deny();
        this.toast(why);
        return;
      }
      const b = place(s, this.mode, t.x, t.y);
      sfx.place();
      this.floats.push({ x: t.x, y: t.y - 0.4, text: `−${bagHtml(BUILDINGS[this.mode].cost)}`, color: '#ffb4a2', t: 0 });
      if (b && this.mode !== 'shelter' && this.mode !== 'house') this.mode = null;
      if (this.mode && !canAfford(s, BUILDINGS[this.mode].cost)) this.mode = null;
      if (b) this.sel = { kind: 'b', id: b.id };
      this.refresh(true);
      return;
    }
    const b = s.b.find((x) => x.x === t.x && x.y === t.y);
    if (b) {
      this.sel = { kind: 'b', id: b.id };
      this.tab = 'info';
      sfx.click();
      this.refresh(true);
      return;
    }
    const g = s.glades.find((x) => x.open && x.ev && x.x === t.x && x.y === t.y);
    if (g) {
      this.sel = { kind: 'g', id: g.id };
      this.tab = 'info';
      sfx.click();
      this.refresh(true);
      return;
    }
    this.sel = null;
    this.refresh(true);
  }

  private onKey(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    if (e.key === 'Escape') {
      if (this.modal) this.modal = null;
      else if (this.mode) this.mode = null;
      else if (this.screen === 'settle') this.modal = { kind: 'menu', confirm: false };
      this.screen === 'settle' ? this.refresh(true) : this.render();
      return;
    }
    if (this.screen !== 'settle' || this.modal) return;
    if (['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
      this.keys.add(key);
      e.preventDefault();
    } else if (key === ' ') {
      this.speed = this.speed === 0 ? 1 : 0;
      e.preventDefault();
      this.refresh(true);
    } else if (['0', '1', '2', '3'].includes(key)) {
      this.speed = Number(key);
      this.refresh(true);
    } else if (key === '+' || key === '=') this.cam.z *= 1.15;
    else if (key === '-') this.cam.z /= 1.15;
    else if (key === 'r') {
      this.mode = 'road';
      this.updateMode();
    }
    this.clampCam();
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.classList.contains('modal') && t.closest('[data-stop]')) return;
    if ((el as HTMLButtonElement).disabled) return;
    initAudio();
    this.action(el.dataset.act!, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const s = this.s;
    const redraw = (): void => (this.screen === 'settle' ? this.refresh(true) : this.render());
    switch (act) {
      case 'new':
        this.run = newRun(randomSeedText(), this.meta);
        saveRun(this.run);
        this.screen = 'world';
        sfx.season();
        break;
      case 'continue':
        if (!this.run) break;
        if (this.run.phase === 'settle' && this.run.settle) {
          this.speed = 0;
          this.screen = 'settle';
          this.centerCam();
        } else this.screen = this.run.phase === 'reward' ? 'reward' : 'world';
        break;
      case 'meta':
        if (buyMeta(this.meta, d.id as MetaId)) {
          saveMeta(this.meta);
          sfx.built();
        }
        break;
      case 'found':
        startSettlement(this.run!, Number(d.i), this.meta);
        saveRun(this.run!);
        this.screen = 'settle';
        this.speed = 1;
        this.tab = 'build';
        this.sel = null;
        this.mode = null;
        this.floats = [];
        this.centerCam();
        this.modal = this.s?.bpOffer ? { kind: 'bp' } : null;
        sfx.season();
        break;
      case 'speed':
        this.speed = Number(d.v);
        sfx.click();
        return redraw();
      case 'tab':
        this.tab = d.tab as Tab;
        return redraw();
      case 'build':
        if (d.id === 'demolish') this.mode = this.mode === 'demolish' ? null : 'demolish';
        else this.mode = this.mode === d.id ? null : (d.id as BuildingId);
        if (this.mode && this.mode !== 'demolish' && s && !canAfford(s, BUILDINGS[this.mode].cost)) {
          this.toast('Not enough goods');
          sfx.deny();
          this.mode = null;
        } else sfx.click();
        return redraw();
      case 'cancel-mode':
        this.mode = null;
        return redraw();
      case 'bp':
        this.modal = { kind: 'bp' };
        return redraw();
      case 'bp-pick':
        if (s) {
          pickBlueprint(s, Number(d.i));
          sfx.built();
          this.modal = null;
          this.tab = 'build';
        }
        return redraw();
      case 'order-pick':
        if (s) {
          pickOrder(s, Number(d.o), Number(d.k));
          sfx.click();
        }
        return redraw();
      case 'assign':
        if (s && assign(s, Number(d.b))) sfx.click();
        else sfx.deny();
        return redraw();
      case 'unassign':
        if (s && unassign(s, Number(d.b))) sfx.click();
        return redraw();
      case 'demolish':
        if (s) {
          demolish(s, Number(d.b));
          this.sel = null;
          sfx.place();
        }
        return redraw();
      case 'solve':
        if (s && solveEvent(s, Number(d.g))) sfx.glade();
        else sfx.deny();
        return redraw();
      case 'goto':
        this.cam.x = Number(d.x);
        this.cam.y = Number(d.y);
        if (s) {
          const g = s.glades.find((x) => x.x === Number(d.x) && x.y === Number(d.y));
          if (g) {
            this.sel = { kind: 'g', id: g.id };
            this.tab = 'info';
          }
        }
        return redraw();
      case 'sell':
        if (s) sell(s, d.g as GoodId, 5);
        return redraw();
      case 'buy':
        if (s) buy(s, Number(d.k));
        return redraw();
      case 'tribute':
        if (s) tribute(s);
        return redraw();
      case 'result-next':
        return this.resultNext();
      case 'perk':
        takePerk(this.run!, Number(d.i));
        saveRun(this.run!);
        this.screen = 'world';
        sfx.built();
        break;
      case 'help':
        this.modal = { kind: 'help' };
        return redraw();
      case 'mute': {
        const m = toggleMute();
        try {
          localStorage.setItem(MUTE_KEY, m ? '1' : '0');
        } catch {
          /* ignore */
        }
        return redraw();
      }
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        return redraw();
      case 'modal-close':
        this.modal = null;
        return redraw();
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        return redraw();
      case 'abandon-yes': {
        const run = this.run!;
        const crowns = finishRun(run, this.meta, false);
        saveMeta(this.meta);
        clearRun();
        this.end = { victory: false, score: run.score, crowns };
        this.modal = null;
        this.screen = 'end';
        sfx.lose();
        break;
      }
      case 'to-title':
        if (this.run && this.screen !== 'end') saveRun(this.run);
        if (this.screen === 'end') this.run = null;
        this.modal = null;
        this.screen = 'title';
        break;
    }
    this.render();
  }

  private centerCam(): void {
    this.cam = { x: W / 2, y: H / 2, z: window.innerWidth < 700 ? 0.9 : 1.25 };
  }

  // ---------- Debug ----------

  private installDebug(): void {
    const api = {
      state: () => {
        const s = this.s;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          step: this.run?.step ?? null,
          favor: this.run?.favor ?? null,
          perks: this.run?.perks ?? null,
          settle: s
            ? { name: s.name, biome: s.biome, t: secs(s), season: s.season, rep: +s.rep.toFixed(2), goal: s.repGoal, imp: +s.imp.toFixed(1), pop: s.v.length, buildings: s.b.length, done: s.done }
            : null,
          end: this.end,
          meta: { crowns: this.meta.crowns, runs: this.meta.runs, wins: this.meta.wins },
        };
      },
      /** One bot action. In a settlement it plays 50 s of game time with the build-order bot. */
      step: (ticks = FAST ? 400 : 200) => {
        if (this.modal) {
          const s = this.s;
          if (this.modal.kind === 'bp' && s?.bpOffer) smartBot(s);
          this.modal = null;
          this.render();
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            this.action('new', {});
            return 'new';
          case 'world':
            this.action('found', { i: '0' });
            this.modal = null;
            this.render();
            return 'found';
          case 'settle': {
            const s = this.s!;
            for (let t = 0; t < ticks && !s.done; t++) {
              if (t % 20 === 0) smartBot(s);
              tick(s);
            }
            s.fx.length = 0;
            this.drain(s);
            this.modal = null;
            saveRun(this.run!);
            if (s.done) this.finishSettlement();
            else this.refresh(true);
            return 'settle';
          }
          case 'result':
            this.resultNext();
            return 'result';
          case 'reward':
            this.action('perk', { i: '0' });
            return 'perk';
          case 'end':
            return 'end';
        }
      },
      crowns: (n: number) => {
        this.meta.crowns += n;
        saveMeta(this.meta);
        this.render();
      },
      win: () => {
        const s = this.s;
        if (s) s.rep = s.repGoal;
      },
      give: (g: GoodId, n: number) => {
        const s = this.s;
        if (s) s.stock[g] += n;
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}

const inMapTile = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
