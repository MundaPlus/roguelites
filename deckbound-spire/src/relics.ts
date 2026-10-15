import type { Combat } from './combat';
import type { RunState } from './run';
import type { CardDef } from './types';

export type RelicRarity = 'starter' | 'common' | 'uncommon' | 'rare' | 'boss';

export interface RelicInst {
  id: string;
  counter: number;
}

export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  rarity: RelicRarity;
  desc: string;
  /** Extra energy every turn. */
  energy?: number;
  /** Show the counter on the relic icon. */
  showCounter?: boolean;
  onPickup?(run: RunState): void;
  combatStart?(c: Combat, r: RelicInst): void;
  turnStart?(c: Combat, r: RelicInst): void;
  turnEnd?(c: Combat, r: RelicInst): void;
  beforeCard?(c: Combat, r: RelicInst, card: CardDef): void;
  afterCard?(c: Combat, r: RelicInst, card: CardDef): void;
  combatEnd?(c: Combat, r: RelicInst): void;
}

/** "Every 3rd card of a type this turn" relics share this counter logic. */
function everyThird(type: CardDef['type'], fn: (c: Combat) => void): Pick<RelicDef, 'turnStart' | 'afterCard' | 'showCounter'> {
  return {
    showCounter: true,
    turnStart: (_c, r) => (r.counter = 0),
    afterCard: (c, r, card) => {
      if (card.type !== type) return;
      r.counter++;
      if (r.counter % 3 === 0) fn(c);
    },
  };
}

const list: RelicDef[] = [
  { id: 'burningBlood', name: 'Burning Blood', icon: '🩸', rarity: 'starter', desc: 'At the end of combat, heal 6 HP.', combatEnd: (c) => c.heal(c.player, 6) },

  { id: 'anchor', name: 'Anchor', icon: '⚓', rarity: 'common', desc: 'Start each combat with 10 Block.', combatStart: (c) => c.gainBlock(c.player, 10, true) },
  { id: 'vajra', name: 'Vajra', icon: '🔱', rarity: 'common', desc: 'Start each combat with 1 Strength.', combatStart: (c) => c.applyStatus(c.player, 'strength', 1, c.player) },
  { id: 'marbles', name: 'Bag of Marbles', icon: '🔮', rarity: 'common', desc: 'At the start of each combat, apply 1 Vulnerable to ALL enemies.', combatStart: (c) => c.alive().forEach((e) => c.applyStatus(e, 'vulnerable', 1, c.player)) },
  { id: 'lantern', name: 'Lantern', icon: '🏮', rarity: 'common', desc: 'Gain 1 Energy on the first turn of each combat.', turnStart: (c) => c.turn === 1 && (c.energy += 1) },
  { id: 'bronzeScales', name: 'Bronze Scales', icon: '🐉', rarity: 'common', desc: 'Start each combat with 3 Thorns.', combatStart: (c) => c.applyStatus(c.player, 'thorns', 3, c.player) },
  { id: 'smoothStone', name: 'Smooth Stone', icon: '🪨', rarity: 'common', desc: 'Start each combat with 1 Dexterity.', combatStart: (c) => c.applyStatus(c.player, 'dexterity', 1, c.player) },
  { id: 'bloodVial', name: 'Blood Vial', icon: '🧃', rarity: 'common', desc: 'At the start of each combat, heal 2 HP.', combatStart: (c) => c.heal(c.player, 2) },
  {
    id: 'penNib', name: 'Pen Nib', icon: '🖋️', rarity: 'common', desc: 'Every 10th Attack you play deals double damage.', showCounter: true,
    beforeCard: (c, r, card) => {
      if (card.type !== 'attack') return;
      r.counter++;
      if (r.counter >= 10) {
        r.counter = 0;
        c.dmgMul = 2;
      }
    },
  },
  { id: 'orichalcum', name: 'Orichalcum', icon: '🟠', rarity: 'common', desc: 'If you end your turn without Block, gain 6 Block.', turnEnd: (c) => c.player.block === 0 && c.gainBlock(c.player, 6, true) },
  { id: 'bagOfPrep', name: 'Bag of Preparation', icon: '🎒', rarity: 'common', desc: 'Draw 2 extra cards on the first turn of each combat.', turnStart: (c) => c.turn === 1 && c.drawCards(2) },
  { id: 'strawberry', name: 'Strawberry', icon: '🍓', rarity: 'common', desc: 'On pickup, raise your Max HP by 7.', onPickup: (run) => ((run.maxHp += 7), (run.hp += 7)) },
  { id: 'sneckoSkull', name: 'Snecko Skull', icon: '🐍', rarity: 'common', desc: 'Whenever you apply Poison, apply 1 more.' },
  {
    id: 'happyFlower', name: 'Happy Flower', icon: '🌻', rarity: 'common', desc: 'Every 3 turns, gain 1 Energy.', showCounter: true,
    turnStart: (c, r) => {
      r.counter++;
      if (r.counter >= 3) {
        r.counter = 0;
        c.energy += 1;
      }
    },
  },

  { id: 'kunai', name: 'Kunai', icon: '🗡️', rarity: 'uncommon', desc: 'Every 3rd Attack you play in a turn gives 1 Dexterity.', ...everyThird('attack', (c) => c.applyStatus(c.player, 'dexterity', 1, c.player)) },
  { id: 'shuriken', name: 'Shuriken', icon: '⭐', rarity: 'uncommon', desc: 'Every 3rd Attack you play in a turn gives 1 Strength.', ...everyThird('attack', (c) => c.applyStatus(c.player, 'strength', 1, c.player)) },
  { id: 'fan', name: 'Ornamental Fan', icon: '🪭', rarity: 'uncommon', desc: 'Every 3rd Attack you play in a turn gives 4 Block.', ...everyThird('attack', (c) => c.gainBlock(c.player, 4, true)) },
  {
    id: 'letterOpener', name: 'Letter Opener', icon: '✉️', rarity: 'uncommon', desc: 'Every 3rd Skill you play in a turn deals 5 damage to ALL enemies.',
    ...everyThird('skill', (c) => c.alive().forEach((e) => c.damage(e, 5, null))),
  },
  { id: 'meat', name: 'Meat on the Bone', icon: '🍖', rarity: 'uncommon', desc: 'If your HP is at or below 50% at the end of combat, heal 12 HP.', combatEnd: (c) => c.player.hp <= c.player.maxHp / 2 && c.heal(c.player, 12) },

  { id: 'tungstenRod', name: 'Tungsten Rod', icon: '🔧', rarity: 'rare', desc: 'Whenever you would lose HP, lose 1 less.' },
  { id: 'birdUrn', name: 'Bird-Faced Urn', icon: '🏺', rarity: 'rare', desc: 'Whenever you play a Power, heal 2 HP.', afterCard: (c, _r, card) => card.type === 'power' && c.heal(c.player, 2) },
  { id: 'iceCream', name: 'Ice Cream', icon: '🍨', rarity: 'rare', desc: 'Unused Energy carries over to the next turn.' },
  { id: 'mango', name: 'Mango', icon: '🥭', rarity: 'rare', desc: 'On pickup, raise your Max HP by 14.', onPickup: (run) => ((run.maxHp += 14), (run.hp += 14)) },

  { id: 'emberCore', name: 'Ember Core', icon: '☀️', rarity: 'boss', energy: 1, desc: 'Gain 1 Energy every turn. You can no longer Rest at rest sites.' },
  {
    id: 'philosophersStone', name: "Philosopher's Stone", icon: '💠', rarity: 'boss', energy: 1, desc: 'Gain 1 Energy every turn. ALL enemies start with 1 Strength.',
    combatStart: (c) => c.alive().forEach((e) => c.applyStatus(e, 'strength', 1, e)),
  },
  { id: 'sozu', name: 'Sozu', icon: '🫙', rarity: 'boss', energy: 1, desc: 'Gain 1 Energy every turn. You can no longer obtain potions.' },
];

export const RELICS: Record<string, RelicDef> = Object.fromEntries(list.map((r) => [r.id, r]));
export const relicsOf = (rarity: RelicRarity): string[] => list.filter((r) => r.rarity === rarity).map((r) => r.id);
