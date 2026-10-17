/** Run state: map, encounters, rewards, scribe shop, rest, score and save data. */
import {
  ENEMIES,
  FIGHTERS,
  PERKS,
  UNLOCKS,
  UPGRADES,
  clausePool,
  type ClauseId,
  type EnemyDef,
  type Intent,
  type PerkId,
  type UpgradeId,
} from './data';
import { makeDraft, type Draft } from './draft';
import { foeIntent, newFight, type Fight, type Stats } from './engine';
import { Rng, hash } from './rng';

export type NodeKind = 'fight' | 'elite' | 'scribe' | 'rest' | 'boss';
export type Stage = 'map' | 'draft' | 'fight' | 'reward' | 'shop' | 'rest';

export type Reward = { k: 'card'; id: ClauseId } | { k: 'up'; id: UpgradeId } | { k: 'perk'; id: PerkId } | { k: 'heal'; n: number };

export interface ShopItem {
  r: Reward;
  cost: number;
  sold: boolean;
}

export interface Encounter {
  kind: 'fight' | 'elite' | 'boss';
  def: EnemyDef;
  foe: Stats;
}

export interface RunState {
  v: 1;
  seed: string;
  fighter: string;
  act: number;
  /** Index of the next map row to choose. Row 6 is the boss. */
  row: number;
  map: NodeKind[][];
  path: number[];
  hp: number;
  max: number;
  atk: number;
  grd: number;
  pow: number;
  cd: number;
  gold: number;
  pool: ClauseId[];
  perks: PerkId[];
  unlocked: string[];
  stage: Stage;
  enc: Encounter | null;
  draft: Draft | null;
  fight: Fight | null;
  fintent: Intent | null;
  rewards: Reward[];
  shop: ShopItem[];
  won: number;
  elites: number;
  bosses: number;
  goldEarned: number;
  picks: number;
  burns: number;
}

export interface Meta {
  ink: number;
  unlocked: string[];
  runs: number;
  wins: number;
  best: number;
  bestAct: number;
  fighter: string;
}

const RUN_KEY = 'clause.run';
const META_KEY = 'clause.meta';
export const ACTS = 3;
export const ROWS = 7;
export const NODE_INFO: Record<NodeKind, { icon: string; name: string; text: string }> = {
  fight: { icon: '⚔️', name: 'Fight', text: 'Draft, then duel a foe.' },
  elite: { icon: '💀', name: 'Elite', text: 'A hard foe. It picks first. Better loot.' },
  scribe: { icon: '🪶', name: 'Scribe', text: 'Shop: clause cards, perks, upgrades.' },
  rest: { icon: '🔥', name: 'Rest', text: 'Heal 40% or train.' },
  boss: { icon: '👑', name: 'Boss', text: 'Picks first. One sealed clause.' },
};

export function fighterDef(id: string) {
  return FIGHTERS.find((f) => f.id === id) ?? FIGHTERS[0];
}

export function newRun(seed: string, meta: Meta, fighter: string): RunState {
  const f = fighterDef(fighter);
  const run: RunState = {
    v: 1,
    seed,
    fighter: f.id,
    act: 1,
    row: 0,
    map: [],
    path: [],
    hp: f.hp,
    max: f.hp,
    atk: f.atk,
    grd: f.grd,
    pow: f.pow,
    cd: f.cd,
    gold: 0,
    pool: [],
    perks: [],
    unlocked: [...meta.unlocked],
    stage: 'map',
    enc: null,
    draft: null,
    fight: null,
    fintent: null,
    rewards: [],
    shop: [],
    won: 0,
    elites: 0,
    bosses: 0,
    goldEarned: 0,
    picks: 0,
    burns: 0,
  };
  // Two starting cards for the pool.
  const rng = new Rng(hash(seed, 'start'));
  run.pool = rng.shuffle(clausePool(run.unlocked).filter((id) => id !== 'gag')).slice(0, 2);
  genAct(run);
  return run;
}

export function genAct(run: RunState): void {
  const rng = new Rng(hash(run.seed, 'map', run.act));
  const two = (a: NodeKind, b: NodeKind): NodeKind[] => rng.shuffle([a, b]);
  run.map = [
    ['fight', 'fight'],
    two('fight', rng.pick(['scribe', 'rest'] as NodeKind[])),
    two('elite', 'fight'),
    two('rest', 'scribe'),
    two('fight', rng.pick(['elite', 'scribe'] as NodeKind[])),
    two('rest', rng.pick(['scribe', 'fight'] as NodeKind[])),
    ['boss'],
  ];
  run.row = 0;
  run.path = [];
}

export function playerStats(run: RunState): Stats {
  const f = fighterDef(run.fighter);
  return { name: f.name, icon: f.icon, hp: run.hp, max: run.max, atk: run.atk, grd: run.grd, spc: f.spc, pow: run.pow, cd: run.cd };
}

function foeStats(def: EnemyDef, row: number): Stats {
  const hp = def.hp + Math.floor(row / 2) * 2;
  return { name: def.name, icon: def.icon, hp, max: hp, atk: def.atk, grd: def.grd, spc: def.spc, pow: def.pow, cd: def.cd };
}

export function encSeed(run: RunState): number {
  return hash(run.seed, 'enc', run.act, run.row);
}

/** Choose a node of the current row. */
export function chooseNode(run: RunState, i: number): void {
  const kind = run.map[run.row][i];
  if (!kind) return;
  run.path.push(i);
  const rng = new Rng(hash(run.seed, 'node', run.act, run.row));
  const A = ENEMIES[run.act - 1];
  if (kind === 'scribe') {
    run.shop = makeShop(run, rng);
    run.stage = 'shop';
    return;
  }
  if (kind === 'rest') {
    run.rewards = upgradeChoices(rng, 2);
    run.stage = 'rest';
    return;
  }
  const def = kind === 'boss' ? A.boss : kind === 'elite' ? rng.pick(A.elite) : rng.pick(A.normal);
  run.enc = { kind, def, foe: foeStats(def, run.row) };
  run.draft = makeDraft(rng, clausePool(run.unlocked), run.pool, def, kind !== 'fight', {
    fourth: run.perks.includes('fourth'),
    extra: run.perks.includes('extra'),
  });
  run.stage = 'draft';
}

export function startFight(run: RunState): void {
  run.fight = newFight(playerStats(run), run.enc!.foe, run.draft!.active);
  run.fintent = rollIntent(run);
  run.stage = 'fight';
}

export function rollIntent(run: RunState): Intent {
  const F = run.fight!;
  return foeIntent(F, run.enc!.def.style, new Rng(hash(run.seed, 'fi', run.act, run.row, F.round)));
}

/** Call when the fight is over and you won. Returns true when the run is won. */
export function winFight(run: RunState): boolean {
  const F = run.fight!;
  const kind = run.enc!.kind;
  run.hp = Math.max(1, Math.min(run.max, F.f[0].hp));
  run.won++;
  const gold = kind === 'boss' ? 45 : kind === 'elite' ? 30 : 14 + run.act * 2;
  run.gold += gold;
  run.goldEarned += gold;
  const rng = new Rng(hash(run.seed, 'loot', run.act, run.row));
  if (kind === 'elite') run.elites++;
  if (kind === 'boss') {
    run.bosses++;
    if (run.act >= ACTS) return true;
  }
  run.rewards = rewardChoices(run, rng, kind !== 'fight');
  run.stage = 'reward';
  return false;
}

function cardChoices(run: RunState, rng: Rng, n: number): Reward[] {
  const pool = rng.shuffle(clausePool(run.unlocked).filter((id) => !run.pool.includes(id)));
  return pool.slice(0, n).map((id) => ({ k: 'card', id }));
}

function upgradeChoices(rng: Rng, n: number): Reward[] {
  return rng.shuffle(Object.keys(UPGRADES) as UpgradeId[]).slice(0, n).map((id) => ({ k: 'up', id }));
}

function rewardChoices(run: RunState, rng: Rng, big: boolean): Reward[] {
  const out = [...cardChoices(run, rng, 2), ...upgradeChoices(rng, 1)];
  if (big) {
    const perk = rng.shuffle((Object.keys(PERKS) as PerkId[]).filter((p) => !run.perks.includes(p)))[0];
    if (perk) out.push({ k: 'perk', id: perk });
  }
  return out;
}

function makeShop(run: RunState, rng: Rng): ShopItem[] {
  const items: ShopItem[] = cardChoices(run, rng, 3).map((r) => ({ r, cost: 22, sold: false }));
  items.push(...upgradeChoices(rng, 1).map((r) => ({ r, cost: 40, sold: false })));
  const perk = rng.shuffle((Object.keys(PERKS) as PerkId[]).filter((p) => !run.perks.includes(p)))[0];
  if (perk) items.push({ r: { k: 'perk', id: perk }, cost: PERKS[perk].cost, sold: false });
  items.push({ r: { k: 'heal', n: 10 }, cost: 20, sold: false });
  return items;
}

export function applyReward(run: RunState, r: Reward): void {
  switch (r.k) {
    case 'card':
      if (!run.pool.includes(r.id)) run.pool.push(r.id);
      break;
    case 'perk':
      if (!run.perks.includes(r.id)) run.perks.push(r.id);
      break;
    case 'heal':
      run.hp = Math.min(run.max, run.hp + r.n);
      break;
    case 'up':
      switch (r.id) {
        case 'vit':
          run.max += 6;
          run.hp += 6;
          break;
        case 'str':
          run.atk += 1;
          break;
        case 'stance':
          run.grd += 2;
          break;
        case 'mastery':
          run.pow += fighterDef(run.fighter).spc === 'mend' ? 3 : 2;
          break;
        case 'drill':
          run.cd = Math.max(2, run.cd - 1);
          break;
      }
      break;
  }
}

export function takeReward(run: RunState, i: number): void {
  const r = run.rewards[i];
  if (r) applyReward(run, r);
  else {
    run.gold += 6;
    run.goldEarned += 6;
  }
  advance(run);
}

export function buy(run: RunState, i: number): boolean {
  const it = run.shop[i];
  if (!it || it.sold || run.gold < it.cost) return false;
  if (it.r.k === 'heal' && run.hp >= run.max) return false;
  run.gold -= it.cost;
  it.sold = it.r.k !== 'heal';
  applyReward(run, it.r);
  return true;
}

export function restHeal(run: RunState): void {
  run.hp = Math.min(run.max, run.hp + Math.ceil(run.max * 0.4));
  advance(run);
}

export function restTrain(run: RunState, i: number): void {
  applyReward(run, run.rewards[i]);
  advance(run);
}

/** Go to the next map row, or to the next act after a boss. */
export function advance(run: RunState): void {
  run.enc = null;
  run.draft = null;
  run.fight = null;
  run.fintent = null;
  run.rewards = [];
  run.shop = [];
  run.row++;
  if (run.row >= ROWS) {
    run.act++;
    run.hp = Math.min(run.max, run.hp + Math.ceil(run.max * 0.5));
    genAct(run);
  }
  run.stage = 'map';
}

export function score(run: RunState, victory: boolean): number {
  return run.won * 20 + run.elites * 30 + run.bosses * 100 + Math.floor(run.goldEarned / 2) + (victory ? 500 + run.hp * 5 : 0);
}

export const inkFor = (s: number): number => Math.max(1, Math.floor(s / 120));

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.v !== 1 || !Array.isArray(run.map)) return null;
    if ((run.stage === 'draft' || run.stage === 'fight') && (!run.enc || !run.draft)) return null;
    if (run.stage === 'fight' && (!run.fight || !run.fintent)) return null;
    return run;
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
  const base: Meta = { ink: 0, unlocked: [], runs: 0, wins: 0, best: 0, bestAct: 0, fighter: 'duelist' };
  try {
    const m = { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
    m.unlocked = (m.unlocked ?? []).filter((id) => UNLOCKS.some((u) => u.id === id));
    return m;
  } catch {
    return base;
  }
}

export function saveMeta(meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* storage can be blocked */
  }
}
