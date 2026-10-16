/** Run state: the season map, rewards, shop, pit stops, events, save data. No DOM. */
import {
  BOSSES,
  CAR_BY_ID,
  DRIVERS,
  DRIVER_BY_ID,
  PARTS,
  PART_BY_ID,
  PART_PRICE,
  POINTS,
  PRIZE_SHARE,
  SLOTS,
  THEME_IDS,
  buildStats,
  type Mods,
  type PartDef,
  type Slot,
  type Stats,
  type ThemeId,
} from './data';
import { DT, createRace, finalOrder, playerIndex, stepRace, type Entrant, type Race } from './race';
import { Rng, hash } from './rng';
import { genTrack, type Track } from './track';

export type NodeKind = 'race' | 'trial' | 'boss' | 'shop' | 'pit' | 'event';

export const NODE_INFO: Record<NodeKind, { icon: string; name: string; text: string }> = {
  race: { icon: '🏁', name: 'Race', text: '3 laps against 5 rivals. Top 3 win a part.' },
  trial: { icon: '⏱️', name: 'Time Trial', text: 'Race the clock alone. Beat the bronze time.' },
  boss: { icon: '👑', name: 'Boss Race', text: 'A boss rival joins the race.' },
  shop: { icon: '🛒', name: 'Parts Shop', text: 'Buy parts and repairs.' },
  pit: { icon: '🔧', name: 'Pit Stop', text: 'Free repair, a tune-up, or a clean record.' },
  event: { icon: '❓', name: 'Side Street', text: 'Something happens on the way.' },
};

/** The choices at each stage of the season. 10 of the stages are races. */
export const PLAN: NodeKind[][] = [
  ['race'],
  ['race', 'trial'],
  ['shop', 'pit', 'event'],
  ['race', 'race'],
  ['race', 'trial'],
  ['boss'],
  ['shop', 'pit', 'event'],
  ['race', 'race'],
  ['race', 'trial'],
  ['shop', 'pit', 'event'],
  ['race', 'race'],
  ['race', 'trial'],
  ['shop', 'pit'],
  ['boss'],
];

export const isRaceKind = (k: NodeKind): boolean => k === 'race' || k === 'trial' || k === 'boss';

/** Race number (0..9) of each stage, or -1. */
export const RACE_NO: number[] = (() => {
  let n = 0;
  return PLAN.map((opts) => (isRaceKind(opts[0]) ? n++ : -1));
})();

export const RACES = RACE_NO.filter((x) => x >= 0).length;

export interface MapNode {
  kind: NodeKind;
  theme: ThemeId;
  seed: number;
  size: number;
  prize: number;
  boss: string | null;
}

export interface RaceLog {
  stage: number;
  kind: NodeKind;
  place: number;
  theme: ThemeId;
}

export interface RunState {
  v: 1;
  seed: string;
  car: string;
  parts: Record<Slot, string | null>;
  hp: number;
  money: number;
  strikes: number;
  stage: number;
  tune: number;
  points: Record<string, number>;
  rivals: string[];
  log: RaceLog[];
  bossBeat: number;
  wins: number;
  /** Current shop stock, kept so a reload shows the same shop. */
  shop: ShopItem[] | null;
}

export interface Meta {
  trophies: number;
  unlocked: string[];
  runs: number;
  wins: number;
  best: number;
  bestStage: number;
  firsts: number;
  car: string;
}

const RUN_KEY = 'roguerally.run';
const META_KEY = 'roguerally.meta';

export function newRun(seed: string, car: string): RunState {
  const rng = new Rng(hash(seed, 'rivals'));
  const rivals = rng.shuffle(DRIVERS.map((d) => d.id)).slice(0, 5);
  const run: RunState = {
    v: 1,
    seed,
    car,
    parts: { tires: null, engine: null, nitro: null, armor: null, gadget: null },
    hp: 0,
    money: 40,
    strikes: 0,
    stage: 0,
    tune: 0,
    points: Object.fromEntries([...rivals, 'you'].map((id) => [id, 0])),
    rivals,
    log: [],
    bossBeat: 0,
    wins: 0,
    shop: null,
  };
  run.hp = playerStats(run).hp;
  return run;
}

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

export function playerStats(run: RunState): Stats {
  const mods: Mods[] = [CAR_BY_ID[run.car].mods];
  for (const s of SLOTS) {
    const id = run.parts[s];
    if (id) mods.push(PART_BY_ID[id].mods);
  }
  if (run.tune) mods.push({ speed: run.tune * 0.03, accel: run.tune * 0.03 });
  return buildStats(mods);
}

export const raceNo = (run: RunState): number => Math.max(0, RACE_NO.slice(0, run.stage + 1).filter((x) => x >= 0).length - 1);

export function nodesFor(run: RunState): MapNode[] {
  const stage = run.stage;
  const rng = rngFor(run, 'nodes', stage);
  const rn = Math.max(0, RACE_NO[stage]);
  const themes = rng.shuffle([...THEME_IDS]);
  return PLAN[stage].map((kind, i) => ({
    kind,
    theme: themes[i % themes.length],
    seed: hash(run.seed, 'track', stage, i),
    size: rn < 3 ? 0 : rn < 7 ? 1 : 2,
    prize: Math.round((70 + rn * 14) * (kind === 'boss' ? 1.6 : kind === 'trial' ? 0.8 : 1)),
    boss: kind === 'boss' ? BOSSES[stage < 8 ? 0 : 1].id : null,
  }));
}

export const trackFor = (node: MapNode): Track => genTrack(node.seed, node.theme, node.size);

/** AI difficulty for a race number. */
export function aiSkill(rn: number): number {
  return 0.85 + rn * 0.017;
}

function aiStats(rn: number, boss: boolean): Stats {
  return buildStats([{ accel: rn * 0.025, grip: rn * 0.012, dirt: rn * 0.02, ice: rn * 0.03, hp: boss ? 70 : 0, guard: boss ? -0.3 : 0, mass: boss ? 0.3 : 0 }]);
}

export function entrants(run: RunState, node: MapNode, playerSkill = 1): Entrant[] {
  const rn = raceNo(run);
  const st = playerStats(run);
  const g = run.parts.gadget ? PART_BY_ID[run.parts.gadget].gadget! : null;
  const me: Entrant = {
    id: 'you',
    name: 'You',
    icon: CAR_BY_ID[run.car].icon,
    color: CAR_BY_ID[run.car].color,
    isPlayer: true,
    boss: false,
    pers: 'balanced',
    skill: playerSkill,
    stats: st,
    hp: Math.min(run.hp, st.hp),
    gadget: g?.kind ?? null,
    charges: g?.charges ?? 0,
  };
  if (node.kind === 'trial') return [me];
  const ids = [...run.rivals];
  if (node.boss) ids[ids.length - 1] = node.boss;
  const rng = rngFor(run, 'grid', run.stage);
  const field: Entrant[] = ids.map((id) => {
    const d = DRIVER_BY_ID[id];
    const stats = aiStats(rn, !!d.boss);
    return {
      id,
      name: d.name,
      icon: d.icon,
      color: d.color,
      isPlayer: false,
      boss: !!d.boss,
      pers: d.pers,
      skill: aiSkill(rn) + d.skill,
      stats,
      hp: stats.hp,
      gadget: d.gadget,
      charges: d.boss ? 5 : d.gadget ? 2 : 0,
    };
  });
  rng.shuffle(field);
  return [...field, me];
}

export function makeRace(run: RunState, node: MapNode, playerSkill = 1): Race {
  return createRace(trackFor(node), entrants(run, node, playerSkill), hash(run.seed, 'race', run.stage), node.kind === 'trial');
}

/** Medal times for a time trial: a reference AI drives the track alone. */
export function trialPar(run: RunState, node: MapNode): number[] {
  const rn = raceNo(run);
  const ref: Entrant = {
    id: 'ref',
    name: 'Ref',
    icon: '',
    color: '',
    isPlayer: true,
    boss: false,
    pers: 'balanced',
    skill: aiSkill(rn) + 0.03,
    stats: aiStats(rn, false),
    hp: 100,
    gadget: null,
    charges: 0,
  };
  const r = createRace(trackFor(node), [ref], 1, true);
  r.autoPlayer = true;
  let guard = 0;
  while (!r.done && guard++ < 60 * 300) stepRace(r);
  const par = r.cars[0].time || r.clock;
  return [par * 1.0, par * 1.06, par * 1.13].map((x) => Math.round(x * 10) / 10);
}

export interface RaceResult {
  place: number;
  /** Order of names for the result table. */
  table: { id: string; name: string; icon: string; color: string; time: number; points: number; me: boolean; boss: boolean }[];
  money: number;
  points: number;
  strike: boolean;
  bossBeat: boolean;
  medal: number;
  time: number;
  par: number[] | null;
  picks: string[];
  damage: number;
  repair: number;
}

/** Apply a finished race to the run. */
export function applyRace(run: RunState, node: MapNode, race: Race, par: number[] | null): RaceResult {
  const order = finalOrder(race);
  const pi = playerIndex(race);
  const me = race.cars[pi];
  let place = order.indexOf(pi);
  let medal = -1;
  if (node.kind === 'trial' && par) {
    const t = me.finished ? me.time : 999;
    medal = par.findIndex((p) => t <= p);
    place = medal >= 0 ? medal : 5;
  }
  const money = Math.round(node.prize * PRIZE_SHARE[place]);
  const strike = place === 5;
  const table = order.map((ci, pos) => {
    const c = race.cars[ci];
    return { id: c.id, name: c.name, icon: c.icon, color: c.color, time: c.finished ? c.time : -1, points: POINTS[pos], me: c.isPlayer, boss: c.boss };
  });
  if (node.kind !== 'trial') {
    order.forEach((ci, pos) => {
      const id = race.cars[ci].id;
      if (id in run.points) run.points[id] += POINTS[pos];
    });
  } else {
    run.points.you += medal >= 0 ? POINTS[medal] : 0;
  }
  const bossIdx = race.cars.findIndex((c) => c.boss);
  const bossBeat = bossIdx >= 0 && order.indexOf(pi) < order.indexOf(bossIdx);
  const before = run.hp;
  const max = playerStats(run).hp;
  const repair = Math.min(12, max - me.hp);
  run.hp = Math.min(max, Math.round(me.hp + repair));
  run.money += money;
  if (strike) run.strikes++;
  if (place === 0) run.wins++;
  if (bossBeat) run.bossBeat++;
  run.log.push({ stage: run.stage, kind: node.kind, place, theme: node.theme });
  const picks = place <= 2 || bossBeat ? partChoices(run, place, bossBeat) : [];
  return {
    place,
    table,
    money,
    points: node.kind === 'trial' ? (medal >= 0 ? POINTS[medal] : 0) : POINTS[place],
    strike,
    bossBeat,
    medal,
    time: me.finished ? me.time : -1,
    par,
    picks,
    damage: Math.max(0, Math.round(before - me.hp)),
    repair: Math.max(0, Math.round(repair)),
  };
}

function partChoices(run: RunState, place: number, boss: boolean): string[] {
  const rng = rngFor(run, 'picks', run.stage);
  const rn = raceNo(run);
  const owned = new Set(Object.values(run.parts));
  const pool = PARTS.filter((p) => !owned.has(p.id));
  const out: string[] = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const r = rng.weighted<number>([
      [1, Math.max(1, 6 - rn * 0.5)],
      [2, 2 + rn * 0.35 + (place === 0 ? 2 : 0)],
      [3, 0.3 + rn * 0.25 + (boss ? 4 : 0)],
    ]);
    const cand = pool.filter((p) => p.rarity === r && !out.includes(p.id));
    const list = cand.length ? cand : pool.filter((p) => !out.includes(p.id));
    if (!list.length) break;
    out.push(rng.pick(list).id);
  }
  return out;
}

/** Equip a part. Returns the money refund for the old part. */
export function equip(run: RunState, id: string): number {
  const p = PART_BY_ID[id];
  const old = run.parts[p.slot];
  const maxBefore = playerStats(run).hp;
  run.parts[p.slot] = id;
  const maxAfter = playerStats(run).hp;
  run.hp = Math.max(1, Math.min(maxAfter, run.hp + (maxAfter - maxBefore)));
  if (!old) return 0;
  const refund = Math.round(PART_PRICE[PART_BY_ID[old].rarity] * 0.25);
  run.money += refund;
  return refund;
}

/** True if the run has ended: two strikes, or the season is over. */
export const isOver = (run: RunState): boolean => run.strikes >= 2 || run.stage >= PLAN.length;

export function advance(run: RunState): void {
  run.stage++;
  run.shop = null;
}

// ---------- Shop ----------

export type ShopItem = { kind: 'part'; id: string; cost: number; sold: boolean } | { kind: 'repair'; n: number; cost: number; sold: boolean } | { kind: 'full'; cost: number; sold: boolean };

export function makeShop(run: RunState): ShopItem[] {
  if (run.shop) return run.shop;
  const rng = rngFor(run, 'shop', run.stage);
  const rn = raceNo(run);
  const owned = new Set(Object.values(run.parts));
  const pool = rng.shuffle(PARTS.filter((p) => !owned.has(p.id)));
  const picks: PartDef[] = [];
  for (const r of [1, 2, rng.chance(0.35 + rn * 0.05) ? 3 : 2, rng.pick([1, 2, 3])]) {
    const p = pool.find((x) => x.rarity === r && !picks.includes(x));
    if (p) picks.push(p);
  }
  const items: ShopItem[] = picks.map((p) => ({ kind: 'part', id: p.id, cost: PART_PRICE[p.rarity] + rn * 4 + rng.int(0, 8), sold: false }));
  items.push({ kind: 'repair', n: 30, cost: 22, sold: false });
  items.push({ kind: 'full', cost: 0, sold: false });
  run.shop = items;
  return items;
}

export const fullRepairCost = (run: RunState): number => Math.ceil((playerStats(run).hp - run.hp) * 0.7);

export function buy(run: RunState, i: number): boolean {
  const it = run.shop?.[i];
  if (!it || it.sold) return false;
  const max = playerStats(run).hp;
  const cost = it.kind === 'full' ? fullRepairCost(run) : it.cost;
  if (run.money < cost) return false;
  if (it.kind !== 'part' && run.hp >= max) return false;
  run.money -= cost;
  if (it.kind === 'part') {
    it.sold = true;
    equip(run, it.id);
  } else if (it.kind === 'repair') run.hp = Math.min(max, run.hp + it.n);
  else run.hp = max;
  return true;
}

// ---------- Pit stop ----------

export const MAX_TUNE = 4;

export type PitChoice = 'repair' | 'tune' | 'clean';

export function pit(run: RunState, c: PitChoice): string {
  if (c === 'repair') {
    run.hp = playerStats(run).hp;
    return 'The crew fixes every dent.';
  }
  if (c === 'tune') {
    run.tune = Math.min(MAX_TUNE, run.tune + 1);
    return 'The engine runs 3% faster and pulls 3% harder.';
  }
  run.strikes = Math.max(0, run.strikes - 1);
  return 'The stewards forget your last-place finish.';
}

// ---------- Events ----------

export interface EventDef {
  id: string;
  icon: string;
  title: string;
  text: string;
  options: { label: string; can?: (run: RunState) => boolean; run: (run: RunState, rng: Rng) => string }[];
}

const randomPart = (run: RunState, rng: Rng, rarity: number): string | null => {
  const owned = new Set(Object.values(run.parts));
  const list = PARTS.filter((p) => p.rarity === rarity && !owned.has(p.id));
  return list.length ? rng.pick(list).id : null;
};

export const EVENTS: EventDef[] = [
  {
    id: 'sponsor',
    icon: '🤝',
    title: 'Sponsor Deal',
    text: 'An energy drink brand wants its logo on your hood.',
    options: [
      {
        label: 'Take the cash (+$70)',
        run: (r) => {
          r.money += 70;
          return 'You get $70 and a free can of fizz.';
        },
      },
      {
        label: 'Ask for parts (a random common part)',
        run: (r, rng) => {
          const id = randomPart(r, rng, 1);
          if (!id) return 'They have nothing left.';
          equip(r, id);
          return `You bolt on ${PART_BY_ID[id].icon} ${PART_BY_ID[id].name}.`;
        },
      },
    ],
  },
  {
    id: 'mechanic',
    icon: '🧰',
    title: 'Back-Alley Mechanic',
    text: 'A mechanic with oily hands offers a "barely used" part.',
    options: [
      {
        label: 'Pay $60 (a random rare part)',
        can: (r) => r.money >= 60,
        run: (r, rng) => {
          r.money -= 60;
          const id = randomPart(r, rng, 2);
          if (!id) return 'He keeps the money. Oops.';
          equip(r, id);
          return `You fit ${PART_BY_ID[id].icon} ${PART_BY_ID[id].name}.`;
        },
      },
      { label: 'Walk away', run: () => 'You drive on.' },
    ],
  },
  {
    id: 'bet',
    icon: '🎲',
    title: 'Street Bet',
    text: 'A crowd bets on a drag race. Double or nothing?',
    options: [
      {
        label: 'Bet $50 (win $100 or lose it)',
        can: (r) => r.money >= 50,
        run: (r, rng) => {
          if (rng.chance(0.5)) {
            r.money += 50;
            return 'You win the drag race! +$50.';
          }
          r.money -= 50;
          return 'You lose by a nose. −$50.';
        },
      },
      { label: 'Just watch', run: () => 'The crowd cheers someone else.' },
    ],
  },
  {
    id: 'scrapyard',
    icon: '🏚️',
    title: 'Scrapyard',
    text: 'Piles of old cars. Some parts still work.',
    options: [
      {
        label: 'Patch the car (+40 HP)',
        run: (r) => {
          r.hp = Math.min(playerStats(r).hp, r.hp + 40);
          return 'Duct tape holds the car together. +40 HP.';
        },
      },
      {
        label: 'Dig for parts (a random part, −15 HP)',
        can: (r) => r.hp > 15,
        run: (r, rng) => {
          r.hp -= 15;
          const id = randomPart(r, rng, rng.chance(0.3) ? 2 : 1);
          if (!id) return 'You find only rust.';
          equip(r, id);
          return `You cut your hand, but find ${PART_BY_ID[id].icon} ${PART_BY_ID[id].name}.`;
        },
      },
    ],
  },
  {
    id: 'fans',
    icon: '📣',
    title: 'Fan Club',
    text: 'Fans wave flags with your car on them.',
    options: [
      {
        label: 'Sign autographs (+$30, +2 points)',
        run: (r) => {
          r.money += 30;
          r.points.you += 2;
          return 'The fans love you. +$30, +2 points.';
        },
      },
      {
        label: 'Practice laps (+1 tune, −20 HP)',
        can: (r) => r.tune < MAX_TUNE && r.hp > 20,
        run: (r) => {
          r.tune++;
          r.hp -= 20;
          return 'You learn the car better, but scrape a wall. +1 tune.';
        },
      },
    ],
  },
];

export const pickEvent = (run: RunState): EventDef => rngFor(run, 'event', run.stage).pick(EVENTS);

// ---------- Score and meta ----------

/** Season standings, leader first. */
export const standingsTable = (run: RunState): [string, number][] => Object.entries(run.points).sort((a, b) => b[1] - a[1]);

export const score = (run: RunState, champion: boolean): number =>
  run.points.you * 10 + run.log.length * 40 + run.bossBeat * 250 + run.wins * 60 + Math.floor(run.money / 2) + (champion ? 1500 : 0);

export const trophiesFor = (sc: number): number => Math.floor(sc / 120);

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
    if (run.v !== 1 || !CAR_BY_ID[run.car] || Object.values(run.parts).some((p) => p && !PART_BY_ID[p]) || run.stage >= PLAN.length) return null;
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
  const base: Meta = { trophies: 0, unlocked: [], runs: 0, wins: 0, best: 0, bestStage: 0, firsts: 0, car: 'hatch' };
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

/** Run a race to the end without rendering. */
export function simulate(race: Race, maxSeconds = 300): void {
  let guard = 0;
  while (!race.done && guard++ < maxSeconds / DT) {
    stepRace(race);
    race.events.length = 0;
  }
}
