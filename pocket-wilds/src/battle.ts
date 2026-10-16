/**
 * Pure battle logic. `battleTurn(state, choice)` returns a new state and a log.
 * The input state is never changed. The RNG state lives inside the battle state.
 */
import { ITEMS, MOVES, SPECIES, STATUS_INFO, effectiveness, type ItemId, type MoveDef, type Status } from './data';
import { heal, maxHp, stat, types, type Mon } from './mon';
import { Rng } from './rng';

export type BattleKind = 'wild' | 'rare' | 'trainer' | 'gym' | 'champion';
export type Outcome = 'win' | 'lose' | 'caught' | 'fled';
export type Side = 'p' | 'f';

export interface Stages {
  atk: number;
  def: number;
  spd: number;
}

export interface Battle {
  kind: BattleKind;
  name: string;
  icon: string;
  seed: number;
  p: Mon[];
  pi: number;
  f: Mon[];
  fi: number;
  ps: Stages;
  fs: Stages;
  turn: number;
  over: Outcome | null;
  mustSwitch: boolean;
  /** Potions the foe trainer can still use. */
  fPotions: number;
  /** Player creatures that took part (uids). */
  fought: number[];
  /** Defeated or caught foes, for XP. */
  ko: { sp: string; lvl: number }[];
  caught: Mon | null;
  /** Heal moves used per creature (uid). Each creature can heal 2 times per battle. */
  heals: Record<number, number>;
}

export const HEAL_LIMIT = 2;

export type Choice = { t: 'move'; i: number } | { t: 'switch'; i: number } | { t: 'item'; id: ItemId } | { t: 'run' };

export type Fx = 'hit' | 'miss' | 'faint' | 'status' | 'heal' | 'boost' | 'switch' | 'catch' | 'shake' | 'escape' | 'info';

export interface Snap {
  pi: number;
  fi: number;
  pHp: number;
  fHp: number;
  pSt: Status | null;
  fSt: Status | null;
  fGone: boolean;
}

export interface LogEntry {
  text: string;
  fx: Fx;
  side?: Side;
  dmg?: number;
  eff?: number;
  crit?: boolean;
  snap: Snap;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const zero = (): Stages => ({ atk: 0, def: 0, spd: 0 });

export function newBattle(kind: BattleKind, team: Mon[], foes: Mon[], seed: number, name = '', icon = '', fPotions = 0): Battle {
  const pi = Math.max(0, team.findIndex((m) => m.hp > 0));
  return {
    kind,
    name,
    icon,
    seed,
    p: clone(team),
    pi,
    f: clone(foes),
    fi: 0,
    ps: zero(),
    fs: zero(),
    turn: 1,
    over: null,
    mustSwitch: false,
    fPotions,
    fought: [team[pi].uid],
    ko: [],
    caught: null,
    heals: {},
  };
}

export const isWild = (b: Battle): boolean => b.kind === 'wild' || b.kind === 'rare';

export function stageMul(n: number): number {
  return n >= 0 ? (2 + n) / 2 : 2 / (2 - n);
}

export function speedOf(m: Mon, s: Stages): number {
  return stat(m, 'spd') * stageMul(s.spd) * (m.st === 'par' ? 0.5 : 1);
}

export const nameOf = (m: Mon): string => SPECIES[m.sp].name;

/** Average damage before accuracy, without crits. */
export function baseDamage(a: Mon, as: Stages, d: Mon, ds: Stages, mv: MoveDef, crit = false): number {
  if (mv.power <= 0) return 0;
  const atk = stat(a, 'atk') * stageMul(crit ? Math.max(0, as.atk) : as.atk) * (a.st === 'brn' ? 0.5 : 1);
  const def = stat(d, 'def') * stageMul(crit ? Math.min(0, ds.def) : ds.def);
  const raw = Math.floor((Math.floor(((2 * a.lvl) / 5 + 2) * mv.power * (atk / def)) / 50) + 2);
  const stab = types(a).includes(mv.type) ? 1.5 : 1;
  return raw * stab * effectiveness(mv.type, types(d)) * (crit ? 1.5 : 1);
}

/** Score of a move for the AI: expected damage, a big bonus for a likely KO, and values for status moves. */
export function moveScore(a: Mon, as: Stages, d: Mon, ds: Stages, id: string, healsUsed = 0): number {
  const mv = MOVES[id];
  const acc = mv.acc / 100;
  if (mv.power > 0) {
    const critP = mv.highCrit ? 0.25 : 1 / 16;
    const avg = baseDamage(a, as, d, ds, mv) * 0.925 * (1 + critP * 0.5);
    let v = Math.min(avg, d.hp) * acc;
    if (avg * 0.9 >= d.hp) v += 1000 * acc + (mv.prio ?? 0) * 50;
    if (mv.drain && a.hp < maxHp(a)) v *= 1.2;
    if (mv.recoil) v -= avg * mv.recoil * 0.5;
    if (mv.status && !d.st) v += maxHp(d) * 0.05 * (mv.status[1] / 100) * 4;
    return v;
  }
  const dHp = maxHp(d);
  if (mv.status) {
    if (d.st || immune(d, mv.status[0])) return 0;
    const w = mv.status[0] === 'slp' ? 0.4 : mv.status[0] === 'par' ? 0.25 : 0.3;
    return dHp * w * acc * (d.hp / dHp);
  }
  if (mv.heal) {
    if (healsUsed >= HEAL_LIMIT) return -1;
    const missing = maxHp(a) - a.hp;
    return missing > maxHp(a) * 0.45 ? Math.min(missing, maxHp(a) * mv.heal) * 0.8 : 0;
  }
  if (mv.self) {
    const cur = as[mv.self[0]];
    return cur >= 2 || a.hp < maxHp(a) * 0.6 ? 0 : maxHp(d) * 0.18 * mv.self[1];
  }
  if (mv.foe) return ds[mv.foe[0]] <= -2 ? 0 : maxHp(d) * 0.12;
  return 0;
}

export function bestMove(a: Mon, as: Stages, d: Mon, ds: Stages, healsUsed = 0): number {
  let best = 0;
  let bs = -Infinity;
  a.moves.forEach((id, i) => {
    const v = moveScore(a, as, d, ds, id, healsUsed);
    if (v > bs) {
      bs = v;
      best = i;
    }
  });
  return best;
}

function immune(m: Mon, st: Status): boolean {
  const t = types(m);
  return (st === 'brn' && t.includes('fire')) || (st === 'par' && t.includes('storm')) || (st === 'psn' && t.includes('stone'));
}

/** Taming chance for a charm. */
export function catchChance(m: Mon, item: ItemId): number {
  const charm = ITEMS[item].charm ?? 0;
  const hpPart = 1 - (0.75 * m.hp) / maxHp(m);
  const stBonus = m.st === 'slp' ? 2 : m.st ? 1.5 : 1;
  const lvlPen = Math.max(0.5, 1 - m.lvl / 120);
  return Math.max(0, Math.min(1, SPECIES[m.sp].rate * hpPart * charm * stBonus * lvlPen * 1.25));
}

function foeAction(b: Battle, rng: Rng): { kind: 'move'; i: number } | { kind: 'potion' } {
  const a = b.f[b.fi];
  const d = b.p[b.pi];
  if (!isWild(b) && b.fPotions > 0 && a.hp < maxHp(a) * 0.3 && a.hp > 0) return { kind: 'potion' };
  if (isWild(b)) {
    // Wild creatures pick at random, but favor attacks that hit hard.
    if (rng.chance(0.5)) return { kind: 'move', i: bestMove(a, b.fs, d, b.ps, b.heals[a.uid]) };
    return { kind: 'move', i: rng.int(0, a.moves.length - 1) };
  }
  // Route trainers slip up sometimes. Leaders and the Champion rarely do.
  const slip = b.kind === 'trainer' ? 0.3 : b.kind === 'gym' ? 0.12 : 0.05;
  if (rng.chance(slip)) return { kind: 'move', i: rng.int(0, a.moves.length - 1) };
  return { kind: 'move', i: bestMove(a, b.fs, d, b.ps, b.heals[a.uid]) };
}

export function battleTurn(state: Battle, choice: Choice): { state: Battle; log: LogEntry[] } {
  const b = clone(state);
  const log: LogEntry[] = [];
  if (b.over) return { state: b, log };
  const rng = new Rng(b.seed);
  const snap = (): Snap => ({
    pi: b.pi,
    fi: b.fi,
    pHp: b.p[b.pi].hp,
    fHp: b.f[b.fi].hp,
    pSt: b.p[b.pi].st,
    fSt: b.f[b.fi].st,
    fGone: b.over === 'caught',
  });
  const say = (text: string, fx: Fx, extra: Partial<LogEntry> = {}): void => {
    log.push({ text, fx, ...extra, snap: snap() });
  };
  const mon = (s: Side): Mon => (s === 'p' ? b.p[b.pi] : b.f[b.fi]);
  const stages = (s: Side): Stages => (s === 'p' ? b.ps : b.fs);
  const label = (s: Side): string => (s === 'p' ? nameOf(mon('p')) : `${isWild(b) ? 'Wild' : 'Foe'} ${nameOf(mon('f'))}`);

  const doSwitch = (i: number): void => {
    const old = b.p[b.pi];
    b.pi = i;
    b.ps = zero();
    if (!b.fought.includes(b.p[i].uid)) b.fought.push(b.p[i].uid);
    say(old.hp > 0 ? `${nameOf(old)}, come back! Go, ${nameOf(b.p[i])}!` : `Go, ${nameOf(b.p[i])}!`, 'switch', { side: 'p' });
  };

  if (b.mustSwitch) {
    if (choice.t !== 'switch' || !b.p[choice.i] || b.p[choice.i].hp <= 0 || choice.i === b.pi) return { state: state, log };
    b.mustSwitch = false;
    doSwitch(choice.i);
    b.seed = rng.state();
    return { state: b, log };
  }

  // Validate the player choice.
  if (choice.t === 'switch' && (!b.p[choice.i] || b.p[choice.i].hp <= 0 || choice.i === b.pi)) return { state, log };
  if (choice.t === 'move' && !b.p[b.pi].moves[choice.i]) return { state, log };
  if (choice.t === 'run' && !isWild(b)) return { state, log };
  if (choice.t === 'item' && ITEMS[choice.id].charm && !isWild(b)) return { state, log };
  if (choice.t === 'item' && !ITEMS[choice.id].battle) return { state, log };

  /** Returns true when the foe fainted and the battle should stop this turn's foe action. */
  const announced = new Set<number>();
  const faintCheck = (): void => {
    const f = b.f[b.fi];
    const p = b.p[b.pi];
    if (f.hp <= 0 && !b.over && !announced.has(f.uid)) {
      announced.add(f.uid);
      f.hp = 0;
      say(`${label('f')} fainted!`, 'faint', { side: 'f' });
      b.ko.push({ sp: f.sp, lvl: f.lvl });
    }
    if (p.hp <= 0 && !announced.has(p.uid)) {
      announced.add(p.uid);
      p.hp = 0;
      say(`${nameOf(p)} fainted! It is lost for this run.`, 'faint', { side: 'p' });
    }
  };

  const useMove = (side: Side, id: string): void => {
    const a = mon(side);
    const other: Side = side === 'p' ? 'f' : 'p';
    const d = mon(other);
    const mv = MOVES[id];
    if (a.st === 'slp') {
      if (a.slp > 0) {
        a.slp--;
        say(`${label(side)} is fast asleep.`, 'status', { side });
        return;
      }
      a.st = null;
      say(`${label(side)} woke up!`, 'status', { side });
    }
    if (a.st === 'par' && rng.chance(0.25)) {
      say(`${label(side)} is paralyzed and can't move!`, 'status', { side });
      return;
    }
    const targetsFoe = mv.power > 0 || !!mv.status || !!mv.foe;
    if (targetsFoe && rng.int(1, 100) > mv.acc) {
      say(`${label(side)} used ${mv.name}, but it missed!`, 'miss', { side: other });
      return;
    }
    if (mv.power > 0) {
      const crit = rng.chance(mv.highCrit ? 0.25 : 1 / 16);
      const eff = effectiveness(mv.type, types(d));
      const dmg = Math.max(1, Math.floor(baseDamage(a, stages(side), d, stages(other), mv, crit) * (0.85 + rng.next() * 0.15)));
      const dealt = Math.min(dmg, d.hp);
      d.hp -= dealt;
      const notes = `${crit ? ' A critical hit!' : ''}${eff > 1 ? " It's super effective!" : eff < 1 ? " It's not very effective." : ''}`;
      say(`${label(side)} used ${mv.name}!${notes}`, 'hit', { side: other, dmg: dealt, eff, crit });
      if (mv.drain && a.hp > 0) {
        const h = heal(a, Math.max(1, Math.floor(dealt * mv.drain)));
        if (h > 0) say(`${label(side)} drained ${h} HP.`, 'heal', { side, dmg: h });
      }
      if (mv.recoil) {
        const r = Math.max(1, Math.floor(dealt * mv.recoil));
        a.hp = Math.max(0, a.hp - r);
        say(`${label(side)} is hurt by recoil.`, 'hit', { side, dmg: r });
      }
      if (d.hp <= 0) return;
    } else {
      say(`${label(side)} used ${mv.name}!`, 'info', { side });
    }
    if (mv.status && d.hp > 0 && (mv.power === 0 || rng.int(1, 100) <= mv.status[1])) {
      const st = mv.status[0];
      if (!d.st && !immune(d, st)) {
        d.st = st;
        if (st === 'slp') d.slp = rng.int(1, 3);
        const verb = { brn: 'was burned', psn: 'was poisoned', slp: 'fell asleep', par: 'is paralyzed' }[st];
        say(`${label(other)} ${verb}!`, 'status', { side: other });
      } else if (mv.power === 0) say(`It had no effect on ${label(other)}.`, 'info', { side: other });
    }
    if (mv.foe && d.hp > 0 && rng.int(1, 100) <= mv.foe[2]) {
      const st = stages(other);
      const k = mv.foe[0];
      const nv = Math.max(-4, Math.min(4, st[k] + mv.foe[1]));
      if (nv !== st[k]) {
        st[k] = nv;
        say(`${label(other)}'s ${k.toUpperCase()} fell!`, 'boost', { side: other });
      }
    }
    if (mv.self) {
      const st = stages(side);
      const k = mv.self[0];
      const nv = Math.max(-4, Math.min(4, st[k] + mv.self[1]));
      if (nv !== st[k]) {
        st[k] = nv;
        say(`${label(side)}'s ${k.toUpperCase()} rose${mv.self[1] > 1 ? ' sharply' : ''}!`, 'boost', { side });
      } else say(`${label(side)}'s ${k.toUpperCase()} won't go higher.`, 'info', { side });
    }
    if (mv.heal) {
      const used = b.heals[a.uid] ?? 0;
      if (used >= HEAL_LIMIT) {
        say(`${label(side)} is too tired to heal again.`, 'info', { side });
        return;
      }
      b.heals[a.uid] = used + 1;
      const h = heal(a, Math.floor(maxHp(a) * mv.heal));
      say(h > 0 ? `${label(side)} healed ${h} HP.` : `${label(side)} is already healthy.`, h > 0 ? 'heal' : 'info', { side, dmg: h });
    }
  };

  const playerItem = (id: ItemId): void => {
    const it = ITEMS[id];
    const p = b.p[b.pi];
    if (it.charm) {
      const f = b.f[b.fi];
      const chance = catchChance(f, id);
      say(`You threw a ${it.name}!`, 'info', { side: 'f' });
      // Up to 3 shakes; each shake must pass.
      const per = Math.cbrt(chance);
      let shakes = 0;
      while (shakes < 3 && rng.next() < per) {
        shakes++;
        say('...'.slice(0, shakes) + ' the charm glows', 'shake', { side: 'f' });
      }
      if (shakes === 3) {
        b.over = 'caught';
        f.st = f.st === 'slp' ? null : f.st;
        f.slp = 0;
        b.caught = clone(f);
        b.ko.push({ sp: f.sp, lvl: f.lvl });
        say(`Tamed! ${nameOf(f)} joins you.`, 'catch', { side: 'f' });
      } else say(`${nameOf(f)} broke free!`, 'escape', { side: 'f' });
      return;
    }
    if (id === 'potion') {
      const h = heal(p, Math.max(20, Math.floor(maxHp(p) / 2)));
      say(`You used a Potion. ${nameOf(p)} healed ${h} HP.`, 'heal', { side: 'p', dmg: h });
    } else if (id === 'tonic') {
      const h = heal(p, maxHp(p));
      p.st = null;
      say(`You used a Big Tonic. ${nameOf(p)} is fully healed.`, 'heal', { side: 'p', dmg: h });
    } else if (id === 'cure') {
      const had = p.st;
      p.st = null;
      p.slp = 0;
      say(had ? `${nameOf(p)} is cured of ${STATUS_INFO[had].name}.` : 'The Cure Leaf had no effect.', 'heal', { side: 'p' });
    }
  };

  // Decide actions.
  const fa = foeAction(b, rng);
  const pPrio = choice.t === 'move' ? (MOVES[b.p[b.pi].moves[choice.i]].prio ?? 0) : 10;
  const fPrio = fa.kind === 'potion' ? 10 : (MOVES[b.f[b.fi].moves[fa.i]].prio ?? 0);
  const ps = speedOf(b.p[b.pi], b.ps);
  const fs = speedOf(b.f[b.fi], b.fs);
  const playerFirst = pPrio !== fPrio ? pPrio > fPrio : ps !== fs ? ps > fs : rng.chance(0.5);
  const startPi = b.pi;
  const startFi = b.fi;

  const doPlayer = (): void => {
    if (b.p[b.pi].hp <= 0) return;
    if (choice.t === 'move') useMove('p', b.p[b.pi].moves[choice.i]);
    else if (choice.t === 'switch') doSwitch(choice.i);
    else if (choice.t === 'item') playerItem(choice.id);
    else if (choice.t === 'run') {
      const chance = Math.min(0.95, 0.4 + (0.35 * speedOf(b.p[b.pi], b.ps)) / Math.max(1, speedOf(b.f[b.fi], b.fs)));
      if (rng.chance(chance)) {
        b.over = 'fled';
        say('You got away safely.', 'escape', { side: 'p' });
      } else say("You couldn't get away!", 'info', { side: 'p' });
    }
  };
  const doFoe = (): void => {
    if (b.f[b.fi].hp <= 0 || b.fi !== startFi) return;
    if (fa.kind === 'potion') {
      b.fPotions--;
      const f = b.f[b.fi];
      const h = heal(f, Math.floor(maxHp(f) * 0.6));
      f.st = null;
      say(`${b.name} used a Potion. ${nameOf(f)} healed ${h} HP.`, 'heal', { side: 'f', dmg: h });
    } else useMove('f', b.f[b.fi].moves[fa.i]);
  };

  const order = playerFirst ? [doPlayer, doFoe] : [doFoe, doPlayer];
  for (const step of order) {
    if (b.over) break;
    if (b.p[startPi].hp <= 0 && step === doPlayer && b.pi === startPi) continue;
    step();
    faintCheck();
    if (b.f[b.fi].hp <= 0 || b.p[b.pi].hp <= 0) break;
  }

  // End of turn: burn and poison.
  if (!b.over) {
    for (const side of ['p', 'f'] as Side[]) {
      const m = mon(side);
      if (m.hp <= 0 || (m.st !== 'brn' && m.st !== 'psn')) continue;
      const dmg = Math.max(1, Math.floor(maxHp(m) / (m.st === 'brn' ? 16 : 8)));
      m.hp = Math.max(0, m.hp - dmg);
      say(`${label(side)} is hurt by ${m.st === 'brn' ? 'its burn' : 'poison'}.`, 'hit', { side, dmg });
      faintCheck();
    }
  }

  // Replace fainted creatures.
  if (!b.over) {
    if (b.f[b.fi].hp <= 0) {
      const next = b.f.findIndex((m) => m.hp > 0);
      if (next < 0) {
        b.over = 'win';
      } else {
        b.fi = next;
        b.fs = zero();
        say(`${b.name} sends out ${nameOf(b.f[next])}!`, 'switch', { side: 'f' });
      }
    }
    if (b.p[b.pi].hp <= 0) {
      if (b.p.some((m) => m.hp > 0)) b.mustSwitch = !b.over;
      else b.over = 'lose';
    }
  }
  if (b.over === 'win' && b.p[b.pi].hp <= 0) b.mustSwitch = false;
  b.turn++;
  b.seed = rng.state();
  return { state: b, log };
}
