import { exploreStep, goodBot, newMemory, stairsStep, type BotMemory } from './bot';
import { CLASSES, FLOORS, MONSTERS, TRAPS } from './data';
import {
  PACK_MAX,
  act,
  armorValue,
  canSee,
  def,
  hitChance,
  isKnown,
  itemDesc,
  itemIcon,
  itemName,
  monAt,
  monHitChance,
  newGame,
  onStairs,
  potionColor,
  score,
  visibleMons,
  weaponStats,
  xpNeeded,
  type Action,
  type Game,
  type Item,
  type ItemKind,
  type Mon,
} from './game';
import { H, T_DOOR, T_DOWN, T_UP, T_WALL, W, dist, findPath, idx, inMap } from './map';
import { randomSeedText } from './rng';
import { clearRun, finishRun, loadMeta, loadRun, renownFor, saveMeta, saveRun, unlock } from './run';
import { initAudio, isMuted, play, toggleMute } from './sfx';

type Screen = 'title' | 'game' | 'end';

type Modal =
  | { kind: 'help' }
  | { kind: 'menu'; confirm: boolean }
  | { kind: 'pack'; filter: ItemKind | 'all' }
  | { kind: 'item'; uid: number }
  | { kind: 'level' };

type Auto = { kind: 'path'; path: [number, number][] } | { kind: 'explore' } | { kind: 'rest'; n: number };

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t0: number;
}

interface Bolt {
  path: [number, number][];
  color: string;
  t0: number;
}

const Q = new URLSearchParams(location.search);
/** `?debug&fast` skips the animations, for bot tests. */
const FAST = Q.has('fast');

const PLAYER_ICON: Record<string, string> = { warrior: '🧔', rogue: '🥷', mage: '🧙‍♀️', paladin: '🦸' };

const KEY_DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  k: [0, -1],
  j: [0, 1],
  h: [-1, 0],
  l: [1, 0],
  y: [-1, -1],
  u: [1, -1],
  b: [-1, 1],
  n: [1, 1],
  Home: [-1, -1],
  PageUp: [1, -1],
  End: [-1, 1],
  PageDown: [1, 1],
};

const NUMPAD: Record<string, [number, number]> = {
  Numpad8: [0, -1],
  Numpad2: [0, 1],
  Numpad4: [-1, 0],
  Numpad6: [1, 0],
  Numpad7: [-1, -1],
  Numpad9: [1, -1],
  Numpad1: [-1, 1],
  Numpad3: [1, 1],
};

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function bar(cur: number, max: number, cls: string, label: string): string {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  return `<div class="bar ${cls}"><div class="fill" style="width:${pct}%"></div><span>${label}</span></div>`;
}

export class App {
  private meta = loadMeta();
  private g: Game | null = loadRun();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private selected = this.meta.last;
  private endInfo: { renown: number; score: number } | null = null;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private ts = 28;
  private dpr = 1;
  private raf = 0;
  private ro: ResizeObserver | null = null;

  // Animation
  private from = new Map<number, [number, number]>();
  private animT0 = 0;
  private animDur = 110;
  private floats: Float[] = [];
  private bolts: Bolt[] = [];
  private flashes = new Map<number, number>();
  private shakeT0 = -1e9;
  private fadeT0 = -1e9;
  private glyphs = new Map<string, HTMLCanvasElement>();

  // Input helpers
  private auto: Auto | null = null;
  private autoSeen = new Set<number>();
  private autoHp = 0;
  private nextAuto = 0;
  private targeting: { uid: number } | null = null;
  private cursor: [number, number] | null = null;
  private endTimer = 0;
  private botMem: BotMemory = newMemory();
  private lastLogLen = 0;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (Q.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Screens ----------

  private render(): void {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.canvas = null;
    let body = '';
    if (this.screen === 'title') body = this.titleView();
    else if (this.screen === 'end') body = this.endView();
    else body = this.gameView();
    this.root.innerHTML = `${body}<div id="modal">${this.modal ? this.modalView() : ''}</div>`;
    if (this.screen === 'game') this.mountGame();
  }

  private renderModal(): void {
    const el = this.root.querySelector('#modal');
    if (el) el.innerHTML = this.modal ? this.modalView() : '';
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private titleView(): string {
    const m = this.meta;
    const cont = this.g && !this.g.over;
    const cards = CLASSES.map((c) => {
      const owned = m.unlocked.includes(c.id);
      const sel = this.selected === c.id && owned;
      return `<button class="cls ${sel ? 'sel' : ''} ${owned ? '' : 'locked'}" data-act="${owned ? 'pick-class' : 'unlock'}" data-id="${c.id}" ${!owned && m.renown < c.cost ? 'disabled' : ''}>
        <span class="big">${owned ? PLAYER_ICON[c.id] : '🔒'}</span>
        <b>${c.name}</b>
        <small>❤️ ${c.hp} · 💪 ${c.str} · 🏃 ${c.agi} · 🧠 ${c.wits}</small>
        <small class="dim">${c.desc}</small>
        ${owned ? '' : `<span class="cost">Unlock: ⭐ ${c.cost}</span>`}
      </button>`;
    }).join('');
    return `<main class="screen title">
      <div class="logo">🗡️</div>
      <h1>Grid Crawler</h1>
      <p class="sub">A classic turn-based roguelike. Find the Amulet on floor ${FLOORS}. Death is final.</p>
      ${cont ? `<button class="primary wide" data-act="continue">Continue · ${CLASSES.find((c) => c.id === this.g!.cls)?.name} on floor ${this.g!.floor}</button>` : ''}
      <h3>Choose your class</h3>
      <div class="classes">${cards}</div>
      <button class="${cont ? '' : 'primary'} wide" data-act="new">${cont ? 'New run (ends the current one)' : 'Start the descent'}</button>
      <div class="row">
        <button data-act="help">❓ How to play</button>
        <button data-act="mute">${isMuted() ? '🔇' : '🔊'} Sound</button>
      </div>
      <div class="meta">
        <span>⭐ Renown <b>${m.renown}</b></span>
        <span>Runs <b>${m.runs}</b></span>
        <span>Wins <b>${m.wins}</b></span>
        <span>Deepest <b>${m.deepest || '-'}</b></span>
        <span>Best score <b>${m.best}</b></span>
      </div>
      <p class="hint">Earn renown ⭐ with each run (score / 60). Spend it to unlock new classes.</p>
    </main>`;
  }

  private endView(): string {
    const g = this.g!;
    const won = g.over === 'won';
    const e = this.endInfo ?? { renown: renownFor(g), score: score(g) };
    return `<main class="screen end">
      <div class="logo">${won ? '🏆' : '🪦'}</div>
      <h1 class="${won ? 'good' : 'bad'}">${won ? 'Victory!' : 'You died'}</h1>
      <p>${esc(g.cause)}.</p>
      <div class="stats">
        <div><b>${e.score}</b><small>Score</small></div>
        <div><b>${g.floor}</b><small>Floor</small></div>
        <div><b>${g.p.level}</b><small>Level</small></div>
        <div><b>${g.kills}</b><small>Kills</small></div>
        <div><b>${g.p.gold}</b><small>Gold</small></div>
        <div><b>${g.turn}</b><small>Turns</small></div>
      </div>
      <p>⭐ +${e.renown} renown</p>
      <div class="row">
        <button class="primary" data-act="again">New run</button>
        <button data-act="title">Title screen</button>
      </div>
    </main>`;
  }

  private gameView(): string {
    return `<div class="game">
      <header class="hud" id="hud"></header>
      <div class="play">
        <div class="cv-wrap" id="cvwrap"><canvas id="cv"></canvas><div class="target-hint" id="thint"></div></div>
        <aside class="side" id="side"></aside>
      </div>
      <div class="log" id="log"></div>
      <div class="chips" id="chips"></div>
      <nav class="actions">
        <button data-act="wait" title="Wait a turn and search (. or 5)"><span>⏳</span><small>Wait</small></button>
        <button data-act="explore" title="Auto-explore (x)"><span>🧭</span><small>Explore</small></button>
        <button data-act="rest" title="Rest until healed (R)"><span>💤</span><small>Rest</small></button>
        <button data-act="pickup" title="Pick up (g)"><span>✋</span><small>Get</small></button>
        <button data-act="pack" title="Inventory (i)"><span>🎒</span><small>Pack</small></button>
        <button data-act="descend" id="btn-down" title="Go down (>)"><span>⬇️</span><small>Down</small></button>
      </nav>
    </div>`;
  }

  private mountGame(): void {
    this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
    this.ctx = this.canvas!.getContext('2d');
    const wrap = this.root.querySelector<HTMLElement>('#cvwrap')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(wrap);
    this.resize();
    this.canvas!.addEventListener('pointerup', (e) => this.onCanvasTap(e));
    this.canvas!.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.cursor = this.tileAt(e);
      this.hoverHint();
    });
    this.canvas!.addEventListener('pointerleave', () => (this.cursor = null));
    this.updateHud();
    const loop = (t: number): void => {
      this.frame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.floor(w * this.dpr));
    cv.height = Math.max(1, Math.floor(h * this.dpr));
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ts = Math.floor(Math.min(w / 17.5, h / 13));
    this.ts = Math.max(20, Math.min(36, ts));
    this.glyphs.clear();
  }

  // ---------- HUD ----------

  private updateHud(): void {
    const g = this.g;
    if (!g || this.screen !== 'game') return;
    const p = g.p;
    const hud = this.root.querySelector('#hud');
    if (!hud) return;
    const st: string[] = [];
    if (p.poison > 0) st.push(`<span class="st bad" title="Poisoned">☠️${p.poison}</span>`);
    if (p.haste > 0) st.push(`<span class="st good" title="Hasted">⚡${p.haste}</span>`);
    if (p.slow > 0) st.push(`<span class="st bad" title="Slowed">🐌${p.slow}</span>`);
    if (p.confuse > 0) st.push(`<span class="st bad" title="Confused">💫${p.confuse}</span>`);
    if (p.weak > 0) st.push(`<span class="st bad" title="Weakened">🥀${p.weak}</span>`);
    if (p.telepathy > 0) st.push(`<span class="st good" title="Telepathy">🔮${p.telepathy}</span>`);
    const prev = xpNeeded(p.level - 1);
    const need = xpNeeded(p.level);
    hud.innerHTML = `
      <div class="hp-wrap">${bar(p.hp, p.maxHp, p.hp < p.maxHp * 0.3 ? 'hp low' : 'hp', `❤️ ${p.hp}/${p.maxHp}`)}${bar(p.xp - prev, need - prev, 'xp', `Lv ${p.level}`)}</div>
      <div class="hud-stats">
        <span title="Floor">🏰 ${g.floor}/${FLOORS}</span>
        <span title="Strength">💪 ${p.str}</span>
        <span title="Agility">🏃 ${p.agi}</span>
        <span title="Wits">🧠 ${p.wits}</span>
        <span title="Armor">🛡️ ${armorValue(g)}</span>
        <span title="Gold">💰 ${p.gold}</span>
        ${st.join('')}
      </div>
      <div class="hud-btns">
        <button class="icon-btn" data-act="help" title="How to play (?)">❓</button>
        <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
        <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>
      </div>`;
    // Log
    const log = this.root.querySelector('#log')!;
    const lines = g.log.slice(-6);
    const fresh = g.log.length - this.lastLogLen;
    log.innerHTML = lines.map((l, i) => `<div class="${l.c} ${i >= lines.length - fresh ? 'new' : 'old'}">${esc(l.t)}</div>`).join('');
    this.lastLogLen = g.log.length;
    // Visible monsters
    const mons = visibleMons(g)
      .slice()
      .sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y));
    const chips = this.root.querySelector('#chips')!;
    chips.innerHTML = mons
      .slice(0, 8)
      .map((m) => `<button class="chip" data-act="mon" data-uid="${m.uid}">${def(m).icon}<span class="mini-hp"><i style="width:${(m.hp / m.maxHp) * 100}%"></i></span></button>`)
      .join('');
    const side = this.root.querySelector('#side')!;
    const w = p.weapon;
    const ws = weaponStats(g);
    side.innerHTML = `
      <h3>${PLAYER_ICON[g.cls]} ${CLASSES.find((c) => c.id === g.cls)?.name}</h3>
      <div class="eq">${w ? itemIcon(w) : '✊'} ${w ? esc(itemName(g, w)) : 'Fists'} <small>${ws.min}-${ws.max}</small></div>
      <div class="eq">${p.armor ? itemIcon(p.armor) : '👕'} ${p.armor ? esc(itemName(g, p.armor)) : 'No armor'} <small>🛡️ ${armorValue(g)}</small></div>
      <div class="eq dim">🎒 ${p.pack.length}/${PACK_MAX} items · turn ${g.turn}</div>
      <h4>In view</h4>
      ${
        mons.length
          ? mons
              .slice(0, 7)
              .map(
                (m) => `<button class="mon-row" data-act="mon" data-uid="${m.uid}"><span class="big2">${def(m).icon}</span><span class="grow"><b>${def(m).name}</b> <small class="${m.mode === 'hunt' ? 'bad' : 'dim'}">${modeText(m)}</small>
                ${bar(m.hp, m.maxHp, 'mhp', `${m.hp}/${m.maxHp}`)}</span></button>`,
              )
              .join('')
          : '<p class="dim">Nothing.</p>'
      }`;
    const down = this.root.querySelector<HTMLButtonElement>('#btn-down');
    if (down) down.classList.toggle('glow', onStairs(g));
  }

  // ---------- Modals ----------

  private modalView(): string {
    const m = this.modal!;
    const g = this.g;
    if (m.kind === 'help') return this.helpView();
    if (m.kind === 'menu') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>Menu</h2>
        <button class="wide" data-act="modal-close">Resume</button>
        <button class="wide" data-act="help">How to play</button>
        <button class="wide" data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
        ${m.confirm ? '<p class="warn">Abandon this run? It ends as a death.</p><button class="danger wide" data-act="abandon-yes">Yes, abandon</button>' : '<button class="wide" data-act="abandon">Abandon run</button>'}
        <button class="wide" data-act="title">Title screen (keeps the run)</button>
      </div></div>`;
    }
    if (m.kind === 'level' && g) {
      const p = g.p;
      return `<div class="modal"><div class="sheet" data-stop>
        <h2>⭐ Level ${p.level}!</h2>
        <p>Max HP +${2 + Math.floor(p.str / 4)}. Train one stat${g.levelUps > 1 ? ` (${g.levelUps} picks left)` : ''}:</p>
        <div class="picks">
          <button class="pick" data-act="stat" data-stat="str"><span class="big">💪</span><b>Strength ${p.str} → ${p.str + 1}</b><small>More melee damage, +2 max HP, lifts heavy weapons and armor.</small></button>
          <button class="pick" data-act="stat" data-stat="agi"><span class="big">🏃</span><b>Agility ${p.agi} → ${p.agi + 1}</b><small>Hit more often and dodge more blows.</small></button>
          <button class="pick" data-act="stat" data-stat="wits"><span class="big">🧠</span><b>Wits ${p.wits} → ${p.wits + 1}</b><small>Stronger wands and potions, faster healing, spot traps.</small></button>
        </div>
      </div></div>`;
    }
    if (m.kind === 'pack' && g) {
      const p = g.p;
      const tabs = (['all', 'potion', 'scroll', 'wand', 'weapon', 'armor'] as const)
        .map((f) => `<button class="tab ${m.filter === f ? 'on' : ''}" data-act="filter" data-f="${f}">${f === 'all' ? 'All' : f === 'potion' ? '🧪' : f === 'scroll' ? '📜' : f === 'wand' ? '🪄' : f === 'weapon' ? '🗡️' : '🧥'}</button>`)
        .join('');
      const items = p.pack.filter((it) => m.filter === 'all' || it.kind === m.filter);
      const rows = items.length
        ? items
            .map(
              (it) => `<button class="item-row" data-act="item" data-uid="${it.uid}">${this.itemBadge(it)}<span class="grow"><b>${esc(itemName(g, it))}</b><small class="dim">${esc(itemDesc(g, it))}</small></span><span class="verb">${verb(it)}</span></button>`,
            )
            .join('')
        : '<p class="dim">Nothing here.</p>';
      return `<div class="modal" data-act="modal-close"><div class="sheet pack" data-stop>
        <h2>🎒 Pack <small>${p.pack.length}/${PACK_MAX}</small></h2>
        <div class="eq">${p.weapon ? itemIcon(p.weapon) : '✊'} Wielding <b>${p.weapon ? esc(itemName(g, p.weapon)) : 'nothing'}</b></div>
        <div class="eq">${p.armor ? itemIcon(p.armor) : '👕'} Wearing <b>${p.armor ? esc(itemName(g, p.armor)) : 'nothing'}</b></div>
        <div class="tabs">${tabs}</div>
        <div class="items">${rows}</div>
        <button data-act="modal-close">Close</button>
      </div></div>`;
    }
    if (m.kind === 'item' && g) {
      const it = g.p.pack.find((o) => o.uid === m.uid);
      if (!it) return '';
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <div class="item-big">${this.itemBadge(it)}</div>
        <h2>${esc(itemName(g, it))}</h2>
        <p>${esc(itemDesc(g, it))}</p>
        ${!isKnown(g, it) ? '<p class="dim">You do not know what this does yet.</p>' : ''}
        <div class="row">
          <button class="primary" data-act="use" data-uid="${it.uid}">${verb(it)}</button>
          <button data-act="drop" data-uid="${it.uid}">Drop</button>
          <button data-act="pack">Back</button>
        </div>
      </div></div>`;
    }
    return '';
  }

  private helpView(): string {
    const mons = Object.values(MONSTERS)
      .map((d) => `<tr><td>${d.icon}</td><td><b>${d.name}</b></td><td class="dim">${d.boss ? '12' : `${d.depth[0]}-${Math.min(12, d.depth[1])}`}</td><td>${d.note}</td></tr>`)
      .join('');
    const traps = Object.values(TRAPS)
      .map((t) => `<li>${t.icon} <b>${t.name}</b>: ${t.desc}</li>`)
      .join('');
    return `<div class="modal" data-act="modal-close"><div class="sheet help" data-stop>
      <h2>How to play</h2>
      <ul>
        <li><b>Goal:</b> go down ${FLOORS} floors and pick up the Amulet 🧿 on the last floor. The Ancient Dragon guards it. Death is final.</li>
        <li><b>Turns:</b> nothing moves until you act. Each step, attack or item use is one turn. Fast monsters act twice per turn. Slow ones act every other turn.</li>
        <li><b>Fight:</b> walk into a monster to attack. Sleeping or wandering monsters take double damage (daggers: triple). Fight in corridors and doorways so only one foe reaches you.</li>
        <li><b>Doors</b> block sight until something stands in them. You cannot move diagonally through a door.</li>
        <li><b>Items:</b> potions 🧪, scrolls 📜 and wands 🪄 have random names each run. Use one to learn what it is. Some are bad.</li>
        <li><b>Level up</b> from XP and train Strength, Agility or Wits.</li>
        <li><b>Rest</b> 💤 to heal. Wandering monsters arrive over time, so do not rest forever.</li>
      </ul>
      <h3>Controls</h3>
      <ul>
        <li>Move or attack: arrows, numpad, or vi keys <kbd>h j k l y u b n</kbd>. Touch: tap a tile to walk there, tap a monster next to you to attack.</li>
        <li><kbd>.</kbd> or <kbd>5</kbd> wait and search · <kbd>x</kbd> explore · <kbd>R</kbd> rest · <kbd>g</kbd> pick up · <kbd>&gt;</kbd> go down</li>
        <li><kbd>i</kbd> pack · <kbd>q</kbd> drink · <kbd>r</kbd> read · <kbd>z</kbd> zap (then tap or click a target, <kbd>Enter</kbd> picks the nearest) · <kbd>Esc</kbd> menu</li>
      </ul>
      <h3>Traps</h3>
      <ul>${traps}</ul>
      <p class="dim">Traps are hidden until you spot them. Wits and waiting help.</p>
      <h3>Monsters</h3>
      <table class="bestiary"><tbody>${mons}</tbody></table>
      <button class="primary" data-act="modal-close">Got it</button>
    </div></div>`;
  }

  private itemBadge(it: Item): string {
    const g = this.g!;
    const ring = it.kind === 'potion' ? `style="--ring:${potionColor(g, it)}"` : '';
    return `<span class="badge ${it.kind}" ${ring}>${itemIcon(it)}${it.qty && it.qty > 1 ? `<i>${it.qty}</i>` : ''}</span>`;
  }

  // ---------- Actions ----------

  private busy(): boolean {
    if (FAST) return false;
    const now = performance.now();
    return now - this.animT0 < this.animDur || this.bolts.some((b) => now - b.t0 < boltDur(b));
  }

  /** Applies one action through the pure turn function. Returns true when the game changed. */
  private doAction(a: Action): boolean {
    const prev = this.g;
    if (!prev || prev.over) return false;
    const next = act(prev, a);
    const moved = next.turn !== prev.turn || next.floor !== prev.floor || next.p.pack.length !== prev.p.pack.length || next.levelUps !== prev.levelUps || next.log.length !== prev.log.length || next.over !== prev.over;
    this.g = next;
    const now = performance.now();
    // Tween positions.
    this.from.clear();
    if (next.floor === prev.floor) {
      this.from.set(-1, [prev.p.x, prev.p.y]);
      for (const m of prev.mons) this.from.set(m.uid, [m.x, m.y]);
      this.animT0 = now;
    }
    let boltAt = now;
    for (const f of next.fx) {
      switch (f.k) {
        case 'sfx':
          play(f.name);
          break;
        case 'float':
          this.floats.push({ x: f.x, y: f.y, text: f.text, color: f.color, t0: now });
          break;
        case 'bolt':
          if (!FAST) {
            this.bolts.push({ path: f.path, color: f.color, t0: boltAt });
            boltAt += 60;
          }
          break;
        case 'hit':
          this.flashes.set(f.uid, now);
          break;
        case 'hurt':
          this.shakeT0 = now;
          break;
        case 'floor':
          this.fadeT0 = now;
          this.from.clear();
          this.toast(`Floor ${next.floor}${next.floor === FLOORS ? ': the Amulet floor' : ''}`);
          break;
      }
    }
    if (next.over) {
      this.auto = null;
      saveRun(next);
      clearTimeout(this.endTimer);
      this.endTimer = window.setTimeout(() => this.finish(), FAST ? 0 : 1400);
    } else saveRun(next);
    if (next.levelUps > 0 && this.modal?.kind !== 'level') {
      this.auto = null;
      this.modal = { kind: 'level' };
      this.renderModal();
    }
    this.updateHud();
    return moved;
  }

  private finish(): void {
    const g = this.g;
    if (!g || !g.over || this.screen !== 'game') return;
    const renown = finishRun(this.meta, g);
    this.endInfo = { renown, score: score(g) };
    this.modal = null;
    this.screen = 'end';
    this.render();
  }

  private startRun(): void {
    const g = this.g;
    if (g && !g.over) {
      // Starting over ends the old run as a defeat.
      g.over = 'dead';
      g.cause = 'Abandoned the run';
      finishRun(this.meta, g);
    }
    this.meta.last = this.selected;
    saveMeta(this.meta);
    this.g = newGame(randomSeedText(), this.selected);
    saveRun(this.g);
    this.botMem = newMemory();
    this.lastLogLen = 0;
    this.floats = [];
    this.bolts = [];
    this.fadeT0 = performance.now();
    this.screen = 'game';
    this.modal = null;
    this.render();
    this.toast(`Floor 1 · find the Amulet on floor ${FLOORS}`);
  }

  private startAuto(a: Auto): void {
    const g = this.g!;
    this.auto = a;
    this.autoSeen = new Set(visibleMons(g).filter((m) => canSee(g, m.x, m.y)).map((m) => m.uid));
    this.autoHp = g.p.hp;
    this.nextAuto = 0;
  }

  /** One step of walking, exploring or resting. Stops on danger. */
  private autoStep(): void {
    const g = this.g!;
    const a = this.auto!;
    const awake = visibleMons(g).filter((m) => canSee(g, m.x, m.y) && m.mode !== 'sleep');
    const newMon = awake.find((m) => !this.autoSeen.has(m.uid));
    if (newMon || g.p.hp < this.autoHp - (g.p.poison > 0 ? 1 : 0)) {
      if (newMon) this.toast(`You see ${aName(def(newMon).name)}.`);
      this.auto = null;
      return;
    }
    for (const m of awake) this.autoSeen.add(m.uid);
    this.autoHp = g.p.hp;
    let action: Action | null = null;
    if (a.kind === 'path') {
      const nx = a.path.shift();
      if (nx) action = { t: 'move', dx: nx[0] - g.p.x, dy: nx[1] - g.p.y };
    } else if (a.kind === 'explore') {
      action = exploreStep(g);
      if (!action) {
        const known = g.seen.some((v, i) => v && g.tiles[i] === T_DOWN);
        this.toast(known ? 'Explored. Press > or tap ⬇️ to walk to the stairs.' : 'Nothing left to explore.');
      }
    } else {
      if (g.p.hp >= g.p.maxHp && g.p.poison === 0) {
        this.toast('You feel rested.');
        action = null;
      } else if (awake.some((m) => m.mode === 'hunt')) {
        this.toast('Not now, enemies are near.');
        action = null;
      } else if (a.n-- > 0) action = { t: 'wait' };
    }
    if (!action) {
      this.auto = null;
      return;
    }
    const before = [g.p.x, g.p.y, g.turn];
    this.doAction(action);
    const ng = this.g!;
    if (action.t === 'move' && ng.p.x === before[0] && ng.p.y === before[1] && ng.turn === before[2]) this.auto = null;
    if (a.kind === 'path' && a.path.length === 0) this.auto = null;
  }

  private walkTo(tx: number, ty: number): void {
    const g = this.g!;
    const traps = new Set(g.traps.filter((t) => t.known).map((t) => idx(t.x, t.y)));
    const path = findPath(g.tiles, g.p.x, g.p.y, tx, ty, (i) => g.seen[i] === 1 && !traps.has(i) && !(i !== idx(tx, ty) && monAtIdx(g, i)));
    if (!path || !path.length) {
      play('deny');
      return;
    }
    this.startAuto({ kind: 'path', path });
  }

  private goDown(): void {
    const g = this.g!;
    if (onStairs(g)) {
      this.doAction({ t: 'descend' });
      return;
    }
    const known = g.seen.some((v, i) => v && g.tiles[i] === T_DOWN);
    if (!known) {
      this.toast('You have not found the stairs down yet.');
      play('deny');
      return;
    }
    const i = g.tiles.findIndex((t, k) => t === T_DOWN && g.seen[k]);
    this.walkTo(i % W, Math.floor(i / W));
  }

  private useItem(uid: number): void {
    const g = this.g!;
    const it = g.p.pack.find((o) => o.uid === uid);
    if (!it) return;
    if (it.kind === 'wand') {
      if ((it.charges ?? 0) <= 0 && isKnown(g, it)) {
        this.toast('That wand is empty.');
        return;
      }
      const targets = visibleMons(g).filter((m) => canSee(g, m.x, m.y));
      this.modal = null;
      this.renderModal();
      if (!targets.length) {
        this.toast('No target in sight.');
        return;
      }
      this.targeting = { uid };
      this.showTargetHint();
      return;
    }
    this.modal = null;
    this.renderModal();
    this.doAction({ t: 'use', uid });
  }

  /** Shows what is under the mouse: a monster, an item or a trap. */
  private hoverHint(): void {
    const el = this.root.querySelector<HTMLElement>('#thint');
    const g = this.g;
    if (!el || !g || this.targeting) return;
    let text = '';
    if (this.cursor) {
      const [x, y] = this.cursor;
      const m = monAt(g, x, y);
      const it = g.items.find((o) => o.x === x && o.y === y);
      const t = g.traps.find((o) => o.x === x && o.y === y && o.known);
      if (m && (canSee(g, x, y) || g.p.telepathy > 0)) text = `${def(m).icon} ${def(m).name} ${m.hp}/${m.maxHp} · ${modeText(m)} · ${def(m).note}`;
      else if (it && g.seen[idx(x, y)]) text = `${itemIcon(it)} ${itemName(g, it)}`;
      else if (t && g.seen[idx(x, y)]) text = `${TRAPS[t.kind].icon} ${TRAPS[t.kind].name} trap: ${TRAPS[t.kind].desc}`;
    }
    el.textContent = text;
    el.classList.toggle('on', !!text);
    el.classList.toggle('info', !!text);
  }

  private showTargetHint(): void {
    const el = this.root.querySelector<HTMLElement>('#thint');
    if (!el) return;
    el.textContent = this.targeting ? 'Tap a target · Enter: nearest · Esc: cancel' : '';
    el.classList.toggle('on', !!this.targeting);
    el.classList.remove('info');
  }

  private zapAt(tx: number, ty: number): void {
    const t = this.targeting;
    this.targeting = null;
    this.showTargetHint();
    if (t) this.doAction({ t: 'use', uid: t.uid, tx, ty });
  }

  private openPack(filter: ItemKind | 'all'): void {
    const g = this.g!;
    if (filter !== 'all' && !g.p.pack.some((it) => it.kind === filter)) {
      this.toast(`You have no ${filter}s.`);
      return;
    }
    this.modal = { kind: 'pack', filter };
    this.renderModal();
  }

  private command(name: string): void {
    const g = this.g;
    if (!g || g.over) return;
    this.auto = null;
    switch (name) {
      case 'wait':
        this.doAction({ t: 'wait' });
        break;
      case 'explore':
        this.startAuto({ kind: 'explore' });
        break;
      case 'rest':
        this.startAuto({ kind: 'rest', n: 300 });
        break;
      case 'pickup':
        this.doAction({ t: 'pickup' });
        break;
      case 'descend':
        this.goDown();
        break;
      case 'pack':
        this.openPack('all');
        break;
    }
  }

  // ---------- Input ----------

  private onClick(e: MouseEvent): void {
    initAudio();
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'modal-close' && target.closest('[data-stop]') && !target.closest('[data-stop] [data-act="modal-close"]')) return;
    const act = el.dataset.act!;
    const uid = Number(el.dataset.uid);
    switch (act) {
      case 'new':
      case 'again':
        play('click');
        this.startRun();
        break;
      case 'continue':
        this.screen = 'game';
        this.modal = this.g && this.g.levelUps > 0 ? { kind: 'level' } : null;
        this.lastLogLen = Math.max(0, (this.g?.log.length ?? 0) - 3);
        this.botMem = newMemory();
        this.render();
        break;
      case 'pick-class':
        this.selected = el.dataset.id!;
        this.meta.last = this.selected;
        saveMeta(this.meta);
        play('click');
        this.render();
        break;
      case 'unlock':
        if (unlock(this.meta, el.dataset.id!)) {
          this.selected = el.dataset.id!;
          play('level');
          this.toast('New class unlocked!');
        } else play('deny');
        this.render();
        break;
      case 'help':
        this.modal = { kind: 'help' };
        this.renderModal();
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        this.renderModal();
        break;
      case 'mute':
        toggleMute();
        if (this.screen === 'title') this.render();
        else {
          this.updateHud();
          if (this.modal) this.renderModal();
        }
        break;
      case 'modal-close':
        if (this.modal?.kind === 'level') return;
        this.modal = null;
        this.renderModal();
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.renderModal();
        break;
      case 'abandon-yes':
        if (this.g) {
          this.g = { ...this.g, over: 'dead', cause: `Abandoned the run on floor ${this.g.floor}` };
          this.modal = null;
          this.finish();
        }
        break;
      case 'title':
        this.modal = null;
        this.auto = null;
        this.screen = 'title';
        if (this.g?.over) this.g = null;
        this.render();
        break;
      case 'stat':
        this.doAction({ t: 'stat', stat: el.dataset.stat as 'str' | 'agi' | 'wits' });
        if (this.g && this.g.levelUps <= 0) {
          this.modal = null;
          this.renderModal();
        } else this.renderModal();
        break;
      case 'filter':
        this.modal = { kind: 'pack', filter: el.dataset.f as ItemKind | 'all' };
        this.renderModal();
        break;
      case 'item':
        this.modal = { kind: 'item', uid };
        this.renderModal();
        break;
      case 'use':
        this.useItem(uid);
        break;
      case 'drop':
        this.modal = null;
        this.renderModal();
        this.doAction({ t: 'drop', uid });
        break;
      case 'mon': {
        const m = this.g?.mons.find((o) => o.uid === uid);
        if (m) {
          if (this.targeting) this.zapAt(m.x, m.y);
          else this.toast(`${def(m).icon} ${def(m).name} (${m.hp}/${m.maxHp}, ${modeText(m)}): ${def(m).note} Your hit ${hitChance(this.g!, m)}%, its hit ${monHitChance(this.g!, m)}%.`);
        }
        break;
      }
      case 'wait':
      case 'explore':
      case 'rest':
      case 'pickup':
      case 'pack':
      case 'descend':
        if (this.modal) return;
        this.command(act);
        break;
    }
  }

  private tileAt(e: PointerEvent): [number, number] | null {
    const cv = this.canvas;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const [cx, cy] = this.camera();
    const x = Math.floor((e.clientX - r.left + cx) / this.ts);
    const y = Math.floor((e.clientY - r.top + cy) / this.ts);
    return inMap(x, y) ? [x, y] : null;
  }

  private onCanvasTap(e: PointerEvent): void {
    initAudio();
    const g = this.g;
    if (!g || g.over || this.modal) return;
    const t = this.tileAt(e);
    if (!t) return;
    const [x, y] = t;
    if (this.targeting) {
      this.zapAt(x, y);
      return;
    }
    if (this.busy() && !this.auto) return;
    this.auto = null;
    const p = g.p;
    if (x === p.x && y === p.y) {
      if (onStairs(g)) this.doAction({ t: 'descend' });
      else if (g.items.some((it) => it.x === x && it.y === y)) this.doAction({ t: 'pickup' });
      else this.doAction({ t: 'wait' });
      return;
    }
    const dx = x - p.x;
    const dy = y - p.y;
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
      this.doAction({ t: 'move', dx, dy });
      return;
    }
    if (!g.seen[idx(x, y)] || g.tiles[idx(x, y)] === T_WALL) {
      play('deny');
      return;
    }
    this.walkTo(x, y);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    initAudio();
    const k = e.key;
    if (this.screen === 'title') {
      if (k === 'Enter') {
        if (this.g && !this.g.over) this.root.querySelector<HTMLElement>('[data-act="continue"]')?.click();
        else this.startRun();
      } else if (k === '?') {
        this.modal = { kind: 'help' };
        this.renderModal();
      } else if (k === 'Escape' && this.modal) {
        this.modal = null;
        this.renderModal();
      }
      return;
    }
    if (this.screen === 'end') {
      if (k === 'Enter') this.startRun();
      return;
    }
    const g = this.g;
    if (!g) return;
    if (this.modal) {
      if (this.modal.kind === 'level') {
        const s = { 1: 'str', 2: 'agi', 3: 'wits', s: 'str', a: 'agi', w: 'wits' }[k];
        if (s) this.root.querySelector<HTMLElement>(`[data-stat="${s}"]`)?.click();
        return;
      }
      if (k === 'Escape' || (k === 'i' && this.modal.kind === 'pack')) {
        this.modal = null;
        this.renderModal();
        e.preventDefault();
      }
      return;
    }
    if (this.targeting) {
      if (k === 'Escape') {
        this.targeting = null;
        this.showTargetHint();
      } else if (k === 'Enter' || k === 'z' || k === 'f') {
        const m = visibleMons(g)
          .filter((o) => canSee(g, o.x, o.y))
          .sort((a, b) => dist(a.x, a.y, g.p.x, g.p.y) - dist(b.x, b.y, g.p.x, g.p.y))[0];
        if (m) this.zapAt(m.x, m.y);
      }
      e.preventDefault();
      return;
    }
    const dir = NUMPAD[e.code] ?? KEY_DIRS[k];
    if (dir) {
      e.preventDefault();
      this.auto = null;
      if (this.busy() && !FAST) {
        // Allow a small input buffer: skip the tween.
        this.animT0 = -1e9;
      }
      this.doAction({ t: 'move', dx: dir[0], dy: dir[1] });
      return;
    }
    switch (k) {
      case '.':
      case '5':
      case 's':
      case 'Clear':
        e.preventDefault();
        this.command('wait');
        break;
      case 'g':
      case ',':
        this.command('pickup');
        break;
      case '>':
      case 'Enter':
        this.command('descend');
        break;
      case 'x':
        this.command('explore');
        break;
      case 'R':
        this.command('rest');
        break;
      case 'i':
        this.openPack('all');
        break;
      case 'q':
        this.openPack('potion');
        break;
      case 'r':
        this.openPack('scroll');
        break;
      case 'z':
        this.openPack('wand');
        break;
      case '?':
        this.modal = { kind: 'help' };
        this.renderModal();
        break;
      case 'Escape':
        if (this.auto) this.auto = null;
        else {
          this.modal = { kind: 'menu', confirm: false };
          this.renderModal();
        }
        break;
    }
  }

  // ---------- Canvas ----------

  private glyph(ch: string, size: number): HTMLCanvasElement {
    const key = `${ch}|${size}`;
    let c = this.glyphs.get(key);
    if (!c) {
      c = document.createElement('canvas');
      const px = Math.ceil(size * 1.3 * this.dpr);
      c.width = px;
      c.height = px;
      const x = c.getContext('2d')!;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.font = `${size * this.dpr}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      x.fillText(ch, px / 2, px / 2 + size * 0.08 * this.dpr);
      this.glyphs.set(key, c);
    }
    return c;
  }

  private drawGlyph(ch: string, cx: number, cy: number, size: number, alpha = 1): void {
    const c = this.glyph(ch, Math.round(size));
    const ctx = this.ctx!;
    const s = c.width / this.dpr;
    ctx.globalAlpha = alpha;
    ctx.drawImage(c, cx - s / 2, cy - s / 2, s, s);
    ctx.globalAlpha = 1;
  }

  private animPos(uid: number, x: number, y: number, now: number): [number, number] {
    const f = this.from.get(uid);
    if (!f || FAST) return [x, y];
    const t = Math.min(1, (now - this.animT0) / this.animDur);
    if (t >= 1 || Math.abs(f[0] - x) > 1 || Math.abs(f[1] - y) > 1) return [x, y];
    const e = 1 - (1 - t) * (1 - t);
    return [f[0] + (x - f[0]) * e, f[1] + (y - f[1]) * e];
  }

  private camera(): [number, number] {
    const g = this.g!;
    const cv = this.canvas!;
    const vw = cv.width / this.dpr;
    const vh = cv.height / this.dpr;
    const ts = this.ts;
    const [px, py] = this.animPos(-1, g.p.x, g.p.y, performance.now());
    const clampC = (c: number, view: number, total: number): number => (total <= view ? (total - view) / 2 : Math.max(0, Math.min(total - view, c)));
    return [clampC(px * ts + ts / 2 - vw / 2, vw, W * ts), clampC(py * ts + ts / 2 - vh / 2, vh, H * ts)];
  }

  private frame(now: number): void {
    const g = this.g;
    const ctx = this.ctx;
    const cv = this.canvas;
    if (!g || !ctx || !cv) return;
    if (this.auto && !this.modal && !this.busy() && now >= this.nextAuto) {
      this.autoStep();
      this.nextAuto = now + (FAST ? 0 : this.auto?.kind === 'rest' ? 15 : 45);
    }
    const ts = this.ts;
    const vw = cv.width / this.dpr;
    const vh = cv.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#07080b';
    ctx.fillRect(0, 0, vw, vh);
    let [camX, camY] = this.camera();
    const sh = now - this.shakeT0;
    if (sh < 220 && !FAST) {
      const a = (1 - sh / 220) * 5;
      camX += (Math.random() - 0.5) * a;
      camY += (Math.random() - 0.5) * a;
    }
    ctx.translate(-camX, -camY);
    const x0 = Math.max(0, Math.floor(camX / ts));
    const y0 = Math.max(0, Math.floor(camY / ts));
    const x1 = Math.min(W - 1, Math.ceil((camX + vw) / ts));
    const y1 = Math.min(H - 1, Math.ceil((camY + vh) / ts));
    const occupied = (x: number, y: number): boolean => (g.p.x === x && g.p.y === y) || !!monAt(g, x, y);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = idx(x, y);
        if (!g.seen[i]) continue;
        const v = g.vis[i] === 1;
        const t = g.tiles[i];
        const X = x * ts;
        const Y = y * ts;
        if (t === T_WALL) {
          ctx.fillStyle = v ? '#565d68' : '#272a30';
          ctx.fillRect(X, Y, ts, ts);
          ctx.fillStyle = v ? '#6b737f' : '#2e3238';
          ctx.fillRect(X, Y, ts, ts * 0.22);
          ctx.fillStyle = v ? '#3b4048' : '#1e2125';
          ctx.fillRect(X + ts * 0.48, Y + ts * 0.22, 1.5, ts * 0.39);
          ctx.fillRect(X, Y + ts * 0.6, ts, 1.5);
          continue;
        }
        ctx.fillStyle = v ? '#2b3039' : '#14161a';
        ctx.fillRect(X, Y, ts, ts);
        ctx.fillStyle = v ? '#3a404a' : '#1b1e23';
        ctx.fillRect(X + ts / 2 - 1, Y + ts / 2 - 1, 2, 2);
        if (t === T_DOOR) {
          const open = occupied(x, y);
          ctx.fillStyle = v ? '#8a5a2b' : '#4a3420';
          if (open) {
            ctx.fillRect(X, Y, ts * 0.15, ts);
            ctx.fillRect(X + ts * 0.85, Y, ts * 0.15, ts);
          } else {
            ctx.fillRect(X + ts * 0.08, Y + ts * 0.04, ts * 0.84, ts * 0.92);
            ctx.fillStyle = v ? '#5e3b1a' : '#30220f';
            ctx.fillRect(X + ts * 0.48, Y + ts * 0.04, 1.5, ts * 0.92);
            ctx.fillStyle = v ? '#ffd166' : '#806a33';
            ctx.fillRect(X + ts * 0.68, Y + ts * 0.5, 3, 3);
          }
        } else if (t === T_DOWN || t === T_UP) {
          ctx.fillStyle = t === T_DOWN ? (v ? '#ffb703' : '#7a5a10') : v ? '#6c757d' : '#383c42';
          ctx.font = `bold ${ts * 0.8}px ui-monospace, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (t === T_DOWN && v && !FAST) {
            ctx.shadowColor = '#ffb703';
            ctx.shadowBlur = 8 + Math.sin(now / 300) * 4;
          }
          ctx.fillText(t === T_DOWN ? '>' : '<', X + ts / 2, Y + ts / 2 + 1);
          ctx.shadowBlur = 0;
        }
      }
    }
    // Traps and items.
    for (const t of g.traps) {
      if (!t.known || !g.seen[idx(t.x, t.y)] || t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      this.drawGlyph(TRAPS[t.kind].icon, t.x * ts + ts / 2, t.y * ts + ts / 2, ts * 0.55, canSee(g, t.x, t.y) ? 0.85 : 0.4);
    }
    for (const it of g.items) {
      if (it.x === undefined || it.y === undefined || !g.seen[idx(it.x, it.y)]) continue;
      if (it.x < x0 || it.x > x1 || it.y < y0 || it.y > y1) continue;
      const cx = it.x * ts + ts / 2;
      const cy = it.y * ts + ts / 2;
      const v = canSee(g, it.x, it.y);
      if (it.kind === 'potion') {
        ctx.fillStyle = potionColor(g, it);
        ctx.globalAlpha = v ? 0.45 : 0.2;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (it.kind === 'amulet' && v) {
        ctx.shadowColor = '#4cc9f0';
        ctx.shadowBlur = 14;
      }
      this.drawGlyph(itemIcon(it), cx, cy, ts * 0.66, v ? 1 : 0.45);
      ctx.shadowBlur = 0;
    }
    // Monsters.
    for (const m of g.mons) {
      const v = canSee(g, m.x, m.y);
      if (!v && g.p.telepathy <= 0) continue;
      const [ax, ay] = this.animPos(m.uid, m.x, m.y, now);
      const cx = ax * ts + ts / 2;
      const cy = ay * ts + ts / 2;
      const fl = now - (this.flashes.get(m.uid) ?? -1e9);
      let ox = 0;
      if (fl < 180 && !FAST) ox = Math.sin(fl / 18) * 3;
      if (m.mode === 'hunt' && v) {
        ctx.fillStyle = 'rgba(239,71,111,0.16)';
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.46, 0, Math.PI * 2);
        ctx.fill();
      }
      if (def(m).boss && v) {
        ctx.shadowColor = '#ff7b00';
        ctx.shadowBlur = 12;
      }
      this.drawGlyph(def(m).icon, cx + ox, cy, ts * (def(m).boss ? 0.95 : 0.78), v ? 1 : 0.35);
      ctx.shadowBlur = 0;
      if (fl < 140 && !FAST) {
        ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - fl / 140)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (v && m.hp < m.maxHp) {
        ctx.fillStyle = '#000a';
        ctx.fillRect(cx - ts * 0.4, cy + ts * 0.38, ts * 0.8, 3);
        ctx.fillStyle = m.hp < m.maxHp * 0.3 ? '#ef476f' : '#7ee08a';
        ctx.fillRect(cx - ts * 0.4, cy + ts * 0.38, ts * 0.8 * (m.hp / m.maxHp), 3);
      }
      if (v && (m.mode === 'sleep' || m.mode === 'flee' || m.fear > 0 || m.slow > 0)) {
        ctx.font = `bold ${ts * 0.3}px sans-serif`;
        ctx.fillStyle = m.mode === 'sleep' ? '#8ecae6' : '#ffd166';
        ctx.textAlign = 'center';
        ctx.fillText(m.mode === 'sleep' ? 'z' : m.slow > 0 ? '🐌' : '!', cx + ts * 0.36, cy - ts * 0.3 + (m.mode === 'sleep' ? Math.sin(now / 400) * 2 : 0));
      }
    }
    // Player.
    {
      const [ax, ay] = this.animPos(-1, g.p.x, g.p.y, now);
      const cx = ax * ts + ts / 2;
      const cy = ay * ts + ts / 2;
      ctx.strokeStyle = g.p.hp < g.p.maxHp * 0.3 ? '#ef476f' : '#adb5bd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.44, 0, Math.PI * 2);
      ctx.stroke();
      this.drawGlyph(PLAYER_ICON[g.cls] ?? '🧔', cx, cy, ts * 0.78);
    }
    // Path preview and cursor.
    if (this.auto?.kind === 'path') {
      ctx.fillStyle = 'rgba(173,181,189,0.35)';
      for (const [x, y] of this.auto.path) ctx.fillRect(x * ts + ts / 2 - 2, y * ts + ts / 2 - 2, 4, 4);
    }
    if (this.cursor && !this.auto) {
      const [x, y] = this.cursor;
      ctx.strokeStyle = this.targeting ? '#ff7b00' : 'rgba(173,181,189,0.6)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x * ts + 1, y * ts + 1, ts - 2, ts - 2);
    }
    if (this.targeting) {
      for (const m of g.mons) {
        if (!canSee(g, m.x, m.y)) continue;
        ctx.strokeStyle = '#ff7b00';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(m.x * ts + 1, m.y * ts + 1, ts - 2, ts - 2);
        ctx.setLineDash([]);
      }
    }
    // Bolts.
    this.bolts = this.bolts.filter((b) => now - b.t0 < boltDur(b));
    for (const b of this.bolts) {
      const t = now - b.t0;
      if (t < 0) continue;
      const travel = b.path.length * 22;
      const head = Math.min(b.path.length, Math.floor((t / travel) * b.path.length) + 1);
      const fade = t > travel ? 1 - (t - travel) / 160 : 1;
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 10;
      for (let i = 0; i < head; i++) {
        const [x, y] = b.path[i];
        ctx.globalAlpha = Math.max(0, fade * (i === head - 1 ? 1 : 0.45));
        ctx.beginPath();
        ctx.arc(x * ts + ts / 2, y * ts + ts / 2, i === head - 1 ? ts * 0.2 : ts * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
    // Floating numbers.
    this.floats = this.floats.filter((f) => now - f.t0 < 900);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      const t = (now - f.t0) / 900;
      ctx.globalAlpha = 1 - t * t;
      ctx.font = `bold ${Math.round(ts * 0.48)}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      const y = f.y * ts + ts * 0.2 - t * ts * 0.9;
      ctx.strokeText(f.text, f.x * ts + ts / 2, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x * ts + ts / 2, y);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Hurt vignette and floor fade.
    const hurt = now - this.shakeT0;
    if (hurt < 300 && !FAST) {
      const grd = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
      grd.addColorStop(0, 'rgba(239,71,111,0)');
      grd.addColorStop(1, `rgba(239,71,111,${0.35 * (1 - hurt / 300)})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (g.p.hp < g.p.maxHp * 0.25 && !g.over) {
      ctx.strokeStyle = `rgba(239,71,111,${0.25 + Math.sin(now / 250) * 0.15})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, vw, vh);
    }
    const fade = now - this.fadeT0;
    if (fade < 500 && !FAST) {
      ctx.fillStyle = `rgba(0,0,0,${1 - fade / 500})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (g.over) {
      ctx.fillStyle = g.over === 'won' ? 'rgba(76,201,240,0.15)' : 'rgba(80,0,0,0.35)';
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => {
        const g = this.g;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          busy: this.busy(),
          floor: g?.floor ?? 0,
          turn: g?.turn ?? 0,
          hp: g?.p.hp ?? 0,
          maxHp: g?.p.maxHp ?? 0,
          level: g?.p.level ?? 0,
          gold: g?.p.gold ?? 0,
          kills: g?.kills ?? 0,
          pack: g?.p.pack.length ?? 0,
          over: g?.over ?? null,
          cause: g?.cause ?? '',
          score: g ? score(g) : 0,
          monsters: g ? visibleMons(g).map((m) => `${m.id} ${m.hp}/${m.maxHp} ${m.mode}`) : [],
          log: g ? g.log.slice(-3).map((l) => l.t) : [],
          meta: this.meta,
        };
      },
      /** One bot action for automatic tests. */
      step: (): string => {
        const click = (sel: string): boolean => {
          const el = this.root.querySelector<HTMLElement>(sel);
          el?.click();
          return !!el;
        };
        if (this.screen === 'title') {
          click('[data-act="continue"]') || click('[data-act="new"]');
          return 'start';
        }
        if (this.screen === 'end') return 'end';
        const g = this.g!;
        if (g.over) {
          if (FAST) this.finish();
          return 'busy';
        }
        if (this.busy()) return 'busy';
        if (this.modal) {
          if (this.modal.kind === 'level') {
            const a = goodBot(g, this.botMem);
            if (a.t === 'stat') click(`[data-stat="${a.stat}"]`);
            return 'level';
          }
          this.modal = null;
          this.renderModal();
          return 'modal';
        }
        if (this.targeting) {
          this.targeting = null;
          this.showTargetHint();
        }
        this.auto = null;
        const a = goodBot(g, this.botMem);
        if (a.t === 'wait' && !visibleMons(g).some((m) => canSee(g, m.x, m.y) && m.mode === 'hunt')) {
          // Resting counts as one sensible action: wait until healed or disturbed.
          for (let i = 0; i < 60 && this.g && !this.g.over && this.g.levelUps === 0; i++) {
            this.doAction({ t: 'wait' });
            const n = this.g;
            if (n.p.hp >= n.p.maxHp * 0.9 || visibleMons(n).some((m) => canSee(n, m.x, m.y) && m.mode === 'hunt')) break;
          }
          return 'rest';
        }
        this.doAction(a);
        return a.t;
      },
      /** Helpers for manual tests. */
      descend: () => {
        const g = this.g;
        if (!g) return;
        const a = stairsStep(g);
        if (a) this.doAction(a);
      },
      renown: (n: number) => {
        this.meta.renown += n;
        saveMeta(this.meta);
        if (this.screen === 'title') this.render();
      },
      heal: () => {
        if (this.g) {
          this.g = { ...this.g, p: { ...this.g.p, hp: this.g.p.maxHp } };
          this.updateHud();
        }
      },
      clear: () => clearRun(),
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}

function boltDur(b: Bolt): number {
  return b.path.length * 22 + 160;
}

function monAtIdx(g: Game, i: number): boolean {
  const x = i % W;
  return !!monAt(g, x, (i - x) / W) && canSee(g, x, (i - x) / W);
}

function modeText(m: Mon): string {
  if (m.fear > 0) return 'afraid';
  return { sleep: 'asleep', wander: 'wandering', hunt: 'hunting', flee: 'fleeing' }[m.mode];
}

function aName(name: string): string {
  return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
}

function verb(it: Item): string {
  return { potion: 'Drink', scroll: 'Read', wand: 'Zap', weapon: 'Wield', armor: 'Wear', gold: '', amulet: '' }[it.kind];
}

