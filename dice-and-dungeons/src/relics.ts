export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  text: string;
}

const LIST: RelicDef[] = [
  { id: 'whetstone', name: 'Whetstone', icon: '🪨', text: 'Every hit deals 1 more damage.' },
  { id: 'iron-skin', name: 'Iron Skin', icon: '🦾', text: 'Start each fight with 6 shield.' },
  { id: 'lucky-charm', name: 'Lucky Charm', icon: '🍀', text: 'Rolled 1s become 2s.' },
  { id: 'combo-book', name: 'Combo Book', icon: '📕', text: 'Combo bonuses are doubled.' },
  { id: 'vampire-fang', name: 'Vampire Fang', icon: '🦇', text: 'Heal 2 when one hit deals 8 or more damage.' },
  { id: 'hourglass', name: 'Hourglass', icon: '⏳', text: 'Each die put into a Σ slot counts 1 more.' },
  { id: 'ember-ring', name: 'Ember Ring', icon: '💍', text: 'A 6 used on attack equipment also inflicts 1 burn.' },
  { id: 'coin-purse', name: 'Coin Purse', icon: '👛', text: 'Gain 50% more gold from fights.' },
  { id: 'medkit', name: 'Medkit', icon: '🩹', text: 'Heal 5 HP after each fight.' },
  { id: 'spare-die', name: 'Spare Die', icon: '🎲', text: 'Roll 1 extra die on the first turn of each fight.' },
  { id: 'oven-mitt', name: 'Oven Mitt', icon: '🧤', text: 'Burning dice cost 1 HP, not 2.' },
  { id: 'wool-cloak', name: 'Wool Cloak', icon: '🧣', text: 'Freeze changes at most 1 die.' },
  { id: 'rubber-boots', name: 'Rubber Boots', icon: '🥾', text: 'Shock hits at most 1 equipment.' },
  { id: 'backpack', name: 'Big Backpack', icon: '🎒', text: 'Carry 2 more equipment space.' },
  { id: 'loaded-die', name: 'Loaded Die', icon: '🎯', text: 'Once per turn, tap a die to add 1 to it.' },
];

export const RELICS: Record<string, RelicDef> = Object.fromEntries(LIST.map((r) => [r.id, r]));
export const RELIC_IDS = LIST.map((r) => r.id);
