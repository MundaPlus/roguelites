/** Screens, the DOM grid, input, effects and the debug API. */
import { CHEST, HIDDEN, MON, OPEN, SEEN, clueShown, nbrs } from './board';
import { botAction } from './bot';
import { BOONS, FLOORS, HEROES, HERO_IDS, ITEMS, MONSTERS, type HeroId } from './data';
import { randomSeedText } from './rng';
import {
  apply,
  canLevel,
  damage,
  damageFor,
  defaultMeta,
  finishRun,
  has,
  legend,
  loadMeta,
  loadRun,
  monLabel,
  need,
  newRun,
  saveMeta,
  saveRun,
  score,
  slots,
  stairsOpen,
  type Action,
  type Fx,
  type RunState,
} from './run';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'floor' | 'reward' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'mark'; i: number };

const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
const FAST = PARAMS.has('fast');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, FAST ? 0 : ms));
const ITEM_KEYS = ['Q', 'W', 'E', 'R', 'T', 'Y'];

interface EndInfo {
  won: boolean;
  score: number;
  souls: number;
  floor: number;
  level: number;
  killedBy: string;
  stats: RunState['stats'];
  daily: string | null;
  hero: HeroId;
}

interface Float {
  i: number;
  text: string;
  cls: string;
}

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private hero: HeroId = 'wanderer';
  private cursor = -1;
  private hover = -1;
  private targeting: number | null = null;
  private confirm = -1;
  private busy = false;
  private end: EndInfo | null = null;
  private fresh = new Map<number, number>();
  private floats: Float[] = [];
  private shake = false;
  private flash = '';
  private pressTimer = 0;
  private longPressed = false;
  private suppressUntil = 0;
  private pressAt: [number, number] = [0, 0];

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    try {
      setMuted(localStorage.getItem('sweep.mute') === '1');
    } catch {
      /* ignore */
    }
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('contextmenu', (e) => this.onContext(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointerup', () => {
      this.clearPress();
      // The click after a long press must not close the marker menu.
      if (this.longPressed) this.suppressUntil = Date.now() + 300;
      this.longPressed = false;
    });
    root.addEventListener('pointercancel', () => this.clearPress());
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerleave', () => this.setHover(-1));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => {
      if (this.screen === 'floor') this.render();
    });
    if (DEBUG) this.installDebug();
    this.render();
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'floor':
        body = this.floorView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && (this.screen === 'floor' || this.screen === 'reward') ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'floor') this.afterBoard();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    return `<header class="top">
      <span class="logo">💣</span>
      <span class="where">Floor <b>${r.floor}</b>/${FLOORS}${r.daily ? ' · <span class="daily-tag">Daily</span>' : ''}</span>
      <span title="Gold">🪙 ${r.gold}</span>
      <span title="Keys">🗝️ ${r.keys}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play (H)">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>
    </header>`;
  }

  private titleView(): string {
    const mt = this.meta;
    const heroes = HERO_IDS.map((id) => {
      const d = HEROES[id];
      const have = mt.unlocked.includes(id);
      const sel = this.hero === id;
      if (have)
        return `<button class="hero ${sel ? 'on' : ''}" data-act="hero" data-id="${id}" title="${d.text}">
          <span class="big">${d.icon}</span><b>${d.name}</b><small>${d.text}</small></button>`;
      return `<button class="hero locked" data-act="unlock" data-id="${id}" ${mt.souls < d.cost ? 'disabled' : ''} title="${d.text}">
        <span class="big">${d.icon}</span><b>${d.name}</b><small>${d.text}</small><small class="cost">Unlock 💠 ${d.cost}</small></button>`;
    }).join('');
    const cont = this.run && !this.run.over;
    const daily = mt.daily && mt.daily.date === today() ? `Today's best: <b>${mt.daily.best}</b>` : 'Same floors for everyone today.';
    return `<div class="title-card">
      <div class="logo-big">💣</div>
      <h1>Sweep Saga</h1>
      <p class="sub">A minesweeper roguelite. Clues show the total strength of the monsters next to a tile. Read them, fight what you find, level up to heal.</p>
      <div class="row">
        ${cont ? `<button class="primary" data-act="continue">Continue (floor ${this.run!.floor})</button>` : ''}
        <button class="${cont ? '' : 'primary'}" data-act="new">New run</button>
        <button data-act="daily" title="${daily}">📅 Daily</button>
        <button data-act="help">How to play</button>
      </div>
      <p class="dim small">${daily}</p>
      <h3>Hero</h3>
      <div class="heroes">${heroes}</div>
      <div class="meta">
        <span>Runs <b>${mt.runs}</b></span><span>Wins <b>${mt.wins}</b></span><span>Best <b>${mt.best}</b></span>
        <span>Deepest <b>${mt.bestFloor}</b></span><span>Kills <b>${mt.kills}</b></span><span title="Souls unlock heroes">💠 <b>${mt.souls}</b></span>
      </div>
    </div>`;
  }

  private tileSize(): number {
    const b = this.run!.board;
    const wide = window.innerWidth >= 900;
    const availW = wide ? Math.min(window.innerWidth - 380, 820) : window.innerWidth - 20;
    const availH = wide ? window.innerHeight - 110 : Math.max(300, window.innerHeight * 0.64);
    const gap = 3;
    const ts = Math.min(Math.floor((availW - (b.w - 1) * gap - 12) / b.w), Math.floor((availH - (b.h - 1) * gap - 12) / b.h));
    return Math.max(22, Math.min(52, ts));
  }

  private floorView(): string {
    const r = this.run!;
    const b = r.board;
    const ts = this.tileSize();
    let tiles = '';
    for (let i = 0; i < b.w * b.h; i++) tiles += this.tileHtml(i);
    return `<div class="floor ${this.targeting !== null ? 'targeting' : ''}">
      <section class="hud ${this.flash}">${this.hudView()}</section>
      <section class="board-col">
        <div class="board-wrap ${this.shake ? 'shake' : ''}" id="bw">
          <div class="board" style="--w:${b.w};--ts:${ts}px">${tiles}</div>
          <div class="fx-layer" id="fxl"></div>
        </div>
        <div class="info" id="info">${this.infoText()}</div>
      </section>
      <aside class="side">${this.sideView()}</aside>
    </div>`;
  }

  private hudView(): string {
    const r = this.run!;
    const hpPct = Math.max(0, (r.hp / r.maxHp) * 100);
    const xpPct = Math.min(100, (r.xp / need(r)) * 100);
    const slotsHtml = Array.from({ length: slots(r) }, (_, k) => {
      const it = r.items[k];
      if (!it) return `<span class="slot empty"></span>`;
      const d = ITEMS[it];
      return `<button class="slot ${this.targeting === k ? 'on' : ''}" data-act="use" data-k="${k}" title="${d.name}: ${d.text} (${ITEM_KEYS[k]})">${d.icon}<kbd>${ITEM_KEYS[k]}</kbd></button>`;
    }).join('');
    return `<div class="hero-line">
        <span class="hicon" title="${HEROES[r.hero].name}">${HEROES[r.hero].icon}</span>
        <div class="bars">
          <div class="bar hp" title="Health"><i style="width:${hpPct}%"></i><span>❤️ ${r.hp}/${r.maxHp}${r.ward ? ` · 🛡️${r.ward}` : ''}</span></div>
          <div class="bar xp" title="Experience"><i style="width:${xpPct}%"></i><span>Lv ${r.level} · XP ${r.xp}/${need(r)}</span></div>
        </div>
        <button class="lvl ${canLevel(r) ? 'ready' : ''}" data-act="level" ${canLevel(r) ? '' : 'disabled'} title="Level up: full heal and +2 max HP (L)">⬆️<small>Level</small></button>
      </div>
      <div class="slots">${slotsHtml}${stairsOpen(r) ? `<button class="primary descend" data-act="descend" title="Go down (D)">🪜 Descend</button>` : ''}</div>`;
  }

  private sideView(): string {
    const r = this.run!;
    const b = r.board;
    const rows = b.gen
      ? legend(r)
          .map(
            (e) =>
              `<li class="${e.left ? '' : 'done'}" title="${e.text ?? ''}"><span class="li">${e.icon}</span><span class="ln">${e.name}</span><b class="ls">${e.str}</b><span class="lc">${e.left}/${e.total}</span></li>`,
          )
          .join('')
      : `<li class="dim">Click any tile to start. The first click is always safe.</li>`;
    const boons = r.boons.length
      ? r.boons.map((id) => `<span class="boon-chip" title="${BOONS[id].name}: ${BOONS[id].text}">${BOONS[id].icon}</span>`).join('')
      : '<span class="dim">None yet</span>';
    return `<h3>Monsters <small class="dim">strength · left</small></h3>
      <ul class="legend">${rows}</ul>
      <h3>Boons</h3>
      <div class="boons">${boons}</div>`;
  }

  private tileHtml(i: number): string {
    const r = this.run!;
    const b = r.board;
    const cls = ['t'];
    let inner = '';
    const st = b.st[i];
    if (i === this.cursor) cls.push('cur');
    if (i === this.confirm) cls.push('warn');
    const fr = this.fresh.get(i);
    const style = fr !== undefined ? ` style="animation-delay:${fr}ms"` : '';
    if (fr !== undefined) cls.push('fresh');
    if (st === HIDDEN) {
      cls.push('h');
      const m = b.mark[i];
      if (m) inner = `<span class="mk ${m >= r.hp ? 'mk-bad' : ''}">${m < 0 ? '?' : m}</span>`;
    } else if (st === SEEN) {
      cls.push('s');
      if (b.kind[i] === CHEST || (b.mon[i] === 'mimic' && !b.unmask[i])) {
        cls.push('chest');
        if (b.kind[i] === CHEST && b.unmask[i]) cls.push('real');
        inner = `📦${b.mark[i] ? `<span class="mk">${b.mark[i] < 0 ? '?' : b.mark[i]}</span>` : ''}`;
      } else {
        const lab = monLabel(r, i);
        if (b.mon[i] === 'boss') cls.push('boss');
        if (b.mon[i] === 'ghost') cls.push('ghost');
        const d = damage(r, i);
        inner = `<span class="mi">${lab.icon}</span><b class="sv ${d >= r.hp ? 'bad' : ''}">${b.str[i]}</b>`;
      }
    } else {
      cls.push('o');
      if (b.kind[i] === MON) cls.push('dead');
      if (i === b.boss && stairsOpen(r)) {
        cls.push('stairs');
        inner = '🪜';
      } else if (b.item[i]) {
        cls.push('loot');
        inner = b.item[i] === 'coin' ? '🪙' : b.item[i] === 'key' ? '🗝️' : ITEMS[b.item[i] as keyof typeof ITEMS].icon;
      } else if (!clueShown(b, i)) {
        cls.push('gz');
        inner = '?';
      } else if (b.clue[i] > 0) {
        const c = b.clue[i];
        cls.push(`c${c <= 3 ? 1 : c <= 6 ? 2 : c <= 10 ? 3 : c <= 15 ? 4 : 5}`);
        inner = String(c);
      }
    }
    return `<div class="${cls.join(' ')}" data-i="${i}"${style}>${inner}</div>`;
  }

  /** Text for the tile under the pointer or cursor. */
  private infoText(): string {
    const r = this.run!;
    const b = r.board;
    if (this.targeting !== null) {
      const it = ITEMS[r.items[this.targeting]];
      return `${it.icon} ${it.name}: pick a tile. Esc cancels.`;
    }
    const i = this.hover >= 0 ? this.hover : this.cursor;
    if (!b.gen) return 'Click any tile to start. The first click is always safe.';
    if (i < 0) return stairsOpen(r) ? 'The boss is dead. Take the stairs 🪜 when you are ready.' : `Find and kill the boss to open the stairs. Right-click or long-press marks a tile.`;
    const st = b.st[i];
    if (st === HIDDEN) return b.mark[i] ? `Hidden tile. Your mark: ${b.mark[i] < 0 ? '?' : b.mark[i]}.` : 'Hidden tile.';
    if (st === SEEN) {
      if (b.kind[i] === CHEST || (b.mon[i] === 'mimic' && !b.unmask[i]))
        return b.kind[i] === CHEST && b.unmask[i] ? 'A real chest. Open it with a key.' : 'A chest… or a mimic. Use a key to open it.';
      const lab = monLabel(r, i);
      const extra = MONSTERS[b.mon[i] as keyof typeof MONSTERS]?.text ?? '';
      return `${lab.icon} ${lab.name}, strength ${b.str[i]}. The fight costs ${damage(r, i)} HP. ${b.mon[i] === 'boss' ? 'Kill it to open the stairs.' : extra}`;
    }
    if (i === b.boss && stairsOpen(r)) return '🪜 Stairs down. Click to leave this floor.';
    if (b.item[i]) return 'An item. Your bag is full.';
    if (!clueShown(b, i)) return 'A gazer next to this tile hides the clue.';
    return `Clue ${b.clue[i]}: the total strength of the monsters on the 8 tiles around it.${b.kind[i] === MON ? ' (A monster died here.)' : ''}`;
  }

  /** Floating numbers and effects after the board is in the DOM. */
  private afterBoard(): void {
    const layer = this.root.querySelector<HTMLElement>('#fxl');
    const board = this.root.querySelector<HTMLElement>('.board');
    if (!layer || !board) return;
    for (const f of this.floats) {
      const t = board.children[f.i] as HTMLElement | undefined;
      if (!t) continue;
      const el = document.createElement('div');
      el.className = `float ${f.cls}`;
      el.textContent = f.text;
      el.style.left = `${t.offsetLeft + t.offsetWidth / 2}px`;
      el.style.top = `${t.offsetTop}px`;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 1100);
    }
    this.floats = [];
    this.fresh.clear();
    this.shake = false;
    this.flash = '';
    this.highlight();
  }

  private highlight(): void {
    const board = this.root.querySelector<HTMLElement>('.board');
    if (!board || !this.run) return;
    board.querySelectorAll('.nb').forEach((e) => e.classList.remove('nb'));
    const i = this.hover >= 0 ? this.hover : this.cursor;
    if (i < 0 || this.run.board.st[i] !== OPEN) return;
    for (const k of nbrs(this.run.board)[i]) board.children[k]?.classList.add('nb');
  }

  private setHover(i: number): void {
    if (i === this.hover) return;
    this.hover = i;
    if (this.screen !== 'floor' || !this.run) return;
    const info = this.root.querySelector<HTMLElement>('#info');
    if (info) info.innerHTML = this.infoText();
    this.highlight();
  }

  private rewardView(): string {
    const r = this.run!;
    const last = r.boons[r.boons.length - 1];
    const boons = r.boonOffer
      .map((id, k) => {
        const d = BOONS[id];
        const picked = r.boonPicked && id === last;
        return `<button class="card ${picked ? 'on' : ''}" data-act="boon" data-k="${k}" ${r.boonPicked ? 'disabled' : ''}>
          <span class="big">${d.icon}</span><b>${d.name}</b><small>${d.text}</small></button>`;
      })
      .join('');
    const shop = r.shop
      .map((o, k) => {
        let icon = '🗝️';
        let name = 'Key';
        let text = 'Opens one chest.';
        if (o.kind === 'item') ({ icon, name, text } = ITEMS[o.item!]);
        if (o.kind === 'maxhp') {
          icon = '💗';
          name = 'Vitality';
          text = '+2 max HP and heal 2.';
        }
        const full = o.kind === 'item' && r.items.length >= slots(r);
        return `<div class="offer ${o.sold ? 'sold' : ''}"><span class="big">${icon}</span>
          <div><b>${name}</b><br><small class="dim">${text}</small></div>
          <button class="small" data-act="buy" data-k="${k}" ${o.sold || r.gold < o.price || full ? 'disabled' : ''}>${o.sold ? 'Sold' : `🪙 ${o.price}`}</button></div>`;
      })
      .join('');
    const bag = r.items.map((it) => `<span class="slot" title="${ITEMS[it].name}">${ITEMS[it].icon}</span>`).join('') || '<span class="dim">Empty</span>';
    return `<div class="reward">
      <div class="big">🪜</div>
      <h2>Floor ${r.floor} cleared</h2>
      <p class="sub">❤️ ${r.hp}/${r.maxHp} · Lv ${r.level} · XP ${r.xp}/${need(r)} · 🪙 ${r.gold} · 🗝️ ${r.keys}</p>
      <h3>Choose a boon</h3>
      <div class="cards">${boons}</div>
      <h3>Merchant</h3>
      <div class="offers">${shop}</div>
      <h3>Bag ${r.items.length}/${slots(r)}</h3>
      <div class="bag">${bag}</div>
      <button class="primary next" data-act="next" ${r.boonPicked ? '' : 'disabled'}>${r.boonPicked ? `Descend to floor ${r.floor + 1} →` : 'Pick a boon first'}</button>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="reward end">
      <div class="big">${e.won ? '🏆' : '🪦'}</div>
      <h2>${e.won ? 'The dragon falls' : 'Your saga ends'}</h2>
      <p class="sub">${e.won ? `${HEROES[e.hero].name} cleared all ${FLOORS} floors.` : `Killed by ${e.killedBy} on floor ${e.floor}.`}${e.daily ? ` Daily ${e.daily}.` : ''}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <ul class="stats">
        <li>Level ${e.level} · ${e.stats.levels} level-ups</li>
        <li>Monsters killed: ${e.stats.kills} · Bosses: ${e.stats.bosses}</li>
        <li>Tiles opened: ${e.stats.tiles} · Chests: ${e.stats.chests}</li>
        <li>Gold found: ${e.stats.gold}</li>
        <li>💠 Souls earned: +${e.souls}</li>
      </ul>
      <div class="row">
        <button class="primary" data-act="new">New run</button>
        <button data-act="to-title">Title screen</button>
      </div>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help')
      return `<div class="modal-bg" data-act="close"><div class="modal help" data-stop="1">
        <h2>How to play</h2>
        <ul>
          <li><b>Clues.</b> A number shows the <b>total strength</b> of the monsters on the 8 tiles around it. It does not count them.</li>
          <li><b>Open</b> a tile you know is safe. Opened tiles give a little XP. The first click is always safe.</li>
          <li><b>Fight</b> by clicking a monster or a hidden tile with a monster. You lose HP equal to its strength and gain XP. At 0 HP the run ends.</li>
          <li><b>Level up</b> when the XP bar is full. It refills your HP and adds 2 max HP. You choose when, so save it for when you need the heal.</li>
          <li><b>Mark</b> a hidden tile with right-click or a long press. The game does not check marks.</li>
          <li><b>Boss.</b> The strongest monster on each floor. Kill it and the stairs appear. Floor ${FLOORS} ends the run.</li>
          <li><b>Monster list.</b> The panel shows every monster type on the floor with its strength and how many are left.</li>
        </ul>
        <h3>Special monsters</h3>
        <ul>
          <li>👻 <b>Ghost:</b> always visible, but clues do not count it.</li>
          <li>👁️ <b>Gazer:</b> clues next to a living gazer show <b>?</b>.</li>
          <li>📦 <b>Mimic:</b> looks like a chest, but clues count its strength. A real chest adds 0.</li>
        </ul>
        <h3>Items</h3>
        <ul>
          ${Object.values(ITEMS)
            .map((d) => `<li>${d.icon} <b>${d.name}:</b> ${d.text}</li>`)
            .join('')}
          <li>🗝️ <b>Key:</b> opens a chest for gold and an item. 🪙 <b>Coins:</b> gold for the merchant.</li>
        </ul>
        <p class="dim">Every floor can be solved by logic alone. Between floors you pick a boon and can buy items.</p>
        <h3>Controls</h3>
        <p class="dim">Mouse: click to open or fight, right-click to mark. Touch: tap, long-press to mark. Keys: arrows move, Space/Enter opens, 1–9 marks, 0 clears, M marks ?, ${ITEM_KEYS.slice(0, 3).join(' ')}… use items, L levels up, D descends, Esc menu.</p>
        <button class="primary" data-act="close">Got it</button>
      </div></div>`;
    if (m.kind === 'menu')
      return `<div class="modal-bg" data-act="close"><div class="modal" data-stop="1">
        <h2>Menu</h2>
        <div class="col">
          <button class="primary" data-act="close">Resume</button>
          <button class="${m.confirm ? 'danger' : ''}" data-act="abandon">${m.confirm ? 'Click again to abandon' : 'Abandon run'}</button>
          <button data-act="to-title">Title screen (run is saved)</button>
        </div>
      </div></div>`;
    // Marker menu.
    const r = this.run!;
    const strs = [...new Set(legend(r).map((e) => e.str))].sort((a, c) => a - c);
    const btns = strs.map((s) => `<button data-act="mark" data-v="${s}" class="${s >= r.hp ? 'bad' : ''}">${s}</button>`).join('');
    return `<div class="modal-bg" data-act="close"><div class="modal mark" data-stop="1">
      <h3>Mark tile</h3>
      <div class="marks">${btns}<button data-act="mark" data-v="-1">?</button><button data-act="mark" data-v="0">✕</button></div>
    </div></div>`;
  }

  // ---------- Actions ----------

  private startRun(daily: boolean): void {
    initAudio();
    const d = today();
    this.run = daily ? newRun('wanderer', `D${d}`, d) : newRun(this.hero, randomSeedText());
    this.screen = 'floor';
    this.cursor = -1;
    this.targeting = null;
    this.confirm = -1;
    saveRun(this.run);
    this.render();
  }

  private async act(a: Action): Promise<void> {
    const r = this.run;
    if (!r || this.busy) return;
    const fx = apply(r, a);
    this.confirm = -1;
    this.handleFx(fx);
    if (r.phase === 'reward') this.screen = 'reward';
    else if (r.phase === 'floor') this.screen = 'floor';
    saveRun(r);
    if (r.over) {
      this.busy = true;
      this.render();
      await sleep(r.over === 'win' ? 1200 : 1000);
      this.finish();
      this.busy = false;
      return;
    }
    this.render();
  }

  private finish(): void {
    const r = this.run!;
    const souls = finishRun(this.meta, r);
    saveMeta(this.meta);
    this.end = {
      won: r.over === 'win',
      score: score(r),
      souls,
      floor: r.floor,
      level: r.level,
      killedBy: r.killedBy,
      stats: { ...r.stats },
      daily: r.daily,
      hero: r.hero,
    };
    saveRun(null);
    this.run = null;
    this.screen = 'end';
    this.modal = null;
    this.render();
  }

  private handleFx(fx: Fx[]): void {
    let opened = 0;
    let k = 0;
    for (const f of fx) {
      switch (f.t) {
        case 'open':
          opened++;
          this.fresh.set(f.i!, Math.min(400, k++ * 10));
          break;
        case 'hit':
          sfx.hit(f.n!);
          this.floats.push({ i: f.i!, text: `-${f.n}`, cls: 'dmg' });
          if (f.n! > 0) this.shake = true;
          break;
        case 'kill':
          sfx.kill();
          if (this.run!.board.mon[f.i!] === 'boss') sfx.boss();
          this.fresh.set(f.i!, 0);
          break;
        case 'xp':
          this.floats.push({ i: f.i!, text: `+${f.n} XP`, cls: 'xp' });
          break;
        case 'gold':
          sfx.coin();
          this.floats.push({ i: f.i!, text: `+${f.n}🪙`, cls: 'gold' });
          break;
        case 'key':
          sfx.key();
          this.floats.push({ i: f.i!, text: '+🗝️', cls: 'gold' });
          break;
        case 'item':
          sfx.item();
          if (f.i !== undefined) this.floats.push({ i: f.i, text: `+${f.text}`, cls: 'item' });
          break;
        case 'heal':
          sfx.heal();
          if (f.i !== undefined) this.floats.push({ i: f.i, text: `+${f.n}❤️`, cls: 'heal' });
          else this.toast(`Healed ${f.n} HP`);
          break;
        case 'level':
          sfx.level();
          this.flash = 'flash';
          this.toast(`Level ${this.run!.level}! HP refilled.`);
          break;
        case 'deny':
          sfx.deny();
          if (f.text) this.toast(f.text);
          break;
        case 'chest':
          sfx.chest();
          break;
        case 'scout':
          sfx.scout();
          break;
        case 'bomb':
          sfx.bomb();
          this.shake = true;
          break;
        case 'stairs':
          sfx.stairs();
          if (f.i !== undefined) this.toast('The boss is dead. Stairs 🪜 appeared.');
          break;
        case 'phoenix':
          sfx.heal();
          this.toast('🪶 The Phoenix Feather saves you!');
          break;
        case 'ward':
          sfx.select();
          break;
        case 'dead':
          sfx.lose();
          break;
        case 'win':
          sfx.win();
          break;
      }
    }
    if (opened) sfx.open(opened);
  }

  private tileClick(i: number): void {
    const r = this.run;
    if (!r || this.busy || r.phase !== 'floor') return;
    initAudio();
    const b = r.board;
    if (this.targeting !== null) {
      const slot = this.targeting;
      this.targeting = null;
      void this.act({ t: 'use', slot, i });
      return;
    }
    if (b.gen && this.confirm !== i) {
      let risky = false;
      if (b.st[i] === SEEN && b.kind[i] === MON && !(b.mon[i] === 'mimic' && !b.unmask[i])) risky = damage(r, i) >= r.hp;
      else if (b.st[i] === HIDDEN && b.mark[i] > 0) risky = damageFor(r, b.mark[i]) >= r.hp;
      if (risky) {
        this.confirm = i;
        sfx.deny();
        this.toast('This fight can kill you. Click again to fight anyway.');
        this.render();
        return;
      }
    }
    void this.act({ t: 'tile', i });
  }

  private useSlot(k: number): void {
    const r = this.run;
    if (!r || this.busy || r.phase !== 'floor' || !r.items[k]) return;
    initAudio();
    const it = ITEMS[r.items[k]];
    if (it.target) {
      if (!r.board.gen) {
        this.toast('Open a tile first.');
        return;
      }
      this.targeting = this.targeting === k ? null : k;
      sfx.select();
      this.render();
      return;
    }
    void this.act({ t: 'use', slot: k });
  }

  private openMark(i: number): void {
    const r = this.run;
    if (!r || !r.board.gen || this.busy) return;
    const b = r.board;
    if (!(b.st[i] === HIDDEN || (b.st[i] === SEEN && (b.kind[i] === CHEST || b.mon[i] === 'mimic')))) return;
    this.modal = { kind: 'mark', i };
    this.render();
  }

  private setMark(i: number, v: number): void {
    const b = this.run?.board;
    if (!b) return;
    if (b.st[i] === OPEN) return;
    b.mark[i] = v;
    sfx.mark();
    saveRun(this.run);
  }

  // ---------- Input ----------

  private tileOf(e: Event): number {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.t');
    return el ? Number(el.dataset.i) : -1;
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    const i = this.tileOf(e);
    if (i < 0) return;
    this.longPressed = false;
    this.pressAt = [e.clientX, e.clientY];
    clearTimeout(this.pressTimer);
    this.pressTimer = window.setTimeout(() => {
      this.longPressed = true;
      if (navigator.vibrate) navigator.vibrate(20);
      this.openMark(i);
    }, 450);
  }

  private clearPress(): void {
    clearTimeout(this.pressTimer);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') {
      if (Math.hypot(e.clientX - this.pressAt[0], e.clientY - this.pressAt[1]) > 12) this.clearPress();
      return;
    }
    this.setHover(this.tileOf(e));
  }

  private onContext(e: MouseEvent): void {
    const i = this.tileOf(e);
    if (i < 0) return;
    e.preventDefault();
    if (this.longPressed) return;
    this.openMark(i);
  }

  private onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (Date.now() < this.suppressUntil) return;
    const tile = target.closest<HTMLElement>('.t');
    if (tile && !this.modal) {
      this.tileClick(Number(tile.dataset.i));
      return;
    }
    const el = target.closest<HTMLElement>('[data-act]');
    if (!el) return;
    // Clicks inside a modal box do not close it.
    if (el.classList.contains('modal-bg') && target.closest('[data-stop]')) return;
    this.action(el.dataset.act!, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    initAudio();
    const r = this.run;
    switch (act) {
      case 'new':
        this.startRun(false);
        return;
      case 'daily':
        this.startRun(true);
        return;
      case 'continue':
        if (r) this.screen = r.phase === 'reward' ? 'reward' : 'floor';
        break;
      case 'hero':
        this.hero = d.id as HeroId;
        sfx.select();
        break;
      case 'unlock': {
        const h = HEROES[d.id as HeroId];
        if (this.meta.souls >= h.cost && !this.meta.unlocked.includes(h.id)) {
          this.meta.souls -= h.cost;
          this.meta.unlocked.push(h.id);
          this.hero = h.id;
          saveMeta(this.meta);
          sfx.buy();
        }
        break;
      }
      case 'help':
        this.modal = { kind: 'help' };
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        break;
      case 'close':
        this.modal = null;
        break;
      case 'mute': {
        const m = toggleMute();
        try {
          localStorage.setItem('sweep.mute', m ? '1' : '0');
        } catch {
          /* ignore */
        }
        break;
      }
      case 'abandon':
        if (this.modal?.kind === 'menu' && this.modal.confirm && r) {
          r.over = 'dead';
          r.phase = 'over';
          r.killedBy = 'giving up';
          this.finish();
          return;
        }
        this.modal = { kind: 'menu', confirm: true };
        break;
      case 'to-title':
        this.modal = null;
        this.screen = 'title';
        break;
      case 'level':
        void this.act({ t: 'level' });
        return;
      case 'use':
        this.useSlot(Number(d.k));
        return;
      case 'descend':
        void this.act({ t: 'descend' });
        return;
      case 'boon':
        sfx.item();
        void this.act({ t: 'boon', k: Number(d.k) });
        return;
      case 'buy':
        sfx.buy();
        void this.act({ t: 'buy', k: Number(d.k) });
        return;
      case 'next':
        this.cursor = -1;
        void this.act({ t: 'next' });
        return;
      case 'mark':
        if (this.modal?.kind === 'mark') this.setMark(this.modal.i, Number(d.v));
        this.modal = null;
        break;
    }
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'Escape') {
      if (this.modal) this.modal = null;
      else if (this.targeting !== null) this.targeting = null;
      else if (this.screen === 'floor' || this.screen === 'reward') this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.modal) {
      if (this.modal.kind === 'mark' && /^[0-9]$/.test(k)) {
        this.setMark(this.modal.i, Number(k));
        this.modal = null;
        this.render();
      } else if (k === 'Enter') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (k === 'h' || k === 'H' || k === '?') {
      this.modal = { kind: 'help' };
      this.render();
      return;
    }
    if (this.screen === 'title' && k === 'Enter') {
      if (this.run && !this.run.over) this.action('continue', {});
      else this.startRun(false);
      return;
    }
    if (this.screen === 'end' && k === 'Enter') {
      this.startRun(false);
      return;
    }
    if (this.screen === 'reward' && this.run) {
      if (/^[1-3]$/.test(k) && !this.run.boonPicked) void this.act({ t: 'boon', k: Number(k) - 1 });
      if (k === 'Enter' && this.run.boonPicked) void this.act({ t: 'next' });
      return;
    }
    if (this.screen !== 'floor' || !this.run) return;
    const b = this.run.board;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[k]) {
      e.preventDefault();
      if (this.cursor < 0) this.cursor = Math.floor(b.h / 2) * b.w + Math.floor(b.w / 2);
      else {
        const x = Math.max(0, Math.min(b.w - 1, (this.cursor % b.w) + moves[k][0]));
        const y = Math.max(0, Math.min(b.h - 1, Math.floor(this.cursor / b.w) + moves[k][1]));
        this.cursor = y * b.w + x;
      }
      this.hover = -1;
      this.render();
      return;
    }
    if ((k === ' ' || k === 'Enter') && this.cursor >= 0) {
      e.preventDefault();
      this.tileClick(this.cursor);
      return;
    }
    if (/^[0-9]$/.test(k) && this.cursor >= 0) {
      this.setMark(this.cursor, Number(k));
      this.render();
      return;
    }
    if ((k === 'm' || k === 'M') && this.cursor >= 0) {
      this.setMark(this.cursor, -1);
      this.render();
      return;
    }
    const slot = ITEM_KEYS.indexOf(k.toUpperCase());
    if (slot >= 0) {
      this.useSlot(slot);
      return;
    }
    if (k === 'l' || k === 'L') void this.act({ t: 'level' });
    if (k === 'd' || k === 'D') void this.act({ t: 'descend' });
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => {
        const r = this.run;
        return {
          screen: this.screen,
          busy: this.busy,
          floor: r?.floor,
          hp: r?.hp,
          maxHp: r?.maxHp,
          level: r?.level,
          xp: r?.xp,
          gold: r?.gold,
          keys: r?.keys,
          items: r?.items,
          boons: r?.boons,
          phase: r?.phase,
          gen: r?.board.gen,
          size: r ? `${r.board.w}x${r.board.h}` : null,
          stairs: r ? stairsOpen(r) : false,
          end: this.end,
          modal: this.modal?.kind ?? null,
        };
      },
      /** One bot action. The bot uses the logic solver on what the player sees. */
      step: async (smart = true) => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            if (this.run && !this.run.over) this.action('continue', {});
            else this.startRun(false);
            return 'title';
          case 'floor':
          case 'reward': {
            const r = this.run!;
            const a = botAction(r, smart);
            await this.act(a);
            return a.t;
          }
          case 'end':
            return 'end';
        }
      },
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.render();
      },
      heal: () => {
        if (this.run) this.run.hp = this.run.maxHp;
        this.render();
      },
      xp: (n: number) => {
        if (this.run) this.run.xp += n;
        this.render();
      },
      souls: (n: number) => {
        this.meta.souls += n;
        saveMeta(this.meta);
        this.render();
      },
      floor: (n: number) => {
        const r = this.run;
        if (!r) return;
        r.floor = Math.max(1, Math.min(FLOORS, n)) - 1;
        r.phase = 'reward';
        r.boonPicked = true;
        apply(r, { t: 'next' });
        this.screen = 'floor';
        this.render();
      },
      reveal: () => {
        const r = this.run;
        if (!r || !r.board.gen) return;
        r.board.st = r.board.st.map((v, i) => (v === HIDDEN && r.board.kind[i] === MON ? SEEN : v));
        r.board.unmask = r.board.unmask.map(() => 1);
        this.render();
      },
      reset: () => {
        this.meta = defaultMeta();
        saveMeta(this.meta);
        this.run = null;
        saveRun(null);
        this.screen = 'title';
        this.render();
      },
      has: (b: string) => (this.run ? has(this.run, b as never) : false),
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
