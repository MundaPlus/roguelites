import { COLORS, H, PARTS, SHIPS, STAGES, W } from './data';
import { Bot } from './bot';
import { randomSeedText } from './rng';
import {
  absorbStage,
  applyPart,
  loadMeta,
  loadRun,
  loadoutOf,
  makeOffer,
  newRun,
  partLevel,
  saveMeta,
  saveRun,
  seedsFor,
  type Meta,
  type RunState,
} from './run';
import { COLLECT_Y, GRAZE_R, HIT_R, Game, TAU, newInput, type Input } from './sim';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'ships' | 'play' | 'parts' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
/** `?debug&fast` skips waits for bot tests. */
const FAST = PARAMS.has('fast');
const DT = 1 / 60;
const MUTE_KEY = 'bb.mute';

/** Order in which the debug bot picks ship parts. */
const BOT_PRIO = ['power', 'drone', 'spread', 'life', 'laser', 'bigbomb', 'bombs', 'shield', 'thruster', 'graze', 'magnet'];

const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

export class App {
  private run: RunState | null = loadRun();
  private meta: Meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private end: { victory: boolean; score: number; seeds: number; stage: number; loop: number } | null = null;

  // Play
  private g: Game | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private scale = 1;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private shake = 0;
  private flash = 0;
  private soundT = { shot: 0, graze: 0, hit: 0, item: 0 };
  private sprites = new Map<string, HTMLCanvasElement>();
  private bgGrad: CanvasGradient | null = null;
  private hidden = false;

  // Input
  private keys = new Set<string>();
  private bombQueued = false;
  private touchFocus = false;
  private focusId: number | null = null;
  private dragId: number | null = null;
  private dragX = 0;
  private dragY = 0;
  private relX = 0;
  private relY = 0;
  private inp: Input = newInput();

  // Debug bot
  private bot = new Bot('good');
  private auto = false;
  private god = false;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === '1');
    } catch {
      /* storage blocked */
    }
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (document.hidden && this.screen === 'play' && !this.modal && !this.auto) {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
      }
    });
    if (window.matchMedia?.('(pointer: coarse)').matches) document.body.classList.add('touch');
    if (DEBUG) this.installDebug();
    this.render();
  }

  // ---------- DOM ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'ships':
        body = this.shipsView();
        break;
      case 'play':
        body = this.playView();
        break;
      case 'parts':
        body = this.partsView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.screen === 'play' || this.screen === 'parts' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'play') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.bgGrad = null;
      this.resize();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
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
    const st = STAGES[Math.min(r.stage, STAGES.length - 1)];
    const ship = SHIPS.find((s) => s.id === r.ship) ?? SHIPS[0];
    return `<header class="top">
      <span class="tb-stage">${st.icon} <b>Stage ${r.stage + 1}</b><span class="hide-s"> · ${st.name}</span>${r.loop ? ` · Loop ${r.loop + 1}` : ''}</span>
      <span class="hide-s">${ship.icon} ${ship.name}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const r = this.run;
    const hangar = SHIPS.map((s) => {
      const own = m.unlocked.includes(s.id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${s.icon}</span><span><b>${s.name}</b><small>${s.text}</small></span>
        ${own ? '<span class="ok">✔ Ready</span>' : `<button data-act="unlock" data-id="${s.id}" ${m.seeds >= s.cost ? '' : 'disabled'}>🌱 ${s.cost}</button>`}</div>`;
    }).join('');
    return `<div class="title">
      <div class="logo"><span class="spin">🌸</span></div>
      <h1>Bullet Bloom</h1>
      <p class="sub">A vertical bullet-hell roguelite. Thread the bullet patterns, graze them to charge your bomb, and clear 5 stages of blooming bosses.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (stage ${r.stage + 1}${r.loop ? `, loop ${r.loop + 1}` : ''}, ${'♥'.repeat(Math.min(r.lives, 8))})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best stage ${m.bestStage} · Best score ${fmt(m.best)} · Grazes ${fmt(m.totalGraze)}</p>
      <h2>Hangar <small>🌱 ${m.seeds} seeds</small></h2>
      <p class="sub">Each run gives seeds. Unlock new ships with them.</p>
      <div class="armory">${hangar}</div>
      <button class="icon-btn" data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
    </div>`;
  }

  private shipsView(): string {
    const cards = SHIPS.map((s) => {
      const own = this.meta.unlocked.includes(s.id);
      const start = Object.entries(s.start)
        .map(([id, l]) => `${PARTS[id].icon} ${PARTS[id].name} ${l}`)
        .join(', ');
      return `<button class="card ship" data-act="ship" data-id="${s.id}" ${own ? '' : 'disabled'} style="--c:${s.col}">
        <span class="huge">${s.icon}</span><b>${s.name}</b><small>${s.text}</small>
        <span class="statline">♥ ${s.lives} · ✿ ${s.bombs} · speed ${s.speed}${start ? ` · ${start}` : ''}</span>
        ${own ? '' : `<span class="lock">🔒 🌱 ${s.cost}</span>`}
      </button>`;
    }).join('');
    return `<div class="title"><h2>Choose your ship</h2><div class="cards">${cards}</div><button data-act="title">Back</button></div>`;
  }

  private playView(): string {
    const r = this.run!;
    const parts = Object.keys(PARTS)
      .filter((id) => id !== 'life' && id !== 'bombs' && partLevel(r, id) > 0)
      .map((id) => `<li>${PARTS[id].icon} <b>${PARTS[id].name}</b> ${partLevel(r, id)}/${PARTS[id].max}</li>`)
      .join('');
    return `<div class="play">
      <div class="cv-wrap" id="wrap"><canvas id="cv"></canvas></div>
      <aside class="side">
        <h3>Ship parts</h3>
        <ul class="parts-list">${parts || '<li class="dim">None yet</li>'}</ul>
        <h3>Controls</h3>
        <ul class="keys">
          <li><kbd>←↑↓→</kbd> / <kbd>WASD</kbd> move</li>
          <li><kbd>Shift</kbd> focus: slow, shows the hitbox</li>
          <li><kbd>X</kbd> / <kbd>Space</kbd> bomb</li>
          <li><kbd>Esc</kbd> pause</li>
          <li>Mouse or touch: drag anywhere to move</li>
        </ul>
        <p class="dim">Your ship fires on its own. Only the small dot in the middle can be hit.</p>
      </aside>
    </div>
    <div class="touchbar">
      <p class="drag-hint">Drag anywhere to move. The ship moves as far as your finger.</p>
      <button class="tbtn" id="focusBtn">🎯 Focus</button>
      <button class="tbtn bomb" id="bombBtn">✿ Bomb</button>
    </div>`;
  }

  private partsView(): string {
    const r = this.run!;
    const res = r.last;
    const offer = r.offer ?? [];
    const cards = offer
      .map((id, i) => {
        const p = PARTS[id];
        const lvl = partLevel(r, id);
        const next = id === 'life' || id === 'bombs' ? 1 : lvl + 1;
        return `<button class="card part" data-act="part" data-i="${i}"><span class="huge">${p.icon}</span><b>${p.name}${id === 'life' || id === 'bombs' ? '' : ` ${next}/${p.max}`}</b><small>${p.text(next)}</small></button>`;
      })
      .join('');
    const prev = STAGES[Math.max(0, r.stage - 1)];
    return `<div class="partsv">
      ${res ? `<h2>${r.stage === 0 ? `Loop ${r.loop + 1} begins` : `${prev.icon} Stage ${res.stage + 1} cleared!`}</h2>
      <p class="stats">Score ${fmt(res.score)} · Grazes ${res.graze} · Spell cards ${res.spells} · ${res.deaths ? `${res.deaths} hit${res.deaths > 1 ? 's' : ''}` : 'No hits!'}</p>` : ''}
      <p class="sub">♥ ${r.lives} lives · ✿ ${r.bombs} bombs carry over. Pick one ship part for stage ${r.stage + 1}: ${STAGES[r.stage].icon} ${STAGES[r.stage].name}.</p>
      <div class="cards">${cards}</div>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    const r = this.run;
    return `<div class="endv">
      <div class="huge">${e.victory ? '🌸' : '🥀'}</div>
      <h1>${e.victory ? 'The garden blooms!' : 'Wilted'}</h1>
      <p class="sub">${e.victory ? `You cleared all 5 stages${e.loop ? ` of loop ${e.loop + 1}` : ''}.` : `Your ship fell in stage ${e.stage + 1}${e.loop ? ` of loop ${e.loop + 1}` : ''}: ${STAGES[e.stage].name}.`}</p>
      <p class="score">Score <b>${fmt(e.score)}</b></p>
      ${r ? `<p class="stats">Grazes ${fmt(r.graze)} · Spell cards ${r.spellsCaptured}/${r.spellsSeen} · Kills ${r.kills} · Hits ${r.deaths} · Bombs ${r.bombsUsed}</p>` : ''}
      <p class="good">+🌱 ${e.seeds} seeds</p>
      ${e.victory ? '<button class="primary" data-act="loop">♾️ Loop mode: go again, harder, with your ship</button>' : ''}
      <button class="${e.victory ? '' : 'primary'}" data-act="new">▶ New run</button>
      <button data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Dodge.</b> Your ship fires on its own. Only the tiny dot in its middle (the hitbox) can be hit.</li>
          <li><b>Move</b> with the arrow keys or WASD. With a mouse or a finger, drag anywhere: the ship moves by the same distance as your finger.</li>
          <li><b>Focus</b> (hold <kbd>Shift</kbd> or the 🎯 button): move slowly, see the hitbox, and narrow your shots.</li>
          <li><b>Graze</b>: bullets that pass close to the hitbox give points and charge the bomb meter. A full meter gives +1 bomb.</li>
          <li><b>Bomb</b> (<kbd>X</kbd>, <kbd>Space</kbd> or ✿): clears all bullets, hurts every enemy and makes you safe for a moment. Right after a hit you have a split second to bomb and survive.</li>
          <li><b>Items</b>: blue points and pink blooms. Fly above the dotted line near the top to pull all items in for full value.</li>
          <li><b>Stages</b>: each has a mid-boss and a boss. Boss <b>spell cards</b> give a big bonus if you beat them without a hit or a bomb.</li>
          <li>After each stage, pick one of 3 ship parts. Lives and bombs carry over. Clear stage 5 to win, then try loop mode.</li>
          <li>The run saves between stages. If you leave mid-stage, the stage restarts when you continue.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Paused</h2>
      <button class="primary" data-act="modal-close">▶ Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (the stage restarts on continue)</button>
      <button data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
    </div></div>`;
  }

  // ---------- Run flow ----------

  private startStage(): void {
    const r = this.run!;
    this.g = new Game({ seed: r.seed, stage: r.stage, loop: r.loop, load: loadoutOf(r), lives: r.lives, bombs: r.bombs, charge: r.charge, score: r.score, god: this.god });
    this.screen = 'play';
    this.acc = 0;
    this.relX = this.relY = 0;
    this.bombQueued = false;
    this.render();
  }

  private finishStage(): void {
    const r = this.run!;
    const g = this.g!;
    absorbStage(r, g);
    this.meta.totalGraze += g.graze;
    saveMeta(this.meta);
    r.last = { stage: r.stage, score: g.score, graze: g.graze, deaths: g.deaths, spells: `${g.spellsCaptured}/${g.spellsSeen}` };
    this.g = null;
    if (r.stage >= STAGES.length - 1) {
      r.stage = STAGES.length;
      this.endRun(true);
      return;
    }
    r.stage++;
    r.offer = makeOffer(r);
    saveRun(r);
    this.screen = 'parts';
    sfx.clear();
    this.render();
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const m = this.meta;
    if (this.g) {
      r.score = this.g.score;
      r.graze += this.g.graze;
      r.deaths += this.g.deaths;
      r.bombsUsed += this.g.bombsUsed;
      r.kills += this.g.kills;
      r.spellsSeen += this.g.spellsSeen;
      r.spellsCaptured += this.g.spellsCaptured;
    }
    const stage = Math.min(r.stage, STAGES.length - 1);
    const seeds = Math.max(0, seedsFor(r, victory) - r.seedsGiven);
    r.seedsGiven += seeds;
    m.seeds += seeds;
    m.best = Math.max(m.best, r.score);
    m.bestStage = Math.max(m.bestStage, Math.min(STAGES.length, r.stage + (victory ? 0 : 1)) + r.loop * 5);
    m.totalGraze += this.g ? this.g.graze : 0;
    if (victory && !r.won) m.wins++;
    if (victory) r.won = true;
    saveMeta(m);
    saveRun(null);
    this.end = { victory, score: r.score, seeds, stage, loop: r.loop };
    this.g = null;
    this.modal = null;
    this.screen = 'end';
    if (victory) sfx.win();
    else sfx.lose();
    this.render();
  }

  // ---------- Loop ----------

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.screen !== 'play' || !this.g) return;
      if (!this.modal && !this.hidden) {
        this.acc += dt;
        let n = 0;
        while (this.acc >= DT && n < 6) {
          this.acc -= DT;
          n++;
          this.tick(true);
          if (!this.g || this.screen !== 'play') return;
        }
        if (n >= 6) this.acc = 0;
      }
      this.draw();
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** One fixed 60 Hz step with input, sounds and the end-of-stage check. */
  private tick(sound: boolean): void {
    const g = this.g!;
    const inp = this.inp;
    if (this.auto) {
      this.bot.input(g, inp);
    } else {
      let dx = 0;
      let dy = 0;
      const k = this.keys;
      if (k.has('ArrowLeft') || k.has('a')) dx -= 1;
      if (k.has('ArrowRight') || k.has('d')) dx += 1;
      if (k.has('ArrowUp') || k.has('w')) dy -= 1;
      if (k.has('ArrowDown') || k.has('s')) dy += 1;
      inp.dx = dx;
      inp.dy = dy;
      inp.rx = this.relX;
      inp.ry = this.relY;
      this.relX = this.relY = 0;
      inp.focus = k.has('Shift') || this.touchFocus;
      inp.bomb = this.bombQueued;
      this.bombQueued = false;
    }
    g.god = this.god;
    g.step(inp);
    const ev = g.ev;
    if (sound) {
      for (const key of ['shot', 'graze', 'hit', 'item'] as const) if (this.soundT[key] > 0) this.soundT[key]--;
      if (ev.shot && !this.soundT.shot) {
        sfx.shot();
        this.soundT.shot = 6;
      }
      if (ev.graze && !this.soundT.graze) {
        sfx.graze();
        this.soundT.graze = 3;
      }
      if (ev.hit && !this.soundT.hit) {
        sfx.hit();
        this.soundT.hit = 4;
      }
      if (ev.item && !this.soundT.item) {
        sfx.item();
        this.soundT.item = 3;
      }
      if (ev.kill) sfx.kill();
      if (ev.big) sfx.big();
      if (ev.bomb) sfx.bomb();
      if (ev.die) sfx.die();
      if (ev.spell) sfx.spell();
      if (ev.capture) sfx.capture();
      if (ev.bombUp) sfx.bombUp();
      if (ev.shield) sfx.shield();
      if (ev.phase) sfx.phase();
    }
    if (ev.die) {
      this.shake = 14;
      this.flash = 0.6;
    }
    if (ev.bomb) {
      this.shake = 10;
      this.flash = 0.8;
    }
    if (ev.big) this.shake = Math.max(this.shake, 6);
    for (const key in ev) ev[key as keyof typeof ev] = 0;
    if (g.done === 'clear') this.finishStage();
    else if (g.done === 'over') this.endRun(false);
  }

  // ---------- Canvas ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const side = this.root.querySelector<HTMLElement>('aside.side');
    const sideW = side && getComputedStyle(side).display !== 'none' ? side.offsetWidth + 16 : 0;
    const top = this.root.querySelector<HTMLElement>('header.top');
    const tb = this.root.querySelector<HTMLElement>('.touchbar');
    const tbh = tb && getComputedStyle(tb).display !== 'none' ? tb.offsetHeight : 0;
    const availH = window.innerHeight - (top?.offsetHeight ?? 0) - tbh - 16;
    const availW = Math.max(100, Math.min(900, window.innerWidth - sideW - (sideW ? 32 : 0)));
    this.scale = Math.max(0.3, Math.min(availW / W, availH / H));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${Math.floor(W * this.scale)}px`;
    cv.style.height = `${Math.floor(H * this.scale)}px`;
    cv.width = Math.floor(W * this.scale * this.dpr);
    cv.height = Math.floor(H * this.scale * this.dpr);
    this.draw();
  }

  /** Pre-rendered glowing bullet sprite. */
  private sprite(col: number, r: number): HTMLCanvasElement {
    const key = `${col}|${r}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const s = 3;
    const size = Math.ceil((r + 4) * 2 * s);
    c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d')!;
    const m = size / 2;
    const glow = x.createRadialGradient(m, m, r * s * 0.6, m, m, m);
    glow.addColorStop(0, COLORS[col] + 'cc');
    glow.addColorStop(1, COLORS[col] + '00');
    x.fillStyle = glow;
    x.fillRect(0, 0, size, size);
    x.beginPath();
    x.arc(m, m, r * s, 0, TAU);
    x.fillStyle = COLORS[col];
    x.fill();
    x.beginPath();
    x.arc(m, m, r * s * 0.55, 0, TAU);
    x.fillStyle = '#fff';
    x.fill();
    this.sprites.set(key, c);
    return c;
  }

  private draw(): void {
    const ctx = this.ctx;
    const g = this.g;
    if (!ctx || !g) return;
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.save();
    if (this.shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= 0.88;
    }
    const st = g.stageDef;
    if (!this.bgGrad) {
      this.bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      this.bgGrad.addColorStop(0, st.bg[0]);
      this.bgGrad.addColorStop(1, st.bg[1]);
    }
    ctx.fillStyle = this.bgGrad;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    // Scrolling petals
    ctx.fillStyle = st.deco;
    for (let i = 0; i < 46; i++) {
      const sp = 0.4 + ((i * 37) % 10) / 10;
      const x = (i * 97 + Math.sin(g.scroll * 0.01 + i) * 12) % W;
      const y = ((i * 53 + g.scroll * sp) % (H + 20)) - 10;
      ctx.globalAlpha = 0.08 + sp * 0.12;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.5 + sp * 2.5, 1 + sp, i + g.scroll * 0.01, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Collection line
    if (g.mode !== 'clear') {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(0, COLLECT_Y);
      ctx.lineTo(W, COLLECT_Y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Boss spell circle
    const b = g.boss;
    if (b && b.phase >= 0 && b.def.phases[b.phase].name && b.pause === 0) {
      ctx.save();
      ctx.translate(b.e.x, b.e.y);
      ctx.rotate(g.frame * 0.01);
      ctx.strokeStyle = b.def.col + '55';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 46 + i * 12, 0, TAU);
        ctx.stroke();
      }
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = (i * 2 * TAU) / 5;
        ctx.lineTo(Math.cos(a) * 46, Math.sin(a) * 46);
      }
      ctx.stroke();
      ctx.restore();
    }
    // Items
    for (let i = 0; i < g.inn; i++) {
      const x = g.ix[i];
      const y = g.iy[i];
      if (g.ik[i] === 0) {
        ctx.fillStyle = '#4cc9f0';
        ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      } else {
        const big = g.ik[i] === 2;
        this.flower(ctx, x, y, big ? 9 : 4.5, 5, '#ff70a6', '#ffd166', g.frame * 0.05);
      }
    }
    // Laser
    if (g.laserOn && g.hitT === 0 && g.lives > 0) {
      const hw = g.focus ? 7 : 5;
      const lg = ctx.createLinearGradient(g.px - hw, 0, g.px + hw, 0);
      lg.addColorStop(0, 'rgba(255,112,166,0)');
      lg.addColorStop(0.5, `rgba(255,220,240,${0.55 + 0.2 * Math.sin(g.frame * 0.5)})`);
      lg.addColorStop(1, 'rgba(255,112,166,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(g.px - hw, 0, hw * 2, g.py - 8);
    }
    // Player shots
    for (let i = 0; i < g.sn; i++) {
      if (g.skind[i] === 1) {
        ctx.strokeStyle = '#8be9fd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(g.sx[i], g.sy[i]);
        ctx.lineTo(g.sx[i] - g.svx[i] * 0.8, g.sy[i] - g.svy[i] * 0.8);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255,190,220,0.75)';
        ctx.fillRect(g.sx[i] - 1.5, g.sy[i] - 6, 3, 12);
      }
    }
    // Enemies
    for (const e of g.enemies) {
      if (e.dead) continue;
      const fl = e.flash > 0;
      if (e.boss) {
        ctx.fillStyle = e.col + '33';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 10 + 3 * Math.sin(g.frame * 0.1), 0, TAU);
        ctx.fill();
      }
      this.flower(ctx, e.x, e.y, e.r, e.petals, fl ? '#ffffff' : e.col, e.boss ? '#fff4b8' : '#ffd166', e.t * (e.boss ? 0.02 : 0.05));
    }
    // Particles
    for (let i = 0; i < g.pn; i++) {
      ctx.globalAlpha = Math.max(0, g.pl[i]);
      ctx.fillStyle = COLORS[g.pc[i]];
      ctx.fillRect(g.ppx[i] - 1.5, g.ppy[i] - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    // Player
    this.drawPlayer(ctx, g);
    // Enemy bullets on top of everything else in the field
    for (let i = 0; i < g.bn; i++) {
      const r = g.br[i];
      const sp = this.sprite(g.bcol[i], r);
      const sz = (r + 4) * 2;
      const a = g.bage[i] < 8 ? g.bage[i] / 8 : 1;
      if (a < 1) ctx.globalAlpha = a;
      ctx.drawImage(sp, g.bx[i] - sz / 2, g.by[i] - sz / 2, sz, sz);
      if (a < 1) ctx.globalAlpha = 1;
    }
    // Hitbox above bullets so it stays visible
    if (g.focus && g.lives > 0 && g.mode !== 'over') {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(g.px, g.py, GRAZE_R, g.frame * 0.05, g.frame * 0.05 + TAU * 0.8);
      ctx.stroke();
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.arc(g.px, g.py, HIT_R + 1.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(g.px, g.py, HIT_R, 0, TAU);
      ctx.fill();
    }
    // Bomb
    if (g.bombT > 0) {
      const t = 1 - g.bombT / g.load.bombTime;
      const rad = 30 + t * 520;
      ctx.strokeStyle = `rgba(255,112,166,${0.8 * (1 - t)})`;
      ctx.lineWidth = 10 * (1 - t) + 2;
      ctx.beginPath();
      ctx.arc(g.bombX, g.bombY, rad, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + t * 3;
        this.flower(ctx, g.bombX + Math.cos(a) * rad * 0.6, g.bombY + Math.sin(a) * rad * 0.6, 10 * (1 - t) + 3, 5, '#ff70a6', '#fff', t * 4);
      }
    }
    // Texts
    ctx.textAlign = 'center';
    for (const t of g.texts) {
      ctx.globalAlpha = Math.min(1, t.t / 20);
      ctx.font = t.big ? 'bold 15px system-ui, sans-serif' : '10px system-ui, sans-serif';
      ctx.fillStyle = t.c;
      if (t.big) {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        ctx.strokeText(t.s, t.x, t.y);
      }
      ctx.fillText(t.s, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (this.flash > 0.02) {
      ctx.fillStyle = `rgba(255,220,235,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
      this.flash *= 0.9;
    }
    this.drawHud(ctx, g);
  }

  private flower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, petals: number, col: string, center: string, rot: number): void {
    ctx.fillStyle = col;
    for (let i = 0; i < petals; i++) {
      const a = rot + (i / petals) * TAU;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.3, a, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = center;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, TAU);
    ctx.fill();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, g: Game): void {
    if (g.mode === 'over' || g.hitT > 0) {
      if (g.hitT > 0) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(g.px, g.py, 12 - g.hitT, 0, TAU);
        ctx.fill();
      }
      return;
    }
    if (g.invuln > 0 && Math.floor(g.frame / 4) % 2 === 0) ctx.globalAlpha = 0.4;
    const col = g.load.ship.col;
    const x = g.px;
    const y = g.py;
    // Drones
    for (let i = 0; i < g.load.drone; i++) {
      const [ox, oy] = g.droneOffset(i);
      ctx.fillStyle = '#8be9fd';
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, 4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(139,233,253,0.4)';
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, 6.5, g.frame * 0.1, g.frame * 0.1 + 4);
      ctx.stroke();
    }
    // Ship body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y - 13);
    ctx.quadraticCurveTo(x + 9, y - 2, x + 10, y + 9);
    ctx.lineTo(x + 3, y + 5);
    ctx.lineTo(x, y + 10);
    ctx.lineTo(x - 3, y + 5);
    ctx.lineTo(x - 10, y + 9);
    ctx.quadraticCurveTo(x - 9, y - 2, x, y - 13);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(x, y - 3, 2.5, 5, 0, 0, TAU);
    ctx.fill();
    // Engine glow
    ctx.fillStyle = `rgba(255,209,102,${0.5 + 0.4 * Math.sin(g.frame * 0.6)})`;
    ctx.beginPath();
    ctx.arc(x, y + 12, 2.5, 0, TAU);
    ctx.fill();
    if (g.shield) {
      ctx.strokeStyle = 'rgba(76,201,240,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawHud(ctx: CanvasRenderingContext2D, g: Game): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    const b = g.boss;
    const y0 = b && b.intro === 0 ? 26 : 6;
    ctx.fillText(fmt(g.score), 6, y0);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#c9b8de';
    ctx.fillText(`graze ${g.graze}`, 6, y0 + 15);
    // Lives and bombs
    ctx.textAlign = 'right';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#ff4d6d';
    ctx.fillText('♥'.repeat(Math.min(g.lives, 8)), W - 6, y0);
    ctx.fillStyle = '#ff70a6';
    ctx.fillText('✿'.repeat(Math.min(g.bombs, 8)) || '–', W - 6, y0 + 15);
    // Bomb meter
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(W - 66, y0 + 31, 60, 3);
    ctx.fillStyle = '#ff70a6';
    ctx.fillRect(W - 66, y0 + 31, 60 * Math.min(1, g.charge / 100), 3);
    // Boss bar
    if (b && b.intro === 0) {
      const ph = b.def.phases[b.phase] ?? b.def.phases[0];
      const left = b.def.phases.length - b.phase - 1;
      ctx.textAlign = 'left';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillStyle = b.def.col;
      ctx.fillText(b.def.name, 6, 5);
      ctx.fillStyle = '#ffd166';
      ctx.fillText('★'.repeat(Math.max(0, left)), 6 + ctx.measureText(b.def.name).width + 6, 5);
      const bw = W - 60;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(6, 17, bw, 4);
      ctx.fillStyle = b.def.col;
      ctx.fillRect(6, 17, bw * Math.max(0, b.e.hp / b.e.maxHp), 4);
      ctx.textAlign = 'right';
      ctx.font = 'bold 12px system-ui, sans-serif';
      const secs = Math.ceil(b.timeLeft / 60);
      ctx.fillStyle = secs <= 5 && b.pause === 0 ? '#ff4d6d' : '#fff';
      ctx.fillText(b.pause > 0 ? '' : `${secs}`, W - 6, 11);
      if (ph.name && b.pause === 0) {
        const t = Math.min(1, (150 - b.banner) / 30);
        const yy = b.banner > 0 ? 96 - 30 * t : 66;
        ctx.font = 'italic bold 11px system-ui, sans-serif';
        ctx.fillStyle = b.captured ? '#fff' : '#a99bbd';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        ctx.textAlign = 'right';
        ctx.strokeText(ph.name, W - 6, yy);
        ctx.fillText(ph.name, W - 6, yy);
      }
    }
    // Stage intro
    if (g.mode === 'waves1' && g.modeT < 180) {
      const a = Math.min(1, g.modeT / 30, (180 - g.modeT) / 30);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(`STAGE ${g.stage + 1}${g.loop ? ` · LOOP ${g.loop + 1}` : ''}`, W / 2, H * 0.36);
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillStyle = g.stageDef.deco;
      ctx.fillText(`${g.stageDef.icon} ${g.stageDef.name}`, W / 2, H * 0.36 + 20);
      ctx.font = 'italic 12px system-ui, sans-serif';
      ctx.fillStyle = '#ddd';
      ctx.fillText(g.stageDef.sub, W / 2, H * 0.36 + 52);
      ctx.globalAlpha = 1;
    }
    if (g.mode === 'clear') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('STAGE CLEAR', W / 2, H * 0.4);
    }
    if (g.mode === 'over') {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.6, g.modeT / 90)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.modal) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, W, H);
    }
    if (this.god) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7ee08a';
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText('GOD', 6, H - 12);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ---------- Input ----------

  private onDown(e: PointerEvent): void {
    initAudio();
    if (this.screen !== 'play' || this.modal) return;
    const t = e.target as HTMLElement;
    if (e.pointerType === 'touch') document.body.classList.add('touch');
    if (t.id === 'focusBtn') {
      this.touchFocus = true;
      this.focusId = e.pointerId;
      t.classList.add('on');
      e.preventDefault();
      return;
    }
    if (t.id === 'bombBtn') {
      this.bombQueued = true;
      e.preventDefault();
      return;
    }
    if (t.closest('button, header, aside')) return;
    if (this.dragId === null) {
      this.dragId = e.pointerId;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
      e.preventDefault();
    }
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.dragId) return;
    // The ship moves by the finger delta (in playfield pixels).
    const k = 1 / this.scale;
    this.relX += (e.clientX - this.dragX) * k;
    this.relY += (e.clientY - this.dragY) * k;
    this.dragX = e.clientX;
    this.dragY = e.clientY;
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.dragId) this.dragId = null;
    if (e.pointerId === this.focusId) {
      this.focusId = null;
      this.touchFocus = false;
      this.root.querySelector('#focusBtn')?.classList.remove('on');
    }
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down && this.modal) {
      if (key === 'Escape' || (key === 'p' && this.modal.kind === 'menu')) {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'play') return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(key)) e.preventDefault();
    if (down) {
      initAudio();
      if (key === 'Escape' || key === 'p') {
        this.modal = { kind: 'menu', confirm: false };
        this.keys.clear();
        this.render();
        return;
      }
      if ((key === 'x' || key === ' ' || key === 'b') && !e.repeat) this.bombQueued = true;
      this.keys.add(key);
    } else {
      this.keys.delete(key);
    }
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    this.action(el.dataset.act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    switch (act) {
      case 'mute': {
        const m = toggleMute();
        try {
          localStorage.setItem(MUTE_KEY, m ? '1' : '0');
        } catch {
          /* storage blocked */
        }
        if (this.screen === 'play') {
          const btn = this.root.querySelector('header [data-act="mute"]');
          if (btn) btn.textContent = m ? '🔇' : '🔊';
          if (this.modal) this.render();
        } else this.render();
        return;
      }
      case 'help':
        this.modal = { kind: 'help' };
        this.keys.clear();
        this.render();
        return;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        this.keys.clear();
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
        if (this.run) this.endRun(false);
        return;
      case 'title':
        this.modal = null;
        this.g = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        sfx.click();
        this.screen = 'ships';
        this.modal = null;
        this.render();
        return;
      case 'ship': {
        const s = SHIPS.find((x) => x.id === d.id);
        if (!s || !this.meta.unlocked.includes(s.id)) return;
        this.run = newRun(randomSeedText(), s.id);
        this.meta.runs++;
        saveMeta(this.meta);
        saveRun(this.run);
        sfx.pick();
        this.startStage();
        return;
      }
      case 'continue':
        if (!this.run) return;
        if (this.run.offer) {
          this.screen = 'parts';
          this.render();
        } else this.startStage();
        return;
      case 'unlock': {
        const s = SHIPS.find((x) => x.id === d.id);
        if (!s || this.meta.seeds < s.cost || this.meta.unlocked.includes(s.id)) return sfx.deny();
        this.meta.seeds -= s.cost;
        this.meta.unlocked.push(s.id);
        saveMeta(this.meta);
        sfx.pick();
        this.toast(`${s.icon} ${s.name} unlocked!`);
        this.render();
        return;
      }
      case 'part': {
        const r = this.run;
        if (!r || !r.offer) return;
        const id = r.offer[Number(d.i)];
        if (!id) return;
        applyPart(r, id);
        r.offer = null;
        saveRun(r);
        sfx.pick();
        this.toast(`${PARTS[id].icon} ${PARTS[id].name}`);
        this.startStage();
        return;
      }
      case 'loop': {
        const r = this.run;
        if (!r) return;
        r.loop++;
        r.stage = 0;
        r.offer = makeOffer(r);
        saveRun(r);
        this.screen = 'parts';
        this.render();
        return;
      }
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
      state: () => {
        const g = this.g;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          stage: this.run?.stage ?? null,
          loop: this.run?.loop ?? 0,
          ship: this.run?.ship ?? null,
          parts: this.run ? { ...this.run.parts } : null,
          lives: g ? g.lives : (this.run?.lives ?? null),
          bombs: g ? g.bombs : (this.run?.bombs ?? null),
          score: g ? g.score : (this.run?.score ?? null),
          mode: g?.mode ?? null,
          frame: g?.frame ?? 0,
          bullets: g?.bn ?? 0,
          boss: g?.boss ? `${g.boss.def.id} phase ${g.boss.phase + 1}/${g.boss.def.phases.length}` : null,
          god: this.god,
          auto: this.auto,
          end: this.end,
          meta: { ...this.meta },
        };
      },
      /** One bot action. In play it simulates up to `frames` frames (default 600) with the dodging bot. */
      step: (frames = 600) => {
        if (this.modal) {
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            if (!click('[data-act="continue"]')) click('[data-act="new"]');
            return 'title';
          case 'ships':
            click('[data-act="ship"]:not([disabled])');
            return 'ships';
          case 'play': {
            this.auto = true;
            for (let i = 0; i < frames && this.g && this.screen === 'play'; i++) this.tick(false);
            if (this.screen === 'play') this.draw();
            return 'play';
          }
          case 'parts': {
            const offer = this.run?.offer ?? [];
            const best = offer.slice().sort((a, b) => BOT_PRIO.indexOf(a) - BOT_PRIO.indexOf(b))[0];
            click(`[data-act="part"][data-i="${Math.max(0, offer.indexOf(best))}"]`);
            return 'parts';
          }
          case 'end':
            return 'end';
        }
      },
      /** Bot plays in real time. */
      auto: (on = true) => {
        this.auto = on;
      },
      /** Player cannot be hit. */
      god: (on = true) => {
        this.god = on;
        if (this.g) this.g.god = on;
      },
      seeds: (n: number) => {
        this.meta.seeds += n;
        saveMeta(this.meta);
        this.render();
      },
      /** Kill the current boss phase or end the waves. */
      skip: () => {
        const g = this.g;
        if (!g) return;
        if (g.boss) g.boss.e.hp = 0;
        else for (const e of g.enemies) e.hp = 0;
      },
      fast: FAST,
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
