import { drawSolution } from './bot';
import { CHARMS, CHARM_ORDER, PENS, PEN_ORDER, PERKS, WORLDS } from './data';
import { drawScene, drawThumb, type View } from './draw';
import { H, W, buildLevel, extendDraft, finishDraft, go, inkLeft, inkUsed, retry, startDraft, tick, type Level } from './game';
import { levelById, type LevelDef } from './levels';
import { Rng, randomSeedText } from './rng';
import {
  GOAL_INFO,
  NODE_INFO,
  PLAN,
  advance,
  applyPick,
  clearLevel,
  clearRun,
  inkFor,
  loadMeta,
  loadRun,
  makeChest,
  makeShop,
  missLevel,
  newRun,
  nodeKind,
  parFor,
  pickText,
  saveMeta,
  saveRun,
  score,
  starInk,
  starsFor,
  timerBonus,
  type LevelPick,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'level' | 'chest' | 'shop' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

interface Result {
  won: boolean;
  stars: number;
  inkStar: boolean;
  timeStar: boolean;
  gain: number;
  why: string;
  heart: boolean;
}

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` plays levels at once, for bot tests. */
const FAST = PARAMS.has('fast');

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;

  private L: Level | null = null;
  private def: LevelDef | null = null;
  private pen = 'pencil';
  private view: View = { draft: null, clock: 0, parts: [], floats: [], shake: 0, deny: null };
  private result: Result | null = null;
  private fastForward = false;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private scale = 1;
  private scratchT = 0;
  private hitT = 0;
  private lastTimer = -1;
  private end: { victory: boolean; score: number; world: number; earned: number; unlocks: string[] } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
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
      case 'map':
        body = this.mapView();
        break;
      case 'level':
        body = this.levelView();
        break;
      case 'chest':
        body = this.chestView();
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
    if (this.screen === 'level') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.resize();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    if (this.screen === 'map') this.drawThumbs();
  }

  private refreshTop(): void {
    const top = this.root.querySelector<HTMLElement>('header.top');
    if (top && this.run) top.outerHTML = this.topBar();
  }

  private refreshBar(): void {
    const bar = this.root.querySelector<HTMLElement>('#bar');
    if (bar) bar.innerHTML = this.barView();
    this.refreshOver();
  }

  private refreshOver(): void {
    const o = this.root.querySelector<HTMLElement>('#over');
    if (o) o.outerHTML = this.overView();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const hearts = '❤️'.repeat(Math.max(0, r.hearts)) + '<span class="dim">♡</span>'.repeat(Math.max(0, r.maxHearts - r.hearts));
    const charms = r.charms.map((id) => `<span class="relic" title="${CHARMS[id].name}: ${CHARMS[id].text}">${CHARMS[id].icon}</span>`).join('');
    const pens = PEN_ORDER.filter((id) => (r.pens[id] ?? 0) > 0)
      .map((id) => `<span class="relic" title="${PENS[id].name}: ${PENS[id].text}">${PENS[id].icon}<sub>${r.pens[id]}</sub></span>`)
      .join('');
    return `<header class="top">
      <span class="hearts" title="Hearts. A miss costs one.">${hearts}</span>
      <span title="Stars to spend">⭐ ${r.wallet}</span>
      <span>${WORLDS[Math.min(r.world, 2)].icon} ${Math.min(r.world + 1, 3)}-${r.step + 1}</span>
      <span class="relics">${charms}${pens}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const items: { icon: string; name: string; text: string; unlock: number; kind: string }[] = [
      ...PEN_ORDER.filter((id) => PENS[id].unlock > 0).map((id) => ({ ...PENS[id], kind: 'Pen' })),
      ...CHARM_ORDER.filter((id) => CHARMS[id].unlock > 0).map((id) => ({ ...CHARMS[id], kind: 'Charm' })),
      ...PERKS.map((p) => ({ ...p, kind: 'Perk' })),
    ].sort((a, b) => a.unlock - b.unlock);
    const list = items
      .map((it) => {
        const own = m.lifetime >= it.unlock;
        return `<div class="arm ${own ? 'own' : ''}"><span class="big">${it.icon}</span><span><b>${it.name}</b><small>${it.kind}: ${it.text}</small></span>${own ? '<span class="ok">✔</span>' : `<span class="dim">⭐ ${it.unlock}</span>`}</div>`;
      })
      .join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo"><span class="big">✏️</span><h1>Ink Bridge</h1></div>
      <p class="sub">Draw lines. They turn solid and fall. Build bridges, ramps and walls to get the ball to the goal. Clear 3 worlds.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (world ${r.world + 1}, ❤️ ${r.hearts})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best world ${m.bestWorld} · Best score ${m.best} · Levels ${m.cleared} · 3-star levels ${m.threeStars}</p>
      <h2>Sketchbook <small>⭐ ${m.lifetime} stars earned</small></h2>
      <p class="sub">Stars from all runs unlock new pens, charms and perks.</p>
      <div class="armory">${list}</div>
    </div>`;
  }

  private levelCard(p: LevelPick, i: number): string {
    const def = levelById(p.id);
    const g = GOAL_INFO[def.goal];
    const r = this.run!;
    return `<button class="room ${def.boss ? 'r-boss' : ''}" data-act="pick-level" data-i="${i}">
      <canvas class="thumb" data-id="${p.id}" data-mirror="${p.mirror ? 1 : 0}"></canvas>
      <b>${def.boss ? '👑 ' : ''}${def.name}</b>
      <small>${g.icon} ${g.text}</small>
      <small>🖋️ ${inkFor(r, def)} ink${def.timer ? ` · ⏰ ${def.timer + timerBonus(r)} s` : ''}${def.movers?.length ? ' · ⚙️ moving parts' : ''}</small>
    </button>`;
  }

  private mapView(): string {
    const r = this.run!;
    const wd = WORLDS[r.world];
    const track = PLAN.map((k, i) => {
      const state = i < r.step ? 'done' : i === r.step ? 'now' : '';
      return `<span class="node ${state}">${NODE_INFO[k].icon}</span>`;
    }).join('<span class="link"></span>');
    const worlds = WORLDS.map((w, i) => `<span class="wtag ${i === r.world ? 'now' : i < r.world ? 'done' : ''}">${w.icon} ${w.name}</span>`).join('');
    const k = nodeKind(r);
    let rooms = '';
    if (k === 'level' || k === 'boss') rooms = r.options[r.world][r.step].map((p, i) => this.levelCard(p, i)).join('');
    else
      rooms = `<button class="room" data-act="${k}"><span class="huge">${NODE_INFO[k].icon}</span><b>${NODE_INFO[k].name}</b><small>${
        k === 'chest' ? 'Pick one of three: a pen, a charm, ink or a heart.' : 'Spend your stars on hearts, pens, ink and charms.'
      }</small></button>`;
    return `<div class="map">
      <div class="worlds">${worlds}</div>
      <h2>${wd.icon} World ${r.world + 1}: ${wd.name}</h2>
      <p class="sub">${wd.text}</p>
      <div class="track">${track}</div>
      <p class="dim">${k === 'level' ? 'Choose a puzzle.' : k === 'boss' ? 'The boss of this world.' : ''}</p>
      <div class="rooms">${rooms}</div>
    </div>`;
  }

  private drawThumbs(): void {
    this.root.querySelectorAll<HTMLCanvasElement>('canvas.thumb').forEach((cv) => {
      const def = levelById(cv.dataset.id!);
      const L = buildLevel(def, cv.dataset.mirror === '1', def.ink);
      const w = 192;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = w * dpr;
      cv.height = ((w * H) / W) * dpr;
      const c = cv.getContext('2d');
      if (c) drawThumb(c, L, w * dpr);
    });
  }

  private levelView(): string {
    const def = this.def!;
    const g = GOAL_INFO[def.goal];
    return `<div class="lvl">
      <div class="lvl-head"><b>${def.boss ? '👑 ' : ''}${def.name}</b><span class="goal">${g.icon} ${g.text}</span><span id="clock" class="clock"></span></div>
      <div class="cv-wrap"><canvas id="cv"></canvas>${this.overView()}</div>
      <div class="bar" id="bar">${this.barView()}</div>
      <p class="hint">${def.tip}</p>
    </div>`;
  }

  private penLeft(id: string): number {
    if (id === 'pencil') return Infinity;
    const used = this.L ? this.L.strokes.filter((s) => s.pen === id).length : 0;
    return (this.run?.pens[id] ?? 0) - used;
  }

  private barView(): string {
    const L = this.L;
    if (!L) return '';
    const used = inkUsed(L) + (this.view.draft?.ink ?? 0);
    const pct = Math.min(100, (used / L.inkMax) * 100);
    const star = Math.min(100, (starInk(this.def!) / L.inkMax) * 100);
    const draw = L.phase === 'draw' && !this.result;
    const pens = PEN_ORDER.filter((id) => id === 'pencil' || (this.run?.pens[id] ?? 0) > 0)
      .map((id, i) => {
        const left = this.penLeft(id);
        return `<button class="pen ${this.pen === id ? 'on' : ''}" data-act="pen" data-id="${id}" title="${PENS[id].name} (${i + 1}): ${PENS[id].text}" ${draw && left > 0 ? '' : 'disabled'} style="--pc:${PENS[id].color}">${PENS[id].icon}${left === Infinity ? '' : `<sub>${left}</sub>`}</button>`;
      })
      .join('');
    const main = draw
      ? `<button class="primary go" data-act="go">▶ Go</button>`
      : L.phase === 'run'
        ? `<button class="go ${this.fastForward ? 'on' : ''}" data-act="fast">⏩ ${this.fastForward ? 'Fast' : 'Faster'}</button>`
        : '';
    return `<div class="ink" title="Ink. Stay left of the star mark for the ink star.">
        <div class="ink-fill" id="inkfill" style="width:${pct}%"></div><i class="ink-star" style="left:${star}%">⭐</i>
        <span id="inktext">🖋️ ${Math.max(0, L.inkMax - used).toFixed(1)} / ${L.inkMax}</span>
      </div>
      <div class="tools">
        <div class="pens">${pens}</div>
        <button data-act="undo" title="Undo (Z)" ${draw && L.strokes.length ? '' : 'disabled'}>↶ Undo</button>
        <button data-act="clear" title="Clear all strokes" ${draw && L.strokes.length ? '' : 'disabled'}>🧽</button>
        ${main}
      </div>`;
  }

  private overView(): string {
    const res = this.result;
    if (!res) return '<div id="over" class="over hidden"></div>';
    if (res.won) {
      const stars = [true, res.inkStar, res.timeStar].map((ok, i) => `<span class="st ${ok ? 'got' : ''}" style="animation-delay:${0.15 + i * 0.2}s">★</span>`).join('');
      const def = this.def!;
      return `<div id="over" class="over"><div class="card">
        <h2 class="good">Solved!</h2>
        <div class="stars">${stars}</div>
        <p class="dim">✔ cleared · ${res.inkStar ? '✔' : '✘'} ink ≤ ${starInk(def)} · ${res.timeStar ? '✔' : '✘'} ${def.goal === 'keep' ? 'no miss' : `time ≤ ${parFor(this.run!, def).toFixed(1)} s`}</p>
        <p>⭐ +${res.gain}</p>
        <button class="primary" data-act="next">Continue ▶</button>
      </div></div>`;
    }
    const dead = (this.run?.hearts ?? 0) <= 0;
    return `<div id="over" class="over"><div class="card">
      <h2 class="bad">Miss!</h2>
      <p>${res.why}</p>
      <p>${res.heart ? '💔 −1 heart' : '🩹 The Patch Kit saved your heart.'}</p>
      ${dead ? '<button class="danger" data-act="lose">See results</button>' : '<button class="primary" data-act="retry">↺ Try again</button><p class="dim">Your strokes stay. Change them and press Go.</p>'}
    </div></div>`;
  }

  private chestView(): string {
    const r = this.run!;
    const picks = (r.chest ?? [])
      .map((p, i) => {
        const t = pickText(p);
        return `<button class="pick" data-act="chest-pick" data-i="${i}"><span class="big">${t.icon}</span><b>${t.name}</b><small>${t.text}</small></button>`;
      })
      .join('');
    return `<div class="reward"><span class="huge pop">🎁</span><h2>Chest</h2><p class="sub">Take one.</p><div class="picks">${picks}</div>
      <button data-act="skip">Skip</button></div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const items = (r.shop ?? [])
      .map((it, i) => {
        const t = pickText(it.pick);
        const full = it.pick.kind === 'heart' && r.hearts >= r.maxHearts;
        const ok = !it.sold && r.wallet >= it.cost && !full;
        return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${ok ? '' : 'disabled'}><span class="big">${t.icon}</span><b>${t.name}</b><small>${t.text}</small><span class="cost">${it.sold ? 'Sold' : full ? 'Full' : `⭐ ${it.cost}`}</span></button>`;
      })
      .join('');
    return `<div class="shopv"><h2>🛒 Stationery shop</h2><p>⭐ ${r.wallet} stars</p><div class="picks">${items}</div>
      <button class="primary" data-act="leave">Leave ▶</button></div>`;
  }

  private endView(): string {
    const e = this.end!;
    const un = e.unlocks.length ? `<p class="good">New in the sketchbook: ${e.unlocks.join(', ')}</p>` : '';
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Victory!' : '💔 Out of hearts'}</h1>
      <p>${e.victory ? 'All three worlds are drawn and solved.' : `You ran out of hearts in world ${e.world + 1}: ${WORLDS[e.world].name}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>⭐ ${e.earned} stars earned this run</p>
      ${un}
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Draw</b> with the mouse or a finger. When you let go, the line turns into a solid object.</li>
          <li><b>Press Go</b> (or Space). Your strokes, the ball and the crates start to fall. Strokes that cross each other become one object.</li>
          <li><b>Close a loop</b> (end near the start) to make a solid filled block.</li>
          <li><b>Goals:</b> 🏁 get the ball into the green cup, 📦 knock the blue crate into the green zone, ⏱️ keep the ball (and orange crates) off the spikes until the clock runs out.</li>
          <li><b>Ink</b> is limited. Lines stop at walls, crates and striped no-draw zones. Undo (Z) gives the ink back.</li>
          <li><b>A miss</b> (ball lost, spikes, stuck, or 14 s) costs a heart. Your strokes stay, so you can fix them.</li>
          <li><b>Stars:</b> one for the clear, one for ink at or below the ⭐ mark, one for time (Go to goal) under par. Keep levels give the third star for no miss.</li>
          <li><b>Bosses</b> have moving parts (the dashed lines show their path) and a draw timer. When it runs out, Go starts by itself.</li>
          <li><b>Pens</b> from chests and the shop: 🟢 rubber bounces, ⚫ lead is heavy, 📌 glue stays in place, 🧊 ice slides. Keys 1–5 pick a pen.</li>
          <li>Spend stars in shops. Stars from all runs unlock new pens, charms and perks.</li>
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

  // ---------- Level flow ----------

  private startLevel(pick: LevelPick): void {
    const r = this.run!;
    const def = levelById(pick.id);
    r.cur = { pick, misses: 0 };
    saveRun(r);
    this.def = def;
    this.L = buildLevel(def, pick.mirror, inkFor(r, def), timerBonus(r));
    this.pen = 'pencil';
    this.result = null;
    this.fastForward = false;
    this.view = { draft: null, clock: 0, parts: [], floats: [], shake: 0, deny: null };
    this.lastTimer = -1;
    this.screen = 'level';
    this.render();
    if (def.boss) this.toast(`Boss: ${def.name}. Draw before the timer runs out.`);
  }

  private doGo(): void {
    const L = this.L;
    if (!L || L.phase !== 'draw' || this.result) return;
    this.cancelDraft();
    go(L);
    sfx.go();
    this.refreshBar();
  }

  private undo(): void {
    const L = this.L;
    if (!L || L.phase !== 'draw' || this.result || !L.strokes.length) return;
    L.strokes.pop();
    sfx.undo();
    if (this.penLeft(this.pen) <= 0) this.pen = 'pencil';
    this.refreshBar();
  }

  private cancelDraft(): void {
    if (this.view.draft) {
      this.view.draft = null;
    }
  }

  private onLevelEnd(): void {
    const L = this.L!;
    const r = this.run!;
    const def = this.def!;
    if (L.phase === 'won') {
      const st = starsFor(r, def, inkUsed(L), L.t, r.cur?.misses ?? 0);
      // Pens used in the winning drawing are spent.
      for (const s of L.strokes) if (s.pen !== 'pencil') r.pens[s.pen] = Math.max(0, (r.pens[s.pen] ?? 0) - 1);
      const gain = clearLevel(r, def, st.stars);
      this.meta.lifetime += gain;
      this.meta.cleared++;
      if (st.stars === 3) this.meta.threeStars++;
      saveMeta(this.meta);
      saveRun(r);
      this.result = { won: true, stars: st.stars, inkStar: st.ink, timeStar: st.time, gain, why: '', heart: false };
      sfx.win();
      for (let i = 0; i < st.stars; i++) setTimeout(() => sfx.star(i), 250 + i * 200);
      this.confetti(L.ball.x, L.ball.y);
      this.view.floats.push({ x: L.ball.x, y: L.ball.y + 0.8, text: `+${gain}⭐`, color: '#ffd166', t: 0 });
    } else {
      const heart = missLevel(r);
      saveRun(r);
      this.result = { won: false, stars: 0, inkStar: false, timeStar: false, gain: 0, why: L.why, heart };
      sfx.miss();
      this.view.shake = 0.25;
      this.view.floats.push({ x: Math.max(1, Math.min(W - 1, L.ball.x)), y: Math.max(1, Math.min(H - 2, L.ball.y)) + 0.5, text: heart ? '−1 ❤️' : '🩹', color: '#ef476f', t: 0 });
    }
    this.refreshTop();
    this.refreshBar();
  }

  private retryLevel(): void {
    if (!this.L || !this.run) return;
    this.L = retry(this.L, timerBonus(this.run));
    this.result = null;
    this.fastForward = false;
    this.lastTimer = -1;
    this.refreshBar();
  }

  private nextFromLevel(): void {
    const r = this.run!;
    this.L = null;
    this.result = null;
    this.step();
    void r;
  }

  /** Moves the run to the next node. */
  private step(): void {
    const r = this.run!;
    const a = advance(r);
    if (a === 'won') return this.endRun(true);
    if (a === 'world') {
      this.meta.bestWorld = Math.max(this.meta.bestWorld, r.world + 1);
      saveMeta(this.meta);
      this.toast(`${WORLDS[r.world].icon} World ${r.world + 1}: ${WORLDS[r.world].name}`);
    }
    saveRun(r);
    this.screen = 'map';
    this.render();
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const before = this.unlockNames(this.meta.lifetime - r.earned);
    const sc = score(r, victory);
    const m = this.meta;
    if (victory) m.wins++;
    m.best = Math.max(m.best, sc);
    m.bestWorld = Math.max(m.bestWorld, Math.min(3, r.world + (victory ? 0 : 1)));
    saveMeta(m);
    const after = this.unlockNames(m.lifetime);
    this.end = { victory, score: sc, world: Math.min(r.world, 2), earned: r.earned, unlocks: after.filter((n) => !before.includes(n)) };
    this.run = null;
    this.L = null;
    this.result = null;
    clearRun();
    this.screen = 'end';
    if (victory) sfx.victory();
    else sfx.defeat();
    this.render();
  }

  private unlockNames(life: number): string[] {
    return [
      ...PEN_ORDER.filter((id) => PENS[id].unlock > 0 && life >= PENS[id].unlock).map((id) => PENS[id].name),
      ...CHARM_ORDER.filter((id) => CHARMS[id].unlock > 0 && life >= CHARMS[id].unlock).map((id) => CHARMS[id].name),
      ...PERKS.filter((p) => life >= p.unlock).map((p) => p.name),
    ];
  }

  // ---------- Canvas loop ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const maxW = wrap.clientWidth;
    const reserve = window.innerWidth < 600 ? 230 : 210;
    const maxH = Math.max(160, window.innerHeight - reserve);
    const w = Math.floor(Math.min(maxW, (maxH * W) / H, 1100));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${w}px`;
    cv.style.height = `${(w * H) / W}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(((w * H) / W) * dpr);
    this.scale = cv.width / W;
  }

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.acc = 0;
    const loop = (now: number): void => {
      if (this.screen !== 'level' || !this.ctx) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    const L = this.L;
    const v = this.view;
    v.clock += dt;
    if (L && !this.modal && !this.result) {
      if (L.phase === 'draw') {
        if (L.timer) {
          this.acc += dt;
          while (this.acc >= 1 / 60 && L.phase === 'draw') {
            this.acc -= 1 / 60;
            tick(L);
          }
          if (L.phase !== 'draw') {
            this.cancelDraft();
            sfx.go();
            this.toast('Time is up. Go!');
            this.refreshBar();
          }
        }
      } else if (L.phase === 'run') {
        this.acc += dt * (this.fastForward ? 3 : 1);
        let n = 0;
        while (this.acc >= 1 / 60 && L.phase === 'run' && n < 12) {
          this.acc -= 1 / 60;
          tick(L);
          n++;
          this.onHits();
        }
        if (L.phase !== 'run') this.onLevelEnd();
      }
    }
    for (const p of v.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 9 * dt;
      p.life -= dt;
    }
    v.parts = v.parts.filter((p) => p.life > 0);
    for (const f of v.floats) f.t += dt;
    v.floats = v.floats.filter((f) => f.t < 1.4);
    v.shake = Math.max(0, v.shake - dt * 0.8);
    if (v.deny) {
      v.deny.t += dt;
      if (v.deny.t > 0.5) v.deny = null;
    }
    this.scratchT -= dt;
    this.hitT -= dt;
    this.updateClock();
  }

  private updateClock(): void {
    const el = this.root.querySelector<HTMLElement>('#clock');
    const L = this.L;
    if (!el || !L) return;
    let txt = '';
    if (L.phase === 'draw' && L.timer) {
      const left = Math.max(0, Math.ceil(L.timer - L.drawT));
      txt = `⏰ ${left}s`;
      if (left !== this.lastTimer && left <= 5 && left > 0) sfx.tick();
      this.lastTimer = left;
      el.classList.toggle('warn', left <= 5);
    } else if (L.phase === 'run' || L.phase === 'won') {
      txt = L.def.goal === 'keep' ? `⏱️ ${Math.max(0, (L.def.keep ?? 4) - L.t).toFixed(1)}s` : `⏱️ ${L.t.toFixed(1)}s`;
      el.classList.remove('warn');
    } else txt = '';
    if (el.textContent !== txt) el.textContent = txt;
  }

  private onHits(): void {
    const L = this.L!;
    for (const h of L.hits) {
      if (h.speed > 2.5) {
        for (let i = 0; i < Math.min(6, h.speed); i++) {
          this.view.parts.push({ x: h.x, y: h.y, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2, life: 0.4, max: 0.4, color: 'rgba(255,255,255,0.6)', size: 0.08 });
        }
      }
      if (this.hitT <= 0) {
        sfx.hit(h.speed);
        this.hitT = 0.05;
      }
    }
  }

  private confetti(x: number, y: number): void {
    const cols = ['#ff5d8f', '#ffd166', '#7ee08a', '#4cc9f0', '#c77dff'];
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI;
      const sp = 3 + Math.random() * 6;
      this.view.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.2, max: 1.2, color: cols[i % cols.length], size: 0.15 });
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    const L = this.L;
    if (!ctx || !L) return;
    drawScene(ctx, L, this.scale, this.view);
    const d = this.view.draft;
    if (d) {
      const fill = this.root.querySelector<HTMLElement>('#inkfill');
      const txt = this.root.querySelector<HTMLElement>('#inktext');
      const used = inkUsed(L) + d.ink;
      if (fill) fill.style.width = `${Math.min(100, (used / L.inkMax) * 100)}%`;
      if (txt) txt.textContent = `🖋️ ${Math.max(0, L.inkMax - used).toFixed(1)} / ${L.inkMax}`;
    }
  }

  // ---------- Input ----------

  private toWorld(e: PointerEvent): { x: number; y: number } | null {
    const cv = this.canvas;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: H - ((e.clientY - r.top) / r.height) * H };
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if (this.screen !== 'level' || e.target !== this.canvas || this.modal) return;
    const L = this.L;
    if (!L || L.phase !== 'draw' || this.result) return;
    e.preventDefault();
    const p = this.toWorld(e)!;
    if (this.penLeft(this.pen) <= 0) this.pen = 'pencil';
    if (inkLeft(L) < 0.3) {
      this.toast('Out of ink. Undo a stroke to get it back.');
      sfx.deny();
      return;
    }
    const d = startDraft(L, p.x, p.y, this.pen);
    if (!d) {
      this.view.deny = { x: p.x, y: p.y, t: 0 };
      sfx.deny();
      return;
    }
    this.view.draft = d;
    try {
      this.canvas!.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  private onMove(e: PointerEvent): void {
    const d = this.view.draft;
    if (!d || !this.L) return;
    const p = this.toWorld(e)!;
    const before = d.pts.length;
    extendDraft(this.L, d, p.x, p.y);
    if (d.pts.length > before && this.scratchT <= 0) {
      sfx.scratch();
      this.scratchT = 0.07;
    }
  }

  private onUp(_e: PointerEvent): void {
    const d = this.view.draft;
    if (!d || !this.L) return;
    this.view.draft = null;
    const s = finishDraft(this.L, d);
    if (s) {
      this.L.strokes.push(s);
      sfx.stroke();
      if (s.closed) this.view.floats.push({ x: s.pts[0].x, y: s.pts[0].y + 0.6, text: 'block', color: '#c9a6ff', t: 0 });
      if (this.penLeft(this.pen) <= 0) this.pen = 'pencil';
    }
    this.refreshBar();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (e.key === 'Escape' && this.run && this.screen !== 'title' && this.screen !== 'end') {
      this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.screen === 'level') {
      const L = this.L;
      if (!L) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (this.result) this.action(this.result.won ? 'next' : (this.run?.hearts ?? 0) <= 0 ? 'lose' : 'retry', {});
        else if (L.phase === 'draw') this.doGo();
        else if (L.phase === 'run') this.action('fast', {});
      } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
        e.preventDefault();
        this.undo();
      } else if (e.key === 'f' || e.key === 'F') this.action('fast', {});
      else if (/^[1-5]$/.test(e.key)) {
        const owned = PEN_ORDER.filter((id) => id === 'pencil' || (this.run?.pens[id] ?? 0) > 0);
        const id = owned[+e.key - 1];
        if (id) this.action('pen', { id });
      }
      return;
    }
    if (this.screen === 'map' && /^[12]$/.test(e.key)) {
      const btn = this.root.querySelectorAll<HTMLElement>('.rooms .room')[+e.key - 1];
      btn?.click();
    }
    if (this.screen === 'chest' && /^[1-3]$/.test(e.key)) this.root.querySelectorAll<HTMLElement>('[data-act="chest-pick"]')[+e.key - 1]?.click();
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    if ((el as HTMLButtonElement).disabled) return;
    this.action(el.dataset.act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const r = this.run;
    switch (act) {
      case 'mute':
        toggleMute();
        this.refreshTop();
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
        if (this.run) this.endRun(false);
        return;
      case 'title':
        this.modal = null;
        this.L = null;
        this.result = null;
        if (this.run) this.run.cur = null;
        saveRun(this.run);
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.run = newRun(randomSeedText(), this.meta);
        this.meta.runs++;
        saveMeta(this.meta);
        saveRun(this.run);
        this.screen = 'map';
        this.render();
        return;
      case 'continue':
        if (!this.run) return;
        if (this.run.cur) return this.startLevel(this.run.cur.pick);
        this.screen = this.run.chest ? 'chest' : this.run.shop ? 'shop' : 'map';
        this.render();
        return;
      case 'pick-level':
        if (!r) return;
        this.startLevel(r.options[r.world][r.step][+d.i!]);
        return;
      case 'chest':
        if (!r) return;
        r.chest = makeChest(r, this.meta);
        saveRun(r);
        sfx.item();
        this.screen = 'chest';
        this.render();
        return;
      case 'shop':
        if (!r) return;
        r.shop = makeShop(r, this.meta);
        saveRun(r);
        this.screen = 'shop';
        this.render();
        return;
      case 'chest-pick': {
        const p = r?.chest?.[+d.i!];
        if (!r || !p) return;
        applyPick(r, p);
        sfx.item();
        this.toast(`${pickText(p).icon} ${pickText(p).name}`);
        this.step();
        return;
      }
      case 'skip':
      case 'leave':
        this.step();
        return;
      case 'buy': {
        const it = r?.shop?.[+d.i!];
        if (!r || !it || it.sold || r.wallet < it.cost) return sfx.deny();
        r.wallet -= it.cost;
        it.sold = true;
        applyPick(r, it.pick);
        saveRun(r);
        sfx.coin();
        this.render();
        return;
      }
      case 'pen': {
        const id = d.id!;
        if (this.penLeft(id) <= 0) return sfx.deny();
        this.pen = id;
        this.refreshBar();
        return;
      }
      case 'undo':
        this.undo();
        return;
      case 'clear':
        if (this.L && this.L.phase === 'draw' && !this.result) {
          this.L.strokes = [];
          this.pen = 'pencil';
          sfx.undo();
          this.refreshBar();
        }
        return;
      case 'go':
        this.doGo();
        return;
      case 'fast':
        if (this.L?.phase === 'run') {
          this.fastForward = !this.fastForward;
          this.refreshBar();
        }
        return;
      case 'retry':
        this.retryLevel();
        return;
      case 'next':
        this.nextFromLevel();
        return;
      case 'lose':
        this.endRun(false);
        return;
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const rng = new Rng(Date.now() & 0xffff);
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLElement>(sel);
      if (!el || (el as HTMLButtonElement).disabled) return false;
      el.click();
      return true;
    };
    const api = {
      /** Hand error of the bot in world units. */
      sigma: 0.08,
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        world: this.run?.world ?? null,
        step: this.run?.step ?? null,
        hearts: this.run?.hearts ?? null,
        wallet: this.run?.wallet ?? null,
        level: this.def && this.L ? this.def.id : null,
        phase: this.L?.phase ?? null,
        strokes: this.L?.strokes.length ?? 0,
        ink: this.L ? +inkUsed(this.L).toFixed(2) : 0,
        result: this.result,
        end: this.end,
        meta: this.meta,
      }),
      stars: (n: number) => {
        if (this.run) this.run.wallet += n;
        this.refreshTop();
      },
      lifetime: (n: number) => {
        this.meta.lifetime += n;
        saveMeta(this.meta);
        this.render();
      },
      pen: (id: string, n = 3) => {
        if (this.run) this.run.pens[id] = (this.run.pens[id] ?? 0) + n;
        this.render();
      },
      /** Draws the stored solution for the current level (no Go). */
      solve: (sigma = 0) => {
        if (this.L && this.L.phase === 'draw') {
          drawSolution(this.L, rng, sigma);
          this.refreshBar();
        }
      },
      step: () => {
        if (this.modal) {
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'map':
            if (!click('[data-act="pick-level"]') && !click('[data-act="chest"]')) click('[data-act="shop"]');
            return 'map';
          case 'chest': {
            const r = this.run!;
            const i = r.chest?.findIndex((p) => p.kind === 'heart' && r.hearts < r.maxHearts) ?? -1;
            click(`[data-act="chest-pick"][data-i="${Math.max(0, i)}"]`);
            return 'chest';
          }
          case 'shop': {
            const r = this.run!;
            if (r.hearts < r.maxHearts) click('[data-act="buy"][data-i="0"]');
            click('[data-act="leave"]');
            return 'shop';
          }
          case 'level': {
            const L = this.L!;
            if (this.result) {
              if (!click('[data-act="next"]') && !click('[data-act="retry"]')) click('[data-act="lose"]');
              return 'result';
            }
            if (L.phase === 'draw') {
              drawSolution(L, rng, api.sigma);
              this.refreshBar();
              this.doGo();
              return 'go';
            }
            if (L.phase === 'run') {
              if (!FAST) return 'busy';
              for (let i = 0; i < 180 && L.phase === 'run'; i++) {
                tick(L);
              }
              if (L.phase !== 'run') this.onLevelEnd();
              return 'run';
            }
            return 'busy';
          }
          case 'end':
            return 'end';
        }
        return 'idle';
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
