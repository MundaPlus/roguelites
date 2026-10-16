# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the caravan design from the roguelites plan is now playable.
  - Seeded 12-row node map in 3 regions with towns, rivers, hunting grounds, bandit passes, springs, camps and ruins. Roads show miles, danger and the water you need.
  - Daily upkeep: food and water by terrain, weather and rations; wagon wear by pace; sickness, healing, morale, desertion and death.
  - 4 to 5 travelers with HP, 6 skills, 15 traits and relations (friends and rivals).
  - 72 data-driven events with a small condition language, skill checks and weighted outcomes, including 4 event chains.
  - Towns with a store, jobs and recruits.
  - 3 real-time canvas scenes: hunt, river crossing and bandit ambush, plus a boss ambush at Green Valley.
  - 6 starting groups and 3 event chains to unlock with trail marks. Save and continue in `localStorage`.
  - Mouse, keyboard and touch input. Debug API (`?debug`, `window.debug`) for bot tests.
- Balance after sim runs (500 runs per group): the good bot wins 31–45%, the weak bot 0%.
  - Raised the start food of the Fur Trappers (35 → 45) and the money of the Mission Doctors (40 → 55) and Freight Crew (70 → 80) — these groups won only about 33% against 41% for the Settlers.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
