# Changelog

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the two-timeline design is now playable.
  - Pure turn engine with 5 cause rules (growth, erosion, lineage, flooding, monuments) and the backward Echo rule on elite floors.
  - Move preview: the tiles a move changes glow on the other board, and the bar names the cause, the effect and the damage. A pulse travels from the past tile to the future tile when the turn plays.
  - Clear for the chosen moves, 3 rewinds per floor, floor restart for 2 HP, a hint and a dead-end warning.
  - Floor generator with a phased solver: every floor must be clearable with the current HP and must need the past. Failed floors are rebuilt.
  - 10 enemy types, 14 items, 12 floors with 3 elites, 3 camps and a boss in both ages. Archive with 7 unlocks.
  - Stacked boards on phones (390×844 fits without scrolling), mouse, keyboard and touch input. Debug API (`?debug`, `window.debug`).
- Balance after sim runs: start HP 12 → 10, no free heal at camps, Hot Meal 4 → 3 HP, Heart Root +3 → +2, Tonic 5 → 3, fewer instant items and heart chests, more future enemies, future enemies hit +1 from floor 5, later floors must cost 1–3 HP — at first a damage-ignoring bot won every run.
- Boss: claw and wave no longer hit the same tiles, HP 6 → 5 — the boss could not be cleared without heavy damage.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
