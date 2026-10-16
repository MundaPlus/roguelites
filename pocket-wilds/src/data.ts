/** Static game data: types, moves, species, items, regions and leaders. */

export type Type = 'fire' | 'water' | 'nature' | 'storm' | 'stone' | 'frost' | 'spirit' | 'beast';
export type Status = 'brn' | 'psn' | 'slp' | 'par';
export type StatKey = 'hp' | 'atk' | 'def' | 'spd';

export const TYPES: Type[] = ['fire', 'water', 'nature', 'storm', 'stone', 'frost', 'spirit', 'beast'];

export const TYPE_INFO: Record<Type, { name: string; icon: string; color: string }> = {
  fire: { name: 'Fire', icon: '🔥', color: '#ff7b3a' },
  water: { name: 'Water', icon: '💧', color: '#3a8dff' },
  nature: { name: 'Nature', icon: '🌿', color: '#4fcf7d' },
  storm: { name: 'Storm', icon: '⚡', color: '#f7cf2a' },
  stone: { name: 'Stone', icon: '🪨', color: '#b8926a' },
  frost: { name: 'Frost', icon: '❄️', color: '#86dcf0' },
  spirit: { name: 'Spirit', icon: '👻', color: '#a66bff' },
  beast: { name: 'Beast', icon: '🐾', color: '#b4bcc6' },
};

/** Attack type -> defend type -> multiplier. Missing entries are 1. */
export const CHART: Record<Type, Partial<Record<Type, number>>> = {
  fire: { nature: 2, frost: 2, water: 0.5, stone: 0.5, fire: 0.5 },
  water: { fire: 2, stone: 2, nature: 0.5, water: 0.5 },
  nature: { water: 2, stone: 2, fire: 0.5, nature: 0.5 },
  storm: { water: 2, frost: 2, stone: 0.5, storm: 0.5, nature: 0.5 },
  stone: { fire: 2, storm: 2, frost: 2, nature: 0.5, stone: 0.5 },
  frost: { nature: 2, beast: 2, fire: 0.5, frost: 0.5, water: 0.5 },
  spirit: { spirit: 2, beast: 2, stone: 0.5 },
  beast: { spirit: 0.5, stone: 0.5 },
};

export function effectiveness(atk: Type, def: readonly Type[]): number {
  return def.reduce((m, t) => m * (CHART[atk][t] ?? 1), 1);
}

export const STATUS_INFO: Record<Status, { name: string; short: string; color: string; text: string }> = {
  brn: { name: 'Burn', short: 'BRN', color: '#ff7b3a', text: 'Loses 1/16 of max HP each turn. Attack is halved.' },
  psn: { name: 'Poison', short: 'PSN', color: '#b65cff', text: 'Loses 1/8 of max HP each turn.' },
  slp: { name: 'Sleep', short: 'SLP', color: '#8aa0c8', text: 'Cannot act for 1 to 3 turns.' },
  par: { name: 'Paralysis', short: 'PAR', color: '#f7cf2a', text: 'Speed is halved. 25% chance to lose the turn.' },
};

// ---------- Moves ----------

export interface MoveDef {
  id: string;
  name: string;
  type: Type;
  /** 0 for status moves. */
  power: number;
  /** Hit chance in percent. Moves that target the user always hit. */
  acc: number;
  prio?: number;
  /** Chance in percent to give a status to the target. */
  status?: [Status, number];
  /** Stage change on the user. */
  self?: [Exclude<StatKey, 'hp'>, number];
  /** Stage change on the target, with a chance in percent. */
  foe?: [Exclude<StatKey, 'hp'>, number, number];
  /** Heals this share of the damage dealt. */
  drain?: number;
  /** Heals this share of max HP. */
  heal?: number;
  /** Takes this share of the damage dealt as recoil. */
  recoil?: number;
  highCrit?: boolean;
  text?: string;
}

const M = (id: string, name: string, type: Type, power: number, acc: number, extra: Partial<MoveDef> = {}): MoveDef => ({ id, name, type, power, acc, ...extra });

const MOVE_LIST: MoveDef[] = [
  // Fire
  M('ember', 'Ember', 'fire', 40, 100, { status: ['brn', 10] }),
  M('scorchhaze', 'Scorch Haze', 'fire', 0, 85, { status: ['brn', 100] }),
  M('flamelash', 'Flame Lash', 'fire', 65, 95, { status: ['brn', 10] }),
  M('heathowl', 'Heat Howl', 'fire', 0, 100, { self: ['atk', 1] }),
  M('infernorush', 'Inferno Rush', 'fire', 90, 90, { status: ['brn', 20] }),
  M('sunflare', 'Sun Flare', 'fire', 115, 75),
  // Water
  M('splashjet', 'Splash Jet', 'water', 40, 100),
  M('bubblering', 'Bubble Ring', 'water', 55, 100, { foe: ['spd', -1, 30] }),
  M('mistveil', 'Mist Veil', 'water', 0, 100, { heal: 0.5 }),
  M('tidecrash', 'Tide Crash', 'water', 80, 95),
  M('deluge', 'Deluge', 'water', 110, 80),
  // Nature
  M('leafnip', 'Leaf Nip', 'nature', 40, 100),
  M('sporepuff', 'Spore Puff', 'nature', 0, 75, { status: ['slp', 100] }),
  M('sapdrain', 'Sap Drain', 'nature', 55, 100, { drain: 0.5 }),
  M('toxicpollen', 'Toxic Pollen', 'nature', 0, 90, { status: ['psn', 100] }),
  M('vinesnap', 'Vine Snap', 'nature', 70, 100),
  M('thornstorm', 'Thorn Storm', 'nature', 95, 90, { status: ['psn', 10] }),
  // Storm
  M('staticjab', 'Static Jab', 'storm', 40, 100, { status: ['par', 10] }),
  M('quickzap', 'Quick Zap', 'storm', 40, 100, { prio: 1 }),
  M('joltwave', 'Jolt Wave', 'storm', 0, 90, { status: ['par', 100] }),
  M('sparkbolt', 'Spark Bolt', 'storm', 65, 100, { status: ['par', 10] }),
  M('galecut', 'Gale Cut', 'storm', 70, 95, { highCrit: true }),
  M('thunderlance', 'Thunder Lance', 'storm', 100, 80, { status: ['par', 30] }),
  // Stone
  M('pebbletoss', 'Pebble Toss', 'stone', 40, 100),
  M('ironshell', 'Iron Shell', 'stone', 0, 100, { self: ['def', 2] }),
  M('rockslam', 'Rock Slam', 'stone', 70, 90, { foe: ['spd', -1, 20] }),
  M('quakestomp', 'Quake Stomp', 'stone', 90, 90),
  M('landslide', 'Landslide', 'stone', 115, 75),
  // Frost
  M('frostnip', 'Frost Nip', 'frost', 40, 100),
  M('hailshard', 'Hail Shard', 'frost', 40, 100, { prio: 1 }),
  M('chillmist', 'Chill Mist', 'frost', 0, 95, { foe: ['atk', -1, 100] }),
  M('icefang', 'Ice Fang', 'frost', 70, 95, { foe: ['spd', -1, 20] }),
  M('blizzardhowl', 'Blizzard Howl', 'frost', 100, 80),
  // Spirit
  M('hextouch', 'Hex Touch', 'spirit', 40, 100),
  M('nightlull', 'Night Lull', 'spirit', 0, 65, { status: ['slp', 100] }),
  M('souldrain', 'Soul Drain', 'spirit', 60, 100, { drain: 0.5 }),
  M('cursemark', 'Curse Mark', 'spirit', 0, 90, { status: ['psn', 100] }),
  M('shadowclaw', 'Shadow Claw', 'spirit', 75, 100, { highCrit: true }),
  M('phantomrift', 'Phantom Rift', 'spirit', 100, 85),
  // Beast
  M('tackle', 'Tackle', 'beast', 40, 100),
  M('quickpaw', 'Quick Paw', 'beast', 40, 100, { prio: 1 }),
  M('roarup', 'Roar Up', 'beast', 0, 100, { self: ['atk', 2] }),
  M('venomfang', 'Venom Fang', 'beast', 55, 100, { status: ['psn', 30] }),
  M('crunchbite', 'Crunch Bite', 'beast', 75, 100, { foe: ['def', -1, 20] }),
  M('restden', 'Rest Den', 'beast', 0, 100, { heal: 0.5 }),
  M('wildcharge', 'Wild Charge', 'beast', 105, 100, { recoil: 0.25 }),
];

export const MOVES: Record<string, MoveDef> = Object.fromEntries(MOVE_LIST.map((m) => [m.id, m]));

export function moveText(m: MoveDef): string {
  const parts: string[] = [];
  if (m.prio) parts.push('Goes first.');
  if (m.status) parts.push(m.status[1] >= 100 ? `Gives ${STATUS_INFO[m.status[0]].name}.` : `${m.status[1]}% chance of ${STATUS_INFO[m.status[0]].name}.`);
  if (m.self) parts.push(`Raises own ${m.self[0].toUpperCase()} by ${m.self[1]}.`);
  if (m.foe) parts.push(`${m.foe[2] >= 100 ? '' : `${m.foe[2]}%: `}lowers foe ${m.foe[0].toUpperCase()} by ${-m.foe[1]}.`);
  if (m.drain) parts.push('Heals half the damage dealt.');
  if (m.heal) parts.push('Heals half of max HP.');
  if (m.recoil) parts.push('Takes 1/4 of the damage as recoil.');
  if (m.highCrit) parts.push('High crit chance.');
  return parts.join(' ') || 'Plain hit.';
}

/** Move lists per type, in the order a creature learns them. */
const TYPE_MOVES: Record<Type, string[]> = TYPES.reduce(
  (acc, t) => {
    acc[t] = MOVE_LIST.filter((m) => m.type === t).map((m) => m.id);
    return acc;
  },
  {} as Record<Type, string[]>,
);

// ---------- Species ----------

export interface SpeciesDef {
  id: string;
  name: string;
  icon: string;
  types: Type[];
  /** Base stats: hp, atk, def, spd. */
  base: [number, number, number, number];
  /** Base catch rate, 0..1. */
  rate: number;
  evo?: { to: string; lvl: number };
  /** Second move pool. Creatures also learn moves of this type. */
  cover: Type;
  learn: [number, string][];
  /** Evolution stage: 1, 2 or 3. */
  stage: number;
  xp: number;
}

const PRIMARY_LV = [1, 6, 11, 17, 23, 29, 36];
const COVER_LV = [1, 9, 20, 30];

function makeLearnset(types: Type[], cover: Type): [number, string][] {
  const out: [number, string][] = [];
  // Attacks come first; status moves come at the 3rd and 5th slot.
  const all = TYPE_MOVES[types[0]];
  const hits = all.filter((id) => MOVES[id].power > 0).sort((a, b) => MOVES[a].power - MOVES[b].power);
  const stats = all.filter((id) => MOVES[id].power === 0);
  const order = [hits[0], hits[1], stats[0], hits[2], stats[1], ...hits.slice(3)].filter((id): id is string => !!id);
  order.forEach((id, i) => out.push([PRIMARY_LV[Math.min(i, PRIMARY_LV.length - 1)] + Math.max(0, i - PRIMARY_LV.length + 1) * 6, id]));
  const second = types[1] ?? cover;
  const pool = TYPE_MOVES[second].filter((id) => !out.some(([, m]) => m === id));
  // Learn the second pool from the strongest plain hits and one status move.
  const hits2 = pool.filter((id) => MOVES[id].power > 0).sort((a, b) => MOVES[a].power - MOVES[b].power);
  const picks = [hits2[0], hits2[1], hits2[hits2.length - 2], pool.find((id) => MOVES[id].power === 0)].filter(
    (id, i, a): id is string => !!id && a.indexOf(id) === i,
  );
  picks.slice(0, 4).forEach((id, i) => out.push([COVER_LV[i] + (i === 0 ? 0 : 1), id]));
  return out.sort((a, b) => a[0] - b[0]);
}

const SPECIES_LIST: SpeciesDef[] = [];
function S(id: string, name: string, icon: string, types: Type[], base: [number, number, number, number], rate: number, cover: Type, evo?: [string, number]): void {
  const bst = base.reduce((a, b) => a + b, 0);
  SPECIES_LIST.push({ id, name, icon, types, base, rate, cover, evo: evo ? { to: evo[0], lvl: evo[1] } : undefined, learn: makeLearnset(types, cover), stage: 1, xp: Math.round(bst / 4) });
}

// Fire
S('emberkit', 'Emberkit', '🦊', ['fire'], [44, 54, 42, 62], 0.45, 'beast', ['blazewolf', 16]);
S('blazewolf', 'Blazewolf', '🐺', ['fire'], [66, 76, 60, 84], 0.3, 'beast', ['solfang', 32]);
S('solfang', 'Solfang', '🐅', ['fire', 'beast'], [86, 104, 78, 100], 0.15, 'beast');
S('cinderling', 'Cinderling', '🦎', ['fire'], [46, 50, 52, 46], 0.5, 'stone', ['magmadrake', 20]);
S('magmadrake', 'Magmadrake', '🐉', ['fire', 'stone'], [80, 92, 88, 62], 0.25, 'stone');
S('kilnmoth', 'Kilnmoth', '🦋', ['fire'], [58, 70, 52, 88], 0.4, 'spirit');
// Water
S('finnip', 'Finnip', '🐟', ['water'], [50, 48, 52, 52], 0.45, 'beast', ['tidalfin', 16]);
S('tidalfin', 'Tidalfin', '🐬', ['water'], [70, 70, 72, 74], 0.3, 'frost', ['leviathorn', 32]);
S('leviathorn', 'Leviathorn', '🐋', ['water', 'frost'], [100, 94, 96, 70], 0.15, 'frost');
S('puddlet', 'Puddlet', '🐸', ['water'], [48, 46, 44, 56], 0.55, 'nature', ['torrentoad', 18]);
S('torrentoad', 'Torrentoad', '🐊', ['water'], [80, 84, 76, 58], 0.3, 'beast');
S('shellby', 'Shellby', '🐢', ['water'], [70, 64, 96, 34], 0.45, 'stone');
S('squidle', 'Squidle', '🦑', ['water', 'spirit'], [62, 70, 56, 80], 0.4, 'spirit');
// Nature
S('sproutle', 'Sproutle', '🌱', ['nature'], [48, 49, 52, 46], 0.45, 'beast', ['thornback', 16]);
S('thornback', 'Thornback', '🦔', ['nature'], [70, 74, 78, 60], 0.3, 'stone', ['elderoak', 32]);
S('elderoak', 'Elderoak', '🌳', ['nature', 'stone'], [104, 98, 100, 56], 0.15, 'stone');
S('budbun', 'Budbun', '🐰', ['nature'], [42, 46, 40, 70], 0.55, 'beast', ['bloomhare', 18]);
S('bloomhare', 'Bloomhare', '🐇', ['nature'], [68, 80, 60, 96], 0.3, 'beast');
S('fungoo', 'Fungoo', '🍄', ['nature'], [72, 58, 66, 30], 0.5, 'spirit');
// Storm
S('zappip', 'Zappip', '🐁', ['storm'], [40, 52, 36, 80], 0.45, 'beast', ['voltmouse', 18]);
S('voltmouse', 'Voltmouse', '🐹', ['storm'], [62, 88, 56, 112], 0.25, 'beast');
S('gustling', 'Gustling', '🐦', ['storm'], [42, 46, 40, 66], 0.55, 'beast', ['thunderhawk', 20]);
S('thunderhawk', 'Thunderhawk', '🦅', ['storm'], [76, 92, 66, 102], 0.25, 'frost');
S('staticat', 'Staticat', '🐱', ['storm', 'beast'], [56, 62, 52, 78], 0.4, 'beast');
// Stone
S('pebblet', 'Pebblet', '🗿', ['stone'], [52, 56, 76, 26], 0.45, 'beast', ['boulderox', 20]);
S('boulderox', 'Boulderox', '🦏', ['stone'], [86, 96, 110, 36], 0.25, 'beast');
S('burrowbit', 'Burrowbit', '🦫', ['stone'], [66, 74, 70, 50], 0.4, 'water');
S('geodon', 'Geodon', '🦕', ['stone', 'nature'], [92, 102, 96, 52], 0.12, 'nature');
// Frost
S('snowpup', 'Snowpup', '🐧', ['frost'], [52, 46, 52, 54], 0.5, 'water', ['glacieron', 20]);
S('glacieron', 'Glacieron', '🦭', ['frost', 'water'], [88, 80, 86, 60], 0.25, 'water');
S('rimebear', 'Rimebear', '🐻‍❄️', ['frost'], [74, 88, 70, 52], 0.35, 'beast');
S('snowswan', 'Snowswan', '🦢', ['frost'], [62, 70, 60, 84], 0.4, 'storm');
// Spirit
S('wispet', 'Wispet', '👻', ['spirit'], [40, 56, 40, 72], 0.45, 'storm', ['phantowl', 22]);
S('phantowl', 'Phantowl', '🦉', ['spirit', 'storm'], [72, 92, 70, 96], 0.25, 'storm');
S('gloomcat', 'Gloomcat', '🐈‍⬛', ['spirit'], [56, 72, 50, 86], 0.4, 'beast');
S('hexbat', 'Hexbat', '🦇', ['spirit'], [46, 50, 40, 76], 0.55, 'beast');
S('lanternwisp', 'Lanternwisp', '🏮', ['spirit', 'fire'], [78, 96, 72, 96], 0.12, 'fire');
// Beast
S('scrapling', 'Scrapling', '🐿️', ['beast'], [46, 52, 40, 62], 0.6, 'nature', ['brawlbadger', 18]);
S('brawlbadger', 'Brawlbadger', '🦡', ['beast'], [76, 88, 66, 76], 0.3, 'stone');
S('hornbuck', 'Hornbuck', '🦌', ['beast'], [62, 72, 56, 72], 0.45, 'nature');
S('tuskhog', 'Tuskhog', '🐗', ['beast'], [64, 68, 60, 44], 0.5, 'stone');
S('mightape', 'Mightape', '🦍', ['beast'], [88, 98, 74, 58], 0.2, 'stone');
S('apexion', 'Apexion', '🦁', ['beast', 'fire'], [96, 110, 84, 96], 0.12, 'fire');

for (const s of SPECIES_LIST) {
  if (s.evo) {
    const to = SPECIES_LIST.find((x) => x.id === s.evo!.to)!;
    to.stage = s.stage + 1;
  }
}

export const SPECIES: Record<string, SpeciesDef> = Object.fromEntries(SPECIES_LIST.map((s) => [s.id, s]));
export const SPECIES_IDS = SPECIES_LIST.map((s) => s.id);

/** The species a creature of this line is at this level. */
export function formAt(id: string, lvl: number): string {
  let s = SPECIES[id];
  while (s.evo && lvl >= s.evo.lvl) s = SPECIES[s.evo.to];
  return s.id;
}

/** The first form of a line. */
export function baseForm(id: string): string {
  const prev = SPECIES_LIST.find((s) => s.evo?.to === id);
  return prev ? baseForm(prev.id) : id;
}

// ---------- Natures ----------

export const NATURES: { name: string; up: StatKey | null; down: StatKey | null }[] = [
  { name: 'Hardy', up: null, down: null },
  { name: 'Brave', up: 'atk', down: 'spd' },
  { name: 'Bold', up: 'def', down: 'atk' },
  { name: 'Timid', up: 'spd', down: 'atk' },
  { name: 'Adamant', up: 'atk', down: 'def' },
  { name: 'Careful', up: 'def', down: 'spd' },
  { name: 'Hasty', up: 'spd', down: 'def' },
  { name: 'Sturdy', up: 'hp', down: 'spd' },
];

// ---------- Items ----------

export type ItemId = 'potion' | 'tonic' | 'cure' | 'charm' | 'greatcharm' | 'primecharm' | 'candy';

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  price: number;
  text: string;
  /** Charm strength for taming. */
  charm?: number;
  battle: boolean;
  field: boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  potion: { id: 'potion', name: 'Potion', icon: '🧪', price: 100, text: 'Heals half of max HP (at least 20).', battle: true, field: true },
  tonic: { id: 'tonic', name: 'Big Tonic', icon: '💖', price: 280, text: 'Heals all HP and cures status.', battle: true, field: true },
  cure: { id: 'cure', name: 'Cure Leaf', icon: '🍃', price: 70, text: 'Cures burn, poison, sleep and paralysis.', battle: true, field: true },
  charm: { id: 'charm', name: 'Charm', icon: '🔮', price: 80, text: 'Tames a weak wild creature. Strength ×1.', charm: 1, battle: true, field: false },
  greatcharm: { id: 'greatcharm', name: 'Great Charm', icon: '💠', price: 220, text: 'A better charm. Strength ×1.8.', charm: 1.8, battle: true, field: false },
  primecharm: { id: 'primecharm', name: 'Prime Charm', icon: '🌟', price: 500, text: 'The best charm. Strength ×3.', charm: 3, battle: true, field: false },
  candy: { id: 'candy', name: 'Rare Candy', icon: '🍬', price: 450, text: 'Raises a creature by 1 level.', battle: false, field: true },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

// ---------- Regions ----------

export interface RegionDef {
  name: string;
  icon: string;
  text: string;
  /** Wild level range. */
  lvl: [number, number];
  pool: string[];
  rare: string[];
  bg: string;
}

export const REGIONS: RegionDef[] = [
  {
    name: 'Mossvale',
    icon: '🌲',
    text: 'Soft meadows and mossy woods.',
    lvl: [3, 6],
    pool: ['budbun', 'scrapling', 'gustling', 'puddlet', 'sproutle', 'hexbat', 'fungoo', 'zappip', 'emberkit', 'finnip'],
    rare: ['hornbuck', 'staticat', 'kilnmoth'],
    bg: '#1c3a26',
  },
  {
    name: 'Tidecoast',
    icon: '🌊',
    text: 'Salt marsh, tide pools and cliffs.',
    lvl: [8, 12],
    pool: ['puddlet', 'shellby', 'snowpup', 'gustling', 'squidle', 'tuskhog', 'finnip', 'zappip', 'scrapling', 'cinderling'],
    rare: ['staticat', 'snowswan', 'burrowbit'],
    bg: '#16314a',
  },
  {
    name: 'Emberpeak',
    icon: '🌋',
    text: 'Ash fields around a sleeping volcano.',
    lvl: [13, 18],
    pool: ['cinderling', 'kilnmoth', 'pebblet', 'burrowbit', 'tuskhog', 'gloomcat', 'emberkit', 'hornbuck', 'wispet'],
    rare: ['magmadrake', 'brawlbadger', 'mightape'],
    bg: '#3a1e16',
  },
  {
    name: 'Frostveil',
    icon: '🏔️',
    text: 'Snow forests and frozen lakes.',
    lvl: [22, 27],
    pool: ['snowswan', 'rimebear', 'glacieron', 'gloomcat', 'thunderhawk', 'tidalfin', 'bloomhare', 'phantowl', 'squidle'],
    rare: ['voltmouse', 'torrentoad', 'mightape'],
    bg: '#1d2d40',
  },
  {
    name: 'Skyreach',
    icon: '⛰️',
    text: 'The high road to the Champion.',
    lvl: [29, 34],
    pool: ['magmadrake', 'boulderox', 'thunderhawk', 'torrentoad', 'brawlbadger', 'rimebear', 'phantowl', 'bloomhare', 'mightape', 'voltmouse'],
    rare: ['solfang', 'leviathorn', 'elderoak'],
    bg: '#2a2340',
  },
];

/** Species that join the wild pools when unlocked in the Sanctuary. */
export const RARE_UNLOCKS = ['lanternwisp', 'geodon', 'apexion'];
export const STARTERS = ['emberkit', 'finnip', 'sproutle'];
export const STARTER_UNLOCKS = ['zappip', 'pebblet', 'wispet'];

export interface LeaderDef {
  name: string;
  icon: string;
  type: Type;
  title: string;
  team: string[];
}

export const LEADERS: LeaderDef[] = [
  { name: 'Ivy', icon: '👩‍🌾', type: 'nature', title: 'Verdant Gym', team: ['budbun', 'fungoo', 'sproutle', 'bloomhare'] },
  { name: 'Marlo', icon: '🧔', type: 'water', title: 'Tide Gym', team: ['puddlet', 'shellby', 'squidle', 'finnip'] },
  { name: 'Volta', icon: '👩‍🔬', type: 'storm', title: 'Spark Gym', team: ['gustling', 'staticat', 'zappip', 'thunderhawk'] },
  { name: 'Brask', icon: '👨‍🚒', type: 'fire', title: 'Cinder Gym', team: ['cinderling', 'kilnmoth', 'emberkit', 'magmadrake'] },
  { name: 'Petra', icon: '👷‍♀️', type: 'stone', title: 'Bedrock Gym', team: ['pebblet', 'burrowbit', 'geodon', 'boulderox'] },
  { name: 'Nyx', icon: '🧛', type: 'spirit', title: 'Dusk Gym', team: ['hexbat', 'gloomcat', 'lanternwisp', 'wispet'] },
  { name: 'Yuki', icon: '⛷️', type: 'frost', title: 'Glacier Gym', team: ['snowpup', 'snowswan', 'rimebear', 'glacieron'] },
];

export const CHAMPION = {
  name: 'Champion Aurel',
  icon: '🤴',
  team: ['apexion', 'mightape', 'leviathorn', 'solfang', 'elderoak', 'phantowl', 'voltmouse', 'magmadrake', 'glacieron'],
};

/** Gym level per tier (ace is +1), and the champion level. */
export const GYM_LVL = [7, 12, 20, 28];
export const CHAMP_LVL = 33;

export const TRAINERS: { name: string; icon: string }[] = [
  { name: 'Hiker Bo', icon: '🧗' },
  { name: 'Swimmer Lia', icon: '🏊' },
  { name: 'Ranger Tam', icon: '🧑‍🌾' },
  { name: 'Scholar Ode', icon: '🧙' },
  { name: 'Kid Pim', icon: '🧒' },
  { name: 'Ace Rex', icon: '🧑‍🎤' },
  { name: 'Biker Jo', icon: '🚴' },
  { name: 'Painter Sol', icon: '🧑‍🎨' },
  { name: 'Guard Fen', icon: '💂' },
  { name: 'Cook Mira', icon: '🧑‍🍳' },
];
