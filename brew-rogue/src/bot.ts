/** Bots for the sim and the debug API. They choose one action at a time from the run state. */
import { applyStep, solve, type Solution, type Stock } from './brew';
import { INGREDIENTS, MAPS, PLACES, type MapId } from './data';
import type { Rng } from './rng';
import {
  MAX_ACTIVE,
  accept,
  bottle,
  brewAdd,
  brewSalt,
  buy,
  daysToDebt,
  debtNow,
  deliver,
  dropBrew,
  endDay,
  fits,
  gather,
  mapsWith,
  potionFor,
  sellPotion,
  startBrew,
  type Order,
  type RunState,
} from './run';

export type BotAct =
  | { t: 'deliver'; order: number; potion: number }
  | { t: 'accept'; order: number }
  | { t: 'sell'; potion: number }
  | { t: 'brew'; order: number; map: MapId; sol: Solution }
  | { t: 'gather'; place: string }
  | { t: 'end' };

export function stockOf(run: RunState, budget: number): Stock {
  const buy: Stock['buy'] = {};
  for (const w of run.market) if (w.qty > 0) buy[w.id] = { qty: w.qty, price: w.price };
  return { have: { ...run.inv }, buy, salts: { ...run.salts }, gold: Math.max(0, budget) };
}

const cache = new Map<string, { map: MapId; sol: Solution } | null>();

/** The cheapest plan for an order over the open maps. */
export function bestPlan(run: RunState, o: Order, budget: number, beam = 30): { map: MapId; sol: Solution } | null {
  const stock = stockOf(run, budget);
  const key = `${run.seed}|${run.day}|${run.hours}|${o.id}|${budget}|${JSON.stringify(stock.have)}|${JSON.stringify(stock.salts)}|${run.market.map((w) => w.qty).join()}`;
  if (cache.has(key)) return cache.get(key)!;
  let best: { map: MapId; sol: Solution } | null = null;
  for (const map of mapsWith(run, o.effect)) {
    const sol = solve(map, o.effect, o.strength, stock, { beam });
    if (!sol) continue;
    const val = sol.strength * 8 - sol.cost - Object.values(sol.uses).reduce((a, b) => a + b, 0) * 3;
    const bv = best ? best.sol.strength * 8 - best.sol.cost - Object.values(best.sol.uses).reduce((a, b) => a + b, 0) * 3 : -Infinity;
    if (val > bv) best = { map, sol };
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, best);
  return best;
}

/** Gold the bot keeps back for the debt. */
function reserve(run: RunState): number {
  const left = daysToDebt(run.day);
  return left <= 1 ? debtNow(run) * (left === 0 ? 1 : 0.6) : 0;
}

export function smartNext(run: RunState): BotAct {
  // 1. Deliver what we can.
  for (const o of run.active) {
    const p = potionFor(run, o);
    if (p >= 0) return { t: 'deliver', order: o.id, potion: p };
  }
  // 2. Sell potions that no order needs.
  for (let i = 0; i < run.potions.length; i++) {
    const p = run.potions[i];
    if (!run.active.some((o) => fits(p, o))) return { t: 'sell', potion: i };
  }
  const spare = run.gold - reserve(run);
  // 3. Accept good orders while there is room.
  const open = run.board.filter((o) => !o.rival).sort((a, b) => b.price - a.price);
  const pending = run.active.filter((o) => potionFor(run, o) < 0).length;
  if (run.active.length < MAX_ACTIVE && pending < 3) {
    for (const o of open) {
      const plan = bestPlan(run, o, Math.max(spare, 0));
      if (plan && plan.sol.cost < o.price * 0.8) return { t: 'accept', order: o.id };
    }
  }
  // 4. Brew for the most urgent order.
  if (run.hours >= 1) {
    const todo = run.active.filter((o) => potionFor(run, o) < 0).sort((a, b) => a.due - b.due || b.price - a.price);
    for (const o of todo) {
      const plan = bestPlan(run, o, Math.max(spare, 0));
      if (plan) return { t: 'brew', order: o.id, map: plan.map, sol: plan.sol };
    }
  }
  // 5. Gather when nothing else is useful.
  if (run.hours >= 2) return { t: 'gather', place: run.gold > 120 ? 'swamp' : 'woods' };
  return { t: 'end' };
}

/** A weak bot: accepts the first orders and brews random ingredients. */
export function weakNext(run: RunState, rng: Rng): BotAct {
  for (const o of run.active) {
    const p = potionFor(run, o);
    if (p >= 0) return { t: 'deliver', order: o.id, potion: p };
  }
  if (run.potions.length > 2) return { t: 'sell', potion: 0 };
  const open = run.board.filter((o) => !o.rival);
  if (open.length && run.active.length < 2) return { t: 'accept', order: open[0].id };
  if (run.hours >= 1 && run.active.length) {
    const o = run.active[0];
    const map = mapsWith(run, o.effect)[0] ?? 'water';
    // Random sequence of 1-3 owned or cheap ingredients, stir all, bottle where it ends.
    const plan: Solution['plan'] = [];
    const purchase: Record<string, number> = {};
    const uses: Record<string, number> = {};
    const have = { ...run.inv };
    let gold = run.gold;
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const owned = Object.keys(have).filter((id) => have[id] > 0);
      let id: string;
      if (owned.length && rng.chance(0.6)) {
        id = rng.pick(owned);
        have[id]--;
        uses[id] = (uses[id] ?? 0) + 1;
      } else {
        const w = run.market.find((x) => x.qty > (purchase[x.id] ?? 0) && x.price <= gold);
        if (!w) break;
        id = w.id;
        gold -= w.price;
        purchase[id] = (purchase[id] ?? 0) + 1;
      }
      plan.push({ t: 'add', id, grind: rng.pick([0.5, 0.75, 1]) }, { t: 'stir', d: 9999 });
    }
    plan.push({ t: 'bottle' });
    if (plan.length > 1) return { t: 'brew', order: o.id, map, sol: { plan, strength: 0, cost: run.gold - gold, purchase, uses } };
  }
  if (run.hours >= 2 && rng.chance(0.5)) return { t: 'gather', place: rng.pick(Object.keys(PLACES)) };
  return { t: 'end' };
}

/** Ingredients a plan still needs to buy, given the current inventory. */
export function toBuy(run: RunState, sol: Solution): string[] {
  const need: Record<string, number> = {};
  for (const s of sol.plan) if (s.t === 'add') need[s.id] = (need[s.id] ?? 0) + 1;
  const out: string[] = [];
  for (const [id, n] of Object.entries(need)) for (let i = run.inv[id] ?? 0; i < n; i++) out.push(id);
  return out;
}

export const ingName = (id: string): string => `${INGREDIENTS[id].icon} ${INGREDIENTS[id].name}`;
export const mapName = (m: MapId): string => `${MAPS[m].icon} ${MAPS[m].name}`;

/** Apply a bot action directly to the run (used by the headless sim). */
export function applyAct(run: RunState, act: BotAct): void {
  switch (act.t) {
    case 'deliver':
      deliver(run, act.order, act.potion);
      return;
    case 'accept':
      accept(run, act.order);
      return;
    case 'sell':
      sellPotion(run, act.potion);
      return;
    case 'gather':
      gather(run, act.place);
      return;
    case 'end':
      endDay(run);
      return;
    case 'brew': {
      for (const id of toBuy(run, act.sol)) if (!buy(run, id)) return void endDay(run);
      startBrew(run, act.map, act.order);
      for (const s of act.sol.plan) {
        if (!run.brew) break;
        if (s.t === 'add') brewAdd(run, s.id, s.grind);
        else if (s.t === 'salt') brewSalt(run, s.id);
        else if (s.t === 'bottle') {
          if (!bottle(run)) dropBrew(run);
        } else applyStep(run.brew, s);
      }
      if (run.brew) dropBrew(run);
    }
  }
}
