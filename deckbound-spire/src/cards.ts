import type { CardDef, CardInst, Rarity } from './types';

const list: CardDef[] = [
  // ------------------------------------------------------------------ starter
  { id: 'strike', name: 'Strike', type: 'attack', rarity: 'starter', cost: 1, target: 'enemy', icon: '⚔️', desc: 'Deal {D} damage.', ops: [{ op: 'dmg', n: 6 }], up: { ops: [{ op: 'dmg', n: 9 }] } },
  { id: 'defend', name: 'Defend', type: 'skill', rarity: 'starter', cost: 1, target: 'self', icon: '🛡️', desc: 'Gain {B} Block.', ops: [{ op: 'block', n: 5 }], up: { ops: [{ op: 'block', n: 8 }] } },
  {
    id: 'bash', name: 'Bash', type: 'attack', rarity: 'starter', cost: 2, target: 'enemy', icon: '🔨',
    desc: 'Deal {D} damage. Apply 2 Vulnerable.',
    ops: [{ op: 'dmg', n: 8 }, { op: 'status', s: 'vulnerable', n: 2, to: 'target' }],
    up: { desc: 'Deal {D} damage. Apply 3 Vulnerable.', ops: [{ op: 'dmg', n: 10 }, { op: 'status', s: 'vulnerable', n: 3, to: 'target' }] },
  },

  // ------------------------------------------------------------------ common
  { id: 'cleave', name: 'Cleave', type: 'attack', rarity: 'common', cost: 1, target: 'all', icon: '🪓', desc: 'Deal {D} damage to ALL enemies.', ops: [{ op: 'dmg', n: 8, all: true }], up: { ops: [{ op: 'dmg', n: 11, all: true }] } },
  { id: 'twinStrike', name: 'Twin Strike', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', icon: '🗡️', desc: 'Deal {D} damage twice.', ops: [{ op: 'dmg', n: 5, times: 2 }], up: { ops: [{ op: 'dmg', n: 7, times: 2 }] } },
  {
    id: 'ironWave', name: 'Iron Wave', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', icon: '🌊',
    desc: 'Gain {B} Block. Deal {D} damage.',
    ops: [{ op: 'block', n: 5 }, { op: 'dmg', n: 5 }],
    up: { ops: [{ op: 'block', n: 7 }, { op: 'dmg', n: 7 }] },
  },
  {
    id: 'pommel', name: 'Pommel Strike', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', icon: '🥊',
    desc: 'Deal {D} damage. Draw 1 card.',
    ops: [{ op: 'dmg', n: 9 }, { op: 'draw', n: 1 }],
    up: { desc: 'Deal {D} damage. Draw 2 cards.', ops: [{ op: 'dmg', n: 10 }, { op: 'draw', n: 2 }] },
  },
  {
    id: 'clothesline', name: 'Clothesline', type: 'attack', rarity: 'common', cost: 2, target: 'enemy', icon: '🦾',
    desc: 'Deal {D} damage. Apply 2 Weak.',
    ops: [{ op: 'dmg', n: 12 }, { op: 'status', s: 'weak', n: 2, to: 'target' }],
    up: { desc: 'Deal {D} damage. Apply 3 Weak.', ops: [{ op: 'dmg', n: 14 }, { op: 'status', s: 'weak', n: 3, to: 'target' }] },
  },
  {
    id: 'heavyBlade', name: 'Heavy Blade', type: 'attack', rarity: 'common', cost: 2, target: 'enemy', icon: '🗡️',
    desc: 'Deal {D} damage. Strength counts 3 times.',
    ops: [{ op: 'dmg', n: 14, strMul: 3 }],
    up: { desc: 'Deal {D} damage. Strength counts 5 times.', ops: [{ op: 'dmg', n: 14, strMul: 5 }] },
  },
  { id: 'bodySlam', name: 'Body Slam', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', icon: '🐘', desc: 'Deal damage equal to your Block ({D}).', ops: [{ op: 'dmgBlock' }], up: { cost: 0 } },
  {
    id: 'wildStrike', name: 'Wild Strike', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', icon: '🐗',
    desc: 'Deal {D} damage. Shuffle a Wound into your draw pile.',
    ops: [{ op: 'dmg', n: 12 }, { op: 'addCard', id: 'wound', n: 1, to: 'draw' }],
    up: { ops: [{ op: 'dmg', n: 17 }, { op: 'addCard', id: 'wound', n: 1, to: 'draw' }] },
  },
  {
    id: 'poisonStab', name: 'Poison Stab', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', icon: '🦂',
    desc: 'Deal {D} damage. Apply 3 Poison.',
    ops: [{ op: 'dmg', n: 6 }, { op: 'status', s: 'poison', n: 3, to: 'target' }],
    up: { desc: 'Deal {D} damage. Apply 4 Poison.', ops: [{ op: 'dmg', n: 8 }, { op: 'status', s: 'poison', n: 4, to: 'target' }] },
  },
  {
    id: 'boomerang', name: 'Sword Boomerang', type: 'attack', rarity: 'common', cost: 1, target: 'none', icon: '🪃',
    desc: 'Deal {D} damage to a random enemy 3 times.',
    ops: [{ op: 'dmg', n: 3, times: 3, random: true }],
    up: { desc: 'Deal {D} damage to a random enemy 4 times.', ops: [{ op: 'dmg', n: 3, times: 4, random: true }] },
  },
  {
    id: 'thunderclap', name: 'Thunderclap', type: 'attack', rarity: 'common', cost: 1, target: 'all', icon: '⚡',
    desc: 'Deal {D} damage and apply 1 Vulnerable to ALL enemies.',
    ops: [{ op: 'dmg', n: 4, all: true }, { op: 'status', s: 'vulnerable', n: 1, to: 'all' }],
    up: { ops: [{ op: 'dmg', n: 7, all: true }, { op: 'status', s: 'vulnerable', n: 1, to: 'all' }] },
  },
  {
    id: 'shrugItOff', name: 'Shrug It Off', type: 'skill', rarity: 'common', cost: 1, target: 'self', icon: '🤷',
    desc: 'Gain {B} Block. Draw 1 card.',
    ops: [{ op: 'block', n: 8 }, { op: 'draw', n: 1 }],
    up: { ops: [{ op: 'block', n: 11 }, { op: 'draw', n: 1 }] },
  },
  { id: 'deflect', name: 'Deflect', type: 'skill', rarity: 'common', cost: 0, target: 'self', icon: '🪞', desc: 'Gain {B} Block.', ops: [{ op: 'block', n: 4 }], up: { ops: [{ op: 'block', n: 7 }] } },
  {
    id: 'deadlyPoison', name: 'Deadly Poison', type: 'skill', rarity: 'common', cost: 1, target: 'enemy', icon: '🧪',
    desc: 'Apply 5 Poison.',
    ops: [{ op: 'status', s: 'poison', n: 5, to: 'target' }],
    up: { desc: 'Apply 7 Poison.', ops: [{ op: 'status', s: 'poison', n: 7, to: 'target' }] },
  },
  {
    id: 'flex', name: 'Flex', type: 'skill', rarity: 'common', cost: 0, target: 'self', icon: '💪',
    desc: 'Gain 2 Strength. At the end of this turn, lose 2 Strength.',
    ops: [{ op: 'status', s: 'strength', n: 2, to: 'self' }, { op: 'status', s: 'flex', n: 2, to: 'self' }],
    up: { desc: 'Gain 4 Strength. At the end of this turn, lose 4 Strength.', ops: [{ op: 'status', s: 'strength', n: 4, to: 'self' }, { op: 'status', s: 'flex', n: 4, to: 'self' }] },
  },
  {
    id: 'warcry', name: 'Warcry', type: 'skill', rarity: 'common', cost: 0, target: 'self', icon: '📯',
    desc: 'Draw 2 cards. Exhaust.', ops: [{ op: 'draw', n: 2 }], exhaust: true,
    up: { desc: 'Draw 3 cards. Exhaust.', ops: [{ op: 'draw', n: 3 }] },
  },

  // ------------------------------------------------------------------ uncommon
  {
    id: 'uppercut', name: 'Uppercut', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy', icon: '🤜',
    desc: 'Deal {D} damage. Apply 1 Weak and 1 Vulnerable.',
    ops: [{ op: 'dmg', n: 13 }, { op: 'status', s: 'weak', n: 1, to: 'target' }, { op: 'status', s: 'vulnerable', n: 1, to: 'target' }],
    up: { desc: 'Deal {D} damage. Apply 2 Weak and 2 Vulnerable.', ops: [{ op: 'dmg', n: 13 }, { op: 'status', s: 'weak', n: 2, to: 'target' }, { op: 'status', s: 'vulnerable', n: 2, to: 'target' }] },
  },
  { id: 'carnage', name: 'Carnage', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy', icon: '🩸', desc: 'Ethereal. Deal {D} damage.', ops: [{ op: 'dmg', n: 20 }], ethereal: true, up: { ops: [{ op: 'dmg', n: 28 }] } },
  { id: 'whirlwind', name: 'Whirlwind', type: 'attack', rarity: 'uncommon', cost: -1, target: 'all', icon: '🌀', desc: 'Deal {D} damage to ALL enemies X times.', ops: [{ op: 'dmg', n: 5, all: true, x: true }], up: { ops: [{ op: 'dmg', n: 8, all: true, x: true }] } },
  { id: 'hemokinesis', name: 'Hemokinesis', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy', icon: '🫀', desc: 'Lose 2 HP. Deal {D} damage.', ops: [{ op: 'loseHp', n: 2 }, { op: 'dmg', n: 15 }], up: { ops: [{ op: 'loseHp', n: 2 }, { op: 'dmg', n: 20 }] } },
  {
    id: 'bouncingFlask', name: 'Bouncing Flask', type: 'skill', rarity: 'uncommon', cost: 2, target: 'none', icon: '⚗️',
    desc: 'Apply 3 Poison to a random enemy 3 times.',
    ops: [1, 2, 3].map(() => ({ op: 'status' as const, s: 'poison' as const, n: 3, to: 'random' as const })),
    up: { desc: 'Apply 3 Poison to a random enemy 4 times.', ops: [1, 2, 3, 4].map(() => ({ op: 'status' as const, s: 'poison' as const, n: 3, to: 'random' as const })) },
  },
  {
    id: 'catalyst', name: 'Catalyst', type: 'skill', rarity: 'uncommon', cost: 1, target: 'enemy', icon: '🧫',
    desc: "Double the enemy's Poison. Exhaust.", ops: [{ op: 'mulStatus', s: 'poison', mul: 2, to: 'target' }], exhaust: true,
    up: { desc: "Triple the enemy's Poison. Exhaust.", ops: [{ op: 'mulStatus', s: 'poison', mul: 3, to: 'target' }] },
  },
  { id: 'entrench', name: 'Entrench', type: 'skill', rarity: 'uncommon', cost: 2, target: 'self', icon: '🏰', desc: 'Double your Block.', ops: [{ op: 'doubleBlock' }], up: { cost: 1 } },
  { id: 'seeingRed', name: 'Seeing Red', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self', icon: '👁️', desc: 'Gain 2 Energy. Exhaust.', ops: [{ op: 'energy', n: 2 }], exhaust: true, up: { cost: 0 } },
  {
    id: 'disarm', name: 'Disarm', type: 'skill', rarity: 'uncommon', cost: 1, target: 'enemy', icon: '🫳',
    desc: 'Enemy loses 2 Strength. Exhaust.', ops: [{ op: 'status', s: 'strength', n: -2, to: 'target' }], exhaust: true,
    up: { desc: 'Enemy loses 3 Strength. Exhaust.', ops: [{ op: 'status', s: 'strength', n: -3, to: 'target' }] },
  },
  {
    id: 'shockwave', name: 'Shockwave', type: 'skill', rarity: 'uncommon', cost: 2, target: 'all', icon: '💥',
    desc: 'Apply 3 Weak and 3 Vulnerable to ALL enemies. Exhaust.',
    ops: [{ op: 'status', s: 'weak', n: 3, to: 'all' }, { op: 'status', s: 'vulnerable', n: 3, to: 'all' }], exhaust: true,
    up: { desc: 'Apply 5 Weak and 5 Vulnerable to ALL enemies. Exhaust.', ops: [{ op: 'status', s: 'weak', n: 5, to: 'all' }, { op: 'status', s: 'vulnerable', n: 5, to: 'all' }] },
  },
  {
    id: 'powerThrough', name: 'Power Through', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self', icon: '🏋️',
    desc: 'Add 2 Wounds to your hand. Gain {B} Block.',
    ops: [{ op: 'addCard', id: 'wound', n: 2, to: 'hand' }, { op: 'block', n: 15 }],
    up: { ops: [{ op: 'addCard', id: 'wound', n: 2, to: 'hand' }, { op: 'block', n: 20 }] },
  },
  { id: 'battleTrance', name: 'Battle Trance', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self', icon: '🧘', desc: 'Draw 3 cards.', ops: [{ op: 'draw', n: 3 }], up: { desc: 'Draw 4 cards.', ops: [{ op: 'draw', n: 4 }] } },
  {
    id: 'bloodletting', name: 'Bloodletting', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self', icon: '💉',
    desc: 'Lose 3 HP. Gain 2 Energy.', ops: [{ op: 'loseHp', n: 3 }, { op: 'energy', n: 2 }],
    up: { desc: 'Lose 3 HP. Gain 3 Energy.', ops: [{ op: 'loseHp', n: 3 }, { op: 'energy', n: 3 }] },
  },
  { id: 'inflame', name: 'Inflame', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', icon: '🔥', desc: 'Gain 2 Strength.', ops: [{ op: 'status', s: 'strength', n: 2, to: 'self' }], up: { desc: 'Gain 3 Strength.', ops: [{ op: 'status', s: 'strength', n: 3, to: 'self' }] } },
  {
    id: 'metallicize', name: 'Metallicize', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', icon: '🔩',
    desc: 'At the end of your turn, gain 3 Block.', ops: [{ op: 'status', s: 'metallicize', n: 3, to: 'self' }],
    up: { desc: 'At the end of your turn, gain 4 Block.', ops: [{ op: 'status', s: 'metallicize', n: 4, to: 'self' }] },
  },
  {
    id: 'noxiousFumes', name: 'Noxious Fumes', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', icon: '☁️',
    desc: 'At the start of your turn, apply 2 Poison to ALL enemies.', ops: [{ op: 'status', s: 'fumes', n: 2, to: 'self' }],
    up: { desc: 'At the start of your turn, apply 3 Poison to ALL enemies.', ops: [{ op: 'status', s: 'fumes', n: 3, to: 'self' }] },
  },
  { id: 'footwork', name: 'Footwork', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', icon: '👟', desc: 'Gain 2 Dexterity.', ops: [{ op: 'status', s: 'dexterity', n: 2, to: 'self' }], up: { desc: 'Gain 3 Dexterity.', ops: [{ op: 'status', s: 'dexterity', n: 3, to: 'self' }] } },
  { id: 'spikedArmor', name: 'Spiked Armor', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', icon: '🌵', desc: 'Gain 3 Thorns.', ops: [{ op: 'status', s: 'thorns', n: 3, to: 'self' }], up: { desc: 'Gain 5 Thorns.', ops: [{ op: 'status', s: 'thorns', n: 5, to: 'self' }] } },

  // ------------------------------------------------------------------ rare
  {
    id: 'demonForm', name: 'Demon Form', type: 'power', rarity: 'rare', cost: 3, target: 'self', icon: '😈',
    desc: 'At the start of your turn, gain 2 Strength.', ops: [{ op: 'status', s: 'demonForm', n: 2, to: 'self' }],
    up: { desc: 'At the start of your turn, gain 3 Strength.', ops: [{ op: 'status', s: 'demonForm', n: 3, to: 'self' }] },
  },
  { id: 'barricade', name: 'Barricade', type: 'power', rarity: 'rare', cost: 3, target: 'self', icon: '🧱', desc: 'Block is no longer removed at the start of your turn.', ops: [{ op: 'status', s: 'barricade', n: 1, to: 'self' }], up: { cost: 2 } },
  { id: 'limitBreak', name: 'Limit Break', type: 'skill', rarity: 'rare', cost: 1, target: 'self', icon: '⛓️', desc: 'Double your Strength. Exhaust.', ops: [{ op: 'mulStatus', s: 'strength', mul: 2, to: 'self' }], exhaust: true, up: { desc: 'Double your Strength.', exhaust: false } },
  { id: 'impervious', name: 'Impervious', type: 'skill', rarity: 'rare', cost: 2, target: 'self', icon: '🗿', desc: 'Gain {B} Block. Exhaust.', ops: [{ op: 'block', n: 30 }], exhaust: true, up: { ops: [{ op: 'block', n: 40 }] } },
  {
    id: 'offering', name: 'Offering', type: 'skill', rarity: 'rare', cost: 0, target: 'self', icon: '🕯️',
    desc: 'Lose 6 HP. Gain 2 Energy. Draw 3 cards. Exhaust.', ops: [{ op: 'loseHp', n: 6 }, { op: 'energy', n: 2 }, { op: 'draw', n: 3 }], exhaust: true,
    up: { desc: 'Lose 6 HP. Gain 2 Energy. Draw 5 cards. Exhaust.', ops: [{ op: 'loseHp', n: 6 }, { op: 'energy', n: 2 }, { op: 'draw', n: 5 }] },
  },
  { id: 'bludgeon', name: 'Bludgeon', type: 'attack', rarity: 'rare', cost: 3, target: 'enemy', icon: '🪨', desc: 'Deal {D} damage.', ops: [{ op: 'dmg', n: 32 }], up: { ops: [{ op: 'dmg', n: 42 }] } },
  {
    id: 'reaper', name: 'Reaper', type: 'attack', rarity: 'rare', cost: 2, target: 'all', icon: '💀',
    desc: 'Deal {D} damage to ALL enemies. Heal HP equal to unblocked damage. Exhaust.',
    ops: [{ op: 'dmg', n: 4, all: true, lifesteal: true }], exhaust: true,
    up: { ops: [{ op: 'dmg', n: 5, all: true, lifesteal: true }] },
  },

  // ------------------------------------------------------------------ special (events)
  { id: 'bite', name: 'Bite', type: 'attack', rarity: 'special', cost: 1, target: 'enemy', icon: '🧛', desc: 'Deal {D} damage. Heal 2 HP.', ops: [{ op: 'dmg', n: 7 }, { op: 'heal', n: 2 }], up: { desc: 'Deal {D} damage. Heal 3 HP.', ops: [{ op: 'dmg', n: 8 }, { op: 'heal', n: 3 }] } },

  // ------------------------------------------------------------------ status and curse
  { id: 'wound', name: 'Wound', type: 'status', rarity: 'special', cost: -2, target: 'none', icon: '🩹', desc: 'Unplayable.', ops: [] },
  { id: 'dazed', name: 'Dazed', type: 'status', rarity: 'special', cost: -2, target: 'none', icon: '💫', desc: 'Unplayable. Ethereal.', ops: [], ethereal: true },
  { id: 'burn', name: 'Burn', type: 'status', rarity: 'special', cost: -2, target: 'none', icon: '🔥', desc: 'Unplayable. At the end of your turn, take 2 damage.', ops: [], endTurn: [{ op: 'hurtSelf', n: 2 }] },
  { id: 'slimed', name: 'Slimed', type: 'status', rarity: 'special', cost: 1, target: 'self', icon: '🟢', desc: 'Exhaust.', ops: [], exhaust: true },
  { id: 'regret', name: 'Regret', type: 'curse', rarity: 'special', cost: -2, target: 'none', icon: '😔', desc: 'Unplayable. At the end of your turn, lose 1 HP.', ops: [], endTurn: [{ op: 'loseHp', n: 1 }] },
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(list.map((c) => [c.id, c]));

const upCache = new Map<string, CardDef>();

/** The card definition with the upgrade applied. */
export function getCard(inst: Pick<CardInst, 'id' | 'up'>): CardDef {
  const base = CARDS[inst.id];
  if (!inst.up || !base.up) return base;
  let def = upCache.get(base.id);
  if (!def) {
    def = { ...base, ...base.up, name: base.name + '+' };
    upCache.set(base.id, def);
  }
  return def;
}

export function canUpgrade(inst: CardInst): boolean {
  return !inst.up && !!CARDS[inst.id].up;
}

/** Cards that can appear as rewards and in shops. */
export function cardPool(rarity: Rarity): string[] {
  return list.filter((c) => c.rarity === rarity && (c.type === 'attack' || c.type === 'skill' || c.type === 'power')).map((c) => c.id);
}
