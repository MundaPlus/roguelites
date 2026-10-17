# Changelog

## 2026-10-17
- Fixed the gap between the sim and the browser bot (`src/bots.ts`, `src/app.ts`) — `debug.step()` took a skill whenever no unit was offered, the sim took an item. That policy wins 7%, not 50%. Both now call the shared `botReward` and `botTeach`, and they give the same result for the same seed.
- Added a brace cooldown and a round limit (`src/beam.ts`, `src/bots.ts`) — at tilt 4 both sides could brace every turn and a fight never ended. A unit now cannot brace two turns in a row. After round 30 the enemies give up.
- Added `debug.start(seed, squad)` (`src/app.ts`) — compares one seed in the browser and in the sim.
- Balance with fresh meta, 300 runs: random bot 0%, preview bot 48% / 34% / 54% (Guild / Ironfoot / Oddballs). Browser: 7 wins in 12 `debug.step()` runs.
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the balance-beam design is now playable.
  - Pure beam rules: moment, tilt steps, slides by grip, a tilt limit of ±4, falls, knock-back with bump damage.
  - Exact preview of every action: ghost beam, slide arrows, fall marks, damage, and the new tilt on the meter.
  - 5 beams (plank, short plank, two pivots, ice, rope swing), 7 player units, 12 enemies, 3 bosses, 6 skills, 8 items, 3 squads.
  - Enemy AI that uses the same preview and scores tipping. Run loop of 3 acts with rewards, save and continue, meta unlocks.
  - Mouse, keyboard and touch input. Debug API (`?debug`, `window.debug`) for bot tests.
- Balance after sim runs (300 runs per squad): random bot 0%, preview bot 38% / 36% / 52% (Guild / Ironfoot / Oddballs).
  - Beam step 10 → 7 and enemy HP ×1.1 — at step 10, hits beat tipping by about 3 to 1.
  - Removed the 4th enemy from act 2 fights — act 2 ended most runs.
  - Heal after a fight 2 → 4 HP, Smith grip 0 → 1, Anchor move 1 → 2 — the locked squads won under 20%.
  - Ironfoot starts with Chalk, Oddballs with Helmets. A start with the Climbing Rope gave 69%, so the rope stays a reward only.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
