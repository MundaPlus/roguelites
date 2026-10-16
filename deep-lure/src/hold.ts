/** Grid hold: fish shapes, rotation, placement. Pure functions. */
import { FISH_BY_ID, type CurseId } from './data';

export interface Catch {
  uid: number;
  fish: string;
  aberrant: boolean;
  curse: CurseId | null;
  /** Day of the catch, for freshness. */
  day: number;
  name: string;
}

export interface HoldItem extends Catch {
  x: number;
  y: number;
  rot: number;
}

export type Cell = [number, number];

/** Cells of a shape after `rot` quarter turns, moved so the minimum is 0,0. */
export function shapeCells(shape: string[], rot: number): Cell[] {
  let cells: Cell[] = [];
  shape.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && cells.push([x, y])));
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) cells = cells.map(([x, y]) => [-y, x]);
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]);
}

export const fishCells = (fish: string, rot: number): Cell[] => shapeCells(FISH_BY_ID[fish].shape, rot);

export const cellCount = (fish: string): number => FISH_BY_ID[fish].shape.join('').split('').filter((c) => c === '#').length;

export function itemCells(it: HoldItem): Cell[] {
  return fishCells(it.fish, it.rot).map(([x, y]) => [x + it.x, y + it.y]);
}

/** Grid of uids (0 = empty). */
export function occupancy(items: HoldItem[], w: number, h: number, skip = -1): Int32Array {
  const g = new Int32Array(w * h);
  for (const it of items) {
    if (it.uid === skip) continue;
    for (const [x, y] of itemCells(it)) if (x >= 0 && y >= 0 && x < w && y < h) g[y * w + x] = it.uid;
  }
  return g;
}

export function fits(items: HoldItem[], w: number, h: number, fish: string, rot: number, x: number, y: number, skip = -1): boolean {
  const occ = occupancy(items, w, h, skip);
  return fishCells(fish, rot).every(([cx, cy]) => {
    const px = cx + x;
    const py = cy + y;
    return px >= 0 && py >= 0 && px < w && py < h && occ[py * w + px] === 0;
  });
}

/** First free position (tries all rotations), or null. */
export function findSpot(items: HoldItem[], w: number, h: number, fish: string, prefRot = 0): { x: number; y: number; rot: number } | null {
  for (let k = 0; k < 4; k++) {
    const rot = (prefRot + k) % 4;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fits(items, w, h, fish, rot, x, y)) return { x, y, rot };
  }
  return null;
}

export const usedCells = (items: HoldItem[]): number => items.reduce((a, it) => a + cellCount(it.fish), 0);

/** Items that share an edge with `it`. */
export function neighbours(items: HoldItem[], it: HoldItem): HoldItem[] {
  const mine = new Set(itemCells(it).map(([x, y]) => `${x},${y}`));
  return items.filter(
    (o) =>
      o.uid !== it.uid &&
      itemCells(o).some(([x, y]) => mine.has(`${x + 1},${y}`) || mine.has(`${x - 1},${y}`) || mine.has(`${x},${y + 1}`) || mine.has(`${x},${y - 1}`)),
  );
}
