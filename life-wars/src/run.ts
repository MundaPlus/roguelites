/** Run state, fight flow, rewards, lab, score and save data. Pure logic, no DOM. */
import { DEFAULT_HORIZON, bestPlacement, stampsCells, type AiCtx, type Stamp } from './ai';
import { ACTS, CARDS, CARD_POOL, ENEMIES, START_TEMPLATES, TEMPLATES, TEMPLATE_POOL, UNLOCKS, enemyRule, tplSize, type EnemyDef } from './data';
import { GENS, N, boardFromString, boardToString, mask, parseRule, step, territory, type GenEvents, type SideCfg } from './engine';
import { Rng, hash } from './rng';

export const START_CORE = 30;
export const START_BUDGET = 6;
export const TURN_LIMIT = 12;
export const DRY_DMG = 3;
/** Balance knobs (the sim changes them for tests). */
export const TUNE = { eBudget: 1, eCore: 1, eTries: 1, caution: 0.6 };

export type NodeKind = 'fight' | 'choice' | 'boss';
export const ACT_NODES: NodeKind[] = ['fight', 'fight', 'choice', 'fight', 'boss'];

export type FightKind = 'tutorial' | 'fight' | 'elite' | 'boss';

export interface FightState {
  enemy: string;
  kind: FightKind;
  eCore: number;
  eMax: number;
  turn: number;
  /** Board after the enemy placed this turn's cells. */
  board: string;
  enemyNew: number[];
  bank: number;
  dealt: number;
  taken: number;
}

export type Reward = { kind: 'tpl'; id: string } | { kind: 'card'; id: string } | { kind: 'cells' } | { kind: 'heal' } | { kind: 'max' };

export interface ShopItem {
  r: Reward;
  cost: number;
  sold: boolean;
}

export interface RunState {
  v: 1;
  seed: string;
  act: number;
  node: number;
  stage: 'fight' | 'reward' | 'choice' | 'lab';
  core: number;
  maxCore: number;
  budget: number;
  spores: number;
  templates: string[];
  cards: string[];
  unlocked: string[];
  tutorial: boolean;
  fight: FightState | null;
  offer: Reward[];
  shop: ShopItem[];
  lastSpores: number;
  won: number;
  elites: number;
  bosses: number;
  dealt: number;
  turns: number;
  /** Fight counter, used for seeds. */
  fights: number;
}

export interface Meta {
  samples: number;
  unlocked: string[];
  runs: number;
  wins: number;
  best: number;
  bestAct: number;
  tutorialDone: boolean;
}

const RUN_KEY = 'life.run';
const META_KEY = 'life.meta';

export function newRun(seed: string, meta: Meta, tutorial: boolean): RunState {
  const run: RunState = {
    v: 1,
    seed,
    act: 0,
    node: 0,
    stage: 'fight',
    core: START_CORE,
    maxCore: START_CORE,
    budget: START_BUDGET,
    spores: 0,
    templates: [...START_TEMPLATES],
    cards: [],
    unlocked: [...meta.unlocked],
    tutorial,
    fight: null,
    offer: [],
    shop: [],
    lastSpores: 0,
    won: 0,
    elites: 0,
    bosses: 0,
    dealt: 0,
    turns: 0,
    fights: 0,
  };
  enterNode(run);
  return run;
}

// ---------- Side configs ----------

export function playerCfg(run: RunState): SideCfg {
  const r = parseRule('B3/S23');
  const c = run.cards;
  if (c.includes('stubborn')) r.s |= mask(6);
  if (c.includes('highlife')) r.b |= mask(6);
  if (c.includes('lone')) r.s |= mask(0);
  if (c.includes('wild')) r.b |= mask(4);
  return { b: r.b, s: r.s, armor: c.includes('thick') ? 2 : 1, dmg: c.includes('sharp') ? 2 : 1 };
}

export function enemyCfg(e: EnemyDef): SideCfg {
  const r = enemyRule(e);
  return { b: r.b, s: r.s, armor: e.armor ?? 1, dmg: e.dmg ?? 1 };
}

export const zoneExtra = (run: RunState): number => (run.cards.includes('forward') ? 1 : 0);
export const bankCap = (run: RunState): number => (run.cards.includes('bank') ? 8 : 4);

export function tplCost(run: RunState, id: string): number {
  const n = tplSize(id);
  return run.cards.includes('stencil') && n >= 4 ? n - 1 : n;
}

/** Cells the player can spend this turn. */
export const turnBudget = (run: RunState): number => run.budget + (run.fight?.bank ?? 0);

export function enemyOf(run: RunState): EnemyDef {
  return ENEMIES[run.fight!.enemy];
}

/** Enemy core HP grows a little with the act. */
function enemyCore(e: EnemyDef, act: number): number {
  return Math.round(e.core * TUNE.eCore * (1 + act * 0.1));
}

// ---------- Map ----------

export function nodeKind(run: RunState): NodeKind {
  return ACT_NODES[run.node];
}

function enterNode(run: RunState): void {
  const kind = nodeKind(run);
  if (kind === 'choice') {
    run.stage = 'choice';
    return;
  }
  const act = ACTS[run.act];
  if (kind === 'boss') return startFight(run, act.boss, 'boss');
  if (run.act === 0 && run.node === 0 && run.tutorial) return startFight(run, 'moss', 'tutorial');
  const rng = new Rng(hash(run.seed, 'fights', run.act));
  const order = rng.shuffle([...act.fights]);
  const n = run.node === 0 ? 0 : run.node === 1 ? 1 : 2;
  startFight(run, order[n], 'fight');
}

export function chooseNode(run: RunState, pick: 'elite' | 'lab'): void {
  if (run.stage !== 'choice') return;
  if (pick === 'elite') startFight(run, ACTS[run.act].elite, 'elite');
  else openLab(run);
}

export function startFight(run: RunState, enemy: string, kind: FightKind): void {
  const e = ENEMIES[enemy];
  const core = kind === 'tutorial' ? e.core : enemyCore(e, run.act);
  run.fights++;
  run.fight = { enemy, kind, eCore: core, eMax: core, turn: 0, board: boardToString(new Uint8Array(N)), enemyNew: [], bank: 0, dealt: 0, taken: 0 };
  run.stage = 'fight';
  enemyTurn(run);
}

/** Starts a new turn: the enemy places its cells (visible to the player before they place). */
export function enemyTurn(run: RunState): void {
  const f = run.fight!;
  f.turn++;
  const e = ENEMIES[f.enemy];
  const board = boardFromString(f.board);
  const rng = new Rng(hash(run.seed, 'enemy', run.fights, f.turn));
  const ctx: AiCtx = {
    board,
    side: 2,
    templates: e.templates,
    budget: Math.round(e.budget * TUNE.eBudget) + (f.kind === 'tutorial' ? 0 : Math.max(0, f.turn - TURN_LIMIT)),
    zoneExtra: 0,
    cost: tplSize,
    p: playerCfg(run),
    e: enemyCfg(e),
    coreP: run.core,
    coreE: f.eCore,
    caution: e.caution * TUNE.caution,
    horizon: DEFAULT_HORIZON,
  };
  const stamps = f.kind === 'tutorial' && f.turn <= 2 ? [] : bestPlacement(rng, ctx, Math.round(e.tries * TUNE.eTries));
  const cells = stampsCells(stamps);
  for (const c of cells) board[c] = 2;
  f.enemyNew = cells;
  f.board = boardToString(board);
}

// ---------- Turn resolution ----------

export interface TurnResult {
  /** frames[0] is the start board (with both placements). frames[g] is after generation g. */
  frames: Uint8Array[];
  events: GenEvents[];
  /** Core HP after each generation (index like frames). */
  eCore: number[];
  pCore: number[];
  heal: number;
  dry: number;
  /** Invader damage at the end of the turn: [to enemy core, to player core]. */
  inv: [number, number];
  outcome: 'win' | 'loss' | null;
}

/** Validates player stamps, then runs the generations and updates the run. */
export function resolveTurn(run: RunState, stamps: Stamp[]): TurnResult {
  const f = run.fight!;
  const e = ENEMIES[f.enemy];
  const board = boardFromString(f.board);
  let spent = 0;
  for (const s of stamps) {
    spent += s.cost;
    for (const c of s.cells) if (!board[c]) board[c] = 1;
  }
  const p = playerCfg(run);
  const q = enemyCfg(e);
  const frames: Uint8Array[] = [board.slice()];
  const events: GenEvents[] = [{ clash: [], hitE: [], hitP: [] }];
  const eCore = [f.eCore];
  const pCore = [run.core];
  let cur = board;
  let clashes = 0;
  for (let g = 1; g <= GENS; g++) {
    const next = new Uint8Array(N);
    const ev: GenEvents = { clash: [], hitE: [], hitP: [] };
    const r = step(cur, next, p, q, ev);
    clashes += ev.clash.length;
    f.eCore = Math.max(0, f.eCore - r.dmgE);
    run.core = Math.max(0, run.core - r.dmgP);
    f.dealt += r.dmgE;
    f.taken += r.dmgP;
    run.dealt += r.dmgE;
    frames.push(next);
    events.push(ev);
    eCore.push(f.eCore);
    pCore.push(run.core);
    cur = next;
    if (f.eCore <= 0 || run.core <= 0) break;
  }
  // Invaders: cells inside the other zone at the end of the turn hit that core once.
  let inv: [number, number] = [0, 0];
  if (f.eCore > 0 && run.core > 0) {
    inv = territory(cur);
    f.eCore = Math.max(0, f.eCore - inv[0] * p.dmg);
    run.core = Math.max(0, run.core - inv[1] * q.dmg);
    f.dealt += inv[0] * p.dmg;
    f.taken += inv[1] * q.dmg;
    run.dealt += inv[0] * p.dmg;
  }
  run.turns++;
  f.bank = Math.min(bankCap(run), Math.max(0, turnBudget(run) - spent));
  let heal = 0;
  let dry = 0;
  let outcome: TurnResult['outcome'] = null;
  if (run.core <= 0) outcome = 'loss';
  else if (f.eCore <= 0) outcome = 'win';
  else {
    if (run.cards.includes('regrow')) heal += 1;
    if (run.cards.includes('leech')) heal += Math.floor(clashes / 6);
    run.core = Math.min(run.maxCore, run.core + heal);
    if (f.turn > TURN_LIMIT && f.kind !== 'tutorial') {
      dry = DRY_DMG;
      run.core = Math.max(0, run.core - dry);
      if (run.core <= 0) outcome = 'loss';
    }
  }
  f.board = boardToString(cur);
  if (outcome === 'win') winFight(run);
  else if (!outcome) enemyTurn(run);
  return { frames, events, eCore, pCore, heal, dry, outcome, inv };
}

// ---------- Rewards ----------

export function sporesFor(kind: FightKind, act: number): number {
  if (kind === 'tutorial') return 6;
  if (kind === 'boss') return 30 + act * 5;
  if (kind === 'elite') return 24 + act * 4;
  return 10 + act * 3;
}

function winFight(run: RunState): void {
  const f = run.fight!;
  run.won++;
  if (f.kind === 'elite') run.elites++;
  if (f.kind === 'boss') {
    run.bosses++;
    run.core = Math.min(run.maxCore, run.core + Math.ceil(run.maxCore * 0.4));
  }
  run.lastSpores = sporesFor(f.kind, run.act);
  run.spores += run.lastSpores;
  run.stage = 'reward';
  const rng = new Rng(hash(run.seed, 'reward', run.fights));
  run.offer = makeOffer(run, rng, f.kind === 'elite' || f.kind === 'boss');
}

function tplPool(run: RunState): string[] {
  const extra = UNLOCKS.filter((u) => u.kind === 'tpl' && run.unlocked.includes(u.id)).map((u) => u.id);
  return [...TEMPLATE_POOL, ...extra].filter((t) => !run.templates.includes(t));
}

function cardPool(run: RunState): string[] {
  const extra = UNLOCKS.filter((u) => u.kind === 'card' && run.unlocked.includes(u.id)).map((u) => u.id);
  return [...CARD_POOL, ...extra].filter((c) => !run.cards.includes(c));
}

function makeOffer(run: RunState, rng: Rng, rare: boolean): Reward[] {
  const out: Reward[] = [];
  const tp = rng.shuffle(tplPool(run));
  const cp = rng.shuffle(cardPool(run));
  if (tp.length) out.push({ kind: 'tpl', id: tp[0] });
  if (cp.length) out.push({ kind: 'card', id: cp[0] });
  if (rare) out.push({ kind: 'cells' });
  else out.push(rng.pick<Reward>([{ kind: 'cells' }, { kind: 'heal' }, { kind: 'max' }]));
  if (out.length < 3 && tp.length > 1) out.push({ kind: 'tpl', id: tp[1] });
  if (out.length < 3) out.push({ kind: 'heal' });
  return out;
}

export function applyReward(run: RunState, r: Reward): void {
  switch (r.kind) {
    case 'tpl':
      if (!run.templates.includes(r.id)) run.templates.push(r.id);
      break;
    case 'card':
      if (!run.cards.includes(r.id)) run.cards.push(r.id);
      break;
    case 'cells':
      run.budget += 1;
      break;
    case 'heal':
      run.core = Math.min(run.maxCore, run.core + 10);
      break;
    case 'max':
      run.maxCore += 6;
      run.core += 6;
      break;
  }
}

export function rewardInfo(r: Reward): { icon: string; name: string; text: string } {
  switch (r.kind) {
    case 'tpl': {
      const t = TEMPLATES[r.id];
      return { icon: '▦', name: `Template: ${t.name}`, text: `${t.text} Costs ${t.shape.length} cells.` };
    }
    case 'card': {
      const c = CARDS[r.id];
      return { icon: c.icon, name: `Rule card: ${c.name}`, text: c.text };
    }
    case 'cells':
      return { icon: '➕', name: 'Fertile Soil', text: '+1 cell to place each turn.' };
    case 'heal':
      return { icon: '💚', name: 'Mend Core', text: 'Heal your core by 10.' };
    case 'max':
      return { icon: '🛡️', name: 'Thick Core', text: '+6 max core HP (and heal 6).' };
  }
}

export function takeReward(run: RunState, i: number): void {
  if (run.stage !== 'reward') return;
  const r = run.offer[i];
  if (r) applyReward(run, r);
  advance(run);
}

export function skipReward(run: RunState): void {
  if (run.stage !== 'reward') return;
  run.spores += 5;
  advance(run);
}

// ---------- Lab ----------

function openLab(run: RunState): void {
  const rng = new Rng(hash(run.seed, 'lab', run.act));
  const tp = rng.shuffle(tplPool(run));
  const cp = rng.shuffle(cardPool(run));
  const shop: ShopItem[] = [];
  tp.slice(0, 2).forEach((id) => shop.push({ r: { kind: 'tpl', id }, cost: 14 + tplSize(id), sold: false }));
  cp.slice(0, 2).forEach((id) => shop.push({ r: { kind: 'card', id }, cost: 30, sold: false }));
  shop.push({ r: { kind: 'heal' }, cost: 12, sold: false });
  shop.push({ r: { kind: 'cells' }, cost: 40, sold: false });
  run.shop = shop;
  run.stage = 'lab';
  // Resting in the lab also heals a bit.
  run.core = Math.min(run.maxCore, run.core + 6);
}

export function buy(run: RunState, i: number): boolean {
  const it = run.shop[i];
  if (!it || it.sold || run.spores < it.cost || run.stage !== 'lab') return false;
  run.spores -= it.cost;
  it.sold = true;
  applyReward(run, it.r);
  return true;
}

export function leaveLab(run: RunState): void {
  if (run.stage === 'lab') advance(run);
}

/** Moves to the next map node. Returns true when the run is won. */
export function advance(run: RunState): boolean {
  run.fight = null;
  run.offer = [];
  run.shop = [];
  run.node++;
  if (run.node >= ACT_NODES.length) {
    run.node = 0;
    run.act++;
    if (run.act >= ACTS.length) return true;
  }
  enterNode(run);
  return false;
}

export const isRunWon = (run: RunState): boolean => run.act >= ACTS.length;

// ---------- Score and saves ----------

export function score(run: RunState, victory: boolean): number {
  return run.won * 100 + run.elites * 150 + run.bosses * 300 + run.dealt * 2 + (victory ? 1000 + run.core * 10 : 0);
}

export const samplesFor = (s: number): number => Math.floor(s / 60);

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(RUN_KEY);
    if (!s) return null;
    const r = JSON.parse(s) as RunState;
    return r && r.v === 1 && r.act < ACTS.length ? r : null;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function loadMeta(): Meta {
  const base: Meta = { samples: 0, unlocked: [], runs: 0, wins: 0, best: 0, bestAct: 0, tutorialDone: false };
  try {
    const s = localStorage.getItem(META_KEY);
    if (s) return { ...base, ...(JSON.parse(s) as Partial<Meta>) };
  } catch {
    /* ignore */
  }
  return base;
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}
