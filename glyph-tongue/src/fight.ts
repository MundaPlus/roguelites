/** Fight state and rules. Pure functions on plain data, so the sim and the UI share them. */
import { ACTS, FOES, type Intent } from './data';
import { parse, type Ctx, type Outcome, type Parsed, type World } from './lang';
import { Rng } from './rng';

export type FightKind = 'test' | 'study' | 'fight' | 'elite' | 'boss';

export interface Foe {
  uid: number;
  id: string;
  hp: number;
  max: number;
  shield: number;
  poison: number;
  dull: number;
  buff: number;
  pi: number;
}

export interface Fight {
  kind: FightKind;
  act: number;
  foes: Foe[];
  sel: number;
  turn: number;
  /** Casts left in a test room; -1 in real fights. */
  casts: number;
  silenced: number[];
  hShield: number;
  hPoison: number;
  hDull: number;
  nextUid: number;
  over: null | 'win' | 'lose' | 'left';
}

export interface Hero {
  hp: number;
  maxHp: number;
  gold: number;
  charms: string[];
  runes: number[];
  maxLen: number;
  scrolls: number;
  phoenix: boolean;
}

export type Ev =
  | { t: 'out'; o: Outcome }
  | { t: 'dmg'; who: number; amt: number; blocked: number }
  | { t: 'heal'; who: number; amt: number }
  | { t: 'shield'; who: number; amt: number }
  | { t: 'poison'; who: number; amt: number }
  | { t: 'dull'; who: number; amt: number }
  | { t: 'kill'; who: number }
  | { t: 'wild'; amt: number }
  | { t: 'backlash'; amt: number }
  | { t: 'reson' }
  | { t: 'fizzle' }
  | { t: 'act'; who: number; it: Intent }
  | { t: 'silence'; runes: number[] }
  | { t: 'summon'; who: number }
  | { t: 'tick'; who: number; amt: number }
  | { t: 'phoenix' };

/** From this turn on, foes gain +2 attack each turn, so no fight lasts forever. */
export const restlessTurn = (f: Fight): number => (f.kind === 'boss' ? 14 : f.kind === 'elite' ? 12 : 9);
export const isTest = (f: Fight): boolean => f.kind === 'test' || f.kind === 'study';
export const alive = (f: Fight): number[] => f.foes.map((x, i) => (x.hp > 0 ? i : -1)).filter((i) => i >= 0);

export function makeFoe(f: Fight, id: string): Foe {
  const d = FOES[id];
  const a = ACTS[f.act];
  const test = isTest(f);
  const max = test ? d.hp : Math.round(d.hp * a.hpMul);
  return { uid: f.nextUid++, id, hp: max, max, shield: 0, poison: 0, dull: 0, buff: 0, pi: 0 };
}

export function startFight(kind: FightKind, act: number, rng: Rng, hero: Hero, testCasts: number): Fight {
  const f: Fight = { kind, act, foes: [], sel: 0, turn: 1, casts: -1, silenced: [], hShield: 0, hPoison: 0, hDull: 0, nextUid: 1, over: null };
  const a = ACTS[act];
  let ids: string[];
  if (kind === 'test' || kind === 'study') {
    ids = ['strawDummy', 'twigDummy'];
    f.casts = testCasts;
  } else if (kind === 'boss') ids = [a.boss];
  else if (kind === 'elite') ids = [a.elite];
  else {
    const n = rng.int(a.size[0], a.size[1]);
    ids = Array.from({ length: n }, () => rng.pick(a.pool));
  }
  for (const id of ids) {
    const foe = makeFoe(f, id);
    if (FOES[id].shuffle) foe.pi = rng.int(0, FOES[id].pattern.length - 1);
    f.foes.push(foe);
  }
  if (!isTest(f) && hero.charms.includes('mirror')) f.hShield = 6;
  return f;
}

export const intentOf = (foe: Foe): Intent => {
  const p = FOES[foe.id].pattern;
  return p[foe.pi % p.length];
};

/** Damage of one hit of an attack intent, before shield and dull. */
export const hitDmg = (f: Fight, foe: Foe, n: number): number => Math.round((n + foe.buff) * ACTS[f.act].atkMul);
export const scaled = (f: Fight, n: number): number => Math.round(n * ACTS[f.act].hpMul);

/** Expected damage to the hero from all intents this turn, ignoring shield. */
export function incoming(f: Fight): number {
  let sum = 0;
  for (const i of alive(f)) {
    const foe = f.foes[i];
    const it = intentOf(foe);
    if (it.t === 'atk') {
      const hits = it.hits ?? 1;
      sum += Math.max(0, hitDmg(f, foe, it.n) * hits - foe.dull);
    }
  }
  return sum;
}

export function ctxOf(f: Fight): Ctx {
  const al = alive(f);
  let weak = al[0];
  for (const i of al) if (f.foes[i].hp < f.foes[weak].hp) weak = i;
  const sel = al.includes(f.sel) ? f.sel : al[0];
  return { sel, weak, alive: al };
}

function hurtFoe(f: Fight, i: number, amt: number, evs: Ev[]): number {
  const foe = f.foes[i];
  if (foe.hp <= 0) return 0;
  const blocked = Math.min(foe.shield, amt);
  foe.shield -= blocked;
  const dealt = Math.min(foe.hp, amt - blocked);
  foe.hp -= amt - blocked;
  evs.push({ t: 'dmg', who: i, amt: amt - blocked, blocked });
  if (foe.hp <= 0) {
    foe.hp = 0;
    evs.push({ t: 'kill', who: i });
  }
  return dealt;
}

function hurtHero(f: Fight, h: Hero, amt: number, evs: Ev[], pierce = false): void {
  const blocked = pierce ? 0 : Math.min(f.hShield, amt);
  f.hShield -= blocked;
  h.hp -= amt - blocked;
  evs.push({ t: 'dmg', who: -1, amt: amt - blocked, blocked });
  if (h.hp <= 0 && h.phoenix) {
    h.phoenix = false;
    h.hp = 12;
    evs.push({ t: 'phoenix' });
  }
}

function healHero(h: Hero, amt: number, evs: Ev[]): void {
  const before = h.hp;
  h.hp = Math.min(h.maxHp, h.hp + amt);
  evs.push({ t: 'heal', who: -1, amt: h.hp - before });
}

export interface CastResult {
  parsed: Parsed;
  ctx: Ctx;
  evs: Ev[];
}

/** Cast a spell. In test rooms nothing lasts: hero and dummies are restored after the cast. */
export function cast(f: Fight, h: Hero, w: World, spell: number[]): CastResult {
  const ctx = ctxOf(f);
  const parsed = parse(w, spell, ctx);
  const evs: Ev[] = [];
  const test = isTest(f);
  const snap = test ? JSON.stringify({ foes: f.foes, hp: h.hp, s: f.hShield, p: f.hPoison, d: f.hDull }) : '';
  if (parsed.reson) evs.push({ t: 'reson' });
  if (!parsed.outs.length) evs.push({ t: 'fizzle' });
  let dullLeft = f.hDull;
  for (const o of parsed.outs) {
    evs.push({ t: 'out', o });
    for (const t of o.tg) {
      if (t === -1) {
        switch (o.kind) {
          case 'harm':
            hurtHero(f, h, o.amt, evs);
            break;
          case 'drain':
            hurtHero(f, h, o.amt, evs);
            healHero(h, o.amt, evs);
            break;
          case 'venom':
            f.hPoison += o.amt;
            evs.push({ t: 'poison', who: -1, amt: o.amt });
            break;
          case 'mend':
            healHero(h, o.amt, evs);
            break;
          case 'ward':
            f.hShield += o.amt;
            evs.push({ t: 'shield', who: -1, amt: o.amt });
            break;
          case 'hex':
            f.hDull += o.amt;
            evs.push({ t: 'dull', who: -1, amt: o.amt });
            break;
        }
        continue;
      }
      const foe = f.foes[t];
      if (!foe || foe.hp <= 0) continue;
      switch (o.kind) {
        case 'harm':
        case 'drain': {
          const red = Math.min(dullLeft, o.amt);
          dullLeft -= red;
          const dealt = hurtFoe(f, t, o.amt - red, evs);
          if (dealt > 0 && h.charms.includes('fang')) healHero(h, 1, evs);
          if (o.kind === 'drain') healHero(h, o.amt, evs);
          break;
        }
        case 'venom':
          foe.poison += o.amt;
          evs.push({ t: 'poison', who: t, amt: o.amt });
          break;
        case 'mend': {
          const before = foe.hp;
          foe.hp = Math.min(foe.max, foe.hp + o.amt);
          evs.push({ t: 'heal', who: t, amt: foe.hp - before });
          break;
        }
        case 'ward':
          foe.shield += o.amt;
          evs.push({ t: 'shield', who: t, amt: o.amt });
          break;
        case 'hex':
          foe.dull += o.amt;
          evs.push({ t: 'dull', who: t, amt: o.amt });
          break;
      }
    }
  }
  if (f.hDull > 0 && dullLeft < f.hDull) f.hDull = 0;
  const silentN = parsed.silent.filter(Boolean).length;
  const wildPer = test ? 0 : Math.max(0, ACTS[f.act].wild - (h.charms.includes('calm') ? 1 : 0));
  if (silentN && wildPer) {
    evs.push({ t: 'wild', amt: silentN * wildPer });
    hurtHero(f, h, silentN * wildPer, evs, true);
  }
  if (parsed.backlash && !test) {
    evs.push({ t: 'backlash', amt: parsed.backlash });
    hurtHero(f, h, parsed.backlash, evs, true);
  } else if (parsed.backlash) evs.push({ t: 'backlash', amt: parsed.backlash });
  if (test) {
    const s = JSON.parse(snap) as { foes: Foe[]; hp: number; s: number; p: number; d: number };
    f.foes = s.foes;
    h.hp = s.hp;
    f.hShield = s.s;
    f.hPoison = s.p;
    f.hDull = s.d;
    f.casts--;
    if (f.casts <= 0) f.over = 'left';
  } else {
    if (h.hp <= 0) f.over = 'lose';
    else if (!alive(f).length) f.over = 'win';
    if (!alive(f).includes(f.sel) && alive(f).length) f.sel = alive(f)[0];
  }
  return { parsed, ctx, evs };
}

/** All foes act. Then the next hero turn starts. */
export function enemyTurn(f: Fight, h: Hero, rng: Rng): Ev[] {
  const evs: Ev[] = [];
  f.silenced = [];
  const restless = f.turn >= restlessTurn(f);
  for (const i of alive(f)) {
    const foe = f.foes[i];
    if (foe.hp <= 0) continue;
    if (restless) foe.buff += 2;
    foe.shield = 0;
    if (foe.poison > 0) {
      evs.push({ t: 'tick', who: i, amt: foe.poison });
      foe.hp -= foe.poison;
      foe.poison--;
      if (foe.hp <= 0) {
        foe.hp = 0;
        evs.push({ t: 'kill', who: i });
        continue;
      }
    }
    const it = intentOf(foe);
    evs.push({ t: 'act', who: i, it });
    switch (it.t) {
      case 'atk':
        for (let k = 0; k < (it.hits ?? 1); k++) {
          let d = hitDmg(f, foe, it.n);
          const red = Math.min(foe.dull, d);
          foe.dull -= red;
          d -= red;
          hurtHero(f, h, d, evs);
          if (h.hp <= 0) break;
        }
        break;
      case 'guard':
        foe.shield += scaled(f, it.n);
        evs.push({ t: 'shield', who: i, amt: scaled(f, it.n) });
        break;
      case 'buff':
        foe.buff += it.n;
        break;
      case 'heal':
        for (const j of alive(f)) {
          const o = f.foes[j];
          const before = o.hp;
          o.hp = Math.min(o.max, o.hp + scaled(f, it.n));
          evs.push({ t: 'heal', who: j, amt: o.hp - before });
        }
        break;
      case 'venom':
        f.hPoison += it.n;
        evs.push({ t: 'poison', who: -1, amt: it.n });
        break;
      case 'silence': {
        const pool = rng.shuffle(h.runes.filter((r) => !f.silenced.includes(r)));
        const pick = pool.slice(0, Math.min(it.n, Math.max(0, h.runes.length - 3)));
        f.silenced.push(...pick);
        if (pick.length) evs.push({ t: 'silence', runes: pick });
        break;
      }
      case 'summon':
        if (alive(f).length < 4) {
          const n = makeFoe(f, it.id);
          f.foes.push(n);
          evs.push({ t: 'summon', who: f.foes.length - 1 });
        }
        break;
      case 'idle':
        break;
    }
    foe.pi++;
    if (h.hp <= 0) break;
  }
  if (h.hp <= 0) {
    f.over = 'lose';
    return evs;
  }
  // Start of the hero turn.
  f.hShield = 0;
  if (f.hPoison > 0) {
    evs.push({ t: 'tick', who: -1, amt: f.hPoison });
    hurtHero(f, h, f.hPoison, evs, true);
    f.hPoison--;
  }
  if (h.hp <= 0) f.over = 'lose';
  else if (!alive(f).length) f.over = 'win';
  if (!alive(f).includes(f.sel) && alive(f).length) f.sel = alive(f)[0];
  f.turn++;
  return evs;
}
