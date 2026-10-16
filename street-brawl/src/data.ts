/** Static content: fighters, moves, enemies, weapons, districts, perks and shop prices. */

/** The pose family that the renderer draws for a move. */
export type PoseId =
  | 'jab'
  | 'cross'
  | 'hook'
  | 'upper'
  | 'kick'
  | 'round'
  | 'knee'
  | 'elbow'
  | 'spin'
  | 'slam'
  | 'dash'
  | 'swing'
  | 'jkick'
  | 'dive'
  | 'throw'
  | 'charge'
  | 'slash'
  | 'rage';

export interface MoveDef {
  name: string;
  pose: PoseId;
  /** Startup, active and recovery frames. */
  su: number;
  act: number;
  rec: number;
  dmg: number;
  /** Front reach of the hitbox from the body center, in px. */
  reach: number;
  /** Rear reach (for moves that hit both sides). */
  back?: number;
  /** Depth tolerance of the hitbox. */
  zr: number;
  /** Hitstun frames on the target. */
  stun: number;
  /** Knockback speed. */
  kb: number;
  /** Launch speed: the target flies up and can be juggled. */
  lift?: number;
  /** The target falls down. */
  down?: boolean;
  /** Forward speed of the user during startup and active frames. */
  dash?: number;
  /** Upward speed of the user at the start of the move. */
  hop?: number;
  /** The hitbox hits the same target again after this many frames. */
  every?: number;
  /** The user cannot be hit during startup and active frames. */
  inv?: boolean;
  /** The user does not flinch during the move. */
  armor?: boolean;
  /** Heavy hit: longer hit-stop and stronger shake. */
  big?: boolean;
  /** The hitbox reaches targets in the air or on the ground at any height. */
  anyY?: boolean;
}

export interface FighterDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  hp: number;
  speed: number;
  zspeed: number;
  jump: number;
  light: MoveDef[];
  heavy: MoveDef;
  launcher: MoveDef;
  jumpL: MoveDef;
  jumpH: MoveDef;
  knee: MoveDef;
  /** Throw damage, also dealt to enemies the body hits. */
  throwDmg: number;
  /** Can grab heavies. */
  strongGrab: boolean;
  special: string;
  /** Meta cost in stars. 0 means free. */
  cost: number;
}

const L = (name: string, pose: PoseId, su: number, act: number, rec: number, dmg: number, reach: number, stun = 16, kb = 1.2, extra: Partial<MoveDef> = {}): MoveDef => ({
  name,
  pose,
  su,
  act,
  rec,
  dmg,
  reach,
  zr: 11,
  stun,
  kb,
  ...extra,
});

export const FIGHTERS: Record<string, FighterDef> = {
  rex: {
    id: 'rex',
    name: 'Rex',
    icon: '🥊',
    text: 'All-rounder. A 4-hit punch string, a strong heavy and the Dash Punch.',
    skin: '#e0ac7e',
    shirt: '#d62828',
    pants: '#2b3a67',
    hair: '#3b2a1a',
    hp: 110,
    speed: 1.9,
    zspeed: 1.3,
    jump: 6.6,
    light: [
      L('Jab', 'jab', 4, 3, 7, 5, 30),
      L('Jab', 'jab', 4, 3, 7, 5, 30),
      L('Cross', 'cross', 5, 3, 9, 7, 33),
      L('Hook', 'hook', 7, 4, 16, 11, 34, 22, 4.2, { down: true, big: true }),
    ],
    heavy: L('Haymaker', 'cross', 12, 4, 16, 14, 36, 24, 3.5, { big: true }),
    launcher: L('Uppercut', 'upper', 7, 4, 16, 12, 30, 30, 1, { lift: 7, big: true }),
    jumpL: L('Jump Kick', 'jkick', 3, 10, 6, 9, 32, 18, 2.5, { anyY: true }),
    jumpH: L('Dive Kick', 'dive', 4, 12, 8, 13, 34, 22, 3.5, { down: true, anyY: true, big: true }),
    knee: L('Knee', 'knee', 4, 3, 8, 7, 24, 22, 0),
    throwDmg: 18,
    strongGrab: false,
    special: 'dash',
    cost: 0,
  },
  mika: {
    id: 'mika',
    name: 'Mika',
    icon: '🦵',
    text: 'Fast kicker. A 5-hit string and quick jumps, but less HP. Starts with the Spin Kick.',
    skin: '#f1c27d',
    shirt: '#f4a261',
    pants: '#1d3557',
    hair: '#e63946',
    hp: 90,
    speed: 2.3,
    zspeed: 1.6,
    jump: 7.2,
    light: [
      L('Jab', 'jab', 3, 3, 6, 4, 29, 14),
      L('Low Kick', 'kick', 4, 3, 6, 5, 34, 14),
      L('Jab', 'jab', 3, 3, 6, 4, 29, 14),
      L('High Kick', 'kick', 4, 3, 8, 6, 36, 16),
      L('Roundhouse', 'round', 6, 5, 16, 10, 40, 22, 4.6, { down: true, big: true }),
    ],
    heavy: L('Side Kick', 'kick', 9, 4, 14, 12, 42, 22, 4, { big: true }),
    launcher: L('Rising Kick', 'round', 6, 5, 14, 10, 34, 30, 1, { lift: 7.5, big: true }),
    jumpL: L('Jump Kick', 'jkick', 3, 10, 5, 8, 34, 18, 2.5, { anyY: true }),
    jumpH: L('Axe Drop', 'dive', 4, 12, 8, 12, 34, 22, 3.5, { down: true, anyY: true, big: true }),
    knee: L('Knee', 'knee', 3, 3, 7, 6, 24, 22, 0),
    throwDmg: 14,
    strongGrab: false,
    special: 'spin',
    cost: 20,
  },
  tank: {
    id: 'tank',
    name: 'Tank',
    icon: '💪',
    text: 'Wrestler. Slow 3-hit string, huge throws and grabs even heavies. Starts with the Ground Slam.',
    skin: '#8d5524',
    shirt: '#2a9d8f',
    pants: '#3d405b',
    hair: '#111111',
    hp: 125,
    speed: 1.55,
    zspeed: 1.1,
    jump: 6,
    light: [
      L('Slap', 'jab', 6, 3, 9, 7, 32, 18),
      L('Chop', 'cross', 7, 3, 10, 9, 34, 18),
      L('Hammer', 'slam', 10, 4, 18, 15, 36, 24, 4.5, { down: true, big: true }),
    ],
    heavy: L('Shoulder', 'dash', 12, 6, 16, 16, 34, 26, 4.5, { dash: 2.6, big: true }),
    launcher: L('Lariat', 'upper', 8, 5, 18, 14, 34, 30, 1, { lift: 6.5, big: true }),
    jumpL: L('Body Splash', 'jkick', 4, 10, 8, 11, 30, 20, 2, { anyY: true }),
    jumpH: L('Elbow Drop', 'dive', 5, 12, 10, 16, 32, 24, 3, { down: true, anyY: true, big: true }),
    knee: L('Headbutt', 'elbow', 5, 3, 9, 10, 24, 22, 0),
    throwDmg: 26,
    strongGrab: true,
    special: 'slam',
    cost: 40,
  },
};

export const FIGHTER_IDS = Object.keys(FIGHTERS);

export interface SpecialDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  /** Cooldown in frames. */
  cd: number;
  move: MoveDef;
  /** Heal on use (Second Wind). */
  heal?: number;
}

export const SPECIALS: Record<string, SpecialDef> = {
  dash: {
    id: 'dash',
    name: 'Dash Punch',
    icon: '💨',
    text: 'Rush forward through a crowd. Hits everyone in the way and knocks them down.',
    cd: 240,
    move: { name: 'Dash Punch', pose: 'dash', su: 5, act: 16, rec: 12, dmg: 16, reach: 30, zr: 14, stun: 24, kb: 5, down: true, dash: 6.5, inv: true, big: true },
  },
  spin: {
    id: 'spin',
    name: 'Spin Kick',
    icon: '🌀',
    text: 'Spin in place and kick both sides 4 times. You cannot be hit while you spin.',
    cd: 300,
    move: { name: 'Spin Kick', pose: 'spin', su: 4, act: 32, rec: 10, dmg: 7, reach: 38, back: 38, zr: 16, stun: 18, kb: 3, every: 8, inv: true },
  },
  slam: {
    id: 'slam',
    name: 'Ground Slam',
    icon: '💥',
    text: 'Leap and slam the street. A shockwave knocks down everyone close.',
    cd: 420,
    move: { name: 'Ground Slam', pose: 'slam', su: 24, act: 5, rec: 16, dmg: 20, reach: 78, back: 78, zr: 30, stun: 30, kb: 4, down: true, hop: 5.2, inv: true, big: true },
  },
  upper: {
    id: 'upper',
    name: 'Dragon Upper',
    icon: '🐉',
    text: 'A rising uppercut that launches enemies high for juggles.',
    cd: 240,
    move: { name: 'Dragon Upper', pose: 'upper', su: 3, act: 12, rec: 18, dmg: 18, reach: 34, zr: 14, stun: 30, kb: 1.5, lift: 9, hop: 5, inv: true, big: true, anyY: true },
  },
  haymaker: {
    id: 'haymaker',
    name: 'Mega Punch',
    icon: '👊',
    text: 'Charge up, then a huge punch. You do not flinch while you charge.',
    cd: 360,
    move: { name: 'Mega Punch', pose: 'cross', su: 22, act: 4, rec: 18, dmg: 44, reach: 42, zr: 14, stun: 30, kb: 8, down: true, armor: true, big: true },
  },
  rage: {
    id: 'rage',
    name: 'Second Wind',
    icon: '🔥',
    text: 'Roar: heal 20 HP and push nearby enemies away.',
    cd: 1500,
    heal: 20,
    move: { name: 'Second Wind', pose: 'rage', su: 10, act: 4, rec: 14, dmg: 4, reach: 60, back: 60, zr: 26, stun: 20, kb: 6, down: true, inv: true },
  },
};

export const SPECIAL_IDS = Object.keys(SPECIALS);

export interface WeaponDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  dur: number;
  swing: MoveDef;
  /** Damage when thrown. */
  throwDmg: number;
  /** Breaks on the first throw hit. */
  glass?: boolean;
}

export const WEAPONS: Record<string, WeaponDef> = {
  pipe: {
    id: 'pipe',
    name: 'Lead Pipe',
    icon: '🔧',
    text: 'Long reach, solid damage.',
    dur: 10,
    swing: L('Pipe Swing', 'swing', 8, 4, 12, 13, 46, 22, 3),
    throwDmg: 16,
  },
  bottle: {
    id: 'bottle',
    name: 'Bottle',
    icon: '🍾',
    text: 'Breaks fast. Better thrown.',
    dur: 3,
    swing: L('Bottle Smash', 'swing', 6, 3, 10, 12, 36, 24, 2.5),
    throwDmg: 22,
    glass: true,
  },
  chair: {
    id: 'chair',
    name: 'Chair',
    icon: '🪑',
    text: 'Slow, wide, knocks down.',
    dur: 5,
    swing: L('Chair Smash', 'swing', 12, 5, 16, 20, 44, 26, 4.5, { down: true, big: true, zr: 16 }),
    throwDmg: 24,
  },
  knife: {
    id: 'knife',
    name: 'Knife',
    icon: '🔪',
    text: 'Fast stabs. Deadly when thrown.',
    dur: 7,
    swing: L('Stab', 'slash', 4, 3, 7, 9, 34, 14, 1),
    throwDmg: 26,
  },
  bat: {
    id: 'bat',
    name: 'Bat',
    icon: '🏏',
    text: 'Every swing knocks the target down.',
    dur: 8,
    swing: L('Bat Swing', 'swing', 9, 4, 14, 15, 44, 24, 4.2, { down: true, big: true }),
    throwDmg: 18,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

export type AiKind = 'melee' | 'ranged' | 'fast' | 'heavy' | 'boss';

export interface EMove extends MoveDef {
  /** Use the move when the distance to the player is at most this. */
  range: number;
  weight: number;
  /** Fires a projectile at the end of startup. */
  proj?: 'knife' | 'bottle' | 'wave' | 'fan' | 'bullet';
  /** Leap toward the player during startup. */
  leap?: boolean;
  /** Summons extra enemies. */
  summon?: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  ai: AiKind;
  skin: string;
  shirt: string;
  pants: string;
  hat: 'cap' | 'bandana' | 'mohawk' | 'bald' | 'beanie' | 'emoji';
  hatColor: string;
  hatEmoji?: string;
  size: number;
  hp: number;
  speed: number;
  /** Damage taken before the enemy flinches during an armored move. */
  poise: number;
  cash: number;
  grab: boolean;
  /** Distance the enemy likes to keep while it waits. */
  keep: number;
  moves: EMove[];
  /** Chance to drop a weapon on KO. */
  drop?: [string, number];
}

const E = (name: string, pose: PoseId, su: number, act: number, rec: number, dmg: number, reach: number, range: number, weight: number, extra: Partial<EMove> = {}): EMove => ({
  name,
  pose,
  su,
  act,
  rec,
  dmg,
  reach,
  zr: 10,
  stun: 16,
  kb: 2,
  range,
  weight,
  ...extra,
});

export const ENEMIES: Record<string, EnemyDef> = {
  grunt: {
    id: 'grunt',
    name: 'Grunt',
    icon: '🧢',
    text: 'Plain street thug. Punches, sometimes twice.',
    ai: 'melee',
    skin: '#d8a47f',
    shirt: '#6c757d',
    pants: '#343a40',
    hat: 'cap',
    hatColor: '#457b9d',
    size: 1,
    hp: 34,
    speed: 1.25,
    poise: 0,
    cash: 3,
    grab: true,
    keep: 80,
    moves: [E('Punch', 'jab', 16, 4, 16, 7, 30, 32, 3), E('Haymaker', 'cross', 22, 4, 20, 11, 34, 34, 1, { kb: 3.5, big: true })],
  },
  knife: {
    id: 'knife',
    name: 'Slasher',
    icon: '🔪',
    text: 'Quick knife slashes. Throws a knife from range. Drops it on KO.',
    ai: 'melee',
    skin: '#c68642',
    shirt: '#9b2226',
    pants: '#212529',
    hat: 'bandana',
    hatColor: '#111111',
    size: 0.95,
    hp: 28,
    speed: 1.45,
    poise: 0,
    cash: 4,
    grab: true,
    keep: 95,
    moves: [E('Slash', 'slash', 11, 3, 14, 8, 32, 34, 3), E('Knife Throw', 'throw', 20, 2, 22, 9, 0, 190, 1, { proj: 'knife' })],
    drop: ['knife', 0.35],
  },
  heavy: {
    id: 'heavy',
    name: 'Bruiser',
    icon: '🐻',
    text: 'Big and tough. Charges across the street. Cannot be grabbed except by Tank.',
    ai: 'heavy',
    skin: '#e0ac69',
    shirt: '#bc6c25',
    pants: '#283618',
    hat: 'bald',
    hatColor: '#000000',
    size: 1.3,
    hp: 90,
    speed: 0.95,
    poise: 16,
    cash: 8,
    grab: false,
    keep: 90,
    moves: [
      E('Belly Slam', 'cross', 24, 5, 24, 11, 40, 40, 2, { kb: 4, down: true, armor: true, big: true }),
      E('Charge', 'charge', 26, 34, 26, 12, 26, 170, 1, { dash: 4.8, kb: 5, down: true, armor: true, big: true }),
    ],
  },
  ranged: {
    id: 'ranged',
    name: 'Tosser',
    icon: '🎯',
    text: 'Keeps away and throws bottles down your lane.',
    ai: 'ranged',
    skin: '#a1665e',
    shirt: '#2d6a4f',
    pants: '#3a3a3a',
    hat: 'beanie',
    hatColor: '#ffb703',
    size: 0.95,
    hp: 26,
    speed: 1.3,
    poise: 0,
    cash: 4,
    grab: true,
    keep: 150,
    moves: [E('Bottle Toss', 'throw', 24, 2, 26, 8, 0, 260, 3, { proj: 'bottle' }), E('Shove', 'jab', 14, 4, 16, 5, 28, 30, 1)],
    drop: ['bottle', 0.3],
  },
  fast: {
    id: 'fast',
    name: 'Runner',
    icon: '🐆',
    text: 'Fast and fragile. Leaps in with a flying kick.',
    ai: 'fast',
    skin: '#ffdbac',
    shirt: '#7209b7',
    pants: '#14213d',
    hat: 'mohawk',
    hatColor: '#06d6a0',
    size: 0.9,
    hp: 24,
    speed: 2.1,
    poise: 0,
    cash: 4,
    grab: true,
    keep: 110,
    moves: [E('Flying Kick', 'jkick', 14, 16, 18, 9, 30, 120, 3, { leap: true, kb: 3.5, down: true }), E('Jab', 'jab', 10, 3, 12, 5, 28, 30, 2)],
  },
  // Bosses
  spike: {
    id: 'spike',
    name: 'Spike the Biker',
    icon: '🏍️',
    text: 'Charges across the street. Calls his gang at half HP.',
    ai: 'boss',
    skin: '#d8a47f',
    shirt: '#222222',
    pants: '#3d2b1f',
    hat: 'emoji',
    hatColor: '#000',
    hatEmoji: '🪖',
    size: 1.25,
    hp: 260,
    speed: 1.3,
    poise: 34,
    cash: 40,
    grab: false,
    keep: 110,
    moves: [
      E('Chain Whip', 'swing', 16, 5, 18, 11, 48, 50, 3, { kb: 3.5, zr: 14 }),
      E('Biker Charge', 'charge', 26, 40, 26, 15, 28, 220, 2, { dash: 5.4, kb: 5, down: true, armor: true, big: true }),
      E('Call Gang', 'rage', 30, 2, 20, 0, 0, 999, 0, { summon: 'grunt' }),
    ],
  },
  cleaver: {
    id: 'cleaver',
    name: 'Chef Cleaver',
    icon: '🔪',
    text: 'Throws knife fans over three lanes, then rushes in to chop.',
    ai: 'boss',
    skin: '#f1c27d',
    shirt: '#f8f9fa',
    pants: '#495057',
    hat: 'emoji',
    hatColor: '#fff',
    hatEmoji: '👨‍🍳',
    size: 1.2,
    hp: 300,
    speed: 1.5,
    poise: 34,
    cash: 50,
    grab: false,
    keep: 140,
    moves: [
      E('Chop', 'slash', 12, 4, 16, 12, 40, 44, 3, { kb: 3, zr: 13 }),
      E('Knife Fan', 'throw', 22, 2, 26, 10, 0, 300, 2, { proj: 'fan' }),
      E('Call Cooks', 'rage', 30, 2, 20, 0, 0, 999, 0, { summon: 'knife' }),
    ],
  },
  anchor: {
    id: 'anchor',
    name: 'Anchor Jack',
    icon: '⚓',
    text: 'A huge dock worker. His slam sends a shockwave along the ground. Jump over it.',
    ai: 'boss',
    skin: '#c68642',
    shirt: '#1d3557',
    pants: '#14213d',
    hat: 'emoji',
    hatColor: '#000',
    hatEmoji: '⛑️',
    size: 1.45,
    hp: 380,
    speed: 1.05,
    poise: 46,
    cash: 60,
    grab: false,
    keep: 120,
    moves: [
      E('Hammer Fist', 'slam', 20, 5, 22, 16, 46, 50, 3, { kb: 4, down: true, armor: true, big: true, zr: 14 }),
      E('Shockwave', 'slam', 26, 2, 30, 14, 0, 320, 2, { proj: 'wave', armor: true }),
      E('Call Crew', 'rage', 30, 2, 20, 0, 0, 999, 0, { summon: 'heavy' }),
    ],
  },
  viper: {
    id: 'viper',
    name: 'Viper',
    icon: '🐍',
    text: 'A kickboxer. Fast combos and flying kicks across the platform.',
    ai: 'boss',
    skin: '#ffdbac',
    shirt: '#06d6a0',
    pants: '#111111',
    hat: 'emoji',
    hatColor: '#000',
    hatEmoji: '🎧',
    size: 1.1,
    hp: 360,
    speed: 2,
    poise: 30,
    cash: 70,
    grab: false,
    keep: 120,
    moves: [
      E('Kick Rush', 'kick', 10, 3, 12, 9, 38, 42, 3, { kb: 2 }),
      E('Flying Knee', 'jkick', 14, 18, 18, 14, 32, 200, 2, { leap: true, kb: 4, down: true, big: true }),
      E('Call Runners', 'rage', 30, 2, 20, 0, 0, 999, 0, { summon: 'fast' }),
    ],
  },
  big: {
    id: 'big',
    name: 'Mr. Big',
    icon: '🎩',
    text: 'The boss of the city. A cane, a pistol and a lot of friends.',
    ai: 'boss',
    skin: '#e0ac69',
    shirt: '#5a189a',
    pants: '#10002b',
    hat: 'emoji',
    hatColor: '#000',
    hatEmoji: '🎩',
    size: 1.3,
    hp: 520,
    speed: 1.35,
    poise: 46,
    cash: 100,
    grab: false,
    keep: 150,
    moves: [
      E('Cane Strike', 'swing', 14, 5, 16, 13, 48, 52, 3, { kb: 3.5, zr: 14 }),
      E('Pistol', 'throw', 24, 2, 28, 15, 0, 360, 2, { proj: 'bullet' }),
      E('Cane Charge', 'charge', 24, 34, 24, 16, 28, 200, 1, { dash: 5.2, kb: 5, down: true, armor: true, big: true }),
      E('Call Guards', 'rage', 30, 2, 20, 0, 0, 999, 0, { summon: 'mix' }),
    ],
  },
};

export const BASIC_ENEMIES = ['grunt', 'knife', 'heavy', 'ranged', 'fast'];

export interface DistrictDef {
  name: string;
  icon: string;
  sky: [string, string];
  wall: string[];
  ground: string;
  neon: string;
  pool: [string, number][];
  boss: string;
  streets: string[];
  alleys: string[];
}

export const DISTRICTS: DistrictDef[] = [
  {
    name: 'Downtown',
    icon: '🏙️',
    sky: ['#2b2d42', '#8d99ae'],
    wall: ['#3d405b', '#4a4e69', '#22223b'],
    ground: '#4a4a52',
    neon: '#ffb703',
    pool: [['grunt', 6], ['knife', 2], ['fast', 1]],
    boss: 'spike',
    streets: ['Main Street', 'Fifth Avenue', 'Bus Station', 'City Square'],
    alleys: ['Back Alley', 'Parking Lot', 'Pawn Row'],
  },
  {
    name: 'Night Market',
    icon: '🏮',
    sky: ['#3a0ca3', '#7209b7'],
    wall: ['#5a189a', '#3c096c', '#240046'],
    ground: '#3b3346',
    neon: '#ff4d6d',
    pool: [['grunt', 4], ['knife', 3], ['ranged', 2], ['fast', 2]],
    boss: 'cleaver',
    streets: ['Lantern Lane', 'Noodle Row', 'Fish Market', 'Temple Gate'],
    alleys: ['Kitchen Alley', 'Mahjong Den', 'Smoke Yard'],
  },
  {
    name: 'The Docks',
    icon: '⚓',
    sky: ['#023047', '#219ebc'],
    wall: ['#264653', '#2a9d8f', '#1d3557'],
    ground: '#4d4a44',
    neon: '#8ecae6',
    pool: [['grunt', 5], ['heavy', 1], ['ranged', 1], ['knife', 2]],
    boss: 'anchor',
    streets: ['Pier 9', 'Container Yard', 'Fish Wharf', 'Crane Row'],
    alleys: ['Warehouse', 'Cargo Hold', 'Rust Lane'],
  },
  {
    name: 'Subway',
    icon: '🚇',
    sky: ['#1b1b1e', '#373f51'],
    wall: ['#3a506b', '#5bc0be', '#1c2541'],
    ground: '#3d3d3d',
    neon: '#5bc0be',
    pool: [['fast', 3], ['knife', 3], ['heavy', 2], ['ranged', 2], ['grunt', 2]],
    boss: 'viper',
    streets: ['Platform 2', 'Ticket Hall', 'Line 7', 'Transfer Tunnel'],
    alleys: ['Maintenance Shaft', 'Old Tunnel', 'Rail Yard'],
  },
  {
    name: 'Neon Tower',
    icon: '🌃',
    sky: ['#10002b', '#e0aaff'],
    wall: ['#240046', '#3c096c', '#10002b'],
    ground: '#2d2a3a',
    neon: '#f72585',
    pool: [['grunt', 3], ['knife', 3], ['heavy', 2], ['ranged', 2], ['fast', 3]],
    boss: 'big',
    streets: ['Lobby', 'Casino Floor', 'Sky Bridge', 'Penthouse Hall'],
    alleys: ['Service Stairs', 'Vault Room', 'Rooftop'],
  },
];

export interface PerkDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  max: number;
  cost: number;
}

export const PERKS: Record<string, PerkDef> = {
  knuckles: { id: 'knuckles', name: 'Brass Knuckles', icon: '🤜', text: '+20% damage with light attacks.', max: 3, cost: 35 },
  boots: { id: 'boots', name: 'Steel Toes', icon: '🥾', text: '+25% damage with heavy, jump and launcher attacks.', max: 3, cost: 35 },
  combo: { id: 'combo', name: 'Extra Hit', icon: '➕', text: 'Your light string gets one more jab before the finisher.', max: 1, cost: 45 },
  grip: { id: 'grip', name: 'Iron Grip', icon: '🤼', text: 'Throws deal +60% damage. Knees deal +40%.', max: 2, cost: 30 },
  skin: { id: 'skin', name: 'Thick Skin', icon: '🛡️', text: 'Take 12% less damage.', max: 3, cost: 40 },
  weapons: { id: 'weapons', name: 'Weapon Master', icon: '🔨', text: 'Weapons last 50% longer and hit 25% harder.', max: 2, cost: 30 },
  focus: { id: 'focus', name: 'Focus', icon: '🧘', text: 'Special cooldowns 20% shorter.', max: 2, cost: 40 },
  vamp: { id: 'vamp', name: 'Adrenaline', icon: '💉', text: 'Heal 2 HP for each KO.', max: 3, cost: 35 },
  hustle: { id: 'hustle', name: 'Hustler', icon: '💰', text: '+30% cash from KOs.', max: 2, cost: 25 },
  juggle: { id: 'juggle', name: 'Juggler', icon: '🤹', text: 'Hits on enemies in the air deal +35% damage.', max: 2, cost: 30 },
};

export const PERK_IDS = Object.keys(PERKS);

export const FOODS: Record<string, { icon: string; heal: number }> = {
  apple: { icon: '🍎', heal: 12 },
  burger: { icon: '🍔', heal: 25 },
  chicken: { icon: '🍗', heal: 45 },
};

export const PROPS: Record<string, { icon: string }> = {
  crate: { icon: '📦' },
  barrel: { icon: '🛢️' },
  trash: { icon: '🗑️' },
};

export const PRICES = {
  food: 15,
  feast: 40,
  maxhp: 45,
  life: 80,
  special: 50,
  weapon: 12,
};
