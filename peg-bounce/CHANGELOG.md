# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the pachinko design from the roguelites plan is now playable.
  - Fixed-step physics with 4 board layouts, crit, refresh and bomb pegs, a moving bucket and an aim line.
  - 10 orbs with 3 levels, 16 relics, 20 enemies over 3 acts with elites and summoning bosses.
  - Map with fights, elites, events, treasure, shops and campfires. Armory unlocks paid with shards.
  - Mouse, keyboard and touch input. Debug API (`?debug`, `window.peg`) for bot tests.
- Balance after bot runs: enemy HP ×2 / ×2.4 / ×2.8 and attack ×1.3 / ×1.4 / ×1.5 per act, bosses at 80% HP — at base values a random-aim bot won every run.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
