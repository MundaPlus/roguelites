/** Screens, beat clock, input, debug API. */
import { goodBot } from './bot';
import { CHARS, ENEMIES, FLOORS_PER_ZONE, ITEMS, SPELL_CHARGE, START_UNLOCKS, WEAPONS, ZONES } from './data';
import { genFloor } from './level';
import { BAR, TS, drawBar, drawWorld, type Anim, type Fx } from './render';
import { randomSeedText } from './rng';
import {
  applyReward,
  bpmOf,
  clearRun,
  depth,
  diamondsFor,
  floorSeed,
  loadMeta,
  loadRun,
  newRun,
  rewardText,
  saveMeta,
  saveRun,
  score,
  zoneRewards,
  type RunState,
} from './run';
import { audioNow, initAudio, isMuted, musicBeat, sfx, toggleMute, type SfxName } from './sfx';
import { multCap, resolveBeat, spellReady, weaponDmg, type Action, type Ev, type World } from './world';

type Screen = 'title' | 'floor' | 'play' | 'reward' | 'end' | 'calib';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'settings' };

const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug');
/** `?debug&fast`: the beat clock stops and `debug.step()` plays beats directly. */
const FAST = DEBUG && Q.has('fast');

const ARMOR = ['None', '🦺 Leather', '🧥 Chainmail', '🛡️ Plate'];
const TORCH = ['None', '🔥 Torch', '🏮 Lantern'];
const MOVE_TEXT: Record<string, string> = {
  still: 'never moves',
  bounce: 'hops up and down',
  square: 'walks a square',
  chase: 'chases you',
  random: 'flies at random',
  charge: 'charges in a line',
  diag: 'moves diagonally',
  line: 'walks straight',
};

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private end: { won: boolean; score: number; diamonds: number; depth: number; zone: number; acc: number } | null = null;

  // Play state.
  private w: World | null = null;
  private t0 = 0;
  private spb = 0.6;
  private sched = 0;
  private countEnd = 0;
  private paused = false;
  private ending = false;
  private useAudio = false;
  private lastA = -1;
  private lastAP = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private cols = 17;
  private rows = 11;
  private anim: Anim = { prev: new Map(), k: 1, pulse: 0, time: 0 };
  private tweenAt = 0;
  private fx: Fx = { floats: [], booms: [], slashes: [], shake: 0 };
  private lastFrame = 0;
  private missAt = -10;
  private judge = { text: '', color: '#fff', at: -10 };
  private lastPulseBeat = -99;

  // Calibration.
  private cal: { t0: number; spb: number; sched: number; taps: number[] } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onPointer(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => {
      if (this.screen === 'play') this.layoutCanvas();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'play' && !this.modal && !FAST) this.openModal({ kind: 'menu', confirm: false });
    });
    if (DEBUG) this.installDebug();
    this.render();
  }

  // ---------- Clock ----------

  /** Seconds. The audio clock when it runs, else the page clock. */
  private now(): number {
    const p = performance.now() / 1000;
    if (this.useAudio) {
      const a = audioNow();
      if (a !== null) {
        if (a !== this.lastA) {
          this.lastA = a;
          this.lastAP = p;
          return a;
        }
        if (p - this.lastAP < 0.3) return a + (p - this.lastAP);
      }
      // The audio clock stopped: switch to the page clock and keep the next beat ahead.
      this.useAudio = false;
      const k = this.w ? this.w.beat : 0;
      this.t0 = p + this.spb - k * this.spb;
      this.sched = Math.max(this.sched, k);
    }
    return p;
  }

  private pickClock(): void {
    this.useAudio = audioNow() !== null;
    this.lastA = -1;
    this.lastAP = performance.now() / 1000;
  }

  private T(n: number): number {
    return this.t0 + n * this.spb;
  }

  private get win(): number {
    return Math.min(this.spb * 0.42, this.meta.settings.wide ? 0.17 : 0.11);
  }

  private get lat(): number {
    return this.meta.settings.lat / 1000;
  }

  // ---------- Rendering ----------

  private render(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'floor':
        body = this.floorView();
        break;
      case 'play':
        body = this.playView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'end':
        body = this.endView();
        break;
      case 'calib':
        body = this.calibView();
        break;
    }
    const top = this.run && (this.screen === 'play' || this.screen === 'floor' || this.screen === 'reward') ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    this.canvas = null;
    this.ctx = null;
    if (this.screen === 'play') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.layoutCanvas();
    }
    if (this.screen === 'play' || this.screen === 'calib') this.startLoop();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private hearts(): string {
    const h = this.w ? this.w.hero : this.run!.hero;
    if (h.maxHp > 10) return `❤️ ${Math.max(0, h.hp)}/${h.maxHp}`;
    return `<span class="hearts" title="${h.hp}/${h.maxHp} HP">${'❤️'.repeat(Math.max(0, h.hp))}${'🖤'.repeat(Math.max(0, h.maxHp - Math.max(0, h.hp)))}</span>`;
  }

  private topBar(): string {
    const r = this.run!;
    const h = this.w && this.screen === 'play' ? this.w.hero : r.hero;
    const z = ZONES[Math.min(r.zone, 3)];
    return `<header class="top">
      <span id="hb-hearts">${this.hearts()}</span>
      <span id="hb-gold">💰 ${h.gold}</span>
      <span id="hb-gems">💎 ${h.diamonds}</span>
      <span>${z.icon} ${Math.min(r.zone, 3) + 1}-${r.floor + 1}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private refreshHud(): void {
    if (this.screen !== 'play' || !this.w) return;
    const h = this.w.hero;
    const set = (id: string, html: string): void => {
      const el = this.root.querySelector<HTMLElement>(id);
      if (el) el.innerHTML = html;
    };
    set('#hb-hearts', this.hearts());
    set('#hb-gold', `💰 ${h.gold}`);
    set('#hb-gems', `💎 ${h.diamonds}`);
    set('#side', this.sideView());
    const bomb = this.root.querySelector<HTMLButtonElement>('.pad [data-act="bomb"]');
    if (bomb) bomb.innerHTML = `💣<small>${h.bombs}</small>`;
    const sp = this.root.querySelector<HTMLButtonElement>('.pad [data-act="spell"]');
    if (sp) {
      sp.disabled = !h.spell;
      sp.innerHTML = h.spell ? `${ITEMS[h.spell].icon}<small>${Math.min(h.charge, SPELL_CHARGE[h.spell])}/${SPELL_CHARGE[h.spell]}</small>` : '✨<small>–</small>';
      sp.classList.toggle('ready', spellReady(h));
    }
  }

  private titleView(): string {
    const m = this.meta;
    const chars = CHARS.map((c) => {
      const own = m.unlocked.includes(c.id);
      const sel = m.char === c.id;
      return `<div class="arm ${sel ? 'sel' : ''}"><span class="big">${c.icon}</span><span><b>${c.name}</b><small>${c.text}</small></span>
        ${own ? (sel ? '<span class="ok">✔ Chosen</span>' : `<button data-act="char" data-id="${c.id}">Choose</button>`) : `<button data-act="unlock" data-id="${c.id}" ${m.diamonds >= c.cost ? '' : 'disabled'}>💎 ${c.cost}</button>`}</div>`;
    }).join('');
    const ups = START_UNLOCKS.map((u) => {
      const own = m.unlocked.includes(u.id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${u.icon}</span><span><b>${u.name}</b><small>${u.text}</small></span>
        ${own ? '<span class="ok">✔ Owned</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.diamonds >= u.cost ? '' : 'disabled'}>💎 ${u.cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <h1><span class="logo">🥁</span> Beat Delver</h1>
      <p class="sub">Move on the beat. Learn the dance of every monster. Dig through 4 zones and silence The Conductor.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (zone ${Math.min(r.zone, 3) + 1}-${r.floor + 1}, ❤️ ${r.hero.hp})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <div class="row"><button data-act="help">How to play</button><button data-act="settings">⚙️ Timing settings</button><button data-act="calib">🎧 Calibrate</button></div>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Deepest floor ${m.bestDepth} · Best score ${m.best}</p>
      <h2>Delvers <small>💎 ${m.diamonds} diamonds</small></h2>
      <div class="armory">${chars}</div>
      <h2>Starting gear</h2>
      <div class="armory">${ups}</div>
    </div>`;
  }

  private floorView(): string {
    const r = this.run!;
    const z = ZONES[r.zone];
    const boss = r.floor === FLOORS_PER_ZONE - 1;
    const ids = [...new Set(z.pool.map(([id]) => id))];
    const foe = (id: string): string => {
      const d = ENEMIES[id];
      return `<div class="foe-row"><span class="big">${d.icon}</span><span><b>${d.name}</b> <small>❤️${d.hp} ⚔️${d.dmg}</small><small>${d.text}</small></span></div>`;
    };
    const h = r.hero;
    return `<div class="floorv">
      <h2>${z.icon} Zone ${r.zone + 1}: ${z.name} <small>floor ${r.floor + 1}/${FLOORS_PER_ZONE}</small></h2>
      <p class="sub">${boss ? `Boss floor. ${ENEMIES[z.boss].icon} <b>${ENEMIES[z.boss].name}</b> waits in the arena.` : `Find the stairs. ${ENEMIES[z.mini].icon} <b>${ENEMIES[z.mini].name}</b> guards them. Look for the shop 🧔 and chests 🎁.`} Tempo ${bpmOf(r.zone, r.floor)} BPM.</p>
      <button class="primary big-btn" data-act="descend">▶ ${boss ? 'Enter the arena' : 'Descend'}</button>
      <div class="gear">${WEAPONS[h.weapon].icon} ${WEAPONS[h.weapon].name} (${weaponDmg(h)}) · ${h.armor ? ARMOR[h.armor] : 'No armor'} · 💣 ${h.bombs}${h.spell ? ` · ${ITEMS[h.spell].icon}` : ''}${h.rings.map((x) => ` · ${ITEMS[x].icon}`).join('')}</div>
      <h3>Monsters here</h3>
      <div class="foes">${ids.map(foe).join('')}${foe(boss ? z.boss : z.mini)}</div>
    </div>`;
  }

  private playView(): string {
    return `<div class="play">
      <div class="cv-wrap"><canvas id="cv"></canvas>
        <div class="pad">
          <button data-act="bomb" class="pb">💣</button><button data-dir="0" class="pd">▲</button><button data-act="spell" class="pb">✨</button>
          <button data-dir="3" class="pd">◀</button><button data-dir="2" class="pd">▼</button><button data-dir="1" class="pd">▶</button>
        </div>
      </div>
      <aside class="side" id="side">${this.sideView()}</aside>
    </div>`;
  }

  private sideView(): string {
    const w = this.w;
    if (!w) return '';
    const h = w.hero;
    const wd = WEAPONS[h.weapon];
    const seen = [...new Set(w.enemies.filter((e) => w.seen[e.y * w.w + e.x] || w.boss).map((e) => e.id))].slice(0, 5);
    const legend = seen
      .map((id) => {
        const d = ENEMIES[id];
        return `<div class="leg"><span>${d.icon}</span><small><b>${d.name}</b>: ${MOVE_TEXT[d.move]}${d.every > 1 ? `, every ${d.every === 2 ? 'second' : 'third'} beat` : ', every beat'}. ⚔️${d.dmg}</small></div>`;
      })
      .join('');
    return `<div class="stat"><span>Multiplier</span><b class="${w.mult > 1 ? 'gold' : ''}">×${w.mult}</b><small>max ×${multCap(h)}</small></div>
      <div class="stat"><span>Weapon</span><b>${wd.icon} ${wd.name}</b><small>${weaponDmg(h)} dmg</small></div>
      <div class="stat"><span>Armor</span><b>${ARMOR[h.armor]}</b>${h.armor === 1 || h.armor === 3 ? `<small>${w.shieldUsed ? 'used' : 'ready'}</small>` : ''}</div>
      <div class="stat"><span>Light</span><b>${TORCH[h.torch]}</b>${h.pick ? '<small>⛏️ pick</small>' : ''}</div>
      <div class="stat"><span>Bombs</span><b>💣 ${h.bombs}</b><small>B</small></div>
      <div class="stat"><span>Spell</span><b>${h.spell ? `${ITEMS[h.spell].icon} ${ITEMS[h.spell].name.replace(' Spell', '')}` : 'None'}</b>${h.spell ? `<small>${spellReady(h) ? '<span class="ok">ready (Q)</span>' : `${h.charge}/${SPELL_CHARGE[h.spell]} kills`}</small>` : ''}</div>
      ${h.rings.length ? `<div class="stat"><span>Charms</span><b>${h.rings.map((x) => `<span title="${esc(ITEMS[x].name + ': ' + ITEMS[x].text)}">${ITEMS[x].icon}</span>`).join('')}</b></div>` : ''}
      <div class="legend">${legend || '<small class="dim">No monsters in sight.</small>'}</div>
      <p class="hint">Arrows/WASD move and attack on the beat · B bomb · Q spell · Esc menu. On touch, tap beside the hero or use the pad.</p>`;
  }

  private rewardView(): string {
    const r = this.run!;
    const picks = (r.reward ?? [])
      .map((rw, i) => {
        const t = rewardText(rw, r.hero);
        return `<button class="pick" data-act="reward" data-i="${i}"><span class="big">${t.icon}</span><b>${t.name}</b><small>${esc(t.text)}</small></button>`;
      })
      .join('');
    const z = ZONES[r.zone - 1];
    return `<div class="reward"><h2 class="good">${z.icon} ${z.name} cleared!</h2><p>Choose one reward before the next zone.</p><div class="picks">${picks}</div></div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <h1 class="${e.won ? 'good' : 'bad'}">${e.won ? '🏆 Victory!' : '💀 Defeat'}</h1>
      <p>${e.won ? 'The Conductor falls silent. The dungeon stops dancing.' : `You fell in ${ZONES[e.zone].name}, floor ${e.depth + 1}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>On-beat moves: ${e.acc}%</p>
      <p>💎 +${e.diamonds} diamonds</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private calibView(): string {
    const c = this.cal;
    const taps = c ? c.taps.slice(2) : [];
    const med = taps.length ? taps.slice().sort((a, b) => a - b)[Math.floor(taps.length / 2)] : 0;
    return `<div class="calib">
      <h2>🎧 Calibrate</h2>
      <p class="sub">Tap the pad (or press Space) on each click. After 8 taps you get a suggested input latency.</p>
      <button class="tap" data-act="tap" id="tap"><span id="calring"></span>TAP</button>
      <p>Taps: ${c ? c.taps.length : 0} · ${taps.length ? `median offset <b>${Math.round(med)} ms</b>` : 'listen to the beat first'}</p>
      <p class="dim">${taps.map((t) => Math.round(t)).join(' · ')}</p>
      <p>Current latency: <b>${this.meta.settings.lat} ms</b></p>
      ${taps.length >= 6 ? `<button class="primary" data-act="cal-apply" data-v="${Math.round(med)}">Use ${Math.round(med)} ms</button>` : ''}
      <button data-act="cal-reset">Restart</button>
      <button data-act="title">Back</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Move on the beat.</b> Each beat you get one move: up, down, left or right. The bar at the bottom shows the beats. Press when a marker reaches the heart ❤️.</li>
          <li><b>Moving into a monster attacks it.</b> Your weapon sets the attack shape: the spear reaches 2 tiles, the broadsword hits 3 tiles wide, the whip sweeps a row of 5.</li>
          <li><b>Monsters move on the beat too</b>, each with a fixed pattern. A monster that glows acts on the next beat. A red glow near you means an attack is coming. Hit slow monsters between their steps.</li>
          <li><b>Gold multiplier.</b> Each kill raises it (×2, ×3). A missed beat, an off-beat press or a hit resets it to ×1. Monsters drop gold times the multiplier.</li>
          <li><b>Dig</b> by moving into dirt walls. Stone needs a pickaxe ⛏️ or a bomb. Some walls hide gold or diamonds 💎.</li>
          <li><b>Shop</b> 🧔: step on an item to buy it. <b>Chests</b> 🎁 open when you walk into them.</li>
          <li><b>Bombs</b> (B) explode 3 beats later in a 3×3 area. <b>Spells</b> (Q) recharge with kills.</li>
          <li>Each zone has 3 floors. A mini-boss guards the stairs 🔒 on floors 1 and 2. Floor 3 is the boss arena. Beat 4 zones to win.</li>
          <li>Diamonds unlock delvers and starting gear on the title screen. If the timing feels off, use <b>Calibrate</b> or the wide timing window in the settings.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'settings') {
      const s = this.meta.settings;
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>⚙️ Timing</h2>
        <label class="setting">Input latency: <b id="latv">${s.lat} ms</b>
          <input type="range" min="-150" max="300" step="5" value="${s.lat}" id="lat" /></label>
        <p class="dim">Raise it if your on-beat presses count as late. Lower it if they count as early.</p>
        <label class="setting check"><input type="checkbox" id="wide" ${s.wide ? 'checked' : ''}/> Wide timing window (±170 ms instead of ±110 ms)</label>
        <button data-act="calib">🎧 Calibrate with taps</button>
        <button class="primary" data-act="modal-close">Done</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Paused</h2>
      <button class="primary" data-act="modal-close">▶ Resume</button>
      <button data-act="settings">⚙️ Timing settings</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run at this floor)</button>
    </div></div>`;
  }

  // ---------- Canvas loop ----------

  private layoutCanvas(): void {
    const cv = this.canvas;
    if (!cv) return;
    const narrow = window.innerWidth < 700;
    this.cols = narrow ? 11 : 17;
    this.rows = narrow ? 11 : 13;
    const LW = this.cols * TS;
    const LH = this.rows * TS + BAR;
    const wrap = cv.parentElement!;
    const maxW = Math.min(wrap.clientWidth || LW, 760);
    const maxH = window.innerHeight - (narrow ? 250 : 70);
    const w = Math.max(200, Math.min(maxW, (maxH * LW) / LH));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${w}px`;
    cv.style.height = `${(w * LH) / LW}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(((w * LH) / LW) * dpr);
    this.ctx?.setTransform(cv.width / LW, 0, 0, cv.height / LH, 0, 0);
  }

  private startLoop(): void {
    this.lastFrame = performance.now();
    const loop = (t: number): void => {
      const dt = Math.min(0.1, (t - this.lastFrame) / 1000);
      this.lastFrame = t;
      if (this.screen === 'play') this.framePlay(dt);
      else if (this.screen === 'calib') this.frameCalib();
      else return;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private scheduleMusic(now: number): void {
    const a = audioNow();
    if (a === null || FAST || !this.run) return;
    const z = ZONES[this.run.zone];
    while (this.T(this.sched) < now + 0.15) {
      const at = a + (this.T(this.sched) - now);
      if (at > a - 0.05) musicBeat(this.sched < this.countEnd ? this.sched - this.countEnd : this.sched, Math.max(a, at), this.spb, this.run.zone, z.root, z.bass);
      this.sched++;
    }
  }

  private framePlay(dt: number): void {
    const w = this.w;
    if (!w || !this.ctx) return;
    const now = this.now();
    if (!this.paused && !this.ending) {
      this.scheduleMusic(now);
      if (!FAST) {
        const tin = now - this.lat;
        let guard = 0;
        while (!this.ending && tin > this.T(w.beat) + this.win && guard++ < 8) this.doBeat({ kind: 'none' }, false);
      }
    }
    // Beat pulse follows the music.
    const k = this.paused || FAST ? -1 : Math.floor((now - this.t0) / this.spb + 0.5);
    if (k !== this.lastPulseBeat && !FAST && !this.paused) {
      const nearest = this.T(Math.round((now - this.t0) / this.spb));
      if (now >= nearest) {
        this.lastPulseBeat = k;
        this.anim.pulse = 1;
      }
    }
    this.anim.pulse = Math.max(0, this.anim.pulse - dt * 4);
    this.anim.time += dt;
    this.anim.k = FAST ? 1 : Math.min(1, (performance.now() - this.tweenAt) / 110);
    for (const f of this.fx.floats) f.t += dt;
    for (const b of this.fx.booms) b.t += dt;
    for (const s of this.fx.slashes) s.t += dt;
    this.fx.floats = this.fx.floats.filter((f) => f.t < 1);
    this.fx.booms = this.fx.booms.filter((b) => b.t < 0.35);
    this.fx.slashes = this.fx.slashes.filter((s) => s.t < 0.2);
    this.fx.shake = Math.max(0, this.fx.shake - dt * 40);
    drawWorld(this.ctx, w, this.cols, this.rows, this.anim, this.fx);
    const next: number[] = [];
    if (!FAST && !this.paused) for (let i = 0; i < 6; i++) next.push(this.T(w.beat + i) - (now - this.lat));
    const cin = !FAST && w.beat === 0 && now < this.T(0) - this.spb * 0.5 ? Math.ceil((this.T(0) - now) / this.spb) : 0;
    drawBar(this.ctx, this.rows * TS, this.cols * TS, {
      next,
      spb: this.spb,
      win: this.win,
      pulse: this.anim.pulse,
      miss: performance.now() / 1000 - this.missAt < 0.35 ? 1 : 0,
      judge: this.judge.text,
      judgeT: performance.now() / 1000 - this.judge.at,
      judgeColor: this.judge.color,
      mult: w.mult,
      countIn: cin,
    });
  }

  private frameCalib(): void {
    const c = this.cal;
    if (!c) return;
    const a = audioNow();
    const now = this.now();
    if (a !== null) {
      while (c.t0 + c.sched * c.spb < now + 0.15) {
        musicBeat(c.sched % 4 === 0 ? -1 : -2, a + (c.t0 + c.sched * c.spb - now), c.spb, 0, 55, [0]);
        c.sched++;
      }
    }
    const ph = ((now - c.t0) / c.spb) % 1;
    const ring = this.root.querySelector<HTMLElement>('#calring');
    if (ring) ring.style.transform = `scale(${1 + 0.35 * Math.max(0, 1 - ph * 4)})`;
  }

  // ---------- Game flow ----------

  private startFloor(): void {
    const r = this.run!;
    initAudio();
    const hero = { ...r.hero, rings: r.hero.rings.slice() };
    if (hero.rings.includes('ring_vigor')) hero.hp = Math.min(hero.maxHp, hero.hp + 1);
    this.w = genFloor(floorSeed(r), r.zone, r.floor, hero);
    this.spb = 60 / bpmOf(r.zone, r.floor);
    this.pickClock();
    const now = this.now();
    this.t0 = FAST ? now : now + 4 * this.spb + 0.2;
    this.countEnd = 0;
    this.sched = -4;
    this.paused = false;
    this.ending = false;
    this.anim.prev = new Map();
    this.fx = { floats: [], booms: [], slashes: [], shake: 0 };
    this.screen = 'play';
    this.render();
    if (r.floor === FLOORS_PER_ZONE - 1) this.toast(`${ENEMIES[ZONES[r.zone].boss].icon} ${ENEMIES[ZONES[r.zone].boss].name}: ${ENEMIES[ZONES[r.zone].boss].text}`);
  }

  /** Resolve one beat with the player's action and play the effects. */
  private doBeat(a: Action, onBeat: boolean): void {
    const w = this.w!;
    this.anim.prev = new Map(w.enemies.map((e) => [e.uid, [e.x, e.y] as [number, number]]));
    this.anim.prev.set(0, [w.px, w.py]);
    this.tweenAt = performance.now();
    const ev = resolveBeat(w, a, onBeat);
    if (!onBeat || a.kind === 'none') {
      this.missAt = performance.now() / 1000;
      this.judge = { text: 'Missed beat', color: '#ff4d6d', at: performance.now() / 1000 };
    }
    this.playEvents(ev);
    this.refreshHud();
    if (w.dead) this.finish(() => this.endRun(false), FAST ? 0 : 1100);
    else if (w.won) this.finish(() => this.endRun(true), FAST ? 0 : 1600);
    else if (w.exit) this.finish(() => this.floorDone(), FAST ? 0 : 400);
  }

  private finish(fn: () => void, delay: number): void {
    if (this.ending) return;
    this.ending = true;
    if (delay <= 0) fn();
    else setTimeout(fn, delay);
  }

  private playEvents(ev: Ev[]): void {
    for (const e of ev) {
      switch (e.t) {
        case 'float':
          if (!FAST) this.fx.floats.push({ x: e.x, y: e.y, text: e.text, color: e.color, t: 0 });
          break;
        case 'sfx':
          if (!FAST) sfx[e.s as SfxName]?.();
          break;
        case 'shake':
          this.fx.shake = Math.max(this.fx.shake, e.n);
          break;
        case 'boom':
          if (!FAST) this.fx.booms.push({ x: e.x, y: e.y, t: 0 });
          break;
        case 'slash':
          if (!FAST) this.fx.slashes.push({ x: e.x, y: e.y, t: 0 });
          break;
        case 'msg':
          if (!FAST) this.toast(e.text);
          break;
      }
    }
  }

  private floorDone(): void {
    const r = this.run!;
    const w = this.w!;
    r.hero = w.hero;
    r.beats += w.onBeat + w.missed;
    r.missed += w.missed;
    r.floor++;
    this.w = null;
    if (r.floor >= FLOORS_PER_ZONE) {
      r.zone++;
      r.floor = 0;
      r.reward = zoneRewards(r);
      this.screen = 'reward';
      sfx.win();
    } else this.screen = 'floor';
    saveRun(r);
    this.render();
  }

  private endRun(won: boolean): void {
    const r = this.run!;
    if (this.w) {
      r.hero = this.w.hero;
      r.beats += this.w.onBeat + this.w.missed;
      r.missed += this.w.missed;
    }
    if (won) {
      r.zone = 4;
      r.floor = 0;
    }
    const sc = score(r, won);
    const dia = diamondsFor(r, won);
    const m = this.meta;
    m.diamonds += dia;
    if (won) m.wins++;
    m.best = Math.max(m.best, sc);
    m.bestDepth = Math.max(m.bestDepth, depth(r) + (won ? 0 : 1));
    saveMeta(m);
    clearRun();
    this.end = { won, score: sc, diamonds: dia, depth: depth(r), zone: Math.min(r.zone, 3), acc: r.beats ? Math.round((100 * (r.beats - r.missed)) / r.beats) : 0 };
    this.run = null;
    this.w = null;
    this.modal = null;
    this.screen = 'end';
    if (won) sfx.win();
    else sfx.lose();
    this.render();
  }

  // ---------- Input ----------

  /** A player action from keys, the pad or taps. Checked against the beat clock. */
  private input(a: Action): void {
    const w = this.w;
    if (this.screen !== 'play' || this.modal || !w || this.ending || this.paused) return;
    if (FAST) return this.doBeat(a, true);
    const tin = this.now() - this.lat;
    let guard = 0;
    while (!this.ending && tin > this.T(w.beat) + this.win && guard++ < 8) this.doBeat({ kind: 'none' }, false);
    if (this.ending) return;
    const dt = tin - this.T(w.beat);
    if (dt >= -this.win) {
      const ad = Math.abs(dt);
      this.judge = ad < this.win * 0.45 ? { text: 'Perfect', color: '#7ee08a', at: performance.now() / 1000 } : { text: dt < 0 ? 'Early' : 'Late', color: '#ffd166', at: performance.now() / 1000 };
      this.doBeat(a, true);
    } else if (w.beat === 0 && dt < -this.spb * 0.5) {
      // Count-in: ignore.
    } else {
      if (w.mult > 1) this.toast('Off beat: multiplier lost');
      w.mult = 1;
      this.missAt = performance.now() / 1000;
      this.judge = { text: 'Off beat', color: '#ff4d6d', at: performance.now() / 1000 };
      sfx.miss();
      this.refreshHud();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') this.closeModal();
      return;
    }
    if (this.screen === 'calib' && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      this.calTap();
      return;
    }
    if (this.screen !== 'play' || e.repeat) return;
    const k = e.key.toLowerCase();
    const dirs: Record<string, number> = { arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 };
    if (k in dirs) {
      e.preventDefault();
      this.input({ kind: 'move', dir: dirs[k] });
    } else if (k === 'b' || k === 'x') this.input({ kind: 'bomb' });
    else if (k === 'q' || k === 'e' || k === ' ') {
      e.preventDefault();
      this.input({ kind: 'spell' });
    } else if (k === 'escape') this.openModal({ kind: 'menu', confirm: false });
  }

  private onPointer(e: PointerEvent): void {
    initAudio();
    const t = e.target as HTMLElement;
    if (this.screen === 'calib' && t.closest('#tap')) {
      e.preventDefault();
      this.calTap();
      return;
    }
    if (this.screen !== 'play' || this.modal) return;
    const pad = t.closest<HTMLElement>('.pad button');
    if (pad) {
      e.preventDefault();
      if (pad.dataset.dir) this.input({ kind: 'move', dir: +pad.dataset.dir });
      else if (pad.dataset.act === 'bomb') this.input({ kind: 'bomb' });
      else if (pad.dataset.act === 'spell') this.input({ kind: 'spell' });
      return;
    }
    if (t === this.canvas && this.w) {
      e.preventDefault();
      // Tap beside the hero: the direction is the larger axis from the hero to the tap.
      const rect = this.canvas.getBoundingClientRect();
      const lx = ((e.clientX - rect.left) / rect.width) * this.cols * TS;
      const ly = ((e.clientY - rect.top) / rect.height) * (this.rows * TS + BAR);
      if (ly > this.rows * TS) return;
      const w = this.w;
      let camX = w.px + 0.5 - this.cols / 2;
      let camY = w.py + 0.5 - this.rows / 2;
      camX = w.w < this.cols ? (w.w - this.cols) / 2 : Math.max(0, Math.min(w.w - this.cols, camX));
      camY = w.h < this.rows ? (w.h - this.rows) / 2 : Math.max(0, Math.min(w.h - this.rows, camY));
      const dx = lx - (w.px - camX + 0.5) * TS;
      const dy = ly - (w.py - camY + 0.5) * TS;
      if (Math.abs(dx) < TS * 0.4 && Math.abs(dy) < TS * 0.4) return;
      this.input({ kind: 'move', dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0 });
    }
  }

  private calTap(): void {
    const c = this.cal;
    if (!c) return;
    const now = this.now();
    const n = Math.round((now - c.t0) / c.spb);
    c.taps.push((now - (c.t0 + n * c.spb)) * 1000);
    sfx.tap();
    this.render();
  }

  private openModal(m: Modal): void {
    if (this.screen === 'play' && !this.paused) this.paused = true;
    this.modal = m;
    this.render();
    if (m.kind === 'settings') this.bindSettings();
  }

  private closeModal(): void {
    this.modal = null;
    if (this.screen === 'play' && this.paused && this.w) {
      // Resume with a two-beat count-in.
      this.pickClock();
      const now = this.now();
      const k = this.w.beat;
      this.t0 = now + 2 * this.spb + 0.1 - k * this.spb;
      this.countEnd = k;
      this.sched = k - 2;
      this.paused = false;
    }
    this.render();
  }

  private bindSettings(): void {
    const lat = this.root.querySelector<HTMLInputElement>('#lat');
    const wide = this.root.querySelector<HTMLInputElement>('#wide');
    lat?.addEventListener('input', () => {
      this.meta.settings.lat = +lat.value;
      const v = this.root.querySelector('#latv');
      if (v) v.textContent = `${lat.value} ms`;
      saveMeta(this.meta);
    });
    wide?.addEventListener('change', () => {
      this.meta.settings.wide = wide.checked;
      saveMeta(this.meta);
    });
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    const act = el.dataset.act;
    if (act === 'bomb' || act === 'spell') return; // handled on pointerdown
    this.action(act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    switch (act) {
      case 'mute':
        toggleMute();
        this.render();
        return;
      case 'help':
        this.openModal({ kind: 'help' });
        return;
      case 'settings':
        this.openModal({ kind: 'settings' });
        return;
      case 'menu':
        this.openModal({ kind: 'menu', confirm: false });
        return;
      case 'modal-close':
        this.closeModal();
        return;
      case 'abandon':
        this.openModal({ kind: 'menu', confirm: true });
        return;
      case 'abandon-yes':
        this.modal = null;
        this.endRun(false);
        return;
      case 'title':
        this.modal = null;
        this.w = null;
        this.cal = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.run = newRun(randomSeedText(), this.meta);
        this.meta.runs++;
        saveMeta(this.meta);
        saveRun(this.run);
        this.screen = 'floor';
        this.render();
        return;
      case 'continue':
        this.screen = this.run?.reward ? 'reward' : 'floor';
        this.render();
        return;
      case 'char':
        this.meta.char = d.id!;
        saveMeta(this.meta);
        this.render();
        return;
      case 'unlock': {
        const id = d.id!;
        const cost = CHARS.find((c) => c.id === id)?.cost ?? START_UNLOCKS.find((u) => u.id === id)?.cost ?? 999;
        if (this.meta.diamonds < cost || this.meta.unlocked.includes(id)) return sfx.deny();
        this.meta.diamonds -= cost;
        this.meta.unlocked.push(id);
        if (CHARS.some((c) => c.id === id)) this.meta.char = id;
        saveMeta(this.meta);
        sfx.item();
        this.render();
        return;
      }
      case 'descend':
        this.startFloor();
        return;
      case 'reward': {
        const r = this.run!;
        const rw = r.reward?.[+d.i!];
        if (!rw) return;
        applyReward(r.hero, rw);
        r.reward = null;
        saveRun(r);
        sfx.item();
        this.screen = 'floor';
        this.render();
        return;
      }
      case 'calib': {
        initAudio();
        this.modal = null;
        this.w = null;
        this.pickClock();
        this.cal = { t0: this.now() + 0.6, spb: 0.6, sched: 0, taps: [] };
        this.screen = 'calib';
        this.render();
        return;
      }
      case 'cal-reset':
        if (this.cal) this.cal.taps = [];
        this.render();
        return;
      case 'cal-apply':
        this.meta.settings.lat = Math.max(-150, Math.min(300, +d.v!));
        saveMeta(this.meta);
        this.toast(`Latency set to ${this.meta.settings.lat} ms`);
        this.render();
        return;
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
        zone: this.run?.zone ?? null,
        floor: this.run?.floor ?? null,
        hp: this.w?.hero.hp ?? this.run?.hero.hp ?? null,
        maxHp: this.w?.hero.maxHp ?? this.run?.hero.maxHp ?? null,
        gold: this.w?.hero.gold ?? this.run?.hero.gold ?? null,
        beat: this.w?.beat ?? null,
        mult: this.w?.mult ?? null,
        enemies: this.w?.enemies.length ?? null,
        player: this.w ? [this.w.px, this.w.py] : null,
        locked: this.w?.locked ?? null,
        onBeat: this.w?.onBeat ?? null,
        missed: this.w?.missed ?? null,
        nextIn: this.w ? this.T(this.w.beat) - (this.now() - this.lat) : null,
        end: this.end,
        meta: { diamonds: this.meta.diamonds, runs: this.meta.runs, wins: this.meta.wins },
      }),
      /** The current floor state as plain data. */
      world: () => (this.w ? JSON.parse(JSON.stringify(this.w)) : null),
      gold: (n: number) => {
        if (this.w) this.w.hero.gold += n;
        else if (this.run) this.run.hero.gold += n;
        this.refreshHud();
      },
      diamonds: (n: number) => {
        this.meta.diamonds += n;
        saveMeta(this.meta);
        this.render();
      },
      /** Finish the current floor at once. */
      skip: () => {
        if (this.w && !this.ending) {
          this.w.exit = true;
          this.finish(() => this.floorDone(), 0);
        }
      },
      /** One bot action. In a floor it plays beats with the lookahead bot (4 per call with `fast`). */
      step: () => {
        if (this.modal) {
          this.closeModal();
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            click('[data-act="continue"]') || click('[data-act="new"]');
            return 'new';
          case 'floor':
            click('[data-act="descend"]');
            return 'descend';
          case 'reward': {
            const r = this.run!;
            click(`[data-act="reward"][data-i="${r.hero.hp < r.hero.maxHp - 1 ? 0 : 1}"]`);
            return 'reward';
          }
          case 'play': {
            if (this.ending || !this.w) return 'busy';
            const n = FAST ? 4 : 1;
            for (let i = 0; i < n && !this.ending; i++) this.doBeat(goodBot(this.w), true);
            if (!FAST && !this.ending && this.w) {
              // Keep the music in step: the next beat comes one beat from now.
              this.t0 = this.now() + this.spb - this.w.beat * this.spb;
              this.sched = this.w.beat;
              this.countEnd = this.w.beat;
            }
            return 'beat';
          }
          case 'calib':
            click('[data-act="title"]');
            return 'title';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
