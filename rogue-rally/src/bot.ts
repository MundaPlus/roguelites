/** Simple bots for the debug API and the balance sim. They act on the run state only. */
import { PART_BY_ID, type Slot } from './data';
import { MAX_TUNE, fullRepairCost, makeShop, playerStats, type MapNode, type PitChoice, type RunState } from './run';
import type { Rng } from './rng';

const SLOT_VALUE: Record<Slot, number> = { engine: 1.3, tires: 1.2, nitro: 1, armor: 0.9, gadget: 0.6 };

/** How much a part improves the car (0 or less = not worth it). */
export function partValue(run: RunState, id: string): number {
  const p = PART_BY_ID[id];
  const cur = run.parts[p.slot];
  const curR = cur ? PART_BY_ID[cur].rarity : 0;
  return (p.rarity - curR) * SLOT_VALUE[p.slot];
}

export function chooseNode(run: RunState, nodes: MapNode[], smart: boolean, rng: Rng): number {
  if (!smart) return rng.int(0, nodes.length - 1);
  const max = playerStats(run).hp;
  const idx = (k: string) => nodes.findIndex((n) => n.kind === k);
  if (idx('pit') >= 0 && (run.hp < max * 0.55 || run.strikes > 0)) return idx('pit');
  if (idx('shop') >= 0 && run.money >= 120) return idx('shop');
  if (idx('pit') >= 0) return idx('pit');
  if (idx('race') >= 0) return idx('race');
  return 0;
}

export function choosePick(run: RunState, picks: string[], smart: boolean, rng: Rng): number {
  if (!picks.length) return -1;
  if (!smart) return rng.int(0, picks.length - 1);
  let best = -1;
  let bv = 0;
  picks.forEach((id, i) => {
    const v = partValue(run, id);
    if (v > bv) {
      bv = v;
      best = i;
    }
  });
  return best;
}

/** Shop actions as item indexes to buy, in order. */
export function shopPlan(run: RunState, smart: boolean, rng: Rng): number[] {
  const items = makeShop(run);
  const out: number[] = [];
  const max = playerStats(run).hp;
  if (!smart) {
    const i = rng.int(0, items.length - 1);
    return [i];
  }
  if (run.hp < max * 0.7) {
    const full = items.findIndex((x) => x.kind === 'full');
    if (fullRepairCost(run) <= run.money) out.push(full);
  }
  let money = run.money - (out.length ? fullRepairCost(run) : 0);
  const parts = items
    .map((it, i) => ({ it, i }))
    .filter((x) => x.it.kind === 'part' && !x.it.sold)
    .map((x) => ({ ...x, v: x.it.kind === 'part' ? partValue(run, x.it.id) : 0 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  const slots = new Set<string>();
  for (const x of parts) {
    if (x.it.kind !== 'part') continue;
    const slot = PART_BY_ID[x.it.id].slot;
    if (x.it.cost <= money && !slots.has(slot)) {
      out.push(x.i);
      money -= x.it.cost;
      slots.add(slot);
    }
  }
  return out;
}

export function pitChoice(run: RunState, smart: boolean, rng: Rng): PitChoice {
  if (!smart) return rng.pick(['repair', 'tune', 'clean'] as PitChoice[]);
  if (run.strikes > 0) return 'clean';
  if (run.hp < playerStats(run).hp * 0.75 || run.tune >= MAX_TUNE) return 'repair';
  return 'tune';
}
