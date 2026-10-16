import { AUGMENTS, RACES, SECTORS, SHIPS, SYSTEMS, WEAPONS, type Race, type SysId } from './data';
import { DT, tick, type Combat } from './combat';
import { botEvent, botMap, botSetup, botStore, botThink, botUpgrade } from './bot';
import { Renderer, type View } from './render';
import { Rng, randomSeedText } from './rng';
import {
  FLEET_STEP,
  FUEL_COST,
  MAX_AUG,
  MAX_CARGO,
  MAX_CREW,
  MAX_WEAPONS,
  MISSILE_COST,
  REACTOR_MAX,
  buyFuel,
  buyHull,
  buyItem,
  buyMissile,
  canJump,
  exitNode,
  choose,
  clearRun,
  endCombat,
  hullCost,
  jump,
  loadMeta,
  loadRun,
  newRun,
  overtaken,
  proceed,
  recordRun,
  saveMeta,
  saveRun,
  sellPrice,
  sellWeapon,
  swapWeapon,
  upgradeReactor,
  upgradeSys,
  type RunState,
} from './run';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';
import {
  addPower,
  capacity,
  crewRoom,
  evasion,
  isManned,
  layoutOf,
  reactorCost,
  reactorFree,
  removePower,
  sendCrew,
  skillLevel,
  sysPower,
  toggleWeapon,
  upgradeCost,
  type Crew,
  type Ship,
} from './ship';

type Screen = 'title' | 'map' | 'event' | 'combat' | 'store' | 'reward' | 'ship' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips waits, for bot tests. */
const FAST = PARAMS.has('fast');
const POWER_SYS: SysId[] = ['shields', 'engines', 'oxygen', 'medbay'];
const SYS_KEYS: Record<string, [SysId, boolean]> = {
  a: ['shields', true],
  z: ['shields', false],
  s: ['engines', true],
  x: ['engines', false],
  d: ['oxygen', true],
  c: ['oxygen', false],
  f: ['medbay', true],
  v: ['medbay', false],
};

const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

function crewTask(ship: Ship, c: Crew): string {
  if (c.path.length) return c.healing ? 'to medbay' : 'moving';
  const lay = layoutOf(ship.layout);
  const room = crewRoom(ship, c);
  if (room < 0) return '';
  const r = ship.rooms[room];
  const sid = lay.def.rooms[room].sys;
  const sys = sid ? ship.systems[sid] : undefined;
  if (r.fire > 0.05) return '🔥 fighting fire';
  if (r.breach > 0) return '🕳️ fixing breach';
  if (sys && sys.dmg > 0) return '🔧 repairing';
  if (c.healing) return '🩹 healing';
  if (sid && isManned(ship, sid) === c && sid !== 'oxygen' && sid !== 'medbay') return `manning ${SYSTEMS[sid].name.toLowerCase()}`;
  return sid ? SYSTEMS[sid].name.toLowerCase() : 'idle';
}

function skillStars(c: Crew): string {
  const parts: string[] = [];
  for (const k of ['pilot', 'engines', 'shields', 'weapons'] as const) {
    const l = skillLevel(c.xp[k]);
    if (l > 0) parts.push(`${SYSTEMS[k].icon}${'★'.repeat(l)}`);
  }
  return parts.join(' ');
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private shipView = false;
  /** The title screen is open while a saved run waits. */
  private titleOpen = true;
  private recorded = false;
  private newUnlocks: string[] = [];

  // Combat view.
  private renderer: Renderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private speed = 1;
  private view: View = { selCrew: new Set(), selWeapon: null, hover: null };
  private endT = 0;
  private panelT = 0;
  private saveT = 0;
  private crewSig = '';
  private botReady = false;
  private stepRng = new Rng(12345);

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    try {
      setMuted(localStorage.getItem('starward.mute') === '1');
    } catch {
      /* ignore */
    }
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).id === 'cv') {
        e.preventDefault();
        this.cancelSelection();
      }
    });
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.run && !this.run.over) {
        if (this.run.combat) this.run.combat.paused = true;
        this.save();
      }
    });
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Helpers ----------

  private get ship(): Ship {
    return this.run!.ship;
  }

  private save(): void {
    if (!this.run || this.run.over) return;
    if (this.run.combat) this.run.combat.ev = [];
    saveRun(this.run);
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private sync(): void {
    const r = this.run;
    if (!r || this.titleOpen) this.screen = 'title';
    else if (r.over) {
      this.screen = 'end';
      if (!this.recorded) {
        this.recorded = true;
        this.newUnlocks = recordRun(this.meta, r);
        saveMeta(this.meta);
        clearRun();
        if (r.over.victory) sfx.win();
        else sfx.lose();
      }
    } else if (r.combat) this.screen = 'combat';
    else if (this.shipView) this.screen = 'ship';
    else if (!r.node) this.screen = 'map';
    else this.screen = r.node.kind;
  }

  // ---------- Rendering ----------

  private render(): void {
    this.sync();
    const s = this.screen;
    let body = '';
    if (s === 'title') body = this.titleView();
    else if (s === 'map') body = this.mapView();
    else if (s === 'event') body = this.eventView();
    else if (s === 'store') body = this.storeView();
    else if (s === 'reward') body = this.rewardView();
    else if (s === 'ship') body = this.shipScreen();
    else if (s === 'end') body = this.endView();
    else body = this.combatView();
    const top = this.run && s !== 'title' && s !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${s}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (s === 'combat') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.renderer = new Renderer(this.canvas!.getContext('2d')!);
      this.crewSig = '';
      this.resize();
      this.updatePanels();
      this.startLoop();
    } else {
      this.canvas = null;
      this.renderer = null;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private topBar(): string {
    const r = this.run!;
    const sh = r.ship;
    return `<header class="top">
      <span title="Hull">❤️ <b id="tb-hull">${Math.max(0, sh.hull)}</b>/${sh.maxHull}</span>
      <span title="Scrap">💰 ${r.scrap}</span>
      <span title="Fuel">⛽ ${r.fuel}</span>
      <span title="Missiles">🚀 <b id="tb-mis">${sh.missiles}</b></span>
      <span title="Sector">${SECTORS[r.sector].icon} ${r.sector + 1}/6</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const r = this.run;
    const cont = r ? `<button class="primary big-btn" data-act="continue">▶ Continue run · sector ${r.sector + 1} · ${SHIPS.find((s) => s.id === r.shipId)?.name ?? ''}</button>` : '';
    const ships = SHIPS.map((s) => {
      const open = m.unlocked.includes(s.id);
      const w = s.weapons.map((id) => WEAPONS[id].icon + ' ' + WEAPONS[id].name).join(', ');
      const crew = s.crew.map((c) => RACES[c].name).join(', ');
      return `<button class="ship-card ${open ? '' : 'locked'}" data-act="start" data-ship="${s.id}" ${open ? '' : 'disabled'}>
        <span class="big">${open ? s.icon : '🔒'}</span>
        <b>${s.name}</b>
        <small>${open ? s.text : 'Locked: ' + s.unlock}</small>
        ${open ? `<small class="dim">Hull ${s.hull} · Reactor ${s.reactor} · ${w}<br>Crew: ${crew}</small>` : ''}
      </button>`;
    }).join('');
    return `<div class="title">
      <div class="title-tools"><button class="icon-btn" data-act="help">?</button><button class="icon-btn" data-act="mute">${isMuted() ? '🔇' : '🔊'}</button></div>
      <div class="logo">🚀</div>
      <h1>Starward Drift</h1>
      <p class="sub">Command a small ship. Route power, aim weapons at enemy rooms and send crew to fight fires. Pause any time. Cross 6 sectors ahead of the rebel fleet and destroy the Flagship.</p>
      ${cont}
      <h3>${r ? 'Or start a new run' : 'Choose your ship'}</h3>
      <div class="ships">${ships}</div>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best sector ${m.bestSector} · Best score ${m.best} · Ships destroyed ${m.kills}</p>
      <button data-act="help">How to play</button>
    </div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const vert = window.innerWidth < 600;
    const W = vert ? 560 : 1000;
    const H = vert ? 860 : 560;
    const px = (b: { x: number; y: number }): [number, number] => (vert ? [40 + b.y * (W - 80), 40 + b.x * (H - 80)] : [40 + b.x * (W - 80), 30 + b.y * (H - 60)]);
    const here = r.map[r.at];
    let lines = '';
    r.map.forEach((b, i) => {
      for (const n of b.nb) {
        if (n < i) continue;
        const [x1, y1] = px(b);
        const [x2, y2] = px(r.map[n]);
        const hot = i === r.at || n === r.at ? 'hot' : '';
        lines += `<line class="${hot}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      }
    });
    const span = vert ? H - 80 : W - 80;
    const fleetX = Math.max(0, 40 + r.fleet * span);
    const nextFleetX = Math.max(0, 40 + (r.fleet + FLEET_STEP) * span);
    const zone = (len: number, fill: string): string => (vert ? `<rect x="0" y="0" width="${W}" height="${len}" fill="${fill}"/>` : `<rect x="0" y="0" width="${len}" height="${H}" fill="${fill}"/>`);
    const rad = vert ? 17 : 12;
    let dots = '';
    r.map.forEach((b, i) => {
      const [x, y] = px(b);
      const reach = here.nb.includes(i);
      const lost = overtaken(r, i);
      const icon = b.kind === 'exit' ? '⭐' : b.kind === 'store' ? '🛒' : '';
      const cls = ['bcn', reach ? 'reach' : '', i === r.at ? 'here' : '', b.visited ? 'seen' : '', lost ? 'lost' : ''].join(' ');
      dots += `<g class="${cls}" ${reach ? `data-act="jump" data-i="${i}"` : ''}>
        ${reach ? `<circle class="hit" cx="${x}" cy="${y}" r="${rad * 2.6}"/>` : ''}
        <circle class="dot" cx="${x}" cy="${y}" r="${i === r.at ? rad + 3 : rad}"/>
        ${icon ? `<text x="${x}" y="${y + rad * 0.55}" text-anchor="middle" font-size="${rad * 1.6}">${icon}</text>` : ''}
        ${i === r.at ? `<text x="${x}" y="${y - rad - 8}" text-anchor="middle" class="you">YOU</text>` : ''}
      </g>`;
    });
    const grad = vert ? 'x1="0" x2="0" y1="0" y2="1"' : 'x1="0" x2="1"';
    const atExit = here.kind === 'exit';
    const last = r.sector >= SECTORS.length - 1;
    const exitDist = this.hops(r.at, 1);
    const margin = Math.floor((r.map[1].x - r.fleet) / FLEET_STEP);
    return `<div class="mapv">
      <div class="map-head">
        <h2>${SECTORS[r.sector].icon} Sector ${r.sector + 1}: ${SECTORS[r.sector].name}</h2>
        <p class="dim">Tap a linked beacon to jump (1 fuel). The red zone is the rebel fleet. It moves one step each jump. ${margin <= exitDist + 1 ? '<b class="bad">The fleet is close to the exit!</b>' : ''}</p>
      </div>
      <svg class="starmap ${vert ? 'vert' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        <defs><linearGradient id="fl" ${grad}><stop offset="0" stop-color="#ef476f" stop-opacity="0.45"/><stop offset="1" stop-color="#ef476f" stop-opacity="0.15"/></linearGradient></defs>
        <rect x="0" y="0" width="${W}" height="${H}" fill="rgba(72,202,228,0.03)"/>
        ${zone(nextFleetX, 'rgba(239,71,111,0.08)')}
        ${zone(fleetX, 'url(#fl)')}
        ${lines}${dots}
      </svg>
      <div class="map-side">
        <span>Exit ⭐ in ${exitDist} jump${exitDist === 1 ? '' : 's'}</span>
        <span>Fleet reaches the exit in about ${Math.max(0, margin)} jumps</span>
        <span class="grow"></span>
        <button data-act="ship">🔧 Ship & upgrades</button>
        ${atExit ? `<button class="primary" data-act="exit">${last ? '🚩 Face the Flagship' : `⭐ Jump to sector ${r.sector + 2}`}</button>` : ''}
      </div>
    </div>`;
  }

  private hops(from: number, to: number): number {
    const r = this.run!;
    const seen = new Map([[from, 0]]);
    const q = [from];
    while (q.length) {
      const t = q.shift()!;
      if (t === to) return seen.get(t)!;
      for (const n of r.map[t].nb)
        if (!seen.has(n)) {
          seen.set(n, seen.get(t)! + 1);
          q.push(n);
        }
    }
    return 0;
  }

  private eventView(): string {
    const n = this.run!.node;
    if (!n || n.kind !== 'event') return '';
    const choices = n.result
      ? `<p class="result">${esc(n.result)}</p>${n.gains?.length ? `<div class="gains">${n.gains.map((g) => `<span class="chip">${esc(g)}</span>`).join('')}</div>` : ''}<button class="primary" data-act="proceed">${n.next?.fight ? '⚔️ Battle stations!' : n.next?.store ? '🛒 Open the market' : 'Continue'}</button>`
      : n.choices.length
        ? `<div class="opts">${n.choices.map((c, i) => `<button data-act="choose" data-i="${i}" ${c.ok ? '' : 'disabled'} class="${i === 0 && n.choices.length === 1 ? 'primary' : ''}"><span class="key">${i + 1}</span> ${esc(c.text)}</button>`).join('')}</div>`
        : `<button class="primary" data-act="proceed">Continue</button>`;
    return `<div class="card eventv"><div class="big">${n.icon}</div><h2>${esc(n.title)}</h2><p>${esc(n.text)}</p>${choices}</div>`;
  }

  private rewardView(): string {
    const n = this.run!.node;
    if (!n || n.kind !== 'reward') return '';
    return `<div class="card eventv"><div class="big">🏆</div><h2>${esc(n.title)}</h2><p>${esc(n.text)}</p>
      ${n.gains.length ? `<div class="gains">${n.gains.map((g) => `<span class="chip">${esc(g)}</span>`).join('')}</div>` : ''}
      <button class="primary" data-act="proceed">Continue</button></div>`;
  }

  private storeView(): string {
    const r = this.run!;
    const items = r.map[r.at].store ?? [];
    const cards = items
      .map((it, i) => {
        let icon = '';
        let name = '';
        let text = '';
        if (it.kind === 'weapon') {
          const w = WEAPONS[it.id];
          icon = w.icon;
          name = w.name;
          text = `${w.text} Power ${w.power} · charge ${w.charge}s`;
        } else if (it.kind === 'crew') {
          const rc = RACES[it.id as Race];
          icon = '🧑‍🚀';
          name = `${rc.name} crew`;
          text = rc.text + ` HP ${rc.hp}.`;
        } else {
          const a = AUGMENTS[it.id];
          icon = a.icon;
          name = a.name;
          text = a.text;
        }
        return `<div class="item ${it.sold ? 'sold' : ''}"><span class="big">${icon}</span><b>${name}</b><small>${text}</small>
          <button data-act="buy" data-i="${i}" ${it.sold || r.scrap < it.cost ? 'disabled' : ''}>${it.sold ? 'Sold' : `💰 ${it.cost}`}</button></div>`;
      })
      .join('');
    const sh = r.ship;
    const sells = [
      ...sh.weapons.map((w, i) => (sh.weapons.length > 1 ? `<button data-act="sell" data-ref="w${i}">${WEAPONS[w.id].icon} ${WEAPONS[w.id].name} +${sellPrice(w.id)}</button>` : '')),
      ...r.cargo.map((id, i) => `<button data-act="sell" data-ref="c${i}">📦 ${WEAPONS[id].name} +${sellPrice(id)}</button>`),
    ].join('');
    return `<div class="storev">
      <h2>🛒 Store <small>💰 ${r.scrap} scrap</small></h2>
      <div class="items">${cards}</div>
      <h3>Supplies</h3>
      <div class="row">
        <button data-act="fuel" ${r.scrap < FUEL_COST ? 'disabled' : ''}>⛽ +1 fuel · ${FUEL_COST}</button>
        <button data-act="missile" ${r.scrap < MISSILE_COST ? 'disabled' : ''}>🚀 +1 missile · ${MISSILE_COST}</button>
        <button data-act="hull1" ${r.scrap < hullCost(r) || sh.hull >= sh.maxHull ? 'disabled' : ''}>❤️ +1 hull · ${hullCost(r)}</button>
        <button data-act="hull5" ${r.scrap < hullCost(r) || sh.hull >= sh.maxHull ? 'disabled' : ''}>❤️ +5 hull · ${hullCost(r) * 5}</button>
      </div>
      ${sells ? `<h3>Sell weapons</h3><div class="row">${sells}</div>` : ''}
      <div class="row"><button data-act="ship">🔧 Upgrades</button><button class="primary" data-act="proceed">Leave store</button></div>
    </div>`;
  }

  private shipScreen(): string {
    const r = this.run!;
    const sh = r.ship;
    const rows = (['shields', 'engines', 'oxygen', 'medbay', 'weapons', 'pilot'] as SysId[])
      .map((id) => {
        const s = sh.systems[id];
        if (!s) return '';
        const max = SYSTEMS[id].max;
        const pips = Array.from({ length: max }, (_, k) => `<i class="${k < s.level ? 'on' : ''}"></i>`).join('');
        const cost = upgradeCost(id, s.level);
        const btn = s.level >= max ? '<button disabled>Max</button>' : `<button data-act="upgrade" data-sys="${id}" ${r.scrap < cost ? 'disabled' : ''}>⬆ 💰${cost}</button>`;
        return `<div class="uprow"><span class="sname">${SYSTEMS[id].icon} ${SYSTEMS[id].name}</span><span class="pips">${pips}</span>${btn}<small>${SYSTEMS[id].text}</small></div>`;
      })
      .join('');
    const rc = reactorCost(sh.reactor);
    const reactor = `<div class="uprow"><span class="sname">⚛️ Reactor</span><span class="dim">${sh.reactor} power</span>${sh.reactor >= REACTOR_MAX ? '<button disabled>Max</button>' : `<button data-act="reactor" ${r.scrap < rc ? 'disabled' : ''}>⬆ 💰${rc}</button>`}<small>Total power for all systems.</small></div>`;
    const weapons = sh.weapons
      .map((w, i) => {
        const d = WEAPONS[w.id];
        return `<div class="wrow"><span>${i + 1}. ${d.icon} <b>${d.name}</b> <small class="dim">⚡${d.power} · ${d.text}</small></span>${sh.weapons.length > 1 && r.cargo.length < MAX_CARGO ? `<button data-act="swap" data-ref="w${i}">To cargo</button>` : ''}</div>`;
      })
      .join('');
    const cargo = r.cargo.length
      ? r.cargo.map((id, i) => `<div class="wrow"><span>📦 ${WEAPONS[id].icon} ${WEAPONS[id].name} <small class="dim">⚡${WEAPONS[id].power}</small></span>${sh.weapons.length < MAX_WEAPONS ? `<button data-act="swap" data-ref="c${i}">Equip</button>` : ''}</div>`).join('')
      : '<p class="dim">Cargo is empty.</p>';
    const crew = sh.crew.map((c) => `<span class="chip"><i class="dot" style="background:${RACES[c.race].color}"></i>${esc(c.name)} · ${RACES[c.race].name} ${skillStars(c)}</span>`).join('');
    const augs = sh.augments.length ? sh.augments.map((a) => `<span class="chip" title="${AUGMENTS[a].text}">${AUGMENTS[a].icon} ${AUGMENTS[a].name}: ${AUGMENTS[a].text}</span>`).join('') : '<span class="dim">None yet.</span>';
    return `<div class="shipv">
      <h2>🔧 ${esc(sh.name)} <small>💰 ${r.scrap} scrap</small></h2>
      <section><h3>Systems</h3>${rows}${reactor}</section>
      <section><h3>Weapons (${sh.weapons.length}/${MAX_WEAPONS})</h3>${weapons}<h3>Cargo (${r.cargo.length}/${MAX_CARGO})</h3>${cargo}</section>
      <section><h3>Crew (${sh.crew.length}/${MAX_CREW})</h3><div class="gains">${crew}</div><h3>Augments (${sh.augments.length}/${MAX_AUG})</h3><div class="gains">${augs}</div></section>
      <button class="primary" data-act="ship-back">Back</button>
    </div>`;
  }

  private endView(): string {
    const r = this.run!;
    const v = r.over!;
    const unlock = this.newUnlocks.length ? `<p class="good">New ship unlocked: ${this.newUnlocks.join(', ')}!</p>` : '';
    return `<div class="card endv">
      <div class="huge">${v.victory ? '🏆' : '💥'}</div>
      <h1>${v.victory ? 'Victory!' : 'Ship destroyed'}</h1>
      <p>${v.victory ? 'The Rebel Flagship is gone. The Federation is saved.' : `Your run ended in sector ${r.sector + 1}: ${SECTORS[r.sector].name}.`}</p>
      <p class="score">Score <b>${v.score}</b></p>
      <p class="dim">Ships destroyed ${r.stats.kills} · Jumps ${r.stats.jumps} · Scrap earned ${r.stats.scrap}${v.victory ? ` · Hull left ${r.ship.hull}` : ''}</p>
      ${unlock}
      <div class="row"><button class="primary" data-act="again">New run</button><button data-act="title">Title</button></div>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Pause</b> with <kbd>Space</kbd> or the ⏸ button at any time. Give orders while paused.</li>
          <li><b>Power:</b> the reactor has a fixed number of bars. Use <b>+</b> / <b>−</b> on each system (keys <kbd>A</kbd>/<kbd>Z</kbd> shields, <kbd>S</kbd>/<kbd>X</kbd> engines, <kbd>D</kbd>/<kbd>C</kbd> oxygen, <kbd>F</kbd>/<kbd>V</kbd> medbay). Tap ⏻ on a weapon to power it.</li>
          <li><b>Weapons</b> charge while powered. Tap a weapon card (or key <kbd>1</kbd>–<kbd>4</kbd>), then tap an enemy room. Each weapon fires at its target every time it is charged. Tap an enemy room with no weapon picked to aim all weapons there.</li>
          <li><b>Shields:</b> 2 power = 1 layer. A layer blocks one laser shot, then recharges. Missiles pass shields. Beams lose 1 damage per layer. Ion pops a layer and stops the recharge for a while.</li>
          <li>Hit the enemy <b>shield room</b> 🛡️ to take its shields down, then hit its <b>weapons</b> 🎯. Damage to a room damages its system.</li>
          <li><b>Engines</b> give evasion, but only while someone mans the <b>pilot</b> 🧭 room. Manned shields, weapons and engines work better. Crew gain skill ★ while manning.</li>
          <li><b>Crew:</b> tap a crew member (or the crew list), then tap a room of your ship to send them there. That room becomes their station. With <b>Auto crew</b> on, crew run to fires, breaches and broken systems by themselves, and to the medbay when hurt.</li>
          <li><b>Fires</b> 🔥 burn systems and crew and use up air. <b>Breaches</b> 🕳️ leak air. Low air (red rooms) hurts crew. Keep oxygen powered.</li>
          <li><b>FTL:</b> when the drive is charged you can jump away from a fight (no reward).</li>
          <li><b>Map:</b> each jump costs 1 fuel and moves the rebel fleet. Visit beacons for scrap, stores and events. Reach ⭐ before the fleet. Spend scrap on upgrades in 🔧 Ship.</li>
          <li>Win: cross 6 sectors and destroy the Rebel Flagship twice. Lose: hull 0 or no crew left.</li>
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

  // ---------- Combat view ----------

  private combatView(): string {
    const sh = this.ship;
    const sys = POWER_SYS.filter((id) => sh.systems[id])
      .map(
        (id) => `<div class="sysrow">
          <button class="pm" data-act="pminus" data-sys="${id}" title="Less power">−</button>
          <span class="sname">${SYSTEMS[id].icon} ${SYSTEMS[id].name}</span>
          <span class="bars" id="bars-${id}"></span>
          <button class="pm" data-act="pplus" data-sys="${id}" title="More power (${SYSTEMS[id].key})">+</button>
        </div>`,
      )
      .join('');
    const weapons = sh.weapons
      .map((w, i) => {
        const d = WEAPONS[w.id];
        return `<div class="wcard" id="wcard${i}" data-act="wsel" data-i="${i}">
          <div class="wtop"><span class="key">${i + 1}</span><b>${d.icon} ${d.name}</b><button class="pw" data-act="wpow" data-i="${i}" id="wpow${i}" title="Power on/off">⏻ ${d.power}</button></div>
          <div class="charge"><i id="wc${i}"></i></div>
          <small id="wt${i}"></small>
        </div>`;
      })
      .join('');
    return `<div class="combat">
      <div class="cv-wrap"><canvas id="cv"></canvas></div>
      <div class="ctrl">
        <button data-act="pause" id="b-pause"></button>
        <button data-act="speed" id="b-speed"></button>
        <button data-act="auto" id="b-auto"></button>
        <button data-act="flee" id="b-flee"></button>
      </div>
      <div class="panels">
        <section class="pnl"><h4>⚛️ Reactor <span id="reactor"></span></h4>${sys}<div class="sysrow info" id="pilot-row"></div></section>
        <section class="pnl"><h4>🎯 Weapons <span id="wsys"></span></h4><div class="wlist">${weapons}</div></section>
        <section class="pnl"><h4>🧑‍🚀 Crew <span class="dim small">tap, then tap a room</span></h4><div class="clist" id="clist"></div></section>
      </div>
    </div>`;
  }

  private resize(): void {
    if (this.screen === 'map' && !this.modal) {
      const vert = window.innerWidth < 600;
      if (vert !== this.root.querySelector('.starmap')?.classList.contains('vert')) this.render();
      return;
    }
    if (!this.canvas || !this.run?.combat || !this.renderer) return;
    const wrap = this.canvas.parentElement!;
    const w = Math.min(wrap.clientWidth, 1100);
    const stacked = w < 640;
    const h = stacked ? Math.min(Math.max(340, w * 0.95), 440) : Math.min(380, Math.max(280, w * 0.33));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const g = this.canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.renderer.layout(this.run.combat, w, h);
  }

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      if (this.screen === 'combat') this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private frame(dt: number): void {
    const c = this.run?.combat;
    if (!c || !this.renderer) return;
    if (!c.paused && !c.result && !this.modal) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= DT && n < 20) {
        tick(c);
        this.acc -= DT;
        n++;
      }
      this.saveT += dt;
      if (this.saveT > 3) {
        this.saveT = 0;
        this.save();
      }
    }
    this.drainEvents(c);
    this.renderer.update(dt);
    this.renderer.draw(c, this.view);
    this.panelT += dt;
    if (this.panelT > 0.1) {
      this.panelT = 0;
      this.updatePanels();
    }
    if (c.result) {
      this.endT += dt;
      if (this.endT > 1.6 || FAST) this.finishCombat();
    }
  }

  private drainEvents(c: Combat): void {
    if (!c.ev.length) return;
    const ev = c.ev.splice(0);
    this.renderer?.absorb(c, ev);
    for (const e of ev) {
      if (e.k === 'fire') {
        if (e.side !== 'player') continue;
        const k = e.text;
        if (k === 'missile') sfx.missile();
        else if (k === 'beam') sfx.beam();
        else if (k === 'ion') sfx.ion();
        else sfx.laser();
      } else if (e.k === 'hit') (e.side === 'player' ? sfx.hurt : sfx.hit)();
      else if (e.k === 'block') sfx.block();
      else if (e.k === 'miss') sfx.miss();
      else if (e.k === 'ion') sfx.ion();
      else if (e.k === 'firestart') {
        sfx.fire();
        if (e.side === 'player') sfx.alarm();
      } else if (e.k === 'death') {
        sfx.death();
        if (e.side === 'player' && e.text) this.toast(`💀 ${e.text}`);
      } else if (e.k === 'fixed' && e.side === 'player') sfx.fixed();
      else if (e.k === 'boom') sfx.boom();
      else if (e.k === 'phase') {
        this.toast(e.text ?? 'Phase 2');
        sfx.alarm();
      }
    }
  }

  private finishCombat(): void {
    const r = this.run!;
    const res = r.combat?.result;
    this.endT = 0;
    this.view.selCrew.clear();
    this.view.selWeapon = null;
    this.botReady = false;
    endCombat(r);
    if (res === 'fled') sfx.jump();
    this.save();
    this.render();
  }

  private bars(ship: Ship, id: SysId): string {
    const s = ship.systems[id]!;
    const pw = id === 'pilot' ? capacity(s) : sysPower(ship, id);
    let h = '';
    for (let k = 0; k < s.level; k++) {
      const broken = k >= s.level - s.dmg;
      const ion = k < pw && k >= pw - s.ion;
      h += `<i class="${broken ? 'dmg' : ion ? 'ion' : k < pw ? 'on' : ''}"></i>`;
    }
    return h;
  }

  private updatePanels(): void {
    const c = this.run?.combat;
    if (!c) return;
    const sh = c.player;
    const $ = (id: string): HTMLElement | null => this.root.querySelector<HTMLElement>('#' + id);
    const set = (id: string, html: string): void => {
      const el = $(id);
      if (el && el.innerHTML !== html) el.innerHTML = html;
    };
    set('tb-hull', String(Math.max(0, sh.hull)));
    set('tb-mis', String(sh.missiles));
    set('reactor', `${reactorFree(sh)} free / ${sh.reactor}`);
    for (const id of POWER_SYS) if (sh.systems[id]) set('bars-' + id, this.bars(sh, id));
    const pilot = sh.systems.pilot;
    if (pilot) set('pilot-row', `<span class="sname">🧭 Pilot</span><span class="bars">${this.bars(sh, 'pilot')}</span><span class="dim small">${isManned(sh, 'pilot') ? 'manned' : '<b class="bad">unmanned</b>'} · evade ${evasion(sh)}%</span>`);
    const ws = sh.systems.weapons;
    if (ws) set('wsys', `<span class="bars">${this.bars(sh, 'weapons')}</span>${ws.ion > 0 ? ' <b class="ion-t">ION</b>' : ''}`);
    const lay = layoutOf(c.enemy.layout);
    sh.weapons.forEach((w, i) => {
      const d = WEAPONS[w.id];
      const bar = $('wc' + i);
      if (bar) {
        bar.style.width = `${Math.round(w.charge * 100)}%`;
        bar.className = w.charge >= 1 ? 'full' : '';
      }
      const card = $('wcard' + i);
      if (card) {
        card.classList.toggle('off', !w.powered);
        card.classList.toggle('sel', this.view.selWeapon === i);
      }
      const pw = $('wpow' + i);
      if (pw) pw.classList.toggle('on', w.powered);
      const tsys = w.target !== null ? lay.def.rooms[w.target]?.sys : null;
      const tgt = w.target === null ? 'no target' : tsys ? `→ ${SYSTEMS[tsys].icon} ${SYSTEMS[tsys].name}` : '→ empty room';
      const ammo = d.kind === 'missile' && sh.missiles <= 0 ? ' · <b class="bad">no missiles</b>' : '';
      set('wt' + i, `${w.powered ? (w.charge >= 1 ? 'ready' : `${Math.round(w.charge * 100)}%`) : 'off'} · ${tgt}${ammo}`);
    });
    // Crew list: rebuild when crew change, else patch.
    const sig = sh.crew.map((cr) => cr.id).join(',') + '|' + [...this.view.selCrew].join(',');
    if (sig !== this.crewSig) {
      this.crewSig = sig;
      const list = $('clist');
      if (list)
        list.innerHTML = sh.crew
          .map(
            (cr) => `<button class="crow ${this.view.selCrew.has(cr.id) ? 'sel' : ''}" data-act="csel" data-id="${cr.id}">
              <i class="dot" style="background:${RACES[cr.race].color}"></i>
              <span class="cname">${esc(cr.name)} <small class="dim">${RACES[cr.race].name}</small></span>
              <span class="hpb"><i id="chp${cr.id}"></i></span>
              <small class="task" id="ct${cr.id}"></small>
            </button>`,
          )
          .join('');
    }
    for (const cr of sh.crew) {
      const hp = $('chp' + cr.id);
      if (hp) {
        const k = Math.max(0, cr.hp / cr.max);
        hp.style.width = `${Math.round(k * 100)}%`;
        hp.style.background = k > 0.5 ? 'var(--green)' : k > 0.25 ? 'var(--gold)' : 'var(--red)';
      }
      set('ct' + cr.id, `${crewTask(sh, cr)} ${skillStars(cr)}`);
    }
    set('b-pause', c.paused ? '▶ Resume <kbd>Space</kbd>' : '⏸ Pause <kbd>Space</kbd>');
    set('b-speed', `⏩ ${this.speed}×`);
    set('b-auto', `🤖 Auto crew: ${sh.auto ? 'on' : 'off'}`);
    const fl = $('b-flee');
    if (fl) {
      const ready = sh.ftl >= 1 && !c.boss;
      fl.innerHTML = c.boss ? '🚫 No escape' : ready ? '🌀 Jump away' : `🌀 FTL ${Math.round(sh.ftl * 100)}%`;
      (fl as HTMLButtonElement).disabled = !ready;
      fl.classList.toggle('primary', ready);
    }
  }

  // ---------- Input ----------

  private canvasPos(e: PointerEvent | MouseEvent): { x: number; y: number } | null {
    if (!this.canvas) return null;
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onMove(e: PointerEvent): void {
    if ((e.target as HTMLElement).id !== 'cv') {
      this.view.hover = null;
      return;
    }
    this.view.hover = this.canvasPos(e);
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if ((e.target as HTMLElement).id !== 'cv' || e.button === 2) return;
    const c = this.run?.combat;
    const rd = this.renderer;
    const p = this.canvasPos(e);
    if (!c || !rd || !p || c.result) return;
    e.preventDefault();
    const sh = c.player;
    const er = rd.roomAt(c.enemy, 'enemy', p.x, p.y);
    if (er >= 0) {
      if (this.view.selWeapon !== null) {
        const w = sh.weapons[this.view.selWeapon];
        if (!w.powered && !toggleWeapon(sh, this.view.selWeapon)) this.toast('Not enough power for this weapon');
        w.target = er;
        this.view.selWeapon = null;
      } else {
        let n = 0;
        sh.weapons.forEach((w) => {
          if (w.powered) {
            w.target = er;
            n++;
          }
        });
        if (!n) this.toast('Power a weapon first (⏻)');
      }
      sfx.click();
      this.updatePanels();
      return;
    }
    const cid = rd.crewAt(sh, 'player', p.x, p.y);
    if (cid !== null && !this.view.selCrew.size) {
      this.view.selCrew.add(cid);
      sfx.click();
      this.updatePanels();
      return;
    }
    if (cid !== null && e.shiftKey) {
      if (this.view.selCrew.has(cid)) this.view.selCrew.delete(cid);
      else this.view.selCrew.add(cid);
      this.updatePanels();
      return;
    }
    const pr = rd.roomAt(sh, 'player', p.x, p.y);
    if (pr >= 0 && this.view.selCrew.size) {
      for (const cr of sh.crew) {
        if (!this.view.selCrew.has(cr.id)) continue;
        cr.home = pr;
        cr.healing = false;
        sendCrew(sh, cr, pr);
      }
      this.view.selCrew.clear();
      sfx.click();
      this.updatePanels();
      return;
    }
    if (pr >= 0) {
      for (const cr of sh.crew) if (crewRoom(sh, cr) === pr) this.view.selCrew.add(cr.id);
      if (this.view.selCrew.size) sfx.click();
    } else this.view.selCrew.clear();
    this.updatePanels();
  }

  private cancelSelection(): void {
    this.view.selCrew.clear();
    this.view.selWeapon = null;
    this.updatePanels();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    const k = e.key.toLowerCase();
    if (this.screen === 'combat') {
      const c = this.run!.combat!;
      const sh = c.player;
      if (e.key === ' ') {
        e.preventDefault();
        this.action('pause', {});
      } else if (/^Digit[1-4]$/.test(e.code)) {
        this.action(e.shiftKey ? 'wpow' : 'wsel', { i: String(Number(e.code.slice(5)) - 1) });
      } else if (SYS_KEYS[k]) {
        const [id, up] = SYS_KEYS[k];
        this.action(up ? 'pplus' : 'pminus', { sys: id });
      } else if (k === 'g') this.action('auto', {});
      else if (k === 'j') this.action('flee', {});
      else if (k === 'q' || e.key === 'Tab') {
        e.preventDefault();
        if (!sh.crew.length) return;
        const cur = [...this.view.selCrew][0];
        const i = sh.crew.findIndex((cr) => cr.id === cur);
        this.view.selCrew = new Set([sh.crew[(i + 1) % sh.crew.length].id]);
        this.updatePanels();
      } else if (e.key === 'Escape') {
        if (this.view.selWeapon !== null || this.view.selCrew.size) this.cancelSelection();
        else this.action('menu', {});
      }
      return;
    }
    if (e.key === 'Escape') {
      if (this.screen === 'ship') this.action('ship-back', {});
      else if (this.run && this.screen !== 'title' && this.screen !== 'end') this.action('menu', {});
      return;
    }
    if (this.screen === 'event') {
      const n = this.run!.node;
      if (n?.kind === 'event' && !n.result && /^[1-9]$/.test(e.key)) this.action('choose', { i: String(Number(e.key) - 1) });
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (n?.kind === 'event' && !n.result && n.choices.length) this.action('choose', { i: '0' });
        else this.action('proceed', {});
      }
    } else if (this.screen === 'reward' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.action('proceed', {});
    }
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement | SVGElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    this.action(el.dataset.act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const r = this.run;
    const c = r?.combat ?? null;
    switch (act) {
      case 'mute':
        toggleMute();
        try {
          localStorage.setItem('starward.mute', isMuted() ? '1' : '0');
        } catch {
          /* ignore */
        }
        this.root.querySelectorAll<HTMLElement>('[data-act="mute"]').forEach((b) => (b.textContent = isMuted() ? '🔇' : '🔊'));
        return;
      case 'help':
        if (c) c.paused = true;
        this.modal = { kind: 'help' };
        this.render();
        return;
      case 'menu':
        if (c) c.paused = true;
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
          r.combat = null;
          r.over = { victory: false, score: 0 };
          r.over.score = Math.max(0, r.stats.scrap + r.stats.kills * 15 + r.sector * 150);
        }
        this.modal = null;
        this.shipView = false;
        this.render();
        return;
      case 'title':
        this.modal = null;
        this.shipView = false;
        if (r?.over) this.run = null;
        else this.save();
        this.titleOpen = true;
        this.meta = loadMeta();
        this.render();
        return;
      case 'continue':
        this.titleOpen = false;
        this.render();
        return;
      case 'start': {
        const id = d.ship ?? 'kestrel';
        this.startRun(id);
        return;
      }
      case 'again':
        this.startRun(r?.shipId ?? 'kestrel');
        return;
    }
    if (!r) return;
    switch (act) {
      case 'jump': {
        const i = Number(d.i);
        if (!canJump(r, i)) return;
        jump(r, i);
        sfx.jump();
        if (r.fuel === 0 && !r.over) this.toast('Out of fuel! Each jump now burns 3 hull.');
        break;
      }
      case 'exit':
        if (r.map[r.at].kind === 'exit') r.node = exitNode(r);
        break;
      case 'choose':
        choose(r, Number(d.i));
        sfx.click();
        break;
      case 'proceed':
        proceed(r);
        sfx.click();
        break;
      case 'ship':
        this.shipView = true;
        break;
      case 'ship-back':
        this.shipView = false;
        break;
      case 'buy': {
        const msg = buyItem(r, Number(d.i));
        if (msg) {
          sfx.coin();
          this.toast(msg);
        } else sfx.deny();
        break;
      }
      case 'fuel':
        (buyFuel(r) ? sfx.coin : sfx.deny)();
        break;
      case 'missile':
        (buyMissile(r) ? sfx.coin : sfx.deny)();
        break;
      case 'hull1':
        (buyHull(r, 1) ? sfx.coin : sfx.deny)();
        break;
      case 'hull5':
        (buyHull(r, 5) ? sfx.coin : sfx.deny)();
        break;
      case 'sell':
        (sellWeapon(r, d.ref ?? '') ? sfx.coin : sfx.deny)();
        break;
      case 'swap':
        (swapWeapon(r, d.ref ?? '') ? sfx.click : sfx.deny)();
        break;
      case 'upgrade':
        if (upgradeSys(r, d.sys as SysId)) {
          sfx.coin();
          this.toast(`${SYSTEMS[d.sys as SysId].name} upgraded`);
        } else sfx.deny();
        break;
      case 'reactor':
        (upgradeReactor(r) ? sfx.coin : sfx.deny)();
        break;
      default:
        if (c) this.combatAction(act, d, c);
        return;
    }
    this.save();
    this.render();
  }

  private combatAction(act: string, d: DOMStringMap, c: Combat): void {
    const sh = c.player;
    switch (act) {
      case 'pause':
        c.paused = !c.paused;
        sfx.click();
        break;
      case 'speed':
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
        break;
      case 'auto':
        sh.auto = !sh.auto;
        this.toast(sh.auto ? 'Auto crew on: crew handle fires, breaches and repairs' : 'Auto crew off: crew stay where you send them');
        break;
      case 'flee':
        if (sh.ftl >= 1 && !c.boss) {
          c.fleeing = true;
          c.paused = false;
        } else sfx.deny();
        break;
      case 'pplus':
        if (addPower(sh, d.sys as SysId)) sfx.power(true);
        else sfx.deny();
        break;
      case 'pminus':
        if (removePower(sh, d.sys as SysId)) sfx.power(false);
        else sfx.deny();
        break;
      case 'wpow': {
        const i = Number(d.i);
        if (!sh.weapons[i]) return;
        if (toggleWeapon(sh, i)) sfx.power(sh.weapons[i].powered);
        else {
          sfx.deny();
          this.toast('Not enough weapon or reactor power');
        }
        break;
      }
      case 'wsel': {
        const i = Number(d.i);
        if (!sh.weapons[i]) return;
        if (this.view.selWeapon === i) this.view.selWeapon = null;
        else {
          this.view.selWeapon = i;
          if (!sh.weapons[i].powered && !toggleWeapon(sh, i)) this.toast('Not enough power for this weapon');
        }
        sfx.click();
        break;
      }
      case 'csel': {
        const id = Number(d.id);
        if (this.view.selCrew.has(id)) this.view.selCrew.delete(id);
        else this.view.selCrew = new Set([id]);
        sfx.click();
        break;
      }
      default:
        return;
    }
    this.updatePanels();
  }

  private startRun(shipId: string): void {
    initAudio();
    this.run = newRun(shipId, randomSeedText());
    this.recorded = false;
    this.titleOpen = false;
    this.newUnlocks = [];
    this.shipView = false;
    this.modal = null;
    this.speed = 1;
    this.save();
    this.render();
  }

  // ---------- Debug ----------

  private installDebug(): void {
    const api = {
      state: () => {
        const r = this.run;
        const c = r?.combat;
        return {
          screen: this.screen,
          sector: r ? r.sector + 1 : null,
          hull: r?.ship.hull ?? null,
          scrap: r?.scrap ?? null,
          fuel: r?.fuel ?? null,
          crew: r?.ship.crew.length ?? null,
          node: r?.node?.kind ?? null,
          combat: c ? { t: Math.round(c.t), enemy: c.enemy.name, enemyHull: c.enemy.hull, result: c.result, paused: c.paused } : null,
          over: r?.over ?? null,
          modal: this.modal?.kind ?? null,
        };
      },
      scrap: (n: number) => {
        if (this.run) this.run.scrap += n;
        this.render();
      },
      win: () => {
        const c = this.run?.combat;
        if (c) c.enemy.hull = 0;
      },
      /** One bot action. In a fight it plays 8 seconds of game time. */
      step: () => {
        this.modal = null;
        const r = this.run;
        if (this.screen === 'end') return 'end';
        if (!r || this.screen === 'title') {
          if (r && !r.over) {
            this.titleOpen = false;
            this.render();
          } else this.startRun('kestrel');
          return this.screen;
        }
        if (r.combat) {
          const c = r.combat;
          if (c.result) {
            this.finishCombat();
            return this.screen;
          }
          if (!this.botReady) {
            botSetup(c, 'good');
            this.botReady = true;
          }
          c.paused = false;
          for (let t = 0; t < 8 && !c.result; t += 0.5) {
            botThink(c, 'good', this.stepRng);
            for (let k = 0; k < 10 && !c.result; k++) tick(c);
          }
          if (FAST) c.ev.length = 0;
          if (c.result) this.finishCombat();
          else this.updatePanels();
          return this.screen;
        }
        if (this.shipView) {
          this.shipView = false;
        } else if (r.node?.kind === 'event') {
          if (r.node.result || !r.node.choices.length) proceed(r);
          else choose(r, botEvent(r, 'good', this.stepRng));
        } else if (r.node?.kind === 'store') {
          botStore(r, 'good');
          proceed(r);
        } else if (r.node) proceed(r);
        else {
          botUpgrade(r, 'good');
          if (r.map[r.at].kind === 'exit') r.node = exitNode(r);
          else jump(r, botMap(r, 'good', this.stepRng));
        }
        this.save();
        this.render();
        return this.screen;
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}

