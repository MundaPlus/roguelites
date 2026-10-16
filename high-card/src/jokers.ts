/** Joker definitions. Each joker is a set of small hook functions that the scorer calls in order. */
import { type Card, type Edition, type HandType, isFace } from './cards';

/** What the scorer knows about the hand when it calls a joker. */
export interface Cx {
  type: HandType;
  contains: Set<HandType>;
  played: Card[];
  scoring: Card[];
  held: Card[];
  money: number;
  discardsLeft: number;
  discardsUsed: number;
  /** Hands left after this one. */
  handsLeft: number;
  drawLeft: number;
  /** Times this hand type was played this run, this hand included. */
  plays: number;
  /** Hand types played earlier in this round. */
  roundTypes: HandType[];
  jokerCount: number;
  slots: number;
  planetsUsed: number;
  cardsAdded: number;
  steelCount: number;
  finalHand: boolean;
  /** Index in `scoring` of the first face card, or -1. */
  firstFace: number;
}

export interface Eff {
  c?: number;
  m?: number;
  x?: number;
  $?: number;
}

export interface EndRound {
  v?: number;
  $?: number;
  destroy?: boolean;
}

export interface JDef {
  id: string;
  name: string;
  icon: string;
  rarity: 1 | 2 | 3;
  cost: number;
  /** `{v}` is replaced with the live value. */
  text: string;
  v0?: number;
  /** Scored card hook. `si` is the index in the scoring cards. */
  card?(cx: Cx, c: Card, v: number, si: number): Eff | null;
  /** Held-in-hand card hook. */
  held?(cx: Cx, c: Card, v: number): Eff | null;
  /** Independent hook after all cards. */
  main?(cx: Cx, v: number): Eff | null;
  /** Extra triggers for a card. */
  retrig?(cx: Cx, c: Card, held: boolean): number;
  /** Runs once before scoring. Returns the new value (scaling jokers). */
  before?(cx: Cx, v: number): number;
  discard?(v: number, cards: Card[]): number;
  endRound?(v: number, rnd: () => number): EndRound | null;
  /** Shown value for the `{v}` text. */
  show?(v: number, cx: Partial<Cx>): string;
  passive?: 'fourFingers' | 'shortcut' | 'splash' | 'handSize' | 'discard';
  copy?: 'right' | 'left';
}

export interface JokerInst {
  uid: number;
  id: string;
  v: number;
  ed?: Edition;
}

const ifType =
  (t: HandType, e: Eff) =>
  (cx: Cx): Eff | null =>
    cx.contains.has(t) ? e : null;
const ifSuit =
  (s: number) =>
  (_cx: Cx, c: Card): Eff | null =>
    c.suit === s ? { m: 3 } : null;

const LIST: JDef[] = [
  { id: 'joker', name: 'Joker', icon: '🃏', rarity: 1, cost: 2, text: '+4 Mult', main: () => ({ m: 4 }) },
  { id: 'greedy', name: 'Greedy Joker', icon: '💎', rarity: 1, cost: 5, text: 'Scored ♦ cards give +3 Mult', card: ifSuit(3) },
  { id: 'lusty', name: 'Lusty Joker', icon: '💘', rarity: 1, cost: 5, text: 'Scored ♥ cards give +3 Mult', card: ifSuit(1) },
  { id: 'wrathful', name: 'Wrathful Joker', icon: '🗡️', rarity: 1, cost: 5, text: 'Scored ♠ cards give +3 Mult', card: ifSuit(0) },
  { id: 'gluttonous', name: 'Gluttonous Joker', icon: '🍀', rarity: 1, cost: 5, text: 'Scored ♣ cards give +3 Mult', card: ifSuit(2) },
  { id: 'jolly', name: 'Jolly Joker', icon: '😄', rarity: 1, cost: 3, text: '+8 Mult if the hand contains a Pair', main: ifType('Pair', { m: 8 }) },
  { id: 'zany', name: 'Zany Joker', icon: '🤪', rarity: 1, cost: 4, text: '+12 Mult if the hand contains Three of a Kind', main: ifType('Three of a Kind', { m: 12 }) },
  { id: 'mad', name: 'Mad Joker', icon: '😠', rarity: 1, cost: 4, text: '+10 Mult if the hand contains Two Pair', main: ifType('Two Pair', { m: 10 }) },
  { id: 'crazy', name: 'Crazy Joker', icon: '🌀', rarity: 1, cost: 4, text: '+12 Mult if the hand contains a Straight', main: ifType('Straight', { m: 12 }) },
  { id: 'droll', name: 'Droll Joker', icon: '🤡', rarity: 1, cost: 4, text: '+10 Mult if the hand contains a Flush', main: ifType('Flush', { m: 10 }) },
  { id: 'sly', name: 'Sly Joker', icon: '🦊', rarity: 1, cost: 3, text: '+50 Chips if the hand contains a Pair', main: ifType('Pair', { c: 50 }) },
  { id: 'wily', name: 'Wily Joker', icon: '🐺', rarity: 1, cost: 4, text: '+100 Chips if the hand contains Three of a Kind', main: ifType('Three of a Kind', { c: 100 }) },
  { id: 'clever', name: 'Clever Joker', icon: '🦉', rarity: 1, cost: 4, text: '+80 Chips if the hand contains Two Pair', main: ifType('Two Pair', { c: 80 }) },
  { id: 'devious', name: 'Devious Joker', icon: '🐍', rarity: 1, cost: 4, text: '+100 Chips if the hand contains a Straight', main: ifType('Straight', { c: 100 }) },
  { id: 'crafty', name: 'Crafty Joker', icon: '🕷️', rarity: 1, cost: 4, text: '+80 Chips if the hand contains a Flush', main: ifType('Flush', { c: 80 }) },
  { id: 'half', name: 'Half Joker', icon: '🌗', rarity: 1, cost: 5, text: '+20 Mult if you play 3 or fewer cards', main: (cx) => (cx.played.length <= 3 ? { m: 20 } : null) },
  { id: 'banner', name: 'Banner', icon: '🚩', rarity: 1, cost: 5, text: '+30 Chips for each discard left', main: (cx) => (cx.discardsLeft ? { c: 30 * cx.discardsLeft } : null) },
  { id: 'summit', name: 'Mystic Summit', icon: '🏔️', rarity: 1, cost: 5, text: '+15 Mult when no discards are left', main: (cx) => (cx.discardsLeft === 0 ? { m: 15 } : null) },
  { id: 'even', name: 'Even Steven', icon: '✌️', rarity: 1, cost: 4, text: 'Scored 10, 8, 6, 4, 2 give +4 Mult', card: (_cx, c) => (c.rank <= 10 && c.rank % 2 === 0 ? { m: 4 } : null) },
  { id: 'odd', name: 'Odd Todd', icon: '🎲', rarity: 1, cost: 4, text: 'Scored A, 9, 7, 5, 3 give +31 Chips', card: (_cx, c) => (c.rank === 14 || (c.rank <= 9 && c.rank % 2 === 1) ? { c: 31 } : null) },
  { id: 'scholar', name: 'Scholar', icon: '🎓', rarity: 1, cost: 4, text: 'Scored aces give +20 Chips and +4 Mult', card: (_cx, c) => (c.rank === 14 ? { c: 20, m: 4 } : null) },
  { id: 'scary', name: 'Scary Face', icon: '👻', rarity: 1, cost: 4, text: 'Scored face cards give +30 Chips', card: (_cx, c) => (isFace(c) ? { c: 30 } : null) },
  { id: 'smiley', name: 'Smiley Face', icon: '🙂', rarity: 1, cost: 4, text: 'Scored face cards give +5 Mult', card: (_cx, c) => (isFace(c) ? { m: 5 } : null) },
  { id: 'abstract', name: 'Abstract Joker', icon: '🔷', rarity: 1, cost: 4, text: '+3 Mult for each joker you have', main: (cx) => ({ m: 3 * cx.jokerCount }) },
  { id: 'blue', name: 'Blue Joker', icon: '🔵', rarity: 1, cost: 5, text: '+2 Chips for each card left in the draw pile', main: (cx) => (cx.drawLeft ? { c: 2 * cx.drawLeft } : null) },
  {
    id: 'icecream',
    name: 'Ice Cream',
    icon: '🍦',
    rarity: 1,
    cost: 5,
    text: '+{v} Chips. −5 Chips after each hand.',
    v0: 100,
    main: (_cx, v) => (v > 0 ? { c: v } : null),
  },
  {
    id: 'gros',
    name: 'Gros Michel',
    icon: '🍌',
    rarity: 1,
    cost: 5,
    text: '+15 Mult. 1 in 6 chance to spoil at the end of a round.',
    main: () => ({ m: 15 }),
    endRound: (_v, rnd) => (rnd() < 1 / 6 ? { destroy: true } : null),
  },
  { id: 'golden', name: 'Golden Joker', icon: '🪙', rarity: 1, cost: 6, text: 'Earn $4 at the end of each round', endRound: () => ({ $: 4 }) },
  { id: 'egg', name: 'Egg', icon: '🥚', rarity: 1, cost: 4, text: 'Sell value goes up by $3 each round (+${v})', endRound: (v) => ({ v: v + 3 }) },
  {
    id: 'raised',
    name: 'Raised Fist',
    icon: '✊',
    rarity: 1,
    cost: 5,
    text: 'Adds double the rank of the lowest held card to Mult',
    main: (cx) => {
      if (!cx.held.length) return null;
      const low = Math.min(...cx.held.map((c) => (c.rank >= 11 && c.rank <= 13 ? 10 : c.rank === 14 ? 11 : c.rank)));
      return { m: 2 * low };
    },
  },
  { id: 'supernova', name: 'Supernova', icon: '🌟', rarity: 1, cost: 5, text: '+Mult equal to the times this hand type was played this run', main: (cx) => ({ m: cx.plays }) },
  {
    id: 'green',
    name: 'Green Joker',
    icon: '🟩',
    rarity: 1,
    cost: 4,
    text: '+1 Mult per hand played, −1 per discard (now +{v})',
    before: (_cx, v) => v + 1,
    main: (_cx, v) => (v > 0 ? { m: v } : null),
    discard: (v) => Math.max(0, v - 1),
  },
  {
    id: 'bus',
    name: 'Ride the Bus',
    icon: '🚌',
    rarity: 1,
    cost: 6,
    text: '+1 Mult per hand in a row with no scored face card (now +{v})',
    before: (cx, v) => (cx.scoring.some(isFace) ? 0 : v + 1),
    main: (_cx, v) => (v > 0 ? { m: v } : null),
  },
  { id: 'photo', name: 'Photograph', icon: '📷', rarity: 1, cost: 5, text: 'The first scored face card gives ×2 Mult', card: (cx, _c, _v, si) => (si === cx.firstFace ? { x: 2 } : null) },
  { id: 'moon', name: 'Shoot the Moon', icon: '🌙', rarity: 1, cost: 5, text: 'Each queen held in hand gives +13 Mult', held: (_cx, c) => (c.rank === 12 ? { m: 13 } : null) },
  { id: 'delayed', name: 'Delayed Gratification', icon: '⏳', rarity: 1, cost: 4, text: 'Earn $2 per discard left at the end of the round if you used none' },
  { id: 'splash', name: 'Splash', icon: '💦', rarity: 1, cost: 3, text: 'Every played card scores', passive: 'splash' },
  { id: 'juggler', name: 'Juggler', icon: '🤹', rarity: 1, cost: 4, text: '+1 hand size', passive: 'handSize' },
  { id: 'drunkard', name: 'Drunkard', icon: '🍺', rarity: 1, cost: 4, text: '+1 discard each round', passive: 'discard' },
  { id: 'square', name: 'Square Joker', icon: '🟥', rarity: 1, cost: 4, text: 'Gains +4 Chips when you play exactly 4 cards (now +{v})', before: (cx, v) => (cx.played.length === 4 ? v + 4 : v), main: (_cx, v) => (v ? { c: v } : null) },
  // Uncommon
  { id: 'fibonacci', name: 'Fibonacci', icon: '🐚', rarity: 2, cost: 8, text: 'Scored A, 2, 3, 5, 8 give +8 Mult', card: (_cx, c) => ([14, 2, 3, 5, 8].includes(c.rank) ? { m: 8 } : null) },
  { id: 'bull', name: 'Bull', icon: '🐂', rarity: 2, cost: 6, text: '+2 Chips for each $1 you have', main: (cx) => (cx.money > 0 ? { c: 2 * cx.money } : null) },
  { id: 'fingers', name: 'Four Fingers', icon: '✋', rarity: 2, cost: 7, text: 'Flushes and Straights need only 4 cards', passive: 'fourFingers' },
  { id: 'shortcut', name: 'Shortcut', icon: '⤴️', rarity: 2, cost: 7, text: 'Straights can skip one rank (10 8 6 5 4)', passive: 'shortcut' },
  { id: 'hack', name: 'Hack', icon: '🔧', rarity: 2, cost: 6, text: 'Scored 2, 3, 4, 5 trigger one more time', retrig: (_cx, c, held) => (!held && c.rank >= 2 && c.rank <= 5 ? 1 : 0) },
  { id: 'sock', name: 'Sock and Buskin', icon: '🧦', rarity: 2, cost: 6, text: 'Scored face cards trigger one more time', retrig: (_cx, c, held) => (!held && isFace(c) ? 1 : 0) },
  { id: 'dusk', name: 'Dusk', icon: '🌆', rarity: 2, cost: 5, text: 'In the last hand of the round, scored cards trigger one more time', retrig: (cx, _c, held) => (!held && cx.finalHand ? 1 : 0) },
  { id: 'mime', name: 'Mime', icon: '🤐', rarity: 2, cost: 5, text: 'Cards held in hand trigger one more time', retrig: (_cx, _c, held) => (held ? 1 : 0) },
  { id: 'blackboard', name: 'Blackboard', icon: '⬛', rarity: 2, cost: 6, text: '×3 Mult if all held cards are ♠ or ♣', main: (cx) => (cx.held.every((c) => c.suit === 0 || c.suit === 2) ? { x: 3 } : null) },
  {
    id: 'constellation',
    name: 'Constellation',
    icon: '✨',
    rarity: 2,
    cost: 6,
    text: '×0.1 Mult for each planet used (now ×{v})',
    main: (cx) => (cx.planetsUsed ? { x: 1 + 0.1 * cx.planetsUsed } : null),
    show: (_v, cx) => (1 + 0.1 * (cx.planetsUsed ?? 0)).toFixed(1),
  },
  { id: 'cardsharp', name: 'Card Sharp', icon: '🎴', rarity: 2, cost: 6, text: '×3 Mult if this hand type was already played this round', main: (cx) => (cx.roundTypes.includes(cx.type) ? { x: 3 } : null) },
  { id: 'runner', name: 'Runner', icon: '🏃', rarity: 2, cost: 5, text: 'Gains +15 Chips when you play a Straight (now +{v})', before: (cx, v) => (cx.contains.has('Straight') ? v + 15 : v), main: (_cx, v) => (v ? { c: v } : null) },
  { id: 'trousers', name: 'Spare Trousers', icon: '👖', rarity: 2, cost: 6, text: 'Gains +2 Mult when you play Two Pair (now +{v})', before: (cx, v) => (cx.contains.has('Two Pair') ? v + 2 : v), main: (_cx, v) => (v ? { m: v } : null) },
  { id: 'cavendish', name: 'Cavendish', icon: '🥭', rarity: 2, cost: 5, text: '×3 Mult. 1 in 40 chance to spoil at the end of a round.', main: () => ({ x: 3 }), endRound: (_v, rnd) => (rnd() < 1 / 40 ? { destroy: true } : null) },
  // Rare
  { id: 'duo', name: 'The Duo', icon: '👯', rarity: 3, cost: 8, text: '×2 Mult if the hand contains a Pair', main: ifType('Pair', { x: 2 }) },
  { id: 'trio', name: 'The Trio', icon: '🎳', rarity: 3, cost: 8, text: '×3 Mult if the hand contains Three of a Kind', main: ifType('Three of a Kind', { x: 3 }) },
  { id: 'order', name: 'The Order', icon: '📶', rarity: 3, cost: 8, text: '×3 Mult if the hand contains a Straight', main: ifType('Straight', { x: 3 }) },
  { id: 'tribe', name: 'The Tribe', icon: '🏕️', rarity: 3, cost: 8, text: '×2 Mult if the hand contains a Flush', main: ifType('Flush', { x: 2 }) },
  // Locked at the start (meta unlocks)
  { id: 'family', name: 'The Family', icon: '👪', rarity: 3, cost: 8, text: '×4 Mult if the hand contains Four of a Kind', main: ifType('Four of a Kind', { x: 4 }) },
  { id: 'stencil', name: 'Joker Stencil', icon: '🖼️', rarity: 2, cost: 8, text: '×1 Mult for each empty joker slot (this one counts)', main: (cx) => ({ x: 1 + cx.slots - cx.jokerCount }) },
  { id: 'bootstraps', name: 'Bootstraps', icon: '👢', rarity: 2, cost: 7, text: '+2 Mult for each $5 you have', main: (cx) => (cx.money >= 5 ? { m: 2 * Math.floor(cx.money / 5) } : null) },
  { id: 'wee', name: 'Wee Joker', icon: '🐭', rarity: 3, cost: 8, text: 'Gains +8 Chips for each scored 2 (now +{v})', before: (cx, v) => v + 8 * cx.scoring.filter((c) => c.rank === 2).length, main: (_cx, v) => (v ? { c: v } : null) },
  { id: 'hologram', name: 'Hologram', icon: '🪞', rarity: 2, cost: 7, text: '×0.25 Mult for each card added to the deck (now ×{v})', main: (cx) => (cx.cardsAdded ? { x: 1 + 0.25 * cx.cardsAdded } : null), show: (_v, cx) => (1 + 0.25 * (cx.cardsAdded ?? 0)).toFixed(2) },
  { id: 'steel', name: 'Steel Joker', icon: '🔩', rarity: 2, cost: 7, text: '×0.2 Mult for each Steel card in the deck (now ×{v})', main: (cx) => (cx.steelCount ? { x: 1 + 0.2 * cx.steelCount } : null), show: (_v, cx) => (1 + 0.2 * (cx.steelCount ?? 0)).toFixed(1) },
  { id: 'baron', name: 'Baron', icon: '👑', rarity: 3, cost: 8, text: 'Each king held in hand gives ×1.5 Mult', held: (_cx, c) => (c.rank === 13 ? { x: 1.5 } : null) },
  { id: 'blueprint', name: 'Blueprint', icon: '📘', rarity: 3, cost: 10, text: 'Copies the joker to its right', copy: 'right' },
  { id: 'brainstorm', name: 'Brainstorm', icon: '🧠', rarity: 3, cost: 10, text: 'Copies the leftmost joker', copy: 'left' },
];

export const JOKERS: Record<string, JDef> = Object.fromEntries(LIST.map((j) => [j.id, j]));
export const JOKER_IDS = LIST.map((j) => j.id);
/** Unlocked one by one with total blinds beaten (meta progress). */
export const LOCKED_JOKERS = ['family', 'stencil', 'bootstraps', 'wee', 'hologram', 'steel', 'baron', 'blueprint', 'brainstorm'];
export const BLINDS_PER_UNLOCK = 6;

export const RARITY_NAME = ['', 'Common', 'Uncommon', 'Rare'] as const;

export function sellValue(j: JokerInst): number {
  const d = JOKERS[j.id];
  const ed = j.ed ? 2 : 0;
  return Math.max(1, Math.floor((d.cost + ed) / 2)) + (j.id === 'egg' ? j.v : 0);
}

export function jokerText(j: JokerInst, cx: Partial<Cx>): string {
  const d = JOKERS[j.id];
  const v = d.show ? d.show(j.v, cx) : String(j.v);
  return d.text.replace('{v}', v);
}

/** The definition that acts for joker `i`: a copy joker acts as its target. */
export function actingDef(jokers: JokerInst[], i: number): { def: JDef; inst: JokerInst } | null {
  let k = i;
  for (let depth = 0; depth < 6; depth++) {
    const d = JOKERS[jokers[k].id];
    if (!d.copy) return { def: d, inst: jokers[k] };
    const next = d.copy === 'right' ? k + 1 : 0;
    if (next >= jokers.length || next === k) return null;
    k = next;
  }
  return null;
}
