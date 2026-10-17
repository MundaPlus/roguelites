# Changelog

## 2026-10-17
- Loosened the floor budget to main par × (1.25 − 0.012 × floor) + 15 (`src/run.ts`) — with the old budget the perfect solver bot won only 7 of 10 runs. In 100-run sims the perfect bot now wins 97%, a human-like bot that wastes 37% of its moves wins 44%, and the weak bot wins 0%.
- A crate now crushes a monster pinned against a wall, and bats turn to the side when both ways are blocked (`src/puzzle.ts`) — a ghoul or bat stuck in a pocket could block a room forever.
- The bot plans again when the room differs from its plan and walks around to squash blocking monsters (`src/bot.ts`). Added the human-like bot profile for the sim.

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the push-block design from the roguelites plan is now playable.
  - Pure room rules (`move(state, dir) => state`) with a free, unlimited undo stack and a move budget shared by all rooms of a floor.
  - 4 crate types (crate, ice, iron, bomb), cracked walls with chests, 3 monster types that can be shoved or squashed.
  - Room generator: 10 hand-made templates plus random shapes, scrambled by reverse play and checked by a BFS push solver. The solver also gives each room its par.
  - 10 floors in 5 themes. Each floor is a map with 3 to 6 main rooms, a stairs room with monsters, and side rooms (shop, vault, shrine, treasure).
  - 5 one-use tools, keys, rewards after each room, 4 characters and 2 tool unlocks paid with bones.
  - Keyboard, swipe, tap and on-screen arrows. Debug API (`?debug`, `window.debug`) with a solver bot.
- Monsters cannot enter plates, and you can shove them — before this, a bat could get stuck on a plate and make a room unsolvable.
- Balance after bot runs: floor budget = main par × (0.98 − 0.01 × floor) + 8. Move rewards cut to 5 + floor/2, the collapse refill to 15% of the floor budget, and shop hearts cost 30 + 3 × floor. With slack 1.5 and a 30% refill, the good bot won 29 of 30 runs. Now it wins 40% (12/30), the weak bot 0/30, and the perfect solver bot 70%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
