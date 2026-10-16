import { BUY_COST, CRITTERS, FOOD, FOOD_COST, TEAM_SIZE, levelOf, type Unit } from './data';
import type { Rng } from './rng';
import { apply, canMerge, type Act, type RunState } from './run';

export type BotStyle = 'weak' | 'good' | 'opp';

/** Rough worth of a critter for the bots. */
export function worth(u: Unit): number {
  const d = CRITTERS[u.id];
  return u.atk + u.hp + 3 * d.tier + 3 * (levelOf(u.xp) - 1) + (u.perk ? 2 : 0);
}

/** Line order key: high goes to the front. */
function frontKey(u: Unit): number {
  const t = CRITTERS[u.id].trigger;
  let k = u.hp + u.atk * 0.8;
  if (t === 'faint' || u.perk === 'honey' || u.perk === 'mush' || u.perk === 'melon') k += 4;
  if (t === 'start' || t === 'endturn' || t === 'summon') k -= 4;
  if (t === 'hurt') k += 2;
  return k;
}

function wantedOrder(team: Unit[]): Unit[] {
  return [...team].sort((a, b) => frontKey(b) - frontKey(a) || a.uid - b.uid);
}

function foodTarget(run: RunState, id: string): number | undefined {
  const t = run.team;
  if (!t.length) return undefined;
  const f = FOOD[id];
  if (!f.target) return 0;
  const order = wantedOrder(t);
  if (f.perk === 'melon' || f.perk === 'shell' || f.perk === 'honey' || f.perk === 'bone' || f.perk === 'chili') {
    const front = order.find((u) => !u.perk) ?? order[0];
    return t.indexOf(front);
  }
  if (f.perk === 'mush') return t.indexOf([...t].sort((a, b) => worth(b) - worth(a))[0]);
  if (id === 'choco') {
    const c = [...t].filter((u) => u.xp < 5).sort((a, b) => b.xp - a.xp || worth(b) - worth(a))[0];
    return c ? t.indexOf(c) : undefined;
  }
  return t.indexOf(order[0]);
}

/** One bot action, or null when the bot wants to end the turn. */
export function botAction(run: RunState, rng: Rng, style: BotStyle): Act | null {
  const shop = run.shop.map((s, i) => ({ s, i })).filter((x) => x.s) as { s: { u: Unit }; i: number }[];
  const foods = run.foods.map((s, i) => ({ s, i })).filter((x) => x.s) as { s: { id: string }; i: number }[];

  if (style === 'weak') {
    if (run.gold >= BUY_COST && shop.length && run.team.length < TEAM_SIZE && rng.chance(0.75)) {
      return { k: 'buy', i: rng.pick(shop).i, to: rng.int(0, run.team.length) };
    }
    if (run.gold >= FOOD_COST && foods.length && run.team.length && rng.chance(0.5)) {
      return { k: 'food', i: rng.pick(foods).i, to: rng.int(0, run.team.length - 1) };
    }
    if (run.gold >= 1 && rng.chance(0.4)) return { k: 'reroll' };
    if (run.gold >= BUY_COST && shop.length && run.team.length < TEAM_SIZE) return { k: 'buy', i: rng.pick(shop).i };
    return null;
  }

  const sloppy = style === 'opp';
  if (run.gold >= BUY_COST) {
    // 1. Merge copies.
    const m = shop.find((x) => run.team.some((u) => canMerge(u, x.s.u)));
    if (m && (!sloppy || rng.chance(0.7))) return { k: 'buy', i: m.i };
    const ranked = [...shop].sort((a, b) => worth(b.s.u) - worth(a.s.u));
    const best = sloppy && ranked.length > 1 && rng.chance(0.5) ? ranked[1] : ranked[0];
    // 2. Fill the line.
    if (best && run.team.length < TEAM_SIZE) return { k: 'buy', i: best.i };
    // 3. Replace the weakest critter.
    if (best && run.team.length >= TEAM_SIZE) {
      const weakest = [...run.team].sort((a, b) => worth(a) - worth(b))[0];
      if (worth(best.s.u) > worth(weakest) + (sloppy ? 6 : 3)) return { k: 'sell', i: run.team.indexOf(weakest) };
    }
    // 4. Food.
    if (foods.length && run.team.length >= 2 && run.gold >= FOOD_COST) {
      const f = foods.find((x) => foodTarget(run, x.s.id) !== undefined);
      if (f) return { k: 'food', i: f.i, to: foodTarget(run, f.s.id) };
    }
  }
  // 5. Reroll while a buy is still possible after it.
  if (run.gold >= BUY_COST + 1) return { k: 'reroll' };
  // 6. Order the line.
  if (!sloppy) {
    const want = wantedOrder(run.team);
    const i = run.team.findIndex((u, j) => want[j] !== u);
    if (i >= 0) return { k: 'move', from: run.team.indexOf(want[i]), to: i };
  }
  return null;
}

/** Play a full shop turn with a bot (used for opponents and the sim). */
export function botTurn(run: RunState, rng: Rng, style: BotStyle): void {
  for (let n = 0; n < 60; n++) {
    const a = botAction(run, rng, style);
    if (!a) return;
    const r = apply(run, a);
    if (!r.ok && a.k !== 'move') {
      // Avoid loops on a refused action: the weak bot may try a bad food target.
      if (style === 'weak') continue;
      return;
    }
  }
}
