/** Static game data: bricks, power-ups, upgrades, paddles, bosses, acts and wall templates. */

export type BrickType = 'normal' | 'armor' | 'bomb' | 'mover' | 'shooter' | 'regen' | 'gold' | 'boss';

export const BRICK_INFO: Record<BrickType, { icon: string; name: string; text: string; color: string }> = {
  normal: { icon: '🧱', name: 'Brick', text: 'Plain brick. The color shows its HP.', color: '#f4a261' },
  armor: { icon: '🛡️', name: 'Armored', text: 'Lots of HP. Fire and chain zaps do not hurt it.', color: '#9aa5b1' },
  bomb: { icon: '💣', name: 'Explosive', text: 'Explodes when it breaks: 3 damage to bricks nearby.', color: '#e63946' },
  mover: { icon: '↔️', name: 'Moving', text: 'Slides left and right in its row.', color: '#4cc9f0' },
  shooter: { icon: '🔺', name: 'Shooter', text: 'Shoots at the paddle. A hit stuns the paddle for a moment.', color: '#c77dff' },
  regen: { icon: '♻️', name: 'Regenerating', text: 'Heals 1 HP every 2.5 s when you leave it alone.', color: '#52b788' },
  gold: { icon: '💰', name: 'Gold', text: 'Gives 8 extra gold when it breaks.', color: '#ffd166' },
  boss: { icon: '👑', name: 'Boss', text: 'Break it to clear the wall.', color: '#e76f51' },
};

export type PowerId = 'multi' | 'wide' | 'laser' | 'slow' | 'sticky' | 'life' | 'coin';

export const POWERS: Record<PowerId, { icon: string; name: string; text: string; color: string; weight: number }> = {
  multi: { icon: '⚪', name: 'Multi-ball', text: 'Two more balls.', color: '#e9ecef', weight: 3 },
  wide: { icon: '↔', name: 'Wide paddle', text: 'Paddle is 50% wider for 12 s.', color: '#4cc9f0', weight: 3 },
  laser: { icon: '⚡', name: 'Laser', text: 'The paddle fires lasers for 8 s.', color: '#ff4d6d', weight: 2 },
  slow: { icon: '🐢', name: 'Slow ball', text: 'Balls move 30% slower for 10 s.', color: '#80ed99', weight: 2 },
  sticky: { icon: '🍯', name: 'Sticky', text: 'The next 3 balls stick to the paddle. Click or tap to launch.', color: '#ffb703', weight: 2 },
  life: { icon: '❤', name: 'Extra life', text: '+1 life.', color: '#ef476f', weight: 0.35 },
  coin: { icon: '$', name: 'Coins', text: '+10 gold.', color: '#ffd166', weight: 3.5 },
};

export const POWER_IDS = Object.keys(POWERS) as PowerId[];

export type UpKind = 'ball' | 'paddle';

export interface UpDef {
  id: string;
  icon: string;
  name: string;
  kind: UpKind;
  max: number;
  /** Shards to unlock in the Workshop. 0 = always available. */
  unlock: number;
  /** Effect text per level (index 0 = level 1). */
  text: string[];
  /** Base shop price. */
  cost: number;
}

export const UPGRADES: Record<string, UpDef> = {
  fire: {
    id: 'fire',
    icon: '🔥',
    name: 'Fire ball',
    kind: 'ball',
    max: 3,
    unlock: 0,
    cost: 60,
    text: ['Bricks next to a hit take 1 fire damage.', 'Fire reaches diagonal bricks too.', 'Fire deals 2 damage.'],
  },
  pierce: {
    id: 'pierce',
    icon: '🗡️',
    name: 'Pierce ball',
    kind: 'ball',
    max: 3,
    unlock: 0,
    cost: 55,
    text: ['Passes through 1 brick it breaks per paddle hit.', 'Passes through 2 bricks.', 'Passes through 4 bricks.'],
  },
  split: {
    id: 'split',
    icon: '✨',
    name: 'Split ball',
    kind: 'ball',
    max: 3,
    unlock: 0,
    cost: 60,
    text: ['Every 4th paddle hit adds a ball (up to 2 in play).', 'Every 3rd paddle hit adds a ball (up to 3).', 'Every 2nd paddle hit adds a ball (up to 4).'],
  },
  heavy: {
    id: 'heavy',
    icon: '🪨',
    name: 'Heavy ball',
    kind: 'ball',
    max: 2,
    unlock: 30,
    cost: 70,
    text: ['+1 damage per hit.', '+2 damage per hit.'],
  },
  chain: {
    id: 'chain',
    icon: '🌩️',
    name: 'Chain ball',
    kind: 'ball',
    max: 3,
    unlock: 40,
    cost: 55,
    text: ['20% chance per hit to zap another brick.', '40% chance to zap.', '60% chance to zap.'],
  },
  magnet: {
    id: 'magnet',
    icon: '🧲',
    name: 'Magnet',
    kind: 'paddle',
    max: 2,
    unlock: 0,
    cost: 45,
    text: ['Pulls power-ups and falling balls toward the paddle.', 'Stronger pull.'],
  },
  shield: {
    id: 'shield',
    icon: '🛡️',
    name: 'Shield',
    kind: 'paddle',
    max: 2,
    unlock: 0,
    cost: 70,
    text: ['A barrier under the paddle saves 1 ball per wall.', 'Saves 2 balls per wall.'],
  },
  wings: {
    id: 'wings',
    icon: '🪽',
    name: 'Wings',
    kind: 'paddle',
    max: 2,
    unlock: 0,
    cost: 50,
    text: ['+10 paddle width.', '+20 paddle width.'],
  },
  cannon: {
    id: 'cannon',
    icon: '🔫',
    name: 'Cannon',
    kind: 'paddle',
    max: 3,
    unlock: 50,
    cost: 60,
    text: ['Fires a laser every 3 s.', 'Every 2.2 s.', 'Every 1.5 s.'],
  },
  charm: {
    id: 'charm',
    icon: '🍀',
    name: 'Lucky charm',
    kind: 'paddle',
    max: 2,
    unlock: 35,
    cost: 45,
    text: ['More power-ups drop. +25% gold from bricks.', 'Even more power-ups. +50% gold.'],
  },
};

export const UP_IDS = Object.keys(UPGRADES);

export interface PaddleDef {
  id: string;
  icon: string;
  name: string;
  text: string;
  width: number;
  lives: number;
  speedMul: number;
  start: Record<string, number>;
  unlock: number;
  color: string;
}

export const PADDLES: Record<string, PaddleDef> = {
  classic: { id: 'classic', icon: '🟧', name: 'Classic', text: '3 lives. A plain, steady paddle.', width: 64, lives: 3, speedMul: 1, start: {}, unlock: 0, color: '#e76f51' },
  broad: { id: 'broad', icon: '🟦', name: 'Broad', text: 'Wider (80), but balls move 10% faster.', width: 80, lives: 3, speedMul: 1.1, start: {}, unlock: 40, color: '#4cc9f0' },
  forge: { id: 'forge', icon: '🟥', name: 'Forge', text: 'Starts with Heavy ball 1 and Fire ball 1. 2 lives.', width: 62, lives: 2, speedMul: 1, start: { heavy: 1, fire: 1 }, unlock: 60, color: '#ef476f' },
  gunner: { id: 'gunner', icon: '🟩', name: 'Gunner', text: 'Starts with Cannon 2 and Shield 1. 2 lives.', width: 60, lives: 2, speedMul: 1, start: { cannon: 2, shield: 1 }, unlock: 80, color: '#52b788' },
};

export const PADDLE_IDS = Object.keys(PADDLES);

export interface BossDef {
  id: string;
  icon: string;
  name: string;
  text: string;
  hp: number;
  /** Horizontal speed in px/s. */
  speed: number;
  /** Seconds between shots (0 = never). */
  shootEvery: number;
  /** Bullets per shot. */
  spread: number;
  /** HP regained per second. */
  regen: number;
  /** Seconds between new brick rows (0 = never). */
  spawnEvery: number;
  color: string;
}

export const BOSSES: BossDef[] = [
  { id: 'golem', icon: '🗿', name: 'Brick Golem', text: 'Slides from side to side and throws a rock now and then.', hp: 34, speed: 38, shootEvery: 5, spread: 1, regen: 0, spawnEvery: 0, color: '#b08968' },
  { id: 'king', icon: '🤴', name: 'Turret King', text: 'Fires spreads of 3 bullets. Calls new bricks.', hp: 52, speed: 22, shootEvery: 4, spread: 3, regen: 0, spawnEvery: 16, color: '#c77dff' },
  { id: 'hydra', icon: '🐉', name: 'Brick Hydra', text: 'Moves, shoots, regrows HP and calls new bricks.', hp: 78, speed: 44, shootEvery: 3.6, spread: 3, regen: 0.4, spawnEvery: 12, color: '#2a9d8f' },
];

export interface ActDef {
  icon: string;
  name: string;
  /** Base ball speed in px/s. */
  speed: number;
  bg: string;
}

export const ACTS: ActDef[] = [
  { icon: '🏚️', name: 'Clay Pits', speed: 240, bg: '#1b1013' },
  { icon: '🏭', name: 'Iron Works', speed: 410, bg: '#101418' },
  { icon: '🌋', name: 'Ember Keep', speed: 495, bg: '#1d0d0a' },
];

/**
 * Wall templates, 10 columns wide. `#` = brick (type picked by the generator), `.` = empty.
 * Fixed types: `X` explosive, `A` armored, `S` shooter, `M` moving, `R` regenerating, `G` gold.
 */
export const TEMPLATES: { name: string; rows: string[] }[] = [
  { name: 'Block', rows: ['##########', '##########', '##########', '#####X####', '##########', '##########'] },
  { name: 'Pyramid', rows: ['....##....', '...####...', '..##GG##..', '.########.', '####XX####', '##########'] },
  { name: 'Diamond', rows: ['....##....', '...####...', '..##XX##..', '.###SS###.', '..######..', '...####...', '....##....'] },
  { name: 'Checker', rows: ['#.#.#.#.#.', '.#.#.#.#.#', '#.#.X.#.#.', '.#.#.#.#.#', '#.#.#.#.#.', '.#.#.#.#.#'] },
  { name: 'Columns', rows: ['AA..##..AA', '##..##..##', '##..XX..##', '##..##..##', '##..##..##', '##########'] },
  { name: 'Invader', rows: ['.#......#.', '..#....#..', '.###SS###.', '##.####.##', '##########', '#.#....#.#'] },
  { name: 'Conveyor', rows: ['##########', '..........', 'MMM.......', '..........', '###GG#####', '##########'] },
  { name: 'Ring', rows: ['.########.', '##......##', '#..XRRX..#', '##......##', '.########.'] },
  { name: 'Skull', rows: ['..######..', '.##....##.', '##.S..S.##', '##########', '.##X##X##.', '..#.#.#.#.'] },
  { name: 'Wings', rows: ['##......##', '###....###', '####..####', '##XX##XX##', '##########', '..........', '....MM....'] },
  { name: 'Zigzag', rows: ['##........', '####......', '..####....', '....####..', '......####', '........##', '.MM.......'] },
  { name: 'Fortress', rows: ['#S#.##.#S#', '##########', '#AAAAAAAA#', '#........#', '#..GXXG..#', '##########'] },
  { name: 'Stripes', rows: ['##########', '..........', '##########', '.....MMM..', '##########', '##########'] },
];

/** Escort bricks under the boss. The boss moves in its own band of 3 rows above them. */
export const BOSS_ESCORT: string[][] = [
  ['..........', '.##.##.##.', '##########', '###X##X###'],
  ['..........', 'S#..##..#S', '####..####', 'MMM.......', '#X######X#'],
  ['..........', '#S.R##R.S#', '##########', '.MMM......', '#X##XX##X#', 'AA......AA'],
];
