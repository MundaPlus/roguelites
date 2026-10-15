import type { Rng } from './rng';
import type { RoomType } from './types';

export const ROWS = 15;
export const COLS = 7;
const PATHS = 6;

export interface MapNode {
  id: string;
  row: number;
  col: number;
  type: RoomType;
  next: string[];
  /** Small random offsets so the map does not look like a grid. */
  jx: number;
  jy: number;
}

export const nodeId = (row: number, col: number): string => `${row}-${col}`;

/**
 * Slay-the-Spire style map: 6 paths climb 15 rows. Each step moves at most one
 * column sideways, and paths never cross.
 */
export function generateMap(rng: Rng): MapNode[] {
  const edges: [number, number, number][] = [];
  const crosses = (r: number, a: number, b: number) => edges.some(([er, ec, en]) => er === r && ((ec < a && en > b) || (ec > a && en < b)));
  const starts: number[] = [];

  for (let p = 0; p < PATHS; p++) {
    let col = rng.int(0, COLS - 1);
    // The first two paths start apart, so the player always has a choice.
    while (p === 1 && col === starts[0]) col = rng.int(0, COLS - 1);
    starts.push(col);
    for (let r = 0; r < ROWS - 1; r++) {
      const want = col + rng.int(-1, 1);
      const options = [want, col, col - 1, col + 1].filter((c) => c >= 0 && c < COLS);
      const next = options.find((c) => !crosses(r, col, c)) ?? col;
      if (!edges.some(([er, ec, en]) => er === r && ec === col && en === next)) edges.push([r, col, next]);
      col = next;
    }
  }

  const nodes = new Map<string, MapNode>();
  const get = (row: number, col: number): MapNode => {
    const id = nodeId(row, col);
    let n = nodes.get(id);
    if (!n) {
      n = { id, row, col, type: 'monster', next: [], jx: (rng.next() - 0.5) * 0.5, jy: (rng.next() - 0.5) * 0.5 };
      nodes.set(id, n);
    }
    return n;
  };
  for (const [r, c, n] of edges) {
    const a = get(r, c);
    const b = get(r + 1, n);
    if (!a.next.includes(b.id)) a.next.push(b.id);
  }

  const parents = new Map<string, MapNode[]>();
  for (const n of nodes.values()) for (const id of n.next) parents.set(id, [...(parents.get(id) ?? []), n]);

  const sorted = [...nodes.values()].sort((a, b) => a.row - b.row || a.col - b.col);
  for (const n of sorted) {
    if (n.row === 0) n.type = 'monster';
    else if (n.row === 8) n.type = 'treasure';
    else if (n.row === ROWS - 1) n.type = 'rest';
    else n.type = rollType(rng, n, parents.get(n.id) ?? []);
  }
  return sorted;
}

function rollType(rng: Rng, n: MapNode, parents: MapNode[]): RoomType {
  const weights: [RoomType, number][] = [
    ['monster', 45],
    ['event', 22],
    ['elite', n.row >= 5 ? 16 : 0],
    ['rest', n.row >= 5 && n.row !== ROWS - 2 ? 12 : 0],
    ['shop', 5],
  ];
  // Special rooms do not follow a room of the same kind.
  for (let i = 0; i < 10; i++) {
    const t = rng.weighted(weights.filter(([, w]) => w > 0));
    if (t === 'monster' || t === 'event' || !parents.some((p) => p.type === t)) return t;
  }
  return 'monster';
}
