import { solutionCtrl, stallNuke, type Ctrl } from './bot';
import { ACTS, BOSSES, CURSES, JOBS, JOB_IDS, THEMES, UNLOCKS, type Job } from './data';
import {
  AIR,
  BRICK,
  DIRT,
  FIRE,
  GATE,
  H,
  STEEL,
  TPS,
  WATER,
  alive,
  assign,
  canAssign,
  lostCount,
  newGame,
  nuke,
  tick,
  won,
  type Critter,
  type Ev,
  type Game,
} from './game';
import { SEG_INFO, type Checked, type SegKind } from './levels';
import { hash, randomSeedText } from './rng';
import {
  NODE_INFO,
  ROWS,
  advance,
  applyReward,
  choices,
  clearRun,
  curNode,
  levelDone,
  levelFor,
  loadMeta,
  loadRun,
  meadowOptions,
  newRun,
  pickNode,
  rewardText,
  saveMeta,
  saveRun,
  score,
  unlockCost,
  woolFor,
  type Reward,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'play' | 'reward' | 'meadow' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'restart' };

interface Fx {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  size: number;
}

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

interface Result {
  win: boolean;
  saved: number;
  need: number;
  lost: number;
  outcome: 'reward' | 'retry' | 'end';
}

const params = new URLSearchParams(location.search);
/** `?debug&fast` lets `debug.step()` play big chunks of a level at once. */
const FAST = params.has('fast');
const DEBUG = params.has('debug');

const JOB_KEYS: Record<string, Job> = { '1': 'blocker', '2': 'digger', '3': 'basher', '4': 'builder', '5': 'climber', '6': 'floater', '7': 'bomber' };

const DEATH_ICON: Partial<Record<Ev['k'], string>> = { splat: '💥', drown: '💧', burn: '🔥', boom: '💣', trap: '🪤', wolf: '🐺' };

const fmtTime = (ticks: number): string => {
  const s = Math.max(0, Math.ceil(ticks / TPS));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;

  // Level play
  private chk: Checked | null = null;
  private g: Game | null = null;
  private sel: Job = 'builder';
  private paused = true;
  private intro = true;
  private speed = 1;
  private bot: Ctrl | null = null;
  private result: Result | null = null;
  private acc = 0;
  private hover: Critter | null = null;
  private camX = 0;
  private follow = true;
  private cs = 6;
  private viewW = 100;
  /** Rows shown: the canvas crops deep rock and empty sky. */
  private vTop = 0;
  private vRows = H;
  private fx: Fx[] = [];
  private floats: Float[] = [];
  private shake = 0;
  private nukeArm = 0;
  private overAt = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private terrain: HTMLCanvasElement | null = null;
  private terrainVer = -1;
  private terrainImg: ImageData | null = null;
  private hasLiquid = false;
  private raf = 0;
  private last = 0;
  private time = 0;
  private dpr = 1;
  private drag: { id: number; x: number; y: number; cam: number; moved: boolean } | null = null;
  private hudKey = '';
  private jobsKey = '';

  private end: { victory: boolean; score: number; wool: number; act: number; saved: number; cleared: number } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => (this.drag = null));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    if (DEBUG) this.installDebug();
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
      case 'play':
        body = this.playView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'meadow':
        body = this.meadowView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    this.hudKey = '';
    this.jobsKey = '';
    if (this.screen === 'play') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.resize();
      this.updateHud();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
    }
  }

  private refreshTop(): void {
    const top = this.root.querySelector<HTMLElement>('header.top');
    if (top && this.run) top.outerHTML = this.topBar();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    return `<header class="top">
      <span class="hearts" title="Hearts: a failed level or a restart costs one">❤️ ${r.hearts}/${r.maxHearts}</span>
      <span title="Herd: critters you have">🐑 ${r.herd}</span>
      <span class="where">${ACTS[Math.min(r.act, 2)].icon} ${Math.min(r.act + 1, 3)}-${Math.min(r.row + 1, ROWS)}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const shop = UNLOCKS.map((u) => {
      const own = m.unlocked.includes(u.id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${u.icon}</span><span><b>${u.name}</b><small>${u.text}</small></span>
        ${own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.wool >= u.cost ? '' : 'disabled'}>🧶 ${u.cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo">🐑🐑🐑</div>
      <h1>Herd Path</h1>
      <p class="sub">Your critters walk on their own. Give single critters a job to make a path for the rest. Lead the herd through 3 acts.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (act ${r.act + 1}, 🐑 ${r.herd}, ❤️ ${r.hearts})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best act ${m.bestAct} · Best score ${m.best} · Critters saved ${m.totalSaved}</p>
      <h2>Barn <small>🧶 ${m.wool} wool</small></h2>
      <p class="sub">Each run gives wool. Spend it on unlocks for later runs.</p>
      <div class="armory">${shop}</div>
    </div>`;
  }

  private kitHtml(): string {
    const r = this.run!;
    const items = JOB_IDS.filter((j) => r.kit[j] > 0).map((j) => `<span class="chip" title="${JOBS[j].text}">${JOBS[j].icon} ${JOBS[j].name} +${r.kit[j]}</span>`);
    return items.length ? `<div class="bag">${items.join('')}</div>` : '<p class="dim small">No extra jobs yet. Rewards add jobs to every level.</p>';
  }

  private mapView(): string {
    const r = this.run!;
    const act = ACTS[r.act];
    const can = new Set(choices(r));
    const W = 320;
    const rowH = 70;
    const Hh = ROWS * rowH;
    const px = (i: number, n: number): number => ((i + 0.5) / n) * W;
    const py = (row: number): number => row * rowH + 35;
    let lines = '';
    let nodes = '';
    r.map.forEach((row, ri) => {
      row.forEach((node, i) => {
        for (const j of node.next) {
          const on = r.trail[ri] === i && (ri + 1 < r.row ? r.trail[ri + 1] === j : ri + 1 === r.row);
          lines += `<line x1="${px(i, row.length)}" y1="${py(ri)}" x2="${px(j, r.map[ri + 1].length)}" y2="${py(ri + 1)}" class="${on ? 'on' : ''}"/>`;
        }
        const done = r.trail[ri] === i;
        const now = ri === r.row && can.has(i);
        const info = NODE_INFO[node.type];
        const icon = node.type === 'boss' ? BOSSES[act.boss].icon : node.type === 'cursed' && node.curse ? CURSES[node.curse].icon : info.icon;
        nodes += `<g class="mnode ${done ? 'done' : ''} ${now ? 'can' : ''} t-${node.type}" ${now ? `data-act="node" data-i="${i}"` : ''} transform="translate(${px(i, row.length)},${py(ri)})">
          <circle r="${node.type === 'boss' ? 25 : 20}"/><text y="7" text-anchor="middle">${icon}</text></g>`;
      });
    });
    const cards = [...can]
      .map((i) => {
        const n = r.map[r.row][i];
        const info = NODE_INFO[n.type];
        let extra = '';
        if (n.type === 'boss') extra = `<small class="foe">${BOSSES[act.boss].icon} ${BOSSES[act.boss].name}: ${BOSSES[act.boss].text}</small>`;
        if (n.curse) extra = `<small class="foe">${CURSES[n.curse].icon} ${CURSES[n.curse].name}: ${CURSES[n.curse].text}</small>`;
        return `<button class="room" data-act="node" data-i="${i}"><span class="big">${n.type === 'boss' ? BOSSES[act.boss].icon : info.icon}</span><b>${info.name}</b><small>${info.text}</small>${extra}</button>`;
      })
      .join('');
    return `<div class="map">
      <h2>${act.icon} Act ${r.act + 1}: ${act.name}</h2>
      <p class="sub">Pick the next stop on the path.</p>
      <div class="rooms">${cards}</div>
      <svg class="mapsvg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}">${lines}${nodes}</svg>
      <h3>Extra jobs</h3>${this.kitHtml()}
    </div>`;
  }

  private playView(): string {
    const g = this.g!;
    const lv = g.lv;
    const r = this.run!;
    const node = curNode(r);
    const title = lv.boss ? `${BOSSES[lv.boss].icon} ${BOSSES[lv.boss].name}` : `${NODE_INFO[node.type].icon} ${lv.name}`;
    const curse = lv.curse ? `<span class="badge curse" title="${CURSES[lv.curse].text}">${CURSES[lv.curse].icon} ${CURSES[lv.curse].name}</span>` : '';
    const jobs = JOB_IDS.map((j, i) => `<button class="job" data-act="job" data-job="${j}" title="${JOBS[j].name} (${i + 1}): ${JOBS[j].text}"><span class="ji">${JOBS[j].icon}</span><b class="jn"></b><small>${JOBS[j].name}</small></button>`).join('');
    const overlay = this.result ? this.resultHtml() : '';
    const intro = this.intro && !this.result ? this.introHtml() : '';
    return `<div class="play">
      <div class="lvhead"><b>${title}</b>${curse}<span class="grow"></span><span id="hud" class="hud"></span></div>
      <div class="cv-wrap"><canvas id="cv"></canvas>${overlay}</div>
      ${intro}
      <div class="jobs" id="jobs">${jobs}</div>
      <div class="ctl">
        <button data-act="pause" id="b-pause" title="Pause (Space)">⏸ Pause</button>
        <button data-act="speed" id="b-speed" title="Speed (F)">⏩ x3</button>
        <button data-act="nuke" id="b-nuke" title="Nuke (N twice): every critter out explodes">💣 Nuke</button>
        <button data-act="restart" title="Restart (R): costs a heart">↺ Restart</button>
      </div>
      <p class="hint" id="hint">${this.hintText()}</p>
    </div>`;
  }

  private introHtml(): string {
    const g = this.g!;
    const lv = g.lv;
    const segs = lv.segs.map((s) => SEG_INFO[s as SegKind]?.name ?? s).join(' → ');
    const boss = lv.boss ? `<p class="foe">${BOSSES[lv.boss].text}</p>` : '';
    const curse = lv.curse ? `<p class="foe">${CURSES[lv.curse].icon} ${CURSES[lv.curse].name}: ${CURSES[lv.curse].text}</p>` : '';
    const jobs = JOB_IDS.filter((j) => g.jobs[j] > 0).map((j) => `${JOBS[j].icon}×${g.jobs[j]}`).join(' ');
    return `<div class="introbar">
      <div class="itext">
        <p>Save <b>${lv.need}</b> of <b>${lv.count}</b> critters in <b>${fmtTime(lv.time)}</b>. Jobs: ${jobs || 'none'}</p>
        ${boss}${curse}
        <p class="dim small">On the way: ${segs}. Look at the level, then let them out.</p>
      </div>
      <button class="primary" data-act="go">▶ Let them out</button>
    </div>`;
  }

  private resultHtml(): string {
    const res = this.result!;
    const r = this.run!;
    if (res.win) {
      return `<div class="over result good-b">
        <h2 class="good">🏁 Level clear!</h2>
        <p>Saved <b>${res.saved}</b> (needed ${res.need}). ${res.lost ? `Lost ${res.lost} from the herd.` : 'Nobody lost!'}</p>
        <p>🐑 Herd now ${r.herd}</p>
        <button class="primary" data-act="result-ok">${res.outcome === 'end' ? 'See the end' : 'Collect reward ▶'}</button>
      </div>`;
    }
    return `<div class="over result bad-b">
      <h2 class="bad">💔 Not enough</h2>
      <p>Saved <b>${res.saved}</b> of the <b>${res.need}</b> needed. You lose a heart.</p>
      ${res.outcome === 'end' ? '<p class="bad">No hearts left. The run is over.</p>' : `<p>❤️ ${r.hearts} left. The herd waits at the hatch. Try again.</p>`}
      <button class="primary" data-act="result-ok">${res.outcome === 'end' ? 'See the end' : '↺ Try again'}</button>
    </div>`;
  }

  private hintText(): string {
    const j = JOBS[this.sel];
    return `${j.icon} <b>${j.name}</b>: ${j.text} Tap a critter to give it the job.${this.panning ? ' Drag the view or tap the mini map to look around.' : ''}`;
  }

  private rewardCard(rw: Reward, i: number, act: string): string {
    const t = rewardText(rw, this.run!);
    return `<button class="pick" data-act="${act}" data-i="${i}"><span class="big">${t.icon}</span><b>${t.name}</b><small>${t.text}</small></button>`;
  }

  private rewardView(): string {
    const r = this.run!;
    const cards = r.rewards.map((rw, i) => this.rewardCard(rw, i, 'reward')).join('');
    return `<div class="reward">
      <h2>🎁 Reward</h2>
      <p class="sub">${r.picks > 1 ? `Pick ${r.picks} rewards (cursed field bonus).` : 'Pick one.'}</p>
      <div class="picks">${cards}</div>
      <button data-act="skip">Skip</button>
      <h3>Extra jobs</h3>${this.kitHtml()}
    </div>`;
  }

  private meadowView(): string {
    const r = this.run!;
    const opts = meadowOptions(r)
      .map((rw, i) => (rw.kind === 'heart' && r.hearts >= r.maxHearts ? '' : this.rewardCard(rw, i, 'meadow')))
      .join('');
    return `<div class="reward">
      <h2>🌼 Meadow</h2>
      <p class="sub">The herd rests in the grass. Pick one.</p>
      <div class="picks">${opts}</div>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <div class="logo">${e.victory ? '🏆' : '🌧️'}</div>
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? 'The herd is home!' : 'The herd is lost'}</h1>
      <p>${e.victory ? 'You led the herd through all 3 acts.' : `The run ended in act ${e.act + 1}.`}</p>
      <p>Levels cleared ${e.cleared} · Critters saved ${e.saved}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>🧶 +${e.wool} wool for the barn</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Critters walk on their own.</b> They drop from the hatch, walk forward, step up small bumps and turn at walls. A long fall kills them.</li>
          <li><b>Pick a job</b> in the bar (keys <kbd>1</kbd>–<kbd>7</kbd>), then <b>tap a critter</b> to give it the job. Each level has a limited number of each job.</li>
          <li>✋ Blocker turns others around. ⛏️ Digger digs down. 👊 Basher digs forward. 🧱 Builder lays a 12-step stair. 🧗 Climber climbs walls. ☂️ Floater survives falls. 💣 Bomber blasts dirt after 3 s.</li>
          <li>Steel (grey) and gates cannot be dug. Water, fire, snap traps and the wolf kill. A lever on top of a gate opens it.</li>
          <li><b>Save the number shown</b> before time runs out. Critters you lose are gone from your herd for good.</li>
          <li>A failed level or a restart costs a ❤️. With no hearts left, the run ends.</li>
          <li>On the map, pick fields, cursed fields (two rewards) or meadows. Rewards give extra jobs for every level, lambs or hearts. Each act ends with a boss level.</li>
          <li>Keys: <kbd>Space</kbd> pause, <kbd>F</kbd> speed, <kbd>N</kbd> twice nuke, <kbd>R</kbd> restart, <kbd>←</kbd> <kbd>→</kbd> look around. Drag the view or tap the mini map on small screens.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'restart') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>Restart the level?</h2>
        <p>A restart costs one ❤️. The herd comes back.</p>
        <button class="danger" data-act="restart-yes">Yes, restart</button>
        <button data-act="modal-close">Cancel</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  /** Updates the HUD and the job bar without a full render. */
  private updateHud(): void {
    const g = this.g;
    if (!g || this.screen !== 'play') return;
    const out = g.crit.filter((c) => alive(c)).length;
    const left = g.lv.time - g.tick;
    const hud = `<span title="Out now">🐑 ${out}</span><span title="Still in the hatch">🚪 ${g.nuked ? 0 : g.lv.count - g.spawned}</span><span title="Saved / needed" class="${g.saved >= g.lv.need ? 'good' : ''}">🏠 ${g.saved}/${g.lv.need}</span><span title="Time left" class="${left < 30 * 15 ? 'bad' : ''}">⏱ ${fmtTime(left)}</span>`;
    if (hud !== this.hudKey) {
      this.hudKey = hud;
      const el = this.root.querySelector<HTMLElement>('#hud');
      if (el) el.innerHTML = hud;
    }
    const jk = `${this.sel}|${JOB_IDS.map((j) => g.jobs[j]).join(',')}|${this.paused}|${this.speed}|${this.nukeArm > 0}`;
    if (jk !== this.jobsKey) {
      this.jobsKey = jk;
      this.root.querySelectorAll<HTMLElement>('.job').forEach((b) => {
        const j = b.dataset.job as Job;
        b.classList.toggle('sel', j === this.sel);
        b.classList.toggle('empty', g.jobs[j] <= 0);
        b.querySelector('.jn')!.textContent = String(g.jobs[j]);
      });
      const p = this.root.querySelector<HTMLElement>('#b-pause');
      if (p) p.textContent = this.paused ? '▶ Play' : '⏸ Pause';
      const s = this.root.querySelector<HTMLElement>('#b-speed');
      if (s) {
        s.classList.toggle('sel', this.speed > 1);
        s.textContent = this.speed > 1 ? '⏩ x3 on' : '⏩ x3';
      }
      const n = this.root.querySelector<HTMLElement>('#b-nuke');
      if (n) {
        n.classList.toggle('armed', this.nukeArm > 0);
        n.textContent = this.nukeArm > 0 ? '💣 Sure?' : '💣 Nuke';
      }
      const h = this.root.querySelector<HTMLElement>('#hint');
      if (h) h.innerHTML = this.hintText();
    }
  }

  // ---------- Level flow ----------

  private startLevel(chk?: Checked): void {
    const r = this.run!;
    this.chk = chk ?? levelFor(r);
    this.g = newGame(this.chk.lv, r.kit);
    this.result = null;
    this.intro = !(DEBUG && FAST);
    this.paused = this.intro;
    this.speed = 1;
    this.acc = 0;
    this.fx = [];
    this.floats = [];
    this.camX = 0;
    this.follow = true;
    this.nukeArm = 0;
    this.overAt = 0;
    this.terrainVer = -1;
    this.bot = null;
    this.crop();
    const first = JOB_IDS.find((j) => this.g!.jobs[j] > 0);
    if (first && this.g.jobs[this.sel] <= 0) this.sel = first;
    this.screen = 'play';
    this.render();
  }

  private finishLevel(): void {
    const g = this.g!;
    const r = this.run!;
    if (this.result) return;
    const win = won(g);
    const outcome = levelDone(r, g.saved, lostCount(g), win);
    this.result = { win, saved: g.saved, need: g.lv.need, lost: lostCount(g), outcome };
    if (win) sfx.win();
    else sfx.lose();
    saveRun(r);
    this.paused = true;
    this.render();
  }

  private resultOk(): void {
    const res = this.result;
    const r = this.run!;
    if (!res) return;
    if (res.outcome === 'end') return this.endRun(false);
    if (res.outcome === 'retry') {
      saveRun(r);
      return this.startLevel(this.chk!);
    }
    this.result = null;
    this.g = null;
    this.screen = 'reward';
    this.render();
  }

  private moveOn(): void {
    const r = this.run!;
    if (advance(r)) return this.endRun(true);
    saveRun(r);
    this.screen = 'map';
    this.render();
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const sc = score(r, victory);
    const wool = woolFor(sc);
    const m = this.meta;
    m.runs++;
    if (victory) m.wins++;
    m.wool += wool;
    m.best = Math.max(m.best, sc);
    m.bestAct = Math.max(m.bestAct, victory ? 3 : r.act + 1);
    m.totalSaved += r.saved;
    saveMeta(m);
    clearRun();
    this.end = { victory, score: sc, wool, act: Math.min(r.act, 2), saved: r.saved, cleared: r.cleared };
    this.run = null;
    this.g = null;
    this.result = null;
    this.modal = null;
    this.screen = 'end';
    if (victory) sfx.win();
    this.render();
  }

  private goToRunScreen(): void {
    const r = this.run!;
    if (r.phase === 'level') return this.startLevel();
    this.screen = r.phase === 'reward' ? 'reward' : r.phase === 'meadow' ? 'meadow' : 'map';
    this.render();
  }

  // ---------- Canvas ----------

  private resize(): void {
    const cv = this.canvas;
    const g = this.g;
    if (!cv || !g) return;
    const wrap = cv.parentElement!;
    const wrapW = wrap.clientWidth;
    const reserved = window.innerWidth < 700 ? 330 : 250;
    const availH = Math.max(180, window.innerHeight - reserved);
    const fitW = wrapW / g.w;
    const fitH = availH / this.vRows;
    // Wide screens show the whole level. Narrow ones zoom in and pan.
    let cs = fitW >= 3.8 && wrapW >= 600 ? Math.min(fitW, fitH, 9) : Math.max(fitW, Math.min(fitH, wrapW / 62));
    cs = Math.max(cs, 2.5);
    this.cs = cs;
    const cssW = Math.min(wrapW, g.w * cs);
    const cssH = this.vRows * cs;
    this.viewW = cssW / cs;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${cssW}px`;
    cv.style.height = `${cssH}px`;
    cv.width = Math.round(cssW * this.dpr);
    cv.height = Math.round(cssH * this.dpr);
    this.clampCam();
  }

  private crop(): void {
    const g = this.g!;
    let lo = H;
    let hi = 0;
    for (let x = 0; x < g.w; x++) {
      let y = 0;
      while (y < H && g.cells[y * g.w + x] === AIR) y++;
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    const top = Math.max(0, Math.min(lo, g.lv.entry.y - 8) - 12);
    const bot = Math.min(H, hi + 14);
    this.vTop = top;
    this.vRows = bot - top;
  }

  private clampCam(): void {
    const g = this.g;
    if (!g) return;
    this.camX = Math.max(0, Math.min(g.w - this.viewW, this.camX));
  }

  private get panning(): boolean {
    return !!this.g && this.viewW < this.g.w - 0.5;
  }

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (t: number) => {
      if (this.screen !== 'play' || !this.ctx) {
        this.raf = 0;
        return;
      }
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private simTick(): void {
    const g = this.g!;
    tick(g, this.bot ?? undefined);
    if (this.bot) stallNuke(g);
    this.handleEvents(g.ev);
    g.ev.length = 0;
  }

  private update(dt: number): void {
    this.time += dt;
    const g = this.g;
    if (!g) return;
    if (!this.paused && !g.over && !this.modal) {
      this.acc += dt * TPS * this.speed;
      let n = 0;
      while (this.acc >= 1 && n < 20 && !g.over) {
        this.simTick();
        this.acc -= 1;
        n++;
      }
      if (this.acc > 3) this.acc = 0;
    }
    if (g.over && !this.result) {
      if (!this.overAt) this.overAt = this.time;
      if (this.time - this.overAt > 0.8) this.finishLevel();
    }
    if (this.nukeArm > 0 && this.time - this.nukeArm > 2) {
      this.nukeArm = 0;
    }
    for (const f of this.fx) {
      f.t += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += 30 * dt;
    }
    this.fx = this.fx.filter((f) => f.t < f.life);
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1.2);
    this.shake = Math.max(0, this.shake - dt);
    if (this.follow && this.panning) {
      const lead = g.crit.filter((c) => alive(c)).reduce((m, c) => Math.max(m, c.x), -1);
      if (lead >= 0) {
        const target = lead - this.viewW * 0.6;
        this.camX += (target - this.camX) * Math.min(1, dt * 2);
        this.clampCam();
      }
    }
    this.updateHud();
  }

  private handleEvents(evs: Ev[]): void {
    for (const e of evs) {
      switch (e.k) {
        case 'spawn':
          sfx.spawn();
          break;
        case 'save':
          sfx.save();
          this.floats.push({ x: e.x + 0.5, y: e.y - 5, text: '+1', color: '#7ee08a', t: 0 });
          this.burst(e.x + 0.5, e.y - 2, '#90e0ef', 8, 12);
          break;
        case 'dig':
          sfx.dig();
          this.burst(e.x + 0.5, e.y, '#a8794f', 3, 8);
          break;
        case 'brick':
          sfx.brick();
          break;
        case 'boom':
          sfx.boom();
          this.shake = 0.35;
          this.burst(e.x + 0.5, e.y - 2, '#ffb703', 30, 30);
          this.burst(e.x + 0.5, e.y - 2, '#a8794f', 20, 22);
          break;
        case 'switch':
          sfx.click();
          this.toast('🔓 The gate opens!');
          this.burst(e.x + 0.5, e.y, '#ffd166', 14, 18);
          break;
        case 'assign':
          sfx.assign();
          break;
        default: {
          const icon = DEATH_ICON[e.k];
          if (!icon) break;
          if (e.k === 'splat') sfx.splat();
          else if (e.k === 'drown') sfx.drown();
          else if (e.k === 'burn') sfx.burn();
          else if (e.k === 'trap') sfx.snap();
          else if (e.k === 'wolf') sfx.wolf();
          this.floats.push({ x: e.x + 0.5, y: e.y - 4, text: icon, color: '#ef476f', t: 0 });
          this.burst(e.x + 0.5, e.y - 1, e.k === 'drown' ? '#4cc9f0' : e.k === 'burn' ? '#ff9f1c' : '#f1f1f1', 10, 16);
        }
      }
    }
  }

  private burst(x: number, y: number, color: string, n: number, speed: number): void {
    if (this.fx.length > 400) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, t: 0, life: 0.4 + Math.random() * 0.5, color, size: 0.4 + Math.random() * 0.5 });
    }
  }

  private buildTerrain(): void {
    const g = this.g!;
    if (!this.terrain || this.terrain.width !== g.w) {
      this.terrain = document.createElement('canvas');
      this.terrain.width = g.w;
      this.terrain.height = H;
      this.terrainImg = this.terrain.getContext('2d')!.createImageData(g.w, H);
    }
    const img = this.terrainImg!;
    const d = img.data;
    const th = THEMES[g.lv.theme];
    const t = this.time;
    let liquid = false;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = y * g.w + x;
        const c = g.cells[i];
        const o = i * 4;
        if (c === AIR) {
          d[o + 3] = 0;
          continue;
        }
        const n = (hash(x, y) % 21) - 10;
        let rr = 0;
        let gg = 0;
        let bb = 0;
        if (c === DIRT) {
          const above = y > 0 ? g.cells[i - g.w] : AIR;
          const above2 = y > 1 ? g.cells[i - 2 * g.w] : AIR;
          const top = above === AIR ? 2 : above2 === AIR ? 1 : 0;
          const base = top === 2 ? th.top : top === 1 ? th.top.map((v, k) => (v + th.dirt[k]) / 2) : th.dirt;
          const dark = 1 - Math.min(0.35, (y / H) * 0.3);
          rr = base[0] * dark + n;
          gg = base[1] * dark + n;
          bb = base[2] * dark + n * 0.6;
        } else if (c === STEEL) {
          const edge = x % 4 === 0 || y % 4 === 0;
          const v = edge ? -22 : (x + y) % 4 === 2 ? 14 : 0;
          rr = th.steel[0] + v;
          gg = th.steel[1] + v;
          bb = th.steel[2] + v;
        } else if (c === BRICK) {
          const mortar = (y % 2 === 0 && x % 3 === 0) || false;
          rr = mortar ? 150 : 214 + n;
          gg = mortar ? 120 : 160 + n;
          bb = mortar ? 90 : 96 + n;
        } else if (c === GATE) {
          const bar = x % 2 === 0;
          rr = bar ? 70 : 40;
          gg = bar ? 74 : 44;
          bb = bar ? 92 : 58;
          if (y % 5 === 0) rr = gg = bb = 110;
        } else if (c === WATER) {
          liquid = true;
          const s = Math.sin(x * 0.6 + t * 3 + y * 0.3) * 18;
          const surf = y > 0 && g.cells[i - g.w] === AIR;
          rr = 30 + s * 0.3;
          gg = 110 + s + (surf ? 60 : 0);
          bb = 200 + s + (surf ? 40 : 0);
        } else if (c === FIRE) {
          liquid = true;
          const s = Math.sin(x * 1.3 + t * 9 + y * 0.7) * 40 + Math.sin(x * 0.4 - t * 5) * 20;
          rr = 240;
          gg = 110 + s;
          bb = 30 + s * 0.3;
        }
        d[o] = rr;
        d[o + 1] = gg;
        d[o + 2] = bb;
        d[o + 3] = 255;
      }
    }
    this.hasLiquid = liquid;
    this.terrain.getContext('2d')!.putImageData(img, 0, 0);
  }

  private draw(): void {
    const ctx = this.ctx;
    const g = this.g;
    if (!ctx || !g || !this.canvas) return;
    if (this.terrainVer !== g.ver || this.hasLiquid) {
      this.buildTerrain();
      this.terrainVer = g.ver;
    }
    const cs = this.cs;
    const th = THEMES[g.lv.theme];
    const W = this.canvas.width / this.dpr;
    const Hc = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, Hc);
    sky.addColorStop(0, th.sky[0]);
    sky.addColorStop(1, th.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, Hc);
    // Far hills and stars, with a little parallax.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 40; i++) {
      const sx = ((hash('s', i) % 1000) / 1000) * (g.w * cs) - this.camX * cs * 0.3;
      const sy = ((hash('t', i) % 1000) / 1000) * Hc * 0.45;
      ctx.fillRect(((sx % W) + W) % W, sy, 1.5, 1.5);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, Hc);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, Hc * 0.55 + Math.sin((x + this.camX * cs * 0.5) * 0.013) * Hc * 0.08 + Math.sin((x + this.camX * cs * 0.5) * 0.031) * Hc * 0.04);
    ctx.lineTo(W, Hc);
    ctx.fill();

    const sh = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 14 : 0;
    ctx.save();
    ctx.translate(-this.camX * cs + sh, sh * 0.5 - this.vTop * cs);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrain!, 0, 0, g.w, H, 0, 0, g.w * cs, H * cs);
    this.drawProps(ctx, g);
    for (const c of g.crit) if (alive(c)) this.drawCritter(ctx, c);
    if (this.hover && alive(this.hover)) {
      const c = this.hover;
      ctx.strokeStyle = canAssign(g, c, this.sel) ? '#ffd166' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse((c.x + 0.5) * cs, (c.y - 1.2) * cs, 2.6 * cs, 2.8 * cs, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const f of this.fx) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
      ctx.fillStyle = f.color;
      ctx.fillRect(f.x * cs, f.y * cs, f.size * cs, f.size * cs);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      ctx.font = `bold ${Math.max(12, cs * 2.6)}px system-ui, sans-serif`;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x * cs, (f.y - f.t * 4) * cs);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (this.panning) this.drawMinimap(ctx, g, W);
    if (g.nuked && !g.over) {
      ctx.fillStyle = 'rgba(239,71,111,0.12)';
      ctx.fillRect(0, 0, W, Hc);
    }
    if (this.paused && !this.intro && !this.result) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, W, Hc);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⏸ Paused', W / 2, Hc / 2);
    }
  }

  private minimapRect(W: number): { x: number; y: number; k: number; w: number; h: number } {
    const g = this.g!;
    const k = Math.min(0.75, (W * 0.42) / g.w);
    return { x: W - g.w * k - 6, y: 6, k, w: g.w * k, h: this.vRows * k };
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, g: Game, W: number): void {
    const m = this.minimapRect(W);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(m.x - 2, m.y - 2, m.w + 4, m.h + 4);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrain!, 0, this.vTop, g.w, this.vRows, m.x, m.y, m.w, m.h);
    const t = this.vTop;
    ctx.fillStyle = '#fff';
    for (const c of g.crit) if (alive(c)) ctx.fillRect(m.x + c.x * m.k - 0.5, m.y + (c.y - 2 - t) * m.k, 1.5, 2);
    ctx.fillStyle = '#7ee08a';
    ctx.fillRect(m.x + g.lv.exit.x * m.k - 1.5, m.y + (g.lv.exit.y - 4 - t) * m.k, 3, 4);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1;
    ctx.strokeRect(m.x + this.camX * m.k, m.y, this.viewW * m.k, m.h);
  }

  private drawProps(ctx: CanvasRenderingContext2D, g: Game): void {
    const cs = this.cs;
    const lv = g.lv;
    // Entry hatch.
    const ex = (lv.entry.x + 0.5) * cs;
    const ey = (lv.entry.y - 3) * cs;
    ctx.fillStyle = '#6b4226';
    ctx.fillRect(ex - 4 * cs, ey - 4 * cs, 8 * cs, 4 * cs);
    ctx.fillStyle = '#8d5a33';
    ctx.fillRect(ex - 3.5 * cs, ey - 3.5 * cs, 7 * cs, 1 * cs);
    ctx.fillStyle = '#1b1208';
    const open = g.spawned < lv.count && !g.nuked ? 1 : 0.3;
    ctx.fillRect(ex - 2.5 * cs, ey - 0.6 * cs, 5 * cs, 0.8 * cs * open + 0.3 * cs);
    // Exit barn.
    const bx = (lv.exit.x + 0.5) * cs;
    const by = (lv.exit.y + 1) * cs;
    ctx.fillStyle = '#9b2c2c';
    ctx.fillRect(bx - 4 * cs, by - 7 * cs, 8 * cs, 7 * cs);
    ctx.fillStyle = '#c53030';
    ctx.beginPath();
    ctx.moveTo(bx - 5 * cs, by - 7 * cs);
    ctx.lineTo(bx, by - 11 * cs);
    ctx.lineTo(bx + 5 * cs, by - 7 * cs);
    ctx.fill();
    ctx.fillStyle = '#2a0f0f';
    ctx.fillRect(bx - 2 * cs, by - 5 * cs, 4 * cs, 5 * cs);
    ctx.strokeStyle = '#f5e6c8';
    ctx.lineWidth = Math.max(1, cs * 0.3);
    ctx.strokeRect(bx - 4 * cs, by - 7 * cs, 8 * cs, 7 * cs);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(bx + 4.5 * cs, by - 12 * cs, 0.4 * cs, 5 * cs);
    ctx.fillRect(bx + 4.9 * cs, by - 12 * cs + Math.sin(this.time * 6) * 0.3 * cs, 2.4 * cs, 1.4 * cs);
    // Traps: steel jaws with teeth. Closed while they reload.
    for (const t of g.traps) {
      const tx = (t.x + 0.5) * cs;
      const ty = (t.y + 1) * cs;
      const open = t.cool > 0 ? 0 : 1;
      ctx.fillStyle = '#3d424d';
      ctx.fillRect(tx - 2.4 * cs, ty - 0.6 * cs, 4.8 * cs, 0.6 * cs);
      ctx.fillStyle = t.cool > 0 ? '#8a8f9b' : '#e3e7ee';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(tx + s * 2.2 * cs, ty - 0.6 * cs);
        ctx.lineTo(tx + s * (0.3 + 1.9 * open) * cs, ty - (0.6 + 2.4) * cs);
        ctx.lineTo(tx + s * 0.2 * cs, ty - 0.6 * cs);
        ctx.fill();
      }
      if (open) {
        ctx.fillStyle = 'rgba(239,71,111,0.8)';
        ctx.fillRect(tx - 0.3 * cs, ty - 1.4 * cs, 0.6 * cs, 0.6 * cs);
      }
    }
    // Levers on gates.
    lv.switches.forEach((s, i) => {
      const sx = (s.x + 0.5) * cs;
      const sy = (s.y + 1) * cs;
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = Math.max(1, cs * 0.4);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      const a = g.sw[i] ? 0.7 : -0.7;
      ctx.lineTo(sx + Math.sin(a) * 3 * cs, sy - Math.cos(a) * 3 * cs);
      ctx.stroke();
      ctx.fillStyle = g.sw[i] ? '#7ee08a' : '#ef476f';
      ctx.beginPath();
      ctx.arc(sx + Math.sin(a) * 3 * cs, sy - Math.cos(a) * 3 * cs, 0.8 * cs, 0, Math.PI * 2);
      ctx.fill();
    });
    // The wolf.
    if (g.wolf) {
      const w = g.wolf;
      const wx = (w.x + 0.5) * cs;
      const wy = (w.y + 1) * cs;
      const bob = Math.sin(this.time * 10) * 0.2 * cs;
      ctx.fillStyle = '#5c6370';
      ctx.beginPath();
      ctx.ellipse(wx, wy - 2.2 * cs + bob, 2.8 * cs, 1.3 * cs, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(wx + w.dir * 2.6 * cs, wy - 3.2 * cs + bob, 1.2 * cs, 1 * cs, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(wx + w.dir * 2.2 * cs, wy - 3.8 * cs + bob);
      ctx.lineTo(wx + w.dir * 2.6 * cs, wy - 5 * cs + bob);
      ctx.lineTo(wx + w.dir * 3 * cs, wy - 3.9 * cs + bob);
      ctx.fill();
      ctx.fillRect(wx + w.dir * 3.2 * cs - (w.dir < 0 ? 1.2 * cs : 0), wy - 3 * cs + bob, 1.2 * cs, 0.7 * cs);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(wx + w.dir * 2.9 * cs, wy - 3.5 * cs + bob, 0.4 * cs, 0.4 * cs);
      ctx.strokeStyle = '#5c6370';
      ctx.lineWidth = Math.max(1, cs * 0.45);
      const ph = Math.sin(this.time * 14);
      for (const lx of [-1.6, -0.8, 0.9, 1.7]) {
        ctx.beginPath();
        ctx.moveTo(wx + lx * cs, wy - 1.4 * cs);
        ctx.lineTo(wx + lx * cs + ph * 0.4 * cs * Math.sign(lx), wy);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(wx - w.dir * 2.6 * cs, wy - 2.6 * cs);
      ctx.lineTo(wx - w.dir * 4 * cs, wy - 3.6 * cs + ph * 0.3 * cs);
      ctx.stroke();
    }
  }

  private drawCritter(ctx: CanvasRenderingContext2D, c: Critter): void {
    const cs = this.cs;
    const x = (c.x + 0.5) * cs;
    const fy = (c.y + 1) * cs;
    const d = c.dir;
    const walkPh = c.st === 'walk' ? Math.sin(c.age * 0.5) : 0;
    let bodyY = fy - 2.1 * cs;
    let lean = 0;
    if (c.st === 'climb') lean = -d * 1.1;
    if (c.st === 'dig') bodyY += Math.sin(c.age * 0.9) * 0.3 * cs;
    ctx.save();
    ctx.translate(x, bodyY);
    ctx.rotate(lean);
    // Legs.
    ctx.strokeStyle = '#2b2b33';
    ctx.lineWidth = Math.max(1, cs * 0.35);
    const legs = c.st === 'fall' ? [-0.9, 0.9] : [-0.6 + walkPh * 0.4, 0.6 - walkPh * 0.4];
    for (const l of legs) {
      ctx.beginPath();
      ctx.moveTo(l * cs * 0.8, 0.5 * cs);
      ctx.lineTo(l * cs, 2.1 * cs - (c.st === 'fall' ? 0.4 * cs : 0));
      ctx.stroke();
    }
    // Wool body.
    ctx.fillStyle = c.st === 'block' ? '#ffe3e3' : '#f4f1e8';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.6 * cs, 1.2 * cs, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-0.7 * cs, -0.9 * cs, 0.7 * cs, 0, Math.PI * 2);
    ctx.arc(0.5 * cs, -1 * cs, 0.75 * cs, 0, Math.PI * 2);
    ctx.fill();
    // Head.
    ctx.fillStyle = '#2b2b33';
    const hx = c.st === 'block' ? 0 : d * 1.45 * cs;
    ctx.beginPath();
    ctx.ellipse(hx, -0.4 * cs, 0.75 * cs, 0.65 * cs, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(hx + (c.st === 'block' ? -0.4 : d * 0.25) * cs, -0.65 * cs, Math.max(1, 0.25 * cs), Math.max(1, 0.25 * cs));
    if (c.st === 'block') ctx.fillRect(hx + 0.15 * cs, -0.65 * cs, Math.max(1, 0.25 * cs), Math.max(1, 0.25 * cs));
    // Skill tags.
    if (c.climber) {
      ctx.fillStyle = '#4cc9f0';
      ctx.fillRect(-1.3 * cs, 0.3 * cs, 0.7 * cs, 0.7 * cs);
    }
    if (c.floater) {
      ctx.fillStyle = '#f72585';
      ctx.fillRect(-0.5 * cs, 0.3 * cs, 0.7 * cs, 0.7 * cs);
    }
    ctx.restore();
    // Job extras.
    if (c.st === 'block') {
      ctx.strokeStyle = '#ef476f';
      ctx.lineWidth = Math.max(1.5, cs * 0.45);
      ctx.beginPath();
      ctx.moveTo(x - 2.6 * cs, fy - 2.6 * cs);
      ctx.lineTo(x - 1.2 * cs, fy - 2.1 * cs);
      ctx.moveTo(x + 2.6 * cs, fy - 2.6 * cs);
      ctx.lineTo(x + 1.2 * cs, fy - 2.1 * cs);
      ctx.stroke();
    } else if (c.st === 'build') {
      ctx.fillStyle = '#d6a060';
      ctx.fillRect(x + d * 1.5 * cs - cs, fy - 4.3 * cs, 2 * cs, 0.8 * cs);
    } else if (c.st === 'bash') {
      const a = (c.t % 4) / 4;
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = Math.max(1, cs * 0.35);
      ctx.beginPath();
      ctx.arc(x + d * 1.8 * cs, fy - 2 * cs, 1.4 * cs, -1.2 + a * 2, -0.4 + a * 2);
      ctx.stroke();
    } else if (c.st === 'dig') {
      ctx.fillStyle = '#c9ced6';
      ctx.fillRect(x + d * 0.6 * cs, fy - 1.4 * cs + Math.sin(c.age * 0.9) * 0.4 * cs, 0.4 * cs, 1.8 * cs);
    }
    if (c.st === 'fall' && c.floater && c.fall >= 6) {
      ctx.fillStyle = '#f72585';
      ctx.beginPath();
      ctx.arc(x, fy - 5 * cs, 2.6 * cs, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, fy - 5 * cs);
      ctx.lineTo(x, fy - 2.6 * cs);
      ctx.stroke();
    }
    if (c.fuse > 0) {
      ctx.fillStyle = c.fuse < 30 ? '#ef476f' : '#fff';
      ctx.font = `bold ${Math.max(10, cs * 2.2)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.ceil(c.fuse / 30)), x, fy - 4.6 * cs);
    }
  }

  // ---------- Input ----------

  private toCell(e: { clientX: number; clientY: number }): { x: number; y: number; sx: number; sy: number } | null {
    if (!this.canvas) return null;
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    return { x: sx / this.cs + this.camX, y: sy / this.cs + this.vTop, sx, sy };
  }

  /** The critter under a point. Prefers one that can take the selected job. */
  private pick(px: number, py: number): Critter | null {
    const g = this.g;
    if (!g) return null;
    const rad = Math.max(2.6, 16 / this.cs);
    let best: Critter | null = null;
    let bs = Infinity;
    for (const c of g.crit) {
      if (!alive(c)) continue;
      const dx = c.x + 0.5 - px;
      const dy = c.y - 1.5 - py;
      const dist = Math.hypot(dx, dy);
      if (dist > rad) continue;
      const s = dist - (canAssign(g, c, this.sel) ? 100 : 0);
      if (s < bs) {
        bs = s;
        best = c;
      }
    }
    return best;
  }

  private tapAt(px: number, py: number): void {
    const g = this.g;
    if (!g || g.over || this.result) return;
    const c = this.pick(px, py);
    if (!c) return;
    if (g.jobs[this.sel] <= 0) {
      sfx.deny();
      this.toast(`No ${JOBS[this.sel].name.toLowerCase()} jobs left.`);
      return;
    }
    if (!assign(g, c, this.sel)) {
      sfx.deny();
      this.toast(c.st === 'fall' ? 'It cannot work while falling.' : `This critter cannot be a ${JOBS[this.sel].name.toLowerCase()} now.`);
      return;
    }
    this.handleEvents(g.ev);
    g.ev.length = 0;
    this.burst(c.x + 0.5, c.y - 2, '#ffd166', 6, 10);
    this.updateHud();
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if (this.screen !== 'play' || e.target !== this.canvas) return;
    const p = this.toCell(e)!;
    if (this.panning) {
      const m = this.minimapRect(this.canvas!.width / this.dpr);
      if (p.sx >= m.x - 2 && p.sx <= m.x + m.w + 2 && p.sy <= m.y + m.h + 4) {
        this.camX = (p.sx - m.x) / m.k - this.viewW / 2;
        this.follow = false;
        this.clampCam();
        this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cam: this.camX, moved: true };
        return;
      }
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cam: this.camX, moved: false };
  }

  private onMove(e: PointerEvent): void {
    if (this.screen !== 'play') return;
    const d = this.drag;
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 8 || Math.abs(e.clientY - d.y) > 8) d.moved = true;
      if (d.moved && this.panning) {
        this.camX = d.cam - dx / this.cs;
        this.follow = false;
        this.clampCam();
      }
      return;
    }
    if (e.pointerType === 'mouse' && e.target === this.canvas) {
      const p = this.toCell(e)!;
      this.hover = this.pick(p.x, p.y);
    } else this.hover = null;
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    if (this.screen !== 'play' || d.moved) return;
    const p = this.toCell(e);
    if (p) this.tapAt(p.x, p.y);
  }

  private onKey(e: KeyboardEvent): void {
    initAudio();
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'play' || !this.g) return;
    if (this.result) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.resultOk();
      }
      return;
    }
    if (this.intro) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.action('go', {});
      }
      return;
    }
    const job = JOB_KEYS[e.key];
    if (job) {
      this.selectJob(job);
      return;
    }
    switch (e.key) {
      case ' ':
      case 'p':
      case 'P':
        e.preventDefault();
        this.action('pause', {});
        return;
      case 'f':
      case 'F':
        this.action('speed', {});
        return;
      case 'n':
      case 'N':
        this.action('nuke', {});
        return;
      case 'r':
      case 'R':
        this.action('restart', {});
        return;
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault();
        this.camX += (e.key === 'ArrowLeft' ? -1 : 1) * this.viewW * 0.25;
        this.follow = false;
        this.clampCam();
        return;
      case 'Escape':
        this.action('menu', {});
        return;
    }
  }

  private selectJob(job: Job): void {
    this.sel = job;
    sfx.select();
    this.updateHud();
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as Element).closest<HTMLElement | SVGElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
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
        this.endRun(false);
        return;
      case 'title':
        this.modal = null;
        this.g = null;
        this.result = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.run = newRun(randomSeedText(), this.meta);
        saveRun(this.run);
        this.screen = 'map';
        this.render();
        return;
      case 'continue':
        if (r) this.goToRunScreen();
        return;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.wool < cost || this.meta.unlocked.includes(id)) return;
        this.meta.wool -= cost;
        this.meta.unlocked.push(id);
        saveMeta(this.meta);
        sfx.coin();
        this.toast('Unlocked for the next run.');
        this.render();
        return;
      }
      case 'node': {
        if (!r) return;
        const i = Number(d.i);
        if (!choices(r).includes(i)) return;
        pickNode(r, i);
        saveRun(r);
        sfx.click();
        if (r.phase === 'meadow') {
          this.screen = 'meadow';
          this.render();
        } else this.startLevel();
        return;
      }
      case 'go':
        if (!this.intro) return;
        this.intro = false;
        this.paused = false;
        this.render();
        return;
      case 'job':
        this.selectJob(d.job as Job);
        return;
      case 'pause':
        if (this.intro || this.result) return;
        this.paused = !this.paused;
        this.updateHud();
        return;
      case 'speed':
        this.speed = this.speed > 1 ? 1 : 3;
        this.updateHud();
        return;
      case 'nuke': {
        const g = this.g;
        if (!g || g.over || this.intro) return;
        if (this.nukeArm > 0) {
          this.nukeArm = 0;
          nuke(g);
          sfx.boom();
          this.paused = false;
        } else {
          this.nukeArm = this.time || 0.001;
          this.toast('Press nuke again: every critter that is out explodes.');
        }
        this.updateHud();
        return;
      }
      case 'restart':
        if (!this.g || this.result) return;
        this.modal = { kind: 'restart' };
        this.render();
        return;
      case 'restart-yes': {
        this.modal = null;
        if (!r || !this.g) return;
        const res = levelDone(r, 0, 0, false);
        saveRun(r);
        if (res === 'end') return this.endRun(false);
        this.toast(`Restarted. ❤️ ${r.hearts} left.`);
        this.startLevel(this.chk!);
        return;
      }
      case 'result-ok':
        this.resultOk();
        return;
      case 'reward': {
        if (!r || r.picks <= 0) return;
        const rw = r.rewards[Number(d.i)];
        if (!rw) return;
        applyReward(r, rw);
        r.rewards = r.rewards.filter((x) => x !== rw);
        r.picks--;
        sfx.coin();
        if (r.picks <= 0) return this.moveOn();
        saveRun(r);
        this.render();
        return;
      }
      case 'skip':
        if (r) this.moveOn();
        return;
      case 'meadow': {
        if (!r) return;
        const rw = meadowOptions(r)[Number(d.i)];
        if (!rw) return;
        applyReward(r, rw);
        sfx.coin();
        this.toast(`${rewardText(rw, r).icon} ${rewardText(rw, r).name}`);
        this.moveOn();
        return;
      }
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLElement>(sel);
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    };
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        act: this.run?.act,
        row: this.run?.row,
        herd: this.run?.herd,
        hearts: this.run?.hearts,
        phase: this.run?.phase,
        kit: this.run?.kit,
        level: this.g
          ? { name: this.g.lv.name, boss: this.g.lv.boss, segs: this.g.lv.segs, tick: this.g.tick, time: this.g.lv.time, out: this.g.spawned, saved: this.g.saved, need: this.g.lv.need, count: this.g.lv.count, over: this.g.over, jobs: this.g.jobs }
          : null,
        crit: this.g ? this.g.crit.filter((c) => alive(c)).map((c) => ({ id: c.id, x: c.x, y: c.y, st: c.st })) : [],
        view: { cs: this.cs, camX: this.camX, vTop: this.vTop },
        result: this.result,
        end: this.end,
        meta: this.meta,
      }),
      /** Plays the level with its known solution from now on. */
      solve: () => {
        if (this.g) this.bot = solutionCtrl(this.g.lv.solution);
      },
      win: () => {
        if (!this.g) return;
        this.g.saved = this.g.lv.need;
        this.g.over = true;
        this.finishLevel();
      },
      wool: (n: number) => {
        this.meta.wool += n;
        saveMeta(this.meta);
        this.render();
      },
      /** One bot action for automatic tests. */
      step: (): string => {
        if (this.modal) {
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'map': {
            const r = this.run!;
            const ch = choices(r);
            const meadow = ch.find((i) => r.map[r.row][i].type === 'meadow');
            const plain = ch.find((i) => r.map[r.row][i].type !== 'cursed');
            const i = r.hearts < r.maxHearts && meadow !== undefined ? meadow : (plain ?? ch[0]);
            click(`.room[data-i="${i}"]`);
            return 'node';
          }
          case 'play': {
            const g = this.g!;
            if (this.result) {
              click('[data-act="result-ok"]');
              return 'result';
            }
            if (this.intro) {
              click('[data-act="go"]');
              return 'go';
            }
            if (!this.bot) this.bot = solutionCtrl(g.lv.solution);
            if (g.over) {
              if (FAST) this.finishLevel();
              return 'busy';
            }
            this.paused = false;
            for (let i = 0; i < (FAST ? 400 : 45) && !g.over; i++) this.simTick();
            if (g.over && FAST) this.finishLevel();
            return 'play';
          }
          case 'reward':
            if (!click('.pick[data-act="reward"]')) click('[data-act="skip"]');
            return 'reward';
          case 'meadow':
            click('.pick[data-act="meadow"]');
            return 'meadow';
          case 'end':
            return 'end';
        }
        return 'idle';
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
