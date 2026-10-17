/** Turn drivers and bots. Used by the app, the debug API and the sim. */
import {
  actOptions,
  allies,
  apply,
  endPlayerTurn,
  enemyOrder,
  evalFor,
  MAX_ROUNDS,
  planUnit,
  reach,
  startTurn,
  unitById,
  type Action,
  type AiCfg,
  type Battle,
  type Result,
} from './beam';
import type { Rng } from './rng';
import { KINDS } from './data';
import { MAX_SKILLS, type RunState } from './run';

/**
 * Everything after the player presses End turn: sway flip, enemy actions, then the start of the next player turn.
 * Returns each step so the app can animate them one by one.
 */
export function enemyPhase(b0: Battle, cfg: AiCfg): { steps: Result[]; b: Battle } {
  const steps: Result[] = [];
  const first = endPlayerTurn(b0);
  steps.push(first);
  let b = startTurn(first.b, 'enemy');
  for (const id of enemyOrder(b)) {
    if (b.over) break;
    if (!unitById(b, id)) continue;
    for (const a of planUnit(b, id, cfg)) {
      if (b.over || !unitById(b, id)) break;
      const r = apply(b, a);
      steps.push(r);
      b = r.b;
    }
  }
  if (!b.over) {
    b = startTurn(b, 'ally');
    b.round++;
    // Safety net against stalemates: after the last round the enemies give up.
    if (b.round > MAX_ROUNDS) b.over = 'win';
  }
  return { steps, b };
}

/** All single player actions (moves and acts) for units that are not done. */
export function playerActions(b: Battle): Action[] {
  const out: Action[] = [];
  for (const u of allies(b)) {
    if (u.acted) continue;
    for (const to of reach(b, u)) out.push({ t: 'move', id: u.id, to });
    for (const a of actOptions(b, u)) out.push(a);
  }
  return out;
}

/** Random bot: random legal actions, then end the turn. */
export function randomTurn(b: Battle, rng: Rng): Action[] {
  const out: Action[] = [];
  let cur = b;
  for (let i = 0; i < 12 && !cur.over; i++) {
    const opts = playerActions(cur);
    if (!opts.length || rng.chance(0.1)) break;
    const a = rng.pick(opts);
    out.push(a);
    cur = apply(cur, a).b;
  }
  return out;
}

/**
 * Preview bot: for each unit it tries every move + act pair with the preview and scores the result.
 * With `look`, it also plays out the enemy turn for the best few plans and keeps the safest.
 */
export function smartTurn(b: Battle, cfg?: AiCfg, look = 3): Action[] {
  const out: Action[] = [];
  let cur = b;
  const future = (x: Battle): number => {
    if (x.over || !cfg) return evalFor(x, 'ally');
    return evalFor(enemyPhase(x, cfg).b, 'ally');
  };
  for (let guard = 0; guard < 8 && !cur.over; guard++) {
    const cands: { plan: Action[]; s: number; b: Battle }[] = [];
    for (const u of allies(cur)) {
      if (u.acted) continue;
      const starts: (number | null)[] = [null, ...reach(cur, u)];
      for (const to of starts) {
        let b1 = cur;
        const pre: Action[] = [];
        if (to !== null) {
          const mv: Action = { t: 'move', id: u.id, to };
          b1 = apply(cur, mv).b;
          pre.push(mv);
        }
        const u1 = unitById(b1, u.id);
        if (!u1 || b1.over) {
          cands.push({ plan: pre, s: evalFor(b1, 'ally'), b: b1 });
          continue;
        }
        for (const a of actOptions(b1, u1)) {
          const b2 = apply(b1, a).b;
          cands.push({ plan: [...pre, a], s: evalFor(b2, 'ally') - (a.t === 'brace' ? 0.5 : 0), b: b2 });
        }
      }
    }
    if (!cands.length) break;
    cands.sort((p, q) => q.s - p.s);
    let best = cands[0];
    let bestS = best.s;
    if (cfg && look > 0) {
      bestS = -Infinity;
      for (const c of cands.slice(0, look)) {
        const s = c.s * 0.3 + future(c.b);
        if (s > bestS) {
          bestS = s;
          best = c;
        }
      }
      // Ending the turn now is also an option.
      if (future(cur) + evalFor(cur, 'ally') * 0.3 > bestS + 2) break;
    } else if (best.s < evalFor(cur, 'ally') - 4) break;
    for (const a of best.plan) {
      out.push(a);
      cur = apply(cur, a).b;
    }
  }
  return out;
}

/** Bot reward choice: a unit while the party has room, else an item, else the first offer. Shared by the debug API and the sim. */
export function botReward(r: RunState): number {
  const unit = r.offers.findIndex((w) => w.t === 'unit');
  if (unit >= 0) return unit;
  const item = r.offers.findIndex((w) => w.t === 'item');
  return item >= 0 ? item : 0;
}

/** Bot teach choice: the first unit that can learn the skill, or -1 to skip. */
export function botTeach(r: RunState): number {
  for (let i = 0; i < r.party.length; i++) {
    const m = r.party[i];
    if (r.teach && m.skills.length < MAX_SKILLS && !m.skills.includes(r.teach) && !KINDS[m.kind].skills.includes(r.teach)) return i;
  }
  return -1;
}
