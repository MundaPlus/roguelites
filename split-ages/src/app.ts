import { Bot, pickReward } from './bot';
import { FLOORS, FOES, ITEMS, RULES, SLOTS, TILE_NAMES, UNLOCKS, type Age } from './data';
import {
  N,
  actLabel,
  anchorsLeft,
  bossAlive,
  bossIntent,
  cx,
  cy,
  dangerCells,
  dirTo,
  foeAt,
  foeDmg,
  futOptions,
  isAttack,
  nb,
  pastHalf,
  pastOptions,
  turn,
  waveCells,
  type Act,
  type Ev,
  type FloorDef,
  type St,
} from './engine';
import { Rng, hash, randomSeedText } from './rng';
import {
  SHOP_INFO,
  advance,
  buy,
  clearRun,
  echoesFor,
  finishFloor,
  floorLabel,
  loadMeta,
  loadRun,
  modsFor,
  newRun,
  replaces,
  restartFloor,
  saveMeta,
  saveRun,
  score,
  takeItem,
  type FloorResult,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';
import { solve } from './solver';

type Screen = 'title' | 'floor' | 'reward' | 'camp' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: '' | 'abandon' | 'restart' };

const Q = new URLSearchParams(location.search);
/** `?debug&fast` skips animation waits, for bot tests. */
const FAST = Q.has('fast');
const ANIM = FAST ? 0 : 430;

const HERO: Record<Age, string> = { past: '🧑‍🌾', fut: '🧗' };
const AGE_NAME: Record<Age, string> = { past: 'Past', fut: 'Future' };
const TILE_CLASS: Record<string, string> = {
  '.': 'floor',
  ',': 'rubble',
  '#': 'wall',
  c: 'crack',
  s: 'soil',
  S: 'sapling',
  '~': 'water',
  _: 'chasm',
  R: 'roots',
  T: 'tree',
  X: 'exit',
  L: 'lever',
  G: 'gate',
  g: 'gate-open',
  P: 'plate',
  p: 'plate-used',
  '*': 'seed',
  $: 'gem',
};
const TILE_GLYPH: Record<string, string> = { c: '🧱', S: '🌱', R: '🪵', T: '🌳', X: '🌀', L: '🎚️', G: '⛩️', g: '⛩️', P: '🔘', p: '⚪', '*': '🌰', $: '💎' };
const FAM_COLORS = ['#ffb703', '#ff70a6', '#4cc9f0', '#c0f05d', '#ff9f43'];
const ARROW: Record<Act, string> = { U: '↑', D: '↓', L: '←', R: '→', A: '•' };
const KEY_P: Record<string, Act> = { w: 'U', a: 'L', s: 'D', d: 'R', e: 'A', q: 'A' };
const KEY_F: Record<string, Act> = { ArrowUp: 'U', ArrowLeft: 'L', ArrowDown: 'D', ArrowRight: 'R', '/': 'A', '.': 'A', '0': 'A' };

const famBadge = (fam: number): string => (fam >= 0 ? `<b class="fam" style="--fc:${FAM_COLORS[fam % FAM_COLORS.length]}">${'ABCDE'[fam % 5]}</b>` : '');

function hpBar(hp: number, max: number): string {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return `<span class="hp"><span class="hp-fill" style="width:${pct}%"></span><span class="hp-t">❤️ ${Math.max(0, hp)}/${max}</span></span>`;
}

interface Preview {
  st: St;
  ev: Ev[];
  pa: Act;
  fa: Act;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;

  private selP: Act | null = null;
  private selF: Act | null = null;
  private hovP: Act | null = null;
  private hovF: Act | null = null;
  private twin = -1;
  private hist: St[] = [];
  private busy = false;
  private deadEnd = false;
  private deadTimer = 0;
  private result: FloorResult | null = null;
  private end: { victory: boolean; score: number; echoes: number; floor: number } | null = null;
  private actors: Record<Age, Map<string, HTMLElement>> = { past: new Map(), fut: new Map() };
  private fx: HTMLElement;
  private bot = new Bot('smart', new Rng(hash('debug-bot', Date.now())));

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    this.fx = document.createElement('div');
    this.fx.className = 'fx';
    document.body.appendChild(this.fx);
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointermove', (e) => this.onHover(e));
    root.addEventListener('pointerleave', () => this.clearHover());
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (Q.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Helpers ----------

  private get def(): FloorDef {
    return this.run!.def!;
  }

  private get st(): St {
    return this.run!.st!;
  }

  private toast(msg: string): void {
    this.toastEl.innerHTML = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private save(): void {
    if (this.run) saveRun(this.run);
  }

  // ---------- Screens ----------

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
      case 'camp':
        body = this.campView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? `<header class="top" id="top">${this.topBar()}</header>` : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main><div id="modal-root">${this.modal ? this.modalView() : ''}</div>`;
    this.actors = { past: new Map(), fut: new Map() };
    if (this.screen === 'floor') this.paint();
  }

  private renderModal(): void {
    const m = this.root.querySelector<HTMLElement>('#modal-root');
    if (m) m.innerHTML = this.modal ? this.modalView() : '';
  }

  private topBar(): string {
    const r = this.run!;
    const hp = r.st && this.screen === 'floor' ? r.st.hp : r.hp;
    const label = floorLabel(r.floor);
    return `${hpBar(hp, r.maxHp)}
      <span>💰 ${r.gold + (r.st && this.screen === 'floor' ? r.st.gold : 0)}</span>
      <span class="fl"><span class="wide">Floor </span>${r.floor}/${FLOORS}${label ? ` <em class="tag ${label.toLowerCase()}">${label}</em>` : ''}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play (H)">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>`;
  }

  private titleView(): string {
    const m = this.meta;
    const archive = UNLOCKS.map((u) => {
      const own = m.unlocked.includes(u.id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${u.icon}</span><span class="arm-t"><b>${u.name}</b><small>${u.text}</small></span>
        ${own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.echoes >= u.cost ? '' : 'disabled'}>✨ ${u.cost}</button>`}</div>`;
    }).join('');
    const starts = UNLOCKS.filter((u) => u.kind === 'start' && m.unlocked.includes(u.id)).map((u) => u.id.slice(6));
    const startPick = starts.length
      ? `<div class="starts"><span class="dim">Start item:</span>
          <button class="chip ${m.startItem ? '' : 'on'}" data-act="start-item" data-id="">None</button>
          ${starts.map((id) => `<button class="chip ${m.startItem === id ? 'on' : ''}" data-act="start-item" data-id="${id}">${ITEMS[id].icon} ${ITEMS[id].name}</button>`).join('')}
        </div>`
      : '';
    const r = this.run;
    return `<div class="title">
      <div class="logo"><span class="lp">🌱</span><span class="lt">100 years</span><span class="lf">🌳</span></div>
      <h1>Split Ages</h1>
      <p class="sub">Two boards show the same place, 100 years apart. You move a hero on each board in the same turn. Plant a seed in the past, and a tree stands in the future.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue (floor ${r.floor}, ❤️ ${r.st && r.stage === 'floor' ? r.st.hp : r.hp})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      ${startPick}
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best floor ${m.bestFloor} · Best score ${m.best}</p>
      <h2>Archive <small>✨ ${m.echoes} echoes</small></h2>
      <p class="sub small">Each run gives echoes. Unlock a cause rule, start items and new items.</p>
      <div class="archive">${archive}</div>
    </div>`;
  }

  private floorView(): string {
    const cells = Array.from({ length: N }, (_, c) => `<div class="cell" data-c="${c}"><span class="g"></span><span class="mk"></span></div>`).join('');
    const board = (age: Age): string => `<section class="bw ${age}">
        <div class="bh"><b>${age === 'past' ? '🕰️ Past' : '🔭 Future'}</b><span class="dim">${age === 'past' ? 'today' : '100 years later'}</span><span class="grow"></span><span id="bh-${age}"></span></div>
        <div class="board" data-age="${age}"><div class="cells">${cells}</div><div class="actors"></div></div>
      </section>`;
    return `<div class="play">
      <div class="boards">${board('past')}${board('fut')}</div>
      <div class="ctl" id="ctl"></div>
      <aside class="side" id="side"></aside>
    </div>`;
  }

  private rewardView(): string {
    const r = this.run!;
    const res = this.result;
    const cards = r.offer
      .map((id) => {
        const it = ITEMS[id];
        const rep = replaces(r, id);
        return `<button class="card" data-act="take" data-id="${id}"><span class="big">${it.icon}</span><b>${it.name}</b>
          <em class="age ${it.age}">${it.instant ? 'Now' : it.age === 'both' ? 'Both ages' : AGE_NAME[it.age]}</em><small>${it.text}</small>
          ${rep ? `<small class="warn">Replaces ${ITEMS[rep].icon} ${ITEMS[rep].name}</small>` : ''}</button>`;
      })
      .join('');
    return `<div class="reward">
      <h2>Floor ${r.floor} cleared</h2>
      ${res ? `<p class="sub">+${res.gold} 💰${res.heal ? ` · +${res.heal} ❤️ from trees` : ''}${res.par ? ' · <span class="good">On par! +40 score</span>' : ''}</p>` : ''}
      <p>Choose one item. Items for one age take one of ${SLOTS} slots of that age.</p>
      <div class="cards">${cards}</div>
      <button data-act="skip">Skip (+3 💰)</button>
      ${this.itemsLine()}
    </div>`;
  }

  private campView(): string {
    const r = this.run!;
    const rows = r.shop
      .map((s, i) => {
        const info = SHOP_INFO[s.id] ?? ITEMS[s.id];
        return `<div class="arm ${s.sold ? 'own' : ''}"><span class="big">${info.icon}</span><span class="arm-t"><b>${info.name}</b><small>${info.text}</small></span>
          ${s.sold ? '<span class="ok">Sold</span>' : `<button data-act="buy" data-i="${i}" ${r.gold >= s.cost ? '' : 'disabled'}>💰 ${s.cost}</button>`}</div>`;
      })
      .join('');
    return `<div class="camp">
      <h2>⛺ Camp between the ages</h2>
      <p class="sub">Spend your gold. The next floor is ${r.floor + 1}${floorLabel(r.floor + 1) ? ` (${floorLabel(r.floor + 1)})` : ''}.</p>
      <div class="archive">${rows}</div>
      <button class="primary" data-act="leave-camp">Continue ▶</button>
      ${this.itemsLine()}
    </div>`;
  }

  private itemsLine(): string {
    const r = this.run!;
    if (!r.items.length) return '';
    return `<p class="items-line">${r.items.map((id) => `<span class="chip" title="${ITEMS[id].text}">${ITEMS[id].icon} ${ITEMS[id].name}</span>`).join(' ')}</p>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <div class="huge">${e.victory ? '🌳' : '🥀'}</div>
      <h1>${e.victory ? 'Both ages are saved' : 'The timeline breaks'}</h1>
      <p class="sub">${e.victory ? 'The Twice-Born falls in the past and in the future.' : `You fell on floor ${e.floor}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>+${e.echoes} ✨ echoes for the Archive</p>
      <button class="primary" data-act="new">▶ New run</button>
      <button data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const rules = Object.values(RULES)
        .map((r) => `<li><b>${r.icon} ${r.name}.</b> ${r.text}</li>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li>The <b>past</b> board (top or left) and the <b>future</b> board show the same place, 100 years apart. The tile under your finger is marked on the other board too.</li>
          <li>Each turn, both heroes act. <b>Tap a glowing tile</b> next to a hero to choose its move. Tap the hero itself to act (plant, pull a lever) or wait. Then press <b>Go</b> (or tap the same tile again).</li>
          <li>Before you press Go, the boards show what will happen: changed tiles glow on the other board and the bar tells you the cause, the effect and any damage.</li>
          <li>The past move happens first. So a bridge you grow in the past is ready for the future hero in the same turn.</li>
          <li>Reach the 🌀 exit with the <b>future</b> hero. The past hero shapes the way.</li>
          <li>Walk into an enemy to attack it. Enemies hit a hero next to them at the end of the turn. Red tiles show where you get hit. Both heroes share one HP pool.</li>
          <li>Same letter badge = same family. Defeat the ancestor in the past and its descendants (and their 🎁 treasure) never exist.</li>
          <li><b>Rewind</b> takes back your last turn (a few per floor). <b>Clear</b> drops the moves you chose but did not play. The menu can restart the floor for 2 HP.</li>
          <li>After each floor choose an item. Camps after floors 4, 8 and 11 sell food and gear. Floor 12 holds the boss that lives in both ages: break its 🔮 anchors in the past first.</li>
        </ul>
        <h3>Cause rules</h3>
        <ul>${rules}</ul>
        <h3>Keys</h3>
        <p class="small">Past: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move, <kbd>E</kbd> act/wait. Future: arrow keys move, <kbd>/</kbd> wait. <kbd>Space</kbd> Go, <kbd>X</kbd> clear, <kbd>Z</kbd> rewind, <kbd>H</kbd> hint.</p>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    const inFloor = this.screen === 'floor' && this.run?.start;
    let extra = '';
    if (m.confirm === 'abandon') extra = '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>';
    else if (m.confirm === 'restart') extra = '<p class="warn">Restart this floor from the first turn? It costs 2 HP.</p><button class="danger" data-act="restart-yes">Yes, restart</button>';
    else
      extra = `${inFloor ? `<button data-act="restart" ${this.run!.start!.hp > 2 ? '' : 'disabled'}>Restart floor (−2 ❤️)</button>` : ''}
        <button data-act="abandon">Abandon run</button>`;
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${extra}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Floor painting ----------

  /** Future options depend on the chosen past move, because the past resolves first. */
  private options(): { popts: Act[]; fopts: Act[]; mid: St } {
    const def = this.def;
    const st = this.st;
    const mods = modsFor(this.run!);
    const popts = pastOptions(def, st);
    const mid = pastHalf(def, st, this.hovP ?? this.selP ?? 'A', mods, []).st;
    const fopts = mid.done ? ['A' as Act] : futOptions(def, mid, mods);
    return { popts, fopts, mid };
  }

  private preview(): Preview | null {
    const pa = this.hovP ?? this.selP;
    const fa = this.hovF ?? this.selF;
    if (pa === null && fa === null) return null;
    const res = turn(this.def, this.st, pa ?? 'A', fa ?? 'A', modsFor(this.run!));
    return res;
  }

  private cellEl(age: Age, c: number): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(`.board[data-age="${age}"] .cell[data-c="${c}"]`);
  }

  private paint(): void {
    if (this.screen !== 'floor' || !this.run?.st) return;
    const def = this.def;
    const st = this.st;
    const mods = modsFor(this.run);
    const { popts, fopts, mid } = this.options();
    if (this.selF && !fopts.includes(this.selF)) this.selF = null;
    const pv = this.busy ? null : this.preview();
    const chg = new Map<string, { icon: string }>();
    const src = new Set<string>();
    const doomed = new Set<string>();
    if (pv) {
      for (const e of pv.ev) {
        if (e.k === 'cause') {
          chg.set(`${e.to.age}${e.to.cell}`, { icon: e.icon });
          src.add(`${e.from.age}${e.from.cell}`);
        }
        if (e.k === 'kill') doomed.add(`${e.age}${e.cell}`);
      }
    }
    const intentMode = def.boss && bossAlive(def, st) ? bossIntent(st) : null;
    for (const age of ['past', 'fut'] as Age[]) {
      const board = this.root.querySelector<HTMLElement>(`.board[data-age="${age}"]`);
      if (!board) continue;
      const tiles = age === 'past' ? st.past : st.fut;
      const danger = dangerCells(def, st, age);
      const hero = age === 'past' ? st.pp : st.fp;
      const opts = age === 'past' ? popts : fopts;
      const sel = age === 'past' ? this.selP : this.selF;
      const hov = age === 'past' ? this.hovP : this.hovF;
      const targets = new Map<number, Act>();
      for (const a of opts) {
        let c = a === 'A' ? hero : nb(hero, a);
        if (age === 'fut' && a !== 'A' && c >= 0 && !isAttack(def, mid, 'fut', a)) {
          // A rope swing lands two tiles away.
          const t = mid.fut[c];
          if ((t === '_' || t === '~') && !mid.statues.includes(c) && !(t === '~' && mods.waders)) c = nb(c, a);
        }
        if (c >= 0) targets.set(c, a);
      }
      const cells = board.querySelectorAll<HTMLElement>('.cell');
      cells.forEach((el, c) => {
        const t = tiles[c];
        const cls = ['cell', `t-${TILE_CLASS[t] ?? 'floor'}`];
        let glyph = TILE_GLYPH[t] ?? '';
        let mark = '';
        if (age === 'fut') {
          const ch = st.chests.find((i) => def.chests[i].cell === c);
          if (ch !== undefined) {
            glyph = '🎁';
            mark = famBadge(def.chests[ch].fam);
          }
          if (def.floodA.includes(c) || def.floodB.includes(c)) cls.push('basin');
        } else {
          if (t === 's') mark = `<i class="mini">${st.fut[c] === '_' || st.fut[c] === '~' ? '🪵' : '🌳'}</i>`;
          if (t === 'L') cls.push(st.sluice ? 'on' : 'off');
          if (t === 'c' && st.fut[c] === '#') cls.push('link');
          if (t === 'G') cls.push('link');
        }
        if (age === 'fut' && (t === 'P') && def.links.some((l) => l.plate === c)) cls.push('link');
        const d = danger.get(c);
        if (d && (c === hero || targets.has(c))) cls.push('danger');
        else if (d) cls.push('threat');
        const a = targets.get(c);
        if (a !== undefined && !this.busy) cls.push('can');
        if (a !== undefined && a === sel) cls.push('sel');
        if (a !== undefined && a === hov && hov !== sel) cls.push('hov');
        const key = `${age}${c}`;
        if (chg.has(key)) {
          cls.push('chg');
          el.dataset.ghost = chg.get(key)!.icon;
        }
        if (src.has(key)) cls.push('src');
        if (c === this.twin) cls.push('twin');
        if (intentMode === 'wave' && waveCells(st, age, def.boss!.pos).includes(c)) cls.push('wave-warn');
        if (intentMode === 'claw' && Math.abs(cx(c) - cx(def.boss!.pos)) + Math.abs(cy(c) - cy(def.boss!.pos)) === 1) cls.push('wave-warn');
        const name = cls.join(' ');
        if (el.className !== name) el.className = name;
        const g = el.firstElementChild as HTMLElement;
        if (g.textContent !== glyph) g.textContent = glyph;
        const mk = el.lastElementChild as HTMLElement;
        if (mk.innerHTML !== mark) mk.innerHTML = mark;
      });
      this.paintActors(age, board.querySelector<HTMLElement>('.actors')!, doomed);
    }
    this.paintChrome(pv, popts);
  }

  private paintActors(age: Age, layer: HTMLElement, doomed: Set<string>): void {
    const def = this.def;
    const st = this.st;
    const want = new Map<string, { pos: number; html: string; cls: string }>();
    const hero = age === 'past' ? st.pp : st.fp;
    want.set('h', { pos: hero, html: `<span class="ic">${HERO[age]}</span>`, cls: `hero ${age}` });
    for (const f of st.foes) {
      const fd = def.foes[f.i];
      if (fd.age !== age) continue;
      const T = FOES[fd.type];
      const pips = '●'.repeat(Math.max(0, f.hp));
      const dmg = foeDmg(def, fd);
      want.set(`f${f.i}`, {
        pos: f.pos,
        html: `<span class="ic">${T.icon}</span><span class="pips">${pips}</span>${dmg ? `<span class="atk">${dmg}</span>` : ''}${famBadge(fd.fam)}`,
        cls: `foe ${T.move}${doomed.has(`${age}${f.pos}`) ? ' doomed' : ''}`,
      });
    }
    st.statues.forEach((s, k) => {
      const sunk = age === 'fut' && (st.fut[s] === '_' || st.fut[s] === '~');
      want.set(`s${k}`, { pos: s, html: '<span class="ic">🗿</span>', cls: `statue${sunk ? ' sunk' : ''}` });
    });
    if (def.boss && bossAlive(def, st)) {
      const shield = anchorsLeft(def, st) > 0;
      want.set('b', { pos: def.boss.pos, html: `<span class="ic">🐲</span><span class="pips">${'●'.repeat(st.bossHp)}</span>`, cls: `boss${shield ? ' shielded' : ''}` });
    }
    const map = this.actors[age];
    for (const [k, el] of map) {
      if (want.has(k)) continue;
      map.delete(k);
      el.classList.add('gone');
      setTimeout(() => el.remove(), FAST ? 0 : 350);
    }
    for (const [k, w] of want) {
      let el = map.get(k);
      if (!el) {
        el = document.createElement('div');
        el.dataset.k = k;
        layer.appendChild(el);
        map.set(k, el);
      }
      const cls = `actor ${w.cls}`;
      if (el.className !== cls) el.className = cls;
      if (el.innerHTML !== w.html) el.innerHTML = w.html;
      const tr = `translate(${cx(w.pos) * 100}%, ${cy(w.pos) * 100}%)`;
      if (el.style.transform !== tr) el.style.transform = tr;
    }
  }

  private actDesc(age: Age, a: Act | null): string {
    const def = this.def;
    const st = this.st;
    if (a === null) return '<span class="dim">waits</span>';
    if (a === 'A') return age === 'past' ? actLabel(def, st) : 'waits';
    const base = age === 'past' ? st : pastHalf(def, st, this.selP ?? 'A', modsFor(this.run!), []).st;
    const from = age === 'past' ? base.pp : base.fp;
    const c = nb(from, a);
    if (c < 0) return 'waits';
    const fi = foeAt(def, base, age, c);
    if (fi >= 0) return `attacks ${FOES[def.foes[base.foes[fi].i].type].icon}`;
    if (def.boss && c === def.boss.pos) return 'attacks 🐲';
    if (age === 'past' && base.past[c] === 'c') return 'breaks 🧱';
    if (age === 'past' && base.statues.includes(c)) return 'pushes 🗿';
    return `moves ${ARROW[a]}`;
  }

  private paintChrome(pv: Preview | null, popts: Act[]): void {
    const r = this.run!;
    const def = this.def;
    const st = this.st;
    const top = this.root.querySelector<HTMLElement>('#top');
    if (top) top.innerHTML = this.topBar();
    const bp = this.root.querySelector<HTMLElement>('#bh-past');
    if (bp) bp.innerHTML = `🌰 ${st.seeds}${def.floodA.length || def.floodB.length ? ` · 🎚️ ${st.sluice ? 'open' : 'shut'}` : ''}`;
    const bf = this.root.querySelector<HTMLElement>('#bh-fut');
    if (bf) bf.innerHTML = `Turn ${r.floorTurns + 1} · par ${def.par}${st.rope ? ' · 🪢' : ''}`;
    const ctl = this.root.querySelector<HTMLElement>('#ctl');
    if (ctl) {
      let lines = '';
      if (this.deadEnd) lines += '<div class="cap bad">⚠ This looks like a dead end: no path to the goal is found from here. Rewind, or restart the floor from the ☰ menu.</div>';
      if (pv) {
        const causes = pv.ev.filter((e): e is Extract<Ev, { k: 'cause' }> => e.k === 'cause');
        const taken = pv.ev.reduce((n, e) => n + (e.k === 'dmg' && e.hero ? e.n : 0), 0);
        const picks = pv.ev.filter((e): e is Extract<Ev, { k: 'pick' }> => e.k === 'pick').map((e) => e.text);
        const bits: string[] = causes.map((e) => `<span class="cz ${e.to.age}">${e.icon} ${e.from.age === 'past' ? 'Future' : 'Past'}: ${e.text}</span>`);
        if (taken) bits.push(`<span class="bad">−${taken} ❤️</span>`);
        else bits.push('<span class="good">no damage</span>');
        if (picks.length) bits.push(`<span class="good">${picks.join(' ')}</span>`);
        if (pv.st.done === 'exit') bits.push('<span class="good">🌀 Exit!</span>');
        if (pv.st.done === 'boss') bits.push('<span class="good">🐲 Victory!</span>');
        if (pv.st.done === 'dead') bits.push('<span class="bad">☠ This kills you</span>');
        lines += `<div class="cap"><span>${HERO.past} ${this.actDesc('past', this.hovP ?? this.selP)} · ${HERO.fut} ${this.actDesc('fut', this.hovF ?? this.selF)}</span></div><div class="cap fx-line">${bits.join(' · ')}</div>`;
      } else if (!this.deadEnd) {
        lines += `<div class="cap dim">${this.tip(popts)}</div>`;
      }
      const canRewind = this.hist.length > 0 && r.rewinds > 0;
      ctl.innerHTML = `<div class="caps">${lines}</div>
        <div class="btns">
          <button data-act="clear" ${this.selP || this.selF ? '' : 'disabled'} title="Drop the chosen moves (X)">↺ Clear</button>
          <button data-act="rewind" ${canRewind && !this.busy ? '' : 'disabled'} title="Take back the last turn (Z)">⏪ ${r.rewinds}</button>
          <button data-act="hint" title="Show a safe move (−30 score) (H)">💡</button>
          <button class="primary go" data-act="go" ${this.busy ? 'disabled' : ''} title="Play the turn (Space)">Go ▶</button>
        </div>`;
    }
    const side = this.root.querySelector<HTMLElement>('#side');
    if (side) side.innerHTML = this.sideView();
  }

  private tip(popts: Act[]): string {
    const def = this.def;
    const st = this.st;
    if (def.boss) {
      const left = anchorsLeft(def, st);
      if (left) return `Break the ${left} 🔮 anchor${left > 1 ? 's' : ''} in the past. Until then the boss is shielded in both ages.`;
      return 'The shield is down. Hit the 🐲 boss in either age. Watch its next attack in the side panel.';
    }
    if (this.run!.floor <= 2 && st.turn === 0) {
      if (st.past.includes('s')) return 'Tip: walk the past hero 🧑‍🌾 onto the soil, then tap it to plant. Watch the future board glow.';
      if (st.past.includes('c')) return 'Tip: walk the past hero into the 🧱 cracked wall to break it. The wall is then gone in the future too.';
      return 'Tip: tap a glowing tile next to a hero to choose its move, then press Go.';
    }
    void popts;
    return `Choose moves for ${HERO.past} and ${HERO.fut}, then press Go. A hero with no move waits.`;
  }

  private sideView(): string {
    const r = this.run!;
    const def = this.def;
    const st = this.st;
    const items = (age: 'past' | 'fut' | 'both'): string =>
      r.items
        .filter((id) => ITEMS[id].age === age)
        .map((id) => `<span class="chip" title="${ITEMS[id].text}">${ITEMS[id].icon} ${ITEMS[id].name}</span>`)
        .join('') || '<span class="dim small">none</span>';
    const rules = def.rules.map((id) => `<li><b>${RULES[id].icon} ${RULES[id].name}</b> <span class="small">${RULES[id].text}</span></li>`).join('');
    const seen = new Set<string>([...st.past, ...st.fut]);
    const legend = Object.keys(TILE_GLYPH)
      .filter((t) => seen.has(t))
      .map((t) => `<li><span class="lg">${TILE_GLYPH[t]}</span> ${TILE_NAMES[t]}</li>`)
      .join('');
    const foeTypes = [...new Set(st.foes.map((f) => def.foes[f.i].type))].map((t) => `<li><span class="lg">${FOES[t].icon}</span> <b>${FOES[t].name}</b> <span class="small">${FOES[t].text}</span></li>`).join('');
    let boss = '';
    if (def.boss && bossAlive(def, st)) {
      const it = bossIntent(st);
      const text = it === 'rest' ? 'gathers power (no attack)' : it === 'claw' ? 'claws the 4 tiles next to it for 2' : 'sends a time wave along its row and column, 2–3 tiles away, for 1';
      boss = `<div class="boss-box"><b>🐲 The Twice-Born</b> ${st.bossHp}/${def.boss.hp} HP${anchorsLeft(def, st) ? ' · 🔮 shielded' : ''}<br><span class="small">This turn it ${text}.</span></div>`;
    }
    return `${boss}
      <h3>Rules on this floor</h3><ul class="rules">${rules}</ul>
      <h3>Items</h3>
      <div class="itm"><span class="dim small">${HERO.past} Past</span>${items('past')}</div>
      <div class="itm"><span class="dim small">${HERO.fut} Future</span>${items('fut')}</div>
      <div class="itm"><span class="dim small">Both</span>${items('both')}</div>
      ${foeTypes ? `<h3>Enemies</h3><ul class="legend">${foeTypes}</ul>` : ''}
      ${legend ? `<h3>Tiles</h3><ul class="legend">${legend}</ul>` : ''}`;
  }

  // ---------- Effects ----------

  private center(age: Age, c: number): { x: number; y: number } | null {
    const el = this.cellEl(age, c);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private float(age: Age, c: number, text: string, cls: string, delay = 0): void {
    if (FAST) return;
    const p = this.center(age, c);
    if (!p) return;
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.style.animationDelay = `${delay}ms`;
    this.fx.appendChild(el);
    setTimeout(() => el.remove(), 1300 + delay);
  }

  /** A glowing dot that travels from the cause tile to the effect tile on the other board. */
  private pulse(from: { age: Age; cell: number }, to: { age: Age; cell: number }, icon: string, text: string, i: number): void {
    if (FAST) return;
    const a = this.center(from.age, from.cell);
    const b = this.center(to.age, to.cell);
    if (!a || !b) return;
    const delay = 120 + i * 90;
    const dot = document.createElement('div');
    dot.className = 'pulse';
    dot.style.left = `${a.x}px`;
    dot.style.top = `${a.y}px`;
    this.fx.appendChild(dot);
    const line = document.createElement('div');
    line.className = 'trail';
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    line.style.left = `${a.x}px`;
    line.style.top = `${a.y}px`;
    line.style.width = `${len}px`;
    line.style.transform = `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
    line.style.animationDelay = `${delay}ms`;
    this.fx.appendChild(line);
    dot.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 1, offset: 0.15 },
        { transform: `translate(calc(${b.x - a.x}px - 50%), calc(${b.y - a.y}px - 50%)) scale(1)`, opacity: 1 },
      ],
      { duration: 420, delay, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' },
    );
    setTimeout(() => {
      dot.remove();
      line.remove();
      const el = this.cellEl(to.age, to.cell);
      if (el) {
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 700);
      }
      this.float(to.age, to.cell, `${icon} ${text}`, 'cause-t');
    }, delay + 430);
    const src = this.cellEl(from.age, from.cell);
    if (src) {
      src.classList.add('flash-src');
      setTimeout(() => src.classList.remove('flash-src'), 600);
    }
  }

  private playEvents(ev: Ev[]): void {
    let causes = 0;
    let hurt = false;
    for (const e of ev) {
      switch (e.k) {
        case 'cause':
          this.pulse(e.from, e.to, e.icon, e.text, causes++);
          if (causes === 1) {
            sfx.cause();
            if (e.rule === 'growth') sfx.grow();
            else if (e.rule === 'erosion') sfx.crumble();
            else if (e.rule === 'flooding') sfx.flood();
            else if (e.rule === 'echo') sfx.gate();
          }
          break;
        case 'dmg':
          this.float(e.age, e.cell, `−${e.n}`, e.hero ? 'hurt' : 'hit');
          if (e.hero) hurt = true;
          else sfx.hit();
          break;
        case 'kill':
          this.float(e.age, e.cell, '💥', 'puff', 80);
          sfx.kill();
          break;
        case 'pick':
          this.float(e.age, e.cell, e.text, 'gain');
          sfx.coin();
          break;
        case 'block':
          this.float(e.age, e.cell, e.text, 'info');
          sfx.block();
          break;
        case 'info':
          this.float(e.age, e.cell, e.text, 'info');
          if (e.text === 'Crack!') sfx.crumble();
          break;
        case 'bump': {
          const el = this.actorAt(e.age, e.from);
          if (el && !FAST) {
            const dx = (cx(e.to) - cx(e.from)) * 25;
            const dy = (cy(e.to) - cy(e.from)) * 25;
            el.animate([{ translate: '0 0' }, { translate: `${dx}% ${dy}%` }, { translate: '0 0' }], { duration: 200 });
          }
          break;
        }
        case 'wave':
          sfx.wave();
          for (const age of ['past', 'fut'] as Age[])
            for (const c of e.cells) {
              const el = this.cellEl(age, c);
              if (el) {
                el.classList.add('boom');
                setTimeout(() => el.classList.remove('boom'), 500);
              }
            }
          break;
        case 'move':
          if (e.who === 'hero') sfx.step();
          break;
      }
    }
    if (hurt) {
      sfx.hurt();
      if (!FAST) {
        this.root.classList.remove('shake');
        void this.root.offsetWidth;
        this.root.classList.add('shake');
      }
    }
  }

  private actorAt(age: Age, c: number): HTMLElement | null {
    const st = this.st;
    if ((age === 'past' ? st.pp : st.fp) === c) return this.actors[age].get('h') ?? null;
    const fi = foeAt(this.def, st, age, c);
    if (fi >= 0) return this.actors[age].get(`f${st.foes[fi].i}`) ?? null;
    return null;
  }

  // ---------- Turn flow ----------

  private go(): void {
    if (this.busy || this.screen !== 'floor' || !this.run?.st) return;
    initAudio();
    const r = this.run;
    const mods = modsFor(r);
    const before = this.st;
    const res = turn(this.def, before, this.selP ?? 'A', this.selF ?? 'A', mods);
    this.hist.push(before);
    if (this.hist.length > 60) this.hist.shift();
    // Bumps animate from the positions before the move.
    r.st = res.st;
    r.floorTurns++;
    this.selP = this.selF = this.hovP = this.hovF = null;
    this.deadEnd = false;
    const hasCause = res.ev.some((e) => e.k === 'cause');
    this.busy = ANIM > 0;
    this.paint();
    this.playEvents(res.ev);
    this.save();
    const wait = ANIM + (hasCause ? 450 : 0);
    if (wait > 0) setTimeout(() => this.afterTurn(), wait);
    else this.afterTurn();
  }

  private afterTurn(): void {
    this.busy = false;
    const r = this.run;
    if (!r?.st || this.screen !== 'floor') return;
    const st = r.st;
    if (st.done === 'dead') {
      sfx.lose();
      this.endRun(false);
      return;
    }
    if (st.done === 'boss') {
      sfx.win();
      r.hp = st.hp;
      finishFloor(r);
      this.endRun(true);
      return;
    }
    if (st.done === 'exit') {
      sfx.clear();
      this.result = finishFloor(r);
      this.hist = [];
      this.screen = 'reward';
      this.save();
      this.render();
      return;
    }
    this.paint();
    this.checkDeadEnd();
  }

  private checkDeadEnd(): void {
    clearTimeout(this.deadTimer);
    if (FAST) return;
    this.deadTimer = window.setTimeout(() => {
      if (this.screen !== 'floor' || !this.run?.st || this.busy) return;
      const res = solve(this.def, this.st, modsFor(this.run), 'fast', 6000);
      const dead = !res.plan && !res.capped;
      if (dead !== this.deadEnd) {
        this.deadEnd = dead;
        this.paint();
      }
    }, 60);
  }

  private rewind(): void {
    const r = this.run;
    if (!r || this.busy || !this.hist.length || r.rewinds <= 0) return;
    r.st = this.hist.pop()!;
    r.rewinds--;
    this.selP = this.selF = null;
    sfx.rewind();
    this.deadEnd = false;
    this.root.classList.remove('rewinding');
    void this.root.offsetWidth;
    this.root.classList.add('rewinding');
    this.paint();
    this.save();
    this.checkDeadEnd();
  }

  private hint(): void {
    const r = this.run;
    if (!r?.st || this.busy) return;
    const res = solve(this.def, this.st, modsFor(r), 'safe', 40000);
    if (!res.plan || !res.plan.acts.length) {
      this.toast('💡 No safe path found from here. Try a rewind.');
      return;
    }
    const [pa, fa] = res.plan.acts[0];
    this.selP = pa;
    this.selF = fa;
    r.hints++;
    this.toast(`💡 A safe plan needs about ${res.plan.turns} more turns and ${res.plan.dmg} damage. First move is shown. (−30 score)`);
    this.paint();
  }

  private startFloorScreen(): void {
    this.screen = 'floor';
    this.hist = [];
    this.selP = this.selF = this.hovP = this.hovF = null;
    this.deadEnd = false;
    this.render();
    const def = this.def;
    const rules = def.rules.map((id) => `${RULES[id].icon} ${RULES[id].name}`).join(' · ');
    this.toast(`<b>Floor ${def.floor}${floorLabel(def.floor) ? ` · ${floorLabel(def.floor)}` : ''}</b><br>${rules}`);
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const sc = score(r, victory);
    const ech = echoesFor(sc);
    const m = this.meta;
    m.echoes += ech;
    if (victory) m.wins++;
    m.bestFloor = Math.max(m.bestFloor, victory ? FLOORS : r.floor);
    m.best = Math.max(m.best, sc);
    saveMeta(m);
    clearRun();
    this.end = { victory, score: sc, echoes: ech, floor: r.floor };
    this.run = null;
    this.modal = null;
    this.screen = 'end';
    if (victory) sfx.win();
    this.render();
  }

  // ---------- Input ----------

  private cellFrom(e: Event): { age: Age; c: number } | null {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.cell');
    const board = el?.closest<HTMLElement>('.board');
    if (!el || !board) return null;
    return { age: board.dataset.age as Age, c: Number(el.dataset.c) };
  }

  private targetAct(age: Age, c: number): Act | null {
    const { popts, fopts } = this.options();
    if (age === 'past') {
      const a = dirTo(this.st.pp, c);
      return a && popts.includes(a) ? a : null;
    }
    const mods = modsFor(this.run!);
    const mid = pastHalf(this.def, this.st, this.hovP ?? this.selP ?? 'A', mods, []).st;
    let a = dirTo(mid.fp, c);
    if (!a) {
      // Rope swing: two tiles away in a straight line.
      for (const d of ['U', 'D', 'L', 'R'] as Act[]) {
        const m = nb(mid.fp, d);
        if (m >= 0 && nb(m, d) === c) a = d;
      }
    }
    return a && fopts.includes(a) ? a : null;
  }

  private onHover(e: PointerEvent): void {
    if (this.screen !== 'floor' || e.pointerType !== 'mouse' || this.busy || this.modal) return;
    const hit = this.cellFrom(e);
    let hp: Act | null = null;
    let hf: Act | null = null;
    let twin = -1;
    if (hit) {
      twin = hit.c;
      const a = this.targetAct(hit.age, hit.c);
      if (hit.age === 'past') hp = a;
      else hf = a;
    }
    if (hp === this.hovP && hf === this.hovF && twin === this.twin) return;
    this.hovP = hp;
    this.hovF = hf;
    this.twin = twin;
    this.paint();
  }

  private clearHover(): void {
    if (this.hovP === null && this.hovF === null && this.twin < 0) return;
    this.hovP = this.hovF = null;
    this.twin = -1;
    if (this.screen === 'floor') this.paint();
  }

  private pick(age: Age, a: Act): void {
    if (this.busy) return;
    const cur = age === 'past' ? this.selP : this.selF;
    if (cur === a) {
      this.go();
      return;
    }
    if (age === 'past') this.selP = a;
    else this.selF = a;
    sfx.select();
    this.paint();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.renderModal();
      }
      return;
    }
    if (this.screen !== 'floor' || !this.run?.st) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const { popts, fopts } = this.options();
    if (KEY_P[k]) {
      const a = KEY_P[k];
      if (popts.includes(a)) this.pick('past', a);
      else sfx.deny();
    } else if (KEY_F[e.key]) {
      e.preventDefault();
      const a = KEY_F[e.key];
      if (fopts.includes(a)) this.pick('fut', a);
      else sfx.deny();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this.go();
    } else if (k === 'x' || e.key === 'Backspace') {
      this.selP = this.selF = null;
      this.paint();
    } else if (k === 'z') this.rewind();
    else if (k === 'h') this.hint();
    else if (e.key === 'Escape') {
      this.modal = { kind: 'menu', confirm: '' };
      this.renderModal();
    }
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    if (this.screen === 'floor' && !this.modal) {
      const hit = this.cellFrom(e);
      if (hit) {
        this.twin = -1;
        const a = this.targetAct(hit.age, hit.c);
        if (a) this.pick(hit.age, a);
        else {
          // Tapping elsewhere shows the twin tile on the other board.
          this.twin = hit.c;
          this.paint();
        }
        return;
      }
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    this.action(el.dataset.act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const r = this.run;
    switch (act) {
      case 'mute':
        toggleMute();
        if (this.screen === 'floor') this.paint();
        else this.render();
        return;
      case 'help':
        this.modal = { kind: 'help' };
        this.renderModal();
        return;
      case 'menu':
        this.modal = { kind: 'menu', confirm: '' };
        this.renderModal();
        return;
      case 'modal-close':
        this.modal = null;
        this.renderModal();
        return;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: 'abandon' };
        this.renderModal();
        return;
      case 'abandon-yes':
        this.modal = null;
        if (r) {
          if (r.st) r.hp = r.st.hp;
          this.endRun(false);
        }
        return;
      case 'restart':
        this.modal = { kind: 'menu', confirm: 'restart' };
        this.renderModal();
        return;
      case 'restart-yes':
        this.modal = null;
        if (r && restartFloor(r)) {
          this.hist = [];
          this.selP = this.selF = null;
          this.deadEnd = false;
          sfx.rewind();
          this.save();
          this.renderModal();
          this.paint();
        }
        return;
      case 'title':
        this.modal = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.run = newRun(randomSeedText(), this.meta);
        this.meta.runs++;
        saveMeta(this.meta);
        this.save();
        this.startFloorScreen();
        return;
      case 'continue':
        if (!r) return;
        if (r.stage === 'floor') this.startFloorScreen();
        else {
          this.screen = r.stage;
          this.render();
        }
        return;
      case 'start-item':
        this.meta.startItem = d.id ?? '';
        saveMeta(this.meta);
        this.render();
        return;
      case 'unlock': {
        const u = UNLOCKS.find((x) => x.id === d.id);
        if (!u || this.meta.echoes < u.cost || this.meta.unlocked.includes(u.id)) return;
        this.meta.echoes -= u.cost;
        this.meta.unlocked.push(u.id);
        saveMeta(this.meta);
        sfx.item();
        this.render();
        return;
      }
      case 'clear':
        this.selP = this.selF = null;
        this.paint();
        return;
      case 'rewind':
        this.rewind();
        return;
      case 'hint':
        this.hint();
        return;
      case 'go':
        this.go();
        return;
      case 'take':
        if (!r || r.stage !== 'reward' || !d.id) return;
        takeItem(r, d.id);
        sfx.item();
        this.toast(`${ITEMS[d.id].icon} ${ITEMS[d.id].name}`);
        this.afterReward();
        return;
      case 'skip':
        if (!r || r.stage !== 'reward') return;
        r.gold += 3;
        r.goldEarned += 3;
        this.afterReward();
        return;
      case 'buy':
        if (!r) return;
        if (buy(r, Number(d.i))) {
          sfx.coin();
          this.save();
        } else sfx.deny();
        this.render();
        return;
      case 'leave-camp':
        if (!r) return;
        this.afterReward();
        return;
    }
  }

  private afterReward(): void {
    const r = this.run!;
    const next = advance(r);
    if (next === 'camp') {
      this.screen = 'camp';
      this.save();
      this.render();
      return;
    }
    if (next === 'won') {
      this.endRun(true);
      return;
    }
    this.save();
    this.startFloorScreen();
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
        busy: this.busy,
        floor: this.run?.floor ?? null,
        stage: this.run?.stage ?? null,
        hp: this.run?.st?.hp ?? this.run?.hp ?? null,
        maxHp: this.run?.maxHp ?? null,
        gold: this.run?.gold ?? null,
        items: this.run?.items ?? [],
        turn: this.run?.st?.turn ?? null,
        par: this.run?.def?.par ?? null,
        pp: this.run?.st?.pp ?? null,
        fp: this.run?.st?.fp ?? null,
        end: this.end,
        deadEnd: this.deadEnd,
      }),
      /** One bot action. On a floor the bot follows the safest plan from the solver. */
      step: (): string => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.renderModal();
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'floor': {
            if (!r?.st || !r.def) return 'none';
            const [pa, fa] = this.bot.next(r.def, r.st, modsFor(r));
            this.selP = pa;
            this.selF = fa;
            this.go();
            return `turn ${pa}${fa}`;
          }
          case 'reward': {
            const id = pickReward(r!.offer, 'smart', rng, r!.hp, r!.maxHp);
            if (!id || !click(`[data-act="take"][data-id="${id}"]`)) click('[data-act="skip"]');
            return 'reward';
          }
          case 'camp': {
            if (r!.hp < r!.maxHp - 2 && click('[data-act="buy"][data-i="0"]:not([disabled])')) return 'buy';
            click('[data-act="leave-camp"]');
            return 'camp';
          }
          case 'end':
            return 'end';
        }
        return 'none';
      },
      hp: (n: number) => {
        if (this.run?.st) this.run.st.hp = n;
        this.paint();
      },
      win: () => {
        if (!this.run?.st) return;
        this.run.st.done = this.def.boss ? 'boss' : 'exit';
        this.afterTurn();
      },
      solve: (mode: 'safe' | 'fast' = 'safe', cap = 40000) => {
        if (!this.run?.st) return null;
        const res = solve(this.def, this.st, modsFor(this.run), mode, cap);
        return { states: res.states, capped: res.capped, turns: res.plan?.turns, dmg: res.plan?.dmg, first: res.plan?.acts.slice(0, 5) };
      },
      dump: () => ({ def: this.run?.def, st: this.run?.st }),
      echoes: (n: number) => {
        this.meta.echoes += n;
        saveMeta(this.meta);
        this.render();
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}

