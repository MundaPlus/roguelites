import { GOOD, RoomBot, chooseBuy, chooseOffer, chooseRoom } from './bot';
import { BITE, CHARS, CRATES, FLOORS, LOCKED_TOOLS, MONSTERS, ROOM_INFO, TOOLS, TOOL_IDS, themeFor, type CharId, type ToolId } from './data';
import { DX, DY, doorPos, isSolved, move, plates, useTool, xy, type Dir, type Fx, type RoomState } from './puzzle';
import { Rng, hash, randomSeedText } from './rng';
import {
  applyOffer,
  buy,
  clearRun,
  collapse,
  descend,
  enterPuzzle,
  finishRoom,
  isOpen,
  isPuzzle,
  loadMeta,
  loadRun,
  makeShop,
  moveOpts,
  newRun,
  offerText,
  openVault,
  recordEnd,
  saveMeta,
  saveRun,
  shrine,
  stairsDone,
  startFloor,
  unlockCost,
  type Offer,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'loading' | 'map' | 'room' | 'reward' | 'shop' | 'vault' | 'shrine' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

const Q = new URLSearchParams(location.search);
/** `?debug&fast` skips animation waits, for bot tests. */
const FAST = Q.has('fast');
const ANIM = 110;

const CHAR_COLOR: Record<CharId, string> = { digger: '#e9c46a', brute: '#e76f51', thief: '#8ecae6', monk: '#b5e48c' };

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 0,
  ArrowRight: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
  w: 0,
  d: 1,
  s: 2,
  a: 3,
  W: 0,
  D: 1,
  S: 2,
  A: 3,
};

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;

  // Room
  private s: RoomState | null = null;
  private undo: RoomState[] = [];
  private prev: RoomState | null = null;
  private animT0 = 0;
  private particles: Particle[] = [];
  private floats: Float[] = [];
  private shake = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private tile = 40;
  private raf = 0;
  private last = 0;
  private swipe: { x: number; y: number; id: number } | null = null;
  private bot: RoomBot | null = null;

  // Other screens
  private loot: Offer[] | null = null;
  private end: { victory: boolean; score: number; bones: number; floor: number } | null = null;
  private roomId = -1;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    if (Q.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- DOM ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'loading':
        body = `<div class="loading"><div class="spin">📦</div><p>The crypt shifts its stones…</p></div>`;
        break;
      case 'map':
        body = this.mapView();
        break;
      case 'room':
        body = this.roomView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'vault':
        body = this.vaultView();
        break;
      case 'shrine':
        body = this.shrineView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && !['title', 'end', 'loading'].includes(this.screen) ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'room') {
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

  /** Update the room panels without a full render. */
  private refresh(): void {
    if (this.screen !== 'room') return this.render();
    const top = this.root.querySelector<HTMLElement>('header.top');
    if (top) top.outerHTML = this.topBar();
    const info = this.root.querySelector<HTMLElement>('#info');
    if (info) info.innerHTML = this.infoView();
    const tools = this.root.querySelector<HTMLElement>('#tools');
    if (tools) tools.innerHTML = this.toolsView();
    const banner = this.root.querySelector<HTMLElement>('#banner');
    if (banner) banner.innerHTML = this.bannerView();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const budget = this.screen === 'room' && this.s ? this.s.budget : r.budget;
    const low = budget <= 10 ? 'low' : '';
    const t = themeFor(r.floor);
    return `<header class="top">
      <span class="hearts" title="Hearts">${'❤️'.repeat(Math.max(0, r.hearts))}${'🖤'.repeat(Math.max(0, r.maxHearts - r.hearts))}</span>
      <span class="budget ${low}" title="Moves left on this floor">🕯️ ${budget}</span>
      <span title="Gold">🪙 ${r.gold}</span>
      <span title="Keys">🗝️ ${r.keys}</span>
      <span class="hide-sm" title="Gems">💎 ${r.gems}</span>
      <span title="Floor">${t.icon} ${Math.min(r.floor + 1, FLOORS)}/${FLOORS}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const chars = (Object.keys(CHARS) as CharId[])
      .map((id) => {
        const c = CHARS[id];
        const own = m.unlocked.includes(id);
        const sel = m.char === id;
        const btn = own
          ? `<button class="${sel ? 'primary' : ''}" data-act="char" data-id="${id}">${sel ? '✔ Chosen' : 'Choose'}</button>`
          : `<button data-act="unlock" data-id="${id}" ${m.bones >= c.cost ? '' : 'disabled'}>🦴 ${c.cost}</button>`;
        return `<div class="arm ${sel ? 'sel' : ''}"><span class="big">${c.icon}</span><span><b>${c.name}</b><small>${c.text}</small></span>${btn}</div>`;
      })
      .join('');
    const tools = LOCKED_TOOLS.map((id) => {
      const t = TOOLS[id];
      const own = m.unlocked.includes(id);
      const cost = unlockCost(id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${t.icon}</span><span><b>${t.name}</b><small>${t.text}</small></span>
        ${own ? '<span class="ok">✔ In the pool</span>' : `<button data-act="unlock" data-id="${id}" ${m.bones >= cost ? '' : 'disabled'}>🦴 ${cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <h1><span>📦</span> Crate Crypt</h1>
      <p class="sub">Push crates onto the plates to open the door. You cannot pull. Every move costs light. Reach the bottom of the crypt: 10 floors.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (floor ${r.floor + 1}, ${'❤️'.repeat(r.hearts)})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best floor ${m.bestFloor} · Best score ${m.best} · Rooms solved ${m.totalRooms}</p>
      <h2>Characters <small>🦴 ${m.bones} bones</small></h2>
      <div class="armory">${chars}</div>
      <h2>Tool unlocks</h2>
      <p class="sub">Each run gives bones. Unlocked tools can show up in shops and rewards.</p>
      <div class="armory">${tools}</div>
    </div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const t = themeFor(r.floor);
    const cols = Math.max(...r.rooms.map((x) => x.col)) + 1;
    const cells: string[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < cols; col++) {
        const room = r.rooms.find((x) => x.col === col && x.row === row);
        if (!room) {
          cells.push(`<div class="cell empty"></div>`);
          continue;
        }
        const info = ROOM_INFO[room.kind];
        const open = isOpen(r, room);
        const need = room.kind === 'vault' && r.keys <= 0 && open;
        const cls = room.done ? 'done' : open ? 'open' : 'locked';
        const link = room.row !== 1 ? `<span class="vlink ${room.row === 0 ? 'down' : 'up'}"></span>` : col > 0 ? '<span class="hlink"></span>' : '';
        const par = isPuzzle(room.kind) ? `<small>par ${room.par}</small>` : '';
        cells.push(`<div class="cell">${link}<button class="node k-${room.kind} ${cls}" data-act="room" data-id="${room.id}" ${open ? '' : 'disabled'} title="${info.name}: ${info.text}">
          <span class="big">${room.done ? '✔️' : info.icon}</span><b>${info.name}</b>${par}${need ? '<small class="warn">needs 🗝️</small>' : ''}</button></div>`);
      }
    }
    const left = r.rooms.filter((x) => x.row === 1 && !x.done).reduce((a, x) => a + x.par, 0);
    const tools = this.toolList(r.tools);
    const down = stairsDone(r);
    return `<div class="map">
      <h2>${t.icon} Floor ${r.floor + 1}: ${t.name}</h2>
      <p class="sub">The 🕯️ ${r.budget} moves must last for this whole floor. The main path still needs about <b>${left}</b> (par). Side rooms are optional.</p>
      <div class="grid" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr))">${cells.join('')}</div>
      ${down ? `<button class="primary" data-act="descend">🪜 Go down to floor ${r.floor + 2 > FLOORS ? '—' : r.floor + 2} (${Math.floor(r.budget / 4)} 🪙 for left-over moves)</button>` : '<p class="hint">Clear the rooms in the middle row to reach the stairs 🪜.</p>'}
      <h3>Tools</h3>${tools || '<p class="hint">No tools yet. Clear rooms or visit a shop.</p>'}
    </div>`;
  }

  private toolList(t: Partial<Record<ToolId, number>>): string {
    return TOOL_IDS.filter((id) => (t[id] ?? 0) > 0)
      .map((id) => `<span class="chip" title="${TOOLS[id].text}">${TOOLS[id].icon} ${TOOLS[id].name} ×${t[id]}</span>`)
      .join('');
  }

  private roomView(): string {
    const room = this.run!.rooms[this.roomId];
    const info = ROOM_INFO[room.kind];
    return `<div class="roomv">
      <div class="board">
        <div class="rtitle">${info.icon} ${room.kind === 'stairs' && this.run!.floor === FLOORS - 1 ? 'The Crypt Heart' : info.name} <span class="dim">· par ${room.par}</span></div>
        <div id="info" class="info">${this.infoView()}</div>
        <div class="cv-wrap"><canvas id="cv"></canvas><div id="banner" class="banner-wrap">${this.bannerView()}</div></div>
      </div>
      <aside class="side">
        <div id="tools" class="tools">${this.toolsView()}</div>
        <div class="pad">
          <button data-act="undo" title="Undo (Z)">↶<small>undo</small></button>
          <button data-act="dir" data-d="0" title="Up">▲</button>
          <button data-act="restart" title="Restart room (R)">⟲<small>reset</small></button>
          <button data-act="dir" data-d="3" title="Left">◀</button>
          <button data-act="wait" title="Wait a turn (Space)">⏳<small>wait</small></button>
          <button data-act="dir" data-d="1" title="Right">▶</button>
          <span></span>
          <button data-act="dir" data-d="2" title="Down">▼</button>
          <span></span>
        </div>
        <p class="hint keys">Arrows/WASD move · Z undo · R reset · Space wait · 1-5 tools · swipe or tap the board</p>
      </aside>
    </div>`;
  }

  private infoView(): string {
    const s = this.s;
    if (!s) return '';
    const pl = plates(s.room);
    const on = pl.filter((p) => s.crates.some((c) => c.pos === p)).length;
    return `<span>Plates <b class="${on === pl.length ? 'good' : ''}">${on}/${pl.length}</b></span>
      <span>Moves here <b>${s.moves}</b></span>
      ${s.might ? '<span class="good">💪 Might</span>' : ''}
      ${s.mode ? `<span class="warn">${TOOLS[s.mode].icon} pick a direction</span>` : ''}`;
  }

  private toolsView(): string {
    const s = this.s;
    if (!s) return '';
    const btns = TOOL_IDS.map((id, i) => {
      const n = s.tools[id] ?? 0;
      if (n <= 0) return '';
      return `<button class="tool ${s.mode === id ? 'armed' : ''}" data-act="tool" data-id="${id}" title="${TOOLS[id].name}: ${TOOLS[id].text} (key ${i + 1})"><span>${TOOLS[id].icon}</span><small>×${n}</small></button>`;
    }).join('');
    return btns || '<span class="hint">No tools</span>';
  }

  private bannerView(): string {
    const s = this.s;
    if (!s) return '';
    if (s.budget <= 0 && !s.exited) {
      const add = Math.max(15, Math.round(this.run!.floorBudget * 0.15));
      return `<div class="banner bad">Out of moves! <button data-act="undo">↶ Undo</button><button class="danger" data-act="collapse">Collapse: −1 ❤️, +${add} 🕯️</button></div>`;
    }
    if (isSolved(s)) return `<div class="banner good">🚪 The door is open. Walk out!</div>`;
    return '';
  }

  private rewardView(): string {
    const offers = this.run!.offers ?? [];
    const list = offers
      .map((o, i) => {
        const t = offerText(o);
        return `<button class="pick" data-act="offer" data-i="${i}"><span class="big">${t.icon}</span><b>${t.name}</b><small>${t.text}</small></button>`;
      })
      .join('');
    return `<div class="reward">
      <h2>🚪 Room cleared</h2>
      <p class="sub">Pick one reward.</p>
      <div class="picks">${list}</div>
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const items = (r.shop ?? [])
      .map((it, i) => {
        const t = offerText(it.offer);
        const dis = it.sold || r.gold < it.cost || (it.offer.kind === 'heart' && r.hearts >= r.maxHearts);
        return `<button class="pick ${it.sold ? 'sold' : ''}" data-act="buy" data-i="${i}" ${dis ? 'disabled' : ''}><span class="big">${t.icon}</span><b>${t.name}</b><small>${t.text}</small><span class="cost">${it.sold ? 'Sold' : `🪙 ${it.cost}`}</span></button>`;
      })
      .join('');
    return `<div class="shopv">
      <h2>🛒 Crypt Merchant</h2>
      <p class="sub">“Moves, tools, keys. Coin only.” You have 🪙 ${r.gold}.</p>
      <div class="picks">${items}</div>
      <button class="primary" data-act="leave">Leave ▶</button>
    </div>`;
  }

  private vaultView(): string {
    const r = this.run!;
    if (this.loot) {
      const list = this.loot.map((o) => {
        const t = offerText(o);
        return `<div class="pick static"><span class="big">${t.icon}</span><b>${t.name}</b></div>`;
      });
      return `<div class="vaultv"><h2>🔓 The vault opens</h2><div class="picks">${list.join('')}<div class="pick static"><span class="big">💎</span><b>Gem</b></div></div>
        <button class="primary" data-act="leave">Take it all ▶</button></div>`;
    }
    return `<div class="vaultv">
      <h2>🔒 Vault</h2>
      <p class="sub">A locked iron door. A key opens it. No puzzle inside, only loot.</p>
      <button class="primary" data-act="vault-open" ${r.keys > 0 ? '' : 'disabled'}>🗝️ Use a key (${r.keys})</button>
      <button data-act="leave-back">Back</button>
    </div>`;
  }

  private shrineView(): string {
    const r = this.run!;
    return `<div class="shrinev">
      <h2>⛲ Shrine</h2>
      <p class="sub">Cold water glows in the dark. Take one blessing.</p>
      <div class="picks">
        <button class="pick" data-act="shrine" data-heal="1" ${r.hearts < r.maxHearts ? '' : 'disabled'}><span class="big">❤️</span><b>Heal</b><small>+1 heart</small></button>
        <button class="pick" data-act="shrine" data-heal="0"><span class="big">🕯️</span><b>Light</b><small>+${15 + r.floor} moves for this floor</small></button>
      </div>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    const st = this.run?.stats;
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Victory!' : '💀 Lost in the dark'}</h1>
      <p>${e.victory ? 'You reached the bottom of the crypt.' : `Your light went out on floor ${e.floor + 1}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      ${st ? `<p class="dim">Rooms ${st.rooms} · Moves ${st.moves} · Bites ${st.bites} · Collapses ${st.collapses} · Tools used ${st.tools}</p>` : ''}
      <p>🦴 +${e.bones} bones for unlocks</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const crates = Object.values(CRATES)
        .map((c) => `<li>${c.icon} <b>${c.name}</b>: ${c.text}</li>`)
        .join('');
      const mons = Object.values(MONSTERS)
        .map((c) => `<li>${c.icon} <b>${c.name}</b>: ${c.text}</li>`)
        .join('');
      const tools = Object.values(TOOLS)
        .map((c) => `<li>${c.icon} <b>${c.name}</b>: ${c.text}</li>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Push crates onto all plates</b> to open the door 🚪, then walk out. You push one crate at a time. You cannot pull.</li>
          <li><b>Moves are light 🕯️.</b> Each floor gives one budget for all its rooms. Every step costs 1.</li>
          <li><b>Undo is free and unlimited</b> inside a room (Z). It also gives the moves back. Reset (R) goes back to the start of the room.</li>
          <li>Out of moves? Undo to find a shorter way, or <b>collapse</b>: lose a ❤️ and get more light. No hearts left ends the run.</li>
          <li><b>Par</b> is the move count of a good solution. The floor budget is the par of the main rooms plus some spare.</li>
          <li>Walk into a monster to <b>shove</b> it back. With a wall behind it, it gets squashed. A crate also crushes a monster pinned against a wall. A bite costs ${BITE} moves.</li>
          <li>Side rooms: 🛒 shop, 🔒 vault (needs a 🗝️), ⛲ shrine, 💰 treasure puzzle. Left-over moves turn into gold when you go down.</li>
          <li>Swipe or tap next to the hero on touch screens. Arrows/WASD on a keyboard.</li>
        </ul>
        <h3>Crates</h3><ul>${crates}</ul>
        <h3>Monsters</h3><ul>${mons}</ul>
        <h3>Tools (one use each)</h3><ul>${tools}</ul>
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
    if (this.run && this.s && this.screen === 'room') this.run.live = this.s;
    saveRun(this.run);
  }

  /** Show the loading screen, then run slow work (room generation). */
  private later(fn: () => void): void {
    this.screen = 'loading';
    this.render();
    setTimeout(() => {
      fn();
      this.render();
    }, FAST ? 0 : 40);
  }

  private startNew(): void {
    clearRun();
    this.later(() => {
      this.run = newRun(randomSeedText(), this.meta.char, this.meta);
      this.screen = 'map';
      this.save();
    });
  }

  private resume(): void {
    const r = this.run!;
    if (r.offers) {
      this.screen = 'reward';
    } else if (r.cur >= 0 && r.live) {
      this.roomId = r.cur;
      this.s = r.live;
      this.undo = [];
      this.prev = null;
      this.screen = 'room';
    } else {
      this.screen = 'map';
    }
    this.render();
  }

  private openRoom(id: number): void {
    const r = this.run!;
    const room = r.rooms[id];
    if (!isOpen(r, room)) return;
    this.roomId = id;
    this.bot = null;
    switch (room.kind) {
      case 'shop':
        r.shop = makeShop(r, room);
        r.cur = id;
        this.screen = 'shop';
        break;
      case 'vault':
        this.loot = null;
        this.screen = 'vault';
        break;
      case 'shrine':
        this.screen = 'shrine';
        break;
      default:
        this.later(() => {
          this.s = enterPuzzle(r, room);
          this.undo = [];
          this.prev = null;
          this.particles = [];
          this.floats = [];
          this.screen = 'room';
          this.save();
          if (room.kind === 'stairs') this.toast(r.floor === FLOORS - 1 ? '👑 The Crypt Heart. The last door.' : '🪜 The stairs room. Monsters guard it.');
        });
        return;
    }
    this.save();
    this.render();
  }

  private toMap(): void {
    this.screen = 'map';
    this.run!.cur = -1;
    this.save();
    this.render();
  }

  private act(dir: Dir | 4): void {
    const s = this.s;
    if (!s || this.screen !== 'room' || s.exited) return;
    if (s.budget <= 0) {
      sfx.deny();
      return;
    }
    const n = move(s, dir, moveOpts(this.run!));
    if (n.fx.length && n.fx[0].kind === 'bump') {
      this.s = n;
      sfx.bump();
      const why = n.fx[0].text;
      if (why) this.floatAt(n.p, why, '#ffb4a2');
      if (n.fx.some((f) => f.kind === 'heavy')) sfx.heavy();
      this.refresh();
      return;
    }
    this.undo.push(s);
    this.apply(s, n);
  }

  private apply(from: RoomState, n: RoomState): void {
    this.prev = from;
    this.animT0 = performance.now();
    this.s = n;
    this.playFx(n.fx);
    if (n.exited) {
      this.save();
      setTimeout(() => this.leaveRoom(), FAST ? 0 : 260);
    }
    this.refresh();
    this.save();
  }

  private playFx(fx: Fx[]): void {
    let sound = false;
    for (const f of fx) {
      switch (f.kind) {
        case 'push':
          sfx.push();
          sound = true;
          break;
        case 'slide':
          sfx.slide();
          this.burst(f.pos, '#bde0fe', 8);
          break;
        case 'plate':
          sfx.plate();
          this.burst(f.pos, '#7ee08a', 12);
          break;
        case 'open':
          sfx.open();
          this.toast('🚪 The door opens!');
          break;
        case 'bite':
          sfx.bite();
          this.shake = 8;
          this.run!.stats.bites++;
          this.floatAt(f.pos, f.text ?? '', '#ff6b6b');
          this.burst(f.pos, '#ff6b6b', 10);
          break;
        case 'boom':
          sfx.boom();
          this.shake = 14;
          this.burst(f.pos, '#ffb703', 30);
          this.burst(f.pos, '#fb5607', 20);
          this.floatAt(f.pos, f.text ?? 'Boom!', '#ffb703');
          break;
        case 'kill':
          sfx.kill();
          this.burst(f.pos, '#c77dff', 16);
          if (f.text) this.floatAt(f.pos, f.text, '#c77dff');
          break;
        case 'shove':
          sfx.shove();
          this.floatAt(f.pos, 'Shove!', '#e0e1dd');
          break;
        case 'pick':
          if (f.text?.includes('🪙')) sfx.coin();
          else sfx.pick();
          this.floatAt(f.pos, f.text ?? '', '#ffd166');
          this.burst(f.pos, '#ffd166', 8);
          break;
        case 'tool':
        case 'pull':
        case 'warp':
        case 'phase':
          sfx.magic();
          this.burst(f.pos, '#9bf6ff', 14);
          if (f.text) this.floatAt(f.pos, f.text, '#9bf6ff');
          break;
        case 'exit':
          sfx.exit();
          break;
      }
    }
    if (!sound && fx.length === 0) sfx.step();
    else if (!sound && !fx.some((f) => f.kind !== 'pick')) sfx.step();
  }

  private doUndo(): void {
    const p = this.undo.pop();
    if (!p || !this.s) return;
    sfx.undo();
    this.prev = this.s;
    this.animT0 = performance.now();
    this.s = { ...p, fx: [] };
    this.refresh();
    this.save();
  }

  private restart(): void {
    const first = this.undo[0] ?? this.run?.entry;
    if (!first || !this.s || first === this.s) return;
    sfx.undo();
    this.undo = [];
    this.prev = null;
    this.s = { ...first, fx: [] };
    this.bot?.reset();
    this.refresh();
    this.save();
  }

  private doCollapse(): void {
    const r = this.run!;
    const s = this.s!;
    const n = collapse(r, s);
    if (!n) {
      this.endRun(false);
      return;
    }
    sfx.hurt();
    this.shake = 10;
    const add = n.budget - s.budget;
    // The extra light also counts for every undo step.
    this.undo = this.undo.map((u) => ({ ...u, budget: u.budget + add }));
    this.s = n;
    this.floatAt(n.p, `+${add} 🕯️`, '#ffd166');
    this.toast(`💔 You collapse. ${r.hearts} ❤️ left.`);
    this.refresh();
    this.save();
  }

  private useToolBtn(id: ToolId): void {
    const s = this.s;
    if (!s || (s.tools[id] ?? 0) <= 0) return;
    const aimed = TOOLS[id].aimed;
    const n = useTool(s, id, aimed);
    if (!aimed) {
      this.undo.push(s);
      this.apply(s, n);
    } else {
      this.s = n;
      sfx.magic();
      if (n.mode) this.toast(`${TOOLS[id].icon} ${TOOLS[id].name}: pick a direction.`);
      this.refresh();
    }
  }

  private leaveRoom(): void {
    const r = this.run!;
    const s = this.s;
    if (!s || !s.exited || this.screen !== 'room') return;
    finishRoom(r, s);
    this.s = null;
    this.undo = [];
    this.screen = 'reward';
    this.save();
    this.render();
  }

  private descend(): void {
    const r = this.run!;
    sfx.descend();
    this.later(() => {
      const won = descend(r);
      if (won) {
        this.endRun(true);
        return;
      }
      this.screen = 'map';
      this.toast(`${themeFor(r.floor).icon} Floor ${r.floor + 1}: ${themeFor(r.floor).name}`);
      this.save();
    });
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    r.over = victory ? 'win' : 'loss';
    const { score, bones } = recordEnd(this.meta, r);
    saveMeta(this.meta);
    clearRun();
    this.end = { victory, score, bones, floor: r.floor };
    this.screen = 'end';
    this.modal = null;
    if (victory) sfx.win();
    else sfx.lose();
    this.render();
  }

  // ---------- Canvas ----------

  private resize(): void {
    const cv = this.canvas;
    const s = this.s;
    if (!cv || !s) return;
    const wrap = cv.parentElement!;
    const wide = window.innerWidth >= 860;
    const maxW = Math.min(wrap.clientWidth || window.innerWidth - 32, 640);
    const maxH = wide ? window.innerHeight - 170 : Math.max(220, window.innerHeight - 410);
    this.tile = Math.max(22, Math.min(64, Math.floor(Math.min(maxW / s.room.w, maxH / s.room.h))));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = s.room.w * this.tile * dpr;
    cv.height = s.room.h * this.tile * dpr;
    cv.style.width = `${s.room.w * this.tile}px`;
    cv.style.height = `${s.room.h * this.tile}px`;
    this.ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const loop = (t: number): void => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1.1);
    this.shake = Math.max(0, this.shake - dt * 40);
  }

  private center(i: number): [number, number] {
    const [x, y] = xy(this.s!.room, i);
    return [(x + 0.5) * this.tile, (y + 0.5) * this.tile];
  }

  private burst(pos: number, color: string, n: number): void {
    if (!this.s) return;
    const [cx, cy] = this.center(pos);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 140;
      this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: 2 + Math.random() * 3 });
    }
  }

  private floatAt(pos: number, text: string, color: string): void {
    if (!this.s || !text) return;
    const [cx, cy] = this.center(pos);
    this.floats.push({ x: cx, y: cy - this.tile * 0.3, text, color, t: 0 });
  }

  /** Animated position of a thing that moved from `a` to `b`. */
  private lerpPos(a: number | undefined, b: number, k: number): [number, number] {
    const r = this.s!.room;
    const [bx, by] = xy(r, b);
    if (a === undefined || a === b) return [bx, by];
    const [ax, ay] = xy(r, a);
    return [ax + (bx - ax) * k, ay + (by - ay) * k];
  }

  private draw(): void {
    const ctx = this.ctx;
    const s = this.s;
    if (!ctx || !s || !this.run) return;
    const T = this.tile;
    const r = s.room;
    const theme = themeFor(this.run.floor);
    const now = performance.now();
    const raw = FAST ? 1 : Math.min(1, (now - this.animT0) / ANIM);
    const k = 1 - (1 - raw) * (1 - raw);
    const prev = raw < 1 ? this.prev : null;
    ctx.save();
    ctx.clearRect(0, 0, r.w * T, r.h * T);
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    const solved = isSolved(s);
    // Tiles
    for (let i = 0; i < r.tiles.length; i++) {
      const [x, y] = xy(r, i);
      const px = x * T;
      const py = y * T;
      let t = r.tiles[i];
      if (t === 'x' && s.broken.includes(i)) t = '.';
      if (t === '.' || t === '_') {
        ctx.fillStyle = (x + y) % 2 ? theme.floor : theme.floor2;
        ctx.fillRect(px, py, T, T);
        if (t === '_') this.drawPlate(ctx, px, py, T, s.crates.some((c) => c.pos === i));
      } else if (t === '#' || t === 'x') {
        if (this.isEdge(r, i)) continue;
        this.drawWall(ctx, px, py, T, theme.wall, t === 'x');
      } else if (t === 'D') {
        this.drawDoor(ctx, px, py, T, solved, theme.wall);
      }
    }
    // Items
    for (const it of s.items) {
      if (r.tiles[it.pos] === 'x' && !s.broken.includes(it.pos)) continue;
      const [x, y] = xy(r, it.pos);
      const bob = Math.sin(now / 300 + it.pos) * T * 0.04;
      if (it.kind === 'coin') {
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc((x + 0.5) * T, (y + 0.5) * T + bob, T * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        const icon = it.kind === 'gem' ? '💎' : it.kind === 'key' ? '🗝️' : it.kind === 'might' ? '💪' : it.tool ? TOOLS[it.tool].icon : '🎁';
        this.emoji(ctx, icon, (x + 0.5) * T, (y + 0.5) * T + bob, T * 0.5);
      }
    }
    // Crates
    const prevCrate = new Map(prev?.crates.map((c) => [c.id, c.pos]) ?? []);
    for (const c of s.crates) {
      const [x, y] = this.lerpPos(prevCrate.get(c.id), c.pos, k);
      this.drawCrate(ctx, x * T, y * T, T, c.kind, r.tiles[c.pos] === '_');
    }
    // Monsters
    const prevMon = new Map(prev?.monsters.map((m) => [m.id, m.pos]) ?? []);
    for (const m of s.monsters) {
      const [x, y] = this.lerpPos(prevMon.get(m.id), m.pos, k);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse((x + 0.5) * T, (y + 0.82) * T, T * 0.28, T * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      const hop = Math.abs(Math.sin(now / 200 + m.id)) * T * 0.05;
      this.emoji(ctx, MONSTERS[m.kind].icon, (x + 0.5) * T, (y + 0.48) * T - hop, T * 0.66);
      if (m.cd) {
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.round(T * 0.22)}px system-ui`;
        ctx.fillText('z', (x + 0.82) * T, (y + 0.2) * T);
      }
    }
    // Player
    {
      const [x, y] = this.lerpPos(prev?.p, s.p, k);
      if (!s.exited || raw < 1) this.drawHero(ctx, x * T, y * T, T, s.facing, s.might, s.mode !== null);
    }
    // Particles and floats
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.1);
      ctx.font = `bold ${Math.max(12, Math.round(T * 0.34))}px system-ui`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(f.text, f.x, f.y - f.t * 30);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 30);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Border walls that touch no floor stay dark, so the room keeps its shape. */
  private isEdge(r: RoomState['room'], i: number): boolean {
    const [x, y] = xy(r, i);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) continue;
        const t = r.tiles[ny * r.w + nx];
        if (t === '.' || t === '_' || t === 'D') return false;
      }
    }
    return true;
  }

  private emoji(ctx: CanvasRenderingContext2D, icon: string, x: number, y: number, size: number): void {
    ctx.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, y);
  }

  private drawPlate(ctx: CanvasRenderingContext2D, px: number, py: number, T: number, on: boolean): void {
    const cx = px + T / 2;
    const cy = py + T / 2;
    ctx.fillStyle = on ? '#2d6a4f' : '#151515';
    ctx.beginPath();
    ctx.roundRect(px + T * 0.14, py + T * 0.14, T * 0.72, T * 0.72, T * 0.12);
    ctx.fill();
    ctx.strokeStyle = on ? '#95d5b2' : '#bb9457';
    ctx.lineWidth = Math.max(1.5, T * 0.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, T * 0.16, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawWall(ctx: CanvasRenderingContext2D, px: number, py: number, T: number, color: string, cracked: boolean): void {
    ctx.fillStyle = color;
    ctx.fillRect(px, py, T, T);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(px, py, T, T * 0.12);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(px, py + T * 0.88, T, T * 0.12);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py + T / 2);
    ctx.lineTo(px + T, py + T / 2);
    ctx.moveTo(px + T / 2, py);
    ctx.lineTo(px + T / 2, py + T / 2);
    ctx.moveTo(px + T / 4, py + T / 2);
    ctx.lineTo(px + T / 4, py + T);
    ctx.stroke();
    if (cracked) {
      ctx.strokeStyle = '#ffb703';
      ctx.lineWidth = Math.max(1.5, T * 0.05);
      ctx.beginPath();
      ctx.moveTo(px + T * 0.2, py + T * 0.15);
      ctx.lineTo(px + T * 0.45, py + T * 0.45);
      ctx.lineTo(px + T * 0.35, py + T * 0.6);
      ctx.lineTo(px + T * 0.7, py + T * 0.85);
      ctx.moveTo(px + T * 0.45, py + T * 0.45);
      ctx.lineTo(px + T * 0.8, py + T * 0.3);
      ctx.stroke();
    }
  }

  private drawDoor(ctx: CanvasRenderingContext2D, px: number, py: number, T: number, open: boolean, wall: string): void {
    ctx.fillStyle = wall;
    ctx.fillRect(px, py, T, T);
    ctx.fillStyle = open ? '#0b0b0b' : '#6b4226';
    ctx.beginPath();
    ctx.roundRect(px + T * 0.12, py + T * 0.08, T * 0.76, T * 0.84, [T * 0.38, T * 0.38, 2, 2]);
    ctx.fill();
    if (open) {
      const g = ctx.createRadialGradient(px + T / 2, py + T / 2, 1, px + T / 2, py + T / 2, T * 0.5);
      g.addColorStop(0, 'rgba(255,209,102,0.8)');
      g.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px, py, T, T);
    } else {
      ctx.strokeStyle = '#3a2412';
      ctx.lineWidth = Math.max(1, T * 0.05);
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(px + T * (0.12 + 0.19 * k), py + T * 0.2);
        ctx.lineTo(px + T * (0.12 + 0.19 * k), py + T * 0.9);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(px + T * 0.7, py + T * 0.55, T * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCrate(ctx: CanvasRenderingContext2D, px: number, py: number, T: number, kind: RoomState['crates'][number]['kind'], onPlate: boolean): void {
    const m = T * 0.08;
    const w = T - m * 2;
    const x = px + m;
    const y = py + m;
    const fill = { box: '#a0703c', ice: 'rgba(160,215,255,0.85)', heavy: '#6c757d', bomb: '#3d3d3d' }[kind];
    const edge = { box: '#5e3c1c', ice: '#e0f4ff', heavy: '#343a40', bomb: '#111' }[kind];
    if (onPlate) {
      ctx.shadowColor = '#7ee08a';
      ctx.shadowBlur = T * 0.35;
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, w, w, T * 0.1);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, T * 0.07);
    ctx.strokeStyle = onPlate ? '#7ee08a' : edge;
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, T * 0.05);
    ctx.strokeStyle = edge;
    if (kind === 'box') {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.15, y + w * 0.15);
      ctx.lineTo(x + w * 0.85, y + w * 0.85);
      ctx.moveTo(x + w * 0.85, y + w * 0.15);
      ctx.lineTo(x + w * 0.15, y + w * 0.85);
      ctx.stroke();
    } else if (kind === 'ice') {
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, y + w * 0.45);
      ctx.lineTo(x + w * 0.45, y + w * 0.2);
      ctx.moveTo(x + w * 0.25, y + w * 0.7);
      ctx.lineTo(x + w * 0.7, y + w * 0.25);
      ctx.stroke();
    } else if (kind === 'heavy') {
      ctx.fillStyle = '#ced4da';
      for (const [ax, ay] of [
        [0.18, 0.18],
        [0.82, 0.18],
        [0.18, 0.82],
        [0.82, 0.82],
      ])
        ctx.fillRect(x + w * ax - T * 0.04, y + w * ay - T * 0.04, T * 0.08, T * 0.08);
      ctx.strokeRect(x + w * 0.3, y + w * 0.3, w * 0.4, w * 0.4);
    } else {
      this.emoji(ctx, '💣', x + w / 2, y + w / 2 + T * 0.02, T * 0.5);
    }
  }

  private drawHero(ctx: CanvasRenderingContext2D, px: number, py: number, T: number, facing: Dir, might: boolean, armed: boolean): void {
    const cx = px + T / 2;
    const cy = py + T / 2;
    const g = ctx.createRadialGradient(cx, cy, T * 0.1, cx, cy, T * 1.4);
    g.addColorStop(0, 'rgba(255,209,102,0.22)');
    g.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - T * 1.4, cy - T * 1.4, T * 2.8, T * 2.8);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, py + T * 0.84, T * 0.26, T * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    const col = CHAR_COLOR[this.run!.char];
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, T * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, T * 0.06);
    ctx.strokeStyle = might ? '#e63946' : armed ? '#9bf6ff' : '#3d2b1f';
    ctx.stroke();
    // Eyes look where the hero faces.
    const ex = DX[facing] * T * 0.09;
    const ey = DY[facing] * T * 0.09;
    ctx.fillStyle = '#1b1b1b';
    for (const side of [-1, 1]) {
      const ox = facing % 2 === 0 ? side * T * 0.11 : 0;
      const oy = facing % 2 === 1 ? side * T * 0.08 - T * 0.04 : -T * 0.04;
      ctx.beginPath();
      ctx.arc(cx + ex + ox, cy + ey + oy, T * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    // Lantern.
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(cx + T * 0.28, cy + T * 0.2, T * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- Input ----------

  private onDown(e: PointerEvent): void {
    initAudio();
    if (this.screen !== 'room' || e.target !== this.canvas) return;
    this.swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }

  private onUp(e: PointerEvent): void {
    const sw = this.swipe;
    this.swipe = null;
    if (!sw || sw.id !== e.pointerId || this.screen !== 'room' || this.modal || !this.s || !this.canvas) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.hypot(dx, dy) >= 24) {
      this.act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
      return;
    }
    // A tap: step toward the tapped tile.
    const rect = this.canvas.getBoundingClientRect();
    const tx = Math.floor((e.clientX - rect.left) / this.tile);
    const ty = Math.floor((e.clientY - rect.top) / this.tile);
    const [px, py] = xy(this.s.room, this.s.p);
    const ddx = tx - px;
    const ddy = ty - py;
    if (!ddx && !ddy) return;
    this.act(Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 1 : 3) : ddy > 0 ? 2 : 0);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'room' || !this.s) return;
    initAudio();
    if (e.key in KEY_DIR) {
      e.preventDefault();
      this.act(KEY_DIR[e.key]);
    } else if (e.key === 'z' || e.key === 'Z' || e.key === 'u' || e.key === 'Backspace') {
      e.preventDefault();
      this.doUndo();
    } else if (e.key === 'r' || e.key === 'R') {
      this.restart();
    } else if (e.key === ' ' || e.key === '.') {
      e.preventDefault();
      this.act(4);
    } else if (e.key === 'Escape' && this.s.mode) {
      this.useToolBtn(this.s.mode);
    } else if (/^[1-5]$/.test(e.key)) {
      this.useToolBtn(TOOL_IDS[Number(e.key) - 1]);
    } else if (e.key === 'Enter' && this.s.budget <= 0) {
      this.doCollapse();
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
        if (r) this.endRun(false);
        return;
      case 'title':
        this.modal = null;
        this.save();
        if (this.screen === 'end') this.run = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.startNew();
        return;
      case 'continue':
        this.resume();
        return;
      case 'char':
        this.meta.char = d.id as CharId;
        saveMeta(this.meta);
        this.render();
        return;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.bones < cost || this.meta.unlocked.includes(id)) return;
        this.meta.bones -= cost;
        this.meta.unlocked.push(id);
        if (id in CHARS) this.meta.char = id as CharId;
        saveMeta(this.meta);
        sfx.buy();
        this.render();
        return;
      }
      case 'room':
        this.openRoom(Number(d.id));
        return;
      case 'descend':
        this.descend();
        return;
      case 'dir':
        this.act(Number(d.d) as Dir);
        return;
      case 'wait':
        this.act(4);
        return;
      case 'undo':
        this.doUndo();
        return;
      case 'restart':
        this.restart();
        return;
      case 'collapse':
        this.doCollapse();
        return;
      case 'tool':
        this.useToolBtn(d.id as ToolId);
        return;
      case 'offer': {
        if (!r?.offers) return;
        const o = r.offers[Number(d.i)];
        applyOffer(r, o);
        r.offers = null;
        sfx.pick();
        this.toast(`${offerText(o).icon} ${offerText(o).name}`);
        this.toMap();
        return;
      }
      case 'buy':
        if (r && buy(r, Number(d.i))) {
          sfx.buy();
          this.save();
        } else sfx.deny();
        this.render();
        return;
      case 'leave':
        if (!r) return;
        if (this.screen === 'shop') r.rooms[this.roomId].done = true;
        r.shop = null;
        this.loot = null;
        this.toMap();
        return;
      case 'leave-back':
        this.toMap();
        return;
      case 'vault-open': {
        if (!r) return;
        const loot = openVault(r, r.rooms[this.roomId]);
        if (!loot) {
          sfx.deny();
          return;
        }
        sfx.open();
        this.loot = loot;
        this.save();
        this.render();
        return;
      }
      case 'shrine':
        if (!r) return;
        shrine(r, r.rooms[this.roomId], d.heal === '1');
        sfx.magic();
        this.toMap();
        return;
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const rng = new Rng(hash('debug', Date.now()));
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLElement>(sel);
      el?.click();
      return !!el;
    };
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        floor: this.run ? Math.min(FLOORS, this.run.floor + 1) : null,
        hearts: this.run?.hearts ?? null,
        budget: this.s && this.screen === 'room' ? this.s.budget : (this.run?.budget ?? null),
        gold: this.run?.gold ?? null,
        room: this.s && this.screen === 'room' ? { moves: this.s.moves, solved: isSolved(this.s), crates: this.s.crates.length, monsters: this.s.monsters.length, door: doorPos(this.s.room) } : null,
        end: this.end,
      }),
      /** Give gold or bones. */
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.refresh();
      },
      /** Jump to floor n (1-10) of the current run. */
      floor: (n: number) => {
        const r = this.run;
        if (!r) return;
        r.floor = Math.max(0, Math.min(FLOORS - 1, n - 1));
        startFloor(r);
        this.screen = 'map';
        this.save();
        this.render();
      },
      /** Mark every main room before the stairs as done. */
      skip: () => {
        const r = this.run;
        if (!r) return;
        for (const x of r.rooms) if (x.row === 1 && x.kind !== 'stairs') x.done = true;
        this.render();
      },
      tool: (id: ToolId, n = 1) => {
        if (!this.run) return;
        this.run.tools[id] = (this.run.tools[id] ?? 0) + n;
        if (this.s) this.s = { ...this.s, tools: { ...this.s.tools, [id]: (this.s.tools[id] ?? 0) + n } };
        this.refresh();
      },
      bones: (n: number) => {
        this.meta.bones += n;
        saveMeta(this.meta);
        this.render();
      },
      /** One bot action. In a room it plays one move from the solver plan. */
      step: (): string => {
        if (this.modal) {
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'loading':
            return 'busy';
          case 'map': {
            const id = chooseRoom(r!, GOOD, rng);
            if (id < 0) {
              if (!click('[data-act="descend"]')) {
                this.endRun(false);
                return 'stuck';
              }
              return 'descend';
            }
            click(`[data-act="room"][data-id="${id}"]`);
            return 'room';
          }
          case 'room': {
            const s = this.s!;
            if (s.exited) return 'busy';
            if (!FAST && performance.now() - this.animT0 < ANIM) return 'busy';
            if (!this.bot) this.bot = new RoomBot(GOOD, hash(r!.seed, r!.floor, this.roomId), r!.char === 'brute');
            const a = this.bot.decide(s);
            if (!a) return 'busy';
            const before = s;
            if (a.act === 'collapse') this.doCollapse();
            else if (a.act === 'undo') this.doUndo();
            else if (a.act === 'restart') this.restart();
            else if (a.act === 'tool') this.useToolBtn(a.id);
            else this.act(a.dir);
            if (this.s) this.bot.observe(a, before, this.s);
            return a.act;
          }
          case 'reward': {
            const i = chooseOffer(r!, r!.offers ?? [], GOOD);
            click(`[data-act="offer"][data-i="${i}"]`);
            return 'reward';
          }
          case 'shop': {
            const i = chooseBuy(r!);
            if (i >= 0) click(`[data-act="buy"][data-i="${i}"]`);
            else click('[data-act="leave"]');
            return 'shop';
          }
          case 'vault':
            if (!click('[data-act="vault-open"]:not([disabled])')) {
              if (!click('[data-act="leave"]')) click('[data-act="leave-back"]');
            }
            return 'vault';
          case 'shrine':
            if (!click('[data-act="shrine"][data-heal="1"]:not([disabled])')) click('[data-act="shrine"][data-heal="0"]');
            return 'shrine';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
