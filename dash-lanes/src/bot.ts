/** Lookahead bot. It tries short action plans on a copy of the runner and picks the safest one. */
import { cloneRunner, probe, stepRunner, type Action, type Game, type Obstacle, type Runner } from './game';
import { Rng } from './rng';

export interface BotCfg {
  /** Reaction time: a chosen action happens this many seconds later. */
  lag: number;
  /** How far ahead the bot looks, in seconds. */
  horizon: number;
  /** Seconds between two plans. */
  every: number;
  /** Chance per plan to do something random instead. */
  err: number;
}

export const GOOD_BOT: BotCfg = { lag: 0.26, horizon: 1.1, every: 0.1, err: 0.03 };
export const WEAK_BOT: BotCfg = { lag: 0.34, horizon: 0.7, every: 0.18, err: 0.06 };
export const PERFECT_BOT: BotCfg = { lag: 0, horizon: 1.6, every: 0.05, err: 0 };

const ACTS: (Action | null)[] = [null, 'left', 'right', 'jump', 'slide'];
const DT = 1 / 45;
const GAPS = [0.12, 0.24, 0.4, 0.6, 0.85];

export class Bot {
  private q: { a: Action; at: number }[] = [];
  private next = 0;
  private rng: Rng;

  constructor(
    public cfg: BotCfg,
    seed = 1,
  ) {
    this.rng = new Rng(seed);
  }

  reset(): void {
    this.q = [];
    this.next = 0;
  }

  /** Actions to feed into the game this tick. */
  act(g: Game): Action[] | null {
    if (g.time < this.next - 1) this.reset();
    if (g.time >= this.next) {
      this.next = g.time + this.cfg.every;
      let a: Action | null;
      if (this.cfg.err && this.rng.chance(this.cfg.err)) a = this.rng.pick(ACTS);
      else a = this.plan(g);
      if (a) this.q.push({ a, at: g.time + this.cfg.lag });
    }
    if (!this.q.length || this.q[0].at > g.time) return null;
    const out: Action[] = [];
    while (this.q.length && this.q[0].at <= g.time) out.push(this.q.shift()!.a);
    return out;
  }

  private plan(g: Game): Action | null {
    const H = this.cfg.horizon + this.cfg.lag;
    const near: Obstacle[] = g.obstacles.filter((o) => o.dead < 0 && o.z + o.vz * H < g.dist + g.speed * H + 30 && o.z + o.len > g.dist - 2);
    let best: Action | null = null;
    let bestScore = -Infinity;
    const base = this.q.map((x) => ({ a: x.a, t: x.at - g.time }));
    const lag = this.cfg.lag;
    const tryPlan = (a1: Action | null, plan: { a: Action; t: number }[], cost: number): void => {
      const sc = this.score(g, near, [...base, ...plan], H) - cost;
      if (sc > bestScore + 1e-6) {
        bestScore = sc;
        best = a1;
      }
    };
    tryPlan(null, [], 0);
    // Wait, then act: keeps the bot from acting too early.
    for (const gap of GAPS) for (const a2 of ACTS) if (a2) tryPlan(null, [{ a: a2, t: lag + gap }], 1.5);
    for (const a1 of ACTS) {
      if (!a1) continue;
      tryPlan(a1, [{ a: a1, t: lag }], 1);
      for (const gap of GAPS) for (const a2 of ACTS) if (a2) tryPlan(a1, [{ a: a1, t: lag }, { a: a2, t: lag + gap }], 2);
    }
    return best;
  }

  private score(g: Game, near: Obstacle[], plan: { a: Action; t: number }[], H: number): number {
    const r: Runner = cloneRunner(g.r);
    plan.sort((a, b) => a.t - b.t);
    let pi = 0;
    let sc = 0;
    let t = 0;
    const acts: Action[] = [];
    while (t < H) {
      acts.length = 0;
      while (pi < plan.length && plan[pi].t <= t + 1e-9) acts.push(plan[pi++].a);
      stepRunner(r, g.mods, g.zone.laneMul, DT, acts.length ? acts : null, null);
      t += DT;
      const rz = g.dist + g.speed * t;
      const h = probe(g, r, rz, t, near, 0.35);
      if (h) {
        if (h.bump) {
          sc -= 60;
          const back = r.prev;
          r.prev = r.lane;
          r.lane = back;
          r.bump = 0.35;
        } else return -1000 + t * 100 + sc;
      }
    }
    // Prefer an end lane that stays open, and the middle lane.
    const rz = g.dist + g.speed * H;
    for (const o of near) {
      if (o.lane !== r.lane || o.dead >= 0) continue;
      const z0 = o.z + o.vz * H;
      if (z0 > rz && z0 < rz + 25 && o.y1 > 2.5) sc -= 20;
    }
    if (r.lane === 0) sc += 2;
    if (r.slide > 0 || r.air) sc -= 0.5;
    return sc;
  }
}
