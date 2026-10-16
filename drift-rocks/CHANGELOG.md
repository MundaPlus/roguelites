# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`). The inertia shooter design is now playable.
  - Fixed-step physics with drag, screen wrap and circle collision. Canvas vector graphics with glow, particles, rings, shake and floating numbers.
  - 4 rock kinds in 3 sizes, 4 enemies, 3 bosses (Mothership, Rock Titan, Warden) over 15 waves.
  - 12 upgrades with 3 levels, a dock with upgrades and spare ships, 5 hulls with different handling, a Hangar paid with shards.
  - Keyboard, mouse, touch (virtual stick sets the heading, FIRE and JUMP buttons) and gamepad input.
  - Save and continue, pause menu, how-to-play modal, mute. Debug API (`?debug`, `window.debug`) with a bot.
- Balance after bot sims. The first version let the good bot win every run, and the late waves took 8–15 s.
  - Enemy HP grows 12% per wave (was 6%). Rocks fly 6% faster per wave (was 4%). More saucers, drones and hunters.
  - Boss HP set to 140 / 800 / 600. The Warden fires 3-bullet spreads and a slower spiral. With 5-bullet spreads no bot run beat it.
  - Spread side bullets deal half damage. Rapid Fire is ×0.85 per level and Heavy Rounds +30% per level. Before, a full build cleared a wave in seconds.
  - Credits drop from 40% of rocks (was 55%). Dock prices are 60 + 50 per level and 90 per ship.
  - Hulls tuned toward the same win rate: Sparrow and Lancer weaker, Bulwark slightly stronger, Drifter has a small drag.
  - The good bot now reacts every 0.12 s with aim noise, so its win rate matches a skilled player better. Result: good bot 36%, weak bot 0%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
