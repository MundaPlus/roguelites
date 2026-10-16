# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`). The unit guiding design from the roguelites plan is now playable.
  - Side view terrain as a cell mask on Canvas: dirt, steel, bricks, water, fire and gates. Critters walk, step up, turn, fall (lethal over 22 cells), climb and float.
  - 7 jobs: blocker, digger, basher, builder, climber, floater, bomber. Pause, speed x3, nuke and restart.
  - 11 hand-made obstacle segments with seeded sizes in 3 level packs, 3 boss levels (rising water, a wolf, rising lava), 3 curses.
  - Every level is checked: the generator plays the known solution and keeps the level only when it works. The clock and the need come from that replay.
  - Act maps with branching paths, rewards (extra jobs, lambs, hearts), meadows, hearts and herd size as run health, 6 barn unlocks paid with wool.
  - Mouse, keyboard and touch input. Narrow screens zoom in and pan with drag or a mini map. Debug API (`?debug`, `window.debug`).
- Balance after the sim: snap traps reload in 45 ticks and come in pairs. With one trap, half the herd walked past without a solution.
- Balance after the sim: wool is score / 200. At score / 60 one win paid for every unlock.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`). The game is ready to build next.
