/** Simple bots for tests and balance sims. `good` plans paths and upgrades; `weak` sails straight at random spots. */
import { FISH_BY_ID, GEAR, LURE_BY_ID, NIGHT_START, PORTS, regionIndex, type GearCat } from './data';
import {
  autoStow,
  boatMaxSpeed,
  buyGear,
  buyKit,
  buyLure,
  canFish,
  dockHere,
  dropItem,
  fishTable,
  holdSize,
  isLocked,
  maxHull,
  pay,
  rnd,
  repair,
  sellAll,
  shopFor,
  speedOf,
  type Input,
  type Run,
} from './game';
import { cellCount, usedCells } from './hold';
import { findPath, type World } from './world';

export type Skill = 'good' | 'weak';

export interface BotMem {
  skill: Skill;
  target: { kind: 'spot' | 'port'; i: number } | null;
  path: { x: number; y: number }[];
  repath: number;
  stuck: number;
  backoff: number;
  bad: number[];
  day: number;
}

export const newMem = (skill: Skill): BotMem => ({ skill, target: null, path: [], repath: 0, stuck: 0, backoff: 0, bad: [], day: 0 });

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

function targetPos(w: World, t: { kind: 'spot' | 'port'; i: number }): { x: number; y: number } {
  return t.kind === 'spot' ? w.spots[t.i] : { x: PORTS[t.i].dx, y: PORTS[t.i].dy };
}

/** Expected coins per cast at a spot. */
export function spotValue(run: Run, w: World, i: number): number {
  const t = fishTable(run, w, i);
  const tot = t.reduce((a, x) => a + x.w, 0);
  return t.reduce((a, x) => a + x.w * x.f.value * (x.f.unlocks && !run.unlocked.includes(regionIndex(x.f.unlocks)) ? 8 : 1), 0) / Math.max(1e-6, tot);
}

const holdValue = (run: Run): number => run.hold.reduce((a, it) => a + FISH_BY_ID[it.fish].value * (it.aberrant ? 2.2 : 1), 0);

/** Minutes of sailing to cover a distance. */
const travelMins = (run: Run, d: number): number => (d / (boatMaxSpeed(run) * 0.75)) * 6;

function chooseTarget(run: Run, w: World, m: BotMem): BotMem['target'] {
  const b = run.boat;
  const { w: hw, h: hh } = holdSize(run);
  const free = hw * hh - usedCells(run.hold);
  const ports = PORTS.map((p, i) => ({ p, i })).filter((o) => run.unlocked.includes(['shallows', 'kelp', 'coral', 'ash', 'trench'].indexOf(o.p.region)));
  const nearestPort = ports.reduce((a, o) => (dist(b.x, b.y, o.p.dx, o.p.dy) < dist(b.x, b.y, a.p.dx, a.p.dy) ? o : a));
  if (m.skill === 'weak') {
    if (free < 3 || run.minute >= NIGHT_START) return { kind: 'port', i: nearestPort.i };
    const opts = w.spots.map((_, i) => i).filter((i) => run.stock[i] > 0 && run.unlocked.includes(w.spots[i].region) && !m.bad.includes(i));
    if (!opts.length) return { kind: 'port', i: nearestPort.i };
    return { kind: 'spot', i: opts[Math.floor(rnd(run) * opts.length)] };
  }
  const homeBound = run.day >= 10 || run.money + holdValue(run) >= run.debt ? 0 : nearestPort.i;
  const port = PORTS[homeBound];
  const homeMins = travelMins(run, dist(b.x, b.y, port.dx, port.dy));
  if (free < 3 || run.minute + homeMins + 30 > NIGHT_START + (run.gear.lamp >= 2 ? 150 : 0)) return { kind: 'port', i: homeBound };
  let best = -1;
  let bs = 0;
  w.spots.forEach((s, i) => {
    if (run.stock[i] <= 0 || !run.unlocked.includes(s.region) || m.bad.includes(i)) return;
    const d = dist(b.x, b.y, s.x, s.y);
    const back = PORTS.reduce((a, p) => Math.min(a, dist(s.x, s.y, p.dx, p.dy)), Infinity);
    if (run.minute + travelMins(run, d) + 35 + travelMins(run, back) > NIGHT_START + (run.gear.lamp >= 2 ? 150 : 0)) return;
    const sc = (spotValue(run, w, i) * Math.min(3, run.stock[i])) / (travelMins(run, d) + 32 * Math.min(3, run.stock[i]));
    if (sc > bs) {
      bs = sc;
      best = i;
    }
  });
  return best >= 0 ? { kind: 'spot', i: best } : { kind: 'port', i: homeBound };
}

function steerTo(run: Run, x: number, y: number): number {
  const b = run.boat;
  let diff = Math.atan2(y - b.y, x - b.x) - b.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.max(-1, Math.min(1, diff * 2.5));
}

/** One bot control step at sea. Returns input and an action. */
export function botSea(run: Run, w: World, m: BotMem, dt: number): { inp: Input; act: 'fish' | 'dock' | null } {
  if (m.day !== run.day) {
    m.day = run.day;
    m.bad = [];
    m.target = null;
  }
  const b = run.boat;
  const idle = { inp: { throttle: 0, steer: 0 }, act: null };
  // Re-plan when the target is gone or every few seconds.
  m.repath -= dt;
  if (!m.target || (m.target.kind === 'spot' && run.stock[m.target.i] <= 0) || m.repath <= 0) {
    const t = chooseTarget(run, w, m);
    const changed = !m.target || !t || t.kind !== m.target.kind || t.i !== m.target.i;
    m.target = t;
    m.repath = 3;
    if (t && (changed || m.skill === 'good')) {
      const p = targetPos(w, t);
      {
        const path = findPath(w, (c) => isLocked(run, w, c), b.x, b.y, p.x, p.y);
        if (!path) {
          if (t.kind === 'spot') m.bad.push(t.i);
          m.target = null;
          return idle;
        }
        m.path = path;
      }
    }
  }
  if (!m.target) return idle;
  const tp = targetPos(w, m.target);
  const dT = dist(b.x, b.y, tp.x, tp.y);
  const sp = speedOf(b);
  if (m.target.kind === 'port' && dockHere(run) === m.target.i) return { inp: { throttle: 0, steer: 0 }, act: 'dock' };
  if (m.target.kind === 'spot' && dT < w.spots[m.target.i].r + 22) {
    const cf = canFish(run, w);
    if (cf.spot === m.target.i && !cf.why) return { inp: { throttle: 0, steer: 0 }, act: 'fish' };
    return { inp: { throttle: sp > 20 ? -0.5 : 0, steer: 0 }, act: null };
  }
  // Stuck: back off and re-plan.
  if (m.backoff > 0) {
    m.backoff -= dt;
    return { inp: { throttle: -0.5, steer: 0.6 }, act: null };
  }
  if (sp < 6) m.stuck += dt;
  else m.stuck = Math.max(0, m.stuck - dt);
  if (m.stuck > 2.5) {
    m.stuck = 0;
    m.backoff = 1.2;
    m.repath = 0;
    if (m.skill === 'weak' && m.target.kind === 'spot') {
      m.bad.push(m.target.i);
      m.target = null;
    }
  }
  while (m.path.length > 1 && dist(b.x, b.y, m.path[0].x, m.path[0].y) < 55) m.path.shift();
  // Look ahead along the path when the next points are close.
  const wp = m.path[0] ?? tp;
  let steer = steerTo(run, wp.x, wp.y);
  const slow = Math.min(1, dT / 140);
  const turnSlow = Math.abs(steer) > 0.8 ? 0.45 : 1;
  let want = boatMaxSpeed(run) * Math.max(0.25, slow) * turnSlow;
  // Avoid rocks and shores ahead: steer away and slow below the damage speed.
  if (m.skill === 'good') {
    const fx = Math.cos(b.heading);
    const fy = Math.sin(b.heading);
    for (const c of [...w.rocks, ...run.phantoms, ...w.islands]) {
      const dx = c.x - b.x;
      const dy = c.y - b.y;
      const gap = Math.hypot(dx, dy) - c.r - 12;
      if (gap > 70) continue;
      const ahead = (dx * fx + dy * fy) / (Math.hypot(dx, dy) || 1);
      if (ahead < 0.3) continue;
      const side = dx * fy - dy * fx;
      steer += (side > 0 ? 1 : -1) * (1 - gap / 70) * 1.2;
      want = Math.min(want, 30);
    }
    steer = Math.max(-1, Math.min(1, steer));
  }
  const throttle = sp < want ? 1 : sp > want + 15 ? -0.3 : 0.1;
  return { inp: { throttle, steer }, act: null };
}

/** Pick a hold spot for the pending catch. Good bots dump cheaper fish to make room. */
export function botStow(run: Run, m: BotMem): void {
  if (!run.pending) return;
  if (autoStow(run)) return;
  if (m.skill === 'good') {
    const pv = FISH_BY_ID[run.pending.fish].value * (run.pending.aberrant ? 2.2 : 1);
    const cheap = [...run.hold].sort((a, b) => FISH_BY_ID[a.fish].value - FISH_BY_ID[b.fish].value);
    let freed = 0;
    for (const it of cheap) {
      if (FISH_BY_ID[it.fish].value * (it.aberrant ? 2.2 : 1) >= pv) break;
      dropItem(run, it.uid);
      freed += cellCount(it.fish);
      if (freed >= cellCount(run.pending.fish) && autoStow(run)) return;
    }
    if (autoStow(run)) return;
  }
  run.pending = null;
}

const GOOD_EVENT: Record<string, number> = { lantern: 0, singing: 0, drowned: 0, whispers: 0, eyes: 0, ghostship: 1, tangle: 1, bell: 1 };

export function botEvent(run: Run, m: BotMem): number {
  const id = run.event!;
  if (m.skill === 'weak') return rnd(run) < 0.5 ? 0 : 1;
  if (id === 'eyes') return run.gear.lamp >= 1 ? 0 : 1;
  if (id === 'lantern' && run.boat.hull <= 1) return 1;
  return GOOD_EVENT[id] ?? 0;
}

const BUY_ORDER: [GearCat, number][] = [
  ['hold', 1],
  ['rod', 1],
  ['lamp', 1],
  ['engine', 1],
  ['hull', 1],
  ['hold', 2],
  ['rod', 2],
  ['engine', 2],
  ['lamp', 2],
  ['hull', 2],
  ['hold', 3],
  ['rod', 3],
  ['engine', 3],
];

/** Port turn: sell, repair, buy, pay. Returns 'sleep' or 'sail'. */
export function botPort(run: Run, m: BotMem): 'sleep' | 'sail' {
  sellAll(run);
  if (run.boat.hull < maxHull(run)) repair(run);
  if (m.skill === 'good') {
    const reserve = 40;
    const investUntil = 9;
    if (run.day <= investUntil) {
      for (const [cat, tier] of BUY_ORDER) {
        if (run.gear[cat] >= tier) continue;
        const s = shopFor(run).find((o) => o.cat === cat && o.tier === tier);
        if (s && run.money >= s.cost + reserve) buyGear(run, cat, tier);
      }
      if (PORTS[run.docked].lures) {
        for (const id of ['spinner', 'silver']) if (!run.gear.lures.includes(id) && run.money >= LURE_BY_ID[id].cost + reserve + 100) buyLure(run, id);
        if (run.gear.lures.includes('spinner')) run.gear.lure = 'spinner';
      }
      if (run.gear.kits < 1 && run.money > 200) buyKit(run);
    }
    if (PORTS[run.docked].home && (run.day > investUntil || run.money >= run.debt)) pay(run, run.money);
    else if (PORTS[run.docked].home && run.day >= 5) pay(run, run.money - 300);
  } else if (PORTS[run.docked].home) pay(run, run.money);
  if (run.over) return 'sleep';
  return run.minute >= 1000 ? 'sleep' : 'sail';
}

export const gearName = (cat: GearCat, tier: number): string => GEAR[cat].tiers[tier].name;
