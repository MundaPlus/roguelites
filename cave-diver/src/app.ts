/** Screens, input, game loop and the debug API. */
import { Bot } from './bot';
import { ENEMIES, ITEMS, LEVEL_COUNT, LEVELS_PER_ZONE, PASSIVES, TS, ZONES, levelName, zoneOf } from './data';
import { generateLevel } from './level';
import { Renderer } from './render';
import { Rng, hash, randomSeedText } from './rng';
import {
  SHORTCUT_NEED,
  carryOf,
  clearRun,
  endRun,
  finishLevel,
  loadMeta,
  loadRun,
  newRun,
  saveMeta,
  saveRun,
  score,
  shortcutOpen,
  type RunState,
} from './run';
import { initAudio, isMuted, play, setMuted, toggleMute } from './sfx';
import { World, noInput, type Input } from './world';

type Screen = 'title' | 'play' | 'cleared' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };
type Key = keyof Input;

const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
const FAST = PARAMS.has('fast');
const STEP_MS = 1000 / 60;

const KEYMAP: Record<string, Key> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyZ: 'jump',
  KeyK: 'jump',
  KeyX: 'attack',
  KeyJ: 'attack',
  KeyC: 'bomb',
  KeyL: 'bomb',
  KeyV: 'rope',
  KeyR: 'rope',
};

const ZONE_TEXT = [
  'Snakes, bats and cavemen. Mind the spikes and the arrow traps.',
  'Frogs hop, mantraps chew, logs fall from the ceiling.',
  'The floors are slick. Icicles drop. Yetis hit hard.',
  'Lava pools, crushing blocks, mummies. The Stone King waits at the bottom.',
];

interface Cleared {
  name: string;
  gold: number;
  kills: number;
  pet: boolean;
  secs: number;
  next: number;
}

interface EndInfo {
  victory: boolean;
  score: number;
  level: number;
  gold: number;
  kills: number;
  pets: number;
  cause: string;
  secs: number;
}

const fmtTime = (frames: number): string => {
  const s = Math.floor(frames / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private world: World | null = null;
  private renderer = new Renderer();
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private scale = 2;
  private dpr = 1;

  private last = 0;
  private acc = 0;
  private keys = new Set<Key>();
  private touch = new Map<number, Key>();
  private cleared: Cleared | null = null;
  private end: EndInfo | null = null;
  private cause = '';
  private hudKey = '';
  private startZone = 0;
  private showPad: boolean;
  private botDriven = false;
  private bot: Bot | null = null;
  private teleports = 0;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    let padPref: string | null = null;
    try {
      setMuted(localStorage.getItem('cave.mute') === '1');
      padPref = localStorage.getItem('cave.pad');
    } catch {
      /* ignore */
    }
    this.showPad = padPref ? padPref === '1' : matchMedia('(pointer: coarse)').matches || innerWidth < 700;
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.clear();
    });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'play' && !this.modal) {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
      }
    });
    root.addEventListener('pointerdown', (e) => this.padDown(e));
    window.addEventListener('pointermove', (e) => this.padMove(e));
    window.addEventListener('pointerup', (e) => this.padUp(e));
    window.addEventListener('pointercancel', (e) => this.padUp(e));
    if (DEBUG) this.installDebug();
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- Input ----------

  private input(): Input {
    const inp = noInput();
    for (const k of this.keys) inp[k] = true;
    for (const k of this.touch.values()) inp[k] = true;
    return inp;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (down) initAudio();
    const k = KEYMAP[e.code];
    if (this.screen === 'play' && !this.modal) {
      if (k) {
        e.preventDefault();
        if (down) this.keys.add(k);
        else this.keys.delete(k);
      }
      if (down && e.code === 'Escape') {
        this.modal = { kind: 'menu', confirm: false };
        this.keys.clear();
        this.render();
      }
    } else if (!down && k) this.keys.delete(k);
    if (!down) return;
    if (this.modal && e.code === 'Escape') {
      this.modal = null;
      this.render();
      return;
    }
    if (e.code === 'KeyM') this.act('mute');
    if (!this.modal && (e.code === 'Enter' || (e.code === 'Space' && this.screen !== 'play'))) {
      const primary = this.root.querySelector<HTMLElement>('main button.primary');
      if (primary) {
        e.preventDefault();
        primary.click();
      }
    }
  }

  private padKeyAt(x: number, y: number): Key | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const b = el?.closest<HTMLElement>('[data-k]');
    return b ? (b.dataset.k as Key) : null;
  }

  private padDown(e: PointerEvent): void {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLElement>('[data-k]');
    if (!b) return;
    e.preventDefault();
    initAudio();
    this.touch.set(e.pointerId, b.dataset.k as Key);
    this.markPad();
  }

  private padMove(e: PointerEvent): void {
    if (!this.touch.has(e.pointerId)) return;
    const cur = this.touch.get(e.pointerId)!;
    // Slide between the arrow keys without lifting the finger.
    if (cur === 'left' || cur === 'right' || cur === 'up' || cur === 'down') {
      const k = this.padKeyAt(e.clientX, e.clientY);
      if (k && k !== cur && (k === 'left' || k === 'right' || k === 'up' || k === 'down')) {
        this.touch.set(e.pointerId, k);
        this.markPad();
      }
    }
  }

  private padUp(e: PointerEvent): void {
    if (!this.touch.delete(e.pointerId)) return;
    this.markPad();
  }

  private markPad(): void {
    const on = new Set(this.touch.values());
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((b) => b.classList.toggle('on', on.has(b.dataset.k as Key)));
  }

  // ---------- Loop ----------

  private loop(t: number): void {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(100, t - (this.last || t));
    this.last = t;
    if (this.screen !== 'play' || !this.world) return;
    if (!this.modal && !this.botDriven && !document.hidden) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP_MS && n < 6) {
        this.tick(this.input());
        this.acc -= STEP_MS;
        n++;
        if (this.screen !== 'play') return;
      }
      if (n === 6) this.acc = 0;
    }
    this.draw();
  }

  private tick(inp: Input): void {
    const w = this.world!;
    w.step(inp);
    for (const ev of w.events) {
      if (ev.kind === 'sfx') play(ev.name);
      else if (ev.kind === 'toast') {
        if (ev.text.startsWith('💀')) this.cause = ev.text.replace('💀 ', '').replace(/\.$/, '');
        this.toast(ev.text);
      } else this.renderer.fx(ev);
    }
    w.events.length = 0;
    this.renderer.tick(w, inp.down);
    this.updateHud();
    if (w.done) this.levelDone();
  }

  private draw(): void {
    if (!this.ctx || !this.world) return;
    this.renderer.draw(this.ctx, this.world, this.scale, this.dpr);
  }

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const stage = cv.parentElement!;
    const r = stage.getBoundingClientRect();
    const cw = Math.max(100, Math.floor(r.width));
    const ch = Math.max(100, Math.floor(r.height));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.floor(cw * this.dpr);
    cv.height = Math.floor(ch * this.dpr);
    cv.style.width = `${cw}px`;
    cv.style.height = `${ch}px`;
    this.scale = Math.max(1.4, Math.min(cw / (15 * TS), ch / (11 * TS)));
    this.renderer.viewW = cw / this.scale;
    this.renderer.viewH = ch / this.scale;
    this.ctx = cv.getContext('2d');
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
    this.draw();
  }

  // ---------- Run flow ----------

  private startRun(zone: number): void {
    this.run = newRun(randomSeedText(), zone);
    this.teleports = 0;
    if (zone > 0) this.toast(`${ZONES[zone].icon} Shortcut to the ${ZONES[zone].name}!`);
    this.startLevel();
  }

  private startLevel(): void {
    const r = this.run!;
    saveRun(r);
    this.world = new World(generateLevel(r.seed, r.level), carryOf(r), r.seed);
    this.bot = null;
    this.cause = '';
    this.renderer.reset();
    this.screen = 'play';
    this.modal = null;
    this.keys.clear();
    this.touch.clear();
    this.hudKey = '';
    this.render();
    const z = ZONES[zoneOf(r.level)];
    this.banner(r.level === LEVEL_COUNT - 1 ? '🗿 The Stone King' : `${z.icon} ${levelName(r.level)} · ${z.name}`);
  }

  private levelDone(): void {
    const w = this.world!;
    const r = this.run!;
    if (w.done === 'exit') {
      const name = levelName(r.level);
      const won = finishLevel(r, w, this.meta);
      saveMeta(this.meta);
      if (won) {
        this.finish(true);
        return;
      }
      saveRun(r);
      this.cleared = { name, gold: w.levelGold, kills: w.levelKills, pet: w.petRescued, secs: Math.floor(w.frame / 60), next: r.level };
      this.screen = 'cleared';
      this.world = null;
      this.render();
    } else {
      r.gold = w.gold;
      r.kills = w.kills;
      r.frames += w.frame;
      this.finish(false);
    }
  }

  private finish(victory: boolean): void {
    const r = this.run!;
    const s = endRun(this.meta, r, victory);
    saveMeta(this.meta);
    clearRun();
    this.end = { victory, score: s, level: r.level, gold: r.gold, kills: r.kills, pets: r.pets, cause: this.cause, secs: Math.floor(r.frames / 60) };
    this.run = null;
    this.world = null;
    this.screen = 'end';
    play(victory ? 'win' : 'lose');
    this.render();
  }

  // ---------- DOM ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'play':
        body = this.playView();
        break;
      case 'cleared':
        body = this.clearedView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    this.root.classList.toggle('playing', this.screen === 'play');
    this.root.innerHTML = `${this.screen === 'play' ? this.topBar() : ''}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    this.hudKey = '';
    if (this.screen === 'play') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.resize();
      this.updateHud();
      this.markPad();
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

  private banner(text: string): void {
    const b = this.root.querySelector<HTMLElement>('#banner');
    if (!b || FAST) return;
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  private hudHtml(): string {
    const w = this.world;
    if (!w) return '';
    const items = w.items.map((id) => `<span title="${ITEMS[id].name}: ${ITEMS[id].text}">${ITEMS[id].icon}</span>`).join('');
    const z = ZONES[w.level.zone];
    const late = w.ghostIn() < 30 * 60 && !w.level.boss;
    const pet = w.ents.some((e) => e.kind === 'pet' && e.state === 'follow');
    return `<span class="stat hp" title="Health">❤️ ${w.hp}</span>
      <span class="stat" title="Bombs">💣 ${w.bombs}</span>
      <span class="stat" title="Ropes">🪢 ${w.ropesLeft}</span>
      <span class="stat gold" title="Gold">💰 ${w.gold}</span>
      <span class="stat lvl" title="${z.name}">${z.icon} ${levelName(w.level.index)}</span>
      <span class="stat ${late ? 'late' : ''}" title="The ghost comes at 3:00">⏱ ${fmtTime(w.frame)}</span>
      ${pet ? '<span class="stat" title="Pet following you">🐾</span>' : ''}
      <span class="items">${items}</span>`;
  }

  private updateHud(): void {
    const el = this.root.querySelector<HTMLElement>('#hud');
    if (!el || !this.world) return;
    const w = this.world;
    const key = `${w.hp}|${w.bombs}|${w.ropesLeft}|${w.gold}|${w.items.length}|${Math.floor(w.frame / 60)}|${w.ents.some((e) => e.kind === 'pet' && e.state === 'follow')}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    el.innerHTML = this.hudHtml();
  }

  private topBar(): string {
    return `<header class="top">
      <div class="hud" id="hud"></div>
      <span class="grow"></span>
      <button class="icon-btn" data-act="pad" title="Touch buttons">🎮</button>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private playView(): string {
    const pad = this.showPad
      ? `<div class="pad" id="pad">
          <div class="dpad">
            <button class="pk up" data-k="up" aria-label="Up">▲</button>
            <button class="pk left" data-k="left" aria-label="Left">◀</button>
            <button class="pk right" data-k="right" aria-label="Right">▶</button>
            <button class="pk down" data-k="down" aria-label="Down">▼</button>
          </div>
          <div class="acts">
            <button class="ak rope" data-k="rope">🪢<small>Rope</small></button>
            <button class="ak bomb" data-k="bomb">💣<small>Bomb</small></button>
            <button class="ak whip" data-k="attack">〰️<small>Whip</small></button>
            <button class="ak jump" data-k="jump">⤒<small>Jump</small></button>
          </div>
        </div>`
      : '';
    const keys = this.showPad
      ? ''
      : `<p class="keys"><b>←→</b> move · <b>↑↓</b> climb, look down · <b>Z</b>/<b>Space</b> jump · <b>X</b> whip · <b>C</b> bomb · <b>V</b> rope · <b>↑</b> buy · <b>↓</b>+<b>X</b> pick up · <b>Esc</b> menu</p>`;
    return `<div class="stage"><canvas id="cv"></canvas><div class="banner" id="banner"></div></div>${pad}${keys}`;
  }

  private titleView(): string {
    const m = this.meta;
    const r = this.run;
    const zones = ZONES.map((z, i) => {
      const open = shortcutOpen(m, i);
      const label = open ? `${z.icon} ${z.name}` : `🔒 ${z.name} ${Math.min(m.reached[i] ?? 0, SHORTCUT_NEED)}/${SHORTCUT_NEED}`;
      return `<button class="chip ${this.startZone === i ? 'sel' : ''}" data-act="zone" data-z="${i}" ${open ? '' : 'disabled'} title="${open ? `Start in the ${z.name}` : `Reach the ${z.name} ${SHORTCUT_NEED} times to open this shortcut`}">${label}</button>`;
    }).join('');
    return `<div class="title">
      <div class="logo">🪢</div>
      <h1>Cave Diver</h1>
      <p class="sub">Run, jump, whip and bomb your way down 16 cave levels. Rescue pets for health. Beat the Stone King at the bottom of the temple.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue · level ${levelName(r.level)} · ❤️ ${r.hp} · 💰 ${r.gold}</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <div class="zones"><span class="dim">Start in:</span>${zones}</div>
      <button data-act="help">How to play</button>
      <div class="log">
        <h2>Explorer's log</h2>
        <p>Runs <b>${m.runs}</b> · Wins <b>${m.wins}</b> · Deepest <b>${m.bestLevel ? levelName(Math.min(LEVEL_COUNT - 1, m.bestLevel - 1)) : '–'}</b> · Best score <b>${m.bestScore}</b></p>
        <p>Pets saved <b>${m.pets}</b> · Enemies beaten <b>${m.kills}</b></p>
        <p class="dim">Reach a zone ${SHORTCUT_NEED} times to open a shortcut to it.</p>
      </div>
    </div>`;
  }

  private clearedView(): string {
    const c = this.cleared!;
    const r = this.run!;
    const nz = zoneOf(c.next);
    const newZone = c.next % LEVELS_PER_ZONE === 0;
    const boss = c.next === LEVEL_COUNT - 1;
    const items = r.items.map((id) => `<span title="${ITEMS[id].name}">${ITEMS[id].icon}</span>`).join(' ');
    return `<div class="cleared">
      <h1 class="good">Level ${c.name} cleared!</h1>
      <div class="stats-grid">
        <div><b>⏱ ${fmtTime(c.secs * 60)}</b><small>Time</small></div>
        <div><b>💰 +${c.gold}</b><small>Gold found</small></div>
        <div><b>⚔️ ${c.kills}</b><small>Enemies</small></div>
        <div><b>${c.pet ? '🐾 +1 ❤️' : '–'}</b><small>Pet</small></div>
      </div>
      <p class="carry">❤️ ${r.hp} · 💣 ${r.bombs} · 🪢 ${r.ropes} · 💰 ${r.gold} ${items ? `· ${items}` : ''}</p>
      ${
        boss
          ? `<div class="next boss"><span class="big">🗿</span><div><b>The Stone King</b><p>It leaps at you and shakes the floor when it lands. Jump as it lands. Whip it when it rests.</p></div></div>`
          : newZone
            ? `<div class="next"><span class="big">${ZONES[nz].icon}</span><div><b>Entering the ${ZONES[nz].name}</b><p>${ZONE_TEXT[nz]}</p></div></div>`
            : `<p class="dim">Next: ${ZONES[nz].icon} ${levelName(c.next)} · ${ZONES[nz].name}</p>`
      }
      <button class="primary" data-act="next">Continue ▶</button>
      <button data-act="title">Title screen (saves the run)</button>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <div class="logo">${e.victory ? '🏆' : '💀'}</div>
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? 'Victory!' : 'Run over'}</h1>
      <p>${e.victory ? 'The Stone King is dust. You climb out rich.' : `${e.cause || 'You fell'} in level ${levelName(Math.min(LEVEL_COUNT - 1, e.level))}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <div class="stats-grid">
        <div><b>💰 ${e.gold}</b><small>Gold</small></div>
        <div><b>⚔️ ${e.kills}</b><small>Enemies</small></div>
        <div><b>🐾 ${e.pets}</b><small>Pets saved</small></div>
        <div><b>⏱ ${fmtTime(e.secs * 60)}</b><small>Time</small></div>
      </div>
      <button class="primary" data-act="new">▶ New run</button>
      <button data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const enemies = Object.values(ENEMIES)
        .map((d) => `<tr><td>${d.icon}</td><td><b>${d.name}</b> · ${d.hp} HP</td><td>${d.text}</td></tr>`)
        .join('');
      const items = [...PASSIVES, 'bombbag', 'ropepile', 'potion'].map((id) => `<tr><td>${ITEMS[id].icon}</td><td><b>${ITEMS[id].name}</b></td><td>${ITEMS[id].text}</td></tr>`).join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Get to the exit door</b> at the bottom of each cave. The way down always exists. Bombs and ropes open new ways.</li>
          <li><b>Move</b> ←→ (A D). <b>Jump</b> Z, Space or K. Hold jump to jump higher. You can still jump a moment after you leave a ledge.</li>
          <li><b>Climb</b> ladders and ropes with ↑↓. Jump into a wall edge to <b>hang</b> on it, then jump again to climb up.</li>
          <li><b>Whip</b> X or J. <b>Jump on heads</b> to stomp enemies. <b>↓ + whip</b> picks up a rock or pot. Whip again to throw it.</li>
          <li><b>Bomb</b> C: blows up dirt and enemies (and you). ↓ + bomb drops it at your feet. <b>Rope</b> V: a rope up to 8 tiles high.</li>
          <li><b>Pets</b> wait in each level. Touch one and bring it to the exit for <b>+1 ❤️</b>. That is the only way to heal besides potions.</li>
          <li><b>Shops</b>: stand on an item and press ↑ to buy. <b>Crates</b> hold items: whip them open.</li>
          <li><b>Traps</b>: spikes hurt when you fall on them. Arrow traps shoot when you pass. Blocks and icicles fall when you walk below. Lava burns.</li>
          <li><b>Hurry</b>: after 3:00 a ghost comes for you. Hold ↓ to look down.</li>
          <li><b>Touch</b>: the 🎮 button shows the on-screen pad.</li>
        </ul>
        <h3>Enemies</h3><table class="tbl">${enemies}</table>
        <h3>Items</h3><table class="tbl">${items}</table>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Paused</h2>
      <button class="primary" data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a loss.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (the level restarts when you continue)</button>
    </div></div>`;
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const t = e.target as HTMLElement;
    if (t.closest('[data-k]')) return;
    const el = t.closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'modal-close' && t.closest('[data-stop]') && !t.closest('button')) return;
    this.act(el.dataset.act!, el);
  }

  private act(a: string, el?: HTMLElement): void {
    switch (a) {
      case 'new':
        play('click');
        this.startRun(this.startZone);
        break;
      case 'continue':
        play('click');
        if (this.run) this.startLevel();
        break;
      case 'next':
        play('click');
        this.startLevel();
        break;
      case 'zone':
        this.startZone = Number(el?.dataset.z ?? 0);
        this.render();
        break;
      case 'help':
        this.modal = { kind: 'help' };
        this.keys.clear();
        this.render();
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        this.keys.clear();
        this.render();
        break;
      case 'modal-close':
        this.modal = null;
        this.acc = 0;
        this.render();
        break;
      case 'mute': {
        const m = toggleMute();
        try {
          localStorage.setItem('cave.mute', m ? '1' : '0');
        } catch {
          /* ignore */
        }
        const b = this.root.querySelector<HTMLElement>('[data-act="mute"]');
        if (b) b.textContent = m ? '🔇' : '🔊';
        break;
      }
      case 'pad':
        this.showPad = !this.showPad;
        try {
          localStorage.setItem('cave.pad', this.showPad ? '1' : '0');
        } catch {
          /* ignore */
        }
        this.render();
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        break;
      case 'abandon-yes':
        this.modal = null;
        if (this.run) {
          if (this.world) {
            this.run.gold = this.world.gold;
            this.run.kills = this.world.kills;
          }
          this.cause = 'You gave up';
          this.finish(false);
        }
        break;
      case 'title':
        this.modal = null;
        this.world = null;
        this.screen = 'title';
        this.render();
        break;
    }
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
        level: this.run?.level ?? this.end?.level ?? null,
        levelName: this.world ? levelName(this.world.level.index) : null,
        hp: this.world?.hp ?? this.run?.hp ?? null,
        bombs: this.world?.bombs ?? null,
        ropes: this.world?.ropesLeft ?? null,
        gold: this.world?.gold ?? this.run?.gold ?? null,
        items: this.world?.items ?? null,
        frame: this.world?.frame ?? 0,
        player: this.world ? { x: Math.round(this.world.p.x), y: Math.round(this.world.p.y), state: this.world.p.state } : null,
        boss: this.world?.ents.find((e) => e.def?.brain === 'boss')?.hp ?? null,
        teleports: this.teleports,
        score: this.run ? score(this.run, false) : (this.end?.score ?? null),
        end: this.end,
      }),
      /** One bot action. In a level it plays a few seconds of game time. */
      step: () => {
        if (this.modal) {
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'cleared':
            click('[data-act="next"]');
            return 'next';
          case 'end':
            return 'end';
          case 'play': {
            const w = this.world!;
            this.botDriven = true;
            if (!this.bot) this.bot = new Bot(w, 'good', new Rng(hash(w.level.index, w.frame, 'dbg')));
            const n = FAST ? 600 : 120;
            for (let i = 0; i < n && this.screen === 'play' && this.world === w; i++) {
              // A stuck bot gets a hand after two minutes.
              if (w.frame > 120 * 60 && !w.done && !w.p.dead) {
                w.teleportToExit();
                this.teleports++;
              }
              this.tick(this.bot.input());
            }
            if (this.screen === 'play') this.draw();
            return 'play';
          }
        }
        return 'idle';
      },
      win: () => this.world?.teleportToExit(),
      hp: (n: number) => {
        if (this.world) this.world.hp = n;
      },
      level: (i: number) => {
        if (!this.run) this.run = newRun(randomSeedText());
        this.run.level = Math.max(0, Math.min(LEVEL_COUNT - 1, i));
        this.startLevel();
      },
      item: (id: string) => {
        if (this.world && ITEMS[id] && !this.world.items.includes(id)) this.world.items.push(id);
      },
      human: () => {
        this.botDriven = false;
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
