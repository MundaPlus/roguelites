/** Reel minigame. Keep the tension in the safe zone while the fish pulls. Pure state + step. */
import { FISH_BY_ID, RODS, type Pattern } from './data';
import { Rng } from './rng';

export type ReelResult = 'caught' | 'broke' | 'escaped' | null;

export interface Reel {
  fish: string;
  aberrant: boolean;
  /** Seconds until the bite. The fight starts after it. */
  wait: number;
  t: number;
  tension: number;
  progress: number;
  strain: number;
  lo: number;
  hi: number;
  strength: number;
  /** How fast the tension drops when you stop reeling. Better rods give line faster. */
  slack: number;
  /** Pull multiplier (aberrant, night, panic). */
  mult: number;
  pull: number;
  pattern: Pattern;
  /** Pattern state. */
  phase: number;
  timer: number;
  level: number;
  seed: number;
  result: ReelResult;
  reeling: boolean;
}

export const REEL_UP = 0.95;
export const SLACK = 0.7;

export function newReel(fish: string, aberrant: boolean, rodTier: number, mult: number, wait: number, seed: number): Reel {
  const rod = RODS[rodTier];
  const mid = 0.55;
  return {
    fish,
    aberrant,
    wait,
    t: 0,
    tension: 0.35,
    progress: 0.25,
    strain: 0,
    lo: mid - rod.zone / 2,
    hi: mid + rod.zone / 2,
    strength: rod.strength,
    slack: SLACK + 0.15 * rod.strength,
    mult: mult * (aberrant ? 1.25 : 1),
    pull: 0,
    pattern: aberrant ? 'erratic' : FISH_BY_ID[fish].pattern,
    phase: 0,
    timer: 0,
    level: 1,
    seed,
    result: null,
    reeling: false,
  };
}

function patternPull(r: Reel, dt: number, rng: Rng): number {
  r.timer -= dt;
  switch (r.pattern) {
    case 'steady':
      return 1 + Math.sin(r.t * 1.3) * 0.12;
    case 'jumpy':
      if (r.timer <= 0) {
        r.phase = r.phase ? 0 : 1;
        r.timer = r.phase ? 0.3 : 0.7 + rng.next() * 0.9;
      }
      return r.phase ? 2.3 : 0.55;
    case 'diver':
      if (r.timer <= 0) {
        r.phase = r.phase ? 0 : 1;
        r.timer = r.phase ? 1.2 + rng.next() * 0.7 : 1.2 + rng.next() * 0.6;
      }
      return r.phase ? 1.5 : 0.3;
    case 'thrash':
      return 1 + 0.85 * Math.sin(r.t * 6);
    case 'erratic':
      if (r.timer <= 0) {
        r.level = -0.6 + rng.next() * 2.5;
        r.timer = 0.35 + rng.next() * 0.6;
      }
      return r.level;
  }
}

/** Advance the reel by dt. `reeling` = the player holds the reel button. */
export function stepReel(r: Reel, reeling: boolean, dt: number): ReelResult {
  if (r.result) return r.result;
  r.reeling = reeling;
  if (r.wait > 0) {
    r.wait -= dt;
    return null;
  }
  const rng = new Rng(r.seed);
  r.seed = (r.seed + 0x9e3779b9) | 0;
  r.t += dt;
  const fish = FISH_BY_ID[r.fish];
  r.pull = fish.power * r.mult * patternPull(r, dt, rng);
  r.tension += ((reeling ? REEL_UP : -r.slack) + r.pull) * dt;
  r.tension = Math.max(0, Math.min(1, r.tension));
  const inZone = r.tension >= r.lo && r.tension <= r.hi;
  if (inZone) r.progress += (dt / fish.stamina) * (reeling ? 1 : 0.4);
  else if (r.tension < r.lo) r.progress -= dt * 0.14;
  if (r.tension > r.hi) {
    const over = (r.tension - r.hi) / (1 - r.hi);
    r.strain += (dt * (0.5 + over * 1.4 + (r.tension >= 1 ? 1 : 0))) / r.strength;
  } else r.strain = Math.max(0, r.strain - dt * 0.35);
  if (r.strain >= 1) r.result = 'broke';
  else if (r.progress >= 1) r.result = 'caught';
  else if (r.progress <= 0) r.result = 'escaped';
  return r.result;
}

/** Bot input. `skill` 1 = sharp, lower = sloppy. */
export function botReel(r: Reel, skill: number, rnd: () => number): boolean {
  const mid = (r.lo + r.hi) / 2;
  if (skill >= 1) {
    const ahead = r.tension + (r.pull - 0.1) * 0.12;
    return ahead < mid;
  }
  // Sloppy: reacts late and sometimes holds on too long.
  if (rnd() > skill) return r.reeling;
  return r.tension < mid + (rnd() - 0.5) * 0.25;
}
