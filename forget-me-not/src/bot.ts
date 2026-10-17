/** Bots for the debug API and the balance sim. */
import { MAX_LVL, SKILLS, skillPower } from './data';
import { alive, canUse, cloneFight, endTurn, foeDamage, intent, useCard, type Fight } from './fight';
import { Rng } from './rng';
import {
  canExpand,
  canUpgrade,
  expand,
  learn,
  restHeal,
  shrineOffers,
  takeRelic,
  upgrade,
  type RoomKind,
  type RunState,
  type SkillInst,
} from './run';

/** How a bot chooses the skill to forget. `hoard` never forgets and buys memory slots instead. */
export type ForgetPolicy = 'weakest' | 'random' | 'strongest' | 'hoard';

export interface BotCfg {
  fight: 'smart' | 'random';
  forget: ForgetPolicy;
  choices: 'smart' | 'random';
}

export const GOOD_BOT: BotCfg = { fight: 'smart', forget: 'weakest', choices: 'smart' };

export interface Play {
  card: number;
  target: number;
}

// ---------- Fight ----------

const ORDER: Record<string, number> = { rage: 0, expose: 1, hex: 2, dart: 3, concuss: 4 };
const prio = (id: string): number => ORDER[id] ?? (SKILLS[id].tag === 'attack' ? 5 : SKILLS[id].tag === 'heal' ? 6 : 7);

function value(f: Fight, spentBefore: number): number {
  const h = f.hero;
  if (f.result === 'lose' || h.hp <= 0) return -1e6;
  const spent = f.cards.filter((c) => c.spent).length - spentBefore;
  if (f.result === 'win') {
    const healthy = h.hp > h.maxHp * 0.35;
    return 20000 + h.hp * 10 + f.beaten.length * 300 - f.escaped.length * (healthy && f.turn < 14 ? 25000 : 300) - spent * 40;
  }
  let v = h.hp * 10 + f.beaten.length * 300 - spent * 40;
  for (const foe of alive(f)) {
    const m = intent(foe);
    v -= foe.hp * 3 + foe.block;
    v -= (m.a ? foeDamage(f, foe, m.a) * (m.hits ?? 1) : 0) * 3;
    v -= foe.st.str * 8;
    v += Math.min(foe.st.poison, foe.hp) * 2;
    if (foe.boss) v -= 20;
  }
  v += h.st.str * 12 - h.st.poison * 6 - h.st.weak * 5 - h.st.vuln * 6;
  return v;
}

function subsets(f: Fight): number[][] {
  const idx = f.cards.map((_, i) => i).filter((i) => canUse(f, i));
  const out: number[][] = [[]];
  const rec = (start: number, cur: number[], cost: number): void => {
    for (let k = start; k < idx.length; k++) {
      const i = idx[k];
      const c = cost + SKILLS[f.cards[i].id].cost;
      if (c > f.hero.energy) continue;
      const next = [...cur, i];
      out.push(next);
      rec(k + 1, next, c);
    }
  };
  rec(0, [], 0);
  return out.map((s) => s.sort((a, b) => prio(f.cards[a].id) - prio(f.cards[b].id)));
}

/** Best plays for this turn: tries every affordable set of cards on every target and looks one enemy turn ahead. */
export function smartPlan(f: Fight): Play[] {
  const foes = alive(f);
  const targets = foes.length ? foes.map((x) => x.uid) : [0];
  const spent0 = f.cards.filter((c) => c.spent).length;
  let best: Play[] = [];
  let bv = -Infinity;
  for (const set of subsets(f)) {
    for (const t of set.length ? targets : [targets[0]]) {
      const g = cloneFight(f);
      for (const i of set) {
        if (g.result) break;
        const tt = alive(g).some((x) => x.uid === t) ? t : (alive(g)[0]?.uid ?? 0);
        useCard(g, i, tt);
      }
      if (!g.result) endTurn(g);
      const v = value(g, spent0);
      if (v > bv) {
        bv = v;
        best = set.map((i) => ({ card: i, target: t }));
      }
    }
  }
  return best;
}

export function randomPlay(f: Fight, rng: Rng): Play | null {
  const ok = f.cards.map((_, i) => i).filter((i) => canUse(f, i));
  if (!ok.length || rng.chance(0.1)) return null;
  const foes = alive(f);
  return { card: rng.pick(ok), target: foes.length ? rng.pick(foes).uid : 0 };
}

/** Play one whole fight with a bot. Returns the fight result. */
export function autoFight(f: Fight, cfg: BotCfg, rng: Rng, maxTurns = 60): 'win' | 'lose' {
  while (!f.result) {
    if (f.turn > maxTurns) {
      f.result = 'lose';
      break;
    }
    if (cfg.fight === 'smart') {
      for (const p of smartPlan(f)) {
        if (f.result) break;
        const t = alive(f).some((x) => x.uid === p.target) ? p.target : (alive(f)[0]?.uid ?? 0);
        useCard(f, p.card, t);
      }
    } else {
      for (let p = randomPlay(f, rng); p && !f.result; p = randomPlay(f, rng)) useCard(f, p.card, p.target);
    }
    if (!f.result) endTurn(f);
  }
  return f.result;
}

// ---------- Run choices ----------

function offerValue(r: RunState, s: SkillInst): number {
  const d = SKILLS[s.id];
  let v = skillPower(s.id, s.lvl);
  const tags = r.memory.map((m) => SKILLS[m.id].tag);
  if (d.tag === 'attack' && tags.filter((t) => t === 'attack').length < 2) v += 2;
  if (d.tag === 'guard' && !tags.includes('guard')) v += 2;
  if (d.cost === 3) v -= 1;
  return v;
}

/** Value of keeping memory slot i. The last attack skill is worth more. */
function keepValue(r: RunState, i: number): number {
  const m = r.memory[i];
  const tag = SKILLS[m.id].tag;
  let v = skillPower(m.id, m.lvl);
  if (tag === 'attack' && r.memory.filter((x) => SKILLS[x.id].tag === 'attack').length <= 2) v += 3;
  if (tag === 'guard' && r.memory.filter((x) => SKILLS[x.id].tag === 'guard').length <= 1) v += 2;
  return v;
}

export function weakestSlot(r: RunState): number {
  let w = 0;
  r.memory.forEach((_, i) => {
    if (keepValue(r, i) < keepValue(r, w)) w = i;
  });
  return w;
}

function forgetSlot(r: RunState, cfg: BotCfg, rng: Rng): number {
  if (cfg.forget === 'random') return rng.int(0, r.memory.length - 1);
  if (cfg.forget === 'strongest') {
    let s = 0;
    r.memory.forEach((_, i) => {
      if (keepValue(r, i) > keepValue(r, s)) s = i;
    });
    return s;
  }
  return weakestSlot(r);
}

/** Learn the best offer if it is worth it. Returns true if a skill was learned. */
export function pickOffer(r: RunState, offers: SkillInst[], cfg: BotCfg, rng: Rng): boolean {
  if (!offers.length) return false;
  let best = offers[0];
  if (cfg.choices === 'random') best = rng.pick(offers);
  else for (const o of offers) if (offerValue(r, o) > offerValue(r, best)) best = o;
  if (r.memory.length < r.slots) {
    learn(r, best);
    return true;
  }
  if (cfg.forget === 'hoard') return false;
  if (cfg.choices === 'random') {
    if (rng.chance(0.3)) return false;
  } else if (offerValue(r, best) <= keepValue(r, weakestSlot(r)) + 0.5) return false;
  learn(r, best, forgetSlot(r, cfg, rng));
  return true;
}

export function upgradeSlot(r: RunState, cfg: BotCfg, rng: Rng): number {
  const ok = r.memory.map((_, i) => i).filter((i) => canUpgrade(r, i));
  if (!ok.length) return -1;
  if (cfg.choices === 'random') return rng.pick(ok);
  let b = ok[0];
  for (const i of ok) {
    const s = skillPower(r.memory[i].id, r.memory[i].lvl) + (SKILLS[r.memory[i].id].tag === 'attack' ? 1 : 0);
    const sb = skillPower(r.memory[b].id, r.memory[b].lvl) + (SKILLS[r.memory[b].id].tag === 'attack' ? 1 : 0);
    if (s > sb) b = i;
  }
  return b;
}

const RELIC_RANK = ['whet', 'ward', 'ink', 'shell', 'spark', 'heart', 'herb', 'knot', 'candle', 'fang', 'palace', 'lethe'];

export function pickRelic(_r: RunState, offers: string[], cfg: BotCfg, rng: Rng): string {
  if (cfg.choices === 'random') return rng.pick(offers);
  let rank = RELIC_RANK;
  if (cfg.forget === 'hoard') rank = ['palace', ...RELIC_RANK];
  return [...offers].sort((a, b) => rank.indexOf(a) - rank.indexOf(b))[0];
}

/** Resolve the whole reward screen. */
export function rewardBot(r: RunState, cfg: BotCfg, rng: Rng): void {
  const rw = r.reward!;
  if (!rw.relicTaken && rw.relics.length) {
    takeRelic(r, pickRelic(r, rw.relics, cfg, rng));
    rw.relicTaken = true;
  }
  while (rw.upgrades > 0) {
    const i = upgradeSlot(r, cfg, rng);
    if (i >= 0) upgrade(r, i);
    rw.upgrades--;
  }
  if (!rw.learned) rw.learned = pickOffer(r, rw.offers, cfg, rng);
}

export function chooseRoom(r: RunState, choices: RoomKind[], cfg: BotCfg, rng: Rng): number {
  if (choices.length < 2 || cfg.choices === 'random') return rng.int(0, choices.length - 1);
  const frac = r.hp / r.maxHp;
  const score = (k: RoomKind): number => {
    switch (k) {
      case 'rest':
        return frac < 0.55 ? 10 : frac < 0.8 ? 3 : 0;
      case 'elite':
        return frac > 0.75 ? 6 : frac > 0.55 ? 2 : -5;
      case 'shrine':
        return 4;
      case 'fight':
        return frac > 0.4 ? 5 : 1;
      default:
        return 0;
    }
  };
  return score(choices[0]) >= score(choices[1]) ? 0 : 1;
}

/** Shrine: learn one of three skills, expand memory, or upgrade a skill. */
export function shrineBot(r: RunState, cfg: BotCfg, rng: Rng): string {
  const offers = shrineOffers(r);
  if (cfg.forget === 'hoard') {
    if (canExpand(r)) {
      expand(r);
      return 'expand';
    }
    if (r.memory.length < r.slots && pickOffer(r, offers, cfg, rng)) return 'learn';
  } else if (cfg.choices === 'random') {
    const k = rng.int(0, 2);
    if (k === 0 && canExpand(r)) {
      expand(r);
      return 'expand';
    }
    if (k === 1 && pickOffer(r, offers, cfg, rng)) return 'learn';
  } else {
    if (r.slots < 5 && canExpand(r) && r.maxHp >= 56) {
      expand(r);
      return 'expand';
    }
    if (pickOffer(r, offers, cfg, rng)) return 'learn';
  }
  const i = upgradeSlot(r, cfg, rng);
  if (i >= 0) upgrade(r, i);
  return 'upgrade';
}

export function restBot(r: RunState, cfg: BotCfg, rng: Rng): string {
  const heal = cfg.choices === 'random' ? rng.chance(0.5) : r.hp < r.maxHp * 0.7;
  const i = upgradeSlot(r, cfg, rng);
  if (heal || i < 0) {
    restHeal(r);
    return 'heal';
  }
  upgrade(r, i);
  return 'upgrade';
}

export const maxed = (r: RunState): boolean => r.memory.every((m) => m.lvl >= MAX_LVL);
