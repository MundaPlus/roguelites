/** Item, bag and class data. Masks: '#' is a cell, '*' is a star cell, '.' is empty. */

export type Tag = 'weapon' | 'armor' | 'food' | 'gem' | 'magic' | 'potion' | 'trinket' | 'bag';
export type Cls = 'warrior' | 'herb' | 'mage';

/** What an item does when its cooldown fills. */
export interface Eff {
  dmg?: number;
  block?: number;
  heal?: number;
  poison?: number;
  stam?: number;
  stun?: number;
  crit?: number;
  pierce?: boolean;
}

/** Passive effects, active from the start of each fight. */
export interface Start {
  hp?: number;
  block?: number;
  regen?: number;
  thorns?: number;
  stam?: number;
  gold?: number;
  rage?: number;
}

/** A buff from a star or a bag. It only raises effects the item already has. */
export interface Buff {
  dmg?: number;
  block?: number;
  heal?: number;
  poison?: number;
  cd?: number;
  crit?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  rarity: 0 | 1 | 2 | 3;
  price: number;
  tags: Tag[];
  cls: Cls | null;
  mask: string[];
  cd?: number;
  cost?: number;
  eff?: Eff;
  uses?: number;
  lowHp?: Eff;
  start?: Start;
  star?: { tag: Tag | 'any'; buff: Buff };
  /** Bag: buff for the items that sit on its cells (filtered by tag). */
  inner?: { tag: Tag | 'any'; buff: Buff };
  /** Renown cost to unlock. */
  locked?: number;
  /** Not sold in the shop. */
  noShop?: boolean;
}

const STAR4 = ['.*.', '*#*', '.*.'];

const LIST: ItemDef[] = [
  // ---------- Bags ----------
  { id: 'oldpack', name: 'Old Pack', icon: '🎒', rarity: 0, price: 4, tags: ['bag'], cls: null, mask: ['###', '###', '###'], noShop: true },
  { id: 'pouch', name: 'Pouch', icon: '👝', rarity: 0, price: 3, tags: ['bag'], cls: null, mask: ['##', '##'] },
  { id: 'sash', name: 'Sash', icon: '🎽', rarity: 0, price: 3, tags: ['bag'], cls: null, mask: ['####'] },
  { id: 'saddle', name: 'Saddlebag', icon: '👜', rarity: 1, price: 5, tags: ['bag'], cls: null, mask: ['##.', '###'] },
  { id: 'satchel', name: 'Satchel', icon: '💼', rarity: 1, price: 6, tags: ['bag'], cls: null, mask: ['###', '###'] },
  { id: 'lunchbox', name: 'Lunch Box', icon: '🍱', rarity: 1, price: 5, tags: ['bag'], cls: null, mask: ['##', '##'], inner: { tag: 'food', buff: { cd: 25 } } },
  { id: 'toolbelt', name: 'Tool Belt', icon: '🧰', rarity: 1, price: 5, tags: ['bag'], cls: null, mask: ['###'], inner: { tag: 'weapon', buff: { dmg: 1 } } },
  { id: 'duffel', name: 'Duffel', icon: '🛄', rarity: 2, price: 9, tags: ['bag'], cls: null, mask: ['###', '###', '###'], locked: 5 },
  { id: 'herbbag', name: 'Herb Basket', icon: '🧺', rarity: 1, price: 5, tags: ['bag'], cls: 'herb', mask: ['##', '##'], inner: { tag: 'any', buff: { heal: 1, poison: 1 } } },
  { id: 'spellpouch', name: 'Spell Pouch', icon: '👛', rarity: 1, price: 5, tags: ['bag'], cls: 'mage', mask: ['##', '##'], inner: { tag: 'magic', buff: { dmg: 1 } } },
  { id: 'scabbard', name: 'Scabbard', icon: '🗃️', rarity: 1, price: 5, tags: ['bag'], cls: 'warrior', mask: ['#', '#', '#', '#'], inner: { tag: 'weapon', buff: { cd: 15 } } },

  // ---------- Neutral items ----------
  { id: 'sword', name: 'Wooden Sword', icon: '🗡️', rarity: 0, price: 3, tags: ['weapon'], cls: null, mask: ['#', '#'], cd: 1.6, cost: 1, eff: { dmg: 3 } },
  { id: 'dagger', name: 'Dagger', icon: '🔪', rarity: 0, price: 3, tags: ['weapon'], cls: null, mask: ['#'], cd: 1.1, cost: 0.6, eff: { dmg: 2, crit: 20 } },
  { id: 'club', name: 'Spiked Club', icon: '🏏', rarity: 0, price: 4, tags: ['weapon'], cls: null, mask: ['#', '#', '#'], cd: 2.2, cost: 1.5, eff: { dmg: 6 } },
  { id: 'shield', name: 'Wooden Shield', icon: '🛡️', rarity: 0, price: 4, tags: ['armor'], cls: null, mask: ['##', '##'], cd: 3.4, eff: { block: 5 } },
  { id: 'vest', name: 'Leather Vest', icon: '🦺', rarity: 0, price: 4, tags: ['armor'], cls: null, mask: ['##', '##'], start: { block: 12 } },
  { id: 'apple', name: 'Apple', icon: '🍎', rarity: 0, price: 2, tags: ['food'], cls: null, mask: ['#'], cd: 4, eff: { heal: 3 } },
  { id: 'banana', name: 'Banana', icon: '🍌', rarity: 0, price: 2, tags: ['food'], cls: null, mask: ['#'], cd: 3.5, eff: { stam: 2 } },
  { id: 'mushroom', name: 'Mushroom', icon: '🍄', rarity: 0, price: 2, tags: ['food'], cls: null, mask: ['#'], cd: 4, eff: { poison: 2 } },
  { id: 'whetstone', name: 'Whetstone', icon: '🪨', rarity: 0, price: 3, tags: ['trinket'], cls: null, mask: STAR4, star: { tag: 'weapon', buff: { dmg: 2 } } },
  { id: 'clover', name: 'Clover', icon: '🍀', rarity: 0, price: 3, tags: ['trinket'], cls: null, mask: STAR4, star: { tag: 'any', buff: { crit: 15 } } },
  { id: 'piggy', name: 'Piggy Bank', icon: '🐷', rarity: 0, price: 3, tags: ['trinket'], cls: null, mask: ['##'], start: { gold: 1 } },
  { id: 'bread', name: 'Baguette', icon: '🥖', rarity: 1, price: 4, tags: ['food'], cls: null, mask: ['##'], cd: 5, eff: { heal: 5, stam: 1 } },
  { id: 'cheese', name: 'Cheese', icon: '🧀', rarity: 1, price: 4, tags: ['food'], cls: null, mask: ['##'], cd: 5.5, eff: { heal: 4, block: 4 } },
  { id: 'ruby', name: 'Ruby', icon: '♦️', rarity: 1, price: 4, tags: ['gem'], cls: null, mask: STAR4, star: { tag: 'any', buff: { dmg: 2 } } },
  { id: 'sapphire', name: 'Sapphire', icon: '🔷', rarity: 1, price: 4, tags: ['gem'], cls: null, mask: STAR4, star: { tag: 'any', buff: { block: 3 } } },
  { id: 'emerald', name: 'Emerald', icon: '🟢', rarity: 1, price: 4, tags: ['gem'], cls: null, mask: STAR4, star: { tag: 'any', buff: { heal: 2, poison: 1 } } },
  { id: 'topaz', name: 'Topaz', icon: '🔶', rarity: 1, price: 5, tags: ['gem'], cls: null, mask: STAR4, star: { tag: 'any', buff: { cd: 15 } } },
  { id: 'potion', name: 'Health Potion', icon: '🧪', rarity: 1, price: 4, tags: ['potion'], cls: null, mask: ['#'], lowHp: { heal: 15 } },
  { id: 'bomb', name: 'Bomb', icon: '💣', rarity: 1, price: 4, tags: ['trinket'], cls: null, mask: ['#'], cd: 5, uses: 1, eff: { dmg: 16, pierce: true } },
  { id: 'gloves', name: 'Gloves', icon: '🧤', rarity: 1, price: 5, tags: ['trinket'], cls: null, mask: ['*#*'], star: { tag: 'weapon', buff: { cd: 20 } } },
  { id: 'spear', name: 'Spear', icon: '🔱', rarity: 1, price: 6, tags: ['weapon'], cls: null, mask: ['#', '#', '#'], cd: 1.8, cost: 1, eff: { dmg: 5, pierce: true } },
  { id: 'lantern', name: 'Lantern', icon: '🏮', rarity: 1, price: 4, tags: ['trinket'], cls: null, mask: STAR4, star: { tag: 'food', buff: { cd: 25, heal: 1 } } },
  { id: 'amethyst', name: 'Amethyst', icon: '🟣', rarity: 2, price: 6, tags: ['gem'], cls: null, mask: STAR4, star: { tag: 'any', buff: { crit: 25, dmg: 1 } } },
  { id: 'hourglass', name: 'Hourglass', icon: '⌛', rarity: 2, price: 7, tags: ['trinket'], cls: null, mask: ['.*.', '*#*', '*#*', '.*.'], star: { tag: 'any', buff: { cd: 12 } } },
  { id: 'thornmail', name: 'Thorn Mail', icon: '🌵', rarity: 2, price: 7, tags: ['armor'], cls: null, mask: ['##', '##', '##'], start: { block: 10, thorns: 2 } },
  { id: 'hammer', name: 'Hammer', icon: '🔨', rarity: 2, price: 7, tags: ['weapon'], cls: null, mask: ['##', '#.'], cd: 2.6, cost: 2, eff: { dmg: 8, stun: 0.5 } },
  { id: 'amulet', name: 'Amulet', icon: '📿', rarity: 3, price: 10, tags: ['trinket'], cls: null, mask: ['#'], start: { hp: 20, regen: 1 }, locked: 6 },
  { id: 'crown', name: 'Crown', icon: '👑', rarity: 3, price: 12, tags: ['trinket'], cls: null, mask: ['.*.', '*#*', '*#*', '.*.'], star: { tag: 'any', buff: { dmg: 2, block: 2, heal: 2, poison: 1 } }, locked: 10 },

  // ---------- Warrior ----------
  { id: 'axe', name: 'Axe', icon: '🪓', rarity: 1, price: 6, tags: ['weapon'], cls: 'warrior', mask: ['##', '#.'], cd: 1.9, cost: 1.5, eff: { dmg: 7, crit: 10 } },
  { id: 'greatsword', name: 'Greatsword', icon: '⚔️', rarity: 2, price: 9, tags: ['weapon'], cls: 'warrior', mask: ['#', '#', '#'], cd: 2.4, cost: 2, eff: { dmg: 12 } },
  { id: 'towershield', name: 'Tower Shield', icon: '🧱', rarity: 1, price: 6, tags: ['armor'], cls: 'warrior', mask: ['##', '##', '##'], cd: 4, eff: { block: 12 } },
  { id: 'chainmail', name: 'Chain Mail', icon: '⛓️', rarity: 2, price: 8, tags: ['armor'], cls: 'warrior', mask: ['##', '##'], start: { block: 25 } },
  { id: 'warhorn', name: 'War Horn', icon: '📯', rarity: 2, price: 6, tags: ['trinket'], cls: 'warrior', mask: STAR4, star: { tag: 'weapon', buff: { dmg: 2, cd: 10 } } },
  { id: 'meat', name: 'Roast Meat', icon: '🍖', rarity: 1, price: 4, tags: ['food'], cls: 'warrior', mask: ['##'], cd: 5, eff: { heal: 4, stam: 3 } },
  { id: 'totem', name: 'Rage Totem', icon: '🗿', rarity: 3, price: 10, tags: ['trinket'], cls: 'warrior', mask: ['#', '#'], start: { rage: 4, hp: 10 }, locked: 8 },

  // ---------- Herbalist ----------
  { id: 'dart', name: 'Poison Dart', icon: '🎯', rarity: 0, price: 3, tags: ['weapon'], cls: 'herb', mask: ['#'], cd: 1.4, cost: 0.5, eff: { dmg: 1, poison: 1 } },
  { id: 'herbs', name: 'Healing Herbs', icon: '🌱', rarity: 0, price: 3, tags: ['food'], cls: 'herb', mask: ['#', '#'], cd: 3, eff: { heal: 3 } },
  { id: 'nettle', name: 'Nettle', icon: '🌿', rarity: 1, price: 4, tags: ['trinket'], cls: 'herb', mask: STAR4, star: { tag: 'any', buff: { poison: 1 } } },
  { id: 'flask', name: 'Venom Flask', icon: '⚗️', rarity: 1, price: 5, tags: ['potion'], cls: 'herb', mask: ['#'], cd: 4, eff: { poison: 3 } },
  { id: 'mandrake', name: 'Mandrake', icon: '🥕', rarity: 2, price: 8, tags: ['food'], cls: 'herb', mask: ['#', '#'], cd: 5, eff: { heal: 6, poison: 3 } },
  { id: 'thistle', name: 'Thistle Whip', icon: '🥀', rarity: 1, price: 6, tags: ['weapon'], cls: 'herb', mask: ['#', '#', '#'], cd: 1.8, cost: 1, eff: { dmg: 3, poison: 2 } },
  { id: 'spores', name: 'Spore Sack', icon: '🦠', rarity: 3, price: 11, tags: ['trinket'], cls: 'herb', mask: ['.**.', '*##*', '*##*', '.**.'], cd: 3, eff: { poison: 3 }, star: { tag: 'any', buff: { poison: 1 } }, locked: 8 },

  // ---------- Mage ----------
  { id: 'wand', name: 'Wand', icon: '🪄', rarity: 0, price: 4, tags: ['weapon', 'magic'], cls: 'mage', mask: ['#', '#'], cd: 2.2, eff: { dmg: 3 } },
  { id: 'fireorb', name: 'Fire Orb', icon: '🔥', rarity: 1, price: 5, tags: ['magic'], cls: 'mage', mask: ['#'], cd: 3.2, eff: { dmg: 4 } },
  { id: 'frostorb', name: 'Frost Orb', icon: '❄️', rarity: 1, price: 5, tags: ['magic'], cls: 'mage', mask: ['#'], cd: 3, eff: { dmg: 2, stun: 0.7 } },
  { id: 'spellbook', name: 'Spellbook', icon: '📕', rarity: 1, price: 6, tags: ['magic'], cls: 'mage', mask: ['##', '##'], cd: 3.6, eff: { dmg: 3, block: 4 } },
  { id: 'crystal', name: 'Mana Crystal', icon: '🔮', rarity: 1, price: 4, tags: ['gem'], cls: 'mage', mask: STAR4, star: { tag: 'magic', buff: { cd: 12 } } },
  { id: 'robe', name: 'Mage Robe', icon: '🥋', rarity: 1, price: 5, tags: ['armor', 'magic'], cls: 'mage', mask: ['##', '##'], cd: 3.5, eff: { block: 4, heal: 2 } },
  { id: 'staff', name: 'Star Staff', icon: '🦯', rarity: 2, price: 9, tags: ['weapon', 'magic'], cls: 'mage', mask: ['#', '#', '#'], cd: 2.6, eff: { dmg: 9 }, locked: 8 },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(LIST.map((d) => [d.id, d]));
export const ITEM_IDS = LIST.map((d) => d.id);

export interface ClassDef {
  id: Cls;
  name: string;
  icon: string;
  text: string;
  start: string[];
  locked?: number;
}

export const CLASSES: Record<Cls, ClassDef> = {
  warrior: { id: 'warrior', name: 'Knight', icon: '⚔️', text: 'Big weapons, armor and rage. Weapons cost stamina.', start: ['sword', 'shield', 'apple', 'whetstone'] },
  herb: { id: 'herb', name: 'Herbalist', icon: '🌿', text: 'Poison that ignores block, and steady healing.', start: ['dart', 'herbs', 'apple'], locked: 5 },
  mage: { id: 'mage', name: 'Mage', icon: '✨', text: 'Magic items need no stamina. Crystals speed them up.', start: ['wand', 'crystal', 'apple'], locked: 12 },
};
export const CLASS_IDS: Cls[] = ['warrior', 'herb', 'mage'];

export const RARITY = ['Common', 'Rare', 'Epic', 'Legendary'];
export const RARITY_COLOR = ['#8d99ae', '#4ea8de', '#b5179e', '#f8961e'];

export const sellPrice = (d: ItemDef): number => Math.max(1, Math.floor(d.price / 2));

const EFF_TEXT: [keyof Eff, string][] = [
  ['dmg', '⚔️ deal {} damage'],
  ['block', '🛡️ gain {} block'],
  ['heal', '💚 heal {}'],
  ['poison', '☠️ apply {} poison'],
  ['stam', '⚡ gain {} stamina'],
  ['stun', '💫 stun {}s'],
];

export function effText(e: Eff): string {
  const parts = EFF_TEXT.filter(([k]) => e[k]).map(([k, t]) => t.replace('{}', String(e[k])));
  if (e.crit) parts.push(`${e.crit}% crit`);
  if (e.pierce) parts.push('ignores block');
  return parts.join(', ');
}

export function buffText(b: Buff): string {
  const p: string[] = [];
  if (b.dmg) p.push(`+${b.dmg} damage`);
  if (b.block) p.push(`+${b.block} block`);
  if (b.heal) p.push(`+${b.heal} heal`);
  if (b.poison) p.push(`+${b.poison} poison`);
  if (b.cd) p.push(`${b.cd}% faster`);
  if (b.crit) p.push(`+${b.crit}% crit`);
  return p.join(', ');
}

const tagName = (t: Tag | 'any'): string => (t === 'any' ? 'items' : `${t} items`);

/** Plain text lines that describe an item. */
export function describe(d: ItemDef): string[] {
  const out: string[] = [];
  if (d.tags.includes('bag')) out.push(`Bag: adds ${d.mask.join('').split('#').length - 1} cells to the backpack.`);
  if (d.inner) out.push(`${tagName(d.inner.tag)} in this bag: ${buffText(d.inner.buff)}.`);
  if (d.cd && d.eff) out.push(`Every ${d.cd}s${d.cost ? ` (⚡${d.cost})` : ''}: ${effText(d.eff)}.${d.uses ? ' Once per fight.' : ''}`);
  if (d.lowHp) out.push(`Below 50% HP, once: ${effText(d.lowHp)}.`);
  const s = d.start;
  if (s) {
    if (s.hp) out.push(`+${s.hp} max HP.`);
    if (s.block) out.push(`Start each fight with ${s.block} block.`);
    if (s.regen) out.push(`Regenerate ${s.regen} HP per second.`);
    if (s.thorns) out.push(`Thorns ${s.thorns}: weapons that hit you take ${s.thorns} damage.`);
    if (s.rage) out.push(`Below 50% HP your weapons deal +${s.rage} damage.`);
    if (s.gold) out.push(`+${s.gold} gold at the start of each round.`);
  }
  if (d.star) out.push(`★ ${tagName(d.star.tag)} on its stars: ${buffText(d.star.buff)}.`);
  return out;
}
