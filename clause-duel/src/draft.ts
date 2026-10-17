/** The clause draft: offers, sim previews, the foe's wishes and picks, and draft bots. */
import { CLAUSES, SPECIALS, type ClauseId, type EnemyDef, type Side, type Style } from './data';
import { autoFight, firstActor, newFight, type Clause, type Stats } from './engine';
import { Rng, hash } from './rng';

export type PickAct = 'take' | 'burn';

export interface Draft {
  offer: ClauseId[];
  /** Active clauses, the sealed boss clause included. */
  active: Clause[];
  /** Who picks at each step. */
  order: Side[];
  idx: number;
  vetoUsed: boolean;
  log: { s: Side; act: PickAct | 'veto'; id: ClauseId; why?: string }[];
}

export interface SimStat {
  /** Mean HP you lose in the fight (a loss counts as all your HP). */
  lost: number;
  /** Chance that you win, 0..1. */
  win: number;
  /** lost + a death penalty. Lower is better for you. */
  cost: number;
}

export interface OptEval {
  id: ClauseId;
  law: boolean;
  /** You take it (for a law: it becomes active). */
  you: SimStat;
  /** The foe takes it. */
  foe: SimStat;
}

export interface Wish {
  act: PickAct;
  id: ClauseId;
  val: number;
  why: string;
}

export interface DraftEval {
  base: SimStat;
  opts: OptEval[];
  wishes: Wish[];
}

export interface Matchup {
  me: Stats;
  foe: Stats;
  def: EnemyDef;
  seed: number;
}

export const SIMS = 40;
const DEATH = 25;

export function simStat(m: Matchup, cl: Clause[], n = SIMS): SimStat {
  let lost = 0;
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const F = autoFight(newFight(m.me, m.foe, cl), m.def.style, new Rng(hash(m.seed, 'sim', i)));
    if (F.over === 1) {
      wins++;
      lost += m.me.hp - F.f[0].hp;
    } else lost += m.me.hp;
  }
  const win = wins / n;
  return { lost: lost / n, win, cost: lost / n + DEATH * (1 - win) };
}

export function draftDone(d: Draft): boolean {
  return d.idx >= d.order.length || d.offer.length === 0;
}

export function turnSide(d: Draft): Side {
  return d.order[d.idx];
}

export function makeDraft(rng: Rng, general: ClauseId[], cards: ClauseId[], def: EnemyDef, foeFirst: boolean, perks: { fourth: boolean; extra: boolean }): Draft {
  const size = perks.extra ? 7 : 6;
  const sealed = def.sealed;
  const offer: ClauseId[] = [];
  const add = (id: ClauseId): void => {
    if (offer.length < size && !offer.includes(id) && id !== sealed) offer.push(id);
  };
  add(def.sig);
  const mine = rng.shuffle([...new Set(cards)]);
  for (const id of mine.slice(0, perks.extra ? 3 : 2)) add(id);
  for (const id of rng.shuffle([...general])) add(id);
  rng.shuffle(offer);
  const order: Side[] = foeFirst ? [1, 0, 1, 0] : [0, 1, 0, 1];
  if (perks.fourth) order.push(0);
  return { offer, active: sealed ? [{ id: sealed, owner: 1, sealed: true }] : [], order, idx: 0, vetoUsed: false, log: [] };
}

/** Sim previews for every clause in the offer, plus the foe's wish list. */
export function evalDraft(m: Matchup, d: Draft, n = SIMS): DraftEval {
  const base = simStat(m, d.active, n);
  const opts: OptEval[] = d.offer.map((id) => {
    const law = CLAUSES[id].kind === 'law';
    const you = simStat(m, [...d.active, { id, owner: 0 }], n);
    const foe = law ? you : simStat(m, [...d.active, { id, owner: 1 }], n);
    return { id, law, you, foe };
  });
  return { base, opts, wishes: foeWishes(m, d, base, opts) };
}

function foeWishes(m: Matchup, d: Draft, base: SimStat, opts: OptEval[]): Wish[] {
  const rng = new Rng(hash(m.seed, 'wish', d.idx));
  const out: Wish[] = [];
  for (const o of opts) {
    const bias = o.id === m.def.sig ? 1.5 : 0;
    const take = o.foe.cost - base.cost + bias + (rng.next() - 0.5) * 0.6;
    const burn = Math.max(0, base.cost - o.you.cost) * 0.8 + (rng.next() - 0.5) * 0.6;
    out.push({ act: 'take', id: o.id, val: take, why: reason(m, d, 'take', o.id) });
    out.push({ act: 'burn', id: o.id, val: burn, why: reason(m, d, 'burn', o.id) });
  }
  out.sort((a, b) => b.val - a.val);
  // Keep the best action per clause, so the list names each clause once.
  const seen = new Set<ClauseId>();
  return out.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));
}

/** Short words for why the foe wants an action, from the foe's view. */
export function reason(m: Matchup, d: Draft, act: PickAct, id: ClauseId): string {
  const c = CLAUSES[id];
  const you = m.me;
  const me = m.foe;
  const youSpc = SPECIALS[you.spc].name;
  if (act === 'burn') {
    if (c.kind === 'own') return `Keeps ${c.gain} from you`;
    switch (id) {
      case 'bloodless':
        return me.spc === 'drain' ? 'I need my Drain' : 'I want my heals';
      case 'hush':
        return `My ${SPECIALS[me.spc].name} comes early`;
      case 'foulair':
        return 'I have less HP to lose';
      case 'cap':
        return 'My big hits stay big';
      default:
        return `${c.name} helps you more`;
    }
  }
  if (c.kind === 'own') {
    switch (id) {
      case 'first':
        return 'I strike before you';
      case 'leech':
        return 'I heal on every hit';
      case 'gag':
        return `Your ${youSpc} waits`;
      case 'tax':
        return 'Your guard gets thin';
      case 'riposte':
        return 'Hit my guard and pay';
      default:
        return `I get ${c.gain}`;
    }
  }
  const healer = you.spc === 'mend' || d.active.some((a) => a.owner === 0 && (a.id === 'leech' || a.id === 'second'));
  switch (id) {
    case 'bloodless':
      return healer ? 'You heal. I don’t.' : 'No one heals';
    case 'lowground':
      return me.hp < you.hp ? 'Less HP: I go first' : 'Takes your first move';
    case 'quickdraw': {
      const f = firstActor(newFight(you, me, d.active));
      return f.side === 1 ? 'I go first, I hit double' : 'Big hits for both';
    }
    case 'foulair':
      return me.hp > you.hp ? 'I have more HP to burn' : 'Ends you sooner';
    case 'hush':
      return `Your ${youSpc} waits`;
    case 'cap':
      return 'Caps your big hits';
    case 'sharp':
      return 'Your guard means less';
    case 'spikes':
      return m.def.style === 'turtle' ? 'I guard a lot' : 'Your guard costs me less';
    case 'longguard':
      return 'My guard stays up';
    case 'haste':
      return `More ${SPECIALS[me.spc].name}`;
    case 'bloodrush':
      return 'Finishes you faster';
    case 'fuse':
      return 'Overtime comes early';
    default:
      return 'Good rule for me';
  }
}

export function applyPick(d: Draft, s: Side, act: PickAct | 'veto', id: ClauseId, why?: string): void {
  d.offer = d.offer.filter((x) => x !== id);
  if (act === 'take') d.active.push({ id, owner: s });
  d.log.push({ s, act, id, why });
  if (act === 'veto') d.vetoUsed = true;
  else d.idx++;
}

/** The foe takes its top wish. */
export function foePick(d: Draft, ev: DraftEval): Wish {
  const w = ev.wishes.find((x) => d.offer.includes(x.id)) ?? { act: 'burn' as const, id: d.offer[0], val: 0, why: '' };
  applyPick(d, 1, w.act, w.id, w.why);
  return w;
}

// ---------- Draft bots for you ----------

export interface BotPick {
  act: PickAct | 'veto';
  id: ClauseId;
}

/** Good drafter: reads the previews. Takes the clause that saves the most HP, or burns the foe's best clause. */
export function goodPick(d: Draft, ev: DraftEval, canVeto: boolean): BotPick {
  let best: BotPick = { act: 'take', id: d.offer[0] };
  let bv = -Infinity;
  let bestBurn: BotPick | null = null;
  let burnV = -Infinity;
  const foeTop = ev.wishes.find((w) => d.offer.includes(w.id));
  for (const o of ev.opts) {
    const take = ev.base.cost - o.you.cost;
    let burn = Math.max(0, o.foe.cost - ev.base.cost) * 0.8;
    if (foeTop && foeTop.id === o.id) burn = Math.max(burn, (foeTop.act === 'take' ? o.foe.cost - ev.base.cost : 0) * 1.0);
    if (take > bv) {
      bv = take;
      best = { act: 'take', id: o.id };
    }
    if (burn > bv) {
      bv = burn;
      best = { act: 'burn', id: o.id };
    }
    if (burn > burnV) {
      burnV = burn;
      bestBurn = { act: 'veto', id: o.id };
    }
  }
  if (canVeto && bestBurn && burnV > 1.5 && !(best.act === 'take' && best.id === bestBurn.id)) return bestBurn;
  return best;
}

export function randomPick(d: Draft, rng: Rng): BotPick {
  return { act: rng.chance(0.75) ? 'take' : 'burn', id: rng.pick(d.offer) };
}

export const styleName: Record<Style, string> = { aggro: 'Aggressive', turtle: 'Defensive', sustain: 'Drains' };
