# Changelog

## 2026-10-15
- Built the first playable version (`src/*.ts`, `index.html`, `src/style.css`) — the second of the five roguelite games.
  - Data-driven combat engine: energy, draw/discard/exhaust piles, Block, 15 statuses, enemy intents, Thorns, Artifact, X-cost cards.
  - 45 player cards, 5 status and curse cards, 26 relics with combat hooks, 11 potions.
  - 23 enemy types over 3 acts, with 6 elites and 3 bosses that have phases.
  - Branching map per act, with fights, elites, events, merchant, rest sites, treasure and boss.
  - 9 events plus an opening blessing, card removal, upgrades and transforms.
  - Seeded runs, autosave after each room, Continue and Abandon on the title screen, run stats.
  - Floating damage numbers, hit and lunge animations, turn banners, keyboard shortcuts.
- Fixed missing spaces in card text and a map header that covered the top of the map (`src/render.ts`, `src/style.css`) — found in the bot playtest.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
