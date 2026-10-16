/** Static game data: hero classes, synergies, enemies, stages. */

export const GRID_W = 18;
export const GRID_H = 18;
/** Simulation step in seconds. */
export const DT = 1 / 30;
export const WAVES = 15;
export const WAVES_PER_STAGE = 5;
export const MAX_PARTY = 8;

export type ClassId = 'knight' | 'archer' | 'mage' | 'cleric' | 'rogue' | 'frost' | 'bomber';
export type Pattern = 'melee' | 'shot' | 'blast' | 'heal';

export interface ClassDef {
  id: ClassId;
  name: string;
  icon: string;
  color: string;
  hp: number;
  dmg: number;
  /** Seconds between attacks. */
  cd: number;
  /** Range in cells. Melee uses 1 (all 8 neighbours). */
  range: number;
  pattern: Pattern;
  /** Blast radius in cells (blast only). */
  area?: number;
  text: string;
  /** Best wave needed to unlock. 0 = open from the start. */
  unlock: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  knight: { id: 'knight', name: 'Knight', icon: '🛡️', color: '#4f7cff', hp: 16, dmg: 3, cd: 0.75, range: 1, pattern: 'melee', text: 'Hits up to 2 enemies next to it. Tough.', unlock: 0 },
  archer: { id: 'archer', name: 'Archer', icon: '🏹', color: '#3fbf6a', hp: 9, dmg: 2, cd: 0.6, range: 6, pattern: 'shot', text: 'Shoots the nearest enemy from far away.', unlock: 0 },
  mage: { id: 'mage', name: 'Mage', icon: '🔮', color: '#b04cff', hp: 8, dmg: 2, cd: 1.4, range: 5, pattern: 'blast', area: 1.5, text: 'Fire blast that hits a 3×3 area.', unlock: 0 },
  cleric: { id: 'cleric', name: 'Cleric', icon: '✨', color: '#ffd166', hp: 10, dmg: 2, cd: 2.0, range: 4, pattern: 'heal', text: 'Heals the most hurt hero. Smites when all are well.', unlock: 0 },
  rogue: { id: 'rogue', name: 'Rogue', icon: '🗡️', color: '#e85d75', hp: 10, dmg: 2, cd: 0.38, range: 1, pattern: 'melee', text: 'Very fast stabs. 25% chance to crit for ×2.', unlock: 4 },
  frost: { id: 'frost', name: 'Frost Witch', icon: '❄️', color: '#5ad1e8', hp: 8, dmg: 1.5, cd: 0.9, range: 5, pattern: 'shot', text: 'Ice bolts slow the target to half speed for 2 s.', unlock: 7 },
  bomber: { id: 'bomber', name: 'Bomber', icon: '💣', color: '#ff8c42', hp: 11, dmg: 4, cd: 2.1, range: 6, pattern: 'blast', area: 1.5, text: 'Slow, heavy bombs that hit a 3×3 area.', unlock: 11 },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

export interface SynergyDef {
  name: string;
  /** Text for 2 and 3+ heroes of the class. */
  tiers: [string, string];
}

export const SYNERGIES: Record<ClassId, SynergyDef> = {
  knight: { name: 'Shield Wall', tiers: ['All heroes take 1 less damage', 'All heroes take 2 less damage'] },
  archer: { name: 'Volley', tiers: ['Archers +1 range, +20% speed', 'Archers +2 range, +40% speed'] },
  mage: { name: 'Arcana', tiers: ['Blasts deal +30% damage', 'Blasts deal +60% damage'] },
  cleric: { name: 'Sanctuary', tiers: ['Heals +2', 'Heals +4, party regen'] },
  rogue: { name: 'Ambush', tiers: ['Crit chance +20%', 'Crit chance +40%'] },
  frost: { name: 'Deep Freeze', tiers: ['Slow lasts +1.5 s', 'Slow lasts +3 s, frost hits 3×3'] },
  bomber: { name: 'Siege', tiers: ['All damage +15%', 'All damage +30%'] },
};

/** Synergy tier per class: 0 none, 1 for two heroes, 2 for three or more. */
export type SynergyTiers = Partial<Record<ClassId, number>>;

export function synergyTiers(classes: ClassId[]): SynergyTiers {
  const n: Partial<Record<ClassId, number>> = {};
  for (const c of classes) n[c] = (n[c] ?? 0) + 1;
  const t: SynergyTiers = {};
  for (const c of CLASS_IDS) {
    const k = n[c] ?? 0;
    if (k >= 3) t[c] = 2;
    else if (k === 2) t[c] = 1;
  }
  return t;
}

export interface HeroStats {
  maxHp: number;
  dmg: number;
  cd: number;
  range: number;
  area: number;
  crit: number;
  heal: number;
  slow: number;
}

/** Final stats of a hero from its class, stars, the party level and the synergies. */
export function heroStats(cls: ClassId, stars: number, level: number, syn: SynergyTiers): HeroStats {
  const d = CLASSES[cls];
  const lv = level - 1;
  let dmg = d.dmg * (1 + 0.14 * lv) * (1 + 0.35 * stars);
  let cd = d.cd * (1 - 0.07 * stars);
  let range = d.range;
  let area = d.area ?? 0;
  const maxHp = Math.round(d.hp * (1 + 0.12 * lv) * (1 + 0.25 * stars));
  let crit = cls === 'rogue' ? 0.25 : 0;
  let heal = cls === 'cleric' ? 2 + Math.floor(lv / 3) + stars : 0;
  let slow = cls === 'frost' ? 2 : 0;
  const t = (c: ClassId) => syn[c] ?? 0;
  if (cls === 'archer' && t('archer')) {
    range += t('archer');
    cd /= 1 + 0.2 * t('archer');
  }
  if (d.pattern === 'blast' && t('mage')) dmg *= 1 + 0.3 * t('mage');
  if (cls === 'cleric') heal += 2 * t('cleric');
  if (cls === 'rogue') crit += 0.2 * t('rogue');
  if (cls === 'frost') {
    slow += 1.5 * t('frost');
    if (t('frost') >= 2) area = 1.5;
  }
  dmg *= 1 + 0.15 * t('bomber');
  return { maxHp, dmg, cd, range, area, crit, heal, slow };
}

export type Brain = 'chase' | 'erratic' | 'ranged' | 'charger' | 'ghost';

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  hp: number;
  dmg: number;
  /** Seconds per cell step. */
  speed: number;
  brain: Brain;
  xp: number;
  /** Splits into this many slimes on death. */
  split?: number;
  boss?: boolean;
  text: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  slime: { id: 'slime', name: 'Slime', icon: '🟢', color: '#56c271', hp: 4, dmg: 1, speed: 0.55, brain: 'chase', xp: 1, text: 'Slow. Chases the nearest hero.' },
  goblin: { id: 'goblin', name: 'Goblin', icon: '👺', color: '#c0563f', hp: 6, dmg: 2, speed: 0.34, brain: 'chase', xp: 2, text: 'Quick chaser.' },
  bat: { id: 'bat', name: 'Bat', icon: '🦇', color: '#7b5ea7', hp: 3, dmg: 1, speed: 0.22, brain: 'erratic', xp: 1, text: 'Fast and erratic.' },
  archer: { id: 'archer', name: 'Skeleton Archer', icon: '💀', color: '#d9d4c7', hp: 5, dmg: 2, speed: 0.45, brain: 'ranged', xp: 2, text: 'Keeps its distance and shoots bolts.' },
  boar: { id: 'boar', name: 'Boar', icon: '🐗', color: '#9c6b3f', hp: 10, dmg: 3, speed: 0.5, brain: 'charger', xp: 3, text: 'Charges in a straight line when it sees a hero.' },
  blob: { id: 'blob', name: 'Blob', icon: '🟣', color: '#a24cc2', hp: 9, dmg: 2, speed: 0.55, brain: 'chase', xp: 2, split: 2, text: 'Splits into 2 slimes.' },
  wraith: { id: 'wraith', name: 'Wraith', icon: '👻', color: '#c9d6ff', hp: 7, dmg: 2, speed: 0.36, brain: 'ghost', xp: 3, text: 'Floats through rocks.' },
  imp: { id: 'imp', name: 'Fire Imp', icon: '😈', color: '#ff5a36', hp: 7, dmg: 3, speed: 0.4, brain: 'ranged', xp: 3, text: 'Throws fireballs from range.' },
  king: { id: 'king', name: 'Slime King', icon: '👑', color: '#3fbf6a', hp: 150, dmg: 3, speed: 0.6, brain: 'chase', xp: 15, boss: true, text: 'Boss. Spawns slimes.' },
  lord: { id: 'lord', name: 'Bone Lord', icon: '☠️', color: '#e9e4d4', hp: 220, dmg: 3, speed: 0.5, brain: 'ranged', xp: 25, boss: true, text: 'Boss. Bolt rings and skeleton guards.' },
  drake: { id: 'drake', name: 'Ember Drake', icon: '🐉', color: '#ff5a36', hp: 380, dmg: 4, speed: 0.45, brain: 'charger', xp: 40, boss: true, text: 'Boss. Charges and spits fire.' },
};

export interface StageDef {
  name: string;
  icon: string;
  floor: [string, string];
  rock: string;
  /** Enemy pool with weights. */
  pool: [string, number][];
  boss: string;
  rocks: number;
}

export const STAGES: StageDef[] = [
  { name: 'Mossy Meadow', icon: '🌿', floor: ['#1d2b1f', '#213223'], rock: '#4c5a46', pool: [['slime', 5], ['goblin', 3], ['bat', 2], ['archer', 1]], boss: 'king', rocks: 3 },
  { name: 'Bone Crypt', icon: '🕯️', floor: ['#221d2b', '#272132'], rock: '#4e4660', pool: [['goblin', 3], ['bat', 3], ['archer', 3], ['boar', 2], ['blob', 2], ['slime', 1]], boss: 'lord', rocks: 4 },
  { name: 'Ember Peak', icon: '🌋', floor: ['#2b1d1a', '#33221e'], rock: '#5e3a30', pool: [['goblin', 2], ['archer', 2], ['boar', 2], ['blob', 2], ['wraith', 3], ['imp', 3]], boss: 'drake', rocks: 5 },
];

export const stageOf = (wave: number): number => Math.min(STAGES.length - 1, Math.floor((wave - 1) / WAVES_PER_STAGE));
export const isBossWave = (wave: number): boolean => wave % WAVES_PER_STAGE === 0;

/** Gems needed to go from `level` to `level + 1`. */
export const xpNeed = (level: number): number => 10 + 7 * (level - 1);

export type Dir = 0 | 1 | 2 | 3;
/** Right, down, left, up. */
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
