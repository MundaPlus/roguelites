# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the rhythm dungeon crawler design is now playable.
  - Beat clock on `AudioContext.currentTime` with a generated drum, bass and lead loop. The tempo rises per zone (100–136 BPM) and per floor.
  - Timing window (±110 ms, or ±170 ms wide), latency setting, tap calibration screen, beat bar with a count-in and Perfect/Early/Late feedback.
  - Gold multiplier that breaks on missed or off-beat presses and on hits.
  - 6 weapons with attack shapes, 23 items (armor, light, bombs, 4 spells, charms, food), 14 monsters with 8 learnable patterns, 4 mini-bosses and 4 bosses with summons and telegraphed slams.
  - Seeded dungeons with diggable dirt, stone, gold veins, hidden diamonds, shops, chests and locked stairs. Boss arenas. Zone rewards.
  - Meta progress: 3 delvers and 3 starting gear unlocks paid with diamonds. Run save per floor.
  - Keyboard, tap and touch pad input. Debug API (`?debug`, `window.debug`) with a virtual clock in `?debug&fast`.
- Balance after headless sims: Delver HP 6 → 5, more monsters per floor (8 + 3 per zone + 2 per floor), shop prices ×1.4 plus 30% per zone, food and heart containers cost more, the zone reward gives +1 max HP instead of +2, bosses have 25% more HP, slow monsters get +1 HP from zone 3 — the lookahead bot won 90% of runs before. Now it wins 56% with 10% missed beats. The weak bot wins 0%.
- The bot no longer sees the random moves of bats in its lookahead, avoids hunting monsters that never move, and loses its caution on long floors — it stalled next to Spore Caps before.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
