# Changelog

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the gravity slingshot design is now playable.
  - Leapfrog n-body physics with a fixed step. The aim line, the bot and the shot share one `simulate` function.
  - 7 body types (planet, ice, lava, giant, moon, black hole, repulsor), asteroids, walls and turning arc shields, 4 target types.
  - 6 shot types, 7 launcher upgrades, 6 launchers to unlock, 5 sectors with bosses, 6 anomalies, trade posts and stations.
  - Bank, orbit and multi trick bonuses. Drag, keyboard and touch input. Debug API (`?debug`, `window.debug`).
- Balance after a headless sim (40 runs per bot): boss systems get 2 spare shots instead of 3. With 3 the good bot won 62%, then 38%. Random, straight-line and weak bots won 0 of 30.
- Sector 1 systems get 1 more spare shot (`src/gen.ts`) — 11 of 40 good-bot runs ended in sector 1. Now 1 of 40 does. The good bot wins 45% (18 of 40). The weak bot still wins 0 of 30.
- Tested real touch input (CDP touch events on a 390×844 mobile context): the drag aims, the release fires, and tapping the shot buttons works.
- Fixed an endless loop: a caught boomerang gave back its ammo too, so a bot could fire it forever. Now only the system shot comes back.

## 2026-10-16
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
