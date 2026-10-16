/** Bots for the debug API and the balance sim. No DOM here. */
import { Rng } from './rng';
import { doSpin, goEndless, payRent, pickItem, pickSymbol, removeSymbol, reroll, skipPick, type RunState } from './run';
import { spin, type SymInst } from './spin';

/** Average coins per spin over a few short simulated futures. Same seeds for every call, so choices compare fairly. */
export function evalPool(pool: SymInst[], items: string[], seed: number, samples = 4, horizon = 4): number {
  let total = 0;
  for (let s = 0; s < samples; s++) {
    const rng = new Rng(seed + s * 7919);
    let p = pool;
    let uid = 100000;
    for (let h = 0; h < horizon; h++) {
      const res = spin(p, { items, spin: h + 1, firstAfterRent: false, nextUid: uid }, rng);
      total += res.coins;
      p = res.pool;
      uid = res.nextUid;
    }
  }
  return total / (samples * horizon);
}

const ITEM_BONUS: Record<string, number> = { telescope: 1.5, horseshoe: 1.2, hourglass: 4, eraser: 1, savings: 3, echo: 2, fourleaf: 3 };

export type BotKind = 'random' | 'greedy' | 'smart';

export type BotAction =
  | { k: 'spin' }
  | { k: 'remove'; uid: number }
  | { k: 'pick'; i: number }
  | { k: 'skip' }
  | { k: 'reroll' }
  | { k: 'rent' }
  | { k: 'item'; i: number }
  | { k: 'endless' }
  | { k: 'none' };

/** Chooses one bot action for the current phase. Does not change the run. */
export function botDecide(r: RunState, kind: BotKind, rnd: () => number = Math.random): BotAction {
  const seed = Math.floor(rnd() * 1e9);
  switch (r.phase) {
    case 'spin': {
      if (kind === 'smart' && r.removals > 0 && r.pool.length > 1) {
        const base = evalPool(r.pool, r.items, seed);
        let best = 0.25;
        let pick = -1;
        const seen = new Set<string>();
        for (const s of r.pool) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          const v = evalPool(
            r.pool.filter((x) => x !== s),
            r.items,
            seed,
          );
          if (v - base > best) {
            best = v - base;
            pick = s.uid;
          }
        }
        if (pick >= 0) return { k: 'remove', uid: pick };
      }
      return { k: 'spin' };
    }
    case 'pick': {
      if (kind === 'random') return { k: 'pick', i: Math.floor(rnd() * r.offer.length) };
      if (kind === 'greedy') return { k: 'pick', i: 0 };
      const base = evalPool(r.pool, r.items, seed);
      let best = base + 0.05;
      let pick = -1;
      r.offer.forEach((id, i) => {
        const v = evalPool([...r.pool, { uid: 99999, id, n: 0 }], r.items, seed);
        if (v > best) {
          best = v;
          pick = i;
        }
      });
      if (pick >= 0) return { k: 'pick', i: pick };
      return r.rerolls > 1 ? { k: 'reroll' } : { k: 'skip' };
    }
    case 'rent':
      return { k: 'rent' };
    case 'item': {
      if (kind !== 'smart') return { k: 'item', i: Math.floor(rnd() * r.itemOffer.length) };
      let best = -1;
      let pick = 0;
      r.itemOffer.forEach((id, i) => {
        const v = evalPool(r.pool, [...r.items, id], seed) + (ITEM_BONUS[id] ?? 0);
        if (v > best) {
          best = v;
          pick = i;
        }
      });
      return { k: 'item', i: pick };
    }
    case 'won':
      return { k: 'endless' };
    case 'over':
      return { k: 'none' };
  }
}

/** Applies a bot action to the run (for the headless sim). */
export function applyAction(r: RunState, a: BotAction): void {
  switch (a.k) {
    case 'spin':
      doSpin(r);
      break;
    case 'remove':
      removeSymbol(r, a.uid);
      break;
    case 'pick':
      pickSymbol(r, a.i);
      break;
    case 'skip':
      skipPick(r);
      break;
    case 'reroll':
      reroll(r);
      break;
    case 'rent':
      payRent(r);
      break;
    case 'item':
      pickItem(r, a.i);
      break;
    case 'endless':
      goEndless(r);
      break;
  }
}

/** One bot action, applied. Returns its kind. */
export function botStep(r: RunState, kind: BotKind, rnd: () => number = Math.random): string {
  const a = botDecide(r, kind, rnd);
  applyAction(r, a);
  return a.k;
}
