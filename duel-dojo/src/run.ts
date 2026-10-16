/** Run state, ladder, techniques, meta progress and saves. */
import { BOT_GOOD, type AiCfg } from './ai';
import {
  BOSS,
  FIGHTERS,
  OPPONENTS,
  RUNGS,
  SPECIALS,
  SPECIAL_IDS,
  STAGES,
  STAGE_IDS,
  TECHS,
  TECH_IDS,
  baseMods,
  type Mods,
  type OppDef,
  type Slot,
} from './data';
import type { Fight, FighterSetup } from './game';
import { Rng, hash } from './rng';

export const LADDER = 8;

export type Pick = { kind: 'special'; id: string } | { kind: 'tech'; id: string };

export interface FightLog {
  opp: string;
  hp: number;
  perfect: boolean;
  timeLeft: number;
  combo: number;
  score: number;
}

export interface RunState {
  v: 1;
  seed: string;
  fighter: string;
  rung: number;
  hp: number;
  maxHp: number;
  techs: Record<string, number>;
  specials: Partial<Record<Slot, string>>;
  ladder: string[];
  stages: string[];
  score: number;
  offer: Pick[] | null;
  log: FightLog[];
}

export interface Meta {
  honor: number;
  unlocked: string[];
  runs: number;
  wins: number;
  bestRung: number;
  best: number;
  kos: number;
  motion: boolean;
}

const RUN_KEY = 'dueldojo.run';
const META_KEY = 'dueldojo.meta';

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

export function oppDef(id: string): OppDef {
  return id === BOSS.id ? BOSS : OPPONENTS.find((o) => o.id === id)!;
}

export function newRun(seed: string, fighter: string, meta: Meta): RunState {
  const rng = new Rng(hash(seed, 'ladder'));
  const ids = rng.shuffle(OPPONENTS.map((o) => o.id)).slice(0, LADDER - 1);
  ids.push(BOSS.id);
  const pool = STAGE_IDS.filter((s) => STAGES[s].cost === 0 || meta.unlocked.includes(s));
  const stages = ids.map((id) => (id === BOSS.id ? 'volcano' : rng.pick(pool)));
  const def = FIGHTERS[fighter];
  return {
    v: 1,
    seed,
    fighter,
    rung: 0,
    hp: def.hp,
    maxHp: def.hp,
    techs: {},
    specials: { ...def.specials },
    ladder: ids,
    stages,
    score: 0,
    offer: null,
    log: [],
  };
}

export function playerMods(run: RunState, meta: Meta): Mods {
  const m = baseMods();
  for (const [id, n] of Object.entries(run.techs)) for (let i = 0; i < n; i++) TECHS[id].apply(m);
  m.motion = meta.motion;
  return m;
}

export function playerSetup(run: RunState, meta: Meta): FighterSetup {
  const def = FIGHTERS[run.fighter];
  return { def, name: def.name, gi: def.gi, belt: def.belt, hair: def.hair, mods: playerMods(run, meta), specials: run.specials, hp: run.hp, maxHp: run.maxHp };
}

export function oppSetup(run: RunState): FighterSetup {
  const o = oppDef(run.ladder[run.rung]);
  const def = FIGHTERS[o.base];
  const r = RUNGS[run.rung];
  const mods = baseMods();
  mods.dmg = r.dmg;
  mods.motion = false;
  const hp = Math.round(def.hp * r.hp);
  return { def, name: o.name, gi: o.gi, belt: o.belt, hair: o.hair ?? def.hair, mods, specials: o.specials ?? def.specials, hp, maxHp: hp };
}

export function oppAi(run: RunState): AiCfg {
  const o = oppDef(run.ladder[run.rung]);
  const r = RUNGS[run.rung];
  return { style: o.style, react: r.react, block: r.block, aggro: r.aggro, antiAir: r.block * 0.9, tech: r.block * 0.5, mistake: r.mistake, combo: r.combo };
}

export const botAi = (): AiCfg => ({ style: 'balanced', ...BOT_GOOD });

export function fightSeed(run: RunState): number {
  return hash(run.seed, 'fight', run.rung, run.log.length);
}

export function healAmount(run: RunState): number {
  return Math.round(run.maxHp * (0.35 + (run.techs.meditate ? 0.15 : 0)));
}

/** Record a won fight. Returns the heal and the fight score. */
export function winFight(run: RunState, fight: Fight): { heal: number; score: number; log: FightLog } {
  const me = fight.fs[0];
  const hp = Math.max(1, Math.ceil(me.hp));
  const perfect = me.stats.taken === 0;
  const timeLeft = Math.ceil(fight.timer / 60);
  const score = 100 + 50 * run.rung + Math.round((hp / run.maxHp) * 100) + (perfect ? 200 : 0) + timeLeft * 2 + me.stats.maxCombo * 10;
  const log: FightLog = { opp: run.ladder[run.rung], hp, perfect, timeLeft, combo: me.stats.maxCombo, score };
  run.log.push(log);
  run.score += score;
  const heal = Math.min(run.maxHp - hp, healAmount(run));
  run.hp = hp + heal;
  run.rung++;
  if (run.rung >= LADDER) run.score += 1000;
  else run.offer = makeOffer(run);
  return { heal, score, log };
}

export function makeOffer(run: RunState): Pick[] {
  const rng = rngFor(run, 'offer', run.rung);
  const out: Pick[] = [];
  const equipped = new Set(Object.values(run.specials));
  const specials = rng.shuffle(SPECIAL_IDS.filter((id) => !equipped.has(id)));
  if (specials.length) out.push({ kind: 'special', id: specials[0] });
  const avail = (kind: 'stat' | 'passive'): string[] => rng.shuffle(TECH_IDS.filter((id) => TECHS[id].kind === kind && (run.techs[id] ?? 0) < TECHS[id].max));
  const stats = avail('stat');
  const passives = avail('passive');
  if (stats.length) out.push({ kind: 'tech', id: stats[0] });
  if (passives.length) out.push({ kind: 'tech', id: passives[0] });
  const extra = [...stats.slice(1), ...passives.slice(1)];
  while (out.length < 3 && extra.length) out.push({ kind: 'tech', id: extra.shift()! });
  return out;
}

export function applyPick(run: RunState, p: Pick): void {
  if (p.kind === 'special') {
    run.specials[SPECIALS[p.id].slot] = p.id;
  } else {
    run.techs[p.id] = (run.techs[p.id] ?? 0) + 1;
    if (p.id === 'vigor') {
      run.maxHp += 15;
      run.hp += 15;
    }
  }
  run.offer = null;
}

/** Honor for the meta shop at the end of a run. */
export function honorFor(run: RunState, victory: boolean): number {
  return run.rung * 6 + (victory ? 30 : 0) + Math.floor(run.score / 400);
}

// ---------- Saves ----------

export function saveRun(run: RunState | null): void {
  try {
    if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunState;
    if (r.v !== 1 || !FIGHTERS[r.fighter] || !Array.isArray(r.ladder) || r.ladder.length !== LADDER) return null;
    return r;
  } catch {
    return null;
  }
}

export const clearRun = (): void => saveRun(null);

export function loadMeta(): Meta {
  const base: Meta = { honor: 0, unlocked: [], runs: 0, wins: 0, bestRung: 0, best: 0, kos: 0, motion: false };
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return base;
    return { ...base, ...(JSON.parse(raw) as Partial<Meta>) };
  } catch {
    return base;
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* storage blocked */
  }
}

export const fighterOpen = (meta: Meta, id: string): boolean => FIGHTERS[id].cost === 0 || meta.unlocked.includes(id);
export const stageOpen = (meta: Meta, id: string): boolean => STAGES[id].cost === 0 || meta.unlocked.includes(id);
