import {
  LIMIT,
  MAX_ROUNDS,
  allies,
  apply,
  attackTargets,
  canBrace,
  endPlayerTurn,
  cellSkill,
  enemies,
  momentInfo,
  reach,
  skillTargets,
  slideAt,
  tiltOf,
  unitAt,
  unitById,
  weight,
  type Action,
  type Battle,
  type Result,
  type Unit,
} from './beam';
import { botReward, botTeach, enemyPhase, smartTurn } from './bots';
import { ACTS, BEAMS, ITEMS, KINDS, SKILLS, SQUADS } from './data';
import { randomSeedText } from './rng';
import {
  FIGHTS_PER_ACT,
  MAX_SKILLS,
  advance,
  aiCfg,
  clearRun,
  finishFight,
  isBoss,
  loadMeta,
  loadRun,
  makeFight,
  newRun,
  rewardText,
  saveMeta,
  saveRun,
  score,
  setMetaForOffers,
  squadUnlockText,
  squadUnlocked,
  takeReward,
  teach,
  unitUnlockText,
  unitUnlocked,
  type RunState,
} from './run';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'path' | 'battle' | 'reward' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };
/** 'auto' shows walk cells and attack targets together. Other modes are skill ids. */
type Mode = 'auto' | string;

const FAST = new URLSearchParams(location.search).has('fast');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, FAST ? 0 : ms));

// Board geometry (SVG units).
const CELL = 60;
const PAD = 26;
const PIVOT_Y = 160;
const VIEW_H = 300;
const DEG = 4;
const UR = 29;

interface Float {
  x: number;
  y: number;
  text: string;
  cls: string;
  t0: number;
}

interface ViewUnit {
  u: Unit;
  x: number;
  drop: number;
  fade: number;
}

interface View {
  angle: number;
  units: ViewUnit[];
}

const SEG_MS = 230;

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private squad = 'balanced';

  private b: Battle | null = null;
  private sel: number | null = null;
  private inspect: number | null = null;
  private mode: Mode = 'auto';
  private pending: Action | null = null;
  private hover: Action | null = null;
  private history: Battle[] = [];
  private busy = false;
  private view: View | null = null;
  private floats: Float[] = [];
  private raf = 0;
  private actor: number | null = null;
  private meterTilt = 0;
  private end: { won: boolean; score: number; act: number; fights: number; tipped: number; kills: number } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    setMetaForOffers(this.meta);
    try {
      setMuted(localStorage.getItem('scales.mute') === '1');
    } catch {
      /* ignore */
    }
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerleave', () => this.setHover(null));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (new URLSearchParams(location.search).has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'path':
        body = this.pathView();
        break;
      case 'battle':
        body = this.battleView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
  }

  /** Redraw only the battle parts (meter, board, panel). */
  private renderBattle(): void {
    if (this.screen !== 'battle' || !this.b) return;
    const set = (id: string, html: string) => {
      const el = this.root.querySelector<HTMLElement>(id);
      if (el) el.innerHTML = html;
    };
    set('#meter', this.meterView());
    set('#board-holder', this.boardSvg());
    set('#panel', this.panelView());
    set('#roster', this.rosterView());
  }

  private renderBoardOnly(): void {
    const el = this.root.querySelector<HTMLElement>('#board-holder');
    if (el && this.b) el.innerHTML = this.boardSvg();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const act = ACTS[Math.min(r.act, ACTS.length - 1)];
    const where = `${act.icon} Act ${r.act + 1} · ${isBoss(r) ? 'Boss' : `Fight ${r.fight + 1}/${FIGHTS_PER_ACT - 1}`}`;
    const beam = this.b && this.screen === 'battle' ? `<span class="beam-name" title="${BEAMS[this.b.beam].text}">${BEAMS[this.b.beam].icon} ${BEAMS[this.b.beam].name}</span>` : '';
    return `<header class="top">
      <span class="where">${where}</span>
      ${beam}
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const squads = SQUADS.map((s) => {
      const locked = !squadUnlocked(m, s.id);
      const units = s.units.map((k) => KINDS[k].icon).join(' ');
      return `<button class="squad ${this.squad === s.id ? 'on' : ''}" data-act="squad" data-id="${s.id}" ${locked ? 'disabled' : ''}>
        <b>${s.icon} ${s.name}</b><span class="units">${units}</span>
        <small>${locked ? `🔒 ${squadUnlockText(s.id)}` : s.text}</small>
      </button>`;
    }).join('');
    const unlocks = ['aeronaut', 'anchor', 'sponge']
      .map((k) => `<li class="${unitUnlocked(m, k) ? 'ok' : ''}">${KINDS[k].icon} ${KINDS[k].name}: ${unitUnlocked(m, k) ? 'unlocked' : `🔒 ${unitUnlockText(k)}`}</li>`)
      .join('');
    const cont = this.run
      ? `<button class="primary big" data-act="continue">Continue run · Act ${this.run.act + 1}</button>`
      : '';
    return `<div class="title">
      <div class="logo">⚖️</div>
      <h1>Tip the Scales</h1>
      <p class="tag">Everyone stands on one beam. Tip it, and the low end slides off.</p>
      ${cont}
      <h3>Choose your party</h3>
      <div class="squads">${squads}</div>
      <button class="${this.run ? '' : 'primary'} big" data-act="new">${this.run ? 'New run (ends the current run)' : 'Start run'}</button>
      <div class="meta">
        <span>Runs <b>${m.runs}</b></span><span>Wins <b>${m.wins}</b></span><span>Best <b>${m.best}</b></span><span>Tipped off <b>${m.tipped}</b></span>
      </div>
      <ul class="unlocks">${unlocks}</ul>
      <button data-act="help">How to play</button>
    </div>`;
  }

  private pathView(): string {
    const r = this.run!;
    const act = ACTS[r.act];
    const nodes = Array.from({ length: FIGHTS_PER_ACT }, (_, i) => {
      const cls = i < r.fight ? 'done' : i === r.fight ? 'cur' : '';
      const icon = i === FIGHTS_PER_ACT - 1 ? KINDS[act.boss].icon : '⚔️';
      return `<span class="node ${cls}">${i < r.fight ? '✔' : icon}</span>`;
    }).join('<i class="link"></i>');
    const fight = makeFight(r);
    const beam = BEAMS[fight.beam];
    const foes = enemies(fight)
      .map((u) => `<span class="chip" title="${KINDS[u.kind].text}">${KINDS[u.kind].icon} ${KINDS[u.kind].name} <small>w${u.w}</small></span>`)
      .join('');
    return `<div class="path">
      <h2>${act.icon} Act ${r.act + 1}: ${act.name}</h2>
      <div class="nodes">${nodes}</div>
      <div class="card next">
        <h3>${isBoss(r) ? '👑 Boss fight' : `Fight ${r.fight + 1}`}</h3>
        <p><b>${beam.icon} ${beam.name}</b> — ${beam.text}</p>
        <div class="chips">${foes}</div>
      </div>
      <h3>Party</h3>
      <div class="party">${this.partyCards()}</div>
      ${r.items.length ? `<h3>Items</h3><div class="chips">${r.items.map((i) => `<span class="chip" title="${ITEMS[i].text}">${ITEMS[i].icon} ${ITEMS[i].name}</span>`).join('')}</div>` : ''}
      <button class="primary big" data-act="fight">Start fight</button>
    </div>`;
  }

  private partyCards(teachMode = false): string {
    const r = this.run!;
    return r.party
      .map((m, i) => {
        const k = KINDS[m.kind];
        const skills = [...k.skills, ...m.skills].map((s) => `${SKILLS[s].icon} ${SKILLS[s].name}`).join(', ') || 'no skills';
        const can = teachMode && r.teach && m.skills.length < MAX_SKILLS && !m.skills.includes(r.teach) && !k.skills.includes(r.teach);
        const inner = `<b>${k.icon} ${k.name}</b>
          <span>❤️ ${m.hp}/${m.max} · ⚖️ ${k.w} · ✊ ${k.grip}</span>
          <small>${skills}</small>`;
        if (teachMode) return `<button class="pcard" data-act="teach" data-i="${i}" ${can ? '' : 'disabled'}>${inner}</button>`;
        return `<div class="pcard">${inner}</div>`;
      })
      .join('');
  }

  private rewardView(): string {
    const r = this.run!;
    if (r.teach) {
      const s = SKILLS[r.teach];
      return `<div class="reward">
        <h2>${s.icon} Teach ${s.name}</h2>
        <p>${s.text}</p>
        <p class="muted">Pick a unit. Each unit can learn ${MAX_SKILLS} skills.</p>
        <div class="party">${this.partyCards(true)}</div>
        <button data-act="skip-teach">Skip</button>
      </div>`;
    }
    const cards = r.offers
      .map((w, i) => {
        const t = rewardText(w);
        return `<button class="offer" data-act="reward" data-i="${i}"><span class="oicon">${t.icon}</span><b>${t.name}</b><small>${t.text}</small></button>`;
      })
      .join('');
    return `<div class="reward">
      <h2>🏆 Fight won</h2>
      <p class="muted">Choose one.</p>
      <div class="offers">${cards}</div>
      <h3>Party</h3>
      <div class="party">${this.partyCards()}</div>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <div class="logo">${e.won ? '🏆' : '🕳️'}</div>
      <h1>${e.won ? 'The scales are yours' : 'Into the pit'}</h1>
      <p>${e.won ? 'You beat all three acts.' : `Your party fell in act ${e.act + 1}.`}</p>
      <div class="stats">
        <span>Score <b>${e.score}</b></span>
        <span>Fights won <b>${e.fights}</b></span>
        <span>Tipped off <b>${e.tipped}</b></span>
        <span>Defeated <b>${e.kills}</b></span>
      </div>
      <button class="primary big" data-act="to-title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>The beam</b> rests on a pivot over a pit. Every unit has a <b>weight</b> ⚖️.</li>
          <li><b>Moment</b> = weight × distance from the pivot, summed over all units. <b>Tilt</b> = moment ÷ the beam's step, rounded toward 0. The meter shows it.</li>
          <li><b>Slide:</b> after every action, each unit slides <b>tilt − 1 − grip</b> cells toward the low end. It stops at the next unit. Past the edge it <b>falls</b>.</li>
          <li><b>Limit:</b> at tilt 4 grip does not help. Every unit slides 3.</li>
          <li><b>Never slide:</b> floating units (🎈 🦇 🫧, negative weight) and <b>braced</b> units. Brace lasts until your next turn. A unit cannot brace two turns in a row.</li>
          <li><b>Your turn:</b> each unit can walk, then act once: attack, a skill, or brace. Units can walk past allies, not past enemies.</li>
          <li><b>Knock-back</b> pushes the target away. A push into a unit deals 1 damage to both.</li>
          <li><b>Preview:</b> tap a green cell or a red target. The ghost beam, the arrows and the list show the new tilt, every slide and every fall. Tap again or press Confirm.</li>
          <li><b>Enemies</b> use the same rules. They walk toward you, and that tips the beam toward your side. Watch the meter.</li>
          <li><b>Beams:</b> 🪵 plank, ⛩️ two pivots (only tilts past the outer pivot), 🧊 ice (slides +1), 🪢 rope swing (sway ±1 flips each turn).</li>
          <li>Keys: <kbd>1</kbd>–<kbd>4</kbd> select, <kbd>Tab</kbd> next unit, <kbd>←</kbd><kbd>→</kbd> pick a target, <kbd>Enter</kbd> confirm, <kbd>B</kbd> brace, <kbd>Q</kbd><kbd>W</kbd> skills, <kbd>U</kbd> undo, <kbd>E</kbd> end turn, <kbd>Esc</kbd> cancel.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It counts as a loss.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="to-title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Battle view ----------

  private battleView(): string {
    return `<div class="battle">
      <div id="meter" class="meter">${this.meterView()}</div>
      <div id="board-holder" class="board-holder">${this.boardSvg()}</div>
      <div id="panel" class="panel">${this.panelView()}</div>
      <div id="roster" class="roster">${this.rosterView()}</div>
    </div>`;
  }

  /** The preview of the pending or hovered action. */
  private previewRes(): Result | null {
    const a = this.pending ?? this.hover;
    if (!a || !this.b || this.busy) return null;
    return apply(this.b, a);
  }

  private meterView(): string {
    const b = this.b!;
    const t = this.view ? Math.round(this.view.angle / DEG) : tiltOf(b);
    const pv = this.previewRes();
    const pt = pv ? tiltOf(pv.b) : null;
    const cells: string[] = [];
    for (let i = -LIMIT; i <= LIMIT; i++) {
      const a = Math.abs(i);
      const zone = a === LIMIT ? 'limit' : a >= 2 ? 'slide' : a === 1 ? 'lean' : 'level';
      cells.push(`<span class="mc ${zone} ${i === t ? 'cur' : ''} ${pt !== null && i === pt && pt !== t ? 'pv' : ''}">${a === LIMIT ? '☠' : i > 0 ? `+${i}` : i}</span>`);
    }
    const { m, pivot } = momentInfo(b);
    const sway = b.sway ? ` · sway ${b.sway > 0 ? '+1 ▶' : '◀ −1'}` : '';
    const piv = b.pivots.length > 1 ? (pivot === null ? ' (between pivots)' : ` (pivot ${pivot > 0 ? '+' : ''}${pivot})`) : '';
    const pct = ((t + LIMIT) / (2 * LIMIT)) * 100;
    const ppct = pt !== null ? ((pt + LIMIT) / (2 * LIMIT)) * 100 : null;
    const change = pt !== null && pt !== t ? ` → <b class="pvt">${pt > 0 ? '+' : ''}${pt}</b>` : '';
    return `<div class="mcells">${cells.join('')}
        <i class="needle" style="left:calc(${pct}% * 8 / 9 + 100% / 18)"></i>
        ${ppct !== null && pt !== t ? `<i class="needle ghost" style="left:calc(${ppct}% * 8 / 9 + 100% / 18)"></i>` : ''}
      </div>
      <div class="mtext">Tilt <b>${t > 0 ? '+' : ''}${t}</b>${change}${this.view ? '' : ` · moment ${m > 0 ? '+' : ''}${m}${piv} ÷ ${b.step}${sway}`} · limit ±${LIMIT}</div>`;
  }

  /** Current view: either the animation view or the battle state. */
  private curView(): View {
    if (this.view) return this.view;
    const b = this.b!;
    return { angle: tiltOf(b) * DEG, units: b.units.map((u) => ({ u, x: u.x, drop: 0, fade: 0 })) };
  }

  private geom(b: Battle) {
    const W = (2 * b.R + 1) * CELL + 2 * PAD;
    const cx = W / 2;
    return { W, cx };
  }

  /** Beam-local point → SVG point. */
  private pt(b: Battle, angle: number, cell: number, up: number): { x: number; y: number } {
    const { cx } = this.geom(b);
    const piv = this.pivotFor(b, angle);
    const rad = (angle * Math.PI) / 180;
    const lx = (cell - piv) * CELL;
    const ly = -up;
    const x = cx + piv * CELL + lx * Math.cos(rad) - ly * Math.sin(rad);
    const y = PIVOT_Y + lx * Math.sin(rad) + ly * Math.cos(rad);
    return { x, y };
  }

  private pivotFor(b: Battle, angle: number): number {
    if (b.pivots.length === 1) return b.pivots[0];
    if (angle > 0.01) return b.pivots[b.pivots.length - 1];
    if (angle < -0.01) return b.pivots[0];
    return 0;
  }

  private boardSvg(): string {
    const b = this.b!;
    const v = this.curView();
    const { W, cx } = this.geom(b);
    const ang = v.angle;
    const piv = this.pivotFor(b, ang);
    const R = b.R;
    const pvx = cx + piv * CELL;
    const parts: string[] = [];
    // Pit.
    parts.push(`<rect x="0" y="${VIEW_H - 46}" width="${W}" height="46" fill="url(#pit)"/>`);
    let spikes = '';
    for (let x = 0; x < W; x += 22) spikes += `${x},${VIEW_H} ${x + 11},${VIEW_H - 16} ${x + 22},${VIEW_H} `;
    parts.push(`<polyline points="${spikes}" class="spikes"/>`);
    // Supports.
    const beam = BEAMS[b.beam];
    if (beam.rope) {
      parts.push(`<line x1="${cx}" y1="0" x2="${cx}" y2="${PIVOT_Y}" class="rope"/>`);
    } else {
      for (const p of b.pivots) {
        const px = cx + p * CELL;
        parts.push(`<polygon points="${px},${PIVOT_Y + 6} ${px - 26},${VIEW_H - 30} ${px + 26},${VIEW_H - 30}" class="stand ${p === piv && ang !== 0 ? 'active' : ''}"/>`);
      }
    }
    // Preview data.
    const pv = this.previewRes();
    const pvB = pv?.b;
    const pvAng = pvB ? tiltOf(pvB) * DEG : null;
    // Beam group (rotates).
    const half = (R + 0.5) * CELL;
    const g: string[] = [];
    g.push(`<rect x="${cx - half}" y="${PIVOT_Y}" width="${2 * half}" height="14" rx="4" class="plank ${b.ice ? 'ice' : ''}"/>`);
    for (let x = -R; x <= R; x++) {
      const gx = cx + x * CELL;
      g.push(`<line x1="${gx - CELL / 2}" y1="${PIVOT_Y}" x2="${gx - CELL / 2}" y2="${PIVOT_Y + 14}" class="seam"/>`);
    }
    // Cell highlights.
    const hl = this.highlights();
    for (let x = -R; x <= R; x++) {
      const gx = cx + x * CELL;
      const cls = hl.cells.get(x);
      if (cls) g.push(`<rect x="${gx - CELL / 2 + 3}" y="${PIVOT_Y - 6}" width="${CELL - 6}" height="8" rx="3" class="hl ${cls}"/>`);
    }
    // Edge marks.
    g.push(`<text x="${cx - half - 4}" y="${PIVOT_Y + 32}" class="edge" text-anchor="middle">◀</text>`);
    g.push(`<text x="${cx + half + 4}" y="${PIVOT_Y + 32}" class="edge" text-anchor="middle">▶</text>`);
    // Hit areas (rotate with the beam).
    for (let x = -R; x <= R; x++) {
      const gx = cx + x * CELL;
      g.push(`<rect x="${gx - CELL / 2}" y="${PIVOT_Y - 120}" width="${CELL}" height="150" class="hit" data-cell="${x}"/>`);
    }
    parts.push(`<g transform="rotate(${ang.toFixed(2)} ${pvx} ${PIVOT_Y})">${g.join('')}</g>`);
    // Ghost beam.
    if (pvB && pvAng !== null && pvAng !== ang) {
      const gp = cx + this.pivotFor(b, pvAng) * CELL;
      parts.push(`<g transform="rotate(${pvAng} ${gp} ${PIVOT_Y})"><rect x="${cx - half}" y="${PIVOT_Y}" width="${2 * half}" height="14" rx="4" class="ghost-plank"/></g>`);
    }
    // Units.
    const pvMap = new Map<number, number>();
    if (pvB) for (const u of pvB.units) pvMap.set(u.id, u.x);
    for (const vu of v.units) {
      const u = vu.u;
      const p = this.pt(b, ang, vu.x, UR + 1);
      const dropY = vu.drop * 240;
      const dropX = vu.drop * 30 * Math.sign(ang || 1);
      const op = 1 - vu.fade;
      const team = u.team;
      const k = KINDS[u.kind];
      const isSel = u.id === this.sel;
      const tgt = hl.units.get(u.id);
      const done = team === 'ally' && u.acted;
      const cls = `unit ${team} ${isSel ? 'sel' : ''} ${tgt ?? ''} ${done ? 'done' : ''} ${u.id === this.actor ? 'actor' : ''} ${u.id === this.inspect ? 'insp' : ''}`;
      const hpw = 40;
      const hpf = Math.max(0, u.hp) / u.max;
      const wt = weight(u);
      parts.push(`<g class="${cls}" transform="translate(${(p.x + dropX).toFixed(1)} ${(p.y + dropY).toFixed(1)})" opacity="${op.toFixed(2)}">
        <circle r="${UR}" class="body"/>
        ${u.braced ? `<circle r="${UR + 4}" class="brace-ring"/>` : ''}
        <text class="emoji" y="10" text-anchor="middle">${k.icon}</text>
        <rect x="${-hpw / 2}" y="${UR + 1}" width="${hpw}" height="5" class="hpbg"/>
        <rect x="${-hpw / 2}" y="${UR + 1}" width="${(hpw * hpf).toFixed(1)}" height="5" class="hpfg ${team}"/>
        <g transform="translate(${UR - 4} ${-UR + 4})"><circle r="13" class="wbadge ${wt < 0 ? 'neg' : ''}"/><text y="6" text-anchor="middle" class="wtext">${wt}</text></g>
        ${done ? `<text x="${-UR + 4}" y="${-UR + 10}" class="zz">✓</text>` : ''}
      </g>`);
    }
    // Preview overlay: arrows, ghosts, falls, damage.
    if (pv && pvB) {
      const fell = new Set(pv.evs.filter((e) => e.k === 'fall').map((e) => e.id));
      const died = new Set(pv.evs.filter((e) => e.k === 'die').map((e) => e.id));
      const dmg = new Map<number, number>();
      for (const e of pv.evs) if (e.k === 'dmg') dmg.set(e.id, (dmg.get(e.id) ?? 0) + e.n);
      for (const u of b.units) {
        const k = KINDS[u.kind];
        const from = this.pt(b, ang, u.x, UR + 1);
        if (fell.has(u.id)) {
          const lastX = this.lastPos(pv, u.id);
          const side = lastX > 0 ? 1 : -1;
          const fx = cx + side * (half + 18);
          parts.push(`<line x1="${from.x}" y1="${from.y}" x2="${fx}" y2="${VIEW_H - 40}" class="arrow fall"/>`);
          parts.push(`<text x="${fx}" y="${VIEW_H - 36}" class="skull" text-anchor="middle">☠${k.icon}</text>`);
        } else if (pvMap.has(u.id) && pvMap.get(u.id) !== u.x && pvAng !== null) {
          const to = this.pt(b, pvAng, pvMap.get(u.id)!, UR + 1);
          parts.push(`<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="arrow"/>`);
          parts.push(`<g transform="translate(${to.x} ${to.y})" class="ghost"><circle r="${UR}"/><text class="emoji" y="10" text-anchor="middle">${k.icon}</text></g>`);
        }
        const d = dmg.get(u.id);
        if (d) parts.push(`<text x="${from.x}" y="${from.y - UR - 8}" class="pdmg" text-anchor="middle">−${d}${died.has(u.id) ? ' ☠' : ''}</text>`);
      }
      for (const e of pv.evs) {
        if (e.k !== 'spawn') continue;
        const to = this.pt(b, pvAng ?? ang, e.x, UR + 1);
        parts.push(`<g transform="translate(${to.x} ${to.y})" class="ghost"><circle r="${UR}"/><text class="emoji" y="10" text-anchor="middle">🪨</text></g>`);
      }
    }
    // Floats.
    const now = performance.now();
    for (const f of this.floats) {
      const age = (now - f.t0) / 1000;
      parts.push(`<text x="${f.x}" y="${(f.y - age * 40).toFixed(1)}" class="float ${f.cls}" text-anchor="middle" opacity="${Math.max(0, 1 - age / 1.1).toFixed(2)}">${f.text}</text>`);
    }
    return `<svg id="board" viewBox="0 0 ${W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="pit" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#05080d" stop-opacity="0"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
      ${parts.join('')}
    </svg>`;
  }

  private lastPos(r: Result, id: number): number {
    for (let i = r.frames.length - 1; i >= 0; i--) if (id in r.frames[i].pos) return r.frames[i].pos[id];
    return 0;
  }

  /** Cells and units to highlight for the selected unit and mode. */
  private highlights(): { cells: Map<number, string>; units: Map<number, string> } {
    const cells = new Map<number, string>();
    const units = new Map<number, string>();
    const b = this.b!;
    if (this.busy || b.over) return { cells, units };
    const u = this.sel !== null ? unitById(b, this.sel) : undefined;
    if (!u) return { cells, units };
    if (this.mode === 'auto') {
      for (const x of reach(b, u)) cells.set(x, 'walk');
      for (const o of attackTargets(b, u)) units.set(o.id, 'target');
    } else {
      const s = this.mode;
      for (const t of skillTargets(b, u, s)) {
        if (cellSkill(s)) cells.set(t, 'skill');
        else units.set(t, 'starget');
      }
    }
    const pa = this.pending;
    if (pa) {
      if (pa.t === 'move') cells.set(pa.to, 'pend');
      if (pa.t === 'skill' && cellSkill(pa.s)) cells.set(pa.tg, 'pend');
      if ((pa.t === 'attack' || (pa.t === 'skill' && !cellSkill(pa.s))) && pa.tg !== u.id) units.set(pa.tg, 'pend');
    }
    return { cells, units };
  }

  private unitLine(u: Unit): string {
    const k = KINDS[u.kind];
    const sa = slideAt(u);
    const slide = u.float ? 'never slides (floats)' : u.braced ? 'braced: no slide' : sa >= LIMIT ? 'slides only at the limit' : `slides at tilt ${sa}`;
    const skills = u.skills.map((s) => `${SKILLS[s].icon} ${SKILLS[s].name}`).join(', ');
    return `<div class="uline"><b>${k.icon} ${k.name}</b>
      <span>⚖️ ${weight(u)}${u.ballast ? ' (ballast)' : ''}${u.grow ? ` (+${u.grow}/hit)` : ''}</span>
      <span>❤️ ${u.hp}/${u.max}</span>
      <span>✊ grip ${u.grip} · ${slide}</span>
      <span>👣 ${u.move}</span>
      ${u.atk ? `<span>⚔️ ${u.atk}${u.range > 1 ? ` (range ${u.range})` : ''}${u.knock ? ` · knock ${u.knock}` : ''}</span>` : ''}
      ${skills ? `<span>${skills}</span>` : ''}
    </div>`;
  }

  private panelView(): string {
    const b = this.b!;
    if (b.over) return `<div class="hint">${b.over === 'win' ? '🏆 Victory!' : '💀 Defeat'}</div>`;
    if (this.busy) return `<div class="hint">Enemy turn…</div>`;
    const u = this.sel !== null ? unitById(b, this.sel) : undefined;
    const ins = this.inspect !== null ? unitById(b, this.inspect) : undefined;
    let html = '';
    if (u) {
      html += this.unitLine(u);
      const btn = (mode: string, label: string, enabled: boolean, key: string) =>
        `<button class="mode ${this.mode === mode ? 'on' : ''}" data-act="mode" data-mode="${mode}" ${enabled ? '' : 'disabled'}>${label}<kbd>${key}</kbd></button>`;
      const canMove = reach(b, u).length > 0;
      const canAtk = attackTargets(b, u).length > 0;
      html += `<div class="modes">
        ${btn('auto', `${canMove ? '👣 Walk' : ''}${canMove && canAtk ? ' / ' : ''}${canAtk || !canMove ? '⚔️ Attack' : ''}`, !u.acted, 'A')}
        ${u.skills.map((s, i) => btn(s, `${SKILLS[s].icon} ${SKILLS[s].name}`, !u.acted && skillTargets(b, u, s).length > 0, i ? 'W' : 'Q')).join('')}
        <button class="mode" data-act="brace" ${canBrace(u) ? '' : 'disabled'} title="${u.tired ? 'Braced last turn: cannot brace again now' : 'No slides until your next turn'}">🧷 Brace<kbd>B</kbd></button>
      </div>`;
      if (this.mode !== 'auto') html += `<div class="muted small">${SKILLS[this.mode].text}</div>`;
    } else if (!ins) {
      html += `<div class="hint">Tap one of your units to act. Tap an enemy to see its stats.</div>`;
    }
    if (ins && ins.id !== u?.id) html += this.unitLine(ins);
    const pv = this.previewRes();
    if (pv) html += `<div class="preview">${this.previewText(pv)}</div>`;
    else if (b.sway) html += `<div class="preview"><span>🪢 End turn flips the sway:</span>${this.previewText(endPlayerTurn(b))}</div>`;
    const canConfirm = !!this.pending;
    html += `<div class="actions">
      <button data-act="undo" ${this.history.length ? '' : 'disabled'}>↶ Undo</button>
      ${canConfirm ? '<button data-act="cancel">Cancel</button><button class="primary" data-act="confirm">Confirm</button>' : ''}
      <span class="grow"></span>
      <button class="${canConfirm ? '' : 'primary'}" data-act="end-turn">End turn<kbd>E</kbd></button>
    </div>`;
    return html;
  }

  private previewText(pv: Result): string {
    const b = this.b!;
    const lines: string[] = [];
    const t0 = tiltOf(b);
    const t1 = tiltOf(pv.b);
    const name = (id: number) => {
      const u = unitById(b, id) ?? unitById(pv.b, id);
      return u ? `${KINDS[u.kind].icon} ${KINDS[u.kind].name}` : '?';
    };
    lines.push(`<span class="${Math.abs(t1) >= LIMIT ? 'bad' : ''}">Tilt ${t0 > 0 ? '+' : ''}${t0} → <b>${t1 > 0 ? '+' : ''}${t1}</b></span>`);
    const dmg = new Map<number, number>();
    const slid = new Map<number, number>();
    for (const e of pv.evs) {
      if (e.k === 'dmg') dmg.set(e.id, (dmg.get(e.id) ?? 0) + e.n);
      if (e.k === 'slide') slid.set(e.id, (slid.get(e.id) ?? 0) + Math.abs(e.to - e.from));
    }
    for (const [id, n] of dmg) lines.push(`${name(id)} −${n}`);
    for (const e of pv.evs) {
      if (e.k === 'fall') {
        const u = unitById(b, e.id);
        lines.push(`<span class="${u?.team === 'ally' ? 'bad' : 'good'}">${name(e.id)} falls!</span>`);
      } else if (e.k === 'die') {
        const u = unitById(b, e.id);
        lines.push(`<span class="${u?.team === 'ally' ? 'bad' : 'good'}">${name(e.id)} is defeated</span>`);
      } else if (e.k === 'hang') lines.push(`${name(e.id)} hangs on (rope)`);
      else if (e.k === 'spawn') lines.push('🪨 Boulder drops');
    }
    for (const [id, n] of slid) if (!pv.evs.some((e) => e.k === 'fall' && e.id === id)) lines.push(`${name(id)} slides ${n}`);
    if (lines.length === 1 && t0 === t1) lines.push('<span class="muted">Nothing slides.</span>');
    return lines.map((l) => `<span>${l}</span>`).join('');
  }

  private rosterView(): string {
    const b = this.b!;
    const chip = (u: Unit, i: number) => {
      const k = KINDS[u.kind];
      return `<button class="rchip ${u.team} ${u.id === this.sel ? 'on' : ''} ${u.acted && u.team === 'ally' ? 'done' : ''}" data-act="unit" data-id="${u.id}">
        ${u.team === 'ally' ? `<kbd>${i + 1}</kbd>` : ''}${k.icon}<span>${u.hp}/${u.max}</span><small>⚖️${weight(u)}</small></button>`;
    };
    const al = allies(b).sort((p, q) => p.x - q.x);
    const en = b.units.filter((u) => u.team !== 'ally').sort((p, q) => p.x - q.x);
    return `<div class="rrow">${al.map(chip).join('')}</div><div class="rrow">${en.map(chip).join('')}</div>`;
  }

  // ---------- Animation ----------

  private startLoop(): void {
    if (this.raf) return;
    const tick = () => {
      this.raf = 0;
      const now = performance.now();
      this.floats = this.floats.filter((f) => now - f.t0 < 1100);
      this.renderBoardOnly();
      if (this.floats.length || this.view) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private addFloat(b: Battle, ang: number, x: number, text: string, cls: string): void {
    if (FAST) return;
    const p = this.pt(b, ang, x, UR * 2 + 10);
    this.floats.push({ x: p.x, y: p.y, text, cls, t0: performance.now() });
  }

  /** Animate a result from `b0`. Resolves when done. */
  private async animate(b0: Battle, res: Result): Promise<void> {
    if (FAST || res.frames.length < 2) {
      this.fxSounds(res, 0, res.frames.length);
      return;
    }
    const all = new Map<number, Unit>();
    for (const u of b0.units) all.set(u.id, u);
    for (const u of res.b.units) if (!all.has(u.id)) all.set(u.id, u);
    const fellAt = new Map<number, number>();
    for (const e of res.evs) if (e.k === 'fall' || e.k === 'die') fellAt.set(e.id, e.f);
    for (let i = 0; i + 1 < res.frames.length; i++) {
      const fa = res.frames[i];
      const fb = res.frames[i + 1];
      this.fxSounds(res, i + 1, i + 2);
      if (Math.abs(fb.tilt) > Math.abs(fa.tilt)) sfx.creak(fb.tilt);
      // Floats for this segment.
      for (const e of res.evs) {
        if (e.f !== i + 1) continue;
        if (e.k === 'dmg') this.addFloat(b0, fa.tilt * DEG, e.x, `−${e.n}`, 'dmg');
        if (e.k === 'fall') this.addFloat(b0, fa.tilt * DEG, e.x, 'FALL!', 'fall');
        if (e.k === 'hang') this.addFloat(b0, fa.tilt * DEG, e.x, 'HANG ON', 'hang');
      }
      const t0 = performance.now();
      await new Promise<void>((done) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / SEG_MS);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const units: ViewUnit[] = [];
          for (const [id, u] of all) {
            const inA = id in fa.pos;
            const inB = id in fb.pos;
            if (!inA && !inB) continue;
            if (inA && inB) units.push({ u, x: fa.pos[id] + (fb.pos[id] - fa.pos[id]) * e, drop: 0, fade: 0 });
            else if (inA && !inB) {
              const fell = res.evs.some((v) => v.id === id && v.k === 'fall' && v.f === i + 1);
              units.push({ u, x: fa.pos[id] + (fell ? Math.sign(fa.pos[id] || 1) * e : 0), drop: fell ? e * e : 0, fade: fell ? e * 0.6 : e });
            } else units.push({ u, x: fb.pos[id], drop: 0, fade: 1 - e });
          }
          this.view = { angle: (fa.tilt + (fb.tilt - fa.tilt) * e) * DEG, units };
          this.renderBoardOnly();
          const tm = Math.round(this.view.angle / DEG);
          if (tm !== this.meterTilt) {
            this.meterTilt = tm;
            const el = this.root.querySelector<HTMLElement>('#meter');
            if (el) el.innerHTML = this.meterView();
          }
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
    }
    this.view = null;
    this.startLoop();
  }

  private fxSounds(res: Result, fromF: number, toF: number): void {
    const evs = res.evs.filter((e) => e.f >= fromF && e.f < toF);
    if (evs.some((e) => e.k === 'fall')) sfx.fall();
    else if (evs.some((e) => e.k === 'dmg')) sfx.hit();
    else if (evs.some((e) => e.k === 'slide')) sfx.slide();
    else if (evs.some((e) => e.k === 'brace')) sfx.brace();
    else if (evs.some((e) => e.k === 'move' || e.k === 'push')) sfx.step();
    if (evs.some((e) => e.k === 'bump')) sfx.bump();
  }

  // ---------- Input ----------

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as Element).closest<HTMLElement | SVGElement>('[data-act], [data-stop], [data-cell]');
    if (!el) return;
    const ds = (el as HTMLElement).dataset;
    if (ds.cell !== undefined) {
      this.clickCell(+ds.cell);
      return;
    }
    if (el.hasAttribute('data-stop') && !ds.act) return;
    this.action(ds.act!, ds);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || this.screen !== 'battle' || this.pending || this.busy) return;
    const el = (e.target as Element).closest<SVGElement>('[data-cell]');
    const a = el ? this.actionAt(+el.dataset.cell!) : null;
    this.setHover(a);
  }

  private setHover(a: Action | null): void {
    const same = JSON.stringify(a) === JSON.stringify(this.hover);
    if (same) return;
    this.hover = a;
    if (this.screen === 'battle') this.renderBattle();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'battle' || this.busy || !this.b || this.b.over) return;
    const k = e.key.toLowerCase();
    const u = this.sel !== null ? unitById(this.b, this.sel) : undefined;
    if (k === 'escape') {
      if (this.pending) this.pending = null;
      else if (this.mode !== 'auto') this.mode = 'auto';
      else this.sel = null;
      this.renderBattle();
    } else if (k >= '1' && k <= '4') {
      const al = allies(this.b).sort((p, q) => p.x - q.x);
      const t = al[+k - 1];
      if (t) this.select(t.id);
    } else if (k === 'tab') {
      e.preventDefault();
      const al = allies(this.b)
        .filter((x) => !x.acted)
        .sort((p, q) => p.x - q.x);
      if (!al.length) return;
      const i = al.findIndex((x) => x.id === this.sel);
      this.select(al[(i + 1) % al.length].id);
    } else if (k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault();
      const list = this.targetList();
      if (!list.length) return;
      const cur = this.pending ? list.findIndex((a) => JSON.stringify(a) === JSON.stringify(this.pending)) : -1;
      const n = k === 'arrowright' ? cur + 1 : cur <= 0 ? list.length - 1 : cur - 1;
      this.pending = list[(n + list.length) % list.length];
      sfx.select();
      this.renderBattle();
    } else if (k === 'enter' || k === ' ') {
      e.preventDefault();
      if (this.pending) void this.confirm();
    } else if (k === 'b' && u) this.action('brace', {});
    else if (k === 'a' && u) this.action('mode', { mode: 'auto' });
    else if ((k === 'q' || k === 'w') && u) {
      const s = u.skills[k === 'q' ? 0 : 1];
      if (s) this.action('mode', { mode: s });
    } else if (k === 'u' || ((e.ctrlKey || e.metaKey) && k === 'z')) this.action('undo', {});
    else if (k === 'e') void this.endTurn();
  }

  /** All targets for the current mode, sorted left to right. */
  private targetList(): Action[] {
    const b = this.b!;
    const u = this.sel !== null ? unitById(b, this.sel) : undefined;
    if (!u) return [];
    const out: { x: number; a: Action }[] = [];
    for (let x = -b.R; x <= b.R; x++) {
      const a = this.actionAt(x);
      if (a) out.push({ x, a });
    }
    return out.map((o) => o.a);
  }

  /** The action that a tap on this cell means for the selected unit. */
  private actionAt(x: number): Action | null {
    const b = this.b;
    if (!b || this.sel === null) return null;
    const u = unitById(b, this.sel);
    if (!u || u.acted) return null;
    const o = unitAt(b, x);
    if (this.mode === 'auto') {
      if (!o && reach(b, u).includes(x)) return { t: 'move', id: u.id, to: x };
      if (o && attackTargets(b, u).some((t) => t.id === o.id)) return { t: 'attack', id: u.id, tg: o.id };
      return null;
    }
    const s = this.mode;
    const tg = skillTargets(b, u, s);
    if (cellSkill(s)) return tg.includes(x) ? { t: 'skill', id: u.id, s, tg: x } : null;
    if (s === 'ballast' || s === 'slam') return o && o.id === u.id ? { t: 'skill', id: u.id, s, tg: u.id } : null;
    return o && tg.includes(o.id) ? { t: 'skill', id: u.id, s, tg: o.id } : null;
  }

  private select(id: number | null): void {
    this.sel = id;
    this.mode = 'auto';
    this.pending = null;
    this.hover = null;
    if (id !== null) {
      this.inspect = null;
      sfx.select();
    }
    this.renderBattle();
  }

  private clickCell(x: number): void {
    const b = this.b;
    if (!b || this.busy || b.over) return;
    const a = this.actionAt(x);
    if (a) {
      if (this.pending && JSON.stringify(a) === JSON.stringify(this.pending)) {
        void this.confirm();
        return;
      }
      this.pending = a;
      this.hover = null;
      sfx.select();
      this.renderBattle();
      return;
    }
    const o = unitAt(b, x);
    if (o && o.team === 'ally') {
      if (o.id === this.sel) {
        this.pending = null;
        this.renderBattle();
      } else this.select(o.id);
      return;
    }
    if (o) {
      this.inspect = o.id;
      this.pending = null;
      this.renderBattle();
      return;
    }
    this.pending = null;
    this.inspect = null;
    this.renderBattle();
  }

  private async confirm(): Promise<void> {
    const b = this.b;
    const a = this.pending;
    if (!b || !a || this.busy) return;
    this.pending = null;
    this.hover = null;
    await this.doAction(a);
  }

  private async doAction(a: Action): Promise<void> {
    const b0 = this.b!;
    this.history.push(b0);
    const res = apply(b0, a);
    this.busy = true;
    this.renderBattle();
    await this.animate(b0, res);
    this.b = res.b;
    this.busy = false;
    const u = unitById(this.b, a.id);
    if (!u || u.acted) {
      this.mode = 'auto';
      const next = allies(this.b).find((x) => !x.acted);
      this.sel = u && !u.acted ? u.id : (next?.id ?? null);
    }
    this.saveBattle();
    this.renderBattle();
    if (this.b.over) await this.finishBattle();
  }

  private saveBattle(): void {
    if (!this.run || !this.b) return;
    this.run.battle = this.b;
    saveRun(this.run);
  }

  private async endTurn(): Promise<void> {
    if (!this.b || this.busy || this.b.over || this.screen !== 'battle') return;
    this.pending = null;
    this.hover = null;
    this.sel = null;
    this.inspect = null;
    this.busy = true;
    sfx.turn();
    this.renderBattle();
    const r = this.run!;
    const { steps, b: next } = enemyPhase(this.b, aiCfg(r.act));
    let cur = this.b;
    for (const st of steps) {
      const changed = st.frames.length > 1 || st.evs.length;
      const actId = this.stepActor(cur, st);
      this.actor = actId;
      if (changed && !FAST) {
        this.renderBattle();
        await sleep(160);
      }
      await this.animate(cur, st);
      cur = st.b;
      this.b = cur;
      this.renderBattle();
      if (cur.over) break;
    }
    this.actor = null;
    // The phase result also starts the next player turn.
    this.b = next;
    this.history = [];
    this.busy = false;
    const first = allies(this.b).sort((p, q) => p.x - q.x)[0];
    this.sel = first?.id ?? null;
    this.saveBattle();
    this.render();
    if (this.b.over) await this.finishBattle();
    else this.toast(`Round ${this.b.round}`);
  }

  private stepActor(b0: Battle, st: Result): number | null {
    const e = st.evs.find((v) => v.k === 'move' || v.k === 'brace');
    if (e && unitById(b0, e.id)?.team === 'enemy') return e.id;
    for (const u of enemies(st.b)) {
      const old = unitById(b0, u.id);
      if (old && !old.acted && u.acted) return u.id;
    }
    return null;
  }

  private async finishBattle(): Promise<void> {
    const r = this.run!;
    const b = this.b!;
    await sleep(500);
    const won = b.over === 'win';
    if (won) sfx.win();
    else sfx.lose();
    const ok = finishFight(r, b);
    this.b = null;
    if (!ok) {
      this.finishRun(false);
      return;
    }
    if (isBoss(r)) {
      const lastAct = r.act === ACTS.length - 1;
      if (lastAct) {
        advance(r);
        this.finishRun(true);
        return;
      }
    }
    this.screen = 'reward';
    saveRun(r);
    this.render();
    this.toast(b.round > MAX_ROUNDS ? 'The enemies give up after 30 rounds.' : `Fight won! ${b.stats.tipped ? `${b.stats.tipped} tipped off.` : ''}`);
  }

  private finishRun(won: boolean): void {
    const r = this.run!;
    const sc = score(r, won);
    this.meta.runs++;
    if (won) this.meta.wins++;
    this.meta.bestAct = Math.max(this.meta.bestAct, Math.min(r.act, 3));
    this.meta.best = Math.max(this.meta.best, sc);
    this.meta.tipped += r.tipped;
    saveMeta(this.meta);
    setMetaForOffers(this.meta);
    this.end = { won, score: sc, act: Math.min(r.act, 2), fights: r.fightsWon, tipped: r.tipped, kills: r.kills };
    this.run = null;
    clearRun();
    this.screen = 'end';
    this.modal = null;
    this.render();
  }

  private startFight(): void {
    const r = this.run!;
    this.b = r.battle ?? makeFight(r);
    r.battle = this.b;
    saveRun(r);
    this.history = [];
    this.pending = null;
    this.hover = null;
    this.mode = 'auto';
    this.inspect = null;
    this.view = null;
    const first = allies(this.b).sort((p, q) => p.x - q.x)[0];
    this.sel = first?.id ?? null;
    this.screen = 'battle';
    this.render();
    this.toast(`${BEAMS[this.b.beam].icon} ${BEAMS[this.b.beam].name}: ${BEAMS[this.b.beam].text}`);
  }

  private action(act: string, ds: DOMStringMap | Record<string, string>): void {
    const r = this.run;
    switch (act) {
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
      case 'mute': {
        const m = toggleMute();
        try {
          localStorage.setItem('scales.mute', m ? '1' : '0');
        } catch {
          /* ignore */
        }
        this.render();
        break;
      }
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        break;
      case 'abandon-yes':
        if (r) this.finishRun(false);
        break;
      case 'to-title':
        this.modal = null;
        this.screen = 'title';
        this.b = null;
        this.render();
        break;
      case 'squad':
        this.squad = ds.id!;
        sfx.select();
        this.render();
        break;
      case 'new':
        this.run = newRun(randomSeedText(), this.squad);
        saveRun(this.run);
        this.screen = 'path';
        this.render();
        break;
      case 'continue':
        if (!r) break;
        if (r.battle) this.startFight();
        else if (r.offers.length || r.teach) this.screen = 'reward';
        else this.screen = 'path';
        if (this.screen !== 'battle') this.render();
        break;
      case 'fight':
        this.startFight();
        break;
      case 'reward': {
        if (!r) break;
        const w = r.offers[+ds.i!];
        if (!w) break;
        takeReward(r, w);
        sfx.item();
        if (w.t === 'rest') sfx.heal();
        if (!r.teach) this.afterReward();
        else {
          saveRun(r);
          this.render();
        }
        break;
      }
      case 'teach':
        if (r && teach(r, +ds.i!)) {
          sfx.item();
          this.afterReward();
        }
        break;
      case 'skip-teach':
        if (r) {
          r.teach = null;
          this.afterReward();
        }
        break;
      case 'unit': {
        const id = +ds.id!;
        const u = this.b ? unitById(this.b, id) : undefined;
        if (!u || this.busy) break;
        if (u.team === 'ally') this.select(id);
        else {
          const a = this.sel !== null ? this.actionAt(u.x) : null;
          if (a) this.clickCell(u.x);
          else {
            this.inspect = id;
            this.renderBattle();
          }
        }
        break;
      }
      case 'mode': {
        if (this.busy) break;
        this.mode = ds.mode === 'auto' || this.mode === ds.mode ? 'auto' : ds.mode!;
        this.pending = null;
        this.hover = null;
        const u = this.sel !== null && this.b ? unitById(this.b, this.sel) : undefined;
        // Self skills go straight to the preview.
        if (u && (this.mode === 'ballast' || this.mode === 'slam')) this.pending = { t: 'skill', id: u.id, s: this.mode, tg: u.id };
        sfx.select();
        this.renderBattle();
        break;
      }
      case 'brace': {
        const u = this.sel !== null && this.b ? unitById(this.b, this.sel) : undefined;
        if (!u || !canBrace(u) || this.busy) break;
        const a: Action = { t: 'brace', id: u.id };
        if (this.pending && this.pending.t === 'brace') void this.confirm();
        else {
          this.pending = a;
          this.renderBattle();
        }
        break;
      }
      case 'confirm':
        void this.confirm();
        break;
      case 'cancel':
        this.pending = null;
        this.renderBattle();
        break;
      case 'undo':
        if (this.busy || !this.history.length) break;
        this.b = this.history.pop()!;
        this.pending = null;
        this.hover = null;
        this.saveBattle();
        sfx.select();
        this.renderBattle();
        break;
      case 'end-turn':
        void this.endTurn();
        break;
    }
  }

  private afterReward(): void {
    const r = this.run!;
    const won = advance(r);
    if (won) {
      this.finishRun(true);
      return;
    }
    if (r.fight === 0) this.toast(`${ACTS[r.act].icon} Act ${r.act + 1}: ${ACTS[r.act].name}. Party fully healed.`);
    saveRun(r);
    this.screen = 'path';
    this.render();
  }

  // ---------- Debug ----------

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        busy: this.busy,
        act: this.run?.act,
        fight: this.run?.fight,
        round: this.b?.round,
        tilt: this.b ? tiltOf(this.b) : null,
        party: this.run?.party.map((m) => `${m.kind} ${m.hp}/${m.max}`),
        allies: this.b ? allies(this.b).map((u) => `${u.kind}@${u.x} ${u.hp}/${u.max}`) : null,
        enemies: this.b ? enemies(this.b).map((u) => `${u.kind}@${u.x} ${u.hp}/${u.max}`) : null,
        items: this.run?.items,
        end: this.end,
      }),
      /** Start a new run with a fixed seed (for comparing with the sim). */
      start: (seed: string, squad = 'balanced') => {
        this.squad = squad;
        this.run = newRun(seed, squad);
        saveRun(this.run);
        this.screen = 'path';
        this.render();
      },
      /** Jump to a fight: act 0–2, fight 0–3 (3 = boss). */
      toFight: (act: number, fight: number) => {
        if (!this.run) this.run = newRun(randomSeedText(), this.squad);
        this.run.act = act;
        this.run.fight = fight;
        this.run.battle = null;
        this.startFight();
      },
      win: () => {
        if (!this.b) return;
        this.b = { ...this.b, over: 'win' };
        void this.finishBattle();
      },
      step: async (): Promise<string> => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        const click = (sel: string): boolean => {
          const el = this.root.querySelector<HTMLElement>(sel);
          el?.click();
          return !!el;
        };
        switch (this.screen) {
          case 'title':
            if (!click('[data-act="continue"]')) click('[data-act="new"]');
            return 'start';
          case 'path':
            click('[data-act="fight"]');
            return 'fight';
          case 'reward': {
            const r = this.run!;
            if (r.teach) {
              const t = botTeach(r);
              if (t >= 0) click(`[data-act="teach"][data-i="${t}"]`);
              else click('[data-act="skip-teach"]');
              return 'teach';
            }
            click(`[data-act="reward"][data-i="${botReward(r)}"]`);
            return 'reward';
          }
          case 'battle': {
            const b = this.b!;
            if (b.over) return 'busy';
            const plan = smartTurn(b, aiCfg(this.run!.act));
            for (const a of plan) {
              if (!this.b || this.b.over) break;
              await this.doAction(a);
            }
            if (this.b && !this.b.over && this.screen === 'battle') await this.endTurn();
            return 'turn';
          }
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}

