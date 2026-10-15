# Changelog

## 2026-10-15
- Built the first playable version (`src/*.ts`, `index.html`) — the first of the five roguelite ideas.
  - 6 weapons, 11 passive items and 6 evolutions.
  - 6 enemy types, elites with chests, swarm rings and the Ash Colossus boss at 10:00.
  - 5 heroes and 8 permanent upgrades, saved in `localStorage`.
  - Level-up cards with rerolls, pause screen with build and evolution list, game-over screen.
  - Keyboard and drag-joystick input. Spatial grid keeps 60 fps with 400+ enemies.
- Lowered elite HP (x16 to x9), lowered early bat and ghoul damage, set i-frames to 0.5 s (`src/enemies.ts`, `src/game.ts`) — playtest showed late elites were too tanky and the early game was too harsh.
- Added a `?debug` URL flag that exposes the game in the console (`src/main.ts`) — for scripted playtests.
