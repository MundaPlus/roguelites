# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the second design from the roguelites plan is now playable.
  - Dice-placement combat with slot rules, Σ charge cards, combos (pairs, straights) and 5 statuses.
  - 3 heroes, 30 player cards, 28 enemies over 5 floors, 15 relics, 7 events, shop and campfire.
  - Backpack with limited space, die face upgrades (6 and wild faces), seeded runs, save and continue.
  - Drag and drop and tap-to-place for mouse and touch, plus number keys. A sticky dice tray on phones.
  - Debug API (`?debug`, `window.dice`) for bot tests.
- Balance after bot runs: heal 15% of max HP after each won fight, Goblin Brute 28 → 24 HP, Goblin King 42 → 38 HP — the bot died on floor 1 from attrition.

## 2026-10-15
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
