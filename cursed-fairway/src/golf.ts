/** One hole of play: shots, aces, hazards and boss tricks. Pure state functions. */
import { buildHole, type BuiltHole, type HoleSpec } from './course';
import { BOSSES, CLUBS, ZONES } from './data';
import { R, newShot, type Course, type Env, type Shot, type Surface } from './physics';
import { Rng, hash } from './rng';

/** What the hole needs to know about the run. */
export interface Kit {
  clubs: Record<string, number>;
  charms: string[];
}

/** a: aim angle from 0 (right, flat) to PI (left, flat). p: power 0..1. */
export interface Aim {
  a: number;
  p: number;
}

interface Spot {
  x: number;
  y: number;
  lie: Surface;
  nx: number;
  ny: number;
}

interface Snapshot extends Spot {
  shots: number;
  taken: boolean[];
  open: number;
  wind: number;
  coins: number;
  idols: number;
}

export interface HoleState {
  spec: HoleSpec;
  start: number;
  shots: number;
  strokes: number;
  ball: Spot;
  prev: Snapshot | null;
  taken: boolean[];
  open: number;
  clock: number;
  wind: number;
  frozen: boolean;
  armed: string[];
  waterUsed: boolean;
  coins: number;
  idols: number;
  done: boolean;
}

export interface Outcome {
  end: Shot['end'];
  idols: number;
  coins: number;
  penalty: number;
  /** The ball went back to where the shot started. */
  reset: boolean;
  bossMsg: string | null;
}

const cache = new Map<string, BuiltHole>();

export function built(spec: HoleSpec): BuiltHole {
  const key = `${spec.seed}|${spec.zone}|${spec.kind}|${spec.curse}`;
  let b = cache.get(key);
  if (!b) {
    if (cache.size > 40) cache.clear();
    b = buildHole(spec);
    cache.set(key, b);
  }
  return b;
}

export const courseOf = (hs: HoleState): Course => built(hs.spec).course;

/** Shots at the start of a hole. */
export function startShots(b: BuiltHole, spec: HoleSpec, kit: Kit): number {
  let n = Math.ceil(b.len / 700) + (b.hazards >= 5 ? 1 : 0);
  if (spec.kind === 'boss') n += 1;
  if (spec.curse === 'thin') n -= 1;
  if (kit.charms.includes('lucky')) n += 1;
  return Math.max(2, n);
}

export function newHole(spec: HoleSpec, kit: Kit): HoleState {
  const b = built(spec);
  const shots = startShots(b, spec, kit);
  return {
    spec,
    start: shots,
    shots,
    strokes: 0,
    ball: { x: b.course.tee.x, y: b.course.tee.y, lie: 'grass', nx: 0, ny: -1 },
    prev: null,
    taken: b.course.pickups.map(() => false),
    open: 0,
    clock: 0,
    wind: b.wind,
    frozen: false,
    armed: [],
    waterUsed: false,
    coins: 0,
    idols: 0,
    done: false,
  };
}

/** The real aim for a club: direction (+1 right, -1 left) and elevation in radians. */
export function clubAim(clubId: string, a: number): { dir: number; e: number } {
  const c = CLUBS[clubId];
  const dir = a <= Math.PI / 2 ? 1 : -1;
  const raw = dir > 0 ? a : Math.PI - a;
  const e = Math.max((c.emin * Math.PI) / 180, Math.min((c.emax * Math.PI) / 180, raw));
  return { dir, e };
}

export function sandPenalty(hs: HoleState, kit: Kit, clubId: string): boolean {
  return hs.ball.lie === 'sand' && !CLUBS[clubId].sandOk && !kit.charms.includes('boots');
}

export function launchVel(hs: HoleState, kit: Kit, clubId: string, aim: Aim): { vx: number; vy: number } {
  const c = CLUBS[clubId];
  const lvl = kit.clubs[clubId] ?? 1;
  let v = c.vmax * (1 + 0.07 * (lvl - 1)) * Math.max(0.03, Math.min(1, aim.p));
  if (sandPenalty(hs, kit, clubId)) v *= 0.6;
  if (hs.armed.includes('power')) v *= 1.3;
  const { dir, e } = clubAim(clubId, aim.a);
  if (c.emax === 0) {
    // Putter: roll along the ground under the ball.
    const tx = -hs.ball.ny;
    const ty = hs.ball.nx;
    return { vx: dir * tx * v, vy: dir * ty * v };
  }
  return { vx: dir * Math.cos(e) * v, vy: -Math.sin(e) * v };
}

export function envOf(hs: HoleState): Env {
  return {
    open: hs.open,
    taken: hs.taken.slice(),
    t0: hs.clock,
    wind: hs.armed.includes('calm') ? 0 : hs.wind,
    curve: hs.armed.includes('curve'),
    skip: hs.armed.includes('skip'),
    sticky: hs.armed.includes('sticky'),
    frozen: hs.frozen,
  };
}

/** A shot for the aim arc or the bot. Does not change the hole. */
export function makeShot(hs: HoleState, kit: Kit, clubId: string, aim: Aim): { shot: Shot; env: Env } {
  const { vx, vy } = launchVel(hs, kit, clubId, aim);
  return { shot: newShot(hs.ball.x, hs.ball.y, vx, vy, hs.ball.lie), env: envOf(hs) };
}

/** Seconds of flight that the aim arc shows. */
export function arcSecs(hs: HoleState, kit: Kit, clubId: string): number {
  if (hs.armed.includes('eagle')) return 8;
  const c = CLUBS[clubId];
  let s = c.arc * (1 + 0.25 * ((kit.clubs[clubId] ?? 1) - 1));
  if (kit.charms.includes('scope')) s *= 1.6;
  if (hs.spec.curse === 'blind') s *= 0.5;
  return s;
}

/** Take a shot: costs 1 shot, saves a snapshot for Mulligan, uses the armed aces. */
export function commitShot(hs: HoleState, kit: Kit, clubId: string, aim: Aim): { shot: Shot; env: Env } {
  const s = makeShot(hs, kit, clubId, aim);
  hs.prev = { ...hs.ball, shots: hs.shots, taken: hs.taken.slice(), open: hs.open, wind: hs.wind, coins: hs.coins, idols: hs.idols };
  hs.shots--;
  hs.strokes++;
  hs.armed = [];
  return s;
}

/** Apply the result of a finished shot. */
export function settle(hs: HoleState, kit: Kit, shot: Shot): Outcome {
  const c = courseOf(hs);
  const out: Outcome = { end: shot.end, idols: 0, coins: 0, penalty: 0, reset: false, bossMsg: null };
  for (const i of shot.got) {
    hs.taken[i] = true;
    if (c.pickups[i].kind === 'idol') {
      out.idols++;
      hs.idols++;
      hs.shots += kit.charms.includes('magnet') ? 3 : 2;
    } else {
      out.coins++;
      hs.coins++;
    }
  }
  hs.clock += shot.t;
  if (shot.end === 'cup') {
    hs.done = true;
    hs.ball = { x: c.cups[hs.open].x, y: c.cups[hs.open].y + CUP_REST, lie: 'green', nx: 0, ny: -1 };
    return out;
  }
  const back = (): void => {
    const p = hs.prev!;
    hs.ball = { x: p.x, y: p.y, lie: p.lie, nx: p.nx, ny: p.ny };
    out.reset = true;
  };
  if (shot.end === 'water' || shot.end === 'lost') {
    if (kit.charms.includes('wings') && !hs.waterUsed) hs.waterUsed = true;
    else out.penalty++;
    back();
  } else {
    if (shot.spiked && !kit.charms.includes('guard')) out.penalty++;
    if (shot.end === 'spikes') back();
    else hs.ball = { x: shot.x, y: shot.y, lie: shot.surf, nx: shot.nx, ny: shot.ny };
  }
  hs.shots = Math.max(0, hs.shots - out.penalty);
  // Boss tricks
  if (hs.spec.kind === 'boss') {
    const boss = BOSSES[ZONES[hs.spec.zone].boss];
    const rng = new Rng(hash(hs.spec.seed, 'boss', hs.strokes));
    if (boss.cups > 1) {
      hs.open = (hs.open + 1 + rng.int(0, boss.cups - 2)) % boss.cups;
      out.bossMsg = `${boss.icon} The flag moves!`;
    }
    if (boss.windShift) {
      const mag = Math.min(90, 25 + hs.strokes * 12);
      hs.wind = (rng.chance(0.5) ? 1 : -1) * Math.round((mag * (0.6 + rng.next() * 0.4)) / 5) * 5;
      out.bossMsg = `${boss.icon} The wind turns!`;
    }
  }
  return out;
}

/** The ball sits in the cup a bit below the rim. */
export const CUP_REST = 16 - R;

export function canMulligan(hs: HoleState): boolean {
  return !!hs.prev && !hs.done;
}

export function mulligan(hs: HoleState): void {
  const p = hs.prev;
  if (!p) return;
  hs.ball = { x: p.x, y: p.y, lie: p.lie, nx: p.nx, ny: p.ny };
  hs.shots = p.shots;
  hs.taken = p.taken.slice();
  hs.open = p.open;
  hs.wind = p.wind;
  hs.coins = p.coins;
  hs.idols = p.idols;
  hs.prev = null;
}

export const distToCup = (hs: HoleState): number => {
  const c = courseOf(hs).cups[hs.open];
  return Math.abs(hs.ball.x - c.x);
};
