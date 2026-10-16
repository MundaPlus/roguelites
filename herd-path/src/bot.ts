/** Bots that play a level: exact solution replay, a noisy "human" replay, and random clicks. */
import { JOB_IDS } from './data';
import { alive, assign, canAssign, nuke, tick, type Critter, type Game, type Trigger } from './game';
import type { Rng } from './rng';

export type Ctrl = (g: Game) => void;

export interface Noise {
  rng: Rng;
  /** Reaction delay in ticks, picked from 0..delay. */
  delay: number;
  /** Chance to overlook the critter that matches. */
  miss: number;
  /** Chance to also waste the job on a wrong critter. */
  wrong: number;
}

function matches(c: Critter, t: Trigger, lo: number, hi: number): boolean {
  if (c.st !== (t.state ?? 'walk')) return false;
  if (t.dir && c.dir !== t.dir) return false;
  if (c.y !== t.y) return false;
  const d = (c.x - t.x) * (t.dir ?? 1);
  if (d < lo || d > hi) return false;
  if (t.job === 'climber' && c.climber) return false;
  if (t.job === 'floater' && c.floater) return false;
  return true;
}

/** Replays the known solution. With `noise`, it reacts late and makes mistakes like a person. */
export function solutionCtrl(sol: Trigger[], noise?: Noise): Ctrl {
  const fired = sol.map(() => -1);
  const pending: ({ id: number; at: number } | null)[] = sol.map(() => null);
  const skip = sol.map(() => new Set<number>());
  return (g) => {
    sol.forEach((t, i) => {
      if (fired[i] >= 0) return;
      if (t.after !== undefined && fired[t.after] < 0) return;
      const p = pending[i];
      if (p) {
        if (g.tick < p.at) return;
        pending[i] = null;
        const c = g.crit.find((c) => c.id === p.id);
        if (c && matches(c, t, -2, 3) && assign(g, c, t.job)) fired[i] = g.tick;
        else skip[i].add(p.id);
        return;
      }
      const c = g.crit.find((c) => !skip[i].has(c.id) && matches(c, t, 0, 0) && canAssign(g, c, t.job));
      if (!c) return;
      if (!noise) {
        if (assign(g, c, t.job)) fired[i] = g.tick;
        return;
      }
      if (noise.rng.chance(noise.miss)) {
        skip[i].add(c.id);
        return;
      }
      if (noise.rng.chance(noise.wrong)) {
        const others = g.crit.filter((o) => o !== c && o.st === 'walk' && canAssign(g, o, t.job));
        if (others.length) assign(g, noise.rng.pick(others), t.job);
      }
      pending[i] = { id: c.id, at: g.tick + noise.rng.int(0, noise.delay) };
    });
  };
}

/** Random clicks: a weak player that does not read the level. */
export function randomCtrl(rng: Rng, perSecond: number): Ctrl {
  return (g) => {
    if (!rng.chance(perSecond / 30)) return;
    const cs = g.crit.filter((c) => alive(c) && c.st === 'walk');
    if (!cs.length) return;
    const jobs = JOB_IDS.filter((j) => g.jobs[j] > 0);
    if (!jobs.length) return;
    assign(g, rng.pick(cs), rng.pick(jobs));
  };
}

/** Nuke when nothing happened for a while after all critters came out. Returns true when it nuked. */
export function stallNuke(g: Game, wait = 450): boolean {
  if (g.nuked || g.spawned < g.lv.count) return false;
  if (g.tick - g.lastChange < wait) return false;
  if (!g.crit.some((c) => alive(c))) return false;
  nuke(g);
  return true;
}

/** Plays a level to the end. */
export function playOut(g: Game, ctrl?: Ctrl, maxTicks = 20000): void {
  for (let i = 0; i < maxTicks && !g.over; i++) {
    tick(g, ctrl);
    g.ev.length = 0;
    stallNuke(g);
  }
}
