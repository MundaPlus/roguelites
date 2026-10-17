/** Pure duel logic: the belief model, the enemy AI and the round function. */
import { ACTIONS, CHARGE, ENEMIES, FEINT, GUARD, MOVES, READERS, STRIKE, actName, beats, counterOf, oppositeOf, type EnemyDef, type Reader } from './data';
import { Rng, hash } from './rng';

/** One remembered round: your claim and your real action. */
export interface Mem {
  c: number;
  a: number;
}

export interface Player {
  hp: number;
  maxHp: number;
  /** One move id per action slot: Strike, Feint, Guard, Charge. */
  moves: string[];
  relics: string[];
  /** Run record: true claims and lies. New foes hear about it. */
  rec: { h: number; l: number };
}

export interface View {
  reader: Reader;
  /** Its belief that your claim is true. */
  trust: number;
  /** The actions it thinks you favor. */
  fav: number[];
  /** What it expects you to play this round (after your claim, else = fav). */
  expect: number[];
}

export type Tone = 'calm' | 'lie';

export interface Plan {
  act: number;
  claim: number;
  bluff: boolean;
  tell: Tone;
  view: View;
}

export type Kind = 'win' | 'lose' | 'clash' | 'stare' | 'chip';

export interface RoundLog {
  n: number;
  pc: number;
  pa: number;
  ec: number;
  ea: number;
  toE: number;
  toP: number;
  heal: number;
  kind: Kind;
  text: string;
  forgot: boolean;
  switched: Reader | null;
}

export interface Duel {
  enemy: string;
  seed: number;
  round: number;
  hp: number;
  maxHp: number;
  mem: Mem[];
  /** Starting trust of its model (from its type and your record). */
  prior: number;
  phase: 'claim' | 'act' | 'over';
  claim: number | null;
  plan: Plan | null;
  bleed: number;
  sand: boolean;
  used: string[];
  peek: boolean;
  log: RoundLog[];
  won: boolean | null;
  /** Chance that it second-guesses you: it plays against your best answer to its plan. */
  wary: number;
}

export const BASE_PRIOR: Record<Reader, number> = { gullible: 0.85, paranoid: 0.35, statistician: 0.5, mirror: 0.5 };

/** Its starting chance to second-guess you. */
export const BASE_WARY: Record<Reader, number> = { gullible: 0.05, paranoid: 0.15, statistician: 0.25, mirror: 0.15 };
/** How much its honesty drops when you always counter its claims. */
export const FOLLOW_PENALTY = 0.1;
export const WARY_UP = 0.16;
export const WARY_DOWN = 0.06;
export const WARY_MAX = 0.6;

/** Global balance knobs (tuned with the sim). */
export const TUNE = { hp: 1, dmg: 1, honesty: 0, tell: 0, temp: 1.5, follow: 1, wary: 1, wild: 0.2 };

/** Rounds after which both sides lose 1 HP per round. */
export const FATIGUE = 16;

export const has = (p: Player, id: string): boolean => p.relics.includes(id);

export const edef = (d: Duel): EnemyDef => ENEMIES[d.enemy];

export function readerOf(d: Duel): Reader {
  const rs = edef(d).readers;
  const i = Math.min(rs.length - 1, Math.floor((1 - Math.max(0, d.hp) / d.maxHp) * rs.length));
  return rs[Math.max(0, i)];
}

export const repTrust = (p: Player): number => (p.rec.h + 1) / (p.rec.h + p.rec.l + 2);

export function startPrior(reader: Reader, p: Player): number {
  const base = BASE_PRIOR[reader];
  if (has(p, 'mask') || p.rec.h + p.rec.l < 3) return base;
  return 0.5 * base + 0.5 * repTrust(p);
}

export function newDuel(enemy: string, seed: number, p: Player, hpMult = 1): Duel {
  const def = ENEMIES[enemy];
  const hp = Math.round(def.hp * hpMult * TUNE.hp);
  return {
    enemy,
    seed,
    round: 0,
    hp,
    maxHp: hp,
    mem: [],
    prior: startPrior(def.readers[0], p),
    phase: 'claim',
    claim: null,
    plan: null,
    bleed: 0,
    sand: false,
    used: [],
    peek: false,
    log: [],
    won: null,
    wary: BASE_WARY[def.readers[0]],
  };
}

const norm = (v: number[]): number[] => {
  const s = v.reduce((a, b) => a + b, 0) || 1;
  return v.map((x) => x / s);
};

function favOf(mem: Mem[]): number[] {
  const f = [1, 1, 1, 1];
  let w = 1.5;
  for (let i = mem.length - 1; i >= 0; i--) {
    f[mem[i].a] += w;
    w *= 0.85;
  }
  return norm(f);
}

/** How the enemy sees you. Pure: the same inputs give the same view. */
export function view(reader: Reader, allMem: Mem[], prior: number, claim: number | null, short = false): View {
  const mem = allMem.slice(short ? -4 : -10);
  const n = mem.length;
  const h = mem.filter((m) => m.c === m.a).length;
  const l = n - h;
  let trust = prior;
  let fav = favOf(mem);
  /** Weights for the actions other than the claim, by their offset from the claim (1..3). */
  let other: (c: number) => number[] = (c) => [0, 1, 2, 3].map((a) => (a === c ? 0 : 1));
  switch (reader) {
    case 'gullible':
      trust = (h + 6 * prior) / (n + 6);
      break;
    case 'paranoid':
      trust = (h + 3 * prior) / (h + 3 * l + 3);
      other = (c) => fav.map((f, a) => (a === c ? 0 : f * f));
      break;
    case 'statistician': {
      const off = [2 * prior, (2 * (1 - prior)) / 3, (2 * (1 - prior)) / 3, (2 * (1 - prior)) / 3];
      for (const m of mem) off[(m.a - m.c + 4) % 4] += 1;
      const s = off.reduce((a, b) => a + b, 0);
      trust = off[0] / s;
      other = (c) => [0, 1, 2, 3].map((a) => (a === c ? 0 : 0.7 * (off[(a - c + 4) % 4] / s) + 0.3 * fav[a]));
      break;
    }
    case 'mirror': {
      const last = mem[n - 1];
      if (last) {
        const honest = last.c === last.a;
        trust = honest ? 0.8 : 0.2;
        fav = [0, 1, 2, 3].map((a) => (a === last.a ? 0.55 : 0.15));
        const k = (last.a - last.c + 4) % 4;
        other = (c) => [0, 1, 2, 3].map((a) => (a === c ? 0 : honest ? fav[a] : (a - c + 4) % 4 === k ? 3 : 1));
      }
      break;
    }
  }
  trust = Math.max(0.02, Math.min(0.98, trust));
  let expect = fav;
  if (claim !== null) {
    const o = norm(other(claim));
    expect = o.map((x, a) => (a === claim ? trust : (1 - trust) * x));
  }
  return { reader, trust, fav, expect };
}

/** Damage of one pairing: your action `pa` against its action `ea`. No claim bonuses. */
export function outcome(pa: number, ea: number, p: Player, dmg: readonly number[]): { toE: number; toP: number; kind: Kind } {
  const mv = MOVES[p.moves[pa]];
  const skin = has(p, 'skin') ? 1 : 0;
  if (pa === ea) {
    if (pa === STRIKE) return { toE: 2, toP: Math.max(0, 2 - skin), kind: 'clash' };
    if (pa === CHARGE) return { toE: 3, toP: Math.max(0, 3 - skin), kind: 'clash' };
    return { toE: 0, toP: 0, kind: 'stare' };
  }
  if (beats(pa, ea)) {
    let d = mv.win;
    if ((pa === STRIKE || pa === CHARGE) && has(p, 'whet')) d++;
    if ((pa === GUARD || pa === FEINT) && has(p, 'gaunt')) d++;
    return { toE: d, toP: 0, kind: 'win' };
  }
  if (beats(ea, pa)) return { toE: 0, toP: dmg[ea] + mv.loseExtra, kind: 'lose' };
  // Opposite pairs: Strike vs Guard, Feint vs Charge.
  if (pa === STRIKE) return { toE: 1, toP: 0, kind: 'chip' };
  if (pa === CHARGE) return { toE: mv.fx === 'ram' ? 3 : 1, toP: 0, kind: 'chip' };
  if (pa === GUARD) return { toE: 0, toP: mv.fx === 'nochip' ? 0 : Math.max(0, 1 - skin), kind: 'chip' };
  return { toE: 0, toP: Math.max(0, 1 - skin), kind: 'chip' };
}

export function enemyDmg(d: Duel): number[] {
  return edef(d).dmg.map((x) => Math.round(x * TUNE.dmg));
}

/** Its expected gain (damage dealt minus taken) for each of its actions. */
export function enemyEV(expect: number[], p: Player, dmg: readonly number[]): number[] {
  return [0, 1, 2, 3].map((b) => {
    let ev = 0;
    for (let a = 0; a < 4; a++) {
      const o = outcome(a, b, p, dmg);
      ev += expect[a] * (o.toP - o.toE);
    }
    return ev;
  });
}

export function softmax(ev: number[], temp: number): number[] {
  const m = Math.max(...ev);
  return norm(ev.map((x) => Math.exp((x - m) / temp)));
}

/** Chance that the enemy plays each action, given what it expects from you. */
export function enemyMix(expect: number[], d: Duel, p: Player): number[] {
  const dmg = enemyDmg(d);
  const temp = edef(d).temp * TUNE.temp;
  const l1 = softmax(enemyEV(expect, p, dmg), temp);
  // Second guess: your best answer to its plan, and its answer to that.
  const yourEV = [0, 1, 2, 3].map((a) => {
    let ev = 0;
    for (let b = 0; b < 4; b++) {
      const o = outcome(a, b, p, dmg);
      ev += l1[b] * (o.toE - o.toP);
    }
    return ev;
  });
  const l2 = softmax(enemyEV(softmax(yourEV, 1), p, dmg), temp);
  const w = d.wary;
  return l1.map((x, i) => (1 - TUNE.wild) * ((1 - w) * x + w * l2[i]) + TUNE.wild / 4);
}

/** Change of wariness after a round: it grows when you win and shrinks when it wins. */
export function nextWary(d: Duel, kind: Kind): number {
  const base = BASE_WARY[readerOf(d)];
  const w = d.wary + (kind === 'win' ? WARY_UP * TUNE.wary : kind === 'lose' ? -WARY_DOWN : 0);
  return Math.max(base, Math.min(WARY_MAX, w));
}

/** How often you played the counter of its claim in the last 6 rounds. */
export function followRate(d: Duel): number {
  const recent = d.log.slice(-6);
  if (!recent.length) return 0;
  return recent.filter((l) => l.pa === counterOf(l.ec)).length / recent.length;
}

/** Chance that its claim is true. It drops when you keep countering its claims. */
export function enemyHonesty(d: Duel): number {
  const def = edef(d);
  let h = def.honesty;
  if (readerOf(d) === 'mirror') {
    const last = d.log[d.log.length - 1];
    if (last) h = last.pc === last.pa ? 0.8 : 0.3;
  }
  h -= FOLLOW_PENALTY * TUNE.follow * Math.max(0, followRate(d) - 0.25);
  return Math.max(0.15, Math.min(0.9, h + TUNE.honesty));
}

export function tellAcc(d: Duel, p: Player): number {
  if (d.sand) return 1;
  return Math.min(0.95, edef(d).tellAcc + TUNE.tell + (has(p, 'eye') ? 0.15 : 0));
}

/** Chance that its claim is true, given the tell you see. What a careful player can work out. */
export function honestGivenTell(d: Duel, p: Player, tell: Tone): number {
  const h = enemyHonesty(d);
  const acc = tellAcc(d, p);
  const pt = tell === 'calm' ? h * acc : h * (1 - acc);
  const pf = tell === 'calm' ? (1 - h) * (1 - acc) : (1 - h) * acc;
  return pt / (pt + pf || 1);
}

export function currentView(d: Duel, p: Player, claim: number | null): View {
  const v = view(readerOf(d), d.mem, d.prior, claim, has(p, 'veil'));
  if (claim !== null && d.round === 0 && has(p, 'ace')) {
    return { ...v, trust: 1, expect: [0, 1, 2, 3].map((a) => (a === claim ? 1 : 0)) };
  }
  return v;
}

/** Step 1 of a round: you announce `claim`. The enemy reads it, picks its action and announces its own intent. */
export function announce(d: Duel, p: Player, claim: number): void {
  if (d.phase !== 'claim') return;
  const rng = new Rng(hash(d.seed, d.round, 'plan'));
  const def = edef(d);
  const v = currentView(d, p, claim);
  const mix = enemyMix(v.expect, d, p);
  const act = rng.weighted(mix.map((w, i) => [i, w] as const));
  const bluff = !rng.chance(enemyHonesty(d));
  let eclaim = act;
  if (bluff) eclaim = rng.chance(def.smart) ? oppositeOf(act) : rng.pick([0, 1, 2, 3].filter((x) => x !== act));
  const truthful = rng.chance(tellAcc(d, p));
  const tell: Tone = truthful === bluff ? 'lie' : 'calm';
  d.claim = claim;
  d.plan = { act, claim: eclaim, bluff, tell, view: v };
  d.phase = 'act';
}

/** Step 2 of a round: you act. Applies damage, updates its memory and your record. */
export function resolve(d: Duel, p: Player, act: number): RoundLog | null {
  if (d.phase !== 'act' || !d.plan || d.claim === null) return null;
  const plan = d.plan;
  const claim = d.claim;
  const mv = MOVES[p.moves[act]];
  const readerBefore = readerOf(d);
  const o = outcome(act, plan.act, p, enemyDmg(d));
  let { toE } = o;
  let toP = o.toP;
  let heal = 0;
  const honest = act === claim;
  if (o.kind === 'win') {
    if (honest && has(p, 'oath')) toE += 2;
    if (!honest && has(p, 'coin')) toE += 2;
    heal += mv.heal + (has(p, 'fang') ? 1 : 0);
  }
  if (d.bleed > 0) {
    toE += 1;
    d.bleed--;
  }
  if (d.round + 1 >= FATIGUE) {
    toE += 1;
    toP += 1;
  }
  d.hp = Math.max(0, d.hp - toE);
  p.hp = Math.max(0, Math.min(p.maxHp, p.hp - toP + heal));
  d.wary = nextWary(d, o.kind);
  if (o.kind === 'win' && mv.fx === 'bleed') d.bleed = 3;
  d.sand = o.kind === 'win' && mv.fx === 'sand';
  const forgot = o.kind === 'win' && mv.fx === 'forget';
  if (!forgot) {
    d.mem.push({ c: claim, a: act });
    if (honest) p.rec.h++;
    else p.rec.l++;
  }
  const readerAfter = readerOf(d);
  const log: RoundLog = {
    n: d.round + 1,
    pc: claim,
    pa: act,
    ec: plan.claim,
    ea: plan.act,
    toE,
    toP,
    heal,
    kind: o.kind,
    text: roundText(o.kind, act, plan.act, toE, toP),
    forgot,
    switched: readerAfter !== readerBefore && d.hp > 0 ? readerAfter : null,
  };
  d.log.push(log);
  d.round++;
  d.claim = null;
  d.plan = null;
  d.peek = false;
  if (p.hp <= 0) {
    d.phase = 'over';
    d.won = false;
  } else if (d.hp <= 0) {
    d.phase = 'over';
    d.won = true;
  } else {
    d.phase = 'claim';
  }
  return log;
}

function roundText(kind: Kind, pa: number, ea: number, toE: number, toP: number): string {
  switch (kind) {
    case 'win':
      return `${actName(pa)} beats ${actName(ea)}.`;
    case 'lose':
      return `${actName(ea)} beats ${actName(pa)}.`;
    case 'clash':
      return `Both ${ACTIONS[pa].name}: you trade blows.`;
    case 'stare':
      return `Both ${ACTIONS[pa].name}: nothing happens.`;
    case 'chip':
      return toE > toP ? `${actName(pa)} grazes ${actName(ea)}.` : `${actName(ea)} grazes ${actName(pa)}.`;
  }
}

/** Use the Lethe Vial: the foe forgets everything about you. */
export function useLethe(d: Duel): boolean {
  if (d.phase !== 'claim' || d.used.includes('lethe')) return false;
  d.used.push('lethe');
  d.mem = [];
  d.prior = BASE_PRIOR[readerOf(d)];
  return true;
}

/** Use the Crystal Ball: see its real pick this round. */
export function useBall(d: Duel): boolean {
  if (d.phase !== 'act' || d.used.includes('ball')) return false;
  d.used.push('ball');
  d.peek = true;
  return true;
}

export const readerName = (r: Reader): string => `${READERS[r].icon} ${READERS[r].name}`;
