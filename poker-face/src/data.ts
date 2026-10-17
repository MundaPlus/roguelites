/** Static game data: actions, moves, relics, enemies and halls. */

export const STRIKE = 0;
export const FEINT = 1;
export const GUARD = 2;
export const CHARGE = 3;

export interface ActionDef {
  id: string;
  name: string;
  icon: string;
  key: string;
  color: string;
}

/** The cycle: each action beats the next one. Strike > Feint > Guard > Charge > Strike. */
export const ACTIONS: ActionDef[] = [
  { id: 'strike', name: 'Strike', icon: '⚔️', key: 'S', color: '#ff8fa3' },
  { id: 'feint', name: 'Feint', icon: '🌀', key: 'F', color: '#c77dff' },
  { id: 'guard', name: 'Guard', icon: '🛡️', key: 'G', color: '#4cc9f0' },
  { id: 'charge', name: 'Charge', icon: '🔥', key: 'C', color: '#ffb703' },
];

/** True when action `a` beats action `b`. */
export const beats = (a: number, b: number): boolean => (b - a + 4) % 4 === 1;
/** The action that beats `x`. */
export const counterOf = (x: number): number => (x + 3) % 4;
/** The action that `x` beats. */
export const preyOf = (x: number): number => (x + 1) % 4;
export const oppositeOf = (x: number): number => (x + 2) % 4;

export const actName = (a: number): string => `${ACTIONS[a].icon} ${ACTIONS[a].name}`;

// ---------- Moves ----------

export type MoveFx = 'bleed' | 'forget' | 'sand' | 'nochip' | 'ram';

export interface MoveDef {
  id: string;
  slot: number;
  name: string;
  /** Damage when this move wins the round. */
  win: number;
  /** Extra damage you take when this move loses. */
  loseExtra: number;
  /** HP you heal when this move wins. */
  heal: number;
  fx?: MoveFx;
  text: string;
  /** Shard cost to unlock. 0 = always in the pool. */
  unlock: number;
  start?: boolean;
}

export const MOVES: Record<string, MoveDef> = {
  jab: { id: 'jab', slot: STRIKE, name: 'Jab', win: 3, loseExtra: 0, heal: 0, text: 'A quick blow.', unlock: 0, start: true },
  hook: { id: 'hook', slot: STRIKE, name: 'Hook', win: 4, loseExtra: 0, heal: 0, text: 'A solid blow.', unlock: 0 },
  cleave: { id: 'cleave', slot: STRIKE, name: 'Cleave', win: 6, loseExtra: 2, heal: 0, text: 'Huge blow. You take +2 when it loses.', unlock: 0 },
  rend: { id: 'rend', slot: STRIKE, name: 'Rend', win: 3, loseExtra: 0, heal: 0, fx: 'bleed', text: 'The foe bleeds 1 HP for the next 3 rounds.', unlock: 6 },

  feint: { id: 'feint', slot: FEINT, name: 'Feint', win: 3, loseExtra: 0, heal: 0, text: 'Fake high, hit low.', unlock: 0, start: true },
  misdirect: { id: 'misdirect', slot: FEINT, name: 'Misdirect', win: 3, loseExtra: 0, heal: 0, fx: 'forget', text: 'When it wins, the foe does not remember this round.', unlock: 0 },
  sand: { id: 'sand', slot: FEINT, name: 'Pocket Sand', win: 3, loseExtra: 0, heal: 0, fx: 'sand', text: "When it wins, the foe's next tell is always honest.", unlock: 0 },
  gambit: { id: 'gambit', slot: FEINT, name: 'Gambit', win: 6, loseExtra: 2, heal: 0, text: 'Big trick. You take +2 when it loses.', unlock: 6 },

  block: { id: 'block', slot: GUARD, name: 'Block', win: 3, loseExtra: 0, heal: 0, text: 'Turn a charge aside and hit back.', unlock: 0, start: true },
  parry: { id: 'parry', slot: GUARD, name: 'Parry', win: 4, loseExtra: 0, heal: 0, fx: 'nochip', text: 'Hits back harder. Strikes do no chip damage.', unlock: 0 },
  bulwark: { id: 'bulwark', slot: GUARD, name: 'Bulwark', win: 3, loseExtra: 0, heal: 2, fx: 'nochip', text: 'Heal 2 when it wins. Strikes do no chip damage.', unlock: 0 },
  riposte: { id: 'riposte', slot: GUARD, name: 'Riposte', win: 6, loseExtra: 1, heal: 0, text: 'Deadly counter. You take +1 when it loses.', unlock: 8 },

  rush: { id: 'rush', slot: CHARGE, name: 'Rush', win: 5, loseExtra: 0, heal: 0, text: 'Run them down.', unlock: 0, start: true },
  meteor: { id: 'meteor', slot: CHARGE, name: 'Meteor', win: 8, loseExtra: 2, heal: 0, text: 'Crushing rush. You take +2 when it loses.', unlock: 0 },
  wind: { id: 'wind', slot: CHARGE, name: 'Second Wind', win: 5, loseExtra: 0, heal: 2, text: 'Heal 2 when it wins.', unlock: 0 },
  ram: { id: 'ram', slot: CHARGE, name: 'Battering Ram', win: 6, loseExtra: 0, heal: 0, fx: 'ram', text: 'Deals 3 (not 1) when it meets a Feint.', unlock: 8 },
};

export const MOVE_IDS = Object.keys(MOVES);
export const START_MOVES = [0, 1, 2, 3].map((s) => MOVE_IDS.find((id) => MOVES[id].slot === s && MOVES[id].start)!);

// ---------- Relics ----------

export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  unlock: number;
  active?: boolean;
}

export const RELICS: Record<string, RelicDef> = {
  mask: { id: 'mask', name: 'Blank Mask', icon: '🎭', text: 'New foes do not know your record. They start neutral.', unlock: 0 },
  eye: { id: 'eye', name: 'Third Eye', icon: '👁️', text: 'Enemy tells are honest 15% more often.', unlock: 0 },
  lethe: { id: 'lethe', name: 'Lethe Vial', icon: '💧', text: 'Once per duel: the foe forgets everything about you.', unlock: 0, active: true },
  ball: { id: 'ball', name: 'Crystal Ball', icon: '🔮', text: "Once per duel: see the foe's real pick before you act.", unlock: 0, active: true },
  fang: { id: 'fang', name: 'Vampire Fang', icon: '🩸', text: 'Heal 1 when you win a round.', unlock: 0 },
  skin: { id: 'skin', name: 'Thick Skin', icon: '🪨', text: 'Take 1 less damage from chip and clash hits.', unlock: 0 },
  coin: { id: 'coin', name: "Liar's Coin", icon: '🪙', text: 'A bluff that wins the round deals +2.', unlock: 0 },
  oath: { id: 'oath', name: 'Oath Ring', icon: '💍', text: 'A true claim that wins the round deals +2.', unlock: 0 },
  flask: { id: 'flask', name: 'Wine Flask', icon: '🍷', text: 'Heal 6 after each duel.', unlock: 0 },
  whet: { id: 'whet', name: 'Whetstone', icon: '🗡️', text: 'Strike and Charge deal +1.', unlock: 0 },
  gaunt: { id: 'gaunt', name: 'Iron Gauntlet', icon: '🧤', text: 'Guard and Feint deal +1.', unlock: 0 },
  ace: { id: 'ace', name: 'Ace Up the Sleeve', icon: '♠️', text: 'The foe fully believes your first claim of each duel.', unlock: 10 },
  veil: { id: 'veil', name: 'Short Veil', icon: '🕸️', text: 'Foes remember only your last 4 rounds.', unlock: 10 },
  heart: { id: 'heart', name: 'Lion Heart', icon: '🦁', text: '+10 max HP (and heal 10).', unlock: 12 },
};

export const RELIC_IDS = Object.keys(RELICS);

// ---------- Enemies ----------

export type Reader = 'gullible' | 'paranoid' | 'statistician' | 'mirror';

export const READERS: Record<Reader, { name: string; icon: string; text: string; tip: string }> = {
  gullible: {
    name: 'Gullible',
    icon: '🐑',
    text: 'Believes your claims. Changes its mind slowly. It thinks a liar picks at random.',
    tip: 'Lie to it, but not every round, or it stops believing you.',
  },
  paranoid: {
    name: 'Paranoid',
    icon: '🙀',
    text: 'Expects lies. One caught lie counts like three true claims. It guesses your favorite moves.',
    tip: 'When it does not trust you, tell the truth.',
  },
  statistician: {
    name: 'Statistician',
    icon: '📊',
    text: 'Counts your last 10 rounds: how often you lie, and what you play instead of your claim.',
    tip: 'Do not lie the same way twice in a row. Keep its numbers near even.',
  },
  mirror: {
    name: 'Mirror',
    icon: '🪞',
    text: 'Expects you to repeat your last round. It also bluffs when you bluffed last round.',
    tip: 'Break your own pattern. After a lie, it bluffs too.',
  },
};

export interface Tell {
  face: string;
  text: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  /** Champions change how they read you as their HP drops. */
  readers: Reader[];
  hp: number;
  /** Damage when its action wins: Strike, Feint, Guard, Charge. */
  dmg: [number, number, number, number];
  /** Chance that its claim is true (mirror foes copy you instead). */
  honesty: number;
  /** How often its tell shows the truth. */
  tellAcc: number;
  /** When it bluffs, the chance it claims the opposite of its real pick. */
  smart: number;
  /** Softmax temperature of its choice. Low = sharp, high = loose. */
  temp: number;
  calm: Tell;
  lie: Tell;
  champion?: boolean;
  text: string;
}

const D = (s: number, f: number, g: number, c: number): [number, number, number, number] => [s, f, g, c];

export const ENEMIES: Record<string, EnemyDef> = {
  // Hall 1
  sailor: {
    id: 'sailor', name: 'Drunk Sailor', icon: '🧔', readers: ['gullible'], hp: 11, dmg: D(2, 2, 2, 4), honesty: 0.7, tellAcc: 0.85, smart: 0.3, temp: 1.6,
    calm: { face: '😄', text: 'grins wide' }, lie: { face: '🥴', text: 'hiccups' }, text: 'He believes every sailor story, even yours.',
  },
  thief: {
    id: 'thief', name: 'Pickpocket', icon: '🥷', readers: ['paranoid'], hp: 12, dmg: D(2, 2, 2, 5), honesty: 0.55, tellAcc: 0.85, smart: 0.4, temp: 1.1,
    calm: { face: '😐', text: 'stares at you' }, lie: { face: '😶', text: 'eyes dart to the door' }, text: 'A liar who thinks everyone lies.',
  },
  mime: {
    id: 'mime', name: 'Street Mime', icon: '🤡', readers: ['mirror'], hp: 12, dmg: D(2, 2, 2, 5), honesty: 0.6, tellAcc: 0.85, smart: 0.4, temp: 1.0,
    calm: { face: '🤡', text: 'waves at the crowd' }, lie: { face: '😶', text: 'freezes mid-move' }, text: 'Copies what you did. Badly.',
  },
  counter: {
    id: 'counter', name: 'Card Counter', icon: '🤓', readers: ['statistician'], hp: 12, dmg: D(2, 2, 2, 5), honesty: 0.6, tellAcc: 0.85, smart: 0.5, temp: 1.0,
    calm: { face: '🤓', text: 'pushes up his glasses' }, lie: { face: '😑', text: 'taps the table twice' }, text: 'Keeps a little notebook about you.',
  },
  fortune: {
    id: 'fortune', name: 'Madame Fortune', icon: '🧕', readers: ['paranoid', 'gullible'], hp: 16, dmg: D(2, 2, 2, 5), honesty: 0.6, tellAcc: 0.8, smart: 0.5, temp: 1.0, champion: true,
    calm: { face: '😌', text: 'smiles at her cards' }, lie: { face: '😏', text: 'smirks' }, text: 'Suspicious at first. At half HP she starts to believe you.',
  },
  // Hall 2
  fox: {
    id: 'fox', name: 'Velvet Fox', icon: '🦊', readers: ['statistician'], hp: 20, dmg: D(5, 5, 5, 8), honesty: 0.55, tellAcc: 0.6, smart: 0.6, temp: 0.9,
    calm: { face: '🦊', text: 'flicks its tail' }, lie: { face: '😼', text: 'licks its lips' }, text: 'Smooth, patient and good with numbers.',
  },
  nun: {
    id: 'nun', name: 'Iron Nun', icon: '😇', readers: ['paranoid'], hp: 20, dmg: D(5, 5, 5, 8), honesty: 0.65, tellAcc: 0.65, smart: 0.4, temp: 1.0,
    calm: { face: '😇', text: 'prays quietly' }, lie: { face: '😬', text: 'grips her beads' }, text: 'She has heard every confession. She trusts none.',
  },
  dancer: {
    id: 'dancer', name: 'Twin Dancer', icon: '💃', readers: ['mirror'], hp: 20, dmg: D(5, 5, 5, 8), honesty: 0.6, tellAcc: 0.6, smart: 0.5, temp: 0.9,
    calm: { face: '💃', text: 'spins' }, lie: { face: '🕺', text: 'misses a step' }, text: 'Follows your lead, step by step.',
  },
  heir: {
    id: 'heir', name: 'Bored Heir', icon: '🤴', readers: ['gullible'], hp: 22, dmg: D(5, 5, 5, 10), honesty: 0.7, tellAcc: 0.7, smart: 0.3, temp: 1.1,
    calm: { face: '🥱', text: 'yawns' }, lie: { face: '😤', text: 'huffs' }, text: 'Rich, slow to doubt and hits hard.',
  },
  duke: {
    id: 'duke', name: 'Masked Duke', icon: '🎩', readers: ['mirror', 'statistician'], hp: 31, dmg: D(5, 5, 5, 8), honesty: 0.55, tellAcc: 0.6, smart: 0.6, temp: 0.9, champion: true,
    calm: { face: '🎩', text: 'tips his hat' }, lie: { face: '🧐', text: 'adjusts his monocle' }, text: 'Mirrors you at first. At half HP he starts counting.',
  },
  // Hall 3
  spy: {
    id: 'spy', name: 'Spymaster', icon: '🕵️', readers: ['statistician'], hp: 27, dmg: D(8, 8, 8, 11), honesty: 0.55, tellAcc: 0.6, smart: 0.7, temp: 0.8,
    calm: { face: '🕵️', text: 'writes a note' }, lie: { face: '🤨', text: 'raises a brow' }, text: 'Knows your habits before you do.',
  },
  inq: {
    id: 'inq', name: 'Inquisitor', icon: '👺', readers: ['paranoid'], hp: 27, dmg: D(8, 8, 8, 11), honesty: 0.6, tellAcc: 0.6, smart: 0.5, temp: 0.9,
    calm: { face: '😠', text: 'glares' }, lie: { face: '😤', text: 'breathes hard' }, text: 'Guilty until proven honest.',
  },
  jester: {
    id: 'jester', name: 'Court Jester', icon: '🃏', readers: ['mirror'], hp: 27, dmg: D(8, 8, 8, 11), honesty: 0.6, tellAcc: 0.6, smart: 0.5, temp: 0.8,
    calm: { face: '😜', text: 'sticks out his tongue' }, lie: { face: '🙃', text: 'turns upside down' }, text: 'Plays your own game back at you.',
  },
  knight: {
    id: 'knight', name: 'Old Knight', icon: '👴', readers: ['gullible'], hp: 29, dmg: D(9, 8, 8, 13), honesty: 0.75, tellAcc: 0.6, smart: 0.3, temp: 1.1,
    calm: { face: '👴', text: 'nods slowly' }, lie: { face: '😓', text: 'sweats' }, text: 'Honest to a fault. Expects the same of you.',
  },
  king: {
    id: 'king', name: 'Faceless King', icon: '👤', readers: ['paranoid', 'mirror', 'gullible', 'statistician'], hp: 50, dmg: D(8, 8, 8, 11), honesty: 0.55, tellAcc: 0.6, smart: 0.7, temp: 0.8, champion: true,
    calm: { face: '😶', text: 'sits still' }, lie: { face: '🫥', text: 'flickers' }, text: 'Changes how it reads you at every quarter of its HP.',
  },
};

export interface HallDef {
  name: string;
  icon: string;
  foes: string[];
  champion: string;
}

export const HALLS: HallDef[] = [
  { name: 'The Back Room', icon: '🍺', foes: ['sailor', 'thief', 'mime', 'counter'], champion: 'fortune' },
  { name: 'The Masquerade', icon: '🎭', foes: ['fox', 'nun', 'dancer', 'heir'], champion: 'duke' },
  { name: 'The Throne Room', icon: '👑', foes: ['spy', 'inq', 'jester', 'knight'], champion: 'king' },
];

/** Regular duels per hall before the champion. */
export const DUELS_PER_HALL = 2;
