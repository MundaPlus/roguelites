/** Code space and feedback math. Pure functions, no DOM. */

const SG = new Int8Array(8);
const SC = new Int8Array(8);

/** Exact matches and color-only matches of a guess against a code. */
export function score(g: ArrayLike<number>, c: ArrayLike<number>): [number, number] {
  const [ex, co] = scoreAt(g, c, 0);
  return [ex, co];
}

/** Same as `score`, with the code read from `c` at `off`. Returns exact and color matches. */
export function scoreAt(g: ArrayLike<number>, c: ArrayLike<number>, off: number): [number, number] {
  const n = g.length;
  let ex = 0;
  const cg = SG;
  const cc = SC;
  cg.fill(0);
  cc.fill(0);
  for (let i = 0; i < n; i++) {
    const ci = c[off + i];
    if (g[i] === ci) ex++;
    else {
      cg[g[i]]++;
      cc[ci]++;
    }
  }
  let co = 0;
  for (let k = 0; k < 8; k++) co += Math.min(cg[k], cc[k]);
  return [ex, co];
}

const cache = new Map<string, Uint8Array>();

/** Every code for this shape, flat: code i is `arr[i*len .. i*len+len)`. */
export function allCodes(len: number, colors: number, rep: boolean): Uint8Array {
  const key = `${len}/${colors}/${rep ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out: number[] = [];
  const cur = new Array<number>(len).fill(0);
  const total = Math.pow(colors, len);
  for (let x = 0; x < total; x++) {
    let v = x;
    for (let i = len - 1; i >= 0; i--) {
      cur[i] = v % colors;
      v = Math.floor(v / colors);
    }
    if (!rep && new Set(cur).size < len) continue;
    out.push(...cur);
  }
  const arr = Uint8Array.from(out);
  cache.set(key, arr);
  return arr;
}

/** Number of codes for this shape. The doors show it as the lock difficulty. */
export function codeCount(len: number, colors: number, rep: boolean): number {
  if (rep) return Math.pow(colors, len);
  let n = 1;
  for (let i = 0; i < len; i++) n *= colors - i;
  return n;
}

/** Turns a code one step to the right (the last peg moves to the front). */
export function rotate(c: readonly number[]): number[] {
  const n = c.length;
  return c.map((_, i) => c[(i - 1 + n) % n]);
}

export const sameCode = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
