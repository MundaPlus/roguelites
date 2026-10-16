/** Run state, map, rewards, shop, score and save data. Pure except for localStorage. */
import type { Battle, BattleCfg, FightKind } from './battle';
import { RUNES, SPELL_ORDER, START_SPELLS, UNLOCKS } from './data';
import { Rng, hash } from './rng';

export type RoomKind = 'fight' | 'elite' | 'shrine' | 'shop' | 'boss';

export const ROOM_INFO: Record<RoomKind, { icon: string; name: string; text: string }> = {
  fight: { icon: '⚔️', name: 'Fight', text: 'A wave of enemies. Gold and a reward.' },
  elite: { icon: '💀', name: 'Elite', text: 'A strong foe with long words. A rune reward.' },
  shrine: { icon: '⛩️', name: 'Shrine', text: 'Learn a spell word or a rune, or rest.' },
  shop: { icon: '🛒', name: 'Shop', text: 'Buy runes, spells and healing.' },
  boss: { icon: '👑', name: 'Boss', text: 'The ruler of this act. Type its phrases.' },
};

export const STEPS = 7;

export interface Stats {
  words: number;
  kills: number;
  keys: number;
  typos: number;
  time: number;
  fights: number;
  bestCombo: number;
}

export interface RunState {
  v: 1;
  seed: string;
  act: number;
  step: number;
  /** For each act: for each step, the room choices. */
  map: RoomKind[][][];
  hp: number;
  maxHp: number;
  maxMana: number;
  gold: number;
  spells: string[];
  runes: string[];
  stats: Stats;
  /** Difficulty id. Old saves without it play on normal. */
  diff?: string;
}

export interface Meta {
  runs: number;
  wins: number;
  bestAct: number;
  best: number;
  bestWpm: number;
  shards: number;
  unlocked: string[];
  /** Chosen difficulty for new runs. */
  diff: string;
  /** Best score and wins per difficulty. */
  bestBy: Record<string, number>;
  winsBy: Record<string, number>;
}

export type Pick =
  | { kind: 'spell'; id: string }
  | { kind: 'rune'; id: string }
  | { kind: 'maxhp'; n: number }
  | { kind: 'heal'; n: number }
  | { kind: 'mana'; n: number };

export interface Rewards {
  gold: number;
  picks: Pick[];
}

export interface ShopItem {
  pick: Pick;
  cost: number;
  sold: boolean;
}

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

function genMap(seed: string, act: number): RoomKind[][] {
  const rng = new Rng(hash(seed, 'map', act));
  const two = (pool: RoomKind[]): RoomKind[] => rng.shuffle([...pool]).slice(0, 2);
  return [
    ['fight'],
    rng.chance(0.5) ? ['fight', 'shrine'] : ['shrine', 'fight'],
    two(['fight', 'elite', 'shrine']),
    rng.chance(0.5) ? ['shop', 'fight'] : ['shop', 'shrine'],
    two(['fight', 'elite', 'fight', 'shrine']).filter((v, i, a) => a.indexOf(v) === i),
    rng.chance(0.5) ? ['shrine', 'shop'] : ['fight', 'shop'],
    ['boss'],
  ];
}

export function newRun(seed: string, meta: Meta): RunState {
  const diff = meta.diff || 'normal';
  const spells = [...START_SPELLS];
  for (const u of UNLOCKS) if (u.kind === 'spell' && meta.unlocked.includes(u.id)) spells.push(u.id);
  return {
    v: 1,
    seed,
    act: 0,
    step: 0,
    map: [0, 1, 2].map((a) => genMap(seed, a)),
    hp: 10,
    maxHp: 10,
    maxMana: 100,
    gold: 20,
    spells: SPELL_ORDER.filter((s) => spells.includes(s)),
    runes: [],
    stats: { words: 0, kills: 0, keys: 0, typos: 0, time: 0, fights: 0, bestCombo: 0 },
    diff,
  };
}

export function battleCfg(run: RunState, kind: FightKind): BattleCfg {
  return {
    act: run.act,
    step: run.step,
    kind,
    seed: hash(run.seed, 'fight', run.act, run.step),
    spells: run.spells,
    runes: run.runes,
    hp: run.hp,
    maxHp: run.maxHp,
    maxMana: run.maxMana + (run.runes.includes('well') ? 40 : 0),
    diff: run.diff ?? 'normal',
  };
}

/** Copy the result of a battle back into the run. */
export function afterBattle(run: RunState, b: Battle): void {
  run.hp = b.hp;
  const s = run.stats;
  s.words += b.words;
  s.kills += b.kills;
  s.keys += b.keys;
  s.typos += b.typos;
  s.time += b.time;
  s.fights++;
  s.bestCombo = Math.max(s.bestCombo, b.bestCombo);
}

/** Moves to the next step. Returns true when the run is won. */
export function advance(run: RunState): boolean {
  run.step++;
  if (run.step >= STEPS) {
    run.act++;
    run.step = 0;
    if (run.act >= 3) return true;
  }
  return false;
}

const lockedRunes = (meta: Meta): string[] => UNLOCKS.filter((u) => u.kind === 'rune' && !meta.unlocked.includes(u.id)).map((u) => u.id);

export function runePool(run: RunState, meta: Meta): string[] {
  const locked = lockedRunes(meta);
  return Object.keys(RUNES).filter((id) => !run.runes.includes(id) && !locked.includes(id));
}

export const spellPool = (run: RunState): string[] => SPELL_ORDER.filter((s) => !run.spells.includes(s));

export function fightRewards(run: RunState, meta: Meta, kind: FightKind): Rewards {
  const rng = rngFor(run, 'reward', run.act, run.step);
  const goldMul = run.runes.includes('goldtongue') ? 1.3 : 1;
  const base = kind === 'boss' ? 70 : kind === 'elite' ? 40 : rng.int(14, 22);
  const gold = Math.round(base * (1 + run.act * 0.2) * goldMul);
  const runes = rng.shuffle(runePool(run, meta));
  const spells = rng.shuffle(spellPool(run));
  const picks: Pick[] = [];
  if (kind === 'fight') {
    if (spells.length) picks.push({ kind: 'spell', id: spells[0] });
    if (runes.length) picks.push({ kind: 'rune', id: runes[0] });
    picks.push(rng.pick<Pick>([{ kind: 'maxhp', n: 2 }, { kind: 'heal', n: 3 }, { kind: 'mana', n: 20 }]));
  } else {
    for (const id of runes.slice(0, 3)) picks.push({ kind: 'rune', id });
    if (kind === 'elite' && spells.length && picks.length < 3) picks.push({ kind: 'spell', id: spells[0] });
    if (kind === 'boss' || !picks.length) picks.push({ kind: 'maxhp', n: 3 });
  }
  return { gold, picks };
}

export function shrinePicks(run: RunState, meta: Meta): Pick[] {
  const rng = rngFor(run, 'shrine', run.act, run.step);
  const spells = rng.shuffle(spellPool(run));
  const runes = rng.shuffle(runePool(run, meta));
  const picks: Pick[] = [];
  if (spells.length) picks.push({ kind: 'spell', id: spells[0] });
  if (runes.length) picks.push({ kind: 'rune', id: runes[0] });
  if (picks.length < 2 && runes.length > 1) picks.push({ kind: 'rune', id: runes[1] });
  picks.push({ kind: 'heal', n: 4 });
  return picks;
}

export function applyPick(run: RunState, p: Pick): void {
  if (p.kind === 'spell' && !run.spells.includes(p.id)) run.spells = SPELL_ORDER.filter((s) => s === p.id || run.spells.includes(s));
  else if (p.kind === 'rune' && !run.runes.includes(p.id)) run.runes.push(p.id);
  else if (p.kind === 'maxhp') {
    run.maxHp += p.n;
    run.hp += p.n;
  } else if (p.kind === 'heal') run.hp = Math.min(run.maxHp, run.hp + p.n);
  else if (p.kind === 'mana') run.maxMana += p.n;
}

export function makeShop(run: RunState, meta: Meta): ShopItem[] {
  const rng = rngFor(run, 'shop', run.act, run.step);
  const runes = rng.shuffle(runePool(run, meta));
  const spells = rng.shuffle(spellPool(run));
  const items: ShopItem[] = [];
  for (const id of runes.slice(0, 2)) items.push({ pick: { kind: 'rune', id }, cost: rng.int(55, 75), sold: false });
  if (spells.length) items.push({ pick: { kind: 'spell', id: spells[0] }, cost: rng.int(50, 65), sold: false });
  items.push({ pick: { kind: 'heal', n: 3 }, cost: 25, sold: false });
  items.push({ pick: { kind: 'maxhp', n: 2 }, cost: 45, sold: false });
  items.push({ pick: { kind: 'mana', n: 20 }, cost: 35, sold: false });
  return items;
}

export function wpm(s: Stats): number {
  return s.time > 0 ? Math.round(s.keys / 5 / (s.time / 60)) : 0;
}

export function accuracyOf(s: Stats): number {
  const n = s.keys + s.typos;
  return n ? s.keys / n : 1;
}

export function score(run: RunState, victory: boolean): number {
  const s = run.stats;
  return Math.round(s.words * 3 + s.kills * 4 + run.gold + run.act * 300 + s.bestCombo * 5 + accuracyOf(s) * 300 + (victory ? 1500 : 0));
}

export const shardsFor = (sc: number): number => Math.floor(sc / 70);

export const unlockCost = (id: string): number => UNLOCKS.find((u) => u.id === id)?.cost ?? 99;

// ---------- Save data ----------

const RUN_KEY = 'keymage.run';
const META_KEY = 'keymage.meta';

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage full or blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunState;
    return r && r.v === 1 && Array.isArray(r.map) ? r : null;
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
  const base: Meta = { runs: 0, wins: 0, bestAct: 0, best: 0, bestWpm: 0, shards: 0, unlocked: [], diff: 'normal', bestBy: {}, winsBy: {} };
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
