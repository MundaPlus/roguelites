# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the snake party crawler design is now playable.
  - Grid arena with a hero line, one queued turn, crashes into walls, rocks and the line, smooth drawing between ticks.
  - 7 hero classes with their own attacks (melee, arrows, blasts, heals, slows, bombs), 7 synergies, stars and party levels.
  - 8 enemies (chasers, ranged, chargers, splitter, ghost) and 3 bosses over 3 stages and 15 waves.
  - Shrine after each wave with 3 gifts, a shop (revive, potion, train, reroll) and leader choice. Caged captives in some waves.
  - Keyboard, swipe and touch-arrow input. Save and continue, meta stats and class unlocks. Debug API (`?debug`, `window.debug`).
- Balance after sim runs (`BAL` in `src/world.ts`): enemy HP +24% and damage +20% per wave, more enemies per wave (7 + 2.4 per wave), bosses at 70% HP, Bone Lord 220 and Ember Drake 380 HP — with the first values the good bot won every run. The good bot now wins 41–60%, the weak bot 0%.
- The line waits at the start of a wave until the first turn (or 2.5 s) and moves every 0.18 s instead of 0.16 s — in browser tests the line hit the wall before a new player could react.
- Train costs 40 coins (+20 each time) and coins drop from 22% of the enemies — at 30 coins and 30% drops the good bot won 77%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
