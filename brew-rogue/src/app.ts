import { FULL, canBottle, firstDanger, fullPath, previewPath, queueLength, stir, pourWater, walk, zoneAt, type PlanStep } from './brew';
import { ingName, smartNext, toBuy } from './bot';
import {
  EFFECTS,
  INGREDIENTS,
  MAPS,
  PLACES,
  SALTS,
  STRENGTH_NAMES,
  UNLOCKS,
  UNLOCK_IDS,
  ZONE_R,
  type EffectId,
  type MapId,
  type V,
} from './data';
import { randomSeedText } from './rng';
import {
  DEBTS,
  HOURS,
  LAST_DAY,
  MAX_ACTIVE,
  accept,
  bottle,
  brewAdd,
  brewSalt,
  buy,
  clearRun,
  dayInWeek,
  daysToDebt,
  debtNow,
  deliver,
  deliverPay,
  dropBrew,
  endDay,
  finishRun,
  fits,
  gather,
  loadMeta,
  loadRun,
  mapsWith,
  newRun,
  potionFor,
  potionValue,
  rivalShare,
  saveMeta,
  saveRun,
  score,
  sellPotion,
  startBrew,
  unlock,
  week,
  type Order,
  type Potion,
  type RunState,
  type TripResult,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'day' | 'market' | 'gather' | 'brew' | 'night' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips animation waits, for bot tests. */
const FAST = PARAMS.has('fast');

const STIR_SPEED = 32;
const WATER_SPEED = 22;
const GRINDS = [0.25, 0.5, 0.75, 1];

const fx = (e: EffectId): string => `${EFFECTS[e].icon} ${EFFECTS[e].name}`;
const potionName = (p: { effect: EffectId; strength: number }): string => `${fx(p.effect)} ${STRENGTH_NAMES[p.strength]}`;
const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n);
const pts = (list: V[]): string => list.map((p) => `${p.x.toFixed(1)},${(-p.y).toFixed(1)}`).join(' ');

function dueText(o: Order, day: number): string {
  const n = o.due - day;
  return n <= 0 ? '<span class="bad">due today</span>' : n === 1 ? '<span class="warn">due tomorrow</span>' : `due in ${n} days`;
}

/** Small SVG of an ingredient path, for shop and inventory cards. */
function miniPath(id: string, size = 44): string {
  const p = fullPath(id);
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => -q.y);
  const minX = Math.min(...xs, 0) - 4;
  const maxX = Math.max(...xs, 0) + 4;
  const minY = Math.min(...ys, 0) - 4;
  const maxY = Math.max(...ys, 0) + 4;
  const s = Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2 - s / 2;
  const cy = (minY + maxY) / 2 - s / 2;
  return `<svg class="mini" width="${size}" height="${size}" viewBox="${cx} ${cy} ${s} ${s}"><polyline points="${pts(p)}" fill="none" stroke="var(--gold)" stroke-width="${s / 18}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="0" cy="0" r="${s / 14}" fill="var(--accent2)"/></svg>`;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private selected: string | null = null;
  private hover: string | null = null;
  private grind = 1;
  private holding: 'stir' | 'water' | null = null;
  private auto: { kind: 'stir' | 'water'; left: number } | null = null;
  private raf = 0;
  private last = 0;
  private busyUntil = 0;
  private botPlan: PlanStep[] | null = null;
  private trip: { place: string; res: TripResult } | null = null;
  private end: { win: boolean; score: number; seals: number; reason: string; run: RunState } | null = null;
  private ruinShown = false;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointerover', (e) => this.onOver(e));
    root.addEventListener('pointerout', (e) => this.onOut(e));
    root.addEventListener('input', (e) => this.onInput(e));
    window.addEventListener('pointerup', () => this.release());
    window.addEventListener('pointercancel', () => this.release());
    window.addEventListener('blur', () => this.release());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => {
      if ((e.key === 's' || e.key === 'S') && this.holding === 'stir') this.release();
      if ((e.key === 'w' || e.key === 'W') && this.holding === 'water') this.release();
    });
    root.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).closest('[data-hold]')) e.preventDefault();
    });
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'day':
        body = this.dayView();
        break;
      case 'market':
        body = this.marketView();
        break;
      case 'gather':
        body = this.gatherView();
        break;
      case 'brew':
        body = this.brewView();
        break;
      case 'night':
        body = this.nightView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  /** A floating text that rises from an element or the screen center. */
  private float(text: string, color = 'var(--gold)', anchor?: Element | null): void {
    const el = document.createElement('div');
    el.className = 'float';
    el.textContent = text;
    el.style.color = color;
    const r = anchor?.getBoundingClientRect();
    el.style.left = `${r ? r.left + r.width / 2 : innerWidth / 2}px`;
    el.style.top = `${r ? r.top + r.height / 2 : innerHeight / 2}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  private topBar(): string {
    const r = this.run!;
    const left = daysToDebt(r.day);
    const debt = debtNow(r);
    return `<header class="top">
      <span class="tb" title="Week and day">📅 W${week(r.day) + 1} · D${dayInWeek(r.day)}/5</span>
      <span class="tb" title="Hours left today">⏳ ${'●'.repeat(Math.max(0, r.hours))}${'○'.repeat(Math.max(0, HOURS - r.hours))}</span>
      <span class="tb" title="Gold">💰 ${r.gold}</span>
      <span class="tb ${r.gold >= debt ? 'good' : left <= 1 ? 'bad' : 'warn'}" title="Guild debt">🏛️ ${debt} ${left === 0 ? 'tonight' : `in ${left}d`}</span>
      <span class="tb" title="Your reputation vs. the rival">⭐ ${r.rep} <small class="dim">vs</small> 🧙‍♀️ ${r.rivalRep}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const hall = UNLOCK_IDS.map((id) => {
      const u = UNLOCKS[id];
      const own = m.unlocked.includes(id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${u.icon}</span><span><b>${u.name}</b><small>${u.text}</small></span>
        ${own ? '<span class="good">✔ Owned</span>' : `<button data-act="unlock" data-id="${id}" ${m.seals >= u.cost ? '' : 'disabled'}>🔖 ${u.cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo">⚗️</div>
      <h1>Brew Rogue</h1>
      <p class="sub">Steer your potion across the effect map. Fill orders, beat the rival alchemist and pay the guild every week. Survive 4 weeks.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue (week ${week(r.day) + 1}, day ${dayInWeek(r.day)}, 💰 ${r.gold})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best day ${m.bestDay} · Best score ${m.best}</p>
      <h2>Guild Hall <small>🔖 ${m.seals} seals</small></h2>
      <p class="sub">Each run gives seals. Spend them on upgrades for later runs.</p>
      <div class="armory">${hall}</div>
    </div>`;
  }

  private orderCard(o: Order, kind: 'board' | 'active'): string {
    const r = this.run!;
    const maps = mapsWith(r, o.effect).map((m) => MAPS[m].icon).join('');
    const strong = o.strength;
    let btns = '';
    if (kind === 'board') {
      btns = o.rival
        ? '<span class="dim">🧙‍♀️ Taken by Morwen</span>'
        : `<button data-act="accept" data-id="${o.id}" ${r.active.length >= MAX_ACTIVE ? 'disabled title="You have 4 orders"' : ''}>Accept</button>`;
    } else {
      const pi = potionFor(r, o);
      btns =
        pi >= 0
          ? `<button class="primary" data-act="deliver" data-id="${o.id}">Deliver ${potionName(r.potions[pi])} · +${deliverPay(o, r.potions[pi])}💰</button>`
          : `<button data-act="brew-for" data-id="${o.id}" ${r.hours < 1 ? 'disabled' : ''}>🧪 Brew</button>`;
    }
    return `<div class="order ${o.rival ? 'taken' : ''} ${o.grand ? 'grand' : ''}" style="--c:${EFFECTS[o.effect].color}">
      <div class="who"><span class="big">${o.icon}</span><span><b>${o.who}</b><small>${dueText(o, r.day)}</small></span><span class="price">💰 ${o.price}</span></div>
      <div class="want"><span class="fxi">${EFFECTS[o.effect].icon}</span><b>${EFFECTS[o.effect].name}</b> <span class="stars" title="Strength ${strong} or more">${stars(strong)}</span> <small class="dim">${maps}</small></div>
      ${btns}
    </div>`;
  }

  private invHtml(withSalts = true): string {
    const r = this.run!;
    const ing = Object.entries(r.inv)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => `<span class="chip" title="${INGREDIENTS[id].name}">${INGREDIENTS[id].icon}×${n}</span>`)
      .join('');
    const salts = withSalts
      ? Object.entries(r.salts)
          .filter(([, n]) => n > 0)
          .map(([id, n]) => `<span class="chip salt" title="${SALTS[id].name}: ${SALTS[id].text}">${SALTS[id].icon}×${n}</span>`)
          .join('')
      : '';
    return `<div class="chips">${ing || '<span class="dim">No ingredients.</span>'}${salts}</div>`;
  }

  private shelfHtml(): string {
    const r = this.run!;
    if (!r.potions.length) return '<p class="dim">No potions yet. Brew one!</p>';
    return `<div class="shelf">${r.potions
      .map(
        (p, i) =>
          `<div class="potion" style="--c:${EFFECTS[p.effect].color}"><span class="flask">🧪</span><span>${potionName(p)}</span><button class="small" data-act="sell" data-i="${i}">Sell ${potionValue(p)}💰</button></div>`,
      )
      .join('')}</div>`;
  }

  private dayView(): string {
    const r = this.run!;
    const board = r.board.length ? r.board.map((o) => this.orderCard(o, 'board')).join('') : '<p class="dim">No more customers today.</p>';
    const active = r.active.length ? r.active.map((o) => this.orderCard(o, 'active')).join('') : '<p class="dim">No orders. Accept customers from the board.</p>';
    const share = Math.round(rivalShare(r) * 100);
    return `<div class="day">
      <div class="actions">
        <button class="primary" data-act="brew" ${r.hours < 1 ? 'disabled' : ''}>🧪 Brew <small>1h</small></button>
        <button data-act="market">🛒 Market</button>
        <button data-act="gather" ${r.hours < 2 ? 'disabled' : ''}>🧺 Gather <small>2h</small></button>
        <button data-act="end-day">🌙 End day</button>
      </div>
      <div class="cols">
        <section><h3>Customers today</h3><p class="hint">Morwen takes about ${share}% of the orders. Raise your ⭐ to keep more.</p><div class="orders">${board}</div></section>
        <section><h3>Your orders <small class="dim">${r.active.length}/${MAX_ACTIVE}</small></h3><div class="orders">${active}</div>
          <h3>Shelf</h3>${this.shelfHtml()}
          <h3>Ingredients</h3>${this.invHtml()}
        </section>
      </div>
    </div>`;
  }

  private marketView(): string {
    const r = this.run!;
    const wares = r.market
      .map((w) => {
        const d = INGREDIENTS[w.id];
        return `<div class="ware r-${d.rarity}">${miniPath(w.id)}<span class="big">${d.icon}</span><span class="wname"><b>${d.name}</b><small>${d.rarity} · ${w.qty} left · you have ${r.inv[w.id] ?? 0}</small></span>
          <button data-act="buy" data-id="${w.id}" ${w.qty > 0 && r.gold >= w.price ? '' : 'disabled'}>${w.price}💰</button></div>`;
      })
      .join('');
    const salts = r.saltMarket
      .map((w) => {
        const d = SALTS[w.id];
        return `<div class="ware"><span class="big">${d.icon}</span><span class="wname"><b>${d.name}</b><small>${d.text} · ${w.qty} left · you have ${r.salts[w.id] ?? 0}</small></span>
          <button data-act="buy-salt" data-id="${w.id}" ${w.qty > 0 && r.gold >= w.price ? '' : 'disabled'}>${w.price}💰</button></div>`;
      })
      .join('');
    return `<div class="market">
      <h2>🛒 Market</h2>
      <p class="hint">The gold line shows the path each ingredient adds. The dot is where it starts.</p>
      <div class="wares">${wares}</div>
      <h3>Salts</h3><div class="wares">${salts}</div>
      <h3>Sell potions</h3>${this.shelfHtml()}
      <button class="primary" data-act="back">← Back to the shop</button>
    </div>`;
  }

  private gatherView(): string {
    const r = this.run!;
    if (this.trip) {
      const pl = PLACES[this.trip.place];
      const found = Object.entries(this.trip.res.found).map(([id, n]) => `<span class="chip">${INGREDIENTS[id].icon} ${INGREDIENTS[id].name} ×${n}</span>`);
      return `<div class="gatherv">
        <h2>${pl.icon} ${pl.name}</h2>
        <p class="${this.trip.res.bad ? 'bad' : 'good'}">${this.trip.res.event}</p>
        <div class="chips">${found.join('') || '<span class="dim">Nothing found.</span>'}</div>
        <button class="primary" data-act="back">← Back to the shop</button>
      </div>`;
    }
    const places = Object.entries(PLACES)
      .map(
        ([id, p]) => `<button class="place" data-act="go" data-id="${id}" ${r.hours < 2 ? 'disabled' : ''}>
        <span class="huge">${p.icon}</span><b>${p.name}</b><small>${p.text}</small>
        <small>Finds ${p.min}–${p.max}: ${p.pool.filter((i) => !INGREDIENTS[i].unlock || r.meta.includes(INGREDIENTS[i].unlock!)).map((i) => INGREDIENTS[i].icon).join('')}</small>
        <small class="${p.risk > 0.3 ? 'bad' : p.risk > 0.2 ? 'warn' : 'dim'}">Risk ${Math.round(p.risk * 100)}%</small></button>`,
      )
      .join('');
    return `<div class="gatherv">
      <h2>🧺 Gathering trip <small>2 hours</small></h2>
      <p class="hint">Free ingredients, but bandits, storms and wolves wait out there.</p>
      <div class="places">${places}</div>
      <button data-act="back">← Back</button>
    </div>`;
  }

  // ---------- Brew screen ----------

  private brewView(): string {
    const r = this.run!;
    if (!r.brew) {
      const target = r.active.find((o) => o.id === this.pendingOrder) ?? null;
      const maps = r.maps
        .map((m) => {
          const has = target ? MAPS[m].zones.some((z) => z.effect === target.effect) : true;
          return `<button class="mapcard ${has ? '' : 'faded'}" data-act="base" data-id="${m}">
            <svg viewBox="-110 -110 220 220" class="thumb">${this.mapSvgBase(m, target?.effect ?? null)}</svg>
            <b>${MAPS[m].icon} ${MAPS[m].name}</b><small>${MAPS[m].zones.map((z) => EFFECTS[z.effect].icon).join(' ')}</small></button>`;
        })
        .join('');
      return `<div class="pickbase">
        <h2>Choose a base</h2>
        <p class="hint">${target ? `For ${target.who}: ${fx(target.effect)} ${stars(target.strength)}. ` : ''}Each base has its own effect map.</p>
        <div class="maps">${maps}</div>
        <button data-act="back">← Back</button>
      </div>`;
    }
    return `<div class="brew">
      <div class="mapwrap ${r.brew.ruined ? 'shake' : ''}"><svg id="map" viewBox="-110 -110 220 220">${this.mapSvg()}</svg>
        ${r.brew.ruined ? '<div class="ruin"><span class="huge">💥</span><b>The potion is ruined!</b><button class="primary" data-act="ruin-ok">Clean the cauldron</button></div>' : ''}
      </div>
      <aside class="panel" id="panel">${this.panelHtml()}</aside>
    </div>`;
  }

  private pendingOrder: number | null = null;

  private mapSvgBase(m: MapId, target: EffectId | null): string {
    const map = MAPS[m];
    let s = `<defs><radialGradient id="bg-${m}"><stop offset="0" stop-color="${map.tint}" stop-opacity="1"/><stop offset="1" stop-color="#0b0812"/></radialGradient></defs>`;
    s += `<rect x="-110" y="-110" width="220" height="220" fill="url(#bg-${m})"/>`;
    for (const rr of [25, 50, 75, 100]) s += `<circle r="${rr}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>`;
    s += `<circle r="2" fill="rgba(120,180,255,0.6)"/>`;
    for (const z of map.zones) {
      const c = EFFECTS[z.effect].color;
      const tg = z.effect === target;
      s += `<g class="zone ${tg ? 'target' : ''}" transform="translate(${z.x} ${-z.y})">
        <circle r="${ZONE_R}" fill="${c}" fill-opacity="0.16" stroke="${c}" stroke-opacity="${tg ? 1 : 0.5}" stroke-width="${tg ? 1.2 : 0.5}"/>
        <circle r="${(ZONE_R * 2) / 3}" fill="${c}" fill-opacity="0.18"/>
        <circle r="${ZONE_R / 3}" fill="${c}" fill-opacity="0.35"/>
        <text y="3" font-size="9" text-anchor="middle">${EFFECTS[z.effect].icon}</text></g>`;
    }
    for (const d of map.dangers) {
      s += `<g transform="translate(${d.x} ${-d.y})"><circle r="${d.r}" fill="#2a0710" stroke="#ff3b5c" stroke-opacity="0.7" stroke-width="0.6"/><text y="${d.r * 0.4}" font-size="${d.r * 1.1}" text-anchor="middle">💀</text></g>`;
    }
    return s;
  }

  private target(): Order | null {
    const r = this.run!;
    return r.active.find((o) => o.id === r.brewFor) ?? null;
  }

  private mapSvg(): string {
    const r = this.run!;
    const b = r.brew!;
    const tg = this.target();
    let s = this.mapSvgBase(b.map, tg?.effect ?? null);
    s += `<polyline points="${pts(b.trail)}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.1" stroke-linejoin="round"/>`;
    if (b.queue.length) s += `<polyline points="${pts([b.pos, ...b.queue])}" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="2 2" stroke-linejoin="round"/>`;
    const pv = this.hover ?? this.selected;
    if (pv && !b.ruined) {
      const path = previewPath(b, pv, this.grind);
      const hit = firstDanger(b, path);
      s += `<polyline points="${pts(path)}" fill="none" stroke="var(--gold)" stroke-width="1.3" stroke-dasharray="3 1.5" stroke-linejoin="round" class="preview"/>`;
      const e = path[path.length - 1];
      s += `<circle cx="${e.x}" cy="${-e.y}" r="2.2" fill="var(--gold)"/>`;
      if (hit) s += `<text x="${hit.x}" y="${-hit.y + 3}" font-size="9" text-anchor="middle" class="xmark">❌</text>`;
    }
    if (this.holding === 'water' || this.auto?.kind === 'water') s += `<line x1="${b.pos.x}" y1="${-b.pos.y}" x2="0" y2="0" stroke="#6cc4ff" stroke-width="0.8" stroke-dasharray="1.5 1.5"/>`;
    const z = zoneAt(b.map, b.pos);
    s += `<circle cx="${b.pos.x}" cy="${-b.pos.y}" r="4.5" fill="none" stroke="${z ? EFFECTS[z.effect].color : '#fff'}" stroke-width="1" class="pulse"/>`;
    s += `<circle cx="${b.pos.x}" cy="${-b.pos.y}" r="3" fill="#fff" stroke="var(--accent)" stroke-width="1.2"/>`;
    return s;
  }

  /** Which effects a path passes, and their best strength, before any danger. */
  private reach(extra: V[]): string {
    const b = this.run!.brew!;
    const route = [b.pos, ...b.queue, ...extra.slice(1)];
    const w = walk(MAPS[b.map], b.pos, route.slice(1));
    const best = new Map<EffectId, number>();
    let cur = route[0];
    let len = 0;
    for (const p of route.slice(1)) {
      const d = Math.hypot(p.x - cur.x, p.y - cur.y);
      const n = Math.max(1, Math.ceil(d));
      for (let k = 1; k <= n; k++) {
        if (len + (d * k) / n > w.len) break;
        const q = { x: cur.x + ((p.x - cur.x) * k) / n, y: cur.y + ((p.y - cur.y) * k) / n };
        const zz = zoneAt(b.map, q);
        if (zz && (best.get(zz.effect) ?? 0) < zz.strength) best.set(zz.effect, zz.strength);
      }
      len += d;
      cur = p;
    }
    const list = [...best.entries()].map(([e, st]) => `${EFFECTS[e].icon} ${STRENGTH_NAMES[st]}`).join(', ');
    return `${list ? `Passes ${list}.` : 'Passes no effect.'}${w.hit ? ' <b class="bad">Hits 💀 danger!</b>' : ''}`;
  }

  private panelHtml(): string {
    const r = this.run!;
    const b = r.brew!;
    const tg = this.target();
    const z = canBottle(b);
    const others = r.active.filter((o) => potionFor(r, o) < 0);
    const tsel = others.length
      ? `<select data-act="target">${['<option value="">No order</option>', ...others.map((o) => `<option value="${o.id}" ${o.id === r.brewFor ? 'selected' : ''}>${o.icon} ${EFFECTS[o.effect].icon} ${EFFECTS[o.effect].name} ${STRENGTH_NAMES[o.strength]}</option>`)].join('')}</select>`
      : '';
    const ings = Object.entries(r.inv)
      .filter(([, n]) => n > 0)
      .map(
        ([id, n], i) =>
          `<button class="ing ${this.selected === id ? 'sel' : ''}" data-act="select" data-id="${id}" data-ing="${id}" title="${INGREDIENTS[id].name} (key ${i + 1})">${miniPath(id, 30)}<span>${INGREDIENTS[id].icon}<small>×${n}</small></span></button>`,
      )
      .join('');
    const salts = Object.entries(r.salts)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => `<button class="small" data-act="salt" data-id="${id}" title="${SALTS[id].text}" ${b.ruined ? 'disabled' : ''}>${SALTS[id].icon}×${n}</button>`)
      .join('');
    const pv = this.hover ?? this.selected;
    const ql = queueLength(b);
    return `<div class="bhead"><b>${MAPS[b.map].icon} ${MAPS[b.map].name}</b>${tsel}</div>
      <div class="status ${z ? 'in' : ''}" id="bstatus">${this.statusHtml()}</div>
      <div class="bottle-row">
        <button class="primary big-btn" data-act="bottle" ${z ? '' : 'disabled'}>🧪 Bottle ${z ? potionName(z) : ''} <small>B</small></button>
      </div>
      <div class="ctrl">
        <button class="hold" data-hold="stir" ${ql > 0 && !b.ruined ? '' : 'disabled'}>🥄 Stir <small>hold · S</small></button>
        <button class="hold" data-hold="water" ${b.ruined ? 'disabled' : ''}>💧 Water <small>hold · W</small></button>
      </div>
      <h4>Ingredients <small class="dim">tap to preview</small></h4>
      <div class="ings">${ings || '<span class="dim">Nothing left. Buy more at the market.</span>'}</div>
      <div class="grind"><label>Grind <b>${Math.round(this.grind * 100)}%</b> of the path</label>
        <input type="range" min="0" max="3" step="1" value="${GRINDS.indexOf(this.grind)}" data-act="grind" aria-label="Grind"></div>
      <div class="pv">${pv ? `${ingName(pv)}: ${this.reach(previewPath(b, pv, this.grind))}` : ql > 0 ? `Queued path: ${this.reach([])}` : 'Pick an ingredient to see its path.'}</div>
      <button class="primary" data-act="add" ${this.selected && !b.ruined ? '' : 'disabled'}>➕ Add ${this.selected ? INGREDIENTS[this.selected].icon : ''} <small>A</small></button>
      ${salts ? `<h4>Salts</h4><div class="salts">${salts}</div>` : ''}
      <button class="small" data-act="abandon-brew">🗑️ Throw away the brew</button>
      <p class="hint">${tg ? `Goal: ${fx(tg.effect)} ${stars(tg.strength)}. ` : ''}Add ingredients to queue their paths. Stir to move along the dotted line. Water pulls toward the center. Stop inside an effect and bottle. Avoid 💀.</p>`;
  }

  private statusHtml(): string {
    const b = this.run!.brew!;
    const z = zoneAt(b.map, b.pos);
    const ql = Math.round(queueLength(b));
    return `${z ? `In <b>${potionName(z)}</b> ${stars(z.strength)}` : 'No effect here'} · queue ${ql}`;
  }

  /** Update only the map and the status line (used while stirring). */
  private refreshBrew(full = false): void {
    if (this.screen !== 'brew' || !this.run?.brew) return;
    const map = this.root.querySelector('#map');
    if (map) map.innerHTML = this.mapSvg();
    if (full) {
      const panel = this.root.querySelector('#panel');
      if (panel) panel.innerHTML = this.panelHtml();
    } else {
      const st = this.root.querySelector('#bstatus');
      if (st) {
        st.innerHTML = this.statusHtml();
        st.classList.toggle('in', !!zoneAt(this.run.brew.map, this.run.brew.pos));
      }
      const bt = this.root.querySelector<HTMLButtonElement>('[data-act="bottle"]');
      const z = canBottle(this.run.brew);
      if (bt) {
        bt.disabled = !z;
        bt.innerHTML = `🧪 Bottle ${z ? potionName(z) : ''} <small>B</small>`;
      }
    }
  }

  private nightView(): string {
    const r = this.run!;
    const news = r.news.length ? r.news.map((n) => `<li>${n}</li>`).join('') : '<li>A calm night.</li>';
    return `<div class="night">
      <div class="huge">🌅</div>
      <h2>Week ${week(r.day) + 1}, day ${dayInWeek(r.day)}</h2>
      <ul class="news">${news}</ul>
      <p class="hint">The guild wants ${debtNow(r)} gold ${daysToDebt(r.day) === 0 ? 'tonight' : `in ${daysToDebt(r.day)} days`}.</p>
      <button class="primary" data-act="morning">Open the shop</button>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    const s = e.run.stats;
    return `<div class="end">
      <div class="huge">${e.win ? '🏆' : '🕯️'}</div>
      <h1>${e.win ? 'Master Alchemist!' : 'The shop is closed'}</h1>
      <p>${e.reason}</p>
      <p class="big">Score ${e.score}</p>
      <p class="stats">Days ${e.run.day + 1}/${LAST_DAY + 1} · Delivered ${s.delivered} · Failed ${s.failed} · Brewed ${s.brewed} · Ruined ${s.ruined} · Trips ${s.trips} · Earned ${s.earned}💰 · ⭐ ${e.run.rep}</p>
      <p class="good">+${e.seals} 🔖 seals for the Guild Hall</p>
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
          <li><b>The effect map.</b> Your potion is the white marker. It starts at the center. Colored circles are effects: the closer to the middle of a circle, the stronger the potion (I, II, III).</li>
          <li><b>Ingredients</b> add a path to the end of the queue. Tap one to see its gold preview line, then add it. <b>Grind</b> sets how much of its path you use.</li>
          <li><b>Stir</b> (hold) moves the marker along the dotted queue. <b>Water</b> (hold) pulls the marker and the queue toward the center.</li>
          <li><b>Salts</b>: ☀️ and 🌙 turn the queued path, 🌬️ and 🪨 push the marker up or down.</li>
          <li><b>💀 Danger</b> ruins the potion when the marker touches it. The preview shows ❌ where that would happen.</li>
          <li>Stop inside an effect and <b>bottle</b>. Each brew takes 1 hour. You have 3 hours a day.</li>
          <li><b>Customers</b> want an effect with a minimum strength by a deadline. Deliver from "Your orders". Late orders cost reputation.</li>
          <li>Buy ingredients at the <b>market</b> or go <b>gathering</b> (2 hours, risky). Pay the <b>guild debt</b> at the end of every week. If you cannot pay, the run ends.</li>
          <li><b>Morwen</b>, the rival, takes orders from the board. The higher your ⭐ compared to hers, the fewer she takes.</li>
          <li>New bases (maps) open in week 2 (Lamp Oil) and week 3 (Dark Wine, a Guild Hall unlock). In week 4 the Guild Master orders a strong potion: deliver it.</li>
          <li>Keys: 1–9 pick an ingredient, A add, S stir, W water, B bottle, Esc menu.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Flow ----------

  private save(): void {
    if (this.run && !this.run.result) saveRun(this.run);
  }

  private checkEnd(): boolean {
    const r = this.run;
    if (!r || !r.result) return false;
    const seals = finishRun(this.meta, r);
    saveMeta(this.meta);
    clearRun();
    this.end = { win: r.result === 'win', score: score(r), seals, reason: r.reason, run: r };
    this.run = null;
    this.screen = 'end';
    this.stopLoop();
    if (this.end.win) sfx.win();
    else sfx.lose();
    this.render();
    return true;
  }

  private newRun(): void {
    clearRun();
    this.run = newRun(randomSeedText(), this.meta);
    this.botPlan = null;
    this.screen = this.run.news.length ? 'night' : 'day';
    this.save();
    this.render();
  }

  private goBrew(orderId: number | null): void {
    const r = this.run!;
    if (r.hours < 1) return;
    this.pendingOrder = orderId;
    const o = r.active.find((x) => x.id === orderId);
    const maps = o ? mapsWith(r, o.effect) : r.maps;
    this.selected = null;
    this.hover = null;
    this.screen = 'brew';
    if (maps.length === 1) this.startBase(maps[0]);
    else this.render();
  }

  private startBase(m: MapId): void {
    const r = this.run!;
    const target = this.pendingOrder ?? r.active.find((o) => potionFor(r, o) < 0 && MAPS[m].zones.some((z) => z.effect === o.effect))?.id ?? null;
    startBrew(r, m, target);
    this.ruinShown = false;
    sfx.bubble();
    this.save();
    this.render();
  }

  private addSelected(): void {
    const r = this.run!;
    if (!this.selected || !r.brew) return;
    if (!brewAdd(r, this.selected, this.grind)) return;
    sfx.plop();
    if (!r.inv[this.selected]) this.selected = null;
    this.hover = null;
    this.save();
    this.refreshBrew(true);
  }

  private doBottle(): void {
    const r = this.run!;
    const tg = this.target();
    const btn = this.root.querySelector('[data-act="bottle"]');
    const p = bottle(r);
    if (!p) return sfx.deny();
    sfx.bottle();
    this.float(`🧪 ${potionName(p)}`, EFFECTS[p.effect].color, btn);
    if (tg && fits(p, tg)) this.toast(`${potionName(p)} is ready for ${tg.who}.`);
    else if (tg) this.toast(`${potionName(p)} does not fit ${tg.who}'s order. Sell it or keep it.`);
    this.screen = 'day';
    this.selected = null;
    this.hover = null;
    this.stopLoop();
    this.save();
    this.render();
  }

  private onRuin(): void {
    if (this.ruinShown) return;
    this.ruinShown = true;
    this.holding = null;
    this.auto = null;
    this.botPlan = null;
    sfx.boom();
    this.busyUntil = performance.now() + (FAST ? 0 : 700);
    this.save();
    this.render();
  }

  private finishRuin(): void {
    dropBrew(this.run!);
    this.screen = 'day';
    this.save();
    this.render();
  }

  private endTheDay(): void {
    const r = this.run!;
    endDay(r);
    if (this.checkEnd()) return;
    sfx.night();
    this.screen = 'night';
    this.save();
    this.render();
  }

  // ---------- Hold loop (stir and water) ----------

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.tick(dt);
      this.raf = this.holding || this.auto ? requestAnimationFrame(tick) : 0;
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.holding = null;
    this.auto = null;
  }

  private tick(dt: number): void {
    const b = this.run?.brew;
    if (!b || b.ruined) {
      this.holding = null;
      this.auto = null;
      return;
    }
    const kind = this.auto?.kind ?? this.holding;
    if (!kind) return;
    let amount = (kind === 'stir' ? STIR_SPEED : WATER_SPEED) * dt;
    if (this.auto) {
      amount = Math.min(amount, this.auto.left);
      this.auto.left -= amount;
    }
    const before = zoneAt(b.map, b.pos);
    let moved = 0;
    if (kind === 'stir') moved = stir(b, amount);
    else moved = pourWater(b, 1, amount);
    if (Math.random() < 0.25 && moved > 0) {
      if (kind === 'stir') sfx.stir();
      else sfx.water();
    }
    const after = zoneAt(b.map, b.pos);
    if (after && (!before || after.strength > before.strength || after.effect !== before.effect)) sfx.chime(after.strength);
    if (b.ruined) return this.onRuin();
    if (this.auto && (this.auto.left <= 1e-6 || moved < 1e-6)) this.auto = null;
    if (kind === 'stir' && !b.queue.length && this.holding === 'stir') this.holding = null;
    this.refreshBrew(!this.holding && !this.auto);
  }

  private release(): void {
    if (!this.holding) return;
    this.holding = null;
    this.save();
    this.refreshBrew(true);
  }

  private hold(kind: 'stir' | 'water'): void {
    const b = this.run?.brew;
    if (!b || b.ruined) return;
    if (kind === 'stir' && !b.queue.length) return;
    initAudio();
    this.holding = kind;
    this.startLoop();
  }

  // ---------- Input ----------

  private onDown(e: PointerEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-hold]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    e.preventDefault();
    this.hold(el.dataset.hold as 'stir' | 'water');
  }

  private onOver(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ing]');
    if (el && this.hover !== el.dataset.ing) {
      this.hover = el.dataset.ing!;
      this.refreshPreview();
    }
  }

  private onOut(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ing]');
    const to = (e.relatedTarget as HTMLElement | null)?.closest<HTMLElement>('[data-ing]');
    if (el && !to && this.hover) {
      this.hover = null;
      this.refreshPreview();
    }
  }

  private refreshPreview(): void {
    if (this.screen !== 'brew' || !this.run?.brew) return;
    const map = this.root.querySelector('#map');
    if (map) map.innerHTML = this.mapSvg();
    const pv = this.root.querySelector('.pv');
    const b = this.run.brew;
    const id = this.hover ?? this.selected;
    if (pv) pv.innerHTML = id ? `${ingName(id)}: ${this.reach(previewPath(b, id, this.grind))}` : queueLength(b) > 0 ? `Queued path: ${this.reach([])}` : 'Pick an ingredient to see its path.';
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.dataset.act === 'grind') {
      this.grind = GRINDS[+el.value] ?? 1;
      sfx.grind();
      const lab = this.root.querySelector('.grind b');
      if (lab) lab.textContent = `${Math.round(this.grind * 100)}%`;
      this.refreshPreview();
    }
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    if ((el as HTMLButtonElement).disabled) return;
    this.action(el.dataset.act, el.dataset, el);
  }

  private action(act: string, d: DOMStringMap, el?: HTMLElement): void {
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
        this.modal = null;
        if (r) {
          r.result = 'lose';
          r.reason = 'You closed the shop and left town.';
          this.checkEnd();
        }
        return;
      case 'title':
        this.modal = null;
        this.stopLoop();
        this.save();
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        sfx.bubble();
        this.newRun();
        return;
      case 'continue':
        this.screen = r?.brew ? 'brew' : 'day';
        this.render();
        return;
      case 'unlock':
        if (unlock(this.meta, d.id!)) {
          saveMeta(this.meta);
          sfx.coin();
          this.toast(`${UNLOCKS[d.id!].icon} ${UNLOCKS[d.id!].name} unlocked.`);
        }
        this.render();
        return;
    }
    if (!r) return;
    switch (act) {
      case 'accept':
        if (accept(r, +d.id!)) sfx.coin();
        break;
      case 'deliver': {
        const o = r.active.find((x) => x.id === +d.id!);
        if (!o) return;
        const pay = deliver(r, o.id, potionFor(r, o));
        if (pay) {
          sfx.sale();
          this.float(`+${pay}💰  ⭐+${o.grand ? 6 : 1}`, 'var(--gold)', el);
        }
        break;
      }
      case 'sell': {
        const v = sellPotion(r, +d.i!);
        if (v) {
          sfx.coin();
          this.float(`+${v}💰`, 'var(--gold)', el);
        }
        break;
      }
      case 'brew':
        this.goBrew(null);
        return;
      case 'brew-for':
        this.goBrew(+d.id!);
        return;
      case 'base':
        this.startBase(d.id as MapId);
        return;
      case 'market':
        this.screen = 'market';
        break;
      case 'gather':
        this.trip = null;
        this.screen = 'gather';
        break;
      case 'go': {
        const res = gather(r, d.id!);
        if (res) {
          this.trip = { place: d.id!, res };
          if (res.bad) sfx.deny();
          else sfx.item();
        }
        break;
      }
      case 'back':
        this.trip = null;
        this.screen = 'day';
        break;
      case 'buy':
        if (buy(r, d.id!)) sfx.coin();
        else sfx.deny();
        break;
      case 'buy-salt':
        if (buy(r, d.id!, true)) sfx.coin();
        else sfx.deny();
        break;
      case 'end-day':
        this.endTheDay();
        return;
      case 'morning':
        this.screen = 'day';
        sfx.bubble();
        break;
      case 'select':
        this.selected = this.selected === d.id ? null : d.id!;
        this.hover = null;
        sfx.tick();
        this.refreshBrew(true);
        return;
      case 'add':
        this.addSelected();
        return;
      case 'salt':
        if (brewSalt(r, d.id!)) {
          sfx.salt();
          if (r.brew?.ruined) return this.onRuin();
        } else {
          sfx.deny();
          this.toast(SALTS[d.id!].rot ? 'Turn salts need a queued path. Add an ingredient first.' : 'That salt does nothing now.');
        }
        this.save();
        this.refreshBrew(true);
        return;
      case 'bottle':
        this.doBottle();
        return;
      case 'ruin-ok':
        this.finishRuin();
        return;
      case 'abandon-brew':
        dropBrew(r);
        this.stopLoop();
        this.screen = 'day';
        sfx.deny();
        break;
      default:
        return;
    }
    this.save();
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      if (e.key !== 'Escape') return;
    }
    const k = e.key;
    if (k === 'Escape') {
      if (this.modal) this.modal = null;
      else if (this.run && this.screen !== 'title' && this.screen !== 'end') this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.modal) return;
    const r = this.run;
    if (this.screen === 'brew' && r?.brew) {
      const b = r.brew;
      if (b.ruined) {
        if (k === 'Enter' || k === ' ') this.finishRuin();
        return;
      }
      if ((k === 's' || k === 'S') && !e.repeat) this.hold('stir');
      else if ((k === 'w' || k === 'W') && !e.repeat) this.hold('water');
      else if (k === 'a' || k === 'A' || k === 'Enter') this.addSelected();
      else if (k === 'b' || k === 'B') this.doBottle();
      else if (/^[1-9]$/.test(k)) {
        const ids = Object.entries(r.inv).filter(([, n]) => n > 0).map(([id]) => id);
        const id = ids[+k - 1];
        if (id) this.action('select', { id });
      } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const i = GRINDS.indexOf(this.grind) + (k === 'ArrowLeft' ? -1 : 1);
        this.grind = GRINDS[Math.max(0, Math.min(3, i))];
        this.refreshBrew(true);
      }
      return;
    }
    if (this.screen === 'day' && r) {
      if (k === 'b' || k === 'B') this.goBrew(null);
      else if (k === 'm' || k === 'M') this.action('market', {});
      else if (k === 'g' || k === 'G') this.action('gather', {});
      else if (k === 'e' || k === 'E') this.endTheDay();
    } else if (this.screen === 'night' && (k === 'Enter' || k === ' ')) this.action('morning', {});
    else if ((this.screen === 'market' || this.screen === 'gather') && (k === 'Backspace' || k === 'Enter')) this.action('back', {});
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        day: this.run?.day,
        hours: this.run?.hours,
        gold: this.run?.gold,
        rep: this.run?.rep,
        rival: this.run?.rivalRep,
        active: this.run?.active.map((o) => `${o.effect}${o.strength} due${o.due}`) ?? null,
        potions: this.run?.potions.map((p: Potion) => `${p.effect}${p.strength}`) ?? null,
        brew: this.run?.brew ? { map: this.run.brew.map, pos: this.run.brew.pos, queue: this.run.brew.queue.length, ruined: this.run.brew.ruined } : null,
        plan: this.botPlan?.length ?? null,
        end: this.end ? { win: this.end.win, score: this.end.score, reason: this.end.reason } : null,
        debts: DEBTS,
      }),
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.render();
      },
      seals: (n: number) => {
        this.meta.seals += n;
        saveMeta(this.meta);
        this.render();
      },
      step: () => this.botStep(),
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }

  private botStep(): string {
    if (performance.now() < this.busyUntil || this.auto) return 'busy';
    if (this.modal) {
      this.action('modal-close', {});
      return 'modal';
    }
    const r = this.run;
    switch (this.screen) {
      case 'title':
        this.action(r ? 'continue' : 'new', {});
        return 'start';
      case 'end':
        return 'end';
      case 'night':
        this.action('morning', {});
        return 'morning';
      case 'market':
      case 'gather':
        this.action('back', {});
        return 'back';
    }
    if (!r) return 'none';
    if (this.screen === 'brew') {
      const b = r.brew;
      if (!b) {
        this.action('back', {});
        return 'back';
      }
      if (b.ruined) {
        this.finishRuin();
        return 'ruined';
      }
      const step = this.botPlan?.shift();
      if (!step) {
        this.botPlan = null;
        this.action('abandon-brew', {});
        return 'no-plan';
      }
      switch (step.t) {
        case 'add':
          this.selected = step.id;
          this.grind = step.grind;
          this.addSelected();
          return 'add';
        case 'salt':
          this.action('salt', { id: step.id });
          return 'salt';
        case 'bottle':
          this.botPlan = null;
          if (canBottle(b)) this.doBottle();
          else this.action('abandon-brew', {});
          return 'bottle';
        case 'stir':
        case 'water': {
          const amount = step.t === 'stir' ? (step.d >= FULL ? queueLength(b) : step.d) : step.n * 5;
          if (FAST) {
            if (step.t === 'stir') stir(b, amount);
            else pourWater(b, step.n);
            if (b.ruined) this.onRuin();
            else this.refreshBrew(true);
          } else {
            this.auto = { kind: step.t, left: amount };
            this.startLoop();
          }
          return step.t;
        }
      }
    }
    // Day screen: one smart bot action.
    const act = smartNext(r);
    switch (act.t) {
      case 'deliver':
        this.action('deliver', { id: String(act.order) });
        return 'deliver';
      case 'accept':
        this.action('accept', { id: String(act.order) });
        return 'accept';
      case 'sell':
        this.action('sell', { i: String(act.potion) });
        return 'sell';
      case 'gather':
        this.action('gather', {});
        this.action('go', { id: act.place });
        return 'gather';
      case 'end':
        this.endTheDay();
        return 'end-day';
      case 'brew': {
        for (const id of toBuy(r, act.sol)) buy(r, id);
        this.botPlan = [...act.sol.plan];
        this.pendingOrder = act.order;
        this.screen = 'brew';
        startBrew(r, act.map, act.order);
        this.ruinShown = false;
        this.render();
        return 'brew';
      }
    }
    return 'none';
  }
}
