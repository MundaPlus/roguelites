# Changelog

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the reverse-dungeon design is now playable.
  - Pure hero step `enterRoom(hero, card, level, step, rng)` with a mood model: boredom, stress, delight, HP and a smoothed fun value. With no RNG it gives the expected result, so each card can show its effect on the current hero.
  - A live SVG fun graph with the target curve (build-up, release, boss peak), the zone band, the real curve and a ghost dot for the card under the pointer.
  - A thought bubble that names the main reason for each reaction, with lines per hero type.
  - 5 hero types with different weights (knight, rogue, barbarian, mage, bard), 22 room cards, 6 bosses, 4 shop services.
  - 5 dungeons of 8 rooms and a boss, star ratings, guild trust, renown shop, meta stars that unlock 2 heroes and 7 cards.
  - Save and continue (`director.run`, `director.meta`), help, menu, mute, keys, touch. Debug API (`?debug`, `window.debug`) with the planner bot.
- Balance after headless sims (200 runs per hero and bot): the random director wins 0%, the greedy director 8%, the planner 54%.
  - Stress from monster power now drops with gear (0.12 per point) — without it big fights were too punishing for the knight, but at 0.25 per point the greedy bot won 54%.
  - Monster power grows 36% per dungeon (was 28%) and stress keeps 60% between dungeons (was 50%) — the planner won 67% and the greedy bot 25% before.
  - The fun zone is ±8 with no points at 24 (was ±10 and 30) — the random director got 67% fit before, so the rating did not matter.
  - The knight has 115 HP (was 105) — he won only 26% with the planner, the lowest of all heroes.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
