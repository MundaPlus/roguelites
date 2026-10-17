/** Pure hero model: one room in, a new hero and a log out. No DOM. */
import { GENERIC_LINES, HEROES, TARGET, ZONE, ZONE_OUT, type Card, type HeroId, type Reason, type Stats } from './data';
import type { Rng } from './rng';

export interface Hero {
  type: HeroId;
  hp: number;
  maxHp: number;
  gear: number;
  gold: number;
  /** Mood meters, 0–100. */
  bore: number;
  stress: number;
  delight: number;
  /** The fun value the graph shows, 0–100. */
  fun: number;
  lastKind: string | null;
}

export type EndReason = 'dead' | 'bored' | 'quit';

export interface Outcome {
  hero: Hero;
  /** The room stats after a mystery roll. */
  stats: Stats;
  twist: string | null;
  dmg: number;
  heal: number;
  gearUp: number;
  gold: number;
  /** The fun of this room alone, before smoothing. */
  raw: number;
  d: { bore: number; stress: number; delight: number };
  fit: number;
  points: number;
  end: EndReason | null;
  reason: Reason;
  thought: string;
}

export const clamp = (v: number, a = 0, b = 100): number => Math.max(a, Math.min(b, v));

export function newHero(type: HeroId): Hero {
  const t = HEROES[type];
  return { type, hp: t.hp, maxHp: t.hp, gear: t.gear, gold: 0, bore: 10, stress: 10, delight: 20, fun: 15, lastKind: null };
}

/** Fit of a fun value to the target: 1 in the zone, 0 far away. */
export function fitOf(fun: number, target: number): number {
  const d = Math.abs(fun - target);
  if (d <= ZONE) return 1;
  return clamp(1 - (d - ZONE) / (ZONE_OUT - ZONE), 0, 1);
}

/** Monster power grows with the dungeon level (0–4). */
export const power = (danger: number, level: number): number => danger * (1 + 0.36 * level);

/**
 * Resolve one room. With `rng` null it returns the expected result (used by the card preview and the bots).
 * `step` is the room index in the dungeon (8 = boss).
 */
export function enterRoom(h0: Hero, card: Card, level: number, step: number, rng: Rng | null): Outcome {
  const t = HEROES[h0.type];
  const h: Hero = { ...h0 };
  let stats: Stats = { danger: card.danger, loot: card.loot, surprise: card.surprise, rest: card.rest };
  let twist: string | null = null;
  if (card.alt) {
    const a = card.alt;
    if (rng) {
      if (rng.chance(a.chance)) {
        stats = { danger: a.danger, loot: a.loot, surprise: a.surprise, rest: a.rest };
        twist = a.text;
      }
    } else {
      const p = a.chance;
      stats = {
        danger: stats.danger * (1 - p) + a.danger * p,
        loot: stats.loot * (1 - p) + a.loot * p,
        surprise: stats.surprise * (1 - p) + a.surprise * p,
        rest: stats.rest * (1 - p) + a.rest * p,
      };
    }
  }
  const isBoss = card.kind === 'boss';
  const isTrap = card.kind === 'trap';
  const fighty = card.kind === 'fight' || isBoss || (card.kind === 'mystery' && stats.danger > 2);
  const pw = power(stats.danger, level);
  const variance = rng ? 0.75 + rng.next() * 0.5 : 1;
  const armor = isTrap ? 30 / (30 + h.gear) : 22 / (22 + h.gear);
  const dmg = Math.round(pw * 3.1 * armor * variance);
  const heal = Math.round(stats.rest * 5.5);
  const gearUp = stats.loot * 0.35;
  const gold = Math.round(stats.loot * 5);

  // Fun of this room for this hero.
  const f = t.feel;
  const raw = clamp(12 + stats.danger * f.danger + stats.loot * f.loot + stats.surprise * f.surprise - stats.rest * f.rest);
  const fun = clamp(h.fun * 0.35 + raw * 0.65);
  const target = TARGET[Math.min(step, TARGET.length - 1)];
  const fit = fitOf(fun, target);

  // Delight.
  const L = t.like;
  let joy = (fighty ? L.fight * stats.danger : 0) + L.loot * stats.loot + L.rest * stats.rest + L.surprise * stats.surprise;
  if (fit >= 1) joy += t.zoneLove;
  else if (t.zoneLove) joy -= t.zoneLove * 0.4 * (1 - fit);
  const delight = clamp(h.delight * 0.7 + joy);

  // Boredom.
  const repeat = h.lastKind === card.kind && card.kind !== 'boss';
  let bore = (t.boreLine - raw) * t.boreK;
  bore = Math.max(-14, bore);
  if (repeat) bore += t.repeat;
  bore += stats.rest * t.restBore;
  if (stats.loot < 1) bore += t.noLootBore;
  bore -= Math.max(0, joy) * 0.35;

  // Stress.
  h.hp = Math.min(h.maxHp, h.hp - dmg + heal);
  let stress = (dmg / h.maxHp) * 55 + Math.max(0, pw - t.nerve - h0.gear * 0.12) * 3.5;
  if (isTrap) stress *= t.trapHate;
  if (h.hp < h.maxHp * 0.35 && h.hp > 0) stress += 7;
  stress *= t.stressK;
  stress -= stats.rest * t.calm;
  stress -= Math.max(0, joy) * 0.15;

  const nb = clamp(h.bore + bore);
  const ns = clamp(h.stress + stress);
  const d = { bore: nb - h.bore, stress: ns - h.stress, delight: delight - h.delight };
  h.bore = nb;
  h.stress = ns;
  h.delight = delight;
  h.fun = fun;
  h.gear += gearUp;
  h.gold += gold;
  h.lastKind = card.kind;

  let end: EndReason | null = null;
  if (h.hp <= 0) end = 'dead';
  else if (h.stress >= 100) end = 'quit';
  else if (h.bore >= 100) end = 'bored';

  const points = fit * 10 * (isBoss ? 3 : 1) + delight / 10;

  // The main reason for the thought bubble.
  const cands: [Reason, number][] = [
    ['hurt', dmg > h0.maxHp * 0.12 ? (dmg / h0.maxHp) * 110 : 0],
    ['stress', d.stress * 1.1],
    ['bored', d.bore * 1.2],
    ['repeat', repeat ? t.repeat * 1.3 : 0],
    ['nearDeath', h.hp > 0 && h.hp < h.maxHp * 0.25 ? 30 : 0],
    ['loot', L.loot * stats.loot * 2],
    ['fight', fighty && dmg < h0.maxHp * 0.2 ? L.fight * stats.danger * 2 + 2 : 0],
    ['rest', L.rest > 0 ? L.rest * stats.rest * 1.6 : 0],
    ['restBad', stats.rest * t.restBore * 2.5 - (L.rest < 0 ? L.rest * stats.rest * 3 : 0)],
    ['surprise', L.surprise * stats.surprise * 2],
    ['trap', isTrap ? stress * 0.6 + 4 : 0],
    ['zone', fit >= 1 ? 6 + t.zoneLove : 0],
    ['calm', -d.stress > 12 ? -d.stress * 0.6 : 0],
    ['boss', isBoss && !end ? 40 : 0],
  ];
  cands.sort((a, b) => b[1] - a[1]);
  const reason: Reason = cands[0][1] > 4 ? cands[0][0] : 'nothing';
  const pool = t.lines[reason] ?? GENERIC_LINES[reason];
  let thought = pool[rng ? rng.int(0, pool.length - 1) : 0];
  if (end === 'dead') thought = 'Everything goes dark…';
  else if (end === 'quit') thought = 'I quit! This dungeon is a nightmare!';
  else if (end === 'bored') thought = 'I am going home. This is boring.';

  return { hero: h, stats, twist, dmg, heal, gearUp, gold, raw, d, fit, points, end, reason, thought };
}

/** Mood words for the hero face. */
export function face(h: Hero): string {
  if (h.hp < h.maxHp * 0.25) return '🤕';
  if (h.stress >= 75) return '😰';
  if (h.bore >= 75) return '🥱';
  if (h.delight >= 60) return '🤩';
  if (h.stress >= 50) return '😟';
  if (h.bore >= 50) return '😐';
  if (h.delight >= 35) return '😄';
  return '🙂';
}
