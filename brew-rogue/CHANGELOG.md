# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the potion design is now playable.
  - SVG effect maps with strength rings and danger zones. 3 bases (Water, Oil, Wine), 11 effects.
  - 15 ingredients with polyline paths, grind levels, hold-to-stir, water and 4 salts. Gold path preview with danger warning.
  - Daily orders, market, 3 gathering places with risks, weekly guild debt, a rival alchemist, the Guild Master order.
  - Guild Hall with 6 unlocks paid with seals. Save and continue. Mouse, keyboard and touch.
  - Debug API (`?debug`, `window.debug`) with a beam-search bot.
- Balance after sim runs (80 runs per bot): debts 180/400/650/880, order strength factors 1/1.4/1.9, reputation price bonus capped at +40%, rival share by reputation — at first debts the smart bot won every run with 8000+ gold. Now the smart bot wins 40%, a random bot 0%.
- Toned down the Guild Hall (`src/data.ts`, `src/run.ts`) — with all unlocks the smart bot won 40/40. Notice Board now gives +1 day on strength III orders (was +1 customer, the biggest boost). Big Cart adds 1 uncommon (was 2 items). Fat Purse is +20 gold (was 30). Salt Cellar gives 1 extra Sun and 1 Moon Salt. Dark Wine adds a 60 gold licence fee to the week 3 and 4 debts. With all unlocks the smart bot now wins 67% (40/60).
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
