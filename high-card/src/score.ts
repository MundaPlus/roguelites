/** The pure scoring function. It returns every step, so the UI can count the score one step at a time. */
import { type Card, type HandEval, type HandType, evaluate, handValue, isFace, rankChips } from './cards';
import { type Cx, type Eff, type JokerInst, JOKERS, actingDef } from './jokers';

export interface ScoreInput {
  played: Card[];
  held: Card[];
  jokers: JokerInst[];
  levels: Record<HandType, number>;
  boss: string | null;
  money: number;
  discardsLeft: number;
  discardsUsed: number;
  handsLeft: number;
  drawLeft: number;
  handPlays: Record<HandType, number>;
  roundTypes: HandType[];
  slots: number;
  planetsUsed: number;
  cardsAdded: number;
  steelCount: number;
  /** Index of the joker that the boss disables, or -1. */
  disabled: number;
  /** The Mouth: the only hand type that scores this round. */
  mouthType: HandType | null;
  /** Random source. Without it, lucky cards and glass breaks do nothing (preview mode). */
  rnd?: () => number;
  log?: boolean;
}

export type StepKind = 'c' | 'm' | 'x' | '$' | 'info' | 'bad';

export interface Step {
  src: 'hand' | 'card' | 'held' | 'joker';
  /** Index of the played card, the held card or the joker. */
  i: number;
  text: string;
  kind: StepKind;
  chips: number;
  mult: number;
}

export interface ScoreResult {
  type: HandType;
  level: number;
  ev: HandEval;
  scoring: number[];
  chips: number;
  mult: number;
  total: number;
  money: number;
  broken: number[];
  newVals: number[];
  steps: Step[];
  blocked: string | null;
}

export function isDebuffed(c: Card, boss: string | null): boolean {
  switch (boss) {
    case 'goad':
      return c.suit === 0;
    case 'head':
      return c.suit === 1;
    case 'club':
      return c.suit === 2;
    case 'window':
      return c.suit === 3;
    case 'plant':
      return isFace(c);
    default:
      return false;
  }
}

export function hasPassive(jokers: JokerInst[], p: string, disabled = -1): boolean {
  return jokers.some((j, i) => i !== disabled && JOKERS[j.id].passive === p);
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));

export function score(inp: ScoreInput): ScoreResult {
  const { played, held, boss } = inp;
  const off = inp.disabled;
  const ev = evaluate(played, { fourFingers: hasPassive(inp.jokers, 'fourFingers', off), shortcut: hasPassive(inp.jokers, 'shortcut', off) });
  const scoring = hasPassive(inp.jokers, 'splash', off) ? played.map((_c, i) => i) : ev.scoring;
  const type = ev.type;
  const level = inp.levels[type] ?? 1;
  const steps: Step[] = [];
  const log = !!inp.log;
  let chips = 0;
  let mult = 0;
  let money = 0;
  const broken: number[] = [];
  const add = (src: Step['src'], i: number, kind: StepKind, text: string): void => {
    if (log) steps.push({ src, i, kind, text, chips, mult });
  };
  const res = (blocked: string | null, newVals: number[]): ScoreResult => ({
    type,
    level,
    ev,
    scoring,
    chips,
    mult,
    total: blocked ? 0 : Math.floor(chips * mult),
    money,
    broken,
    newVals,
    steps,
    blocked,
  });

  const vals = inp.jokers.map((j) => j.v);
  if (boss === 'eye' && inp.roundTypes.includes(type)) {
    add('hand', 0, 'bad', 'Hand type already played!');
    return res('The Eye: no repeated hand types', vals);
  }
  if (boss === 'mouth' && inp.mouthType && inp.mouthType !== type) {
    add('hand', 0, 'bad', `Only ${inp.mouthType} scores!`);
    return res(`The Mouth: only ${inp.mouthType}`, vals);
  }

  const base = handValue(type, level);
  chips = base.chips;
  mult = base.mult;
  if (boss === 'flint') {
    chips = Math.max(1, Math.ceil(chips / 2));
    mult = Math.max(1, Math.ceil(mult / 2));
  }
  add('hand', 0, 'info', `${type} lvl ${level}`);

  const sc = scoring.map((i) => played[i]);
  const cx: Cx = {
    type,
    contains: ev.contains,
    played,
    scoring: sc,
    held,
    money: inp.money,
    discardsLeft: inp.discardsLeft,
    discardsUsed: inp.discardsUsed,
    handsLeft: inp.handsLeft,
    drawLeft: inp.drawLeft,
    plays: (inp.handPlays[type] ?? 0) + 1,
    roundTypes: inp.roundTypes,
    jokerCount: inp.jokers.length,
    slots: inp.slots,
    planetsUsed: inp.planetsUsed,
    cardsAdded: inp.cardsAdded,
    steelCount: inp.steelCount,
    finalHand: inp.handsLeft === 0,
    firstFace: sc.findIndex((c) => isFace(c) && !isDebuffed(c, boss)),
  };

  // Scaling jokers update before the cards score.
  inp.jokers.forEach((j, i) => {
    const d = JOKERS[j.id];
    if (i !== off && d.before) vals[i] = d.before(cx, j.v);
  });
  const jk = inp.jokers.map((j, i) => ({ ...j, v: vals[i] }));
  const acting = jk.map((_j, i) => (i === off ? null : actingDef(jk, i)));

  const apply = (src: Step['src'], i: number, e: Eff | null): void => {
    if (!e) return;
    if (e.c) {
      chips += e.c;
      add(src, i, 'c', `+${e.c}`);
    }
    if (e.m) {
      mult += e.m;
      add(src, i, 'm', `+${e.m} Mult`);
    }
    if (e.x && e.x !== 1) {
      mult *= e.x;
      add(src, i, 'x', `×${fmt(e.x)} Mult`);
    }
    if (e.$) {
      money += e.$;
      add(src, i, '$', `+$${e.$}`);
    }
  };
  const retrigs = (c: Card, isHeld: boolean): number => {
    let n = c.seal === 'red' ? 1 : 0;
    for (const a of acting) if (a?.def.retrig) n += a.def.retrig(cx, c, isHeld);
    return n;
  };

  // Scored cards, left to right.
  scoring.forEach((pi, si) => {
    const c = played[pi];
    if (isDebuffed(c, boss)) {
      add('card', pi, 'bad', 'Debuffed');
      return;
    }
    const times = 1 + retrigs(c, false);
    for (let t = 0; t < times; t++) {
      if (t > 0) add('card', pi, 'info', 'Again!');
      chips += rankChips(c.rank);
      add('card', pi, 'c', `+${rankChips(c.rank)}`);
      if (c.enh === 'bonus') apply('card', pi, { c: 30 });
      if (c.enh === 'mult') apply('card', pi, { m: 4 });
      if (c.enh === 'glass') apply('card', pi, { x: 2 });
      if (c.enh === 'lucky' && inp.rnd) {
        if (inp.rnd() < 0.2) apply('card', pi, { m: 20 });
        if (inp.rnd() < 1 / 15) apply('card', pi, { $: 20 });
      }
      if (c.ed === 'foil') apply('card', pi, { c: 50 });
      if (c.ed === 'holo') apply('card', pi, { m: 10 });
      if (c.ed === 'poly') apply('card', pi, { x: 1.5 });
      if (c.seal === 'gold') apply('card', pi, { $: 3 });
      acting.forEach((a, ji) => {
        if (a?.def.card) {
          const e = a.def.card(cx, c, a.inst.v, si);
          if (e) apply('joker', ji, e);
        }
      });
    }
    if (c.enh === 'glass' && inp.rnd && inp.rnd() < 0.25) broken.push(c.id);
  });

  // Cards held in hand.
  held.forEach((c, hi) => {
    if (isDebuffed(c, boss)) return;
    const hasHook = c.enh === 'steel' || acting.some((a) => a?.def.held?.(cx, c, a.inst.v));
    if (!hasHook) return;
    const times = 1 + retrigs(c, true);
    for (let t = 0; t < times; t++) {
      if (c.enh === 'steel') apply('held', hi, { x: 1.5 });
      acting.forEach((a, ji) => {
        if (a?.def.held) {
          const e = a.def.held(cx, c, a.inst.v);
          if (e) apply('joker', ji, e);
        }
      });
    }
  });

  // Jokers, left to right. Order matters: +Mult before ×Mult is better.
  jk.forEach((j, i) => {
    if (i === off) {
      add('joker', i, 'bad', 'Disabled');
      return;
    }
    if (j.ed === 'foil') apply('joker', i, { c: 50 });
    if (j.ed === 'holo') apply('joker', i, { m: 10 });
    const a = acting[i];
    if (a?.def.main) apply('joker', i, a.def.main(cx, a.inst.v));
    if (j.ed === 'poly') apply('joker', i, { x: 1.5 });
  });

  return res(null, vals);
}
