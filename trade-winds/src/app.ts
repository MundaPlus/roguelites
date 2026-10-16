import { botAction, pirateChoice } from './bot';
import { chartGeom, lineChart, sparkline, type ChartOpts } from './chart';
import {
  GOAL,
  GOODS,
  GUARD_COST,
  GUARD_WAGE,
  INTEREST,
  LOAN_DAYS,
  NG,
  NP,
  PORTS,
  REPAIR_COST,
  RUN_DAYS,
  SEASONS,
  SHIPS,
  UNLOCKS,
  WAREHOUSE_CAP,
  WAREHOUSE_COST,
  WAREHOUSE_FEE,
  seasonOf,
  shipById,
} from './data';
import { available, buyPrice, buyQuote, maxAffordable, mid, sellPrice, sellQuote } from './market';
import { Rng, randomSeedText } from './rng';
import {
  arrive,
  avgCost,
  borrow,
  buildWarehouse,
  buy,
  buyShip,
  canBorrow,
  cargoFree,
  cargoUsed,
  checkEnd,
  clearRun,
  creditLimit,
  dangerAt,
  dismiss,
  hire,
  loadMeta,
  loadRun,
  netWorth,
  newRun,
  power,
  renownFor,
  repair,
  repairCost,
  repay,
  resolvePirates,
  retire,
  routeRisk,
  saveMeta,
  saveRun,
  sell,
  shipOf,
  startPorts,
  startShips,
  startVoyage,
  store,
  tradeIn,
  voyageTick,
  week,
  whUsed,
  type Choice,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'port' | 'voyage' | 'end';
type Tab = 'market' | 'chart' | 'harbor' | 'news';

type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'trade'; side: 'buy' | 'sell'; g: number; q: number } | { kind: 'retire' };

const params = new URLSearchParams(location.search);
/** `?debug&fast` skips waits so bot runs are quick. */
const FAST = params.has('fast');
const DAY_MS = 420;

const fmt = (n: number): string => Math.round(n).toLocaleString('en');
const pct = (p: number): string => `${Math.round(p * 100)}%`;

// ---------- Map art (fixed, generated once) ----------

interface Blob {
  d: string;
}

function blobPath(cx: number, cy: number, r: number, seed: number): string {
  const rng = new Rng(seed);
  const k = [rng.next(), rng.next(), rng.next(), rng.next()];
  const pts: string[] = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.18 * Math.sin(a * 2 + k[0] * 6) + 0.12 * Math.sin(a * 3 + k[1] * 6) + 0.07 * Math.sin(a * 5 + k[2] * 6));
    pts.push(`${(cx + Math.cos(a) * rr * 1.15).toFixed(1)},${(cy + Math.sin(a) * rr * 0.85).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

const ISLANDS: Blob[] = (() => {
  const out: Blob[] = [];
  PORTS.forEach((p, i) => {
    const dx = p.x - 520;
    const dy = p.y - 330;
    const len = Math.hypot(dx, dy) || 1;
    out.push({ d: blobPath(p.x + (dx / len) * 46, p.y + (dy / len) * 40, 48 + (i % 3) * 8, 11 + i * 7) });
  });
  [
    [420, 250, 26],
    [650, 430, 30],
    [700, 190, 22],
    [130, 250, 34],
    [560, 600, 20],
  ].forEach(([x, y, r], i) => out.push({ d: blobPath(x, y, r, 101 + i * 13) }));
  return out;
})();

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private tab: Tab = 'market';
  private sel = 0;
  private dest = -1;
  private startPort = 0;
  private startShip = 'sloop';
  private timer = 0;
  private portActs = 0;
  private botRng = new Rng(Date.now() >>> 0);
  private end: { victory: boolean; reason: string; worth: number; renown: number; day: number; stats: RunState['stats'] } | null = null;
  private chart: { values: number[]; opts: ChartOpts } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('pointermove', (e) => this.onChartMove(e));
    root.addEventListener('pointerleave', () => this.hideHover());
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (this.run?.over) this.run = null;
    if (params.has('debug')) this.installDebug();
    this.render();
  }

  private get r(): RunState {
    return this.run!;
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    if (this.screen === 'title') body = this.titleView();
    else if (this.screen === 'port') body = this.portView();
    else if (this.screen === 'voyage') body = this.voyageView();
    else body = this.endView();
    const top = this.run && (this.screen === 'port' || this.screen === 'voyage') ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    const inp = this.root.querySelector<HTMLInputElement>('.modal input[type=range]');
    if (inp) inp.focus({ preventScroll: true });
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  /** Floating number near an element (or the screen center). */
  private float(text: string, cls: string, near?: Element | null): void {
    if (FAST) return;
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    const anchor = near && near.isConnected ? near : this.root.querySelector('.top .stat');
    const rect = anchor?.getBoundingClientRect();
    el.style.left = `${rect ? rect.left + rect.width / 2 : innerWidth / 2}px`;
    el.style.top = `${rect ? rect.top : innerHeight / 2}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  private topBar(): string {
    const r = this.r;
    const s = SEASONS[seasonOf(r.day)];
    const ship = shipOf(r);
    const hullPct = r.hull / ship.hull;
    const loanLeft = Math.max(0, Math.ceil((LOAN_DAYS - r.day) / 7));
    return `<header class="top">
      <span class="stat" title="Gold">💰 <b>${fmt(r.gold)}</b></span>
      <span class="stat ${r.debt ? (loanLeft <= 8 ? 'bad' : 'warn') : 'good'}" title="Debt to the bank">🏦 ${r.debt ? `${fmt(r.debt)} <small>due in ${loanLeft}w</small>` : 'paid'}</span>
      <span class="stat" title="${s.name}: ${s.text}">${s.icon} W${week(r.day)}<small>/${RUN_DAYS / 7}</small></span>
      <span class="stat" title="Cargo">📦 ${cargoUsed(r)}/${ship.cargo}</span>
      <span class="stat ${hullPct < 0.35 ? 'bad' : hullPct < 0.7 ? 'warn' : ''}" title="Hull">🛠️ ${r.hull}/${ship.hull}</span>
      <span class="stat dim" title="Net worth">⚖️ ${fmt(netWorth(r))}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play (H)">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>
    </header>`;
  }

  // ---------- Title ----------

  private titleView(): string {
    const m = this.meta;
    const ports = startPorts(m);
    const ships = startShips(m);
    if (!ports.includes(this.startPort)) this.startPort = ports[0];
    if (!ships.includes(this.startShip)) this.startShip = ships[0];
    const cont = this.run ? `<button class="primary" data-act="continue">Continue — week ${week(this.run.day)}, ${PORTS[this.run.port].name}</button>` : '';
    const unlocks = UNLOCKS.map((u) => {
      const own = m.unlocked.includes(u.id);
      const name = u.kind === 'port' ? `⚓ Start in ${PORTS[u.ref as number].name}` : `⛵ Start with a ${shipById(u.ref as string).name}`;
      const text = u.kind === 'port' ? PORTS[u.ref as number].blurb : shipById(u.ref as string).text;
      return `<div class="arm ${own ? 'own' : ''}"><span>${name}<small>${text}</small></span>${
        own ? '<span class="good">Owned</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.renown >= u.cost ? '' : 'disabled'}>⭐ ${u.cost}</button>`
      }</div>`;
    }).join('');
    return `<div class="title">
      <div class="logo">⛵</div>
      <h1>Trade Winds</h1>
      <p class="sub">Buy low, sell high, repay the loan in 52 weeks. Reach a net worth of ${fmt(GOAL)} gold within ${RUN_DAYS / 7} weeks to retire as a Merchant Prince.</p>
      ${cont}
      <div class="panel newrun">
        <h3>New voyage</h3>
        <div class="row"><span class="dim">Home port</span>${ports.map((p) => `<button class="chip ${p === this.startPort ? 'on' : ''}" data-act="start-port" data-p="${p}">${PORTS[p].name}</button>`).join('')}</div>
        <div class="row"><span class="dim">Ship</span>${ships.map((s) => `<button class="chip ${s === this.startShip ? 'on' : ''}" data-act="start-ship" data-id="${s}">${shipById(s).name}</button>`).join('')}</div>
        <button class="primary big-btn" data-act="new">${this.run ? 'Start a new run' : 'Set sail'}</button>
      </div>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best net worth ${fmt(m.best)} · ⭐ Renown ${m.renown}</p>
      <div class="armory"><h3>Harbor guild unlocks</h3>${unlocks}</div>
      <button data-act="help">How to play</button>
    </div>`;
  }

  // ---------- Map ----------

  private mapSvg(): string {
    const r = this.r;
    const v = r.voyage;
    const here = v ? v.from : r.port;
    const g = this.sel;
    const islands = ISLANDS.map((b) => `<path class="land" d="${b.d}"/>`).join('');
    const halos = PORTS.map((p, i) => {
      const d = Math.min(1, dangerAt(r, i));
      return `<circle class="halo" cx="${p.x}" cy="${p.y}" r="${50 + d * 70}" style="opacity:${(d * 0.55).toFixed(2)}"/>`;
    }).join('');
    let route = '';
    const to = v ? v.to : this.dest;
    if (to >= 0) {
      const a = PORTS[here];
      const b = PORTS[to];
      route = `<line class="route" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
      if (!v) {
        const days = routeRisk(r, to).days;
        route += `<g class="route-lbl" transform="translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2})"><rect x="-38" y="-17" width="76" height="30" rx="8"/><text y="5" text-anchor="middle">${days} days</text></g>`;
      }
    }
    const news = new Map<number, string>();
    for (const n of r.news) if (n.port >= 0 && r.day >= n.start && r.day < n.end) news.set(n.port, (news.get(n.port) ?? '') + n.icon);
    const ports = PORTS.map((p, i) => {
      const cls = i === here && !v ? 'here' : i === to ? 'dest' : '';
      const below = p.y < 540;
      const k = r.known[i];
      const age = k ? r.day - k.day : 0;
      const price = k ? `${GOODS[g].icon} ${k.prices[g]}${age > 0 ? ` · ${age}d` : ''}` : `${GOODS[g].icon} ?`;
      const ly = below ? 34 : -42;
      return `<g class="port ${cls}" data-act="dest" data-p="${i}" transform="translate(${p.x},${p.y})" tabindex="-1">
        <circle class="hit" r="34"/>
        <circle class="pin" r="10"/>
        ${PORTS[i].shipyard ? '<circle class="yard" r="15"/>' : ''}
        <text class="pname" y="${ly}" text-anchor="middle">${p.name}${news.has(i) ? ` ${news.get(i)}` : ''}</text>
        <text class="pprice" y="${ly + 21}" text-anchor="middle">${price}</text>
      </g>`;
    }).join('');
    let sx = PORTS[r.port].x;
    let sy = PORTS[r.port].y;
    if (v) {
      const t = Math.min(1, v.done / v.days);
      sx = PORTS[v.from].x + (PORTS[v.to].x - PORTS[v.from].x) * t;
      sy = PORTS[v.from].y + (PORTS[v.to].y - PORTS[v.from].y) * t;
    }
    return `<svg class="map" viewBox="0 0 1000 640" role="img" aria-label="Sea map">
      <defs>
        <radialGradient id="sea" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#0d3a55"/><stop offset="1" stop-color="#071a2b"/></radialGradient>
        <radialGradient id="danger"><stop offset="0" stop-color="#ef476f" stop-opacity="0.8"/><stop offset="1" stop-color="#ef476f" stop-opacity="0"/></radialGradient>
        <pattern id="waves" width="60" height="30" patternUnits="userSpaceOnUse"><path d="M0 15 q15 -8 30 0 t30 0" fill="none" stroke="#2a6f8f" stroke-opacity="0.25" stroke-width="1.5"/></pattern>
      </defs>
      <rect width="1000" height="640" fill="url(#sea)"/>
      <rect class="waves" width="1060" height="640" fill="url(#waves)"/>
      ${halos}${islands}${route}${ports}
      <g class="compass" transform="translate(955,595)"><circle r="26"/><path d="M0 -24 L6 0 L0 24 L-6 0Z"/><text y="-30" text-anchor="middle">N</text></g>
      <g id="ship" style="transform:translate(${sx}px,${sy - 18}px)"><g class="bob"><text text-anchor="middle" font-size="34">⛵</text></g></g>
    </svg>`;
  }

  // ---------- Port ----------

  private portView(): string {
    const r = this.r;
    const p = PORTS[r.port];
    const tabs: [Tab, string][] = [
      ['market', '📈 Market'],
      ['chart', '📊 Prices'],
      ['harbor', '⚓ Harbor'],
      ['news', `📰 News${r.news.filter((n) => r.day < n.end).length ? ` (${r.news.filter((n) => r.day < n.end).length})` : ''}`],
    ];
    let content = '';
    if (this.tab === 'market') content = this.marketView();
    else if (this.tab === 'chart') content = this.chartView();
    else if (this.tab === 'harbor') content = this.harborView();
    else content = this.newsView();
    const tags = `<span class="tag prod">makes ${p.produces.map((id) => GOODS.find((g) => g.id === id)!.icon).join('')}</span><span class="tag cons">wants ${p.consumes
      .map((id) => GOODS.find((g) => g.id === id)!.icon)
      .join('')}</span>${p.shipyard ? '<span class="tag">⚓ shipyard</span>' : ''}${r.wh[r.port] ? '<span class="tag">🏚️ warehouse</span>' : ''}`;
    return `<div class="port-grid">
      <section class="mapcol">
        <div class="map-wrap">${this.mapSvg()}</div>
        ${this.routePanel()}
      </section>
      <section class="side">
        <div class="phead"><h2>${p.name}</h2><div class="tags">${tags}</div></div>
        <p class="dim blurb">${p.blurb}</p>
        <nav class="tabs">${tabs.map(([t, l]) => `<button class="tab ${t === this.tab ? 'on' : ''}" data-act="tab" data-t="${t}">${l}</button>`).join('')}</nav>
        <div class="tab-body">${content}</div>
      </section>
    </div>`;
  }

  private routePanel(): string {
    const r = this.r;
    if (this.dest < 0 || this.dest === r.port) return `<div class="route-panel dim">Tap a port on the map to plan a voyage. Red halos mark pirate waters.</div>`;
    const d = this.dest;
    const risk = routeRisk(r, d);
    const k = r.known[d];
    // Best known margins from here to there.
    const tips: string[] = [];
    if (k) {
      const opts = GOODS.map((g, i) => ({ g, i, buy: buyPrice(r.market, r.port, i), sell: Math.round(k.prices[i] * 0.95) }))
        .filter((o) => o.sell > o.buy && available(r.market, r.port, o.i) > 0)
        .sort((a, b) => (b.sell - b.buy) / b.buy - (a.sell - a.buy) / a.buy)
        .slice(0, 3);
      for (const o of opts) tips.push(`<span class="tip">${o.g.icon} ${o.buy}→${o.sell} <b class="good">+${pct((o.sell - o.buy) / o.buy)}</b></span>`);
    }
    const held = GOODS.map((g, i) => (r.cargo[i] && k ? `<span class="tip">${g.icon} sells ~${Math.round(k.prices[i] * 0.95)}</span>` : '')).join('');
    return `<div class="route-panel">
      <div class="route-head"><b>⛵ ${PORTS[d].name}</b> <span>${risk.days} days</span> <span class="${risk.pirate > 0.25 ? 'bad' : risk.pirate > 0.12 ? 'warn' : ''}" title="Chance of pirates">🏴‍☠️ ${pct(risk.pirate)}</span> <span class="${risk.storm > 0.15 ? 'warn' : ''}" title="Chance of a storm">⛈️ ${pct(risk.storm)}</span>
      <span class="grow"></span><button class="primary" data-act="sail" title="Enter">Set sail</button></div>
      <div class="tips">${k ? `<span class="dim">Prices seen ${r.day - k.day === 0 ? 'today' : `${r.day - k.day} days ago`}:</span>` : '<span class="dim">No prices known.</span>'}${tips.join('')}${held}${
        k && !tips.length && !held ? '<span class="dim">no clear profit on the known prices</span>' : ''
      }</div>
    </div>`;
  }

  private marketView(): string {
    const r = this.r;
    const m = r.market;
    const p = PORTS[r.port];
    const rows = GOODS.map((g, i) => {
      const bp = buyPrice(m, r.port, i);
      const sp = sellPrice(m, r.port, i);
      const h = m.ports[r.port].hist[i].slice(-28);
      const prev = h.length > 7 ? h[h.length - 8] : h[0];
      const now = Math.round(mid(m, r.port, i));
      const trend = now > prev * 1.05 ? '<span class="up">▲</span>' : now < prev * 0.95 ? '<span class="down">▼</span>' : '<span class="dim">•</span>';
      const role = p.produces.includes(g.id) ? '<span class="role prod" title="Made here: cheap">M</span>' : p.consumes.includes(g.id) ? '<span class="role cons" title="Wanted here: dear">W</span>' : '';
      const ac = avgCost(r, i);
      const hold = r.cargo[i] ? `<b>${r.cargo[i]}</b><small class="${sp >= ac ? 'good' : 'bad'}">@${ac}</small>` : '<span class="dim">–</span>';
      return `<tr class="${i === this.sel ? 'sel' : ''}" data-act="select" data-g="${i}">
        <td class="gname"><span class="gi">${g.icon}</span><span class="gn">${g.name}</span>${role}<kbd>${i + 1}</kbd></td>
        <td class="num">${bp}</td>
        <td class="num">${sp}</td>
        <td class="trend">${trend}<span class="sparkcell">${sparkline(h)}</span></td>
        <td class="num hold">${hold}</td>
        <td class="acts"><button class="mini buy" data-act="trade" data-side="buy" data-g="${i}" ${available(m, r.port, i) && cargoFree(r) && r.gold >= bp ? '' : 'disabled'}>Buy</button><button class="mini sell" data-act="trade" data-side="sell" data-g="${i}" ${r.cargo[i] ? '' : 'disabled'}>Sell</button></td>
      </tr>`;
    }).join('');
    const anyCargo = cargoUsed(r) > 0;
    return `<table class="market"><thead><tr><th>Good</th><th class="num">Buy</th><th class="num">Sell</th><th>Trend</th><th class="num">Hold</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div class="row-btns"><button data-act="sell-all" ${anyCargo ? '' : 'disabled'}>Sell all cargo</button><span class="dim">Every unit you trade moves the price. <kbd>B</kbd> buy · <kbd>S</kbd> sell</span></div>`;
  }

  private chartView(): string {
    const r = this.r;
    const g = this.sel;
    const values = r.market.ports[r.port].hist[g];
    const ac = avgCost(r, g);
    const narrow = innerWidth < 560;
    const opts: ChartOpts = { w: narrow ? 360 : 520, h: narrow ? 200 : 210, lastDay: r.day, ref: r.cargo[g] ? ac : undefined, refLabel: 'your cost', label: `${GOODS[g].name} price in ${PORTS[r.port].name}` };
    this.chart = { values, opts };
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const chips = GOODS.map((x, i) => `<button class="chip ${i === g ? 'on' : ''}" data-act="select" data-g="${i}" title="${x.name}">${x.icon}</button>`).join('');
    const known = PORTS.map((p, i) => {
      if (i === r.port) return '';
      const k = r.known[i];
      const days = routeRisk(r, i).days;
      const sp = k ? Math.round(k.prices[g] * 0.95) : null;
      const diff = sp !== null ? sp - buyPrice(r.market, r.port, g) : 0;
      return `<tr data-act="dest" data-p="${i}"><td>${p.name}</td><td class="num">${sp ?? '?'}</td><td class="num ${diff > 0 ? 'good' : 'bad'}">${sp !== null ? (diff > 0 ? '+' : '') + diff : ''}</td><td class="num dim">${k ? `${r.day - k.day}d` : ''}</td><td class="num dim">${days}d</td></tr>`;
    }).join('');
    return `<div class="chips">${chips}</div>
      <h3 class="chart-title">${GOODS[g].icon} ${GOODS[g].name} in ${PORTS[r.port].name} <small class="dim">mid price, last ${Math.round(values.length / 7)} weeks</small></h3>
      <div class="chart-wrap">${lineChart(values, opts)}<div class="chart-tip" hidden></div></div>
      <p class="dim small">Now ${Math.round(mid(r.market, r.port, g))} · low ${lo} · high ${hi}${r.cargo[g] ? ` · your cost ${ac}` : ''}</p>
      <h3>Known ${GOODS[g].name.toLowerCase()} prices elsewhere</h3>
      <table class="known"><thead><tr><th>Port</th><th class="num">Sell</th><th class="num">vs buy here</th><th class="num">Seen</th><th class="num">Sail</th></tr></thead><tbody>${known}</tbody></table>`;
  }

  private harborView(): string {
    const r = this.r;
    const ship = shipOf(r);
    const p = PORTS[r.port];
    const loanLeft = Math.max(0, Math.ceil((LOAN_DAYS - r.day) / 7));
    const bank = `<div class="card"><h3>🏦 Bank</h3>
      ${
        r.debt
          ? `<p>You owe <b>${fmt(r.debt)}</b> gold. Interest ${INTEREST * 100}% each week. Due in <b class="${loanLeft <= 8 ? 'bad' : ''}">${loanLeft} weeks</b>.</p>`
          : `<p class="good">No debt.${r.loanPaid !== null ? ` Loan repaid in week ${week(r.loanPaid)}.` : ''}</p>`
      }
      <div class="btns">${r.debt ? `<button data-act="repay" data-a="500" ${r.gold > 0 ? '' : 'disabled'}>Repay 500</button><button class="primary" data-act="repay" data-a="all" ${r.gold > 0 ? '' : 'disabled'}>Repay ${fmt(Math.min(r.gold, r.debt))}</button>` : ''}
      ${canBorrow(r) ? `<button data-act="borrow">Borrow 1,000 <small>(limit ${fmt(creditLimit(r))})</small></button>` : ''}</div></div>`;
    const missing = ship.hull - r.hull;
    const rep = `<div class="card"><h3>🛠️ Repairs</h3><p>Hull ${r.hull}/${ship.hull}. ${REPAIR_COST} gold per point.</p>
      <div class="btns"><button data-act="repair" ${missing && r.gold >= REPAIR_COST ? '' : 'disabled'}>Repair (${fmt(Math.min(repairCost(r), Math.floor(r.gold / REPAIR_COST) * REPAIR_COST))})</button></div></div>`;
    const guards = `<div class="card"><h3>🛡️ Guards</h3><p>${r.guards}/${ship.maxGuards} guards. Fight power ${power(r).toFixed(1)} (${ship.guns} guns). Hire ${GUARD_COST}, wage ${GUARD_WAGE}/week.</p>
      <div class="btns"><button data-act="hire" ${r.guards < ship.maxGuards && r.gold >= GUARD_COST ? '' : 'disabled'}>Hire a guard</button><button data-act="dismiss" ${r.guards ? '' : 'disabled'}>Dismiss one</button></div></div>`;
    let wh = '';
    const w = r.wh[r.port];
    if (!w) {
      wh = `<div class="card"><h3>🏚️ Warehouse</h3><p>Store up to ${WAREHOUSE_CAP} goods here while prices are low. Rent ${fmt(WAREHOUSE_COST)}, then ${WAREHOUSE_FEE}/week.</p>
        <div class="btns"><button data-act="warehouse" ${r.gold >= WAREHOUSE_COST ? '' : 'disabled'}>Rent a warehouse</button></div></div>`;
    } else {
      const rows = GOODS.map((g, i) =>
        r.cargo[i] || w[i]
          ? `<div class="whrow"><span>${g.icon} ${g.name}</span><span class="dim">ship ${r.cargo[i]} · stored ${w[i]}</span><button class="mini" data-act="store" data-g="${i}" ${r.cargo[i] && whUsed(w) < WAREHOUSE_CAP ? '' : 'disabled'}>Store</button><button class="mini" data-act="take" data-g="${i}" ${w[i] && cargoFree(r) ? '' : 'disabled'}>Take</button></div>`
          : '',
      ).join('');
      wh = `<div class="card"><h3>🏚️ Warehouse <small class="dim">${whUsed(w)}/${WAREHOUSE_CAP}</small></h3>${rows || '<p class="dim">Empty. Goods in your hold can be stored here.</p>'}</div>`;
    }
    const others = r.wh.map((x, i) => (x && i !== r.port ? `${PORTS[i].name} (${whUsed(x)})` : '')).filter(Boolean);
    let yard = '';
    if (p.shipyard) {
      const ti = tradeIn(r);
      yard = `<div class="card"><h3>⚓ Shipyard <small class="dim">trade-in ${fmt(ti)}</small></h3>${SHIPS.map((s) => {
        const cost = s.price - ti;
        const ok = s.id !== r.ship && r.gold >= cost && cargoUsed(r) <= s.cargo;
        return `<div class="shiprow ${s.id === r.ship ? 'own' : ''}"><span><b>${s.name}</b><small>📦${s.cargo} 🛠️${s.hull} 💨${s.speed} 💣${s.guns} 🛡️${s.maxGuards} — ${s.text}</small></span>${
          s.id === r.ship ? '<span class="good">yours</span>' : `<button class="mini" data-act="ship" data-id="${s.id}" ${ok ? '' : 'disabled'}>${fmt(cost)}</button>`
        }</div>`;
      }).join('')}</div>`;
    } else yard = `<div class="card dim"><h3>⚓ Shipyard</h3><p>No shipyard here. Ships are sold in ${PORTS.filter((x) => x.shipyard).map((x) => x.name).join(', ')}.</p></div>`;
    const ret = `<div class="card"><h3>🎩 Retire</h3><p>Net worth <b>${fmt(netWorth(r))}</b> of the ${fmt(GOAL)} goal. You can retire once the loan is repaid.</p>
      <div class="btns"><button data-act="retire" ${r.debt ? 'disabled' : ''}>Retire now</button></div></div>`;
    return `<div class="harbor">${bank}${rep}${guards}${wh}${others.length ? `<p class="dim small">Other warehouses: ${others.join(', ')}</p>` : ''}${yard}${ret}</div>`;
  }

  private newsView(): string {
    const r = this.r;
    const active = r.news.filter((n) => r.day < n.end);
    const s = SEASONS[seasonOf(r.day)];
    const list = active.length
      ? active
          .map((n) => {
            const left = Math.ceil((n.end - r.day) / 7);
            const eff = n.goods.map(([g, m]) => `${GOODS[g].icon}${m > 1 ? '<span class="up">▲</span>' : '<span class="down">▼</span>'}`).join(' ');
            return `<li><span class="nicon">${n.icon}</span><span>${n.text} <small class="dim">${eff} ${n.danger > 0 ? '🏴‍☠️▲' : n.danger < 0 ? '🏴‍☠️▼' : ''} · ${left} week${left > 1 ? 's' : ''} left</small></span></li>`;
          })
          .join('')
      : '<li class="dim">No news. The markets are calm.</li>';
    const log = r.log
      .slice(-14)
      .reverse()
      .map((l) => `<li><small class="dim">W${week(l.day)}</small> ${l.text}</li>`)
      .join('');
    return `<p class="season">${s.icon} <b>${s.name}</b> — ${s.text}</p><ul class="news">${list}</ul><h3>Ship's log</h3><ul class="log">${log}</ul>`;
  }

  // ---------- Voyage ----------

  private voyageView(): string {
    return `<div class="port-grid">
      <section class="mapcol"><div class="map-wrap">${this.mapSvg()}</div></section>
      <section class="side" id="vside">${this.voyageSide()}</section>
    </div>`;
  }

  private voyageSide(): string {
    const r = this.r;
    const v = r.voyage!;
    const head = `<h2>At sea</h2><p>${PORTS[v.from].name} → <b>${PORTS[v.to].name}</b></p>
      <div class="progress"><div style="width:${Math.min(100, (v.done / v.days) * 100)}%"></div></div>
      <p class="dim">Day ${v.done} of ${v.days} · ${SEASONS[seasonOf(r.day)].icon} ${SEASONS[seasonOf(r.day)].name}</p>`;
    const e = r.encounter;
    let card = '';
    if (r.outcome) {
      card = `<div class="enc"><p>${r.outcome}</p><button class="primary" data-act="sea-continue">Continue</button></div>`;
    } else if (e && e.kind === 'pirates') {
      card = `<div class="enc pirates"><h3>🏴‍☠️ ${e.ships} pirate ship${e.ships > 1 ? 's' : ''}!</h3>
        <p>Pirate strength <b>${e.strength}</b>. Your power <b>${power(r).toFixed(1)}</b>.</p>
        <div class="choices">
          <button class="danger" data-act="pirates" data-c="fight"><b>⚔️ Fight</b><small>${pct(e.win)} to win · loot on a win</small></button>
          <button data-act="pirates" data-c="flee"><b>💨 Flee</b><small>${pct(e.flee)} to escape</small></button>
          <button data-act="pirates" data-c="pay" ${r.gold >= e.tribute ? '' : ''}><b>💰 Pay ${fmt(e.tribute)}</b><small>${r.gold >= e.tribute ? 'safe passage' : 'not enough gold: they take cargo too'}</small></button>
        </div><p class="dim small">Keys: F fight · R run · P pay</p></div>`;
    } else if (e) {
      const icon = { storm: '⛈️', flotsam: '📦', tip: '🗞️', wind: '🌬️', calm: '🌫️' }[e.kind];
      card = `<div class="enc ${e.kind}"><h3>${icon}</h3><p>${e.text}</p><button class="primary" data-act="sea-continue">Continue</button></div>`;
    } else {
      card = `<div class="enc calm-sea"><p class="dim">The ship sails on…</p></div>`;
    }
    const cargo = GOODS.map((g, i) => (r.cargo[i] ? `<span class="tip">${g.icon} ${r.cargo[i]}</span>` : '')).join('');
    return `${head}${card}<div class="tips">${cargo || '<span class="dim">Empty hold</span>'}</div>`;
  }

  private updateVoyage(): void {
    const side = this.root.querySelector<HTMLElement>('#vside');
    const ship = this.root.querySelector<SVGGElement>('#ship');
    const r = this.r;
    const v = r.voyage;
    if (!side || !ship || !v) return this.render();
    const t = Math.min(1, v.done / v.days);
    const x = PORTS[v.from].x + (PORTS[v.to].x - PORTS[v.from].x) * t;
    const y = PORTS[v.from].y + (PORTS[v.to].y - PORTS[v.from].y) * t;
    ship.style.transform = `translate(${x}px,${y - 18}px)`;
    side.innerHTML = this.voyageSide();
    const top = this.root.querySelector('header.top');
    if (top) top.outerHTML = this.topBar();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (this.screen !== 'voyage') return;
    if (FAST) {
      while (this.screen === 'voyage' && this.run && !this.run.encounter && !this.run.outcome) this.tick(false);
      return;
    }
    this.timer = window.setTimeout(() => this.tick(true), DAY_MS);
  }

  /** One day at sea, or the arrival. */
  private tick(again: boolean): void {
    const r = this.run;
    if (!r || !r.voyage || this.screen !== 'voyage' || r.encounter || r.outcome) return;
    const v = r.voyage;
    if (v.done >= v.days) {
      arrive(r);
      this.portActs = 0;
      this.dest = -1;
      this.tab = 'market';
      this.screen = 'port';
      if (!FAST) sfx.arrive();
      this.toast(`⚓ ${PORTS[r.port].name}`);
      saveRun(r);
      if (this.checkOver()) return;
      this.render();
      return;
    }
    const notes = voyageTick(r);
    notes.forEach((n) => this.toast(n));
    if (!FAST) {
      const e = r.encounter as RunState['encounter'];
      if (e?.kind === 'pirates') sfx.alarm();
      else if (e?.kind === 'storm') {
        sfx.storm();
        this.shake();
      } else if (e) sfx.good();
      else sfx.day();
    }
    saveRun(r);
    if (this.checkOver()) return;
    if (!FAST) this.updateVoyage();
    if (again) this.schedule();
  }

  private shake(): void {
    this.root.classList.remove('shake');
    void this.root.offsetWidth;
    this.root.classList.add('shake');
  }

  // ---------- End ----------

  private checkOver(): boolean {
    const r = this.run;
    if (!r) return false;
    if (!checkEnd(r)) return false;
    this.finish();
    return true;
  }

  private finish(): void {
    const r = this.r;
    const over = r.over!;
    const worth = netWorth(r);
    const renown = renownFor(r);
    this.meta.renown += renown;
    if (over.victory) this.meta.wins++;
    this.meta.best = Math.max(this.meta.best, worth);
    saveMeta(this.meta);
    clearRun();
    clearTimeout(this.timer);
    this.end = { victory: over.victory, reason: over.reason, worth, renown, day: r.day, stats: r.stats };
    this.run = null;
    this.modal = null;
    this.screen = 'end';
    if (!FAST) (over.victory ? sfx.win : sfx.lose)();
    this.render();
  }

  private endView(): string {
    const e = this.end!;
    const s = e.stats;
    return `<div class="end">
      <div class="logo">${e.victory ? '👑' : e.reason.includes('sinks') ? '🌊' : '⚓'}</div>
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? 'Merchant Prince!' : 'Voyage over'}</h1>
      <p>${e.reason}</p>
      <p class="score">Net worth <b>${fmt(e.worth)}</b> <small class="dim">goal ${fmt(GOAL)}</small></p>
      <div class="endstats">
        <span>📅 Week ${Math.min(week(e.day), RUN_DAYS / 7)}</span><span>⛵ ${s.voyages} voyages</span><span>💱 ${s.trades} trades</span>
        <span>💰 Trade profit ${fmt(s.profit)}</span><span>🏆 Best sale +${fmt(s.best)}</span><span>🏴‍☠️ ${s.pirates} pirate attacks (${s.won} won)</span><span>⛈️ ${s.storms} storms</span>
      </div>
      <p>⭐ +${e.renown} renown for the harbor guild</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  // ---------- Modals ----------

  private tradeMax(side: 'buy' | 'sell', g: number): number {
    const r = this.r;
    return side === 'buy' ? maxAffordable(r.market, r.port, g, r.gold, cargoFree(r)) : r.cargo[g];
  }

  private quoteHtml(m: Extract<Modal, { kind: 'trade' }>): string {
    const r = this.r;
    const q = m.q;
    if (q <= 0) return '<p class="dim">Pick an amount.</p>';
    if (m.side === 'buy') {
      const cost = buyQuote(r.market, r.port, m.g, q);
      const after = Math.round(buyQuote(r.market, r.port, m.g, q + 1) - cost);
      return `<p>Total <b>${fmt(cost)}</b> gold · avg ${Math.round(cost / q)} each</p><p class="dim">Buy price after: ${after} · gold left ${fmt(r.gold - cost)}</p>`;
    }
    const inc = sellQuote(r.market, r.port, m.g, q);
    const basis = Math.round((r.paid[m.g] * q) / Math.max(1, r.cargo[m.g]));
    const prof = inc - basis;
    return `<p>Total <b>${fmt(inc)}</b> gold · avg ${Math.round(inc / q)} each</p><p class="${prof >= 0 ? 'good' : 'bad'}">Profit ${prof >= 0 ? '+' : ''}${fmt(prof)} over your cost</p>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Trade.</b> Each port has buy and sell prices for 8 goods. Buy where a good is made (<span class="role prod">M</span>), sell where it is wanted (<span class="role cons">W</span>).</li>
          <li><b>Prices react.</b> Every unit you buy raises the price; every unit you sell lowers it. Markets recover over days.</li>
          <li><b>News</b> changes prices for a few weeks: a famine makes grain dear, a war makes iron dear. Seasons matter too.</li>
          <li><b>Sail.</b> Tap a port on the map, check days and risk, then set sail. You only see the prices of other ports from your last visit (or from traders at sea).</li>
          <li><b>Pirates</b>: fight (guns + guards), flee (fast ships escape) or pay. <b>Storms</b> hurt the hull and wash cargo away. Repair in port. A hull at 0 sinks the run.</li>
          <li><b>The loan</b> must be repaid by week 52, or the bank takes your ship. Interest is ${INTEREST * 100}% per week.</li>
          <li><b>Grow.</b> Buy bigger ships at shipyards, hire guards, rent warehouses.</li>
          <li><b>Goal.</b> Reach a net worth of ${fmt(GOAL)} by week ${RUN_DAYS / 7} (or retire early once you have it). Renown unlocks new home ports and ships.</li>
          <li><b>Keys:</b> 1–8 pick a good, B buy, S sell, T next tab, ←/→ pick a port, Enter set sail. At sea: F fight, R run, P pay, Space continue. Esc menu.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'retire') {
      const w = netWorth(this.r);
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop><h2>Retire now?</h2>
        <p>Your net worth is <b>${fmt(w)}</b>. The goal is ${fmt(GOAL)}.</p>
        <p class="${w >= GOAL ? 'good' : 'warn'}">${w >= GOAL ? 'You retire as a Merchant Prince.' : 'This ends the run below the goal.'}</p>
        <button class="primary" data-act="retire-yes">Retire</button><button data-act="modal-close">Keep sailing</button></div></div>`;
    }
    if (m.kind === 'trade') {
      const g = GOODS[m.g];
      const max = this.tradeMax(m.side, m.g);
      const r = this.r;
      return `<div class="modal" data-act="modal-close"><div class="sheet trade" data-stop>
        <h2>${m.side === 'buy' ? 'Buy' : 'Sell'} ${g.icon} ${g.name}</h2>
        <p class="dim">Price ${m.side === 'buy' ? buyPrice(r.market, r.port, m.g) : sellPrice(r.market, r.port, m.g)} · in hold ${r.cargo[m.g]} · free space ${cargoFree(r)} · gold ${fmt(r.gold)}</p>
        <div class="qty"><button data-act="q" data-d="-10">−10</button><button data-act="q" data-d="-1">−1</button><output id="qv">${m.q}</output><button data-act="q" data-d="1">+1</button><button data-act="q" data-d="10">+10</button></div>
        <input type="range" min="0" max="${max}" value="${m.q}" id="qr" aria-label="Amount"/>
        <div class="btns"><button data-act="q-set" data-v="0">None</button><button data-act="q-set" data-v="${Math.floor(max / 2)}">Half</button><button data-act="q-set" data-v="${max}">Max (${max})</button></div>
        <div class="quote" id="quote">${this.quoteHtml(m)}</div>
        <div class="btns"><button class="primary" data-act="trade-ok" ${m.q > 0 ? '' : 'disabled'}>${m.side === 'buy' ? 'Buy' : 'Sell'} ${m.q}</button><button data-act="modal-close">Cancel</button></div>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  private setQty(q: number): void {
    const m = this.modal;
    if (!m || m.kind !== 'trade') return;
    const max = this.tradeMax(m.side, m.g);
    m.q = Math.max(0, Math.min(max, Math.round(q)));
    const qv = this.root.querySelector('#qv');
    const qr = this.root.querySelector<HTMLInputElement>('#qr');
    const quote = this.root.querySelector('#quote');
    const ok = this.root.querySelector<HTMLButtonElement>('[data-act="trade-ok"]');
    if (qv) qv.textContent = String(m.q);
    if (qr) qr.value = String(m.q);
    if (quote) quote.innerHTML = this.quoteHtml(m);
    if (ok) {
      ok.disabled = m.q <= 0;
      ok.textContent = `${m.side === 'buy' ? 'Buy' : 'Sell'} ${m.q}`;
    }
  }

  // ---------- Actions ----------

  private doBuy(g: number, q: number, near?: Element | null): boolean {
    const cost = buy(this.r, g, q);
    if (!cost) {
      sfx.deny();
      return false;
    }
    if (!FAST) sfx.buy();
    this.float(`−${fmt(cost)} 💰`, 'neg', near);
    this.after();
    return true;
  }

  private doSell(g: number, q: number, near?: Element | null): boolean {
    const res = sell(this.r, g, q);
    if (!res.income) {
      sfx.deny();
      return false;
    }
    if (!FAST) sfx.coin();
    this.float(`+${fmt(res.income)} 💰`, res.profit >= 0 ? 'pos' : 'neg', near);
    this.after();
    return true;
  }

  private after(): void {
    const r = this.run;
    if (!r) return;
    saveRun(r);
    if (this.checkOver()) return;
    this.render();
  }

  private setSail(to: number): void {
    const r = this.r;
    if (to < 0 || to === r.port) {
      sfx.deny();
      this.toast('Pick a destination on the map first.');
      return;
    }
    if (r.hull < shipOf(r).hull * 0.3) this.toast('⚠️ Your hull is weak. A storm could sink you.');
    if (!startVoyage(r, to)) return;
    this.modal = null;
    this.screen = 'voyage';
    if (!FAST) sfx.sail();
    saveRun(r);
    this.render();
    this.schedule();
  }

  private seaContinue(): void {
    const r = this.r;
    if (r.outcome) r.outcome = null;
    else if (r.encounter && r.encounter.kind !== 'pirates') r.encounter = null;
    else return;
    saveRun(r);
    if (this.checkOver()) return;
    this.updateVoyage();
    this.schedule();
  }

  private pirates(c: Choice): void {
    const r = this.r;
    if (!r.encounter || r.encounter.kind !== 'pirates') return;
    const goldBefore = r.gold;
    resolvePirates(r, c);
    if (!FAST) {
      if (c === 'fight') sfx.cannon();
      else if (c === 'pay') sfx.coin();
      else sfx.sail();
      if (r.outcome?.startsWith('Defeat') || r.outcome?.startsWith('They catch')) this.shake();
    }
    const diff = r.gold - goldBefore;
    if (diff) this.float(`${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))} 💰`, diff > 0 ? 'pos' : 'neg');
    saveRun(r);
    if (this.checkOver()) return;
    this.updateVoyage();
  }

  private newGame(): void {
    clearTimeout(this.timer);
    this.run = newRun(randomSeedText(), this.startPort, this.startShip);
    this.meta.runs++;
    saveMeta(this.meta);
    saveRun(this.run);
    this.screen = 'port';
    this.tab = 'market';
    this.dest = -1;
    this.sel = 0;
    this.portActs = 0;
    this.render();
    this.toast(`Welcome to ${PORTS[this.run.port].name}. Repay ${fmt(this.run.debt)} gold by week 52.`);
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as Element).closest<HTMLElement | SVGElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    if (el instanceof HTMLButtonElement && el.disabled) return;
    this.action(el.dataset.act, el.dataset, el);
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.id === 'qr') this.setQty(Number(t.value));
  }

  private action(act: string, d: DOMStringMap, el?: Element): void {
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
        if (!r) return;
        this.modal = null;
        r.over = { victory: false, reason: 'You abandon the voyage and sell the ship.' };
        this.finish();
        return;
      case 'title':
        clearTimeout(this.timer);
        this.modal = null;
        this.screen = 'title';
        this.render();
        return;
      case 'continue':
        if (!r) return;
        this.screen = r.voyage ? 'voyage' : 'port';
        this.render();
        this.schedule();
        return;
      case 'new':
        this.newGame();
        return;
      case 'start-port':
        this.startPort = Number(d.p);
        this.render();
        return;
      case 'start-ship':
        this.startShip = d.id!;
        this.render();
        return;
      case 'unlock': {
        const u = UNLOCKS.find((x) => x.id === d.id);
        if (!u || this.meta.unlocked.includes(u.id) || this.meta.renown < u.cost) return;
        this.meta.renown -= u.cost;
        this.meta.unlocked.push(u.id);
        saveMeta(this.meta);
        sfx.good();
        this.render();
        return;
      }
    }
    if (!r) return;
    switch (act) {
      case 'tab':
        this.tab = d.t as Tab;
        sfx.click();
        this.render();
        return;
      case 'select':
        this.sel = Number(d.g);
        this.render();
        return;
      case 'dest': {
        if (this.screen !== 'port') return;
        const p = Number(d.p);
        if (p === r.port) return;
        this.dest = p;
        sfx.click();
        this.render();
        return;
      }
      case 'sail':
        this.setSail(this.dest);
        return;
      case 'trade': {
        const g = Number(d.g);
        this.sel = g;
        const side = d.side as 'buy' | 'sell';
        const max = this.tradeMax(side, g);
        this.modal = { kind: 'trade', side, g, q: max };
        this.render();
        return;
      }
      case 'q': {
        const m = this.modal;
        if (m?.kind === 'trade') this.setQty(m.q + Number(d.d));
        return;
      }
      case 'q-set':
        this.setQty(Number(d.v));
        return;
      case 'trade-ok': {
        const m = this.modal;
        if (m?.kind !== 'trade' || m.q <= 0) return;
        this.modal = null;
        const row = this.root.querySelector(`tr[data-g="${m.g}"] .acts`);
        if (m.side === 'buy') this.doBuy(m.g, m.q, row);
        else this.doSell(m.g, m.q, row);
        return;
      }
      case 'sell-all': {
        let total = 0;
        for (let g = 0; g < NG; g++) if (r.cargo[g]) total += sell(r, g, r.cargo[g]).income;
        if (total) {
          sfx.coin();
          this.float(`+${fmt(total)} 💰`, 'pos', el);
        }
        this.after();
        return;
      }
      case 'repay': {
        const a = repay(r, d.a === 'all' ? r.gold : Number(d.a));
        if (a) {
          sfx.coin();
          this.float(`−${fmt(a)} debt`, 'pos', el);
          if (!r.debt) this.toast('🎉 The loan is repaid!');
        }
        this.after();
        return;
      }
      case 'borrow':
        if (borrow(r, 1000)) sfx.coin();
        this.after();
        return;
      case 'repair': {
        const pts = repair(r);
        if (pts) {
          sfx.good();
          this.float(`+${pts} hull`, 'pos', el);
        }
        this.after();
        return;
      }
      case 'hire':
        if (hire(r, 1)) sfx.good();
        this.after();
        return;
      case 'dismiss':
        dismiss(r, 1);
        this.after();
        return;
      case 'warehouse':
        if (buildWarehouse(r)) sfx.good();
        this.after();
        return;
      case 'store':
        store(r, Number(d.g), r.cargo[Number(d.g)]);
        sfx.click();
        this.after();
        return;
      case 'take': {
        const w = r.wh[r.port];
        if (w) store(r, Number(d.g), -w[Number(d.g)]);
        sfx.click();
        this.after();
        return;
      }
      case 'ship':
        if (buyShip(r, d.id!)) {
          sfx.win();
          this.toast(`⛵ Your new ${shipOf(r).name} is ready.`);
        }
        this.after();
        return;
      case 'retire':
        if (r.debt) return;
        this.modal = { kind: 'retire' };
        this.render();
        return;
      case 'retire-yes':
        this.modal = null;
        if (retire(r)) this.finish();
        return;
      case 'sea-continue':
        this.seaContinue();
        return;
      case 'pirates':
        this.pirates(d.c as Choice);
        return;
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const m = this.modal;
    if (m) {
      if (k === 'Escape') {
        this.modal = null;
        this.render();
      } else if (m.kind === 'trade') {
        if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
          e.preventDefault();
          const step = k === 'ArrowUp' || k === 'ArrowDown' ? 10 : 1;
          this.setQty(m.q + (k === 'ArrowLeft' || k === 'ArrowDown' ? -step : step));
        } else if (k === 'Enter') {
          e.preventDefault();
          this.action('trade-ok', {});
        }
      } else if (m.kind === 'retire' && k === 'Enter') this.action('retire-yes', {});
      return;
    }
    if (k === 'Escape' && this.run && this.screen !== 'title') {
      this.action('menu', {});
      return;
    }
    if (k === 'h' || k === 'H' || k === '?') {
      this.action('help', {});
      return;
    }
    if (this.screen === 'title' && k === 'Enter') {
      this.action(this.run ? 'continue' : 'new', {});
      return;
    }
    const r = this.run;
    if (!r) return;
    if (this.screen === 'voyage') {
      const enc = r.encounter;
      if (enc?.kind === 'pirates' && !r.outcome) {
        if (k === 'f' || k === 'F') this.pirates('fight');
        else if (k === 'r' || k === 'R') this.pirates('flee');
        else if (k === 'p' || k === 'P') this.pirates('pay');
      } else if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        this.seaContinue();
      }
      return;
    }
    if (this.screen !== 'port') return;
    if (k >= '1' && k <= '8') {
      this.sel = Number(k) - 1;
      this.render();
    } else if (k === 'b' || k === 'B') this.action('trade', { g: String(this.sel), side: 'buy' });
    else if ((k === 's' || k === 'S') && r.cargo[this.sel]) this.action('trade', { g: String(this.sel), side: 'sell' });
    else if (k === 't' || k === 'T') {
      const order: Tab[] = ['market', 'chart', 'harbor', 'news'];
      this.tab = order[(order.indexOf(this.tab) + 1) % order.length];
      this.render();
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      let p = this.dest < 0 ? r.port : this.dest;
      do p = (p + (k === 'ArrowRight' ? 1 : NP - 1)) % NP;
      while (p === r.port);
      this.dest = p;
      this.render();
    } else if (k === 'Enter') this.setSail(this.dest);
  }

  // ---------- Chart hover ----------

  private onChartMove(e: PointerEvent): void {
    const svg = (e.target as Element).closest?.('svg[data-chart]') as SVGSVGElement | null;
    if (!svg || !this.chart) return this.hideHover();
    const { values, opts } = this.chart;
    const rect = svg.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * opts.w;
    const l = Number(svg.dataset.l);
    const rr = Number(svg.dataset.r);
    const n = values.length;
    const i = Math.max(0, Math.min(n - 1, Math.round(((vx - l) / (rr - l)) * (n - 1))));
    const geo = chartGeom(values, opts);
    const x = geo.x(i);
    const y = geo.y(values[i]);
    const g = svg.querySelector<SVGGElement>('.hover')!;
    g.setAttribute('visibility', 'visible');
    const line = g.querySelector('line')!;
    line.setAttribute('x1', String(x));
    line.setAttribute('x2', String(x));
    const dot = g.querySelector('circle')!;
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(y));
    const tip = this.root.querySelector<HTMLElement>('.chart-tip');
    if (tip) {
      const ago = n - 1 - i;
      tip.hidden = false;
      tip.innerHTML = `<b>${values[i]}</b> gold<br><small>${ago === 0 ? 'today' : `${ago} day${ago > 1 ? 's' : ''} ago`}</small>`;
      const px = (x / opts.w) * rect.width;
      tip.style.left = `${Math.min(rect.width - 70, Math.max(0, px - 35))}px`;
      tip.style.top = `${Math.max(0, (y / opts.h) * rect.height - 52)}px`;
    }
  }

  private hideHover(): void {
    const g = this.root.querySelector('svg[data-chart] .hover');
    if (g) g.setAttribute('visibility', 'hidden');
    const tip = this.root.querySelector<HTMLElement>('.chart-tip');
    if (tip) tip.hidden = true;
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        day: this.run?.day,
        week: this.run ? week(this.run.day) : null,
        port: this.run ? PORTS[this.run.port].name : null,
        gold: this.run?.gold,
        debt: this.run?.debt,
        ship: this.run?.ship,
        hull: this.run?.hull,
        cargo: this.run?.cargo.slice(),
        worth: this.run ? netWorth(this.run) : null,
        voyage: this.run?.voyage ? { ...this.run.voyage } : null,
        encounter: this.run?.encounter?.kind ?? null,
        end: this.end,
      }),
      run: () => this.run,
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.render();
      },
      renown: (n: number) => {
        this.meta.renown += n;
        saveMeta(this.meta);
        this.render();
      },
      /** One bot action. The bot plans trades from the prices the player knows. */
      step: (): string => {
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            this.newGame();
            return 'new';
          case 'end':
            return 'end';
          case 'voyage': {
            if (!r) return 'busy';
            if (r.outcome || (r.encounter && r.encounter.kind !== 'pirates')) {
              this.seaContinue();
              return 'continue';
            }
            if (r.encounter) {
              const c = pirateChoice(r, true, this.botRng);
              this.pirates(c);
              return c;
            }
            if (FAST) {
              this.schedule();
              return 'sail';
            }
            return 'busy';
          }
          case 'port': {
            if (!r) return 'busy';
            let a = botAction(r, true, this.botRng);
            this.portActs++;
            if (this.portActs > 40 && a.t !== 'sail') a = { t: 'sail', to: (r.port + 1) % NP };
            switch (a.t) {
              case 'sell':
                this.doSell(a.g, a.q);
                break;
              case 'buy':
                this.doBuy(a.g, a.q);
                break;
              case 'repay':
                this.action('repay', { a: 'all' });
                break;
              case 'repair':
                this.action('repair', {});
                break;
              case 'ship':
                this.action('ship', { id: a.id });
                break;
              case 'hire':
                this.action('hire', {});
                break;
              case 'retire':
                if (retire(r)) this.finish();
                break;
              case 'sail':
                this.dest = a.to;
                this.setSail(a.to);
                break;
              default:
                break;
            }
            return a.t;
          }
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}

