import { legal, type Stamp } from './ai';
import { botPlacement, pickReward } from './bot';
import { ACTS, CARDS, ENEMIES, TEMPLATES, UNLOCKS, enemyRule, tplSize } from './data';
import {
  GENS,
  H,
  N,
  W,
  ZONE,
  boardFromString,
  countCells,
  cx,
  cy,
  idx,
  orient,
  ruleCode,
  ruleWords,
  shapeDrift,
  simulate,
  stampCells,
  zoneRows,
  type Rule,
} from './engine';
import { Rng, hash, randomSeedText } from './rng';
import {
  ACT_NODES,
  DRY_DMG,
  TURN_LIMIT,
  bankCap,
  buy,
  chooseNode,
  clearRun,
  enemyCfg,
  enemyOf,
  isRunWon,
  leaveLab,
  loadMeta,
  loadRun,
  newRun,
  playerCfg,
  resolveTurn,
  rewardInfo,
  samplesFor,
  saveMeta,
  saveRun,
  score,
  skipReward,
  takeReward,
  tplCost,
  turnBudget,
  zoneExtra,
  type Reward,
  type RunState,
  type TurnResult,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'fight' | 'reward' | 'choice' | 'lab' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

const Q = new URLSearchParams(location.search);
/** `?debug&fast` skips animations, for bot tests. */
const FAST = Q.has('fast');
const GEN_MS = 260;
const GEN_MS_FAST = 70;
const DEPTHS = [1, 4, 12, 24];

const COL = {
  p: '#06d6a0',
  pDim: 'rgba(6, 214, 160, 0.16)',
  e: '#ff5d8f',
  eDim: 'rgba(255, 93, 143, 0.14)',
  grid: 'rgba(160, 255, 220, 0.06)',
  bg: '#0a1512',
  neutral: '#0d1916',
  bad: '#ff4d4d',
};

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t0: number;
}

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t0: number;
  life: number;
  color: string;
}

interface Anim {
  res: TurnResult;
  /** Transition from frames[g] to frames[g + 1]. */
  g: number;
  t0: number;
  /** Turn number that is playing (the run already moved on to the next turn). */
  turn: number;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function bar(v: number, max: number, cls: string, label: string): string {
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return `<span class="bar ${cls}"><span class="fill" style="width:${pct}%"></span><span class="bt">${label} ${Math.max(0, v)}/${max}</span></span>`;
}

/** Small SVG of a shape in its current orientation. */
function shapeSvg(id: string, o: number, color = 'currentColor'): string {
  const s = orient(TEMPLATES[id].shape, o);
  const w = Math.max(...s.map((c) => c[0])) + 1;
  const h = Math.max(...s.map((c) => c[1])) + 1;
  const n = Math.max(w, h, 3);
  const ox = (n - w) / 2;
  const oy = (n - h) / 2;
  const rects = s.map(([x, y]) => `<rect x="${x + ox + 0.08}" y="${y + oy + 0.08}" width="0.84" height="0.84" rx="0.18"/>`).join('');
  return `<svg class="shp" viewBox="0 0 ${n} ${n}" fill="${color}">${rects}</svg>`;
}

const ARROWS: Record<string, string> = { '0,-1': '↑', '0,1': '↓', '-1,0': '←', '1,0': '→', '-1,-1': '↖', '1,-1': '↗', '-1,1': '↙', '1,1': '↘' };

function driftArrow(id: string, o: number, rule: Rule): string {
  if (TEMPLATES[id].kind !== 'ship') return '';
  const [dx, dy] = shapeDrift(orient(TEMPLATES[id].shape, o), rule, 12);
  return ARROWS[`${Math.sign(dx)},${Math.sign(dy)}`] ?? '';
}

const KIND_WORD: Record<string, string> = { cell: 'cell', still: 'still life', osc: 'oscillator', ship: 'spaceship', burst: 'burst' };

const TUTORIAL: string[] = [
  '<b>Welcome!</b> Your cells are <span class="pc">green</span>, the enemy is <span class="ec">pink</span>. Pick <b>Glider</b> below and tap your green zone to stamp it (on a phone: tap once to aim, tap the same square again to stamp). The dotted trail shows its path. <b>⟳</b> turns it. Then press <b>▶ Run</b>.',
  'Gliders fly diagonally, 1 square every 4 generations. A cell that reaches the enemy back row hits the core. Cells that sit in the enemy zone at the end of a turn hit it too. Now pick <b>Block</b>: a still life that never changes. Put it in front of your core as a wall.',
  'The moss wakes up. When pink and green cells touch, <b>both die</b>. That is how walls stop attacks. A <b>Blinker</b> flips between a row and a column each generation and guards a small spot. Try one.',
  'Use the <b>preview chips</b> (1, 4, 12, 24 generations) to look ahead. The numbers show the damage before you press Run. Unused cells carry over to the next turn (up to 4).',
  'Finish the moss! After each fight you choose a new template, a rule card or more cells.',
];

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private end: { victory: boolean; score: number; samples: number; act: number } | null = null;
  private tutorialOn = !this.meta.tutorialDone;

  // Fight UI state.
  private tool = 'glider';
  private orients: Record<string, number> = {};
  private stamps: Stamp[] = [];
  private cursor = -1;
  private cursorTouch = false;
  private depth = 12;
  private anim: Anim | null = null;
  private ff = false;
  private floats: Float[] = [];
  private parts: Part[] = [];
  private flashE = 0;
  private flashP = 0;
  private shake = 0;
  private preview: { board: Uint8Array; trail: Uint8Array; dmgE: number; dmgP: number; clashes: number; mine: number; theirs: number } | null = null;
  private cv: HTMLCanvasElement | null = null;
  private cs = 20;
  private raf = 0;
  private lastFightTurn = '';

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.fitBoard());
    if (Q.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Helpers ----------

  private toast(msg: string): void {
    this.toastEl.innerHTML = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private save(): void {
    if (this.run) saveRun(this.run);
  }

  private get busy(): boolean {
    return !!this.anim;
  }

  private spent(): number {
    return this.stamps.reduce((a, s) => a + s.cost, 0);
  }

  private left(): number {
    return this.run ? turnBudget(this.run) - this.spent() : 0;
  }

  private screenForStage(): Screen {
    const r = this.run!;
    return r.stage === 'fight' ? 'fight' : r.stage;
  }

  // ---------- Screens ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'fight':
        body = this.fightView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'choice':
        body = this.choiceView();
        break;
      case 'lab':
        body = this.labView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? `<header class="top" id="top">${this.topBar()}</header>` : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main><div id="modal-root">${this.modal ? this.modalView() : ''}</div>`;
    this.cv = null;
    if (this.screen === 'fight') this.mountBoard();
    else cancelAnimationFrame(this.raf);
  }

  private renderModal(): void {
    const m = this.root.querySelector<HTMLElement>('#modal-root');
    if (m) m.innerHTML = this.modal ? this.modalView() : '';
  }

  private refreshTop(): void {
    const t = this.root.querySelector<HTMLElement>('#top');
    if (t && this.run) t.innerHTML = this.topBar();
  }

  private topBar(coreOverride?: number): string {
    const r = this.run!;
    const core = coreOverride ?? r.core;
    const nodes = ACT_NODES.map((k, i) => `<i class="nd ${i < r.node ? 'done' : i === r.node ? 'now' : ''} k-${k}"></i>`).join('');
    return `${bar(core, r.maxCore, 'pbar', '🧫')}
      <span class="spores" title="Spores (spend them in the lab)">🍄 ${r.spores}</span>
      <span class="act" title="${ACTS[Math.min(r.act, 2)].name}">${ACTS[Math.min(r.act, 2)].icon}<span class="wide"> Act</span> ${Math.min(r.act + 1, 3)}<span class="nodes">${nodes}</span></span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play (H)">?</button>
      <button class="icon-btn" data-act="mute" title="Sound (M)">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>`;
  }

  private titleView(): string {
    const m = this.meta;
    const lab = UNLOCKS.map((u) => {
      const own = m.unlocked.includes(u.id);
      const info = u.kind === 'tpl' ? { icon: shapeSvg(u.id, 0), name: TEMPLATES[u.id].name, text: TEMPLATES[u.id].text } : { icon: `<span class="big">${CARDS[u.id].icon}</span>`, name: CARDS[u.id].name, text: CARDS[u.id].text };
      return `<div class="arm ${own ? 'own' : ''}"><span class="ico">${info.icon}</span><span class="arm-t"><b>${info.name}</b> <em class="dim">${u.kind === 'tpl' ? 'template' : 'rule card'}</em><small>${info.text}</small></span>
        ${own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.samples >= u.cost ? '' : 'disabled'}>🧪 ${u.cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo" aria-hidden="true">${this.logoSvg()}</div>
      <h1>Life Wars</h1>
      <p class="sub">Fight with the Game of Life. Place a few cells, let the board run ${GENS} generations, and grow into the enemy core.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue (act ${r.act + 1}, 🧫 ${r.core})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <label class="tog"><input type="checkbox" data-act="tut" ${this.tutorialOn ? 'checked' : ''}/> Start with the tutorial fight</label>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best act ${m.bestAct} · Best score ${m.best}</p>
      <h2>Spore Lab <small>🧪 ${m.samples} samples</small></h2>
      <p class="sub small">Each run gives samples (score / 60). Unlocks add templates and rule cards to the rewards of later runs.</p>
      <div class="archive">${lab}</div>
    </div>`;
  }

  private logoSvg(): string {
    // A glider in green and a pink blinker.
    const g = [
      [1, 0],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ];
    const cells = g.map(([x, y]) => `<rect x="${x * 12 + 2}" y="${y * 12 + 8}" width="10" height="10" rx="2" fill="${COL.p}"/>`).join('');
    const b = [0, 1, 2].map((y) => `<rect x="${62}" y="${y * 12 + 8}" width="10" height="10" rx="2" fill="${COL.e}"/>`).join('');
    return `<svg viewBox="0 0 80 52" width="120" height="78">${cells}<text x="40" y="34" font-size="16" fill="#9fd" text-anchor="middle">⚔</text>${b}</svg>`;
  }

  private fightView(): string {
    return `<div class="fight">
      <div class="bcol">
        <div class="foe" id="foe"></div>
        <div class="bwrap" id="bwrap"><canvas id="cv"></canvas></div>
        <div class="pv" id="pv"></div>
      </div>
      <div class="panel" id="panel"></div>
    </div>`;
  }

  private foeHtml(eCore?: number, turnNow?: number): string {
    const r = this.run!;
    const f = r.fight!;
    const turn = turnNow ?? f.turn;
    const e = ENEMIES[f.enemy];
    const w = ruleWords(enemyRule(e));
    const tag = f.kind === 'boss' ? '<em class="tag boss">Boss</em>' : f.kind === 'elite' ? '<em class="tag elite">Elite</em>' : f.kind === 'tutorial' ? '<em class="tag">Tutorial</em>' : '';
    const extra = [e.armor && e.armor > 1 ? 'Its cells die in a clash only with 2+ of your neighbors.' : '', e.dmg && e.dmg > 1 ? `Each hit on your core deals ${e.dmg}.` : ''].filter(Boolean).join(' ');
    const turnTxt = turn > TURN_LIMIT && f.kind !== 'tutorial' ? `<span class="bad">Turn ${turn} · Overgrowth −${DRY_DMG}🧫/turn</span>` : `Turn ${turn}/${TURN_LIMIT}`;
    return `<div class="foe-h"><span class="big">${e.icon}</span><b>${e.name}</b>${tag}<span class="grow"></span><span class="turn">${turnTxt}</span></div>
      ${bar(eCore ?? f.eCore, f.eMax, 'ebar', 'Core')}
      <p class="rule"><span class="ec">■</span> <b>${e.family}</b> <code>${ruleCode(enemyRule(e))}</code>: ${w.born} ${w.lives} ${extra}</p>`;
  }

  private panelHtml(): string {
    const r = this.run!;
    const f = r.fight!;
    const pc = playerCfg(r);
    const prule = { b: pc.b, s: pc.s };
    const w = ruleWords(prule);
    const left = this.left();
    const tools = r.templates
      .map((id, i) => {
        const o = this.orients[id] ?? 0;
        const cost = tplCost(r, id);
        const arrow = driftArrow(id, o, prule);
        const tut = f.kind === 'tutorial' && ((f.turn === 1 && id === 'glider') || (f.turn === 2 && id === 'block') || (f.turn === 3 && id === 'blinker'));
        return `<button class="tool ${this.tool === id ? 'on' : ''} ${tut ? 'pulse' : ''}" data-act="tool" data-id="${id}" ${cost > left ? 'data-poor="1"' : ''} title="${esc(TEMPLATES[id].name)}: ${esc(TEMPLATES[id].text)} (key ${i + 1})">
          ${shapeSvg(id, o)}<span class="tn">${TEMPLATES[id].name}${arrow ? ` <b class="arr">${arrow}</b>` : ''}</span><span class="tc">${cost}</span></button>`;
      })
      .join('');
    const t = TEMPLATES[this.tool];
    const cards = r.cards.map((c) => `<span class="chip" title="${esc(CARDS[c].text)}">${CARDS[c].icon} ${CARDS[c].name}</span>`).join('');
    const coach = f.kind === 'tutorial' ? `<div class="coach">${TUTORIAL[Math.min(f.turn - 1, TUTORIAL.length - 1)]}</div>` : '';
    const stampBtn = this.cursorTouch && this.cursor >= 0 ? '<button class="primary" data-act="stamp">✓ Stamp</button>' : '';
    return `${coach}
      <div class="acts">
        <span class="budget ${left < 0 ? 'bad' : ''}" title="Cells left this turn. Up to ${bankCap(r)} unused cells carry over."><span class="dim">Cells</span> <b>${left}</b>/${turnBudget(r)}</span>
        <button class="icon-btn" data-act="rot" title="Rotate (R or right-click)" ${this.busy ? 'disabled' : ''}>⟳</button>
        <button class="icon-btn" data-act="flip" title="Mirror (F)" ${this.busy ? 'disabled' : ''}>⇋</button>
        <button class="icon-btn" data-act="undo" title="Undo (Z)" ${this.stamps.length && !this.busy ? '' : 'disabled'}>↶</button>
        <button class="icon-btn" data-act="clear" title="Clear (X)" ${this.stamps.length && !this.busy ? '' : 'disabled'}>✕</button>
        <span class="grow"></span>
        ${stampBtn}
        <button class="primary run" data-act="go" ${this.busy ? 'disabled' : ''}>▶ Run ${GENS}</button>
      </div>
      <div class="tools">${tools}</div>
      <p class="tinfo"><b>${t.name}</b> <em class="dim">${KIND_WORD[t.kind]}</em> — ${t.text}</p>
      <p class="rule"><span class="pc">■</span> <b>Your cells</b> <code>${ruleCode(prule)}</code>: ${w.born} ${w.lives}${pc.armor > 1 ? ' They die in a clash only with 2+ enemy neighbors.' : ''}${pc.dmg > 1 ? ` Each hit deals ${pc.dmg}.` : ''}</p>
      ${cards ? `<div class="cards-line">${cards}</div>` : ''}`;
  }

  private pvHtml(): string {
    if (this.anim) {
      const a = this.anim;
      const g = Math.min(a.g + 1, a.res.frames.length - 1);
      return `<span class="gen">Generation <b>${g}</b>/${GENS}</span><span class="grow"></span>
        <button class="chip ${this.ff ? 'on' : ''}" data-act="ff" title="Fast-forward (Space)">⏩ Fast</button>
        <button class="chip" data-act="skip" title="Skip to the end (S)">⏭ Skip</button>`;
    }
    const p = this.preview;
    const chips = DEPTHS.map((d) => `<button class="chip ${this.depth === d ? 'on' : ''}" data-act="depth" data-d="${d}" title="Preview ${d} generations (P)">${d}</button>`).join('');
    const stats = p
      ? `<span class="pvs">${this.depth > GENS ? '<em class="dim">if no one adds cells:</em> ' : ''}<span class="${p.dmgE ? 'good' : 'dim'}">Enemy −${p.dmgE}</span> · <span class="${p.dmgP ? 'bad' : 'dim'}">You −${p.dmgP}</span> · <span class="pc">${p.mine}</span>:<span class="ec">${p.theirs}</span> cells</span>`
      : '';
    return `<span class="dim small">Ghost</span>${chips}<span class="dim small">gens</span>${stats}`;
  }

  private refreshFight(): void {
    if (this.screen !== 'fight') return;
    const foe = this.root.querySelector<HTMLElement>('#foe');
    if (foe && !this.anim) foe.innerHTML = this.foeHtml();
    const panel = this.root.querySelector<HTMLElement>('#panel');
    if (panel) panel.innerHTML = this.panelHtml();
    this.refreshPv();
  }

  private refreshPv(): void {
    const pv = this.root.querySelector<HTMLElement>('#pv');
    if (pv) pv.innerHTML = this.pvHtml();
  }

  private rewardView(): string {
    const r = this.run!;
    const cards = r.offer
      .map((rw, i) => {
        const info = rewardInfo(rw);
        const icon = rw.kind === 'tpl' ? shapeSvg(rw.id, 0, COL.p) : `<span class="big">${info.icon}</span>`;
        return `<button class="card" data-act="take" data-i="${i}">${icon}<b>${info.name}</b><small>${info.text}</small></button>`;
      })
      .join('');
    return `<div class="reward">
      <h2>Colony destroyed!</h2>
      <p class="sub">+${r.lastSpores} 🍄 spores · Core 🧫 ${r.core}/${r.maxCore}</p>
      <p>Choose one reward.</p>
      <div class="cards">${cards}</div>
      <button data-act="skip">Skip (+5 🍄)</button>
      ${this.deckLine()}
    </div>`;
  }

  private deckLine(): string {
    const r = this.run!;
    const t = r.templates.map((id) => `<span class="chip" title="${esc(TEMPLATES[id].text)}">${shapeSvg(id, 0, COL.p)} ${TEMPLATES[id].name}</span>`).join('');
    const c = r.cards.map((id) => `<span class="chip" title="${esc(CARDS[id].text)}">${CARDS[id].icon} ${CARDS[id].name}</span>`).join('');
    return `<div class="deck"><p class="dim small">Templates · ${r.budget} cells per turn</p><div class="chips">${t}</div>${c ? `<p class="dim small">Rule cards</p><div class="chips">${c}</div>` : ''}</div>`;
  }

  private choiceView(): string {
    const r = this.run!;
    const e = ENEMIES[ACTS[r.act].elite];
    const w = ruleWords(enemyRule(e));
    return `<div class="choice">
      <h2>A fork in the dish</h2>
      <p class="sub">Choose your path.</p>
      <div class="cards two">
        <button class="card" data-act="pick-elite"><span class="big">${e.icon}</span><b>Elite: ${e.name}</b><em class="fam">${e.family} <code>${e.rule}</code></em><small>${w.born} ${w.lives}</small><small class="good">Rare reward: always offers +1 cell per turn. More spores.</small></button>
        <button class="card" data-act="pick-lab"><span class="big">🔬</span><b>Lab</b><small>Rest: heal 6. Spend spores on templates, rule cards, healing or more cells.</small></button>
      </div>
      ${this.deckLine()}
    </div>`;
  }

  private labView(): string {
    const r = this.run!;
    const rows = r.shop
      .map((s, i) => {
        const info = rewardInfo(s.r);
        const icon = s.r.kind === 'tpl' ? shapeSvg(s.r.id, 0, COL.p) : `<span class="big">${info.icon}</span>`;
        return `<div class="arm ${s.sold ? 'own' : ''}"><span class="ico">${icon}</span><span class="arm-t"><b>${info.name}</b><small>${info.text}</small></span>
          ${s.sold ? '<span class="ok">Sold</span>' : `<button data-act="buy" data-i="${i}" ${r.spores >= s.cost ? '' : 'disabled'}>🍄 ${s.cost}</button>`}</div>`;
      })
      .join('');
    return `<div class="lab">
      <h2>🔬 Lab</h2>
      <p class="sub">You rest and heal 6. Spend your spores.</p>
      <div class="archive">${rows}</div>
      <button class="primary" data-act="leave-lab">Continue ▶</button>
      ${this.deckLine()}
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <div class="huge">${e.victory ? '🏆' : '🥀'}</div>
      <h1>${e.victory ? 'The dish is yours' : 'Your colony died out'}</h1>
      <p class="sub">${e.victory ? 'The Ancient falls. Every rival colony is gone.' : `You fell in act ${e.act}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>+${e.samples} 🧪 samples for the Spore Lab</p>
      <button class="primary" data-act="new">▶ New run</button>
      <button data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const tpls = Object.values(TEMPLATES)
        .filter((t) => t.id !== 'dot')
        .map((t) => `<div class="hl">${shapeSvg(t.id, 0, COL.p)}<span><b>${t.name}</b> <em class="dim">${KIND_WORD[t.kind]}, ${tplSize(t.id)} cells</em><br/><small>${t.text}</small></span></div>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li>The board follows <b>Game of Life</b> rules. Each square has 8 neighbors. Each color counts only its <b>own</b> neighbors and follows its own rule (shown in plain words under the board).</li>
          <li>Standard rule (B3/S23): an empty square with exactly 3 neighbors gets a new cell. A cell with 2 or 3 neighbors survives. Every other cell dies.</li>
          <li>Each turn the enemy places its cells first (they pulse). Then you place cells in your <b>green zone</b> at the bottom. Then the board runs <b>${GENS} generations</b>.</li>
          <li><b>Clash:</b> when pink and green cells touch, both die. If both colors would be born on the same square, it stays empty.</li>
          <li><b>Damage:</b> a cell that reaches the row next to the enemy core hits it and is used up. At the end of each turn, each of your cells inside the enemy zone hits the core once more. The enemy hurts you the same way.</li>
          <li>Destroy the enemy core to win. Your core HP carries over between fights. From turn ${TURN_LIMIT + 1} on, overgrowth costs you ${DRY_DMG} core HP per turn.</li>
          <li><b>Placing:</b> pick a template, then click or tap a square. On a phone, the first tap aims (ghost), the second tap on the same square stamps. Tap one of your new cells to take back its stamp. Unused cells carry over (up to ${this.run ? bankCap(this.run) : 4}).</li>
          <li><b>Ghost preview:</b> outlines show the board after 1, 4, ${GENS} or 24 generations. Dots show where your cells will pass. The numbers show the damage.</li>
          <li>After a fight: choose a template, a rule card or more cells. A fork in each act leads to an elite (hard, rare reward) or the lab (heal and shop). Each act ends with a boss. Win 3 acts.</li>
        </ul>
        <h3>Templates</h3>
        <div class="hlist">${tpls}</div>
        <h3>Keys</h3>
        <p class="small"><kbd>1</kbd>–<kbd>9</kbd> template, <kbd>R</kbd> rotate, <kbd>F</kbd> mirror, arrows move the aim, <kbd>Space</kbd> stamp, <kbd>Z</kbd> undo, <kbd>X</kbd> clear, <kbd>P</kbd> preview depth, <kbd>Enter</kbd> run. While it runs: <kbd>Space</kbd> fast-forward, <kbd>S</kbd> skip.</p>
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

  // ---------- Board ----------

  private mountBoard(): void {
    this.cv = this.root.querySelector<HTMLCanvasElement>('#cv');
    const cv = this.cv!;
    cv.addEventListener('pointerdown', (e) => this.onBoardDown(e));
    cv.addEventListener('pointermove', (e) => this.onBoardMove(e));
    cv.addEventListener('pointerleave', () => {
      if (!this.cursorTouch) {
        this.cursor = -1;
      }
    });
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.rotate(1);
    });
    this.fitBoard();
    this.refreshFight();
    this.updatePreview();
    cancelAnimationFrame(this.raf);
    const loop = (): void => {
      if (this.screen !== 'fight' || !this.cv) return;
      this.tick();
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private fitBoard(): void {
    const cv = this.cv;
    const wrap = this.root.querySelector<HTMLElement>('#bwrap');
    if (!cv || !wrap) return;
    const wide = window.innerWidth >= 900;
    const maxH = wide ? window.innerHeight - 190 : window.innerHeight * 0.52;
    const cs = Math.max(12, Math.floor(Math.min(wrap.clientWidth / W, maxH / H, 40)));
    this.cs = cs;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = cs * W * dpr;
    cv.height = cs * H * dpr;
    cv.style.width = `${cs * W}px`;
    cv.style.height = `${cs * H}px`;
    cv.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private cellAt(e: PointerEvent): number {
    const cv = this.cv!;
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * H);
    if (x < 0 || x >= W || y < 0 || y >= H) return -1;
    return idx(x, y);
  }

  private onBoardMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || this.busy || this.modal) return;
    const c = this.cellAt(e);
    if (c !== this.cursor) {
      this.cursor = c;
      this.cursorTouch = false;
    }
  }

  private onBoardDown(e: PointerEvent): void {
    initAudio();
    if (this.busy || this.modal || !this.run?.fight) return;
    if (e.button === 2) return;
    const c = this.cellAt(e);
    if (c < 0) return;
    // Tap one of your new cells: take that stamp back.
    const own = this.stamps.findIndex((s) => s.cells.includes(c));
    if (own >= 0) {
      this.stamps.splice(own, 1);
      sfx.remove();
      this.afterEdit();
      return;
    }
    const touch = e.pointerType !== 'mouse';
    if (touch && this.tool !== 'dot' && (this.cursor !== c || !this.cursorTouch)) {
      this.cursor = c;
      this.cursorTouch = true;
      this.refreshFight();
      return;
    }
    this.cursor = c;
    this.stampAt(c);
  }

  private currentCells(c: number): number[] | null {
    const s = orient(TEMPLATES[this.tool].shape, this.orients[this.tool] ?? 0);
    return stampCells(s, cx(c), cy(c));
  }

  private stampAt(c: number): void {
    const r = this.run!;
    const cells = this.currentCells(c);
    const board = boardFromString(r.fight!.board);
    const used = new Set(this.stamps.flatMap((s) => s.cells));
    const cost = tplCost(r, this.tool);
    if (!legal(board, cells, 1, zoneExtra(r), used)) {
      sfx.deny();
      this.toast(cells ? 'Stamp inside your green zone, on empty squares.' : 'The shape does not fit there.');
      return;
    }
    if (cost > this.left()) {
      sfx.deny();
      this.toast(`Not enough cells: ${TEMPLATES[this.tool].name} costs ${cost}.`);
      return;
    }
    this.stamps.push({ tpl: this.tool, o: this.orients[this.tool] ?? 0, cells: cells!, cost });
    this.tool === 'dot' ? sfx.place() : sfx.stamp();
    this.cursorTouch = false;
    for (const q of cells!) this.burst(q, COL.p, 3, 0.6);
    this.afterEdit();
  }

  private afterEdit(): void {
    this.updatePreview();
    this.refreshFight();
  }

  private rotate(d: number): void {
    if (this.busy) return;
    const o = this.orients[this.tool] ?? 0;
    this.orients[this.tool] = (o & 4) | (((o & 3) + d + 4) % 4);
    sfx.rotate();
    this.refreshFight();
  }

  private flip(): void {
    if (this.busy) return;
    this.orients[this.tool] = (this.orients[this.tool] ?? 0) ^ 4;
    sfx.rotate();
    this.refreshFight();
  }

  private startBoard(): Uint8Array {
    const b = boardFromString(this.run!.fight!.board);
    for (const s of this.stamps) for (const c of s.cells) b[c] = 1;
    return b;
  }

  private updatePreview(): void {
    const r = this.run;
    if (!r?.fight) {
      this.preview = null;
      return;
    }
    const p = playerCfg(r);
    const e = enemyCfg(enemyOf(r));
    const start = this.startBoard();
    // Trail: every square a green cell visits during the preview.
    const trail = new Uint8Array(N);
    let cur = start;
    for (let g = 0; g < this.depth; g++) {
      cur = simulate(cur, 1, p, e).board.slice();
      for (let i = 0; i < N; i++) if (cur[i] === 1) trail[i] = 1;
    }
    const res = simulate(start, this.depth, p, e);
    const [mine, theirs] = countCells(res.board);
    this.preview = { board: res.board.slice(), trail, dmgE: res.dmgE, dmgP: res.dmgP, clashes: res.clashes, mine, theirs };
  }

  // ---------- Turn animation ----------

  private go(): void {
    const r = this.run;
    if (!r?.fight || this.busy || r.stage !== 'fight') return;
    initAudio();
    sfx.run();
    const stamps = this.stamps;
    this.stamps = [];
    this.cursorTouch = false;
    this.lastFightTurn = `${r.fights}:${r.fight.turn}`;
    const turn = r.fight.turn;
    const res = resolveTurn(r, stamps);
    this.save();
    if (FAST) {
      this.finishTurn(res);
      return;
    }
    this.anim = { res, g: 0, t0: performance.now(), turn };
    this.fireGen(res, 0);
    this.refreshFight();
  }

  private genMs(): number {
    return this.ff ? GEN_MS_FAST : GEN_MS;
  }

  private tick(): void {
    const a = this.anim;
    if (!a) return;
    const now = performance.now();
    let changed = false;
    while (this.anim && now - a.t0 >= this.genMs()) {
      a.t0 += this.genMs();
      a.g++;
      changed = true;
      if (a.g >= a.res.frames.length - 1) {
        this.anim = null;
        this.finishTurn(a.res);
        return;
      }
      this.fireGen(a.res, a.g);
    }
    if (changed) this.refreshPv();
  }

  /** Effects when the transition into frames[g + 1] starts. */
  private fireGen(res: TurnResult, g: number): void {
    const ev = res.events[g + 1];
    if (!ev) return;
    sfx.gen(g);
    if (ev.clash.length) {
      sfx.clash(ev.clash.length);
      for (const c of ev.clash) this.burst(c, '#fff3b0', 4, 1);
    }
    if (ev.hitE.length) {
      sfx.hitE();
      this.flashE = performance.now();
      for (const c of ev.hitE) {
        this.burst(c - W, COL.p, 6, 1.4);
        this.float(c - W, `−${playerCfg(this.run!).dmg}`, COL.p);
      }
    }
    if (ev.hitP.length) {
      sfx.hitP();
      this.flashP = performance.now();
      this.shake = performance.now();
      for (const c of ev.hitP) {
        this.burst(c + W, COL.e, 6, 1.4);
        this.float(c + W, `−${enemyCfg(enemyOf(this.run!)).dmg}`, COL.bad);
      }
    }
    const foe = this.root.querySelector<HTMLElement>('#foe');
    if (foe && this.run?.fight) foe.innerHTML = this.foeHtml(res.eCore[g + 1], this.anim?.turn);
    const top = this.root.querySelector<HTMLElement>('#top');
    if (top && (ev.hitP.length || g === 0)) top.innerHTML = this.topBar(res.pCore[g + 1]);
  }

  private finishTurn(res: TurnResult): void {
    const r = this.run!;
    this.ff = false;
    const msgs: string[] = [];
    if (res.inv[0]) {
      msgs.push(`<span class="pc">${res.inv[0]} invaders hit the enemy core</span>`);
      this.flashE = performance.now();
      if (!FAST) for (let x = 2; x < W; x += 5) this.float(idx(x, 0), `−${res.inv[0]}`, COL.p);
      sfx.hitE();
    }
    if (res.inv[1]) {
      msgs.push(`<span class="bad">${res.inv[1]} enemy invaders hit your core</span>`);
      this.flashP = performance.now();
      this.shake = performance.now();
      sfx.hitP();
    }
    if (res.heal) {
      msgs.push(`<span class="good">+${res.heal} 🧫 core heal</span>`);
      sfx.heal();
    }
    if (res.dry) msgs.push(`<span class="bad">Overgrowth: −${res.dry} 🧫</span>`);
    if (msgs.length && !FAST && !res.outcome) this.toast(msgs.join('<br/>'));
    if (res.outcome === 'loss') {
      sfx.lose();
      this.finishRun(false);
      return;
    }
    if (res.outcome === 'win') {
      sfx.win();
      if (r.fight?.kind === 'tutorial' || (r.act === 0 && r.node === 0)) {
        this.meta.tutorialDone = true;
        saveMeta(this.meta);
      }
      this.screen = this.screenForStage();
      this.render();
      return;
    }
    this.updatePreview();
    this.refreshTop();
    this.refreshFight();
  }

  private finishRun(victory: boolean): void {
    const r = this.run!;
    const s = score(r, victory);
    const samples = samplesFor(s);
    this.meta.runs++;
    if (victory) this.meta.wins++;
    this.meta.best = Math.max(this.meta.best, s);
    this.meta.bestAct = Math.max(this.meta.bestAct, Math.min(r.act + 1, 3));
    this.meta.samples += samples;
    saveMeta(this.meta);
    this.end = { victory, score: s, samples, act: Math.min(r.act + 1, 3) };
    this.run = null;
    clearRun();
    this.anim = null;
    this.modal = null;
    this.screen = 'end';
    this.render();
  }

  // ---------- Effects ----------

  private burst(c: number, color: string, n: number, speed: number): void {
    if (FAST) return;
    const x = (cx(c) + 0.5) * this.cs;
    const y = (cy(c) + 0.5) * this.cs;
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random()) * speed * this.cs * 0.05;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: now, life: 350 + Math.random() * 250, color });
    }
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
  }

  private float(c: number, text: string, color: string): void {
    if (FAST) return;
    this.floats.push({ x: (cx(c) + 0.5) * this.cs, y: (cy(c) + 0.5) * this.cs, text, color, t0: performance.now() });
  }

  // ---------- Drawing ----------

  private draw(): void {
    const cv = this.cv;
    const r = this.run;
    if (!cv || !r?.fight) return;
    const g = cv.getContext('2d')!;
    const cs = this.cs;
    const now = performance.now();
    const bw = cs * W;
    const bh = cs * H;
    g.save();
    if (now - this.shake < 250) {
      const k = (1 - (now - this.shake) / 250) * 3;
      g.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }
    g.fillStyle = COL.bg;
    g.fillRect(-4, -4, bw + 8, bh + 8);
    // Zones.
    const [ez0, ez1] = zoneRows(2);
    const [pz0, pz1] = zoneRows(1, zoneExtra(r));
    g.fillStyle = COL.eDim;
    g.fillRect(0, ez0 * cs, bw, (ez1 - ez0 + 1) * cs);
    g.fillStyle = COL.neutral;
    g.fillRect(0, (ez1 + 1) * cs, bw, (pz0 - ez1 - 1) * cs);
    g.fillStyle = COL.pDim;
    g.fillRect(0, pz0 * cs, bw, (pz1 - pz0 + 1) * cs);
    if (pz0 < H - 1 - ZONE) {
      g.fillStyle = 'rgba(6, 214, 160, 0.06)';
      g.fillRect(0, pz0 * cs, bw, (H - 1 - ZONE - pz0) * cs);
    }
    // Grid.
    g.strokeStyle = COL.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 1; x < W; x++) {
      g.moveTo(x * cs + 0.5, cs);
      g.lineTo(x * cs + 0.5, bh - cs);
    }
    for (let y = 1; y < H; y++) {
      g.moveTo(0, y * cs + 0.5);
      g.lineTo(bw, y * cs + 0.5);
    }
    g.stroke();
    // Cores.
    this.drawCore(g, 0, COL.e, now - this.flashE < 300 ? 1 - (now - this.flashE) / 300 : 0, r.fight.eCore / r.fight.eMax);
    this.drawCore(g, H - 1, COL.p, now - this.flashP < 300 ? 1 - (now - this.flashP) / 300 : 0, r.core / r.maxCore);

    const a = this.anim;
    if (a) {
      const t = Math.min(1, (now - a.t0) / this.genMs());
      const from = a.res.frames[a.g];
      const to = a.res.frames[a.g + 1] ?? from;
      for (let i = W; i < N - W; i++) {
        const o1 = from[i];
        const o2 = to[i];
        if (o1 && o1 === o2) this.cell(g, i, o1, 1, 1);
        else {
          if (o1) this.cell(g, i, o1, 1 - t, 1 - t * 0.5);
          if (o2) this.cell(g, i, o2, t, 0.5 + t * 0.5);
        }
      }
    } else {
      const board = boardFromString(r.fight.board);
      const pv = this.preview;
      // Trail of the preview: small dots where green cells will pass.
      if (pv) {
        g.fillStyle = 'rgba(6, 214, 160, 0.35)';
        for (let i = W; i < N - W; i++) {
          if (pv.trail[i] && !board[i]) {
            g.beginPath();
            g.arc((cx(i) + 0.5) * cs, (cy(i) + 0.5) * cs, Math.max(1.5, cs * 0.09), 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      const fresh = new Set(r.fight.enemyNew);
      const pulse = 0.5 + 0.5 * Math.sin(now / 220);
      for (let i = W; i < N - W; i++) {
        const o = board[i];
        if (!o) continue;
        this.cell(g, i, o, 1, 1);
        if (fresh.has(i)) {
          g.strokeStyle = `rgba(255, 255, 255, ${0.35 + pulse * 0.5})`;
          g.lineWidth = 1.5;
          g.strokeRect(cx(i) * cs + 1.5, cy(i) * cs + 1.5, cs - 3, cs - 3);
        }
      }
      for (const s of this.stamps) {
        for (const c of s.cells) {
          this.cell(g, c, 1, 1, 1);
          g.strokeStyle = '#ffffff';
          g.lineWidth = 1.5;
          g.strokeRect(cx(c) * cs + 1.5, cy(c) * cs + 1.5, cs - 3, cs - 3);
        }
      }
      // Ghost: the board after `depth` generations, as outlines.
      if (pv) {
        g.setLineDash([3, 2]);
        g.lineWidth = 1.5;
        for (let i = W; i < N - W; i++) {
          const o = pv.board[i];
          if (!o) continue;
          g.strokeStyle = o === 1 ? 'rgba(160, 255, 225, 0.95)' : 'rgba(255, 160, 190, 0.9)';
          g.strokeRect(cx(i) * cs + 3, cy(i) * cs + 3, cs - 6, cs - 6);
        }
        g.setLineDash([]);
      }
      // Cursor ghost of the selected template.
      if (this.cursor >= 0 && !this.modal) {
        const cells = this.currentCells(this.cursor);
        const used = new Set(this.stamps.flatMap((s) => s.cells));
        const ok = legal(board, cells, 1, zoneExtra(r), used) && tplCost(r, this.tool) <= this.left();
        if (cells) {
          g.fillStyle = ok ? 'rgba(6, 214, 160, 0.45)' : 'rgba(255, 77, 77, 0.45)';
          for (const c of cells) g.fillRect(cx(c) * cs + 2, cy(c) * cs + 2, cs - 4, cs - 4);
        }
        g.strokeStyle = ok ? 'rgba(255,255,255,0.7)' : COL.bad;
        g.lineWidth = 1;
        g.strokeRect(cx(this.cursor) * cs + 0.5, cy(this.cursor) * cs + 0.5, cs - 1, cs - 1);
      }
    }
    // Particles and floating numbers.
    this.parts = this.parts.filter((p) => now - p.t0 < p.life);
    for (const p of this.parts) {
      const k = (now - p.t0) / p.life;
      const dt = (now - p.t0) / 16;
      g.globalAlpha = 1 - k;
      g.fillStyle = p.color;
      g.fillRect(p.x + p.vx * dt - 1.5, p.y + p.vy * dt - 1.5, 3, 3);
    }
    g.globalAlpha = 1;
    this.floats = this.floats.filter((f) => now - f.t0 < 900);
    g.font = `bold ${Math.max(12, cs * 0.6)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    for (const f of this.floats) {
      const k = (now - f.t0) / 900;
      g.globalAlpha = 1 - k;
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y + cs * 0.9 - k * cs * 1.2);
    }
    g.globalAlpha = 1;
    g.restore();
  }

  private cell(g: CanvasRenderingContext2D, i: number, o: number, alpha: number, scale: number): void {
    const cs = this.cs;
    const s = (cs - 2) * scale;
    const x = cx(i) * cs + (cs - s) / 2;
    const y = cy(i) * cs + (cs - s) / 2;
    g.globalAlpha = Math.max(0, alpha);
    g.fillStyle = o === 1 ? COL.p : COL.e;
    const rr = Math.max(1, s * 0.22);
    g.beginPath();
    g.roundRect(x, y, s, s, rr);
    g.fill();
    g.globalAlpha = 1;
  }

  private drawCore(g: CanvasRenderingContext2D, row: number, color: string, flash: number, frac: number): void {
    const cs = this.cs;
    const y = row * cs;
    g.fillStyle = color;
    g.globalAlpha = 0.18 + flash * 0.6;
    g.fillRect(0, y, cs * W, cs);
    g.globalAlpha = 0.85;
    const alive = Math.ceil(frac * W);
    for (let x = 0; x < W; x++) {
      g.globalAlpha = x < alive ? 0.85 : 0.15;
      g.beginPath();
      g.arc((x + 0.5) * cs, y + cs / 2, cs * 0.28, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // ---------- Input ----------

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'Escape') {
      if (this.modal) this.modal = null;
      else if (this.run && this.screen !== 'title' && this.screen !== 'end') this.modal = { kind: 'menu', confirm: false };
      this.renderModal();
      return;
    }
    if (this.modal) return;
    if (k === 'h' || k === 'H' || k === '?') {
      this.modal = { kind: 'help' };
      this.renderModal();
      return;
    }
    if (k === 'm' || k === 'M') {
      toggleMute();
      this.refreshTop();
      return;
    }
    if (this.screen !== 'fight' || !this.run?.fight) return;
    initAudio();
    if (this.busy) {
      if (k === ' ') {
        e.preventDefault();
        this.ff = !this.ff;
        this.refreshPv();
      } else if (k === 's' || k === 'S') this.skipAnim();
      return;
    }
    const r = this.run;
    if (/^[1-9]$/.test(k)) {
      const id = r.templates[Number(k) - 1];
      if (id) {
        this.tool = id;
        this.refreshFight();
      }
      return;
    }
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (moves[k]) {
      e.preventDefault();
      const [z0, z1] = zoneRows(1, zoneExtra(r));
      const c = this.cursor >= 0 ? this.cursor : idx(W >> 1, z0 + 2);
      const x = Math.max(0, Math.min(W - 1, cx(c) + moves[k][0]));
      const y = Math.max(z0, Math.min(z1, cy(c) + moves[k][1]));
      this.cursor = idx(x, y);
      this.cursorTouch = true;
      this.refreshFight();
      return;
    }
    switch (k) {
      case 'r':
      case 'R':
        this.rotate(e.shiftKey ? -1 : 1);
        break;
      case 'f':
      case 'F':
        this.flip();
        break;
      case ' ':
        e.preventDefault();
        if (this.cursor >= 0) this.stampAt(this.cursor);
        break;
      case 'z':
      case 'Z':
      case 'Backspace':
        this.undo();
        break;
      case 'x':
      case 'X':
        this.clearStamps();
        break;
      case 'p':
      case 'P':
        this.depth = DEPTHS[(DEPTHS.indexOf(this.depth) + 1) % DEPTHS.length];
        this.afterEdit();
        break;
      case 'Enter':
      case 'g':
      case 'G':
        e.preventDefault();
        this.go();
        break;
    }
  }

  private undo(): void {
    if (!this.stamps.length || this.busy) return;
    this.stamps.pop();
    sfx.remove();
    this.afterEdit();
  }

  private clearStamps(): void {
    if (!this.stamps.length || this.busy) return;
    this.stamps = [];
    sfx.remove();
    this.afterEdit();
  }

  private skipAnim(): void {
    const a = this.anim;
    if (!a) return;
    this.anim = null;
    this.finishTurn(a.res);
  }

  private enterStage(): void {
    this.stamps = [];
    this.cursor = -1;
    this.cursorTouch = false;
    if (isRunWon(this.run!)) {
      this.finishRun(true);
      return;
    }
    this.save();
    this.screen = this.screenForStage();
    if (this.screen === 'fight') {
      this.tool = this.run!.fight!.kind === 'tutorial' ? 'glider' : this.run!.templates.includes(this.tool) ? this.tool : 'glider';
      if (this.run!.fight!.kind === 'tutorial') this.orients = {};
    }
    this.render();
  }

  private newRun(): void {
    this.run = newRun(randomSeedText(), this.meta, this.tutorialOn);
    this.end = null;
    this.modal = null;
    this.orients = {};
    this.preview = null;
    this.enterStage();
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'modal-close' && target.closest('[data-stop]') && btn.closest('[data-stop]') === null) return;
    const act = btn.dataset.act!;
    const r = this.run;
    switch (act) {
      case 'help':
        this.modal = { kind: 'help' };
        this.renderModal();
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        this.renderModal();
        break;
      case 'modal-close':
        this.modal = null;
        this.renderModal();
        break;
      case 'mute':
        toggleMute();
        this.refreshTop();
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.renderModal();
        break;
      case 'abandon-yes':
        if (r) this.finishRun(false);
        break;
      case 'title':
        this.modal = null;
        this.anim = null;
        this.screen = 'title';
        this.render();
        break;
      case 'new':
        this.newRun();
        break;
      case 'continue':
        if (r) this.enterStage();
        break;
      case 'tut':
        this.tutorialOn = (btn as HTMLInputElement).checked;
        break;
      case 'unlock': {
        const u = UNLOCKS.find((x) => x.id === btn.dataset.id);
        if (u && this.meta.samples >= u.cost && !this.meta.unlocked.includes(u.id)) {
          this.meta.samples -= u.cost;
          this.meta.unlocked.push(u.id);
          saveMeta(this.meta);
          sfx.item();
          this.render();
        }
        break;
      }
      case 'tool':
        if (this.busy) break;
        this.tool = btn.dataset.id!;
        sfx.rotate();
        this.refreshFight();
        break;
      case 'rot':
        this.rotate(1);
        break;
      case 'flip':
        this.flip();
        break;
      case 'undo':
        this.undo();
        break;
      case 'clear':
        this.clearStamps();
        break;
      case 'stamp':
        if (this.cursor >= 0) this.stampAt(this.cursor);
        break;
      case 'depth':
        this.depth = Number(btn.dataset.d);
        this.afterEdit();
        break;
      case 'go':
        this.go();
        break;
      case 'ff':
        this.ff = !this.ff;
        this.refreshPv();
        break;
      case 'skip':
        if (this.screen === 'fight') this.skipAnim();
        else if (r && r.stage === 'reward') {
          skipReward(r);
          sfx.coin();
          this.enterStage();
        }
        break;
      case 'take':
        if (r && r.stage === 'reward') {
          const rw = r.offer[Number(btn.dataset.i)];
          takeReward(r, Number(btn.dataset.i));
          sfx.item();
          if (rw) this.toast(`Got ${rewardInfo(rw).name}`);
          this.enterStage();
        }
        break;
      case 'pick-elite':
      case 'pick-lab':
        if (r) {
          chooseNode(r, act === 'pick-elite' ? 'elite' : 'lab');
          this.enterStage();
        }
        break;
      case 'buy':
        if (r && buy(r, Number(btn.dataset.i))) {
          sfx.coin();
          this.save();
          this.render();
        } else sfx.deny();
        break;
      case 'leave-lab':
        if (r) {
          leaveLab(r);
          this.enterStage();
        }
        break;
    }
  }

  // ---------- Debug ----------

  private installDebug(): void {
    const rng = new Rng(hash('debug', Date.now()));
    const api = {
      state: () => ({
        screen: this.screen,
        stage: this.run?.stage ?? null,
        modal: this.modal?.kind ?? null,
        busy: this.busy,
        act: this.run ? this.run.act + 1 : null,
        node: this.run?.node ?? null,
        core: this.run?.core ?? null,
        maxCore: this.run?.maxCore ?? null,
        spores: this.run?.spores ?? null,
        budget: this.run?.budget ?? null,
        templates: this.run?.templates ?? [],
        cards: this.run?.cards ?? [],
        enemy: this.run?.fight?.enemy ?? null,
        eCore: this.run?.fight?.eCore ?? null,
        turn: this.run?.fight?.turn ?? null,
        stamps: this.stamps.length,
        end: this.end,
        lastTurn: this.lastFightTurn,
      }),
      /** One bot action. In a fight the bot tries placements, keeps the best simulated one and runs the turn. */
      step: (tries = 30): string => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.renderModal();
          return 'close modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            this.newRun();
            return 'new run';
          case 'end':
            return 'end';
        }
        if (!r) return 'no run';
        if (r.stage === 'fight') {
          this.stamps = botPlacement('smart', r, rng, tries);
          this.go();
          return `turn ${r.fight?.turn ?? '-'}`;
        }
        if (r.stage === 'reward') {
          const i = pickReward('smart', r, r.offer, rng);
          takeReward(r, i);
          this.enterStage();
          return `reward ${i}`;
        }
        if (r.stage === 'choice') {
          const elite = r.core > r.maxCore * 0.6;
          chooseNode(r, elite ? 'elite' : 'lab');
          this.enterStage();
          return elite ? 'elite' : 'lab';
        }
        if (r.stage === 'lab') {
          for (let i = r.shop.length - 1; i >= 0; i--) buy(r, i);
          leaveLab(r);
          this.enterStage();
          return 'lab';
        }
        return 'idle';
      },
      win: () => {
        if (this.run?.fight) {
          this.run.fight.eCore = 1;
          return 'enemy core set to 1';
        }
        return 'no fight';
      },
      core: (n: number) => {
        if (this.run) this.run.core = n;
        this.refreshTop();
      },
      samples: (n: number) => {
        this.meta.samples = n;
        saveMeta(this.meta);
      },
      rewards: (): Reward[] => this.run?.offer ?? [],
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
