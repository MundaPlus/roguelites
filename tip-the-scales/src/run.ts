/** Run state, fight setup, rewards, score and save data. */
import { ACTS, ALLY_IDS, ITEMS, ITEM_IDS, KINDS, LEARNABLE, SKILLS, SQUADS } from './data';
import { makeUnit, momentInfo, newBattle, tiltOf, type AiCfg, type Battle } from './beam';
import { Rng, hash } from './rng';

export const FIGHTS_PER_ACT = 4;
export const MAX_PARTY = 4;
export const MAX_SKILLS = 2;
/** Enemy HP factor. Higher HP makes tipping worth more than hitting. */
export let HP_MULT = 1.1;
export function setHpMult(m: number): void {
  HP_MULT = m;
}

export interface Member {
  kind: string;
  hp: number;
  max: number;
  skills: string[];
}

export type Reward =
  | { t: 'unit'; kind: string }
  | { t: 'skill'; s: string }
  | { t: 'item'; id: string }
  | { t: 'rest' };

export interface RunState {
  v: 1;
  seed: string;
  squad: string;
  act: number;
  fight: number;
  party: Member[];
  items: string[];
  tipped: number;
  kills: number;
  fightsWon: number;
  lost: number;
  /** Rewards to pick after a won fight. Empty when none are open. */
  offers: Reward[];
  /** Skill waiting for a unit to learn it. */
  teach: string | null;
  battle: Battle | null;
}

export interface Meta {
  runs: number;
  wins: number;
  bestAct: number;
  best: number;
  tipped: number;
}

const RUN_KEY = 'scales.run';
const META_KEY = 'scales.meta';

export const isBoss = (r: RunState): boolean => r.fight === FIGHTS_PER_ACT - 1;

export function memberOf(kind: string, items: string[]): Member {
  const k = KINDS[kind];
  const max = k.hp + (items.includes('helmet') ? 2 : 0);
  return { kind, hp: max, max, skills: [] };
}

export function newRun(seed: string, squad: string): RunState {
  const sq = SQUADS.find((s) => s.id === squad) ?? SQUADS[0];
  return {
    v: 1,
    seed,
    squad: sq.id,
    act: 0,
    fight: 0,
    party: sq.units.map((k) => memberOf(k, sq.item ? [sq.item] : [])),
    items: sq.item ? [sq.item] : [],
    tipped: 0,
    kills: 0,
    fightsWon: 0,
    lost: 0,
    offers: [],
    teach: null,
    battle: null,
  };
}

export function aiCfg(act: number): AiCfg {
  return { tipSense: [0.55, 0.8, 1][act] ?? 1, noise: [3, 2, 1][act] ?? 1 };
}

/** Build the fight for the current act and step. Seeded by run seed, act and fight. */
export function makeFight(r: RunState): Battle {
  const act = ACTS[r.act];
  const rng = new Rng(hash(r.seed, 'fight', r.act, r.fight));
  const boss = isBoss(r);
  const beamId = boss ? act.bossBeam : act.beams[(r.fight + rng.int(0, 2)) % act.beams.length];
  const b = newBattle(beamId, hash(r.seed, 'battle', r.act, r.fight));
  b.boots = r.items.includes('boots');
  b.rope = r.items.includes('rope') ? 1 : 0;

  // Enemy list.
  const foes: string[] = [];
  if (boss) {
    foes.push(act.boss, ...act.bossAdds.slice(0, r.act === 0 ? 1 : 2));
  } else {
    const n = 2 + (r.fight >= 1 ? 1 : 0) + (r.act >= 2 && r.fight >= 2 ? 1 : 0);
    for (let i = 0; i < n; i++) foes.push(rng.pick(act.enemies));
  }
  const crates = boss ? 0 : rng.chance(0.5) ? 1 : 0;

  // Try many placements. Keep the one closest to level.
  const R = b.R;
  const left: number[] = [];
  const right: number[] = [];
  for (let x = -R + 1; x <= -1; x++) left.push(x);
  for (let x = 1; x <= R - 1; x++) right.push(x);
  if (right.length < foes.length) right.push(R);
  if (left.length < r.party.length) left.push(-R);
  let bestCells: { a: number[]; e: number[]; c: number[] } | null = null;
  let bestM = Infinity;
  for (let tries = 0; tries < 60; tries++) {
    const a = rng.shuffle([...left]).slice(0, r.party.length);
    const freeR = rng.shuffle([...right]);
    const e = freeR.slice(0, foes.length);
    const rest = [...rng.shuffle([...left]).filter((x) => !a.includes(x)), ...freeR.slice(foes.length), 0];
    const c = rng.shuffle(rest).slice(0, crates);
    if (e.length < foes.length) continue;
    const t = newBattle(beamId, 0);
    r.party.forEach((m, i) => t.units.push({ ...makeUnit(t, m.kind, a[i]) }));
    foes.forEach((k, i) => t.units.push(makeUnit(t, k, e[i])));
    c.forEach((x) => t.units.push(makeUnit(t, 'crate', x)));
    const m = Math.abs(momentInfo(t).m) + (Math.abs(tiltOf({ ...t, sway: 0 })) > 0 ? 100 : 0) + rng.next();
    if (m < bestM) {
      bestM = m;
      bestCells = { a, e, c };
    }
  }
  const cells = bestCells!;
  r.party.forEach((m, i) => b.units.push(allyUnit(b, r, m, i, cells.a[i])));
  foes.forEach((k, i) => {
    const u = makeUnit(b, k, cells.e[i]);
    // Act scaling for normal enemies.
    if (!u.boss) {
      const bonus = r.act * 1 + (r.fight >= 2 ? 1 : 0);
      u.max = Math.round(u.max * HP_MULT) + bonus;
      u.hp = u.max;
    }
    b.units.push(u);
  });
  cells.c.forEach((x) => b.units.push(makeUnit(b, 'crate', x)));
  return b;
}

function allyUnit(b: Battle, r: RunState, m: Member, i: number, x: number) {
  const u = makeUnit(b, m.kind, x, i);
  u.hp = m.hp;
  u.max = m.max;
  u.skills = [...u.skills, ...m.skills];
  if (r.items.includes('chalk')) u.grip += 1;
  if (r.items.includes('whetstone')) u.atk += 1;
  if (r.items.includes('pole') && u.knock > 0) u.knock += 1;
  if (r.items.includes('pole') && u.knock === 0 && u.atk > 0 && m.kind !== 'rogue') u.knock = 1;
  if (r.items.includes('springs')) u.move += 1;
  return u;
}

/** Write the battle result back into the run. Returns false when the run is lost. */
export function finishFight(r: RunState, b: Battle): boolean {
  r.tipped += b.stats.tipped;
  r.kills += b.stats.kills;
  r.lost += b.stats.lost;
  const hp = new Map<number, number>();
  for (const u of b.units) if (u.team === 'ally') hp.set(u.pi, Math.max(1, u.hp));
  r.party = r.party.filter((m, i) => {
    if (!hp.has(i)) return false;
    m.hp = hp.get(i)!;
    return true;
  });
  r.battle = null;
  if (b.over !== 'win' || !r.party.length) return false;
  r.fightsWon++;
  const heal = 4 + (r.items.includes('bandage') ? 3 : 0);
  for (const m of r.party) m.hp = Math.min(m.max, m.hp + heal);
  r.offers = makeOffers(r);
  return true;
}

export function unlockedUnits(meta: Meta): string[] {
  return ALLY_IDS.filter((id) => unitUnlocked(meta, id));
}

export function unitUnlocked(meta: Meta, id: string): boolean {
  if (id === 'aeronaut') return meta.tipped >= 8;
  if (id === 'anchor') return meta.bestAct >= 1;
  if (id === 'sponge') return meta.bestAct >= 2;
  return true;
}

export function unitUnlockText(id: string): string {
  if (id === 'aeronaut') return 'Tip 8 enemies off in total';
  if (id === 'anchor') return 'Reach act 2';
  if (id === 'sponge') return 'Reach act 3';
  return '';
}

export function squadUnlocked(meta: Meta, id: string): boolean {
  if (id === 'heavy') return meta.bestAct >= 1;
  if (id === 'odd') return meta.wins >= 1 || meta.tipped >= 30;
  return true;
}

export function squadUnlockText(id: string): string {
  if (id === 'heavy') return 'Reach act 2';
  if (id === 'odd') return 'Win a run or tip 30 enemies';
  return '';
}

let metaCache: Meta | null = null;
export function setMetaForOffers(m: Meta): void {
  metaCache = m;
}

export function makeOffers(r: RunState): Reward[] {
  const rng = new Rng(hash(r.seed, 'offer', r.act, r.fight));
  const out: Reward[] = [];
  const pool = metaCache ? unlockedUnits(metaCache) : ALLY_IDS.slice(0, 4);
  if (r.party.length < MAX_PARTY) out.push({ t: 'unit', kind: rng.pick(pool) });
  const canLearn = r.party.some((m) => m.skills.length < MAX_SKILLS);
  if (canLearn) {
    const s = rng.shuffle([...LEARNABLE]);
    out.push({ t: 'skill', s: s[0] });
    if (out.length < 2) out.push({ t: 'skill', s: s[1] });
  }
  const free = rng.shuffle(ITEM_IDS.filter((i) => !r.items.includes(i)));
  while (out.length < 3 && free.length) out.push({ t: 'item', id: free.shift()! });
  out.push({ t: 'rest' });
  return out;
}

export function rewardText(w: Reward): { icon: string; name: string; text: string } {
  switch (w.t) {
    case 'unit': {
      const k = KINDS[w.kind];
      return { icon: k.icon, name: `Recruit ${k.name}`, text: `${k.text} Weight ${k.w}, HP ${k.hp}, grip ${k.grip}.` };
    }
    case 'skill': {
      const s = SKILLS[w.s];
      return { icon: s.icon, name: `Skill: ${s.name}`, text: `${s.text} Pick a unit to learn it.` };
    }
    case 'item': {
      const it = ITEMS[w.id];
      return { icon: it.icon, name: it.name, text: it.text };
    }
    case 'rest':
      return { icon: '🍲', name: 'Rest', text: 'Heal every unit 4 HP.' };
  }
}

/** Take a reward. For a skill, the app then asks which unit learns it. */
export function takeReward(r: RunState, w: Reward): void {
  r.offers = [];
  switch (w.t) {
    case 'unit':
      if (r.party.length < MAX_PARTY) r.party.push(memberOf(w.kind, r.items));
      break;
    case 'skill':
      r.teach = w.s;
      break;
    case 'item':
      r.items.push(w.id);
      if (w.id === 'helmet')
        for (const m of r.party) {
          m.max += 2;
          m.hp += 2;
        }
      break;
    case 'rest':
      for (const m of r.party) m.hp = Math.min(m.max, m.hp + 4);
      break;
  }
}

export function teach(r: RunState, idx: number): boolean {
  const m = r.party[idx];
  if (!m || !r.teach || m.skills.length >= MAX_SKILLS || m.skills.includes(r.teach) || KINDS[m.kind].skills.includes(r.teach)) return false;
  m.skills.push(r.teach);
  r.teach = null;
  return true;
}

/** Move to the next fight. Returns true when the run is won. */
export function advance(r: RunState): boolean {
  r.fight++;
  if (r.fight >= FIGHTS_PER_ACT) {
    r.fight = 0;
    r.act++;
    if (r.act >= ACTS.length) return true;
    for (const m of r.party) m.hp = m.max;
  }
  return false;
}

export function score(r: RunState, won: boolean): number {
  return r.fightsWon * 50 + r.tipped * 15 + r.kills * 5 + r.act * 200 + (won ? 600 : 0);
}

// ---------- Save data ----------

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.v !== 1 || !Array.isArray(run.party) || run.party.some((m) => !KINDS[m.kind])) return null;
    return run;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function loadMeta(): Meta {
  const base: Meta = { runs: 0, wins: 0, bestAct: 0, best: 0, tipped: 0 };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
  } catch {
    return base;
  }
}

export function saveMeta(meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}
