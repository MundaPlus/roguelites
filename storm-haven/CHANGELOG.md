# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the settlement builder design is now playable.
  - Canvas tile map with forest, hidden glades, roads and water. Camera with drag pan, wheel and pinch zoom.
  - 19 buildings, 15 goods with 7 production chains, 4 species, villager jobs with hauling to the Hearth or Warehouses.
  - Needs (food, home, luxury) and resolve. Unhappy villagers leave. Newcomers arrive.
  - Drizzle, clearance and storm seasons. 6 glade events. Caravan trade and tribute.
  - Orders with 2 choices each, reputation against impatience. Blueprint picks.
  - World map with 5 biomes and 8 curses, 10 capital upgrades per run, 6 lasting capital upgrades bought with crowns.
  - Fixed 4 ticks per second with pause and 1×/2×/3×. Save and continue. Debug API (`?debug`, `window.debug`) with a build-order bot.
- Balance after headless sims (200 runs per bot):
  - The Woodcutters' Camp costs only planks and the Lumber Mill only wood — the bot could spend all wood or planks and lock itself out of both.
  - The first glade always has a food node, and nodes hold more goods — bots starved before the first farm chain.
  - Reputation goal 13 + settlement index (17 in the final), impatience fills in 15 min, warehouse and glade orders ask for more — at first the build-order bot won 100% of runs.
  - Result: build-order bot wins 46% of runs (69% of settlements), random bot wins 0% of runs (under 1% of settlements).
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
