/** Builds a hole from hand-made pieces picked with a seed. */
import { BOSSES, ZONES } from './data';
import { CUP_D, CUP_HW, R, buildGrid, type Block, type Course, type Cup, type Pickup, type Pt, type Surface } from './physics';
import { Rng } from './rng';

export type HoleKind = 'hole' | 'curse' | 'shortcut' | 'boss';

export interface HoleSpec {
  seed: number;
  zone: number;
  kind: HoleKind;
  curse: string | null;
}

export interface BuiltHole {
  course: Course;
  wind: number;
  /** Rough length from tee to the first cup, used for the shot count. */
  len: number;
  hazards: number;
}

class Builder {
  pts: Pt[] = [];
  x = 0;
  y = 0;
  blocks: Block[] = [];
  marks: { x: number; y: number }[] = [];

  add(dx: number, dy: number, s: Surface): void {
    this.x += dx;
    this.y += dy;
    this.pts.push({ x: Math.round(this.x * 10) / 10, y: Math.round(this.y * 10) / 10, s });
  }

  /** Smooth ramp by dy over len. */
  ramp(len: number, dy: number, s: Surface, n = 6): void {
    const y0 = this.y;
    const x0 = this.x;
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const ty = y0 + dy * (0.5 - 0.5 * Math.cos(Math.PI * k));
      this.add(x0 + len * k - this.x, ty - this.y, s);
    }
  }

  /** Hill (h > 0) or valley (h < 0) that ends at the same height. */
  bump(len: number, h: number, s: Surface, n = 8): void {
    const y0 = this.y;
    const x0 = this.x;
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const ty = y0 - h * Math.sin(Math.PI * k);
      this.add(x0 + len * k - this.x, ty - this.y, s);
    }
  }

  mark(): void {
    this.marks.push({ x: this.x, y: this.y });
  }
}

function piece(b: Builder, kind: string, rng: Rng, zone: number): number {
  const high = b.y < -150;
  const low = b.y > 60;
  let hz = 0;
  switch (kind) {
    case 'flat':
      b.add(rng.int(120, 200), 0, 'grass');
      b.mark();
      break;
    case 'hill':
      b.mark();
      b.bump(rng.int(200, 320), rng.int(40, 110), 'grass');
      break;
    case 'dip':
      b.bump(rng.int(200, 300), -rng.int(30, 70), 'grass');
      b.mark();
      break;
    case 'ramp': {
      const up = low || (!high && rng.chance(0.5));
      b.ramp(rng.int(160, 260), (up ? -1 : 1) * rng.int(40, 90), 'grass');
      b.mark();
      break;
    }
    case 'bunker':
      b.add(30, 0, 'grass');
      b.add(16, 18, 'sand');
      b.mark();
      b.add(rng.int(60, 120), 0, 'sand');
      b.add(16, -18, 'sand');
      b.add(30, 0, 'grass');
      hz = 1;
      break;
    case 'desert':
      b.add(20, 0, 'grass');
      b.mark();
      b.bump(rng.int(180, 260), rng.int(15, 35), 'sand');
      b.add(20, 0, 'grass');
      hz = 1;
      break;
    case 'pond':
      b.add(30, 0, 'grass');
      b.add(18, 32, 'grass');
      b.mark();
      b.add(rng.int(80, 170), 0, 'water');
      b.add(18, -32, 'grass');
      b.add(30, 0, 'grass');
      hz = 2;
      break;
    case 'plateau': {
      const h = rng.int(50, 90);
      if (high) {
        b.add(h * 0.4, h, 'rock');
        b.add(rng.int(120, 200), 0, 'grass');
      } else {
        b.add(h * 0.4, -h, 'rock');
        b.mark();
        b.add(rng.int(120, 200), 0, 'grass');
        b.add(h * 0.4, h, 'rock');
      }
      b.add(40, 0, 'grass');
      hz = 1;
      break;
    }
    case 'cliff': {
      const h = rng.int(60, 110);
      b.add(h * 0.45, high ? h : -h, 'rock');
      b.mark();
      b.add(rng.int(90, 150), 0, 'grass');
      hz = 1;
      break;
    }
    case 'ice':
      b.mark();
      b.bump(rng.int(220, 320), (rng.chance(0.5) ? 1 : -1) * rng.int(20, 60), 'ice');
      b.add(30, 0, 'grass');
      hz = 1;
      break;
    case 'spikes':
      b.add(30, 0, 'grass');
      b.add(4, 36, 'rock');
      b.mark();
      b.add(rng.int(70, 150), 0, 'spikes');
      b.add(4, -36, 'rock');
      b.add(30, 0, 'grass');
      hz = 2;
      break;
    case 'chasm':
      b.add(30, 0, 'grass');
      b.add(4, 120, 'rock');
      b.mark();
      b.add(rng.int(90, 170), 0, zone >= 3 ? 'spikes' : 'water');
      b.add(4, -120, 'rock');
      b.add(30, 0, 'grass');
      hz = 3;
      break;
    case 'pillar': {
      b.add(60, 0, 'grass');
      const h = rng.int(60, 110);
      b.blocks.push({ x: b.x + 15, y: b.y - h / 2, w: 26, h, ax: 0, ay: 0, period: 1, phase: 0 });
      b.add(100, 0, 'grass');
      b.mark();
      hz = 1;
      break;
    }
    case 'gate': {
      b.add(70, 0, 'grass');
      const h = 120;
      b.blocks.push({ x: b.x + 12, y: b.y - h / 2 - 40, w: 24, h, ax: 0, ay: rng.int(55, 75), period: rng.int(22, 34) / 10, phase: rng.next() * 6.28 });
      b.add(90, 0, 'grass');
      b.mark();
      hz = 2;
      break;
    }
  }
  return hz;
}

export function buildHole(spec: HoleSpec): BuiltHole {
  const rng = new Rng(spec.seed);
  const z = ZONES[spec.zone];
  const boss = spec.kind === 'boss' ? BOSSES[z.boss] : null;
  const b = new Builder();
  b.pts.push({ x: 0, y: -4000, s: 'rock' });
  b.pts.push({ x: 0, y: 0, s: 'rock' });
  b.add(170, 0, 'grass');
  const tee = { x: 60, y: -R };

  let count = [3, 4, 4, 5][spec.zone] + rng.int(0, 1);
  if (spec.kind === 'shortcut') count += 3;
  if (spec.kind === 'boss') count += 1;
  const bag = Object.entries(z.pieces);
  const kinds: string[] = [];
  for (let i = 0; i < count; i++) kinds.push(rng.weighted(bag));
  if (spec.curse === 'spiky') kinds.splice(1, 0, 'spikes', 'spikes');
  if (boss?.gates) kinds.push('gate', 'gate');
  let hazards = 0;
  for (const k of kinds) hazards += piece(b, k, rng, spec.zone);

  // Approach and green
  b.add(rng.int(60, 120), 0, 'grass');
  const greenS: Surface = spec.curse === 'slick' ? 'ice' : 'green';
  const cups: Cup[] = [];
  const nCups = boss ? boss.cups : 1;
  const firstCupX = b.x + 100;
  for (let i = 0; i < nCups; i++) {
    b.add(i === 0 ? 100 - CUP_HW : 130 - 2 * CUP_HW, 0, greenS);
    const cx = b.x + CUP_HW;
    cups.push({ x: cx, y: b.y });
    b.add(0, CUP_D, greenS);
    b.add(2 * CUP_HW, 0, greenS);
    b.add(0, -CUP_D, greenS);
  }
  b.add(80, 0, greenS);
  b.ramp(110, -70, 'grass', 5);
  b.add(70, 0, 'grass');
  const w = b.x;
  b.pts.push({ x: w, y: -4000, s: 'rock' });

  const segs = [];
  for (let i = 1; i < b.pts.length; i++) {
    const p = b.pts[i - 1];
    const q = b.pts[i];
    segs.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, s: q.s });
  }

  // Idols and coins float above marked spots.
  const pickups: Pickup[] = [];
  const spots = rng.shuffle(b.marks.filter((m) => m.x > 300 && m.x < firstCupX - 150));
  const idols = spec.kind === 'shortcut' || spec.kind === 'boss' ? 2 : 1;
  for (const m of spots.slice(0, idols)) pickups.push({ kind: 'idol', x: m.x, y: m.y - rng.int(60, 150) });
  for (const m of spots.slice(idols, idols + rng.int(2, 4))) pickups.push({ kind: 'coin', x: m.x + rng.int(-30, 30), y: m.y - rng.int(25, 80) });

  let wind = Math.round((rng.next() * 2 - 1) * z.wind / 5) * 5;
  if (spec.curse === 'gale') wind = (rng.chance(0.5) ? 1 : -1) * Math.round(z.wind * 1.4 + 35);

  const ys = b.pts.filter((p) => p.y > -3000).map((p) => p.y);
  const course: Course = {
    w,
    pts: b.pts,
    segs,
    cups,
    blocks: b.blocks,
    pickups,
    tee,
    top: Math.min(...ys, ...b.blocks.map((k) => k.y - k.h / 2 - k.ay)) - 260,
    bottom: Math.max(...ys) + 120,
    grid: [],
  };
  buildGrid(course);
  return { course, wind, len: firstCupX - tee.x, hazards };
}
