/** Bots for the debug API and the balance sim. They search the word list for words the grid can spell. */
import { formable } from './dict';
import { alive, def, preview, tilesFor, usable, type Fight, type Hero } from './fight';
import type { Rng } from './rng';

export interface BotMove {
  sel: number[];
  target: number;
  dmg: number;
}

function value(h: Hero, f: Fight, sel: number[]): number {
  const p = preview(h, f, sel);
  return p.dmg + p.heal * 1.2 + p.block * 0.8 + p.poison * 1.5 + p.delay * 4 + p.gold * 0.3 + sel.filter((i) => f.grid[i].poison).length * 2;
}

/** Smart bot: the word with the best value, aimed at the enemy it can kill or the weakest one.
 * With `seen`, it only looks at that many random words of up to `maxLen` tiles (like a player who spots some words, not all). */
export function bestMove(h: Hero, f: Fight, seen = 0, rng?: Rng, maxLen = 99): BotMove | null {
  const letters = f.grid.filter(usable).map((t) => t.ch);
  let best: number[] | null = null;
  let bv = -1;
  let words = formable(letters).filter((w) => w.length <= maxLen);
  if (seen && rng) words = rng.shuffle(words).slice(0, seen);
  for (const tok of words) {
    const sel = tilesFor(f, tok);
    if (!sel) continue;
    const v = value(h, f, sel);
    if (v > bv) {
      bv = v;
      best = sel;
    }
  }
  if (!best) return null;
  const dmg = preview(h, f, best).dmg;
  const foes = alive(f);
  const threat = (e: (typeof foes)[number]): number => e.atk / def(e).timer + (e.wait <= 1 ? e.atk : 0);
  const killable = foes.filter((e) => e.hp + e.block <= dmg);
  let target = foes[0];
  if (killable.length) target = killable.reduce((a, b) => (threat(b) > threat(a) ? b : a));
  else target = foes.reduce((a, b) => (b.hp + b.block < a.hp + a.block ? b : a));
  return { sel: best, target: target.uid, dmg };
}

/** Weak bot: a random word, aimed at the first enemy. */
export function randomMove(h: Hero, f: Fight, rng: Rng): BotMove | null {
  const letters = f.grid.filter(usable).map((t) => t.ch);
  const all = formable(letters);
  if (!all.length) return null;
  const sel = tilesFor(f, rng.pick(all));
  if (!sel) return null;
  return { sel, target: alive(f)[0].uid, dmg: preview(h, f, sel).dmg };
}

/** The potion the smart bot drinks now, or -1. */
export function botPotion(h: Hero, f: Fight): number {
  const foes = alive(f);
  const incoming = foes.filter((e) => e.wait <= 1).reduce((a, e) => a + e.atk, 0);
  for (let i = 0; i < h.potions.length; i++) {
    const p = h.potions[i];
    if (p === 'heal' && h.hp < h.maxHp * 0.4) return i;
    if (p === 'time' && incoming >= h.hp * 0.5 + f.block) return i;
    if (p === 'water' && f.grid.filter((t) => t.lock || t.crack || t.poison).length >= 4) return i;
    if ((p === 'fire' || p === 'muse') && f.kind !== 'fight') return i;
  }
  return -1;
}
