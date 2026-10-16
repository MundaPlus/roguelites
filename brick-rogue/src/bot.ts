/**
 * Paddle bots for the debug API and the balance sim.
 * The bot sees the board `delay` seconds late and moves the paddle at most `maxSpeed` px/s,
 * like a human hand with a reaction time.
 */
import { BALL_R, DT, PADDLE_Y, W, type Game, type Input } from './game';
import type { Rng } from './rng';

export interface BotCfg {
  /** Reaction delay in seconds. */
  delay: number;
  /** Max paddle speed in px/s. */
  maxSpeed: number;
  /** Predict where the ball lands (with wall bounces) instead of following it. */
  predict: boolean;
  /** Hit the ball off-center to send it toward the bricks. */
  aim: boolean;
  /** Go for falling power-ups when no ball is close. */
  catchDrops: boolean;
  /** Random aim error in px. */
  noise: number;
  /** Extra prediction error as a share of the ball's sideways travel. */
  errFrac: number;
  /** Seconds between looks at the board. The bot keeps its last plan in between. */
  glance: number;
}

export const WEAK_BOT: BotCfg = { delay: 0.12, maxSpeed: 650, predict: false, aim: false, catchDrops: false, noise: 16, errFrac: 0, glance: 0.1 };
export const GOOD_BOT: BotCfg = { delay: 0.22, maxSpeed: 1000, predict: true, aim: true, catchDrops: true, noise: 6, errFrac: 0.45, glance: 0.3 };

export interface BotMem {
  hist: { t: number; x: number }[];
  noise: number;
  noiseT: number;
  /** Prediction error factor in [-1, 1]. */
  err: number;
  glanceT: number;
  plan: number;
}

export const newBotMem = (): BotMem => ({ hist: [], noise: 0, noiseT: 0, err: 0, glanceT: 0, plan: 180 });

/** Fold a position into [lo, hi] like a ball bouncing between two walls. */
function fold(x: number, lo: number, hi: number): number {
  const span = hi - lo;
  let v = (x - lo) % (2 * span);
  if (v < 0) v += 2 * span;
  return lo + (v > span ? 2 * span - v : v);
}

/** Where the paddle should be right now, based on the current board. */
function desired(g: Game, cfg: BotCfg, mem: BotMem): number {
  const p = g.paddle;
  const free = g.balls.filter((b) => !b.stuck);
  if (!free.length) return p.x;
  let target: number | null = null;
  let soonest = Infinity;
  for (const b of free) {
    if (cfg.predict) {
      if (b.vy <= 0) continue;
      const t = (PADDLE_Y - BALL_R - b.y) / b.vy;
      if (t < -0.05 || t >= soonest) continue;
      soonest = t;
      const travel = b.vx * Math.max(0, t);
      target = fold(b.x + travel * (1 + mem.err * cfg.errFrac), BALL_R, W - BALL_R);
    } else {
      // Follow the lowest ball that comes down.
      const score = b.vy > 0 ? -b.y : 1000 - b.y;
      if (score < soonest) {
        soonest = score;
        target = b.x;
      }
    }
  }
  if (target === null) {
    // No ball comes down: follow the lowest ball, or catch a power-up.
    if (cfg.catchDrops && g.drops.length) {
      const d = [...g.drops].filter((d) => d.kind !== 'coin' || g.drops.length === 1).sort((a, b) => b.y - a.y)[0] ?? g.drops[0];
      return d.x;
    }
    const low = free.reduce((a, b) => (b.y > a.y ? b : a));
    return cfg.predict ? (low.x + W / 2) / 2 : low.x;
  }
  if (cfg.catchDrops && cfg.predict && soonest > 0.9 && g.drops.length) {
    const d = [...g.drops].sort((a, b) => b.y - a.y)[0];
    if (d.y > PADDLE_Y - 200) return d.x;
  }
  if (cfg.aim && g.bricks.length) {
    // Send the ball toward the side with more bricks.
    let left = 0;
    let right = 0;
    for (const b of g.bricks) {
      if (b.x + b.w / 2 < target) left += b.hp;
      else right += b.hp;
    }
    const side = right > left ? 1 : -1;
    const off = 0.35 * side * (p.w / 2);
    return target - off;
  }
  return target;
}

/** One bot input for the current step. */
export function botInput(g: Game, mem: BotMem, cfg: BotCfg, rng: Rng): Input {
  mem.noiseT -= DT;
  if (mem.noiseT <= 0) {
    mem.noiseT = 0.5;
    mem.noise = (rng.next() * 2 - 1) * cfg.noise;
  }
  mem.glanceT -= DT;
  if (mem.glanceT <= 0) {
    mem.glanceT = cfg.glance;
    mem.err = rng.next() * 2 - 1;
    mem.plan = desired(g, cfg, mem);
  }
  mem.hist.push({ t: g.time, x: mem.plan });
  while (mem.hist.length > 1 && mem.hist[1].t <= g.time - cfg.delay) mem.hist.shift();
  const want = mem.hist[0].x + mem.noise;
  const p = g.paddle;
  const maxStep = cfg.maxSpeed * DT;
  const x = p.x + Math.max(-maxStep, Math.min(maxStep, want - p.x));
  const launch = g.balls.some((b) => b.stuck && b.stuckT > 0.35);
  return { x, dir: 0, launch };
}
