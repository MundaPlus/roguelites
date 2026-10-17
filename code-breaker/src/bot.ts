/** Bots for the debug API and the balance sim. They use the solver with a skill level. */
import type { GearId, ToolId } from './data';
import { candidates, codeAt, phaseNow, toolCost, triesLeft, type Lock } from './lock';
import { Rng } from './rng';
import { allCodes, rotate, scoreAt } from './solver';
import { buy, type Run } from './run';

export interface Skill {
  /** Chance to make a sloppy guess that ignores the hints. */
  err: number;
  /** Pick guesses that split the remaining codes best. */
  smart: boolean;
  /** Use tools and shops well. */
  tools: boolean;
  /** Sim only: never use tools inside a lock. */
  noLockTools?: boolean;
}

/** Guesses from the codes left, but often ignores the hints. No tools. */
export const WEAK: Skill = { err: 0.4, smart: false, tools: false };
/** Same guess skill as WEAK, but uses tools, shops, doors and loot well. */
export const GOOD: Skill = { err: 0.4, smart: false, tools: true };
/** Picks the guess that splits the codes left best. Stronger than most humans. */
export const BEST: Skill = { err: 0, smart: true, tools: true };

/** Picks the next guess for the lock. */
export function botGuess(l: Lock, rng: Rng, s: Skill): number[] {
  const { len, colors, rep } = l.spec;
  const all = allCodes(len, colors, rep);
  const total = all.length / len;
  if (rng.chance(s.err)) return codeAt(l, rng.int(0, total - 1));
  const cands = candidates(l);
  if (!cands.length) return codeAt(l, rng.int(0, total - 1));
  if (!s.smart || cands.length <= 2) return codeAt(l, rng.pick(cands));
  // Sample guesses and score how well each one splits a sample of the codes left.
  const sample = cands.length > 250 ? Array.from({ length: 250 }, () => rng.pick(cands)) : cands;
  const ph = phaseNow(l);
  const eff = sample.map((k) => {
    const c = Array.from(all.subarray(k * len, k * len + len));
    return ph ? rotate(c) : c;
  });
  const flat = Uint8Array.from(eff.flat());
  const tries: number[][] = [];
  for (let i = 0; i < 24; i++) tries.push(codeAt(l, rng.pick(cands)));
  for (let i = 0; i < 12; i++) tries.push(codeAt(l, rng.int(0, total - 1)));
  let best = tries[0];
  let bestV = Infinity;
  const buckets = new Map<number, number>();
  tries.forEach((g, gi) => {
    buckets.clear();
    for (let j = 0; j < eff.length; j++) {
      const [ex, co] = scoreAt(g, flat, j * len);
      const key = ex * 10 + co;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    let v = 0;
    for (const n of buckets.values()) v += n * n;
    // Guesses that can be the code get a small edge.
    if (gi < 24) v *= 0.92;
    if (v < bestV) {
      bestV = v;
      best = g;
    }
  });
  return best;
}

/** A tool the bot wants to use now, or null. */
export function botTool(r: Run, s: Skill): ToolId | null {
  const l = r.lock;
  if (!l || !s.tools || s.noLockTools) return null;
  const left = triesLeft(l);
  const can = (id: ToolId) => r.tools.includes(id) && r.energy >= toolCost(l, id) + (left > 1 ? 4 : 0);
  if (l.guesses.length === 0 && can('purge') && r.energy >= 14) return 'purge';
  if (left <= 2) {
    const n = candidates(l).length;
    if (n <= 1) return null;
    if (left === 1 && can('free') && !l.freeNext) return 'free';
    if (n > 2 && can('reveal')) return 'reveal';
    if (can('purge') && l.removed.length < l.spec.colors - l.spec.len) return 'purge';
  }
  return null;
}

/** Index of the door the bot picks. */
export function botDoor(r: Run, rng: Rng, s: Skill): number {
  if (!s.tools) return rng.int(0, r.doors.length - 1);
  const want = (i: number): number => {
    const d = r.doors[i];
    let v = 0;
    if (d.room === 'shop') v += r.energy >= 12 || r.hearts < r.maxHearts ? 3 : 0;
    if (d.room === 'loot') v += 2;
    if (d.room === 'mystery') v += r.hearts >= 2 ? 2 : 0;
    if (d.spec.mod !== 'none') v -= 1;
    if (d.spec.rep) v -= 0.5;
    return v;
  };
  let best = 0;
  for (let i = 1; i < r.doors.length; i++) if (want(i) > want(best)) best = i;
  return best;
}

const GEAR_RANK: GearId[] = ['charm', 'stetho', 'ledger', 'plating', 'battery', 'echo', 'spark', 'magnifier', 'detector', 'anchor', 'piggy', 'hourglass'];

/** Index of the loot or vault offer the bot takes. */
export function botOffer(r: Run, rng: Rng, s: Skill): number {
  const room = r.room!;
  const n = room.kind === 'loot' || room.kind === 'vault' ? room.offers.length : 1;
  if (!s.tools) return rng.int(0, n - 1);
  if (room.kind !== 'loot' && room.kind !== 'vault') return 0;
  const val = (i: number): number => {
    const w = room.offers[i];
    if (w.kind === 'heal') return r.hearts < r.maxHearts ? (r.hearts === 1 ? 20 : 9) : 0;
    if (w.kind === 'maxheart') return 11;
    if (w.kind === 'energy') return w.n;
    return 14 - GEAR_RANK.indexOf(w.id);
  };
  let best = 0;
  for (let i = 1; i < room.offers.length; i++) if (val(i) > val(best)) best = i;
  return best;
}

/** Buys what the bot wants in a shop. */
export function botShop(r: Run, s: Skill): void {
  const room = r.room;
  if (!room || room.kind !== 'shop' || !s.tools) return;
  for (let k = 0; k < 4; k++) {
    const heal = room.items.findIndex((it) => it.reward.kind === 'heal');
    if (heal >= 0 && r.hearts < r.maxHearts && r.hearts <= 2 && buy(r, heal)) continue;
    const order = room.items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.reward.kind === 'gear' && !it.sold && r.energy >= it.price + 4)
      .sort((a, b) => {
        const ga = a.it.reward.kind === 'gear' ? GEAR_RANK.indexOf(a.it.reward.id) : 99;
        const gb = b.it.reward.kind === 'gear' ? GEAR_RANK.indexOf(b.it.reward.id) : 99;
        return ga - gb;
      });
    if (!order.length || !buy(r, order[0].i)) break;
  }
}

/** Trap choice: pay when the bot can spare the energy. */
export const botTrapPay = (r: Run, s: Skill): boolean => s.tools || r.hearts <= 1;
