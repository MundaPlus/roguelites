/** Bots for tests and the balance sim: battle commands and run choices. */
import { CLASSES, GEAR, ITEMS, SKILLS, STAT_KEYS, type ActionDef, type GearDef, type Stats } from './data';
import { alive, canUse, enemies, estimate, healAmount, heroes, targetsFor, unit, type Battle, type Command, type Unit } from './battle';
import { gearOf, heroStats, learn, learnBlock, type Hero } from './party';
import { MAX_PARTY, buy, equip, optionOk, eventDef, recruit, recruitCost, rest, restCost, type RunState } from './run';
import type { Rng } from './rng';

const rnd = (r: Rng | null, n: number): number => (r ? r.int(0, n - 1) : Math.floor(Math.random() * n));

// ---------- Battle ----------

/** A weak player: mostly attacks a random enemy, sometimes a random skill. */
export function weakCommand(b: Battle, uid: number, r: Rng | null = null): Command {
  const u = unit(b, uid)!;
  const foes = enemies(b).filter(alive);
  const roll = r ? r.next() : Math.random();
  if (roll < 0.2) {
    const usable = u.skills.filter((s) => canUse(b, u, { kind: 'skill', id: s, target: null }));
    if (usable.length) {
      const id = usable[rnd(r, usable.length)];
      const pool = targetsFor(b, u, SKILLS[id]);
      return { kind: 'skill', id, target: pool.length ? pool[rnd(r, pool.length)].uid : null };
    }
  }
  if (roll > 0.93) return { kind: 'defend' };
  const low = heroes(b).filter((h) => alive(h) && h.hp < h.maxHp * 0.3);
  if (low.length && (b.items.potion ?? 0) > 0 && roll < 0.5) return { kind: 'item', id: 'potion', target: low[0].uid };
  return { kind: 'attack', target: foes[rnd(r, foes.length)].uid };
}

function bestSingle(b: Battle, u: Unit, a: ActionDef): { score: number; target: Unit | null } {
  let best: Unit | null = null;
  let bs = -Infinity;
  for (const t of enemies(b).filter(alive)) {
    const d = estimate(b, u, a, t);
    if (d <= 0) continue;
    let s = Math.min(d, t.hp);
    if (d >= t.hp) s += t.maxHp * 0.25 + 20; // a kill removes its next turns
    if (t.rank === 'boss') s *= 1.05;
    if (s > bs) {
      bs = s;
      best = t;
    }
  }
  return { score: bs, target: best };
}

function groupScore(b: Battle, u: Unit, a: ActionDef, pool: Unit[]): number {
  let s = 0;
  for (const t of pool) {
    const d = estimate(b, u, a, t);
    if (d < 0) s += d;
    else s += Math.min(d, t.hp) + (d >= t.hp ? t.maxHp * 0.25 + 20 : 0);
  }
  return s;
}

/** A careful player: revives, heals, buffs in big fights, and picks the best damage per MP. */
export function smartCommand(b: Battle, uid: number): Command {
  const u = unit(b, uid)!;
  const allies = heroes(b);
  const living = allies.filter(alive);
  const dead = allies.filter((h) => !alive(h));
  const has = (id: string): boolean => u.skills.includes(id) && u.mp >= (SKILLS[id].mp ?? 0);
  const item = (id: string): boolean => (b.items[id] ?? 0) > 0;
  const bigFight = enemies(b).some((e) => e.rank);

  // 1. Revive
  if (dead.length) {
    if (dead.length >= 2 && has('phoenix')) return { kind: 'skill', id: 'phoenix', target: null };
    if (has('raise')) return { kind: 'skill', id: 'raise', target: dead[0].uid };
    if (item('phoenix_down') && (living.length <= 2 || bigFight)) return { kind: 'item', id: 'phoenix_down', target: dead[0].uid };
  }
  // 2. Heal
  const pct = (h: Unit): number => h.hp / h.maxHp;
  const lowest = living.reduce((a, h) => (pct(h) < pct(a) ? h : a), living[0]);
  const hurt = living.filter((h) => pct(h) < 0.6).length;
  if (hurt >= 2 || (hurt >= 1 && living.length === 1)) {
    for (const id of ['cura', 'hymn']) if (has(id)) return { kind: 'skill', id, target: null };
  }
  if (pct(lowest) < 0.45) {
    if (has('cure') && healAmount(u, SKILLS.cure, lowest) > lowest.maxHp * 0.2) return { kind: 'skill', id: 'cure', target: lowest.uid };
    for (const id of ['cura', 'hymn']) if (has(id)) return { kind: 'skill', id, target: null };
    if (pct(lowest) < 0.3) {
      const miss = lowest.maxHp - lowest.hp;
      if (item('hipotion') && miss > 160) return { kind: 'item', id: 'hipotion', target: lowest.uid };
      if (item('potion')) return { kind: 'item', id: 'potion', target: lowest.uid };
      if (item('hipotion')) return { kind: 'item', id: 'hipotion', target: lowest.uid };
      if (item('elixir') && bigFight) return { kind: 'item', id: 'elixir', target: lowest.uid };
    }
  }
  // 3. Cure sleep
  const asleep = living.find((h) => h.st.sleep);
  if (asleep) {
    if (has('esuna')) return { kind: 'skill', id: 'esuna', target: asleep.uid };
    if (item('remedy') && living.length <= 2) return { kind: 'item', id: 'remedy', target: asleep.uid };
  }
  // 4. Buffs in big fights
  if (bigFight) {
    const noHaste = living.filter((h) => !h.st.haste && h.uid !== u.uid);
    if (has('encore') && living.filter((h) => h.uid !== u.uid && h.atb < 40).length >= 2) return { kind: 'skill', id: 'encore', target: null };
    for (const id of ['haste', 'swift_song']) if (has(id) && noHaste.length) return { kind: 'skill', id, target: noHaste[0].uid };
    const noProt = living.filter((h) => !h.st.protect).length;
    for (const id of ['shield_wall', 'ruby_fox']) if (has(id) && noProt >= 3) return { kind: 'skill', id, target: null };
    if (has('protect') && pct(lowest) < 0.8 && !lowest.st.protect && lowest.row === 'front') return { kind: 'skill', id: 'protect', target: lowest.uid };
    const boss = enemies(b).find((e) => alive(e) && e.rank === 'boss' && !e.st.slow);
    if (boss && has('slow_dart')) return { kind: 'skill', id: 'slow_dart', target: boss.uid };
  } else if (has('lullaby') && enemies(b).filter(alive).length >= 3) return { kind: 'skill', id: 'lullaby', target: null };
  // 5. Damage per MP
  const foeHp = enemies(b).filter(alive).reduce((a, e) => a + e.hp, 0);
  const mpWeight = bigFight ? 0.2 : foeHp < 200 ? 3 : 1;
  const att = bestSingle(b, u, SKILLS.attack);
  let best: Command = { kind: 'attack', target: att.target?.uid ?? enemies(b).filter(alive)[0].uid };
  let bs = att.score;
  for (const id of u.skills) {
    const s = SKILLS[id];
    if (!has(id) || !['phys', 'mag'].includes(s.kind)) continue;
    let sc = -Infinity;
    let target: number | null = null;
    if (s.target === 'enemy') {
      const r = bestSingle(b, u, s);
      sc = r.score;
      target = r.target?.uid ?? null;
      if (s.self) sc *= 1.6;
    } else if (s.target === 'enemies') sc = groupScore(b, u, s, enemies(b).filter(alive));
    else if (s.target === 'random') sc = groupScore(b, u, s, enemies(b).filter(alive)) * ((s.hits ?? 1) / Math.max(1, enemies(b).filter(alive).length)) * 0.8;
    else if (s.target === 'row') {
      for (const row of ['front', 'back'] as const) {
        const pool = enemies(b).filter((e) => alive(e) && e.row === row);
        if (!pool.length) continue;
        const v = groupScore(b, u, s, pool);
        if (v > sc) {
          sc = v;
          target = pool[0].uid;
        }
      }
    }
    if (target === null && s.target !== 'enemies' && s.target !== 'random') continue;
    sc -= (s.mp ?? 0) * mpWeight;
    if (sc > bs) {
      bs = sc;
      best = { kind: 'skill', id, target };
    }
  }
  // Steal from a boss when there is nothing better.
  if (best.kind === 'attack' && has('mug') && att.target) return { kind: 'skill', id: 'mug', target: att.target.uid };
  // Ether for a dry caster.
  if (u.maxMp >= 40 && u.mp < 12 && item('ether') && bigFight) return { kind: 'item', id: 'ether', target: u.uid };
  return best;
}

// ---------- Run ----------

const WEIGHTS: Record<string, Partial<Record<keyof Stats, number>>> = {
  phys: { atk: 2, def: 1, hp: 0.15, spd: 2, mag: 0.2, res: 0.6, mp: 0.05 },
  cast: { mag: 2, mp: 0.3, res: 1, def: 0.6, hp: 0.15, spd: 1.5, atk: 0.1 },
  sup: { mag: 1.5, res: 1, mp: 0.3, spd: 2, def: 0.7, hp: 0.15, atk: 0.3 },
};
const ROLE: Record<string, string> = { knight: 'phys', thief: 'phys', mage: 'cast', summoner: 'cast', healer: 'sup', bard: 'sup' };

export function gearScore(cls: string, g: GearDef): number {
  const w = WEIGHTS[ROLE[cls] ?? 'phys'];
  let s = 0;
  for (const k of STAT_KEYS) s += (g.stats[k] ?? 0) * (w[k] ?? 0);
  s += Object.keys(g.resist ?? {}).length * 3 + (g.immune?.length ?? 0) * 4;
  if (g.perk === 'quick') s += 6;
  if (g.perk === 'gold') s += 3;
  if (g.perk === 'ranged' && ROLE[cls] === 'phys') s += 6;
  if (g.elem && ROLE[cls] === 'phys') s += 2;
  return s;
}

/** Equips the best gear from the bag on every hero. */
export function autoEquip(run: RunState): void {
  for (let pass = 0; pass < 2; pass++) {
    run.heroes.forEach((h, hi) => {
      for (const slot of ['weapon', 'armor', 'acc'] as const) {
        const cur = h.gear[slot] ? gearScore(h.cls, GEAR[h.gear[slot]!]) : 0;
        let bi = -1;
        let bs = cur;
        run.bag.forEach((g, i) => {
          const d = GEAR[g];
          if (d.slot !== slot) return;
          const s = gearScore(h.cls, d);
          if (s > bs + 0.5) {
            bs = s;
            bi = i;
          }
        });
        if (bi >= 0) equip(run, hi, bi);
      }
    });
  }
}

const PRIORITY: Record<string, string[]> = {
  knight: ['holy_blade', 'sweep', 'fortify', 'shield_wall', 'valor', 'lionheart'],
  mage: ['blizzard', 'thunder', 'fira', 'sleep', 'tempest', 'flare'],
  thief: ['quick_hit', 'poison_edge', 'flurry', 'slow_dart', 'mug', 'assassinate'],
  healer: ['protect', 'esuna', 'cura', 'banish', 'raise', 'haste'],
  bard: ['dirge', 'lullaby', 'hymn', 'shrill', 'encore', 'requiem'],
  summoner: ['frost_wyrm', 'storm_roc', 'sun_lion', 'ruby_fox', 'phoenix', 'night_dragon'],
};

export function autoLearn(h: Hero, random = false): void {
  let guard = 0;
  while (h.points > 0 && guard++ < 10) {
    const opts = CLASSES[h.cls].tree.flat().filter((s) => !learnBlock(h, s));
    if (!opts.length) return;
    const pick = random ? opts[Math.floor(Math.random() * opts.length)] : (PRIORITY[h.cls].find((s) => opts.includes(s)) ?? opts[0]);
    learn(h, pick);
  }
}

const hpFrac = (run: RunState): number => {
  let a = 0;
  let m = 0;
  for (const h of run.heroes) {
    a += h.hp;
    m += heroStats(h).hp;
  }
  return a / Math.max(1, m);
};

/** Picks a door index. */
export function chooseDoor(run: RunState, smart: boolean): number {
  const d = run.doors;
  if (!smart) return Math.floor(Math.random() * d.length);
  const frac = hpFrac(run);
  const dead = run.heroes.some((h) => h.hp <= 0);
  const score = (k: string): number => {
    switch (k) {
      case 'boss':
        return 100;
      case 'inn':
        return (frac < 0.65 || dead ? 60 : 10) + (run.heroes.length < MAX_PARTY && run.gold >= recruitCost(run) ? 40 : 0);
      case 'shop':
        return run.gold >= 150 ? 30 : 5;
      case 'treasure':
        return 35;
      case 'elite':
        return frac > 0.75 && !dead ? 32 : 0;
      case 'battle':
        return frac > 0.45 ? 25 : 8;
      case 'event':
        return 20;
    }
    return 0;
  };
  let bi = 0;
  d.forEach((r, i) => {
    if (score(r.kind) > score(d[bi].kind)) bi = i;
  });
  return bi;
}

export function shopBot(run: RunState, smart: boolean): void {
  if (!run.shop) return;
  if (!smart) {
    for (let k = 0; k < 3; k++) buy(run, Math.floor(Math.random() * run.shop.length));
    return;
  }
  const want: Record<string, number> = { phoenix_down: 2, potion: 4, hipotion: 3, ether: 2, remedy: 1 };
  // Gear upgrades first.
  run.shop.forEach((s, i) => {
    if (s.kind !== 'gear' || s.sold) return;
    const g = GEAR[s.id];
    const gain = Math.max(...run.heroes.map((h) => gearScore(h.cls, g) - (h.gear[g.slot] ? gearScore(h.cls, GEAR[h.gear[g.slot]!]) : 0)));
    if (gain > 6 && run.gold - s.price >= 60) buy(run, i);
  });
  for (let round = 0; round < 4; round++) {
    run.shop.forEach((s, i) => {
      if (s.kind === 'item' && want[s.id] !== undefined && (run.items[s.id] ?? 0) < want[s.id] && run.gold >= s.price) buy(run, i);
    });
  }
  autoEquip(run);
}

export function innBot(run: RunState, smart: boolean): void {
  if (run.recruits?.length && run.heroes.length < MAX_PARTY && run.gold >= recruitCost(run)) {
    const pick = smart ? (run.recruits.find((c) => c === 'healer' && !run.heroes.some((h) => h.cls === 'healer')) ?? run.recruits[0]) : run.recruits[0];
    recruit(run, pick);
  }
  if (run.gold >= restCost(run) && (!smart || hpFrac(run) < 0.95 || run.heroes.some((h) => h.hp <= 0))) rest(run);
  autoEquip(run);
}

export function eventBot(run: RunState, smart: boolean): number {
  const ev = eventDef(run);
  if (!ev) return 0;
  const ok = ev.options.map((o, i) => (optionOk(run, o.need) ? i : -1)).filter((i) => i >= 0);
  if (!smart) return ok[Math.floor(Math.random() * ok.length)];
  const prefs: Record<string, number[]> = {
    fountain: hpFrac(run) < 0.8 ? [0, 1] : [1, 0],
    merchant: [1, 0, 2],
    shrine: [1, 0, 2],
    chest: [1, 2],
    adventurer: [0, 1, 2],
    library: [0],
    dice: [2],
    clockmaker: [1],
  };
  return (prefs[ev.id] ?? ok).find((i) => ok.includes(i)) ?? ok[0];
}

export function itemValue(id: string): number {
  return ITEMS[id]?.price ?? 0;
}

export const partyGear = (h: Hero): GearDef[] => gearOf(h);
