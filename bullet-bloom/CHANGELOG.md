# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the bullet-hell design from the roguelites plan is now playable.
  - Fixed 60 Hz simulation with typed-array pools for bullets, shots, items and particles, and a spatial grid for hit and graze checks.
  - Data-driven emitters (ring, spiral, aimed, fan, rain, flower, random) with layers, spin, curves, bursts and delays.
  - 5 stages with seeded waves from 7 enemy types, 5 mid-bosses and 5 bosses with 19 spell cards in all.
  - Focus mode with a visible hitbox, grazing that charges the bomb, bombs that clear bullets, a short deathbomb window, point and bloom items with a collection line.
  - 11 ship parts picked between stages, 4 ships unlocked with seeds, loop mode after a win, save and continue between stages.
  - Keyboard, mouse and touch input (relative drag, Focus and Bomb buttons). Debug API (`?debug`, `window.debug`) with a dodging bot and god mode.
- Balance after headless bot runs: boss HP ×0.6, graze charge 0.3 per graze (was 1), gentler first two boss spell cards, Thorn with 2 lives, laser 21 damage per second per level (was 30). Before, a bot with perfect reaction never died, grazing gave about 10 bombs per stage, and Thorn won 90% of runs. The good bot (4-frame reaction, 7% missed bullets) now wins about 45%. The weak and random bots lose in stage 1.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
