# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the loop auto-battler design is now playable.
  - 4 loop layouts, 11 tile cards with 5 neighbor combos (blooming meadow, mountain range, peak, thicket, ghoul nest).
  - 7 enemies and the Lich boss, real-time fights with attack timers, crits, evasion and vampirism.
  - 3 classes, 4 gear slots with 4 rarities, potions, boss meter, camp retreat (100%), road retreat (60%), death (30%).
  - Camp with 12 buildings that unlock cards and classes or give bonuses. Run and meta saves in `localStorage`.
  - Mouse, touch and keyboard input, pause and 1×/2×/3× speed. Debug API (`?debug`, `window.debug`) with a smart bot.
- Balance after headless bot runs (`random` vs. `smart` bot, 200–300 runs each):
  - Boss meter max 150 instead of 100, tile meter points lowered, +4 per loop instead of +1 per day — at first the meter filled by loop 5 and every run died at the boss.
  - Lich HP 380 → 420 and attack 13 → 14 — the smart bot won 66%, now about 55% (random bot about 2%).
  - Vampire attack 6 → 5 and lifesteal 40% → 30% — unlocking the Mansion dropped the smart bot to 35%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
