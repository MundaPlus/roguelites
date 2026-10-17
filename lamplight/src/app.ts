import {
  DARK_TURN,
  H,
  W,
  bestMoves,
  canMove,
  cast,
  clone,
  darkDamage,
  figTiles,
  idx,
  isMoved,
  legalDest,
  lights,
  moveLamp,
  resetMoves,
  resolve,
  score as strikeScore,
  type Battle,
  type Fig,
  type Lamp,
  type Resolution,
  type RoundLog,
} from './battle';
import { ACTS, FOES, HEROES, LAMPS, type FigDef } from './data';
import { randomSeedText } from './rng';
import {
  DOOR_INFO,
  MAX_HEROES,
  MAX_LAMPS,
  UNLOCKS,
  clearRun,
  enterDoor,
  finishBattle,
  loadMeta,
  loadRun,
  makeOffers,
  newRun,
  offerInfo,
  recordRun,
  saveMeta,
  saveRun,
  score,
  skipOffer,
  takeOffer,
  type Door,
  type Offer,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'battle' | 'reward' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

interface Float {
  x: number;
  y: number;
  text: string;
  cls: string;
}

interface AnimView {
  b: Battle;
  res: Resolution | null;
  floats: Float[];
  slide: Map<number, [number, number]>;
  strike: boolean;
}

/** Tile size in SVG units. */
const T = 60;
const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips animation waits for bot tests. */
const SPEED = PARAMS.has('fast') ? 0 : 1;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms * SPEED));

const cx = (x: number) => x * T + T / 2;
const cy = (y: number) => y * T + T / 2;

function figDef(f: Fig): FigDef {
  return f.side === 'you' ? HEROES[f.kind as keyof typeof HEROES] : FOES[f.kind as keyof typeof FOES];
}

function pips(hp: number, max: number): string {
  if (max > 8) return `<span class="hpbar"><i style="width:${(Math.max(0, hp) / max) * 100}%"></i><b>${hp}/${max}</b></span>`;
  return `<span class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < hp ? 'on' : ''}"></i>`).join('')}</span>`;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;

  private sel: number | null = null;
  private hover: number | null = null;
  private cursor: number | null = null;
  private inspect: number | null = null;
  private drag: { lamp: number; moved: boolean } | null = null;
  private busy = false;
  private anim: AnimView | null = null;
  private offers: Offer[] = [];
  private end: { won: boolean; score: number; unlocks: string[]; act: number; cleared: number; kills: number } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerup', (e) => this.onUp(e));
    root.addEventListener('pointercancel', () => (this.drag = null));
    root.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.drag) this.setHover(null);
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (PARAMS.has('debug')) this.installDebug();
    if (this.run?.phase === 'reward') this.offers = makeOffers(this.run, this.meta);
    this.render();
  }

  private get b(): Battle | null {
    return this.run?.battle ?? null;
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'map':
        body = this.mapView();
        break;
      case 'battle':
        body = this.battleView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
  }

  /** Redraw only the board and the panels under it. Used on hover and drag. */
  private renderBoard(): void {
    const holder = this.root.querySelector<HTMLElement>('#board-holder');
    if (!holder || !this.b) return this.render();
    holder.innerHTML = this.boardSvg();
    const info = this.root.querySelector<HTMLElement>('#summary');
    if (info) info.innerHTML = this.summaryView();
    const tray = this.root.querySelector<HTMLElement>('#tray');
    if (tray) tray.innerHTML = this.trayView();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const act = ACTS[Math.min(r.act, ACTS.length - 1)];
    const roomTxt = r.room >= 3 ? 'Boss' : `Room ${r.room + 1}/4`;
    return `<header class="top">
      <span class="where">${act.icon} <b>Act ${r.act + 1}</b> <span class="dim">${act.name} · ${roomTxt}</span></span>
      <span class="grow"></span>
      <span class="kills" title="Enemies defeated">💀 ${r.kills + (this.b?.kills ?? 0)}</span>
      <button class="icon-btn" data-act="help" title="How to play" aria-label="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound" aria-label="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu" aria-label="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const unlocks = UNLOCKS.map((u) => `<li class="${m.unlocked.includes(u.id) ? 'ok' : 'dim'}">${m.unlocked.includes(u.id) ? '✔' : '🔒'} ${u.what} <span class="dim">— ${u.how}</span></li>`).join('');
    return `<div class="title">
      <div class="logo">🕯️</div>
      <h1>Lamplight</h1>
      <p class="sub">You never move your figures. Move the lamps. The shadows fight.</p>
      <div class="col">
        ${this.run ? `<button class="primary big-btn" data-act="continue">Continue run <span class="dim2">(Act ${this.run.act + 1})</span></button>` : ''}
        <button class="${this.run ? '' : 'primary '}big-btn" data-act="new">New run</button>
        <button data-act="help">How to play</button>
      </div>
      <div class="meta-box">
        <div class="stats">
          <span>Runs <b>${m.runs}</b></span><span>Wins <b>${m.wins}</b></span><span>Best <b>${m.best}</b></span><span>Kills <b>${m.kills}</b></span>
        </div>
        <ul class="unlocks">${unlocks}</ul>
      </div>
    </div>`;
  }

  private rosterView(): string {
    const r = this.run!;
    const heroes = r.heroes
      .map((h) => `<div class="chip hero"><span class="ic">${HEROES[h.kind].icon}</span><span><b>${HEROES[h.kind].name}</b> ${pips(h.hp, h.max)}<small>atk ${h.atk}${h.tall ? ` · tall +${h.tall}` : ''}</small></span></div>`)
      .join('');
    const lamps = r.lamps
      .map((l) => {
        const d = LAMPS[l.kind];
        const len = d.flicker ? `${1 + l.plus}–${5 + l.plus}` : `${d.len + l.plus}`;
        return `<div class="chip lamp"><span class="ic">${d.icon}</span><span><b>${d.name}</b><small>reach ${l.reach} · shadow ${len}${l.dmg ? ` · +${l.dmg} dmg` : ''} · move ${l.move}</small></span></div>`;
      })
      .join('');
    return `<div class="roster">
      <h3>Figures <span class="dim">${r.heroes.length}/${MAX_HEROES}</span></h3><div class="chips">${heroes}</div>
      <h3>Lamps <span class="dim">${r.lamps.length}/${MAX_LAMPS} · ${r.perTurn} move${r.perTurn > 1 ? 's' : ''} per turn</span></h3><div class="chips">${lamps}</div>
    </div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const act = ACTS[r.act];
    const nodes = [0, 1, 2, 3]
      .map((i) => `<span class="node ${i < r.room ? 'done' : i === r.room ? 'now' : ''}">${i === 3 ? '👑' : i < r.room ? '✔' : i + 1}</span>`)
      .join('<span class="link"></span>');
    const doors: (Door | 'boss')[] = r.room >= 3 ? ['boss'] : r.doors;
    const doorBtns = doors
      .map((d) => {
        const info = DOOR_INFO[d];
        const name = d === 'boss' ? FOES[act.boss].name : info.name;
        const icon = d === 'boss' ? FOES[act.boss].icon : info.icon;
        return `<button class="door ${d}" data-act="door" data-door="${d}"><span class="ic">${icon}</span><b>${name}</b><small>${info.text}</small></button>`;
      })
      .join('');
    return `<div class="map">
      <h2>${act.icon} Act ${r.act + 1}: ${act.name}</h2>
      <div class="path">${nodes}</div>
      <p class="dim">${r.room >= 3 ? 'The boss waits behind the last door.' : 'Choose a door.'}</p>
      <div class="doors">${doorBtns}</div>
      ${this.rosterView()}
    </div>`;
  }

  private rewardView(): string {
    const r = this.run!;
    const cards = this.offers
      .map((o, i) => {
        const info = offerInfo(r, o);
        return `<button class="offer" data-act="offer" data-i="${i}"><span class="ic">${info.icon}</span><b>${info.title}</b><small>${info.text}</small></button>`;
      })
      .join('');
    return `<div class="reward">
      <h2>Room cleared</h2>
      <p class="dim">Pick ${r.picks > 1 ? `one (${r.picks} picks left)` : 'one'}. Your figures healed 2 HP.</p>
      <div class="offers">${cards}</div>
      <button data-act="skip">Skip</button>
      ${this.rosterView()}
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <div class="logo">${e.won ? '🌅' : '🌑'}</div>
      <h1>${e.won ? 'Dawn breaks' : 'The lamps go out'}</h1>
      <p class="sub">${e.won ? 'You cleared all three acts.' : `Fallen in act ${e.act + 1}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p class="dim">${e.cleared} rooms cleared · ${e.kills} enemies defeated</p>
      ${e.unlocks.length ? `<p class="ok">Unlocked: ${e.unlocks.join(', ')}</p>` : ''}
      <button class="primary big-btn" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>You never move your figures.</b> You move lamps. Each turn you may move 1 lamp (up to its move range), then press <b>Cast</b>.</li>
          <li><b>Light:</b> a lamp lights every figure within its reach (a square around it). Walls block light.</li>
          <li><b>Shadow:</b> each lit figure casts a shadow on the far side of the lamp. Draw a line from the lamp through the figure: the shadow continues that line for the lamp's shadow length (tall figures add more).</li>
          <li>Walls, figures and lamps stop shadows. Lamps light both sides: your lamps make enemies cast shadows too, and enemy lamps light your figures.</li>
          <li><b>Hit:</b> a shadow that reaches an enemy figure deals its owner's attack (+ the lamp bonus).</li>
          <li><b>Clash 💥:</b> when your shadow crosses an enemy shadow, both stop there and both owners take 1.</li>
          <li><span class="sw you"></span> Your shadows are blue with dots. <span class="sw foe"></span> Enemy shadows are red with stripes.</li>
          <li><b>Cast</b> resolves all shadows at once, both ways. Then the enemies walk and move their lamps. What you see before you cast is exactly what happens.</li>
          <li><b>The dark:</b> after turn ${DARK_TURN}, every figure on both sides loses 1, then 2, then 3 HP per turn.</li>
          <li>Drag a lamp, or tap it and tap a tile. Placing is free until you cast. Mouse: point at a tile to preview it.</li>
          <li>Keys: <kbd>1</kbd>–<kbd>4</kbd> pick a lamp, arrows move the cursor, <kbd>Space</kbd> places, <kbd>Enter</kbd> casts, <kbd>R</kbd> resets, <kbd>Esc</kbd> cancels.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It counts as a loss.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="to-title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Battle view ----------

  /** The board as it would be with the hovered move, plus its strike. */
  private previewState(): { b: Battle; res: Resolution; ghost: Lamp | null } {
    const b = this.b!;
    if (this.sel !== null && this.hover !== null) {
      const l = b.lamps.find((m) => m.id === this.sel);
      const x = this.hover % W;
      const y = Math.floor(this.hover / W);
      if (l && (l.x !== x || l.y !== y) && legalDest(b, l, x, y)) {
        const p = clone(b);
        moveLamp(p, l.id, x, y);
        return { b: p, res: resolve(p), ghost: l };
      }
    }
    return { b, res: resolve(b), ghost: null };
  }

  private battleView(): string {
    const b = this.b!;
    const dark = b.turn > DARK_TURN ? `<span class="bad">🌑 Dark: −${darkDamage(b.turn + 1)} HP each after this turn</span>` : `<span class="dim">🌑 Dark in ${DARK_TURN - b.turn + 1}</span>`;
    return `<div class="battle">
      <div class="board-col">
        <div class="turnbar"><b>Turn ${b.turn}</b>${b.boss ? '<span class="boss-tag">BOSS</span>' : ''}<span class="grow"></span>${dark}</div>
        <div id="board-holder">${this.boardSvg()}</div>
        <div class="legend"><span><i class="sw you"></i>your shadow</span><span><i class="sw foe"></i>enemy shadow</span><span>💥 clash</span><span><i class="sw lit"></i>lit</span></div>
      </div>
      <div class="side-col">
        <div id="summary" class="summary">${this.summaryView()}</div>
        <div id="tray" class="tray">${this.trayView()}</div>
      </div>
    </div>`;
  }

  private trayView(): string {
    const b = this.b!;
    const mine = b.lamps.filter((l) => l.side === 'you').sort((p, q) => p.slot - q.slot);
    const used = mine.filter(isMoved).length;
    const lamps = mine
      .map((l, i) => {
        const d = LAMPS[l.kind];
        const can = canMove(b, l);
        return `<button class="lampbtn ${this.sel === l.id ? 'sel' : ''} ${isMoved(l) ? 'moved' : ''}" data-act="sel" data-id="${l.id}" ${can && !this.busy ? '' : 'disabled'} title="${d.name}: ${d.text}">
          <span class="ic">${d.icon}</span><span class="nm"><b>${d.name}</b><small>⟷${l.move} ☀${l.reach} ▮${l.len}${l.dmg ? ` +${l.dmg}` : ''}${l.heal ? ' ♥' : ''}</small></span><kbd>${i + 1}</kbd>
        </button>`;
      })
      .join('');
    return `<div class="moves">Lamp moves: <b>${b.perTurn - used}</b>/${b.perTurn}</div>
      <div class="lamps">${lamps}</div>
      <div class="actions">
        <button data-act="reset" ${used && !this.busy ? '' : 'disabled'}>↺ Reset</button>
        <button class="primary cast" data-act="cast" ${this.busy ? 'disabled' : ''}>✦ Cast</button>
      </div>`;
  }

  private summaryView(): string {
    const b = this.b!;
    if (this.busy) return '<div class="sum-main dim">The shadows move…</div>';
    const insp = this.inspect !== null ? this.inspectView(this.inspect) : '';
    const { b: p, res } = this.previewState();
    const s = strikeScore(p, res);
    const what = this.sel !== null && this.hover !== null && p !== b ? 'If you place it here' : 'If you cast now';
    const main = `<div class="sum-main"><span class="dim">${what}:</span>
      <span class="good">⚔ deal <b>${s.dealt}</b>${s.kills ? ` · 💀${s.kills}` : ''}</span>
      <span class="${s.taken ? 'bad' : 'dim'}">🩸 take <b>${s.taken}</b>${s.lost ? ` · ☠${s.lost}` : ''}</span>
      ${res.clashes.length ? `<span>💥 ${res.clashes.length}</span>` : ''}
      ${s.healed ? `<span class="ok">♥ +${s.healed}</span>` : ''}</div>`;
    const hint =
      this.sel === null
        ? '<div class="hint">Drag a lamp, or tap a lamp below and then a tile.</div>'
        : '<div class="hint">Tap a lit-ringed tile to place the lamp. Then press Cast.</div>';
    return main + (insp || hint);
  }

  private inspectView(tile: number): string {
    const b = this.b!;
    const x = tile % W;
    const y = Math.floor(tile / W);
    const f = b.figs.find((g) => figTiles(g).some(([fx, fy]) => fx === x && fy === y));
    if (f) {
      const d = figDef(f);
      const lamp = b.lamps.find((l) => l.bearer === f.id);
      return `<div class="inspect"><span class="ic">${d.icon}</span><span><b class="${f.side}">${d.name}</b> ${pips(f.hp, f.max)}
        <small>attack ${f.atk}${f.tall ? ` · tall +${f.tall}` : ''}${f.walk ? ` · walks ${f.walk}` : ''}${lamp ? ` · carries ${LAMPS[lamp.kind].name}` : ''}. ${d.text}</small></span></div>`;
    }
    const l = b.lamps.find((m) => m.bearer < 0 && m.x === x && m.y === y);
    if (l) {
      const d = LAMPS[l.kind];
      return `<div class="inspect"><span class="ic">${d.icon}</span><span><b class="${l.side}">${d.name}</b><small>reach ${l.reach} · shadow ${l.len}${l.dmg ? ` · +${l.dmg} dmg` : ''}. ${d.text}</small></span></div>`;
    }
    if (b.walls[tile]) return '<div class="inspect"><span class="ic">🧱</span><span><b>Wall</b><small>Blocks light and shadows.</small></span></div>';
    return '';
  }

  private boardSvg(): string {
    const a = this.anim;
    let b: Battle;
    let res: Resolution | null;
    let ghost: Lamp | null = null;
    if (a) {
      b = a.b;
      res = a.res;
    } else {
      const p = this.previewState();
      b = p.b;
      res = p.res;
      ghost = p.ghost;
    }
    const real = this.b!;
    const parts: string[] = [];
    parts.push(`<defs>
      <pattern id="pyou" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="rgba(40,90,220,0.55)"/><circle cx="6" cy="6" r="2.4" fill="#9fd0ff"/></pattern>
      <pattern id="pfoe" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="rgba(170,20,50,0.55)"/><rect width="4" height="10" fill="#ff6b81"/></pattern>
      <radialGradient id="gyou"><stop offset="0" stop-color="#ffd166" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd166" stop-opacity="0"/></radialGradient>
      <radialGradient id="gfoe"><stop offset="0" stop-color="#ff5a6e" stop-opacity="0.5"/><stop offset="1" stop-color="#ff5a6e" stop-opacity="0"/></radialGradient>
    </defs>`);
    // Floor, walls and lit tiles.
    const lamps = b.lamps.filter((l) => l.len > 0 || l.heal > 0);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        if (b.walls[i]) {
          parts.push(`<g class="wall"><rect x="${x * T + 1}" y="${y * T + 1}" width="${T - 2}" height="${T - 2}" rx="6"/><path d="M${x * T + 6} ${y * T + 20}h${T - 12}M${x * T + 6} ${y * T + 40}h${T - 12}M${x * T + 30} ${y * T + 4}v16M${x * T + 18} ${y * T + 20}v20M${x * T + 42} ${y * T + 20}v20M${x * T + 30} ${y * T + 40}v16"/></g>`);
          continue;
        }
        parts.push(`<rect class="floor ${(x + y) % 2 ? 'odd' : ''}" x="${x * T}" y="${y * T}" width="${T}" height="${T}"/>`);
        const litYou = lamps.some((l) => l.side === 'you' && lights(b, l, x, y));
        const litFoe = lamps.some((l) => l.side === 'foe' && lights(b, l, x, y));
        if (litYou || litFoe) parts.push(`<rect class="lit ${litYou && litFoe ? 'both' : litYou ? 'you' : 'foe'}" x="${x * T}" y="${y * T}" width="${T}" height="${T}"/>`);
      }
    // Lamp glow.
    for (const l of b.lamps) parts.push(`<circle cx="${cx(l.x)}" cy="${cy(l.y)}" r="${T * 1.6}" fill="url(#g${l.side})" class="glow"/>`);
    // Move range of the selected lamp.
    const sel = !a && this.sel !== null ? real.lamps.find((l) => l.id === this.sel) : undefined;
    if (sel) {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (x === sel.x && y === sel.y) continue;
          if (legalDest(real, sel, x, y)) parts.push(`<rect class="dest" x="${x * T + 5}" y="${y * T + 5}" width="${T - 10}" height="${T - 10}" rx="8"/>`);
        }
    }
    // Shadows.
    if (res) {
      const drawn = new Set<string>();
      for (const s of res.shadows)
        for (const t of s.tiles) {
          const key = `${s.side}${t}`;
          if (drawn.has(key)) continue;
          drawn.add(key);
          const x = t % W;
          const y = Math.floor(t / W);
          parts.push(`<rect class="shadow ${s.side} ${a?.strike ? 'strike' : ''}" x="${x * T + 2}" y="${y * T + 2}" width="${T - 4}" height="${T - 4}" rx="7" fill="url(#p${s.side})"/>`);
        }
      for (const c of res.clashes) parts.push(`<text class="clash" x="${cx(c.tile % W)}" y="${cy(Math.floor(c.tile / W)) + 9}">💥</text>`);
    }
    // Ghost of moved lamps (start spot).
    if (!a)
      for (const l of real.lamps) {
        if (l.side !== 'you') continue;
        const moved = isMoved(l) || (ghost && ghost.id === l.id);
        if (!moved) continue;
        const now = b.lamps.find((m) => m.id === l.id)!;
        parts.push(`<line class="trail" x1="${cx(l.sx)}" y1="${cy(l.sy)}" x2="${cx(now.x)}" y2="${cy(now.y)}"/>`);
        parts.push(`<circle class="ghost" cx="${cx(l.sx)}" cy="${cy(l.sy)}" r="16"/>`);
      }
    // Figures.
    for (const f of b.figs) {
      const d = figDef(f);
      const sl = a?.slide.get(f.id);
      const style = sl ? ` style="--sx:${sl[0] * T}px;--sy:${sl[1] * T}px"` : '';
      const tiles = figTiles(f);
      const insp = this.inspect !== null && tiles.some(([x, y]) => idx(x, y) === this.inspect);
      let g = `<g class="fig ${f.side} ${sl ? 'slide' : ''} ${insp ? 'insp' : ''}"${style}>`;
      for (const [x, y] of tiles) g += `<rect class="base" x="${x * T + 4}" y="${y * T + 4}" width="${T - 8}" height="${T - 8}" rx="12"/>`;
      const mx = tiles.reduce((s, [x]) => s + cx(x), 0) / tiles.length;
      const my = tiles.reduce((s, [, y]) => s + cy(y), 0) / tiles.length;
      const big = f.cells.length > 1;
      g += `<text class="emoji" x="${mx}" y="${my + (big ? -5 : 1)}" font-size="${big ? 40 : 28}">${d.icon}</text>`;
      if (b.lamps.some((l) => l.bearer === f.id)) g += `<text class="carry" x="${f.x * T + T - 12}" y="${f.y * T + 18}">${f.kind === 'torcher' ? '🔥' : '🪔'}</text>`;
      if (f.atk > 1) g += `<text class="atk" x="${f.x * T + 11}" y="${f.y * T + 17}">${f.atk}</text>`;
      // HP pips under the anchor tile.
      const max = f.max;
      if (max <= 8) {
        const w = 6;
        const x0 = mx - (max * w) / 2 + w / 2;
        const yb = (big ? Math.max(...tiles.map(([, y]) => y)) : f.y) * T + T - 9;
        for (let i = 0; i < max; i++) g += `<circle class="pip ${i < f.hp ? 'on' : ''}" cx="${x0 + i * w}" cy="${yb}" r="2.4"/>`;
      } else {
        const yb = Math.max(...tiles.map(([, y]) => y)) * T + T - 16;
        const w = 52;
        g += `<rect class="hpbg" x="${mx - w / 2}" y="${yb}" width="${w}" height="11" rx="5"/><rect class="hpfg" x="${mx - w / 2}" y="${yb}" width="${(w * Math.max(0, f.hp)) / f.max}" height="11" rx="5"/><text class="hpnum" x="${mx}" y="${yb + 9}">${f.hp}/${f.max}</text>`;
      }
      g += '</g>';
      parts.push(g);
    }
    // Lamps on their own tiles.
    for (const l of b.lamps) {
      if (l.bearer >= 0) continue;
      const d = LAMPS[l.kind];
      const isSel = !a && this.sel === l.id;
      const can = l.side === 'you' && canMove(real, real.lamps.find((m) => m.id === l.id) ?? l);
      parts.push(`<g class="lamp ${l.side} ${isSel ? 'sel' : ''} ${can && !a ? 'can' : ''}">
        <circle cx="${cx(l.x)}" cy="${cy(l.y)}" r="19"/>
        <text class="emoji" x="${cx(l.x)}" y="${cy(l.y) + 1}" font-size="22">${d.icon}</text>
        ${l.len > 0 ? `<text class="len" x="${cx(l.x) + 16}" y="${cy(l.y) + 22}">${l.len}</text>` : ''}
      </g>`);
    }
    // Predicted hits.
    if (res && !a) {
      for (const f of b.figs) {
        const d = res.dmg[f.id] ?? 0;
        const h = Math.min(res.heal[f.id] ?? 0, f.max - (f.hp - d));
        if (!d && h <= 0) continue;
        const tiles = figTiles(f);
        const mx = Math.max(...tiles.map(([x]) => x)) * T + T - 6;
        const my = Math.min(...tiles.map(([, y]) => y)) * T + 8;
        const lethal = d >= f.hp;
        if (d) parts.push(`<g class="badge ${f.side === 'foe' ? 'good' : 'bad'} ${lethal ? 'lethal' : ''}"><rect x="${mx - 30}" y="${my - 6}" width="34" height="20" rx="10"/><text x="${mx - 13}" y="${my + 9}">${lethal ? '💀' : `−${d}`}</text></g>`);
        else parts.push(`<g class="badge heal"><rect x="${mx - 30}" y="${my - 6}" width="34" height="20" rx="10"/><text x="${mx - 13}" y="${my + 9}">+${h}</text></g>`);
      }
    }
    // Keyboard cursor.
    if (!a && this.cursor !== null) parts.push(`<rect class="cursor" x="${(this.cursor % W) * T + 2}" y="${Math.floor(this.cursor / W) * T + 2}" width="${T - 4}" height="${T - 4}" rx="8"/>`);
    // Floating numbers.
    if (a) for (const f of a.floats) parts.push(`<text class="float ${f.cls}" x="${f.x}" y="${f.y}">${f.text}</text>`);
    return `<svg id="board" viewBox="0 0 ${W * T} ${H * T}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  }

  // ---------- Input ----------

  private tileAt(e: { clientX: number; clientY: number }): number | null {
    const svg = this.root.querySelector<SVGSVGElement>('#board');
    if (!svg) return null;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const x = Math.floor(pt.x / T);
    const y = Math.floor(pt.y / T);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return idx(x, y);
  }

  private setHover(t: number | null): void {
    if (this.screen !== 'battle' || this.busy) return;
    if (t === this.hover) return;
    this.hover = t;
    this.renderBoard();
  }

  private myLampAt(t: number): Lamp | undefined {
    const b = this.b!;
    return b.lamps.find((l) => l.side === 'you' && l.bearer < 0 && idx(l.x, l.y) === t);
  }

  private onDown(e: PointerEvent): void {
    if (this.screen !== 'battle' || this.busy || this.modal || !this.b) return;
    if (!(e.target as Element).closest?.('#board')) return;
    initAudio();
    const t = this.tileAt(e);
    if (t === null) return;
    const l = this.myLampAt(t);
    if (l && canMove(this.b, l)) {
      e.preventDefault();
      if (this.sel !== l.id) sfx.select();
      this.sel = l.id;
      this.drag = { lamp: l.id, moved: false };
      this.hover = t;
      this.inspect = null;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      this.renderBoard();
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.screen !== 'battle' || this.busy || this.modal) return;
    const inBoard = (e.target as Element).closest?.('#board') || this.drag;
    const t = inBoard ? this.tileAt(e) : null;
    if (this.drag) {
      if (t !== null && t !== this.hover) {
        this.drag.moved = true;
        this.setHover(t);
      }
      return;
    }
    if (e.pointerType === 'mouse') {
      if (this.sel !== null) this.setHover(t);
      else if (t !== this.inspect && t !== null && this.b && (this.b.figs.some((f) => figTiles(f).some(([x, y]) => idx(x, y) === t)) || this.b.lamps.some((l) => idx(l.x, l.y) === t))) {
        this.inspect = t;
        this.renderBoard();
      }
    }
  }

  private onUp(e: PointerEvent): void {
    if (this.screen !== 'battle' || this.busy || this.modal || !this.b) return;
    const d = this.drag;
    this.drag = null;
    const t = this.tileAt(e);
    if (d) {
      if (d.moved && t !== null) this.place(d.lamp, t);
      return;
    }
    if (!(e.target as Element).closest?.('#board') || t === null) return;
    initAudio();
    // Tap on a tile.
    const b = this.b;
    const sel = this.sel !== null ? b.lamps.find((l) => l.id === this.sel) : undefined;
    if (sel && legalDest(b, sel, t % W, Math.floor(t / W)) && idx(sel.x, sel.y) !== t) {
      this.place(sel.id, t);
      return;
    }
    const hasThing = b.walls[t] || b.figs.some((f) => figTiles(f).some(([x, y]) => idx(x, y) === t)) || b.lamps.some((l) => idx(l.x, l.y) === t);
    this.inspect = hasThing ? t : null;
    if (!hasThing) this.sel = null;
    this.hover = null;
    this.renderBoard();
  }

  private place(lampId: number, t: number): void {
    const b = this.b!;
    const l = b.lamps.find((m) => m.id === lampId);
    if (!l) return;
    const x = t % W;
    const y = Math.floor(t / W);
    if (l.x === x && l.y === y) return this.renderBoard();
    if (moveLamp(b, lampId, x, y)) {
      sfx.place();
      this.sel = lampId;
      this.hover = null;
    } else {
      sfx.deny();
      this.toast(canMove(b, l) ? 'That tile is out of range or taken.' : 'No lamp moves left this turn.');
    }
    this.renderBoard();
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el) return;
    if (el.hasAttribute('data-stop') && !el.dataset.act) return;
    this.action(el.dataset.act!, el.dataset);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'battle' || this.busy || !this.b) return;
    const b = this.b;
    const mine = b.lamps.filter((l) => l.side === 'you').sort((p, q) => p.slot - q.slot);
    if (/^[1-4]$/.test(e.key)) {
      const l = mine[+e.key - 1];
      if (l && canMove(b, l)) {
        this.sel = l.id;
        this.cursor = idx(l.x, l.y);
        this.hover = this.cursor;
        sfx.select();
        this.renderBoard();
      } else sfx.deny();
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      if (this.sel === null) {
        const l = mine.find((m) => canMove(b, m));
        if (!l) return;
        this.sel = l.id;
      }
      const l = b.lamps.find((m) => m.id === this.sel)!;
      const c = this.cursor ?? idx(l.x, l.y);
      let x = c % W;
      let y = Math.floor(c / W);
      if (e.key === 'ArrowLeft') x = Math.max(0, x - 1);
      if (e.key === 'ArrowRight') x = Math.min(W - 1, x + 1);
      if (e.key === 'ArrowUp') y = Math.max(0, y - 1);
      if (e.key === 'ArrowDown') y = Math.min(H - 1, y + 1);
      this.cursor = idx(x, y);
      this.hover = this.cursor;
      this.inspect = this.cursor;
      this.renderBoard();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (this.sel !== null && this.cursor !== null) this.place(this.sel, this.cursor);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void this.doCast();
    } else if (e.key === 'r' || e.key === 'R' || e.key === 'Backspace') {
      this.action('reset', {});
    } else if (e.key === 'Escape') {
      this.sel = null;
      this.cursor = null;
      this.hover = null;
      this.inspect = null;
      this.renderBoard();
    }
  }

  private action(act: string, data: DOMStringMap): void {
    switch (act) {
      case 'help':
        this.modal = { kind: 'help' };
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        break;
      case 'modal-close':
        this.modal = null;
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        break;
      case 'abandon-yes':
        this.modal = null;
        this.finishRun(false);
        return;
      case 'to-title':
        this.modal = null;
        this.screen = 'title';
        break;
      case 'mute':
        toggleMute();
        break;
      case 'new':
        this.startRun(randomSeedText());
        return;
      case 'continue':
        this.resume();
        return;
      case 'title':
        this.screen = 'title';
        this.end = null;
        break;
      case 'door': {
        const r = this.run!;
        const door = data.door as Door | 'boss';
        sfx.pick();
        enterDoor(r, door);
        if (r.phase === 'battle') {
          this.enterBattle();
          if (door === 'boss') this.toast(`${FOES[ACTS[r.act].boss].icon} ${FOES[ACTS[r.act].boss].name} awaits.`);
        } else {
          sfx.heal();
          this.toast('🔥 Your figures rest and heal 4 HP.');
          saveRun(r);
        }
        break;
      }
      case 'offer': {
        const r = this.run!;
        const o = this.offers[+data.i!];
        if (!o) return;
        sfx.pick();
        takeOffer(r, o);
        this.afterPick();
        return;
      }
      case 'skip':
        skipOffer(this.run!);
        this.afterPick();
        return;
      case 'sel': {
        const id = +data.id!;
        if (this.sel === id) this.sel = null;
        else {
          this.sel = id;
          sfx.select();
        }
        this.inspect = null;
        this.cursor = null;
        this.renderBoard();
        return;
      }
      case 'reset':
        if (!this.b || this.busy) return;
        resetMoves(this.b);
        this.hover = null;
        this.renderBoard();
        return;
      case 'cast':
        void this.doCast();
        return;
    }
    this.render();
  }

  // ---------- Flow ----------

  private startRun(seed: string): void {
    this.run = newRun(seed);
    this.end = null;
    this.screen = 'map';
    saveRun(this.run);
    this.render();
  }

  private resume(): void {
    const r = this.run;
    if (!r) return;
    if (r.phase === 'battle' && r.battle) return this.enterBattle();
    if (r.phase === 'reward') {
      this.offers = makeOffers(r, this.meta);
      this.screen = 'reward';
    } else this.screen = 'map';
    this.render();
  }

  private enterBattle(): void {
    this.screen = 'battle';
    this.sel = null;
    this.hover = null;
    this.cursor = null;
    this.inspect = null;
    this.anim = null;
    saveRun(this.run!);
    this.render();
  }

  private afterPick(): void {
    const r = this.run!;
    if (r.phase === 'reward') {
      this.offers = makeOffers(r, this.meta);
      this.screen = 'reward';
    } else {
      this.screen = 'map';
      if (r.room === 0) this.toast(`${ACTS[r.act].icon} Act ${r.act + 1}: ${ACTS[r.act].name}`);
    }
    saveRun(r);
    this.render();
  }

  private floatsFor(b: Battle, dmg: Record<number, number>, heal: Record<number, number>): Float[] {
    const out: Float[] = [];
    for (const f of b.figs) {
      const tiles = figTiles(f);
      const mx = tiles.reduce((s, [x]) => s + cx(x), 0) / tiles.length;
      const my = Math.min(...tiles.map(([, y]) => y)) * T + 14;
      if (dmg[f.id]) out.push({ x: mx, y: my, text: `−${dmg[f.id]}`, cls: f.side === 'foe' ? 'good' : 'bad' });
      else if (heal[f.id] && f.hp < f.max) out.push({ x: mx, y: my, text: `+${Math.min(heal[f.id], f.max - f.hp)}`, cls: 'heal' });
    }
    return out;
  }

  private async doCast(): Promise<void> {
    const b = this.b;
    if (!b || this.busy || b.over || this.screen !== 'battle') return;
    this.busy = true;
    this.sel = null;
    this.hover = null;
    this.cursor = null;
    this.inspect = null;
    sfx.cast();
    const before = clone(b);
    const log: RoundLog = cast(b);
    // 1. The strike.
    this.anim = { b: before, res: log.res, floats: this.floatsFor(before, log.res.dmg, log.res.heal), slide: new Map(), strike: true };
    this.render();
    const yourHits = log.res.hits.some((h) => before.figs.find((f) => f.id === h.to)?.side === 'foe');
    const theirHits = log.res.hits.some((h) => before.figs.find((f) => f.id === h.to)?.side === 'you');
    if (yourHits) sfx.hit();
    if (theirHits) setTimeout(() => sfx.hurt(), 120 * SPEED);
    if (log.res.clashes.length) sfx.clash();
    if (log.res.heals.length) sfx.heal();
    await sleep(log.res.hits.length || log.res.clashes.length ? 900 : 350);
    if (log.dead.length) sfx.kill();
    // 2. Enemies move.
    if (log.moves.length) {
      const slide = new Map<number, [number, number]>();
      for (const m of log.moves) {
        if (m.kind === 'fig') slide.set(m.id, [m.fx - m.tx, m.fy - m.ty]);
      }
      const after = clone(b);
      if (log.dark.length) for (const d of log.dark) {
        const f = after.figs.find((g) => g.id === d.fig);
        if (f) f.hp += d.dmg;
      }
      for (const d of log.darkDead) after.figs.push({ ...d, hp: d.hp + log.dark.find((x) => x.fig === d.id)!.dmg });
      this.anim = { b: after, res: null, floats: [], slide, strike: false };
      this.render();
      sfx.step();
      await sleep(450);
    }
    // 3. The dark.
    if (log.dark.length) {
      const darkDmg: Record<number, number> = {};
      for (const d of log.dark) darkDmg[d.fig] = d.dmg;
      const view = clone(b);
      for (const d of log.darkDead) view.figs.push({ ...d });
      this.anim = { b: view, res: null, floats: this.floatsFor(view, darkDmg, {}).map((f) => ({ ...f, cls: 'dark' })), slide: new Map(), strike: false };
      this.render();
      sfx.dark();
      await sleep(700);
    }
    this.anim = null;
    this.busy = false;
    if (b.over) {
      await this.battleOver();
      return;
    }
    saveRun(this.run!);
    sfx.turn();
    if (b.turn === DARK_TURN) this.toast('🌑 The dark rises after this turn.');
    this.render();
  }

  private async battleOver(): Promise<void> {
    const r = this.run!;
    const res = finishBattle(r);
    if (res === 'lose') {
      this.finishRun(false);
      return;
    }
    if (res === 'win') {
      this.finishRun(true);
      return;
    }
    sfx.win();
    this.offers = makeOffers(r, this.meta);
    this.screen = 'reward';
    if (r.roomKind === 'boss') this.toast('👑 Boss defeated! Full heal.');
    saveRun(r);
    this.render();
  }

  private finishRun(won: boolean): void {
    const r = this.run;
    if (!r) return;
    if (r.battle && !won) r.kills += r.battle.kills;
    const sc = score(r, won);
    const unlocks = recordRun(this.meta, r, won, sc);
    saveMeta(this.meta);
    clearRun();
    this.end = { won, score: sc, unlocks, act: r.act, cleared: r.cleared, kills: r.kills };
    this.run = null;
    this.screen = 'end';
    this.busy = false;
    this.anim = null;
    if (won) sfx.win();
    else sfx.lose();
    this.render();
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        busy: this.busy,
        act: this.run?.act,
        room: this.run?.room,
        phase: this.run?.phase,
        turn: this.b?.turn,
        heroes: this.run?.heroes.map((h) => `${h.kind} ${h.hp}/${h.max}`),
        figs: this.b?.figs.map((f) => `${f.side}:${f.kind} ${f.hp}/${f.max} @${f.x},${f.y}`),
        lamps: this.b?.lamps.map((l) => `${l.side}:${l.kind} @${l.x},${l.y}`),
        preview: this.b ? strikeScore(this.b, resolve(this.b)) : null,
        end: this.end,
        meta: this.meta,
      }),
      /** Win the current battle at once. */
      win: () => {
        const b = this.b;
        if (!b) return;
        b.figs = b.figs.filter((f) => f.side === 'you');
        b.over = 'win';
        void this.battleOver();
      },
      /** One bot action for automatic tests. */
      step: async (): Promise<string> => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        const click = (sel: string): boolean => {
          const el = this.root.querySelector<HTMLElement>(sel);
          el?.click();
          return !!el;
        };
        switch (this.screen) {
          case 'title':
            if (!click('[data-act="continue"]')) this.startRun(randomSeedText());
            return 'start';
          case 'map':
            click('[data-act="door"]');
            return 'door';
          case 'battle': {
            const b = this.b!;
            for (const m of bestMoves(b)) moveLamp(b, m.lamp, m.x, m.y);
            await this.doCast();
            return 'turn';
          }
          case 'reward':
            if (!click('[data-act="offer"]')) click('[data-act="skip"]');
            return 'reward';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
