/** Static game data: enemies, items, tiles, unlocks. */

export type Age = 'past' | 'fut';

export type FoeMove = 'guard' | 'patrol' | 'ranged' | 'anchor';

export interface FoeType {
  icon: string;
  name: string;
  hp: number;
  dmg: number;
  move: FoeMove;
  range?: number;
  text: string;
}

/** Enemy types. The same type can live in both ages: a descendant has the type of its ancestor. */
export const FOES: Record<string, FoeType> = {
  boar: { icon: '🐗', name: 'Boar', hp: 2, dmg: 1, move: 'guard', text: 'Stays on its tile. Hits a hero next to it.' },
  wolf: { icon: '🐺', name: 'Wolf', hp: 1, dmg: 1, move: 'patrol', text: 'Walks back and forth on its track.' },
  viper: { icon: '🐍', name: 'Viper', hp: 1, dmg: 2, move: 'guard', text: 'Stays on its tile. Bites hard.' },
  scorp: { icon: '🦂', name: 'Scorpion', hp: 2, dmg: 1, move: 'ranged', range: 2, text: 'Stings in a straight line up to 2 tiles.' },
  troll: { icon: '🧌', name: 'Troll', hp: 3, dmg: 2, move: 'guard', text: 'Elite. Stays on its tile. Hits hard.' },
  sentry: { icon: '🤖', name: 'Sentry', hp: 2, dmg: 1, move: 'guard', text: 'A future machine. Stays on its tile.' },
  bat: { icon: '🦇', name: 'Bat', hp: 1, dmg: 1, move: 'patrol', text: 'Flies back and forth on its track.' },
  spider: { icon: '🕷️', name: 'Spider', hp: 2, dmg: 1, move: 'patrol', text: 'Crawls back and forth on its track.' },
  beacon: { icon: '📡', name: 'Beacon', hp: 1, dmg: 1, move: 'ranged', range: 3, text: 'Shoots in a straight line up to 3 tiles.' },
  anchor: { icon: '🔮', name: 'Time Anchor', hp: 1, dmg: 0, move: 'anchor', text: 'Shields the boss in both ages. Break all anchors in the past.' },
};

/** Families that can have descendants. */
export const PAST_FAMILIES = ['boar', 'wolf', 'viper', 'scorp'];
export const GATE_FAMILIES = ['boar', 'viper'];
export const FUTURE_ONLY = ['sentry', 'bat', 'spider', 'beacon'];

export type ItemAge = 'past' | 'fut' | 'both';

export interface ItemDef {
  icon: string;
  name: string;
  age: ItemAge;
  text: string;
  /** Instant items apply at once and take no slot. They can repeat. */
  instant?: boolean;
  /** Needs an unlock in the Archive. */
  locked?: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
  seedbag: { icon: '🌰', name: 'Seed Bag', age: 'past', text: '+2 seeds on each floor.' },
  bronze: { icon: '🗡️', name: 'Bronze Sword', age: 'past', text: 'The past hero hits for +1.' },
  hide: { icon: '🛡️', name: 'Hide Shield', age: 'past', text: 'Blocks the first hit on the past hero each floor.' },
  meal: { icon: '🍖', name: "Hunter's Meal", age: 'past', text: 'Each enemy the past hero defeats heals 1 HP.' },
  rope: { icon: '🪢', name: 'Rope', age: 'fut', text: 'Once per floor, the future hero swings over one chasm or water tile.' },
  steel: { icon: '⚔️', name: 'Steel Blade', age: 'fut', text: 'The future hero hits for +1.' },
  coat: { icon: '🧥', name: 'Iron Coat', age: 'fut', text: 'Blocks the first hit on the future hero each floor.' },
  waders: { icon: '🥾', name: 'Waders', age: 'fut', text: 'The future hero can walk in water without harm.' },
  scav: { icon: '🪙', name: 'Scavenger Kit', age: 'fut', text: 'Chests give +3 gold.' },
  hourglass: { icon: '⏳', name: 'Hourglass', age: 'both', text: '+1 rewind on each floor.' },
  orchard: { icon: '🍎', name: 'Orchard Charm', age: 'both', text: 'Each tree you grow heals 1 HP when the floor ends.', locked: true },
  paradox: { icon: '🧿', name: 'Paradox Charm', age: 'both', text: 'When both heroes attack in the same turn, the future hit deals +2.', locked: true },
  heart: { icon: '❤️', name: 'Heart Root', age: 'both', text: '+2 max HP and heal 2.', instant: true },
  tonic: { icon: '🧪', name: 'Time Tonic', age: 'both', text: 'Heal 3 HP.', instant: true },
};

/** Items that go into the run pool without an unlock. */
export const BASE_POOL = Object.keys(ITEMS).filter((id) => !ITEMS[id].locked);

/** Max items per age (items for both ages take no slot). */
export const SLOTS = 3;

export interface UnlockDef {
  id: string;
  icon: string;
  name: string;
  text: string;
  cost: number;
  kind: 'rule' | 'start' | 'pool';
}

export const UNLOCKS: UnlockDef[] = [
  { id: 'monuments', icon: '🗿', name: 'Rule: Monuments', text: 'Statues appear. Push a statue in the past and it stands there in the future. A statue in a chasm makes a bridge.', cost: 4, kind: 'rule' },
  { id: 'start-seedbag', icon: '🌰', name: 'Start: Seed Bag', text: 'You can start a run with the Seed Bag.', cost: 2, kind: 'start' },
  { id: 'start-rope', icon: '🪢', name: 'Start: Rope', text: 'You can start a run with the Rope.', cost: 3, kind: 'start' },
  { id: 'start-hourglass', icon: '⏳', name: 'Start: Hourglass', text: 'You can start a run with the Hourglass.', cost: 3, kind: 'start' },
  { id: 'start-steel', icon: '⚔️', name: 'Start: Steel Blade', text: 'You can start a run with the Steel Blade.', cost: 4, kind: 'start' },
  { id: 'pool-orchard', icon: '🍎', name: 'Item: Orchard Charm', text: 'The Orchard Charm can drop in runs.', cost: 3, kind: 'pool' },
  { id: 'pool-paradox', icon: '🧿', name: 'Item: Paradox Charm', text: 'The Paradox Charm can drop in runs.', cost: 3, kind: 'pool' },
];

/** Cause rules. Shown in the help, the floor banner and the legend. */
export const RULES: Record<string, { icon: string; name: string; text: string }> = {
  growth: { icon: '🌱', name: 'Growth', text: 'Plant a seed on soil in the past. In the future a chasm there gets a root bridge, but open ground gets a tree that blocks.' },
  erosion: { icon: '🧱', name: 'Erosion', text: 'Break a cracked wall in the past. In the future that wall is gone too.' },
  lineage: { icon: '🧬', name: 'Lineage', text: 'Defeat an enemy in the past and its descendants never exist. Their treasure is gone too.' },
  flooding: { icon: '🌊', name: 'Flooding', text: 'Pull the sluice lever in the past. In the future the river takes another path: some water drains, other ground floods.' },
  monuments: { icon: '🗿', name: 'Monuments', text: 'Push a statue in the past. In the future it stands at the new place. A statue in a chasm or water makes a bridge.' },
  echo: { icon: '🔁', name: 'Echo (elite)', text: 'Runs backward: step on a pressure plate in the future and a time gate in the past opens.' },
};

/** Tile codes. Both boards use the same codes. */
export const TILE_NAMES: Record<string, string> = {
  '.': 'Ground',
  ',': 'Rubble (walkable)',
  '#': 'Wall',
  c: 'Cracked wall: bump it in the past to break it',
  s: 'Soil: stand here and press Act to plant a seed',
  S: 'Sapling',
  '~': 'Water',
  _: 'Chasm',
  R: 'Root bridge (walkable)',
  T: 'Tree (blocks)',
  X: 'Exit portal',
  L: 'Sluice lever: stand here and press Act',
  G: 'Time gate (opens from a future plate)',
  g: 'Open time gate',
  P: 'Pressure plate: step on it to open a past time gate',
  p: 'Used plate',
  '*': 'Seed: pick it up',
  $: 'Gem: +1 gold',
};

export const FLOORS = 12;
export const ELITE_FLOORS = [4, 8, 11];
export const CAMP_AFTER = [4, 8, 11];
