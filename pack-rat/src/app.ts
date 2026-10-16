import { DT, FATIGUE_AT, type BEvent, type BattleResult } from './battle';
import { smartAction } from './bot';
import { CLASSES, CLASS_IDS, ITEMS, RARITY, RARITY_COLOR, describe, effText, sellPrice, type Cls, type ItemDef, type Tag } from './data';
import { GH, GW, buildStats, canPlace, cellsOf, isBag, shape, starsOf, type Board, type BuildStats, type Placed } from './grid';
import { randomSeedText } from './rng';
import {
  GOAL,
  LIVES,
  LOCKED_ITEMS,
  REROLL_COST,
  STASH_MAX,
  baseHp,
  buy,
  clearRun,
  fight,
  isBossRound,
  isUnlocked,
  loadMeta,
  loadRun,
  move,
  newRun,
  renownFor,
  reroll,
  rotateInPlace,
  runOver,
  saveMeta,
  saveRun,
  score,
  sell,
  toStash,
  type FightOut,
  type RunState,
} from './run';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'class' | 'shop' | 'battle' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };
type Src = { kind: 'board' | 'stash'; uid: number } | { kind: 'shop'; slot: number };

interface Press {
  src: Src;
  id: string;
  x0: number;
  y0: number;
  /** Grab point inside the shape, in cells. */
  gx: number;
  gy: number;
  rot: number;
  pointer: number;
}

interface Drag extends Press {
  ghost: HTMLElement;
  tx: number;
  ty: number;
  ok: boolean;
  zone: 'pack' | 'stash' | 'sell' | null;
  lastX?: number;
  lastY?: number;
}

interface Replay {
  out: FightOut;
  t: number;
  done: boolean;
  shown: boolean;
  ev: number;
  board: Board;
  before: { lives: number; trophies: number; gold: number; round: number };
}

const FAST = new URLSearchParams(location.search).has('fast');
const TAG_COLOR: Record<Tag, string> = {
  weapon: '#7a2e2e',
  armor: '#3d4a5c',
  food: '#3f6b2f',
  gem: '#5b3a7a',
  magic: '#245e70',
  potion: '#7a2f5a',
  trinket: '#6e5a24',
  bag: '#5a3d22',
};
const SPEEDS = [1, 2, 4];

function bar(cls: string, pct: number, text: string): string {
  return `<div class="bar ${cls}"><div class="fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div><span>${text}</span></div>`;
}

const sameCell = (a: [number, number], x: number, y: number): boolean => a[0] === x && a[1] === y;

/** HTML for the cells of one placed shape. */
function shapeCells(p: { id: string; x: number; y: number; rot: number; uid?: number }, c: number, extra: string, kind: string, inner = ''): string {
  const d = ITEMS[p.id];
  const cells = cellsOf(p);
  const cx = cells.reduce((a, q) => a + q[0], 0) / cells.length;
  const cy = cells.reduce((a, q) => a + q[1], 0) / cells.length;
  let iconCell = cells[0];
  let bestD = 1e9;
  for (const q of cells) {
    const dd = (q[0] + 0.5 - cx - 0.5) ** 2 + (q[1] + 0.5 - cy - 0.5) ** 2;
    if (dd < bestD) [bestD, iconCell] = [dd, q];
  }
  const bag = isBag(p.id);
  const bg = bag ? TAG_COLOR.bag : TAG_COLOR[d.tags[0]];
  const rc = RARITY_COLOR[d.rarity];
  return cells
    .map(([x, y]) => {
      const has = (dx: number, dy: number): boolean => cells.some((q) => sameCell(q, x + dx, y + dy));
      const bw = (o: boolean): string => (o ? '0' : bag ? '2px' : '2px');
      const st = `left:${x * c}px;top:${y * c}px;width:${c}px;height:${c}px;background:${bg};border-color:${bag ? '#a47148' : rc};border-width:${bw(has(0, -1))} ${bw(has(1, 0))} ${bw(has(0, 1))} ${bw(has(-1, 0))}`;
      const isIcon = sameCell(iconCell, x, y);
      const icon = bag ? (sameCell(cells[0], x, y) ? `<span class="bic">${d.icon}</span>` : '') : isIcon ? `<span class="ic">${d.icon}</span>${inner}` : '';
      return `<div class="${bag ? 'bcell' : 'icell'} ${extra}" data-kind="${kind}" ${p.uid !== undefined ? `data-uid="${p.uid}"` : ''} style="${st}">${icon}</div>`;
    })
    .join('');
}

function bounds(b: Board): { x0: number; y0: number; x1: number; y1: number } {
  const cs = b.bags.flatMap((p) => cellsOf(p));
  if (!cs.length) return { x0: 0, y0: 0, x1: GW - 1, y1: GH - 1 };
  return { x0: Math.min(...cs.map((q) => q[0])), y0: Math.min(...cs.map((q) => q[1])), x1: Math.max(...cs.map((q) => q[0])), y1: Math.max(...cs.map((q) => q[1])) };
}

/** Mini shape preview for shop cards. */
function miniShape(id: string, c: number): string {
  const s = shape(id, 0);
  return `<div class="mini" style="width:${s.w * c}px;height:${s.h * c}px">${s.cells.map(([x, y]) => `<i style="left:${x * c}px;top:${y * c}px;width:${c - 1}px;height:${c - 1}px"></i>`).join('')}</div>`;
}

function rates(st: BuildStats): { dps: number; hps: number; bps: number; pps: number } {
  let dps = 0;
  let hps = 0;
  let bps = 0;
  let pps = 0;
  for (const it of st.items) {
    if (!it.cd || !it.eff) continue;
    const k = it.uses ? 0 : 1 / it.cd;
    dps += (it.eff.dmg ?? 0) * (1 + (it.eff.crit ?? 0) / 100) * k;
    hps += (it.eff.heal ?? 0) * k;
    bps += (it.eff.block ?? 0) * k;
    pps += (it.eff.poison ?? 0) * k;
  }
  return { dps, hps, bps, pps };
}

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private sel: Src | null = null;
  private press: Press | null = null;
  private drag: Drag | null = null;
  private lastTap = { key: '', t: 0 };
  private replay: Replay | null = null;
  private raf = 0;
  private last = 0;
  private endInfo: { win: boolean; score: number; renown: number; run: RunState } | null = null;
  private c = 50;
  /** Animate the shop cards on the next render (new round or reroll). */
  private fresh = true;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    setMuted(this.meta.muted);
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('contextmenu', (e) => this.onContext(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => this.cancelDrag());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => {
      if (this.screen !== 'battle') this.render();
    });
    if (new URLSearchParams(location.search).has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Rendering ----------

  private cellSize(): number {
    const w = Math.min(window.innerWidth, 1100);
    return w >= 900 ? 56 : Math.max(30, Math.min(52, Math.floor((w - 24) / GW)));
  }

  private render(): void {
    this.c = this.cellSize();
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'class':
        body = this.classView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'battle':
        body = this.battleView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && (this.screen === 'shop' || this.screen === 'battle') ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'battle') this.paintBattle();
    this.fresh = false;
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    // During a replay, show the values from before the fight.
    const v = this.screen === 'battle' && this.replay && !this.replay.shown ? this.replay.before : { lives: r.lives, trophies: r.trophies, gold: r.gold, round: this.replay?.out.round ?? r.round };
    return `<header class="top">
      <span class="hearts" title="Lives">❤️ ${v.lives}/${LIVES}</span>
      <span title="Trophies">🏆 ${v.trophies}/${GOAL}</span>
      <span>Round ${v.round}</span>
      <span class="gold" title="Gold">💰 ${v.gold}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const unl = [...CLASS_IDS.filter((c) => CLASSES[c].locked).map((c) => ({ id: c as string, icon: CLASSES[c].icon, name: CLASSES[c].name, kind: 'Class', text: CLASSES[c].text, cost: CLASSES[c].locked! })), ...LOCKED_ITEMS.map((id) => ({ id, icon: ITEMS[id].icon, name: ITEMS[id].name, kind: ITEMS[id].cls ? `${CLASSES[ITEMS[id].cls!].name} item` : 'Item', text: describe(ITEMS[id]).join(' '), cost: ITEMS[id].locked! }))]
      .map((u) => {
        const own = m.unlocked.includes(u.id);
        return `<div class="arm ${own ? 'own' : ''}"><span class="big">${u.icon}</span><span><b>${u.name}</b><small>${u.kind}: ${u.text}</small></span>
        ${own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.renown >= u.cost ? '' : 'disabled'}>🎖️ ${u.cost}</button>`}</div>`;
      })
      .join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo">🎒</div>
      <h1>Pack Rat</h1>
      <p class="sub">Pack odd-shaped loot into your backpack. Put items on each other's stars. Your pack fights by itself. Win ${GOAL} fights before you lose ${LIVES} lives.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (round ${r.round}, 🏆 ${r.trophies}, ❤️ ${r.lives})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best trophies ${m.bestTrophies} · Best score ${m.best}</p>
      <h2>Unlocks <small>🎖️ ${m.renown} renown</small></h2>
      <p class="sub">Each run gives renown: 1 per trophy, +5 for a full win.</p>
      <div class="armory">${unl}</div>
    </div>`;
  }

  private classView(): string {
    const cards = CLASS_IDS.map((id) => {
      const c = CLASSES[id];
      const ok = isUnlocked(id, this.meta.unlocked);
      return `<button class="cls-card" data-act="cls" data-id="${id}" ${ok ? '' : 'disabled'}>
        <span class="huge">${c.icon}</span><b>${c.name}</b><small>${c.text}</small>
        <span class="start">${c.start.map((s) => ITEMS[s].icon).join(' ')}</span>
        ${ok ? '' : `<small class="warn">🔒 Unlock for 🎖️ ${c.locked}</small>`}
      </button>`;
    }).join('');
    return `<div class="title"><h1>Choose a class</h1><p class="sub">Each class has its own items in the shop. Neutral items show up for all.</p><div class="cls-list">${cards}</div><button data-act="title">Back</button></div>`;
  }

  private packHtml(board: Board, c: number, o: { id: string; interactive: boolean; crop?: boolean; side?: number; stats?: BuildStats }): string {
    const bd = o.crop ? bounds(board) : { x0: 0, y0: 0, x1: GW - 1, y1: GH - 1 };
    const sh = (p: Placed): Placed => ({ ...p, x: p.x - bd.x0, y: p.y - bd.y0 });
    const w = (bd.x1 - bd.x0 + 1) * c;
    const h = (bd.y1 - bd.y0 + 1) * c;
    const st = o.stats ?? buildStats(board);
    const kind = o.interactive ? 'board' : 'view';
    const selUid = this.sel && this.sel.kind === 'board' ? this.sel.uid : -1;
    let html = board.bags.map((p) => shapeCells(sh(p), c, '', kind)).join('');
    html += board.items
      .map((p, i) => {
        const s = st.items.find((q) => q.uid === p.uid);
        const buffs = s && s.from.length ? `<b class="buff">★${s.from.length > 1 ? s.from.length : ''}</b>` : '';
        const cd = o.side !== undefined && ITEMS[p.id].cd ? `<i class="cdbar" data-cd="${o.side}-${i}"></i>` : '';
        return shapeCells(sh(p), c, `${p.uid === selUid ? 'sel' : ''} ${o.side !== undefined ? `it-${o.side}-${i}` : ''}`, kind, buffs + cd);
      })
      .join('');
    if (o.interactive && selUid >= 0) {
      html += st.stars
        .filter((s) => s.uid === selUid && s.x >= 0 && s.y >= 0 && s.x < GW && s.y < GH)
        .map((s) => `<div class="star ${s.hit >= 0 ? 'on' : ''}" style="left:${s.x * c}px;top:${s.y * c}px;width:${c}px;height:${c}px">★</div>`)
        .join('');
    }
    return `<div class="pack ${o.interactive ? 'live' : ''}" id="${o.id}" style="width:${w}px;height:${h}px;--c:${c}px">${html}<div class="preview" id="${o.id}-pv"></div></div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const c = this.c;
    const st = buildStats(r.board);
    const rt = rates(st);
    const hp = baseHp(r.round) + st.start.hp;
    const stash = r.stash.map((s) => `<div class="stash-it ${this.sel?.kind === 'stash' && this.sel.uid === s.uid ? 'sel' : ''}" data-kind="stash" data-uid="${s.uid}" style="border-color:${RARITY_COLOR[ITEMS[s.id].rarity]}" title="${ITEMS[s.id].name}">${ITEMS[s.id].icon}</div>`).join('');
    const cards = r.shop
      .map((s, i) => {
        const d = ITEMS[s.id];
        if (s.sold) return `<div class="card sold"><span class="dim">Sold</span></div>`;
        const sel = this.sel?.kind === 'shop' && this.sel.slot === i;
        return `<div class="card ${sel ? 'sel' : ''} ${s.locked ? 'locked' : ''}" data-kind="shop" data-slot="${i}" style="--rc:${RARITY_COLOR[d.rarity]}">
          <div class="card-top">${miniShape(d.id, 9)}<span class="cic">${d.icon}</span></div>
          <b>${d.name}</b>
          <small class="rar">${RARITY[d.rarity]} ${d.tags[0]}</small>
          <div class="card-btns"><button class="buy" data-act="buy" data-slot="${i}" ${r.gold >= d.price ? '' : 'disabled'}>💰${d.price}</button><button class="lock" data-act="lock" data-slot="${i}" title="Lock: keep for the next round">${s.locked ? '🔒' : '🔓'}</button></div>
        </div>`;
      })
      .join('');
    const boss = isBossRound(r) ? '<p class="warn boss">👑 Final fight: the Rat King waits. Win it to win the run.</p>' : '';
    return `<div class="shop-layout">
      <section class="pack-col" style="width:${GW * c}px">
        <div class="pack-wrap">${this.packHtml(r.board, c, { id: 'pack', interactive: true, stats: st })}</div>
        <div class="stash" id="stash" data-zone="stash"><span class="lbl">Stash ${r.stash.length}/${STASH_MAX}</span>${stash || '<span class="dim small">Drop items here to keep them out of the fight.</span>'}</div>
        <div class="info" id="info">${this.infoView(st)}</div>
      </section>
      <section class="shop-col" data-zone="sell">
        <div class="shop-head"><h3>Shop</h3><span class="dim small">Drag here to sell</span></div>
        <div class="cards ${this.fresh ? 'fresh' : ''}">${cards}</div>
        <div class="shop-btns">
          <button data-act="reroll" ${r.gold >= REROLL_COST ? '' : 'disabled'}>🎲 Reroll 💰${REROLL_COST}</button>
          <button data-act="rotate" ${this.sel && this.sel.kind === 'board' ? '' : 'disabled'} title="Rotate the selected item (R)">↻ Rotate</button>
        </div>
        <div class="summary">
          <span title="Max HP">❤️ ${hp}</span><span title="Damage per second">⚔️ ${f1(rt.dps)}/s</span><span title="Heal per second">💚 ${f1(rt.hps)}/s</span>
          <span title="Block per second">🛡️ ${f1(rt.bps)}/s${st.start.block ? ` +${st.start.block}` : ''}</span><span title="Poison per second">☠️ ${f1(rt.pps)}/s</span>
          <span title="Star links">★ ${st.links.length}</span>
        </div>
        ${boss}
        <button class="primary fight-btn" data-act="fight">⚔️ Fight round ${r.round}</button>
      </section>
    </div>`;
  }

  private infoView(st: BuildStats): string {
    const s = this.sel;
    if (!s) return '<p class="dim small">Tap an item to see what it does. Drag items into the backpack. Double tap or right-click (or press R) to rotate. Gold stars show buffs.</p>';
    const r = this.run!;
    let d: ItemDef;
    let live = '';
    let btns = '';
    if (s.kind === 'shop') {
      const slot = r.shop[s.slot];
      if (!slot || slot.sold) return '';
      d = ITEMS[slot.id];
      btns = `<button data-act="buy" data-slot="${s.slot}" ${r.gold >= d.price ? '' : 'disabled'}>Buy 💰${d.price}</button>`;
    } else {
      const id = s.kind === 'stash' ? r.stash.find((q) => q.uid === s.uid)?.id : (r.board.items.find((q) => q.uid === s.uid) ?? r.board.bags.find((q) => q.uid === s.uid))?.id;
      if (!id) return '';
      d = ITEMS[id];
      const it = st.items.find((q) => q.uid === s.uid);
      if (it && it.eff && it.cd) live = `<p class="good small">Now: every ${it.cd}s: ${effText(it.eff)}.${it.from.length ? ` Buffed by ${it.from.map((u) => ITEMS[r.board.items.find((q) => q.uid === u)!.id].icon).join(' ')}.` : ''}</p>`;
      else if (it && it.lowHp) live = `<p class="good small">Now: ${effText(it.lowHp)}.</p>`;
      const canSell = !(isBag(id) && r.board.bags.length === 1 && s.kind === 'board');
      btns = `${s.kind === 'board' ? '<button data-act="rotate">↻ Rotate</button>' : ''}${s.kind === 'board' && !isBag(id) ? '<button data-act="stash">To stash</button>' : ''}<button data-act="sell" ${canSell ? '' : 'disabled'}>Sell 💰${sellPrice(d)}</button>`;
    }
    return `<div class="info-head"><span class="big">${d.icon}</span><span><b>${d.name}</b> <small style="color:${RARITY_COLOR[d.rarity]}">${RARITY[d.rarity]}</small><br><small class="dim">${d.tags.join(', ')}${d.cls ? ` · ${CLASSES[d.cls].name}` : ''}</small></span></div>
      <ul>${describe(d).map((l) => `<li>${l}</li>`).join('')}</ul>${live}<div class="info-btns">${btns}</div>`;
  }

  // ---------- Battle ----------

  private battleView(): string {
    const rp = this.replay!;
    const out = rp.out;
    const c = Math.min(this.c, window.innerWidth >= 900 ? 40 : Math.floor((window.innerWidth - 40) / GW), 40);
    const side = (i: 0 | 1): string => {
      const name = i === 0 ? 'You' : out.foe.name;
      const icon = i === 0 ? '🐀' : out.foe.icon;
      const cls = CLASSES[(i === 0 ? this.run!.cls : out.foe.cls) as Cls];
      const board = i === 0 ? rp.board : out.foe.board;
      return `<div class="fighter f${i}" id="f${i}">
        <div class="f-head"><span class="big">${icon}</span><span><b>${name}</b><br><small class="dim">${cls.icon} ${cls.name}</small></span><span class="grow"></span><span class="badges" id="bd${i}"></span></div>
        <div id="hp${i}"></div><div id="st${i}"></div>
        <div class="pack-wrap">${this.packHtml(board, c, { id: `bp${i}`, interactive: false, crop: true, side: i, stats: undefined })}</div>
        <div class="floats" id="fl${i}"></div>
      </div>`;
    };
    return `<div class="battle">
      ${side(0)}
      <div class="vs"><b>${out.boss ? '👑 Final fight' : `Round ${out.round}`}</b><span id="clock">0.0s</span>
        <div class="bctrl"><button data-act="speed">${this.meta.speed}×</button><button data-act="skip">Skip ⏭</button></div>
        <div id="result"></div>
      </div>
      ${side(1)}
    </div>`;
  }

  private startBattle(): void {
    const r = this.run!;
    const board = JSON.parse(JSON.stringify(r.board)) as Board;
    const before = { lives: r.lives, trophies: r.trophies, gold: r.gold, round: r.round };
    const out = fight(r, true);
    saveRun(r);
    this.sel = null;
    this.replay = { out, t: 0, done: false, shown: false, ev: 0, board, before };
    this.screen = 'battle';
    sfx.fight();
    this.render();
    if (FAST) this.finishReplay();
    else this.loop();
  }

  private loop(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const tick = (now: number): void => {
      const rp = this.replay;
      if (!rp || this.screen !== 'battle') return;
      const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
      if (!this.modal && !rp.done) {
        rp.t += dt * this.meta.speed;
        const end = rp.out.result.ticks * DT;
        if (rp.t >= end) {
          rp.t = end;
          rp.done = true;
        }
        this.paintBattle();
      }
      if (rp.done && !rp.shown) {
        rp.shown = true;
        this.showResult();
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private finishReplay(): void {
    const rp = this.replay;
    if (!rp) return;
    rp.t = rp.out.result.ticks * DT;
    rp.ev = rp.out.result.events.length;
    rp.done = true;
    this.paintBattle(true);
    if (!rp.shown) {
      rp.shown = true;
      this.showResult();
    }
  }

  private paintBattle(silent = false): void {
    const rp = this.replay;
    if (!rp) return;
    const res: BattleResult = rp.out.result;
    const fi = Math.max(0, Math.min(res.frames.length - 1, Math.floor(rp.t / DT + 1e-6)));
    const fr = res.frames[fi];
    for (const i of [0, 1] as const) {
      const hp = this.root.querySelector<HTMLElement>(`#hp${i}`);
      if (!hp) return;
      const max = res.maxHp[i];
      const blk = fr.block[i];
      hp.innerHTML = `${bar('hpb', (fr.hp[i] / max) * 100, `❤️ ${Math.max(0, fr.hp[i])} / ${max}${blk ? ` <em>🛡️${blk}</em>` : ''}`)}`;
      this.root.querySelector<HTMLElement>(`#st${i}`)!.innerHTML = bar('stb', (fr.stam[i] / res.maxStam[i]) * 100, `⚡ ${Math.floor(fr.stam[i])}`);
      const badges: string[] = [];
      if (fr.poison[i]) badges.push(`<span class="pz">☠️${fr.poison[i]}</span>`);
      this.root.querySelector<HTMLElement>(`#bd${i}`)!.innerHTML = badges.join('');
      fr.cd[i].forEach((p, k) => {
        const el = this.root.querySelector<HTMLElement>(`[data-cd="${i}-${k}"]`);
        if (el) el.style.width = `${p * 100}%`;
      });
    }
    const clock = this.root.querySelector<HTMLElement>('#clock');
    if (clock) clock.innerHTML = `${rp.t.toFixed(1)}s${rp.t > FATIGUE_AT ? ' <span class="warn">fatigue</span>' : ''}`;
    // New events since the last paint.
    const evs = res.events;
    let n = 0;
    while (rp.ev < evs.length && evs[rp.ev].t <= fi) {
      if (!silent && n < 6) this.showEvent(evs[rp.ev]);
      rp.ev++;
      n++;
    }
  }

  private showEvent(e: BEvent): void {
    const map: Record<string, [string, string]> = {
      dmg: ['-', 'dmg'],
      thorns: ['-', 'dmg'],
      ptick: ['☠️-', 'psn'],
      fatigue: ['-', 'fat'],
      block: ['🛡️+', 'blk'],
      heal: ['+', 'heal'],
      regen: ['+', 'heal'],
      poison: ['☠️+', 'psn'],
      stam: ['⚡+', 'stm'],
      stun: ['💫', 'stn'],
    };
    const [pre, cls] = map[e.kind];
    if (e.kind === 'heal' && !e.val) return;
    const val = e.kind === 'stun' ? `${e.val}s` : String(e.val) + (e.crit ? '!' : '');
    const text = e.kind === 'dmg' && e.val === 0 && e.blocked ? `🛡️${e.blocked}` : pre + val;
    const fl = this.root.querySelector<HTMLElement>(`#fl${e.side}`);
    if (fl) {
      const d = document.createElement('div');
      d.className = `fnum ${cls} ${e.crit ? 'crit' : ''}`;
      d.textContent = text;
      d.style.left = `${15 + Math.random() * 70}%`;
      d.style.top = `${40 + Math.random() * 35}%`;
      fl.appendChild(d);
      setTimeout(() => d.remove(), 900);
    }
    if (e.src >= 0 && e.item >= 0) {
      for (const el of this.root.querySelectorAll<HTMLElement>(`.it-${e.src}-${e.item}`)) {
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
      }
    }
    if (e.kind === 'dmg' || e.kind === 'thorns') {
      sfx.hit(e.val >= 10);
      if (e.val >= 10 || e.crit) {
        const f = this.root.querySelector<HTMLElement>(`#f${e.side}`);
        f?.classList.remove('shake');
        void f?.offsetWidth;
        f?.classList.add('shake');
      }
    } else if (e.kind === 'block') sfx.block();
    else if (e.kind === 'heal') sfx.heal();
    else if (e.kind === 'poison') sfx.poison();
    else if (e.kind === 'stun') sfx.stun();
  }

  private showResult(): void {
    const rp = this.replay!;
    const win = rp.out.result.win;
    const r = this.run!;
    const over = runOver(r);
    win ? sfx.win() : sfx.lose();
    const top = this.root.querySelector<HTMLElement>('header.top');
    if (top) top.outerHTML = this.topBar();
    const el = this.root.querySelector<HTMLElement>('#result');
    if (!el) return;
    el.innerHTML = `<div class="res ${win ? 'good' : 'bad'}">${win ? '🏆 Victory!' : '💔 Defeat'}</div>
      <p class="small">${win ? `Trophy ${r.trophies}/${GOAL}.` : `You lose a life. ${r.lives} left.`} +💰${rp.out.gold} for the next round.</p>
      <button class="primary" data-act="next">${over ? 'See results' : 'Continue ▶'}</button>`;
    this.root.querySelector('.bctrl')?.remove();
  }

  // ---------- End ----------

  private endRun(win: boolean): void {
    const r = this.run!;
    const sc = score(r);
    const rn = renownFor(r);
    const m = this.meta;
    m.renown += rn;
    if (win) m.wins++;
    m.best = Math.max(m.best, sc);
    m.bestTrophies = Math.max(m.bestTrophies, r.trophies);
    saveMeta(m);
    clearRun();
    this.endInfo = { win, score: sc, renown: rn, run: r };
    this.run = null;
    this.replay = null;
    this.screen = 'end';
    this.render();
  }

  private endView(): string {
    const e = this.endInfo!;
    const r = e.run;
    const hist = r.history.map((h) => `<span class="chip ${h === 'W' ? 'good' : 'bad'}">${h === 'W' ? '🏆' : '💔'}</span>`).join('');
    return `<div class="title end">
      <div class="logo">${e.win ? '👑' : '🪦'}</div>
      <h1>${e.win ? 'You are the Pack Champion!' : 'Out of lives'}</h1>
      <p class="sub">${CLASSES[r.cls].icon} ${CLASSES[r.cls].name} · ${r.trophies} trophies · ${r.lives} lives left · ${r.history.length} rounds</p>
      <div class="hist">${hist}</div>
      <p class="score">Score <b>${e.score}</b> · 🎖️ +${e.renown} renown</p>
      <div class="pack-wrap">${this.packHtml(r.board, Math.min(40, this.c), { id: 'endpack', interactive: false, crop: true })}</div>
      <button class="primary" data-act="new">▶ New run</button>
      <button data-act="title">Title screen</button>
    </div>`;
  }

  // ---------- Modal ----------

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Goal:</b> win ${GOAL} fights 🏆 before you lose ${LIVES} lives ❤️. A lost fight costs one life. The 10th win is against the Rat King.</li>
          <li><b>Shop:</b> buy items with gold. Drag a card into your backpack, or press its price to buy and auto-place it. 🎲 Reroll costs ${REROLL_COST} gold. 🔒 Lock keeps a card for the next round. Drag an item onto the shop to sell it for half.</li>
          <li><b>Backpack:</b> items only work on bag cells. Bags (👝 💼 🎽 …) add cells. Move a bag and its items move with it.</li>
          <li><b>Rotate:</b> double tap or right-click an item, or press <kbd>R</kbd> (also while you drag).</li>
          <li><b>Stars ★:</b> many items have star cells next to them. An item that fits the tag and sits on a star gets the buff. A gold ★ on an item shows it has buffs.</li>
          <li><b>Fights</b> run by themselves. Each item acts when its cooldown fills. Weapons cost ⚡ stamina (magic items do not). Block 🛡️ soaks damage. Poison ☠️ deals its stacks every 2 s and ignores block. Each heal removes 1 poison.</li>
          <li>After ${20} s both sides take growing fatigue damage, so fights end.</li>
          <li><b>Stash:</b> items in the stash do not fight. Win runs to earn renown 🎖️ and unlock classes and items.</li>
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

  // ---------- Input ----------

  private srcKey(s: Src): string {
    return s.kind === 'shop' ? `shop${s.slot}` : `${s.kind}${s.uid}`;
  }

  private srcId(s: Src): string | null {
    const r = this.run;
    if (!r) return null;
    if (s.kind === 'shop') return r.shop[s.slot] && !r.shop[s.slot].sold ? r.shop[s.slot].id : null;
    if (s.kind === 'stash') return r.stash.find((q) => q.uid === s.uid)?.id ?? null;
    return (r.board.items.find((q) => q.uid === s.uid) ?? r.board.bags.find((q) => q.uid === s.uid))?.id ?? null;
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if (this.screen !== 'shop' || this.modal) return;
    if (this.drag) {
      // A second finger rotates the dragged item.
      if (e.pointerType === 'touch') this.rotateDrag();
      return;
    }
    if (e.button === 2) return;
    const t = e.target as HTMLElement;
    if (t.closest('button')) return;
    const el = t.closest<HTMLElement>('[data-kind]');
    if (!el) return;
    const k = el.dataset.kind;
    let src: Src;
    if (k === 'shop') src = { kind: 'shop', slot: Number(el.dataset.slot) };
    else if (k === 'board' || k === 'stash') src = { kind: k, uid: Number(el.dataset.uid) };
    else return;
    const id = this.srcId(src);
    if (!id) return;
    let gx = 0;
    let gy = 0;
    let rot = 0;
    if (src.kind === 'board') {
      const r = this.run!;
      const p = (r.board.items.find((q) => q.uid === (src as { uid: number }).uid) ?? r.board.bags.find((q) => q.uid === (src as { uid: number }).uid))!;
      const pack = this.root.querySelector<HTMLElement>('#pack')!.getBoundingClientRect();
      gx = (e.clientX - pack.left) / this.c - p.x;
      gy = (e.clientY - pack.top) / this.c - p.y;
      rot = p.rot;
    } else {
      const s = shape(id, 0);
      gx = s.w / 2;
      gy = s.h / 2;
    }
    this.press = { src, id, x0: e.clientX, y0: e.clientY, gx, gy, rot, pointer: e.pointerId };
    e.preventDefault();
  }

  private onMove(e: PointerEvent): void {
    const p = this.press;
    if (!p || p.pointer !== e.pointerId) return;
    if (!this.drag) {
      if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 7) return;
      this.startDrag(p);
    }
    this.moveDrag(e.clientX, e.clientY);
  }

  private startDrag(p: Press): void {
    const ghost = document.createElement('div');
    ghost.className = 'ghost';
    document.body.appendChild(ghost);
    this.drag = { ...p, ghost, tx: 0, ty: 0, ok: false, zone: null };
    this.sel = p.src;
    if (p.src.kind === 'board') {
      const uid = p.src.uid;
      this.root.querySelectorAll<HTMLElement>(`[data-uid="${uid}"]`).forEach((el) => el.classList.add('lifted'));
    }
    this.drawGhost();
    sfx.pick();
  }

  private drawGhost(): void {
    const d = this.drag!;
    d.ghost.innerHTML = shapeCells({ id: d.id, x: 0, y: 0, rot: d.rot }, this.c, '', 'ghost');
    const s = shape(d.id, d.rot);
    d.ghost.style.width = `${s.w * this.c}px`;
    d.ghost.style.height = `${s.h * this.c}px`;
  }

  private rotateDrag(): void {
    const d = this.drag;
    if (!d) return;
    const s = shape(d.id, d.rot);
    // Keep the grab point on the same cell: rotate it clockwise inside the box.
    const ngx = s.h - d.gy;
    const ngy = d.gx;
    d.rot = (d.rot + 1) & 3;
    d.gx = ngx;
    d.gy = ngy;
    this.drawGhost();
    sfx.rotate();
    this.moveDrag(d.lastX ?? d.x0, d.lastY ?? d.y0);
  }

  private moveDrag(x: number, y: number): void {
    const d = this.drag!;
    d.lastX = x;
    d.lastY = y;
    const c = this.c;
    d.ghost.style.left = `${x - d.gx * c}px`;
    d.ghost.style.top = `${y - d.gy * c}px`;
    const packEl = this.root.querySelector<HTMLElement>('#pack');
    const pv = this.root.querySelector<HTMLElement>('#pack-pv');
    if (!packEl || !pv) return;
    const pr = packEl.getBoundingClientRect();
    const tx = Math.round((x - d.gx * c - pr.left) / c);
    const ty = Math.round((y - d.gy * c - pr.top) / c);
    const inPack = x >= pr.left - c && x <= pr.right + c && y >= pr.top - c && y <= pr.bottom + c;
    const under = document.elementsFromPoint(x, y);
    const zoneEl = under.map((el) => (el as HTMLElement).closest?.('[data-zone]') as HTMLElement | null).find((z) => z);
    d.zone = inPack ? 'pack' : ((zoneEl?.dataset.zone as 'stash' | 'sell' | undefined) ?? null);
    this.root.querySelectorAll('.drop-on').forEach((el) => el.classList.remove('drop-on'));
    if (d.zone === 'stash' || d.zone === 'sell') zoneEl?.classList.add('drop-on');
    if (d.zone !== 'pack') {
      pv.innerHTML = '';
      d.ok = false;
      return;
    }
    const r = this.run!;
    const ignore = d.src.kind === 'shop' ? -1 : d.src.uid;
    d.ok = canPlace(r.board, d.id, d.rot, tx, ty, ignore);
    d.tx = tx;
    d.ty = ty;
    const cells = cellsOf({ id: d.id, x: tx, y: ty, rot: d.rot });
    let html = cells.map(([cx, cy]) => `<i class="${d.ok ? 'ok' : 'no'}" style="left:${cx * c}px;top:${cy * c}px;width:${c}px;height:${c}px"></i>`).join('');
    if (ITEMS[d.id].star) {
      const im = new Map<string, string>();
      for (const p of r.board.items) if (p.uid !== ignore) for (const [cx, cy] of cellsOf(p)) im.set(`${cx},${cy}`, p.id);
      const tag = ITEMS[d.id].star!.tag;
      html += starsOf({ uid: -1, id: d.id, x: tx, y: ty, rot: d.rot })
        .filter(([sx, sy]) => sx >= 0 && sy >= 0 && sx < GW && sy < GH)
        .map(([sx, sy]) => {
          const tid = im.get(`${sx},${sy}`);
          const hit = !!tid && (tag === 'any' || ITEMS[tid].tags.includes(tag)) && !isBag(tid);
          return `<b class="pstar ${hit ? 'on' : ''}" style="left:${sx * c}px;top:${sy * c}px;width:${c}px;height:${c}px">★</b>`;
        })
        .join('');
    }
    pv.innerHTML = html;
  }

  private cancelDrag(): void {
    this.drag?.ghost.remove();
    this.drag = null;
    this.press = null;
    if (this.screen === 'shop') this.render();
  }

  private onUp(e: PointerEvent): void {
    const p = this.press;
    if (!p || p.pointer !== e.pointerId) return;
    const d = this.drag;
    this.press = null;
    if (!d) {
      this.tap(p.src);
      return;
    }
    d.ghost.remove();
    this.drag = null;
    this.drop(d);
  }

  private drop(d: Drag): void {
    const r = this.run!;
    const src = d.src;
    let ok = false;
    if (d.zone === 'pack' && d.ok) {
      if (src.kind === 'shop') {
        const got = buy(r, src.slot, 'stash');
        if (got) {
          ok = move(r, got.uid, d.tx, d.ty, d.rot);
          this.sel = { kind: ok ? 'board' : 'stash', uid: got.uid };
          sfx.buy();
        } else this.deny('Not enough gold.');
      } else {
        ok = move(r, src.uid, d.tx, d.ty, d.rot);
        if (ok) this.sel = { kind: 'board', uid: src.uid };
      }
      if (ok) {
        const st = buildStats(r.board);
        st.links.some((l) => l.from === (this.sel as { uid: number }).uid || l.to === (this.sel as { uid: number }).uid) ? sfx.star() : sfx.place();
      }
    } else if (d.zone === 'stash') {
      if (src.kind === 'shop') {
        if (buy(r, src.slot, 'stash')) sfx.buy();
        else this.deny(r.stash.length >= STASH_MAX ? 'The stash is full.' : 'Not enough gold.');
      } else if (src.kind === 'board') {
        if (isBag(d.id)) this.deny('Bags cannot go to the stash. Sell them instead.');
        else if (toStash(r, src.uid)) sfx.place();
        else this.deny('The stash is full.');
      }
    } else if (d.zone === 'sell' && src.kind !== 'shop') {
      this.sellSel(src.uid);
    } else if (d.zone === 'pack') sfx.deny();
    saveRun(r);
    this.render();
  }

  private deny(msg: string): void {
    sfx.deny();
    this.toast(msg);
  }

  private sellSel(uid: number): void {
    const r = this.run!;
    const g = sell(r, uid);
    if (g) {
      sfx.sell();
      this.toast(`Sold for 💰${g}`);
      this.sel = null;
    } else this.deny('You need at least one bag.');
  }

  private tap(src: Src): void {
    const key = this.srcKey(src);
    const now = performance.now();
    const dbl = this.lastTap.key === key && now - this.lastTap.t < 350;
    this.lastTap = { key, t: now };
    if (dbl && src.kind === 'board') {
      this.rotateSel(src.uid);
      return;
    }
    this.sel = src;
    sfx.pick();
    this.render();
  }

  private rotateSel(uid: number): void {
    const r = this.run!;
    if (rotateInPlace(r, uid)) {
      sfx.rotate();
      saveRun(r);
    } else this.deny('No room to rotate here.');
    this.sel = { kind: 'board', uid };
    this.render();
  }

  private onContext(e: MouseEvent): void {
    if (this.screen !== 'shop') return;
    e.preventDefault();
    if (this.drag) {
      this.rotateDrag();
      return;
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-kind="board"]');
    if (el) this.rotateSel(Number(el.dataset.uid));
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen === 'battle') {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (this.replay?.done) this.action('next', {});
        else this.action('skip', {});
      }
      return;
    }
    if (this.screen !== 'shop') return;
    const k = e.key.toLowerCase();
    if (k === 'r') {
      if (this.drag) this.rotateDrag();
      else if (this.sel?.kind === 'board') this.rotateSel(this.sel.uid);
    } else if (k === 'escape') {
      this.sel = null;
      this.render();
    } else if (k === 'f' || k === 'enter') this.action('fight', {});
    else if (k === 'e' && this.run) this.action('reroll', {});
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
        this.meta.muted = toggleMute();
        saveMeta(this.meta);
        break;
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
        if (r) {
          this.endRun(false);
          return;
        }
        break;
      case 'title':
        this.modal = null;
        this.screen = 'title';
        cancelAnimationFrame(this.raf);
        // A finished battle already moved the run on; the shop comes next on continue.
        this.replay = null;
        break;
      case 'new':
        this.screen = 'class';
        break;
      case 'continue':
        if (r) this.screen = 'shop';
        break;
      case 'cls': {
        const cls = d.id as Cls;
        if (!isUnlocked(cls, this.meta.unlocked)) return;
        this.run = newRun(randomSeedText(), cls, this.meta);
        this.meta.runs++;
        saveMeta(this.meta);
        saveRun(this.run);
        this.sel = null;
        this.screen = 'shop';
        sfx.buy();
        break;
      }
      case 'unlock': {
        const id = d.id!;
        const cost = ITEMS[id]?.locked ?? CLASSES[id as Cls]?.locked ?? 0;
        if (this.meta.renown < cost || this.meta.unlocked.includes(id)) return;
        this.meta.renown -= cost;
        this.meta.unlocked.push(id);
        saveMeta(this.meta);
        sfx.buy();
        break;
      }
      case 'buy': {
        if (!r) return;
        const slot = Number(d.slot);
        const got = buy(r, slot, 'best');
        if (!got) {
          this.deny(r.gold < ITEMS[r.shop[slot].id].price ? 'Not enough gold.' : 'The stash is full.');
          return;
        }
        const placed = r.board.items.some((q) => q.uid === got.uid) || r.board.bags.some((q) => q.uid === got.uid);
        this.sel = { kind: placed ? 'board' : 'stash', uid: got.uid };
        sfx.buy();
        if (!placed) this.toast('No room: it went to the stash.');
        saveRun(r);
        break;
      }
      case 'lock':
        if (!r) return;
        r.shop[Number(d.slot)].locked = !r.shop[Number(d.slot)].locked;
        sfx.pick();
        saveRun(r);
        break;
      case 'reroll':
        if (!r || !reroll(r)) return this.deny('Not enough gold.');
        sfx.reroll();
        this.fresh = true;
        if (this.sel?.kind === 'shop') this.sel = null;
        saveRun(r);
        break;
      case 'rotate':
        if (this.sel?.kind === 'board') return this.rotateSel(this.sel.uid);
        return;
      case 'sell':
        if (this.sel && this.sel.kind !== 'shop') this.sellSel(this.sel.uid);
        if (r) saveRun(r);
        break;
      case 'stash':
        if (r && this.sel?.kind === 'board') {
          if (toStash(r, this.sel.uid)) {
            this.sel = { kind: 'stash', uid: this.sel.uid };
            sfx.place();
            saveRun(r);
          } else this.deny('The stash is full.');
        }
        break;
      case 'fight':
        if (!r || this.screen !== 'shop') return;
        this.startBattle();
        return;
      case 'speed': {
        const i = SPEEDS.indexOf(this.meta.speed);
        this.meta.speed = SPEEDS[(i + 1) % SPEEDS.length];
        saveMeta(this.meta);
        const b = this.root.querySelector<HTMLElement>('[data-act="speed"]');
        if (b) b.textContent = `${this.meta.speed}×`;
        return;
      }
      case 'skip':
        this.finishReplay();
        return;
      case 'next': {
        if (!r) return;
        cancelAnimationFrame(this.raf);
        this.replay = null;
        const over = runOver(r);
        if (over) {
          this.endRun(over === 'win');
          return;
        }
        this.screen = 'shop';
        this.fresh = true;
        if (isBossRound(r)) this.toast('👑 The Rat King is next!');
        break;
      }
      default:
        return;
    }
    this.render();
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLElement>(sel);
      el?.click();
      return !!el;
    };
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        cls: this.run?.cls ?? null,
        round: this.run?.round ?? null,
        lives: this.run?.lives ?? null,
        trophies: this.run?.trophies ?? null,
        gold: this.run?.gold ?? null,
        items: this.run?.board.items.map((p) => p.id) ?? null,
        bags: this.run?.board.bags.length ?? null,
        stash: this.run?.stash.map((s) => s.id) ?? null,
        shop: this.run?.shop.map((s) => (s.sold ? '-' : s.id)) ?? null,
        battle: this.replay ? { t: this.replay.t, done: this.replay.done, win: this.replay.out.result.win, foe: this.replay.out.foe.name } : null,
        end: this.endInfo ? { win: this.endInfo.win, score: this.endInfo.score, trophies: this.endInfo.run.trophies } : null,
      }),
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.render();
      },
      renown: (n: number) => {
        this.meta.renown += n;
        saveMeta(this.meta);
        this.render();
      },
      /** One bot action. */
      step: () => {
        if (this.modal) {
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            click('[data-act="continue"]') || click('[data-act="new"]');
            return 'title';
          case 'class':
            click('[data-act="cls"]:not([disabled])');
            return 'class';
          case 'shop': {
            const r = this.run!;
            const a = smartAction(r);
            if (a === 'fight') {
              this.startBattle();
              return 'fight';
            }
            saveRun(r);
            this.render();
            return a;
          }
          case 'battle':
            if (!this.replay?.done) {
              if (!FAST) return 'busy';
              this.finishReplay();
            }
            click('[data-act="next"]');
            return 'next';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}

