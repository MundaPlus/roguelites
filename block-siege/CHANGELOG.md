# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the falling-block combat design is now playable.
  - Pure well logic with SRS rotation and wall kicks, hold, next queue, ghost piece, lock delay, garbage and locked cells (`src/well.ts`).
  - Damage of 1/3/6/10 units per clear, T-spins, back-to-back, combos and perfect clears (`src/fight.ts`).
  - 16 shapes (7 standard, 8 extra, 1 enemy junk), 6 special blocks with 2 levels, 18 enemies over 3 acts with elites and bosses, 8 enemy move types, 16 relics, 6 events.
  - Map with fights, elites, shops, campfires, events and treasure. Armory unlocks paid with shards. Run and meta saves in `localStorage`.
  - Keyboard with DAS/ARR settings, touch gestures and on-screen buttons. Debug API (`?debug`, `window.debug`) and a placement bot (`src/bot.ts`).
- Balance after sim runs (100 runs per bot): random bot 0%, noisy bot 0%, slow good bot 18%, good bot 61%.
  - Ice changed from a stacking freeze to a non-stacking half-speed slow — stacked freezes stopped every enemy attack.
  - Heart heal cut from 4 to 2, and the starter L carries ice instead of heart — hearts healed all damage.
  - More hit moves on every enemy, hit damage ×1.75 in act 2 and ×2.4 in act 3, Lich 150 HP, Storm Dragon 215 HP — the good bot lost almost no HP in later acts.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
