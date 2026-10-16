# Changelog

## 2026-10-16
- Rebalanced difficulty (`src/game.ts`, `src/data.ts`, `src/run.ts`) — the first wall was too hard for beginners and 80% of good-bot losses came at the final boss.
  - The first wall of a run is gentle (22% slower ball, 1-HP bricks, few specials). The second wall is half as gentle. The weak bot now clears wall 1 in 65% of runs (before: 1%).
  - Bosses are easier: Turret King 52 HP, Brick Hydra 78 HP and fewer shots. Boss walls ramp ball speed less.
  - Acts 2–3 have more pressure: ball speed 410 / 495, a faster speed ramp in normal walls, more shooter bricks that fire more often.
  - Fewer lives: cap 4, no life from bosses, shop lives cost more.
  - Result (300 runs): good bot 46%. Losses: 36% at the final boss, 35% in act 3 walls, 31% in act 2, 4% in act 1. Weak bot 0%.
## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the brick breaker design is now playable.
  - Fixed-step wall simulation with swept ball collision, a bounce angle from the paddle hit position, and 1:1 mouse and touch-drag control.
  - 7 brick types, 7 power-ups, 10 upgrades (ball types and paddle parts), 4 paddles, 13 wall templates and 3 boss walls.
  - Branching map per act with walls, elite walls, shops, workshops and treasure. Workshop unlocks paid with shards.
  - Save and continue, how-to modal, pause menu, mute, sounds, particles and screen shake. Debug API (`?debug`, `window.debug`) with a paddle bot.
- Balance after headless bot runs (`bot.ts` bots, 150 runs each): first versions let a predicting bot win 100%.
  - Lives cap at 5 and cost more in shops — lives piled up after act 1.
  - Shield max 2 and Wings max 2, Split capped at 2–4 balls in play — these upgrades made later acts easier than act 1.
  - Ball speed 240 / 360 / 430 per act, bosses at 34 / 64 / 120 HP — act 1 was the hardest part of a run.
  - Result: weak bot 0% (it dies in the first wall), good bot 47%. Most good-bot runs end at the Brick Hydra.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
