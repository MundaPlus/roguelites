/** Bots for the sim and for `window.debug.step()`. They only use what the screen shows. */
import { MOVES, RELICS, oppositeOf } from './data';
import { currentView, edef, enemyDmg, enemyHonesty, enemyMix, has, outcome, readerOf, tellAcc, type Duel, type Player } from './duel';
import type { Rng } from './rng';
import type { Offer, Reward } from './run';

export type Strategy = 'honest' | 'liar' | 'random' | 'alternate' | 'tells' | 'model' | 'adaptive';

/** Your gain (damage dealt minus taken) for action `a` against its action `b`. */
const gain = (a: number, b: number, p: Player, d: Duel): number => {
  const o = outcome(a, b, p, enemyDmg(d));
  return o.toE - o.toP;
};

function bestAction(post: number[], p: Player, d: Duel): number {
  let best = 0;
  let bv = -Infinity;
  for (let a = 0; a < 4; a++) {
    let v = 0;
    for (let b = 0; b < 4; b++) v += post[b] * gain(a, b, p, d);
    if (v > bv) {
      bv = v;
      best = a;
    }
  }
  return best;
}

/** Its likely action given its claim and tell (Bayes with the numbers on screen). */
export function readEnemy(d: Duel, p: Player): number[] {
  const plan = d.plan!;
  if (d.peek) return [0, 1, 2, 3].map((b) => (b === plan.act ? 1 : 0));
  const prior = enemyMix(plan.view.expect, d, p);
  const h = enemyHonesty(d);
  const acc = tellAcc(d, p);
  const smart = edef(d).smart;
  const pTellH = plan.tell === 'calm' ? acc : 1 - acc;
  const pTellB = 1 - pTellH;
  const post = prior.map((q, b) => {
    if (b === plan.claim) return q * h * pTellH;
    const pc = smart * (plan.claim === oppositeOf(b) ? 1 : 0) + (1 - smart) / 3;
    return q * (1 - h) * pc * pTellB;
  });
  const s = post.reduce((a, b) => a + b, 0) || 1;
  return post.map((x) => x / s);
}

/** Pick the claim for this round. */
export function botClaim(d: Duel, p: Player, s: Strategy, rng: Rng): number {
  if (s !== 'adaptive' && s !== 'model') return rng.int(0, 3);
  // Estimate how it reads each claim from the shown trust and favorites.
  const v = currentView(d, p, null);
  let best = 0;
  let bv = -Infinity;
  for (let c = 0; c < 4; c++) {
    const others = v.fav.map((f, a) => (a === c ? 0 : f));
    const so = others.reduce((x, y) => x + y, 0);
    const expect = others.map((f, a) => (a === c ? v.trust : ((1 - v.trust) * f) / so));
    const q = enemyMix(expect, d, p);
    let cv = -Infinity;
    for (let a = 0; a < 4; a++) {
      let x = 0;
      for (let b = 0; b < 4; b++) x += q[b] * gain(a, b, p, d);
      // Keep the record healthy: a lie when trust is low costs future reads.
      if (a !== c && v.trust < 0.4) x -= 0.6;
      cv = Math.max(cv, x);
    }
    cv += rng.next() * 0.3;
    if (cv > bv) {
      bv = cv;
      best = c;
    }
  }
  return best;
}

/** Pick the action after both claims are known. */
export function botAct(d: Duel, p: Player, s: Strategy, rng: Rng): number {
  const claim = d.claim!;
  switch (s) {
    case 'honest':
      return claim;
    case 'liar':
      return rng.pick([0, 1, 2, 3].filter((a) => a !== claim));
    case 'random':
      return rng.int(0, 3);
    case 'alternate':
      return d.round % 2 ? rng.pick([0, 1, 2, 3].filter((a) => a !== claim)) : claim;
    case 'model':
      // Reads only the model on screen, ignores its claim and tell.
      return bestAction(enemyMix(d.plan!.view.expect, d, p), p, d);
    case 'tells': {
      // Honest claims, but play the counter of its claim when its tell looks calm.
      const plan = d.plan!;
      return plan.tell === 'calm' ? (plan.claim + 3) % 4 : claim;
    }
    case 'adaptive':
      return bestAction(readEnemy(d, p), p, d);
  }
}

/** Should the adaptive bot use an active relic now? */
export function botRelic(d: Duel, p: Player): 'lethe' | 'ball' | null {
  if (d.phase === 'claim' && has(p, 'lethe') && !d.used.includes('lethe') && d.round >= 5) {
    const v = currentView(d, p, null);
    const r = readerOf(d);
    if ((r === 'statistician' || r === 'mirror') && Math.max(...v.fav) > 0.4) return 'lethe';
    if (r === 'gullible' && v.trust < 0.5) return 'lethe';
  }
  if (d.phase === 'act' && has(p, 'ball') && !d.used.includes('ball')) {
    const post = readEnemy(d, p);
    if (Math.max(...post) < 0.5) return 'ball';
  }
  return null;
}

const RELIC_RANK = ['heart', 'eye', 'fang', 'ball', 'whet', 'gaunt', 'skin', 'coin', 'lethe', 'oath', 'flask', 'mask', 'ace', 'veil'];

/** Index of the reward to take. */
export function botReward(rw: Reward, p: Player): number {
  const val = (o: Offer): number => {
    if (o.kind === 'heal') return p.hp < p.maxHp * 0.5 ? 100 : (p.maxHp - p.hp) / 2;
    if (o.kind === 'move') {
      const m = MOVES[o.id];
      const cur = MOVES[p.moves[m.slot]];
      return 8 + (m.win - cur.win) * 3 - m.loseExtra * 2 + m.heal * 2;
    }
    return 20 - RELIC_RANK.indexOf(o.id) + (RELICS[o.id] ? 0 : -50);
  };
  let best = 0;
  rw.offers.forEach((o, i) => {
    if (val(o) > val(rw.offers[best])) best = i;
  });
  return best;
}
