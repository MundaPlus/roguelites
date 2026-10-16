# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the racing design from the roguelites plan is now playable.
  - Tracks from tile pieces on a grid, generated from a seed: straights, curves, jumps with mud pits, boost pads, and asphalt, dirt and ice runs in 4 themes.
  - Fixed-step car physics with grip, drift and nitro. Drifting fills nitro. Walls, car collisions and persistent damage.
  - 5 AI drivers per race on a racing line, with 4 personalities, plus 2 boss rivals. Gadgets: mines, oil, shield, nitro cans.
  - Season of 14 stages with 10 races, time trials, shops, pit stops and 5 events. 27 parts in 5 slots and 3 rarities. 5 cars to unlock with trophies.
  - Camera that follows the car, skid marks, particles, screen shake, a mini map and an engine hum.
  - Keyboard, gamepad and touch input. Debug API (`?debug`, `window.debug`) for bot tests.
- Balance after sim runs (150 seasons per bot): weak bot wins the title 5%, good bot 42%.
  - Turbo Kart grip and acceleration down (+8%, +6%) and Armored Van speed up — at first values the kart won 70% and the van 25%.
  - Unlock costs raised to 15/25/35/50 trophies — a title run gives about 27 trophies.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
