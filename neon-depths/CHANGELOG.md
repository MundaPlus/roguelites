# Changelog

## 2026-10-15
- Built the full game with a custom canvas engine and no extra packages (`src/`) — it replaces the placeholder page.
  - Floors of rooms made by a random walk. Fight, treasure, shop, challenge and boss rooms. 14 room templates with rocks, blocks and pits (`src/dungeon.ts`).
  - Twin-stick controls for keyboard and mouse, gamepad and touch. Dodge roll with i-frames, bombs, auto-fire (`src/input.ts`, `src/game.ts`).
  - 36 items that change shots (pierce, homing, split, bounce, explode, chain lightning, burn, slow, multishot, boomerang) and 8 synergies (`src/items.ts`).
  - 13 enemy types and 5 bosses with bullet patterns and enrage phases (`src/enemies.ts`, `src/bosses.ts`).
  - Hub with 9 permanent upgrades and 6 loadouts, paid with neon shards. Saves in localStorage (`src/meta.ts`, `src/ui.ts`).
  - Neon look with cached glow sprites, synth sound effects and a minimap (`src/render.ts`, `src/sfx.ts`).
- Added a cap to the floor generator loop (`src/dungeon.ts`) — a layout with no room to grow froze the page.
- Fleeing enemies now strafe when a wall is behind them (`src/enemies.ts`) — Casters hid in corners where they were hard to reach.
- Hid the keyboard hint on touch screens and moved the touch pause button off the top door (`src/game.ts`, `src/style.css`) — found in the phone test.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
