import { getCard } from './cards';
import { ENEMIES, type EnemyState } from './enemies';
import { POTIONS } from './potions';
import { RELICS, type RelicDef } from './relics';
import type { Rng } from './rng';
import { hasRelic, type RunState } from './run';
import { isDebuff } from './statuses';
import type { CardDef, CardInst, Fighter, Intent, Op, StatusId } from './types';

export type Who = 'player' | number;

/** What happened, for the UI to animate. The UI drains it after each step. */
export type LogEvent =
  | { t: 'dmg'; who: Who; n: number; blocked: number }
  | { t: 'block'; who: Who; n: number }
  | { t: 'heal'; who: Who; n: number }
  | { t: 'status'; who: Who; s: StatusId; n: number }
  | { t: 'negate'; who: Who }
  | { t: 'act'; who: Who }
  | { t: 'death'; who: Who };

export interface IntentInfo {
  intent: Intent;
  name: string;
  dmg: number | null;
  times: number;
}

type DmgOp = Extract<Op, { op: 'dmg' }>;

export class Combat {
  player: Fighter;
  enemies: EnemyState[] = [];
  drawPile: CardInst[] = [];
  hand: CardInst[] = [];
  discardPile: CardInst[] = [];
  exhaustPile: CardInst[] = [];
  energy = 0;
  maxEnergy: number;
  turn = 0;
  log: LogEvent[] = [];
  over: 'win' | 'lose' | null = null;
  /** Damage multiplier for the card being played (Pen Nib). */
  dmgMul = 1;

  constructor(
    readonly run: RunState,
    encounter: string[],
    readonly rng: Rng,
  ) {
    this.player = { hp: run.hp, maxHp: run.maxHp, block: 0, status: {} };
    this.maxEnergy = 3 + run.relics.reduce((a, r) => a + (RELICS[r.id].energy ?? 0), 0);
    encounter.forEach((id, i) => {
      const def = ENEMIES[id];
      const hp = rng.int(def.hp[0], def.hp[1]);
      const e: EnemyState = { uid: i + 1, def, hp, maxHp: hp, block: 0, status: { ...def.start }, move: '', history: [], dead: false, mem: { idx: i } };
      def.init?.(e, rng);
      this.enemies.push(e);
    });
    // Innate cards go on top. The top of the draw pile is the end of the array.
    const deck = rng.shuffle(run.deck.map((c) => ({ ...c })));
    this.drawPile = [...deck.filter((c) => !getCard(c).innate), ...deck.filter((c) => getCard(c).innate)];
  }

  // ---------------------------------------------------------------- queries

  alive(): EnemyState[] {
    return this.enemies.filter((e) => !e.dead);
  }

  private isPlayer(f: Fighter): boolean {
    return f === this.player;
  }

  private gone(f: Fighter): boolean {
    return f.hp <= 0 || (!this.isPlayer(f) && (f as EnemyState).dead);
  }

  private who(f: Fighter): Who {
    return this.isPlayer(f) ? 'player' : (f as EnemyState).uid;
  }

  private opponents(f: Fighter): Fighter[] {
    return this.isPlayer(f) ? this.alive() : [this.player];
  }

  private hook<K extends 'combatStart' | 'turnStart' | 'turnEnd' | 'combatEnd'>(name: K): void {
    for (const r of this.run.relics) (RELICS[r.id][name] as RelicDef['combatStart'])?.(this, r);
  }

  canPlay(inst: CardInst): { ok: boolean; why?: string } {
    const d = getCard(inst);
    if (this.over) return { ok: false };
    if (d.cost === -2) return { ok: false, why: `${d.name} is unplayable.` };
    if (d.cost > this.energy) return { ok: false, why: 'Not enough energy.' };
    return { ok: true };
  }

  calcDamage(src: Fighter, tgt: Fighter | null, base: number, strMul = 1, raw = false): number {
    const mul = this.isPlayer(src) ? this.dmgMul : 1;
    if (raw) return Math.max(0, Math.floor(base * mul));
    let d = base + (src.status.strength ?? 0) * strMul;
    if (src.status.weak) d *= 0.75;
    if (tgt?.status.vulnerable) d *= 1.5;
    return Math.max(0, Math.floor(d * mul));
  }

  calcBlock(f: Fighter, base: number): number {
    let n = base + (f.status.dexterity ?? 0);
    if (f.status.frail) n *= 0.75;
    return Math.max(0, Math.floor(n));
  }

  /** Live numbers for the {D} and {B} placeholders on a card. */
  preview(d: CardDef, target: Fighter | null = null): { dmg: number | null; block: number | null } {
    const p = this.player;
    const dOp = d.ops.find((o) => o.op === 'dmg' || o.op === 'dmgBlock');
    const bOp = d.ops.find((o): o is Extract<Op, { op: 'block' }> => o.op === 'block');
    let dmg: number | null = null;
    if (dOp?.op === 'dmg') dmg = this.calcDamage(p, target, dOp.n, dOp.strMul ?? 1, dOp.raw);
    if (dOp?.op === 'dmgBlock') dmg = this.calcDamage(p, target, p.block);
    return { dmg, block: bOp ? (bOp.raw ? bOp.n : this.calcBlock(p, bOp.n)) : null };
  }

  intentOf(e: EnemyState): IntentInfo {
    const move = e.def.moves[e.move];
    const ops = typeof move.ops === 'function' ? move.ops(e, this) : move.ops;
    const d = ops.find((o): o is DmgOp => o.op === 'dmg');
    return { intent: move.intent, name: move.name, dmg: d ? this.calcDamage(e, this.player, d.n, 1, d.raw) : null, times: d?.times ?? 1 };
  }

  // ---------------------------------------------------------------- flow

  start(): void {
    this.hook('combatStart');
    for (const e of this.enemies) e.move = e.def.ai(e, this);
    this.startTurn();
  }

  startTurn(): void {
    this.turn++;
    const p = this.player;
    if (!p.status.barricade) p.block = 0;
    const carry = hasRelic(this.run, 'iceCream') ? this.energy : 0;
    this.energy = this.maxEnergy + carry;
    if (p.status.demonForm) this.applyStatus(p, 'strength', p.status.demonForm, p);
    if (p.status.fumes) for (const e of this.alive()) this.applyStatus(e, 'poison', p.status.fumes, p);
    this.drawCards(5);
    this.hook('turnStart');
  }

  drawCards(n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.hand.length >= 10) return;
      if (!this.drawPile.length) {
        if (!this.discardPile.length) return;
        this.drawPile = this.rng.shuffle(this.discardPile);
        this.discardPile = [];
      }
      this.hand.push(this.drawPile.pop()!);
    }
  }

  play(index: number, targetUid?: number): boolean {
    const inst = this.hand[index];
    if (!inst || !this.canPlay(inst).ok) return false;
    const d = getCard(inst);
    let target: EnemyState | null = null;
    if (d.target === 'enemy') {
      target = this.alive().find((e) => e.uid === targetUid) ?? null;
      if (!target) return false;
    }
    const x = d.cost === -1 ? this.energy : 0;
    this.energy -= d.cost === -1 ? this.energy : d.cost;
    this.hand.splice(index, 1);

    for (const r of this.run.relics) RELICS[r.id].beforeCard?.(this, r, d);
    if (d.type === 'attack') this.log.push({ t: 'act', who: 'player' });
    if (d.type === 'skill') {
      for (const e of this.alive()) if (e.status.enrage) this.applyStatus(e, 'strength', e.status.enrage, e);
    }
    this.resolve(d.ops, this.player, target, x);
    this.dmgMul = 1;
    // Powers stay in play for the rest of the combat.
    if (d.type !== 'power') (d.exhaust ? this.exhaustPile : this.discardPile).push(inst);
    if (!this.over) for (const r of this.run.relics) RELICS[r.id].afterCard?.(this, r, d);
    this.checkWin();
    return true;
  }

  usePotion(slot: number, targetUid?: number): boolean {
    const id = this.run.potions[slot];
    if (!id || this.over) return false;
    const def = POTIONS[id];
    let target: EnemyState | null = null;
    if (def.target === 'enemy') {
      target = this.alive().find((e) => e.uid === targetUid) ?? null;
      if (!target) return false;
    }
    this.run.potions[slot] = null;
    this.resolve(def.ops, this.player, target);
    this.checkWin();
    return true;
  }

  endPlayerTurn(): void {
    const p = this.player;
    for (const inst of [...this.hand]) {
      const d = getCard(inst);
      if (d.endTurn) this.resolve(d.endTurn, p, null);
      if (this.over) return;
    }
    this.hook('turnEnd');
    if (p.status.metallicize) this.gainBlock(p, p.status.metallicize, true);
    if (p.status.flex) {
      this.applyStatus(p, 'strength', -p.status.flex, p);
      delete p.status.flex;
    }
    for (const inst of this.hand) (getCard(inst).ethereal ? this.exhaustPile : this.discardPile).push(inst);
    this.hand = [];
    this.tickDown(p);
  }

  /** One enemy takes its turn. The UI calls this per enemy, with a pause between. */
  enemyAct(e: EnemyState): void {
    if (e.dead || this.over) return;
    e.block = 0;
    const poison = e.status.poison ?? 0;
    if (poison > 0) {
      this.loseHp(e, poison);
      if (poison > 1) e.status.poison = poison - 1;
      else delete e.status.poison;
      if (e.dead) return;
    }
    const move = e.def.moves[e.move];
    const ops = typeof move.ops === 'function' ? move.ops(e, this) : move.ops;
    if (ops.some((o) => o.op === 'dmg')) this.log.push({ t: 'act', who: e.uid });
    this.resolve(ops, e, this.player);
    e.history.push(e.move);
    if (e.dead || this.over) return;
    // Ritual skips the turn it was gained on.
    if (e.status.ritual) {
      if (e.mem.ritualReady) this.applyStatus(e, 'strength', e.status.ritual, e);
      e.mem.ritualReady = 1;
    }
    if (e.status.metallicize) this.gainBlock(e, e.status.metallicize, true);
    this.tickDown(e);
    e.move = e.def.ai(e, this);
  }

  private tickDown(f: Fighter): void {
    for (const s of ['weak', 'vulnerable', 'frail'] as const) {
      const v = f.status[s];
      if (!v) continue;
      if (v > 1) f.status[s] = v - 1;
      else delete f.status[s];
    }
  }

  private checkWin(): void {
    if (this.over || this.alive().length) return;
    this.over = 'win';
    this.hook('combatEnd');
    this.run.hp = this.player.hp;
  }

  // ---------------------------------------------------------------- effects

  private resolve(ops: Op[], src: Fighter, tgt: Fighter | null, x = 0): void {
    for (const op of ops) {
      if (this.over) return;
      switch (op.op) {
        case 'dmg': {
          const times = op.x ? x : (op.times ?? 1);
          for (let i = 0; i < times; i++) {
            let targets: Fighter[];
            if (op.all) targets = this.opponents(src);
            else if (op.random) {
              const opp = this.opponents(src);
              targets = opp.length ? [this.rng.pick(opp)] : [];
            } else targets = tgt && !this.gone(tgt) ? [tgt] : [];
            for (const t of targets) {
              const lost = this.damage(t, this.calcDamage(src, t, op.n, op.strMul ?? 1, op.raw), src);
              if (op.lifesteal && lost > 0) this.heal(src, lost);
              if (this.over) return;
            }
          }
          break;
        }
        case 'dmgBlock':
          if (tgt && !this.gone(tgt)) this.damage(tgt, this.calcDamage(src, tgt, src.block), src);
          break;
        case 'block':
          this.gainBlock(src, op.n, op.raw);
          break;
        case 'draw':
          if (this.isPlayer(src)) this.drawCards(op.n);
          break;
        case 'energy':
          this.energy += op.n;
          break;
        case 'status': {
          let targets: Fighter[] = [];
          if (op.to === 'self') targets = [src];
          else if (op.to === 'target') targets = tgt && !this.gone(tgt) ? [tgt] : [];
          else if (op.to === 'all') targets = this.opponents(src);
          else {
            const opp = this.opponents(src);
            if (opp.length) targets = [this.rng.pick(opp)];
          }
          for (const t of targets) this.applyStatus(t, op.s, op.n, src);
          break;
        }
        case 'mulStatus': {
          const f = op.to === 'self' ? src : tgt;
          const cur = f?.status[op.s] ?? 0;
          if (f && cur > 0) {
            f.status[op.s] = cur * op.mul;
            this.log.push({ t: 'status', who: this.who(f), s: op.s, n: cur * (op.mul - 1) });
          }
          break;
        }
        case 'heal':
          this.heal(src, op.n);
          break;
        case 'healPct':
          this.heal(src, Math.floor((src.maxHp * op.n) / 100));
          break;
        case 'loseHp':
          this.loseHp(src, op.n);
          break;
        case 'hurtSelf':
          this.damage(src, op.n, null);
          break;
        case 'addCard':
          for (let i = 0; i < op.n; i++) {
            const inst: CardInst = { uid: this.run.nextUid++, id: op.id, up: false };
            if (op.to === 'hand' && this.hand.length < 10) this.hand.push(inst);
            else if (op.to === 'draw') this.drawPile.splice(this.rng.int(0, this.drawPile.length), 0, inst);
            else this.discardPile.push(inst);
          }
          break;
        case 'doubleBlock':
          this.gainBlock(src, src.block, true);
          break;
        case 'allyBlock': {
          const allies = this.alive();
          if (allies.length) this.gainBlock(this.rng.pick(allies), op.n, true);
          break;
        }
        case 'healAllies':
          for (const e of this.alive()) this.heal(e, op.n);
          break;
        case 'statusAllies':
          for (const e of this.alive()) this.applyStatus(e, op.s, op.n, src);
          break;
        case 'cleanse':
          for (const [s, v] of Object.entries(src.status) as [StatusId, number][]) if (isDebuff(s, v)) delete src.status[s];
          break;
        case 'suicide':
          if (!this.isPlayer(src)) this.kill(src as EnemyState);
          break;
      }
    }
  }

  /** Blockable damage. attacker is set for attacks, so Thorns can hit back. Returns HP lost. */
  damage(t: Fighter, amount: number, attacker: Fighter | null): number {
    if (this.gone(t)) return 0;
    const blocked = Math.min(t.block, amount);
    t.block -= blocked;
    let lost = amount - blocked;
    if (this.isPlayer(t) && lost > 0 && hasRelic(this.run, 'tungstenRod')) lost -= 1;
    lost = Math.min(lost, t.hp);
    t.hp -= lost;
    this.log.push({ t: 'dmg', who: this.who(t), n: lost, blocked });
    const thorns = t.status.thorns ?? 0;
    if (attacker && attacker !== t && thorns > 0 && !this.gone(attacker)) this.damage(attacker, thorns, null);
    if (t.hp <= 0) this.zero(t);
    return lost;
  }

  /** HP loss that ignores Block. */
  loseHp(f: Fighter, n: number): void {
    if (this.gone(f)) return;
    if (this.isPlayer(f) && hasRelic(this.run, 'tungstenRod')) n -= 1;
    n = Math.min(Math.max(0, n), f.hp);
    f.hp -= n;
    this.log.push({ t: 'dmg', who: this.who(f), n, blocked: 0 });
    if (f.hp <= 0) this.zero(f);
  }

  heal(f: Fighter, n: number): void {
    if (this.gone(f)) return;
    const gained = Math.min(n, f.maxHp - f.hp);
    if (gained <= 0) return;
    f.hp += gained;
    this.log.push({ t: 'heal', who: this.who(f), n: gained });
  }

  gainBlock(f: Fighter, n: number, raw = false): void {
    const amount = raw ? n : this.calcBlock(f, n);
    if (amount <= 0) return;
    f.block += amount;
    this.log.push({ t: 'block', who: this.who(f), n: amount });
  }

  applyStatus(t: Fighter, s: StatusId, n: number, src: Fighter): void {
    if (n === 0 || this.gone(t)) return;
    const art = t.status.artifact ?? 0;
    if (isDebuff(s, n) && art > 0) {
      if (art > 1) t.status.artifact = art - 1;
      else delete t.status.artifact;
      this.log.push({ t: 'negate', who: this.who(t) });
      return;
    }
    if (s === 'poison' && this.isPlayer(src) && !this.isPlayer(t) && hasRelic(this.run, 'sneckoSkull')) n += 1;
    const v = (t.status[s] ?? 0) + n;
    if (v === 0) delete t.status[s];
    else t.status[s] = v;
    this.log.push({ t: 'status', who: this.who(t), s, n });
  }

  private zero(f: Fighter): void {
    if (this.isPlayer(f)) {
      this.over = 'lose';
      this.run.hp = 0;
    } else this.kill(f as EnemyState);
  }

  private kill(e: EnemyState): void {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    e.block = 0;
    this.run.stats.kills++;
    this.log.push({ t: 'death', who: e.uid });
    if (e.def.onDeath) this.resolve(e.def.onDeath, e, this.player);
    this.checkWin();
  }
}
