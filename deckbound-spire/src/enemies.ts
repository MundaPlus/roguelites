import type { Combat } from './combat';
import type { Rng } from './rng';
import type { Fighter, Intent, Op, StatusId, Statuses } from './types';

export interface Move {
  name: string;
  intent: Intent;
  ops: Op[] | ((e: EnemyState, c: Combat) => Op[]);
}

export interface EnemyDef {
  id: string;
  name: string;
  art: string;
  hp: [number, number];
  size?: 'small' | 'big' | 'boss';
  start?: Statuses;
  moves: Record<string, Move>;
  /** Picks the next move. It runs at combat start and after each move. */
  ai(e: EnemyState, c: Combat): string;
  init?(e: EnemyState, rng: Rng): void;
  onDeath?: Op[];
}

export interface EnemyState extends Fighter {
  uid: number;
  def: EnemyDef;
  move: string;
  history: string[];
  dead: boolean;
  /** Per-enemy memory for AI patterns. idx is the slot in the encounter. */
  mem: Record<string, number>;
}

// ---------------------------------------------------------------- AI helpers

const turn = (e: EnemyState): number => e.history.length;
const last = (e: EnemyState): string | undefined => e.history[e.history.length - 1];

/** True when the last k moves were all m. */
const repeated = (e: EnemyState, m: string, k: number): boolean =>
  e.history.length >= k && e.history.slice(-k).every((h) => h === m);

/** Weighted pick. A move may not repeat more than maxRepeat times in a row. Weight 0 removes it. */
function weighted(e: EnemyState, c: Combat, opts: [string, number, number][]): string {
  const ok = opts.filter(([m, w, max]) => w > 0 && !repeated(e, m, max));
  return c.rng.weighted((ok.length ? ok : opts).map(([m, w]) => [m, w] as const));
}

const dmg = (n: number, times?: number): Op => ({ op: 'dmg', n, times });
const block = (n: number): Op => ({ op: 'block', n });
const status = (s: StatusId, n: number, to: 'self' | 'target'): Op => ({ op: 'status', s, n, to });
const buff = (s: StatusId, n: number): Op => status(s, n, 'self');
const debuff = (s: 'weak' | 'vulnerable' | 'frail', n: number): Op => status(s, n, 'target');
const give = (id: string, n: number): Op => ({ op: 'addCard', id, n, to: 'discard' });

// ---------------------------------------------------------------- act 1

const act1: EnemyDef[] = [
  {
    id: 'jawWorm', name: 'Jaw Worm', art: '🪱', hp: [40, 44],
    moves: {
      chomp: { name: 'Chomp', intent: 'attack', ops: [dmg(11)] },
      thrash: { name: 'Thrash', intent: 'attackDefend', ops: [dmg(7), block(5)] },
      bellow: { name: 'Bellow', intent: 'defendBuff', ops: [buff('strength', 3), block(6)] },
    },
    ai: (e, c) => (turn(e) === 0 ? 'chomp' : weighted(e, c, [['bellow', 45, 1], ['thrash', 30, 2], ['chomp', 25, 1]])),
  },
  {
    id: 'cultist', name: 'Cultist', art: '🧙', hp: [48, 54],
    moves: {
      incantation: { name: 'Incantation', intent: 'buff', ops: [buff('ritual', 3)] },
      darkStrike: { name: 'Dark Strike', intent: 'attack', ops: [dmg(6)] },
    },
    ai: (e) => (turn(e) === 0 ? 'incantation' : 'darkStrike'),
  },
  {
    id: 'acidSlime', name: 'Acid Slime', art: '🟢', hp: [28, 32],
    moves: {
      spit: { name: 'Corrosive Spit', intent: 'attackDebuff', ops: [dmg(7), give('slimed', 1)] },
      tackle: { name: 'Tackle', intent: 'attack', ops: [dmg(10)] },
      lick: { name: 'Lick', intent: 'debuff', ops: [debuff('weak', 1)] },
    },
    ai: (e, c) => weighted(e, c, [['spit', 30, 2], ['tackle', 40, 1], ['lick', 30, 1]]),
  },
  {
    id: 'louse', name: 'Red Louse', art: '🐛', hp: [11, 17], size: 'small',
    init: (e, rng) => (e.mem.bite = rng.int(5, 7)),
    moves: {
      bite: { name: 'Bite', intent: 'attack', ops: (e) => [dmg(e.mem.bite)] },
      grow: { name: 'Grow', intent: 'buff', ops: [buff('strength', 3)] },
    },
    ai: (e, c) => weighted(e, c, [['bite', 75, 2], ['grow', 25, 1]]),
  },
  {
    id: 'fungi', name: 'Fungi Beast', art: '🍄', hp: [22, 28],
    moves: {
      bite: { name: 'Bite', intent: 'attack', ops: [dmg(6)] },
      grow: { name: 'Grow', intent: 'buff', ops: [buff('strength', 3)] },
    },
    ai: (e, c) => weighted(e, c, [['bite', 60, 2], ['grow', 40, 1]]),
    onDeath: [debuff('vulnerable', 2)],
  },
  {
    id: 'gremlinNob', name: 'Gremlin Nob', art: '👺', hp: [82, 86], size: 'big',
    moves: {
      bellow: { name: 'Bellow', intent: 'buff', ops: [buff('enrage', 2)] },
      rush: { name: 'Rush', intent: 'attack', ops: [dmg(14)] },
      skullBash: { name: 'Skull Bash', intent: 'attackDebuff', ops: [dmg(6), debuff('vulnerable', 2)] },
    },
    ai: (e, c) => (turn(e) === 0 ? 'bellow' : weighted(e, c, [['skullBash', 33, 1], ['rush', 67, 2]])),
  },
  {
    id: 'sentry', name: 'Sentry', art: '🗼', hp: [38, 42], start: { artifact: 1 },
    moves: {
      bolt: { name: 'Bolt', intent: 'attack', ops: [dmg(9)] },
      beam: { name: 'Beam', intent: 'debuff', ops: [give('dazed', 2)] },
    },
    ai: (e) => {
      if (turn(e) === 0) return e.mem.idx % 2 === 1 ? 'bolt' : 'beam';
      return last(e) === 'bolt' ? 'beam' : 'bolt';
    },
  },
  {
    id: 'hexGolem', name: 'Hexflame Golem', art: '🌋', hp: [210, 210], size: 'boss',
    moves: {
      smoulder: { name: 'Smoulder', intent: 'defend', ops: [block(12)] },
      divider: { name: 'Divider', intent: 'attack', ops: (_e, c) => [dmg(Math.floor(c.player.hp / 12) + 1, 6)] },
      sear: { name: 'Sear', intent: 'attackDebuff', ops: [dmg(6), give('burn', 1)] },
      tackle: { name: 'Tackle', intent: 'attack', ops: [dmg(5, 2)] },
      inflame: { name: 'Inflame', intent: 'defendBuff', ops: [buff('strength', 2), block(12)] },
      inferno: { name: 'Inferno', intent: 'attackDebuff', ops: [dmg(2, 6), give('burn', 3)] },
    },
    ai: (e) => {
      const t = turn(e);
      if (t === 0) return 'smoulder';
      if (t === 1) return 'divider';
      return ['sear', 'tackle', 'sear', 'inflame', 'tackle', 'sear', 'inferno'][(t - 2) % 7];
    },
  },
];

// ---------------------------------------------------------------- act 2

const act2: EnemyDef[] = [
  {
    id: 'byrd', name: 'Byrd', art: '🐦', hp: [25, 31], size: 'small',
    moves: {
      peck: { name: 'Peck', intent: 'attack', ops: [dmg(1, 5)] },
      caw: { name: 'Caw', intent: 'buff', ops: [buff('strength', 1)] },
      swoop: { name: 'Swoop', intent: 'attack', ops: [dmg(12)] },
    },
    ai: (e, c) => weighted(e, c, [['peck', 50, 2], ['caw', 30, 1], ['swoop', 20, 1]]),
  },
  {
    id: 'centurion', name: 'Centurion', art: '🛡️', hp: [76, 80],
    moves: {
      slash: { name: 'Slash', intent: 'attack', ops: [dmg(12)] },
      protect: { name: 'Protect', intent: 'defend', ops: [{ op: 'allyBlock', n: 15 }] },
      fury: { name: 'Fury', intent: 'attack', ops: [dmg(6, 3)] },
    },
    ai: (e, c) => {
      const allies = c.alive().length > 1;
      return weighted(e, c, [['protect', allies ? 35 : 0, 1], ['slash', 35, 2], ['fury', 30, 1]]);
    },
  },
  {
    id: 'mystic', name: 'Mystic', art: '🧝', hp: [48, 56],
    moves: {
      heal: { name: 'Heal', intent: 'buff', ops: [{ op: 'healAllies', n: 16 }] },
      attack: { name: 'Hex Bolt', intent: 'attackDebuff', ops: [dmg(8), debuff('frail', 2)] },
      buff: { name: 'Rally', intent: 'buff', ops: [{ op: 'statusAllies', s: 'strength', n: 2 }] },
    },
    ai: (e, c) => {
      const hurt = c.alive().reduce((a, x) => a + (x.maxHp - x.hp), 0);
      if (hurt >= 16 && last(e) !== 'heal') return 'heal';
      return weighted(e, c, [['attack', 60, 2], ['buff', 40, 1]]);
    },
  },
  {
    id: 'snakePlant', name: 'Snake Plant', art: '🌿', hp: [75, 79], size: 'big',
    moves: {
      chomp: { name: 'Chomp', intent: 'attack', ops: [dmg(7, 3)] },
      spores: { name: 'Enfeebling Spores', intent: 'debuff', ops: [debuff('weak', 2), debuff('frail', 2)] },
    },
    ai: (e, c) => weighted(e, c, [['chomp', 65, 2], ['spores', 35, 1]]),
  },
  {
    id: 'chosen', name: 'Chosen', art: '🧛', hp: [95, 99],
    moves: {
      poke: { name: 'Poke', intent: 'attack', ops: [dmg(5, 2)] },
      drain: { name: 'Drain', intent: 'debuff', ops: [debuff('weak', 3), buff('strength', 3)] },
      zap: { name: 'Zap', intent: 'attack', ops: [dmg(18)] },
      debilitate: { name: 'Debilitate', intent: 'attackDebuff', ops: [dmg(10), debuff('vulnerable', 2)] },
    },
    ai: (e, c) => {
      if (turn(e) === 0) return 'poke';
      if (turn(e) === 1) return 'drain';
      return weighted(e, c, [['zap', 40, 1], ['debilitate', 35, 1], ['poke', 25, 1]]);
    },
  },
  {
    id: 'bookOfStabbing', name: 'Book of Stabbing', art: '📕', hp: [160, 164], size: 'big',
    moves: {
      multi: { name: 'Multi-Stab', intent: 'attack', ops: (e) => [dmg(6, 1 + (e.mem.stabs ?? 1))] },
      single: { name: 'Single Stab', intent: 'attack', ops: [dmg(21)] },
    },
    ai: (e, c) => {
      const m = weighted(e, c, [['multi', 85, 2], ['single', 15, 1]]);
      if (m === 'multi') e.mem.stabs = (e.mem.stabs ?? 0) + 1;
      return m;
    },
  },
  {
    id: 'taskmaster', name: 'Taskmaster', art: '🧌', hp: [60, 64], size: 'big',
    moves: {
      whip: { name: 'Scouring Whip', intent: 'attackDebuff', ops: [dmg(7), give('wound', 1)] },
      rally: { name: 'Rally', intent: 'buff', ops: [{ op: 'statusAllies', s: 'strength', n: 3 }] },
    },
    ai: (e) => (turn(e) % 3 === 2 ? 'rally' : 'whip'),
  },
  {
    id: 'champion', name: 'The Champion', art: '👑', hp: [380, 380], size: 'boss',
    moves: {
      heavySlash: { name: 'Heavy Slash', intent: 'attack', ops: [dmg(16)] },
      stance: { name: 'Defensive Stance', intent: 'defendBuff', ops: [block(15), buff('metallicize', 5)] },
      faceSlap: { name: 'Face Slap', intent: 'attackDebuff', ops: [dmg(12), debuff('weak', 2), debuff('vulnerable', 2)] },
      gloat: { name: 'Gloat', intent: 'buff', ops: [buff('strength', 2)] },
      anger: { name: 'Anger', intent: 'buff', ops: [{ op: 'cleanse' }, buff('strength', 6)] },
      execute: { name: 'Execute', intent: 'attack', ops: [dmg(10, 2)] },
    },
    ai: (e, c) => {
      if (e.hp < e.maxHp / 2 && !e.mem.angry) {
        e.mem.angry = 1;
        return 'anger';
      }
      if (e.mem.angry) {
        const recent = e.history.slice(-2);
        if (!recent.includes('execute')) return 'execute';
        return weighted(e, c, [['heavySlash', 50, 1], ['faceSlap', 50, 1]]);
      }
      const m = weighted(e, c, [['heavySlash', 30, 1], ['faceSlap', 25, 1], ['gloat', 20, 1], ['stance', (e.mem.stances ?? 0) < 2 ? 25 : 0, 1]]);
      if (m === 'stance') e.mem.stances = (e.mem.stances ?? 0) + 1;
      return m;
    },
  },
];

// ---------------------------------------------------------------- act 3

const act3: EnemyDef[] = [
  {
    id: 'darkling', name: 'Darkling', art: '🌑', hp: [48, 56],
    init: (e, rng) => (e.mem.nip = rng.int(7, 11)),
    moves: {
      nip: { name: 'Nip', intent: 'attack', ops: (e) => [dmg(e.mem.nip)] },
      chomp: { name: 'Chomp', intent: 'attack', ops: [dmg(9, 2)] },
      harden: { name: 'Harden', intent: 'defend', ops: [block(12)] },
    },
    ai: (e, c) => weighted(e, c, [['nip', 40, 2], ['chomp', 30, 1], ['harden', 30, 1]]),
  },
  {
    id: 'orbWalker', name: 'Orb Walker', art: '🤖', hp: [90, 96], size: 'big', start: { ritual: 2 },
    moves: {
      laser: { name: 'Laser', intent: 'attackDebuff', ops: [dmg(10), give('burn', 1)] },
      claw: { name: 'Claw', intent: 'attack', ops: [dmg(15)] },
    },
    ai: (e, c) => weighted(e, c, [['laser', 60, 2], ['claw', 40, 2]]),
  },
  {
    id: 'spiker', name: 'Spiker', art: '🦔', hp: [42, 56], start: { thorns: 3 },
    moves: {
      cut: { name: 'Cut', intent: 'attack', ops: [dmg(7)] },
      spike: { name: 'Spike', intent: 'buff', ops: [buff('thorns', 2)] },
    },
    ai: (e, c) => {
      const spikes = e.history.filter((h) => h === 'spike').length;
      return weighted(e, c, [['cut', 50, 1], ['spike', spikes < 5 ? 50 : 0, 2]]);
    },
  },
  {
    id: 'exploder', name: 'Exploder', art: '💣', hp: [30, 30], size: 'small',
    moves: {
      slam: { name: 'Slam', intent: 'attack', ops: [dmg(9)] },
      explode: { name: 'Explode', intent: 'special', ops: [dmg(30), { op: 'suicide' }] },
    },
    ai: (e) => (turn(e) < 2 ? 'slam' : 'explode'),
  },
  {
    id: 'giantHead', name: 'Giant Head', art: '🗿', hp: [300, 300], size: 'big',
    moves: {
      glare: { name: 'Glare', intent: 'debuff', ops: [debuff('weak', 1)] },
      count: { name: 'Count', intent: 'attack', ops: [dmg(13)] },
      itIsTime: { name: 'It Is Time', intent: 'attack', ops: (e) => [dmg(30 + 5 * Math.min(e.mem.time ?? 0, 6))] },
    },
    ai: (e, c) => {
      if (turn(e) < 4) return weighted(e, c, [['glare', 50, 1], ['count', 50, 1]]);
      e.mem.time = (e.mem.time ?? -1) + 1;
      return 'itIsTime';
    },
  },
  {
    id: 'nemesis', name: 'Nemesis', art: '👻', hp: [185, 185], size: 'big',
    moves: {
      scythe: { name: 'Scythe', intent: 'attack', ops: [dmg(45)] },
      tri: { name: 'Triple Strike', intent: 'attack', ops: [dmg(6, 3)] },
      burn: { name: 'Debilitate', intent: 'debuff', ops: [give('burn', 3)] },
    },
    ai: (e, c) => (turn(e) === 0 ? weighted(e, c, [['tri', 50, 1], ['burn', 50, 1]]) : weighted(e, c, [['scythe', 35, 1], ['tri', 35, 1], ['burn', 30, 1]])),
  },
  {
    id: 'ashenLord', name: 'The Ashen Lord', art: '👹', hp: [450, 450], size: 'boss',
    moves: {
      ripple: { name: 'Ripple', intent: 'defendDebuff', ops: [block(16), debuff('weak', 1), debuff('vulnerable', 1), debuff('frail', 1)] },
      reverberate: { name: 'Reverberate', intent: 'attack', ops: [dmg(11, 3)] },
      smite: { name: 'Smite', intent: 'attack', ops: [dmg(30)] },
      cinders: { name: 'Cinders', intent: 'debuff', ops: [give('burn', 3)] },
      awaken: { name: 'Awaken', intent: 'buff', ops: [{ op: 'cleanse' }, buff('strength', 4), buff('metallicize', 6)] },
    },
    ai: (e) => {
      if (e.hp <= e.maxHp / 2 && !e.mem.awake) {
        e.mem.awake = 1;
        return 'awaken';
      }
      return ['ripple', 'reverberate', 'smite', 'cinders', 'reverberate'][turn(e) % 5];
    },
  },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries([...act1, ...act2, ...act3].map((d) => [d.id, d]));

export interface ActDef {
  name: string;
  /** The first 3 fights of an act come from the weak pool. */
  weak: string[][];
  strong: string[][];
  elites: string[][];
  boss: string[];
}

export const ACTS: ActDef[] = [
  {
    name: 'The Ember Wastes',
    weak: [['cultist'], ['jawWorm'], ['louse', 'louse'], ['acidSlime', 'louse']],
    strong: [['fungi', 'fungi'], ['cultist', 'louse'], ['jawWorm', 'acidSlime'], ['louse', 'louse', 'louse'], ['acidSlime', 'acidSlime', 'fungi']],
    elites: [['gremlinNob'], ['sentry', 'sentry', 'sentry']],
    boss: ['hexGolem'],
  },
  {
    name: 'The Hollow City',
    weak: [['byrd', 'byrd', 'byrd'], ['chosen'], ['snakePlant']],
    strong: [['centurion', 'mystic'], ['chosen', 'byrd'], ['snakePlant', 'byrd'], ['byrd', 'byrd', 'byrd', 'byrd']],
    elites: [['bookOfStabbing'], ['byrd', 'taskmaster', 'byrd']],
    boss: ['champion'],
  },
  {
    name: 'The Ashen Spire',
    weak: [['darkling', 'darkling', 'darkling'], ['orbWalker'], ['spiker', 'exploder']],
    strong: [['orbWalker', 'spiker'], ['exploder', 'spiker', 'exploder'], ['darkling', 'orbWalker'], ['spiker', 'spiker', 'exploder']],
    elites: [['giantHead'], ['nemesis']],
    boss: ['ashenLord'],
  },
];
