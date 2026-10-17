/** One lock: the secret code, guesses, hints, tools and special rules. Pure state functions. */
import { MODS, TOOLS, type GearId, type ModId, type ToolId } from './data';
import { Rng } from './rng';
import { allCodes, codeCount, rotate, sameCode, score, scoreAt } from './solver';

export type LockKind = 'door' | 'vault' | 'final';

export interface LockSpec {
  len: number;
  colors: number;
  rep: boolean;
  limit: number;
  mod: ModId;
  kind: LockKind;
}

export interface GuessRec {
  g: number[];
  ex: number;
  co: number;
  /** Blind lock: the hint is not shown. */
  hidden?: boolean;
  /** Liar lock: this hint is false. Only shown to the player with the Lie Detector. */
  lie?: boolean;
  /** This guess did not use up a try. */
  free?: boolean;
}

/** A known fact about one slot, at the code turn (phase) when it was found. */
export interface SlotFact {
  pos: number;
  color: number;
  phase: number;
  yes: boolean;
}

export interface Lock {
  spec: LockSpec;
  code: number[];
  guesses: GuessRec[];
  /** Facts from Reveal (always yes) and Probe. */
  facts: SlotFact[];
  removed: number[];
  bonusTries: number;
  freeNext: boolean;
  /** Guess index (0..2) that gets a false hint on a Liar lock. */
  lieAt: number;
  /** Milliseconds left on a Timed lock. */
  timeLeft: number;
  timeMax: number;
  toolsUsed: number;
  state: 'open' | 'won' | 'lost';
  /** Gear effects copied in when the lock is made. */
  detector: boolean;
  anchor: boolean;
  hourglass: boolean;
  spark: boolean;
  magnifier: boolean;
}

export function newLock(spec: LockSpec, rng: Rng, gear: readonly GearId[]): Lock {
  const pool = Array.from({ length: spec.colors }, (_, i) => i);
  const code: number[] = [];
  for (let i = 0; i < spec.len; i++) {
    if (spec.rep) code.push(rng.int(0, spec.colors - 1));
    else code.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  }
  const has = (id: GearId) => gear.includes(id);
  const timeMax = spec.mod === 'timed' ? (40 + 14 * spec.len + (has('hourglass') ? 45 : 0)) * 1000 : 0;
  const lock: Lock = {
    spec,
    code,
    guesses: [],
    facts: [],
    removed: [],
    bonusTries: has('charm') ? 1 : 0,
    freeNext: has('stetho'),
    lieAt: rng.int(0, 2),
    timeLeft: timeMax,
    timeMax,
    toolsUsed: 0,
    state: 'open',
    detector: has('detector'),
    anchor: has('anchor'),
    hourglass: has('hourglass'),
    spark: has('spark'),
    magnifier: has('magnifier'),
  };
  if (has('ledger')) purge(lock, rng);
  return lock;
}

/** Code turn for guess number i (0 before the shift, 1 after it). */
export function phaseOf(l: Lock, i: number): number {
  return l.spec.mod === 'shifter' && !l.anchor && i >= 3 ? 1 : 0;
}

export const phaseNow = (l: Lock): number => phaseOf(l, l.guesses.length);

/** The code the next guess is checked against. */
export function currentCode(l: Lock): number[] {
  return phaseNow(l) ? rotate(l.code) : l.code.slice();
}

/** Position of a slot fact in the current code turn. */
export function factPos(l: Lock, f: SlotFact): number {
  return (f.pos + (phaseNow(l) - f.phase)) % l.spec.len;
}

export const triesUsed = (l: Lock): number => l.guesses.filter((g) => !g.free).length;
export const triesMax = (l: Lock): number => l.spec.limit + l.bonusTries;
export const triesLeft = (l: Lock): number => triesMax(l) - triesUsed(l);


export function submitGuess(l: Lock, g: number[], rng: Rng): GuessRec {
  const i = l.guesses.length;
  const cur = currentCode(l);
  const [ex, co] = score(g, cur);
  const rec: GuessRec = { g: g.slice(), ex, co };
  if (l.freeNext) {
    rec.free = true;
    l.freeNext = false;
  }
  if (ex < l.spec.len) {
    if (l.spec.mod === 'blind' && i === 1 && !l.hourglass) rec.hidden = true;
    if (l.spec.mod === 'liar' && i === l.lieAt) {
      const n = l.spec.len;
      const opts: [number, number][] = [];
      for (const [dx, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
        const e = ex + dx;
        const c = co + dc;
        if (e < 0 || c < 0 || e >= n || e + c > n || (e === n - 1 && c === 1)) continue;
        opts.push([e, c]);
      }
      if (opts.length) {
        const [e, c] = rng.pick(opts);
        rec.ex = e;
        rec.co = c;
        rec.lie = true;
      }
    }
  }
  l.guesses.push(rec);
  if (ex === l.spec.len) l.state = 'won';
  else if (triesLeft(l) <= 0) l.state = 'lost';
  return rec;
}

/** Ticks the clock of a Timed lock. Returns true when time ran out just now. */
export function tickLock(l: Lock, ms: number): boolean {
  if (l.spec.mod !== 'timed' || l.state !== 'open') return false;
  l.timeLeft = Math.max(0, l.timeLeft - ms);
  if (l.timeLeft <= 0) {
    l.state = 'lost';
    return true;
  }
  return false;
}

// ---------- Solver: which codes still fit everything the player knows ----------

/** Codes (indices into `allCodes`) that fit every hint, fact and removed color. */
export function candidates(l: Lock): number[] {
  const { len, colors, rep } = l.spec;
  const all = allCodes(len, colors, rep);
  const total = all.length / len;
  const out: number[] = [];
  const shifts = l.guesses.map((_, i) => phaseOf(l, i));
  const rot = new Array<number>(len);
  const liar = l.spec.mod === 'liar' && !l.detector;
  const lieDone = liar && l.guesses.length >= 3;
  const removed = l.removed;
  next: for (let k = 0; k < total; k++) {
    const off = k * len;
    for (const r of removed) for (let i = 0; i < len; i++) if (all[off + i] === r) continue next;
    for (let i = 0; i < len; i++) rot[i] = all[off + ((i - 1 + len) % len)];
    for (const f of l.facts) {
      const v = f.phase ? rot[f.pos] : all[off + f.pos];
      if ((v === f.color) !== f.yes) continue next;
    }
    let miss = 0;
    for (let gi = 0; gi < l.guesses.length; gi++) {
      const r = l.guesses[gi];
      const src = shifts[gi] ? rot : all;
      const o = shifts[gi] ? 0 : off;
      if (r.hidden || (r.lie && l.detector)) {
        let same = true;
        for (let i = 0; i < len; i++) if (r.g[i] !== src[o + i]) same = false;
        if (same) continue next;
        continue;
      }
      const [ex, co] = scoreAt(r.g, src, o);
      if (ex !== r.ex || co !== r.co) {
        miss++;
        if (!liar || miss > 1) continue next;
      }
    }
    if (lieDone && miss !== 1) continue;
    out.push(k);
  }
  return out;
}

/** The code at index k in the current code turn. */
export function codeAt(l: Lock, k: number): number[] {
  const { len, colors, rep } = l.spec;
  const all = allCodes(len, colors, rep);
  const c = Array.from(all.subarray(k * len, k * len + len));
  return phaseNow(l) ? rotate(c) : c;
}

export const spaceSize = (s: LockSpec): number => codeCount(s.len, s.colors, s.rep);

// ---------- Tools ----------

export function toolCost(l: Lock, id: ToolId): number {
  let c = TOOLS.find((t) => t.id === id)!.cost;
  if (id === 'reveal' && l.magnifier) c -= 2;
  if (l.spark && l.toolsUsed === 0) c -= 2;
  return Math.max(0, c);
}

/** Why the tool cannot be used now, or null when it can. */
export function toolBlock(l: Lock, id: ToolId, sel?: { pos: number; color: number | null }): string | null {
  if (l.state !== 'open') return 'The lock is done.';
  if (id === 'purge' && wrongColors(l).length === 0) return 'Every wrong color is gone.';
  if (id === 'reveal' && unknownSlots(l).length === 0) return 'Every slot is known.';
  if (id === 'free' && l.freeNext) return 'Your next guess is free already.';
  if (id === 'probe' && (!sel || sel.color === null)) return 'Put a color in a slot first.';
  return null;
}

function wrongColors(l: Lock): number[] {
  const out: number[] = [];
  for (let c = 0; c < l.spec.colors; c++) if (!l.code.includes(c) && !l.removed.includes(c)) out.push(c);
  return out;
}

function unknownSlots(l: Lock): number[] {
  const known = new Set(l.facts.filter((f) => f.yes).map((f) => factPos(l, f)));
  return Array.from({ length: l.spec.len }, (_, i) => i).filter((i) => !known.has(i));
}

export function purge(l: Lock, rng: Rng): number | null {
  const w = wrongColors(l);
  if (!w.length) return null;
  const c = rng.pick(w);
  l.removed.push(c);
  return c;
}

/** Uses a tool. Returns a short message for the player. Energy is paid by the caller. */
export function useTool(l: Lock, id: ToolId, rng: Rng, sel?: { pos: number; color: number | null }): { ok: boolean; msg: string; pos?: number; color?: number } {
  const block = toolBlock(l, id, sel);
  if (block) return { ok: false, msg: block };
  l.toolsUsed++;
  const cur = currentCode(l);
  if (id === 'purge') {
    const c = purge(l, rng)!;
    return { ok: true, msg: 'removed', color: c };
  }
  if (id === 'reveal') {
    const pos = rng.pick(unknownSlots(l));
    l.facts.push({ pos, color: cur[pos], phase: phaseNow(l), yes: true });
    return { ok: true, msg: 'revealed', pos, color: cur[pos] };
  }
  if (id === 'free') {
    l.freeNext = true;
    return { ok: true, msg: 'Your next guess is free.' };
  }
  const pos = sel!.pos;
  const color = sel!.color!;
  const yes = cur[pos] === color;
  l.facts.push({ pos, color, phase: phaseNow(l), yes });
  return { ok: true, msg: yes ? 'yes' : 'no', pos, color };
}

export const modOf = (l: Lock) => MODS[l.spec.mod];

/** True when the guess is the code (used by tests). */
export const isCode = (l: Lock, g: number[]): boolean => sameCode(currentCode(l), g);
