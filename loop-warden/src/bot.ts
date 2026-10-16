/** Bots for the debug API and the balance sim. `random` plays cards at random. `smart` follows simple rules. */
import { CLASSES, ENEMIES, TILES } from './data';
import { Rng } from './rng';
import {
  METER_MAX,
  autoEquip,
  campContinue,
  cheb,
  drinkPotion,
  equip,
  heroStats,
  isRoad,
  n4,
  n8,
  place,
  validCells,
  type Run,
} from './world';

export type BotKind = 'random' | 'smart';

/** Rough damage per second the hero can deal to the boss vs. damage per second taken. */
export function bossReady(run: Run): boolean {
  const s = heroStats(run);
  const lich = ENEMIES.lich;
  const lvl = run.loop;
  const bossHp = lich.hp * (1 + 0.12 * (lvl - 1));
  const dps = Math.max(1, s.dmg * (1 + s.crit) - lich.def) * s.spd;
  const t = bossHp / dps;
  const taken = Math.max(1, lich.atk * (1 + 0.12 * (lvl - 1)) - s.def) * lich.spd * (1 - s.eva) * 1.6;
  const heal = dps * s.vamp;
  return (taken - heal) * t < s.maxHp * 0.9 + run.potions * s.maxHp * 0.4;
}

const SPAWNERS = new Set(['graveyard', 'grove', 'cocoon', 'mansion']);

function scoreCell(run: Run, card: string, cell: number): number {
  const t = (c: number) => run.tiles[c]?.id;
  switch (card) {
    case 'meadow':
      return n8(cell).filter((n) => t(n) && t(n) !== 'meadow').length * 3 + (n8(cell).some((n) => t(n) === 'mansion') ? 0 : 1);
    case 'mountain':
      return n4(cell).filter((n) => t(n) === 'mountain').length * 4 + n8(cell).filter((n) => t(n) === 'mountain').length - (n4(cell).some((n) => isRoad(run, n)) ? 1 : 0);
    case 'forest':
      return n4(cell).filter((n) => t(n) === 'forest').length * 4 - (n4(cell).some((n) => isRoad(run, n)) ? 1 : 0);
    case 'village':
      return n8(cell).some((n) => t(n) === 'mansion') ? -50 : 2;
    case 'mansion':
      return n8(cell).some((n) => t(n) === 'village') ? -50 : -run.path.findIndex((c) => c === cell);
    case 'lantern': {
      let k = 0;
      run.tiles.forEach((x, c) => {
        if (x && SPAWNERS.has(x.id) && cheb(c, cell) <= 2) k++;
      });
      return k * 3;
    }
    case 'oblivion': {
      const id = t(cell);
      if (id === 'village' && n8(cell).some((n) => t(n) === 'mansion')) return 10;
      if (id === 'mansion' && n8(cell).some((n) => t(n) === 'village')) return 8;
      return -100;
    }
    default: {
      // Road spawners: keep them apart and away from the camp.
      let d = 99;
      run.tiles.forEach((x, c) => {
        if (x && SPAWNERS.has(x.id)) d = Math.min(d, cheb(c, cell));
      });
      const ci = run.path.indexOf(cell);
      return Math.min(d, 6) + (ci > 2 && ci < run.path.length - 2 ? 2 : 0);
    }
  }
}

function smartPlace(run: Run, rng: Rng): void {
  const s = heroStats(run);
  for (let guard = 0; guard < 12; guard++) {
    let done = false;
    for (let i = 0; i < run.hand.length; i++) {
      const card = run.hand[i];
      const def = TILES[card];
      if (SPAWNERS.has(card)) {
        if (run.hp < s.maxHp * 0.55) continue;
        if (run.enemies.length > run.path.length * 0.4) continue;
      }
      if (card === 'lantern' && run.hp > s.maxHp * 0.5) continue;
      if (card === 'beacon' && run.enemies.length > 4) continue;
      if (run.meter + def.meter >= METER_MAX && !bossReady(run) && def.meter > 0) continue;
      const cells = validCells(run, card);
      if (!cells.length) continue;
      let best = -1e9;
      let pick = -1;
      for (const c of cells) {
        const v = scoreCell(run, card, c) + rng.next() * 0.5;
        if (v > best) {
          best = v;
          pick = c;
        }
      }
      if (best < -20) continue;
      place(run, i, pick);
      done = true;
      break;
    }
    if (!done) break;
  }
}

function randomPlace(run: Run, rng: Rng): void {
  while (run.hand.length) {
    const i = rng.int(0, run.hand.length - 1);
    const cells = validCells(run, run.hand[i]);
    if (!cells.length) {
      run.hand.splice(i, 1);
      continue;
    }
    place(run, i, rng.pick(cells));
  }
}

/** One round of bot decisions. Does not advance time. */
export function botAct(run: Run, kind: BotKind, rng: Rng): void {
  if (run.over) return;
  const s = heroStats(run);
  if (run.camp) {
    campContinue(run);
    return;
  }
  if (kind === 'smart') {
    if (run.battle && run.hp < s.maxHp * 0.35) drinkPotion(run);
    if (!run.battle) {
      autoEquip(run);
      smartPlace(run, rng);
    }
  } else {
    if (run.battle && run.hp < s.maxHp * 0.15) drinkPotion(run);
    if (!run.battle) {
      if (run.inv.length && rng.chance(0.3)) equip(run, rng.pick(run.inv).uid);
      randomPlace(run, rng);
    }
  }
}

export const CLASS_IDS = Object.keys(CLASSES);
