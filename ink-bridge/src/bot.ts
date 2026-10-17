/** Bot drawing for tests and the balance sim. */
import { W, H, buildLevel, canDraw, drawPolyline, inkLeft, solutionStrokes, type Level } from './game';
import type { Rng } from './rng';

const gauss = (rng: Rng): number => Math.sqrt(-2 * Math.log(rng.next() + 1e-9)) * Math.cos(2 * Math.PI * rng.next());

/**
 * Draws the stored solution with some hand error.
 * `sigma` is the error in world units (0 = exact).
 */
export function drawSolution(L: Level, rng: Rng, sigma: number): void {
  L.strokes = [];
  const dx = gauss(rng) * sigma;
  const dy = gauss(rng) * sigma;
  for (const p of solutionStrokes(L)) {
    drawPolyline(
      L,
      p.map((q) => ({ x: q.x + dx + gauss(rng) * sigma * 0.5, y: q.y + dy + gauss(rng) * sigma * 0.5 })),
    );
  }
}

/** Draws one or two random straight strokes. */
export function drawRandom(L: Level, rng: Rng): void {
  L.strokes = [];
  const n = rng.int(1, 2);
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const x = 1 + rng.next() * (W - 2);
      const y = 1 + rng.next() * (H - 2);
      if (!canDraw(L, x, y)) continue;
      const a = rng.next() * Math.PI * 2;
      const len = Math.min(inkLeft(L), 2 + rng.next() * 8);
      if (len < 1) break;
      drawPolyline(L, [
        { x, y },
        { x: x + Math.cos(a) * len, y: y + Math.sin(a) * len },
      ]);
      break;
    }
  }
}

export { buildLevel };
