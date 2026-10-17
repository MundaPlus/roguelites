/**
 * Bot player for tests and the balance sim.
 * It solves with the line solver, but with chance `err` per step it guesses a cell instead.
 */
import { MONSTERS } from './data';
import { canCast } from './game';
import { bestDeduction, cellsOfLine, lineCount, mistakeDmg, randomUnknown, type Puzzle } from './puzzle';
import { Rng } from './rng';
import type { RunState } from './run';

export type BotAction =
  | { t: 'door'; i: number }
  | { t: 'line'; fills: number[]; empties: number[] }
  | { t: 'paint'; cells: number[] }
  | { t: 'cast'; id: string; target: number }
  | { t: 'pick'; charm: string | null }
  | { t: 'buy'; i: number }
  | { t: 'pray' }
  | { t: 'vault'; charm: string }
  | { t: 'leave' };

export interface BotOpts {
  /** Chance per painted cell to paint a wrong cell of the same line instead. */
  slip: number;
  /** Chance per step (for a 10×10 grid) to get stuck and guess. */
  stuck: number;
  smart: boolean;
}

const lineWithUnknown = (p: Puzzle): number => {
  let best = -1;
  let bestN = 0;
  for (let li = 0; li < lineCount(p); li++) {
    const n = cellsOfLine(p, li).filter((i) => p.cells[i] === 0 || p.cells[i] === 2).length;
    if (n > bestN) {
      bestN = n;
      best = li;
    }
  }
  return best;
};

function puzzleAction(run: RunState, p: Puzzle, rng: Rng, o: BotOpts): BotAction {
  const danger = run.hp <= mistakeDmg(p) && p.ward === 0;
  if (o.smart && run.hp <= Math.max(3, mistakeDmg(p)) && canCast(run, 'mend')) return { t: 'cast', id: 'mend', target: -1 };
  const d = bestDeduction(p);
  if (o.smart && run.mana >= run.maxMana - 1 && canCast(run, 'reveal')) return { t: 'cast', id: 'reveal', target: lineWithUnknown(p) };
  if (!rng.chance((o.stuck * p.w) / 10) && d) {
    for (const f of d.fills) {
      if (!rng.chance(o.slip)) continue;
      // A slip: paint a wrong cell of the same line.
      const line = cellsOfLine(p, d.line);
      const wrong = line.filter((i) => p.sol[i] === '0' && (p.cells[i] === 0 || p.cells[i] === 2));
      if (wrong.length) return { t: 'paint', cells: [rng.pick(wrong)] };
      void f;
    }
    return { t: 'line', fills: d.fills, empties: d.empties };
  }
  // A guess.
  if (o.smart) {
    if (canCast(run, 'insight') && danger) return { t: 'cast', id: 'insight', target: -1 };
    if (canCast(run, 'peek')) {
      const c = randomUnknown(p, rng);
      if (c !== null) return { t: 'cast', id: 'peek', target: c };
    }
    if (danger && canCast(run, 'reveal')) return { t: 'cast', id: 'reveal', target: lineWithUnknown(p) };
    if (danger && d) return { t: 'line', fills: d.fills, empties: d.empties };
  }
  const c = randomUnknown(p, rng);
  if (c !== null) return { t: 'paint', cells: [c] };
  if (d) return { t: 'line', fills: d.fills, empties: d.empties };
  return { t: 'cast', id: 'reveal', target: lineWithUnknown(p) };
}

function doorScore(run: RunState, i: number): number {
  const d = run.doors[i];
  const low = run.hp <= run.maxHp * 0.5;
  switch (d.kind) {
    case 'shrine':
      return low ? 100 : run.hp < run.maxHp - 4 ? 40 : 5;
    case 'vault':
      return 80;
    case 'shop':
      return run.gold >= 22 || (low && run.gold >= 6) ? 60 : 5;
    case 'monster':
      return low ? 15 - MONSTERS[d.pic!].dmg * 3 : 32 - MONSTERS[d.pic!].dmg * 2;
    case 'chest':
      return 36;
    case 'mystery':
      return 34;
    case 'key':
      return 28;
    case 'rune':
      return 24;
    default:
      return 50;
  }
}

export function botAction(run: RunState, rng: Rng, o: BotOpts): BotAction {
  const room = run.room;
  if (!room) {
    if (!o.smart) return { t: 'door', i: rng.int(0, run.doors.length - 1) };
    let best = 0;
    for (let i = 1; i < run.doors.length; i++) if (doorScore(run, i) > doorScore(run, best)) best = i;
    return { t: 'door', i: best };
  }
  const p = room.puzzle;
  if (p && !p.solved) return puzzleAction(run, p, rng, o);
  if (room.reward && !room.reward.picked) return { t: 'pick', charm: room.reward.charms[0] ?? null };
  if (room.door.kind === 'shrine' && !room.used) return { t: 'pray' };
  if (room.door.kind === 'vault' && !room.used && run.keys > 0) return { t: 'vault', charm: room.choices[0] };
  if (room.shop) {
    const items = room.shop;
    const can = (id: string): number => items.findIndex((it) => it.id === id && !it.sold && it.cost <= run.gold);
    if (o.smart) {
      if (run.hp <= run.maxHp - 4 && can('heal') >= 0) return { t: 'buy', i: can('heal') };
      if (can('charm') >= 0) return { t: 'buy', i: can('charm') };
      if (can('maxhp') >= 0) return { t: 'buy', i: can('maxhp') };
      if (run.mana < 4 && can('mana') >= 0) return { t: 'buy', i: can('mana') };
    } else if (run.hp < run.maxHp && can('heal') >= 0) return { t: 'buy', i: can('heal') };
  }
  return { t: 'leave' };
}
