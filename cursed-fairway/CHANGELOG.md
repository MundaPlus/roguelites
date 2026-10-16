# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`). The side-view golf design is now playable.
  - Fixed-step ball physics with gravity, wind, bounce and roll friction per surface (grass, green, sand, ice, water, spikes, rock). The aim arc uses the same step function as the flight.
  - Holes built from 14 seeded piece types, with idols (+2 shots), coins, pillars and moving gates.
  - 6 clubs with 3 levels, 11 ace cards, 8 charms, 5 curses, 4 zones with 4 boss holes.
  - 18-hole run with path choices (hole, curse hole, shortcut, pro shop), rewards and a Locker with token unlocks.
  - Camera preview of the whole hole, then ball follow. Slingshot drag on mouse and touch, keyboard controls.
  - Save and continue, How to play, menu, mute, sounds, particles and floating text.
  - Debug API (`?debug`, `window.debug`) with a bot that searches shots with the real physics.
- Balance after bot runs:
  - Cliffs and plateaus became steep slopes instead of walls. Balls stuck at the foot of a wall made holes unplayable.
  - Pillars are lower (60–110). The bot now also tries shots backward and counts a shot that goes nowhere as wasted.
  - Ice friction went up (14 → 36). Balls rolled back and forth in ice valleys for too long.
  - Shot counter: from `1 + len/520` down to `len/700` (rounded up), plus 1 on the first two holes. With the first value the good bot won 87%.
  - Result: good bot 60%, weak bot 0% (120 runs each).
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
