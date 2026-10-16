/** Run state: the act maps, rewards, meadows, score and save data. */
import { ACTS, CURSE_IDS, JOBS, JOB_IDS, UNLOCKS, type Curse, type Job, type Pack } from './data';
import { emptyJobs } from './game';
import { makeLevel, type Checked, type NodeKind } from './levels';
import { Rng, hash } from './rng';

export type NodeType = 'level' | 'cursed' | 'meadow' | 'boss';

export const NODE_INFO: Record<NodeType, { icon: string; name: string; text: string }> = {
  level: { icon: '🌾', name: 'Field', text: 'A level. Clear it for one reward.' },
  cursed: { icon: '☠️', name: 'Cursed field', text: 'A level with a curse. Clear it for two rewards.' },
  meadow: { icon: '🌼', name: 'Meadow', text: 'Rest: heal, new lambs or new jobs.' },
  boss: { icon: '👑', name: 'Boss', text: 'The big level at the end of the act.' },
};

export interface MapNode {
  type: NodeType;
  curse: Curse | null;
  next: number[];
}

export type Reward = { kind: 'job'; job: Job; n: number } | { kind: 'lambs'; n: number } | { kind: 'heart' } | { kind: 'maxheart' };

export interface RunState {
  v: 1;
  seed: string;
  act: number;
  /** Current row on the act map. */
  row: number;
  /** Node chosen on the last row (-1 before the first pick of an act). */
  col: number;
  map: MapNode[][];
  /** Node picked on each row of this act. */
  trail: number[];
  herd: number;
  hearts: number;
  maxHearts: number;
  kit: Record<Job, number>;
  packs: Pack[];
  bomber: boolean;
  cleared: number;
  saved: number;
  lost: number;
  fails: number;
  /** What the run waits for. */
  phase: 'map' | 'level' | 'reward' | 'meadow';
  /** Node being played (phase level, reward or meadow). */
  node: number;
  rewards: Reward[];
  picks: number;
}

export interface Meta {
  wool: number;
  unlocked: string[];
  runs: number;
  wins: number;
  best: number;
  bestAct: number;
  totalSaved: number;
}

const RUN_KEY = 'herdpath.run';
const META_KEY = 'herdpath.meta';

export const ROWS = 5;

export function makeMap(seed: string, act: number): MapNode[][] {
  const r = new Rng(hash(seed, 'map', act));
  const rows: MapNode[][] = [];
  for (let i = 0; i < ROWS; i++) {
    const n = i === 0 || i === ROWS - 1 ? 1 : r.int(2, 3);
    const row: MapNode[] = [];
    for (let j = 0; j < n; j++) {
      let type: NodeType = i === ROWS - 1 ? 'boss' : i === 0 ? 'level' : r.weighted<NodeType>([
        ['level', 5],
        ['cursed', 3],
        ['meadow', 2],
      ]);
      if (i === 1 && type === 'meadow') type = 'level';
      row.push({ type, curse: type === 'cursed' ? r.pick(CURSE_IDS) : null, next: [] });
    }
    rows.push(row);
  }
  for (let i = 0; i < ROWS - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    const pos = (k: number, n: number): number => (k + 0.5) / n;
    a.forEach((node, k) => {
      b.forEach((_, j) => {
        if (Math.abs(pos(k, a.length) - pos(j, b.length)) <= 0.34) node.next.push(j);
      });
      if (!node.next.length) {
        let best = 0;
        b.forEach((_, j) => {
          if (Math.abs(pos(k, a.length) - pos(j, b.length)) < Math.abs(pos(k, a.length) - pos(best, b.length))) best = j;
        });
        node.next.push(best);
      }
    });
    b.forEach((_, j) => {
      if (a.some((n) => n.next.includes(j))) return;
      let best = 0;
      a.forEach((_, k) => {
        if (Math.abs(pos(k, a.length) - pos(j, b.length)) < Math.abs(pos(best, a.length) - pos(j, b.length))) best = k;
      });
      a[best].next.push(j);
      a[best].next.sort();
    });
  }
  // No two meadows in a row on one path is not checked; meadows are rare enough.
  return rows;
}

export function newRun(seed: string, meta: Meta): RunState {
  const has = (id: string): boolean => meta.unlocked.includes(id);
  const kit = emptyJobs();
  if (has('kit')) {
    kit.builder = 1;
    kit.basher = 1;
    kit.digger = 1;
  }
  const packs: Pack[] = ['meadow'];
  if (has('caves')) packs.push('caves');
  if (has('volcano')) packs.push('volcano');
  const hearts = has('bell') ? 4 : 3;
  return {
    v: 1,
    seed,
    act: 0,
    row: 0,
    col: -1,
    map: makeMap(seed, 0),
    trail: [],
    herd: 20 + (has('flock') ? 5 : 0),
    hearts,
    maxHearts: hearts,
    kit,
    packs,
    bomber: has('bomber'),
    cleared: 0,
    saved: 0,
    lost: 0,
    fails: 0,
    phase: 'map',
    node: 0,
    rewards: [],
    picks: 0,
  };
}

/** Nodes the player may pick on the current row. */
export function choices(run: RunState): number[] {
  if (run.row === 0 || run.col < 0) return run.map[run.row].map((_, i) => i);
  return run.map[run.row - 1][run.col].next;
}

export const curNode = (run: RunState): MapNode => run.map[run.row][run.node];

export const slackFor = (act: number): number => (act === 0 ? 1 : 0);

/** The level for the chosen node. Same run, node and herd give the same level. */
export function levelFor(run: RunState): Checked {
  const n = curNode(run);
  const kind: NodeKind = n.type === 'boss' ? 'boss' : n.type === 'cursed' ? 'cursed' : 'level';
  return makeLevel({
    seed: hash(run.seed, 'level', run.act, run.row, run.node),
    act: run.act,
    depth: run.row,
    kind,
    curse: n.curse,
    packs: run.packs,
    herd: run.herd,
    slack: slackFor(run.act),
  });
}

export function pickNode(run: RunState, i: number): void {
  run.node = i;
  run.phase = curNode(run).type === 'meadow' ? 'meadow' : 'level';
}

/** Result of a level. Returns 'end' when the run is lost. */
export function levelDone(run: RunState, saved: number, lost: number, win: boolean): 'reward' | 'retry' | 'end' {
  if (!win) {
    run.hearts--;
    run.fails++;
    return run.hearts <= 0 ? 'end' : 'retry';
  }
  run.herd -= lost;
  run.saved += saved;
  run.lost += lost;
  run.cleared++;
  if (run.herd <= 0) return 'end';
  const n = curNode(run);
  run.rewards = makeRewards(run);
  run.picks = n.type === 'cursed' ? 2 : 1;
  run.phase = 'reward';
  return 'reward';
}

function jobPool(run: RunState): Job[] {
  return JOB_IDS.filter((j) => j !== 'bomber' || run.bomber);
}

export function makeRewards(run: RunState): Reward[] {
  const r = new Rng(hash(run.seed, 'reward', run.act, run.row, run.node));
  const boss = curNode(run).type === 'boss';
  const jobs = r.shuffle(jobPool(run)).slice(0, boss ? 2 : 3);
  const pool: Reward[] = jobs.map((job) => ({ kind: 'job', job, n: boss ? 3 : 2 }));
  pool.push({ kind: 'lambs', n: boss ? 7 : 4 });
  if (boss) pool.push({ kind: 'maxheart' });
  else if (run.hearts < run.maxHearts) pool.push({ kind: 'heart' });
  const out = r.shuffle(pool).slice(0, 3);
  if (!out.some((x) => x.kind === 'lambs')) out[2] = { kind: 'lambs', n: boss ? 7 : 4 };
  return out;
}

export function rewardText(rw: Reward, run: RunState): { icon: string; name: string; text: string } {
  switch (rw.kind) {
    case 'job': {
      const j = JOBS[rw.job];
      const isNew = run.kit[rw.job] === 0;
      return { icon: j.icon, name: `${isNew ? 'New job: ' : ''}${j.name} +${rw.n}`, text: `${rw.n} more ${j.name.toLowerCase()} jobs in every level. ${j.text}` };
    }
    case 'lambs':
      return { icon: '🐑', name: `${rw.n} lambs`, text: `${rw.n} new critters join the herd.` };
    case 'heart':
      return { icon: '❤️', name: 'Heal', text: 'Get back one heart.' };
    case 'maxheart':
      return { icon: '💖', name: 'Big heart', text: '+1 max heart and heal to full.' };
  }
}

export function applyReward(run: RunState, rw: Reward): void {
  switch (rw.kind) {
    case 'job':
      run.kit[rw.job] += rw.n;
      break;
    case 'lambs':
      run.herd += rw.n;
      break;
    case 'heart':
      run.hearts = Math.min(run.maxHearts, run.hearts + 1);
      break;
    case 'maxheart':
      run.maxHearts++;
      run.hearts = run.maxHearts;
      break;
  }
}

export function meadowOptions(run: RunState): Reward[] {
  const r = new Rng(hash(run.seed, 'meadow', run.act, run.row, run.node));
  const job = r.pick(jobPool(run));
  return [{ kind: 'heart' }, { kind: 'lambs', n: 5 }, { kind: 'job', job, n: 2 }];
}

/** Moves on after a reward or meadow. Returns true when the run is won. */
export function advance(run: RunState): boolean {
  run.col = run.node;
  run.trail.push(run.node);
  run.row++;
  run.phase = 'map';
  run.rewards = [];
  run.picks = 0;
  if (run.row >= ROWS) {
    run.act++;
    if (run.act >= ACTS.length) return true;
    run.row = 0;
    run.col = -1;
    run.trail = [];
    run.map = makeMap(run.seed, run.act);
  }
  return false;
}

// ---------- Score and meta ----------

export const score = (run: RunState, victory: boolean): number =>
  run.saved * 10 + run.cleared * 30 + run.act * 150 + (victory ? 1000 + run.hearts * 100 + run.herd * 10 : 0);

export const woolFor = (sc: number): number => Math.floor(sc / 200);

export const unlockCost = (id: string): number => UNLOCKS.find((u) => u.id === id)?.cost ?? 0;

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
    if (run.v !== 1 || !Array.isArray(run.map) || !run.kit || !Array.isArray(run.trail)) return null;
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
  const base: Meta = { wool: 0, unlocked: [], runs: 0, wins: 0, best: 0, bestAct: 0, totalSaved: 0 };
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
