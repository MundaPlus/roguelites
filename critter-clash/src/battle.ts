import { CRITTERS, MAX_STAT, TEAM_SIZE, levelOf, type Ctx, type PerkId, type Trigger, type Unit } from './data';
import { Rng } from './rng';

/**
 * Pure battle sim. It resolves everything through one trigger queue and records
 * an event log with a snapshot of both lines after each event. The app replays the log.
 *
 * Fixed trigger order: all triggers that one action causes are sorted by
 * attack (high first), then side (your team first), then line position (front first).
 * They run first in, first out after the triggers already in the queue.
 */

export type EventKind = 'start' | 'ability' | 'attack' | 'hit' | 'buff' | 'perk' | 'faint' | 'summon' | 'end';

export interface BEvent {
  k: EventKind;
  /** The unit that acts or is changed. */
  uid?: number;
  /** The attack target. */
  to?: number;
  /** Damage dealt, or attack change for a buff. */
  n?: number;
  /** HP change for a buff. */
  h?: number;
  text?: string;
  snap: [Unit[], Unit[]];
}

export type Outcome = 'win' | 'loss' | 'draw';

export interface BattleResult {
  outcome: Outcome;
  events: BEvent[];
  turns: number;
}

type Side = 0 | 1;
interface BUnit extends Unit {
  side: Side;
}

interface Trig {
  u: BUnit;
  kind: Trigger | 'honey' | 'mush';
  arg?: BUnit;
}

const MAX_ACTIONS = 600;
const MAX_TURNS = 80;

class Sim implements Ctx {
  readonly mode = 'battle' as const;
  arg: Unit | null = null;
  lines: [BUnit[], BUnit[]];
  events: BEvent[] = [];
  private pending: Trig[] = [];
  private queue: Trig[] = [];
  private deadPos = new Map<number, number>();
  private used = new Set<number>();
  private nextUid = 100000;
  actions = 0;

  constructor(
    a: Unit[],
    b: Unit[],
    readonly rng: Rng,
  ) {
    this.lines = [a.map((u) => ({ ...u, side: 0 as Side })), b.map((u) => ({ ...u, side: 1 as Side }))];
  }

  private snap(): [Unit[], Unit[]] {
    const s = (l: BUnit[]): Unit[] => l.map(({ side: _s, ...u }) => u);
    return [s(this.lines[0]), s(this.lines[1])];
  }

  emit(k: EventKind, e: Omit<BEvent, 'k' | 'snap'> = {}): void {
    this.events.push({ k, ...e, snap: this.snap() });
  }

  private alive(side: Side): BUnit[] {
    return this.lines[side].filter((u) => u.hp > 0);
  }

  /** Living line of `me`, and the index where `me` is or was. */
  private place(me: Unit): { line: BUnit[]; i: number; dead: boolean } {
    const side = (me as BUnit).side;
    const line = this.alive(side);
    const i = line.indexOf(me as BUnit);
    if (i >= 0) return { line, i, dead: false };
    return { line, i: Math.min(this.deadPos.get(me.uid) ?? line.length, line.length), dead: true };
  }

  friends(me: Unit): Unit[] {
    return this.alive((me as BUnit).side).filter((u) => u !== me);
  }

  foes(me: Unit): Unit[] {
    return this.alive((1 - (me as BUnit).side) as Side);
  }

  ahead(me: Unit): Unit[] {
    const { line, i } = this.place(me);
    return line.slice(0, i).reverse();
  }

  behind(me: Unit): Unit[] {
    const { line, i, dead } = this.place(me);
    return line.slice(dead ? i : i + 1);
  }

  buff(t: Unit, atk: number, hp: number): void {
    if (t.hp <= 0) return;
    const a0 = t.atk;
    const h0 = t.hp;
    t.atk = Math.max(1, Math.min(MAX_STAT, t.atk + atk));
    t.hp = Math.max(1, Math.min(MAX_STAT, t.hp + hp));
    if (t.atk !== a0 || t.hp !== h0) this.emit('buff', { uid: t.uid, n: t.atk - a0, h: t.hp - h0 });
  }

  hit(t: Unit, dmg: number): void {
    const u = t as BUnit;
    if (u.hp <= 0 || dmg <= 0) return;
    let d = dmg;
    if (u.perk === 'shell') d = Math.max(1, d - 2);
    if (u.perk === 'melon') {
      d = Math.max(0, d - 20);
      u.perk = null;
      this.emit('perk', { uid: u.uid, text: '🍉 blocked' });
    }
    u.hp -= d;
    this.emit('hit', { uid: u.uid, n: d });
    if (u.hp > 0 && d > 0 && CRITTERS[u.id].trigger === 'hurt') this.pending.push({ u, kind: 'hurt' });
  }

  summon(me: Unit, id: string, atk: number, hp: number): void {
    const side = (me as BUnit).side;
    if (this.alive(side).length >= TEAM_SIZE) return;
    const { line, i, dead } = this.place(me);
    const at = dead ? i : i + 1;
    const nu: BUnit = { uid: this.nextUid++, id, atk: Math.min(MAX_STAT, atk), hp: Math.min(MAX_STAT, hp), xp: 0, perk: null, side };
    // Dead units are already removed when triggers run, so the living line is the real line.
    const before = line[at - 1];
    const real = this.lines[side];
    const ri = before ? real.indexOf(before) + 1 : 0;
    real.splice(ri, 0, nu);
    this.emit('summon', { uid: nu.uid, text: CRITTERS[id].name });
    for (const f of this.alive(side)) {
      if (f !== nu && CRITTERS[f.id].trigger === 'summon') this.pending.push({ u: f, kind: 'summon', arg: nu });
    }
  }

  givePerk(t: Unit, perk: PerkId): void {
    if (t.hp <= 0) return;
    t.perk = perk;
    this.emit('perk', { uid: t.uid, text: perk });
  }

  gold(): void {}
  goldLeft(): number {
    return 0;
  }
  shopBuff(): void {}

  once(me: Unit): boolean {
    if (this.used.has(me.uid)) return false;
    this.used.add(me.uid);
    return true;
  }

  /** Remove fainted units and queue their faint triggers. */
  cleanup(): void {
    for (const side of [0, 1] as Side[]) {
      const line = this.lines[side];
      let alive = 0;
      for (const u of [...line]) {
        if (u.hp > 0) {
          alive++;
          continue;
        }
        this.deadPos.set(u.uid, alive);
        this.emit('faint', { uid: u.uid });
        line.splice(line.indexOf(u), 1);
        if (CRITTERS[u.id].trigger === 'faint') this.pending.push({ u, kind: 'faint' });
        if (u.perk === 'honey') this.pending.push({ u, kind: 'honey' });
        if (u.perk === 'mush') this.pending.push({ u, kind: 'mush' });
      }
    }
  }

  /** Sort the triggers of the last action into the queue. */
  flush(): void {
    if (!this.pending.length) return;
    const idx = (u: BUnit): number => {
      const i = this.lines[u.side].indexOf(u);
      return i >= 0 ? i : (this.deadPos.get(u.uid) ?? 9);
    };
    this.pending.sort((a, b) => b.u.atk - a.u.atk || a.u.side - b.u.side || idx(a.u) - idx(b.u));
    this.queue.push(...this.pending);
    this.pending = [];
  }

  resolve(): void {
    while (this.queue.length && this.actions < MAX_ACTIONS) {
      this.actions++;
      const t = this.queue.shift()!;
      this.run(t);
      this.cleanup();
      this.flush();
    }
    this.queue = [];
  }

  private run(t: Trig): void {
    const u = t.u;
    const def = CRITTERS[u.id];
    if (t.kind === 'honey') {
      this.emit('ability', { uid: u.uid, text: '🍯 Honey' });
      this.summon(u, 'bumble', 1, 1);
      return;
    }
    if (t.kind === 'mush') {
      this.emit('ability', { uid: u.uid, text: '🍄 Mushroom' });
      const side = this.alive(u.side);
      if (side.length >= TEAM_SIZE) return;
      this.summon(u, u.id, 1, 1);
      const nu = this.lines[u.side].find((x) => x.uid === this.nextUid - 1);
      if (nu) nu.xp = u.xp;
      return;
    }
    if (t.kind !== 'faint' && u.hp <= 0) return;
    this.arg = t.arg ?? null;
    if (this.arg && this.arg.hp <= 0) return;
    this.emit('ability', { uid: u.uid, text: def.trigger ?? '' });
    def.fx(this, u, levelOf(u.xp));
    this.arg = null;
  }

  attackRound(): void {
    const a = this.lines[0][0];
    const b = this.lines[1][0];
    this.emit('attack', { uid: a.uid, to: b.uid });
    const da = a.atk + (a.perk === 'bone' ? 3 : 0);
    const db = b.atk + (b.perk === 'bone' ? 3 : 0);
    this.hit(b, da);
    this.hit(a, db);
    if (a.perk === 'chili' && this.lines[1][1]) this.hit(this.lines[1][1], 4);
    if (b.perk === 'chili' && this.lines[0][1]) this.hit(this.lines[0][1], 4);
    this.cleanup();
    this.flush();
    this.resolve();
  }

  run_(): BattleResult {
    this.emit('start');
    for (const side of [0, 1] as Side[]) {
      for (const u of this.lines[side]) if (CRITTERS[u.id].trigger === 'start') this.pending.push({ u, kind: 'start' });
    }
    this.flush();
    this.resolve();
    let turns = 0;
    while (this.lines[0].length && this.lines[1].length && turns < MAX_TURNS && this.actions < MAX_ACTIONS) {
      turns++;
      this.attackRound();
    }
    const a = this.lines[0].length;
    const b = this.lines[1].length;
    const outcome: Outcome = a && !b ? 'win' : b && !a ? 'loss' : 'draw';
    this.emit('end', { text: outcome });
    return { outcome, events: this.events, turns };
  }
}

/** Run one battle. Your team is `a`, index 0 is the front. */
export function battle(a: Unit[], b: Unit[], seed: number): BattleResult {
  return new Sim(a, b, new Rng(seed)).run_();
}
