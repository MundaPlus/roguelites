import type { Rng } from './rng';

/** One critter on a team, in the shop or in a battle. */
export interface Unit {
  uid: number;
  id: string;
  atk: number;
  hp: number;
  /** Copies merged into this one. 0–1 = level 1, 2–4 = level 2, 5 = level 3. */
  xp: number;
  perk: PerkId | null;
}

export type Trigger = 'buy' | 'sell' | 'faint' | 'start' | 'hurt' | 'endturn' | 'summon';
export type PackId = 'meadow' | 'tide' | 'jungle';
export type PerkId = 'honey' | 'bone' | 'shell' | 'chili' | 'melon' | 'mush';

export const MAX_STAT = 50;
export const TEAM_SIZE = 5;

export const TRIGGERS: Record<Trigger, { icon: string; label: string }> = {
  buy: { icon: '🛒', label: 'Buy' },
  sell: { icon: '💰', label: 'Sell' },
  faint: { icon: '💀', label: 'Faint' },
  start: { icon: '⚔️', label: 'Start of battle' },
  hurt: { icon: '💢', label: 'Hurt' },
  endturn: { icon: '🌙', label: 'End of turn' },
  summon: { icon: '✨', label: 'Friend summoned' },
};

/**
 * The effect context. The shop and the battle sim both implement it,
 * so one ability function works in both places.
 */
export interface Ctx {
  mode: 'shop' | 'battle';
  rng: Rng;
  /** The summoned friend, for 'summon' triggers. */
  arg: Unit | null;
  /** Living friends in line order (front first), without `me`. */
  friends(me: Unit): Unit[];
  /** Living enemies in line order (front first). Empty in the shop. */
  foes(me: Unit): Unit[];
  /** Friends in front of `me`, nearest first. */
  ahead(me: Unit): Unit[];
  /** Friends behind `me`, nearest first. */
  behind(me: Unit): Unit[];
  /** Change stats. The result is at least 1 and at most MAX_STAT. */
  buff(t: Unit, atk: number, hp: number): void;
  /** Deal damage (battle only). */
  hit(t: Unit, dmg: number): void;
  /** Summon a new critter where `me` stands or stood (battle only). */
  summon(me: Unit, id: string, atk: number, hp: number): void;
  givePerk(t: Unit, perk: PerkId): void;
  gold(n: number): void;
  goldLeft(): number;
  /** Buff every critter in the shop (shop only). */
  shopBuff(atk: number, hp: number): void;
  /** True the first time it is called for `me` in this battle. */
  once(me: Unit): boolean;
}

export interface CritterDef {
  id: string;
  name: string;
  icon: string;
  tier: number;
  atk: number;
  hp: number;
  pack: PackId;
  trigger: Trigger | null;
  text: (L: number) => string;
  fx: (c: Ctx, me: Unit, L: number) => void;
}

export interface FoodDef {
  id: string;
  name: string;
  icon: string;
  tier: number;
  /** True when the player must pick a critter to feed. */
  target: boolean;
  text: string;
  perk?: PerkId;
}

export interface PackDef {
  id: PackId;
  name: string;
  icon: string;
  cost: number;
  text: string;
}

export const PACKS: PackDef[] = [
  { id: 'meadow', name: 'Meadow Pack', icon: '🌼', cost: 0, text: 'The starting critters.' },
  { id: 'tide', name: 'Tide Pack', icon: '🌊', cost: 8, text: '6 sea critters. Many react when they get hurt.' },
  { id: 'jungle', name: 'Jungle Pack', icon: '🌴', cost: 14, text: '6 jungle critters. Many strike at the start of battle.' },
];

export const PERKS: Record<PerkId, { icon: string; text: string }> = {
  honey: { icon: '🍯', text: 'Faint: summon a 1/1 Bumble.' },
  bone: { icon: '🦴', text: 'Attacks deal +3 damage.' },
  shell: { icon: '🥜', text: 'Takes 2 less damage per hit (at least 1).' },
  chili: { icon: '🌶️', text: 'Attacks also deal 4 damage to the enemy behind.' },
  melon: { icon: '🍉', text: 'Blocks 20 damage once.' },
  mush: { icon: '🍄', text: 'Faint: come back as a 1/1.' },
};

const pickN = <T>(c: Ctx, arr: T[], n: number): T[] => c.rng.shuffle([...arr]).slice(0, n);
const lowest = (us: Unit[]): Unit | undefined => us.reduce<Unit | undefined>((a, u) => (!a || u.hp < a.hp ? u : a), undefined);
const toughest = (us: Unit[]): Unit | undefined => us.reduce<Unit | undefined>((a, u) => (!a || u.hp > a.hp ? u : a), undefined);
const none = (): void => {};

const C = (
  id: string,
  icon: string,
  name: string,
  tier: number,
  atk: number,
  hp: number,
  pack: PackId,
  trigger: Trigger | null,
  text: (L: number) => string,
  fx: (c: Ctx, me: Unit, L: number) => void,
): CritterDef => ({ id, icon, name, tier, atk, hp, pack, trigger, text, fx });

const LIST: CritterDef[] = [
  // ---------- Tier 1 ----------
  C('ant', '🐜', 'Ant Scout', 1, 2, 1, 'meadow', 'faint', (L) => `Give a random friend +${2 * L}/+${L}.`, (c, me, L) => {
    const f = c.rng.pick(c.friends(me));
    if (f) c.buff(f, 2 * L, L);
  }),
  C('mouse', '🐭', 'Field Mouse', 1, 2, 1, 'meadow', 'sell', (L) => `Gain +${L} gold.`, (c, _me, L) => c.gold(L)),
  C('hopper', '🦗', 'Hopper', 1, 1, 2, 'meadow', 'faint', (L) => `Summon a ${L}/${L} Hop Spirit.`, (c, me, L) => c.summon(me, 'spirit', L, L)),
  C('snail', '🐌', 'Moss Snail', 1, 2, 2, 'meadow', 'buy', (L) => `Give 2 random friends +${L} HP.`, (c, me, L) => {
    for (const f of pickN(c, c.friends(me), 2)) c.buff(f, 0, L);
  }),
  C('duck', '🦆', 'Puddle Duck', 1, 2, 3, 'meadow', 'sell', (L) => `Give the shop critters +${L} HP.`, (c, _me, L) => c.shopBuff(0, L)),
  C('bee', '🐝', 'Busy Bee', 1, 1, 3, 'meadow', 'endturn', (L) => `Give the friend ahead +${L} attack.`, (c, me, L) => {
    const f = c.ahead(me)[0];
    if (f) c.buff(f, L, 0);
  }),
  C('guppy', '🐟', 'Guppy', 1, 2, 2, 'tide', 'hurt', (L) => `Gain +${L} attack.`, (c, me, L) => c.buff(me, L, 0)),
  C('gecko', '🦎', 'Gecko', 1, 1, 2, 'jungle', 'start', (L) => `Deal ${L} damage to 2 random enemies.`, (c, me, L) => {
    for (const e of pickN(c, c.foes(me), 2)) c.hit(e, L);
  }),

  // ---------- Tier 2 ----------
  C('hog', '🦔', 'Bramble Hog', 2, 3, 2, 'meadow', 'faint', (L) => `Deal ${2 * L} damage to all other critters.`, (c, me, L) => {
    for (const u of [...c.friends(me), ...c.foes(me)]) c.hit(u, 2 * L);
  }),
  C('robin', '🐦', 'Robin', 2, 2, 3, 'meadow', 'buy', (L) => `Give 2 random friends +${L} attack.`, (c, me, L) => {
    for (const f of pickN(c, c.friends(me), 2)) c.buff(f, L, 0);
  }),
  C('frog', '🐸', 'Pond Frog', 2, 2, 4, 'meadow', 'start', (L) => `Give the friend ahead +${2 * L} attack.`, (c, me, L) => {
    const f = c.ahead(me)[0];
    if (f) c.buff(f, 2 * L, 0);
  }),
  C('bat', '🦇', 'Dusk Bat', 2, 2, 3, 'meadow', 'start', (L) => `Lower the front enemy's attack by ${2 * L}.`, (c, me, L) => {
    const e = c.foes(me)[0];
    if (e) c.buff(e, -2 * L, 0);
  }),
  C('rat', '🐀', 'Tunnel Rat', 2, 3, 2, 'meadow', 'summon', (L) => `Give the new friend +${L} attack.`, (c, _me, L) => {
    if (c.arg) c.buff(c.arg, L, 0);
  }),
  C('squirrel', '🐿️', 'Nut Squirrel', 2, 1, 4, 'meadow', 'endturn', (L) => `If you kept gold, give a random friend +${L}/+${L}.`, (c, me, L) => {
    const f = c.rng.pick(c.friends(me));
    if (f && c.goldLeft() > 0) c.buff(f, L, L);
  }),
  C('puffer', '🐡', 'Puffer', 2, 2, 3, 'tide', 'hurt', (L) => `Deal ${2 * L} damage to a random enemy.`, (c, me, L) => {
    const e = c.rng.pick(c.foes(me));
    if (e) c.hit(e, 2 * L);
  }),
  C('monkey', '🐒', 'Banana Monkey', 2, 1, 3, 'jungle', 'endturn', (L) => `Give the front friend +${L}/+${L}.`, (c, me, L) => {
    const f = c.friends(me)[0];
    if (f) c.buff(f, L, L);
  }),

  // ---------- Tier 3 ----------
  C('owl', '🦉', 'Night Owl', 3, 3, 4, 'meadow', 'sell', (L) => `Give a random friend +${2 * L}/+${2 * L}.`, (c, me, L) => {
    const f = c.rng.pick(c.friends(me));
    if (f) c.buff(f, 2 * L, 2 * L);
  }),
  C('turtle', '🐢', 'Old Turtle', 3, 2, 5, 'meadow', 'faint', (L) => `Give ${L} friend${L > 1 ? 's' : ''} behind a 🥜 Shell.`, (c, me, L) => {
    for (const f of c.behind(me).slice(0, L)) c.givePerk(f, 'shell');
  }),
  C('fox', '🦊', 'Red Fox', 3, 4, 3, 'meadow', 'start', (L) => `Deal ${3 * L} damage to the enemy with the least HP.`, (c, me, L) => {
    const e = lowest(c.foes(me));
    if (e) c.hit(e, 3 * L);
  }),
  C('sheep', '🐑', 'Woolly Sheep', 3, 2, 2, 'meadow', 'faint', (L) => `Summon two ${2 * L}/${2 * L} Lambs.`, (c, me, L) => {
    c.summon(me, 'lamb', 2 * L, 2 * L);
    c.summon(me, 'lamb', 2 * L, 2 * L);
  }),
  C('dog', '🐕', 'Farm Dog', 3, 3, 3, 'meadow', 'summon', (L) => `In battle: gain +${L}/+${L}.`, (c, me, L) => {
    if (c.mode === 'battle') c.buff(me, L, L);
  }),
  C('skunk', '🦨', 'Stinker', 3, 3, 5, 'meadow', 'start', (L) => `The enemy with the most HP loses ${Math.min(90, 33 * L)}% of its HP.`, (c, me, L) => {
    const e = toughest(c.foes(me));
    if (e) c.buff(e, 0, -Math.floor((e.hp * Math.min(90, 33 * L)) / 100));
  }),
  C('crab', '🦀', 'Rock Crab', 3, 3, 1, 'tide', 'buy', (L) => `Gain ${50 * L}% of the HP of your healthiest friend.`, (c, me, L) => {
    const f = toughest(c.friends(me));
    if (f) c.buff(me, 0, Math.floor((f.hp * L) / 2));
  }),
  C('croc', '🐊', 'Swamp Croc', 3, 3, 4, 'jungle', 'start', (L) => `Deal ${3 * L} damage to the last enemy.`, (c, me, L) => {
    const fs = c.foes(me);
    if (fs.length) c.hit(fs[fs.length - 1], 3 * L);
  }),

  // ---------- Tier 4 ----------
  C('bear', '🐻', 'Brown Bear', 4, 4, 6, 'meadow', 'hurt', (L) => `Give the friend behind +${L}/+${L}.`, (c, me, L) => {
    const f = c.behind(me)[0];
    if (f) c.buff(f, L, L);
  }),
  C('bison', '🦬', 'Plains Bison', 4, 4, 4, 'meadow', 'endturn', (L) => `Gain +${L}/+${L}.`, (c, me, L) => c.buff(me, L, L)),
  C('wolf', '🐺', 'Grey Wolf', 4, 5, 3, 'meadow', 'faint', (L) => `Give all friends +${L} attack.`, (c, me, L) => {
    for (const f of c.friends(me)) c.buff(f, L, 0);
  }),
  C('eagle', '🦅', 'Sky Eagle', 4, 4, 4, 'meadow', 'start', (L) => `Deal ${2 * L} damage to the 2 enemies at the back.`, (c, me, L) => {
    for (const e of c.foes(me).slice(-2)) c.hit(e, 2 * L);
  }),
  C('goat', '🐐', 'Hill Goat', 4, 3, 6, 'meadow', 'faint', (L) => `Give the 2 friends behind +${L}/+${2 * L}.`, (c, me, L) => {
    for (const f of c.behind(me).slice(0, 2)) c.buff(f, L, 2 * L);
  }),
  C('seal', '🦭', 'Harbor Seal', 4, 3, 5, 'tide', 'hurt', (L) => `Give 2 random friends +${L}/+${L}.`, (c, me, L) => {
    for (const f of pickN(c, c.friends(me), 2)) c.buff(f, L, L);
  }),
  C('viper', '🐍', 'Viper', 4, 4, 3, 'jungle', 'start', (L) => `Deal ${L} damage to every enemy.`, (c, me, L) => {
    for (const e of c.foes(me)) c.hit(e, L);
  }),

  // ---------- Tier 5 ----------
  C('lion', '🦁', 'Sun Lion', 5, 5, 6, 'meadow', 'start', (L) => `Gain +${50 * L}% attack.`, (c, me, L) => c.buff(me, Math.floor((me.atk * L) / 2), 0)),
  C('rhino', '🦏', 'Iron Rhino', 5, 5, 8, 'meadow', 'start', (L) => `Deal ${4 * L} damage to the front enemy.`, (c, me, L) => {
    const e = c.foes(me)[0];
    if (e) c.hit(e, 4 * L);
  }),
  C('elephant', '🐘', 'Grand Tusk', 5, 4, 10, 'meadow', 'hurt', (L) => `Give all friends +${L} HP.`, (c, me, L) => {
    for (const f of c.friends(me)) c.buff(f, 0, L);
  }),
  C('giraffe', '🦒', 'Tall Giraffe', 5, 3, 7, 'meadow', 'endturn', (L) => `Give the 2 friends ahead +${L}/+${L}.`, (c, me, L) => {
    for (const f of c.ahead(me).slice(0, 2)) c.buff(f, L, L);
  }),
  C('gorilla', '🦍', 'Silverback', 5, 6, 8, 'meadow', 'hurt', (L) => `Gain a 🍉 Melon (${L}× per battle).`, (c, me, L) => {
    for (let i = 0; i < L; i++) {
      if (c.once({ ...me, uid: me.uid * 10 + i })) {
        c.givePerk(me, 'melon');
        return;
      }
    }
  }),
  C('dolphin', '🐬', 'Bright Dolphin', 5, 5, 5, 'tide', 'start', (L) => `Deal ${4 * L} damage to the enemy with the least HP.`, (c, me, L) => {
    const e = lowest(c.foes(me));
    if (e) c.hit(e, 4 * L);
  }),
  C('peacock', '🦚', 'Peacock', 5, 3, 7, 'jungle', 'hurt', (L) => `Gain +${2 * L} attack.`, (c, me, L) => c.buff(me, 2 * L, 0)),

  // ---------- Tier 6 ----------
  C('mammoth', '🦣', 'Tundra Mammoth', 6, 4, 10, 'meadow', 'faint', (L) => `Give all friends +${2 * L}/+${2 * L}.`, (c, me, L) => {
    for (const f of c.friends(me)) c.buff(f, 2 * L, 2 * L);
  }),
  C('tiger', '🐅', 'Stripe Tiger', 6, 6, 6, 'meadow', 'start', (L) => `Give all friends +${L} attack.`, (c, me, L) => {
    for (const f of c.friends(me)) c.buff(f, L, 0);
  }),
  C('shark', '🦈', 'Reef Shark', 6, 6, 5, 'meadow', 'start', (L) => `Deal ${2 * L} damage to all enemies.`, (c, me, L) => {
    for (const e of c.foes(me)) c.hit(e, 2 * L);
  }),
  C('roo', '🦘', 'Boxer Roo', 6, 5, 7, 'meadow', 'summon', (L) => `Give the new friend +${2 * L}/+${2 * L}.`, (c, _me, L) => {
    if (c.arg) c.buff(c.arg, 2 * L, 2 * L);
  }),
  C('camel', '🐫', 'Dune Camel', 6, 3, 9, 'meadow', 'hurt', (L) => `Give the friend behind +${2 * L}/+${2 * L}.`, (c, me, L) => {
    const f = c.behind(me)[0];
    if (f) c.buff(f, 2 * L, 2 * L);
  }),
  C('whale', '🐋', 'Deep Whale', 6, 4, 10, 'tide', 'faint', (L) => `Summon a ${5 * L}/${5 * L} Calf.`, (c, me, L) => c.summon(me, 'calf', 5 * L, 5 * L)),
  C('rex', '🦖', 'Rex', 6, 7, 7, 'jungle', 'hurt', (L) => `Deal ${3 * L} damage to a random enemy.`, (c, me, L) => {
    const e = c.rng.pick(c.foes(me));
    if (e) c.hit(e, 3 * L);
  }),

  // ---------- Tokens (summoned only) ----------
  C('spirit', '👻', 'Hop Spirit', 0, 1, 1, 'meadow', null, () => 'Summoned by the Hopper.', none),
  C('lamb', '🐏', 'Lamb', 0, 2, 2, 'meadow', null, () => 'Summoned by the Woolly Sheep.', none),
  C('bumble', '🪲', 'Bumble', 0, 1, 1, 'meadow', null, () => 'Summoned by 🍯 Honey.', none),
  C('calf', '🐳', 'Calf', 0, 5, 5, 'tide', null, () => 'Summoned by the Deep Whale.', none),
];

export const CRITTERS: Record<string, CritterDef> = Object.fromEntries(LIST.map((c) => [c.id, c]));
export const SHOP_CRITTERS = LIST.filter((c) => c.tier > 0);

export const FOODS: FoodDef[] = [
  { id: 'apple', name: 'Apple', icon: '🍎', tier: 1, target: true, text: 'Give a critter +1/+1.' },
  { id: 'honey', name: 'Honey', icon: '🍯', tier: 1, target: true, perk: 'honey', text: 'Perk. Faint: summon a 1/1 Bumble.' },
  { id: 'salad', name: 'Salad', icon: '🥗', tier: 2, target: false, text: 'Give 2 random critters +1/+1.' },
  { id: 'bone', name: 'Bone', icon: '🦴', tier: 2, target: true, perk: 'bone', text: 'Perk. Attacks deal +3 damage.' },
  { id: 'choco', name: 'Chocolate', icon: '🍫', tier: 3, target: true, text: 'Give a critter +1 level progress.' },
  { id: 'shell', name: 'Nut Shell', icon: '🥜', tier: 3, target: true, perk: 'shell', text: 'Perk. Take 2 less damage per hit.' },
  { id: 'pear', name: 'Pear', icon: '🍐', tier: 4, target: true, text: 'Give a critter +2/+2.' },
  { id: 'chili', name: 'Chili', icon: '🌶️', tier: 4, target: true, perk: 'chili', text: 'Perk. Attacks also hit the enemy behind for 4.' },
  { id: 'melon', name: 'Melon', icon: '🍉', tier: 5, target: true, perk: 'melon', text: 'Perk. Block 20 damage once.' },
  { id: 'sushi', name: 'Sushi', icon: '🍣', tier: 5, target: false, text: 'Give 3 random critters +2/+2.' },
  { id: 'mush', name: 'Mushroom', icon: '🍄', tier: 6, target: true, perk: 'mush', text: 'Perk. Faint: come back as a 1/1.' },
];

export const FOOD: Record<string, FoodDef> = Object.fromEntries(FOODS.map((f) => [f.id, f]));

export const levelOf = (xp: number): number => (xp >= 5 ? 3 : xp >= 2 ? 2 : 1);
export const BUY_COST = 3;
export const FOOD_COST = 3;
export const REROLL_COST = 1;
export const START_GOLD = 10;
export const START_LIVES = 6;
export const WIN_TROPHIES = 10;

/** The highest shop tier in a round: tier 1 in rounds 1–2, tier 2 in rounds 3–4, and so on. */
export const tierFor = (round: number): number => Math.min(6, 1 + Math.floor((round - 1) / 2));
export const shopSize = (round: number): number => (round <= 2 ? 3 : round <= 4 ? 4 : 5);
export const foodSize = (round: number): number => (round <= 2 ? 1 : 2);
/** Lives lost on a defeat. Later rounds hurt more. */
export const lifeLoss = (round: number): number => (round <= 4 ? 1 : round <= 8 ? 2 : 3);
