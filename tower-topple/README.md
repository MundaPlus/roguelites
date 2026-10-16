# Tower Topple

Physics stacking roguelite (like Tricky Towers). Status: design only. The page is a placeholder.

## Play style

Real physics and balance. Shaped blocks fall from the top. Move and rotate each block, then drop it on your tower. Blocks have mass and friction and can slide, tip and fall.

- Reach the goal line before the timer runs out.
- A block that falls off the platform costs a life.
- Wind, earthquakes and slippery ice blocks make the tower unstable.

## Run loop

1. A map of challenges: race to a height, hold a tower for 30 seconds, fit blocks under a ceiling.
2. Each challenge gives a spell card: glue (blocks stick), heavy (block cannot move), shrink, vines.
3. Bosses cast curses: bigger blocks, strong wind, a moving platform.
4. Clear 3 worlds to win.

## Core systems

- **Physics**: rigid bodies made from boxes (polyomino shapes), gravity, friction, contact solver.
- **Blocks**: shape bag, materials (wood, stone, ice), special blocks.
- **Spells**: one-use effects on the next block or the tower.
- **Hazards**: wind force, shake, falling debris.
- **Meta**: unlock spells and block sets.

## Tech plan

- A small 2D physics engine (or a bundled one such as planck.js) with a fixed step.
- Canvas 2D with a camera that rises with the tower.
- Keyboard and touch buttons for move, rotate and drop.
