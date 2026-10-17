# Changelog

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the line-drawing design is now playable.
  - Own 2D rigid-body engine (`src/physics.ts`): circles, capsules and convex polygons, SAT with clipping, warm-started impulses, sleeping. No library.
  - Drawn strokes become welded capsule chains. Closed loops become solid blocks. Crossing strokes merge into one body.
  - 24 levels in 3 worlds (cup, target and keep goals, no-draw zones, spikes, crates, moving parts), 3 bosses with draw timers. Each level stores one solution, checked in the sim with and without mirroring.
  - Run map with level choices, chests, shops, 5 pens with charges, 6 charms, ink upgrades, hearts. Meta unlocks from lifetime stars.
  - Mouse, touch and keyboard input with undo. Debug API (`?debug`, `window.debug`).
- Balance after sim runs: stroke radius 0.15 → 0.11 and steeper start slopes, because the ball stuck on the bump where a stroke lies on a slope. Ball angular damping 0.3 → 0.05 and crates lighter, because the ball stopped before it could push crates. Good bot (σ 0.15) wins 53%, random bot 0%.

## 2026-10-16
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
