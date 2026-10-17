/** Shot-picking bots. They search angle and power with the same integrator as the game. */
import type { ShotId } from './data';
import { sceneAt, simulate, type Scene, type ShotIn, type ShotMods } from './physics';
import { modsFor, type RunState } from './run';

export interface BotCfg {
  angles: number;
  powers: number;
  /** Aim error (std dev) in radians and in power units. */
  err: number;
  perr: number;
  /** Check neighbors of the best shots so a small error still hits. */
  robust: boolean;
  specials: boolean;
}

export const GOOD_BOT: BotCfg = { angles: 56, powers: 6, err: 0.012, perr: 0.015, robust: true, specials: true };
export const WEAK_BOT: BotCfg = { angles: 16, powers: 3, err: 0.05, perr: 0.06, robust: false, specials: false };

const BOT_STEPS = 1000;

function gauss(rnd: () => number): number {
  const u = Math.max(1e-9, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

function value(sc: Scene, shot: ShotIn, mods: ShotMods, req: Set<number>): number {
  const r = simulate(sc, shot, mods, BOT_STEPS, false);
  let v = 0;
  for (const [ti, d] of r.dmg) v += req.has(ti) ? 10 * d : 2;
  v += r.kills.length * 2 + r.banks * 1.5 + r.orbits * 3 + r.rocksBroken.length * 0.3 + r.shieldsBroken.length * 0.8;
  if (r.caught) v += 5;
  return v;
}

/** Pick a shot for the current system. `rnd` drives the aim error. */
export function chooseShot(run: RunState, cfg: BotCfg, rnd: () => number): ShotIn {
  const sys = run.sys!;
  const sc = sceneAt(sys, sys.turn);
  const mods = modsFor(run);
  const req = new Set(sys.targets.map((t, i) => (t.kind !== 'crate' && t.hp > 0 ? i : -1)).filter((i) => i >= 0));
  const left = sys.shots - sys.used;
  const types: ShotId[] = ['std'];
  if (cfg.specials) for (const t of ['split', 'heavy', 'phase', 'boomer', 'seeker'] as ShotId[]) if (run.ammo[t] > 0) types.push(t);
  const cands: { shot: ShotIn; v: number }[] = [];
  for (const type of types) {
    const na = type === 'std' ? cfg.angles : Math.ceil(cfg.angles / 2);
    const np = type === 'std' ? cfg.powers : Math.max(2, Math.ceil(cfg.powers / 2));
    // Specials cost something: use them when they do clearly better, or when shots run low.
    const cost = type === 'std' ? 0 : left <= 2 ? 1 : 6;
    for (let pi = 0; pi < np; pi++) {
      const power = 0.3 + (0.7 * pi) / Math.max(1, np - 1);
      for (let ai = 0; ai < na; ai++) {
        const angle = Math.PI + 0.06 + ((Math.PI - 0.12) * ai) / (na - 1);
        const shot = { angle, power, type };
        const v = value(sc, shot, mods, req) - cost;
        if (v > 0) cands.push({ shot, v });
      }
    }
  }
  let best: ShotIn = { angle: Math.PI * 1.5 + (rnd() - 0.5), power: 0.6 + rnd() * 0.4, type: 'std' };
  if (cands.length) {
    cands.sort((a, b) => b.v - a.v);
    if (cfg.robust) {
      let bs = -Infinity;
      for (const c of cands.slice(0, 10)) {
        // Refine around the candidate, then score with neighbors.
        let local = c.shot;
        let lv = c.v;
        for (const da of [-0.012, -0.006, 0.006, 0.012]) {
          const s2 = { ...c.shot, angle: c.shot.angle + da };
          const v2 = value(sc, s2, mods, req);
          if (v2 > lv) {
            lv = v2;
            local = s2;
          }
        }
        const e = cfg.err;
        const nb = [value(sc, { ...local, angle: local.angle - e }, mods, req), value(sc, { ...local, angle: local.angle + e }, mods, req)];
        const sc2 = lv * 2 + nb[0] + nb[1] - (local.type === 'std' ? 0 : left <= 2 ? 1 : 6) * 4;
        if (sc2 > bs) {
          bs = sc2;
          best = local;
        }
      }
    } else best = cands[0].shot;
  }
  return {
    angle: best.angle + gauss(rnd) * cfg.err,
    power: Math.max(0.2, Math.min(1, best.power + gauss(rnd) * cfg.perr)),
    type: best.type,
  };
}

/** A bot that ignores gravity: it aims in a straight line at a random target. */
export function naiveShot(run: RunState, rnd: () => number): ShotIn {
  const sys = run.sys!;
  const sc = sceneAt(sys, sys.turn);
  const ts = sc.targets.filter((t) => t.kind !== 'crate');
  const t = ts[Math.floor(rnd() * ts.length)] ?? sc.targets[0];
  const angle = t ? Math.atan2(t.y - sc.ly, t.x - sc.lx) : Math.PI * 1.5;
  return { angle: angle + gauss(rnd) * 0.04, power: 0.6 + rnd() * 0.4, type: 'std' };
}
