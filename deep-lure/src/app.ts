import { botEvent, botPort, botSea, botStow, newMem, type BotMem } from './bot';
import {
  CURSES,
  DEBT,
  EVENTS,
  FISH,
  FISH_BY_ID,
  GEAR,
  GEAR_CATS,
  LAST_DAY,
  LURES,
  NIGHT_START,
  PATTERN_TEXT,
  PORTS,
  REGIONS,
  gearStat,
  type GearCat,
} from './data';
import {
  KIT_COST,
  REPAIR_COST,
  aberrantChance,
  autoStow,
  buyGear,
  buyKit,
  buyLure,
  canFish,
  cast,
  clockText,
  demandFish,
  dock,
  dockHere,
  equipLure,
  eventChoice,
  finishReel,
  freshness,
  holdSize,
  isNight,
  liftItem,
  maxHull,
  newRun,
  pay,
  price,
  repair,
  rodDepth,
  sell,
  sellAll,
  setSail,
  shopFor,
  sleep,
  species,
  speedOf,
  stowPending,
  tickSea,
  useKit,
  type Input,
  type Run,
  type SeaEvent,
} from './game';
import { cellCount, fishCells, fits, itemCells, usedCells } from './hold';
import { botReel, stepReel, type Reel } from './reel';
import { drawMinimap, drawReel, drawSea, newFx, type Fx, type View } from './render';
import { randomSeedText } from './rng';
import { UNLOCKS, clearRun, loadMeta, loadRun, saveMeta, saveRun, startGear } from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';
import { makeWorld, regionAt, type World } from './world';


type Screen = 'title' | 'sea' | 'port' | 'end';
type Modal =
  | { kind: 'help' }
  | { kind: 'menu'; confirm: boolean }
  | { kind: 'hold'; rot: number; hover: { x: number; y: number } | null; title: string }
  | { kind: 'event'; id: string; result: string | null }
  | { kind: 'msg'; title: string; text: string; icon: string }
  | { kind: 'journal' };

const PARAMS = new URLSearchParams(location.search);
const FAST = PARAMS.has('fast');
const DT = 1 / 60;

const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class App {
  private run: Run | null = loadRun();
  private world: World | null = null;
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private reel: Reel | null = null;
  private reelHeld = false;
  private keys = new Set<string>();
  private pointer: { id: number; x: number; y: number } | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private view: View = { cx: 0, cy: 0, scale: 1, w: 300, h: 300 };
  private fx: Fx = newFx();
  private time = 0;
  private last = 0;
  private acc = 0;
  private raf = 0;
  private shake = 0;
  private hudKey = '';
  private actKey = '';
  private hudTimer = 0;
  private saveTimer = 0;
  private lockMsgAt = -10;
  private wakeT = 0;
  private bot: BotMem = newMem('good');
  private toPortAfterModal = false;
  private endInfo: { newSpecies: number } = { newSpecies: 0 };

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    if (this.run) this.world = makeWorld(this.run.seed);
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointermove', (e) => this.onHover(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.reelHeld = false;
    });
    window.addEventListener('resize', () => this.resize());
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
      case 'sea':
        body = `<div class="sea-wrap"><canvas id="cv"></canvas></div><div class="actions" id="actions">${this.actionsView()}</div>`;
        break;
      case 'port':
        body = this.portView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    this.root.className = `sc-${this.screen}`;
    const top = this.run && (this.screen === 'sea' || this.screen === 'port') ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    this.hudKey = '';
    this.actKey = '';
    if (this.screen === 'sea') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.resize();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
    }
  }

  /** Update the HUD parts without a full render. */
  private refreshHud(): void {
    if (!this.run) return;
    const top = this.root.querySelector<HTMLElement>('header.top');
    const t = this.topBar();
    if (top && t !== this.hudKey) {
      top.outerHTML = t;
      this.hudKey = t;
    }
    const act = this.root.querySelector<HTMLElement>('#actions');
    if (act) {
      const a = this.actionsView();
      if (a !== this.actKey) {
        act.innerHTML = a;
        this.actKey = a;
      }
    }
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const hull = Array.from({ length: maxHull(r) }, (_, i) => `<i class="${i < r.boat.hull ? 'on' : ''}"></i>`).join('');
    const night = isNight(r);
    const late = !night && r.minute >= NIGHT_START - 120;
    const panic = Math.min(100, r.panic);
    return `<header class="top">
      <span title="Day">📅 <b>${r.day}</b>/${LAST_DAY}</span>
      <span class="${night ? 'bad' : late ? 'warn' : ''}" title="Clock">${night ? '🌙' : '☀️'} ${clockText(r.minute)}</span>
      <span title="Coins">💰 ${fmt(r.money)}</span>
      <span title="Boat debt" class="debt">🏦 ${fmt(r.debt)}</span>
      <span class="hull" title="Hull">${hull}</span>
      <span class="panic" title="Panic ${Math.round(panic)}"><span>😱</span><span class="pbar"><span style="width:${panic}%"></span></span></span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private actionsView(): string {
    const r = this.run;
    if (!r || !this.world) return '';
    if (this.reel) {
      if (this.reel.wait > 0) return `<div class="reel-msg">Waiting for a bite…</div>`;
      return `<button class="primary reel-btn ${this.reelHeld ? 'held' : ''}" data-hold="reel">🎣 Hold to reel <small>(Space)</small></button>`;
    }
    const cf = canFish(r, this.world);
    const dk = dockHere(r);
    const { w, h } = holdSize(r);
    const used = usedCells(r.hold);
    const fishBtn = cf.spot >= 0 ? `<button class="${cf.why ? '' : 'primary'}" data-act="cast" ${cf.why ? 'disabled' : ''}>🎣 ${cf.why ?? 'Cast'} <small>F</small></button>` : '';
    const dockBtn = dk >= 0 ? `<button class="primary" data-act="dock">⚓ Dock at ${PORTS[dk].name} <small>E</small></button>` : '';
    const hint = !fishBtn && !dockBtn ? `<span class="hint">${this.hintText()}</span>` : '';
    return `${fishBtn}${dockBtn}${hint}
      <span class="grow"></span>
      <button data-act="hold" title="Hold">📦 ${used}/${w * h} <small>H</small></button>
      ${r.gear.kits ? `<button data-act="kit" ${r.boat.hull >= maxHull(r) ? 'disabled' : ''} title="Repair kit">🧰 ${r.gear.kits}</button>` : ''}`;
  }

  private hintText(): string {
    const r = this.run!;
    const reg = REGIONS[regionAt(this.world!, r.boat.x, r.boat.y)].name;
    if (isNight(r)) return `${reg} · Night. Get to a port.`;
    if (r.minute >= NIGHT_START - 120) return `${reg} · Dusk soon. Head for port.`;
    return `${reg} · Steer: drag / WASD`;
  }

  // ---------- Title ----------

  private titleView(): string {
    const m = this.meta;
    const cont = this.run ? `<button class="primary" data-act="continue">Continue (day ${this.run.day})</button>` : '';
    const unlocks = UNLOCKS.map((u) => {
      const own = m.unlocks.includes(u.id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${u.icon}</span><span><b>${u.name}</b><small>${u.text}</small></span>
        ${own ? '<span class="good">Owned</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.pearls < u.cost ? 'disabled' : ''}>🦪 ${u.cost}</button>`}</div>`;
    }).join('');
    return `<div class="title">
      <div class="logo">🎣</div>
      <h1>Deep Lure</h1>
      <p class="sub">You owe the bank ${fmt(DEBT)} coins for your boat. You have ${LAST_DAY} days. Fish by day, sell in port, and stay out of the dark. Some fish are wrong.</p>
      <div class="row">${cont}<button class="${this.run ? '' : 'primary'}" data-act="new">New run</button><button data-act="help">How to play</button><button data-act="journal">📖 Journal</button></div>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best score ${fmt(m.best)} · Species ${m.journal.length}/${FISH.length} · 🦪 ${m.pearls} pearls</p>
      <h3>Dockyard <small class="dim">(pearls from past runs)</small></h3>
      <div class="armory">${unlocks}</div>
    </div>`;
  }

  // ---------- Port ----------

  private portView(): string {
    const r = this.run!;
    const p = PORTS[r.docked];
    const want = FISH_BY_ID[demandFish(r, r.docked)];
    const items = [...r.hold].sort((a, b) => price(r, b, r.docked) - price(r, a, r.docked));
    const total = items.reduce((a, it) => a + price(r, it, r.docked), 0);
    const market = items.length
      ? items
          .map((it) => {
            const f = FISH_BY_ID[it.fish];
            const fr = freshness(r, it);
            return `<div class="li"><span class="ico" style="--c:${f.color}">${f.icon}</span><span class="grow"><b class="${it.aberrant ? 'aber' : ''}">${esc(it.name)}</b><small>${fr < 1 ? `${Math.round(fr * 100)}% fresh` : 'fresh'}${it.curse ? ` · ${CURSES[it.curse].name}` : ''}${demandFish(r, r.docked) === it.fish ? ' · <span class="good">wanted</span>' : ''}</small></span>
              <button data-act="sell" data-uid="${it.uid}">💰 ${price(r, it, r.docked)}</button></div>`;
          })
          .join('')
      : '<p class="dim">The hold is empty.</p>';
    const shop = shopFor(r);
    const gear = GEAR_CATS.map((cat) => {
      const tier = r.gear[cat];
      const offers = shop
        .filter((s) => s.cat === cat)
        .map(
          (s) =>
            `<button class="offer" data-act="buy" data-cat="${cat}" data-tier="${s.tier}" ${r.money < s.cost ? 'disabled' : ''}><b>${GEAR[cat].tiers[s.tier].name}</b><small>${gearStat(cat, s.tier)}</small><span class="cost">💰 ${fmt(s.cost)}</span></button>`,
        )
        .join('');
      return `<div class="gear"><div class="li"><span class="ico">${GEAR[cat].icon}</span><span class="grow"><b>${GEAR[cat].tiers[tier].name}</b><small>${gearStat(cat, tier)}</small></span></div>${offers}</div>`;
    }).join('');
    const needHull = maxHull(r) - r.boat.hull;
    const lures = LURES.map((l) => {
      const own = r.gear.lures.includes(l.id);
      if (own)
        return `<button class="offer ${r.gear.lure === l.id ? 'eq' : ''}" data-act="lure-eq" data-id="${l.id}"><b>${l.icon} ${l.name}</b><small>${l.text}</small><span>${r.gear.lure === l.id ? '✔ Equipped' : 'Equip'}</span></button>`;
      if (!p.lures) return '';
      return `<button class="offer" data-act="lure-buy" data-id="${l.id}" ${r.money < l.cost ? 'disabled' : ''}><b>${l.icon} ${l.name}</b><small>${l.text}</small><span class="cost">💰 ${l.cost}</span></button>`;
    }).join('');
    const harbor = p.home
      ? `<section class="card"><h3>🏦 Harbormaster</h3><p>Boat debt: <b class="bad">${fmt(r.debt)}</b>. Pay it all by the end of day ${LAST_DAY}.</p>
        <div class="row"><button data-act="pay" data-n="100" ${r.money < 1 ? 'disabled' : ''}>Pay 100</button><button data-act="pay" data-n="500" ${r.money < 1 ? 'disabled' : ''}>Pay 500</button><button class="primary" data-act="pay" data-n="all" ${r.money < 1 ? 'disabled' : ''}>Pay ${fmt(Math.min(r.money, r.debt))}</button></div></section>`
      : `<section class="card dim-card"><h3>🏦 Harbormaster</h3><p class="dim">Pay the debt in Greyharbor.</p></section>`;
    const late = r.minute >= 1020;
    return `<div class="port">
      <h2>⚓ ${p.name} <small>${REGIONS.find((x) => x.id === p.region)!.name}</small></h2>
      <p class="sub">Wanted today: ${want.icon} ${want.name} (+50%). ${p.aberrant > 2.5 ? `This port pays extra for aberrant fish (×${p.aberrant}).` : ''}</p>
      <div class="row">
        <button class="primary" data-act="sail">⛵ Set sail</button>
        <button class="${late ? 'primary' : ''}" data-act="sleep">🛏️ Sleep until dawn</button>
        <button data-act="hold">📦 Hold</button>
      </div>
      <div class="port-grid">
        <section class="card"><h3>🐟 Market <small>${items.length ? `${fmt(total)} total` : ''}</small></h3>${items.length ? `<button class="primary wide" data-act="sell-all">Sell all for 💰 ${fmt(total)}</button>` : ''}<div class="list">${market}</div></section>
        ${harbor}
        <section class="card"><h3>🔧 Shipwright</h3>
          <div class="row"><button data-act="repair" ${needHull <= 0 || r.money < REPAIR_COST ? 'disabled' : ''}>Repair hull (${needHull}) · 💰 ${REPAIR_COST} each</button>
          <button data-act="kit" ${r.gear.kits >= 2 || r.money < KIT_COST ? 'disabled' : ''}>🧰 Repair kit ${r.gear.kits}/2 · 💰 ${KIT_COST}</button></div>
          <div class="gears">${gear}</div></section>
        <section class="card"><h3>🪝 Lures ${p.lures ? '' : '<small>(buy them in Kelpmoor or Cinder Pier)</small>'}</h3><div class="gears">${lures}</div></section>
      </div>
    </div>`;
  }

  // ---------- End ----------

  private endView(): string {
    const r = this.run!;
    const o = r.over!;
    return `<div class="end">
      <div class="logo">${o.victory ? '🏆' : '🌊'}</div>
      <h1 class="${o.victory ? 'good' : 'bad'}">${o.victory ? 'The boat is yours' : 'The bank takes the boat'}</h1>
      <p class="sub">${esc(o.reason)}</p>
      <p class="score">Score <b>${fmt(o.score)}</b> · 🦪 +${o.pearls} pearls</p>
      <p class="stats">Day ${Math.min(r.day, LAST_DAY)} · Paid ${fmt(r.debtStart - r.debt)} of ${fmt(r.debtStart)} · Fish caught ${r.stats.fish} (${r.stats.aberrant} aberrant) · Species ${species(r)} · Earned ${fmt(r.stats.earned)} · Sank ${r.stats.sank}×${this.endInfo.newSpecies ? ` · ${this.endInfo.newSpecies} new in the journal` : ''}</p>
      <div class="row"><button class="primary" data-act="new">New run</button><button data-act="title">Title</button></div>
    </div>`;
  }

  // ---------- Modals ----------

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help')
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Goal:</b> pay ${fmt(DEBT)} coins of boat debt at the Greyharbor harbormaster before day ${LAST_DAY} ends.</li>
          <li><b>Sail:</b> hold the mouse or a finger on the sea to steer toward it. Keys: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows. The boat drifts, so slow down early. Hitting rocks fast cracks the hull.</li>
          <li><b>Time</b> passes fast with the engine on, slowly when you drift, and 40 minutes per cast. Night starts at 20:00.</li>
          <li><b>Fish:</b> stop on a ripple spot and press <kbd>F</kbd> / Cast. ▾ marks show the water depth. Your rod must reach that depth for the deep fish.</li>
          <li><b>Reel:</b> hold <kbd>Space</kbd>, the mouse or the reel button to raise the tension. Let go to lower it. Keep the marker in the green zone to pull the fish in. In the red zone the line strains and can snap.</li>
          <li><b>Hold:</b> each fish has a shape. Place it in the grid (tap a cell, <kbd>R</kbd> rotates). Tap a stored fish to move it. Fish lose 20% value per day.</li>
          <li><b>Night:</b> panic rises in the dark. A better lamp keeps it lower. High panic brings shades that ram the hull, phantom rocks and strange visitors. Ports calm you down.</li>
          <li><b>Aberrant fish</b> (👁️) sell for much more but carry a curse while they are in the hold.</li>
          <li><b>Regions:</b> thick fog blocks new regions. A rare fish from an open region shows the way: Pearl Carp → Coral Teeth, Golden Grouper → Ashen Flats, Crown Turtle or Ember Koi → The Trench.</li>
          <li><b>Ports:</b> sell fish, repair, buy gear and lures, and sleep. If the boat sinks you lose the cargo, pay 150 for the tow (added to the debt) and lose the night.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    if (m.kind === 'menu') {
      if (m.confirm)
        return `<div class="modal" data-act="modal-close"><div class="sheet small" data-stop><h2>Abandon this run?</h2><p>The run ends now and counts as a loss.</p>
          <div class="row"><button class="danger" data-act="abandon-yes">Abandon</button><button data-act="modal-close">Cancel</button></div></div></div>`;
      return `<div class="modal" data-act="modal-close"><div class="sheet small" data-stop><h2>Menu</h2>
        <button class="primary" data-act="modal-close">Resume</button>
        <button data-act="help">How to play</button>
        <button data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
        <button data-act="abandon">Abandon run</button>
        <button data-act="title">Save and quit to title</button>
      </div></div>`;
    }
    if (m.kind === 'msg')
      return `<div class="modal"><div class="sheet small center" data-stop><div class="logo">${m.icon}</div><h2>${m.title}</h2><p>${m.text}</p><button class="primary" data-act="modal-close">Continue</button></div></div>`;
    if (m.kind === 'event') {
      const e = EVENTS.find((x) => x.id === m.id)!;
      const body = m.result
        ? `<p class="result">${esc(m.result)}</p><button class="primary" data-act="modal-close">Continue</button>`
        : `<div class="opts">${e.opts.map((o, i) => `<button data-act="event-opt" data-i="${i}">${o}</button>`).join('')}</div>`;
      return `<div class="modal"><div class="sheet small center ev" data-stop><div class="logo">${e.icon}</div><h2>${e.title}</h2><p>${e.text}</p>${body}</div></div>`;
    }
    if (m.kind === 'journal') {
      const cells = FISH.map((f) => {
        const known = this.meta.journal.includes(f.id);
        return `<div class="jf ${known ? '' : 'unk'}" title="${known ? `${f.name}: ${f.value} coins, ${PATTERN_TEXT[f.pattern]}` : 'Unknown'}"><span>${known ? f.icon : '❔'}</span><small>${known ? f.name : '???'}</small><small class="dim">${REGIONS.find((r) => r.id === f.region)!.name}</small></div>`;
      }).join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop><h2>📖 Journal <small>${this.meta.journal.length}/${FISH.length}</small></h2><div class="journal">${cells}</div><button class="primary" data-act="modal-close">Close</button></div></div>`;
    }
    return this.holdView(m);
  }

  private holdView(m: Extract<Modal, { kind: 'hold' }>): string {
    const r = this.run!;
    const { w, h } = holdSize(r);
    const cs = Math.max(26, Math.min(46, Math.floor((Math.min(window.innerWidth, 640) - 70) / w)));
    const p = r.pending;
    let grid = '';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid += `<div class="gcell" data-act="cell" data-x="${x}" data-y="${y}" style="left:${x * cs}px;top:${y * cs}px;width:${cs}px;height:${cs}px"></div>`;
    for (const it of r.hold) {
      const f = FISH_BY_ID[it.fish];
      itemCells(it).forEach(([x, y], k) => {
        grid += `<div class="fcell ${it.aberrant ? 'aber' : ''}" data-act="lift" data-uid="${it.uid}" data-x="${x}" data-y="${y}" title="${esc(it.name)}" style="left:${x * cs}px;top:${y * cs}px;width:${cs}px;height:${cs}px;--c:${f.color}">${k === 0 ? f.icon : ''}</div>`;
      });
    }
    if (p && m.hover) {
      const ok = fits(r.hold, w, h, p.fish, m.rot, m.hover.x, m.hover.y);
      for (const [cx, cy] of fishCells(p.fish, m.rot)) {
        const x = cx + m.hover.x;
        const y = cy + m.hover.y;
        if (x < w && y < h) grid += `<div class="ghost ${ok ? 'ok' : 'no'}" style="left:${x * cs}px;top:${y * cs}px;width:${cs}px;height:${cs}px"></div>`;
      }
    }
    let carry = '';
    if (p) {
      const f = FISH_BY_ID[p.fish];
      const cells = fishCells(p.fish, m.rot);
      const pw = Math.max(...cells.map((c) => c[0])) + 1;
      const ph = Math.max(...cells.map((c) => c[1])) + 1;
      const mini = cells.map(([x, y]) => `<i style="left:${x * 18}px;top:${y * 18}px;--c:${f.color}" class="${p.aberrant ? 'aber' : ''}"></i>`).join('');
      carry = `<div class="carry">
        <div class="mini" style="width:${pw * 18}px;height:${ph * 18}px">${mini}</div>
        <div class="grow"><b class="${p.aberrant ? 'aber' : ''}">${f.icon} ${esc(p.name)}</b><small>Base value ${f.value * (p.aberrant ? 2 : 1)}${p.aberrant ? '+' : ''} · ${cellCount(p.fish)} cells${p.curse ? ` · <span class="aber">${CURSES[p.curse].name}: ${CURSES[p.curse].text}</span>` : ''}</small></div>
      </div>
      <div class="row"><button data-act="rotate">↻ Rotate <small>R</small></button><button data-act="auto">Auto place <small>A</small></button><button class="danger" data-act="release">Throw back <small>X</small></button></div>
      <p class="hint">Tap a cell to place the fish (the cell is its top-left corner).</p>`;
    } else carry = `<p class="hint">Tap a fish to pick it up and move it. Fish lose 20% of their value each day.</p>`;
    const list = r.hold.length
      ? `<div class="chips">${r.hold.map((it) => `<span class="chip ${it.aberrant ? 'aber' : ''}" title="${it.curse ? CURSES[it.curse].text : ''}">${FISH_BY_ID[it.fish].icon} ${esc(it.name)}${it.curse ? ' 👁️' : ''}</span>`).join('')}</div>`
      : '';
    return `<div class="modal"><div class="sheet hold-sheet" data-stop>
      <h2>${m.title} <small>${usedCells(r.hold)}/${w * h} cells</small></h2>
      ${carry}
      <div class="hold" style="width:${w * cs}px;height:${h * cs}px">${grid}</div>
      ${list}
      <div class="row">${p ? '' : `<button class="primary" data-act="modal-close">Done</button>`}${!p && r.hold.length && this.screen === 'sea' ? '<span class="hint">Tap a fish, then Throw back to free space.</span>' : ''}</div>
    </div></div>`;
  }

  // ---------- Loop ----------

  private resize(): void {
    if (!this.canvas) return;
    const wrap = this.canvas.parentElement!;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.view.w = w;
    this.view.h = h;
    this.view.scale = Math.max(0.6, Math.min(1.25, Math.min(w, h) / 560));
  }

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const loop = (now: number): void => {
      if (this.screen !== 'sea' || !this.canvas) return;
      const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private input(): Input {
    const k = this.keys;
    const up = k.has('w') || k.has('arrowup');
    const down = k.has('s') || k.has('arrowdown');
    const left = k.has('a') || k.has('arrowleft');
    const right = k.has('d') || k.has('arrowright');
    if (up || down || left || right) return { throttle: up ? 1 : down ? -0.5 : 0, steer: left ? -1 : right ? 1 : 0 };
    if (this.pointer && this.canvas && this.run) {
      const b = this.run.boat;
      const rect = this.canvas.getBoundingClientRect();
      const wx = this.view.cx + (this.pointer.x - rect.left - this.view.w / 2) / this.view.scale;
      const wy = this.view.cy + (this.pointer.y - rect.top - this.view.h / 2) / this.view.scale;
      const d = Math.hypot(wx - b.x, wy - b.y);
      let diff = Math.atan2(wy - b.y, wx - b.x) - b.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.5));
      const throttle = d < 30 ? 0 : Math.min(1, d / 120) * (Math.abs(diff) > 1.6 ? 0.3 : 1);
      return { throttle, steer };
    }
    return { throttle: 0, steer: 0 };
  }

  private frame(dt: number): void {
    const r = this.run!;
    this.time += dt;
    const paused = !!this.modal;
    if (!paused) {
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        this.simStep(DT, null);
        if (this.modal || this.screen !== 'sea') break;
      }
    } else this.acc = 0;
    if (this.screen !== 'sea' || !this.ctx) return;
    // Effects.
    for (const f of this.fx.floats) f.t += dt / 1.4;
    for (const g of this.fx.rings) g.t += dt / 0.8;
    for (const p of this.fx.wake) p.t += dt / 1.6;
    this.fx.floats = this.fx.floats.filter((f) => f.t < 1);
    this.fx.rings = this.fx.rings.filter((f) => f.t < 1);
    this.fx.wake = this.fx.wake.filter((f) => f.t < 1);
    const sp = speedOf(r.boat);
    this.wakeT -= dt;
    if (sp > 15 && this.wakeT <= 0 && !paused) {
      this.wakeT = 0.05;
      this.fx.wake.push({ x: r.boat.x - Math.cos(r.boat.heading) * 15, y: r.boat.y - Math.sin(r.boat.heading) * 15, t: 0 });
    }
    this.shake = Math.max(0, this.shake - dt * 20);
    const wob = r.panic > 60 ? Math.sin(this.time * 1.7) * (r.panic - 60) * 0.15 : 0;
    this.view.cx = r.boat.x + (Math.random() - 0.5) * this.shake + wob;
    this.view.cy = r.boat.y + (Math.random() - 0.5) * this.shake;
    const ctx = this.ctx;
    const fishable = this.reel ? -1 : canFish(r, this.world!).spot;
    drawSea(ctx, r, this.world!, this.view, this.time, this.fx, fishable);
    const mw = Math.min(150, this.view.w * 0.3);
    drawMinimap(ctx, r, this.world!, this.view.w - mw - 10, 10, mw);
    if (this.reel) drawReel(ctx, this.reel, this.view.w, this.view.h, this.time);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.15;
      this.refreshHud();
    }
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 5;
      saveRun(r);
    }
  }

  /** One fixed step at sea: either sail or reel. `bot` overrides the input. */
  private simStep(dt: number, bot: { inp: Input; reel: boolean } | null): void {
    const r = this.run!;
    if (this.reel) {
      const before = this.reel.wait;
      const held = bot ? bot.reel : this.reelHeld;
      const res = stepReel(this.reel, held, dt);
      if (before > 0 && this.reel.wait <= 0) {
        sfx.bite();
        this.refreshHud();
      }
      if (this.reel.wait <= 0 && !bot) {
        if (held && Math.random() < 0.25) sfx.reel(this.reel.tension);
        if (this.reel.tension > this.reel.hi && Math.random() < 0.15) sfx.strain();
      }
      if (res) this.endReel();
      return;
    }
    const ev = tickSea(r, this.world!, bot ? bot.inp : this.input(), dt);
    if (ev.length) this.handle(ev);
    if (!this.modal && r.pending) this.openHold('Stow your catch');
    else if (!this.modal && r.event) this.modal = { kind: 'event', id: r.event, result: null };
    if (this.modal && this.screen === 'sea') this.render();
  }

  private float(x: number, y: number, text: string, color: string): void {
    // Stack new texts above the ones that are still close by.
    const near = this.fx.floats.filter((f) => f.t < 0.6 && Math.abs(f.x - x) < 80 && Math.abs(f.y - y) < 60).length;
    this.fx.floats.push({ x, y: y - near * 18, text, color, t: 0 });
  }

  private handle(ev: SeaEvent[]): void {
    const r = this.run!;
    for (const e of ev) {
      switch (e.k) {
        case 'bump':
          if (e.dmg) {
            sfx.bump();
            this.shake = 14;
            this.float(e.x, e.y, '-1 hull', '#ef476f');
          } else sfx.thud();
          this.fx.rings.push({ x: e.x, y: e.y, t: 0, max: 30, color: '#fff' });
          break;
        case 'shade':
          sfx.shade();
          this.shake = 18;
          this.float(r.boat.x, r.boat.y - 20, '-1 hull  +10 panic', '#ff4d6d');
          break;
        case 'banish':
          sfx.banish();
          this.fx.rings.push({ x: e.x, y: e.y, t: 0, max: 40, color: '#ffd166' });
          break;
        case 'locked':
          if (this.time - this.lockMsgAt > 3) {
            this.lockMsgAt = this.time;
            const reg = REGIONS[e.region];
            this.toast(`Thick fog turns you back. Land a ${FISH_BY_ID[reg.key!].name} to find a way into ${reg.name}.`);
          }
          break;
        case 'dawn':
          sfx.dawn();
          if (!r.over) this.toast(`☀️ Day ${r.day} of ${LAST_DAY}. ${r.day === LAST_DAY ? 'Last day!' : ''}`);
          break;
        case 'night':
          sfx.night();
          this.toast('🌙 Night falls. Panic rises in the dark.');
          break;
        case 'event':
          sfx.whisper();
          break;
        case 'ram':
          sfx.bump();
          this.shake = 16;
          this.toast(e.why);
          break;
        case 'gnaw':
          this.toast(`👁️ ${e.text}`);
          break;
        case 'phantom':
          sfx.whisper();
          break;
        case 'sink':
          sfx.lose();
          this.reel = null;
          this.modal = { kind: 'msg', icon: '🌊', title: 'Your boat sank', text: 'The cargo is gone. A tug tows you back to Greyharbor. The tow costs 150 coins (added to the debt). You wake up the next morning.' };
          this.toPortAfterModal = true;
          break;
      }
    }
    if (r.over) this.goEnd();
  }

  // ---------- Fishing ----------

  private doCast(): void {
    const r = this.run!;
    const cf = canFish(r, this.world!);
    if (cf.spot < 0 || cf.why) {
      sfx.deny();
      if (cf.why) this.toast(cf.why);
      return;
    }
    const ev: SeaEvent[] = [];
    const reel = cast(r, this.world!, cf.spot, ev);
    sfx.cast();
    const sp = this.world!.spots[cf.spot];
    this.fx.rings.push({ x: sp.x, y: sp.y, t: 0, max: 40, color: '#8be9fd' });
    this.handle(ev);
    if (!reel || r.over) {
      this.refreshHud();
      return;
    }
    if (FAST) reel.wait = 0;
    this.reel = reel;
    this.reelHeld = false;
    this.refreshHud();
  }

  private endReel(): void {
    const r = this.run!;
    const reel = this.reel!;
    this.reel = null;
    this.reelHeld = false;
    const res = finishReel(r, reel);
    const b = r.boat;
    if (reel.result === 'caught') {
      const f = FISH_BY_ID[reel.fish];
      if (f.weight < 1 || reel.aberrant) sfx.rare();
      else sfx.catch();
      this.float(b.x, b.y - 24, `${f.icon} ${r.pending?.name ?? f.name}`, reel.aberrant ? '#c77dff' : '#ffd166');
      if (!this.meta.journal.includes(f.id)) {
        this.meta.journal.push(f.id);
        this.endInfo.newSpecies++;
        saveMeta(this.meta);
        this.toast(`📖 New species: ${f.name}!`);
      }
      if (res.unlocked >= 0) {
        const reg = REGIONS[res.unlocked];
        this.modal = { kind: 'msg', icon: f.icon, title: `${reg.name} opens`, text: `The ${f.name} glows and points through the fog. The way into ${reg.name} is open.` };
      }
    } else {
      if (reel.result === 'broke') sfx.snap();
      else sfx.lost();
      this.float(b.x, b.y - 24, reel.result === 'broke' ? 'Snap!' : 'Got away', '#ef476f');
      this.toast(res.msg);
    }
    saveRun(r);
    if (!this.modal && r.pending) this.openHold('Stow your catch');
    this.refreshHud();
    if (this.modal) this.render();
  }

  private openHold(title: string): void {
    this.modal = { kind: 'hold', rot: 0, hover: null, title };
  }

  private goEnd(): void {
    const r = this.run!;
    const o = r.over!;
    cancelAnimationFrame(this.raf);
    this.reel = null;
    this.modal = null;
    if (o.victory) {
      this.meta.wins++;
      sfx.win();
    } else sfx.lose();
    this.meta.best = Math.max(this.meta.best, o.score);
    this.meta.pearls += o.pearls;
    saveMeta(this.meta);
    clearRun();
    this.screen = 'end';
    this.render();
  }

  private toPort(): void {
    this.reel = null;
    this.keys.clear();
    this.pointer = null;
    this.screen = 'port';
    saveRun(this.run!);
    this.render();
  }

  // ---------- Input ----------

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if (!down) {
      this.keys.delete(k);
      if (k === ' ') this.reelHeld = false;
      return;
    }
    if (this.modal) {
      const m = this.modal;
      if (m.kind === 'hold' && this.run?.pending) {
        if (k === 'r') this.action('rotate', {});
        else if (k === 'a') this.action('auto', {});
        else if (k === 'x') this.action('release', {});
        return;
      }
      if (k === 'escape' && m.kind !== 'event' && m.kind !== 'msg') this.action('modal-close', {});
      else if ((k === 'enter' || k === ' ') && (m.kind === 'msg' || (m.kind === 'event' && m.result))) {
        e.preventDefault();
        this.action('modal-close', {});
      }
      return;
    }
    if (k === 'escape' && (this.screen === 'sea' || this.screen === 'port')) {
      this.action('menu', {});
      return;
    }
    if (this.screen !== 'sea') return;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (this.reel) {
      if (k === ' ') {
        initAudio();
        this.reelHeld = true;
      }
      return;
    }
    this.keys.add(k);
    if (k === 'f' || k === ' ') this.action('cast', {});
    else if (k === 'e') this.action('dock', {});
    else if (k === 'h') this.action('hold', {});
    else if (k === 'k') this.action('kit', {});
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    const t = e.target as HTMLElement;
    if (t.closest('[data-hold="reel"]')) {
      e.preventDefault();
      this.reelHeld = true;
      return;
    }
    if (this.screen === 'sea' && t === this.canvas && !this.modal) {
      e.preventDefault();
      if (this.reel) this.reelHeld = true;
      else this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.pointer && this.pointer.id === e.pointerId) {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    }
  }

  private onUp(e: PointerEvent): void {
    if (this.pointer && this.pointer.id === e.pointerId) this.pointer = null;
    this.reelHeld = false;
  }

  /** Ghost preview of the carried fish in the hold. */
  private onHover(e: PointerEvent): void {
    const m = this.modal;
    if (!m || m.kind !== 'hold' || !this.run?.pending || e.pointerType !== 'mouse') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-x]');
    const hover = el ? { x: Number(el.dataset.x), y: Number(el.dataset.y) } : null;
    if (hover?.x === m.hover?.x && hover?.y === m.hover?.y) return;
    m.hover = hover;
    this.render();
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    this.action(el.dataset.act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const r = this.run;
    const w = this.world;
    switch (act) {
      case 'mute':
        toggleMute();
        if (this.modal) this.render();
        else this.refreshHud();
        if (this.screen !== 'sea') this.render();
        return;
      case 'help':
        this.modal = { kind: 'help' };
        this.render();
        return;
      case 'journal':
        this.modal = { kind: 'journal' };
        this.render();
        return;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        this.render();
        return;
      case 'modal-close': {
        const m = this.modal;
        if (m?.kind === 'hold' && r?.pending) return;
        if (m?.kind === 'event' && !m.result) return;
        this.modal = null;
        if (r?.over) return this.goEnd();
        if (this.toPortAfterModal) {
          this.toPortAfterModal = false;
          return this.toPort();
        }
        if (this.screen === 'sea' && r) {
          if (r.pending) this.openHold('Stow your catch');
          else if (r.event) this.modal = { kind: 'event', id: r.event, result: null };
        }
        this.render();
        return;
      }
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        return;
      case 'abandon-yes':
        if (!r) return;
        r.over = { victory: false, score: Math.round((r.debtStart - r.debt) * 0.25), reason: 'You gave up and sold the boat for scrap.', pearls: 0 };
        this.goEnd();
        return;
      case 'title':
        if (r && !r.over) saveRun(r);
        this.modal = null;
        this.reel = null;
        this.screen = 'title';
        cancelAnimationFrame(this.raf);
        this.render();
        return;
      case 'new': {
        const seed = PARAMS.get('seed') ?? randomSeedText();
        this.world = makeWorld(seed);
        this.run = newRun(seed, this.world, startGear(this.meta));
        this.meta.runs++;
        saveMeta(this.meta);
        saveRun(this.run);
        this.endInfo = { newSpecies: 0 };
        this.bot = newMem('good');
        this.modal = null;
        this.screen = 'port';
        this.toast(`Day 1. You owe ${fmt(this.run.debt)} coins. Good luck.`);
        this.render();
        return;
      }
      case 'continue':
        if (!r) return;
        this.world = makeWorld(r.seed);
        this.screen = r.docked >= 0 ? 'port' : 'sea';
        this.render();
        return;
      case 'unlock': {
        const u = UNLOCKS.find((x) => x.id === d.id);
        if (!u || this.meta.pearls < u.cost || this.meta.unlocks.includes(u.id)) return;
        this.meta.pearls -= u.cost;
        this.meta.unlocks.push(u.id);
        saveMeta(this.meta);
        sfx.buy();
        this.render();
        return;
      }
    }
    if (!r || !w) return;
    switch (act) {
      case 'cast':
        if (this.screen === 'sea' && !this.reel) this.doCast();
        return;
      case 'dock': {
        const i = dockHere(r);
        if (i < 0) return;
        dock(r, i);
        sfx.horn();
        this.toPort();
        return;
      }
      case 'kit':
        if (this.screen === 'port') {
          if (buyKit(r)) sfx.buy();
          this.render();
          return;
        }
        if (useKit(r)) {
          sfx.place();
          this.toast('You patch the hull. +1 hull.');
        } else sfx.deny();
        this.refreshHud();
        return;
      case 'hold':
        this.openHold('Hold');
        this.render();
        return;
      case 'cell':
      case 'lift': {
        const m = this.modal;
        if (m?.kind !== 'hold') return;
        const x = Number(d.x);
        const y = Number(d.y);
        if (r.pending) {
          if (stowPending(r, x, y, m.rot)) {
            sfx.place();
            m.hover = null;
            saveRun(r);
          } else sfx.deny();
        } else if (act === 'lift') {
          // Keep the rotation of the lifted fish.
          const rot = r.hold.find((i) => i.uid === Number(d.uid))?.rot ?? 0;
          if (liftItem(r, Number(d.uid))) {
            sfx.rotate();
            m.rot = rot;
          }
        }
        this.render();
        return;
      }
      case 'rotate': {
        const m = this.modal;
        if (m?.kind !== 'hold') return;
        m.rot = (m.rot + 1) % 4;
        sfx.rotate();
        this.render();
        return;
      }
      case 'auto':
        if (autoStow(r)) {
          sfx.place();
          saveRun(r);
        } else {
          sfx.deny();
          this.toast('No room. Move fish or throw one back.');
        }
        this.render();
        return;
      case 'release':
        if (r.pending) {
          r.pending = null;
          sfx.lost();
          saveRun(r);
        }
        this.render();
        return;
      case 'event-opt': {
        const m = this.modal;
        if (m?.kind !== 'event' || m.result) return;
        const atSea = r.docked < 0;
        m.result = eventChoice(r, w, m.id, Number(d.i));
        sfx.bell();
        if (atSea && r.docked >= 0) this.toPortAfterModal = true;
        this.render();
        return;
      }
      // Port
      case 'sell': {
        const n = sell(r, Number(d.uid));
        if (n) {
          sfx.coin();
          this.toast(`+${n} coins`);
        }
        saveRun(r);
        this.render();
        return;
      }
      case 'sell-all': {
        const n = sellAll(r);
        if (n) {
          sfx.coin();
          this.toast(`Sold the catch for ${fmt(n)} coins.`);
        }
        saveRun(r);
        this.render();
        return;
      }
      case 'buy':
        if (buyGear(r, d.cat as GearCat, Number(d.tier))) {
          sfx.buy();
          this.toast(`New ${GEAR[d.cat as GearCat].label.toLowerCase()}: ${GEAR[d.cat as GearCat].tiers[Number(d.tier)].name}`);
        } else sfx.deny();
        saveRun(r);
        this.render();
        return;
      case 'lure-buy':
        if (buyLure(r, d.id!)) sfx.buy();
        else sfx.deny();
        saveRun(r);
        this.render();
        return;
      case 'lure-eq':
        equipLure(r, d.id!);
        sfx.place();
        this.render();
        return;
      case 'repair':
        if (repair(r)) sfx.buy();
        this.render();
        return;
      case 'pay': {
        const n = pay(r, d.n === 'all' ? r.money : Number(d.n));
        if (n) {
          sfx.coin();
          this.toast(`Paid ${fmt(n)}. Debt left: ${fmt(r.debt)}.`);
        }
        if (r.over) return this.goEnd();
        saveRun(r);
        this.render();
        return;
      }
      case 'sleep': {
        const ev = sleep(r, w);
        if (r.over) return this.goEnd();
        sfx.dawn();
        const gnaw = ev.filter((e) => e.k === 'gnaw').map((e) => (e.k === 'gnaw' ? e.text : ''));
        this.toast(`☀️ Day ${r.day} of ${LAST_DAY}.${gnaw.length ? ' ' + gnaw.join(' ') : ''}`);
        saveRun(r);
        this.render();
        return;
      }
      case 'sail':
        if (r.minute >= NIGHT_START) this.toast('Night at sea. Watch your panic.');
        setSail(r);
        this.screen = 'sea';
        this.bot.target = null;
        saveRun(r);
        this.render();
        return;
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
      state: () => {
        const r = this.run;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          reel: this.reel ? { wait: this.reel.wait, tension: this.reel.tension, progress: this.reel.progress } : null,
          day: r?.day,
          clock: r ? clockText(r.minute) : null,
          money: r?.money,
          debt: r?.debt,
          hull: r?.boat.hull,
          panic: r ? Math.round(r.panic) : null,
          shades: r?.shades.length ?? 0,
          docked: r?.docked,
          hold: r?.hold.length,
          unlocked: r?.unlocked,
          gear: r?.gear,
          x: r ? Math.round(r.boat.x) : null,
          y: r ? Math.round(r.boat.y) : null,
          over: r?.over ?? null,
        };
      },
      money: (n: number) => {
        if (this.run) this.run.money += n;
        this.render();
      },
      night: () => {
        if (this.run) this.run.minute = NIGHT_START - 5;
      },
      panic: (n: number) => {
        if (this.run) this.run.panic = n;
      },
      unlock: () => {
        if (this.run) this.run.unlocked = [0, 1, 2, 3, 4];
      },
      aberrant: () => (this.run ? aberrantChance(this.run) : 0),
      depth: () => (this.run ? rodDepth(this.run) : 0),
      /** One bot action. At sea it plays a few seconds of game time. */
      step: () => {
        const r = this.run;
        const m = this.modal;
        if (m) {
          if (m.kind === 'hold') {
            if (r?.pending) {
              botStow(r, this.bot);
              this.render();
              return 'stow';
            }
            click('[data-act="modal-close"]');
            return 'hold';
          }
          if (m.kind === 'event' && !m.result && r) {
            click(`[data-act="event-opt"][data-i="${botEvent(r, this.bot)}"]`);
            return 'event';
          }
          this.action('modal-close', {});
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'end':
            return 'end';
          case 'port': {
            if (!r) return 'port';
            const choice = botPort(r, this.bot);
            if (r.over) {
              this.goEnd();
              return 'paid';
            }
            this.render();
            click(choice === 'sleep' ? '[data-act="sleep"]' : '[data-act="sail"]');
            return choice;
          }
          case 'sea': {
            if (!r || !this.world) return 'sea';
            const ticks = FAST ? 600 : 120;
            for (let i = 0; i < ticks; i++) {
              if (this.modal || this.screen !== 'sea') break;
              if (this.reel) {
                this.simStep(DT, { inp: { throttle: 0, steer: 0 }, reel: botReel(this.reel, 1, Math.random) });
                continue;
              }
              const { inp, act } = botSea(r, this.world, this.bot, DT);
              if (act === 'fish') {
                this.doCast();
                continue;
              }
              if (act === 'dock') {
                this.action('dock', {});
                break;
              }
              this.simStep(DT, { inp, reel: false });
            }
            if (this.screen === 'sea') this.refreshHud();
            return this.reel ? 'reel' : 'sea';
          }
        }
        return 'idle';
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}

