/** Dodging bots for tests and the balance sim. They read the game state and fill an Input. */
import { H, W } from './data';
import { HIT_R, MAXB, type Game, type Input } from './sim';

export type BotLevel = 'good' | 'weak' | 'random';

const DIRS: [number, number][] = [
  [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
];

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export class Bot {
  private buf = new Int32Array(MAXB);
  private seen = new Uint8Array(MAXB);
  private prev = 0;
  private rdir = 0;
  private rt = 0;
  private rfocus = false;
  private wait = 0;
  /** Frames between decisions (reaction time). */
  react: number;
  /** Chance to bomb inside the short window after a hit. */
  deathBomb: number;
  /** Chance to overlook a bullet during one decision (attention). */
  miss: number;

  constructor(
    public level: BotLevel,
    private rand: () => number = Math.random,
  ) {
    this.react = level === 'good' ? 4 : 8;
    this.deathBomb = level === 'good' ? 0.5 : 0.15;
    this.miss = level === 'good' ? 0.07 : 0.25;
  }

  input(g: Game, out: Input): void {
    out.rx = 0;
    out.ry = 0;
    out.bomb = false;
    if (this.level === 'random') return this.randomInput(g, out);
    if (g.hitT > 0 && g.hitT % 4 === 0 && g.bombs > 0 && this.rand() < this.deathBomb / 2) out.bomb = true;
    if (this.wait-- > 0) return;
    this.wait = this.react - 1;
    const good = this.level === 'good';
    const ts = good ? [1, 2, 4, 7, 11, 16] : [1, 3, 6];
    const n = g.near(g.px, g.py, good ? 76 : 50, this.buf);
    for (let k = 0; k < n; k++) this.seen[k] = this.rand() < this.miss ? 0 : 1;
    // Pick a target to stay under.
    let tx = W / 2;
    let best = 1e9;
    for (const e of g.enemies) {
      if (e.dead || e.y < 0 || e.y > g.py - 30) continue;
      const s = e.boss ? -1e6 : Math.abs(e.x - g.px) + e.hp * 0.3;
      if (s < best) {
        best = s;
        tx = e.x;
      }
    }
    const L = g.load;
    let bestCost = 1e18;
    let bestK = 0;
    let bestHit = 0;
    const nf = good ? 2 : 1;
    for (let f = 0; f < nf; f++) {
      const sp = f ? L.focusSpeed : L.speed;
      for (let d = 0; d < DIRS.length; d++) {
        const vx = DIRS[d][0] * sp;
        const vy = DIRS[d][1] * sp;
        let cost = 0;
        let hit = 0;
        let x = g.px;
        let y = g.py;
        for (const t of ts) {
          x = clamp(g.px + vx * t, 8, W - 8);
          y = clamp(g.py + vy * t, 16, H - 12);
          const margin = good ? 1.6 + t * 0.3 : 0.5;
          for (let k = 0; k < n; k++) {
            if (!this.seen[k]) continue;
            const i = this.buf[k];
            const bx = g.bx[i] + g.bvx[i] * t;
            const by = g.by[i] + g.bvy[i] * t;
            const dx = bx - x;
            const dy = by - y;
            const d2 = dx * dx + dy * dy;
            const rr = g.br[i] * 0.75 + HIT_R + margin;
            if (d2 < rr * rr) {
              cost += 10000 / t;
              if (t <= 2) hit++;
            } else if (good && d2 < 144) cost += 2;
          }
          for (const e of g.enemies) {
            if (e.dead) continue;
            const dx = e.x - x;
            const dy = e.y - y;
            const rr = e.r + 6;
            if (dx * dx + dy * dy < rr * rr) cost += 8000 / t;
          }
        }
        if (good) {
          cost += Math.abs(x - tx) * 0.08 + Math.abs(y - (H - 70)) * 0.05;
          if (x < 24 || x > W - 24) cost += 6;
          if (f) cost += 0.5;
        } else {
          cost += Math.abs(x - tx) * 0.04 + Math.abs(y - (H - 60)) * 0.04;
        }
        const key = f * 16 + d;
        if (key === this.prev) cost -= 0.6;
        if (cost < bestCost) {
          bestCost = cost;
          bestK = key;
          bestHit = hit;
        }
      }
    }
    this.prev = bestK;
    const d = bestK % 16;
    out.focus = bestK >= 16;
    out.dx = DIRS[d][0];
    out.dy = DIRS[d][1];
    if (good && g.bombs > 0 && g.bombT === 0 && bestHit > 0) out.bomb = true;
  }

  private randomInput(g: Game, out: Input): void {
    if (--this.rt <= 0) {
      this.rt = 10 + Math.floor(this.rand() * 30);
      this.rdir = Math.floor(this.rand() * DIRS.length);
      this.rfocus = this.rand() < 0.3;
      if (g.py < H * 0.6) this.rdir = 3;
    }
    out.dx = DIRS[this.rdir][0];
    out.dy = DIRS[this.rdir][1];
    out.focus = this.rfocus;
    out.bomb = g.hitT > 0 && this.rand() < 0.2;
  }
}
