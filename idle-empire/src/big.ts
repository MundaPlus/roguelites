/**
 * Small non-negative big number: value = m × 10^e, with 1 ≤ m < 10 (or m = 0).
 * Immutable. Precision is the precision of a JS double (about 15 digits).
 */
export class Big {
  readonly m: number;
  readonly e: number;

  private constructor(m: number, e: number) {
    this.m = m;
    this.e = e;
  }

  static readonly ZERO = new Big(0, 0);
  static readonly ONE = new Big(1, 0);

  /** Builds a normalized value from a mantissa and an exponent. */
  static of(m: number, e = 0): Big {
    if (!(m > 0) || !isFinite(m)) {
      if (m === Infinity) return new Big(9.99, 1e300);
      return Big.ZERO;
    }
    const shift = Math.floor(Math.log10(m));
    let mm = m / Math.pow(10, shift);
    let ee = e + shift;
    // Guard against float drift such as 9.9999999 → 10.
    if (mm >= 10) {
      mm /= 10;
      ee += 1;
    } else if (mm < 1) {
      mm *= 10;
      ee -= 1;
    }
    return new Big(mm, ee);
  }

  static from(v: Big | number | string): Big {
    if (v instanceof Big) return v;
    if (typeof v === 'number') return Big.of(v, 0);
    return Big.parse(v);
  }

  /** Parses "1.5e300", "12345" or the JSON form "1.5e300". Bad text gives 0. */
  static parse(s: string): Big {
    const t = String(s).trim().toLowerCase();
    const i = t.indexOf('e');
    if (i < 0) return Big.of(Number(t) || 0);
    const m = Number(t.slice(0, i));
    const e = Number(t.slice(i + 1));
    if (!isFinite(m) || !isFinite(e)) return Big.ZERO;
    return Big.of(m, Math.round(e));
  }

  /** 10^l for a real l. */
  static pow10(l: number): Big {
    if (!isFinite(l)) return l > 0 ? new Big(9.99, 1e300) : Big.ZERO;
    const e = Math.floor(l);
    return Big.of(Math.pow(10, l - e), e);
  }

  isZero(): boolean {
    return this.m === 0;
  }

  /** log10 of the value. -Infinity for 0. */
  log10(): number {
    return this.m === 0 ? -Infinity : Math.log10(this.m) + this.e;
  }

  toNumber(): number {
    if (this.m === 0) return 0;
    if (this.e > 308) return Infinity;
    return this.m * Math.pow(10, this.e);
  }

  add(o: Big | number): Big {
    const b = Big.from(o);
    if (b.m === 0) return this;
    if (this.m === 0) return b;
    const d = this.e - b.e;
    if (d > 16) return this;
    if (d < -16) return b;
    if (d >= 0) return Big.of(this.m + b.m * Math.pow(10, -d), this.e);
    return Big.of(this.m * Math.pow(10, d) + b.m, b.e);
  }

  /** Subtraction clamped at 0 (this game has no negative values). */
  sub(o: Big | number): Big {
    const b = Big.from(o);
    if (b.m === 0) return this;
    const d = this.e - b.e;
    if (d < 0 || (d === 0 && b.m >= this.m)) return Big.ZERO;
    if (d > 16) return this;
    return Big.of(this.m - b.m * Math.pow(10, -d), this.e);
  }

  mul(o: Big | number): Big {
    if (typeof o === 'number') return Big.of(this.m * o, this.e);
    if (this.m === 0 || o.m === 0) return Big.ZERO;
    return Big.of(this.m * o.m, this.e + o.e);
  }

  div(o: Big | number): Big {
    if (typeof o === 'number') return Big.of(this.m / o, this.e);
    if (o.m === 0) return new Big(9.99, 1e300);
    if (this.m === 0) return Big.ZERO;
    return Big.of(this.m / o.m, this.e - o.e);
  }

  pow(p: number): Big {
    if (this.m === 0) return p === 0 ? Big.ONE : Big.ZERO;
    return Big.pow10(this.log10() * p);
  }

  cmp(o: Big | number): number {
    const b = Big.from(o);
    if (this.m === 0 || b.m === 0) return this.m === b.m ? 0 : this.m === 0 ? -1 : 1;
    if (this.e !== b.e) return this.e > b.e ? 1 : -1;
    if (Math.abs(this.m - b.m) < 1e-12) return 0;
    return this.m > b.m ? 1 : -1;
  }

  gte(o: Big | number): boolean {
    return this.cmp(o) >= 0;
  }
  gt(o: Big | number): boolean {
    return this.cmp(o) > 0;
  }
  lt(o: Big | number): boolean {
    return this.cmp(o) < 0;
  }
  lte(o: Big | number): boolean {
    return this.cmp(o) <= 0;
  }

  max(o: Big): Big {
    return this.gte(o) ? this : o;
  }
  min(o: Big): Big {
    return this.lte(o) ? this : o;
  }

  floor(): Big {
    if (this.e >= 15 || this.m === 0) return this;
    return Big.of(Math.floor(this.toNumber() + 1e-9));
  }

  toJSON(): string {
    return this.toString();
  }

  toString(): string {
    return this.m === 0 ? '0' : `${this.m}e${this.e}`;
  }
}

const SHORT = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Short scale names up to 1e35 (Dc), then scientific notation. */
export function fmt(v: Big | number, digits = 2): string {
  const b = Big.from(v);
  if (b.m === 0) return '0';
  if (b.e < 3) {
    const n = b.toNumber();
    return n < 100 && n % 1 !== 0 ? n.toFixed(n < 10 ? 2 : 1).replace(/\.?0+$/, '') : Math.floor(n).toString();
  }
  const group = Math.floor(b.e / 3);
  if (group < SHORT.length) {
    const n = b.m * Math.pow(10, b.e - group * 3);
    const d = n >= 100 ? 0 : n >= 10 ? Math.min(1, digits) : digits;
    const txt = n.toFixed(d);
    if (Number(txt) >= 1000) return group + 1 < SHORT.length ? `${(n / 1000).toFixed(digits)}${SHORT[group + 1]}` : `1.${'0'.repeat(digits)}e${b.e + 1}`;
    return `${txt}${SHORT[group]}`;
  }
  let m = Number(b.m.toFixed(digits));
  let e = b.e;
  if (m >= 10) {
    m /= 10;
    e += 1;
  }
  return `${m.toFixed(digits)}e${e}`;
}

/** Formats a plain multiplier like ×1.5 or ×2.4e12. */
export function fmtMult(v: Big | number): string {
  const b = Big.from(v);
  if (b.lt(1000)) {
    const n = b.toNumber();
    return `×${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1).replace(/\.0$/, '') : n.toFixed(2).replace(/\.?0+$/, '')}`;
  }
  return `×${fmt(b)}`;
}
