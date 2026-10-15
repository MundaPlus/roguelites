import type { Enemy } from './types';

/** Uniform grid for fast "which enemies are near this point" queries. */
export class SpatialGrid {
  private cells = new Map<number, Enemy[]>();
  private spare: Enemy[][] = [];

  constructor(readonly size = 64) {}

  private key(cx: number, cy: number): number {
    return (cx + 0x8000) * 0x10000 + (cy + 0x8000);
  }

  rebuild(enemies: Enemy[]): void {
    for (const arr of this.cells.values()) {
      arr.length = 0;
      this.spare.push(arr);
    }
    this.cells.clear();
    for (const e of enemies) {
      if (e.dead) continue;
      const k = this.key(Math.floor(e.x / this.size), Math.floor(e.y / this.size));
      let arr = this.cells.get(k);
      if (!arr) {
        arr = this.spare.pop() ?? [];
        this.cells.set(k, arr);
      }
      arr.push(e);
    }
  }

  /** Returns candidate enemies in all cells that overlap the circle. Callers still do the exact distance test. */
  query(x: number, y: number, r: number): Enemy[] {
    const out: Enemy[] = [];
    const s = this.size;
    const x0 = Math.floor((x - r) / s);
    const x1 = Math.floor((x + r) / s);
    const y0 = Math.floor((y - r) / s);
    const y1 = Math.floor((y + r) / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) for (const e of arr) out.push(e);
      }
    }
    return out;
  }
}
