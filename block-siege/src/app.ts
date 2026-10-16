import { bestPlan } from './bot';
import { ACTS, ENEMIES, MOVE_INFO, RELICS, SHAPES, SPECIALS, type Card } from './data';
import {
  blinded,
  curMove,
  input as fightInput,
  moveValue,
  rowsPerSec,
  startFight,
  tick as fightTick,
  type FEvent,
  type Fight,
  type FightKind,
} from './fight';
import { randomSeedText } from './rng';
import {
  LOCKED as LOCKED_ITEMS,
  PLAN,
  ROOM_INFO,
  addRelic,
  advance,
  applyPick,
  cardName,
  cardText,
  clearRun,
  fightRewards,
  fightSeed,
  loadMeta,
  loadRun,
  makeShop,
  newRun,
  pickEnemy,
  pickEvent,
  pickText,
  plainCards,
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
  type Rewards,
  type Room,
  type RunState,
  type ShopItem,
} from './run';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';
import {
  GARBAGE,
  H,
  HIDDEN,
  W,
  cellColor,
  cellSpecial,
  dropDistance,
  isLocked,
  shapeCells,
  specialIndex,
  SHAPE_BY_INDEX,
  type Input,
} from './well';

type Screen = 'title' | 'map' | 'fight' | 'reward' | 'shop' | 'rest' | 'event' | 'treasure' | 'end';

type Modal =
  | { kind: 'help' }
  | { kind: 'menu'; confirm: boolean }
  | { kind: 'deck' }
  | { kind: 'pick'; title: string; filter: (c: Card) => boolean; done: (index: number) => void };

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  t: number;
}

const params = new URLSearchParams(location.search);
/** `?debug&fast` skips waits for bot tests. */
const FAST = params.has('fast');
const DEBUG = params.has('debug');

// Canvas layout in logical pixels.
const C = 24;
const LW = 368;
const STRIP = 124;
const WX = 64;
const WY = STRIP + 12;
const LH = WY + (H - HIDDEN) * C + 8;
const EX = 52;
const EY = 54;

function shapeSvg(c: Card, size = 12): string {
  const def = SHAPES[c.s];
  const cells = shapeCells(c.s, 0);
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX + 1;
  const h = Math.max(...ys) - minY + 1;
  const si = c.x ? specialIndex(c.s) : -1;
  const rects = cells
    .map(([x, y], i) => {
      const fill = i === si ? SPECIALS[c.x!].color : def.color;
      return `<rect x="${(x - minX) * size + 0.5}" y="${(y - minY) * size + 0.5}" width="${size - 1}" height="${size - 1}" rx="2" fill="${fill}"${i === si ? ' stroke="#fff" stroke-width="1.5"' : ''}/>`;
    })
    .join('');
  return `<svg class="shape" width="${w * size}" height="${h * size}" viewBox="0 0 ${w * size} ${h * size}">${rects}</svg>`;
}

const cardChip = (c: Card, extra = ''): string =>
  `<span class="chip" title="${cardText(c)}">${shapeSvg(c, 8)} ${cardName(c)}${extra}</span>`;

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;

  // Fight
  private f: Fight | null = null;
  private endTimer = 0;
  private floats: Float[] = [];
  private parts: Particle[] = [];
  private flashes: { y: number; t: number }[] = [];
  private bolt = 0;
  private boltFrom = { x: 0, y: 0 };
  private enemyShake = 0;
  private enemyHit = 0;
  private shake = 0;
  private hurtFlash = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private scale = 1;

  // Input
  private dir: 'left' | 'right' | null = null;
  private dirT = 0;
  private dirRepeat = 0;
  private softKey = false;
  private softTouch = false;
  private padHeld = new Map<number, { a: string; el: HTMLElement }>();
  private touch: { id: number; x0: number; y0: number; ax: number; ay: number; t0: number; moved: boolean } | null = null;

  // Other screens
  private rewards: Rewards | null = null;
  private picked = false;
  private relicPicked = false;
  private shop: ShopItem[] = [];
  private event: { def: EventDef; result: string | null } | null = null;
  private treasure: string | null = null;
  private end: { victory: boolean; score: number; shards: number; act: number; enemy: string } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    setMuted(this.meta.muted ?? false);
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'fight' && !this.modal && !this.f?.over) this.openModal({ kind: 'menu', confirm: false });
    });
    if (DEBUG) this.installDebug();
    this.render();
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
        body = `<div class="fight"><div class="cv-col"><div class="cv-wrap"><canvas id="cv"></canvas></div>${this.padView()}</div><aside class="side" id="side">${this.sideView()}</aside></div>`;
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
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  /** Updates the parts around the canvas without a full render. */
  private refresh(): void {
    if (this.screen !== 'fight') return this.render();
    const top = this.root.querySelector<HTMLElement>('header.top');
    if (top) top.outerHTML = this.topBar();
    const side = this.root.querySelector<HTMLElement>('#side');
    if (side) side.innerHTML = this.sideView();
    const old = this.root.querySelector('.modal');
    if (old) old.remove();
    if (this.modal) this.root.insertAdjacentHTML('beforeend', this.modalView());
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
    const hp = this.f && this.screen === 'fight' ? this.f.hp : h.hp;
    const relics = h.relics.map((id) => `<span class="relic" title="${RELICS[id].name}: ${RELICS[id].text}">${RELICS[id].icon}</span>`).join('');
    return `<header class="top">
      <span class="hp-text">❤️ ${Math.max(0, hp)}/${h.maxHp}</span>
      <span>💰 ${h.gold}</span>
      <span>${ACTS[Math.min(r.act, ACTS.length - 1)].icon} ${Math.min(r.act + 1, 3)}-${r.step + 1}</span>
      <span class="relics">${relics}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="deck" title="Piece bag">🎒</button>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const armory = LOCKED_ITEMS.map((id) => {
      const item = SHAPES[id] ?? SPECIALS[id] ?? RELICS[id];
      const kind = SHAPES[id] ? 'Shape' : SPECIALS[id] ? 'Special block' : 'Relic';
      const icon = SHAPES[id] ? shapeSvg({ s: id }, 9) : (SPECIALS[id] ?? RELICS[id]).icon;
      const text = SHAPES[id] ? SHAPES[id].text : SPECIALS[id] ? SPECIALS[id].text[0] : RELICS[id].text;
      const own = m.unlocked.includes(id);
      const cost = unlockCost(id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${icon}</span><span><b>${item.name}</b><small>${kind}: ${text}</small></span>
        ${own ? '<span class="ok">Owned</span>' : `<button data-act="unlock" data-id="${id}" ${m.shards < cost ? 'disabled' : ''}>💎 ${cost}</button>`}</div>`;
    }).join('');
    return `<div class="title">
      <div class="logo">${['#4cc9f0', '#f72585', '#ffd166', '#7ee08a'].map((c) => `<i style="background:${c}"></i>`).join('')}</div>
      <h1>Block Siege</h1>
      <p class="sub">Stack falling blocks. Every line you clear strikes the enemy above your well. Grow your piece bag over 3 acts and break the siege.</p>
      <div class="row">
        ${this.run ? `<button class="primary" data-act="continue">Continue run</button>` : ''}
        <button class="${this.run ? '' : 'primary'}" data-act="new">New run</button>
        <button data-act="help">How to play</button>
        <button class="icon-btn" data-act="mute">${isMuted() ? '🔇' : '🔊'}</button>
      </div>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best act ${m.bestAct} · Best score ${m.best} · Lines ${m.lines} · 💎 ${m.shards} shards</p>
      <h3>Armory</h3>
      <p class="hint">Spend shards from your runs to add new shapes, special blocks and relics to the pool.</p>
      <div class="armory">${armory}</div>
    </div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const act = ACTS[r.act];
    const track = PLAN.map((opts, i) => {
      const cls = i < r.step ? 'done' : i === r.step ? 'now' : '';
      const icons = opts.map((o) => ROOM_INFO[o].icon).join('');
      return `${i ? '<span class="link"></span>' : ''}<span class="node ${cls}">${icons}</span>`;
    }).join('');
    const rooms = PLAN[r.step]
      .map((room) => {
        const info = ROOM_INFO[room];
        let extra = '';
        if (room === 'fight' || room === 'elite' || room === 'boss') {
          const e = ENEMIES[pickEnemy(r, room)];
          extra = `<small class="foe">${e.icon} ${e.name} · ${Math.round(e.hp * act.hpMul)} HP</small>`;
        }
        return `<button class="room" data-act="room" data-room="${room}"><span class="big">${info.icon}</span><b>${info.name}</b><small>${info.text}</small>${extra}</button>`;
      })
      .join('');
    return `<div class="map">
      <h2>${act.icon} Act ${r.act + 1}: ${act.name}</h2>
      <div class="track">${track}</div>
      <p class="hint">Choose your next room.</p>
      <div class="rooms">${rooms}</div>
      <h3>Piece bag (${r.hero.deck.length})</h3>
      <div class="bag">${r.hero.deck.map((c) => cardChip(c)).join('')}</div>
      <p class="hint">Damage per attack unit: ${r.hero.power}</p>
    </div>`;
  }

  private padView(): string {
    const b = (inp: string, label: string, title: string): string => `<button class="padb" data-pad="${inp}" title="${title}">${label}</button>`;
    return `<div class="pad">
      ${b('hold', 'HOLD', 'Hold (C)')}${b('ccw', '⟲', 'Rotate left (Z)')}${b('cw', '⟳', 'Rotate right (↑)')}${b('left', '◀', 'Left')}${b('soft', '▼', 'Soft drop')}${b('right', '▶', 'Right')}${b('hard', '⤓', 'Hard drop (Space)')}
    </div>`;
  }

  private sideView(): string {
    const r = this.run!;
    const f = this.f;
    const e = f ? ENEMIES[f.enemy.id] : null;
    const moves = e
      ? e.moves
          .map((mv, i) => {
            const now = f && f.enemy.mi % e.moves.length === i;
            return `<li class="${now ? 'now' : ''}">${MOVE_INFO[mv.k].icon} ${MOVE_INFO[mv.k].text(f ? moveValue(f, mv) : mv.n)}</li>`;
          })
          .join('')
      : '';
    const relics = r.hero.relics.length
      ? r.hero.relics.map((id) => `<div class="rel"><span>${RELICS[id].icon}</span><span><b>${RELICS[id].name}</b> <small>${RELICS[id].text}</small></span></div>`).join('')
      : '<p class="hint">No relics yet.</p>';
    return `${e ? `<h3>${e.icon} ${e.name}</h3><p class="hint">Attacks every ${f!.enemy.every.toFixed(1)} s, in this order:</p><ol class="moves">${moves}</ol>` : ''}
      <h3>Relics</h3>${relics}
      <h3>Controls</h3>
      <p class="hint">← → move · ↓ soft drop · Space hard drop · ↑ / X rotate right · Z rotate left · C / Shift hold · Esc menu</p>
      <p class="hint">Touch: drag to move, tap to rotate, swipe down to drop, swipe up to hold.</p>`;
  }

  private rewardView(): string {
    const rw = this.rewards!;
    const h = this.run!.hero;
    const picks = rw.picks
      .map((p, i) => {
        const t = pickText(h, p);
        const shape = p.kind === 'card' ? shapeSvg(p.card, 14) : `<span class="big">${t.icon}</span>`;
        return `<button class="pick ${this.picked ? 'off' : ''}" data-act="pick" data-i="${i}" ${this.picked ? 'disabled' : ''}>${shape}<b>${t.title}</b><small>${t.text}</small></button>`;
      })
      .join('');
    const relic = rw.relic ? `<p class="result">Relic: ${RELICS[rw.relic].icon} <b>${RELICS[rw.relic].name}</b> — ${RELICS[rw.relic].text}</p>` : '';
    const choice = rw.relicChoice.length
      ? `<h3>Choose a relic</h3><div class="picks">${rw.relicChoice
          .map(
            (id) =>
              `<button class="pick ${this.relicPicked ? 'off' : ''}" data-act="relic-pick" data-id="${id}" ${this.relicPicked ? 'disabled' : ''}><span class="big">${RELICS[id].icon}</span><b>${RELICS[id].name}</b><small>${RELICS[id].text}</small></button>`,
          )
          .join('')}</div>`
      : '';
    return `<div class="reward">
      <h2>Victory! <small>+${rw.gold} gold</small></h2>
      ${relic}${choice}
      <h3>Choose one</h3>
      <div class="picks">${picks}</div>
      <button class="primary" data-act="advance">${this.picked ? 'Continue' : 'Skip'}</button>
    </div>`;
  }

  private shopView(): string {
    const h = this.run!.hero;
    const items = this.shop
      .map((it, i) => {
        let icon = '';
        let title = '';
        let text = '';
        switch (it.kind) {
          case 'card':
            icon = shapeSvg(it.card, 14);
            title = cardName(it.card);
            text = cardText(it.card);
            break;
          case 'relic':
            icon = `<span class="big">${RELICS[it.id].icon}</span>`;
            title = RELICS[it.id].name;
            text = RELICS[it.id].text;
            break;
          case 'heal':
            icon = '<span class="big">🍖</span>';
            title = `Heal ${it.n}`;
            text = 'Restore HP.';
            break;
          case 'remove':
            icon = '<span class="big">🗑️</span>';
            title = 'Remove a piece';
            text = 'Take a piece out of your bag.';
            break;
          case 'imbue':
            icon = `<span class="big">${SPECIALS[it.x].icon}</span>`;
            title = `Add ${SPECIALS[it.x].name}`;
            text = `Put it on a plain piece. ${SPECIALS[it.x].text[0]}`;
            break;
          case 'upgrade':
            icon = '<span class="big">⬆️</span>';
            title = 'Upgrade a special';
            text = 'A special block goes to level 2.';
            break;
        }
        const can = !it.sold && h.gold >= it.cost && this.shopUsable(it);
        return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${can ? '' : 'disabled'}>${icon}<b>${title}</b><small>${text}</small><span class="cost">${it.sold ? 'Sold' : `💰 ${it.cost}`}</span></button>`;
      })
      .join('');
    return `<div class="shopv"><h2>🛒 Shop</h2><p class="hint">You have 💰 ${h.gold}.</p><div class="picks">${items}</div><button class="primary" data-act="advance">Leave</button></div>`;
  }

  private shopUsable(it: ShopItem): boolean {
    const h = this.run!.hero;
    if (it.kind === 'remove') return h.deck.length > 5;
    if (it.kind === 'imbue') return plainCards(h).length > 0;
    if (it.kind === 'upgrade') return upgradable(h).length > 0;
    if (it.kind === 'heal') return h.hp < h.maxHp;
    return true;
  }

  private restView(): string {
    const h = this.run!.hero;
    const heal = Math.round(h.maxHp * 0.3);
    return `<div class="restv"><h2>🔥 Campfire</h2><p class="hint">Rest a while, or work on your stones.</p>
      <div class="picks">
        <button class="pick" data-act="rest-heal"><span class="big">💤</span><b>Rest</b><small>Heal ${heal} HP.</small></button>
        <button class="pick" data-act="rest-up" ${upgradable(h).length ? '' : 'disabled'}><span class="big">⬆️</span><b>Upgrade</b><small>A special block goes to level 2.</small></button>
        <button class="pick" data-act="rest-remove" ${h.deck.length > 5 ? '' : 'disabled'}><span class="big">🗑️</span><b>Discard</b><small>Remove a piece from your bag.</small></button>
      </div></div>`;
  }

  private eventView(): string {
    const ev = this.event!;
    const r = this.run!;
    const opts = ev.result
      ? `<p class="result">${ev.result}</p><button class="primary" data-act="advance">Continue</button>`
      : `<div class="opts">${ev.def.options.map((o, i) => `<button data-act="event-opt" data-i="${i}" ${o.can && !o.can(r) ? 'disabled' : ''}>${o.label}</button>`).join('')}</div>`;
    return `<div class="eventv"><span class="huge">${ev.def.icon}</span><h2>${ev.def.title}</h2><p>${ev.def.text}</p>${opts}</div>`;
  }

  private treasureView(): string {
    const id = this.treasure;
    return `<div class="eventv"><span class="huge">🎁</span><h2>Treasure</h2>${
      id ? `<p class="result">You find ${RELICS[id].icon} <b>${RELICS[id].name}</b>: ${RELICS[id].text}</p>` : '<p>The chest is empty. You take 30 gold.</p>'
    }<button class="primary" data-act="advance">Continue</button></div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <span class="huge">${e.victory ? '🏆' : '💥'}</span>
      <h1>${e.victory ? 'Siege broken!' : 'Your well fell'}</h1>
      <p>${e.victory ? 'You beat all three acts.' : `Defeated by ${e.enemy} in act ${e.act + 1}.`}</p>
      <p class="score">Score <b>${e.score}</b> · 💎 +${e.shards} shards</p>
      <div class="row"><button class="primary" data-act="new">New run</button><button data-act="title">Title</button></div>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    let inner = '';
    if (m.kind === 'help') {
      inner = `<h2>How to play</h2>
        <ul>
          <li>Pieces fall into a 10×20 well. Fill a whole row to clear it. Each clear attacks the enemy above the well.</li>
          <li>Damage grows with the rows you clear at once: 1 / 3 / 6 / 10 attack units for 1 / 2 / 3 / 4 rows. Your damage per unit starts at 2.</li>
          <li>T-spins (rotate a T into a tight slot) deal 4 / 8 / 12 units. Back-to-back Tetrises or T-spins deal +50%. Clears in a row add a combo bonus. A perfect clear adds 10 units.</li>
          <li>The enemy acts on a timer. It pushes garbage rows, hits you, speeds up the drop, locks cells, hides your queue, adds Rubble pieces or raises a shield.</li>
          <li>A locked row (🔒) does not clear the first time. It unlocks and clears with the next piece.</li>
          <li>If the stack reaches the top, you lose HP and the top of the well is wiped.</li>
          <li>Special blocks act when their row clears: 🔥 burn, ❄️ slow the enemy timer, ❤️ heal, 💣 clear the area, 🪙 gold, ⭐ more damage.</li>
          <li>Your piece bag works like a deck: every piece comes once before the bag reshuffles. Add, upgrade and remove pieces between fights.</li>
          <li>Keys: ← → move, ↓ soft drop, Space hard drop, ↑ or X rotate right, Z rotate left, C or Shift hold, Esc menu.</li>
          <li>Touch: drag left or right to move, tap the right half to rotate right and the left half to rotate left, swipe down to hard drop, swipe up to hold. Or use the buttons.</li>
          <li>Map: 3 acts with fights, elites, shops, campfires, events and treasure. Each act ends with a boss.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>`;
    } else if (m.kind === 'menu') {
      const s = this.meta.settings;
      inner = m.confirm
        ? `<h2>Abandon this run?</h2><p>The run ends and counts as a loss.</p><div class="row"><button class="danger" data-act="abandon-yes">Abandon</button><button data-act="modal-close">Cancel</button></div>`
        : `<h2>Menu</h2>
          <button class="primary" data-act="modal-close">Resume</button>
          <label class="set">DAS (delay before auto shift): <b id="das-v">${s.das} ms</b><input type="range" min="40" max="300" step="10" value="${s.das}" data-set="das"></label>
          <label class="set">ARR (auto repeat rate): <b id="arr-v">${s.arr} ms</b><input type="range" min="0" max="120" step="5" value="${s.arr}" data-set="arr"></label>
          <button data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
          ${this.run ? '<button data-act="abandon">Abandon run</button>' : ''}
          <button data-act="title">Title screen</button>`;
    } else if (m.kind === 'deck') {
      const deck = this.run?.hero.deck ?? [];
      inner = `<h2>Piece bag (${deck.length})</h2><p class="hint">Each piece comes once before the bag reshuffles.</p>
        <div class="bag">${deck.map((c) => cardChip(c)).join('')}</div>
        <button class="primary" data-act="modal-close">Close</button>`;
    } else {
      const deck = this.run!.hero.deck;
      inner = `<h2>${m.title}</h2><div class="picks">${deck
        .map((c, i) =>
          m.filter(c) ? `<button class="pick small" data-act="pick-card" data-i="${i}">${shapeSvg(c, 12)}<b>${cardName(c)}</b></button>` : '',
        )
        .join('')}</div><button data-act="modal-close">Cancel</button>`;
    }
    return `<div class="modal"><div class="sheet">${inner}</div></div>`;
  }

  private openModal(m: Modal | null): void {
    this.modal = m;
    this.releaseAll();
    if (this.screen === 'fight') this.refresh();
    else this.render();
  }

  // ---------- Clicks ----------

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    const key = el.dataset.set as 'das' | 'arr' | undefined;
    if (!key) return;
    this.meta.settings[key] = Number(el.value);
    saveMeta(this.meta);
    const lab = this.root.querySelector(`#${key}-v`);
    if (lab) lab.textContent = `${el.value} ms`;
  }

  private onClick(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    initAudio();
    const act = el.dataset.act!;
    const r = this.run;
    switch (act) {
      case 'new':
        this.newRun();
        break;
      case 'continue':
        this.screen = 'map';
        this.render();
        break;
      case 'help':
        this.openModal({ kind: 'help' });
        break;
      case 'deck':
        this.openModal({ kind: 'deck' });
        break;
      case 'menu':
        this.openModal({ kind: 'menu', confirm: false });
        break;
      case 'modal-close':
        this.openModal(null);
        break;
      case 'mute':
        this.meta.muted = toggleMute();
        saveMeta(this.meta);
        if (this.screen === 'fight') this.refresh();
        else this.render();
        break;
      case 'title':
        this.modal = null;
        this.f = null;
        this.screen = 'title';
        this.run = loadRun();
        this.render();
        break;
      case 'abandon':
        this.openModal({ kind: 'menu', confirm: true });
        break;
      case 'abandon-yes':
        this.modal = null;
        if (r) this.finishRun(false, 'giving up');
        break;
      case 'unlock': {
        const id = el.dataset.id!;
        const cost = unlockCost(id);
        if (this.meta.shards >= cost && !this.meta.unlocked.includes(id)) {
          this.meta.shards -= cost;
          this.meta.unlocked.push(id);
          saveMeta(this.meta);
          sfx.item();
          this.toast('Unlocked! It shows up in your next run.');
          this.render();
        }
        break;
      }
      case 'room':
        this.enterRoom(el.dataset.room as Room);
        break;
      case 'pick': {
        if (!r || !this.rewards || this.picked) return;
        applyPick(r.hero, this.rewards.picks[Number(el.dataset.i)]);
        this.picked = true;
        sfx.item();
        this.render();
        break;
      }
      case 'relic-pick':
        if (!r || this.relicPicked) return;
        addRelic(r.hero, el.dataset.id!);
        this.relicPicked = true;
        sfx.item();
        this.render();
        break;
      case 'advance':
        this.next();
        break;
      case 'buy':
        this.buy(Number(el.dataset.i));
        break;
      case 'rest-heal':
        if (!r) return;
        r.hero.hp = Math.min(r.hero.maxHp, r.hero.hp + Math.round(r.hero.maxHp * 0.3));
        sfx.heal();
        this.next();
        break;
      case 'rest-up':
        this.openModal({
          kind: 'pick',
          title: 'Upgrade which special block?',
          filter: (c) => !!c.x && (c.l ?? 1) < 2,
          done: (i) => {
            r!.hero.deck[i] = { ...r!.hero.deck[i], l: 2 };
            sfx.item();
            this.next();
          },
        });
        break;
      case 'rest-remove':
        this.openModal({
          kind: 'pick',
          title: 'Remove which piece?',
          filter: () => true,
          done: (i) => {
            r!.hero.deck.splice(i, 1);
            sfx.item();
            this.next();
          },
        });
        break;
      case 'pick-card': {
        const m = this.modal;
        if (m?.kind !== 'pick') return;
        this.modal = null;
        m.done(Number(el.dataset.i));
        if (this.screen === 'shop' || this.screen === 'rest') this.render();
        break;
      }
      case 'event-opt': {
        if (!r || !this.event) return;
        const opt = this.event.def.options[Number(el.dataset.i)];
        this.event.result = opt.run(r, rngFor(r, 'eventroll', r.act, r.step));
        sfx.item();
        this.render();
        break;
      }
    }
  }

  private buy(i: number): void {
    const r = this.run!;
    const h = r.hero;
    const it = this.shop[i];
    if (!it || it.sold || h.gold < it.cost) return sfx.deny();
    const pay = (): void => {
      h.gold -= it.cost;
      it.sold = true;
      sfx.coin();
    };
    switch (it.kind) {
      case 'card':
        h.deck.push({ ...it.card });
        pay();
        break;
      case 'relic':
        addRelic(h, it.id);
        pay();
        break;
      case 'heal':
        h.hp = Math.min(h.maxHp, h.hp + it.n);
        pay();
        break;
      case 'remove':
        this.openModal({ kind: 'pick', title: 'Remove which piece?', filter: () => true, done: (k) => (h.deck.splice(k, 1), pay()) });
        return;
      case 'imbue':
        this.openModal({ kind: 'pick', title: `Put ${SPECIALS[it.x].icon} ${SPECIALS[it.x].name} on which piece?`, filter: (c) => !c.x, done: (k) => ((h.deck[k] = { ...h.deck[k], x: it.x, l: 1 }), pay()) });
        return;
      case 'upgrade':
        this.openModal({ kind: 'pick', title: 'Upgrade which special block?', filter: (c) => !!c.x && (c.l ?? 1) < 2, done: (k) => ((h.deck[k] = { ...h.deck[k], l: 2 }), pay()) });
        return;
    }
    this.render();
  }

  // ---------- Run flow ----------

  private newRun(): void {
    this.run = newRun(randomSeedText(), this.meta);
    this.meta.runs++;
    saveMeta(this.meta);
    saveRun(this.run);
    this.modal = null;
    this.screen = 'map';
    sfx.item();
    this.render();
  }

  private enterRoom(room: Room): void {
    const r = this.run!;
    switch (room) {
      case 'fight':
      case 'elite':
      case 'boss':
        this.startFight(room);
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
        else r.hero.gold += 30;
        this.treasure = id;
        sfx.item();
        this.screen = 'treasure';
        break;
      }
    }
    this.render();
  }

  private startFight(room: Room): void {
    const r = this.run!;
    const h = r.hero;
    const kind: FightKind = roomKind(room);
    this.f = startFight({
      kind,
      act: r.act,
      enemyId: pickEnemy(r, room),
      deck: h.deck,
      hp: h.hp,
      maxHp: h.maxHp,
      power: h.power,
      relics: h.relics,
      seed: fightSeed(r, room),
    });
    this.floats = [];
    this.parts = [];
    this.flashes = [];
    this.endTimer = 0;
    this.shake = 0;
    this.releaseAll();
    this.screen = 'fight';
    this.render();
    const e = ENEMIES[this.f.enemy.id];
    this.addFloat(LW / 2, WY + 120, kind === 'boss' ? `BOSS: ${e.name}` : `${e.name}`, '#fff', 20);
  }

  private finishFight(): void {
    const f = this.f!;
    const r = this.run!;
    r.hero.hp = f.hp;
    r.lines += f.lines;
    r.best = Math.max(r.best, f.best);
    this.meta.lines += f.lines;
    saveMeta(this.meta);
    if (f.over === 'lose') {
      this.finishRun(false, ENEMIES[f.enemy.id].name);
      return;
    }
    r.kills++;
    this.rewards = fightRewards(r, f.kind, f.gold);
    r.hero.gold += this.rewards.gold;
    if (this.rewards.relic) addRelic(r.hero, this.rewards.relic);
    this.picked = false;
    this.relicPicked = this.rewards.relicChoice.length === 0;
    this.f = null;
    this.screen = 'reward';
    this.render();
  }

  private next(): void {
    const r = this.run!;
    this.modal = null;
    if (advance(r)) {
      this.finishRun(true, '');
      return;
    }
    saveRun(r);
    this.screen = 'map';
    this.render();
  }

  private finishRun(victory: boolean, enemy: string): void {
    const r = this.run!;
    const sc = score(r, victory);
    const shards = shardsFor(sc);
    const m = this.meta;
    m.shards += shards;
    if (victory) m.wins++;
    m.bestAct = Math.max(m.bestAct, victory ? 3 : r.act + 1);
    m.best = Math.max(m.best, sc);
    saveMeta(m);
    clearRun();
    this.end = { victory, score: sc, shards, act: r.act, enemy };
    this.run = null;
    this.f = null;
    this.modal = null;
    this.screen = 'end';
    if (victory) sfx.win();
    else sfx.lose();
    this.render();
  }

  // ---------- Fight input ----------

  private doInput(inp: Input): void {
    const f = this.f;
    if (!f || f.over || this.modal) return;
    const pieces = f.pieces;
    const ok = fightInput(f, inp);
    if (inp === 'hard' && f.pieces > pieces) {
      sfx.hard();
      this.shake = Math.max(this.shake, 2);
    } else if (ok && (inp === 'left' || inp === 'right')) sfx.move();
    else if (ok && (inp === 'cw' || inp === 'ccw')) sfx.rotate();
  }

  private releaseAll(): void {
    this.dir = null;
    this.softKey = false;
    this.softTouch = false;
    this.touch = null;
  }

  private press(d: 'left' | 'right'): void {
    this.dir = d;
    this.dirT = 0;
    this.dirRepeat = 0;
    this.doInput(d);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (this.screen !== 'fight') {
      if (down && e.key === 'Escape' && this.modal) this.openModal(null);
      return;
    }
    const k = e.key;
    const map: Record<string, string> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowDown: 'soft',
      ArrowUp: 'cw',
      x: 'cw',
      X: 'cw',
      z: 'ccw',
      Z: 'ccw',
      Control: 'ccw',
      ' ': 'hard',
      c: 'hold',
      C: 'hold',
      Shift: 'hold',
      Escape: 'menu',
      p: 'menu',
      P: 'menu',
    };
    const a = map[k];
    if (!a) return;
    e.preventDefault();
    if (!down) {
      if (a === 'soft') this.softKey = false;
      if ((a === 'left' || a === 'right') && this.dir === a) this.dir = null;
      return;
    }
    if (a === 'menu') {
      this.openModal(this.modal ? null : { kind: 'menu', confirm: false });
      return;
    }
    if (this.modal || e.repeat) return;
    initAudio();
    if (a === 'left' || a === 'right') this.press(a);
    else if (a === 'soft') this.softKey = true;
    else this.doInput(a as Input);
  }

  private toLogical(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / this.scale, y: (e.clientY - rect.top) / this.scale };
  }

  private onDown(e: PointerEvent): void {
    const pad = (e.target as HTMLElement).closest<HTMLElement>('[data-pad]');
    if (pad && this.screen === 'fight') {
      e.preventDefault();
      initAudio();
      const a = pad.dataset.pad!;
      this.padHeld.set(e.pointerId, { a, el: pad });
      if (a === 'left' || a === 'right') this.press(a);
      else if (a === 'soft') this.softTouch = true;
      else this.doInput(a as Input);
      pad.classList.add('down');
      return;
    }
    if (e.target !== this.canvas || this.modal) return;
    e.preventDefault();
    initAudio();
    const p = this.toLogical(e);
    this.touch = { id: e.pointerId, x0: p.x, y0: p.y, ax: p.x, ay: p.y, t0: performance.now(), moved: false };
  }

  private onMove(e: PointerEvent): void {
    const t = this.touch;
    if (!t || t.id !== e.pointerId || !this.canvas) return;
    const p = this.toLogical(e);
    const step = C * 1.1;
    while (p.x - t.ax >= step) {
      this.doInput('right');
      t.ax += step;
      t.moved = true;
    }
    while (t.ax - p.x >= step) {
      this.doInput('left');
      t.ax -= step;
      t.moved = true;
    }
    const dy = p.y - t.y0;
    if (Math.abs(p.x - t.x0) > 8 || Math.abs(dy) > 8) t.moved = true;
    // A slow drag down soft-drops.
    this.softTouch = dy > C * 1.5 && Math.abs(p.x - t.x0) < C * 2;
  }

  private onUp(e: PointerEvent): void {
    const held = this.padHeld.get(e.pointerId);
    if (held) {
      this.padHeld.delete(e.pointerId);
      held.el.classList.remove('down');
      if (held.a === this.dir) this.dir = null;
      if (held.a === 'soft') this.softTouch = false;
    }
    const t = this.touch;
    if (!t || t.id !== e.pointerId || !this.canvas) return;
    this.touch = null;
    this.softTouch = false;
    const p = this.toLogical(e);
    const dt = performance.now() - t.t0;
    const dx = p.x - t.x0;
    const dy = p.y - t.y0;
    if (!t.moved && dt < 400) {
      this.doInput(p.x < LW / 2 ? 'ccw' : 'cw');
    } else if (dy > 60 && dy / Math.max(dt, 1) > 0.45 && Math.abs(dy) > Math.abs(dx)) {
      this.doInput('hard');
    } else if (dy < -50 && Math.abs(dy) > Math.abs(dx) && dt < 400) {
      this.doInput('hold');
    }
  }

  // ---------- Loop ----------

  private startLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const loop = (now: number): void => {
      if (this.screen !== 'fight' || !this.ctx) {
        this.raf = 0;
        return;
      }
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.raf = requestAnimationFrame(loop);
      this.update(dt);
      if (this.screen === 'fight') this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    const f = this.f;
    if (!f) return;
    const live = !this.modal && !f.over && !(DEBUG && FAST);
    if (live) {
      // DAS and ARR for held left/right.
      if (this.dir) {
        const s = this.meta.settings;
        this.dirT += dt * 1000;
        if (this.dirT >= s.das) {
          if (s.arr <= 0) {
            for (let i = 0; i < W; i++) fightInput(f, this.dir);
          } else {
            this.dirRepeat += dt * 1000;
            while (this.dirRepeat >= s.arr) {
              this.dirRepeat -= s.arr;
              fightInput(f, this.dir);
            }
          }
        }
      }
      fightTick(f, dt, this.softKey || this.softTouch);
    }
    this.drainEvents();
    if (f.over) {
      this.endTimer += dt;
      if (this.endTimer >= (FAST ? 0 : 1.4)) this.finishFight();
    }
    // Effects
    for (const fl of this.floats) fl.t += dt;
    this.floats = this.floats.filter((fl) => fl.t < 1.3);
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
    }
    this.parts = this.parts.filter((p) => p.t < 0.9);
    for (const fl of this.flashes) fl.t += dt;
    this.flashes = this.flashes.filter((fl) => fl.t < 0.3);
    this.bolt = Math.max(0, this.bolt - dt);
    this.enemyShake = Math.max(0, this.enemyShake - dt * 20);
    this.enemyHit = Math.max(0, this.enemyHit - dt);
    this.shake = Math.max(0, this.shake - dt * 20);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
  }

  private addFloat(x: number, y: number, text: string, color: string, size = 16): void {
    this.floats.push({ x, y, text, color, t: 0, size });
  }

  private burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 180;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, color, t: Math.random() * 0.3 });
    }
  }

  private drainEvents(): void {
    const f = this.f!;
    if (!f.ev.length) return;
    const evs: FEvent[] = f.ev.splice(0);
    let topDirty = false;
    let sideDirty = false;
    for (const ev of evs) {
      switch (ev.t) {
        case 'lock':
          sfx.lock();
          break;
        case 'clear': {
          sfx.clear(ev.lines, f.combo);
          for (const row of ev.rows) {
            const y = WY + (row - HIDDEN) * C + C / 2;
            this.flashes.push({ y: row, t: 0 });
            for (let x = 0; x < W; x += 2) this.burst(WX + x * C + C, y, ['#fff', '#f72585', '#4cc9f0'][x % 3], 2);
          }
          const midRow = ev.rows.length ? ev.rows[Math.floor(ev.rows.length / 2)] : H - 1;
          this.boltFrom = { x: WX + (W * C) / 2, y: WY + (midRow - HIDDEN) * C };
          this.bolt = 0.25;
          this.enemyShake = 4 + ev.lines * 2;
          this.enemyHit = 0.25;
          setTimeout(() => (FAST ? null : sfx.strike()), 60);
          const big = ev.lines >= 4 || ev.label.includes('T-Spin') || ev.label.includes('B2B');
          if (ev.lines > 1 || big) this.addFloat(WX + (W * C) / 2, this.boltFrom.y, ev.label, big ? '#ffd166' : '#fff', big ? 22 : 17);
          this.addFloat(EX + 6, EY - 6, ev.shielded >= ev.dmg ? `🛡️ ${ev.dmg}` : `-${ev.dmg}`, ev.shielded ? '#a2d2ff' : '#ff4d6d', 18 + Math.min(14, ev.dmg / 2));
          if (ev.shielded) sfx.shield();
          if (big) this.shake = 6;
          break;
        }
        case 'special':
          this.addFloat(WX + (W * C) / 2, WY + 200, ev.text, SPECIALS[ev.id]?.color ?? '#fff', 18);
          if (ev.id === 'fire') sfx.fire();
          else if (ev.id === 'ice') sfx.ice();
          else if (ev.id === 'bomb') {
            sfx.bomb();
            this.shake = 8;
          } else if (ev.id === 'gold') sfx.coin();
          else sfx.item();
          break;
        case 'enemy': {
          const k = ev.move.k;
          this.addFloat(EX + 120, EY + 30, `${MOVE_INFO[k].icon} ${ev.text}`, '#ffd6e0', 16);
          if (k === 'garbage') {
            sfx.garbage();
            this.shake = 7;
          } else if (k === 'speed') sfx.speed();
          else if (k === 'lock') sfx.lockCells();
          else if (k === 'blind') sfx.blind();
          else if (k === 'shield' || k === 'heal') sfx.enemyBuff();
          else if (k === 'junk') sfx.garbage();
          this.enemyShake = 3;
          sideDirty = true;
          break;
        }
        case 'hurt':
          sfx.hurt();
          this.hurtFlash = 0.4;
          this.shake = Math.max(this.shake, 6);
          this.addFloat(LW / 2, STRIP - 18, `-${ev.n} HP`, '#ff4d6d', 20);
          topDirty = true;
          break;
        case 'heal':
          sfx.heal();
          this.addFloat(LW / 2, STRIP - 18, `+${ev.n} HP`, '#7ee08a', 18);
          topDirty = true;
          break;
        case 'burn':
          sfx.burn();
          this.addFloat(EX + 10 + Math.random() * 20, EY - 20, `-${ev.n}`, '#ff9f43', 13);
          break;
        case 'topout':
          sfx.topout();
          this.addFloat(WX + (W * C) / 2, WY + 160, 'TOP OUT!', '#ff4d6d', 28);
          for (let x = 0; x < W; x++) this.burst(WX + x * C + C / 2, WY + 100, '#ff4d6d', 3);
          break;
        case 'unlock':
          sfx.unlock();
          this.addFloat(WX + (W * C) / 2, WY + 260, `🔓 ${ev.n}`, '#ffd166', 16);
          break;
        case 'hold':
          sfx.hold();
          break;
        case 'thorns':
          this.addFloat(EX + 6, EY - 24, `🌵 -${ev.n}`, '#7ee08a', 15);
          break;
      }
    }
    if (f.over === 'win') {
      this.addFloat(LW / 2, WY + 200, 'VICTORY', '#ffd166', 34);
      this.burst(EX, EY, '#ffd166', 30);
      sfx.win();
    } else if (f.over === 'lose' && this.endTimer === 0) {
      this.addFloat(LW / 2, WY + 200, 'DEFEAT', '#ff4d6d', 34);
    }
    if (topDirty || sideDirty) {
      const top = this.root.querySelector<HTMLElement>('header .hp-text');
      if (top) top.textContent = `❤️ ${Math.max(0, f.hp)}/${f.maxHp}`;
    }
    if (sideDirty) {
      const side = this.root.querySelector<HTMLElement>('#side');
      if (side) side.innerHTML = this.sideView();
    }
  }

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const top = this.root.querySelector('header.top')?.getBoundingClientRect().height ?? 0;
    const pad = this.root.querySelector<HTMLElement>('.pad');
    const padH = pad && getComputedStyle(pad).display !== 'none' ? pad.getBoundingClientRect().height + 8 : 0;
    const availW = Math.max(200, wrap.clientWidth || LW);
    const availH = Math.max(300, window.innerHeight - top - padH - 20);
    this.scale = Math.min(availW / LW, availH / LH, 1.6);
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = `${Math.floor(LW * this.scale)}px`;
    cv.style.height = `${Math.floor(LH * this.scale)}px`;
    cv.width = Math.floor(LW * this.scale * dpr);
    cv.height = Math.floor(LH * this.scale * dpr);
    this.ctx?.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, 0, 0);
  }

  // ---------- Canvas drawing ----------

  private cell(x: number, y: number, color: string, alpha = 1, size = C): void {
    const g = this.ctx!;
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(x + 1, y + 1, size - 2, size - 2);
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fillRect(x + 1, y + 1, size - 2, Math.max(2, size * 0.15));
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + 1, y + size - 1 - Math.max(2, size * 0.12), size - 2, Math.max(2, size * 0.12));
    g.globalAlpha = 1;
  }

  private emoji(text: string, x: number, y: number, size: number): void {
    const g = this.ctx!;
    g.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x, y);
  }

  private colorOf(v: number): string {
    const c = cellColor(v);
    if (c === GARBAGE) return '#5c5470';
    return SHAPES[SHAPE_BY_INDEX[c]]?.color ?? '#888';
  }

  private miniPiece(c: Card, cx: number, cy: number, size: number, alpha = 1): void {
    const cells = shapeCells(c.s, 0);
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX + 1;
    const h = Math.max(...ys) - minY + 1;
    const ox = cx - (w * size) / 2;
    const oy = cy - (h * size) / 2;
    const si = c.x ? specialIndex(c.s) : -1;
    cells.forEach(([x, y], i) => {
      const px = ox + (x - minX) * size;
      const py = oy + (y - minY) * size;
      this.cell(px, py, SHAPES[c.s].color, alpha, size);
      if (i === si) this.emoji(SPECIALS[c.x!].icon, px + size / 2, py + size / 2 + 1, size * 0.8);
    });
  }

  private draw(): void {
    const g = this.ctx;
    const f = this.f;
    if (!g || !f) return;
    const act = ACTS[f.act];
    g.save();
    g.clearRect(0, 0, LW, LH);
    g.fillStyle = act.bg;
    g.fillRect(0, 0, LW, LH);
    if (this.shake > 0) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.drawEnemy(f);
    this.drawWell(f);
    this.drawSides(f);
    // Bolt from the cleared rows to the enemy.
    if (this.bolt > 0) {
      g.strokeStyle = `rgba(255,220,120,${this.bolt * 4})`;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(this.boltFrom.x, this.boltFrom.y);
      const mx = (this.boltFrom.x + EX) / 2 + (Math.random() - 0.5) * 30;
      g.lineTo(mx, (this.boltFrom.y + EY) / 2);
      g.lineTo(EX, EY);
      g.stroke();
    }
    for (const p of this.parts) {
      g.globalAlpha = Math.max(0, 1 - p.t / 0.9);
      g.fillStyle = p.color;
      g.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    g.globalAlpha = 1;
    for (const fl of this.floats) {
      g.globalAlpha = Math.max(0, 1 - fl.t / 1.3);
      g.font = `800 ${fl.size}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      const y = fl.y - fl.t * 30;
      g.strokeText(fl.text, fl.x, y);
      g.fillStyle = fl.color;
      g.fillText(fl.text, fl.x, y);
    }
    g.globalAlpha = 1;
    if (this.hurtFlash > 0) {
      g.fillStyle = `rgba(255,40,80,${this.hurtFlash * 0.5})`;
      g.fillRect(0, 0, LW, LH);
    }
    if (this.modal?.kind === 'menu') {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(0, 0, LW, LH);
    }
    g.restore();
  }

  private drawEnemy(f: Fight): void {
    const g = this.ctx!;
    const e = f.enemy;
    const def = ENEMIES[e.id];
    // Panel
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 0, LW, STRIP);
    const sx = this.enemyShake ? (Math.random() - 0.5) * this.enemyShake : 0;
    if (this.enemyHit > 0) {
      g.fillStyle = `rgba(255,80,120,${this.enemyHit * 2})`;
      g.beginPath();
      g.arc(EX, EY, 40, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = f.over === 'win' ? 0.3 : 1;
    const bob = Math.sin(f.time * 2) * 2;
    this.emoji(def.icon, EX + sx, EY + bob, 56);
    g.globalAlpha = 1;
    // Name and HP
    const bx = 108;
    const bw = LW - bx - 10;
    g.fillStyle = '#f1eaf9';
    g.font = '700 15px system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText(`${def.name}${f.kind === 'boss' ? ' 👑' : f.kind === 'elite' ? ' 💀' : ''}`, bx, 20);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(bx, 27, bw, 14);
    g.fillStyle = '#f72585';
    g.fillRect(bx, 27, (bw * e.hp) / e.max, 14);
    if (e.shield > 0) {
      g.fillStyle = 'rgba(162,210,255,0.6)';
      g.fillRect(bx, 27, Math.min(bw, (bw * e.shield) / e.max), 5);
    }
    g.fillStyle = '#fff';
    g.font = '700 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(`${e.hp} / ${e.max}${e.shield ? `  🛡️${e.shield}` : ''}`, bx + bw / 2, 38);
    // Intent and timer
    const mv = curMove(f);
    const info = MOVE_INFO[mv.k];
    g.textAlign = 'left';
    g.font = '13px system-ui, sans-serif';
    g.fillStyle = '#ffd6e0';
    g.fillText(`${info.icon} ${info.text(moveValue(f, mv))}`, bx, 60);
    const pct = Math.max(0, Math.min(1, 1 - e.timer / e.every));
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(bx, 66, bw, 7);
    g.fillStyle = pct > 0.8 ? '#ff4d6d' : e.slow > 0 ? '#a2d2ff' : '#ffd166';
    g.fillRect(bx, 66, bw * pct, 7);
    g.font = '11px system-ui, sans-serif';
    g.fillStyle = '#a99bbd';
    g.textAlign = 'right';
    g.fillText(`${Math.max(0, e.timer).toFixed(1)}s`, bx + bw, 86);
    // Status badges
    const badges: string[] = [];
    if (e.burn > 0) badges.push(`🔥${Math.ceil(e.burn)}`);
    if (e.slow > 0) badges.push(`❄️${e.slow.toFixed(0)}s`);
    if (f.speedT > 0) badges.push(`⏩${f.speedT.toFixed(0)}s`);
    if (blinded(f)) badges.push(`🌫️${f.blindT.toFixed(0)}s`);
    g.textAlign = 'left';
    g.font = '12px system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.fillText(badges.join('  '), bx, 86);
    // Hero HP
    const hy = 98;
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(8, hy, LW - 16, 14);
    g.fillStyle = f.hp < f.maxHp * 0.3 ? '#ff4d6d' : '#7ee08a';
    g.fillRect(8, hy, ((LW - 16) * f.hp) / f.maxHp, 14);
    g.fillStyle = '#10131a';
    g.font = '700 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(`You ❤️ ${f.hp} / ${f.maxHp}`, LW / 2, hy + 11);
  }

  private drawWell(f: Fight): void {
    const g = this.ctx!;
    const w = f.well;
    const ww = W * C;
    const wh = (H - HIDDEN) * C;
    g.fillStyle = 'rgba(8,6,14,0.85)';
    g.fillRect(WX, WY, ww, wh);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    for (let x = 1; x < W; x++) {
      g.beginPath();
      g.moveTo(WX + x * C + 0.5, WY);
      g.lineTo(WX + x * C + 0.5, WY + wh);
      g.stroke();
    }
    for (let y = 1; y < H - HIDDEN; y++) {
      g.beginPath();
      g.moveTo(WX, WY + y * C + 0.5);
      g.lineTo(WX + ww, WY + y * C + 0.5);
      g.stroke();
    }
    // Danger glow when the stack is high.
    let top = H;
    for (let i = 0; i < w.grid.length; i++)
      if (w.grid[i]) {
        top = Math.floor(i / W);
        break;
      }
    if (top < HIDDEN + 5) {
      g.fillStyle = `rgba(255,40,80,${0.12 + 0.08 * Math.sin(f.time * 8)})`;
      g.fillRect(WX, WY, ww, C * 4);
    }
    // Grid cells
    for (let y = HIDDEN; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = w.grid[y * W + x];
        if (!v) continue;
        const px = WX + x * C;
        const py = WY + (y - HIDDEN) * C;
        this.cell(px, py, this.colorOf(v));
        const sp = cellSpecial(v);
        if (sp) this.emoji(SPECIALS[sp].icon, px + C / 2, py + C / 2 + 1, 15);
        if (isLocked(v)) {
          g.strokeStyle = '#ffd166';
          g.lineWidth = 2;
          g.strokeRect(px + 2, py + 2, C - 4, C - 4);
          this.emoji('🔒', px + C / 2, py + C / 2 + 1, 12);
        }
      }
    }
    // Line flashes
    for (const fl of this.flashes) {
      const y = WY + (fl.y - HIDDEN) * C;
      g.fillStyle = `rgba(255,255,255,${0.8 * (1 - fl.t / 0.3)})`;
      g.fillRect(WX, y, ww, C);
    }
    // Ghost and active piece
    const p = w.cur;
    if (p && !f.over) {
      const cells = shapeCells(p.card.s, p.rot);
      const d = dropDistance(w);
      const color = SHAPES[p.card.s].color;
      g.strokeStyle = color;
      g.lineWidth = 2;
      for (const [cx, cy] of cells) {
        const gy = p.y + cy + d;
        if (gy < HIDDEN) continue;
        g.globalAlpha = 0.5;
        g.strokeRect(WX + (p.x + cx) * C + 3, WY + (gy - HIDDEN) * C + 3, C - 6, C - 6);
      }
      g.globalAlpha = 1;
      const si = p.card.x ? specialIndex(p.card.s) : -1;
      g.save();
      g.beginPath();
      g.rect(WX, WY - C * 0.6, ww, wh + C * 0.6);
      g.clip();
      cells.forEach(([cx, cy], i) => {
        const px = WX + (p.x + cx) * C;
        const py = WY + (p.y + cy - HIDDEN) * C;
        this.cell(px, py, color);
        if (i === si) this.emoji(SPECIALS[p.card.x!].icon, px + C / 2, py + C / 2 + 1, 15);
      });
      g.restore();
    }
    g.strokeStyle = f.speedT > 0 ? '#ff9f43' : 'rgba(247,37,133,0.6)';
    g.lineWidth = 2;
    g.strokeRect(WX - 1, WY - 1, ww + 2, wh + 2);
  }

  private drawSides(f: Fight): void {
    const g = this.ctx!;
    const w = f.well;
    const label = (t: string, x: number, y: number): void => {
      g.fillStyle = '#a99bbd';
      g.font = '700 11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.fillText(t, x, y);
    };
    const lx = WX / 2;
    const rx = WX + W * C + (LW - WX - W * C) / 2;
    label('HOLD', lx, WY + 12);
    const slots = w.holdCap;
    for (let i = 0; i < slots; i++) {
      const by = WY + 18 + i * 50;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(4, by, WX - 8, 44);
      const c = w.hold[i];
      if (c) this.miniPiece(c, lx, by + 22, 11, w.holdUsed ? 0.4 : 1);
    }
    label('NEXT', rx, WY + 12);
    const n = f.relics.includes('spyglass') ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const by = WY + 18 + i * 50;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(WX + W * C + 4, by, LW - WX - W * C - 8, 44);
      if (blinded(f)) {
        g.fillStyle = '#a99bbd';
        g.font = '18px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('?', rx, by + 22);
        continue;
      }
      const c = w.queue[i];
      if (c) this.miniPiece(c, rx, by + 22, i === 0 ? 11 : 9);
    }
    // Stats on the left
    let y = WY + 18 + slots * 50 + 16;
    const stat = (t: string, color = '#f1eaf9'): void => {
      g.fillStyle = color;
      g.font = '700 11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.fillText(t, lx, y);
      y += 16;
    };
    stat(`Lines`, '#a99bbd');
    stat(`${f.lines}`);
    stat(`Dmg`, '#a99bbd');
    stat(`${f.dealt}`);
    stat(`Speed`, '#a99bbd');
    stat(`${rowsPerSec(f).toFixed(1)}`, f.speedT > 0 ? '#ff9f43' : '#f1eaf9');
    if (f.combo > 0) stat(`${f.combo + 1}x`, '#ffd166');
    if (f.b2b) stat('B2B', '#4cc9f0');
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        act: this.run?.act,
        step: this.run?.step,
        hp: this.f ? this.f.hp : this.run?.hero.hp,
        gold: this.run?.hero.gold,
        deck: this.run?.hero.deck.length,
        relics: this.run?.hero.relics,
        enemy: this.f ? `${this.f.enemy.id} ${this.f.enemy.hp}/${this.f.enemy.max}` : null,
        fightTime: this.f?.time,
        over: this.f?.over ?? null,
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
        if (this.f && !this.f.over) {
          this.f.enemy.hp = 0;
          this.f.over = 'win';
        }
      },
      /** One bot action. In a fight it waits a short time, then places one piece. */
      step: () => {
        const click = (sel: string): boolean => {
          const el = this.root.querySelector<HTMLElement>(sel);
          el?.click();
          return !!el;
        };
        if (this.modal) {
          if (!click('.modal [data-act="pick-card"]')) click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'map': {
            const h = this.run!.hero;
            const rest = this.root.querySelector<HTMLElement>('[data-room="rest"]');
            if (rest && h.hp < h.maxHp * 0.6) rest.click();
            else click('[data-act="room"]');
            return 'room';
          }
          case 'fight': {
            const f = this.f!;
            if (f.over) {
              if (FAST) this.finishFight();
              return 'busy';
            }
            const before = f.pieces;
            for (let t = 0; t < 0.6 && !f.over && f.pieces === before; t += 0.05) fightTick(f, 0.05);
            if (!f.over && f.pieces === before) {
              const plan = bestPlan(f.well);
              if (plan) for (const i of plan.inputs) if (!f.over) fightInput(f, i);
            }
            return 'piece';
          }
          case 'reward':
            if (!this.relicPicked) click('[data-act="relic-pick"]');
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
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
