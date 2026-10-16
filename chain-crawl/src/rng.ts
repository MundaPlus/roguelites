/** Seeded PRNG (mulberry32). The same seed gives the same run. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed | 0;
  }

  /** Internal state, so a run can save and restore its RNG. */
  get state(): number {
    return this.s;
  }

  set state(v: number) {
    this.s = v | 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [a, b], both inclusive. */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((a, [, w]) => a + w, 0);
    let roll = this.next() * total;
    for (const [v, w] of items) {
      roll -= w;
      if (roll < 0) return v;
    }
    return items[items.length - 1][0];
  }
}

/** FNV-1a hash of the parts. Used to derive one RNG per purpose from the run seed. */
export function hash(...parts: (string | number)[]): number {
  const s = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function randomSeedText(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}
