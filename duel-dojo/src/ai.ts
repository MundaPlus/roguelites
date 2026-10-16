/** AI fighter. It sees the other fighter with a delay (the reaction time) and plays a style. */
import { SPECIALS, SUPERS, type Level, type MoveDef, type Slot, type Style } from './data';
import { noInput, phase, type Fight, type Fighter, type Input, type Phase, type Proj } from './game';
import { Rng } from './rng';

export interface AiCfg {
  style: Style;
  /** Reaction time in frames. */
  react: number;
  /** Chance to block an attack it sees. */
  block: number;
  /** 0..1: how often it attacks instead of waiting. */
  aggro: number;
  antiAir: number;
  /** Chance to break a throw it sees. */
  tech: number;
  /** Chance of a random action per decision. */
  mistake: number;
  /** Chance to finish a combo after a hit. */
  combo: number;
}

/** What the AI remembers of the other fighter on one frame. */
interface Snap {
  frame: number;
  st: string;
  x: number;
  y: number;
  vx: number;
  move: MoveDef | null;
  ph: Phase;
  mf: number;
  start: number;
}

interface Cmd {
  f?: boolean;
  b?: boolean;
  u?: boolean;
  d?: boolean;
  a?: boolean;
  h?: boolean;
  s?: boolean;
  t?: boolean;
}

function reach(m: MoveDef, size: number): number {
  let r = (m.box[0] + m.box[2]) * size;
  if (m.dash) r += (m.dash.to - m.dash.from) * m.dash.vx * 0.8;
  if (m.jump) r += m.jump.vx * 20;
  return r;
}

export class Ai {
  private hist: Snap[] = [];
  private plan: Cmd[] = [];
  /** A soft plan (walk or guard) can be interrupted by a reaction. */
  private soft = true;
  private seen = new Set<string>();
  private projSeen = new WeakSet<Proj>();
  private rng: Rng;
  private boss: Style = 'rushdown';

  constructor(
    public cfg: AiCfg,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  input(fight: Fight, side: 0 | 1): Input {
    const me = fight.fs[side];
    const op = fight.fs[1 - side];
    this.hist.push({
      frame: fight.frame,
      st: op.st,
      x: op.x,
      y: op.y,
      vx: op.vx,
      move: op.move,
      ph: phase(op),
      mf: op.mf,
      start: fight.frame - op.mf,
    });
    if (this.hist.length > 60) this.hist.shift();
    if (fight.over || fight.freeze > 0) return this.out(me, {});
    if (fight.hitstop > 0) return this.out(me, this.plan[0] ?? {});
    const P = this.hist[Math.max(0, this.hist.length - 1 - this.cfg.react)];
    const dist = Math.abs(me.x - op.x);

    // Grabbed: try to break the throw.
    if (me.st === 'thrown') {
      const key = `th${fight.frame - me.t}`;
      if (!this.seen.has(key)) {
        this.seen.add(key);
        this.plan = this.rng.chance(this.cfg.tech) ? [...this.rep({}, Math.min(this.cfg.react, 6)), { t: true }, {}] : [];
        this.soft = false;
      }
      return this.next(me);
    }
    // Hurt or knocked down: drop the plan.
    if (me.st === 'hit' || me.st === 'fall' || me.st === 'down' || me.st === 'ko') {
      this.plan = [];
      this.soft = true;
      return this.out(me, {});
    }
    // Keep blocking while in blockstun.
    if (me.st === 'block' && !this.plan.length) return this.out(me, { b: true, d: me.crouchBlock });

    // Hit confirm into a combo.
    if (me.st === 'move' && me.move && me.contact > 0 && me.move.tier < 3) {
      const key = `c${fight.frame - me.mf}`;
      if (!this.seen.has(key)) {
        this.seen.add(key);
        if (op.st === 'hit' && this.rng.chance(this.cfg.combo)) this.comboFollow(me, dist);
        else if (op.st === 'block' && this.rng.chance(this.cfg.aggro * 0.35)) this.comboFollow(me, dist);
      }
    }

    if (!this.plan.length || this.soft) {
      if (this.react(fight, me, op, P, dist)) return this.next(me);
    }
    if (this.plan.length) return this.next(me);
    if (me.st !== 'idle' && me.st !== 'walk' && me.st !== 'crouch') return this.out(me, me.st === 'air' ? {} : { b: true });
    this.neutral(fight, me, op, dist);
    return this.next(me);
  }

  // ---------- Reactions ----------

  private react(fight: Fight, me: Fighter, op: Fighter, P: Snap, dist: number): boolean {
    const free = me.st === 'idle' || me.st === 'walk' || me.st === 'crouch';
    // Incoming attack.
    if (P.move && (P.ph === 'startup' || P.ph === 'active') && !P.move.proj) {
      const key = `t${P.start}`;
      if (!this.seen.has(key) && dist < reach(P.move, op.def.size) + 34) {
        this.seen.add(key);
        if (P.move.level === 'throw') {
          if (this.rng.chance(this.cfg.tech) && !P.move.noTech) return this.set([{ t: true }, {}], false);
          if (free && this.rng.chance(this.cfg.block * 0.4)) return this.set(this.rep({ u: true, b: true }, 3), false);
        } else if (free && this.rng.chance(this.cfg.block)) {
          const left = P.move.startup + P.move.active + 10 - P.mf;
          return this.set(this.guard(P.move.level, Math.max(8, left)), true);
        } else if (free && this.cfg.style === 'counter' && me.specials.b === 'parry' && this.rng.chance(0.25)) {
          return this.set([{ b: true, s: true }, {}], false);
        }
      }
    }
    // Projectiles.
    for (const p of fight.projs) {
      if (p.owner === me.side || p.age < this.cfg.react || this.projSeen.has(p)) continue;
      const dx = me.x - p.x;
      if (Math.sign(dx) !== Math.sign(p.vx) || Math.abs(dx) > 170) continue;
      this.projSeen.add(p);
      if (!free) continue;
      const roll = this.rng.next();
      if (roll < this.cfg.block) {
        if ((this.cfg.style === 'rushdown' || this.cfg.style === 'boss') && Math.abs(dx) > 110 && this.rng.chance(0.35) && p.def.kind !== 'beam') {
          return this.set([...this.rep({ u: true, f: true }, 3), ...this.rep({}, 14), { h: true }, ...this.rep({}, 6)], false);
        }
        return this.set(this.guard(p.def.level, Math.ceil(Math.abs(dx) / Math.abs(p.vx)) + 10 + p.def.hits * 7), true);
      }
      return false;
    }
    // Anti-air.
    if (P.y > 15 && P.st === 'air' && dist < 120 && free) {
      const key = `j${P.start}${Math.round(P.x)}`;
      const jk = `aa${Math.floor(P.frame / 40)}`;
      if (!this.seen.has(jk) && !this.seen.has(key)) {
        this.seen.add(jk);
        this.seen.add(key);
        if (this.rng.chance(this.cfg.antiAir)) {
          if (me.specials.d === 'uppercut') return this.set([{ d: true }, { d: true, s: true }, {}], false);
          return this.set([{ h: true }, {}], false);
        }
        if (this.rng.chance(this.cfg.block)) return this.set(this.guard('high', 20), true);
      }
    }
    // Punish a move in recovery.
    if (P.move && P.ph === 'recovery' && free) {
      const left = P.move.startup + P.move.active + P.move.recovery - P.mf - this.cfg.react / 2;
      const key = `p${P.start}`;
      if (!this.seen.has(key) && left >= 6) {
        this.seen.add(key);
        if (this.rng.chance(this.cfg.block * 1.1)) {
          if (dist < 72) return this.set(this.strike('H'), false);
          if (dist < 150 && me.specials.f && ['dashpunch', 'palm'].includes(me.specials.f)) return this.set([{ f: true }, { f: true, s: true }, {}], false);
          if (dist < 100) return this.set(this.strike('cH'), false);
        }
      }
    }
    return false;
  }

  private comboFollow(me: Fighter, dist: number): void {
    const m = me.move!;
    if (me.meter >= 100 && this.rng.chance(0.6) && this.superFits(me, dist)) {
      this.set([{ s: true, h: true }, {}], false);
      return;
    }
    if (m.tier === 1 && me.chain < 1 && dist < 60 && this.rng.chance(0.5)) {
      this.set([{ a: true, d: m.id === 'cL' }, {}], false);
      return;
    }
    if (m.tier === 1 && dist < 70) {
      this.set([{ h: true }, {}], false);
      return;
    }
    const slot = this.bestComboSlot(me, dist);
    if (slot) this.set(this.special(slot), false);
  }

  private superFits(me: Fighter, dist: number): boolean {
    const sup = SUPERS[me.def.super];
    if (sup.proj) return true;
    return dist < reach(sup, me.def.size) + 10;
  }

  private bestComboSlot(me: Fighter, dist: number): Slot | null {
    const order: Slot[] = ['d', 'f', 'b', 'n'];
    for (const s of order) {
      const id = me.specials[s];
      if (!id) continue;
      const m = SPECIALS[id];
      if (m.parry || m.level === 'throw') continue;
      if (m.proj && dist > 90) continue;
      if (!m.proj && reach(m, me.def.size) < dist) continue;
      if (id === 'flipkick') continue;
      return s;
    }
    return null;
  }

  // ---------- Neutral ----------

  private neutral(fight: Fight, me: Fighter, op: Fighter, dist: number): void {
    const r = this.rng;
    if (r.chance(this.cfg.mistake)) {
      const opts: Cmd[][] = [this.strike('H'), this.strike('cH'), this.rep({ u: true, f: true }, 3), this.strike('L'), this.special(r.pick(['n', 'f', 'b', 'd'] as Slot[]))];
      this.set(r.pick(opts), false);
      return;
    }
    let style = this.cfg.style;
    if (style === 'boss') {
      if (r.chance(0.06)) this.boss = r.weighted([['rushdown', 4], ['zoner', 2], ['grappler', 2], ['counter', 2]] as const);
      style = this.boss;
    }
    const opDown = op.st === 'down' || op.st === 'fall';
    if (me.meter >= 100 && this.superFits(me, dist) && r.chance(0.04 + this.cfg.aggro * 0.04) && !opDown && op.y <= 0) {
      this.set([{ s: true, h: true }, {}], false);
      return;
    }
    const ownProj = fight.projs.some((p) => p.owner === me.side);
    const projSlot = (['n', 'd'] as Slot[]).find((s) => me.specials[s] && SPECIALS[me.specials[s]!].proj);
    const has = (id: string): Slot | undefined => (Object.keys(me.specials) as Slot[]).find((s) => me.specials[s] === id);
    const ag = this.cfg.aggro;
    if (opDown) {
      if (style === 'zoner') this.set(this.rep({ b: true }, 8), true);
      else this.set(this.rep({ f: true }, 8), true);
      return;
    }
    const W: [Cmd[], number][] = [];
    const add = (c: Cmd[], w: number): void => {
      if (w > 0) W.push([c, w]);
    };
    const walkF = this.rep({ f: true }, 10);
    const walkB = this.rep({ b: true }, 10);
    const guard = this.guard(r.chance(0.5) ? 'low' : 'high', 12);
    const jumpIn = [...this.rep({ u: true, f: true }, 3), ...this.rep({}, 13), { h: true }, ...this.rep({}, 10)];
    const string = [...this.strike('L'), ...this.rep({}, 3), ...this.strike('L'), ...this.rep({}, 3), ...this.strike('H')];
    const lowString = [...this.strike('cL'), ...this.rep({ d: true }, 3), ...this.strike('cL')];
    const fireball = projSlot && !ownProj ? this.special(projSlot) : null;
    switch (style) {
      case 'rushdown':
        if (dist > 200) {
          add(walkF, 6);
          add(jumpIn, 1);
          if (has('dashpunch') && dist < 240) add(this.special(has('dashpunch')!), 1);
          if (fireball) add(fireball, 1);
        } else if (dist > 85) {
          add(walkF, 6);
          add(jumpIn, 1.5);
          if (dist < 110) add(this.strike('H'), 1.5);
          if (has('dashpunch')) add(this.special(has('dashpunch')!), 1.2);
          if (has('slide') && dist < 160) add(this.special(has('slide')!), 0.8);
          add(guard, 1.5 * (1 - ag));
        } else {
          add(string, 3 * ag);
          add(lowString, 1.5 * ag);
          add(this.strike('T'), 1.5);
          add(this.strike('cH'), 0.8);
          if (has('flipkick')) add(this.special(has('flipkick')!), 1);
          add(this.strike('H'), 1);
          add(guard, 2.5 * (1 - ag));
          add(walkB, 0.5);
        }
        break;
      case 'zoner':
        if (dist > 150) {
          if (fireball) add(fireball, 5);
          add(this.rep({ b: true }, 8), 1);
          add(guard, 1.5);
          if (dist > 300) add(walkF, 1.5);
        } else if (dist > 90) {
          if (fireball) add(fireball, 2);
          add(this.strike('H'), 2);
          add(walkB, 2.5);
          add(this.rep({ u: true, b: true }, 3), 0.8);
          add(guard, 2);
        } else {
          add(this.strike('L'), 2);
          add(this.strike('cL'), 1);
          add(this.strike('H'), 1.5);
          if (has('palm')) add(this.special(has('palm')!), 1);
          add(this.rep({ u: true, b: true }, 3), 1.2);
          add(walkB, 1.5);
          add(guard, 2);
        }
        break;
      case 'grappler':
        if (dist > 75) {
          add(this.rep({ f: true }, 12), 6);
          add(guard, 2);
          if (projSlot && fireball && dist > 200) add(fireball, 1);
          if (has('lariat') && dist < 130) add(this.special(has('lariat')!), 0.6);
          add(jumpIn, 0.5);
        } else {
          add(this.strike('T'), 3);
          if (has('grab')) add(this.special(has('grab')!), 3);
          add(this.strike('cL'), 1.2);
          add(this.strike('H'), 1);
          if (has('lariat')) add(this.special(has('lariat')!), 0.8);
          add(guard, 2 * (1 - ag));
        }
        break;
      case 'counter':
        add(this.guard(r.chance(0.5) ? 'low' : 'high', 16), 6);
        if (dist > 220) add(walkF, 3);
        if (dist > 180 && fireball) add(fireball, 1.5);
        if (dist > 70 && dist < 125) add(this.strike('H'), 1.5 * ag + 0.5);
        if (dist < 80) {
          add(this.strike('T'), 0.8);
          add(this.strike('cL'), 1);
        }
        if (has('parry') && dist < 110) add(this.special(has('parry')!), 0.7);
        break;
      default:
        // balanced
        if (dist > 220) {
          add(walkF, 4);
          if (fireball) add(fireball, 2);
          add(jumpIn, 0.6);
        } else if (dist > 90) {
          add(walkF, 4);
          if (fireball) add(fireball, 1.5);
          if (dist < 115) add(this.strike('H'), 1.5);
          add(jumpIn, 1);
          add(guard, 2 * (1 - ag));
          if (has('dashpunch')) add(this.special(has('dashpunch')!), 0.8);
        } else {
          add(string, 2.5 * ag);
          add(lowString, 1.2 * ag);
          add(this.strike('T'), 1.4);
          add(this.strike('cH'), 0.7);
          add(guard, 2.5 * (1 - ag));
          add(walkB, 0.6);
          if (has('flipkick')) add(this.special(has('flipkick')!), 0.6);
          if (has('grab')) add(this.special(has('grab')!), 1);
        }
    }
    // Hold a guard near the opponent. Better fighters guard more.
    if (dist < 130 && style !== 'counter') add(guard, 5 * this.cfg.block * (1.25 - ag));
    if (!W.length) {
      this.set(guard, true);
      return;
    }
    const pick = r.weighted(W);
    const soft = pick === walkF || pick === walkB || pick === guard || pick.every((c) => !c.a && !c.h && !c.s && !c.t);
    this.set(pick, soft);
  }

  // ---------- Plan helpers ----------

  private set(plan: Cmd[], soft: boolean): boolean {
    this.plan = plan.slice();
    this.soft = soft;
    return true;
  }

  private rep(c: Cmd, n: number): Cmd[] {
    return Array.from({ length: n }, () => ({ ...c }));
  }

  private guard(level: Level, n: number): Cmd[] {
    const low = level === 'low' || (level === 'mid' && this.rng.chance(0.5));
    return this.rep({ b: true, d: level !== 'high' && low }, n);
  }

  private strike(id: 'L' | 'H' | 'cL' | 'cH' | 'T'): Cmd[] {
    switch (id) {
      case 'L':
        return [{ a: true }, {}];
      case 'H':
        return [{ h: true }, {}];
      case 'cL':
        return [{ d: true, a: true }, { d: true }];
      case 'cH':
        return [{ d: true, h: true }, { d: true }];
      case 'T':
        return [{ t: true }, {}];
    }
  }

  private special(slot: Slot): Cmd[] {
    const dir: Cmd = slot === 'f' ? { f: true } : slot === 'b' ? { b: true } : slot === 'd' ? { d: true } : {};
    return [{ ...dir }, { ...dir, s: true }, {}];
  }

  private next(me: Fighter): Input {
    const c = this.plan.shift() ?? {};
    if (!this.plan.length) this.soft = true;
    return this.out(me, c);
  }

  private out(me: Fighter, c: Cmd): Input {
    const i = noInput();
    const fwdRight = me.face > 0;
    if (c.f) fwdRight ? (i.r = true) : (i.l = true);
    if (c.b) fwdRight ? (i.l = true) : (i.r = true);
    i.u = !!c.u;
    i.d = !!c.d;
    i.a = !!c.a;
    i.b = !!c.h;
    i.s = !!c.s;
    i.t = !!c.t;
    return i;
  }
}

/** Settings for the bot that plays for the player in `?debug` and in the sim. */
export const BOT_GOOD: Omit<AiCfg, 'style'> = { react: 10, block: 0.8, aggro: 0.55, antiAir: 0.8, tech: 0.6, mistake: 0.02, combo: 0.9 };
export const BOT_WEAK: Omit<AiCfg, 'style'> = { react: 32, block: 0.15, aggro: 0.5, antiAir: 0.1, tech: 0.05, mistake: 0.3, combo: 0.15 };
