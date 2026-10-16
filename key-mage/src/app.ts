import {
  FH,
  FW,
  LANES,
  NOVA_R,
  PX,
  PY,
  TURN_Y,
  WALL_Y,
  accuracy,
  backspace,
  clearBuf,
  def,
  dmgMult,
  isBoss,
  isDecoy,
  newBattle,
  progress,
  spellCost,
  stepBattle,
  typeKey,
  type Battle,
  type Enemy,
  type Ev,
  type FightKind,
} from './battle';
import { GOOD_BOT, Typist } from './bot';
import { ACTS, DIFFS, DIFF_ORDER, ENEMIES, RUNES, SPELLS, UNLOCKS } from './data';
import { Rng, randomSeedText } from './rng';
import {
  ROOM_INFO,
  STEPS,
  accuracyOf,
  advance,
  afterBattle,
  applyPick,
  battleCfg,
  clearRun,
  fightRewards,
  loadMeta,
  loadRun,
  makeShop,
  newRun,
  saveMeta,
  saveRun,
  score,
  shardsFor,
  shrinePicks,
  unlockCost,
  wpm,
  type Pick,
  type Rewards,
  type RoomKind,
  type RunState,
  type ShopItem,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'fight' | 'reward' | 'shrine' | 'shop' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
}
interface Bolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  t: number;
}
interface Ring {
  r: number;
  color: string;
  t: number;
}

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips the banners between fights, for bot tests. */
const FAST = PARAMS.has('fast');
const ACCENT = '#4cc9f0';
const DT = 1 / 60;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function pickInfo(p: Pick): { icon: string; title: string; text: string } {
  switch (p.kind) {
    case 'spell': {
      const s = SPELLS[p.id];
      return { icon: s.icon, title: `Spell word: "${s.word}"`, text: `${s.text} Costs ${s.cost} mana.` };
    }
    case 'rune': {
      const r = RUNES[p.id];
      return { icon: r.icon, title: `Rune: ${r.name}`, text: r.text };
    }
    case 'maxhp':
      return { icon: '❤️', title: `+${p.n} max HP`, text: 'Also heals the same amount.' };
    case 'heal':
      return { icon: '🍵', title: `Heal ${p.n} HP`, text: 'Rest and recover.' };
    case 'mana':
      return { icon: '🔷', title: `+${p.n} max mana`, text: 'Cast more spells per fight.' };
  }
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;

  // Fight
  private b: Battle | null = null;
  private kind: FightKind = 'fight';
  private finishing = 0;
  private banner: { text: string; sub: string; t: number } | null = null;
  private floats: Float[] = [];
  private parts: Part[] = [];
  private bolts: Bolt[] = [];
  private rings: Ring[] = [];
  private shake = 0;
  private hurtFlash = 0;
  private typoFlash = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private scale = 1;
  private hudCache = '';
  private sideCache = '';
  private showKbd = matchMedia('(pointer: coarse)').matches;
  private bot: Typist | null = null;

  // Other screens
  private rewards: Rewards | null = null;
  private picks: Pick[] = [];
  private shop: ShopItem[] = [];
  private end: { diff: string; best: boolean; victory: boolean; score: number; shards: number; act: number; wpm: number; acc: number; words: number; combo: number } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onKbd(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- DOM rendering ----------

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
        body = `<div class="fight">
          <div class="field"><canvas id="cv"></canvas><div class="typed" id="typed"></div></div>
          <aside class="side" id="side"></aside>
        </div>${this.showKbd ? this.kbdView() : ''}`;
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'shrine':
        body = this.shrineView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    this.hudCache = '';
    this.sideCache = '';
    if (this.screen === 'fight') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.updateHud();
      this.resize();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
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
    const hp = this.b && this.screen === 'fight' ? this.b.hp : r.hp;
    const runes = r.runes.map((id) => `<span class="rune" title="${RUNES[id].name}: ${esc(RUNES[id].text)}">${RUNES[id].icon}</span>`).join('');
    return `<header class="top">
      <span id="top-hp">❤️ ${Math.max(0, hp)}/${r.maxHp}</span>
      <span>💰 ${r.gold}</span>
      <span>${ACTS[Math.min(r.act, 2)].icon} ${Math.min(r.act + 1, 3)}-${r.step + 1}</span>
      <span title="Difficulty: ${DIFFS[r.diff ?? 'normal'].name}">${DIFFS[r.diff ?? 'normal'].icon}</span>
      <span class="runes">${runes}</span>
      <span class="grow"></span>
      ${this.screen === 'fight' ? `<button class="icon-btn ${this.showKbd ? 'on' : ''}" data-act="kbd" title="On-screen keyboard">⌨️</button>` : ''}
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const grim = UNLOCKS.map((u) => {
      const own = m.unlocked.includes(u.id);
      const cost = unlockCost(u.id);
      const icon = u.kind === 'spell' ? SPELLS[u.id].icon : RUNES[u.id].icon;
      const name = u.kind === 'spell' ? `Spell "${SPELLS[u.id].word}"` : `Rune ${RUNES[u.id].name}`;
      const text = u.kind === 'spell' ? `Known from the start. ${SPELLS[u.id].text}` : `Can appear in runs. ${RUNES[u.id].text}`;
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${icon}</span><span><b>${name}</b><small>${esc(text)}</small></span>
        ${own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.shards >= cost ? '' : 'disabled'}>💎 ${cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo"><span class="kc">K</span><span class="kc">E</span><span class="kc">Y</span> <span class="mage">Mage</span></div>
      <p class="sub">Enemies walk at you with words above them. Type a word to cast at that enemy. Add <b class="w">fire</b>, <b class="w">frost</b> or <b class="w">volt</b> first to change the spell. Survive 3 acts and their bosses.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (${DIFFS[r.diff ?? 'normal'].icon} act ${r.act + 1}, ❤️ ${r.hp}/${r.maxHp})</button>` : ''}
      <div class="diffs" role="radiogroup" aria-label="Difficulty for new runs">${DIFF_ORDER.map((id) => {
        const df = DIFFS[id];
        const on = (m.diff || 'normal') === id;
        return `<button class="diff ${on ? 'on' : ''}" data-act="diff" data-id="${id}" role="radio" aria-checked="${on}"><b>${df.icon} ${df.name}</b><small>${df.text}</small><small class="dim">Best ${m.bestBy?.[id] ?? 0} · Wins ${m.winsBy?.[id] ?? 0}</small></button>`;
      }).join('')}</div>
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best act ${m.bestAct} · Best score ${m.best} · Best WPM ${m.bestWpm}</p>
      <h2>Grimoire <small>💎 ${m.shards} shards</small></h2>
      <p class="sub">Each run gives shards. Unlock spells and runes for later runs.</p>
      <div class="armory">${grim}</div>
    </div>`;
  }

  private loadout(): string {
    const r = this.run!;
    const spells = r.spells.map((id) => `<span class="chip" title="${esc(SPELLS[id].text)}">${SPELLS[id].icon} <b>${SPELLS[id].word}</b> <small>${SPELLS[id].cost}</small></span>`).join('');
    const runes = r.runes.length ? r.runes.map((id) => `<span class="chip" title="${esc(RUNES[id].text)}">${RUNES[id].icon} ${RUNES[id].name}</span>`).join('') : '<span class="dim">No runes yet.</span>';
    return `<h3>Spell words</h3><div class="bag">${spells}</div><h3>Runes</h3><div class="bag">${runes}</div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const act = ACTS[r.act];
    const plan = r.map[r.act];
    const track = plan
      .map((opts, i) => {
        const state = i < r.step ? 'done' : i === r.step ? 'now' : '';
        return `<span class="node ${state}">${opts.map((o) => ROOM_INFO[o].icon).join('')}</span>`;
      })
      .join('<span class="link"></span>');
    const rooms = plan[r.step]
      .map((room, i) => {
        const info = ROOM_INFO[room];
        let extra = '';
        if (room === 'boss') extra = `<small class="foe">${ENEMIES[act.boss].icon} ${ENEMIES[act.boss].name}</small>`;
        if (room === 'elite') extra = `<small class="foe">${ENEMIES[act.elite].icon} ${ENEMIES[act.elite].name}</small>`;
        return `<button class="room r-${room}" data-act="room" data-room="${room}"><span class="big">${info.icon}</span><b><kbd>${i + 1}</kbd> ${info.name}</b><small>${info.text}</small>${extra}</button>`;
      })
      .join('');
    return `<div class="map">
      <h2>${act.icon} Act ${r.act + 1}: ${act.name}</h2>
      <div class="track">${track}</div>
      <p class="dim">Step ${r.step + 1} of ${STEPS}. Choose where to go.</p>
      <div class="rooms">${rooms}</div>
      ${this.loadout()}
    </div>`;
  }

  private pickHtml(p: Pick, i: number, act = 'pick', extra = '', disabled = false): string {
    const info = pickInfo(p);
    return `<button class="pick" data-act="${act}" data-i="${i}" ${disabled ? 'disabled' : ''}><span class="big">${info.icon}</span><b><kbd>${i + 1}</kbd> ${esc(info.title)}</b><small>${esc(info.text)}</small>${extra}</button>`;
  }

  private rewardView(): string {
    const rw = this.rewards!;
    return `<div class="reward">
      <h2 class="good">${this.kind === 'boss' ? '👑 Boss defeated!' : '✨ Cleared!'}</h2>
      <p>💰 +${rw.gold} gold · ${this.b ? `${this.b.words} words, best combo ${this.b.bestCombo}, accuracy ${Math.round(accuracy(this.b) * 100)}%` : ''}</p>
      <h3>Choose one</h3>
      <div class="picks">${rw.picks.map((p, i) => this.pickHtml(p, i)).join('')}</div>
      <button data-act="skip">Skip</button>
    </div>`;
  }

  private shrineView(): string {
    return `<div class="reward">
      <span class="huge">⛩️</span><h2>Shrine of Words</h2>
      <p class="sub">The old stones teach one thing. Choose one.</p>
      <div class="picks">${this.picks.map((p, i) => this.pickHtml(p, i)).join('')}</div>
      ${this.loadout()}
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const items = this.shop
      .map((it, i) => {
        const ok = !it.sold && r.gold >= it.cost && !(it.pick.kind === 'heal' && r.hp >= r.maxHp);
        return this.pickHtml(it.pick, i, 'buy', `<span class="cost">${it.sold ? 'Sold' : `💰 ${it.cost}`}</span>`, !ok);
      })
      .join('');
    return `<div class="reward"><h2>🛒 Rune Merchant</h2><p>💰 ${r.gold} gold</p><div class="picks">${items}</div>
      <button class="primary" data-act="advance">Leave ▶</button>${this.loadout()}</div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Victory!' : '💀 Defeat'}</h1>
      <p>${e.victory ? 'The Storm Archmage falls silent. Your words won.' : `You fell in act ${e.act + 1}.`}</p>
      <p class="score">${DIFFS[e.diff].icon} ${DIFFS[e.diff].name} · Score <b>${e.score}</b>${e.best ? ' <span class="good">· new best!</span>' : ''}</p>
      <div class="endstats"><span><b>${e.wpm}</b> WPM</span><span><b>${e.acc}%</b> accuracy</span><span><b>${e.words}</b> words</span><span><b>${e.combo}</b> best combo</span></div>
      <p>💎 +${e.shards} shards for the Grimoire</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private kbdView(): string {
    const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    const keys = rows.map((r, i) => `<div class="krow">${r.split('').map((k) => `<button class="key" data-key="${k}">${k}</button>`).join('')}${i === 2 ? '<button class="key wide" data-key="Backspace">⌫</button>' : ''}</div>`).join('');
    return `<div class="kbd" id="kbd">${keys}<div class="krow"><button class="key space" data-key=" ">space</button></div></div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Type the word</b> above an enemy to cast a bolt at it. The first letter locks the closest matching enemy. Its word lights up as you type.</li>
          <li>A key that fits no word is a <b>typo</b>. It breaks your combo. Backspace removes a letter.</li>
          <li><b>Combo</b> (+5% damage per word, up to ×2) and <b>accuracy</b> raise your damage. Tough enemies need more than one word.</li>
          <li><b>Spell words</b> cost mana. Mana refills over time. Type an element first, then the target word:
            <b class="w">fire</b> burns, <b class="w">frost</b> slows, <b class="w">volt</b> chains to another enemy. <b class="w">lance</b> hits the whole lane.</li>
          <li><b class="w">nova</b> and <b class="w">wall</b> cast at once and use the primed element. <b class="w">nova</b> hits all enemies near you. <b class="w">wall</b> blocks a lane for a few seconds.</li>
          <li><b>Blue words</b> are shields. Break them first. <b>Red words</b> are decoys: do not type them. <b>Violet words</b> change every few seconds.</li>
          <li>Bosses have <b>phrases</b> with spaces. They throw missiles and call help.</li>
          <li>Between fights, learn spell words and runes at shrines, rewards and shops. You can also tap the spell chips.</li>
          <li><b>Esc</b> opens the menu and pauses. On menus, keys <kbd>1</kbd>–<kbd>4</kbd> pick and <kbd>Enter</kbd> continues.</li>
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

  // ---------- Fight HUD (DOM) ----------

  private updateHud(): void {
    const b = this.b;
    if (!b) return;
    const typed = this.root.querySelector<HTMLElement>('#typed');
    const prime = [b.elem, b.shape].filter(Boolean).map((s) => `<span class="prime" style="--c:${SPELLS[s!].color}">${SPELLS[s!].icon} ${s}</span>`).join('');
    const hud = `${prime}<span class="buf ${this.typoFlash > 0 ? 'bad' : ''}">${esc(b.buf).replace(/ /g, '␣')}</span><span class="caret"></span>${!b.buf && !prime ? '<span class="dim ph">type a word…</span>' : ''}`;
    if (typed && hud !== this.hudCache) {
      typed.innerHTML = hud;
      this.hudCache = hud;
    }
    const side = this.root.querySelector<HTMLElement>('#side');
    const cap = b.cfg.runes.includes('focus') ? 30 : 20;
    const spells = b.cfg.spells
      .map((id) => {
        const s = SPELLS[id];
        const cost = spellCost(b, id);
        const ok = b.mana >= cost;
        const on = b.elem === id || (id === 'lance' && b.shape === 'lance');
        return `<button class="spell ${ok ? '' : 'low'} ${on ? 'on' : ''}" data-act="cast" data-id="${id}" style="--c:${s.color}" title="${esc(s.text)}">${s.icon}<b>${s.word}</b><small>${cost}</small></button>`;
      })
      .join('');
    const side2 = `<div class="bars">
        <div class="bar hpbar"><div style="width:${(b.hp / b.maxHp) * 100}%"></div><span>❤️ ${b.hp}/${b.maxHp}${b.ward ? ' 🔰' : ''}</span></div>
        <div class="bar manabar"><div style="width:${(b.mana / b.maxMana) * 100}%"></div><span>🔷 ${Math.floor(b.mana)}/${b.maxMana}</span></div>
      </div>
      <div class="stat"><span>Combo <b>${b.combo}</b>${b.combo >= cap ? ' max' : ''}</span><span>×<b>${dmgMult(b).toFixed(2)}</b></span><span>Acc <b>${Math.round(accuracy(b) * 100)}%</b></span><span><b>${b.time > 3 ? Math.round(b.keys / 5 / (b.time / 60)) : 0}</b> WPM</span></div>
      <div class="spells">${spells}</div>`;
    if (side && side2 !== this.sideCache) {
      side.innerHTML = side2;
      this.sideCache = side2;
    }
    const hp = this.root.querySelector<HTMLElement>('#top-hp');
    if (hp) hp.textContent = `❤️ ${Math.max(0, b.hp)}/${b.maxHp}`;
  }

  // ---------- Canvas ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const narrow = window.innerWidth < 760;
    const maxW = Math.min(wrap.clientWidth || window.innerWidth - 20, 600);
    const h = (sel: string): number => this.root.querySelector<HTMLElement>(sel)?.offsetHeight ?? 0;
    const other = h('header.top') + h('#typed') + h('#kbd') + (narrow ? h('#side') + 12 : 0) + 34;
    const maxH = window.innerHeight - other;
    const w = Math.max(220, Math.min(maxW, (maxH * FW) / FH));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${w}px`;
    cv.style.height = `${(w * FH) / FW}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(((w * FH) / FW) * dpr);
    this.scale = (w / FW) * dpr;
  }

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (t: number) => {
      if (this.screen !== 'fight' || !this.ctx) {
        this.raf = 0;
        return;
      }
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      if (this.screen === 'fight' && this.ctx) this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private update(dt: number): void {
    const b = this.b;
    if (!b) return;
    const paused = !!this.modal || document.hidden;
    if (!paused) {
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        if (!b.over) stepBattle(b, DT);
      }
      this.drainEvents();
      if (this.banner) {
        this.banner.t -= dt;
        if (this.banner.t <= 0) this.banner = null;
      }
      if (b.over && this.finishing === 0) this.finishing = FAST ? 0.01 : 1.4;
      if (this.finishing > 0) {
        this.finishing -= dt;
        if (this.finishing <= 0) this.finishFight();
      }
    }
    this.fx(paused ? 0 : dt);
    this.updateHud();
  }

  private fx(dt: number): void {
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1);
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const x of this.bolts) x.t += dt;
    this.bolts = this.bolts.filter((x) => x.t < 0.25);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < 0.5);
    this.shake = Math.max(0, this.shake - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.typoFlash = Math.max(0, this.typoFlash - dt);
  }

  private burst(x: number, y: number, color: string, n: number, speed = 90): void {
    if (this.parts.length > 300) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random());
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, t: 0, life: 0.4 + Math.random() * 0.4, color });
    }
  }

  private float(x: number, y: number, text: string, color: string, size = 16): void {
    this.floats.push({ x, y, text, color, t: 0, size });
  }

  private drainEvents(): void {
    const b = this.b!;
    const evs: Ev[] = b.events.splice(0);
    let keySound = false;
    for (const e of evs) {
      switch (e.t) {
        case 'key':
          keySound = true;
          break;
        case 'typo':
          this.typoFlash = 0.25;
          sfx.typo();
          break;
        case 'hit':
          this.float(e.x + (Math.random() * 16 - 8), e.y, String(e.dmg), e.color, e.dmg >= 25 ? 20 : 16);
          this.burst(e.x, e.y + 10, e.color, 6);
          break;
        case 'shield':
          this.float(e.x, e.y - 20, '🛡️', '#8fd8ff', 16);
          this.burst(e.x, e.y, '#8fd8ff', 6);
          sfx.shield();
          break;
        case 'kill':
          this.burst(e.x, e.y, e.boss ? '#ffd166' : '#ffffff', e.boss ? 40 : 14, e.boss ? 160 : 100);
          if (e.boss) this.shake = 0.6;
          sfx.kill();
          break;
        case 'bolt':
          this.bolts.push({ x1: PX, y1: PY - 18, x2: e.x, y2: e.y, color: e.color, t: 0 });
          sfx.word(b.combo);
          break;
        case 'chain':
          this.bolts.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, color: SPELLS.volt.color, t: 0 });
          break;
        case 'nova':
          this.rings.push({ r: e.r, color: e.color, t: 0 });
          this.shake = 0.25;
          sfx.nova();
          break;
        case 'wall':
          sfx.wall();
          this.burst(LANES[e.lane], WALL_Y, SPELLS.wall.color, 12);
          break;
        case 'cast': {
          const s = SPELLS[e.spell];
          this.float(PX, PY - 40, `${s.icon} ${s.word}`, s.color, 15);
          if (e.spell === 'fire') sfx.fire();
          else if (e.spell === 'frost') sfx.frost();
          else if (e.spell === 'volt') sfx.volt();
          else if (e.spell === 'lance') sfx.lance();
          else if (e.spell === 'mend') sfx.heal();
          break;
        }
        case 'fizzle':
          this.float(PX, PY - 40, 'no mana', '#a99bbd', 14);
          sfx.fizzle();
          break;
        case 'hurt':
          this.hurtFlash = 0.35;
          this.shake = 0.3;
          this.float(PX, PY - 30, `-${e.dmg} ❤️`, '#ef476f', 18);
          this.burst(e.x, e.y, '#ef476f', 12);
          sfx.hurt();
          break;
        case 'block':
          this.float(e.x, e.y - 10, 'blocked', '#8fd8ff', 14);
          sfx.block();
          break;
        case 'heal':
          this.float(PX, PY - 30, `+${e.n} ❤️`, '#7ee08a', 18);
          sfx.heal();
          break;
        case 'decoy':
          this.float(e.x, e.y - 20, 'decoy!', '#ef476f', 16);
          break;
        case 'spawn':
          if (e.boss) sfx.boss();
          break;
        case 'echo':
          this.float(PX, PY - 56, '🔔 echo ×2', '#ffd166', 14);
          break;
      }
    }
    if (keySound) sfx.key();
  }

  private draw(): void {
    const ctx = this.ctx!;
    const b = this.b;
    if (!b) return;
    const s = this.scale;
    const act = ACTS[b.cfg.act];
    const sx = this.shake > 0 ? (Math.random() - 0.5) * 8 * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * 8 * this.shake : 0;
    ctx.setTransform(s, 0, 0, s, sx * s, sy * s);
    const g = ctx.createLinearGradient(0, 0, 0, FH);
    g.addColorStop(0, act.sky[0]);
    g.addColorStop(1, act.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(-10, -10, FW + 20, FH + 20);
    // Lanes
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    for (const x of [125, 235]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, TURN_Y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Danger zone and nova range
    ctx.strokeStyle = 'rgba(255,138,216,0.12)';
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.arc(PX, PY, NOVA_R * (b.cfg.runes.includes('widenova') ? 1.5 : 1), Math.PI, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    // Walls
    for (const w of b.walls) {
      const color = w.elem ? SPELLS[w.elem].color : SPELLS.wall.color;
      ctx.globalAlpha = 0.4 + 0.6 * Math.min(1, w.t / 1.5);
      ctx.fillStyle = color;
      ctx.fillRect(LANES[w.lane] - 52, WALL_Y - 8, 104, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let i = 0; i < 6; i++) ctx.fillRect(LANES[w.lane] - 52 + i * 18, WALL_Y - 8, 2, 10);
      ctx.globalAlpha = 1;
    }
    // Enemies
    const list = [...b.enemies].sort((p, q) => p.y - q.y);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of list) this.drawEnemy(ctx, e);
    // Player
    const pc = b.elem ? SPELLS[b.elem].color : ACCENT;
    const pulse = 1 + Math.sin(b.time * 4) * 0.08;
    const rg = ctx.createRadialGradient(PX, PY, 4, PX, PY, 34 * pulse);
    rg.addColorStop(0, pc + '88');
    rg.addColorStop(1, pc + '00');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(PX, PY, 34 * pulse, 0, Math.PI * 2);
    ctx.fill();
    if (b.ward) {
      ctx.strokeStyle = 'rgba(143,216,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(PX, PY, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = '32px serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🧙', PX, PY);
    if (b.elem || b.shape) {
      ctx.font = '16px serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText([b.elem, b.shape].filter(Boolean).map((x) => SPELLS[x!].icon).join(''), PX + 22, PY - 20);
    }
    // Bolts
    for (const x of this.bolts) {
      const a = 1 - x.t / 0.25;
      ctx.strokeStyle = x.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = 3;
      ctx.shadowColor = x.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(x.x1, x.y1);
      const n = 6;
      for (let i = 1; i < n; i++) {
        const k = i / n;
        ctx.lineTo(x.x1 + (x.x2 - x.x1) * k + (Math.random() - 0.5) * 12, x.y1 + (x.y2 - x.y1) * k + (Math.random() - 0.5) * 12);
      }
      ctx.lineTo(x.x2, x.y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    for (const r of this.rings) {
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - r.t / 0.5;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(PX, PY, r.r * Math.min(1, r.t / 0.25), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const p of this.parts) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    // Labels on top of everything; the target last.
    // Labels on top; push overlapping labels up so each word stays readable.
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const boxes = new Map<number, { x: number; y: number }>();
    for (const e of [...list].reverse()) {
      const box = this.labelBox(ctx, e);
      for (let i = 0; i < 4; i++) {
        const hit = placed.find((p) => box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y);
        if (!hit) break;
        box.y = hit.y - box.h - 2;
      }
      placed.push(box);
      boxes.set(e.uid, box);
    }
    for (const e of list) if (e.uid !== b.target) this.drawLabel(ctx, e, boxes.get(e.uid)!, false);
    const tgt = list.find((e) => e.uid === b.target);
    if (tgt) this.drawLabel(ctx, tgt, boxes.get(tgt.uid)!, true);
    for (const f of this.floats) {
      ctx.globalAlpha = 1 - f.t;
      ctx.font = `700 ${f.size}px system-ui, sans-serif`;
      ctx.fillStyle = f.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y - f.t * 30);
      ctx.fillText(f.text, f.x, f.y - f.t * 30);
    }
    ctx.globalAlpha = 1;
    // Progress bar
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, FW, 4);
    ctx.fillStyle = b.cfg.kind === 'boss' ? '#ffd166' : ACCENT;
    ctx.fillRect(0, 0, FW * Math.max(0, Math.min(1, progress(b))), 4);
    if (this.hurtFlash > 0) {
      const v = ctx.createRadialGradient(FW / 2, FH / 2, FH * 0.3, FW / 2, FH / 2, FH * 0.7);
      v.addColorStop(0, 'rgba(239,71,111,0)');
      v.addColorStop(1, `rgba(239,71,111,${this.hurtFlash})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, FW, FH);
    }
    if (this.banner || b.over) {
      const text = b.over === 'win' ? (b.cfg.kind === 'boss' ? 'Boss defeated!' : 'Cleared!') : b.over === 'lose' ? 'You fall…' : this.banner!.text;
      const sub = b.over ? '' : this.banner!.sub;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, FH / 2 - 44, FW, 88);
      ctx.font = '700 28px system-ui, sans-serif';
      ctx.fillStyle = b.over === 'lose' ? '#ef476f' : b.over === 'win' ? '#7ee08a' : '#ffffff';
      ctx.fillText(text, FW / 2, FH / 2 - (sub ? 10 : 0));
      if (sub) {
        ctx.font = '14px system-ui, sans-serif';
        ctx.fillStyle = '#a9c4d8';
        ctx.fillText(sub, FW / 2, FH / 2 + 20);
      }
    }
    if (this.modal) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, FW, FH);
    }
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
    const d = def(e);
    const size = d.size ?? 30;
    const t = this.b!.time;
    if (isDecoy(e)) ctx.globalAlpha = 0.55 + Math.sin(t * 5) * 0.2;
    if (e.freeze > 0 || e.slow > 0) {
      ctx.fillStyle = e.freeze > 0 ? 'rgba(143,216,255,0.45)' : 'rgba(143,216,255,0.2)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, size * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.held) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(e.x - size / 2, e.y - size / 2, size, size);
    }
    ctx.font = `${size}px serif`;
    ctx.fillStyle = '#ffffff';
    const bob = isBoss(e) ? 0 : Math.sin(e.age * 6 + e.uid) * 1.5;
    ctx.fillText(d.icon, e.x, e.y + bob);
    if (e.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${e.flash * 3})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.burn > 0 && Math.random() < 0.5) this.parts.push({ x: e.x + (Math.random() - 0.5) * size * 0.6, y: e.y, vx: 0, vy: -40, t: 0, life: 0.35, color: Math.random() < 0.5 ? '#ff7b3a' : '#ffd166' });
    ctx.globalAlpha = 1;
    if (e.hp < e.max && !isDecoy(e)) {
      const w = Math.max(24, size);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2, e.y + size / 2 + 2, w, 4);
      ctx.fillStyle = isBoss(e) ? '#ffd166' : '#ef476f';
      ctx.fillRect(e.x - w / 2, e.y + size / 2 + 2, (w * Math.max(0, e.hp)) / e.max, 4);
    }
  }

  private labelFont(e: Enemy): number {
    return isBoss(e) ? 15 : 14;
  }

  private labelBox(ctx: CanvasRenderingContext2D, e: Enemy): { x: number; y: number; w: number; h: number } {
    const size = def(e).size ?? 30;
    const fs = this.labelFont(e);
    ctx.font = `600 ${fs}px ui-monospace, Menlo, Consolas, monospace`;
    const shieldTxt = e.shield > 0 ? '🛡'.repeat(e.shield) + ' ' : '';
    const total = ctx.measureText(e.word).width + (shieldTxt ? ctx.measureText(shieldTxt).width : 0) + 12;
    const x = Math.max(2, Math.min(FW - total - 2, e.x - total / 2));
    const cy = isBoss(e) ? e.y + size / 2 + 20 : e.y - size / 2 - 10;
    return { x, y: cy - fs / 2 - 4, w: total, h: fs + 8 };
  }

  private drawLabel(ctx: CanvasRenderingContext2D, e: Enemy, box: { x: number; y: number }, target: boolean): void {
    const b = this.b!;
    const d = def(e);
    const typed = target ? b.buf : '';
    const word = e.word;
    const fs = this.labelFont(e);
    ctx.font = `600 ${fs}px ui-monospace, Menlo, Consolas, monospace`;
    const shieldTxt = e.shield > 0 ? '🛡'.repeat(e.shield) + ' ' : '';
    const sw = shieldTxt ? ctx.measureText(shieldTxt).width : 0;
    const total = ctx.measureText(word).width + sw + 12;
    const x = box.x;
    const y = box.y + fs / 2 + 4;
    ctx.fillStyle = target ? 'rgba(10,30,45,0.92)' : 'rgba(5,10,20,0.72)';
    const border = isDecoy(e) ? '#ef476f' : e.shield > 0 ? '#8fd8ff' : d.special === 'shift' ? '#c77dff' : target ? ACCENT : 'rgba(255,255,255,0.15)';
    ctx.strokeStyle = border;
    ctx.lineWidth = target ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y - fs / 2 - 4, total, fs + 8, 6);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    let cx = x + 6;
    if (shieldTxt) {
      ctx.fillStyle = '#8fd8ff';
      ctx.fillText(shieldTxt, cx, y + 1);
      cx += sw;
    }
    const restColor = isDecoy(e) ? '#ff8a9a' : e.shield > 0 ? '#bfe9ff' : d.special === 'shift' ? '#e0c3ff' : '#f2f6fa';
    if (typed) {
      ctx.fillStyle = ACCENT;
      ctx.fillText(typed, cx, y + 1);
      cx += ctx.measureText(typed).width;
    }
    ctx.fillStyle = restColor;
    ctx.fillText(word.slice(typed.length), cx, y + 1);
    ctx.textAlign = 'center';
  }

  // ---------- Flow ----------

  private beginFight(kind: FightKind): void {
    const r = this.run!;
    saveRun(r);
    this.kind = kind;
    this.b = newBattle(battleCfg(r, kind));
    this.floats = [];
    this.parts = [];
    this.bolts = [];
    this.rings = [];
    this.finishing = 0;
    this.acc = 0;
    const act = ACTS[r.act];
    const title = kind === 'boss' ? `${ENEMIES[act.boss].icon} ${ENEMIES[act.boss].name}` : kind === 'elite' ? `${ENEMIES[act.elite].icon} Elite: ${ENEMIES[act.elite].name}` : `${act.icon} ${act.name}`;
    this.banner = FAST ? null : { text: title, sub: kind === 'boss' ? 'Type its phrases. Spaces count.' : 'Type the words to cast.', t: 1.6 };
    this.screen = 'fight';
    this.render();
  }

  private finishFight(): void {
    const b = this.b!;
    const r = this.run!;
    afterBattle(r, b);
    this.finishing = 0;
    if (b.over === 'lose') {
      this.endRun(false);
      return;
    }
    const rw = fightRewards(r, this.meta, this.kind);
    r.gold += rw.gold;
    this.rewards = rw;
    sfx.coin();
    this.screen = 'reward';
    saveRun(r);
    this.render();
  }

  private nextStep(): void {
    const r = this.run!;
    if (advance(r)) {
      this.endRun(true);
      return;
    }
    saveRun(r);
    this.screen = 'map';
    if (r.step === 0) this.toast(`${ACTS[r.act].icon} Act ${r.act + 1}: ${ACTS[r.act].name}`);
    this.render();
  }

  private enterRoom(room: RoomKind): void {
    const r = this.run!;
    if (room === 'fight' || room === 'elite' || room === 'boss') return this.beginFight(room);
    if (room === 'shrine') {
      this.picks = shrinePicks(r, this.meta);
      this.screen = 'shrine';
    } else {
      this.shop = makeShop(r, this.meta);
      this.screen = 'shop';
    }
    this.render();
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const sc = score(r, victory);
    const shards = shardsFor(sc);
    const m = this.meta;
    m.runs++;
    if (victory) m.wins++;
    m.bestAct = Math.max(m.bestAct, Math.min(3, r.act + 1));
    m.best = Math.max(m.best, sc);
    const diff = r.diff ?? 'normal';
    m.bestBy = m.bestBy ?? {};
    m.winsBy = m.winsBy ?? {};
    const best = sc > (m.bestBy[diff] ?? 0);
    if (best) m.bestBy[diff] = sc;
    if (victory) m.winsBy[diff] = (m.winsBy[diff] ?? 0) + 1;
    m.bestWpm = Math.max(m.bestWpm, wpm(r.stats));
    m.shards += shards;
    saveMeta(m);
    clearRun();
    this.end = { diff, best, victory, score: sc, shards, act: Math.min(r.act, 2), wpm: wpm(r.stats), acc: Math.round(accuracyOf(r.stats) * 100), words: r.stats.words, combo: r.stats.bestCombo };
    this.run = null;
    this.b = null;
    this.modal = null;
    this.screen = 'end';
    if (victory) sfx.win();
    else sfx.lose();
    this.render();
  }

  // ---------- Input ----------

  private typeChar(ch: string): void {
    const b = this.b;
    if (!b || this.modal || b.over) return;
    initAudio();
    if (this.banner) this.banner = null;
    if (ch === 'Backspace') backspace(b);
    else typeKey(b, ch);
    this.drainEvents();
    this.updateHud();
  }

  private onKbd(e: PointerEvent): void {
    const key = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
    if (!key) return;
    e.preventDefault();
    key.classList.add('down');
    setTimeout(() => key.classList.remove('down'), 90);
    this.typeChar(key.dataset.key!);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen === 'fight') {
      if (e.key === 'Escape') {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
        return;
      }
      if (e.key === 'Backspace' || (e.key.length === 1 && /^[a-zA-Z ]$/.test(e.key))) {
        e.preventDefault();
        this.typeChar(e.key);
      }
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= 9) {
      const el = this.root.querySelectorAll<HTMLButtonElement>('[data-act="room"], [data-act="pick"], [data-act="buy"]')[n - 1];
      if (el && !el.disabled) el.click();
    } else if (e.key === 'Enter') {
      const el = this.root.querySelector<HTMLButtonElement>('button.primary');
      if (el && !el.disabled) {
        e.preventDefault();
        el.click();
      }
    } else if (e.key === 'Escape' && this.run && this.screen !== 'title' && this.screen !== 'end') {
      this.modal = { kind: 'menu', confirm: false };
      this.render();
    }
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'modal-close' && t.closest('[data-stop]') && el.classList.contains('modal')) return;
    initAudio();
    this.action(el.dataset.act!, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const r = this.run;
    switch (act) {
      case 'new':
        this.run = newRun(randomSeedText(), this.meta);
        saveRun(this.run);
        this.screen = 'map';
        this.toast(`${ACTS[0].icon} Act 1: ${ACTS[0].name}`);
        this.render();
        break;
      case 'diff':
        this.meta.diff = d.id!;
        saveMeta(this.meta);
        sfx.click();
        this.render();
        break;
      case 'continue':
        this.screen = 'map';
        this.render();
        break;
      case 'help':
        this.modal = { kind: 'help' };
        this.render();
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        this.render();
        break;
      case 'modal-close':
        this.modal = null;
        this.render();
        break;
      case 'mute':
        toggleMute();
        this.render();
        break;
      case 'kbd':
        this.showKbd = !this.showKbd;
        this.render();
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        break;
      case 'abandon-yes':
        this.modal = null;
        if (r) this.endRun(false);
        break;
      case 'title':
        this.modal = null;
        this.b = null;
        this.screen = 'title';
        this.render();
        break;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.shards >= cost && !this.meta.unlocked.includes(id)) {
          this.meta.shards -= cost;
          this.meta.unlocked.push(id);
          saveMeta(this.meta);
          sfx.item();
        }
        this.render();
        break;
      }
      case 'room':
        sfx.click();
        this.enterRoom(d.room as RoomKind);
        break;
      case 'cast': {
        const b = this.b;
        if (!b || b.over) break;
        clearBuf(b);
        for (const ch of SPELLS[d.id!].word) this.typeChar(ch);
        break;
      }
      case 'pick': {
        const list = this.screen === 'reward' ? this.rewards!.picks : this.picks;
        const p = list[Number(d.i)];
        if (!p || !r) break;
        applyPick(r, p);
        sfx.item();
        this.toast(`${pickInfo(p).icon} ${pickInfo(p).title}`);
        this.nextStep();
        break;
      }
      case 'skip':
        this.nextStep();
        break;
      case 'buy': {
        const it = this.shop[Number(d.i)];
        if (!r || !it || it.sold || r.gold < it.cost) {
          sfx.deny();
          break;
        }
        r.gold -= it.cost;
        it.sold = true;
        applyPick(r, it.pick);
        sfx.coin();
        saveRun(r);
        this.render();
        break;
      }
      case 'advance':
        this.nextStep();
        break;
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLButtonElement>(sel);
      if (!el || el.disabled) return false;
      el.click();
      return true;
    };
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        diff: this.run?.diff ?? this.meta.diff ?? 'normal',
        act: this.run?.act ?? null,
        step: this.run?.step ?? null,
        hp: this.run?.hp ?? null,
        gold: this.run?.gold ?? null,
        spells: this.run?.spells ?? null,
        runes: this.run?.runes ?? null,
        fight: this.b && this.screen === 'fight' ? { kind: this.kind, time: Math.round(this.b.time), hp: this.b.hp, mana: Math.round(this.b.mana), combo: this.b.combo, buf: this.b.buf, over: this.b.over, enemies: this.b.enemies.map((e) => `${e.id}:${e.word}:${Math.ceil(e.hp)}`) } : null,
        end: this.end,
      }),
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.render();
      },
      shards: (n: number) => {
        this.meta.shards += n;
        saveMeta(this.meta);
        this.render();
      },
      type: (s: string) => {
        for (const ch of s) this.typeChar(ch);
      },
      win: () => {
        if (!this.b) return;
        this.b.queue = [];
        this.b.enemies = [];
        this.b.over = 'win';
      },
      /** One bot action. In a fight it plays `sec` seconds with a good typist bot. */
      step: (sec = 3) => {
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'map': {
            const r = this.run!;
            const opts = r.map[r.act][r.step];
            let room = opts[0];
            if (opts.includes('shop') && r.gold >= 45) room = 'shop';
            else if (opts.includes('shrine') && r.hp <= r.maxHp - 4) room = 'shrine';
            else if (opts.includes('fight')) room = 'fight';
            click(`[data-room="${room}"]`);
            return room;
          }
          case 'fight': {
            const b = this.b!;
            if (b.over) {
              if (FAST || this.finishing <= 0) this.finishFight();
              else return 'busy';
              return 'finish';
            }
            this.banner = null;
            if (!this.bot) this.bot = new Typist({ ...GOOD_BOT, cps: 7, err: 0.02, react: 0.2 }, new Rng(1234));
            for (let t = 0; t < sec && !b.over; t += 0.05) {
              this.bot.tick(b, 0.05);
              stepBattle(b, 0.05);
            }
            this.drainEvents();
            this.updateHud();
            if (b.over && FAST) this.finishFight();
            return 'typed';
          }
          case 'reward':
          case 'shrine': {
            const r = this.run!;
            const list = this.screen === 'reward' ? this.rewards!.picks : this.picks;
            const rank = (p: Pick): number => (p.kind === 'heal' ? (r.hp <= r.maxHp - 4 ? 100 : 1) : p.kind === 'spell' ? 50 : p.kind === 'rune' ? 40 : 20);
            const best = list.map((p, i) => [rank(p), i] as const).sort((a, c) => c[0] - a[0])[0];
            if (best) click(`[data-act="pick"][data-i="${best[1]}"]`);
            else click('[data-act="skip"]');
            return 'pick';
          }
          case 'shop':
            if (click('[data-act="buy"]:not([disabled])')) return 'buy';
            click('[data-act="advance"]');
            return 'leave';
          case 'end':
            return 'end';
        }
        return 'idle';
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
