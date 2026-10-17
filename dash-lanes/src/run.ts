/** Run state, gates (zone, perk, shop), score, meta progress and save data. */
import { GOAL_STAGES, PERKS, PERK_IDS, RUNNERS, START_ZONES, ZONES, ZONE_IDS, stageInfo, stageStart } from './data';
import { PHYS, type GameSetup, type Mods } from './game';
import { Rng, hash } from './rng';

export interface ShopItem {
  id: 'shield' | 'hit' | 'jet' | 'reroll';
  name: string;
  icon: string;
  text: string;
  cost: number;
  sold: boolean;
}

export interface Gate {
  zones: string[];
  perks: string[];
  shop: ShopItem[];
  zone: string | null;
  perk: string | null;
  rerolls: number;
}

export interface RunState {
  seed: string;
  runner: string;
  stage: number;
  zone: string;
  perks: Record<string, number>;
  coins: number;
  coinsTotal: number;
  score: number;
  hits: number;
  won: boolean;
  bosses: number;
  startShield: boolean;
  startJet: boolean;
  gate: Gate | null;
  /** The player chose to keep running after the goal. */
  endless: boolean;
}

export interface Meta {
  gems: number;
  runs: number;
  wins: number;
  bestDist: number;
  bestScore: number;
  unlocked: string[];
  runner: string;
}

const RUN_KEY = 'dashlanes.run';
const META_KEY = 'dashlanes.meta';

export function newRun(seed: string, runner: string): RunState {
  const rd = RUNNERS[runner] ?? RUNNERS.dash;
  const rng = new Rng(hash(seed, 'start'));
  const perks = { ...rd.perks };
  return {
    seed,
    runner: rd.id,
    stage: 0,
    zone: rng.pick(START_ZONES),
    perks,
    coins: 0,
    coinsTotal: 0,
    score: 0,
    hits: perks.hit ?? 0,
    won: false,
    bosses: 0,
    startShield: false,
    startJet: false,
    gate: null,
    endless: false,
  };
}

export function modsFor(r: RunState): Mods {
  const p = (id: string): number => r.perks[id] ?? 0;
  const rd = RUNNERS[r.runner] ?? RUNNERS.dash;
  return {
    jumps: p('double'),
    magnetMul: 1 + 0.5 * p('magnet'),
    passive: p('magnet'),
    rampMul: Math.pow(0.8, p('ramp')),
    grav: Math.pow(0.88, p('feather')),
    laneSpeed: PHYS.laneSpeed * (1 + 0.18 * p('quick')) * rd.laneMul,
    buffer: PHYS.buffer + 0.06 * p('quick'),
    durMul: 1 + 0.3 * p('battery'),
    luck: 1 + 0.4 * p('lucky'),
    coinValue: 1 + p('coin'),
    scoreMul: (1 + 0.2 * p('show')) * rd.scoreMul,
    guard: p('guard') > 0 || r.startShield,
  };
}

export const totalDist = (r: RunState): number => stageStart(r.stage);

export function setupFor(r: RunState): GameSetup {
  const info = stageInfo(r.stage);
  return {
    stage: r.stage,
    zone: ZONES[r.zone] ?? ZONES.rail,
    len: info.len,
    base: stageStart(r.stage),
    boss: info.boss ?? null,
    seed: hash(r.seed, 'stage', r.stage),
    mods: modsFor(r),
    hits: r.hits,
    score: r.score,
    extra: r.stage >= GOAL_STAGES ? 0.6 + (r.stage - GOAL_STAGES) * 0.25 : 0,
    startJet: r.startJet,
  };
}

function perkChoices(r: RunState, rng: Rng): string[] {
  const open = PERK_IDS.filter((id) => (r.perks[id] ?? 0) < PERKS[id].max);
  return rng.shuffle(open).slice(0, 3);
}

/** Called when a stage ends. Moves the run to the gate before the next stage. */
export function finishStage(r: RunState, res: { coins: number; score: number; hits: number; boss: boolean }): void {
  r.coins += res.coins;
  r.coinsTotal += res.coins;
  r.score = Math.round(res.score);
  r.hits = res.hits;
  if (res.boss) r.bosses++;
  r.startShield = false;
  r.startJet = false;
  r.stage++;
  if (r.stage >= GOAL_STAGES) r.won = true;
  r.gate = makeGate(r);
}

export function makeGate(r: RunState): Gate {
  const rng = new Rng(hash(r.seed, 'gate', r.stage, r.gate?.rerolls ?? 0));
  const info = stageInfo(r.stage);
  const zones = info.kind === 'boss' ? [] : rng.shuffle(ZONE_IDS.filter((z) => z !== r.zone)).slice(0, r.stage >= 3 ? 3 : 2);
  const k = 1 + r.stage * 0.15;
  const shop: ShopItem[] = [
    { id: 'shield', name: 'Shield', icon: '🛡️', text: 'Start the next zone with a shield.', cost: Math.round(50 * k), sold: false },
    { id: 'jet', name: 'Jet Start', icon: '🚀', text: 'Start the next zone with a jetpack.', cost: Math.round(35 * k), sold: false },
    { id: 'hit', name: 'Extra Hit', icon: '❤️', text: 'Survive one more crash.', cost: Math.round(150 * k), sold: false },
    { id: 'reroll', name: 'Reroll Perks', icon: '🎲', text: 'Show 3 new perks.', cost: 20, sold: false },
  ];
  return { zones, perks: perkChoices(r, rng), shop, zone: null, perk: null, rerolls: r.gate?.rerolls ?? 0 };
}

export function buy(r: RunState, i: number): boolean {
  const g = r.gate;
  if (!g) return false;
  const it = g.shop[i];
  if (!it || it.sold || r.coins < it.cost) return false;
  r.coins -= it.cost;
  if (it.id === 'shield') r.startShield = true;
  else if (it.id === 'jet') r.startJet = true;
  else if (it.id === 'hit') r.hits++;
  else {
    g.rerolls++;
    const rng = new Rng(hash(r.seed, 'reroll', r.stage, g.rerolls));
    g.perks = perkChoices(r, rng);
    g.perk = null;
    it.cost += 15;
    return true;
  }
  it.sold = true;
  return true;
}

export function gateReady(r: RunState): boolean {
  const g = r.gate;
  if (!g) return false;
  return (g.zones.length === 0 || g.zone !== null) && (g.perks.length === 0 || g.perk !== null);
}

/** Leaves the gate: applies the perk and the zone. */
export function leaveGate(r: RunState): void {
  const g = r.gate!;
  if (g.perk) {
    r.perks[g.perk] = (r.perks[g.perk] ?? 0) + 1;
    if (g.perk === 'hit') r.hits++;
  }
  if (g.zone) r.zone = g.zone;
  r.gate = null;
}

export function gemsFor(r: RunState): number {
  return Math.floor(r.score / 250) + r.bosses * 3 + (r.won ? 10 : 0);
}

// ---------- Save data ----------

export function saveRun(r: RunState | null): void {
  try {
    if (r) localStorage.setItem(RUN_KEY, JSON.stringify(r));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage is not available */
  }
}

export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(RUN_KEY);
    if (!s) return null;
    const r = JSON.parse(s) as RunState;
    if (typeof r.stage !== 'number' || !r.perks) return null;
    return r;
  } catch {
    return null;
  }
}

export function loadMeta(): Meta {
  const m: Meta = { gems: 0, runs: 0, wins: 0, bestDist: 0, bestScore: 0, unlocked: ['dash'], runner: 'dash' };
  try {
    const s = localStorage.getItem(META_KEY);
    if (s) Object.assign(m, JSON.parse(s));
  } catch {
    /* storage is not available */
  }
  if (!m.unlocked.includes('dash')) m.unlocked.push('dash');
  if (!RUNNERS[m.runner] || !m.unlocked.includes(m.runner)) m.runner = 'dash';
  return m;
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* storage is not available */
  }
}

/** Bot choices for gates. A fixed preference list. */
const PERK_PREF = ['hit', 'double', 'ramp', 'guard', 'quick', 'feather', 'battery', 'lucky', 'magnet', 'show', 'coin'];
const ZONE_PREF = ['rail', 'frost', 'city', 'canyon', 'jungle', 'volcano'];

export function botGate(r: RunState): { zone: string | null; perk: string | null; buy: number[] } {
  const g = r.gate!;
  const zone = g.zones.length ? [...g.zones].sort((a, b) => ZONE_PREF.indexOf(a) - ZONE_PREF.indexOf(b))[0] : null;
  const perk = g.perks.length ? [...g.perks].sort((a, b) => PERK_PREF.indexOf(a) - PERK_PREF.indexOf(b))[0] : null;
  const buyList: number[] = [];
  let coins = r.coins;
  for (const id of ['hit', 'shield'] as const) {
    const i = g.shop.findIndex((s) => s.id === id);
    if (i >= 0 && !g.shop[i].sold && coins >= g.shop[i].cost) {
      buyList.push(i);
      coins -= g.shop[i].cost;
    }
  }
  return { zone, perk, buy: buyList };
}
