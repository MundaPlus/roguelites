/** Simple bots for the debug API and the balance sim. They return one action at a time. */
import { type Card, type HandType, rankChips } from './cards';
import { BOSS, PLANET, TAROT } from './data';
import { JOKERS } from './jokers';
import { type RunState, PACK_INFO, consError, curBoss, playError, preview } from './run';

export type BotLevel = 'random' | 'greedy' | 'smart';

export type Action =
  | { type: 'start' }
  | { type: 'play'; ids: number[] }
  | { type: 'discard'; ids: number[] }
  | { type: 'use'; i: number; sel: number[] }
  | { type: 'collect' }
  | { type: 'buy'; i: number }
  | { type: 'pack'; i: number }
  | { type: 'pick'; i: number }
  | { type: 'skip' }
  | { type: 'sell'; i: number }
  | { type: 'move'; i: number; d: number }
  | { type: 'reroll' }
  | { type: 'next' }
  | { type: 'end' };

/** Rough strength of each joker for the smart bot. */
const VALUE: Record<string, number> = {
  joker: 4, greedy: 5, lusty: 5, wrathful: 5, gluttonous: 5, jolly: 5, zany: 4, mad: 4, crazy: 3, droll: 5,
  sly: 3, wily: 3, clever: 3, devious: 3, crafty: 3, half: 5, banner: 4, summit: 4, even: 4, odd: 4, scholar: 3,
  scary: 3, smiley: 4, abstract: 5, blue: 4, icecream: 4, gros: 6, golden: 4, egg: 2, raised: 4, supernova: 5,
  green: 5, bus: 5, photo: 5, moon: 3, delayed: 2, splash: 2, juggler: 4, drunkard: 3, square: 3, fibonacci: 5,
  bull: 4, fingers: 5, shortcut: 3, hack: 3, sock: 3, dusk: 3, mime: 2, blackboard: 5, constellation: 6,
  cardsharp: 7, runner: 3, trousers: 4, cavendish: 9, duo: 8, trio: 6, order: 6, tribe: 7, family: 5, stencil: 6,
  bootstraps: 5, wee: 3, hologram: 3, steel: 3, baron: 6, blueprint: 8, brainstorm: 7,
};
const GOOD_TYPES: Partial<Record<HandType, number>> = { Flush: 5, 'Two Pair': 4, Pair: 4, 'Full House': 3, 'Three of a Kind': 3, Straight: 2 };
const XJ = new Set(['photo', 'blackboard', 'constellation', 'cardsharp', 'cavendish', 'duo', 'trio', 'order', 'tribe', 'family', 'stencil', 'hologram', 'steel', 'baron']);

const subsets = (n: number, k: number): number[][] => {
  const out: number[][] = [];
  const rec = (start: number, cur: number[]): void => {
    if (cur.length) out.push([...cur]);
    if (cur.length === k) return;
    for (let i = start; i < n; i++) rec(i + 1, [...cur, i]);
  };
  rec(0, []);
  return out;
};
const SUBSETS: Record<number, number[][]> = {};
const subsetsOf = (n: number): number[][] => (SUBSETS[n] ??= subsets(n, 5));

function bestPlay(run: RunState): { ids: number[]; total: number } {
  const hand = run.round!.hand;
  // The Mouth: lock in a common hand type (Pair) with the first hand.
  const mouth = curBoss(run) === 'mouth' && !run.round!.mouthType;
  let best = { ids: [hand[0].id], total: -1 };
  for (const s of subsetsOf(hand.length)) {
    const ids = s.map((i) => hand[i].id);
    if (playError(run, ids)) continue;
    const p = preview(run, ids);
    const t = mouth && p.type !== 'Pair' ? p.total / 10 : p.total;
    if (t > best.total || (t === best.total && ids.length < best.ids.length)) best = { ids, total: t };
  }
  return best;
}

function focusType(run: RunState): HandType {
  let best: HandType = 'Pair';
  let n = 0;
  for (const [t, c] of Object.entries(run.handPlays) as [HandType, number][]) {
    if (c > n) {
      n = c;
      best = t;
    }
  }
  return best;
}

function discardPick(run: RunState): number[] {
  const hand = run.round!.hand;
  const bySuit = [0, 1, 2, 3].map((s) => hand.filter((c) => c.suit === s));
  const top = bySuit.reduce((a, b) => (b.length > a.length ? b : a));
  const byRank = new Map<number, Card[]>();
  hand.forEach((c) => byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]));
  const flushy = top.length >= 4 || (top.length >= 3 && run.levels.Flush >= run.levels.Pair + 1) || (top.length >= 3 && run.jokers.some((j) => ['droll', 'crafty', 'tribe'].includes(j.id)));
  const debuffed = (c: Card): boolean => {
    const b = curBoss(run);
    return (b === 'club' && c.suit === 2) || (b === 'goad' && c.suit === 0) || (b === 'head' && c.suit === 1) || (b === 'window' && c.suit === 3) || (b === 'plant' && c.rank >= 11 && c.rank <= 13);
  };
  let out: Card[];
  if (flushy) out = hand.filter((c) => c.suit !== top[0].suit);
  else out = hand.filter((c) => (byRank.get(c.rank)?.length ?? 0) < 2 || debuffed(c));
  out = out.filter((c) => c.enh !== 'steel' && c.enh !== 'gold' || debuffed(c));
  out.sort((a, b) => rankChips(a.rank) - rankChips(b.rank));
  return out.slice(0, 5).map((c) => c.id);
}

function roundAction(run: RunState, level: BotLevel, rnd: () => number): Action {
  const rd = run.round!;
  // Consumables first.
  if (level !== 'random') {
    for (let i = 0; i < run.cons.length; i++) {
      const c = run.cons[i];
      if (c.kind === 'planet') return { type: 'use', i, sel: [] };
      if (level !== 'smart') continue;
      const sel = tarotTargets(run, c.id);
      if (sel && !consError(run, i, sel)) return { type: 'use', i, sel };
    }
  }
  const hand = rd.hand;
  if (level === 'random') {
    const shuffled = [...hand].sort(() => rnd() - 0.5);
    if (rd.discardsLeft > 0 && rnd() < 0.3) return { type: 'discard', ids: shuffled.slice(0, 1 + Math.floor(rnd() * 5)).map((c) => c.id) };
    let n = 1 + Math.floor(rnd() * 5);
    if (curBoss(run) === 'psychic') n = 5;
    return { type: 'play', ids: shuffled.slice(0, Math.min(n, hand.length)).map((c) => c.id) };
  }
  const best = bestPlay(run);
  if (level === 'greedy') return { type: 'play', ids: best.ids };
  const need = rd.target - rd.score;
  if (best.total === 0 && rd.discardsLeft > 0 && rd.handsLeft > 1) {
    const ids = discardPick(run);
    if (ids.length) return { type: 'discard', ids };
  }
  if (best.total >= need || rd.handsLeft <= 1 || rd.discardsLeft <= 0 || best.total * rd.handsLeft >= need * 1.15) {
    return { type: 'play', ids: best.ids };
  }
  const ids = discardPick(run);
  if (!ids.length) return { type: 'play', ids: best.ids };
  return { type: 'discard', ids };
}

function tarotTargets(run: RunState, id: string): number[] | null {
  const t = TAROT[id];
  if (t.min === 0) {
    if (id === 'judgement' && run.jokers.length >= run.slots) return null;
    return [];
  }
  if (id === 'death') return null;
  const hand = run.round?.hand ?? [];
  const hi = [...hand].sort((a, b) => b.rank - a.rank);
  const lo = [...hi].reverse();
  const plain = (c: Card): boolean => !c.enh;
  const suitOf: Record<string, number> = { star: 3, moonc: 2, sun: 1, world: 0 };
  if (id in suitOf) {
    const counts = [0, 1, 2, 3].map((s) => run.cards.filter((c) => c.suit === s).length);
    if (counts.indexOf(Math.max(...counts)) !== suitOf[id]) return null;
    return lo.filter((c) => c.suit !== suitOf[id]).slice(0, t.max).map((c) => c.id);
  }
  if (id === 'hanged') return lo.filter(plain).slice(0, 2).map((c) => c.id);
  if (id === 'devil' || id === 'chariot') return lo.filter(plain).slice(0, 1).map((c) => c.id);
  return hi.filter((c) => (['aura', 'dejavu', 'talisman', 'trance', 'medium'].includes(id) ? !c.seal && !c.ed : plain(c))).slice(0, t.max).map((c) => c.id);
}

function desiredOrder(run: RunState): string[] {
  const val = (id: string): number => VALUE[id] ?? 3;
  const rest = run.jokers.filter((j) => !JOKERS[j.id].copy).map((j) => j.id);
  const plus = rest.filter((id) => !XJ.has(id));
  const xs = rest.filter((id) => XJ.has(id)).sort((a, b) => val(a) - val(b));
  const order = [...plus, ...xs];
  const copies = run.jokers.filter((j) => JOKERS[j.id].copy);
  for (const c of copies) {
    if (c.id === 'brainstorm') order.push(c.id);
    else {
      // Blueprint goes right before the strongest x-mult joker, or the strongest joker.
      const target = xs.length ? xs[xs.length - 1] : [...rest].sort((a, b) => val(b) - val(a))[0];
      const k = target ? order.indexOf(target) : order.length;
      order.splice(k < 0 ? order.length : k, 0, c.id);
    }
  }
  return order;
}

function shopAction(run: RunState, level: BotLevel, rnd: () => number): Action {
  const s = run.shop!;
  const free = run.slots - run.jokers.length;
  if (level === 'random') {
    const opts: Action[] = [];
    s.items.forEach((it, i) => !it.sold && it.price <= run.money && opts.push({ type: 'buy', i }));
    if (rnd() < 0.4 && opts.length) return opts[Math.floor(rnd() * opts.length)];
    return { type: 'next' };
  }
  // Use planets now.
  const pi = run.cons.findIndex((c) => c.kind === 'planet');
  if (pi >= 0) return { type: 'use', i: pi, sel: [] };
  if (level === 'greedy') {
    const i = s.items.findIndex((it) => !it.sold && it.kind === 'joker' && it.price <= run.money && free > 0);
    return i >= 0 ? { type: 'buy', i } : { type: 'next' };
  }
  if (level === 'smart') {
    for (let i = 0; i < run.cons.length; i++) {
      const c = run.cons[i];
      if (c.kind === 'tarot' && TAROT[c.id].min === 0 && tarotTargets(run, c.id) && !consError(run, i, [])) return { type: 'use', i, sel: [] };
    }
  }
  const reserve = run.ante >= 3 && run.jokers.length >= 3 ? 10 : 0;
  const val = (id: string): number => VALUE[id] ?? 3;
  const focus = focusType(run);
  for (let i = 0; i < s.items.length; i++) {
    const it = s.items[i];
    if (it.sold || it.price > run.money) continue;
    if (it.kind === 'joker') {
      const v = val(it.id) + (it.ed === 'poly' ? 3 : it.ed ? 1 : 0);
      if (free > 0 && (run.jokers.length < 3 || run.money - it.price >= reserve || v >= 7)) return { type: 'buy', i };
      if (free === 0) {
        let wi = 0;
        run.jokers.forEach((j, k) => val(j.id) < val(run.jokers[wi].id) && (wi = k));
        if (v >= val(run.jokers[wi].id) + 2) return { type: 'sell', i: wi };
      }
    } else if (it.kind === 'planet') {
      if (PLANET[it.id].hand === focus && run.cons.length < run.consSlots && run.money - it.price >= Math.min(5, reserve)) return { type: 'buy', i };
    } else if (run.cons.length < run.consSlots && run.money - it.price >= reserve && tarotTargets(run, it.id) !== null) return { type: 'buy', i };
  }
  for (let i = 0; i < s.packs.length; i++) {
    const p = s.packs[i];
    const price = PACK_INFO[p.kind].price;
    if (p.sold || price > run.money || run.money - price < reserve) continue;
    if (p.kind === 'buffoon' && free > 0) return { type: 'pack', i };
    if (p.kind === 'celestial') return { type: 'pack', i };
  }
  const want = desiredOrder(run);
  for (let k = 0; k < run.jokers.length; k++) {
    if (run.jokers[k].id !== want[k]) {
      const from = run.jokers.findIndex((j, m) => m > k && j.id === want[k]);
      if (from > k) return { type: 'move', i: from, d: -1 };
    }
  }
  if ((free > 0 && run.money >= s.reroll + Math.max(6, reserve)) || run.money >= s.reroll + 30) return { type: 'reroll' };
  return { type: 'next' };
}

function packAction(run: RunState, level: BotLevel): Action {
  const p = run.pack!;
  const focus = focusType(run);
  let best = -1;
  let bv = -1;
  p.opts.forEach((o, i) => {
    let v = 0;
    if (o.kind === 'joker') v = run.jokers.length < run.slots ? (VALUE[o.id] ?? 3) : -1;
    else if (o.kind === 'planet') v = PLANET[o.id].hand === focus ? 10 : (GOOD_TYPES[PLANET[o.id].hand] ?? 0);
    else if (o.kind === 'tarot') v = run.cons.length < run.consSlots && tarotTargets(run, o.id) !== null ? 2 : -1;
    else v = o.card?.enh === 'glass' || o.card?.enh === 'mult' ? 3 : 1;
    if (level === 'greedy') v = v < 0 ? -1 : 1;
    if (v > bv) {
      bv = v;
      best = i;
    }
  });
  return best >= 0 && bv >= 0 ? { type: 'pick', i: best } : { type: 'skip' };
}

/** The next bot action for the current stage. */
export function botAction(run: RunState, level: BotLevel, rnd: () => number = Math.random): Action {
  switch (run.stage) {
    case 'blind':
      return { type: 'start' };
    case 'round':
      return roundAction(run, level, rnd);
    case 'cashout':
      return { type: 'collect' };
    case 'shop':
      return shopAction(run, level, rnd);
    case 'pack':
      return packAction(run, level);
    case 'won':
      return { type: 'end' };
  }
}

export const bossName = (id: string): string => BOSS[id]?.name ?? id;
