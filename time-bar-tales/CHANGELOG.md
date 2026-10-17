# Changelog

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the ATB party design is now playable.
  - Pure ATB battle simulation with a time step: haste, slow, poison, sleep, protect, defend, rows, 5 elements with weak/resist/immune/absorb.
  - 6 classes (2 unlockable) with skill trees, 42 skills, 10 items, 35 pieces of gear.
  - 24 enemies with AI scripts, patterns, phase changes and counters. 3 elites, 3 bosses.
  - Tower of 15 floors with battles, elites, inns (rest, recruit up to 4), shops, 8 events and treasure. Guild with 7 unlocks.
  - Wait and Active mode, 3 battle speeds. Keyboard, mouse and touch menus. Debug API (`?debug`, `window.debug`).
- Balance after bot runs: bosses no longer scale with the floor, the Chronomancer went from 2700 to 1600 HP with weaker spells, Clockgears from 170 to 110 HP, and the XP curve went from 16×lvl^1.65 to 12×lvl^1.42 — at first the smart bot never won (party level 7–8 at the top). Now weak bot 0%, smart bot 53%.

## 2026-10-16
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
