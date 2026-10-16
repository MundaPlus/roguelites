# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the grid-tactics design from the roguelites plan is now playable.
  - Hex board with water, chasms, forest, fire, smoke, mountains, buildings and a shared grid power.
  - Enemy intents that follow pushed enemies, attack order, spawn tiles that a mech can block.
  - 3 squads (9 mech frames), 13 player weapons with Mk II upgrades, 9 enemies with alpha variants, 2 bosses.
  - 3 islands with 3 missions and a boss each, then a final battle. Bonus goals, hangar, pilot XP and 5 perks.
  - Action preview that shows the board after the shot, undo of moves, one reset per battle, save and continue.
  - Mouse, keyboard and touch input (tap to preview, tap again to fire). Debug API (`?debug`, `window.hex`).
- Balance after bot runs: each hit on a building costs at most 1 grid power, one fewer starting enemy in boss battles, stronger Flux and Blaze weapons — the bot lost boss battles in round 1 and the unlock squads won 0 of 10 runs.

## 2026-10-15
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
