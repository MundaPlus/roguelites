import { type Battle, type Tile, type Unit } from './board';
import { makeEnemy, placeSpawns, planEnemies } from './engine';
import { HEXES, dist, neighbors, ring, type Hex } from './hex';
import { Rng, hash } from './rng';
import { ENEMIES, FRAMES, LEVELS, PERK_IDS, PILOT_NAMES, SQUADS, type SquadId } from './units';
import { SHOP_WEAPONS } from './weapons';

// ---------- Islands ----------

export type IslandId = 'verdant' | 'tidewater' | 'ashen';

interface TerrainMix {
  forest: number;
  water: number;
  chasm: number;
  mountain: number;
  fire: number;
}

export interface IslandDef {
  id: IslandId;
  name: string;
  icon: string;
  text: string;
  roster: [string, number][];
  mix: TerrainMix;
  places: string[];
}

export const ISLANDS: Record<IslandId, IslandDef> = {
  verdant: {
    id: 'verdant',
    name: 'Verdant Isle',
    icon: '🌳',
    text: 'Thick forests. Any hit sets a forest on fire.',
    roster: [['scuttler', 4], ['spitter', 3], ['digger', 2], ['firefly', 2], ['brute', 1]],
    mix: { forest: 9, water: 2, chasm: 0, mountain: 3, fire: 0 },
    places: ['Mossgate', 'Old Orchard', 'Fernwatch', 'Timber Yard', 'Greenhold', 'Sap Mill'],
  },
  tidewater: {
    id: 'tidewater',
    name: 'Tidewater',
    icon: '🌊',
    text: 'Lakes and canals. Push enemies into water to drown them.',
    roster: [['scuttler', 4], ['spitter', 3], ['beetle', 2], ['leaper', 2], ['firefly', 1]],
    mix: { forest: 2, water: 9, chasm: 0, mountain: 3, fire: 0 },
    places: ['Saltdocks', 'Lockkeep', 'Reed Flats', 'Harbor Nine', 'Floodgate', 'Pier Row'],
  },
  ashen: {
    id: 'ashen',
    name: 'Ashen Rift',
    icon: '🌋',
    text: 'Chasms and lava vents. Anything that walks falls in.',
    roster: [['scuttler', 3], ['beetle', 3], ['brute', 2], ['digger', 2], ['leaper', 2]],
    mix: { forest: 1, water: 0, chasm: 5, mountain: 5, fire: 2 },
    places: ['Cinder Pass', 'Slag Works', 'Black Ridge', 'Vent Station', 'Emberfall', 'Ash Market'],
  },
};

export const ISLAND_IDS: IslandId[] = ['verdant', 'tidewater', 'ashen'];

const FINAL_ROSTER: [string, number][] = [['scuttler', 3], ['spitter', 2], ['beetle', 2], ['brute', 2], ['digger', 2], ['firefly', 2], ['leaper', 2]];
const FINAL_MIX: TerrainMix = { forest: 3, water: 3, chasm: 3, mountain: 4, fire: 1 };

// ---------- Missions ----------

export type ObjId = 'kills' | 'protect' | 'grid' | 'armor' | 'block' | 'boss' | 'spire';

export interface Objective {
  id: ObjId;
  n: number;
  reward: 'rep' | 'power';
  amount: number;
}

export type MissionKind = 'normal' | 'boss' | 'final';

export interface MissionDef {
  kind: MissionKind;
  name: string;
  objectives: Objective[];
  seed: number;
}

export function objText(o: Objective): string {
  switch (o.id) {
    case 'kills':
      return `Kill ${o.n} enemies`;
    case 'protect':
      return 'Protect the Reactor ⚛️';
    case 'grid':
      return `Lose at most ${o.n} grid power`;
    case 'armor':
      return `Mechs take at most ${o.n} damage`;
    case 'block':
      return `Block ${o.n} spawns`;
    case 'boss':
      return 'Kill the Hive Tyrant 🦖';
    case 'spire':
      return 'Protect the Spire 🗼';
  }
}

export const rewardText = (o: Objective): string => (o.reward === 'power' ? `+${o.amount} ⚡` : `+${o.amount} ⭐`);

/** Progress text and whether the objective holds right now (or at the end). */
export function objStatus(o: Objective, b: Battle): { ok: boolean; text: string } {
  const s = b.stats;
  switch (o.id) {
    case 'kills':
      return { ok: s.kills >= o.n, text: `${Math.min(s.kills, o.n)}/${o.n}` };
    case 'protect': {
      const alive = b.tiles.some((t) => t.reactor && t.t === 'building');
      return { ok: alive, text: alive ? 'standing' : 'destroyed' };
    }
    case 'grid':
      return { ok: s.powerLost <= o.n, text: `${s.powerLost} lost` };
    case 'armor':
      return { ok: s.mechDmg <= o.n, text: `${s.mechDmg} taken` };
    case 'block':
      return { ok: s.blocked >= o.n, text: `${Math.min(s.blocked, o.n)}/${o.n}` };
    case 'boss':
      return { ok: s.bossKilled, text: s.bossKilled ? 'dead' : 'alive' };
    case 'spire': {
      const alive = b.tiles.some((t) => t.spire && t.t === 'building');
      return { ok: alive, text: alive ? 'standing' : 'fallen' };
    }
  }
}

/** Objectives that are already lost cannot come back. Shown greyed out in battle. */
export function objFailed(o: Objective, b: Battle): boolean {
  if (o.id === 'protect' || o.id === 'grid' || o.id === 'armor' || o.id === 'spire') return !objStatus(o, b).ok;
  return false;
}

// ---------- Run state ----------

export interface Pilot {
  name: string;
  xp: number;
  perks: string[];
}

export interface MechSave {
  frame: string;
  weapons: { id: string; lvl: number }[];
  hpBonus: number;
  pilot: Pilot | null;
}

export interface RunState {
  v: 1;
  seed: string;
  squad: SquadId;
  mechs: MechSave[];
  power: number;
  rep: number;
  done: IslandId[];
  island: IslandId | null;
  /** Mission index on the island. 3 is the boss. */
  step: number;
  offers: MissionDef[];
  kills: number;
  objectives: number;
  missions: number;
  hangar: string[];
  /** Squad slots that wait for a perk choice. */
  perkQueue: number[];
  mission: MissionDef | null;
  battle: Battle | null;
  /** Reset Turn is left for this battle. */
  resetLeft: boolean;
}

export const MAX_POWER = 8;
export const START_POWER = 6;
export const COST = { up: 2, frame: 2, recruit: 2, power: 2, weapon: 3 };
export const TURNS = 5;
export const FINAL_TURNS = 6;

const RUN_KEY = 'hexfall.run';
const META_KEY = 'hexfall.meta';

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

function pilotName(run: RunState, rng: Rng): string {
  const used = new Set(run.mechs.map((m) => m.pilot?.name));
  const free = PILOT_NAMES.filter((n) => !used.has(n));
  return rng.pick(free.length ? free : PILOT_NAMES);
}

export function newRun(squad: SquadId, seed: string): RunState {
  const run: RunState = {
    v: 1,
    seed,
    squad,
    mechs: [],
    power: START_POWER,
    rep: 0,
    done: [],
    island: null,
    step: 0,
    offers: [],
    kills: 0,
    objectives: 0,
    missions: 0,
    hangar: [],
    perkQueue: [],
    mission: null,
    battle: null,
    resetLeft: true,
  };
  const rng = rngFor(run, 'pilots');
  for (const f of SQUADS[squad].frames) {
    run.mechs.push({ frame: f, weapons: [{ id: FRAMES[f].weapon, lvl: 0 }], hpBonus: 0, pilot: null });
    run.mechs[run.mechs.length - 1].pilot = { name: pilotName(run, rng), xp: 0, perks: [] };
  }
  return run;
}

export const isFinal = (run: RunState): boolean => run.done.length >= ISLAND_IDS.length;

export const tier = (run: RunState): number => (isFinal(run) ? 3 : run.done.length);

export function enterIsland(run: RunState, id: IslandId): void {
  run.island = id;
  run.step = 0;
  run.offers = makeOffers(run);
}

const NORMAL_OBJ: ObjId[] = ['kills', 'protect', 'grid', 'armor', 'block'];

function makeObjective(id: ObjId, t: number): Objective {
  switch (id) {
    case 'kills':
      return { id, n: 5 + t, reward: 'rep', amount: 1 };
    case 'protect':
      return { id, n: 0, reward: 'power', amount: 1 };
    case 'grid':
      return { id, n: 1, reward: 'rep', amount: 1 };
    case 'armor':
      return { id, n: 3, reward: 'rep', amount: 1 };
    case 'block':
      return { id, n: 2, reward: 'rep', amount: 1 };
    case 'boss':
      return { id, n: 0, reward: 'rep', amount: 2 };
    case 'spire':
      return { id, n: 0, reward: 'rep', amount: 0 };
  }
}

export function makeOffers(run: RunState): MissionDef[] {
  const t = tier(run);
  if (isFinal(run)) {
    return [{ kind: 'final', name: 'The Hive Heart', objectives: [makeObjective('spire', t), makeObjective('kills', t + 3)], seed: hash(run.seed, 'final') }];
  }
  const isl = ISLANDS[run.island!];
  const rng = rngFor(run, 'offers', run.island!, run.step);
  const names = rng.shuffle([...isl.places]);
  if (run.step >= 3) {
    const extra = rng.pick(NORMAL_OBJ.filter((o) => o !== 'kills'));
    return [{ kind: 'boss', name: `${isl.name} Hive`, objectives: [makeObjective('boss', t), makeObjective(extra, t)], seed: rng.int(1, 1e9) }];
  }
  return [0, 1].map((i) => {
    const objs = rng.shuffle([...NORMAL_OBJ]).slice(0, 2);
    return { kind: 'normal' as const, name: names[i], objectives: objs.map((o) => makeObjective(o, t)), seed: rng.int(1, 1e9) };
  });
}

// ---------- Battle setup ----------

const blankTile = (): Tile => ({ t: 'ground', hp: 0, max: 0, fire: false, smoke: false, shield: false, rubble: false, reactor: false, spire: false });

export function makeMechUnit(m: MechSave, slot: number, id: number, h: Hex): Unit {
  const f = FRAMES[m.frame];
  const perks = m.pilot?.perks ?? [];
  const hp = f.hp + m.hpBonus + (perks.includes('tough') ? 2 : 0);
  return {
    id,
    side: 'mech',
    kind: m.frame,
    q: h.q,
    r: h.r,
    hp,
    max: hp,
    move: f.move + (perks.includes('fast') ? 1 : 0),
    flying: !!f.flying,
    jump: false,
    stable: false,
    boss: false,
    alpha: false,
    burning: false,
    shield: false,
    slot,
    moved: false,
    acted: false,
    weapons: m.weapons.map((w) => ({ ...w })),
    bonus: perks.includes('gunner') ? 1 : 0,
    perks: [...perks],
    intent: null,
  };
}

export function makeBattle(run: RunState, mission: MissionDef): Battle {
  const rng = new Rng(mission.seed);
  const t = tier(run);
  const final = mission.kind === 'final';
  const isl = final ? null : ISLANDS[run.island!];
  const mix = isl ? isl.mix : FINAL_MIX;
  const tiles = HEXES.map(blankTile);
  const at = (h: Hex) => tiles[HEXES.findIndex((x) => x.q === h.q && x.r === h.r)];
  const free = (h: Hex) => at(h).t === 'ground' && !at(h).fire;
  const pickFree = (filter: (h: Hex) => boolean): Hex | null => {
    const c = HEXES.filter((h) => free(h) && filter(h));
    return c.length ? rng.pick(c) : null;
  };

  // Buildings first, in the inner rings, then the Spire or the Reactor.
  if (final) {
    Object.assign(at({ q: 0, r: 0 }), { t: 'building', hp: 4, max: 4, spire: true });
  }
  const nb = final ? 5 : 7;
  for (let i = 0; i < nb; i++) {
    const h = pickFree((x) => ring(x) <= 3 && ring(x) >= 1 && neighbors(x).filter((n) => at(n).t === 'building').length < 2);
    if (!h) break;
    const hp = rng.chance(0.3) ? 2 : 1;
    Object.assign(at(h), { t: 'building', hp, max: hp });
  }
  if (mission.objectives.some((o) => o.id === 'protect')) {
    const h = pickFree((x) => ring(x) <= 3 && ring(x) >= 1);
    if (h) Object.assign(at(h), { t: 'building', hp: 2, max: 2, reactor: true });
  }
  for (let i = 0; i < mix.mountain + rng.int(-1, 1); i++) {
    const h = pickFree((x) => ring(x) >= 2);
    if (h) Object.assign(at(h), { t: 'mountain', hp: 2, max: 2 });
  }
  // Water and chasms grow in small clumps and stay out of the center.
  const clumps = (kind: 'water' | 'chasm', n: number) => {
    let left = n;
    while (left > 0) {
      const seed = pickFree((x) => ring(x) >= 2);
      if (!seed) return;
      at(seed).t = kind;
      left--;
      for (const nb2 of rng.shuffle(neighbors(seed))) {
        if (left <= 0 || rng.chance(0.4)) break;
        if (free(nb2) && ring(nb2) >= 2) {
          at(nb2).t = kind;
          left--;
        }
      }
    }
  };
  clumps('water', mix.water + rng.int(-1, 1));
  clumps('chasm', mix.chasm + rng.int(-1, 1));
  for (let i = 0; i < mix.forest + rng.int(-1, 1); i++) {
    const h = pickFree(() => true);
    if (h) at(h).t = 'forest';
  }
  for (let i = 0; i < mix.fire; i++) {
    const h = pickFree((x) => ring(x) >= 2);
    if (h) at(h).fire = true;
  }

  const spawnPlan = final ? [2, 2, 2, 2, 1] : [2, 1 + (t >= 1 ? 1 : 0), 2, 1 + (t >= 2 ? 1 : 0)];
  const b: Battle = {
    tiles,
    units: [],
    turn: 1,
    turns: final ? FINAL_TURNS : TURNS,
    power: run.power,
    spawns: [],
    spawnPlan,
    nextId: 1,
    rs: rng.int(1, 2 ** 30),
    stats: { kills: 0, blocked: 0, mechDmg: 0, powerLost: 0, bossKilled: false, xp: [0, 0, 0], lost: [] },
    fx: [],
    roster: isl ? isl.roster : FINAL_ROSTER,
    alphaChance: 0.08 + 0.14 * t + 0.03 * run.step,
    goal: mission.kind === 'boss' || mission.kind === 'final' ? 'boss' : 'survive',
    over: null,
    loseReason: '',
    actor: -1,
  };

  // Mechs deploy near the center, spread out.
  const placed: Hex[] = [];
  run.mechs.forEach((m, slot) => {
    if (!m.pilot) return;
    const h =
      pickFree((x) => ring(x) <= 2 && placed.every((p) => dist(p, x) >= 2) && !b.units.some((u) => u.q === x.q && u.r === x.r)) ??
      pickFree((x) => ring(x) <= 3 && !b.units.some((u) => u.q === x.q && u.r === x.r));
    if (!h) return;
    placed.push(h);
    b.units.push(makeMechUnit(m, slot, b.nextId++, h));
  });

  const occupied = (h: Hex) => b.units.some((u) => u.q === h.q && u.r === h.r);
  const edge = (h: Hex) => ring(h) >= 3 && !occupied(h) && placed.every((p) => dist(p, h) >= 2) && at(h).t !== 'water' && at(h).t !== 'chasm';
  if (mission.kind === 'boss' || final) {
    const h = HEXES.filter((x) => (free(x) || at(x).t === 'forest') && edge(x));
    if (h.length) {
      const boss = makeEnemy(b, final ? 'queen' : 'tyrant', rng.pick(h), false);
      if (!final) {
        boss.hp = boss.max = ENEMIES.tyrant.hp + 2 * t;
      }
      b.units.push(boss);
    }
  }
  const n0 = final ? 3 : 2 + Math.floor((t * 2 + run.step) / 3) - (mission.kind === 'boss' ? 1 : 0);
  for (let i = 0; i < n0; i++) {
    const c = HEXES.filter((x) => (free(x) || at(x).t === 'forest') && edge(x));
    if (!c.length) break;
    const kind = rng.weighted(b.roster);
    b.units.push(makeEnemy(b, kind, rng.pick(c), rng.chance(b.alphaChance)));
  }

  planEnemies(b);
  placeSpawns(b);
  return b;
}

// ---------- After a battle ----------

export interface Report {
  victory: boolean;
  lost: boolean;
  reason: string;
  objectives: { o: Objective; ok: boolean }[];
  rep: number;
  power: number;
  kills: number;
  pilots: { slot: number; name: string; gained: number; levelUp: boolean; dead: boolean }[];
  islandDone: IslandId | null;
  runWon: boolean;
}

export function finishBattle(run: RunState, b: Battle): Report {
  const mission = run.mission!;
  const lost = b.over === 'lose';
  const report: Report = {
    victory: !lost,
    lost,
    reason: b.loseReason,
    objectives: [],
    rep: 0,
    power: 0,
    kills: b.stats.kills,
    pilots: [],
    islandDone: null,
    runWon: false,
  };
  run.power = Math.max(0, Math.min(MAX_POWER, b.power));
  run.kills += b.stats.kills;
  run.missions++;
  for (const o of mission.objectives) {
    const ok = !lost && objStatus(o, b).ok;
    report.objectives.push({ o, ok });
    if (!ok) continue;
    run.objectives++;
    if (o.reward === 'power') report.power += o.amount;
    else report.rep += o.amount;
  }
  run.mechs.forEach((m, slot) => {
    if (!m.pilot) return;
    const dead = b.stats.lost.includes(slot);
    const gained = b.stats.xp[slot] ?? 0;
    const before = m.pilot.perks.length + run.perkQueue.filter((s) => s === slot).length;
    m.pilot.xp += gained;
    let levels = 0;
    while (!dead && before + levels < LEVELS.length && m.pilot.xp >= LEVELS[before + levels]) levels++;
    report.pilots.push({ slot, name: m.pilot.name, gained, levelUp: levels > 0, dead });
    if (dead) m.pilot = null;
    for (let i = 0; i < levels; i++) run.perkQueue.push(slot);
  });
  if (!lost) {
    if (mission.kind === 'final') report.runWon = true;
    else if (mission.kind === 'boss') {
      report.islandDone = run.island;
      run.done.push(run.island!);
      run.island = null;
      run.step = 0;
      report.rep += 2;
      report.power += 1;
    } else run.step++;
  }
  run.rep += report.rep;
  run.power = Math.min(MAX_POWER, run.power + report.power);
  run.mission = null;
  run.battle = null;
  run.offers = run.island ? makeOffers(run) : isFinal(run) ? makeOffers(run) : [];
  run.hangar = hangarOffers(run);
  return report;
}

// ---------- Hangar ----------

export function hangarOffers(run: RunState): string[] {
  const owned = new Set(run.mechs.flatMap((m) => m.weapons.map((w) => w.id)));
  const rng = rngFor(run, 'hangar', run.missions);
  return rng.shuffle(SHOP_WEAPONS.filter((w) => !owned.has(w))).slice(0, 2);
}

export function perkChoices(run: RunState, slot: number): string[] {
  const p = run.mechs[slot].pilot;
  if (!p) return [];
  const rng = rngFor(run, 'perk', slot, p.perks.length, p.name);
  return rng.shuffle(PERK_IDS.filter((x) => !p.perks.includes(x))).slice(0, 2);
}

export function takePerk(run: RunState, slot: number, perk: string): void {
  run.mechs[slot].pilot?.perks.push(perk);
  const i = run.perkQueue.indexOf(slot);
  if (i >= 0) run.perkQueue.splice(i, 1);
}

export function recruit(run: RunState, slot: number): void {
  run.mechs[slot].pilot = { name: pilotName(run, rngFor(run, 'recruit', slot, run.missions)), xp: 0, perks: [] };
}

export const pilotCount = (run: RunState): number => run.mechs.filter((m) => m.pilot).length;

export const score = (run: RunState, victory: boolean): number =>
  run.kills * 5 + run.objectives * 25 + run.done.length * 200 + run.power * 20 + (victory ? 1000 : 0);

// ---------- Save data ----------

export interface Meta {
  runs: number;
  wins: number;
  bestIslands: number;
  best: number;
}

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
    if (run.v !== 1 || !SQUADS[run.squad] || run.mechs.some((m) => !FRAMES[m.frame])) return null;
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
  const base: Meta = { runs: 0, wins: 0, bestIslands: 0, best: 0 };
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
