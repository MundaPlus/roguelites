export type Tier = 'normal' | 'elite' | 'boss';

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  dice: number;
  /** [equipment id, level] */
  equip: [string, number][];
  floor: number;
  tier: Tier;
}

const LIST: EnemyDef[] = [
  // Floor 1
  { id: 'rat', name: 'Giant Rat', icon: '🐀', hp: 13, dice: 1, equip: [['bite', 0], ['claw', 0]], floor: 1, tier: 'normal' },
  { id: 'slime', name: 'Slime', icon: '🟢', hp: 16, dice: 1, equip: [['spit', 0], ['harden', 0]], floor: 1, tier: 'normal' },
  { id: 'bat', name: 'Cave Bat', icon: '🦇', hp: 11, dice: 1, equip: [['bite', 1], ['drain', 0]], floor: 1, tier: 'normal' },
  { id: 'goblin', name: 'Goblin', icon: '👺', hp: 15, dice: 1, equip: [['claw', 0], ['slam', 0], ['harden', 0]], floor: 1, tier: 'normal' },
  { id: 'brute', name: 'Goblin Brute', icon: '👹', hp: 24, dice: 2, equip: [['claw', 0], ['slam', 0], ['harden', 0]], floor: 1, tier: 'elite' },
  { id: 'goblin-king', name: 'Goblin King', icon: '🤴', hp: 38, dice: 2, equip: [['claw', 0], ['harden', 0], ['smash', 0]], floor: 1, tier: 'boss' },

  // Floor 2
  { id: 'skeleton', name: 'Skeleton', icon: '💀', hp: 22, dice: 2, equip: [['claw', 0], ['harden', 0]], floor: 2, tier: 'normal' },
  { id: 'cultist', name: 'Cultist', icon: '🧙', hp: 20, dice: 2, equip: [['venom', 0], ['curse', 0], ['claw', 0]], floor: 2, tier: 'normal' },
  { id: 'imp', name: 'Fire Imp', icon: '😈', hp: 18, dice: 2, equip: [['flame', 0], ['bite', 0]], floor: 2, tier: 'normal' },
  { id: 'mushroom', name: 'Sporeling', icon: '🍄', hp: 24, dice: 2, equip: [['spit', 0], ['regrow', 0]], floor: 2, tier: 'normal' },
  { id: 'ogre', name: 'Ogre', icon: '🧌', hp: 42, dice: 2, equip: [['slam', 1], ['harden', 0], ['smash', 0]], floor: 2, tier: 'elite' },
  { id: 'bone-dragon', name: 'Bone Dragon', icon: '🐉', hp: 62, dice: 3, equip: [['flame', 1], ['claw', 0], ['harden', 0], ['smash', 0]], floor: 2, tier: 'boss' },

  // Floor 3
  { id: 'ice-witch', name: 'Ice Witch', icon: '🧝', hp: 30, dice: 2, equip: [['frost', 0], ['claw', 1], ['harden', 0]], floor: 3, tier: 'normal' },
  { id: 'golem', name: 'Stone Golem', icon: '🗿', hp: 38, dice: 2, equip: [['harden', 1], ['smash', 0]], floor: 3, tier: 'normal' },
  { id: 'bandit', name: 'Bandit', icon: '🥷', hp: 28, dice: 3, equip: [['bite', 0], ['claw', 0], ['curse', 0]], floor: 3, tier: 'normal' },
  { id: 'wolves', name: 'Wolf Pack', icon: '🐺', hp: 26, dice: 3, equip: [['bite', 0], ['bite', 0], ['claw', 0]], floor: 3, tier: 'normal' },
  { id: 'troll', name: 'Frost Troll', icon: '🧊', hp: 56, dice: 3, equip: [['frost', 0], ['slam', 1], ['regrow', 0]], floor: 3, tier: 'elite' },
  { id: 'frost-queen', name: 'Frost Queen', icon: '👸', hp: 84, dice: 3, equip: [['frost', 1], ['spit', 1], ['harden', 1], ['smash', 1]], floor: 3, tier: 'boss' },

  // Floor 4
  { id: 'sprite', name: 'Storm Sprite', icon: '🌀', hp: 34, dice: 3, equip: [['spark', 0], ['claw', 1], ['harden', 0]], floor: 4, tier: 'normal' },
  { id: 'vampire', name: 'Vampire', icon: '🧛', hp: 40, dice: 3, equip: [['drain', 1], ['bite', 1], ['curse', 0]], floor: 4, tier: 'normal' },
  { id: 'knight', name: 'Dark Knight', icon: '🤺', hp: 46, dice: 3, equip: [['slam', 1], ['harden', 1], ['claw', 1]], floor: 4, tier: 'normal' },
  { id: 'death-knight', name: 'Death Knight', icon: '☠️', hp: 72, dice: 3, equip: [['slam', 2], ['harden', 1], ['venom', 1], ['smash', 1]], floor: 4, tier: 'elite' },
  { id: 'lich', name: 'Lich', icon: '🧟', hp: 105, dice: 4, equip: [['venom', 1], ['spark', 1], ['curse', 1], ['drain', 1], ['smash', 1]], floor: 4, tier: 'boss' },

  // Floor 5
  { id: 'demon', name: 'Demon', icon: '👿', hp: 52, dice: 3, equip: [['flame', 1], ['slam', 1], ['harden', 1]], floor: 5, tier: 'normal' },
  { id: 'mimic', name: 'Mimic', icon: '🧰', hp: 50, dice: 3, equip: [['bite', 2], ['claw', 1], ['drain', 1]], floor: 5, tier: 'normal' },
  { id: 'shade', name: 'Shade', icon: '👤', hp: 44, dice: 4, equip: [['spit', 1], ['curse', 0], ['claw', 1], ['spark', 0]], floor: 5, tier: 'normal' },
  { id: 'archdemon', name: 'Archdemon', icon: '🦹', hp: 90, dice: 4, equip: [['flame', 2], ['slam', 2], ['harden', 2], ['smash', 1]], floor: 5, tier: 'elite' },
  { id: 'dice-lord', name: 'The Dice Lord', icon: '🎰', hp: 150, dice: 5, equip: [['storm', 1], ['claw', 2], ['harden', 2], ['frost', 1], ['flame', 1]], floor: 5, tier: 'boss' },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(LIST.map((e) => [e.id, e]));

export const enemyPool = (floor: number, tier: Tier): EnemyDef[] => LIST.filter((e) => e.floor === floor && e.tier === tier);

export const FLOORS = 5;
