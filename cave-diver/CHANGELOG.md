# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the platformer design from the README is now playable.
  - Tile physics at 60 Hz with coyote time, jump buffer, variable jump height, ledge hang, ladders, ropes, corner correction.
  - Level generator: 4×4 room templates, a sure path to the exit (checked with a move graph), shops, pets, crates, pots and rocks.
  - 4 zones with 9 enemies, spikes, arrow traps, falling blocks, icicles, ice and lava. The Stone King boss in level 4-4.
  - 9 items and 3 consumables. Ghost after 3:00. Zone shortcuts after 3 visits. Save and continue per level.
  - Keyboard, mouse and touch pad. Debug API (`?debug`, `window.debug`) with a planning bot.
- Balance after bot runs (200 runs each): the good bot wins 46%, the weak bot 0%.
  - Arrow traps deal 1 instead of 2 — they caused most early deaths.
  - Fewer spikes (2 + 2 per zone), a potion in the crate table, the ghost at 3:00 instead of 2:30 — the good bot won only 26–29% before.
  - Pets spawn only where the entrance can reach them — half of them sat in closed rooms.
  - The boss ignores wood platforms and pushes you out of its body — it trapped the player in corners.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
