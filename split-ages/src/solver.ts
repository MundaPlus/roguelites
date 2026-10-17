/**
 * Phased search over turns. In each phase one hero acts and the other waits.
 * The phase may switch only at the start or right after the active hero causes something
 * (a cause pulse, a kill or a boss hit). This keeps the search small: the state count is close
 * to the sum of both boards, not their product. Every plan it finds is a real, legal plan.
 * - `safe`: least damage first, then fewest turns (bucket queue by damage).
 * - `fast`: fewest turns. Damage only counts when it kills.
 */
import { futHalf, futOptions, pastHalf, pastOptions, stateKey, type Act, type Ev, type FloorDef, type Mods, type St } from './engine';

export interface Plan {
  acts: [Act, Act][];
  dmg: number;
  turns: number;
}

export interface SolveResult {
  plan: Plan | null;
  states: number;
  capped: boolean;
}

interface Node {
  st: St;
  ph: 0 | 1;
  dmg: number;
  turns: number;
  parent: Node | null;
  pa: Act;
  fa: Act;
}

const goal = (st: St): boolean => st.done === 'exit' || st.done === 'boss';

export function solve(def: FloorDef, st0: St, mods: Mods, mode: 'safe' | 'fast' = 'safe', cap = 30000, maxTurns = 60): SolveResult {
  const seen = new Map<string, number>();
  const buckets: Node[][] = [];
  const push = (n: Node): void => {
    const b = mode === 'safe' ? n.dmg : 0;
    (buckets[b] ??= []).push(n);
  };
  const k0 = stateKey(def, st0);
  for (const ph of [0, 1] as const) {
    seen.set(ph + k0, 0);
    push({ st: st0, ph, dmg: 0, turns: 0, parent: null, pa: 'A', fa: 'A' });
  }
  let states = 0;
  const ev: Ev[] = [];
  for (let b = 0; b < buckets.length; b++) {
    const q = buckets[b];
    if (!q) continue;
    for (let qi = 0; qi < q.length; qi++) {
      const n = q[qi];
      if (goal(n.st)) return { plan: unwind(n), states, capped: false };
      if (n.turns >= maxTurns) continue;
      states++;
      if (states > cap) return { plan: null, states, capped: true };
      const moves: [Act, Act][] = n.ph === 0 ? pastOptions(def, n.st).map((a) => [a, 'A']) : futOptions(def, n.st, mods).map((a) => ['A', a]);
      for (const [pa, fa] of moves) {
        ev.length = 0;
        const half = pastHalf(def, n.st, pa, mods, ev);
        const st = half.st;
        // A future move that is no longer legal after the past half becomes a wait.
        futHalf(def, st, fa, mods, ev, half.hit);
        if (st.done === 'dead') continue;
        let taken = 0;
        let caused = false;
        for (const e of ev) {
          if (e.k === 'dmg') {
            if (e.hero) taken += e.n;
            else if (def.boss && e.cell === def.boss.pos) caused = true;
          } else if (e.k === 'cause' || e.k === 'kill') caused = true;
        }
        const dmg = n.dmg + taken;
        const turns = n.turns + 1;
        const phases: (0 | 1)[] = caused ? [n.ph, n.ph === 0 ? 1 : 0] : [n.ph];
        if (goal(st)) {
          const g: Node = { st, ph: n.ph, dmg, turns, parent: n, pa, fa };
          if (mode === 'fast') return { plan: unwind(g), states, capped: false };
          push(g);
          continue;
        }
        const k = stateKey(def, st);
        const cost = mode === 'safe' ? dmg : turns;
        for (const ph of phases) {
          const key = ph + k;
          const old = seen.get(key);
          if (old !== undefined && old <= cost) continue;
          seen.set(key, cost);
          push({ st, ph, dmg, turns, parent: n, pa, fa });
        }
      }
    }
  }
  return { plan: null, states, capped: false };
}

function unwind(n: Node): Plan {
  const acts: [Act, Act][] = [];
  let cur: Node | null = n;
  while (cur && cur.parent) {
    acts.push([cur.pa, cur.fa]);
    cur = cur.parent;
  }
  acts.reverse();
  return { acts, dmg: n.dmg, turns: n.turns };
}

/** Plain flood fill for the future hero with no changes and foes as walls. Used to reject floors that need no past action. */
export function futReach(start: number, isFree: (c: number) => boolean): Set<number> {
  const seen = new Set<number>([start]);
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const x = c % 7;
    for (const d of [c - 7, c + 7, x > 0 ? c - 1 : -1, x < 6 ? c + 1 : -1]) {
      if (d < 0 || d >= 49 || seen.has(d) || !isFree(d)) continue;
      seen.add(d);
      q.push(d);
    }
  }
  return seen;
}
