# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the slot-machine design from the README is now playable.
  - Pure spin function with a fixed resolve order (destroy, transform, grow, pay, burn-out) and an event list for playback.
  - 53 symbols with tags (fruit, food, animal, plant, ore, gem, person, magic, sea) and 22 items.
  - DOM reel animation, then each effect shown one step at a time with floating numbers and sounds.
  - 12 rents, symbol pick after each spin, item pick after each rent, removal and reroll tokens, endless mode.
  - 4 landlord levels, medal unlocks for 5 symbols and 4 items, save and continue.
  - Mouse, keyboard and touch input. Debug API (`?debug`, `window.debug`) and a headless balance sim with 3 bots.
- Balance after bot runs (200 runs each, Fair Landlord): random bot 0% wins (fails at rent 6–8), smart bot 40%.
  - Rents now rise to 4400 (first draft ended at 888) — at the first draft even a random-pick bot won 92% of runs.
  - Crowns no longer stack and multipliers on one cell stop at ×12 — stacked Crowns and Witches gave spins of over 100000 coins.
  - Landlord rent multipliers set to ×1.15 / ×1.3 / ×1.5 — the smart bot wins 27% / 12% / 6% there.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
