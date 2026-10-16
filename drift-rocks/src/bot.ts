/** Simple bots for the debug API and the balance sim. */
import { ENEMIES } from './data';
import { angleDiff, leadAngle, wd, type Game, type Input } from './game';
import type { Rng } from './rng';

export interface BotMem {
  t: number;
  turn: number;
  thrust: number;
  last: Input | null;
  noise: number;
}

export const newBotMem = (): BotMem => ({ t: 0, turn: 0, thrust: 0, last: null, noise: 0 });

/** Reaction time of the good bot in seconds. It holds its input in between, like a human. */
export const REACT = 0.12;

export type Skill = 'good' | 'weak';

interface Hazard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export function botInput(g: Game, skill: Skill, mem: BotMem, rng: Rng): Input {
  const s = g.ship;
  if (!s.alive) return { turn: 0, thrust: 0, fire: false, aim: null, hyper: false };
  if (skill === 'weak') {
    mem.t -= 1 / 60;
    if (mem.t <= 0) {
      mem.t = 0.3 + rng.next() * 0.7;
      mem.turn = rng.int(-1, 1);
      mem.thrust = rng.chance(0.3) ? 1 : 0;
    }
    return { turn: mem.turn, thrust: mem.thrust, fire: true, aim: null, hyper: rng.chance(0.01) };
  }

  mem.t -= 1 / 60;
  if (mem.last && mem.t > 0) return mem.last;
  mem.t = REACT;
  mem.noise = (rng.next() - 0.5) * 0.14;
  const out = think(g, mem);
  mem.last = out;
  return out;
}

function think(g: Game, mem: BotMem): Input {
  const s = g.ship;
  // Danger check: closest approach of every hazard in the next second.
  const hazards: Hazard[] = [...g.rocks, ...g.enemies.filter((e) => e.warp <= 0), ...g.bullets.filter((b) => b.enemy)];
  let dangerT = Infinity;
  let esc = { x: 0, y: 0 };
  for (const h of hazards) {
    const px = wd(s.x, h.x, g.W);
    const py = wd(s.y, h.y, g.H);
    if (px * px + py * py > 260 * 260) continue;
    const vx = h.vx - s.vx;
    const vy = h.vy - s.vy;
    const vv = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1.0, -(px * vx + py * vy) / vv));
    const cx = px + vx * t;
    const cy = py + vy * t;
    const cd = Math.hypot(cx, cy);
    if (cd < h.r + s.r + (h.r > 40 ? 50 : 16) && t < dangerT) {
      dangerT = t;
      if (cd > 4) esc = { x: -cx / cd, y: -cy / cd };
      else {
        const vl = Math.sqrt(vv);
        esc = { x: -vy / vl, y: vx / vl };
      }
    }
  }
  const hyper = dangerT < 0.25 && g.st.hyperCd > 0 && s.hyperT <= 0;

  // Target: nearest thing, enemies first.
  let best: Hazard | null = null;
  let bestScore = Infinity;
  for (const e of g.enemies) {
    if (e.warp > 0) continue;
    const d = Math.sqrt((wd(s.x, e.x, g.W) ** 2) + (wd(s.y, e.y, g.H) ** 2));
    const sc = d - (ENEMIES[e.kind].boss ? 100 : e.kind === 'mine' ? -60 : 160);
    if (sc < bestScore) {
      bestScore = sc;
      best = e;
    }
  }
  for (const r of g.rocks) {
    const d = Math.sqrt((wd(s.x, r.x, g.W) ** 2) + (wd(s.y, r.y, g.H) ** 2)) - r.r;
    if (d < bestScore) {
      bestScore = d;
      best = r;
    }
  }

  const speed = Math.hypot(s.vx, s.vy);
  if (dangerT < 0.55) {
    // Pick the escape heading that needs the least turning: straight away, or 90° to either side.
    const away = Math.atan2(esc.y, esc.x);
    const opts = [away, away + 1.2, away - 1.2];
    const aim = opts.reduce((a, b) => (Math.abs(angleDiff(a, s.a)) <= Math.abs(angleDiff(b, s.a)) ? a : b));
    const facing = Math.abs(angleDiff(aim, s.a)) < 0.7;
    return { turn: 0, thrust: facing ? 1 : 0, fire: true, aim, hyper };
  }
  // Credits close by and nothing near: collect them.
  if (bestScore > 280 && g.gems.length) {
    const gm = g.gems.reduce((a, b) => ((wd(s.x, a.x, g.W) ** 2 + wd(s.y, a.y, g.H) ** 2) < (wd(s.x, b.x, g.W) ** 2 + wd(s.y, b.y, g.H) ** 2) ? a : b));
    const aim = Math.atan2(wd(s.y, gm.y, g.H), wd(s.x, gm.x, g.W));
    return { turn: 0, thrust: Math.abs(angleDiff(aim, s.a)) < 0.4 && speed < 200 ? 1 : 0, fire: true, aim, hyper };
  }
  // Too fast: brake by thrusting against the drift.
  if (speed > 220) {
    const aim = Math.atan2(-s.vy, -s.vx);
    return { turn: 0, thrust: Math.abs(angleDiff(aim, s.a)) < 0.4 ? 1 : 0, fire: true, aim, hyper };
  }
  if (!best) return { turn: 0, thrust: 0, fire: false, aim: null, hyper };
  const bs = g.st.bulletSpeed;
  const aim = leadAngle(g, s.x, s.y, best.x, best.y, best.vx - s.vx * 0.5, best.vy - s.vy * 0.5, bs) + mem.noise;
  const diff = Math.abs(angleDiff(aim, s.a));
  // Close the gap to far targets a little.
  const thrust = bestScore > 380 && diff < 0.3 && speed < 120 ? 0.6 : 0;
  return { turn: 0, thrust, fire: diff < 0.3 + g.st.spread * 0.1, aim, hyper };
}

/** Pick order for upgrades in bot runs. */
export const BOT_PRIO = ['spread', 'shield', 'rapid', 'power', 'hyper', 'wingman', 'pierce', 'nova', 'rear', 'mines', 'engine', 'tractor'];
export const botRank = (id: string): number => {
  const i = BOT_PRIO.indexOf(id);
  return i < 0 ? 99 : i;
};
