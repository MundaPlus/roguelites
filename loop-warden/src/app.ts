import {
  BUILDINGS,
  CLASSES,
  ENEMIES,
  H,
  PCT_STATS,
  RARITY,
  RES_ICON,
  RES_KEYS,
  SLOTS,
  SLOT_ICON,
  STAT_LABEL,
  TILES,
  W,
  type Res,
  type Slot,
  type Stats,
} from './data';
import { botAct } from './bot';
import { Rng, randomSeedText } from './rng';
import { initAudio, isMuted, setMuted, sfx } from './sfx';
import {
  DAY,
  HAND_MAX,
  KEEP,
  METER_MAX,
  PEAK_SIZE,
  autoEquip,
  bankRun,
  campContinue,
  canBuild,
  canPlace,
  cellAt,
  cx,
  cy,
  drinkPotion,
  endRun,
  equip,
  heroStats,
  isBlooming,
  isRuined,
  itemPower,
  loadMeta,
  loadRun,
  mountainGroups,
  newRun,
  place,
  saveMeta,
  saveRun,
  scrap,
  tick,
  validCells,
  type Ev,
  type Item,
  type Run,
} from './world';

type Screen = 'title' | 'setup' | 'camp' | 'play' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: '' | 'retreat' | 'abandon' } | { kind: 'camp' } | { kind: 'item'; uid: number };

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` lets `debug.step()` play without waits. */
const FAST = PARAMS.has('fast');
const CELL = 48;
const LW = W * CELL;
const LH = H * CELL;
const SPEEDS = [1, 2, 3];
const MUTE_KEY = 'loopwarden.mute';

const fmtStat = (k: keyof Stats, v: number): string => (PCT_STATS.includes(k) ? `${Math.round(v * 100)}%` : `${Math.round(v)}`);

function statLine(st: Partial<Stats>): string {
  return (Object.entries(st) as [keyof Stats, number][]).map(([k, v]) => `+${fmtStat(k, v)} ${STAT_LABEL[k]}`).join(' · ');
}

const resLine = (r: Partial<Res>): string =>
  RES_KEYS.filter((k) => r[k])
    .map((k) => `${RES_ICON[k]}${r[k]}`)
    .join(' ');

export class App {
  private meta = loadMeta();
  private run: Run | null = loadRun();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private cls = 'warrior';
  private seed = randomSeedText();

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private scale = 1;
  /** Text grows on small canvases so numbers stay readable on phones. */
  private textK = 1;
  private speed = 0; // index in SPEEDS
  private paused = false;
  private selected = -1;
  private cursor = -1;
  private hover = -1;
  private floats: Float[] = [];
  private pops = new Map<number, number>();
  private shake = 0;
  private heroFlash = 0;
  private foeFlash = new Map<number, number>();
  private saveT = 0;
  private sideKey = '';
  private handKey = '';
  private endDelay = 0;
  private botRng = new Rng(Date.now() | 0);

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === '1');
    } catch {
      /* ignore */
    }
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('beforeunload', () => saveRun(this.run));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveRun(this.run);
    });
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- DOM ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'setup':
        body = this.setupView();
        break;
      case 'camp':
        body = this.campView();
        break;
      case 'play':
        body = `<div class="play">
          <section class="board">
            <div class="cv-wrap"><canvas id="cv"></canvas></div>
            <div class="hand" id="hand"></div>
            <div class="hint" id="hint"></div>
          </section>
          <aside class="side" id="side"></aside>
        </div>`;
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.screen === 'play' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'play') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.sideKey = '';
      this.handKey = '';
      this.resize();
      this.updateDom();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
    }
  }

  private renderModal(): void {
    this.root.querySelector('.modal')?.remove();
    if (this.modal) this.root.insertAdjacentHTML('beforeend', this.modalView());
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private titleView(): string {
    const m = this.meta;
    const st = m.stats;
    return `<div class="title">
      <div class="logo">♾️</div>
      <h1>Loop Warden</h1>
      <p class="sub">Your hero walks the loop and fights alone. You build the world around the road.</p>
      <div class="menu-btns">
        ${this.run ? `<button class="primary" data-act="continue">▶ Continue (loop ${this.run.loop})</button>` : ''}
        <button class="${this.run ? '' : 'primary'}" data-act="setup">⚔️ New expedition</button>
        <button data-act="camp">🏕️ Camp (${m.built.length}/${BUILDINGS.length} built)</button>
        <button data-act="help">❓ How to play</button>
      </div>
      <div class="bank">${RES_KEYS.map((k) => `<span>${RES_ICON[k]} ${m.res[k]}</span>`).join('')}</div>
      <p class="dim small">Runs ${st.runs} · Wins ${st.wins} · Best loop ${st.bestLoop} · Best score ${st.bestScore} · Kills ${st.kills}</p>
      ${this.muteBtn()}
    </div>`;
  }

  private muteBtn(): string {
    return `<button class="icon-btn mute" data-act="mute" title="Mute (M)">${isMuted() ? '🔇' : '🔊'}</button>`;
  }

  private setupView(): string {
    const built = new Set(this.meta.built);
    const cards = Object.values(CLASSES)
      .map((c) => {
        const locked = c.unlock && !built.has(c.unlock);
        const b = BUILDINGS.find((x) => x.id === c.unlock);
        const s = c.base;
        return `<button class="cls ${this.cls === c.id ? 'sel' : ''}" data-act="cls" data-id="${c.id}" ${locked ? 'disabled' : ''}>
          <span class="big">${c.hero}</span><b>${c.name}</b>
          <small>${c.desc}</small>
          <small class="dim">HP ${s.maxHp} · DMG ${s.dmg} · SPD ${s.spd} · CRIT ${Math.round(s.crit * 100)}%${s.vamp ? ` · VAMP ${Math.round(s.vamp * 100)}%` : ''}</small>
          ${locked ? `<small class="warn">🔒 Build ${b?.icon} ${b?.name}</small>` : ''}
        </button>`;
      })
      .join('');
    const cards2 = Object.values(TILES)
      .map((t) => `<span class="chip ${t.unlock && !built.has(t.unlock) ? 'locked' : ''}" title="${t.name}">${t.icon}</span>`)
      .join('');
    return `<div class="setup">
      <h2>Choose your hero</h2>
      <div class="classes">${cards}</div>
      <p class="dim">Card pool: ${cards2}</p>
      <label class="seed">Seed <input id="seed" value="${this.seed}" maxlength="12" spellcheck="false" /></label>
      <div class="row">
        <button data-act="title">Back</button>
        <button class="primary" data-act="start">Start expedition ▶</button>
      </div>
    </div>`;
  }

  private campView(): string {
    const m = this.meta;
    const list = BUILDINGS.map((b) => {
      const done = m.built.includes(b.id);
      const ok = canBuild(m, b.cost);
      return `<div class="bld ${done ? 'done' : ''}">
        <span class="big">${b.icon}</span>
        <div><b>${b.name}</b><small>${b.desc}</small></div>
        ${done ? '<span class="good">✔ Built</span>' : `<button class="${ok ? 'primary' : ''}" data-act="build" data-id="${b.id}" ${ok ? '' : 'disabled'}>${resLine(b.cost)}</button>`}
      </div>`;
    }).join('');
    return `<div class="campscreen">
      <h2>🏕️ Camp</h2>
      <p class="sub">Spend the resources you bring home. Buildings stay for every later run.</p>
      <div class="bank">${RES_KEYS.map((k) => `<span>${RES_ICON[k]} ${m.res[k]}</span>`).join('')}</div>
      <div class="blds">${list}</div>
      <button data-act="title">Back</button>
    </div>`;
  }

  private endView(): string {
    const o = this.run?.over;
    if (!o) return '';
    const head: Record<string, [string, string, string]> = {
      win: ['🏆 Victory!', 'good', 'The Lich falls. The loop is free.'],
      camp: ['🏕️ Safe at camp', 'ok', 'You retreated at the camp and kept everything.'],
      retreat: ['🏃 Retreat', 'warn', 'You left the road early and kept 60%.'],
      death: ['💀 Fallen', 'bad', 'The loop claims another warden. You kept 30%.'],
    };
    const [t, c, d] = head[o.kind];
    return `<div class="end">
      <h1 class="${c}">${t}</h1>
      <p>${d}</p>
      <p class="score">Score <b>${o.score}</b></p>
      <p class="dim">Loop ${o.loop} · Day ${o.day} · ${o.kills} kills</p>
      <p>Brought home: <b>${resLine(o.kept) || 'nothing'}</b></p>
      <div class="menu-btns">
        <button class="primary" data-act="camp">🏕️ Camp</button>
        <button data-act="setup">⚔️ New expedition</button>
        <button data-act="title">Title screen</button>
      </div>
    </div>`;
  }

  private topBar(): string {
    return `<header class="top">
      <div class="tb-info">
        <b>Loop <span id="t-loop"></span></b><span class="dim">Day <span id="t-day"></span></span>
        <div class="bar day" title="Day progress"><i id="t-dayfill"></i></div>
      </div>
      <div class="tb-meter" title="Boss meter: fills when you place tiles. When full, the Lich waits at the camp.">
        🧙 <div class="bar meter"><i id="t-meter"></i></div>
      </div>
      <div class="tb-res" id="t-res"></div>
      <div class="tb-btns">
        <button class="icon-btn" data-act="pause" id="b-pause" title="Pause (Space)">⏸️</button>
        <button class="icon-btn" data-act="speed" id="b-speed" title="Speed (S)">1×</button>
        <button class="icon-btn" data-act="mute" title="Mute (M)">${isMuted() ? '🔇' : '🔊'}</button>
        <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>
      </div>
    </header>`;
  }

  private handView(): string {
    const r = this.run!;
    const cards = r.hand
      .map((id, i) => {
        const t = TILES[id];
        return `<button class="card ${this.selected === i ? 'sel' : ''}" data-act="card" data-i="${i}" style="--c:${t.color}" title="${t.name}: ${t.desc}">
          <span class="ci">${t.icon}</span><span class="cn">${t.name}</span><span class="ck">${i + 1}</span></button>`;
      })
      .join('');
    const empty = Array.from({ length: HAND_MAX - r.hand.length }, () => '<div class="card empty"></div>').join('');
    return cards + empty;
  }

  private hintText(): string {
    const r = this.run!;
    if (this.selected >= 0 && r.hand[this.selected]) {
      const t = TILES[r.hand[this.selected]];
      const n = validCells(r, t.id).length;
      return `<b>${t.icon} ${t.name}</b> — ${t.desc} <span class="dim">${n ? 'Tap a lit cell. Paused while you place.' : 'No free cell for this card.'}</span>`;
    }
    if (this.hover >= 0 && r.tiles[this.hover]) return this.tileInfo(this.hover);
    return '<span class="dim">Pick a card, then tap a lit cell. Keys: 1–8 card, arrows + Enter place, Space pause, S speed, Q potion, E best gear.</span>';
  }

  private tileInfo(cell: number): string {
    const r = this.run!;
    const p = r.tiles[cell]!;
    const t = TILES[p.id];
    let extra = '';
    if (p.id === 'meadow' && isBlooming(r, cell)) extra = ' 🌸 Blooming.';
    if (p.id === 'village' && isRuined(r, cell)) extra = ' 🔥 Ruined: spawns Ghouls.';
    if (p.id === 'mountain') {
      const g = mountainGroups(r).find((x) => x.includes(cell));
      extra = g && g.length >= PEAK_SIZE ? ' 🏔️ Part of a Peak.' : ` Group ${g?.length ?? 1}/${PEAK_SIZE}.`;
    }
    return `<b>${t.icon} ${t.name}</b> — ${t.desc}${extra}`;
  }

  private sideView(): string {
    const r = this.run!;
    const s = heroStats(r);
    const c = CLASSES[r.cls];
    const stats = (['dmg', 'def', 'spd', 'crit', 'vamp', 'eva'] as (keyof Stats)[])
      .map((k) => `<div><span class="dim">${STAT_LABEL[k]}</span> <b>${k === 'spd' ? s.spd.toFixed(2) : fmtStat(k, s[k])}</b></div>`)
      .join('');
    const gear = SLOTS.map((sl) => this.itemBtn(r.gear[sl], sl, true)).join('');
    const inv = r.inv.map((it) => this.itemBtn(it, it.slot, false)).join('');
    return `<div class="hero-card">
      <div class="hero-head"><span class="big">${c.hero}</span><div><b>${c.name}</b><div class="hp"><div class="hp-fill" id="s-hpfill"></div><span id="s-hp"></span></div></div></div>
      <div class="stats">${stats}</div>
      <div class="row">
        <button data-act="potion" id="b-potion" title="Drink a potion: heal 40% (Q)">🧪 <span id="s-pot">${r.potions}/${r.maxPotions}</span></button>
        <button data-act="auto" title="Equip the best items (E)">✨ Best gear</button>
      </div>
    </div>
    <h4>Gear</h4>
    <div class="gear">${gear}</div>
    <h4>Bag <span class="dim">${r.inv.length}/10 · tap to equip or scrap</span></h4>
    <div class="inv">${inv || '<p class="dim small">Kills drop items.</p>'}</div>`;
  }

  private itemBtn(it: Item | null, slot: Slot, worn: boolean): string {
    if (!it) return `<div class="item empty"><span>${SLOT_ICON[slot]}</span><small class="dim">empty</small></div>`;
    const rr = RARITY[it.rarity];
    let delta = '';
    if (!worn) {
      const d = itemPower(it) - itemPower(this.run!.gear[it.slot]);
      delta = d > 0.5 ? '<i class="up">▲</i>' : d < -0.5 ? '<i class="down">▼</i>' : '';
    }
    return `<button class="item" data-act="item" data-uid="${it.uid}" style="--r:${rr.color}" title="${it.name} (${rr.name}, lvl ${it.level}): ${statLine(it.stats)}">
      <span>${SLOT_ICON[it.slot]}</span><small>${statLine(it.stats).split(' · ')[0]}</small>${delta}</button>`;
  }

  private modalView(): string {
    const m = this.modal!;
    const r = this.run;
    let inner = '';
    if (m.kind === 'help') {
      inner = `<h2>How to play</h2>
        <ul>
          <li><b>The hero walks alone.</b> It walks the loop road and fights every enemy it meets. You do not steer it.</li>
          <li><b>You build the world.</b> Pick a card from your hand and tap a lit cell. Road cards spawn enemies. Side cards give HP, attack speed or healing.</li>
          <li><b>Each day</b> you draw a card and tiles spawn enemies. Kills drop items, cards and ⚙️ metal.</li>
          <li><b>Combos:</b> mountains next to mountains give more HP, 9 linked mountains make a Peak. A meadow next to another tile blooms. A forest with 2 forest neighbors is a Thicket. A Vampire Mansion ruins a Village next to it.</li>
          <li><b>Gear:</b> tap an item in the bag to equip or scrap it. ▲ means better than what you wear. You can change gear during fights.</li>
          <li><b>Loops get harder.</b> Enemies spawned later are stronger. The camp heals you each loop and gives back a potion.</li>
          <li><b>Boss meter 🧙:</b> placing tiles fills it. When it is full, the Lich waits at the camp. Beat it to win.</li>
          <li><b>Retreat</b> at the camp to keep all resources. Retreat on the road keeps 60%. Death keeps 30%.</li>
          <li><b>Camp:</b> spend resources on buildings that unlock cards, classes and bonuses.</li>
          <li><b>Keys:</b> 1–8 pick a card, arrows move the cursor, Enter places, Esc cancels, Space pause, S speed, Q potion, E best gear, M mute.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>`;
    } else if (m.kind === 'menu') {
      inner = `<h2>Menu</h2>
        <button data-act="modal-close">▶ Resume</button>
        <button data-act="help">❓ How to play</button>
        ${
          m.confirm === 'retreat'
            ? `<p class="warn">Leave now and keep 60%: ${resLine(this.keptPreview('retreat')) || 'nothing'}</p><button class="danger" data-act="retreat-yes">Yes, retreat</button>`
            : `<button data-act="retreat">🏃 Retreat now (keep 60%)</button>`
        }
        ${
          m.confirm === 'abandon'
            ? `<p class="warn">Abandon counts as death. You keep 30%.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>`
            : `<button data-act="abandon">💀 Abandon run</button>`
        }
        <button data-act="title">Title screen (keeps the run)</button>`;
    } else if (m.kind === 'camp' && r) {
      const near = r.meter >= METER_MAX * 0.75;
      inner = `<h2>🏕️ Camp — loop ${r.loop - 1} done</h2>
        <p>The camp healed you. You have <b>${Math.round(r.hp)}/${heroStats(r).maxHp}</b> HP and ${r.potions} potions.</p>
        <p>Carried: <b>${resLine(r.res) || 'nothing yet'}</b></p>
        ${near ? `<p class="warn">The boss meter is at ${Math.round((r.meter / METER_MAX) * 100)}%. When it is full, the Lich waits here.</p>` : ''}
        <div class="row">
          <button class="primary" data-act="camp-go">Walk on ▶ <small>(Enter)</small></button>
          <button data-act="camp-retreat">🏕️ Retreat, keep 100% <small>(R)</small></button>
        </div>`;
    } else if (m.kind === 'item' && r) {
      const it = r.inv.find((x) => x.uid === m.uid) ?? SLOTS.map((s) => r.gear[s]).find((x) => x?.uid === m.uid);
      if (!it) return '';
      const worn = r.gear[it.slot]?.uid === it.uid;
      const cur = r.gear[it.slot];
      const rr = RARITY[it.rarity];
      inner = `<h2 style="color:${rr.color}">${SLOT_ICON[it.slot]} ${it.name}</h2>
        <p class="dim">${rr.name} · level ${it.level}</p>
        <p><b>${statLine(it.stats)}</b></p>
        ${!worn && cur ? `<p class="dim">Worn: ${cur.name} — ${statLine(cur.stats)}</p>` : ''}
        <div class="row">
          ${worn ? '' : '<button class="primary" data-act="equip">Equip</button>'}
          ${worn ? '' : `<button data-act="scrap">Scrap (+${1 + it.rarity} ⚙️)</button>`}
          <button data-act="modal-close">Close</button>
        </div>`;
    }
    return `<div class="modal" data-act="modal-bg"><div class="sheet">${inner}</div></div>`;
  }

  private keptPreview(kind: 'retreat' | 'camp'): Res {
    const r = this.run!;
    const out = { ...r.res };
    for (const k of RES_KEYS) out[k] = Math.floor(r.res[k] * KEEP[kind]);
    return out;
  }

  /** Cheap per-frame DOM updates, plus full side/hand redraws when their content changed. */
  private updateDom(): void {
    const r = this.run;
    if (!r || this.screen !== 'play') return;
    const $ = (id: string) => this.root.querySelector<HTMLElement>(`#${id}`);
    const s = heroStats(r);
    const hk = `${r.hand.join()}|${this.selected}`;
    if (hk !== this.handKey) {
      this.handKey = hk;
      const h = $('hand');
      if (h) h.innerHTML = this.handView();
    }
    const sk = `${r.inv.map((i) => i.uid).join()}|${SLOTS.map((x) => r.gear[x]?.uid).join()}|${r.placed}|${r.tiles.filter(Boolean).length}|${r.maxPotions}`;
    if (sk !== this.sideKey) {
      this.sideKey = sk;
      const side = $('side');
      if (side) side.innerHTML = this.sideView();
    }
    const set = (id: string, v: string) => {
      const el = $(id);
      if (el && el.textContent !== v) el.textContent = v;
    };
    set('t-loop', String(r.loop));
    set('t-day', String(r.day));
    const df = $('t-dayfill');
    if (df) df.style.width = `${(r.dayT / DAY) * 100}%`;
    const mf = $('t-meter');
    if (mf) {
      mf.style.width = `${(r.meter / METER_MAX) * 100}%`;
      mf.parentElement!.classList.toggle('full', r.meter >= METER_MAX);
    }
    const res = $('t-res');
    const rl = RES_KEYS.map((k) => `${RES_ICON[k]}${r.res[k]}`).join(' ');
    if (res && res.textContent !== rl) res.textContent = rl;
    const hp = $('s-hpfill');
    if (hp) {
      hp.style.width = `${Math.max(0, (r.hp / s.maxHp) * 100)}%`;
      hp.classList.toggle('low', r.hp < s.maxHp * 0.3);
    }
    set('s-hp', `${Math.ceil(r.hp)} / ${s.maxHp}`);
    set('s-pot', `${r.potions}/${r.maxPotions}`);
    const pb = $('b-pause');
    if (pb) {
      const v = this.paused ? '▶️' : '⏸️';
      if (pb.textContent !== v) pb.textContent = v;
      pb.classList.toggle('on', this.paused);
    }
    set('b-speed', `${SPEEDS[this.speed]}×`);
    const hint = $('hint');
    const ht = this.hintText();
    if (hint && hint.innerHTML !== ht) hint.innerHTML = ht;
  }

  // ---------- Flow ----------

  private go(screen: Screen): void {
    this.screen = screen;
    this.modal = null;
    this.render();
  }

  private startRun(): void {
    const input = this.root.querySelector<HTMLInputElement>('#seed');
    const seed = (input?.value.trim() || randomSeedText()).toUpperCase();
    this.run = newRun(seed, this.cls, this.meta);
    this.seed = randomSeedText();
    this.selected = -1;
    this.cursor = -1;
    this.paused = false;
    this.floats = [];
    this.endDelay = 0;
    saveRun(this.run);
    this.go('play');
    this.toast(`${CLASSES[this.cls].hero} The expedition begins. Place tiles around the loop!`);
  }

  private finish(): void {
    const r = this.run!;
    bankRun(this.meta, r);
    saveMeta(this.meta);
    saveRun(null);
    if (r.over!.kind === 'win') sfx.win();
    else if (r.over!.kind === 'death') sfx.lose();
    else sfx.camp();
    this.go('end');
  }

  private selectCard(i: number): void {
    const r = this.run!;
    if (i < 0 || i >= r.hand.length || this.selected === i) {
      this.selected = -1;
    } else {
      this.selected = i;
      const cells = validCells(r, r.hand[i]);
      if (!cells.includes(this.cursor)) this.cursor = cells[0] ?? -1;
      sfx.click();
    }
    this.updateDom();
  }

  private tryPlace(cell: number): void {
    const r = this.run!;
    if (this.selected < 0) return;
    const card = r.hand[this.selected];
    if (r.battle) {
      this.toast('Wait until the fight ends to place tiles.');
      sfx.deny();
      return;
    }
    if (!canPlace(r, card, cell)) {
      sfx.deny();
      return;
    }
    const meterBefore = r.meter;
    place(r, this.selected, cell);
    this.pops.set(cell, 0);
    sfx.place();
    if (card === 'oblivion') this.addFloat(cx(cell) * CELL + CELL / 2, cy(cell) * CELL + 10, 'gone', '#c77dff', 14);
    else if (r.meter > meterBefore) this.addFloat(cx(cell) * CELL + CELL / 2, cy(cell) * CELL + 8, `🧙+${r.meter - meterBefore}`, '#ff8fa3', 12);
    if (meterBefore < METER_MAX && r.meter >= METER_MAX) this.toast('🧙 The boss meter is full! The Lich waits at the camp.');
    this.selected = -1;
    saveRun(r);
    this.updateDom();
  }

  private usePotion(): void {
    const r = this.run;
    if (!r) return;
    const h = drinkPotion(r);
    if (h > 0) {
      sfx.potion();
      this.heroFloat(`+${h}`, '#7ee08a');
    } else sfx.deny();
    this.updateDom();
  }

  private campChoice(go: boolean): void {
    const r = this.run!;
    this.modal = null;
    if (go) {
      campContinue(r);
      saveRun(r);
      this.renderModal();
    } else {
      endRun(r, 'camp');
      this.finish();
    }
  }

  // ---------- Input ----------

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const act = el.dataset.act!;
    if (act === 'modal-bg' && e.target !== el) return;
    const r = this.run;
    switch (act) {
      case 'continue':
        if (this.run) {
          this.paused = false;
          this.go('play');
          if (this.run.camp) {
            this.modal = { kind: 'camp' };
            this.renderModal();
          }
        }
        break;
      case 'setup':
        this.go('setup');
        break;
      case 'camp':
        this.go('camp');
        break;
      case 'title':
        saveRun(this.run);
        this.go('title');
        break;
      case 'help':
        this.modal = { kind: 'help' };
        this.renderModal();
        break;
      case 'cls':
        this.cls = el.dataset.id!;
        this.seed = this.root.querySelector<HTMLInputElement>('#seed')?.value ?? this.seed;
        sfx.click();
        this.render();
        break;
      case 'start':
        this.startRun();
        break;
      case 'build': {
        const b = BUILDINGS.find((x) => x.id === el.dataset.id)!;
        if (!canBuild(this.meta, b.cost) || this.meta.built.includes(b.id)) return;
        for (const k of RES_KEYS) this.meta.res[k] -= b.cost[k] ?? 0;
        this.meta.built.push(b.id);
        saveMeta(this.meta);
        sfx.build();
        this.toast(`${b.icon} ${b.name} built!`);
        this.render();
        break;
      }
      case 'mute': {
        setMuted(!isMuted());
        try {
          localStorage.setItem(MUTE_KEY, isMuted() ? '1' : '0');
        } catch {
          /* ignore */
        }
        el.textContent = isMuted() ? '🔇' : '🔊';
        break;
      }
      case 'menu':
        this.modal = { kind: 'menu', confirm: '' };
        this.renderModal();
        break;
      case 'modal-bg':
        if (this.modal?.kind === 'camp') return;
        this.modal = null;
        this.renderModal();
        break;
      case 'modal-close':
        this.modal = null;
        this.renderModal();
        break;
      case 'retreat':
        this.modal = { kind: 'menu', confirm: 'retreat' };
        this.renderModal();
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: 'abandon' };
        this.renderModal();
        break;
      case 'retreat-yes':
        if (r && !r.over) {
          endRun(r, 'retreat');
          this.finish();
        }
        break;
      case 'abandon-yes':
        if (r && !r.over) {
          endRun(r, 'death');
          this.finish();
        }
        break;
      case 'camp-go':
        this.campChoice(true);
        break;
      case 'camp-retreat':
        this.campChoice(false);
        break;
      case 'pause':
        this.paused = !this.paused;
        this.updateDom();
        break;
      case 'speed':
        this.speed = (this.speed + 1) % SPEEDS.length;
        this.updateDom();
        break;
      case 'card':
        this.selectCard(+el.dataset.i!);
        break;
      case 'potion':
        this.usePotion();
        break;
      case 'auto':
        if (r && autoEquip(r)) sfx.equip();
        this.updateDom();
        break;
      case 'item':
        this.modal = { kind: 'item', uid: +el.dataset.uid! };
        this.renderModal();
        break;
      case 'equip':
        if (r && this.modal?.kind === 'item') {
          equip(r, this.modal.uid);
          sfx.equip();
        }
        this.modal = null;
        this.renderModal();
        this.updateDom();
        break;
      case 'scrap':
        if (r && this.modal?.kind === 'item') {
          const n = scrap(r, this.modal.uid);
          if (n) {
            sfx.coin();
            this.toast(`Scrapped for +${n} ⚙️`);
          }
        }
        this.modal = null;
        this.renderModal();
        this.updateDom();
        break;
    }
  }

  private cellFromEvent(e: PointerEvent): number {
    const cv = this.canvas!;
    const rect = cv.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * LW;
    const y = ((e.clientY - rect.top) / rect.height) * LH;
    return cellAt(Math.floor(x / CELL), Math.floor(y / CELL));
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if (!this.canvas || e.target !== this.canvas || !this.run) return;
    const cell = this.cellFromEvent(e);
    if (cell < 0) return;
    this.cursor = cell;
    if (this.selected >= 0) this.tryPlace(cell);
    else {
      this.hover = cell;
      if (this.run.tiles[cell]) sfx.click();
      this.updateDom();
    }
  }

  private onMove(e: PointerEvent): void {
    if (!this.canvas || e.target !== this.canvas || e.pointerType !== 'mouse') return;
    this.hover = this.cellFromEvent(e);
  }

  private onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).tagName === 'INPUT') {
      if (e.key === 'Enter' && this.screen === 'setup') this.startRun();
      return;
    }
    initAudio();
    const k = e.key;
    if (k === 'm' || k === 'M') {
      this.root.querySelector<HTMLElement>('[data-act="mute"]')?.click();
      return;
    }
    if (this.modal) {
      if (this.modal.kind === 'camp') {
        if (k === 'Enter' || k === ' ') this.campChoice(true);
        else if (k === 'r' || k === 'R') this.campChoice(false);
        e.preventDefault();
        return;
      }
      if (k === 'Escape' || k === 'Enter') {
        this.modal = null;
        this.renderModal();
      }
      return;
    }
    if (this.screen === 'title') {
      if (k === 'Enter') this.root.querySelector<HTMLElement>('button.primary')?.click();
      return;
    }
    if (this.screen === 'setup' && k === 'Enter') return this.startRun();
    if (this.screen !== 'play' || !this.run) return;
    const r = this.run;
    if (/^[1-8]$/.test(k)) return this.selectCard(+k - 1);
    switch (k) {
      case ' ':
        e.preventDefault();
        this.paused = !this.paused;
        break;
      case 's':
      case 'S':
        this.speed = (this.speed + 1) % SPEEDS.length;
        break;
      case 'q':
      case 'Q':
        this.usePotion();
        break;
      case 'e':
      case 'E':
        if (autoEquip(r)) sfx.equip();
        break;
      case 'Escape':
        if (this.selected >= 0) this.selected = -1;
        else {
          this.modal = { kind: 'menu', confirm: '' };
          this.renderModal();
        }
        break;
      case 'Enter':
        if (this.selected >= 0 && this.cursor >= 0) this.tryPlace(this.cursor);
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault();
        const c = this.cursor < 0 ? cellAt(6, 4) : this.cursor;
        const dx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
        const dy = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
        const n = cellAt(Math.max(0, Math.min(W - 1, cx(c) + dx)), Math.max(0, Math.min(H - 1, cy(c) + dy)));
        this.cursor = n;
        this.hover = n;
        break;
      }
    }
    this.updateDom();
  }

  // ---------- Game loop ----------

  private get halted(): boolean {
    const r = this.run;
    return !r || this.paused || this.selected >= 0 || !!this.modal || r.camp || !!r.over;
  }

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const frame = (t: number) => {
      if (this.screen !== 'play' || !this.ctx) {
        this.raf = 0;
        return;
      }
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private update(dt: number): void {
    const r = this.run!;
    if (r.over) {
      this.endDelay += dt;
      if (this.endDelay > 1.2) this.finish();
    } else if (!this.halted) {
      const g = dt * SPEEDS[this.speed];
      this.handle(tick(r, g));
      this.saveT += g;
      if (this.saveT > 3) {
        this.saveT = 0;
        saveRun(r);
      }
    }
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1.1);
    for (const [c, v] of this.pops) v + dt > 0.4 ? this.pops.delete(c) : this.pops.set(c, v + dt);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.heroFlash = Math.max(0, this.heroFlash - dt);
    for (const [u, v] of this.foeFlash) v - dt <= 0 ? this.foeFlash.delete(u) : this.foeFlash.set(u, v - dt);
    this.updateDom();
  }

  /** Turns engine events into sounds, floats and toasts. */
  private handle(evs: Ev[]): void {
    const r = this.run!;
    let soundBudget = 4;
    const play = (f: () => void) => {
      if (soundBudget-- > 0 && !FAST) f();
    };
    for (const e of evs) {
      switch (e.t) {
        case 'hit':
          if (e.who === 'foe') {
            this.foeFlash.set(e.uid, 0.15);
            const p = this.foePos(e.uid);
            if (p) this.addFloat(p.x, p.y - 18, `${e.dmg}${e.crit ? '!' : ''}`, e.crit ? '#ffd166' : '#fff', e.crit ? 18 : 14);
            play(e.crit ? sfx.crit : sfx.hit);
          } else {
            this.heroFlash = 0.15;
            this.shake = Math.min(8, this.shake + e.dmg / 3);
            this.heroFloat(`-${e.dmg}`, '#ef476f');
            play(sfx.hurt);
          }
          break;
        case 'miss': {
          const p = e.who === 'foe' ? this.foePos(e.uid) : this.heroBattlePos();
          if (p) this.addFloat(p.x, p.y - 18, 'miss', '#a0a0b0', 11);
          play(sfx.miss);
          break;
        }
        case 'kill':
          play(sfx.kill);
          break;
        case 'battle':
          if (e.boss) {
            play(sfx.boss);
            this.toast('🧙 The Lich rises at the camp!');
          } else play(sfx.battle);
          break;
        case 'won': {
          const bits = [e.items ? `🎒+${e.items}` : '', e.cards ? `🃏+${e.cards}` : '', e.metal ? `⚙️+${e.metal}` : ''].filter(Boolean).join(' ');
          if (bits) this.heroFloat(bits, '#ffd166');
          play(sfx.coin);
          break;
        }
        case 'day':
          play(sfx.day);
          break;
        case 'heal':
          this.addFloat(cx(e.cell) * CELL + CELL / 2, cy(e.cell) * CELL + 10, `+${e.n}❤`, '#7ee08a', 13);
          play(sfx.heal);
          break;
        case 'res':
          this.addFloat(cx(e.cell) * CELL + CELL / 2, cy(e.cell) * CELL + 14, `+${e.n}${RES_ICON[e.res]}`, '#ffd166', 12);
          break;
        case 'spawn': {
          const c = r.path[e.at];
          this.addFloat(cx(c) * CELL + CELL / 2, cy(c) * CELL + 20, ENEMIES[e.id].icon, '#fff', 16);
          break;
        }
        case 'camp':
          play(sfx.camp);
          if (!FAST) {
            this.modal = { kind: 'camp' };
            this.renderModal();
          }
          saveRun(r);
          break;
        case 'boss-ready':
          this.toast('🧙 The boss meter is full! The Lich waits at the camp.');
          play(sfx.boss);
          break;
        case 'summon':
          this.heroFloat('💀 summoned', '#c77dff');
          break;
        case 'card':
          play(sfx.card);
          break;
        case 'scrap':
          break;
        case 'end':
          saveRun(null);
          break;
      }
    }
  }

  private addFloat(x: number, y: number, text: string, color: string, size: number): void {
    if (this.floats.length > 60) this.floats.shift();
    this.floats.push({ x, y, text, color, t: 0, size });
  }

  private heroFloat(text: string, color: string): void {
    const p = this.run?.battle ? this.heroBattlePos() : this.heroMapPos();
    this.addFloat(p.x, p.y - 20, text, color, 14);
  }

  private heroMapPos(): { x: number; y: number } {
    const r = this.run!;
    const L = r.path.length;
    const i = Math.floor(r.pos) % L;
    const f = r.pos - Math.floor(r.pos);
    const a = r.path[i];
    const b = r.path[(i + 1) % L];
    const x = (cx(a) + (cx(b) - cx(a)) * f) * CELL + CELL / 2;
    const y = (cy(a) + (cy(b) - cy(a)) * f) * CELL + CELL / 2;
    return { x, y };
  }

  private panel(): { x: number; y: number; w: number; h: number } {
    return { x: LW * 0.1, y: LH * 0.16, w: LW * 0.8, h: LH * 0.68 };
  }

  private heroBattlePos(): { x: number; y: number } {
    const p = this.panel();
    return { x: p.x + p.w * 0.2, y: p.y + p.h * 0.55 };
  }

  private foeSlot(i: number, n: number): { x: number; y: number } {
    const p = this.panel();
    const cols = n > 3 ? 2 : 1;
    const rows = Math.ceil(n / cols);
    const col = cols === 2 ? Math.floor(i / rows) : 0;
    const row = i % rows;
    const x = p.x + p.w * (cols === 2 ? 0.6 + col * 0.22 : 0.7);
    const y = p.y + p.h * (0.2 + ((row + 0.5) / rows) * 0.72);
    return { x, y };
  }

  private foePos(uid: number): { x: number; y: number } | null {
    const b = this.run?.battle;
    if (!b) return null;
    const i = b.foes.findIndex((f) => f.uid === uid);
    if (i < 0) return this.foeSlot(0, 1);
    return this.foeSlot(i, b.foes.length);
  }

  // ---------- Canvas ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const maxW = wrap.clientWidth;
    const wide = window.innerWidth > 900;
    const maxH = window.innerHeight - (wide ? 190 : 230);
    const w = Math.max(200, Math.min(maxW, wide ? (maxH * LW) / LH : maxW, 820));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${w}px`;
    cv.style.height = `${(w * LH) / LW}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(((w * LH) / LW) * dpr);
    this.scale = (w / LW) * dpr;
    this.textK = Math.max(1, Math.min(1.6, 0.8 / (w / LW)));
  }

  private draw(): void {
    const ctx = this.ctx!;
    const r = this.run!;
    const cv = this.canvas!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.setTransform(this.scale, 0, 0, this.scale, sx * this.scale, sy * this.scale);
    const now = performance.now() / 1000;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Ground
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#1b2a1c' : '#1f301f';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    // Road
    const ri = new Map(r.path.map((c, i) => [c, i]));
    for (const c of r.path) {
      ctx.fillStyle = '#5c4630';
      ctx.fillRect(cx(c) * CELL + 2, cy(c) * CELL + 2, CELL - 4, CELL - 4);
      ctx.fillStyle = '#6f573c';
      ctx.fillRect(cx(c) * CELL + 8, cy(c) * CELL + 8, CELL - 16, CELL - 16);
    }
    // Camp
    const camp = r.path[0];
    if (r.meter >= METER_MAX) {
      ctx.fillStyle = `rgba(239,71,111,${0.35 + 0.25 * Math.sin(now * 5)})`;
      ctx.fillRect(cx(camp) * CELL, cy(camp) * CELL, CELL, CELL);
    }
    ctx.font = `${CELL * 0.62}px serif`;
    ctx.fillText(r.meter >= METER_MAX ? '🧙' : '🏕️', cx(camp) * CELL + CELL / 2, cy(camp) * CELL + CELL / 2 + 2);

    // Placement highlights
    const sel = this.selected >= 0 ? r.hand[this.selected] : null;
    const valid = sel ? new Set(validCells(r, sel)) : null;
    if (valid) {
      ctx.fillStyle = 'rgba(144,190,109,0.22)';
      ctx.strokeStyle = 'rgba(144,190,109,0.75)';
      ctx.lineWidth = 1.5;
      for (const c of valid) {
        ctx.fillRect(cx(c) * CELL + 3, cy(c) * CELL + 3, CELL - 6, CELL - 6);
        ctx.strokeRect(cx(c) * CELL + 3, cy(c) * CELL + 3, CELL - 6, CELL - 6);
      }
    }

    // Tiles
    const peakCells = new Set(mountainGroups(r).filter((g) => g.length >= PEAK_SIZE).flat());
    r.tiles.forEach((t, c) => {
      if (!t) return;
      const def = TILES[t.id];
      const x = cx(c) * CELL;
      const y = cy(c) * CELL;
      const pop = this.pops.get(c);
      const k = pop !== undefined ? 1 + 0.35 * Math.sin((pop / 0.4) * Math.PI) : 1;
      if (!ri.has(c)) {
        ctx.fillStyle = def.color;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
        ctx.globalAlpha = 1;
      }
      if (peakCells.has(c)) {
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
      }
      ctx.font = `${CELL * 0.55 * k}px serif`;
      ctx.fillText(peakCells.has(c) ? '🏔️' : def.icon, x + CELL / 2, y + CELL / 2 + 2);
      ctx.font = `${CELL * 0.3}px serif`;
      if (t.id === 'meadow' && isBlooming(r, c)) ctx.fillText('🌸', x + CELL - 10, y + 10);
      if (t.id === 'village' && isRuined(r, c)) ctx.fillText('🔥', x + CELL - 10, y + 10);
    });

    // Enemies on the road
    const byCell = new Map<number, string[]>();
    for (const e of r.enemies) {
      const c = r.path[e.at];
      const l = byCell.get(c) ?? [];
      l.push(ENEMIES[e.id].icon);
      byCell.set(c, l);
    }
    ctx.font = `${CELL * 0.34}px serif`;
    const offs = [
      [0.28, 0.3],
      [0.72, 0.3],
      [0.28, 0.72],
      [0.72, 0.72],
    ];
    for (const [c, l] of byCell)
      l.slice(0, 4).forEach((icon, i) => {
        const bob = Math.sin(now * 3 + c + i) * 1.5;
        ctx.fillText(icon, cx(c) * CELL + offs[i][0] * CELL, cy(c) * CELL + offs[i][1] * CELL + bob);
      });

    // Hero
    const hp = this.heroMapPos();
    const s = heroStats(r);
    const walking = !r.battle && !this.halted;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(hp.x, hp.y + 14, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${CELL * 0.62}px serif`;
    ctx.fillText(CLASSES[r.cls].hero, hp.x, hp.y - (walking ? Math.abs(Math.sin(now * 8)) * 3 : 0));
    this.bar(ctx, hp.x - 18, hp.y - 26, 36, 4, r.hp / s.maxHp, '#7ee08a');

    // Cursor
    const cur = this.selected >= 0 ? this.cursor : this.hover;
    if (cur >= 0) {
      ctx.strokeStyle = sel ? (valid!.has(cur) ? '#fff' : '#ef476f') : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx(cur) * CELL + 1, cy(cur) * CELL + 1, CELL - 2, CELL - 2);
      if (sel && valid!.has(cur)) {
        ctx.globalAlpha = 0.6;
        ctx.font = `${CELL * 0.55}px serif`;
        ctx.fillText(TILES[sel].icon, cx(cur) * CELL + CELL / 2, cy(cur) * CELL + CELL / 2 + 2);
        ctx.globalAlpha = 1;
      }
    }

    if (r.battle) this.drawBattle(ctx, now);

    // Floats
    for (const f of this.floats) {
      const a = 1 - f.t / 1.1;
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `bold ${Math.round(f.size * this.textK)}px system-ui, sans-serif`;
      ctx.fillStyle = '#000';
      ctx.fillText(f.text, f.x + 1, f.y - f.t * 26 + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 26);
    }
    ctx.globalAlpha = 1;

    if (this.halted && !r.over && (this.paused || this.selected >= 0) && !this.modal) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(LW / 2 - 70, 6, 140, 24);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(this.selected >= 0 ? 'PLACING — paused' : 'PAUSED', LW / 2, 18);
    }
  }

  private bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, color: string): void {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, v)), h);
  }

  private drawBattle(ctx: CanvasRenderingContext2D, now: number): void {
    const r = this.run!;
    const b = r.battle!;
    const p = this.panel();
    ctx.fillStyle = b.boss ? 'rgba(40,8,20,0.95)' : 'rgba(12,16,12,0.94)';
    ctx.strokeStyle = b.boss ? '#ef476f' : '#90be6d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.w, p.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = b.boss ? '#ff8fa3' : '#cfe8b8';
    ctx.font = `bold ${Math.round(15 * this.textK)}px system-ui, sans-serif`;
    ctx.fillText(b.boss ? '🧙 BOSS FIGHT' : '⚔️ FIGHT', p.x + p.w / 2, p.y + 16);
    const s = heroStats(r);
    const h = this.heroBattlePos();
    const lunge = Math.max(0, 1 - b.heroCd * s.spd) > 0.92 ? 8 : 0;
    ctx.font = `${CELL * 1.2}px serif`;
    if (this.heroFlash > 0) ctx.globalAlpha = 0.5;
    ctx.fillText(CLASSES[r.cls].hero, h.x + lunge, h.y);
    ctx.globalAlpha = 1;
    this.bar(ctx, h.x - 40, h.y + 38, 80, 8, r.hp / s.maxHp, r.hp < s.maxHp * 0.3 ? '#ef476f' : '#7ee08a');
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(11 * this.textK)}px system-ui, sans-serif`;
    ctx.fillText(`${Math.ceil(r.hp)}/${s.maxHp}`, h.x, h.y + 54);
    this.bar(ctx, h.x - 40, h.y + 62, 80, 3, 1 - b.heroCd * s.spd, '#ffd166');
    b.foes.forEach((f, i) => {
      const q = this.foeSlot(i, b.foes.length);
      const d = ENEMIES[f.id];
      const big = d.boss ? 1.5 : 0.8;
      const wob = Math.sin(now * 4 + i) * 2;
      if (this.foeFlash.has(f.uid)) ctx.globalAlpha = 0.45;
      ctx.font = `${CELL * big}px serif`;
      ctx.fillText(d.icon, q.x, q.y + wob);
      ctx.globalAlpha = 1;
      const bw = d.boss ? 90 : 48;
      const off = d.boss ? 42 : 24;
      this.bar(ctx, q.x - bw / 2, q.y + off, bw, 5, f.hp / f.max, '#ef476f');
      this.bar(ctx, q.x - bw / 2, q.y + off + 7, bw, 2, 1 - f.cd * f.spd, '#ffd166');
    });
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => {
        const r = this.run;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          loop: r?.loop,
          day: r?.day,
          hp: r ? Math.ceil(r.hp) : null,
          maxHp: r ? heroStats(r).maxHp : null,
          meter: r?.meter,
          battle: r?.battle ? r.battle.foes.map((f) => `${f.id} ${f.hp}/${f.max}`) : null,
          hand: r?.hand,
          enemies: r?.enemies.length,
          res: r?.res,
          over: r?.over ?? null,
          meta: this.meta,
        };
      },
      /** One bot action: start a run, or play about 3 seconds of game time with the smart bot. */
      step: () => {
        const click = (sel: string): boolean => {
          const el = this.root.querySelector<HTMLElement>(sel);
          el?.click();
          return !!el;
        };
        if (this.modal && this.modal.kind !== 'camp') {
          this.modal = null;
          this.renderModal();
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            if (!click('[data-act="continue"]')) click('[data-act="setup"]');
            return 'title';
          case 'setup':
            click('[data-act="start"]');
            return 'setup';
          case 'camp':
            click('[data-act="title"]');
            return 'camp';
          case 'end':
            return 'end';
          case 'play': {
            const r = this.run!;
            if (r.over) {
              if (FAST) this.finish();
              return 'busy';
            }
            this.selected = -1;
            if (this.modal?.kind === 'camp' || r.camp) {
              this.campChoice(true);
              return 'camp';
            }
            for (let i = 0; i < 6 && !r.over && !r.camp; i++) {
              botAct(r, 'smart', this.botRng);
              this.handle(tick(r, 0.5));
            }
            if (r.over && FAST) this.finish();
            else this.updateDom();
            return 'play';
          }
        }
      },
      res: (n: number) => {
        for (const k of RES_KEYS) this.meta.res[k] += n;
        saveMeta(this.meta);
        this.render();
      },
      meter: () => {
        if (this.run) this.run.meter = METER_MAX;
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
