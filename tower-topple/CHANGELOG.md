# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the stacking design from the roguelites plan is now playable.
  - Own 2D rigid-body engine: compound box bodies, Box2D-lite contacts, sequential impulses with warm starting and a block solver, split impulses, sleeping groups, fixed 60 Hz step.
  - Controlled descent, then physics on contact. Ghost drop guide, camera that rises with the tower.
  - 3 challenge types (race, hold, ceiling), 3 worlds with hazards (wind, quakes, ice, stone, moving platform), elites and 3 bosses with 6 curses.
  - 8 spell cards, 15 block shapes, 4 materials. Map with camps and shops. Workshop unlocks paid with bricks.
  - Keyboard, mouse drag, touch buttons. Sounds, particles, banners. Debug API (`?debug`, `window.debug`).
- Balance after bot sims — the good bot first won 13–20% of runs, mostly lost to one big collapse:
  - One collapse costs at most 2 lives (2-second window).
  - A won challenge with no lost life gives +1 life. Camps heal 3 lives instead of 2.
  - Softer storm in world 1 (wind 1.1, no quakes). Light breeze in world 1, so thin spires are not free.
  - Ceiling challenges need more blocks (70% of the space instead of 55%) — the bot never failed them.
  - Result: random bot 0/100, good bot without spells 0/50, good bot 44/100.
- Fixed physics jitter in tall stacks: restitution was measured after warm starting, and warm-start contacts are now matched by position when clip features change.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
