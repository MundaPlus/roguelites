/** Run state, the district map, shops, rewards, score, meta progress and saving. */
import { DISTRICTS, FIGHTERS, PERKS, PERK_IDS, PRICES, SPECIALS, SPECIAL_IDS, WEAPONS, WEAPON_IDS } from './data';
import { Rng, hash } from './rng';
import type { StageKind, StageOpts } from './game';

export type NodeKind = 'street' | 'alley' | 'shop' | 'diner' | 'boss';

export interface MapNode {
  kind: NodeKind;
  name: string;
}

export const NODE_INFO: Record<NodeKind, { icon: string; name: string; text: string }> = {
  street: { icon: '🥊', name: 'Street', text: 'A normal fight: 3 waves.' },
  alley: { icon: '💀', name: 'Tough street', text: 'More enemies at once. +50% cash, more crates.' },
  shop: { icon: '🛒', name: 'Shop', text: 'Buy food, moves, upgrades and weapons.' },
  diner: { icon: '🍜', name: 'Diner', text: 'Eat to heal, or train for more max HP.' },
  boss: { icon: '👑', name: 'Boss', text: 'The district boss and its gang.' },
};

export const COLS = 5;

export type ShopKind = 'food' | 'feast' | 'maxhp' | 'life' | 'perk' | 'special' | 'weapon';

export interface ShopItem {
  kind: ShopKind;
  id: string;
  cost: number;
  sold: boolean;
}

export type RunAt = 'map' | 'play' | 'shop' | 'diner' | 'reward';

export interface RunState {
  v: 1;
  seed: string;
  fighter: string;
  hp: number;
  maxHp: number;
  cash: number;
  lives: number;
  perks: Record<string, number>;
  specials: string[];
  weapon: string | null;
  district: number;
  col: number;
  /** Chosen node index per column in the current district. */
  path: number[];
  at: RunAt;
  shop: ShopItem[] | null;
  reward: string[] | null;
  kills: number;
  maxCombo: number;
  cashEarned: number;
  fights: number;
  dmgTaken: number;
  won: boolean;
}

export interface Meta {
  stars: number;
  unlocked: string[];
  runs: number;
  wins: number;
  bestDistrict: number;
  best: number;
  kills: number;
  bestCombo: number;
}

const RUN_KEY = 'sb.run';
const META_KEY = 'sb.meta';

export function newRun(seed: string, fighter: string): RunState {
  const f = FIGHTERS[fighter];
  return {
    v: 1,
    seed,
    fighter,
    hp: f.hp,
    maxHp: f.hp,
    cash: 0,
    lives: 0,
    perks: {},
    specials: [f.special],
    weapon: null,
    district: 0,
    col: 0,
    path: [],
    at: 'map',
    shop: null,
    reward: null,
    kills: 0,
    maxCombo: 0,
    cashEarned: 0,
    fights: 0,
    dmgTaken: 0,
    won: false,
  };
}

export function rngFor(r: RunState, ...parts: (string | number)[]): Rng {
  return new Rng(hash(r.seed, ...parts));
}

/** The branching streets of one district. Column 4 is always the boss. */
export function districtMap(r: RunState, d: number): MapNode[][] {
  const rng = rngFor(r, 'map', d);
  const dist = DISTRICTS[d];
  const streets = rng.shuffle(dist.streets.slice());
  const alleys = rng.shuffle(dist.alleys.slice());
  let si = 0;
  let ai = 0;
  const st = (): MapNode => ({ kind: 'street', name: streets[si++ % streets.length] });
  const al = (): MapNode => ({ kind: 'alley', name: alleys[ai++ % alleys.length] });
  const shop: MapNode = { kind: 'shop', name: rng.pick(['Pawn Shop', 'Corner Store', 'Gym', 'Black Market']) };
  const diner: MapNode = { kind: 'diner', name: rng.pick(["Lou's Diner", 'Noodle Bar', 'Taco Truck', 'Burger Joint']) };
  const col1 = rng.chance(0.5) ? [st(), { ...shop }] : [al(), { ...shop }];
  return [rng.shuffle([st(), al()]), col1, rng.shuffle([st(), al()]), [{ ...shop, name: rng.pick(['Arcade Shop', 'Hardware Store', 'Dojo Shop']) }, diner], [{ kind: 'boss', name: `${dist.name} Boss` }]];
}

export function currentNode(r: RunState): MapNode | null {
  const i = r.path[r.col];
  if (i === undefined) return null;
  return districtMap(r, r.district)[r.col][i] ?? null;
}

export function stageOpts(r: RunState, node: MapNode): StageOpts {
  return {
    seed: hash(r.seed, 'stage', r.district, r.col, node.name),
    district: r.district,
    kind: node.kind as StageKind,
    name: node.name,
    fighter: r.fighter,
    hp: r.hp,
    maxHp: r.maxHp,
    perks: { ...r.perks },
    specials: r.specials.slice(),
    weapon: r.weapon,
    lives: r.lives,
  };
}

export interface StageResult {
  hp: number;
  cash: number;
  kills: number;
  maxCombo: number;
  lives: number;
  weapon: string | null;
  dmgTaken: number;
}

/** Apply a cleared stage. Returns the clear bonus. */
export function applyClear(r: RunState, res: StageResult, boss: boolean): number {
  const bonus = boss ? 40 + 15 * r.district : 8 + 4 * r.district;
  r.hp = res.hp;
  r.lives = res.lives;
  r.weapon = res.weapon;
  r.cash += res.cash + bonus;
  r.cashEarned += res.cash + bonus;
  r.kills += res.kills;
  r.maxCombo = Math.max(r.maxCombo, res.maxCombo);
  r.dmgTaken += res.dmgTaken;
  r.fights++;
  return bonus;
}

export function applyDeath(r: RunState, res: StageResult): void {
  r.hp = 0;
  r.cash += res.cash;
  r.cashEarned += res.cash;
  r.kills += res.kills;
  r.maxCombo = Math.max(r.maxCombo, res.maxCombo);
  r.dmgTaken += res.dmgTaken;
}

/** Move to the next column, or the next district after the boss. */
export function advance(r: RunState): 'map' | 'reward' | 'win' {
  r.col++;
  r.shop = null;
  if (r.col >= COLS) {
    r.reward = perkOffer(r, 3, 'reward');
    r.at = 'reward';
    return 'reward';
  }
  r.at = 'map';
  return 'map';
}

export function nextDistrict(r: RunState): 'map' | 'win' {
  r.reward = null;
  r.district++;
  r.col = 0;
  r.path = [];
  if (r.district >= DISTRICTS.length) {
    r.won = true;
    return 'win';
  }
  r.at = 'map';
  return 'map';
}

export function perkOffer(r: RunState, n: number, tag: string): string[] {
  const rng = rngFor(r, tag, r.district, r.col);
  const opts = PERK_IDS.filter((id) => (r.perks[id] ?? 0) < PERKS[id].max);
  return rng.shuffle(opts).slice(0, n);
}

export function addPerk(r: RunState, id: string): void {
  r.perks[id] = (r.perks[id] ?? 0) + 1;
}

const scale = (r: RunState, c: number): number => Math.round(c * (1 + 0.15 * r.district));

export function makeShop(r: RunState): ShopItem[] {
  const rng = rngFor(r, 'shop', r.district, r.col);
  const items: ShopItem[] = [];
  items.push({ kind: 'food', id: 'food', cost: scale(r, PRICES.food), sold: false });
  items.push({ kind: 'feast', id: 'feast', cost: scale(r, PRICES.feast), sold: false });
  items.push({ kind: 'maxhp', id: 'maxhp', cost: scale(r, PRICES.maxhp), sold: false });
  if (r.lives < 2) items.push({ kind: 'life', id: 'life', cost: scale(r, PRICES.life), sold: false });
  const specials = rng.shuffle(SPECIAL_IDS.filter((id) => !r.specials.includes(id)));
  if (specials.length) items.push({ kind: 'special', id: specials[0], cost: scale(r, PRICES.special), sold: false });
  for (const id of perkOffer(r, 3, 'shop-perk')) items.push({ kind: 'perk', id, cost: scale(r, PERKS[id].cost), sold: false });
  items.push({ kind: 'weapon', id: rng.pick(WEAPON_IDS), cost: scale(r, PRICES.weapon), sold: false });
  return items;
}

export function shopLabel(it: ShopItem): { icon: string; name: string; text: string } {
  switch (it.kind) {
    case 'food':
      return { icon: '🍔', name: 'Burger', text: 'Heal 35 HP.' };
    case 'feast':
      return { icon: '🍱', name: 'Feast', text: 'Heal to full HP.' };
    case 'maxhp':
      return { icon: '❤️', name: 'Protein Shake', text: '+20 max HP and heal 20.' };
    case 'life':
      return { icon: '🆙', name: 'Extra Life', text: 'Get back up once with 60% HP when you fall.' };
    case 'special': {
      const s = SPECIALS[it.id];
      return { icon: s.icon, name: `Move: ${s.name}`, text: `${s.text} Cooldown ${Math.round(s.cd / 60)} s.` };
    }
    case 'perk': {
      const p = PERKS[it.id];
      return { icon: p.icon, name: p.name, text: p.text };
    }
    case 'weapon': {
      const w = WEAPONS[it.id];
      return { icon: w.icon, name: `${w.name} to go`, text: `Start the next fight holding it. ${w.text}` };
    }
  }
}

/** Can the item be bought right now? */
export function canBuy(r: RunState, it: ShopItem): boolean {
  if (it.sold || r.cash < it.cost) return false;
  if ((it.kind === 'food' || it.kind === 'feast') && r.hp >= r.maxHp) return false;
  if (it.kind === 'life' && r.lives >= 2) return false;
  if (it.kind === 'perk' && (r.perks[it.id] ?? 0) >= PERKS[it.id].max) return false;
  if (it.kind === 'weapon' && r.weapon) return false;
  return true;
}

/** Buy an item. For a special with both slots full, `slot` picks the move to replace. */
export function buy(r: RunState, it: ShopItem, slot = -1): boolean {
  if (!canBuy(r, it)) return false;
  r.cash -= it.cost;
  it.sold = it.kind !== 'food';
  switch (it.kind) {
    case 'food':
      r.hp = Math.min(r.maxHp, r.hp + 35);
      break;
    case 'feast':
      r.hp = r.maxHp;
      break;
    case 'maxhp':
      r.maxHp += 20;
      r.hp += 20;
      break;
    case 'life':
      r.lives++;
      break;
    case 'perk':
      addPerk(r, it.id);
      break;
    case 'special':
      if (r.specials.length < 2) r.specials.push(it.id);
      else r.specials[slot >= 0 ? slot : 1] = it.id;
      break;
    case 'weapon':
      r.weapon = it.id;
      break;
  }
  return true;
}

export function dinerHeal(r: RunState): number {
  return Math.round(r.maxHp * 0.5);
}

export function score(r: RunState): number {
  return r.kills * 10 + r.cashEarned * 2 + r.district * 600 + r.maxCombo * 25 + (r.won ? 5000 : 0);
}

export function starsFor(r: RunState): number {
  return r.district * 4 + Math.floor(r.kills / 15) + (r.won ? 15 : 0);
}

export function unlockCost(id: string): number {
  return FIGHTERS[id].cost;
}

// ---------- Storage ----------

export function saveRun(r: RunState | null): void {
  try {
    if (r) localStorage.setItem(RUN_KEY, JSON.stringify(r));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunState;
    if (r.v !== 1 || !FIGHTERS[r.fighter] || r.specials.some((s) => !SPECIALS[s]) || Object.keys(r.perks).some((p) => !PERKS[p])) return null;
    return r;
  } catch {
    return null;
  }
}

export function loadMeta(): Meta {
  const base: Meta = { stars: 0, unlocked: ['rex'], runs: 0, wins: 0, bestDistrict: 0, best: 0, kills: 0, bestCombo: 0 };
  try {
    const m = { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
    if (!m.unlocked.includes('rex')) m.unlocked.push('rex');
    return m;
  } catch {
    return base;
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}
