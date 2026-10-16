import { botDecide, type BotAction } from './bot';
import { CELLS, GRID_H, GRID_W, ITEMS, LANDLORDS, RARITY_COLOR, SYMBOLS, SYMBOL_LIST, WIN_RENTS, type SymDef } from './data';
import { randomSeedText } from './rng';
import {
  LOCKED,
  doSpin,
  due,
  goEndless,
  loadMeta,
  loadRun,
  medalsFor,
  newRun,
  payRent,
  pickItem,
  pickSymbol,
  removeSymbol,
  rentAt,
  reroll,
  saveMeta,
  saveRun,
  score,
  skipPick,
  unlockCost,
  type RunState,
  type SpinOutcome,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';
import { growAfter, type SymInst } from './spin';

type Screen = 'title' | 'play' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'pool' } | { kind: 'info'; id: string; n?: number };

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips the reel and effect animations. */
const FAST = PARAMS.has('fast');

const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

function tagText(d: SymDef): string {
  return d.tags.length ? d.tags.join(' · ') : 'no tag';
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private level = 0;
  private busy = false;
  private skipAnim = false;
  /** The grid on screen: symbol ids per cell. */
  private shown: (SymInst | null)[] = Array(CELLS).fill(null);
  /** The coin count on screen during an animation. */
  private shownCoins: number | null = null;
  private lastTotal: number | null = null;
  private end: { victory: boolean; score: number; medals: number; rent: number; earned: number; bestSpin: number; level: number; endless: boolean } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (PARAMS.has('debug')) this.installDebug();
    this.level = this.meta.maxLevel;
    this.render();
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    if (this.screen === 'title') body = this.titleView();
    else if (this.screen === 'play') body = this.playView();
    else body = this.endView();
    const top = this.run && this.screen === 'play' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const coins = this.shownCoins ?? r.coins;
    return `<header class="top">
      <span class="coins" id="coins" title="Coins">🪙 <b>${coins}</b></span>
      <span title="Removal tokens">✂️ ${r.removals}</span>
      <span title="Reroll tokens">🎲 ${r.rerolls}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="pool" title="Your symbol pool">👜 ${r.pool.length}</button>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const r = this.run;
    const unlocks = LOCKED.map((id) => {
      const s = SYMBOLS[id];
      const it = ITEMS[id];
      const own = m.unlocked.includes(id);
      const cost = unlockCost(id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${s ? s.icon : it.icon}</span><span><b>${s ? s.name : it.name}</b><small>${s ? 'Symbol' : 'Item'}: ${s ? s.text : it.text}</small></span>
        ${own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${id}" ${m.medals >= cost ? '' : 'disabled'}>🏅 ${cost}</button>`}</div>`;
    }).join('');
    const levels = LANDLORDS.map(
      (l, i) =>
        `<button class="lvl ${i === this.level ? 'on' : ''}" data-act="level" data-i="${i}" ${i > m.maxLevel ? 'disabled' : ''} title="${l.text}">${i > m.maxLevel ? '🔒' : l.icon}<small>${l.name}</small></button>`,
    ).join('');
    return `<div class="title">
      <div class="logo">🎰</div>
      <h1>Spin Lord</h1>
      <p class="sub">Spin your symbols. They pay coins and react to their neighbors. Pay the rent ${WIN_RENTS} times to win.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (rent ${r.rent + 1}/${WIN_RENTS}, 🪙 ${r.coins})</button>` : ''}
      <div class="levels">${levels}</div>
      <p class="hint">${LANDLORDS[this.level].text}</p>
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best rent ${m.bestRent}/${WIN_RENTS} · Best score ${m.best} · Spins ${m.spins}</p>
      <h2>Unlocks <small>🏅 ${m.medals} medals</small></h2>
      <p class="sub">Each paid rent gives a medal. A win gives more. Unlock new symbols and items for later runs.</p>
      <div class="armory">${unlocks}</div>
    </div>`;
  }

  private cellHtml(s: SymInst | null, i: number): string {
    if (!s) return `<div class="cell empty" data-act="cell" data-i="${i}"><span class="sym"></span></div>`;
    const d = SYMBOLS[s.id];
    let badge = '';
    if (d.grows) badge = `${Math.max(0, growAfter(d, this.run?.items ?? []) - s.n)}`;
    else if (d.expires && !(d.id === 'candle' && this.run?.items.includes('lantern'))) badge = `${Math.max(0, d.expires.after - s.n)}`;
    else if (d.special === 'wine') badge = `+${Math.floor(s.n / 3)}`;
    return `<div class="cell r-${d.rarity.replace(' ', '')}" data-act="cell" data-i="${i}"><span class="sym">${d.icon}</span>${badge ? `<i class="badge">${badge}</i>` : ''}</div>`;
  }

  private gridHtml(): string {
    const cols: string[] = [];
    for (let x = 0; x < GRID_W; x++) {
      let cells = '';
      for (let y = 0; y < GRID_H; y++) cells += this.cellHtml(this.shown[y * GRID_W + x], y * GRID_W + x);
      cols.push(`<div class="col"><div class="strip">${cells}</div></div>`);
    }
    return cols.join('');
  }

  private playView(): string {
    const r = this.run!;
    const info = rentAt(r.rent, r.level);
    const d = info.due;
    const pct = Math.min(100, ((this.shownCoins ?? r.coins) / d) * 100);
    const items = r.items.map((id) => `<button class="item" data-act="item-info" data-id="${id}" title="${ITEMS[id].name}: ${ITEMS[id].text}">${ITEMS[id].icon}</button>`).join('');
    return `<div class="play">
      <div class="rentbar">
        <div class="rentinfo"><span>🏠 Rent ${r.rent + 1}${r.endless ? '' : `/${WIN_RENTS}`}${r.endless ? ' · endless' : ''}</span><span><b>${d}</b> 🪙 due in <b>${r.spinsLeft}</b> spin${r.spinsLeft === 1 ? '' : 's'}</span></div>
        <div class="meter"><div class="fill ${pct >= 100 ? 'full' : ''}" id="meter" style="width:${pct}%"></div></div>
      </div>
      <div class="machine">
        <div class="reels" id="reels">${this.gridHtml()}</div>
        <div class="fx" id="fx"></div>
      </div>
      <div class="total" id="total">${this.lastTotal !== null ? `Last spin: <b>+${this.lastTotal}</b>` : '&nbsp;'}</div>
      <div class="panel" id="panel">${this.panelHtml()}</div>
      <div class="items">${items || '<span class="hint">No items yet. You get to pick one after each rent.</span>'}</div>
    </div>`;
  }

  private symCard(id: string, i: number, act: string): string {
    const d = SYMBOLS[id];
    return `<button class="card" data-act="${act}" data-i="${i}" style="--rc:${RARITY_COLOR[d.rarity]}">
      <span class="kb">${i + 1}</span><span class="big">${d.icon}</span><b>${d.name}</b>
      <small class="rar">${d.rarity} · ${tagText(d)}</small><small>${d.text}</small></button>`;
  }

  private panelHtml(): string {
    const r = this.run!;
    if (this.busy) return `<p class="hint">Tap or press Space to skip the animation.</p>`;
    switch (r.phase) {
      case 'spin':
        return `<button class="primary spin-btn" data-act="spin">🎰 SPIN</button><p class="hint">Space or Enter to spin · tap a symbol for details</p>`;
      case 'pick':
        return `<h3>Add a symbol to your pool</h3>
          <div class="cards">${r.offer.map((id, i) => this.symCard(id, i, 'pick')).join('')}</div>
          <div class="row"><button data-act="skip">Skip (S)</button><button data-act="reroll" ${r.rerolls > 0 ? '' : 'disabled'}>🎲 Reroll (R) · ${r.rerolls}</button></div>`;
      case 'rent': {
        const d = due(r);
        const ok = r.coins >= d;
        return `<h3>🏠 The landlord is here</h3>
          <p>Rent due: <b>${d}</b> 🪙 · You have <b class="${ok ? 'good' : 'bad'}">${r.coins}</b> 🪙</p>
          ${ok ? '<button class="primary" data-act="rent">Pay rent</button>' : '<button class="danger" data-act="rent">You cannot pay…</button>'}`;
      }
      case 'item':
        return `<h3>Rent paid! Pick an item</h3>
          <div class="cards">${r.itemOffer
            .map((id, i) => {
              const it = ITEMS[id];
              return `<button class="card" data-act="item" data-i="${i}" style="--rc:${RARITY_COLOR[it.rarity]}"><span class="kb">${i + 1}</span><span class="big">${it.icon}</span><b>${it.name}</b><small class="rar">${it.rarity}</small><small>${it.text}</small></button>`;
            })
            .join('')}</div>
          <div class="row"><button data-act="item-skip">Skip (S)</button></div>`;
      default:
        return '';
    }
  }

  private endView(): string {
    const e = this.end!;
    const lvl = LANDLORDS[e.level];
    return `<div class="end">
      <div class="huge">${e.victory ? '👑' : '🏚️'}</div>
      <h1>${e.victory ? 'You are the Spin Lord!' : e.endless ? 'Endless run over' : 'Evicted!'}</h1>
      <p class="sub">${e.victory ? `You paid all ${WIN_RENTS} rents to the ${lvl.name}.` : `The ${lvl.name} threw you out after ${e.rent} paid rent${e.rent === 1 ? '' : 's'}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>Rents paid ${e.rent} · Coins earned ${e.earned} · Best spin ${e.bestSpin}</p>
      <p class="good">+${e.medals} 🏅 medals${e.victory && e.level < LANDLORDS.length - 1 ? ` · ${LANDLORDS[e.level + 1].icon} ${LANDLORDS[e.level + 1].name} unlocked` : ''}</p>
      ${e.victory && this.run ? '<button class="primary" data-act="endless">♾️ Keep spinning (endless mode)</button>' : ''}
      <button class="${e.victory ? '' : 'primary'}" data-act="new">New run</button>
      <button data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Spin.</b> Your symbols land at random on the 5×4 grid. Each symbol pays coins. Empty cells pay nothing.</li>
          <li><b>Neighbors matter.</b> Many symbols react to the 8 cells around them. A Cat next to Milk drinks it for +9. A Miner breaks Ore into Gems. A Sun makes plants pay ×3.</li>
          <li><b>Fixed order.</b> Each spin resolves in steps: destroy, transform, grow, pay, then burn-out. Destroyed symbols leave your pool.</li>
          <li><b>After each spin</b> add 1 of 3 offered symbols, or skip. If you have more than 20 symbols, only 20 random ones land each spin.</li>
          <li><b>Rent</b> comes due every few spins and grows each time. If you cannot pay, the run ends. Pay ${WIN_RENTS} rents to win.</li>
          <li><b>After each rent</b> pick an item. Items are passive rules, for example "Fruit pays +1".</li>
          <li><b>Tokens.</b> ✂️ removal tokens remove a symbol from your pool (open 👜). 🎲 reroll tokens show new offers. You get one of each per rent.</li>
          <li>Tap a symbol on the grid to read what it does. Numbers in the corner count down to a change.</li>
          <li>Keys: Space spin · 1–4 pick · S skip · R reroll · P pool · Esc closes.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'pool') {
      const r = this.run!;
      const counts = new Map<string, SymInst[]>();
      for (const s of r.pool) counts.set(s.id, [...(counts.get(s.id) ?? []), s]);
      const canRemove = r.removals > 0 && (r.phase === 'spin' || r.phase === 'pick') && !this.busy;
      const rows = [...counts.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([id, list]) => {
          const d = SYMBOLS[id];
          return `<div class="arm"><span class="big">${d.icon}</span><span><b>${d.name} ×${list.length}</b><small>${d.text}</small></span>
            <button data-act="remove" data-uid="${list[list.length - 1].uid}" ${canRemove ? '' : 'disabled'}>✂️ Remove</button></div>`;
        })
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>Your pool <small>${r.pool.length} symbols · ✂️ ${r.removals}</small></h2>
        <p class="hint">${r.pool.length > CELLS ? `Only ${CELLS} random symbols land each spin.` : `${CELLS - r.pool.length} cells stay empty each spin.`} Removal tokens: ${r.removals}.</p>
        <div class="armory">${rows}</div>
        <button class="primary" data-act="modal-close">Close</button>
      </div></div>`;
    }
    if (m.kind === 'info') {
      const d = SYMBOLS[m.id];
      return `<div class="modal" data-act="modal-close"><div class="sheet small" data-stop style="--rc:${RARITY_COLOR[d.rarity]}">
        <div class="huge">${d.icon}</div><h2>${d.name}</h2>
        <p class="rar">${d.rarity} · ${tagText(d)}</p><p>${d.text}</p>
        <button class="primary" data-act="modal-close">OK</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet small" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a loss.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  /** Updates the panel, the top bar and the items without touching the grid. */
  private refresh(): void {
    if (this.screen !== 'play' || this.modal) return this.render();
    const top = this.root.querySelector<HTMLElement>('header.top');
    if (top) top.outerHTML = this.topBar();
    const panel = this.root.querySelector<HTMLElement>('#panel');
    if (panel) panel.innerHTML = this.panelHtml();
  }

  // ---------- Spin animation ----------

  private fxAt(cell: number, text: string, cls: string): void {
    const fx = this.root.querySelector<HTMLElement>('#fx');
    if (!fx) return;
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${(cell % GRID_W) * 20 + 10}%`;
    el.style.top = `${Math.floor(cell / GRID_W) * 25 + 8}%`;
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  private cellEl(cell: number): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(`.cell[data-i="${cell}"]`);
  }

  private flashCell(cell: number, cls: string): void {
    const el = this.cellEl(cell);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  private setCoins(v: number): void {
    this.shownCoins = v;
    const el = this.root.querySelector<HTMLElement>('#coins b');
    if (el) el.textContent = String(v);
    const meter = this.root.querySelector<HTMLElement>('#meter');
    if (meter && this.run) {
      const pct = Math.min(100, (v / due(this.run)) * 100);
      meter.style.width = `${pct}%`;
      meter.classList.toggle('full', pct >= 100);
    }
  }

  private async wait(ms: number): Promise<void> {
    if (FAST || this.skipAnim) return;
    await sleep(ms);
  }

  private async reelAnim(placed: (SymInst | null)[]): Promise<void> {
    const reels = this.root.querySelector<HTMLElement>('#reels');
    if (!reels || FAST) return;
    const pool = this.run!.pool;
    const randSym = (): SymInst | null => (Math.random() < 0.25 || !pool.length ? null : pool[Math.floor(Math.random() * pool.length)]);
    const K = 12;
    const cols = [...reels.querySelectorAll<HTMLElement>('.col')];
    cols.forEach((col, x) => {
      let cells = '';
      for (let y = 0; y < GRID_H; y++) cells += this.cellHtml(this.shown[y * GRID_W + x], -1);
      for (let k = 0; k < K - GRID_H + x * 3; k++) cells += this.cellHtml(randSym(), -1);
      for (let y = 0; y < GRID_H; y++) cells += this.cellHtml(placed[y * GRID_W + x], y * GRID_W + x);
      col.innerHTML = `<div class="strip spinning">${cells}</div>`;
    });
    void reels.offsetWidth;
    const ticker = setInterval(() => sfx.tick(), 70);
    const stops = cols.map((col, x) => {
      const strip = col.firstElementChild as HTMLElement;
      const total = K + x * 3 + GRID_H;
      const dur = 0.55 + x * 0.16;
      strip.style.transition = `transform ${dur}s cubic-bezier(.2,.75,.3,1.08)`;
      strip.style.transform = `translateY(-${((total - GRID_H) / total) * 100}%)`;
      return sleep(dur * 1000).then(() => {
        sfx.stop(x);
        col.classList.add('landed');
      });
    });
    await Promise.race([Promise.all(stops), this.skipPromise()]);
    clearInterval(ticker);
    this.shown = placed.slice();
    reels.innerHTML = this.gridHtml();
  }

  private skipWaiters: (() => void)[] = [];
  private skipPromise(): Promise<void> {
    return new Promise((res) => this.skipWaiters.push(res));
  }

  private requestSkip(): void {
    if (!this.busy) return;
    this.skipAnim = true;
    this.skipWaiters.forEach((f) => f());
    this.skipWaiters = [];
  }

  private async playSpin(): Promise<void> {
    const r = this.run!;
    if (this.busy || r.phase !== 'spin') return;
    initAudio();
    this.busy = true;
    this.skipAnim = false;
    const startCoins = r.coins;
    this.shownCoins = startCoins;
    let out: SpinOutcome;
    try {
      out = doSpin(r);
    } catch {
      this.busy = false;
      return;
    }
    this.meta.spins++;
    saveMeta(this.meta);
    saveRun(r);
    this.lastTotal = null;
    this.render();
    await this.reelAnim(out.result.placed);
    this.shown = out.result.placed.slice();
    const reels = this.root.querySelector<HTMLElement>('#reels');
    if (reels) reels.innerHTML = this.gridHtml();
    let coins = startCoins;
    let k = 0;
    const totalEl = this.root.querySelector<HTMLElement>('#total');
    let spinTotal = 0;
    const showTotal = (): void => {
      if (totalEl) totalEl.innerHTML = `This spin: <b>+${spinTotal}</b>`;
    };
    for (const ev of out.result.events) {
      switch (ev.t) {
        case 'destroy': {
          this.flashCell(ev.by, 'act');
          const el = this.cellEl(ev.cell);
          el?.classList.add('boom');
          if (ev.coins) this.fxAt(ev.by, `+${ev.coins}`, 'gold');
          if (!this.skipAnim) sfx.destroy();
          coins += ev.coins;
          spinTotal += ev.coins;
          this.setCoins(coins);
          showTotal();
          await this.wait(380);
          break;
        }
        case 'transform': {
          const s = this.shown[ev.cell];
          if (s) this.shown[ev.cell] = { ...s, id: ev.to, n: 0 };
          const el = this.cellEl(ev.cell);
          if (el) el.outerHTML = this.cellHtml(this.shown[ev.cell], ev.cell);
          this.flashCell(ev.cell, 'morph');
          if (!this.skipAnim) sfx.transform();
          await this.wait(360);
          break;
        }
        case 'add':
          this.fxAt(ev.cell, `+${SYMBOLS[ev.id].icon}`, 'add');
          if (!this.skipAnim) sfx.add();
          await this.wait(260);
          break;
        case 'pay':
          if (ev.coins <= 0) break;
          this.flashCell(ev.cell, ev.mult > 1 || ev.coins >= 10 ? 'paybig' : 'pay');
          this.fxAt(ev.cell, `+${ev.coins}${ev.mult > 1 ? ` ×${ev.mult}` : ''}`, ev.mult > 1 || ev.coins >= 10 ? 'gold big' : 'gold');
          if (!this.skipAnim) (ev.coins >= 20 ? sfx.big : () => sfx.pay(k))();
          k++;
          coins += ev.coins;
          spinTotal += ev.coins;
          this.setCoins(coins);
          showTotal();
          await this.wait(ev.mult > 1 || ev.coins >= 10 ? 200 : 110);
          break;
        case 'expire': {
          const el = this.cellEl(ev.cell);
          el?.classList.add('fade');
          await this.wait(240);
          break;
        }
        case 'bonus':
          this.fxAt(7, ev.text, 'banner');
          if (!this.skipAnim) sfx.big();
          coins += ev.coins;
          spinTotal += ev.coins;
          this.setCoins(coins);
          showTotal();
          await this.wait(600);
          break;
      }
    }
    if (out.extra) this.toast(`📒 Savings: +${out.extra} coins`);
    if (out.eraser) this.toast('🧽 Eraser: +1 removal token');
    this.shown = out.result.grid.map((g) => (g.sym && !g.destroyed ? g.sym : null));
    this.lastTotal = out.result.coins + out.extra;
    this.shownCoins = null;
    this.busy = false;
    this.skipAnim = false;
    this.skipWaiters = [];
    this.render();
  }

  // ---------- Actions ----------

  private startRun(): void {
    this.run = newRun(randomSeedText(), this.level, this.meta);
    this.meta.runs++;
    saveMeta(this.meta);
    saveRun(this.run);
    this.shown = Array(CELLS).fill(null);
    this.lastTotal = null;
    this.end = null;
    this.screen = 'play';
    this.render();
  }

  private finish(victory: boolean): void {
    const r = this.run!;
    const m = this.meta;
    const medals = Math.max(0, medalsFor(r) - r.medalsGiven);
    m.medals += medals;
    r.medalsGiven += medals;
    const sc = score(r);
    m.best = Math.max(m.best, sc);
    m.bestRent = Math.max(m.bestRent, r.rent);
    if (victory) {
      m.wins++;
      m.maxLevel = Math.max(m.maxLevel, Math.min(r.level + 1, LANDLORDS.length - 1));
      sfx.win();
    } else {
      sfx.lose();
    }
    saveMeta(m);
    this.end = { victory, score: sc, medals, rent: r.rent, earned: r.earned, bestSpin: r.bestSpin, level: r.level, endless: r.endless };
    if (!victory) {
      r.phase = 'over';
      this.run = null;
    }
    saveRun(this.run);
    this.screen = 'end';
    this.modal = null;
    this.render();
  }

  private act(a: BotAction): void {
    const r = this.run;
    if (!r || this.busy) return;
    switch (a.k) {
      case 'spin':
        void this.playSpin();
        return;
      case 'remove': {
        const s = r.pool.find((x) => x.uid === a.uid);
        if (s && removeSymbol(r, a.uid)) {
          sfx.remove();
          this.toast(`✂️ Removed ${SYMBOLS[s.id].icon} ${SYMBOLS[s.id].name}`);
        } else sfx.deny();
        break;
      }
      case 'pick': {
        const id = r.offer[a.i];
        if (!id) return;
        pickSymbol(r, a.i);
        sfx.pick();
        this.toast(`${SYMBOLS[id].icon} ${SYMBOLS[id].name} joins your pool`);
        break;
      }
      case 'skip':
        skipPick(r);
        break;
      case 'reroll':
        if (reroll(r)) sfx.reroll();
        else sfx.deny();
        break;
      case 'rent': {
        if (r.phase !== 'rent') return;
        const ok = payRent(r);
        saveRun(r);
        if (!ok) {
          this.finish(false);
          return;
        }
        sfx.rent();
        if ((r.phase as string) === 'won') {
          this.finish(true);
          return;
        }
        this.toast(`🏠 Rent paid! +1 ✂️ +1 🎲`);
        break;
      }
      case 'item': {
        const id = r.itemOffer[a.i];
        if (r.phase !== 'item') return;
        if (id === undefined && a.i >= 0) return;
        pickItem(r, a.i);
        if (id) {
          sfx.item();
          this.toast(`${ITEMS[id].icon} ${ITEMS[id].name}: ${ITEMS[id].text}`);
        }
        break;
      }
      case 'endless':
        goEndless(r);
        this.screen = 'play';
        this.end = null;
        break;
      case 'none':
        return;
    }
    saveRun(r);
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'play' || !this.run) return;
    if (this.busy) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        this.requestSkip();
      }
      return;
    }
    const r = this.run;
    const key = e.key.toLowerCase();
    if (key === 'escape') {
      this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (key === 'p') {
      this.modal = { kind: 'pool' };
      this.render();
      return;
    }
    if (r.phase === 'spin' && (key === ' ' || key === 'enter')) {
      e.preventDefault();
      this.act({ k: 'spin' });
    } else if (r.phase === 'rent' && (key === ' ' || key === 'enter')) {
      e.preventDefault();
      this.act({ k: 'rent' });
    } else if (r.phase === 'pick') {
      if (/^[1-4]$/.test(key)) this.act({ k: 'pick', i: Number(key) - 1 });
      else if (key === 's') this.act({ k: 'skip' });
      else if (key === 'r') this.act({ k: 'reroll' });
    } else if (r.phase === 'item') {
      if (/^[1-3]$/.test(key)) this.act({ k: 'item', i: Number(key) - 1 });
      else if (key === 's') this.act({ k: 'item', i: -1 });
    }
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    if (this.busy && this.screen === 'play' && !this.modal) {
      const t = e.target as HTMLElement;
      if (!t.closest('header')) {
        this.requestSkip();
        return;
      }
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    this.action(el.dataset.act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
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
      case 'pool':
        this.modal = { kind: 'pool' };
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
        if (this.run) this.finish(false);
        return;
      case 'title':
        this.modal = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.startRun();
        return;
      case 'continue':
        if (!this.run) return;
        this.shown = Array(CELLS).fill(null);
        if (this.run.phase === 'won') {
          this.act({ k: 'endless' });
          return;
        }
        this.screen = 'play';
        this.render();
        return;
      case 'level':
        this.level = Number(d.i);
        this.render();
        return;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.medals < cost || this.meta.unlocked.includes(id)) return;
        this.meta.medals -= cost;
        this.meta.unlocked.push(id);
        saveMeta(this.meta);
        sfx.item();
        this.toast('Unlocked! It shows up in your next run.');
        this.render();
        return;
      }
      case 'cell': {
        const i = Number(d.i);
        const s = this.shown[i];
        if (s) {
          this.modal = { kind: 'info', id: s.id, n: s.n };
          this.render();
        }
        return;
      }
      case 'item-info': {
        const it = ITEMS[d.id!];
        this.toast(`${it.icon} ${it.name}: ${it.text}`);
        return;
      }
      case 'spin':
        this.act({ k: 'spin' });
        return;
      case 'pick':
        this.act({ k: 'pick', i: Number(d.i) });
        return;
      case 'skip':
        this.act({ k: 'skip' });
        return;
      case 'reroll':
        this.act({ k: 'reroll' });
        return;
      case 'rent':
        this.act({ k: 'rent' });
        return;
      case 'item':
        this.act({ k: 'item', i: Number(d.i) });
        return;
      case 'item-skip':
        this.act({ k: 'item', i: -1 });
        return;
      case 'remove':
        this.act({ k: 'remove', uid: Number(d.uid) });
        return;
      case 'endless':
        this.act({ k: 'endless' });
        return;
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        phase: this.run?.phase ?? null,
        busy: this.busy,
        modal: this.modal?.kind ?? null,
        rent: this.run?.rent ?? null,
        due: this.run ? due(this.run) : null,
        spinsLeft: this.run?.spinsLeft ?? null,
        coins: this.run?.coins ?? null,
        pool: this.run?.pool.map((s) => s.id) ?? null,
        items: this.run?.items ?? null,
        end: this.end,
      }),
      coins: (n: number) => {
        if (this.run) this.run.coins += n;
        this.refresh();
      },
      give: (id: string) => {
        if (this.run && SYMBOLS[id]) this.run.pool.push({ uid: this.run.nextUid++, id, n: 0 });
        this.refresh();
      },
      item: (id: string) => {
        if (this.run && ITEMS[id] && !this.run.items.includes(id)) this.run.items.push(id);
        this.render();
      },
      medals: (n: number) => {
        this.meta.medals += n;
        saveMeta(this.meta);
        this.render();
      },
      symbols: () => SYMBOL_LIST.length,
      /** One bot action. The bot simulates a few spins to rate each choice. */
      step: (): string => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        if (this.screen === 'title') {
          if (this.run) this.action('continue', {});
          else this.startRun();
          return 'start';
        }
        if (this.screen === 'end') return 'end';
        const a = botDecide(this.run!, 'smart');
        this.act(a);
        return a.k;
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
