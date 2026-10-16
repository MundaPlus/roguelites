import type { EnemyDef } from './enemies';
import { getEquip, usesOf, type Ctx, type EquipDef } from './equipment';
import type { Rng } from './rng';
import { D6, accepts, type Die, type OwnedEquip, type Status } from './types';

export type Side = 'player' | 'enemy';

export interface EquipInst {
  id: string;
  lvl: number;
  used: number;
  /** Total collected so far in a count slot. */
  fill: number;
  shocked: boolean;
}

export interface Fighter {
  side: Side;
  name: string;
  icon: string;
  hp: number;
  maxHp: number;
  shield: number;
  status: Record<Status, number>;
  dice: Die[];
  /** Faces of each die that this fighter rolls at the start of a turn. */
  faces: (readonly number[])[];
  equip: EquipInst[];
}

export type FxKind = 'dmg' | 'heal' | 'block' | 'status' | 'combo' | 'info';

/** A visual event for the UI: floating numbers, combo banners. */
export interface Fx {
  side: Side;
  kind: FxKind;
  text: string;
}

const BAD: readonly Status[] = ['poison', 'burn', 'freeze', 'shock', 'weak'];

const noStatus = (): Record<Status, number> => ({ poison: 0, burn: 0, freeze: 0, shock: 0, weak: 0 });

export function makeEquip(list: { id: string; lvl: number }[]): EquipInst[] {
  return list.map((e) => ({ id: e.id, lvl: e.lvl, used: 0, fill: 0, shocked: false }));
}

export function playerFighter(name: string, icon: string, hp: number, maxHp: number, dice: number[][], equipment: OwnedEquip[]): Fighter {
  return {
    side: 'player', name, icon, hp, maxHp, shield: 0, status: noStatus(), dice: [], faces: dice,
    equip: makeEquip(equipment.filter((e) => e.on)),
  };
}

export function enemyFighter(def: EnemyDef, hpScale = 1): Fighter {
  const hp = Math.round(def.hp * hpScale);
  return {
    side: 'enemy', name: def.name, icon: def.icon, hp, maxHp: hp, shield: 0, status: noStatus(), dice: [],
    faces: Array.from({ length: def.dice }, () => D6),
    equip: makeEquip(def.equip.map(([id, lvl]) => ({ id, lvl }))),
  };
}

export class Combat {
  turn: Side = 'player';
  round = 0;
  over: 'win' | 'lose' | null = null;
  fx: Fx[] = [];
  log: string[] = [];
  rerolls = 0;
  nudged = false;
  god = false;
  private uid = 1;
  private used: Record<Side, number[]> = { player: [], enemy: [] };
  private bestRun = 0;
  private focusBonus = 0;
  private secondWind = false;

  constructor(
    public player: Fighter,
    public enemy: Fighter,
    private perks: Set<string>,
    private rng: Rng,
  ) {}

  start(): void {
    this.startTurn(this.player);
    if (this.perks.has('iron-skin')) this.addShield(this.player, 6);
  }

  foe(f: Fighter): Fighter {
    return f === this.player ? this.enemy : this.player;
  }

  get focus(): number {
    return this.focusBonus;
  }

  // ---------- Turn flow ----------

  private startTurn(f: Fighter): void {
    this.turn = f.side;
    this.used[f.side] = [];
    if (f.side === 'player') {
      this.round++;
      this.bestRun = 0;
      this.focusBonus = 0;
      this.rerolls = this.perks.has('reroll') ? 2 : 0;
      this.nudged = false;
    }
    f.shield = 0;
    for (const e of f.equip) e.used = 0;

    if (f.status.poison > 0) {
      this.loseHp(f, f.status.poison, '☠️');
      f.status.poison--;
      this.checkEnd();
      if (this.over) return;
    }

    const extra = f.side === 'player' && this.round === 1 && this.perks.has('spare-die') ? 1 : 0;
    f.dice = f.faces.map((faces) => this.makeDie(faces));
    for (let i = 0; i < extra; i++) f.dice.push(this.makeDie(D6));
    if (f.side === 'player' && this.perks.has('lucky-charm')) {
      for (const d of f.dice) if (d.value === 1) d.value = 2;
    }

    let freeze = f.status.freeze;
    if (f.side === 'player' && this.perks.has('wool-cloak')) freeze = Math.min(freeze, 1);
    if (freeze > 0) {
      const sorted = [...f.dice].sort((a, b) => b.value - a.value);
      for (const d of sorted.slice(0, freeze)) {
        d.value = 1;
        d.wild = false;
      }
      this.info(f, `❄️ ${Math.min(freeze, f.dice.length)} frozen`);
    }
    f.status.freeze = 0;

    if (f.status.burn > 0) {
      for (const d of this.rng.shuffle([...f.dice]).slice(0, f.status.burn)) d.burning = true;
      this.info(f, '🔥 Dice on fire');
    }
    f.status.burn = 0;

    let shock = f.status.shock;
    if (f.side === 'player' && this.perks.has('rubber-boots')) shock = Math.min(shock, 1);
    if (shock > 0) {
      for (const e of this.rng.shuffle(f.equip.filter((e) => !e.shocked)).slice(0, shock)) e.shocked = true;
      this.info(f, '⚡ Shocked');
    }
    f.status.shock = 0;
  }

  endTurn(f: Fighter): void {
    if (this.over || this.turn !== f.side) return;
    if (f.status.weak > 0) f.status.weak--;
    f.dice = [];
    this.startTurn(this.foe(f));
    this.checkEnd();
  }

  private makeDie(faces: readonly number[], value?: number): Die {
    const v = value ?? this.rng.pick(faces);
    return { uid: this.uid++, value: v, faces, burning: false, wild: v === 0 };
  }

  // ---------- Player die actions ----------

  setWild(uid: number, v: number): void {
    const d = this.player.dice.find((x) => x.uid === uid);
    if (!d || !d.wild) return;
    d.value = Math.max(1, Math.min(6, v));
    d.wild = false;
  }

  reroll(uid: number): boolean {
    const d = this.player.dice.find((x) => x.uid === uid);
    if (!d || this.rerolls <= 0 || this.turn !== 'player' || this.over) return false;
    this.rerolls--;
    d.value = this.rng.pick(d.faces);
    d.wild = d.value === 0;
    if (this.perks.has('lucky-charm') && d.value === 1) d.value = 2;
    return true;
  }

  canNudge(uid: number): boolean {
    const d = this.player.dice.find((x) => x.uid === uid);
    return !!d && !d.wild && d.value < 6 && this.perks.has('loaded-die') && !this.nudged && this.turn === 'player' && !this.over;
  }

  nudge(uid: number): boolean {
    if (!this.canNudge(uid)) return false;
    const d = this.player.dice.find((x) => x.uid === uid)!;
    d.value++;
    this.nudged = true;
    return true;
  }

  // ---------- Placing dice ----------

  canPlace(f: Fighter, die: Die, ei: number): boolean {
    const e = f.equip[ei];
    if (!e || this.over || this.turn !== f.side || die.wild || die.value <= 0) return false;
    if (e.shocked) return true;
    const def = getEquip(e.id);
    if (e.used >= usesOf(def, e.lvl)) return false;
    return accepts(def.req(e.lvl), die.value);
  }

  place(f: Fighter, uid: number, ei: number): boolean {
    const die = f.dice.find((d) => d.uid === uid);
    if (!die || !this.canPlace(f, die, ei)) return false;
    const e = f.equip[ei];
    const def = getEquip(e.id);
    const x = die.value;
    f.dice = f.dice.filter((d) => d !== die);

    if (die.burning) this.loseHp(f, f.side === 'player' && this.perks.has('oven-mitt') ? 1 : 2, '🔥');
    if (this.checkEnd()) return true;

    if (e.shocked) {
      e.shocked = false;
      this.info(f, `${def.name} unshocked`);
      this.log.push(`${f.name} clears the shock on ${def.name}.`);
      return true;
    }

    const used = this.used[f.side];
    const same = used.filter((v) => v === x).length;
    used.push(x);

    const req = def.req(e.lvl);
    if (req.k === 'count') {
      const bonus = f.side === 'player' ? (this.perks.has('hourglass') ? 1 : 0) + (this.perks.has('tinker') ? 1 : 0) : 0;
      e.fill += x + bonus;
      if (e.fill >= req.n) {
        e.fill = 0;
        this.apply(f, def, e, x, same);
      } else {
        this.log.push(`${f.name} charges ${def.name} (${e.fill}/${req.n}).`);
      }
    } else {
      e.used++;
      this.apply(f, def, e, x, same);
    }

    if (f.side === 'player' && !this.over) {
      if (this.perks.has('ember-ring') && x === 6 && def.kind === 'attack') this.inflict(this.enemy, 'burn', 1);
      this.combos(x, same);
    }
    this.checkEnd();
    return true;
  }

  private apply(f: Fighter, def: EquipDef, e: EquipInst, x: number, same: number): void {
    const foe = this.foe(f);
    const rng = this.rng;
    const ctx: Ctx = {
      hit: (n, opts) => this.hit(f, foe, n, { pierce: opts?.pierce }),
      hurtSelf: (n) => this.loseHp(f, n),
      block: (n) => this.addShield(f, n),
      heal: (n) => this.heal(f, n),
      inflict: (s, n) => this.inflict(foe, s, n),
      cleanse: () => {
        for (const s of BAD) f.status[s] = 0;
        for (const d of f.dice) d.burning = false;
        for (const q of f.equip) q.shocked = false;
      },
      breakShield: () => {
        if (foe.shield > 0) this.info(foe, '🛡️ broken');
        foe.shield = 0;
      },
      addDice: (vals) => {
        for (const v of vals) if (v > 0) f.dice.push(this.makeDie(D6, Math.min(6, v)));
      },
      focus: (n) => {
        if (f.side === 'player') {
          this.focusBonus += n;
          this.info(f, `🎯 +${n} next hit`);
        }
      },
      get shield() {
        return f.shield;
      },
      sameBefore: same,
      roll: () => rng.int(1, 6),
    };
    this.log.push(`${f.name} uses ${def.name}${e.lvl > 0 && f.side === 'player' ? '+' : ''} (${x}).`);
    def.run(ctx, x, e.lvl);
  }

  /** Bonus damage from combos skips focus, whetstone and vampire fang. */
  private hit(src: Fighter, dst: Fighter, n: number, o: { pierce?: boolean; bonus?: boolean } = {}): number {
    if (src.side === 'player' && !o.bonus) {
      n += this.focusBonus;
      this.focusBonus = 0;
      if (this.perks.has('whetstone')) n += 1;
    }
    if (src.status.weak > 0) n = Math.floor(n / 2);
    let through = n;
    if (!o.pierce && dst.shield > 0) {
      const absorbed = Math.min(dst.shield, n);
      dst.shield -= absorbed;
      through -= absorbed;
      this.fx.push({ side: dst.side, kind: 'block', text: `-${absorbed}🛡️` });
    }
    this.loseHp(dst, through);
    if (src.side === 'player' && !o.bonus && n >= 8 && this.perks.has('vampire-fang')) this.heal(src, 2);
    return through;
  }

  private loseHp(f: Fighter, n: number, tag = ''): void {
    if (n <= 0) return;
    f.hp = Math.max(0, f.hp - n);
    if (this.god && f.side === 'player') f.hp = Math.max(1, f.hp);
    this.fx.push({ side: f.side, kind: 'dmg', text: `-${n}${tag}` });
    if (f.side === 'player' && this.perks.has('second-wind') && !this.secondWind && f.hp > 0 && f.hp < f.maxHp / 2) {
      this.secondWind = true;
      this.addShield(f, 8);
      this.info(f, 'Second Wind!');
    }
  }

  private heal(f: Fighter, n: number): void {
    const amt = Math.min(n, f.maxHp - f.hp);
    if (amt <= 0) return;
    f.hp += amt;
    this.fx.push({ side: f.side, kind: 'heal', text: `+${amt}` });
  }

  private addShield(f: Fighter, n: number): void {
    if (n <= 0) return;
    f.shield += n;
    this.fx.push({ side: f.side, kind: 'block', text: `+${n}🛡️` });
  }

  private inflict(f: Fighter, s: Status, n: number): void {
    if (n <= 0) return;
    f.status[s] += n;
    this.fx.push({ side: f.side, kind: 'status', text: `+${n} ${s}` });
  }

  private info(f: Fighter, text: string): void {
    this.fx.push({ side: f.side, kind: 'info', text });
  }

  private combos(x: number, same: number): void {
    const mult = this.perks.has('combo-book') ? 2 : 1;
    const named = ['', 'Pair', 'Triple', 'Four of a Kind', 'Five of a Kind'];
    const dmg = [0, 2, 5, 10, 16];
    if (same >= 1) {
      const k = Math.min(same, 4);
      this.fx.push({ side: 'player', kind: 'combo', text: `${named[k]}! +${dmg[k] * mult} dmg` });
      this.hit(this.player, this.enemy, dmg[k] * mult, { bonus: true });
    }
    const vals = [...new Set(this.used.player)].sort((a, b) => a - b);
    let best = 1;
    let cur = 1;
    for (let i = 1; i < vals.length; i++) {
      cur = vals[i] === vals[i - 1] + 1 ? cur + 1 : 1;
      best = Math.max(best, cur);
    }
    if (best >= 3 && best > this.bestRun && vals.includes(x)) {
      this.bestRun = best;
      const gain = ({ 3: 3, 4: 6, 5: 10, 6: 15 } as Record<number, number>)[best] * mult;
      this.fx.push({ side: 'player', kind: 'combo', text: `Straight ${best}! +${gain}🛡️` });
      this.addShield(this.player, gain);
    }
  }

  private checkEnd(): boolean {
    if (this.over) return true;
    if (this.enemy.hp <= 0) this.over = 'win';
    else if (this.player.hp <= 0) this.over = 'lose';
    return this.over !== null;
  }

  // ---------- AI (enemy turns and the debug autoplay) ----------

  /** Make one AI move for f. Returns the index of the equipment it used, or -1 when it has no move left. */
  aiStep(f: Fighter = this.enemy): number {
    if (this.over || this.turn !== f.side) return -1;
    for (const d of f.dice) if (d.wild) this.setWild(d.uid, 6);
    let best: { uid: number; ei: number; score: number } | null = null;
    for (const d of f.dice) {
      for (let ei = 0; ei < f.equip.length; ei++) {
        const e = f.equip[ei];
        if (!this.canPlace(f, d, ei)) continue;
        const def = getEquip(e.id);
        let score: number;
        if (e.shocked) score = 1 + (6 - d.value) * 0.1;
        else if (def.ai) score = def.ai(d.value);
        else if (def.req(e.lvl).k === 'count') score = 3 + d.value * 0.1;
        else if (def.kind === 'attack') score = 10 + d.value;
        else if (def.kind === 'defense') score = 7 + d.value;
        else score = 0;
        score += this.rng.next() * 3;
        if (!best || score > best.score) best = { uid: d.uid, ei, score };
      }
    }
    if (!best) return -1;
    const { uid, ei } = best;
    this.place(f, uid, ei);
    return ei;
  }
}
