/** Auto battle: a pure fixed time-step simulation. Same input and seed give the same fight. */
import { ITEMS, type Eff } from './data';
import { buildStats, type Board, type ItemStat } from './grid';
import { Rng } from './rng';

export const DT = 0.1;
export const MAX_T = 60;
/** Fatigue starts at this second and grows by 1 each second. */
export const FATIGUE_AT = 20;
export const BASE_STAM = 10;

export interface Fighter {
  name: string;
  icon: string;
  cls: string;
  board: Board;
  hp: number;
}

export type EvKind = 'dmg' | 'block' | 'heal' | 'poison' | 'stam' | 'stun' | 'thorns' | 'ptick' | 'fatigue' | 'regen';

export interface BEvent {
  t: number;
  /** Side that receives the effect. */
  side: 0 | 1;
  /** Side whose item caused it (-1: none). */
  src: number;
  /** Index of the item in that side's item list (-1: none). */
  item: number;
  kind: EvKind;
  val: number;
  crit?: boolean;
  /** Damage taken by block. */
  blocked?: number;
}

export interface Frame {
  hp: [number, number];
  block: [number, number];
  stam: [number, number];
  poison: [number, number];
  /** Cooldown progress 0..1 for each item. */
  cd: [number[], number[]];
}

export interface BattleResult {
  win: boolean;
  ticks: number;
  maxHp: [number, number];
  maxStam: [number, number];
  frames: Frame[];
  events: BEvent[];
  stats: [ItemStat[], ItemStat[]];
}

interface Live {
  st: ItemStat;
  timer: number;
  used: number;
  tagWeapon: boolean;
  costless: boolean;
  low: boolean;
}

interface Side {
  hp: number;
  max: number;
  block: number;
  stam: number;
  maxStam: number;
  poison: number;
  stun: number;
  regen: number;
  thorns: number;
  rage: number;
  items: Live[];
}

function makeSide(f: Fighter, stats: ItemStat[]): Side {
  const s = buildStats(f.board).start;
  const max = f.hp + s.hp;
  return {
    hp: max,
    max,
    block: s.block,
    stam: BASE_STAM + s.stam,
    maxStam: BASE_STAM + s.stam,
    poison: 0,
    stun: 0,
    regen: s.regen,
    thorns: s.thorns,
    rage: s.rage,
    items: stats.map((st) => {
      const d = ITEMS[st.id];
      return { st, timer: 0, used: 0, tagWeapon: d.tags.includes('weapon'), costless: d.tags.includes('magic'), low: false };
    }),
  };
}

export function simulate(a: Fighter, b: Fighter, seed: number, record = true): BattleResult {
  const rng = new Rng(seed);
  const stats: [ItemStat[], ItemStat[]] = [buildStats(a.board).items, buildStats(b.board).items];
  const S: [Side, Side] = [makeSide(a, stats[0]), makeSide(b, stats[1])];
  const frames: Frame[] = [];
  const events: BEvent[] = [];
  let t = 0;
  const ev = (e: BEvent): void => {
    if (record) events.push(e);
  };

  const hurt = (side: 0 | 1, amount: number, pierce: boolean): { dealt: number; blocked: number } => {
    const s = S[side];
    let blocked = 0;
    if (!pierce && s.block > 0) {
      blocked = Math.min(s.block, amount);
      s.block -= blocked;
    }
    s.hp -= amount - blocked;
    return { dealt: amount - blocked, blocked };
  };

  const apply = (me: 0 | 1, idx: number, e: Eff, it: Live | null): void => {
    const foe = (1 - me) as 0 | 1;
    const s = S[me];
    if (e.dmg) {
      const crit = !!e.crit && rng.next() * 100 < e.crit;
      let dmg = e.dmg * (crit ? 2 : 1);
      if (it?.tagWeapon && s.rage && s.hp < s.max / 2) dmg += s.rage;
      const r = hurt(foe, dmg, !!e.pierce);
      ev({ t, side: foe, src: me, item: idx, kind: 'dmg', val: r.dealt, crit, blocked: r.blocked });
      if (it?.tagWeapon && S[foe].thorns) {
        const th = hurt(me, S[foe].thorns, false);
        ev({ t, side: me, src: foe, item: -1, kind: 'thorns', val: th.dealt, blocked: th.blocked });
      }
    }
    if (e.block) {
      s.block += e.block;
      ev({ t, side: me, src: me, item: idx, kind: 'block', val: e.block });
    }
    if (e.heal) {
      const h = Math.min(e.heal, s.max - s.hp);
      s.hp += h;
      if (s.poison > 0) s.poison--;
      ev({ t, side: me, src: me, item: idx, kind: 'heal', val: h });
    }
    if (e.poison) {
      S[foe].poison += e.poison;
      ev({ t, side: foe, src: me, item: idx, kind: 'poison', val: e.poison });
    }
    if (e.stam) {
      s.stam = Math.min(s.maxStam, s.stam + e.stam);
      ev({ t, side: me, src: me, item: idx, kind: 'stam', val: e.stam });
    }
    if (e.stun) {
      S[foe].stun = Math.max(S[foe].stun, e.stun);
      ev({ t, side: foe, src: me, item: idx, kind: 'stun', val: e.stun });
    }
  };

  const snap = (): void => {
    if (!record) return;
    frames.push({
      hp: [S[0].hp, S[1].hp],
      block: [S[0].block, S[1].block],
      stam: [Math.round(S[0].stam * 10) / 10, Math.round(S[1].stam * 10) / 10],
      poison: [S[0].poison, S[1].poison],
      cd: [
        S[0].items.map((i) => (i.st.cd ? Math.min(1, i.timer / i.st.cd) : 0)),
        S[1].items.map((i) => (i.st.cd ? Math.min(1, i.timer / i.st.cd) : 0)),
      ],
    });
  };

  snap();
  const maxTicks = Math.round(MAX_T / DT);
  let tick = 0;
  while (tick < maxTicks && S[0].hp > 0 && S[1].hp > 0) {
    tick++;
    t = tick;
    const order: (0 | 1)[] = tick % 2 ? [0, 1] : [1, 0];
    for (const me of order) {
      const s = S[me];
      s.stam = Math.min(s.maxStam, s.stam + DT);
      if (s.stun > 0) {
        s.stun = Math.max(0, s.stun - DT);
        continue;
      }
      s.items.forEach((it, idx) => {
        if (!it.st.cd || !it.st.eff) return;
        if (it.st.uses && it.used >= it.st.uses) return;
        it.timer += DT;
        if (it.timer + 1e-9 < it.st.cd) return;
        const cost = it.costless ? 0 : it.st.cost;
        if (cost > s.stam + 1e-9) {
          it.timer = it.st.cd;
          return;
        }
        s.stam -= cost;
        it.timer -= it.st.cd;
        it.used++;
        apply(me, idx, it.st.eff, it);
      });
    }
    // Once per second: regen, poison every 2 s, fatigue.
    if (tick % 10 === 0) {
      const sec = tick / 10;
      for (const me of [0, 1] as const) {
        const s = S[me];
        if (s.regen && s.hp > 0 && s.hp < s.max) {
          const h = Math.min(s.regen, s.max - s.hp);
          s.hp += h;
          ev({ t, side: me, src: -1, item: -1, kind: 'regen', val: h });
        }
        if (sec % 2 === 0 && s.poison > 0) {
          s.hp -= s.poison;
          ev({ t, side: me, src: -1, item: -1, kind: 'ptick', val: s.poison });
          s.poison--;
        }
        if (sec > FATIGUE_AT) {
          const f = sec - FATIGUE_AT;
          s.hp -= f;
          ev({ t, side: me, src: -1, item: -1, kind: 'fatigue', val: f });
        }
      }
    }
    // Potions below 50% HP.
    for (const me of [0, 1] as const) {
      const s = S[me];
      if (s.hp <= 0 || s.hp >= s.max / 2) continue;
      s.items.forEach((it, idx) => {
        if (it.low || !it.st.lowHp) return;
        it.low = true;
        apply(me, idx, it.st.lowHp, it);
      });
    }
    snap();
  }
  const [A, B] = S;
  let win: boolean;
  if (A.hp > 0 && B.hp > 0) win = A.hp / A.max >= B.hp / B.max;
  else win = B.hp <= 0 && (A.hp > 0 || A.hp >= B.hp);
  return { win, ticks: tick, maxHp: [A.max, B.max], maxStam: [A.maxStam, B.maxStam], frames, events, stats };
}
