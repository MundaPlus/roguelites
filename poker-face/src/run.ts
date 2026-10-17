/** Run state, the duel ladder, rewards, score and save data. */
import { DUELS_PER_HALL, HALLS, MOVES, MOVE_IDS, RELICS, RELIC_IDS, START_MOVES } from './data';
import { newDuel, type Duel, type Player, type RoundLog } from './duel';
import { Rng, hash } from './rng';

export const START_HP = 40;
/** Enemy HP multiplier (tuned with the sim). */
export const HP_MULT = 1;
/** HP you get back after each won duel. */
export const REST_HEAL = 4;
export const HEAL_PICK = 14;

export type Offer = { kind: 'move'; id: string } | { kind: 'relic'; id: string } | { kind: 'heal'; n: number };

export interface Reward {
  offers: Offer[];
  champion: boolean;
  picked: boolean;
}

export interface RunStats {
  rounds: number;
  bluffWins: number;
  truthWins: number;
  duels: number;
}

export interface RunState {
  v: 1;
  seed: string;
  player: Player;
  hall: number;
  /** Index in the hall: 0..DUELS_PER_HALL-1 are regular duels, DUELS_PER_HALL is the champion. */
  idx: number;
  lineup: string[][];
  duel: Duel | null;
  reward: Reward | null;
  stats: RunStats;
  movePool: string[];
  relicPool: string[];
}

export interface Meta {
  shards: number;
  unlocked: string[];
  runs: number;
  wins: number;
  bestHall: number;
  best: number;
  bluffWins: number;
}

const RUN_KEY = 'bluff.run';
const META_KEY = 'bluff.meta';

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

export function newRun(seed: string, unlocked: string[]): RunState {
  const rng = new Rng(hash(seed, 'lineup'));
  return {
    v: 1,
    seed,
    player: { hp: START_HP, maxHp: START_HP, moves: [...START_MOVES], relics: [], rec: { h: 0, l: 0 } },
    hall: 0,
    idx: 0,
    // Hall 1 opens with the gullible Drunk Sailor, the easiest foe to read.
    lineup: HALLS.map((h, i) => (i === 0 ? ['sailor', rng.pick(h.foes.filter((f) => f !== 'sailor'))] : rng.shuffle([...h.foes]).slice(0, DUELS_PER_HALL))),
    duel: null,
    reward: null,
    stats: { rounds: 0, bluffWins: 0, truthWins: 0, duels: 0 },
    movePool: MOVE_IDS.filter((id) => !MOVES[id].start && (MOVES[id].unlock === 0 || unlocked.includes(id))),
    relicPool: RELIC_IDS.filter((id) => RELICS[id].unlock === 0 || unlocked.includes(id)),
  };
}

export const isChampion = (run: RunState): boolean => run.idx >= DUELS_PER_HALL;

export const foeAt = (run: RunState, hall: number, idx: number): string => (idx >= DUELS_PER_HALL ? HALLS[hall].champion : run.lineup[hall][idx]);

export const nextFoe = (run: RunState): string => foeAt(run, run.hall, run.idx);

export function startDuel(run: RunState): Duel {
  run.duel = newDuel(nextFoe(run), hash(run.seed, 'duel', run.hall, run.idx), run.player, HP_MULT);
  return run.duel;
}

/** Counts a resolved round in the run stats. */
export function noteRound(run: RunState, log: RoundLog): void {
  run.stats.rounds++;
  if (log.kind !== 'win') return;
  if (log.pc === log.pa) run.stats.truthWins++;
  else run.stats.bluffWins++;
}

export function addRelic(p: Player, id: string): void {
  if (p.relics.includes(id)) return;
  p.relics.push(id);
  if (id === 'heart') {
    p.maxHp += 10;
    p.hp += 10;
  }
}

export function makeReward(run: RunState): Reward {
  const rng = rngFor(run, 'reward', run.hall, run.idx);
  const p = run.player;
  const relics = rng.shuffle(run.relicPool.filter((id) => !p.relics.includes(id)));
  if (isChampion(run)) return { offers: relics.slice(0, 3).map((id) => ({ kind: 'relic', id })), champion: true, picked: false };
  const moves = rng.shuffle(run.movePool.filter((id) => !p.moves.includes(id)));
  const offers: Offer[] = [];
  if (moves[0]) offers.push({ kind: 'move', id: moves[0] });
  if (moves[1] && rng.chance(0.5)) offers.push({ kind: 'move', id: moves[1] });
  else if (relics[0]) offers.push({ kind: 'relic', id: relics[0] });
  offers.push({ kind: 'heal', n: HEAL_PICK });
  return { offers, champion: false, picked: false };
}

/** Called after a won duel. Heals a little and builds the reward. */
export function winDuel(run: RunState): void {
  const p = run.player;
  run.stats.duels++;
  const heal = REST_HEAL + (p.relics.includes('flask') ? 6 : 0) + (isChampion(run) ? 12 : 0);
  p.hp = Math.min(p.maxHp, p.hp + heal);
  run.reward = makeReward(run);
}

export function applyOffer(run: RunState, o: Offer): void {
  const p = run.player;
  if (o.kind === 'move') p.moves[MOVES[o.id].slot] = o.id;
  else if (o.kind === 'relic') addRelic(p, o.id);
  else p.hp = Math.min(p.maxHp, p.hp + o.n);
}

/** Moves to the next duel. Returns true when the run is won. */
export function advance(run: RunState): boolean {
  run.duel = null;
  run.reward = null;
  run.idx++;
  if (run.idx > DUELS_PER_HALL) {
    run.idx = 0;
    run.hall++;
    return run.hall >= HALLS.length;
  }
  return false;
}

export const offerName = (o: Offer): string =>
  o.kind === 'move' ? MOVES[o.id].name : o.kind === 'relic' ? `${RELICS[o.id].icon} ${RELICS[o.id].name}` : `Heal ${o.n}`;

// ---------- Score and meta ----------

export const score = (run: RunState, victory: boolean): number =>
  run.stats.duels * 100 + run.stats.bluffWins * 5 + run.stats.truthWins * 3 + run.player.hp * 4 + (victory ? 1500 : 0);

export const shardsFor = (sc: number): number => Math.floor(sc / 80);

export const LOCKED = [...MOVE_IDS.filter((id) => MOVES[id].unlock > 0), ...RELIC_IDS.filter((id) => RELICS[id].unlock > 0)];

export const unlockCost = (id: string): number => MOVES[id]?.unlock ?? RELICS[id]?.unlock ?? 0;

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
    if (run.v !== 1 || run.player.moves.some((m) => !MOVES[m]) || run.player.relics.some((r) => !RELICS[r])) return null;
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
  const base: Meta = { shards: 0, unlocked: [], runs: 0, wins: 0, bestHall: 0, best: 0, bluffWins: 0 };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
  } catch {
    return base;
  }
}

export function saveMeta(meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}
