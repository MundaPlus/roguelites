# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the swipe-chain design is now playable.
  - 6×6 board with 8-direction drag chains, gravity refill and auto-shuffle. Swords chain with enemies.
  - 12 enemies with poison, fuses, regen, summons and armor. 4 bosses on floors 5, 10, 15 and 20.
  - XP, coin and forge bars: 9 level-up picks, 12 gear types in 4 tiers and 4 slots, 5 forge picks.
  - 4 classes with 8 skills. Classes unlock with gems from runs.
  - Mouse, touch and keyboard input. Run save and continue. Debug API (`?debug`, `window.debug`).
- Balance after sim runs (`src/bot.ts`):
  - Enemy spawn weight 15–25 → 9–17 and board cap 13 → 10 — the smart bot died by floor 5 in every run.
  - Poison is now 1 damage per turn for N turns, and enemy attack grows every 6 floors (was 4) — poison stacks from the Brood Queen killed most smart runs on floor 5.
  - Dragon HP 90 → 100, Mage HP 42 → 40 and no XP bonus — the smart Mage won 70% of runs.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
