# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the tower defense design from the roguelites plan is now playable.
  - Canvas map on a 7×7 grid of 3×3-cell tiles. The path is a tree that grows one tile per wave and opens a new branch every 10 waves (wave 5, 15, ...).
  - Terrain: hills (+1 range), forest (blocks 30% of straight shots), rock and ponds, fords that slow enemies.
  - 5 towers (ballista, mortar, frost, tesla, flame) with 2 upgrade branches of 3 levels each and 4 targeting modes.
  - 6 enemy types (fast, armored, flying, healer, splitter) and 5 bosses every 10 waves. Wave 50 wins, then endless mode.
  - 20 cards after each wave (5 rare ones after boss waves). Meta: crystals unlock tesla, flame and 4 starting relics.
  - Fixed-step sim (1/30 s) with pause and 1×/2×/3× speed, next-wave preview, save and continue, help and menu, mouse, touch and keyboard.
  - Debug API (`?debug`, `window.debug`) and a headless balance sim with a weak and a good bot.
- Balance after bot runs (40 runs per bot): weak bot 0% wins (median wave 12), good bot 45% (base towers) and 40% (all towers).
  - Tower costs rise 10% per tower of the same type. Before this, a bot that spammed random towers won 60% of runs.
  - Card boosts add up instead of multiplying. Stacked +20% damage cards made late waves trivial.
  - Enemy HP has a cubic term after wave 15. With only quadratic growth the good bot won 85% and never lost after wave 30.
  - Mortar damage 16 → 26, tesla 10 → 22 with a longer jump, flame 5 → 6, sniper last upgrade +50% → +30%. They had a third of the ballista's damage per gold.
  - Stuns give a short immunity and waves enrage after 100 s. A stun lock with healers made one wave never end.
  - New tower cards are always offered only until you own 3 types. With all towers unlocked they filled a card slot every wave.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
