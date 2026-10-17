/** Run-level rules for moves in a puzzle: HP, mana, solve and death. Used by the app and the sim. */
import { SPELLS } from './data';
import { castClear, castCross, castInsight, castPeek, castReveal, paint, spellCost, type MoveResult } from './puzzle';
import { addCharm, heal, solveRewards, type RunState } from './run';

export interface PlayResult extends MoveResult {
  healed: number;
  died: boolean;
}

function settle(run: RunState, res: MoveResult): PlayResult {
  const out: PlayResult = { ...res, healed: 0, died: false };
  if (res.dmg) run.hp = Math.max(0, run.hp - res.dmg);
  if (res.manaLoss) run.mana = Math.max(0, run.mana - res.manaLoss);
  if (run.hp <= 0) {
    run.result = 'lose';
    out.died = true;
    return out;
  }
  if (res.solved) solveRewards(run);
  return out;
}

export function playPaint(run: RunState, idxs: number[]): PlayResult {
  return settle(run, paint(run.room!.puzzle!, idxs));
}

export function canCast(run: RunState, id: string): boolean {
  const p = run.room?.puzzle;
  if (!p || p.solved || !run.spells.includes(id)) return false;
  if (id === 'mend' && run.hp >= run.maxHp) return false;
  return run.mana >= spellCost(p, id);
}

/** Cast a spell. `target` is a cell index or a line index, as the spell needs. Returns null when it cannot be cast. */
export function playCast(run: RunState, id: string, target = -1): PlayResult | null {
  const p = run.room?.puzzle;
  if (!p || !canCast(run, id)) return null;
  const def = SPELLS[id];
  if (def.target !== 'none' && target < 0) return null;
  run.mana -= spellCost(p, id);
  const empty: MoveResult = { painted: [], emptied: [], wrong: null, dmg: 0, manaLoss: 0, lines: [], solved: false };
  let res: MoveResult = empty;
  let healed = 0;
  switch (id) {
    case 'peek':
      res = castPeek(p, target);
      break;
    case 'clear':
      res = castClear(p, target);
      break;
    case 'reveal':
      res = castReveal(p, target);
      break;
    case 'cross':
      res = castCross(p, target);
      break;
    case 'insight':
      res = castInsight(p);
      break;
    case 'mend':
      healed = heal(run, 3);
      break;
    case 'ward':
      p.ward += 2;
      break;
  }
  const out = settle(run, res);
  out.healed = healed;
  return out;
}

export function pickReward(run: RunState, charm: string | null): void {
  const r = run.room?.reward;
  if (!r || r.picked) return;
  if (charm && r.charms.includes(charm)) addCharm(run, charm);
  r.picked = true;
}

export function pray(run: RunState): number {
  const room = run.room;
  if (!room || room.used) return 0;
  room.used = true;
  return heal(run, run.maxHp);
}

export function openVault(run: RunState, charm: string): boolean {
  const room = run.room;
  if (!room || room.used || run.keys < 1) return false;
  run.keys--;
  addCharm(run, charm);
  room.used = true;
  return true;
}
