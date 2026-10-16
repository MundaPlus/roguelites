/** Bots for tests and the balance sim. They only use visible information. */
import { ENEMIES, SPELLS, spellCost } from './data';
import { canCast, canPlay, cardsLeft, cast, play, plays, potionUsable, targets, top, type Fight } from './game';
import { canBuy, maxSpells, restHeal, upgradable, type Hero, type Pick, type Room, type RunState, type ShopItem } from './run';

export type Action =
  | { k: 'play'; col: number }
  | { k: 'draw' }
  | { k: 'cast'; i: number; target: number }
  | { k: 'potion'; i: number }
  | { k: 'concede' };

const hidden = (f: Fight): number => f.cols.reduce((a, c) => a + c.filter((x) => !x.up).length, 0);

/** Value of the best chain of plays from here. A play that flips a hidden card ends the look-ahead. */
export function chain(f: Fight, depth: number): number {
  if (depth <= 0 || f.over) return f.over === 'win' ? 50 : 0;
  let best = 0;
  const h0 = hidden(f);
  for (const col of plays(f)) {
    const g = play(f, col).f;
    const c = top(f, col)!;
    let v = 1 + (c.bomb ? 2 : 0);
    if (hidden(g) < h0) v += 0.6;
    else v += chain(g, depth - 1);
    if (g.over === 'win') v += 50;
    best = Math.max(best, v);
  }
  return best;
}

function bestPlay(f: Fight): number {
  let best = -1;
  let bv = -1;
  const h0 = hidden(f);
  for (const col of plays(f)) {
    const g = play(f, col).f;
    const c = top(f, col)!;
    let v = 1 + (hidden(g) < h0 ? 0.6 : chain(g, 5)) + (c.bomb ? 3 : 0) + f.cols[col].length * 0.05;
    if (g.over === 'win') v += 50;
    if (v > bv) {
      bv = v;
      best = col;
    }
  }
  return best;
}

const costSum = (f: Fight, i: number): number => {
  const c = spellCost(f.spells[i].id, f.spells[i].lvl);
  return Object.values(c).reduce((a, b) => a + (b ?? 0), 0);
};

const spellIdx = (f: Fight, id: string): number => f.spells.findIndex((s) => s.id === id);

/** Which enemy attacks land next turn. */
function threat(f: Fight): number {
  let t = 0;
  ENEMIES[f.enemy].abilities.forEach((a, i) => {
    if (f.timers[i] <= 1 && (a.k === 'strike' || a.k === 'wound')) t += a.n;
  });
  for (const c of f.cols.flat()) if (c.bomb === 1) t += c.bombDmg ?? 0;
  return t;
}

/** All casts the bot can consider, with their targets. */
function castOptions(f: Fight): { i: number; target: number }[] {
  const out: { i: number; target: number }[] = [];
  f.spells.forEach((s, i) => {
    if (!canCast(f, i)) return;
    const t = SPELLS[s.id].target;
    if (t === 'dir') out.push({ i, target: -1 }, { i, target: 1 });
    else if (t === 'top') for (const c of targets(f, s.id)) out.push({ i, target: c });
    else out.push({ i, target: 0 });
  });
  return out;
}

/** A good bot: plays the longest visible chain and uses spells to stay alive. */
export function smartAction(f: Fight): Action {
  if (f.over) return { k: 'concede' };
  // Emergency potions.
  const pot = (id: string): number => f.potions.findIndex((p, i) => p === id && potionUsable(f, i));
  if (f.hp <= f.maxHp * 0.35 && pot('elixir') >= 0) return { k: 'potion', i: pot('elixir') };
  if (f.stock.length <= 2 && pot('pack') >= 0) return { k: 'potion', i: pot('pack') };

  // Support spells.
  const want = (id: string, ok: boolean): Action | null => {
    const i = spellIdx(f, id);
    return i >= 0 && ok && canCast(f, i) ? { k: 'cast', i, target: 0 } : null;
  };
  const special = f.cols.flat().filter((c) => c.lock || c.armor || c.bomb).length;
  const support =
    want('bulwark', f.shield < 2 && threat(f) >= 2) ??
    want('shatter', special >= 3) ??
    want('mend', f.stock.length <= 5) ??
    want('rejuv', f.hp <= f.maxHp - 6) ??
    want('frost', threat(f) >= 4) ??
    want('sight', hidden(f) >= 6) ??
    want('prism', f.mana.g >= 4);
  if (support) return support;

  const playCol = bestPlay(f);
  const left = cardsLeft(f);

  // Score every cast by what it opens up.
  let best: Action | null = null;
  let bv = 0;
  const base = playCol >= 0 ? chain(f, 5) : 0;
  for (const o of castOptions(f)) {
    const id = f.spells[o.i].id;
    if (['bulwark', 'shatter', 'mend', 'rejuv', 'frost', 'sight', 'prism', 'smoke'].includes(id)) continue;
    if (id === 'haste' && playCol >= 0) continue;
    const g = cast(f, o.i, o.target).f;
    if (g === f) continue;
    let v = (left - cardsLeft(g)) * 1.1 + chain(g, 5) - base;
    if (id === 'haste') v = 1.5;
    if (g.over === 'win') v += 50;
    v -= costSum(f, o.i) * (playCol >= 0 ? 0.45 : 0.15);
    if (v > bv) {
      bv = v;
      best = { k: 'cast', i: o.i, target: o.target };
    }
  }
  if (best && (playCol < 0 || bv > 0.5)) return best;
  if (playCol >= 0) return { k: 'play', col: playCol };

  if (pot('wildpot') >= 0) return { k: 'potion', i: pot('wildpot') };
  if (pot('flask') >= 0 && castOptions(f).length === 0) return { k: 'potion', i: pot('flask') };
  const smoke = want('smoke', f.stock.length >= 2 && f.free === 0 && threat(f) > 0);
  if (smoke) return smoke;
  if (f.stock.length) return { k: 'draw' };
  if (pot('pack') >= 0) return { k: 'potion', i: pot('pack') };
  return { k: 'concede' };
}

/** A weak bot: random plays, rare random spells. */
export function weakAction(f: Fight, rnd: () => number): Action {
  const ps = plays(f);
  if (rnd() < 0.15) {
    const opts = castOptions(f);
    if (opts.length) {
      const o = opts[Math.floor(rnd() * opts.length)];
      return { k: 'cast', i: o.i, target: o.target };
    }
  }
  if (ps.length) return { k: 'play', col: ps[Math.floor(rnd() * ps.length)] };
  if (f.stock.length) return { k: 'draw' };
  return { k: 'concede' };
}

/** Check that an action is still valid (the UI uses this before it runs a bot action). */
export function valid(f: Fight, a: Action): boolean {
  if (a.k === 'play') return canPlay(f, a.col);
  if (a.k === 'cast') return canCast(f, a.i);
  if (a.k === 'potion') return potionUsable(f, a.i);
  if (a.k === 'draw') return f.stock.length > 0;
  return true;
}

// ---------- Run-level choices ----------

export function chooseRoom(run: RunState, rooms: Room[]): Room {
  const h = run.hero;
  if (rooms.includes('rest') && h.hp < h.maxHp * 0.65) return 'rest';
  if (rooms.includes('shop') && h.gold >= 60) return 'shop';
  if (rooms.includes('treasure')) return 'treasure';
  if (rooms.includes('elite') && h.hp >= h.maxHp * 0.7) return 'elite';
  if (rooms.includes('rest')) return 'rest';
  return rooms.find((r) => r !== 'elite') ?? rooms[0];
}

const GOOD_SPELLS = ['joker', 'nudge', 'meteor', 'cleave', 'fireball', 'quake', 'haste', 'sleight', 'shatter', 'mend', 'longshot', 'bulwark', 'frost'];

export function choosePick(h: Hero, picks: Pick[]): number {
  const score = (p: Pick): number => {
    if (p.kind === 'spell') return 10 - Math.max(0, GOOD_SPELLS.indexOf(p.id)) * 0.5 - (h.spells.length >= maxSpells(h) ? 20 : 0);
    if (p.kind === 'upgrade') return 6;
    if (p.kind === 'deck') return 7;
    if (p.kind === 'potion') return 5;
    if (p.kind === 'relic') return 9;
    return h.hp < h.maxHp * 0.5 ? 7 : 4;
  };
  let best = 0;
  picks.forEach((p, i) => {
    if (score(p) > score(picks[best])) best = i;
  });
  return best;
}

/** Shop items the bot buys, in order. */
export function shopWish(run: RunState, items: ShopItem[]): number {
  const h = run.hero;
  const order: ShopItem['kind'][] = h.hp < h.maxHp * 0.5 ? ['heal', 'relic', 'spell', 'deck', 'upgrade', 'potion'] : ['relic', 'spell', 'deck', 'upgrade', 'heal', 'potion'];
  for (const kind of order) {
    const i = items.findIndex((it) => it.kind === kind && canBuy(run, it));
    if (i >= 0) return i;
  }
  return -1;
}

export const restChoice = (h: Hero): 'heal' | 'upgrade' => (restHeal(h) >= 6 || upgradable(h).length === 0 ? 'heal' : 'upgrade');
