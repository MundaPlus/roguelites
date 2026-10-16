/** Simulated typist for the debug API and the balance sim. */
import { NOVA_R, PX, PY, backspace, eta, isBoss, isDecoy, isMissile, laneOf, spellCost, typeKey, type Battle, type Enemy } from './battle';
import { SPELLS } from './data';
import { Rng } from './rng';

export interface BotCfg {
  /** Characters per second. */
  cps: number;
  /** Chance of a wrong key per press. */
  err: number;
  /** Seconds of thinking before a new word. */
  react: number;
  smart: boolean;
}

export const WEAK_BOT: BotCfg = { cps: 3, err: 0.07, react: 0.45, smart: false };
export const GOOD_BOT: BotCfg = { cps: 4.6, err: 0.04, react: 0.3, smart: true };

const knows = (b: Battle, id: string): boolean => b.cfg.spells.includes(id);
const can = (b: Battle, id: string, extra = 0): boolean => knows(b, id) && b.mana >= spellCost(b, id) + extra;

export class Typist {
  private plan = '';
  private acc = 0;

  constructor(
    public cfg: BotCfg,
    private rng: Rng,
  ) {}

  tick(b: Battle, dt: number): void {
    this.acc += dt;
    const per = 1 / this.cfg.cps;
    while (this.acc >= per && !b.over) {
      this.acc -= per;
      this.press(b);
    }
  }

  private valid(b: Battle): boolean {
    if (!this.plan || !this.plan.startsWith(b.buf) || this.plan === b.buf) return false;
    if (SPELLS[this.plan]) return true;
    return b.enemies.some((e) => !e.dead && e.word === this.plan);
  }

  private press(b: Battle): void {
    if (!this.valid(b)) {
      this.plan = this.choose(b);
      if (!this.plan) return;
      this.acc -= this.cfg.react;
      if (!this.plan.startsWith(b.buf)) {
        this.acc -= b.buf.length * 0.08;
        while (b.buf) backspace(b);
      }
      return;
    }
    const ch = this.plan[b.buf.length];
    if (this.rng.chance(this.cfg.err)) {
      const abc = 'abcdefghijklmnopqrstuvwxyz';
      let w = this.rng.pick(abc.split(''));
      if (w === ch) w = w === 'z' ? 'q' : 'z';
      typeKey(b, w);
      return;
    }
    const r = typeKey(b, ch);
    if (r === 'word' || r === 'spell') this.plan = '';
  }

  private choose(b: Battle): string {
    const foes = b.enemies.filter((e) => !e.dead && !isDecoy(e));
    if (!foes.length) return '';
    foes.sort((p, q) => eta(p) - eta(q));
    if (!this.cfg.smart) {
      // A weak typist goes for the closest enemy and sometimes for a random one.
      return (this.rng.chance(0.25) ? this.rng.pick(foes) : foes[0]).word;
    }
    return this.smartPick(b, foes);
  }

  private smartPick(b: Battle, foes: Enemy[]): string {
    const near = foes.filter((e) => !isBoss(e) && Math.hypot(e.x - PX, e.y - PY) < NOVA_R * (b.cfg.runes.includes('widenova') ? 1.4 : 0.9));
    const first = foes[0];
    const danger = eta(first);
    if (b.hp <= b.maxHp - 3 && danger > 4 && can(b, 'mend', 10)) return 'mend';
    if (near.length >= 3 && can(b, 'nova')) {
      if (!b.elem && can(b, 'fire', spellCost(b, 'nova'))) return 'fire';
      return 'nova';
    }
    if (danger < 2.5 && !isMissile(first) && first.hp + first.shield * 15 > 25 && can(b, 'wall') && !b.walls.some((w) => w.lane === laneOf(first.x))) return 'wall';
    const boss = foes.find(isBoss);
    const target = boss && (danger > 6 || b.buf.length > 0) ? boss : first;
    if (!b.elem && !b.shape && b.mana > 55) {
      if (foes.length >= 3 && can(b, 'volt')) return 'volt';
      if (knows(b, 'lance') && foes.filter((e) => Math.abs(e.x - target.x) < 46).length >= 3 && can(b, 'lance')) return 'lance';
      if (danger < 5 && !isBoss(target) && can(b, 'frost')) return 'frost';
      if ((target.hp > 14 || isBoss(target)) && can(b, 'fire')) return 'fire';
    }
    return target.word;
  }
}
