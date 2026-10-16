import {
  ABILITY_INFO,
  ACTS,
  COLORS,
  COLOR_INFO,
  ENEMIES,
  HEROES,
  HERO_IDS,
  MANA_CAP,
  POTIONS,
  RANKS,
  RELICS,
  SPELLS,
  SUITS,
  SUIT_COLOR,
  spellCost,
} from './data';
import { choosePick, chooseRoom, restChoice, shopWish, smartAction, valid, type Action } from './bot';
import {
  canCast,
  canPlay,
  cardsLeft,
  cast,
  concede,
  cur,
  draw,
  enemyTurn,
  lossDamage,
  play,
  potionUsable,
  power,
  stuck,
  targets,
  usePotion,
  type Card,
  type Ev,
  type Fight,
} from './game';
import { randomSeedText } from './rng';
import {
  PLAN,
  ROOM_INFO,
  addRelic,
  advance,
  applyPick,
  buy,
  canBuy,
  clearRun,
  enemyFor,
  fightRewards,
  finishFight,
  gemsFor,
  loadMeta,
  loadRun,
  makeShop,
  maxSpells,
  newRun,
  pickEvent,
  randomRelics,
  restHeal,
  rngFor,
  saveMeta,
  saveRun,
  score,
  spellName,
  startFight,
  upgradable,
  type EventDef,
  type Pick,
  type Rewards,
  type Room,
  type RunState,
  type ShopItem,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'fight' | 'reward' | 'shop' | 'rest' | 'event' | 'treasure' | 'end';

type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'upgrade'; title: string; done: (index: number) => void };

/** `?debug&fast` skips waits and transitions, for bot tests. */
const PARAMS = new URLSearchParams(location.search);
const FAST = PARAMS.has('fast');
const SPELL_KEYS = ['q', 'w', 'e', 'r', 't', 'y', 'u'];
const POTION_KEYS = ['8', '9', '0'];

const wait = (ms: number): Promise<void> => (FAST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

const costHtml = (cost: Partial<Record<string, number>>): string =>
  COLORS.filter((c) => cost[c])
    .map((c) => `<i class="pip m-${c}">${COLOR_INFO[c].suit}${cost[c]}</i>`)
    .join('') || '<i class="pip">free</i>';

function bar(n: number, max: number, cls: string, label: string): string {
  const pct = Math.max(0, Math.min(100, (n / Math.max(1, max)) * 100));
  return `<div class="bar ${cls}"><div class="fill" style="width:${pct}%"></div><span>${label}</span></div>`;
}

interface Pos {
  x: number;
  y: number;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private heroSel = 'knight';

  // Fight
  private f: Fight | null = null;
  private undoF: Fight | null = null;
  private busy = false;
  private aim: { i: number; id: string } | null = null;
  private els = new Map<number, HTMLElement>();
  private pos = new Map<number, Pos>();
  private tabH = 0;
  private cw = 60;
  private ch = 84;
  private stockPos: Pos = { x: 0, y: 0 };
  private wastePos: Pos = { x: 0, y: 0 };

  // Other screens
  private rewards: Rewards | null = null;
  private shop: ShopItem[] = [];
  private event: { def: EventDef; result: string | null } | null = null;
  private treasure: string | null = null;
  private end: { victory: boolean; score: number; gems: number; act: number; hero: string } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    if (FAST) document.body.classList.add('fast');
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => {
      if (this.screen === 'fight') this.layout(new Map());
    });
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  private get hero() {
    return this.run!.hero;
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
      case 'fight':
        body = this.fightShell();
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
      this.els.clear();
      this.pos.clear();
      this.tabH = 0;
      this.syncFight([]);
    }
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
    const relics = h.relics.map((id) => `<span class="relic" data-act="relic" data-id="${id}" title="${RELICS[id].name}: ${RELICS[id].text}">${RELICS[id].icon}</span>`).join('');
    return `<header class="top">
      <span title="Hero HP">❤️ ${Math.max(0, hp)}/${h.maxHp}</span>
      <span title="Gold">💰 ${h.gold}</span>
      <span title="Act and step">${ACTS[Math.min(r.act, ACTS.length - 1)].icon} ${Math.min(r.act + 1, 3)}-${r.step + 1}</span>
      <span class="relics">${relics}</span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const heroes = HERO_IDS.map((id) => {
      const d = HEROES[id];
      const own = d.unlock === 0 || m.unlocked.includes(id);
      const sel = this.heroSel === id;
      const spells = d.start.map((s) => SPELLS[s].icon).join(' ');
      const btn = own
        ? `<button class="${sel ? 'primary' : ''}" data-act="hero" data-id="${id}">${sel ? '✔ Chosen' : 'Choose'}</button>`
        : `<button data-act="unlock" data-id="${id}" ${m.gems >= d.unlock ? '' : 'disabled'}>💎 ${d.unlock} to unlock</button>`;
      return `<div class="herocard ${sel ? 'sel' : ''} ${own ? '' : 'locked'}"><span class="huge">${d.icon}</span><b>${d.name}</b>
        <small>❤️ ${d.hp} · 🂠 ${d.deck} cards</small><small>${d.text}</small><small>Spells: ${spells}${d.relic ? ` · ${RELICS[d.relic].icon}` : ''}</small>${btn}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <h1><span class="logo">🂠</span> Solitaire Siege</h1>
      <p class="sub">Clear the enemy's tableau one card at a time. Play a card one higher or one lower than yours. Every card you clear gives mana for spells. Every card you draw gives the enemy a turn.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (${HEROES[r.heroId].icon} act ${r.act + 1}, ❤️ ${r.hero.hp})</button>` : ''}
      <div class="heroes">${heroes}</div>
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : `▶ New run as ${HEROES[this.heroSel].name}`}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best act ${m.bestAct} · Best score ${m.best} · 💎 ${m.gems} gems</p>
    </div>`;
  }

  private spellsLine(): string {
    const h = this.hero;
    return `<div class="chips">${h.spells.map((s) => `<span class="chip" title="${SPELLS[s.id].text}">${spellName(s)}</span>`).join('')}
      ${h.potions.map((p) => `<span class="chip" title="${POTIONS[p].text}">${POTIONS[p].icon} ${POTIONS[p].name}</span>`).join('')}</div>`;
  }

  private foeLine(id: string): string {
    const e = ENEMIES[id];
    const ab = e.abilities.map((a) => `${ABILITY_INFO[a.k].icon} ${ABILITY_INFO[a.k].name}`).join(', ');
    return `<small class="foe">${e.icon} ${e.name} · ${e.layout.reduce((a, b) => a + b, 0)} cards · ${ab}</small>`;
  }

  private mapView(): string {
    const r = this.run!;
    const act = ACTS[r.act];
    const track = PLAN.map((opts, i) => {
      const state = i < r.step ? 'done' : i === r.step ? 'now' : '';
      return `<span class="node ${state}">${opts.map((o) => ROOM_INFO[o].icon).join('')}</span>`;
    }).join('<span class="link"></span>');
    const rooms = PLAN[r.step]
      .map((room) => {
        const info = ROOM_INFO[room];
        const extra = room === 'fight' || room === 'elite' || room === 'boss' ? this.foeLine(enemyFor(r, room)) : '';
        return `<button class="room r-${room}" data-act="room" data-room="${room}"><span class="big">${info.icon}</span><b>${info.name}</b><small>${info.text}</small>${extra}</button>`;
      })
      .join('');
    const h = this.hero;
    return `<div class="map">
      <h2>${act.icon} Act ${r.act + 1}: ${act.name}</h2>
      <div class="track">${track}</div>
      <div class="rooms">${rooms}</div>
      <p class="dim">${HEROES[r.heroId].icon} ${HEROES[r.heroId].name} · 🂠 ${h.deck} stock cards · ${h.spells.length}/${maxSpells(h)} spells</p>
      ${this.spellsLine()}
    </div>`;
  }

  // ---------- Fight view ----------

  private fightShell(): string {
    return `<div class="fightv">
      <div class="leftcol">
        <div class="foebox" id="foe"></div>
        <div class="aimbar" id="aimbar"></div>
        <div class="table" id="table"><div class="pile" id="stock" data-act="draw"></div><div class="slot" id="wslot"></div><div class="banner" id="banner"></div></div>
        <div class="hud" id="hud"></div>
      </div>
      <aside class="side" id="side"></aside>
    </div>`;
  }

  private foeView(f: Fight): string {
    const e = ENEMIES[f.enemy];
    const left = cardsLeft(f);
    const chips = e.abilities
      .map((a, i) => {
        const info = ABILITY_INFO[a.k];
        const n = power(f, a);
        const t = f.timers[i];
        return `<span class="abil ${t <= 1 ? 'soon' : ''}" data-ab="${i}" title="${info.name}: ${info.text(n)} Every ${a.every} turns.">${info.icon} ${info.name}${a.k === 'hex' ? '' : ` ${n}`} <b>⏱${t}</b></span>`;
      })
      .join('');
    return `<span class="ficon" id="ficon">${e.icon}</span>
      <div class="finfo"><b>${e.name}</b>${bar(left, Math.max(f.total, left), 'foehp', `${left} cards left`)}</div>
      <div class="abils">${chips}</div>`;
  }

  private hudView(f: Fight): string {
    const free = f.free > 0 ? `<span class="tag good" title="Draws that give the enemy no turn">💨 ${f.free} free</span>` : '';
    const empty = f.stock.length === 0;
    return `<span class="stat" title="Hero HP">❤️ <b>${Math.max(0, f.hp)}</b>/${f.maxHp}</span>
      <span class="stat ${f.shield ? '' : 'dim'}" title="Shield blocks lost cards and HP">🛡️ <b>${f.shield}</b></span>
      <span class="stat" title="Stock cards left. They are your HP in this fight.">🂠 <b>${f.stock.length}</b></span>
      ${f.streak > 1 ? `<span class="tag streak">🔥 ${f.streak}</span>` : ''}${free}
      <span class="grow"></span>
      <button data-act="undo" ${this.undoF && !this.busy ? '' : 'disabled'} title="Undo (Z)">↶<span class="lbl"> Undo</span></button>
      <button class="${empty ? 'danger' : 'primary'}" data-act="draw" ${this.busy ? 'disabled' : ''} title="Space">${empty ? '🏳️ Give up' : '🂠 Draw'}</button>`;
  }

  private sideView(f: Fight): string {
    const mana = COLORS.map(
      (c) => `<span class="mana m-${c}" id="mana-${c}" title="${COLOR_INFO[c].name} mana from ${COLOR_INFO[c].suit} cards">${COLOR_INFO[c].suit} <b>${f.mana[c]}</b><small>/${MANA_CAP}</small></span>`,
    ).join('');
    const spells = f.spells
      .map((s, i) => {
        const d = SPELLS[s.id];
        const ok = canCast(f, i) && !this.busy;
        const on = this.aim?.i === i;
        return `<button class="spell ${on ? 'on' : ''}" data-act="spell" data-i="${i}" ${ok || on ? '' : 'disabled'} title="${d.text}">
          <span class="sicon">${d.icon}</span><span class="sname"><b>${d.name}${s.lvl > 1 ? '+' : ''}</b><small>${d.text}</small></span>
          <span class="scost">${costHtml(spellCost(s.id, s.lvl))}</span><kbd>${SPELL_KEYS[i].toUpperCase()}</kbd></button>`;
      })
      .join('');
    const pots = f.potions
      .map((p, i) => `<button class="potion" data-act="potion" data-i="${i}" ${potionUsable(f, i) && !this.busy ? '' : 'disabled'} title="${POTIONS[p].name}: ${POTIONS[p].text}">${POTIONS[p].icon} ${POTIONS[p].name} <kbd>${POTION_KEYS[i]}</kbd></button>`)
      .join('');
    return `<div class="manabar">${mana}</div>
      <div class="spells">${spells}</div>
      ${pots ? `<div class="potions">${pots}</div>` : ''}
      <p class="hint">Tap a glowing card that is 1 higher or lower than yours. Keys: 1–7 play a column, Space draws, Z undoes, ${SPELL_KEYS.slice(0, f.spells.length).join(' ').toUpperCase()} cast.</p>`;
  }

  private aimView(f: Fight): string {
    if (!this.aim) return '';
    const d = SPELLS[this.aim.id];
    if (d.target === 'dir') {
      const w = cur(f)!;
      const dn = w.rank === 1 ? 13 : w.rank - 1;
      const up = w.rank === 13 ? 1 : w.rank + 1;
      return `<span>${d.icon} ${d.name}:</span><button data-act="dir" data-d="-1">← to ${RANKS[dn]}</button><button data-act="dir" data-d="1">to ${RANKS[up]} →</button><button data-act="aim-cancel">Cancel</button>`;
    }
    return `<span>${d.icon} ${d.name}: tap a glowing top card.</span><button data-act="aim-cancel">Cancel (Esc)</button>`;
  }

  private cardHtml(c: Card): string {
    if (!c.up) return '<span class="back"></span>';
    const badges = [
      c.lock ? `<i class="badge b-lock">🔒${c.lock}</i>` : '',
      c.armor ? '<i class="badge b-armor">🛡️</i>' : '',
      c.bomb ? `<i class="badge b-bomb">💣${c.bomb}</i>` : '',
      c.gold ? '<i class="badge b-gold">💰</i>' : '',
    ].join('');
    return `<span class="rk">${RANKS[c.rank]}${SUITS[c.suit]}</span><span class="pip-big">${SUITS[c.suit]}</span>${badges}`;
  }

  /** Compute positions and move card elements. `from` gives start points for new cards. */
  private layout(from: Map<number, Pos>, removed: Set<number> = new Set()): void {
    const f = this.f;
    const table = this.root.querySelector<HTMLElement>('#table');
    if (!f || !table) return;
    const W = table.clientWidth;
    const C = f.cols.length;
    const gap = W < 480 ? 5 : 8;
    this.cw = Math.max(34, Math.min(74, Math.floor((W - gap * (Math.max(C, 6) - 1)) / Math.max(C, 6))));
    this.ch = Math.round(this.cw * 1.4);
    const cw = this.cw;
    const ch = this.ch;
    table.style.setProperty('--cw', `${cw}px`);
    table.style.setProperty('--ch', `${ch}px`);
    const x0 = (W - (C * cw + (C - 1) * gap)) / 2;
    const want = new Map<number, { x: number; y: number; z: number; c: Card; cls: string; col: number }>();
    let maxH = ch * 2;
    const tgt = this.aim && SPELLS[this.aim.id].target === 'top' ? targets(f, this.aim.id) : [];
    f.cols.forEach((col, ci) => {
      let y = 0;
      const step = col.length > 9 ? 0.6 : 1;
      col.forEach((c, k) => {
        const isTop = k === col.length - 1;
        let cls = '';
        if (isTop && !this.aim && canPlay(f, ci)) cls += ' playable';
        if (isTop && tgt.includes(ci)) cls += ' target';
        want.set(c.id, { x: x0 + ci * (cw + gap), y, z: k + 1, c, cls, col: ci });
        if (!isTop) y += (c.up ? ch * 0.3 : ch * 0.15) * step;
      });
      maxH = Math.max(maxH, y + ch);
    });
    this.tabH = Math.max(this.tabH, maxH);
    const pileY = this.tabH + 18;
    this.stockPos = { x: W / 2 - cw * 1.5 - 10, y: pileY };
    this.wastePos = { x: W / 2 + 10, y: pileY };
    const wn = f.waste.length;
    f.waste.slice(-2).forEach((c, k) => {
      want.set(c.id, { x: this.wastePos.x, y: this.wastePos.y, z: 200 + k, c, cls: k === Math.min(wn, 2) - 1 && f.wild ? ' wild' : '', col: -1 });
    });
    table.style.height = `${pileY + ch + 18}px`;
    const stock = table.querySelector<HTMLElement>('#stock')!;
    stock.style.transform = `translate(${this.stockPos.x}px, ${this.stockPos.y}px)`;
    stock.className = `pile ${f.stock.length ? '' : 'empty'}`;
    stock.innerHTML = f.stock.length ? `<span class="back"></span><b>${f.stock.length}</b>` : '<b>0</b>';
    const slot = table.querySelector<HTMLElement>('#wslot')!;
    slot.style.transform = `translate(${this.wastePos.x}px, ${this.wastePos.y}px)`;

    for (const [id, w] of want) {
      let el = this.els.get(id);
      const html = this.cardHtml(w.c);
      const cls = `card ${w.c.up ? 'up' : 'down'} s-${SUIT_COLOR[w.c.suit]}${w.cls}${w.c.lock ? ' locked' : ''}${w.c.armor ? ' armored' : ''}${w.c.bomb ? ' bombed' : ''}`;
      if (!el) {
        el = document.createElement('div');
        const start = from.get(id);
        el.style.transition = 'none';
        if (start) el.style.transform = `translate(${start.x}px, ${start.y}px)`;
        else el.style.transform = `translate(${w.x}px, ${w.y - 30}px)`;
        if (!start) el.style.opacity = '0';
        table.appendChild(el);
        this.els.set(id, el);
        void el.offsetWidth;
        el.style.transition = '';
        el.style.opacity = '';
      }
      if (el.dataset.html !== html) {
        el.innerHTML = html;
        el.dataset.html = html;
      }
      el.className = cls;
      el.dataset.act = w.col >= 0 ? 'col' : '';
      el.dataset.col = String(w.col);
      el.style.zIndex = String(w.z);
      el.style.transform = `translate(${w.x}px, ${w.y}px)`;
      this.pos.set(id, { x: w.x, y: w.y });
    }
    for (const [id, el] of this.els) {
      if (want.has(id)) continue;
      this.els.delete(id);
      this.pos.delete(id);
      if (removed.has(id)) {
        el.classList.add('burnt');
        setTimeout(() => el.remove(), FAST ? 0 : 450);
      } else setTimeout(() => el.remove(), FAST ? 0 : 320);
    }
  }

  /** Update every part of the fight screen and play the effects of the events. */
  private syncFight(ev: Ev[]): void {
    const f = this.f;
    if (!f) return;
    const q = <T extends HTMLElement>(s: string): T | null => this.root.querySelector<T>(s);
    const foe = q('#foe');
    if (foe) foe.innerHTML = this.foeView(f);
    const hud = q('#hud');
    if (hud) hud.innerHTML = this.hudView(f);
    const side = q('#side');
    if (side) side.innerHTML = this.sideView(f);
    const aimbar = q('#aimbar');
    if (aimbar) {
      aimbar.innerHTML = this.aimView(f);
      aimbar.classList.toggle('show', !!this.aim);
    }
    const top = q('header.top');
    if (top) top.outerHTML = this.topBar();

    const from = new Map<number, Pos>();
    const removed = new Set<number>();
    for (const e of ev) {
      if (e.k === 'draw') from.set(e.id, this.stockPos);
      if (e.k === 'armor') from.set(e.ghost, this.pos.get(e.id) ?? this.wastePos);
      if (e.k === 'morph') from.set(e.id, this.wastePos);
      if (e.k === 'remove') e.ids.forEach((id) => removed.add(id));
    }
    // Cards that leave the tableau into the waste keep their element, so they fly over.
    this.layout(from, removed);
    this.effects(ev);
  }

  private float(text: string, at: Pos, cls = ''): void {
    if (FAST) return;
    const table = this.root.querySelector<HTMLElement>('#table');
    if (!table) return;
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${at.x + this.cw / 2}px`;
    el.style.top = `${at.y}px`;
    table.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  private pulse(sel: string, cls: string): void {
    const el = this.root.querySelector<HTMLElement>(sel);
    if (!el || FAST) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  private showBanner(text: string): void {
    const b = this.root.querySelector<HTMLElement>('#banner');
    if (!b || FAST) return;
    b.textContent = text;
    this.pulse('#banner', 'show');
  }

  private effects(ev: Ev[]): void {
    const f = this.f!;
    const banners: string[] = [];
    for (const e of ev) {
      switch (e.k) {
        case 'clear':
          sfx.clear(f.streak);
          this.float(`+${e.n}${COLOR_INFO[e.color].suit}`, this.wastePos, `m-${e.color}`);
          this.pulse(`#mana-${e.color}`, 'bump');
          this.pulse('#ficon', 'hit');
          if (e.gold) {
            sfx.coin();
            this.float(`+${e.gold}💰`, { x: this.wastePos.x, y: this.wastePos.y - 24 }, 'gold');
          }
          break;
        case 'armor':
          sfx.armor();
          this.float('🛡️ cracked', this.pos.get(e.id) ?? this.wastePos);
          break;
        case 'flip':
          sfx.flip();
          break;
        case 'unlock':
          sfx.unlock();
          this.float('🔓', this.pos.get(e.id) ?? this.wastePos);
          break;
        case 'draw':
          sfx.draw();
          if (e.free) this.float('free draw', this.stockPos, 'good');
          break;
        case 'ability':
          sfx.enemy();
          banners.push(`${e.icon} ${e.name}`);
          this.pulse(`[data-ab="${e.i}"]`, 'fire');
          this.pulse('#ficon', 'attack');
          break;
        case 'burn':
          if (e.n) {
            sfx.burn();
            this.float(`-${e.n} 🂠`, this.stockPos, 'bad');
            this.pulse('#stock', 'shake');
          }
          if (e.blocked) {
            sfx.shield();
            this.float(`🛡️ ${e.blocked}`, { x: this.stockPos.x, y: this.stockPos.y - 26 }, 'good');
          }
          break;
        case 'hurt':
          if (e.n) {
            sfx.hurt();
            this.float(`-${e.n} ❤️`, { x: this.stockPos.x, y: this.stockPos.y - 10 }, 'bad');
            this.pulse('#hud', 'shake');
            this.pulse('.table', 'redflash');
          }
          if (e.blocked) this.float(`🛡️ ${e.blocked}`, { x: this.stockPos.x, y: this.stockPos.y - 36 }, 'good');
          break;
        case 'add':
          sfx.grow();
          break;
        case 'remove':
          sfx.smash();
          this.pulse('#ficon', 'hit');
          break;
        case 'morph':
          sfx.magic();
          break;
        case 'bomb':
          sfx.bomb();
          banners.push(`💣 Boom! -${e.dmg}`);
          this.pulse('.table', 'redflash');
          break;
        case 'mana':
          this.float(`+${e.n} all mana`, this.wastePos, 'good');
          break;
        case 'drain':
          if (e.n) this.float(`-${e.n}${COLOR_INFO[e.color].suit}`, this.wastePos, 'bad');
          break;
        case 'heal':
          if (e.n) {
            sfx.heal();
            this.float(`+${e.n} ❤️`, this.stockPos, 'good');
          }
          break;
        case 'shield':
          sfx.shield();
          this.float(`+${e.n} 🛡️`, this.stockPos, 'good');
          break;
        case 'stock':
          sfx.heal();
          this.float(`+${e.n} 🂠`, this.stockPos, 'good');
          break;
        case 'cast':
          sfx.cast();
          break;
        case 'potion':
          sfx.item();
          break;
        case 'win':
          sfx.win();
          banners.push('Tableau cleared!');
          break;
      }
    }
    if (banners.length) this.showBanner(banners.join('  ·  '));
  }

  // ---------- Fight flow ----------

  private setFight(f: Fight, ev: Ev[]): void {
    this.f = f;
    this.run!.fight = f;
    saveRun(this.run!);
    this.syncFight(ev);
  }

  /** An action is undoable when it used no randomness and showed no hidden card. */
  private act(res: { f: Fight; ev: Ev[] }): void {
    const prev = this.f!;
    if (res.f === prev) {
      sfx.deny();
      return;
    }
    const hidden = res.ev.some((e) => e.k === 'flip' || e.k === 'draw' || e.k === 'win');
    this.undoF = !hidden && res.f.n === prev.n ? prev : null;
    this.aim = null;
    this.setFight(res.f, res.ev);
    void this.afterAction();
  }

  private async afterAction(): Promise<void> {
    const f = this.f;
    if (!f) return;
    if (f.over) {
      await this.finish();
      return;
    }
    if (stuck(f)) {
      this.busy = true;
      this.toast('No moves and no stock left. The fight is lost.');
      await wait(900);
      this.busy = false;
      this.f = concede(f);
      await this.finish();
    }
  }

  private doPlay(col: number): void {
    const f = this.f;
    if (!f || this.busy || f.over) return;
    if (this.aim) {
      if (SPELLS[this.aim.id].target === 'top') {
        if (targets(f, this.aim.id).includes(col)) this.act(cast(f, this.aim.i, col));
        else sfx.deny();
      }
      return;
    }
    if (!canPlay(f, col)) {
      sfx.deny();
      const t = f.cols[col]?.[f.cols[col].length - 1];
      if (t?.lock) this.toast(`Locked: it opens after ${t.lock} more clear${t.lock > 1 ? 's' : ''}.`);
      return;
    }
    this.act(play(f, col));
  }

  private async doDraw(): Promise<void> {
    const f = this.f;
    if (!f || this.busy || f.over) return;
    this.aim = null;
    if (!f.stock.length) {
      this.f = concede(f);
      await this.finish();
      return;
    }
    this.busy = true;
    this.undoF = null;
    const d = draw(f);
    this.setFight(d.f, d.ev);
    if (d.enemy) {
      await wait(380);
      const e = enemyTurn(this.f!);
      this.setFight(e.f, e.ev);
      await wait(e.ev.length ? 450 : 0);
    }
    this.busy = false;
    this.syncFight([]);
    await this.afterAction();
  }

  private doSpell(i: number): void {
    const f = this.f;
    if (!f || this.busy || f.over) return;
    if (this.aim?.i === i) {
      this.aim = null;
      this.syncFight([]);
      return;
    }
    if (!canCast(f, i)) {
      sfx.deny();
      return;
    }
    const id = f.spells[i].id;
    if (SPELLS[id].target === 'none') {
      this.act(cast(f, i));
      return;
    }
    sfx.click();
    this.aim = { i, id };
    this.syncFight([]);
  }

  private doUndo(): void {
    if (!this.undoF || this.busy) return;
    this.aim = null;
    this.setFight(this.undoF, []);
    this.undoF = null;
    this.syncFight([]);
    sfx.magic();
  }

  private async finish(): Promise<void> {
    const f = this.f!;
    const r = this.run!;
    this.busy = true;
    if (f.over === 'win') await wait(900);
    else {
      sfx.lose();
      await wait(600);
    }
    this.busy = false;
    const out = finishFight(r, f);
    this.f = null;
    this.undoF = null;
    this.aim = null;
    if (out.result === 'dead') {
      this.endRun(false);
      return;
    }
    r.after = { out, rewards: null, picked: false, relicPicked: false };
    if (out.result === 'win') {
      const rw = fightRewards(r);
      r.after.rewards = rw;
      if (rw.relic) addRelic(r.hero, rw.relic);
      if (!rw.picks.length) r.after.picked = true;
    }
    saveRun(r);
    this.openAfter();
  }

  private openAfter(): void {
    const r = this.run!;
    this.rewards = r.after?.rewards ?? null;
    this.screen = 'reward';
    this.render();
  }

  private beginFight(room: Room): void {
    const r = this.run!;
    this.f = startFight(r, room);
    this.undoF = null;
    this.aim = null;
    this.busy = false;
    saveRun(r);
    this.screen = 'fight';
    this.render();
    this.showBanner(`${ENEMIES[this.f.enemy].icon} ${ENEMIES[this.f.enemy].name}`);
  }

  // ---------- Other screens ----------

  private pickHtml(p: Pick, i: number, done: boolean): string {
    const h = this.hero;
    let body = '';
    if (p.kind === 'spell') {
      const d = SPELLS[p.id];
      body = `<span class="big">${d.icon}</span><b>Learn ${d.name}</b><span class="cost-line">${costHtml(d.cost)}</span><small>${d.text}</small>`;
    } else if (p.kind === 'upgrade') {
      const s = h.spells[p.index];
      body = `<span class="big">⬆️</span><b>Upgrade ${SPELLS[s.id].icon} ${SPELLS[s.id].name}</b><span class="cost-line">${costHtml(spellCost(s.id, 1))} → ${costHtml(spellCost(s.id, 2))}</span>`;
    } else if (p.kind === 'potion') {
      body = `<span class="big">${POTIONS[p.id].icon}</span><b>${POTIONS[p.id].name}</b><small>Potion: ${POTIONS[p.id].text}</small>`;
    } else if (p.kind === 'relic') {
      body = `<span class="big">${RELICS[p.id].icon}</span><b>${RELICS[p.id].name}</b><small>${RELICS[p.id].text}</small>`;
    } else if (p.kind === 'deck') {
      body = `<span class="big">🂠</span><b>+${p.n} stock cards</b><small>A bigger stock in every fight.</small>`;
    } else body = `<span class="big">❤️</span><b>+${p.n} max HP</b>`;
    return `<button class="pick ${done ? 'off' : ''}" data-act="pick" data-i="${i}" ${done ? 'disabled' : ''}>${body}</button>`;
  }

  private rewardView(): string {
    const r = this.run!;
    const a = r.after!;
    const o = a.out;
    if (o.result !== 'win') {
      const boss = r.room === 'boss';
      return `<div class="reward">
        <h2 class="bad">Out of cards</h2>
        <p>The enemy still had ${o.left} card${o.left === 1 ? '' : 's'}. You lose ❤️ ${o.damage} HP.</p>
        <p class="dim">${boss ? 'The boss blocks the way. You must fight it again, with a new deal.' : 'You slip past, but you get no reward.'}</p>
        <button class="primary" data-act="advance">${boss ? 'Fight again ▶' : 'Continue ▶'}</button>
      </div>`;
    }
    const rw = this.rewards!;
    const relic = rw.relic ? `<p class="good">The elite dropped ${RELICS[rw.relic].icon} <b>${RELICS[rw.relic].name}</b>: ${RELICS[rw.relic].text}</p>` : '';
    const relicChoice = rw.relicChoice.length
      ? `<h3>Choose a relic</h3><div class="picks">${rw.relicChoice
          .map((id) => `<button class="pick ${a.relicPicked ? 'off' : ''}" data-act="relic-pick" data-id="${id}" ${a.relicPicked ? 'disabled' : ''}><span class="big">${RELICS[id].icon}</span><b>${RELICS[id].name}</b><small>${RELICS[id].text}</small></button>`)
          .join('')}</div>`
      : '';
    const picks = a.picked ? '<p class="dim">Reward taken.</p>' : `<div class="picks">${rw.picks.map((p, i) => this.pickHtml(p, i, false)).join('')}</div>`;
    const canGo = a.picked && (!rw.relicChoice.length || a.relicPicked);
    return `<div class="reward">
      <h2 class="good">Victory!</h2>
      <p>💰 +${o.gold} gold${o.heal ? ` · ❤️ +${o.heal} HP` : ''}</p>
      ${relic}${relicChoice}
      <h3>Learn a spell or take an item</h3>${picks}
      ${a.picked ? '' : '<button data-act="skip">Skip</button>'}
      <button class="primary" data-act="advance" ${canGo ? '' : 'disabled'}>Continue ▶</button>
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const h = r.hero;
    const items = this.shop
      .map((it, i) => {
        let body = '';
        if (it.kind === 'spell') body = `<span class="big">${SPELLS[it.id].icon}</span><b>${SPELLS[it.id].name}</b><span class="cost-line">${costHtml(SPELLS[it.id].cost)}</span><small>${SPELLS[it.id].text}</small>`;
        else if (it.kind === 'relic') body = `<span class="big">${RELICS[it.id].icon}</span><b>${RELICS[it.id].name}</b><small>${RELICS[it.id].text}</small>`;
        else if (it.kind === 'potion') body = `<span class="big">${POTIONS[it.id].icon}</span><b>${POTIONS[it.id].name}</b><small>${POTIONS[it.id].text}</small>`;
        else if (it.kind === 'heal') body = `<span class="big">🍖</span><b>Heal ${it.n} HP</b>`;
        else if (it.kind === 'deck') body = `<span class="big">🂠</span><b>+${it.n} stock cards</b>`;
        else body = '<span class="big">⬆️</span><b>Upgrade a spell</b><small>Its cost goes down by 1.</small>';
        return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${canBuy(r, it) ? '' : 'disabled'}>${body}<span class="cost">${it.sold ? 'Sold' : `💰 ${it.cost}`}</span></button>`;
      })
      .join('');
    return `<div class="shopv"><h2>🛒 Shop</h2><p>💰 ${h.gold} gold · ${h.spells.length}/${maxSpells(h)} spells · ${h.potions.length}/3 potions</p><div class="picks">${items}</div>
      ${this.spellsLine()}
      <button class="primary" data-act="advance">Leave ▶</button></div>`;
  }

  private restView(): string {
    const h = this.hero;
    return `<div class="restv"><h2>🔥 Campfire</h2><p class="sub">Rest by the fire, or study your spell book.</p>
      <div class="picks">
        <button class="pick" data-act="rest-heal"><span class="big">💤</span><b>Rest</b><small>Heal ${restHeal(h)} HP (now ${h.hp}/${h.maxHp}).</small></button>
        <button class="pick" data-act="rest-up" ${upgradable(h).length ? '' : 'disabled'}><span class="big">⬆️</span><b>Study</b><small>Upgrade a spell. Its cost goes down by 1.</small></button>
      </div>${this.spellsLine()}</div>`;
  }

  private eventView(): string {
    const ev = this.event!;
    const r = this.run!;
    const opts = ev.result
      ? `<p class="result">${ev.result}</p><button class="primary" data-act="advance">Continue ▶</button>`
      : ev.def.options.map((o, i) => `<button data-act="event-opt" data-i="${i}" ${!o.can || o.can(r) ? '' : 'disabled'}>${o.label}</button>`).join('');
    return `<div class="eventv"><span class="huge">${ev.def.icon}</span><h2>${ev.def.title}</h2><p>${ev.def.text}</p><div class="opts">${opts}</div></div>`;
  }

  private treasureView(): string {
    const id = this.treasure;
    return `<div class="eventv"><span class="huge">🎁</span><h2>Treasure</h2>
      ${id ? `<p>You find ${RELICS[id].icon} <b>${RELICS[id].name}</b>: ${RELICS[id].text}</p>` : '<p>The chest is empty.</p>'}<p>💰 +20 gold</p>
      <button class="primary" data-act="advance">Continue ▶</button></div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <span class="huge">${e.victory ? '🏆' : '💀'}</span>
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? 'Victory!' : 'Defeat'}</h1>
      <p>${e.victory ? `${HEROES[e.hero].icon} The Dealer folds. The house lost.` : `${HEROES[e.hero].icon} You fell in act ${e.act + 1}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>💎 +${e.gems} gems to unlock heroes</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>The enemy is a tableau</b> of card columns. Clear every card to win the fight.</li>
          <li><b>Your card</b> sits next to the stock. You can clear a top card that is <b>1 higher or 1 lower</b> (a 7 takes a 6 or an 8). The cleared card becomes your new card, so you can chain.</li>
          <li><b>Mana:</b> every cleared card gives 2 mana of its suit: ♥ Ruby, ♦ Amber, ♣ Jade, ♠ Azure. Spells cost mana.</li>
          <li><b>Draw</b> when you are stuck. Each draw is one <b>enemy turn</b>. The enemy abilities fire when their timer ⏱ reaches 0.</li>
          <li><b>Your stock is your HP</b> in the fight. Strikes and bombs burn stock cards. 🛡️ Shield blocks them. With an empty stock and no moves, you lose the fight and take damage: 3, plus 2 per act, plus 1 per card left.</li>
          <li><b>Special cards:</b> 🔒 locked cards open after some clears. 🛡️ armored cards need two plays. 💣 bombs burn stock cards when their timer runs out, so clear them first. 💰 gold cards give gold.</li>
          <li><b>Undo</b> takes back your last play or spell, if it did not show a hidden card or use luck.</li>
          <li><b>The run:</b> 3 acts of 7 steps. Win fights to learn spells and find items. Beat The Dealer at the end of act 3.</li>
          <li><b>Keys:</b> 1–7 play a column, Space draws, Z undoes, Q W E R T Y U cast spells, 8 9 0 use potions, Esc cancels.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'upgrade') {
      const h = this.hero;
      const list = h.spells
        .map((s, i) => `<button class="pick" data-act="up-spell" data-i="${i}" ${s.lvl < 2 ? '' : 'disabled'}><span class="big">${SPELLS[s.id].icon}</span><b>${SPELLS[s.id].name}${s.lvl > 1 ? '+' : ''}</b><span class="cost-line">${costHtml(spellCost(s.id, s.lvl))}${s.lvl < 2 ? ` → ${costHtml(spellCost(s.id, 2))}` : ''}</span></button>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop><h2>${m.title}</h2><div class="picks">${list}</div><button data-act="modal-close">Cancel</button></div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Flow ----------

  private nextStep(): void {
    const r = this.run!;
    if (advance(r)) {
      this.endRun(true);
      return;
    }
    saveRun(r);
    this.screen = 'map';
    this.render();
  }

  private enterRoom(room: Room): void {
    const r = this.run!;
    r.room = room;
    if (room === 'fight' || room === 'elite' || room === 'boss') {
      this.beginFight(room);
      return;
    }
    if (room === 'shop') {
      this.shop = makeShop(r);
      this.screen = 'shop';
    } else if (room === 'rest') this.screen = 'rest';
    else if (room === 'event') {
      this.event = { def: pickEvent(r), result: null };
      this.screen = 'event';
    } else {
      const rng = rngFor(r, 'treasure', r.act, r.step);
      this.treasure = randomRelics(r, rng, 1)[0] ?? null;
      if (this.treasure) addRelic(r.hero, this.treasure);
      r.hero.gold += 20;
      sfx.item();
      this.screen = 'treasure';
    }
    this.render();
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const sc = score(r, victory);
    const gems = gemsFor(sc);
    const m = this.meta;
    m.gems += gems;
    m.runs++;
    m.best = Math.max(m.best, sc);
    m.bestAct = Math.max(m.bestAct, Math.min(3, r.act + (victory ? 0 : 1)));
    if (victory) m.wins++;
    saveMeta(m);
    clearRun();
    this.end = { victory, score: sc, gems, act: Math.min(r.act, 2), hero: r.heroId };
    this.run = null;
    this.f = null;
    this.modal = null;
    this.screen = 'end';
    if (victory) sfx.win();
    else sfx.lose();
    this.render();
  }

  private continueRun(): void {
    const r = this.run!;
    if (r.fight && !r.fight.over) {
      this.f = r.fight;
      this.undoF = null;
      this.aim = null;
      this.screen = 'fight';
      this.render();
    } else if (r.after) this.openAfter();
    else if (r.fight) {
      this.f = r.fight;
      void this.finish();
    } else {
      this.screen = 'map';
      this.render();
    }
  }

  // ---------- Input ----------

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (this.modal) {
      if (k === 'escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'fight' || !this.f) return;
    initAudio();
    if (k === 'escape') {
      this.aim = null;
      this.syncFight([]);
    } else if (k === ' ' || k === 'd' || k === 'enter') {
      e.preventDefault();
      void this.doDraw();
    } else if (k === 'z' || k === 'backspace') {
      e.preventDefault();
      this.doUndo();
    } else if (/^[1-7]$/.test(k)) {
      this.doPlay(Number(k) - 1);
    } else if (SPELL_KEYS.includes(k)) {
      this.doSpell(SPELL_KEYS.indexOf(k));
    } else if (POTION_KEYS.includes(k)) {
      this.doPotion(POTION_KEYS.indexOf(k));
    } else if ((k === 'arrowleft' || k === 'arrowright') && this.aim && SPELLS[this.aim.id].target === 'dir') {
      this.act(cast(this.f, this.aim.i, k === 'arrowleft' ? -1 : 1));
    }
  }

  private doPotion(i: number): void {
    const f = this.f;
    if (!f || this.busy || !potionUsable(f, i)) {
      sfx.deny();
      return;
    }
    this.act(usePotion(f, i));
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
        if (this.screen === 'fight') this.syncFight([]);
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
        this.endRun(false);
        return;
      case 'title':
        this.modal = null;
        this.screen = 'title';
        this.f = null;
        this.render();
        return;
      case 'relic':
        this.toast(`${RELICS[d.id!].icon} ${RELICS[d.id!].name}: ${RELICS[d.id!].text}`);
        return;
      case 'hero':
        this.heroSel = d.id!;
        sfx.click();
        this.render();
        return;
      case 'unlock': {
        const h = HEROES[d.id!];
        if (this.meta.gems >= h.unlock && !this.meta.unlocked.includes(d.id!)) {
          this.meta.gems -= h.unlock;
          this.meta.unlocked.push(d.id!);
          this.heroSel = d.id!;
          saveMeta(this.meta);
          sfx.item();
          this.toast(`${h.icon} ${h.name} unlocked.`);
        }
        this.render();
        return;
      }
      case 'new':
        this.run = newRun(randomSeedText(), this.heroSel);
        saveRun(this.run);
        this.screen = 'map';
        this.render();
        return;
      case 'continue':
        this.continueRun();
        return;
      case 'room':
        this.enterRoom(d.room as Room);
        return;
      // Fight
      case 'col':
        this.doPlay(Number(d.col));
        return;
      case 'draw':
        void this.doDraw();
        return;
      case 'undo':
        this.doUndo();
        return;
      case 'spell':
        this.doSpell(Number(d.i));
        return;
      case 'potion':
        this.doPotion(Number(d.i));
        return;
      case 'dir':
        if (this.f && this.aim) this.act(cast(this.f, this.aim.i, Number(d.d)));
        return;
      case 'aim-cancel':
        this.aim = null;
        this.syncFight([]);
        return;
    }
    if (!r) return;
    switch (act) {
      case 'pick': {
        const a = r.after;
        if (!a || a.picked || !this.rewards) return;
        applyPick(r.hero, this.rewards.picks[Number(d.i)]);
        a.picked = true;
        sfx.item();
        saveRun(r);
        this.render();
        return;
      }
      case 'skip':
        if (r.after) r.after.picked = true;
        saveRun(r);
        this.render();
        return;
      case 'relic-pick':
        if (!r.after || r.after.relicPicked) return;
        addRelic(r.hero, d.id!);
        r.after.relicPicked = true;
        sfx.item();
        saveRun(r);
        this.render();
        return;
      case 'advance':
        if (this.screen === 'reward' && r.after?.out.result === 'lose' && r.room === 'boss') {
          r.tries++;
          r.after = null;
          this.beginFight('boss');
          return;
        }
        this.nextStep();
        return;
      case 'buy': {
        const it = this.shop[Number(d.i)];
        if (!it || !canBuy(r, it)) return;
        if (it.kind === 'upgrade') {
          this.modal = {
            kind: 'upgrade',
            title: 'Upgrade which spell?',
            done: (i) => {
              if (buy(r, it, i)) sfx.coin();
            },
          };
          this.render();
          return;
        }
        if (buy(r, it)) sfx.coin();
        saveRun(r);
        this.render();
        return;
      }
      case 'rest-heal':
        r.hero.hp += restHeal(r.hero);
        sfx.heal();
        this.nextStep();
        return;
      case 'rest-up':
        this.modal = {
          kind: 'upgrade',
          title: 'Study which spell?',
          done: (i) => {
            r.hero.spells[i].lvl = 2;
            sfx.item();
            this.nextStep();
          },
        };
        this.render();
        return;
      case 'up-spell': {
        const m = this.modal;
        if (m?.kind !== 'upgrade') return;
        this.modal = null;
        m.done(Number(d.i));
        saveRun(r);
        if (this.screen !== 'map') this.render();
        return;
      }
      case 'event-opt': {
        const ev = this.event!;
        const o = ev.def.options[Number(d.i)];
        if (o.can && !o.can(r)) return;
        ev.result = o.run(r, rngFor(r, 'eventres', r.act, r.step));
        sfx.item();
        saveRun(r);
        this.render();
        return;
      }
    }
  }

  // ---------- Debug ----------

  private installDebug(): void {
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLElement>(sel);
      el?.click();
      return !!el;
    };
    const runAction = async (a: Action): Promise<void> => {
      const f = this.f!;
      if (!valid(f, a)) {
        await this.doDraw();
        return;
      }
      if (a.k === 'play') this.doPlay(a.col);
      else if (a.k === 'draw' || a.k === 'concede') await this.doDraw();
      else if (a.k === 'potion') this.doPotion(a.i);
      else {
        const id = f.spells[a.i].id;
        const t = SPELLS[id].target;
        if (t === 'none') this.doSpell(a.i);
        else {
          this.aim = { i: a.i, id };
          if (t === 'dir') this.act(cast(f, a.i, a.target));
          else this.doPlay(a.target);
        }
      }
    };
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        busy: this.busy,
        hero: this.run?.heroId,
        act: this.run?.act,
        step: this.run?.step,
        hp: this.f?.hp ?? this.run?.hero.hp,
        gold: this.run?.hero.gold,
        enemy: this.f?.enemy ?? null,
        cardsLeft: this.f ? cardsLeft(this.f) : null,
        stock: this.f?.stock.length ?? null,
        mana: this.f?.mana ?? null,
        current: this.f && cur(this.f) ? RANKS[cur(this.f)!.rank] : null,
        lossDamage: this.f ? lossDamage(this.f) : null,
        end: this.end,
      }),
      gold: (n: number) => {
        if (this.run) this.run.hero.gold += n;
        this.render();
      },
      gems: (n: number) => {
        this.meta.gems += n;
        saveMeta(this.meta);
        this.render();
      },
      relic: (id: string) => {
        if (this.run) addRelic(this.run.hero, id);
        if (this.f) this.f.relics.push(id);
      },
      win: () => {
        if (!this.f) return;
        this.f = { ...this.f, cols: this.f.cols.map(() => []), over: 'win' };
        void this.finish();
      },
      /** One bot action for automatic tests. */
      step: async (): Promise<string> => {
        if (this.busy) return 'busy';
        if (this.modal) {
          if (!click('.modal [data-act="up-spell"]:not([disabled])')) click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'map':
            this.enterRoom(chooseRoom(r!, PLAN[r!.step]));
            return 'room';
          case 'fight': {
            if (!this.f) return 'busy';
            if (this.aim) {
              this.aim = null;
              this.syncFight([]);
            }
            const a = smartAction(this.f);
            await runAction(a);
            return a.k;
          }
          case 'reward': {
            const a = r!.after!;
            if (a.out.result === 'win' && this.rewards) {
              if (!a.relicPicked && this.rewards.relicChoice.length) click('[data-act="relic-pick"]');
              if (!a.picked) click(`[data-act="pick"][data-i="${choosePick(r!.hero, this.rewards.picks)}"]`);
            }
            click('[data-act="advance"]');
            return 'reward';
          }
          case 'shop': {
            const i = shopWish(r!, this.shop);
            if (i >= 0) click(`[data-act="buy"][data-i="${i}"]`);
            else click('[data-act="advance"]');
            return 'shop';
          }
          case 'rest':
            click(restChoice(r!.hero) === 'heal' ? '[data-act="rest-heal"]' : '[data-act="rest-up"]');
            return 'rest';
          case 'event':
            if (!click('[data-act="event-opt"]:not([disabled])')) click('[data-act="advance"]');
            return 'event';
          case 'treasure':
            click('[data-act="advance"]');
            return 'treasure';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
