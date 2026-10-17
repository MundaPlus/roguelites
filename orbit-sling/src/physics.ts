/**
 * Orbit physics. Bodies stay fixed during a shot, so the field is static and the
 * leapfrog (kick-drift-kick) integrator is symplectic: orbits keep their energy.
 * The aim line, the bot and the real shot all call `simulate`, so they match.
 */
import type { ShotId } from './data';

export const W = 400;
export const H = 560;
/** Fixed integration step in seconds. */
export const DT = 1 / 200;
/** Projectile radius. */
export const PR = 4;
/** Max flight time in steps (7 s). */
export const MAX_STEPS = 1400;
export const BASE_SPEED = 340;
export const MIN_POWER = 0.2;
const EPS2 = 36;
const MARGIN = 150;

export interface Orbit {
  cx: number;
  cy: number;
  R: number;
  a0: number;
  /** Radians per shot. */
  w: number;
}

export type BodyKind = 'planet' | 'giant' | 'ice' | 'lava' | 'blackhole' | 'repulsor' | 'moon';

export interface Body {
  kind: BodyKind;
  x: number;
  y: number;
  r: number;
  mu: number;
  hue: number;
  orbit?: Orbit;
}

export type TargetKind = 'beacon' | 'armored' | 'core' | 'crate';

export interface Target {
  kind: TargetKind;
  x: number;
  y: number;
  r: number;
  hp: number;
  max: number;
  orbit?: Orbit;
}

export interface Rock {
  x: number;
  y: number;
  r: number;
  alive: boolean;
}

export type Shield =
  | { kind: 'wall'; x1: number; y1: number; x2: number; y2: number; alive: boolean }
  | { kind: 'arc'; cx: number; cy: number; R: number; a0: number; span: number; w: number; alive: boolean };

/** A resolved layout at one turn: all moving things placed. */
export interface Scene {
  lx: number;
  ly: number;
  bodies: Body[];
  targets: (Target & { i: number })[];
  rocks: (Rock & { i: number })[];
  walls: { i: number; x1: number; y1: number; x2: number; y2: number }[];
  arcs: { i: number; cx: number; cy: number; R: number; a: number; span: number }[];
}

export interface Layout {
  lx: number;
  ly: number;
  bodies: Body[];
  targets: Target[];
  rocks: Rock[];
  shields: Shield[];
}

export const orbitPos = (o: Orbit, k: number): { x: number; y: number } => ({
  x: o.cx + o.R * Math.cos(o.a0 + o.w * k),
  y: o.cy + o.R * Math.sin(o.a0 + o.w * k),
});

/** Place moons, drifting targets and turning shields for turn `k`. */
export function sceneAt(l: Layout, k: number): Scene {
  const bodies = l.bodies.map((b) => (b.orbit ? { ...b, ...orbitPos(b.orbit, k) } : b));
  const targets = l.targets
    .map((t, i) => ({ ...t, ...(t.orbit ? orbitPos(t.orbit, k) : {}), i }))
    .filter((t) => t.hp > 0);
  const rocks = l.rocks.map((r, i) => ({ ...r, i })).filter((r) => r.alive);
  const walls: Scene['walls'] = [];
  const arcs: Scene['arcs'] = [];
  l.shields.forEach((s, i) => {
    if (!s.alive) return;
    if (s.kind === 'wall') walls.push({ i, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 });
    else arcs.push({ i, cx: s.cx, cy: s.cy, R: s.R, a: s.a0 + s.w * k, span: s.span });
  });
  return { lx: l.lx, ly: l.ly, bodies, targets, rocks, walls, arcs };
}

export interface ShotMods {
  speed: number;
  magnet: number;
  splitN: number;
  phaseN: number;
}

export interface ShotIn {
  angle: number;
  power: number;
  type: ShotId;
}

export type SimEvent =
  | { s: number; kind: 'hit'; ti: number; x: number; y: number; turn: number; kill: boolean; p: number }
  | { s: number; kind: 'crash' | 'swallow' | 'lost' | 'caught' | 'phase' | 'split' | 'timeout'; x: number; y: number; p: number }
  | { s: number; kind: 'break'; what: 'rock' | 'shield'; idx: number; x: number; y: number; p: number };

export interface ProjTrack {
  born: number;
  died: number;
  /** x, y per step from `born`. */
  pts: number[];
}

export interface SimResult {
  events: SimEvent[];
  tracks: ProjTrack[];
  steps: number;
  /** Damage per target index in the layout. */
  dmg: Map<number, number>;
  kills: number[];
  rocksBroken: number[];
  shieldsBroken: number[];
  caught: boolean;
  /** Hits that came after the shot turned 100+ degrees. */
  banks: number;
  /** Hits that came after the shot turned 300+ degrees. */
  orbits: number;
  hits: number;
}

interface Proj {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  alive: boolean;
  phaseLeft: number;
  inside: number;
  hitSet: number[];
  turn: number;
  heading: number;
  split: boolean;
  track: ProjTrack | null;
  id: number;
  t: number;
}

const wrap = (a: number): number => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

function segDist2(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const ex = x1 + t * dx - px;
  const ey = y1 + t * dy - py;
  return ex * ex + ey * ey;
}

/** Run one shot. `maxSteps` cuts it short (aim line). `record` keeps the paths. */
export function simulate(sc: Scene, shot: ShotIn, mods: ShotMods, maxSteps = MAX_STEPS, record = true): SimResult {
  const type = shot.type;
  const heavy = type === 'heavy';
  const gMul = heavy ? 1.6 : 1;
  const pr = heavy ? PR + 2 : PR;
  const bodies = sc.bodies;
  const nb = bodies.length;
  const tHp = sc.targets.map((t) => t.hp);
  const tAlive = sc.targets.map(() => true);
  const rockAlive = sc.rocks.map(() => true);
  const wallAlive = sc.walls.map(() => true);
  const arcAlive = sc.arcs.map(() => true);
  const res: SimResult = { events: [], tracks: [], steps: 0, dmg: new Map(), kills: [], rocksBroken: [], shieldsBroken: [], caught: false, banks: 0, orbits: 0, hits: 0 };
  const speed = BASE_SPEED * mods.speed * Math.max(MIN_POWER, Math.min(1, shot.power));
  const projs: Proj[] = [];

  const accel = (p: Proj): void => {
    let ax = 0;
    let ay = 0;
    for (let i = 0; i < nb; i++) {
      const b = bodies[i];
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const d2 = dx * dx + dy * dy + EPS2;
      const f = (b.mu * gMul) / (d2 * Math.sqrt(d2));
      ax += dx * f;
      ay += dy * f;
    }
    if (type === 'boomer' && p.t > 0.35) {
      const dx = sc.lx - p.x;
      const dy = sc.ly - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 1;
      ax += (dx / d) * 260;
      ay += (dy / d) * 260;
    }
    if (type === 'seeker') {
      let best = -1;
      let bd = Infinity;
      for (let j = 0; j < sc.targets.length; j++) {
        if (!tAlive[j] || p.hitSet.includes(j)) continue;
        const t = sc.targets[j];
        const d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      if (best >= 0) {
        const t = sc.targets[best];
        const d = Math.sqrt(bd) + 1;
        ax += ((t.x - p.x) / d) * 110;
        ay += ((t.y - p.y) / d) * 110;
      }
    }
    p.ax = ax;
    p.ay = ay;
  };

  const spawn = (x: number, y: number, vx: number, vy: number, from: Proj | null, s: number): Proj => {
    const p: Proj = {
      x,
      y,
      vx,
      vy,
      ax: 0,
      ay: 0,
      alive: true,
      phaseLeft: from ? from.phaseLeft : type === 'phase' ? mods.phaseN : 0,
      inside: from ? from.inside : -1,
      hitSet: from ? [...from.hitSet] : [],
      turn: from ? from.turn : 0,
      heading: Math.atan2(vy, vx),
      split: !!from,
      track: record ? { born: s, died: -1, pts: [x, y] } : null,
      id: projs.length,
      t: from ? from.t : 0,
    };
    if (p.track) res.tracks.push(p.track);
    accel(p);
    projs.push(p);
    return p;
  };

  spawn(sc.lx, sc.ly, Math.cos(shot.angle) * speed, Math.sin(shot.angle) * speed, null, 0);
  const kill = (p: Proj, s: number, kind: 'crash' | 'swallow' | 'lost' | 'caught' | 'timeout'): void => {
    p.alive = false;
    if (p.track) p.track.died = s;
    res.events.push({ s, kind, x: p.x, y: p.y, p: p.id });
  };

  let s = 0;
  for (s = 1; s <= maxSteps; s++) {
    let any = false;
    const n = projs.length;
    for (let pi = 0; pi < n; pi++) {
      const p = projs[pi];
      if (!p.alive) continue;
      any = true;
      // Kick, drift, kick.
      p.vx += p.ax * DT * 0.5;
      p.vy += p.ay * DT * 0.5;
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.t += DT;
      accel(p);
      p.vx += p.ax * DT * 0.5;
      p.vy += p.ay * DT * 0.5;
      const hd = Math.atan2(p.vy, p.vx);
      p.turn += wrap(hd - p.heading);
      p.heading = hd;
      if (p.track) p.track.pts.push(p.x, p.y);

      // Bodies.
      let dead = false;
      let insideNow = -1;
      for (let i = 0; i < nb; i++) {
        const b = bodies[i];
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const rr = b.r + pr;
        if (dx * dx + dy * dy < rr * rr) {
          if (b.kind === 'blackhole') {
            kill(p, s, 'swallow');
            dead = true;
            break;
          }
          if (p.inside === i) {
            insideNow = i;
            continue;
          }
          if (p.phaseLeft > 0) {
            p.phaseLeft--;
            insideNow = i;
            res.events.push({ s, kind: 'phase', x: p.x, y: p.y, p: p.id });
            continue;
          }
          kill(p, s, 'crash');
          dead = true;
          break;
        }
      }
      if (dead) continue;
      p.inside = insideNow;

      // Rocks.
      for (let j = 0; j < sc.rocks.length && !dead; j++) {
        if (!rockAlive[j]) continue;
        const r = sc.rocks[j];
        const rr = r.r + pr;
        if ((r.x - p.x) ** 2 + (r.y - p.y) ** 2 < rr * rr) {
          if (heavy) {
            rockAlive[j] = false;
            res.rocksBroken.push(r.i);
            res.events.push({ s, kind: 'break', what: 'rock', idx: r.i, x: r.x, y: r.y, p: p.id });
            p.vx *= 0.85;
            p.vy *= 0.85;
          } else {
            kill(p, s, 'crash');
            dead = true;
          }
        }
      }
      if (dead) continue;

      // Shields.
      for (let j = 0; j < sc.walls.length && !dead; j++) {
        if (!wallAlive[j]) continue;
        const w = sc.walls[j];
        if (segDist2(p.x, p.y, w.x1, w.y1, w.x2, w.y2) < (pr + 2) ** 2) {
          if (heavy) {
            wallAlive[j] = false;
            res.shieldsBroken.push(w.i);
            res.events.push({ s, kind: 'break', what: 'shield', idx: w.i, x: p.x, y: p.y, p: p.id });
            p.vx *= 0.75;
            p.vy *= 0.75;
          } else {
            kill(p, s, 'crash');
            dead = true;
          }
        }
      }
      for (let j = 0; j < sc.arcs.length && !dead; j++) {
        if (!arcAlive[j]) continue;
        const a = sc.arcs[j];
        const dx = p.x - a.cx;
        const dy = p.y - a.cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(d - a.R) < pr + 2) {
          let ang = Math.atan2(dy, dx) - a.a;
          ang = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          if (ang <= a.span) {
            if (heavy) {
              arcAlive[j] = false;
              res.shieldsBroken.push(a.i);
              res.events.push({ s, kind: 'break', what: 'shield', idx: a.i, x: p.x, y: p.y, p: p.id });
              p.vx *= 0.75;
              p.vy *= 0.75;
            } else {
              kill(p, s, 'crash');
              dead = true;
            }
          }
        }
      }
      if (dead) continue;

      // Targets: the shot flies through them.
      for (let j = 0; j < sc.targets.length; j++) {
        if (!tAlive[j] || p.hitSet.includes(j)) continue;
        const t = sc.targets[j];
        const rr = t.r + pr + mods.magnet;
        if ((t.x - p.x) ** 2 + (t.y - p.y) ** 2 < rr * rr) {
          p.hitSet.push(j);
          tHp[j]--;
          const killed = tHp[j] <= 0;
          if (killed) {
            tAlive[j] = false;
            res.kills.push(t.i);
          }
          res.dmg.set(t.i, (res.dmg.get(t.i) ?? 0) + 1);
          res.hits++;
          const turn = Math.abs(p.turn);
          if (turn >= (300 * Math.PI) / 180) res.orbits++;
          else if (turn >= (100 * Math.PI) / 180) res.banks++;
          res.events.push({ s, kind: 'hit', ti: t.i, x: t.x, y: t.y, turn, kill: killed, p: p.id });
        }
      }

      // Leave the field, come home, or split.
      if (p.x < -MARGIN || p.x > W + MARGIN || p.y < -MARGIN || p.y > H + MARGIN) {
        kill(p, s, 'lost');
        continue;
      }
      if (type === 'boomer' && p.t > 0.8 && (p.x - sc.lx) ** 2 + (p.y - sc.ly) ** 2 < 18 * 18) {
        res.caught = true;
        kill(p, s, 'caught');
        continue;
      }
      if (type === 'split' && !p.split && p.t >= 0.5) {
        p.split = true;
        res.events.push({ s, kind: 'split', x: p.x, y: p.y, p: p.id });
        const n2 = mods.splitN;
        const spread = 0.2;
        for (let k = 0; k < n2; k++) {
          const off = (k - (n2 - 1) / 2) * spread;
          if (Math.abs(off) < 1e-9) continue;
          const c = Math.cos(off);
          const sn = Math.sin(off);
          spawn(p.x, p.y, p.vx * c - p.vy * sn, p.vx * sn + p.vy * c, p, s);
        }
      }
    }
    if (!any) break;
  }
  res.steps = Math.min(s, maxSteps);
  for (const p of projs) {
    if (p.alive) {
      p.alive = false;
      if (p.track) p.track.died = res.steps;
      if (maxSteps >= MAX_STEPS) res.events.push({ s: res.steps, kind: 'timeout', x: p.x, y: p.y, p: p.id });
    }
  }
  return res;
}

/** Remaining required targets (crates are optional). */
export const requiredLeft = (l: Layout): number => l.targets.filter((t) => t.kind !== 'crate' && t.hp > 0).length;
