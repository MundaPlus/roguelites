# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the merchant trading design is now playable.
  - SVG sea map with 10 ports, pirate halos, news icons and known prices of the selected good.
  - 8 goods with base price, stock (supply), demand and recovery per port. Each unit you trade moves the price. Pure daily update `marketDay`.
  - 16 news cards, 4 seasons with weather, voyages with pirates (fight, flee, pay), storms and 4 small sea events.
  - Loan with weekly interest due at week 52, 6 ships, guards, warehouses, repairs, early retirement, net worth score.
  - Price history line chart with hover per port and good, sparklines in the market table.
  - Renown unlocks 3 home ports and 2 start ships. Save and continue in `localStorage`.
  - Debug API (`?debug`, `window.debug`) with a bot that plans trades from known prices.
- Balance after bot runs: producer stock ×1.5 and consumer stock ×0.68 (was ×1.9 / ×0.55), 55 map units per day (was 70), run length 78 weeks (was 104), goal 55,000 — at first the smart bot won every run.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
