/** Seeded system generation. Every layout is checked: each target must be reachable. */
import { Rng, hash } from './rng';
import { H, W, sceneAt, simulate, type Body, type BodyKind, type Layout, type Rock, type Shield, type Target } from './physics';

export type SysKind = 'system' | 'hard' | 'boss';

export interface Sys extends Layout {
  kind: SysKind;
  sector: number;
  name: string;
  /** Turn counter: moons, drifting targets and shields move once per shot. */
  turn: number;
  shots: number;
  used: number;
  missed: number;
  credits: number;
  banks: number;
  orbits: number;
  /** Seed for the background stars. */
  seed: number;
}

const DENS: Record<BodyKind, number> = { planet: 820, giant: 520, ice: 1000, lava: 900, moon: 1000, blackhole: 0, repulsor: 0 };
const NAMES_A = ['Vela', 'Kepler', 'Tycho', 'Lyra', 'Orion', 'Cetus', 'Draco', 'Hydra', 'Nova', 'Pavo', 'Ara', 'Mensa', 'Volans', 'Corvus', 'Indus'];
const NAMES_B = ['Prime', 'Reach', 'Gate', 'Deep', 'Ring', 'Spur', 'Cross', 'Well', 'Fold', 'Drift'];

function body(kind: BodyKind, x: number, y: number, r: number, hue: number): Body {
  let mu = DENS[kind] * r * r;
  if (kind === 'blackhole') mu = 1_300_000;
  if (kind === 'repulsor') mu = -420_000;
  return { kind, x, y, r, mu, hue };
}

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

/** True when a point keeps `gap` clear of every body and moon orbit. */
function clearOf(l: Layout, x: number, y: number, gap: number): boolean {
  for (const b of l.bodies) {
    if (b.orbit) {
      const d = dist(x, y, b.orbit.cx, b.orbit.cy);
      if (Math.abs(d - b.orbit.R) < b.r + gap) return false;
    } else if (dist(x, y, b.x, b.y) < b.r + gap + (b.kind === 'blackhole' ? 25 : 0)) return false;
  }
  return true;
}

function placeBodies(rng: Rng, l: Layout, sector: number, kind: SysKind): void {
  const nPlan = Math.min(4, 1 + (sector >= 1 ? 1 : 0) + rng.int(0, 1) + (kind === 'hard' ? 1 : 0));
  const kinds: BodyKind[] = ['planet', 'planet', 'ice', 'lava', 'giant'];
  const want: BodyKind[] = [];
  for (let i = 0; i < nPlan; i++) want.push(rng.pick(kinds));
  if (sector === 3) want.push('blackhole');
  if (sector === 3 && kind === 'hard') want.push('blackhole');
  if (sector === 4 && rng.chance(0.6)) want.push('blackhole');
  if (sector === 2 && rng.chance(0.7)) want.push('repulsor');
  if (sector === 4 && rng.chance(0.4)) want.push('repulsor');
  for (const k of want) {
    const r = k === 'giant' ? rng.int(34, 42) : k === 'ice' ? rng.int(15, 21) : k === 'lava' ? rng.int(19, 26) : k === 'blackhole' ? 9 : k === 'repulsor' ? 12 : rng.int(22, 30);
    for (let tries = 0; tries < 40; tries++) {
      const x = rng.int(r + 20, W - r - 20);
      const y = rng.int(110, H - 150);
      if (dist(x, y, l.lx, l.ly) < r + 110) continue;
      if (l.bodies.some((b) => dist(x, y, b.x, b.y) < b.r + r + 60)) continue;
      l.bodies.push(body(k, x, y, r, rng.int(0, 359)));
      break;
    }
  }
  // Moons.
  const nMoons = sector === 0 ? (kind === 'hard' ? 1 : 0) : sector === 1 ? rng.int(1, 2) : rng.int(0, 2);
  const parents = l.bodies.filter((b) => b.kind !== 'blackhole' && b.kind !== 'repulsor');
  for (let i = 0; i < nMoons && parents.length; i++) {
    const p = rng.pick(parents);
    const r = rng.int(7, 10);
    const R = p.r + rng.int(24, 40);
    const a0 = rng.next() * Math.PI * 2;
    const w = (rng.chance(0.5) ? 1 : -1) * (0.5 + rng.next() * 0.6);
    const m = body('moon', 0, 0, r, rng.int(0, 359));
    m.orbit = { cx: p.x, cy: p.y, R, a0, w };
    m.x = p.x + R * Math.cos(a0);
    m.y = p.y + R * Math.sin(a0);
    l.bodies.push(m);
  }
}

function placeTargets(rng: Rng, l: Layout, sector: number, kind: SysKind): void {
  const n = Math.min(5, 2 + (sector >= 2 ? 1 : 0) + rng.int(0, 1) + (kind === 'hard' ? 1 : 0));
  const armorP = Math.min(0.45, 0.15 * sector);
  const fixed = l.bodies.filter((b) => !b.orbit && b.kind !== 'blackhole' && b.kind !== 'repulsor');
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 60; tries++) {
      const armored = rng.chance(armorP);
      const t: Target = { kind: armored ? 'armored' : 'beacon', x: 0, y: 0, r: armored ? 11 : 10, hp: armored ? 2 : 1, max: armored ? 2 : 1 };
      if (sector >= 1 && fixed.length && rng.chance(0.25)) {
        const p = rng.pick(fixed);
        const R = p.r + rng.int(36, 56);
        if (p.x - R < 20 || p.x + R > W - 20 || p.y - R < 20 || p.y + R > H - 120) continue;
        const a0 = rng.next() * Math.PI * 2;
        t.orbit = { cx: p.x, cy: p.y, R, a0, w: (rng.chance(0.5) ? 1 : -1) * (0.3 + rng.next() * 0.35) };
        t.x = p.x + R * Math.cos(a0);
        t.y = p.y + R * Math.sin(a0);
        if (l.bodies.some((b) => b !== p && dist(b.x, b.y, p.x, p.y) < R + b.r + 16 && dist(b.x, b.y, p.x, p.y) > R - b.r - 16)) continue;
      } else {
        t.x = rng.int(25, W - 25);
        t.y = rng.int(30, Math.round(H * 0.62));
        if (!clearOf(l, t.x, t.y, 22)) continue;
      }
      if (dist(t.x, t.y, l.lx, l.ly) < 210) continue;
      if (l.targets.some((o) => dist(o.x, o.y, t.x, t.y) < 44)) continue;
      l.targets.push(t);
      break;
    }
  }
  if (rng.chance(0.45)) {
    for (let tries = 0; tries < 30; tries++) {
      const x = rng.int(25, W - 25);
      const y = rng.int(30, H - 200);
      if (!clearOf(l, x, y, 22) || l.targets.some((o) => dist(o.x, o.y, x, y) < 40)) continue;
      l.targets.push({ kind: 'crate', x, y, r: 9, hp: 1, max: 1 });
      break;
    }
  }
}

function placeRocks(rng: Rng, l: Layout, sector: number, kind: SysKind): void {
  const n = sector === 2 ? rng.int(7, 11) : sector === 0 ? rng.int(0, 3) : rng.int(2, 5);
  const total = n + (kind === 'hard' ? 2 : 0);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < total; i++) {
    if (i % 4 === 0) {
      cx = rng.int(40, W - 40);
      cy = rng.int(120, H - 130);
    }
    for (let tries = 0; tries < 20; tries++) {
      const r = rng.int(6, 10);
      const x = cx + rng.int(-45, 45);
      const y = cy + rng.int(-35, 35);
      if (x < 10 || x > W - 10 || dist(x, y, l.lx, l.ly) < 80) continue;
      if (!clearOf(l, x, y, r + 8)) continue;
      if (l.targets.some((t) => dist(t.x, t.y, x, y) < t.r + r + 18)) continue;
      if (l.rocks.some((o) => dist(o.x, o.y, x, y) < o.r + r + 4)) continue;
      l.rocks.push({ x, y, r, alive: true });
      break;
    }
  }
}

function placeShields(rng: Rng, l: Layout, sector: number, kind: SysKind): void {
  if (sector === 0) return;
  const n = rng.int(1, 2) + (kind === 'hard' ? 1 : 0);
  const fixedT = l.targets.filter((t) => !t.orbit && t.kind !== 'crate');
  for (let i = 0; i < n && fixedT.length; i++) {
    const t = rng.pick(fixedT);
    if (sector >= 4 && rng.chance(0.5)) {
      l.shields.push({ kind: 'arc', cx: t.x, cy: t.y, R: 24, a0: rng.next() * 6.28, span: 3.3, w: (rng.chance(0.5) ? 1 : -1) * 0.8, alive: true });
      continue;
    }
    // A wall in front of the target, across the line from the launcher.
    const a = Math.atan2(l.ly - t.y, l.lx - t.x) + (rng.next() - 0.5) * 1.2;
    const d = rng.int(28, 38);
    const mx = t.x + Math.cos(a) * d;
    const my = t.y + Math.sin(a) * d;
    const half = rng.int(22, 34);
    const px = -Math.sin(a) * half;
    const py = Math.cos(a) * half;
    l.shields.push({ kind: 'wall', x1: mx - px, y1: my - py, x2: mx + px, y2: my + py, alive: true });
  }
}

function bossLayout(rng: Rng, sector: number): Layout {
  const l: Layout = { lx: rng.int(110, 290), ly: H - 30, bodies: [], targets: [], rocks: [], shields: [] };
  const core = (x: number, y: number, hp: number): Target => ({ kind: 'core', x, y, r: 14, hp, max: hp });
  const arc = (cx: number, cy: number, R: number, span: number, w: number): Shield => ({ kind: 'arc', cx, cy, R, a0: rng.next() * 6.28, span, w, alive: true });
  const cx = W / 2;
  switch (sector) {
    case 0: {
      const x = cx + rng.int(-60, 60);
      l.targets.push(core(x, 105, 3));
      l.shields.push(arc(x, 105, 36, 3.9, 0.9));
      l.bodies.push(body('planet', cx + rng.int(-70, 70), 300, 28, rng.int(0, 359)));
      l.targets.push({ kind: 'beacon', x: rng.chance(0.5) ? 60 : W - 60, y: 200, r: 10, hp: 1, max: 1 });
      break;
    }
    case 1: {
      l.targets.push(core(105, 115, 2), core(295, 115, 2));
      l.shields.push(arc(105, 115, 32, 3.6, 0.8), arc(295, 115, 32, 3.6, -0.8));
      const p = body('giant', cx, 270, 36, rng.int(0, 359));
      l.bodies.push(p);
      for (let i = 0; i < 2; i++) {
        const m = body('moon', 0, 0, 9, rng.int(0, 359));
        const a0 = rng.next() * 6.28 + i * Math.PI;
        m.orbit = { cx: p.x, cy: p.y, R: 70, a0, w: 0.7 };
        m.x = p.x + 70 * Math.cos(a0);
        m.y = p.y + 70 * Math.sin(a0);
        l.bodies.push(m);
      }
      break;
    }
    case 2: {
      const x = cx + rng.int(-50, 50);
      const y = 125;
      l.targets.push(core(x, y, 4));
      const gap = rng.int(0, 11);
      for (let i = 0; i < 12; i++) {
        if (i === gap || i === (gap + 6) % 12) continue;
        const a = (i / 12) * Math.PI * 2;
        l.rocks.push({ x: x + Math.cos(a) * 46, y: y + Math.sin(a) * 46, r: 9, alive: true });
      }
      l.bodies.push(body('repulsor', cx + rng.int(-40, 40), 300, 12, 0));
      l.bodies.push(body('planet', 70, 250, 24, rng.int(0, 359)), body('ice', W - 70, 250, 18, rng.int(0, 359)));
      break;
    }
    case 3: {
      const bx = cx + rng.int(-40, 40);
      const by = 200;
      l.bodies.push(body('blackhole', bx, by, 9, 0));
      const c = core(0, 0, 4);
      const a0 = rng.next() * 6.28;
      c.orbit = { cx: bx, cy: by, R: 78, a0, w: 0.55 };
      c.x = bx + 78 * Math.cos(a0);
      c.y = by + 78 * Math.sin(a0);
      l.targets.push(c);
      l.bodies.push(body('lava', rng.chance(0.5) ? 70 : W - 70, 360, 22, rng.int(0, 359)));
      l.targets.push({ kind: 'armored', x: rng.chance(0.5) ? 50 : W - 50, y: 60, r: 11, hp: 2, max: 2 });
      break;
    }
    default: {
      l.targets.push(core(cx, 100, 5));
      l.shields.push(arc(cx, 100, 30, 3.2, 0.7), arc(cx, 100, 46, 3.2, -0.5));
      const p = body('planet', cx + rng.int(-30, 30), 290, 26, rng.int(0, 359));
      l.bodies.push(p);
      const m = body('moon', 0, 0, 10, rng.int(0, 359));
      const a0 = rng.next() * 6.28;
      m.orbit = { cx: p.x, cy: p.y, R: 62, a0, w: -0.8 };
      m.x = p.x + 62 * Math.cos(a0);
      m.y = p.y + 62 * Math.sin(a0);
      l.bodies.push(m);
      l.bodies.push(body('repulsor', rng.chance(0.5) ? 70 : W - 70, 190, 12, 0));
      l.bodies.push(body('blackhole', rng.chance(0.5) ? 60 : W - 60, 400, 9, 0));
      l.targets.push({ kind: 'armored', x: rng.chance(0.5) ? 60 : W - 60, y: 70, r: 11, hp: 2, max: 2 });
      break;
    }
  }
  return l;
}

const CHECK_MODS = { speed: 1, magnet: 0, splitN: 3, phaseN: 1 };

/** Which required targets a plain shot can hit at turn 0 (coarse grid). */
export function reachable(l: Layout, angles = 64, powers = 6): Set<number> {
  const sc = sceneAt(l, 0);
  const need = new Set(l.targets.map((t, i) => (t.kind === 'crate' ? -1 : i)).filter((i) => i >= 0));
  const got = new Set<number>();
  for (let pi = 0; pi < powers; pi++) {
    const power = 0.35 + (0.65 * pi) / (powers - 1);
    for (let ai = 0; ai < angles; ai++) {
      const angle = Math.PI + 0.08 + ((Math.PI - 0.16) * ai) / (angles - 1);
      const r = simulate(sc, { angle, power, type: 'std' }, CHECK_MODS, 1000, false);
      for (const k of r.dmg.keys()) got.add(k);
      if ([...need].every((i) => got.has(i))) return got;
    }
  }
  return got;
}

export function shotsFor(l: Layout, kind: SysKind, extra: number): number {
  const hp = l.targets.filter((t) => t.kind !== 'crate').reduce((a, t) => a + t.hp, 0);
  return hp + (kind === 'system' ? 2 : kind === 'hard' ? 1 : 2) + extra;
}

export function genSystem(seed: number, sector: number, kind: SysKind, extraShots: number): Sys {
  let best: Layout | null = null;
  let bestMiss = Infinity;
  let rng = new Rng(seed);
  for (let attempt = 0; attempt < 30; attempt++) {
    rng = new Rng(hash(seed, attempt));
    let l: Layout;
    if (kind === 'boss') l = bossLayout(rng, sector);
    else {
      l = { lx: rng.int(50, W - 50), ly: H - 30, bodies: [], targets: [], rocks: [], shields: [] };
      placeBodies(rng, l, sector, kind);
      placeTargets(rng, l, sector, kind);
      placeRocks(rng, l, sector, kind);
      placeShields(rng, l, sector, kind);
      if (l.targets.filter((t) => t.kind !== 'crate').length < 2) continue;
    }
    const got = reachable(l);
    const miss = l.targets.filter((t, i) => t.kind !== 'crate' && !got.has(i)).length;
    if (miss < bestMiss) {
      best = l;
      bestMiss = miss;
    }
    if (miss === 0) break;
  }
  const l = best!;
  if (bestMiss > 0 && kind !== 'boss') {
    // Drop targets that no shot can reach.
    const got = reachable(l, 96, 8);
    l.targets = l.targets.filter((t, i) => t.kind === 'crate' || got.has(i));
  }
  const name = `${rng.pick(NAMES_A)} ${rng.pick(NAMES_B)}`;
  return {
    ...l,
    kind,
    sector,
    name,
    turn: 0,
    shots: shotsFor(l, kind, extraShots) + (sector === 0 ? 1 : 0),
    used: 0,
    missed: 0,
    credits: 0,
    banks: 0,
    orbits: 0,
    seed,
  };
}

export type { Rock };
