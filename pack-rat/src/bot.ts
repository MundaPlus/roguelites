/** Shop bots for the debug API and the balance sim. Each call returns one action. */
import { simulate } from './battle';
import { ITEMS } from './data';
import { bestBagSpot, bestItemSpot, freeCells, isBag, randomItemSpot } from './grid';
import { Rng, hash } from './rng';
import { REROLL_COST, buy, heroFighter, isBossRound, makeGhost, move, reroll, sell, type RunState } from './run';

export type BotAction = 'buy' | 'place' | 'sell' | 'reroll' | 'fight';

/** Fight power of the current build against 3 reference ghosts of this round. */
export function power(run: RunState): number {
  let p = 0;
  for (let i = 0; i < 3; i++) {
    const foe = makeGhost(`ref${i}`, run.round, isBossRound(run));
    const r = simulate(heroFighter(run), foe, hash('ref', i, run.round), false);
    // No frames are kept, so judge by the win flag and the ticks.
    p += r.win ? 2 + (600 - r.ticks) / 600 : r.ticks / 600;
  }
  return p;
}

const clone = (run: RunState): RunState => JSON.parse(JSON.stringify(run)) as RunState;

/** Smart bot: tries each affordable item, keeps the one that raises power most per gold. */
export function smartAction(run: RunState): BotAction {
  // Place stash items that fit.
  for (const s of run.stash) {
    const spot = isBag(s.id) ? bestBagSpot(run.board, s.id) : bestItemSpot(run.board, s.id);
    if (spot && move(run, s.uid, spot.x, spot.y, spot.rot)) return 'place';
  }
  if (run.stash.length) {
    sell(run, run.stash[0].uid);
    return 'sell';
  }
  const base = power(run);
  let best = -1;
  let bestGain = 0;
  run.shop.forEach((s, i) => {
    if (s.sold) return;
    const d = ITEMS[s.id];
    if (d.price > run.gold) return;
    if (isBag(s.id)) {
      if (freeCells(run.board) < 4) {
        const gain = 0.4 / d.price + 0.01;
        if (gain > bestGain) [best, bestGain] = [i, gain];
      }
      return;
    }
    const t = clone(run);
    const got = buy(t, i, 'best');
    if (!got || t.stash.length) return;
    const gain = (power(t) - base) / d.price;
    if (gain > bestGain) [best, bestGain] = [i, gain];
  });
  if (best >= 0) {
    buy(run, best, 'best');
    return 'buy';
  }
  if (run.gold >= REROLL_COST + 3 && run.rerolls < 4) {
    reroll(run);
    return 'reroll';
  }
  return 'fight';
}

/** Weak bot: buys random affordable things and drops them anywhere. */
export function weakAction(run: RunState, rng: Rng): BotAction {
  const open = run.shop.map((_, i) => i).filter((i) => !run.shop[i].sold && ITEMS[run.shop[i].id].price <= run.gold);
  if (!open.length) return 'fight';
  const i = rng.pick(open);
  const got = buy(run, i, 'random', rng);
  if (!got) return 'fight';
  if (run.stash.length) {
    const s = run.stash[0];
    const spot = isBag(s.id) ? bestBagSpot(run.board, s.id, rng) : randomItemSpot(run.board, s.id, rng);
    if (!spot || !move(run, s.uid, spot.x, spot.y, spot.rot)) sell(run, s.uid);
  }
  return 'buy';
}
