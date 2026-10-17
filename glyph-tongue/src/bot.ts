/**
 * Bots for the sim and the debug API.
 * - The Learner keeps a hypothesis table: a set of possible meanings per rune and the possible grammar.
 *   It reads only what the player sees (the cast log and revealed facts) and drops every hypothesis
 *   that does not match a cast result.
 * - The random bot casts random spells.
 */
import { CHARMS } from './data';
import { alive, cast, ctxOf, incoming, isTest, type Fight, type Hero } from './fight';
import {
  MEANINGS,
  ROLE_COUNT,
  parse,
  roleOf,
  signature,
  specialKey,
  type Ctx,
  type Def,
  type Fact,
  type Meaning,
  type Outcome,
  type Role,
  type Side,
  type Special,
  type World,
} from './lang';
import { Rng } from './rng';
import { LIBRARY_COST, roomOptions, unknownFacts, type LogEntry, type RunState } from './run';

export interface Obs {
  spell: number[];
  ctx: Ctx;
  silent: boolean[];
  outs: Outcome[];
  reson: boolean;
  backlash: number;
}

const SPECIAL_SLOTS = 2;
const ENUM_CAP = 40000;
const pairKey = (a: number, b: number): string => `${Math.min(a, b)}:${Math.max(a, b)}`;

export class Learner {
  cand: Set<Meaning>[] = Array.from({ length: 8 }, () => new Set(MEANINGS));
  tSide = new Set<Side>(['before', 'after']);
  mSide = new Set<Side>(['before', 'after']);
  def = new Set<Def>(['self', 'foe']);
  /** Confirmed cancel / stutter / head rules. */
  confirmed: Special[] = [];
  refuted = new Set<string>();
  resonCands: Set<string> | null = null;
  resonNo = new Set<string>();
  tabooCands: Set<number> | null = null;
  tabooNo = new Set<number>();
  tried = new Set<number>();
  anomalies = 0;
  /** Past casts that needed no new special rule, for joint checks. */
  history: { spell: number[]; ctx: Ctx; reson: boolean; sig: string; runes: number[]; key: string }[] = [];

  known(r: number): boolean {
    return this.cand[r].size === 1;
  }

  meaning(r: number): Meaning | null {
    return this.cand[r].size === 1 ? [...this.cand[r]][0] : null;
  }

  /** Roles still possible for a rune. */
  roles(r: number): Set<Role> {
    return new Set([...this.cand[r]].map(roleOf));
  }

  private openSlots(): number {
    return SPECIAL_SLOTS - this.confirmed.length - (this.resonCands ? 1 : 0) - (this.tabooCands ? 1 : 0);
  }

  /** Special-rule options that could explain a cast with these runes. */
  private options(spell: number[]): Special[] {
    if (this.openSlots() <= 0) return [];
    const out: Special[] = [];
    const has = (s: Special) => this.refuted.has(specialKey(s)) || this.confirmed.some((c) => specialKey(c) === specialKey(s));
    const st: Special = { t: 'stutter' };
    if (!has(st) && spell.some((r, i) => i > 0 && spell[i - 1] === r)) out.push(st);
    const hd: Special = { t: 'head' };
    if (!has(hd)) out.push(hd);
    const rs = [...new Set(spell)];
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const c: Special = { t: 'cancel', a: Math.min(rs[i], rs[j]), b: Math.max(rs[i], rs[j]) };
        if (!has(c)) out.push(c);
      }
    return out;
  }

  private variants(spell: number[]): { list: Special[][]; opts: Special[] } {
    const base = [...this.confirmed];
    const opts = this.options(spell);
    const list: Special[][] = [base, ...opts.map((o) => [...base, o])];
    if (this.openSlots() >= 2 && opts.length <= 6)
      for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++) list.push([...base, opts[i], opts[j]]);
    return { list, opts };
  }

  /** Runes outside the spell whose role is certain, counted per role. */
  private fixedRoles(skip: Set<number>): Record<Role, number> {
    const c: Record<Role, number> = { el: 0, tgt: 0, mod: 0 };
    for (let r = 0; r < 8; r++) {
      if (skip.has(r)) continue;
      const roles = this.roles(r);
      if (roles.size === 1) c[[...roles][0]]++;
    }
    return c;
  }

  /** Call fn for every joint hypothesis over the runes of the spell. Returns false when the space is too big. */
  private enumerate(spell: number[], fn: (w: World, assign: Map<number, Meaning>, vi: number) => void, variantList?: Special[][]): boolean {
    const rs = [...new Set(spell)];
    const lists = rs.map((r) => [...this.cand[r]]);
    const vl = variantList ?? this.variants(spell).list;
    let size = vl.length * this.tSide.size * this.mSide.size * this.def.size;
    for (const l of lists) size *= l.length;
    if (size > ENUM_CAP) return false;
    const fixed = this.fixedRoles(new Set(rs));
    const mean: Meaning[] = this.cand.map((c) => (c.size === 1 ? [...c][0] : 'harm'));
    const inR = new Set(rs);
    const past = this.history.filter((h) => h.runes.every((r) => inR.has(r) || this.known(r))).slice(-30);
    const used = new Set<Meaning>();
    const roleCnt: Record<Role, number> = { el: 0, tgt: 0, mod: 0 };
    const assign = new Map<number, Meaning>();
    const rec = (k: number): void => {
      if (k === rs.length) {
        for (const ts of this.tSide)
          for (const ms of this.mSide)
            for (const d of this.def)
              vl.forEach((specials, vi) => {
                const w: World = { mean, tgtSide: ts, modSide: ms, def: d, specials };
                for (const p of past) if (signature(parse(w, p.spell, p.ctx, { reson: p.reson })) !== p.sig) return;
                fn(w, assign, vi);
              });
        return;
      }
      for (const m of lists[k]) {
        if (used.has(m)) continue;
        const role = roleOf(m);
        if (roleCnt[role] + fixed[role] >= ROLE_COUNT[role]) continue;
        used.add(m);
        roleCnt[role]++;
        mean[rs[k]] = m;
        assign.set(rs[k], m);
        rec(k + 1);
        used.delete(m);
        roleCnt[role]--;
      }
    };
    rec(0);
    return true;
  }

  observe(o: Obs): void {
    const { spell } = o;
    // Taboo: the backlash shows up in the log.
    if (o.backlash > 0) {
      const s = new Set(spell.filter((r) => !this.tabooNo.has(r)));
      this.tabooCands = this.tabooCands ? new Set([...this.tabooCands].filter((r) => s.has(r))) : s;
    } else {
      spell.forEach((r) => this.tabooNo.add(r));
      if (this.tabooCands) spell.forEach((r) => this.tabooCands!.delete(r));
    }
    // Resonance: the log shows it too.
    const pairs = new Set<string>();
    for (let i = 0; i + 1 < spell.length; i++) if (spell[i] !== spell[i + 1]) pairs.add(pairKey(spell[i], spell[i + 1]));
    if (o.reson) {
      const ok = [...pairs].filter((p) => !this.resonNo.has(p));
      this.resonCands = this.resonCands ? new Set([...this.resonCands].filter((p) => ok.includes(p))) : new Set(ok);
    } else {
      for (let i = 0; i + 1 < spell.length; i++) {
        if (o.silent[i] || o.silent[i + 1] || spell[i] === spell[i + 1]) continue;
        const k = pairKey(spell[i], spell[i + 1]);
        this.resonNo.add(k);
        this.resonCands?.delete(k);
      }
    }
    // Direct facts: an effect names its source rune.
    for (const out of o.outs) this.cand[out.rune] = new Set([out.kind]);
    if (spell.length === 1) {
      this.tried.add(spell[0]);
      if (o.silent[0]) this.cand[spell[0]] = new Set([...this.cand[spell[0]]].filter((m) => roleOf(m) !== 'el'));
    }
    this.propagate();

    const sig = signature({ silent: o.silent, bind: [], outs: o.outs, reson: o.reson, backlash: o.backlash });
    const { list, opts } = this.variants(spell);
    const rs = [...new Set(spell)];
    const seen = new Map<number, Set<Meaning>>(rs.map((r) => [r, new Set()]));
    const tS = new Set<Side>();
    const mS = new Set<Side>();
    const dS = new Set<Def>();
    const vUsed = new Set<number>();
    let any = false;
    const ok = this.enumerate(
      spell,
      (w, assign, vi) => {
        if (signature(parse(w, spell, o.ctx, { reson: o.reson })) !== sig) return;
        any = true;
        assign.forEach((m, r) => seen.get(r)!.add(m));
        tS.add(w.tgtSide);
        mS.add(w.modSide);
        dS.add(w.def);
        vUsed.add(vi);
      },
      list,
    );
    if (!ok) return;
    if (!any) {
      this.anomalies++;
      return;
    }
    if (vUsed.has(0)) {
      const key = `${spell.join(',')}|${o.ctx.sel},${o.ctx.weak},${o.ctx.alive.join(',')}`;
      if (!this.history.some((h) => h.key === key)) this.history.push({ spell: [...spell], ctx: o.ctx, reson: o.reson, sig, runes: rs, key });
    }
    for (const r of rs) this.cand[r] = new Set([...this.cand[r]].filter((m) => seen.get(r)!.has(m)));
    this.tSide = tS;
    this.mSide = mS;
    this.def = dS;
    // Specials: drop options no consistent hypothesis needs; confirm one that every hypothesis needs.
    opts.forEach((op) => {
      const used = [...vUsed].some((vi) => list[vi].some((s) => specialKey(s) === specialKey(op)));
      if (!used) this.refuted.add(specialKey(op));
    });
    if (!vUsed.has(0)) {
      for (const op of opts) {
        const all = [...vUsed].every((vi) => list[vi].some((s) => specialKey(s) === specialKey(op)));
        if (all) this.confirmed.push(op);
      }
    }
    this.propagate();
  }

  private propagate(): void {
    for (let loop = 0; loop < 10; loop++) {
      let changed = false;
      for (let r = 0; r < 8; r++) {
        if (this.cand[r].size !== 1) continue;
        const m = [...this.cand[r]][0];
        for (let q = 0; q < 8; q++) if (q !== r && this.cand[q].has(m) && this.cand[q].size > 1) {
          this.cand[q].delete(m);
          changed = true;
        }
      }
      for (const role of ['el', 'tgt', 'mod'] as Role[]) {
        const sure = [...Array(8).keys()].filter((r) => [...this.cand[r]].every((m) => roleOf(m) === role));
        const maybe = [...Array(8).keys()].filter((r) => [...this.cand[r]].some((m) => roleOf(m) === role));
        if (sure.length === ROLE_COUNT[role]) {
          for (const r of maybe) if (!sure.includes(r)) {
            this.cand[r] = new Set([...this.cand[r]].filter((m) => roleOf(m) !== role));
            changed = true;
          }
        } else if (maybe.length === ROLE_COUNT[role]) {
          for (const r of maybe) if (this.cand[r].size > [...this.cand[r]].filter((m) => roleOf(m) === role).length) {
            this.cand[r] = new Set([...this.cand[r]].filter((m) => roleOf(m) === role));
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    if (this.tabooCands?.size === 0) this.tabooCands = null;
    if (this.resonCands?.size === 0) this.resonCands = null;
  }

  /** A revealed fact (hint scroll, library, Linguist perk). */
  reveal(f: Fact, w: World): void {
    switch (f.t) {
      case 'rune':
        this.cand[f.r] = new Set([w.mean[f.r]]);
        break;
      case 'tgtSide':
        this.tSide = new Set([w.tgtSide]);
        break;
      case 'modSide':
        this.mSide = new Set([w.modSide]);
        break;
      case 'def':
        this.def = new Set([w.def]);
        break;
      case 'special': {
        const s = w.specials[f.i];
        if (s.t === 'reson') this.resonCands = new Set([pairKey(s.a, s.b)]);
        else if (s.t === 'taboo') this.tabooCands = new Set([s.a]);
        else if (!this.confirmed.some((c) => specialKey(c) === specialKey(s))) this.confirmed.push(s);
        break;
      }
    }
    this.propagate();
  }

  /** The best-guess world for planning. Unknown runes are left out by the planner. */
  belief(): World {
    const mean = this.cand.map((c) => [...c][0]);
    const specials: Special[] = [...this.confirmed];
    if (this.resonCands?.size === 1) {
      const [a, b] = [...this.resonCands][0].split(':').map(Number);
      specials.push({ t: 'reson', a, b });
    }
    if (this.tabooCands?.size === 1) specials.push({ t: 'taboo', a: [...this.tabooCands][0] });
    return { mean, tgtSide: [...this.tSide][0], modSide: [...this.mSide][0], def: [...this.def][0], specials };
  }

  /** A rune the planner may use: its meaning is known and its grammar side is known. */
  usable(r: number): boolean {
    const m = this.meaning(r);
    if (!m) return false;
    const role = roleOf(m);
    if (role === 'tgt' && this.tSide.size > 1) return false;
    if (role === 'mod' && this.mSide.size > 1) return false;
    if (this.tabooCands && this.tabooCands.size > 1 && this.tabooCands.has(r)) return false;
    return true;
  }

  /** How many distinct results the experiment could show (more = more to learn). */
  experimentValue(spell: number[], ctx: Ctx): number {
    const sigs = new Set<string>();
    const ok = this.enumerate(spell, (w) => {
      if (sigs.size < 40) sigs.add(signature(parse(w, spell, ctx)));
    });
    return ok ? sigs.size : 0;
  }

  /** Replay a stored log (after loading a saved run). */
  replay(log: LogEntry[]): void {
    for (const e of log) this.observe({ spell: e.spell, ctx: e.ctx, silent: e.silent, outs: e.outs, reson: e.reson, backlash: e.backlash });
  }

  unknownCount(): number {
    return this.cand.filter((c) => c.size > 1).length + (this.tSide.size > 1 ? 1 : 0) + (this.mSide.size > 1 ? 1 : 0) + (this.def.size > 1 ? 1 : 0);
  }
}

// ---------- Fight planning ----------

function cloneFight(f: Fight): Fight {
  return { ...f, foes: f.foes.map((x) => ({ ...x })), silenced: [...f.silenced] };
}

function evalState(f: Fight, h: Hero): number {
  let v = 0;
  const inc = Math.max(0, incoming(f) - f.hShield);
  const low = h.hp < h.maxHp * 0.4 ? 1.6 : 1;
  v += Math.max(0, h.hp) * low;
  v -= inc * 1.1 * low;
  v -= (f.hPoison * (f.hPoison + 1)) / 2;
  if (h.hp <= 0) v -= 1000;
  for (const i of alive(f)) {
    const foe = f.foes[i];
    const pois = Math.min(foe.hp, (foe.poison * (foe.poison + 1)) / 2) * 0.8;
    v -= Math.max(0, foe.hp - pois);
    v -= 12;
  }
  if (!alive(f).length) v += 500;
  return v;
}

/** Score of a spell under the bot's belief world. */
function spellValue(f: Fight, h: Hero, w: World, spell: number[]): number {
  const f2 = cloneFight(f);
  const h2 = { ...h, charms: h.charms };
  const real = f2.kind;
  if (isTest(f2)) f2.kind = 'fight';
  cast(f2, h2, w, spell);
  f2.kind = real;
  return evalState(f2, h2);
}

/** How much a spell improves the state under the bot's belief. */
export function spellGain(l: Learner, f: Fight, h: Hero, spell: number[]): number {
  const w = l.belief();
  return spellValue(f, h, w, spell) - evalState(f, h);
}

export function planSpell(l: Learner, f: Fight, h: Hero, beam = 8): number[] | null {
  const w = l.belief();
  const runes = h.runes.filter((r) => !f.silenced.includes(r) && l.usable(r));
  if (!runes.length) return null;
  const defs = [...l.def];
  const value = (s: number[]): number => {
    if (defs.length === 1) return spellValue(f, h, w, s);
    let m = Infinity;
    for (const d of defs) m = Math.min(m, spellValue(f, h, { ...w, def: d }, s));
    return m;
  };
  let level: { s: number[]; v: number }[] = runes.map((r) => ({ s: [r], v: value([r]) }));
  let best = level.reduce((a, b) => (b.v > a.v ? b : a));
  for (let len = 2; len <= h.maxLen; len++) {
    level.sort((a, b) => b.v - a.v);
    const seen = new Set<string>();
    const next: { s: number[]; v: number }[] = [];
    for (const { s } of level.slice(0, beam))
      for (const r of runes)
        for (let p = 0; p <= s.length; p++) {
          const n = [...s.slice(0, p), r, ...s.slice(p)];
          const k = n.join(',');
          if (seen.has(k)) continue;
          seen.add(k);
          next.push({ s: n, v: value(n) });
        }
    if (!next.length) break;
    level = next;
    for (const c of next) if (c.v > best.v) best = c;
  }
  return best.s;
}

/** The most informative small experiment, or null when nothing is left to learn with these runes. */
export function planExperiment(l: Learner, f: Fight, h: Hero, allowSpecial = isTest(f)): number[] | null {
  const ctx = ctxOf(f);
  const runes = h.runes.filter((r) => !f.silenced.includes(r));
  const untried = runes.filter((r) => !l.tried.has(r) && !l.known(r));
  if (untried.length) return [untried[0]];
  const els = runes.filter((r) => l.meaning(r) && roleOf(l.meaning(r)!) === 'el');
  const cands: number[][] = [];
  const unknown = runes.filter((r) => !l.known(r) || !l.usable(r));
  for (const x of unknown) {
    if (els.includes(x)) continue;
    for (const e of els) cands.push([x, e], [e, x]);
  }
  // Grammar checks with two known words on one element.
  if (els.length >= 2) cands.push([els[0], els[1]]);
  if (allowSpecial) {
    for (const e of els) cands.push([e, e]);
    for (const e of els) for (const r of runes) if (r !== e && l.known(r)) cands.push([r, e], [e, r]);
  }
  let best: number[] | null = null;
  let bv = 1;
  for (const c of cands) {
    const v = l.experimentValue(c, ctx);
    if (v > bv) {
      bv = v;
      best = c;
    }
  }
  return best;
}

// ---------- Whole-run policy ----------

export type BotKind = 'random' | 'learner' | 'oracle';

export type Action =
  | { t: 'room'; i: number }
  | { t: 'cast'; spell: number[]; sel: number }
  | { t: 'leave' }
  | { t: 'pick'; i: number }
  | { t: 'charm' }
  | { t: 'next' }
  | { t: 'buy'; i: number }
  | { t: 'heal' }
  | { t: 'study' }
  | { t: 'read' }
  | { t: 'scroll' };

export function botAction(run: RunState, l: Learner, kind: BotKind, rng: Rng): Action {
  const h = run.hero;
  const smart = kind !== 'random';
  switch (run.at) {
    case 'map': {
      if (smart && h.scrolls > 0 && unknownFacts(run).length) return { t: 'scroll' };
      const opts = roomOptions(run);
      if (!smart) return { t: 'room', i: rng.int(0, opts.length - 1) };
      const score = (o: string): number => {
        const hp = h.hp / h.maxHp;
        switch (o) {
          case 'rest':
            return hp < 0.6 ? 10 : 2;
          case 'shop':
            return h.gold >= 40 ? 6 + (hp < 0.4 ? 0 : 1) : 1;
          case 'study':
            return l.unknownCount() > 2 ? 5 : 0;
          case 'library':
            return hp > 0.6 && unknownFacts(run).length ? 4 : 0;
          case 'elite':
            return hp > 0.75 ? 4.5 : -1;
          default:
            return 3;
        }
      };
      let bi = 0;
      opts.forEach((o, i) => score(o) > score(opts[bi]) && (bi = i));
      return { t: 'room', i: bi };
    }
    case 'fight': {
      const f = run.fight!;
      const al = alive(f);
      const free = h.runes.filter((r) => !f.silenced.includes(r));
      if (!smart) {
        const len = rng.int(1, h.maxLen);
        return { t: 'cast', spell: Array.from({ length: len }, () => rng.pick(free)), sel: rng.pick(al) };
      }
      // Target the weakest foe that is a threat.
      let sel = al[0];
      for (const i of al) if (f.foes[i].hp < f.foes[sel].hp) sel = i;
      if (isTest(f)) {
        const ex = planExperiment(l, f, h);
        if (ex) return { t: 'cast', spell: ex, sel: f.sel };
        return { t: 'leave' };
      }
      f.sel = sel;
      const safe = h.hp > h.maxHp * 0.6 && incoming(f) < h.hp * 0.25;
      if (kind === 'learner' && safe && rng.chance(0.5)) {
        const ex = planExperiment(l, f, h);
        if (ex) return { t: 'cast', spell: ex, sel };
      }
      let sp = planSpell(l, f, h);
      if (sp && spellGain(l, f, h, sp) <= 0.5) sp = planExperiment(l, f, h, false) ?? sp;
      sp = sp ?? planExperiment(l, f, h) ?? [rng.pick(free)];
      return { t: 'cast', spell: sp, sel };
    }
    case 'reward': {
      const rw = run.rewards!;
      if (rw.charm && !rw.charmTaken) return { t: 'charm' };
      if (!rw.taken && rw.picks.length) {
        if (!smart) return { t: 'pick', i: rng.int(0, rw.picks.length - 1) };
        const pr = (t: string): number =>
          ({ len: h.maxLen < 5 ? 10 : 3, rune: 6, scroll: unknownFacts(run).length > 2 ? 7 : 1, charm: 5, hp: h.hp < h.maxHp * 0.5 ? 8 : 4, heal: 0 })[t] ?? 0;
        let bi = 0;
        rw.picks.forEach((p, i) => pr(p.t) > pr(rw.picks[bi].t) && (bi = i));
        return { t: 'pick', i: bi };
      }
      return { t: 'next' };
    }
    case 'shop': {
      const items = run.shop!;
      if (smart) {
        const order = ['len', 'scroll', 'rune', 'charm'];
        if (h.hp < h.maxHp * 0.6) order.unshift('heal');
        for (const t of order) {
          const i = items.findIndex((it) => it.pick.t === t && !it.sold && it.cost <= h.gold);
          if (i >= 0 && !(t === 'heal' && h.hp >= h.maxHp - 5)) return { t: 'buy', i };
        }
      } else {
        const i = items.findIndex((it) => !it.sold && it.cost <= h.gold);
        if (i >= 0 && rng.chance(0.5)) return { t: 'buy', i };
      }
      return { t: 'next' };
    }
    case 'rest':
      if (smart && h.hp > h.maxHp * 0.8 && l.unknownCount() > 0) return { t: 'study' };
      if (!smart && rng.chance(0.5)) return { t: 'study' };
      return { t: 'heal' };
    case 'library':
      if (smart ? h.hp > LIBRARY_COST * 3 && unknownFacts(run).length > 0 : rng.chance(0.5)) return { t: 'read' };
      return { t: 'next' };
    default:
      return { t: 'next' };
  }
}

export const charmName = (id: string): string => CHARMS[id]?.name ?? id;
