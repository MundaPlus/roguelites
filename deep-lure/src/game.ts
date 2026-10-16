/** Run state and all game rules: sailing, time, panic, fishing, hold, ports. No DOM. */
import {
  ABERRANT_PREFIX,
  CURSES,
  DAY_END,
  DAY_START,
  DEBT,
  ENGINES,
  EVENTS,
  FISH,
  FISH_BY_ID,
  GEAR,
  HOLDS,
  HULLS,
  LAMPS,
  LAST_DAY,
  LURE_BY_ID,
  NIGHT_START,
  PORTS,
  REGIONS,
  RODS,
  type CurseId,
  type FishDef,
  type GearCat,
} from './data';
import { findSpot, fits, neighbours, type Catch, type HoldItem } from './hold';
import { newReel, type Reel } from './reel';
import { hash } from './rng';
import { GH, GW, WH, WW, cellOf, type Circle, type World } from './world';

export interface Boat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  hull: number;
  inv: number;
}
export interface Shade {
  x: number;
  y: number;
  hp: number;
  wob: number;
}
export interface Phantom extends Circle {
  life: number;
}
export interface Gear {
  rod: number;
  engine: number;
  hull: number;
  hold: number;
  lamp: number;
  lure: string;
  lures: string[];
  kits: number;
}
export interface Over {
  victory: boolean;
  score: number;
  reason: string;
  pearls: number;
}
export interface Run {
  v: 1;
  seed: string;
  day: number;
  minute: number;
  money: number;
  debt: number;
  debtStart: number;
  boat: Boat;
  gear: Gear;
  hold: HoldItem[];
  uid: number;
  panic: number;
  unlocked: number[];
  stock: number[];
  explored: number[];
  caught: Record<string, number>;
  docked: number;
  rs: number;
  nightEvents: number;
  event: string | null;
  pending: Catch | null;
  shades: Shade[];
  phantoms: Phantom[];
  stats: { fish: number; aberrant: number; earned: number; sank: number; best: number };
  over: Over | null;
}

export type SeaEvent =
  | { k: 'bump'; x: number; y: number; dmg: boolean }
  | { k: 'shade'; x: number; y: number }
  | { k: 'banish'; x: number; y: number }
  | { k: 'locked'; region: number }
  | { k: 'dawn' }
  | { k: 'night' }
  | { k: 'event' }
  | { k: 'sink' }
  | { k: 'ram'; why: string }
  | { k: 'gnaw'; text: string }
  | { k: 'phantom' };

export interface Input {
  throttle: number;
  steer: number;
}

const BOAT_R = 12;

/** Next random number in [0, 1). The state lives in the run, so saves continue the same sequence. */
export function rnd(run: Run): number {
  run.rs = (run.rs + 0x6d2b79f5) | 0;
  let t = run.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface StartGear {
  rod?: number;
  engine?: number;
  hold?: number;
  lamp?: number;
  kits?: number;
  chart?: boolean;
}

export function newRun(seed: string, w: World, start: StartGear = {}): Run {
  const home = PORTS[0];
  const run: Run = {
    v: 1,
    seed,
    day: 1,
    minute: DAY_START,
    money: 40,
    debt: DEBT,
    debtStart: DEBT,
    boat: { x: home.dx, y: home.dy, vx: 0, vy: 0, heading: 0, hull: HULLS[0].hp, inv: 0 },
    gear: { rod: start.rod ?? 0, engine: start.engine ?? 0, hull: 0, hold: start.hold ?? 0, lamp: start.lamp ?? 0, lure: 'plain', lures: ['plain'], kits: start.kits ?? 0 },
    hold: [],
    uid: 1,
    panic: 0,
    unlocked: [0, 1],
    stock: [],
    explored: new Array(GW * GH).fill(0),
    caught: {},
    docked: 0,
    rs: hash(seed, 'run'),
    nightEvents: 0,
    event: null,
    pending: null,
    shades: [],
    phantoms: [],
    stats: { fish: 0, aberrant: 0, earned: 0, sank: 0, best: 0 },
    over: null,
  };
  refreshStock(run, w);
  if (start.chart) w.region.forEach((r, i) => r <= 1 && (run.explored[i] = 1));
  reveal(run, home.dx, home.dy, 300);
  return run;
}

function refreshStock(run: Run, w: World): void {
  run.stock = w.spots.map((_, i) => {
    const h = hash(run.seed, 'stock', run.day, i) % 100;
    return 2 + (h < 45 ? 1 : 0) + (h < 10 ? 1 : 0);
  });
}

export const maxHull = (run: Run): number => HULLS[run.gear.hull].hp;
export const holdSize = (run: Run): { w: number; h: number } => HOLDS[run.gear.hold];
export const isNight = (run: Run): boolean => run.minute >= NIGHT_START;
export const speedOf = (b: Boat): number => Math.hypot(b.vx, b.vy);
export const curseCount = (run: Run, c: CurseId): number => run.hold.filter((it) => it.curse === c).length;
export const rodDepth = (run: Run): number => RODS[run.gear.rod].depth + (run.gear.lure === 'jig' ? 1 : 0);

export function clockText(minute: number): string {
  const m = Math.floor(minute) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 0 = full day, 1 = deep night. */
export function darkness(minute: number): number {
  if (minute < DAY_START + 60) return 0.75 * (1 - (minute - DAY_START) / 60);
  if (minute < 1080) return 0;
  if (minute < NIGHT_START) return ((minute - 1080) / 120) * 0.75;
  if (minute > DAY_END - 60) return 0.75 + 0.15 * ((DAY_END - minute) / 60);
  return 0.9;
}

export function boatMaxSpeed(run: Run): number {
  const heavy = Math.max(0.6, 1 - 0.1 * curseCount(run, 'heavy'));
  return 90 * ENGINES[run.gear.engine].speed * heavy;
}

export const isLocked = (run: Run, w: World, cell: number): boolean => !run.unlocked.includes(w.region[cell]);

export function reveal(run: Run, x: number, y: number, r: number): void {
  const c0 = Math.floor((x - r) / 60);
  const c1 = Math.floor((x + r) / 60);
  const r0 = Math.floor((y - r) / 60);
  const r1 = Math.floor((y + r) / 60);
  for (let cy = Math.max(0, r0); cy <= Math.min(GH - 1, r1); cy++)
    for (let cx = Math.max(0, c0); cx <= Math.min(GW - 1, c1); cx++) {
      if ((cx * 60 + 30 - x) ** 2 + (cy * 60 + 30 - y) ** 2 < r * r) run.explored[cy * GW + cx] = 1;
    }
}

export function lightRadius(run: Run): number {
  const lamp = LAMPS[run.gear.lamp].radius;
  const d = darkness(run.minute);
  return d < 0.3 ? 420 : lamp + (420 - lamp) * Math.max(0, 1 - d / 0.75);
}

function damage(run: Run, w: World, n: number, ev: SeaEvent[]): void {
  run.boat.hull -= n;
  run.boat.inv = 1.2;
  if (run.boat.hull <= 0) sink(run, w, ev);
}

function sink(run: Run, w: World, ev: SeaEvent[]): void {
  ev.push({ k: 'sink' });
  run.stats.sank++;
  run.hold = [];
  run.pending = null;
  run.debt += 150;
  run.panic = 0;
  run.shades = [];
  run.phantoms = [];
  run.event = null;
  run.docked = 0;
  run.boat = { x: PORTS[0].dx, y: PORTS[0].dy, vx: 0, vy: 0, heading: 0, hull: maxHull(run), inv: 0 };
  newDay(run, w, ev);
}

/** Start the next day at 06:00. */
export function newDay(run: Run, w: World, ev: SeaEvent[]): void {
  run.day++;
  run.minute = DAY_START;
  run.nightEvents = 0;
  run.shades = [];
  run.phantoms = [];
  if (run.docked >= 0) run.panic = 0;
  else run.panic *= 0.5;
  // Gnawing fish eat a neighbour.
  for (const it of run.hold.filter((i) => i.curse === 'gnaw')) {
    const prey = neighbours(run.hold, it).filter((o) => !o.aberrant);
    if (prey.length) {
      const p = prey[Math.floor(rnd(run) * prey.length)];
      run.hold = run.hold.filter((o) => o.uid !== p.uid);
      ev.push({ k: 'gnaw', text: `${it.name} ate your ${p.name}.` });
    }
  }
  refreshStock(run, w);
  ev.push({ k: 'dawn' });
  if (run.day > LAST_DAY) endRun(run, false, 'Day 14 is over and the boat debt is not paid. The bank takes the boat.');
}

function nearPort(run: Run): boolean {
  return PORTS.some((p) => (p.dx - run.boat.x) ** 2 + (p.dy - run.boat.y) ** 2 < 230 ** 2);
}

/** Advance the clock. Handles panic, night threats, events and dawn. */
export function advanceTime(run: Run, w: World, mins: number, ev: SeaEvent[]): void {
  let left = mins;
  while (left > 1e-9 && !run.over) {
    const step = Math.min(1, left);
    left -= step;
    const before = run.minute;
    run.minute += step;
    const night = isNight(run);
    if (before < NIGHT_START && night) ev.push({ k: 'night' });
    const atSea = run.docked < 0;
    if (atSea) {
      const lamp = LAMPS[run.gear.lamp];
      if (nearPort(run)) run.panic -= 0.4 * step;
      else if (night) {
        const glow = run.gear.lure === 'glow' ? 0.8 : 1;
        const whisper = 1 + 0.3 * curseCount(run, 'whisper');
        run.panic += 0.11 * lamp.calm * glow * whisper * step;
      } else run.panic -= 0.06 * step;
      run.panic = Math.max(0, run.panic);
      if (night) {
        const p = run.panic;
        if (p >= 40 && run.shades.length < Math.floor(p / 22) && rnd(run) < 0.025 * (p / 50) * step) {
          const a = rnd(run) * Math.PI * 2;
          const d = 320 + rnd(run) * 120;
          run.shades.push({ x: run.boat.x + Math.cos(a) * d, y: run.boat.y + Math.sin(a) * d, hp: 3, wob: rnd(run) * 6 });
        }
        if (p >= 60 && run.phantoms.length < 4 && rnd(run) < 0.03 * step) {
          const a = run.boat.heading + (rnd(run) - 0.5);
          const d = 150 + rnd(run) * 120;
          run.phantoms.push({ x: run.boat.x + Math.cos(a) * d, y: run.boat.y + Math.sin(a) * d, r: 14 + rnd(run) * 9, life: 25 });
          ev.push({ k: 'phantom' });
        }
        if (p >= 80 && rnd(run) < 0.008 * step) {
          ev.push({ k: 'ram', why: 'Something rams the hull!' });
          damage(run, w, 1, ev);
          if (run.docked >= 0) return;
        }
        const leaks = curseCount(run, 'leak');
        if (leaks && rnd(run) < 0.0015 * leaks * step) {
          ev.push({ k: 'ram', why: 'A leaking fish cracks the hull!' });
          damage(run, w, 1, ev);
          if (run.docked >= 0) return;
        }
        if (Math.floor(before / 30) !== Math.floor(run.minute / 30) && !run.event && run.panic >= 20 && run.nightEvents < 2 && rnd(run) < 0.3) {
          run.event = EVENTS[Math.floor(rnd(run) * EVENTS.length)].id;
          if (run.event === 'whispers' && !run.hold.some((i) => i.aberrant)) run.event = 'eyes';
          run.nightEvents++;
          ev.push({ k: 'event' });
        }
        if (run.panic >= 100) {
          run.panic = 75;
          ev.push({ k: 'ram', why: 'Panic! You steer blind and scrape the hull.' });
          damage(run, w, 1, ev);
          if (run.docked >= 0) return;
        }
      }
    }
    if (run.minute >= DAY_END) newDay(run, w, ev);
  }
}

function collide(run: Run, c: Circle, ev: SeaEvent[], w: World): void {
  const b = run.boat;
  const dx = b.x - c.x;
  const dy = b.y - c.y;
  const d = Math.hypot(dx, dy);
  const min = c.r + BOAT_R;
  if (d >= min || d === 0) return;
  const nx = dx / d;
  const ny = dy / d;
  b.x = c.x + nx * min;
  b.y = c.y + ny * min;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= 1.4 * vn * nx;
    b.vy -= 1.4 * vn * ny;
    const hard = -vn > 42 && b.inv <= 0;
    if (-vn > 12) ev.push({ k: 'bump', x: b.x - nx * BOAT_R, y: b.y - ny * BOAT_R, dmg: hard });
    if (hard) {
      run.panic += 6;
      damage(run, w, 1, ev);
    }
  }
}

/** One physics step at sea. */
export function tickSea(run: Run, w: World, inp: Input, dt: number): SeaEvent[] {
  const ev: SeaEvent[] = [];
  if (run.docked >= 0 || run.over) return ev;
  const b = run.boat;
  b.inv = Math.max(0, b.inv - dt);
  const maxV = boatMaxSpeed(run);
  const sp = speedOf(b);
  const throttle = Math.max(-0.5, Math.min(1, inp.throttle));
  const steer = Math.max(-1, Math.min(1, inp.steer));
  b.heading += steer * dt * (0.8 + 1.4 * Math.min(1, sp / 40));
  const fx = Math.cos(b.heading);
  const fy = Math.sin(b.heading);
  const accel = 75 * ENGINES[run.gear.engine].speed;
  b.vx += fx * throttle * accel * dt;
  b.vy += fy * throttle * accel * dt;
  let fwd = b.vx * fx + b.vy * fy;
  let lat = -b.vx * fy + b.vy * fx;
  fwd *= 1 - Math.min(1, dt * (Math.abs(throttle) < 0.05 ? 1.1 : 0.45));
  lat *= 1 - Math.min(1, dt * 3);
  fwd = Math.max(-maxV * 0.4, Math.min(maxV, fwd));
  b.vx = fx * fwd - fy * lat;
  b.vy = fy * fwd + fx * lat;
  const ox = b.x;
  const oy = b.y;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  // Locked regions: a wall of fog turns the boat back.
  const cell = cellOf(b.x, b.y);
  if (isLocked(run, w, cell)) {
    b.x = ox;
    b.y = oy;
    b.vx *= -0.4;
    b.vy *= -0.4;
    ev.push({ k: 'locked', region: w.region[cell] });
  }
  if (b.x < BOAT_R || b.x > WW - BOAT_R) {
    b.x = Math.max(BOAT_R, Math.min(WW - BOAT_R, b.x));
    b.vx *= -0.3;
  }
  if (b.y < BOAT_R || b.y > WH - BOAT_R) {
    b.y = Math.max(BOAT_R, Math.min(WH - BOAT_R, b.y));
    b.vy *= -0.3;
  }
  for (const c of w.islands) if (Math.abs(c.x - b.x) < c.r + 20 && Math.abs(c.y - b.y) < c.r + 20) collide(run, c, ev, w);
  for (const c of w.rocks) if (Math.abs(c.x - b.x) < c.r + 20 && Math.abs(c.y - b.y) < c.r + 20) collide(run, c, ev, w);
  for (const c of run.phantoms) collide(run, c, ev, w);
  if (run.docked >= 0) return ev;
  // Shades chase the boat. Lamp light burns them.
  const lamp = LAMPS[run.gear.lamp];
  for (const s of run.shades) {
    const dx = run.boat.x - s.x;
    const dy = run.boat.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const lit = d < lamp.radius;
    const v = lit ? 34 : 54;
    s.wob += dt * 3;
    s.x += (dx / d) * v * dt + Math.cos(s.wob) * 14 * dt;
    s.y += (dy / d) * v * dt + Math.sin(s.wob * 1.3) * 14 * dt;
    if (lit) s.hp -= lamp.burn * dt;
    if (s.hp <= 0) ev.push({ k: 'banish', x: s.x, y: s.y });
    else if (d < 20) {
      s.hp = -1;
      ev.push({ k: 'shade', x: s.x, y: s.y });
      run.panic += 10;
      damage(run, w, 1, ev);
      if (run.docked >= 0) return ev;
    }
  }
  run.shades = run.shades.filter((s) => s.hp > 0);
  run.phantoms.forEach((p) => (p.life -= dt));
  run.phantoms = run.phantoms.filter((p) => p.life > 0);
  // Time passes faster with the engine on.
  const mins = dt * (Math.abs(throttle) > 0.05 ? 6 : 1);
  advanceTime(run, w, mins, ev);
  if (run.docked < 0) reveal(run, run.boat.x, run.boat.y, Math.max(150, lightRadius(run) * 0.8));
  return ev;
}

// ---------- Fishing ----------

/** Index of the spot the boat can fish at, -1 if none. */
export function spotHere(run: Run, w: World): number {
  if (run.docked >= 0) return -1;
  let best = -1;
  let bd = Infinity;
  w.spots.forEach((s, i) => {
    const d = Math.hypot(s.x - run.boat.x, s.y - run.boat.y);
    if (d < s.r + 30 && d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

export function canFish(run: Run, w: World): { spot: number; why: string | null } {
  const s = spotHere(run, w);
  if (s < 0) return { spot: -1, why: 'No fish here' };
  if (run.stock[s] <= 0) return { spot: s, why: 'Fished out today' };
  if (speedOf(run.boat) > 32) return { spot: s, why: 'Slow down to cast' };
  return { spot: s, why: null };
}

export function fishTable(run: Run, w: World, spot: number): { f: FishDef; w: number }[] {
  const s = w.spots[spot];
  const reg = REGIONS[s.region].id;
  const night = isNight(run);
  const depth = Math.min(s.depth, rodDepth(run));
  return FISH.filter((f) => f.region === reg && f.depth <= depth && (f.time === 'any' || (f.time === 'night') === night)).map((f) => {
    let wt = f.weight;
    if (f.time === 'night' && run.gear.lure === 'glow') wt *= 2;
    if (f.weight < 1 && run.gear.lure === 'silver') wt *= 2.5;
    return { f, w: wt };
  });
}

export function aberrantChance(run: Run): number {
  return Math.min(0.45, 0.04 + (isNight(run) ? 0.12 : 0) + run.panic / 400 + (run.gear.lure === 'glow' ? 0.04 : 0));
}

/** Cast at a spot: costs time and stock, rolls the fish. Returns the reel, or null if the run changed (sinking, dawn end). */
export function cast(run: Run, w: World, spot: number, ev: SeaEvent[]): Reel | null {
  const table = fishTable(run, w, spot);
  run.stock[spot]--;
  run.boat.vx = 0;
  run.boat.vy = 0;
  const mult = (isNight(run) ? 1.1 : 1) * (run.panic >= 80 ? 1.15 : 1);
  const aberrant = rnd(run) < aberrantChance(run);
  const total = table.reduce((a, t) => a + t.w, 0);
  let roll = rnd(run) * total;
  let fish = table[0].f;
  for (const t of table) {
    roll -= t.w;
    if (roll < 0) {
      fish = t.f;
      break;
    }
  }
  const wait = (0.8 + rnd(run) * 1.6) * (run.gear.lure === 'spinner' ? 0.5 : 1);
  const reel = newReel(fish.id, aberrant, run.gear.rod, mult, wait, Math.floor(rnd(run) * 2 ** 31));
  advanceTime(run, w, run.gear.lure === 'spinner' ? 28 : 40, ev);
  if (run.over || run.docked >= 0) return null;
  return reel;
}

export const CURSE_IDS: CurseId[] = ['whisper', 'heavy', 'gnaw', 'leak'];

/** Result of a finished reel. Returns a message line. */
export function finishReel(run: Run, reel: Reel): { msg: string; unlocked: number } {
  const f = FISH_BY_ID[reel.fish];
  if (reel.result === 'broke') {
    let msg = 'The line snaps!';
    if (run.gear.lure !== 'plain' && rnd(run) < 0.4) {
      const l = LURE_BY_ID[run.gear.lure];
      run.gear.lures = run.gear.lures.filter((id) => id !== l.id);
      run.gear.lure = 'plain';
      msg += ` Your ${l.name} is gone.`;
    }
    return { msg, unlocked: -1 };
  }
  if (reel.result !== 'caught') return { msg: `The ${reel.aberrant ? 'strange fish' : f.name} got away.`, unlocked: -1 };
  const curse = reel.aberrant ? CURSE_IDS[Math.floor(rnd(run) * CURSE_IDS.length)] : null;
  const name = reel.aberrant ? `${ABERRANT_PREFIX[Math.floor(rnd(run) * ABERRANT_PREFIX.length)]} ${f.name}` : f.name;
  run.pending = { uid: run.uid++, fish: f.id, aberrant: reel.aberrant, curse, day: run.day, name };
  run.caught[f.id] = (run.caught[f.id] ?? 0) + 1;
  run.stats.fish++;
  if (reel.aberrant) run.stats.aberrant++;
  let unlocked = -1;
  if (f.unlocks) {
    const ri = REGIONS.findIndex((r) => r.id === f.unlocks);
    if (!run.unlocked.includes(ri)) {
      run.unlocked.push(ri);
      unlocked = ri;
    }
  }
  return { msg: `You land a ${name}!`, unlocked };
}

export function stowPending(run: Run, x: number, y: number, rot: number): boolean {
  const p = run.pending;
  if (!p) return false;
  const { w, h } = holdSize(run);
  if (!fits(run.hold, w, h, p.fish, rot, x, y)) return false;
  run.hold.push({ ...p, x, y, rot });
  run.pending = null;
  return true;
}

export function autoStow(run: Run): boolean {
  const p = run.pending;
  if (!p) return false;
  const { w, h } = holdSize(run);
  const s = findSpot(run.hold, w, h, p.fish);
  return !!s && stowPending(run, s.x, s.y, s.rot);
}

/** Take a stored fish out of the hold and carry it (to move it). Only when nothing else is carried. */
export function liftItem(run: Run, uid: number): boolean {
  if (run.pending) return false;
  const it = run.hold.find((i) => i.uid === uid);
  if (!it) return false;
  run.hold = run.hold.filter((i) => i.uid !== uid);
  const { uid: u, fish, aberrant, curse, day, name } = it;
  run.pending = { uid: u, fish, aberrant, curse, day, name };
  return true;
}

export function dropItem(run: Run, uid: number): void {
  run.hold = run.hold.filter((i) => i.uid !== uid);
}

// ---------- Ports ----------

export function dockHere(run: Run): number {
  if (run.docked >= 0) return -1;
  const i = PORTS.findIndex((p) => Math.hypot(p.dx - run.boat.x, p.dy - run.boat.y) < 75);
  return i;
}

export function dock(run: Run, port: number): void {
  run.docked = port;
  run.boat.vx = 0;
  run.boat.vy = 0;
  run.shades = [];
  run.phantoms = [];
  run.panic = Math.floor(run.panic / 2);
  run.boat.x = PORTS[port].dx;
  run.boat.y = PORTS[port].dy;
}

export function setSail(run: Run): void {
  const p = PORTS[run.docked];
  run.boat.x = p.dx;
  run.boat.y = p.dy;
  run.boat.heading = Math.atan2(p.dy - p.iy, p.dx - p.ix);
  run.boat.vx = Math.cos(run.boat.heading) * 25;
  run.boat.vy = Math.sin(run.boat.heading) * 25;
  run.docked = -1;
}

export function demandFish(run: Run, port: number): string {
  const reg = PORTS[port].region;
  const list = FISH.filter((f) => f.region === reg && f.weight >= 1);
  return list[hash(run.seed, 'demand', run.day, port) % list.length].id;
}

export function freshness(run: Run, it: Catch): number {
  return Math.max(0.4, 1 - 0.2 * (run.day - it.day));
}

export function price(run: Run, it: Catch, port: number): number {
  const f = FISH_BY_ID[it.fish];
  let v = f.value * freshness(run, it);
  if (it.aberrant) v *= PORTS[port].aberrant;
  if (demandFish(run, port) === it.fish) v *= 1.5;
  return Math.round(v);
}

export function sell(run: Run, uid: number): number {
  const it = run.hold.find((i) => i.uid === uid);
  if (!it || run.docked < 0) return 0;
  const p = price(run, it, run.docked);
  run.hold = run.hold.filter((i) => i.uid !== uid);
  run.money += p;
  run.stats.earned += p;
  run.stats.best = Math.max(run.stats.best, p);
  return p;
}

export function sellAll(run: Run): number {
  return [...run.hold].reduce((a, it) => a + sell(run, it.uid), 0);
}

export function gearTier(run: Run, cat: GearCat): number {
  return run.gear[cat];
}

/** Gear tiers for sale at the port the boat is docked in. */
export function shopFor(run: Run): { cat: GearCat; tier: number; cost: number }[] {
  if (run.docked < 0) return [];
  const p = PORTS[run.docked];
  const out: { cat: GearCat; tier: number; cost: number }[] = [];
  for (const cat of Object.keys(p.shop) as GearCat[]) {
    const max = p.shop[cat]!;
    for (let t = run.gear[cat] + 1; t <= max; t++) out.push({ cat, tier: t, cost: GEAR[cat].tiers[t].cost });
  }
  return out;
}

export function buyGear(run: Run, cat: GearCat, tier: number): boolean {
  const item = shopFor(run).find((s) => s.cat === cat && s.tier === tier);
  if (!item || run.money < item.cost) return false;
  run.money -= item.cost;
  const oldMax = maxHull(run);
  run.gear[cat] = tier;
  if (cat === 'hull') run.boat.hull += maxHull(run) - oldMax;
  return true;
}

export function buyLure(run: Run, id: string): boolean {
  const l = LURE_BY_ID[id];
  if (run.docked < 0 || !PORTS[run.docked].lures || run.gear.lures.includes(id) || run.money < l.cost) return false;
  run.money -= l.cost;
  run.gear.lures.push(id);
  run.gear.lure = id;
  return true;
}

export function equipLure(run: Run, id: string): void {
  if (run.gear.lures.includes(id)) run.gear.lure = id;
}

export const REPAIR_COST = 35;
export const KIT_COST = 60;

export function repair(run: Run): number {
  const need = maxHull(run) - run.boat.hull;
  const n = Math.min(need, Math.floor(run.money / REPAIR_COST));
  run.money -= n * REPAIR_COST;
  run.boat.hull += n;
  return n;
}

export function buyKit(run: Run): boolean {
  if (run.money < KIT_COST || run.gear.kits >= 2) return false;
  run.money -= KIT_COST;
  run.gear.kits++;
  return true;
}

export function useKit(run: Run): boolean {
  if (run.gear.kits <= 0 || run.boat.hull >= maxHull(run)) return false;
  run.gear.kits--;
  run.boat.hull++;
  return true;
}

export function pay(run: Run, amount: number): number {
  if (run.docked < 0 || !PORTS[run.docked].home) return 0;
  const n = Math.max(0, Math.min(amount, run.money, run.debt));
  run.money -= n;
  run.debt -= n;
  if (run.debt <= 0) endRun(run, true, `You paid off the boat on day ${run.day}. The boat is yours.`);
  return n;
}

export function sleep(run: Run, w: World): SeaEvent[] {
  const ev: SeaEvent[] = [];
  run.minute = DAY_END;
  newDay(run, w, ev);
  return ev;
}

export const species = (run: Run): number => Object.keys(run.caught).length;

export function score(run: Run, victory: boolean): number {
  const paid = run.debtStart - run.debt;
  if (victory) return 5000 + 300 * Math.max(0, LAST_DAY - run.day + 1) + species(run) * 25 + Math.round(Math.min(run.money, 4000) / 2);
  return Math.max(0, Math.round(paid * 0.3)) + species(run) * 25;
}

export function endRun(run: Run, victory: boolean, reason: string): void {
  const s = score(run, victory);
  run.over = { victory, score: s, reason, pearls: Math.floor(s / 400) };
}

// ---------- Night events ----------

export function eventChoice(run: Run, w: World, id: string, opt: number): string {
  run.event = null;
  const ev: SeaEvent[] = [];
  const hurt = (why: string): string => {
    damage(run, w, 1, ev);
    return why + (run.docked >= 0 ? ' The boat sinks. You wake up in Greyharbor.' : '');
  };
  const cheapest = (): HoldItem | null => run.hold.reduce<HoldItem | null>((a, it) => (!a || FISH_BY_ID[it.fish].value < FISH_BY_ID[a.fish].value ? it : a), null);
  switch (id) {
    case 'lantern':
      if (opt === 1) return 'You steer around it. The light follows you for a while, then goes out.';
      if (rnd(run) < 0.6) {
        const m = 40 + Math.floor(rnd(run) * 50);
        run.money += m;
        return `A purse is tied to the handle. +${m} coins.`;
      }
      run.panic += 15;
      return hurt('A cold hand grabs the side as you reach. The hull cracks. +15 panic.');
    case 'singing':
      if (opt === 0) {
        run.panic = Math.max(0, run.panic - 25);
        return 'The song is sad and kind. You feel calm. -25 panic.';
      }
      run.panic += 8;
      advanceTime(run, w, 20, ev);
      return 'The song stops. The silence is worse. +8 panic.';
    case 'drowned': {
      if (opt === 0) {
        const c = cheapest();
        if (!c) {
          run.panic += 10;
          return 'You have no fish. He sinks with a sigh. +10 panic.';
        }
        dropItem(run, c.uid);
        run.panic = Math.max(0, run.panic - 30);
        run.money += 30;
        return `He takes the ${c.name} and leaves a wet coin purse. +30 coins, -30 panic.`;
      }
      run.panic += 15;
      return 'He stares at you until the fog takes him. +15 panic.';
    }
    case 'whispers': {
      const odd = run.hold.find((i) => i.aberrant);
      if (opt === 0) {
        if (odd) dropItem(run, odd.uid);
        run.panic = Math.max(0, run.panic - 25);
        return odd ? `You throw the ${odd.name} overboard. The voice stops. -25 panic.` : 'Nothing to throw. The voice laughs.';
      }
      run.panic += 20;
      return 'It tells you where the big fish sleep. You forget it by morning. +20 panic.';
    }
    case 'eyes':
      if (opt === 0) {
        if (run.gear.lamp >= 1) {
          run.panic = Math.max(0, run.panic - 15);
          return 'The light scatters them. -15 panic.';
        }
        run.panic += 12;
        return 'Your candle is too weak. They come closer. +12 panic.';
      }
      advanceTime(run, w, 60, ev);
      run.panic = Math.max(0, run.panic - 12);
      return 'You wait an hour in the dark. The eyes close one by one. -12 panic.';
    case 'ghostship':
      if (opt === 0) {
        const spots = w.spots.map((s, i) => ({ s, i })).filter((o) => run.unlocked.includes(o.s.region));
        const pick = spots[Math.floor(rnd(run) * spots.length)];
        run.stock[pick.i] += 2;
        run.panic += 10;
        run.explored = run.explored.map((v, c) => (w.region[c] === pick.s.region ? 1 : v));
        return `They point toward a spot in ${REGIONS[pick.s.region].name}. It has 2 more fish today, and you see the whole region on the chart. +10 panic.`;
      }
      return 'You turn away. The ship sails on into the fog.';
    case 'tangle': {
      if (opt === 1) return 'You cut the line. Something big swims away.';
      if (rnd(run) < 0.5) {
        const m = 60 + Math.floor(rnd(run) * 80);
        run.money += m;
        return `An old chest! +${m} coins.`;
      }
      return hurt('A huge claw rips at the hull before it lets go.');
    }
    case 'bell':
      if (opt === 0) {
        if (rnd(run) < 0.5) {
          run.panic += 15;
          return 'Thirteen. Then fourteen. Then it does not stop. +15 panic.';
        }
        run.panic = Math.max(0, run.panic - 10);
        return 'Six rings. Dawn will come. -10 panic.';
      }
      run.panic = Math.max(0, run.panic - 5);
      return 'You hum to yourself until it stops. -5 panic.';
  }
  return '';
}

export { CURSES };
