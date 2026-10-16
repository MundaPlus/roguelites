# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`). The mining plus wave defense design is now playable.
  - Seeded tile map (22 × 72) with 5 rock layers, caves, iron, water and crystal veins, and 5 gadget blocks.
  - Keeper with walking, drilling in 4 directions, jetpack, and a cargo stack that slows movement.
  - One clock: a wave timer that is always visible. The weapon fires only when the keeper is back in the dome.
  - Defense view with 7 monster types (ground, flyer, ranged, diver), a Rock Titan boss (waves 5 and 10) and a Hive Queen final boss (wave 15).
  - 3 domes as meta unlocks: laser, sword and turret. 5 upgrade tracks with 6 levels, dome repair, 8 gadgets.
  - Workshop after each wave and from the dome while mining. Save and continue in `localStorage`.
  - Keyboard, mouse and touch input with an on-screen pad. The turret dome shows an "Auto turret" note instead of turn and fire buttons, because it aims by itself. Sounds, particles, floating numbers, screen shake.
  - Debug API (`?debug`, `window.debug`) with a path-finding bot. `step()` simulates 2 s (6 s with `&fast`).
- Balance after headless sims (50 runs per dome, weak bot vs. good bot):
  - First pass: the good bot lost every run at wave 1. Ground monsters were below the gun, so the aim range now goes 0.6 rad below the horizon.
  - Iron was the bottleneck. Upgrade iron costs are 25% lower, water tiles give 2 items, and there are more iron and water veins.
  - The late waves were a wall. The wave budget is now 10 + 5n + 0.12n² (was 8 + 5n + 0.55n²) and monster HP grows 7% per wave (was 13%).
  - The Hive Queen killed every good run. Her HP is 420 (was 1100) and her spit does 7 damage every 3 s. The laser can now burn spit out of the air.
  - The sword could not reach the queen. She now hovers lower. Sword damage is ×1.2 (was ×1.4) and the turret ×0.95 with slower turning.
  - The wave-10 Titan has ×1.35 HP (was ×1.6).
  - Result: weak bot 0% wins on all domes (average death at wave 3–6). Good bot wins 42% (laser), 40% (sword), 28% (turret).
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`). The game is ready to build next.
