/** Static game data: skills, relics, monsters, acts, starting bars, unlocks and tuning. */

export type Tag = 'attack' | 'guard' | 'heal' | 'status';

/** The effect of one skill at one level. */
export interface Fx {
  dmg?: number;
  hits?: number;
  aoe?: boolean;
  block?: number;
  heal?: number;
  poison?: number;
  weak?: number;
  vuln?: number;
  str?: number;
  thorns?: number;
  leech?: boolean;
  stun?: boolean;
  execute?: boolean;
}

export interface SkillDef {
  id: string;
  name: string;
  icon: string;
  tag: Tag;
  cost: number;
  /** Strength rating at level 1. Each level adds LEVEL_POWER. */
  power: number;
  /** Usable once per fight. */
  once?: boolean;
  /** Petals to unlock on the title screen. */
  unlock?: number;
  lv: [Fx, Fx, Fx];
}

export const MAX_LVL = 3;
export const LEVEL_POWER = 1.5;

export const SKILLS: Record<string, SkillDef> = {};
const sk = (d: SkillDef): void => {
  SKILLS[d.id] = d;
};

sk({ id: 'jab', name: 'Jab', icon: '👊', tag: 'attack', cost: 1, power: 1, lv: [{ dmg: 4 }, { dmg: 6 }, { dmg: 8 }] });
sk({ id: 'brace', name: 'Brace', icon: '🧱', tag: 'guard', cost: 1, power: 1, lv: [{ block: 4 }, { block: 6 }, { block: 8 }] });
sk({ id: 'strike', name: 'Strike', icon: '⚔️', tag: 'attack', cost: 1, power: 3, lv: [{ dmg: 6 }, { dmg: 8 }, { dmg: 11 }] });
sk({ id: 'guard', name: 'Guard', icon: '🛡️', tag: 'guard', cost: 1, power: 3, lv: [{ block: 6 }, { block: 8 }, { block: 11 }] });
sk({ id: 'heavy', name: 'Heavy Blow', icon: '🔨', tag: 'attack', cost: 2, power: 5, lv: [{ dmg: 13 }, { dmg: 17 }, { dmg: 22 }] });
sk({ id: 'twin', name: 'Twin Fang', icon: '🗡️', tag: 'attack', cost: 1, power: 4, lv: [{ dmg: 3, hits: 2 }, { dmg: 4, hits: 2 }, { dmg: 6, hits: 2 }] });
sk({ id: 'cleave', name: 'Cleave', icon: '🪓', tag: 'attack', cost: 2, power: 5, lv: [{ dmg: 7, aoe: true }, { dmg: 10, aoe: true }, { dmg: 13, aoe: true }] });
sk({ id: 'dart', name: 'Poison Dart', icon: '🧪', tag: 'status', cost: 1, power: 4, lv: [{ poison: 4 }, { poison: 6 }, { poison: 8 }] });
sk({ id: 'hex', name: 'Hex', icon: '🌀', tag: 'status', cost: 1, power: 3, lv: [{ weak: 2, dmg: 2 }, { weak: 3, dmg: 3 }, { weak: 4, dmg: 4 }] });
sk({ id: 'expose', name: 'Expose', icon: '🎯', tag: 'status', cost: 1, power: 4, lv: [{ vuln: 2 }, { vuln: 3 }, { vuln: 4 }] });
sk({ id: 'rage', name: 'Rage', icon: '😡', tag: 'status', cost: 1, power: 5, lv: [{ str: 2 }, { str: 3 }, { str: 4 }] });
sk({ id: 'bulwark', name: 'Bulwark', icon: '🏰', tag: 'guard', cost: 2, power: 4, lv: [{ block: 13 }, { block: 17 }, { block: 22 }] });
sk({ id: 'thorns', name: 'Thorn Coat', icon: '🌵', tag: 'guard', cost: 1, power: 4, lv: [{ block: 4, thorns: 3 }, { block: 5, thorns: 4 }, { block: 7, thorns: 6 }] });
sk({ id: 'parry', name: 'Parry', icon: '🤺', tag: 'guard', cost: 1, power: 4, lv: [{ block: 4, dmg: 4 }, { block: 6, dmg: 5 }, { block: 8, dmg: 7 }] });
sk({ id: 'mend', name: 'Mend', icon: '💚', tag: 'heal', cost: 2, power: 5, once: true, lv: [{ heal: 10 }, { heal: 14 }, { heal: 18 }] });
sk({ id: 'wind', name: 'Second Wind', icon: '🌬️', tag: 'heal', cost: 1, power: 4, lv: [{ heal: 3, block: 3 }, { heal: 4, block: 4 }, { heal: 6, block: 6 }] });
sk({ id: 'leech', name: 'Leech', icon: '🩸', tag: 'heal', cost: 2, power: 6, unlock: 15, lv: [{ dmg: 7, leech: true }, { dmg: 9, leech: true }, { dmg: 12, leech: true }] });
sk({ id: 'execute', name: 'Execute', icon: '💀', tag: 'attack', cost: 2, power: 6, unlock: 20, lv: [{ dmg: 8, execute: true }, { dmg: 11, execute: true }, { dmg: 14, execute: true }] });
sk({ id: 'concuss', name: 'Concuss', icon: '💫', tag: 'status', cost: 2, power: 6, unlock: 25, lv: [{ dmg: 5, stun: true }, { dmg: 7, stun: true }, { dmg: 9, stun: true }] });
sk({ id: 'bolt', name: 'Lightning', icon: '⚡', tag: 'attack', cost: 3, power: 7, unlock: 35, lv: [{ dmg: 22 }, { dmg: 30 }, { dmg: 38 }] });

export const TAG_ICON: Record<Tag, string> = { attack: '⚔️', guard: '🛡️', heal: '💚', status: '✨' };

export function skillPower(id: string, lvl: number): number {
  return SKILLS[id].power + (lvl - 1) * LEVEL_POWER;
}

/** Plain text of a skill effect, e.g. "Deal 6. Gain 4 block." */
export function fxText(fx: Fx, who: 'hero' | 'echo' = 'hero'): string {
  const out: string[] = [];
  if (fx.dmg) {
    let s = `Deal ${fx.dmg}${fx.hits ? ` ×${fx.hits}` : ''}${fx.aoe && who === 'hero' ? ' to all' : ''}`;
    if (fx.execute) s += ' (×2 if the target is below half HP)';
    if (fx.leech) s += ', heal the damage dealt';
    out.push(s + '.');
  }
  if (fx.block) out.push(`Gain ${fx.block} block.`);
  if (fx.thorns) out.push(`Thorns ${fx.thorns} until the next turn.`);
  if (fx.heal) out.push(`Heal ${fx.heal}.`);
  if (fx.poison) out.push(`Poison ${fx.poison}.`);
  if (fx.weak) out.push(`Weak ${fx.weak} turns.`);
  if (fx.vuln) out.push(`Exposed ${fx.vuln} turns.`);
  if (fx.str) out.push(`+${fx.str} strength for the fight.`);
  if (fx.stun) out.push(who === 'hero' ? 'The target skips its next move.' : 'You lose 1 energy next turn.');
  return out.join(' ');
}

export function skillText(id: string, lvl: number): string {
  const d = SKILLS[id];
  return fxText(d.lv[lvl - 1]) + (d.once ? ' Once per fight.' : '');
}

export const stars = (lvl: number): string => (lvl > 1 ? '★'.repeat(lvl - 1) : '');

// ---------- Relics ----------

export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  text: string;
}

export const RELICS: Record<string, RelicDef> = {};
const rl = (id: string, icon: string, name: string, text: string): void => {
  RELICS[id] = { id, icon, name, text };
};
rl('lethe', '🌊', 'Lethe Water', 'Forgotten skills come back 2 floors later.');
rl('ink', '📜', 'Faded Ink', 'Echoes have half HP.');
rl('ward', '🔔', 'Echo Ward', 'You deal +50% damage to echoes.');
rl('candle', '🕯️', 'Memorial Candle', 'Heal 6 when you defeat an echo.');
rl('palace', '🏛️', 'Mind Palace', '+1 memory slot with no HP cost.');
rl('whet', '🪨', 'Whetstone', 'Attack skills deal +2 damage per hit.');
rl('shell', '🐚', 'Shell Charm', 'Start each fight with 8 block.');
rl('herb', '🌿', 'Herb Pouch', 'Heal 5 after each won fight.');
rl('spark', '🔋', 'Spark Jar', '+1 energy on the first turn of each fight.');
rl('heart', '❤️', 'Old Heart', '+12 max HP.');
rl('fang', '🦷', 'Vampire Tooth', 'Heal 1 each time you use an attack skill.');
rl('knot', '🧶', 'Knotted String', 'Guard skills give +2 block.');

// ---------- Monsters ----------

/** One enemy move. Fields combine. */
export interface Move {
  a?: number;
  hits?: number;
  block?: number;
  heal?: number;
  str?: number;
  poison?: number;
  weak?: number;
  vuln?: number;
  daze?: number;
  thorns?: number;
  leech?: boolean;
  seal?: boolean;
  summon?: string;
  call?: number;
  /** Shown name of the move (echo skills use the skill name). */
  name?: string;
}

export interface MonsterDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  moves: Move[];
  elite?: boolean;
  boss?: boolean;
}

export const MONSTERS: Record<string, MonsterDef> = {};
const mo = (d: MonsterDef): void => {
  MONSTERS[d.id] = d;
};

// Act 1: Petal Meadow
mo({ id: 'slime', name: 'Slime', icon: '🟢', hp: 16, moves: [{ a: 6 }, { a: 6 }, { block: 5, a: 3 }] });
mo({ id: 'rat', name: 'Thorn Rat', icon: '🐀', hp: 11, moves: [{ a: 3, hits: 2 }, { poison: 3, a: 2 }] });
mo({ id: 'moth', name: 'Dust Moth', icon: '🦋', hp: 12, moves: [{ weak: 2 }, { a: 6 }, { a: 5 }] });
mo({ id: 'beetle', name: 'Shell Beetle', icon: '🪲', hp: 18, moves: [{ block: 8 }, { a: 8 }] });
mo({ id: 'wasp', name: 'Wasp', icon: '🐝', hp: 9, moves: [{ a: 4 }, { a: 4 }, { a: 8 }] });
mo({ id: 'briar', name: 'Briar Knight', icon: '🌹', hp: 48, elite: true, moves: [{ a: 10 }, { block: 10, thorns: 3 }, { a: 5, hits: 2 }] });
mo({ id: 'queen', name: 'Wilted Queen', icon: '🥀', hp: 84, boss: true, moves: [{ summon: 'rat', block: 6 }, { a: 10 }, { weak: 2, a: 6 }, { a: 16 }] });

// Act 2: Dusty Archive
mo({ id: 'ink', name: 'Ink Blot', icon: '🫧', hp: 22, moves: [{ a: 8 }, { weak: 2, a: 4 }, { a: 8 }] });
mo({ id: 'worm', name: 'Bookworm', icon: '🐛', hp: 18, moves: [{ a: 4, hits: 2 }, { a: 10 }] });
mo({ id: 'wisp', name: 'Candle Wisp', icon: '🕯️', hp: 15, moves: [{ poison: 4 }, { a: 7 }] });
mo({ id: 'gargoyle', name: 'Gargoyle', icon: '🗿', hp: 28, moves: [{ block: 10 }, { a: 12 }] });
mo({ id: 'quill', name: 'Quill Sprite', icon: '🪶', hp: 13, moves: [{ a: 3, hits: 3 }, { vuln: 2, a: 3 }] });
mo({ id: 'owl', name: 'Owl Librarian', icon: '🦉', hp: 76, elite: true, moves: [{ seal: true, a: 8 }, { a: 13 }, { str: 2, block: 8 }] });
mo({ id: 'censor', name: 'The Censor', icon: '✒️', hp: 140, boss: true, moves: [{ seal: true, a: 9 }, { a: 17 }, { block: 14, a: 6 }, { vuln: 2, a: 8 }] });

// Act 3: Hollow Mind
mo({ id: 'doubt', name: 'Doubt', icon: '❔', hp: 26, moves: [{ weak: 2, a: 5 }, { a: 11 }] });
mo({ id: 'regret', name: 'Regret', icon: '😔', hp: 32, moves: [{ a: 13 }, { block: 9, a: 4 }] });
mo({ id: 'static', name: 'Static', icon: '📺', hp: 20, moves: [{ daze: 1, a: 5 }, { a: 5, hits: 2 }] });
mo({ id: 'mirror', name: 'Mirror', icon: '🪞', hp: 28, moves: [{ block: 10, thorns: 3 }, { a: 12 }] });
mo({ id: 'moth2', name: 'Grey Moth', icon: '🦇', hp: 18, moves: [{ a: 6, hits: 2 }, { poison: 4, a: 4 }] });
mo({ id: 'terror', name: 'Night Terror', icon: '👁️', hp: 100, elite: true, moves: [{ a: 7, hits: 2 }, { daze: 1, weak: 2, a: 6 }, { a: 18 }] });
mo({ id: 'hollow', name: 'The Hollow Mind', icon: '🧠', hp: 170, boss: true, moves: [{ call: 2, block: 10 }, { a: 15 }, { str: 2, block: 12 }, { a: 6, hits: 3 }] });

export interface ActDef {
  name: string;
  icon: string;
  pool: string[];
  elite: string;
  boss: string;
}

export const ACTS: ActDef[] = [
  { name: 'Petal Meadow', icon: '🌸', pool: ['slime', 'rat', 'moth', 'beetle', 'wasp'], elite: 'briar', boss: 'queen' },
  { name: 'Dusty Archive', icon: '📚', pool: ['ink', 'worm', 'wisp', 'gargoyle', 'quill'], elite: 'owl', boss: 'censor' },
  { name: 'Hollow Mind', icon: '🌑', pool: ['doubt', 'regret', 'static', 'mirror', 'moth2'], elite: 'terror', boss: 'hollow' },
];

export const FLOORS_PER_ACT = 8;
export const LAST_FLOOR = ACTS.length * FLOORS_PER_ACT;

// ---------- Starting bars and unlocks ----------

export interface BarDef {
  id: string;
  name: string;
  icon: string;
  skills: string[];
  text: string;
  unlock?: number;
}

export const BARS: BarDef[] = [
  { id: 'wanderer', name: 'Wanderer', icon: '🎒', skills: ['jab', 'brace', 'strike', 'guard'], text: 'Jab, Brace, Strike, Guard. Two weak skills to forget first.' },
  { id: 'duelist', name: 'Duelist', icon: '🤺', skills: ['jab', 'brace', 'twin', 'parry'], text: 'Fast hits and counters.', unlock: 20 },
  { id: 'alchemist', name: 'Alchemist', icon: '⚗️', skills: ['jab', 'dart', 'hex', 'wind'], text: 'Poison, Hex and Second Wind.', unlock: 30 },
];

// ---------- Tuning ----------

export const TUNE = {
  heroHp: 60,
  energy: 3,
  startSlots: 4,
  maxSlots: 7,
  slotHpCost: 8,
  /** Echoes appear this many floors after the floor where you forgot the skill. */
  echoDelay: 3,
  echoHpBase: 6,
  echoHpPer: 4,
  /** Echo skill numbers are multiplied by this. */
  echoFx: 0.8,
  /** HP and damage growth per act for normal monsters and echoes. */
  actHp: [1, 1.2, 1.4],
  actDmg: [1, 1.15, 1.3],
  echoAct: [1, 1.25, 1.5],
  restHeal: 0.3,
  maxEchoesPerFight: 2,
  finalEchoesOnField: 3,
};
