/** Bot that searches club, angle and power with the real physics. Used by `window.debug` and the sim. */
import { CLUBS } from './data';
import { courseOf, makeShot, type Aim, type HoleState, type Kit } from './golf';
import { runShot, type Env } from './physics';
import type { Rng } from './rng';
import { buy, canBuy, handMax, nodesFor, takeReward, upgradableClubs, type NodeKind, type RunState } from './run';

export interface Plan {
  club: string;
  aim: Aim;
  arm: string[];
  flight: { t: number; kind: 'brake' | 'rocket' } | null;
  score: number;
}

export interface BotOpts {
  /** Search density: 1 = full, smaller = fewer samples. */
  effort: number;
  /** Aim noise (radians) and power noise (fraction) when the shot is played. */
  noiseA: number;
  noiseP: number;
  aces: boolean;
}

export const GOOD: BotOpts = { effort: 1, noiseA: 0.04, noiseP: 0.06, aces: true };
export const WEAK: BotOpts = { effort: 0.3, noiseA: 0.07, noiseP: 0.1, aces: false };

function evaluate(hs: HoleState, kit: Kit, club: string, aim: Aim, arm: string[], flight: Plan['flight']): number {
  const c = courseOf(hs);
  const saved = hs.armed;
  hs.armed = arm;
  const { shot, env } = makeShot(hs, kit, club, aim);
  hs.armed = saved;
  if (flight) (env as Env).plan = [flight];
  runShot(c, shot, env);
  if (shot.end === 'cup') return 100000;
  if (shot.end === 'water' || shot.end === 'lost' || shot.end === 'spikes') return -5000;
  const cup = c.cups[hs.open];
  let s = -Math.abs(shot.x - cup.x) - Math.abs(shot.y - cup.y) * 0.3;
  if (shot.spiked && !kit.charms.includes('guard')) s -= 700;
  for (const i of shot.got) s += c.pickups[i].kind === 'idol' ? 800 : 25;
  if (shot.surf === 'sand') s -= 120;
  // A shot that goes nowhere wastes a shot. Going back to get around a wall is better.
  if (Math.hypot(shot.x - hs.ball.x, shot.y - hs.ball.y) < 25) s -= 450;
  return s;
}

function gauss(rng: Rng): number {
  return (rng.next() + rng.next() + rng.next() - 1.5) * 1.4;
}

/** Find a good shot. */
export function plan(hs: HoleState, kit: Kit, hand: string[], o: BotOpts, rng: Rng): Plan {
  const c = courseOf(hs);
  const cupX = c.cups[hs.open].x;
  const fwd = cupX >= hs.ball.x ? 1 : -1;
  const clubs = Object.keys(kit.clubs);
  const nE = Math.max(2, Math.round(6 * o.effort));
  const nP = Math.max(4, Math.round(14 * o.effort));
  let best: Plan = { club: 'putter', aim: { a: fwd > 0 ? 0 : Math.PI, p: 0.5 }, arm: [], flight: null, score: -Infinity };
  const cands: Plan[] = [];
  for (const dir of [fwd, -fwd]) {
  const toA = (e: number): number => (dir > 0 ? e : Math.PI - e);
  const back = dir !== fwd;
  for (const club of clubs) {
    if (back && club === 'putter') continue;
    const cd = CLUBS[club];
    const es = cd.emax === 0 ? [0] : Array.from({ length: nE }, (_, i) => ((cd.emin + ((cd.emax - cd.emin) * i) / (nE - 1)) * Math.PI) / 180);
    for (const e of back ? es.filter((_, i) => i % 2 === 0) : es) {
      for (let j = 0; j < nP; j += back ? 2 : 1) {
        const p = o.effort >= 1 ? 0.12 + (0.88 * j) / (nP - 1) : 0.1 + rng.next() * 0.9;
        const aim = { a: toA(e), p };
        const sc = evaluate(hs, kit, club, aim, [], null);
        const pl = { club, aim, arm: [], flight: null, score: sc };
        cands.push(pl);
        if (sc > best.score) best = pl;
      }
    }
  }
  }
  if (o.effort >= 1) {
    // Refine around the best few.
    cands.sort((a, b) => b.score - a.score);
    for (const base of cands.slice(0, 4)) {
      let cur = base;
      for (const step of [0.04, 0.015]) {
        for (let da = -2; da <= 2; da++) {
          for (let dp = -2; dp <= 2; dp++) {
            const aim = { a: cur.aim.a + da * step * 0.6, p: Math.max(0.05, Math.min(1, cur.aim.p + dp * step)) };
            const sc = evaluate(hs, kit, cur.club, aim, [], null);
            if (sc > cur.score) cur = { ...cur, aim, score: sc };
          }
        }
      }
      if (cur.score > best.score) best = cur;
    }
  }
  if (o.effort >= 1) {
    // Prefer shots that still work with a small aim error.
    cands.push(best);
    const seen = new Set<string>();
    const pool = cands
      .sort((a, b) => b.score - a.score)
      .filter((c) => {
        const k = `${c.club}|${c.aim.a.toFixed(2)}|${c.aim.p.toFixed(2)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 12);
    let bestR = -Infinity;
    for (const cd of pool) {
      let sum = Math.min(cd.score, 3000);
      for (const [da, dp] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const aim = { a: cd.aim.a + da * o.noiseA, p: Math.max(0.03, Math.min(1, cd.aim.p * (1 + dp * o.noiseP))) };
        sum += Math.min(evaluate(hs, kit, cd.club, aim, [], null), 3000);
      }
      if (sum > bestR) {
        bestR = sum;
        best = cd;
      }
    }
  }
  if (o.aces && best.score < 100000) {
    const arms = ['curve', 'power', 'calm', 'sticky', 'skip'].filter((id) => hand.includes(id));
    const top = [...cands].sort((a, b) => b.score - a.score).slice(0, 40);
    for (const id of arms) {
      for (const cd of top) {
        const sc = evaluate(hs, kit, cd.club, cd.aim, [id], null);
        if (sc > best.score + 250 || (sc >= 100000 && best.score < 100000)) best = { ...cd, arm: [id], score: sc };
      }
    }
    for (const kind of ['brake', 'rocket'] as const) {
      if (!hand.includes(kind) || best.score >= 100000) continue;
      for (const cd of top.slice(0, 12)) {
        for (let t = 0.3; t < 3.5; t += 0.1) {
          const fl = { t: Math.round(t / (1 / 120)) * (1 / 120), kind };
          const sc = evaluate(hs, kit, cd.club, cd.aim, [], fl);
          if (sc > best.score + 250 || (sc >= 100000 && best.score < 100000)) best = { ...cd, flight: fl, score: sc };
        }
      }
    }
  }
  // Human-like error when the shot is played. A sure hole-in counts as aimed with care.
  const k = best.score >= 100000 ? 0.5 : 1;
  const aim = { a: best.aim.a + gauss(rng) * o.noiseA * k, p: Math.max(0.03, Math.min(1, best.aim.p * (1 + gauss(rng) * o.noiseP * k))) };
  return { ...best, aim };
}

// ---------- Run decisions ----------

const CHARM_RANK = ['lucky', 'magnet', 'scope', 'guard', 'wings', 'sleeve', 'boots', 'glove'];

/** Path choice. The good bot shops when it has gold, the weak bot picks at random. */
export function pickNode(run: RunState, good: boolean, rng: Rng): NodeKind {
  const nodes = nodesFor(run);
  if (!good) return rng.pick(nodes);
  if (nodes.includes('shop') && run.gold >= 45) return 'shop';
  if (nodes.includes('boss')) return 'boss';
  return 'hole';
}

export function pickReward(run: RunState): void {
  const rw = run.reward!;
  if (rw.charms.length) {
    const id = [...rw.charms].sort((a, b) => CHARM_RANK.indexOf(a) - CHARM_RANK.indexOf(b))[0];
    takeReward(run, 'charm', id);
    return;
  }
  const pref = ['extra', 'mulligan', 'curve', 'brake', 'sticky', 'rocket', 'power', 'skip', 'calm', 'eagle', 'freeze'];
  const id = [...rw.aces].sort((a, b) => pref.indexOf(a) - pref.indexOf(b))[0];
  if (id && run.hand.length < handMax(run)) takeReward(run, 'ace', id);
}

/** Shop: charms first, then a club upgrade, then extra shots, then aces. */
export function shopBot(run: RunState): void {
  const items = run.shop!;
  const order = (i: number): number => {
    const it = items[i];
    if (it.kind === 'charm') return CHARM_RANK.indexOf(it.id);
    if (it.kind === 'club') return 10;
    if (it.kind === 'shots') return 11;
    return 12;
  };
  const idx = items.map((_, i) => i).sort((a, b) => order(a) - order(b));
  for (const i of idx) {
    const it = items[i];
    if (!canBuy(run, it)) continue;
    if (it.kind === 'club') {
      const club = ['iron', 'driver', 'wedge', 'putter', 'rescue', 'lob'].find((c) => upgradableClubs(run).includes(c));
      if (club) buy(run, i, club);
    } else buy(run, i);
  }
}
