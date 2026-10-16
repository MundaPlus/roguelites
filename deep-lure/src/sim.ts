/** Headless balance sim. Not part of the page bundle. Run: esbuild src/sim.ts --bundle --platform=node. */
import { botEvent, botPort, botSea, botStow, newMem, type Skill } from './bot';
import { cast, canFish, dock, dockHere, eventChoice, finishReel, newRun, rnd, setSail, sleep, tickSea, type Run, type SeaEvent } from './game';
import { botReel, stepReel } from './reel';
import { makeWorld } from './world';

const DT = 1 / 20;
export const SIMLOG: { log: string[] | null } = { log: null };
let LOG: string[] | null = null;

export function playRun(seed: string, skill: Skill): Run {
  const w = makeWorld(seed);
  const run = newRun(seed, w);
  const m = newMem(skill);
  LOG = SIMLOG.log;
  let guard = 0;
  while (!run.over && guard++ < 600000) {
    if (run.docked >= 0) {
      const r = botPort(run, m);
      if (run.over) break;
      if (r === 'sleep') sleep(run, w);
      else setSail(run);
      m.target = null;
      continue;
    }
    if (run.event) {
      eventChoice(run, w, run.event, botEvent(run, m));
      continue;
    }
    if (run.pending) {
      botStow(run, m);
      continue;
    }
    const { inp, act } = botSea(run, w, m, DT);
    if (act === 'dock') {
      dock(run, dockHere(run));
      continue;
    }
    if (act === 'fish') {
      const cf = canFish(run, w);
      const ev: SeaEvent[] = [];
      const reel = cast(run, w, cf.spot, ev);
      if (reel) {
        let t = 0;
        while (!stepReel(reel, botReel(reel, skill === 'good' ? 1 : 0.45, () => rnd(run)), DT) && t < 200) t += DT;
        finishReel(run, reel);
      }
      continue;
    }
    const ev = tickSea(run, w, inp, DT);
    if (LOG) for (const e of ev) if (e.k === 'sink' || e.k === 'ram' || e.k === 'shade' || (e.k === 'bump' && e.dmg)) LOG.push(`${e.k} d${run.day} m${run.minute | 0} p${run.panic | 0} ${m.target?.kind}${m.target?.i}`);
  }
  return run;
}
