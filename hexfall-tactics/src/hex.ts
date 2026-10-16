/** Axial hex coordinates on a pointy-top hexagon board. */
export interface Hex {
  q: number;
  r: number;
}

/** Board radius. The board has 3R(R+1)+1 tiles. */
export const R = 4;

/** The six directions, counter-clockwise from east. dir + 3 is the opposite direction. */
export const DIRS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const ARROWS = ['→', '↗', '↖', '←', '↙', '↘'];

export const opp = (d: number): number => (d + 3) % 6;

export const step = (h: Hex, d: number, k = 1): Hex => ({ q: h.q + DIRS[d].q * k, r: h.r + DIRS[d].r * k });

export const eq = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export const dist = (a: Hex, b: Hex): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

const CENTER: Hex = { q: 0, r: 0 };

export const ring = (h: Hex): number => dist(h, CENTER);

export const onBoard = (h: Hex): boolean => ring(h) <= R;

/** All board tiles. The index of a tile in this list is its tile index. */
export const HEXES: readonly Hex[] = (() => {
  const out: Hex[] = [];
  for (let q = -R; q <= R; q++) {
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) out.push({ q, r });
  }
  return out;
})();

const SPAN = 2 * R + 1;
const LUT = new Int16Array(SPAN * SPAN).fill(-1);
HEXES.forEach((h, i) => (LUT[(h.q + R) * SPAN + (h.r + R)] = i));

/** Tile index of a hex, or -1 when it is off the board. */
export function idx(h: Hex): number {
  if (!onBoard(h)) return -1;
  return LUT[(h.q + R) * SPAN + (h.r + R)];
}

export const neighbors = (h: Hex): Hex[] => DIRS.map((_, d) => step(h, d)).filter(onBoard);

/** Direction and distance from a to b when b is on a straight line from a. */
export function lineTo(a: Hex, b: Hex): { dir: number; dist: number } | null {
  const n = dist(a, b);
  if (n === 0) return null;
  for (let d = 0; d < 6; d++) {
    if (a.q + DIRS[d].q * n === b.q && a.r + DIRS[d].r * n === b.r) return { dir: d, dist: n };
  }
  return null;
}

/** Direction from a to b when they are neighbors, else the closest line direction. */
export function dirTo(a: Hex, b: Hex): number {
  const l = lineTo(a, b);
  if (l) return l.dir;
  let best = 0;
  let bd = Infinity;
  for (let d = 0; d < 6; d++) {
    const n = dist(step(a, d), b);
    if (n < bd) {
      bd = n;
      best = d;
    }
  }
  return best;
}

// ---------- Pixels ----------

const SQ3 = Math.sqrt(3);

export function toPixel(h: Hex, size: number): { x: number; y: number } {
  return { x: size * SQ3 * (h.q + h.r / 2), y: size * 1.5 * h.r };
}

export function fromPixel(x: number, y: number, size: number): Hex {
  const qf = ((SQ3 / 3) * x - y / 3) / size;
  const rf = ((2 / 3) * y) / size;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

export function hexPoints(cx: number, cy: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + size * Math.cos(a)).toFixed(1)},${(cy + size * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}
