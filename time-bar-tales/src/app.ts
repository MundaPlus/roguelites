import { CLASSES, ELEM_ICON, ENEMIES, EVENTS, GEAR, ITEMS, ROOMS, SKILLS, SLOT_NAME, STATUS, STAT_KEYS, STAT_NAME, TOP_FLOOR, UNLOCKS, gearText, zoneOf, type ActionDef, type Slot, type StatusId } from './data';
import {
  ATB_MAX,
  advance,
  alive,
  command,
  enemies,
  estimate,
  heroes,
  newBattle,
  singleTarget,
  targetsFor,
  tick,
  unit,
  type BEvent,
  type Battle,
  type Command,
  type Unit,
} from './battle';
import { autoEquip, autoLearn, chooseDoor, eventBot, gearScore, innBot, shopBot, smartCommand } from './bot';
import { heroStats, learn, learnBlock, xpNeeded } from './party';
import { randomSeedText } from './rng';
import {
  MAX_PARTY,
  battleSeed,
  buy,
  clearRun,
  crystalsFor,
  enterRoom,
  equip,
  eventDef,
  loadMeta,
  loadRun,
  newRun,
  nextFloor,
  optionOk,
  partySize,
  randomGear,
  recruit,
  recruitCost,
  recruitLevel,
  rest,
  restCost,
  rngFor,
  runEvent,
  saveMeta,
  saveRun,
  score,
  unequip,
  unlockCost,
  unlockedClasses,
  winBattle,
  type Rewards,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'setup' | 'map' | 'battle' | 'reward' | 'shop' | 'inn' | 'event' | 'treasure' | 'party' | 'end';

type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'gear'; hero: number; slot: Slot };

interface Menu {
  uid: number;
  level: 'root' | 'skill' | 'item' | 'target';
  cur: number;
  /** The chosen action while picking a target. */
  pick?: { kind: 'attack' | 'skill' | 'item'; id: string; from: 'root' | 'skill' | 'item'; fromCur: number };
  tcur: number;
}

interface UnitEls {
  box: HTMLElement;
  sprite: HTMLElement;
  hp: HTMLElement[];
  atb: HTMLElement[];
  hpText?: HTMLElement;
  mpText?: HTMLElement;
  mp?: HTMLElement;
  sts: HTMLElement[];
  row?: HTMLElement;
}

const PARAMS = new URLSearchParams(location.search);
const FAST = PARAMS.has('fast');
const ROOT_CMDS = [
  { id: 'attack', name: 'Attack', icon: '⚔️' },
  { id: 'skill', name: 'Skill', icon: '✨' },
  { id: 'item', name: 'Item', icon: '🎒' },
  { id: 'defend', name: 'Defend', icon: '🛡️' },
] as const;
const SPEEDS = [1, 1.5, 2];

const pct = (a: number, b: number): number => Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100));

function bar(cls: string, v: number, max: number, text = ''): string {
  return `<div class="bar ${cls}"><i style="width:${pct(v, max)}%"></i>${text ? `<span>${text}</span>` : ''}</div>`;
}

const stsIcons = (st: Partial<Record<StatusId, number>>, guard = false): string =>
  (Object.keys(st) as StatusId[]).map((s) => `<span title="${STATUS[s].name}">${STATUS[s].icon}</span>`).join('') + (guard ? '<span title="Defending">🛡️</span>' : '');

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private setupPick: string[] = [];

  // Battle
  private b: Battle | null = null;
  private menu: Menu | null = null;
  private queue: BEvent[][] = [];
  private busyUntil = 0;
  private dispHp = new Map<number, number>();
  private els = new Map<number, UnitEls>();
  private raf = 0;
  private last = 0;
  private endAt = 0;
  private readySeen = new Set<number>();
  private lastMsg = '';

  // Other screens
  private rewards: Rewards | null = null;
  private eventResult: string | null = null;
  private partyBack: Screen = 'map';
  private end: { victory: boolean; score: number; crystals: number; floor: number } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Helpers ----------

  private get speed(): number {
    return this.meta.speed || 1;
  }

  private save(): void {
    if (this.run) saveRun(this.run);
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private go(screen: Screen): void {
    this.screen = screen;
    this.render();
    window.scrollTo(0, 0);
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'setup':
        body = this.setupView();
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
      case 'shop':
        body = this.shopView();
        break;
      case 'inn':
        body = this.innView();
        break;
      case 'event':
        body = this.eventView();
        break;
      case 'treasure':
        body = this.treasureView();
        break;
      case 'party':
        body = this.partyView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && !['title', 'setup', 'end'].includes(this.screen) ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'battle') {
      this.cacheEls();
      this.renderMenu();
      this.syncBars();
    }
  }

  private topBar(): string {
    const r = this.run!;
    const z = zoneOf(r.floor);
    const inBattle = this.screen === 'battle';
    return `<header class="top">
      <span class="pill">🗼 ${r.floor}/${TOP_FLOOR}</span>
      <span class="pill zone">${z.icon} ${z.name}</span>
      <span class="pill">💰 ${r.gold}</span>
      <span class="grow"></span>
      ${inBattle ? `<button class="icon-btn" data-act="mode" title="Wait mode pauses the bars while you choose">${this.meta.mode === 'wait' ? '⏸ Wait' : '▶ Active'}</button><button class="icon-btn" data-act="speed" title="Battle speed">×${this.speed}</button>` : `<button class="icon-btn" data-act="party" ${this.screen === 'party' ? 'disabled' : ''} title="Party: gear and skills">👥${r.heroes.some((h) => h.points > 0) ? '<b class="dot"></b>' : ''}</button>`}
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const guild = UNLOCKS.map((u) => {
      const own = m.unlocked.includes(u.id);
      return `<div class="unlock ${own ? 'own' : ''}"><span class="big">${u.icon}</span><span><b>${u.name}</b><small>${u.text}</small></span>
        ${own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.crystals >= u.cost ? '' : 'disabled'}>💎 ${u.cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo"><span class="hg">⏳</span><h1>Time Bar Tales</h1></div>
      <p class="sub">A party of heroes climbs a tower of 15 floors. Every unit has a time bar. When it is full, that unit acts. Defeat the Chronomancer at the top.</p>
      <div class="col">
        ${r ? `<button class="primary" data-act="continue">▶ Continue (floor ${r.floor}, ${r.heroes.map((h) => CLASSES[h.cls].icon).join('')})</button>` : ''}
        <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
        <button data-act="help">How to play</button>
      </div>
      <div class="settings">
        <button data-act="mode">Battle mode: <b>${m.mode === 'wait' ? '⏸ Wait' : '▶ Active'}</b></button>
        <button data-act="speed">Speed: <b>×${this.speed}</b></button>
        <button data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
      </div>
      <p class="hint">${m.mode === 'wait' ? 'Wait: all bars stop while a hero waits for your command.' : 'Active: the bars keep filling while you choose. Enemies do not wait.'}</p>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best floor ${m.bestFloor} · Best score ${m.best}</p>
      <h2>Guild <small>💎 ${m.crystals} crystals</small></h2>
      <p class="sub">Each run gives crystals. Unlock classes and starting gear for later runs.</p>
      <div class="guild">${guild}</div>
    </div>`;
  }

  private setupView(): string {
    const n = partySize(this.meta);
    const cards = unlockedClasses(this.meta)
      .map((id) => {
        const c = CLASSES[id];
        const on = this.setupPick.includes(id);
        return `<button class="card cls ${on ? 'on' : ''}" data-act="pick-class" data-id="${id}">
          <span class="huge">${c.icon}</span><b>${c.name}</b><small>${c.text}</small>
          <small class="dim">HP ${c.base.hp} · MP ${c.base.mp} · Atk ${c.base.atk} · Mag ${c.base.mag} · Spd ${c.base.spd}</small>
          <small>Starts with ${SKILLS[c.start].icon} ${SKILLS[c.start].name} · ${c.row} row</small>
        </button>`;
      })
      .join('');
    return `<div class="setup">
      <h2>Choose ${n} heroes</h2>
      <p class="sub">You can recruit more at inns, up to ${MAX_PARTY}. ${this.setupPick.length}/${n} chosen.</p>
      <div class="cards">${cards}</div>
      <div class="row-btns"><button data-act="title">Back</button><button class="primary" data-act="start" ${this.setupPick.length === n ? '' : 'disabled'}>Climb the tower ▶</button></div>
    </div>`;
  }

  private partyMini(): string {
    const r = this.run!;
    return `<div class="mini-party">${r.heroes
      .map((h) => {
        const s = heroStats(h);
        return `<div class="mini ${h.hp <= 0 ? 'ko' : ''}"><span class="big">${CLASSES[h.cls].icon}</span><div><b>${h.name}</b> <small>Lv ${h.lvl}${h.points ? ' <span class="good">+SP</span>' : ''}</small>
          ${bar('hp', h.hp, s.hp, `${h.hp}/${s.hp}`)}${bar('mp', h.mp, s.mp, `${h.mp}/${s.mp}`)}</div></div>`;
      })
      .join('')}</div>`;
  }

  private itemsLine(): string {
    const r = this.run!;
    const list = Object.entries(r.items)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => `<span class="chip" title="${ITEMS[id].text}">${ITEMS[id].icon} ${ITEMS[id].name} ×${n}</span>`)
      .join('');
    return `<div class="chips">${list || '<span class="dim">No items</span>'}</div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const z = zoneOf(r.floor);
    const floors = Array.from({ length: TOP_FLOOR }, (_, i) => i + 1)
      .map((f) => `<span class="fl ${f < r.floor ? 'done' : f === r.floor ? 'now' : ''} ${f % 5 === 0 ? 'boss' : ''}" title="Floor ${f}">${f % 5 === 0 ? '👑' : f}</span>`)
      .join('');
    const doors = r.doors
      .map((d, i) => {
        const info = ROOMS[d.kind];
        const foes = d.foes ? `<small class="foes">${d.foes.map((id) => ENEMIES[id].icon).join(' ')}</small>` : '';
        const name = d.kind === 'boss' && d.foes ? ENEMIES[d.foes[0]].name : info.name;
        return `<button class="door d-${d.kind}" data-act="door" data-i="${i}"><span class="huge">${info.icon}</span><b>${name}</b><small>${info.text}</small>${foes}</button>`;
      })
      .join('');
    return `<div class="map">
      <div class="tower">${floors}</div>
      <h2>${z.icon} Floor ${r.floor}: choose a door</h2>
      <div class="doors">${doors}</div>
      <h3>Party</h3>${this.partyMini()}
      <h3>Items</h3>${this.itemsLine()}
    </div>`;
  }

  // ---------- Battle view ----------

  private battleView(): string {
    const b = this.b!;
    const z = zoneOf(b.floor);
    const enemyBox = (u: Unit): string => {
      const big = u.rank === 'boss' ? 'boss' : u.rank === 'elite' ? 'elite' : '';
      return `<div class="u enemy ${big}" data-act="tgt" data-uid="${u.uid}">
        <div class="cursor">▼</div>
        <div class="sprite">${u.icon}</div>
        <div class="sts"></div>
        ${bar('hp', u.hp, u.maxHp)}${bar('atb', u.atb, ATB_MAX)}
        <div class="uname">${u.name}</div>
      </div>`;
    };
    const es = enemies(b);
    const back = es.filter((u) => u.row === 'back').map(enemyBox).join('');
    const front = es.filter((u) => u.row === 'front').map(enemyBox).join('');
    const hs = heroes(b)
      .map((u) => `<div class="u hero ${u.row}" data-act="tgt" data-uid="${u.uid}"><div class="cursor">◀</div><div class="sprite">${u.icon}</div><div class="sts"></div></div>`)
      .join('');
    const rows = heroes(b)
      .map(
        (u) => `<div class="prow" data-act="tgt" data-uid="${u.uid}">
        <span class="picon">${u.icon}</span>
        <span class="pname"><b>${u.name}</b><small>Lv ${u.lvl} · ${u.row}</small></span>
        <span class="pnums"><span class="hpt">${u.hp}/${u.maxHp}</span><small class="mpt">MP ${u.mp}</small></span>
        <span class="pbars">${bar('hp', u.hp, u.maxHp)}${bar('atb', u.atb, ATB_MAX)}</span>
        <span class="sts"></span>
      </div>`,
      )
      .join('');
    return `<div class="battle">
      <div class="field bg-${z.bg}" id="field">
        <div class="banner" id="banner"></div>
        <div class="foes"><div class="erow back">${back}</div><div class="erow front">${front}</div></div>
        <div class="allies">${hs}</div>
      </div>
      <div class="hud">
        <div class="plist">${rows}</div>
        <div class="cmd" id="cmd"></div>
      </div>
    </div>`;
  }

  private cacheEls(): void {
    this.els.clear();
    const b = this.b!;
    for (const u of b.units) {
      const box = this.root.querySelector<HTMLElement>(`.field .u[data-uid="${u.uid}"]`);
      if (!box) continue;
      const row = this.root.querySelector<HTMLElement>(`.prow[data-uid="${u.uid}"]`) ?? undefined;
      const all = [box, row].filter((x): x is HTMLElement => !!x);
      this.els.set(u.uid, {
        box,
        sprite: box.querySelector<HTMLElement>('.sprite')!,
        hp: all.map((e) => e.querySelector<HTMLElement>('.bar.hp i')).filter((x): x is HTMLElement => !!x),
        atb: all.map((e) => e.querySelector<HTMLElement>('.bar.atb i')).filter((x): x is HTMLElement => !!x),
        hpText: row?.querySelector<HTMLElement>('.hpt') ?? undefined,
        mpText: row?.querySelector<HTMLElement>('.mpt') ?? undefined,
        sts: all.map((e) => e.querySelector<HTMLElement>('.sts')).filter((x): x is HTMLElement => !!x),
        row,
      });
    }
  }

  private shownHp(u: Unit): number {
    return this.dispHp.get(u.uid) ?? u.hp;
  }

  /** Per-frame update of bars, numbers and status icons. */
  private syncBars(): void {
    const b = this.b;
    if (!b) return;
    for (const u of b.units) {
      const e = this.els.get(u.uid);
      if (!e) continue;
      const hp = this.shownHp(u);
      const hpW = `${pct(hp, u.maxHp)}%`;
      for (const x of e.hp) if (x.style.width !== hpW) x.style.width = hpW;
      const atbW = `${pct(u.atb, ATB_MAX)}%`;
      for (const x of e.atb) if (x.style.width !== atbW) x.style.width = atbW;
      const full = u.atb >= ATB_MAX && hp > 0;
      e.box.classList.toggle('full', full);
      e.row?.classList.toggle('full', full);
      const ko = hp <= 0;
      e.box.classList.toggle('ko', ko);
      e.row?.classList.toggle('ko', ko);
      e.row?.classList.toggle('low', !ko && hp < u.maxHp * 0.3);
      if (e.hpText) {
        const t = `${hp}/${u.maxHp}`;
        if (e.hpText.textContent !== t) e.hpText.textContent = t;
      }
      if (e.mpText) {
        const t = `MP ${u.mp}`;
        if (e.mpText.textContent !== t) e.mpText.textContent = t;
      }
      const s = ko ? '' : stsIcons(u.st, u.guard);
      for (const x of e.sts) if (x.innerHTML !== s) x.innerHTML = s;
    }
  }

  private currentAction(): ActionDef | null {
    const m = this.menu;
    if (!m?.pick) return null;
    if (m.pick.kind === 'attack') return SKILLS.attack;
    if (m.pick.kind === 'item') return ITEMS[m.pick.id];
    return SKILLS[m.pick.id];
  }

  private targetPool(): Unit[] {
    const b = this.b!;
    const a = this.currentAction();
    const u = this.menu ? unit(b, this.menu.uid) : undefined;
    if (!a || !u) return [];
    return targetsFor(b, u, a);
  }

  private menuEntries(): { label: string; icon: string; sub: string; ok: boolean; text: string }[] {
    const b = this.b!;
    const m = this.menu!;
    const u = unit(b, m.uid)!;
    if (m.level === 'root')
      return ROOT_CMDS.map((c) => ({
        label: c.name,
        icon: c.icon,
        sub: '',
        ok: c.id !== 'item' || Object.values(b.items).some((n) => n > 0),
        text: c.id === 'attack' ? `Weapon hit${u.wElem ? ` (${ELEM_ICON[u.wElem]})` : ''}.` : c.id === 'skill' ? 'Use a skill. Costs MP.' : c.id === 'item' ? 'Use an item from the bag.' : SKILLS.defend.text,
      }));
    if (m.level === 'skill')
      return u.skills.map((id) => {
        const s = SKILLS[id];
        return { label: s.name, icon: s.icon, sub: `${s.mp ?? 0} MP`, ok: u.mp >= (s.mp ?? 0) && (targetsFor(b, u, s).length > 0 || s.target === 'allies'), text: s.text };
      });
    if (m.level === 'item')
      return this.itemIds().map((id) => {
        const it = ITEMS[id];
        return { label: it.name, icon: it.icon, sub: `×${b.items[id]}`, ok: targetsFor(b, u, it).length > 0, text: it.text };
      });
    return [];
  }

  private itemIds(): string[] {
    const b = this.b!;
    return Object.keys(ITEMS).filter((id) => (b.items[id] ?? 0) > 0);
  }

  private renderMenu(): void {
    const box = this.root.querySelector<HTMLElement>('#cmd');
    const b = this.b;
    if (!box || !b) return;
    // Highlights in the field
    for (const [uid, e] of this.els) {
      e.box.classList.remove('turn', 'tg', 'tsel');
      e.row?.classList.remove('turn', 'tg', 'tsel', 'rdy');
      if (b.ready.includes(uid)) e.row?.classList.add('rdy');
    }
    const m = this.menu;
    if (!m) {
      const mode = this.meta.mode === 'wait' ? 'Wait mode: bars stop while you choose.' : 'Active mode: bars keep running while you choose.';
      box.innerHTML = `<div class="cmd-wait"><b>${b.result ? (b.result === 'win' ? '🏆 Victory!' : '💀 The party falls…') : '⏳ Time flows…'}</b><small>${this.lastMsg || mode}</small></div>`;
      return;
    }
    const u = unit(b, m.uid)!;
    const me = this.els.get(u.uid);
    me?.box.classList.add('turn');
    me?.row?.classList.add('turn');
    const others = b.ready.filter((x) => x !== m.uid).length;
    const head = `<div class="cmd-head"><span>${u.icon} <b>${u.name}</b></span><small>MP ${u.mp}/${u.maxMp}</small>${others ? `<button class="mini-btn" data-act="swap" title="Next ready hero (Tab)">⇄ ${others}</button>` : ''}</div>`;
    if (m.level === 'target') {
      const a = this.currentAction()!;
      const pool = this.targetPool();
      const single = singleTarget(a) && a.target !== 'row';
      const rowTarget = a.target === 'row';
      const t = pool[Math.min(m.tcur, pool.length - 1)];
      const marked = single || rowTarget ? (rowTarget && t ? pool.filter((x) => x.row === t.row) : t ? [t] : []) : pool;
      for (const x of pool) {
        const e = this.els.get(x.uid);
        e?.box.classList.add('tg');
        e?.row?.classList.add('tg');
      }
      for (const x of marked) {
        const e = this.els.get(x.uid);
        e?.box.classList.add('tsel');
        e?.row?.classList.add('tsel');
      }
      let info = '';
      if (t && (a.kind === 'phys' || a.kind === 'mag' || a.kind === 'flat') && t.side === 'enemy') {
        const d = estimate(b, u, a, t);
        info = d < 0 ? '<span class="bad">absorbs!</span>' : `≈ ${Math.round(d)} dmg`;
        const mul = d / Math.max(1, estimate(b, u, { ...a, elem: undefined }, t));
        if (a.elem || u.wElem) info += mul > 1.2 ? ' <span class="good">weak!</span>' : mul > 0 && mul < 0.8 ? ' <span class="warn">resists</span>' : '';
      }
      const who = single ? (t ? `${t.icon} ${t.name}` : '-') : rowTarget ? `${t?.row ?? ''} row` : a.target === 'self' ? 'Self' : a.target.startsWith('all') ? 'All allies' : 'All enemies';
      box.innerHTML = `${head}<div class="cmd-target"><div>${a.icon} <b>${a.name}</b> → ${who}</div><small>${info || a.text}</small>
        <small class="dim">${single || rowTarget ? 'Tap a target, or use ← → and Enter.' : 'Tap or press Enter to confirm.'}</small>
        <div class="row-btns"><button data-act="back">✖ Back</button><button class="primary" data-act="confirm">✔ OK</button></div></div>`;
      return;
    }
    const entries = this.menuEntries();
    const list = entries
      .map((e, i) => `<button class="mi ${i === m.cur ? 'cur' : ''}" data-act="mi" data-i="${i}" ${e.ok ? '' : 'disabled'}><span>${e.icon} ${e.label}</span><small>${e.sub}</small></button>`)
      .join('');
    const cur = entries[m.cur];
    box.innerHTML = `${head}<div class="mlist ${m.level}">${list || '<p class="dim">Nothing to use.</p>'}</div>
      <div class="cmd-foot"><small>${cur?.text ?? ''}</small>${m.level !== 'root' ? '<button class="mini-btn" data-act="back">✖ Back</button>' : ''}</div>`;
    box.querySelector('.mi.cur')?.scrollIntoView({ block: 'nearest' });
  }

  // ---------- Battle flow ----------

  private startBattle(): void {
    const r = this.run!;
    const foes = r.room?.foes ?? [];
    this.b = newBattle(r.heroes, foes, r.floor, battleSeed(r), { ...r.items }, { hasteStart: r.hasteNext });
    this.menu = null;
    this.queue = [];
    this.dispHp.clear();
    this.endAt = 0;
    this.lastMsg = '';
    this.readySeen.clear();
    this.screen = 'battle';
    this.render();
    const boss = foes.map((f) => ENEMIES[f]).find((d) => d.rank === 'boss');
    if (boss) this.toast(`${boss.icon} ${boss.name}: ${boss.text}`);
    this.startLoop();
  }

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const loop = (now: number): void => {
      if (this.screen !== 'battle' || !this.b) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(now, dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private busy(now = performance.now()): boolean {
    return this.queue.length > 0 || now < this.busyUntil;
  }

  private frame(now: number, dt: number): void {
    const b = this.b!;
    if (this.modal) return;
    if (this.queue.length && now >= this.busyUntil) {
      while (this.queue.length) {
        const g = this.queue.shift()!;
        const hasAct = g.some((e) => e.t === 'act');
        this.playGroup(g);
        if (hasAct && !FAST) {
          this.busyUntil = now + 720 / this.speed;
          break;
        }
      }
    } else if (!this.busy(now)) {
      if (this.dispHp.size) this.dispHp.clear();
      if (b.result) {
        if (!this.endAt) {
          this.endAt = now + (FAST ? 0 : 1100);
          this.menu = null;
          this.renderMenu();
          if (b.result === 'win') sfx.win();
          else sfx.lose();
        } else if (now >= this.endAt) this.finishBattle();
        return;
      }
      const paused = this.meta.mode === 'wait' && b.ready.length > 0;
      if (!paused) {
        tick(b, dt * this.speed);
        this.drain();
      }
    }
    this.syncMenu();
    this.syncBars();
  }

  /** Moves new battle events into the play queue, split by action. */
  private drain(): void {
    const b = this.b!;
    if (!b.events.length) return;
    let g: BEvent[] = [];
    for (const e of b.events) {
      if (e.t === 'act' && g.length) {
        this.queue.push(g);
        g = [];
      }
      g.push(e);
    }
    if (g.length) this.queue.push(g);
    b.events = [];
    // Keep displayed HP at the old value until the hit plays.
    for (const grp of this.queue)
      for (const e of grp) {
        if ((e.t === 'dmg' || e.t === 'heal' || e.t === 'revive') && !this.dispHp.has(e.uid)) {
          const u = unit(b, e.uid);
          if (u) this.dispHp.set(e.uid, e.t === 'dmg' ? e.hp + e.amount : e.t === 'heal' ? e.hp - e.amount : 0);
        }
      }
  }

  private syncMenu(): void {
    const b = this.b!;
    for (const uid of b.ready) {
      if (!this.readySeen.has(uid)) {
        this.readySeen.add(uid);
        sfx.ready();
      }
    }
    for (const uid of [...this.readySeen]) if (!b.ready.includes(uid)) this.readySeen.delete(uid);
    if (this.menu && !b.ready.includes(this.menu.uid)) {
      this.menu = null;
      this.renderMenu();
    }
    if (!this.menu && b.ready.length && !b.result) {
      this.menu = { uid: b.ready[0], level: 'root', cur: 0, tcur: 0 };
      this.renderMenu();
    }
  }

  private fx(uid: number, cls: string): void {
    const e = this.els.get(uid);
    if (!e || FAST) return;
    e.sprite.classList.remove(cls);
    void e.sprite.offsetWidth;
    e.sprite.classList.add(cls);
    setTimeout(() => e.sprite.classList.remove(cls), 600);
  }

  private float(uid: number, text: string, cls: string): void {
    if (FAST) return;
    const e = this.els.get(uid);
    const field = this.root.querySelector<HTMLElement>('#field');
    if (!e || !field) return;
    const fr = field.getBoundingClientRect();
    const r = e.sprite.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = `float ${cls}`;
    d.textContent = text;
    d.style.left = `${r.left - fr.left + r.width / 2 + (Math.random() * 16 - 8)}px`;
    d.style.top = `${r.top - fr.top + 4}px`;
    field.appendChild(d);
    d.addEventListener('animationend', () => d.remove());
  }

  private banner(text: string, cls = ''): void {
    const el = this.root.querySelector<HTMLElement>('#banner');
    if (!el || FAST) return;
    el.className = `banner ${cls}`;
    el.textContent = text;
    void el.offsetWidth;
    el.classList.add('show');
  }

  private playGroup(g: BEvent[]): void {
    const b = this.b!;
    let structural = false;
    for (const e of g) {
      switch (e.t) {
        case 'act': {
          const u = unit(b, e.uid);
          if (!u) break;
          this.banner(`${e.counter ? '↩ Counter: ' : ''}${e.icon} ${e.name}`, u.side);
          this.lastMsg = `${u.name}: ${e.icon} ${e.name}`;
          this.fx(e.uid, e.kind === 'phys' ? (u.side === 'hero' ? 'lunge-l' : 'lunge-r') : 'cast');
          if (e.kind === 'mag' || e.kind === 'flat') (e.elem ? sfx[e.elem] : sfx.magic)();
          else if (e.kind === 'heal' || e.kind === 'revive' || e.kind === 'full' || e.kind === 'mp') sfx.heal();
          else if (e.kind === 'status' || e.kind === 'atb') sfx.buff();
          break;
        }
        case 'dmg': {
          this.dispHp.set(e.uid, e.hp);
          const u = unit(b, e.uid);
          const tag = e.mul && e.mul > 1.2 ? ' WEAK' : e.mul !== undefined && e.mul > 0 && e.mul < 0.8 ? ' resist' : '';
          this.float(e.uid, `${e.amount}${e.crit ? '!' : ''}${tag}`, `dmg ${e.crit ? 'crit' : ''} ${e.poison ? 'poison' : ''} ${e.elem ? `el-${e.elem}` : ''}`);
          this.fx(e.uid, 'hit');
          if (e.elem) this.fx(e.uid, `fx-${e.elem}`);
          if (!e.poison) (e.crit ? sfx.crit : u?.side === 'hero' ? sfx.hurt : sfx.hit)();
          if (u?.side === 'hero' && !FAST) {
            const f = this.root.querySelector<HTMLElement>('#field');
            f?.classList.remove('shake');
            void f?.offsetWidth;
            f?.classList.add('shake');
          }
          break;
        }
        case 'heal':
          if (!e.mp) this.dispHp.set(e.uid, e.hp);
          this.float(e.uid, `+${e.amount}${e.mp ? ' MP' : ''}`, e.mp ? 'mpheal' : 'heal');
          this.fx(e.uid, 'fx-heal');
          break;
        case 'revive':
          this.dispHp.set(e.uid, e.hp);
          this.float(e.uid, 'Revived', 'heal');
          this.fx(e.uid, 'fx-holy');
          break;
        case 'status':
          if (e.on) {
            this.float(e.uid, `${STATUS[e.status].icon} ${STATUS[e.status].name}`, STATUS[e.status].bad ? 'bad-st' : 'good-st');
            if (STATUS[e.status].bad) sfx.debuff();
          }
          break;
        case 'miss':
          this.float(e.uid, e.text, 'miss');
          sfx.miss();
          break;
        case 'ko':
          this.dispHp.set(e.uid, 0);
          sfx.ko();
          break;
        case 'atb':
          this.fx(e.uid, 'fx-time');
          break;
        case 'spawn':
          structural = true;
          break;
        case 'msg':
          this.lastMsg = e.text;
          this.toast(e.text);
          break;
      }
    }
    if (structural) {
      const wrap = this.root.querySelector<HTMLElement>('main');
      if (wrap) {
        wrap.innerHTML = this.battleView();
        this.cacheEls();
        this.renderMenu();
      }
    }
    if (!this.menu) this.renderMenu();
  }

  private issue(cmd: Command): void {
    const b = this.b!;
    const m = this.menu;
    if (!m) return;
    if (!command(b, m.uid, cmd)) {
      sfx.deny();
      return;
    }
    sfx.select();
    this.menu = null;
    this.drain();
    this.syncMenu();
    this.renderMenu();
  }

  private menuSelect(i: number): void {
    const m = this.menu;
    const b = this.b;
    if (!m || !b) return;
    const entries = this.menuEntries();
    const e = entries[i];
    if (!e) return;
    if (!e.ok) {
      sfx.deny();
      return;
    }
    m.cur = i;
    if (m.level === 'root') {
      const id = ROOT_CMDS[i].id;
      if (id === 'defend') return this.issue({ kind: 'defend' });
      if (id === 'attack') return this.toTarget({ kind: 'attack', id: 'attack', from: 'root', fromCur: i });
      m.level = id;
      m.cur = 0;
      sfx.move();
      this.renderMenu();
      return;
    }
    if (m.level === 'skill') return this.toTarget({ kind: 'skill', id: unit(b, m.uid)!.skills[i], from: 'skill', fromCur: i });
    if (m.level === 'item') return this.toTarget({ kind: 'item', id: this.itemIds()[i], from: 'item', fromCur: i });
  }

  private toTarget(pick: NonNullable<Menu['pick']>): void {
    const m = this.menu!;
    const b = this.b!;
    m.pick = pick;
    const a = this.currentAction()!;
    if (a.target === 'self') return this.confirm(m.uid);
    m.level = 'target';
    const pool = this.targetPool();
    const u = unit(b, m.uid)!;
    // Smart default target: the hurt ally for heals, the enemy that takes the most damage for attacks.
    let best = 0;
    if (a.kind === 'heal' || a.kind === 'full') pool.forEach((x, i) => (x.hp / x.maxHp < pool[best].hp / pool[best].maxHp ? (best = i) : 0));
    else if (pool[0]?.side === 'enemy' && (a.kind === 'phys' || a.kind === 'mag')) {
      let bs = -1;
      pool.forEach((x, i) => {
        const d = estimate(b, u, a, x);
        if (d > bs) {
          bs = d;
          best = i;
        }
      });
    }
    m.tcur = best;
    sfx.move();
    this.renderMenu();
  }

  private confirm(targetUid?: number): void {
    const m = this.menu;
    if (!m?.pick) return;
    const pool = this.targetPool();
    const t = targetUid ?? pool[Math.min(m.tcur, pool.length - 1)]?.uid ?? null;
    const p = m.pick;
    if (p.kind === 'attack') this.issue({ kind: 'attack', target: t ?? 0 });
    else if (p.kind === 'skill') this.issue({ kind: 'skill', id: p.id, target: t });
    else this.issue({ kind: 'item', id: p.id, target: t });
  }

  private menuBack(): void {
    const m = this.menu;
    if (!m || m.level === 'root') return;
    if (m.level === 'target' && m.pick) {
      m.level = m.pick.from;
      m.cur = m.pick.fromCur;
      m.pick = undefined;
    } else {
      m.cur = m.level === 'skill' ? 1 : 2;
      m.level = 'root';
    }
    sfx.back();
    this.renderMenu();
  }

  private swapHero(uid?: number): void {
    const b = this.b!;
    if (!this.menu || b.ready.length < 2) return;
    const next = uid ?? b.ready[(b.ready.indexOf(this.menu.uid) + 1) % b.ready.length];
    if (!b.ready.includes(next)) return;
    this.menu = { uid: next, level: 'root', cur: 0, tcur: 0 };
    sfx.move();
    this.renderMenu();
  }

  private tapUnit(uid: number): void {
    const m = this.menu;
    const b = this.b!;
    if (!m) return;
    if (m.level === 'target') {
      const pool = this.targetPool();
      const i = pool.findIndex((x) => x.uid === uid);
      if (i < 0) return sfx.deny();
      const a = this.currentAction()!;
      if (!singleTarget(a)) return this.confirm();
      if (m.tcur === i || this.isTouch) return this.confirm(uid);
      m.tcur = i;
      sfx.move();
      this.renderMenu();
      return;
    }
    if (b.ready.includes(uid) && uid !== m.uid) return this.swapHero(uid);
    // Quick attack: tap an enemy from the main menu.
    const u = unit(b, uid);
    if (m.level === 'root' && u?.side === 'enemy' && alive(u)) {
      m.pick = { kind: 'attack', id: 'attack', from: 'root', fromCur: 0 };
      this.confirm(uid);
    }
  }

  private isTouch = false;

  private finishBattle(): void {
    const b = this.b!;
    const r = this.run!;
    cancelAnimationFrame(this.raf);
    this.b = null;
    this.menu = null;
    r.hasteNext = false;
    if (b.result === 'lose') {
      r.items = b.items;
      this.endRun(false);
      return;
    }
    const kind = r.room?.kind;
    this.rewards = winBattle(r, b);
    if (this.rewards.crystals) {
      this.meta.crystals += this.rewards.crystals;
      saveMeta(this.meta);
    }
    if (this.rewards.levels.length) sfx.level();
    if (kind === 'boss' && r.floor >= TOP_FLOOR) {
      this.endRun(true);
      return;
    }
    nextFloor(r);
    this.save();
    this.go('reward');
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const s = score(r, victory);
    const c = crystalsFor(s);
    const m = this.meta;
    m.crystals += c;
    if (victory) m.wins++;
    m.bestFloor = Math.max(m.bestFloor, victory ? TOP_FLOOR : r.floor);
    m.best = Math.max(m.best, s);
    saveMeta(m);
    clearRun();
    this.end = { victory, score: s, crystals: c, floor: r.floor };
    this.run = null;
    this.b = null;
    this.modal = null;
    if (victory) sfx.win();
    this.go('end');
  }

  // ---------- Other screens ----------

  private rewardView(): string {
    const w = this.rewards!;
    const r = this.run!;
    const lv = w.levels.map((l) => `<p class="good">⬆ ${r.heroes[l.hero].name} reaches level ${r.heroes[l.hero].lvl}! +${l.ups} skill point${l.ups > 1 ? 's' : ''}.</p>`).join('');
    const items = w.items.map((i) => `${ITEMS[i].icon} ${ITEMS[i].name}`).join(', ');
    const gear = w.gear.length
      ? `<h3>${w.picked ? 'Gear taken' : 'Pick one piece of gear'}</h3><div class="cards">${w.gear
          .map((g, i) => this.gearCard(g, `data-act="reward-gear" data-i="${i}" ${w.picked ? 'disabled' : ''}`))
          .join('')}</div>`
      : '';
    const sp = r.heroes.some((h) => h.points > 0) ? '<p class="hint">You have skill points. Open 👥 Party to learn skills.</p>' : '';
    return `<div class="reward">
      <h2>🏆 Victory!</h2>
      <p>💰 +${w.gold} gold · ⭐ +${w.xp} XP for each hero still standing${w.crystals ? ` · 💎 +${w.crystals} crystals` : ''}</p>
      ${items ? `<p>Dropped: ${items}</p>` : ''}
      ${lv}${gear}${sp}
      <div class="row-btns"><button data-act="party">👥 Party</button><button class="primary" data-act="to-map">Continue ▶</button></div>
    </div>`;
  }

  private gearCard(id: string, attrs: string, extra = ''): string {
    const g = GEAR[id];
    const r = this.run!;
    const fit = r.heroes
      .map((h) => {
        const cur = h.gear[g.slot] ? gearScore(h.cls, GEAR[h.gear[g.slot]!]) : 0;
        return gearScore(h.cls, g) > cur + 0.5 ? CLASSES[h.cls].icon : '';
      })
      .join('');
    return `<button class="card gear" ${attrs}><span class="huge">${g.icon}</span><b>${g.name}</b><small class="dim">${SLOT_NAME[g.slot]} · tier ${g.tier}</small><small>${gearText(g)}</small>${fit ? `<small class="good">Upgrade for ${fit}</small>` : ''}${extra}</button>`;
  }

  private shopView(): string {
    const r = this.run!;
    const shop = r.shop ?? [];
    const items = shop
      .map((s, i) => {
        if (s.kind !== 'item') return '';
        const it = ITEMS[s.id];
        return `<div class="srow"><span class="big">${it.icon}</span><span class="grow"><b>${it.name}</b> <small class="dim">own ${r.items[s.id] ?? 0}</small><small>${it.text}</small></span><button data-act="buy" data-i="${i}" ${r.gold >= s.price ? '' : 'disabled'}>💰 ${s.price}</button></div>`;
      })
      .join('');
    const gear = shop
      .map((s, i) => (s.kind === 'gear' ? this.gearCard(s.id, `data-act="buy" data-i="${i}" ${s.sold || r.gold < s.price ? 'disabled' : ''}`, `<span class="price">${s.sold ? 'Sold' : `💰 ${s.price}`}</span>`) : ''))
      .join('');
    return `<div class="shop">
      <h2>🛒 Shop</h2>
      <p class="sub">Gear goes to the bag. Equip it in 👥 Party.</p>
      <div class="slist">${items}</div>
      <h3>Gear</h3><div class="cards">${gear}</div>
      <div class="row-btns"><button data-act="party">👥 Party</button><button class="primary" data-act="leave">Leave ▶</button></div>
    </div>`;
  }

  private innView(): string {
    const r = this.run!;
    const cost = restCost(r);
    const rc = recruitCost(r);
    const full = r.heroes.length >= MAX_PARTY;
    const recruits = (r.recruits ?? [])
      .map((c) => {
        const d = CLASSES[c];
        return `<button class="card cls" data-act="recruit" data-id="${c}" ${full || r.gold < rc ? 'disabled' : ''}><span class="huge">${d.icon}</span><b>${d.name}</b><small>${d.text}</small><small class="dim">Joins at level ${recruitLevel(r)}</small><span class="price">💰 ${rc}</span></button>`;
      })
      .join('');
    return `<div class="inn">
      <h2>🛏️ Inn of the Last Hour</h2>
      ${this.partyMini()}
      <button class="primary wide" data-act="rest" ${r.gold >= cost ? '' : 'disabled'}>🛏️ Rest: full HP and MP, revive fallen heroes (💰 ${cost})</button>
      <h3>Recruit ${full ? '<small class="dim">(party is full)</small>' : `<small class="dim">(${r.heroes.length}/${MAX_PARTY})</small>`}</h3>
      <div class="cards">${recruits || '<p class="dim">Nobody is looking for work.</p>'}</div>
      <div class="row-btns"><button data-act="party">👥 Party</button><button class="primary" data-act="leave">Leave ▶</button></div>
    </div>`;
  }

  private eventView(): string {
    const r = this.run!;
    if (this.eventResult !== null) {
      const ev = EVENTS.find((e) => e.id === this.lastEvent);
      return `<div class="event"><span class="huge">${ev?.icon ?? '❓'}</span><h2>${ev?.name ?? ''}</h2><p>${this.eventResult}</p>${this.partyMini()}<button class="primary" data-act="to-map">Continue ▶</button></div>`;
    }
    const ev = eventDef(r)!;
    const opts = ev.options.map((o, i) => `<button data-act="event-opt" data-i="${i}" ${optionOk(r, o.need) ? '' : 'disabled'}>${o.label}</button>`).join('');
    return `<div class="event"><span class="huge">${ev.icon}</span><h2>${ev.name}</h2><p>${ev.text}</p><div class="col">${opts}</div></div>`;
  }

  private lastEvent = '';

  private treasureGear(): string[] {
    const r = this.run!;
    return randomGear(rngFor(r, 'treasure', r.floor), r.floor, 2);
  }

  private treasureView(): string {
    return `<div class="treasure"><h2>🎁 Treasure</h2><p class="sub">Take one.</p><div class="cards">${this.treasureGear()
      .map((g, i) => this.gearCard(g, `data-act="treasure" data-i="${i}"`))
      .join('')}</div></div>`;
  }

  private partyView(): string {
    const r = this.run!;
    const cards = r.heroes
      .map((h, hi) => {
        const c = CLASSES[h.cls];
        const s = heroStats(h);
        const stats = STAT_KEYS.filter((k) => k !== 'hp' && k !== 'mp')
          .map((k) => `<span>${STAT_NAME[k]} <b>${s[k]}</b></span>`)
          .join('');
        const slots = (['weapon', 'armor', 'acc'] as Slot[])
          .map((sl) => {
            const g = h.gear[sl] ? GEAR[h.gear[sl]!] : null;
            return `<button class="slot" data-act="slot" data-h="${hi}" data-slot="${sl}"><small class="dim">${SLOT_NAME[sl]}</small><span>${g ? `${g.icon} ${g.name}` : '—'}</span>${g ? `<small>${gearText(g)}</small>` : ''}</button>`;
          })
          .join('');
        const tree = [[c.start], ...c.tree]
          .map((tier, ti) => {
            const cells = tier
              .map((id) => {
                const sk = SKILLS[id];
                const has = h.skills.includes(id);
                const block = ti === 0 ? null : learnBlock(h, id);
                return `<button class="skill ${has ? 'has' : block ? 'locked' : 'can'}" data-act="learn" data-h="${hi}" data-id="${id}" ${has || block ? 'disabled' : ''} title="${sk.text}">
                <span>${sk.icon} ${sk.name}</span><small>${sk.mp ?? 0} MP · ${sk.text}</small>${has ? '<small class="good">✔ Learned</small>' : block ? `<small class="dim">${block}</small>` : '<small class="good">Learn (1 SP)</small>'}</button>`;
              })
              .join('');
            return `<div class="tier"><small class="dim">${ti === 0 ? 'Start' : `Tier ${ti} · Lv ${ti * 2}`}</small><div class="tcells">${cells}</div></div>`;
          })
          .join('');
        return `<div class="hcard ${h.hp <= 0 ? 'ko' : ''}">
          <div class="hhead"><span class="huge">${c.icon}</span><div class="grow"><b>${h.name}</b> <small>${c.name} · Lv ${h.lvl}</small>
            ${bar('hp', h.hp, s.hp, `HP ${h.hp}/${s.hp}`)}${bar('mp', h.mp, s.mp, `MP ${h.mp}/${s.mp}`)}${bar('xp', h.xp, xpNeeded(h.lvl), `XP ${h.xp}/${xpNeeded(h.lvl)}`)}</div>
            <button class="rowbtn" data-act="row" data-h="${hi}" title="Back row: half physical damage taken and dealt">${h.row === 'front' ? '⬅ Front row' : '➡ Back row'}</button></div>
          <div class="stats">${stats}</div>
          <div class="slots">${slots}</div>
          <h4>Skill tree ${h.points ? `<span class="good">${h.points} SP</span>` : ''}</h4>
          <div class="tree">${tree}</div>
        </div>`;
      })
      .join('');
    const bag = r.bag.map((g) => `<span class="chip" title="${gearText(GEAR[g])}">${GEAR[g].icon} ${GEAR[g].name}</span>`).join('');
    return `<div class="party">
      <div class="row-btns"><h2 class="grow">👥 Party</h2><button data-act="auto">Auto equip</button><button class="primary" data-act="party-back">Done ▶</button></div>
      <div class="hcards">${cards}</div>
      <h3>Bag</h3><div class="chips">${bag || '<span class="dim">Empty</span>'}</div>
      <h3>Items</h3>${this.itemsLine()}
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <span class="huge">${e.victory ? '🏆' : '💀'}</span>
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? 'Victory!' : 'Defeat'}</h1>
      <p>${e.victory ? 'The Chronomancer falls. Time flows freely again.' : `Your party fell on floor ${e.floor}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>💎 +${e.crystals} crystals for the Guild</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Time bars.</b> Every hero and enemy has a bar that fills by Speed. When a bar is full, that unit acts. Enemies act at once. Your hero waits for your command.</li>
          <li><b>Commands:</b> ⚔️ Attack, ✨ Skill (costs MP), 🎒 Item, 🛡️ Defend (half damage until your next turn).</li>
          <li><b>Wait mode</b> stops all bars while a hero waits for a command. <b>Active mode</b> does not. Change it on the title screen or in battle.</li>
          <li><b>Elements:</b> 🔥 fire, ❄️ ice, ⚡ thunder, ✨ holy, 🌑 dark. A weak enemy takes double damage. Some resist, some absorb. Aim at a target to see the damage.</li>
          <li><b>Statuses:</b> ⏩ Haste, 🐌 Slow, ☠️ Poison, 💤 Sleep (a hit wakes the unit), 🔰 Protect.</li>
          <li><b>Rows:</b> back-row units take and deal 40% less weapon damage. Spells ignore rows.</li>
          <li><b>Enemies</b> follow scripts. Some counter hits, some change pattern at half HP.</li>
          <li><b>The tower:</b> pick a door on each floor: battle, elite, inn, shop, event or treasure. Bosses wait on floors 5, 10 and 15.</li>
          <li><b>Heroes</b> gain levels and skill points. Learn skills and equip gear in 👥 Party. Recruit up to 4 heroes at inns.</li>
          <li><b>Keys:</b> ↑ ↓ choose, Enter or Space confirm, Esc or X back, ← → change target, Tab next ready hero, 1-4 commands. Tap an enemy to attack it.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'gear') {
      const r = this.run!;
      const h = r.heroes[m.hero];
      const cur = h.gear[m.slot];
      const list = r.bag
        .map((g, i) => [g, i] as const)
        .filter(([g]) => GEAR[g].slot === m.slot)
        .map(([g, i]) => {
          const d = GEAR[g];
          const diff = gearScore(h.cls, d) - (cur ? gearScore(h.cls, GEAR[cur]) : 0);
          return `<button class="srow" data-act="equip" data-i="${i}"><span class="big">${d.icon}</span><span class="grow"><b>${d.name}</b><small>${gearText(d)}</small></span><small class="${diff > 0.5 ? 'good' : diff < -0.5 ? 'bad' : 'dim'}">${diff > 0.5 ? '▲' : diff < -0.5 ? '▼' : '='}</small></button>`;
        })
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>${CLASSES[h.cls].icon} ${h.name}: ${SLOT_NAME[m.slot]}</h2>
        <p>Now: ${cur ? `${GEAR[cur].icon} ${GEAR[cur].name} <small>${gearText(GEAR[cur])}</small>` : '—'}</p>
        ${list || '<p class="dim">No gear for this slot in the bag.</p>'}
        ${cur ? '<button data-act="unequip">Unequip</button>' : ''}
        <button data-act="modal-close">Cancel</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      <button data-act="mode">Battle mode: ${this.meta.mode === 'wait' ? '⏸ Wait' : '▶ Active'}</button>
      <button data-act="speed">Battle speed: ×${this.speed}</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run${this.screen === 'battle' ? ', the battle restarts' : ''})</button>
    </div></div>`;
  }

  // ---------- Input ----------

  private onKey(e: KeyboardEvent): void {
    initAudio();
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen === 'battle' && this.b) {
      if (this.battleKey(e)) {
        e.preventDefault();
        return;
      }
    }
    if (e.key === 'Escape' && this.run && this.screen !== 'title' && this.screen !== 'end') {
      this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.screen !== 'battle' && e.key.startsWith('Arrow')) {
      const btns = [...this.root.querySelectorAll<HTMLButtonElement>('main button:not([disabled])')];
      if (!btns.length) return;
      e.preventDefault();
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      btns[(i + d + btns.length) % btns.length].focus();
    }
  }

  private battleKey(e: KeyboardEvent): boolean {
    const m = this.menu;
    const k = e.key;
    if (k === 'Tab') {
      this.swapHero();
      return true;
    }
    if (!m) return k === ' ' || k === 'Enter';
    if (m.level === 'target') {
      const pool = this.targetPool();
      if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'ArrowRight' || k === 'ArrowDown') {
        const d = k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 1;
        m.tcur = (m.tcur + d + pool.length) % Math.max(1, pool.length);
        sfx.move();
        this.renderMenu();
        return true;
      }
    } else {
      const n = this.menuEntries().length;
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        m.cur = (m.cur + (k === 'ArrowUp' ? -1 : 1) + n) % Math.max(1, n);
        sfx.move();
        this.renderMenu();
        return true;
      }
      if (m.level === 'root' && k >= '1' && k <= '4') {
        this.menuSelect(+k - 1);
        return true;
      }
    }
    if (k === 'Enter' || k === ' ' || k === 'z' || k === 'Z') {
      if (m.level === 'target') this.confirm();
      else this.menuSelect(m.cur);
      return true;
    }
    if (k === 'Escape' || k === 'x' || k === 'X' || k === 'Backspace') {
      if (m.level === 'root') return false;
      this.menuBack();
      return true;
    }
    return false;
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    this.isTouch = (e as PointerEvent).pointerType === 'touch';
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    this.action(el.dataset.act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const r = this.run;
    switch (act) {
      case 'mute':
        toggleMute();
        if (this.screen === 'battle') this.refreshTop();
        else this.render();
        return;
      case 'mode':
        this.meta.mode = this.meta.mode === 'wait' ? 'active' : 'wait';
        saveMeta(this.meta);
        this.toast(this.meta.mode === 'wait' ? '⏸ Wait mode: bars stop while you choose.' : '▶ Active mode: bars keep running.');
        if (this.screen === 'battle' && !this.modal) this.refreshTop();
        else this.render();
        return;
      case 'speed':
        this.meta.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length];
        saveMeta(this.meta);
        if (this.screen === 'battle' && !this.modal) this.refreshTop();
        else this.render();
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
        cancelAnimationFrame(this.raf);
        this.b = null;
        this.endRun(false);
        return;
      case 'title':
        this.modal = null;
        cancelAnimationFrame(this.raf);
        this.b = null;
        this.go('title');
        return;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.crystals < cost || this.meta.unlocked.includes(id)) return sfx.deny();
        this.meta.crystals -= cost;
        this.meta.unlocked.push(id);
        saveMeta(this.meta);
        sfx.level();
        this.render();
        return;
      }
      case 'new':
        this.setupPick = unlockedClasses(this.meta).slice(0, 0);
        this.go('setup');
        return;
      case 'pick-class': {
        const id = d.id!;
        const n = partySize(this.meta);
        if (this.setupPick.includes(id)) this.setupPick = this.setupPick.filter((x) => x !== id);
        else if (this.setupPick.length < n) this.setupPick.push(id);
        else this.setupPick = [...this.setupPick.slice(1), id];
        sfx.move();
        this.render();
        return;
      }
      case 'start':
        if (this.setupPick.length !== partySize(this.meta)) return sfx.deny();
        this.run = newRun(randomSeedText(), this.setupPick, this.meta);
        this.meta.runs++;
        saveMeta(this.meta);
        this.save();
        sfx.select();
        this.go('map');
        return;
      case 'continue':
        this.resume();
        return;
      case 'door': {
        if (!r) return;
        const room = enterRoom(r, +d.i!);
        this.save();
        this.eventResult = null;
        sfx.select();
        this.openRoom(room.kind);
        return;
      }
      case 'to-map':
        this.rewards = null;
        this.eventResult = null;
        this.go('map');
        return;
      case 'reward-gear': {
        const w = this.rewards;
        if (!w || w.picked || !r) return;
        r.bag.push(w.gear[+d.i!]);
        w.picked = true;
        this.save();
        sfx.coin();
        this.toast(`${GEAR[w.gear[+d.i!]].icon} ${GEAR[w.gear[+d.i!]].name} goes to the bag.`);
        this.render();
        return;
      }
      case 'buy':
        if (!r || !buy(r, +d.i!)) return sfx.deny();
        sfx.coin();
        this.save();
        this.render();
        return;
      case 'rest':
        if (!r || !rest(r)) return sfx.deny();
        sfx.heal();
        this.toast('The party sleeps well. HP and MP are full.');
        this.save();
        this.render();
        return;
      case 'recruit': {
        if (!r) return;
        const h = recruit(r, d.id!);
        if (!h) return sfx.deny();
        sfx.level();
        this.toast(`${CLASSES[h.cls].icon} ${h.name} joins the party!`);
        this.save();
        this.render();
        return;
      }
      case 'leave':
        if (!r) return;
        nextFloor(r);
        this.save();
        this.go('map');
        return;
      case 'event-opt': {
        if (!r) return;
        this.lastEvent = r.event ?? '';
        this.eventResult = runEvent(r, +d.i!);
        nextFloor(r);
        this.save();
        sfx.select();
        this.render();
        return;
      }
      case 'treasure': {
        if (!r) return;
        const g = this.treasureGear()[+d.i!];
        r.bag.push(g);
        nextFloor(r);
        this.save();
        sfx.coin();
        this.toast(`${GEAR[g].icon} ${GEAR[g].name} goes to the bag.`);
        this.go('map');
        return;
      }
      case 'party':
        if (this.screen !== 'party') this.partyBack = this.screen;
        this.go('party');
        return;
      case 'party-back':
        this.go(this.partyBack);
        return;
      case 'auto':
        if (!r) return;
        autoEquip(r);
        this.save();
        this.render();
        return;
      case 'row': {
        const h = r?.heroes[+d.h!];
        if (!h) return;
        h.row = h.row === 'front' ? 'back' : 'front';
        this.save();
        this.render();
        return;
      }
      case 'slot':
        this.modal = { kind: 'gear', hero: +d.h!, slot: d.slot as Slot };
        this.render();
        return;
      case 'equip': {
        const m = this.modal;
        if (!r || m?.kind !== 'gear') return;
        equip(r, m.hero, +d.i!);
        this.modal = null;
        sfx.select();
        this.save();
        this.render();
        return;
      }
      case 'unequip': {
        const m = this.modal;
        if (!r || m?.kind !== 'gear') return;
        unequip(r, m.hero, m.slot);
        this.modal = null;
        this.save();
        this.render();
        return;
      }
      case 'learn': {
        const h = r?.heroes[+d.h!];
        if (!h || !learn(h, d.id!)) return sfx.deny();
        sfx.level();
        this.save();
        this.render();
        return;
      }
      // Battle
      case 'mi':
        this.menuSelect(+d.i!);
        return;
      case 'back':
        this.menuBack();
        return;
      case 'confirm':
        this.confirm();
        return;
      case 'swap':
        this.swapHero();
        return;
      case 'tgt':
        this.tapUnit(+d.uid!);
        return;
    }
  }

  private refreshTop(): void {
    const top = this.root.querySelector<HTMLElement>('header.top');
    if (top) top.outerHTML = this.topBar();
    this.renderMenu();
  }

  private openRoom(kind: string): void {
    switch (kind) {
      case 'battle':
      case 'elite':
      case 'boss':
        this.startBattle();
        return;
      case 'shop':
        this.go('shop');
        return;
      case 'inn':
        this.go('inn');
        return;
      case 'event':
        this.go('event');
        return;
      case 'treasure':
        this.go('treasure');
        return;
    }
  }

  private resume(): void {
    const r = this.run;
    if (!r) return;
    if (r.room) this.openRoom(r.room.kind);
    else this.go('map');
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
        floor: this.run?.floor ?? null,
        gold: this.run?.gold ?? null,
        party: this.run?.heroes.map((h) => ({ name: h.name, cls: h.cls, lvl: h.lvl, hp: h.hp, mp: h.mp, points: h.points })) ?? null,
        battle: this.b
          ? {
              time: Math.round(this.b.time * 10) / 10,
              result: this.b.result,
              ready: this.b.ready,
              menu: this.menu?.level ?? null,
              units: this.b.units.map((u) => `${u.side} ${u.name} ${u.hp}/${u.maxHp} atb ${Math.round(u.atb)}`),
            }
          : null,
        mode: this.meta.mode,
        meta: { crystals: this.meta.crystals, unlocked: this.meta.unlocked, runs: this.meta.runs, wins: this.meta.wins },
        end: this.end,
      }),
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.render();
      },
      crystals: (n: number) => {
        this.meta.crystals += n;
        saveMeta(this.meta);
        this.render();
      },
      win: () => {
        if (!this.b) return;
        for (const u of enemies(this.b)) u.hp = 0;
        this.b.result = 'win';
      },
      /** One bot action. Returns what it did, or 'busy' while an animation plays. */
      step: (): string => {
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'setup': {
            const pool = unlockedClasses(this.meta);
            const want = ['knight', 'healer', 'mage', 'thief', ...pool].filter((c) => pool.includes(c));
            this.setupPick = [...new Set(want)].slice(0, partySize(this.meta));
            this.render();
            click('[data-act="start"]');
            return 'start';
          }
          case 'map':
            r!.heroes.forEach((h) => autoLearn(h));
            autoEquip(r!);
            click(`[data-act="door"][data-i="${chooseDoor(r!, true)}"]`);
            return 'door';
          case 'battle': {
            const b = this.b!;
            if (!FAST && this.busy()) return 'busy';
            if (b.result) {
              if (FAST || this.endAt) {
                this.queue = [];
                this.finishBattle();
              }
              return 'battle-end';
            }
            if (b.ready.length) {
              if (!this.menu || !b.ready.includes(this.menu.uid)) this.menu = { uid: b.ready[0], level: 'root', cur: 0, tcur: 0 };
              this.issue(smartCommand(b, this.menu.uid));
              return 'command';
            }
            advance(b, FAST ? 30 : 2);
            this.drain();
            if (FAST) {
              this.queue = [];
              this.dispHp.clear();
            }
            this.syncMenu();
            this.syncBars();
            return 'time';
          }
          case 'reward':
            if (this.rewards?.gear.length && !this.rewards.picked) click('[data-act="reward-gear"]');
            click('[data-act="to-map"]');
            return 'reward';
          case 'shop':
            shopBot(r!, true);
            this.save();
            click('[data-act="leave"]');
            return 'shop';
          case 'inn':
            innBot(r!, true);
            this.save();
            click('[data-act="leave"]');
            return 'inn';
          case 'event':
            if (this.eventResult !== null) click('[data-act="to-map"]');
            else click(`[data-act="event-opt"][data-i="${eventBot(r!, true)}"]`);
            return 'event';
          case 'treasure':
            click('[data-act="treasure"]');
            return 'treasure';
          case 'party':
            click('[data-act="party-back"]');
            return 'party';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
