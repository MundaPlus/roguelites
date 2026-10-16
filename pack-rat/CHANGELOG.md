# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the backpack-builder design is now playable.
  - 9 × 7 grid with polyomino items, rotation, star cells that buff neighbors, and bags that add cells and carry their items.
  - 49 items and 11 bags: neutral ones plus own pools for 3 classes (Knight, Herbalist, Mage).
  - Shop with 5 cards, reroll, lock and sell. Stash for 10 items.
  - Pure fixed-step fight simulation (stamina, block, poison, crit, stun, thorns, rage, potions, fatigue), replayed with bars, cooldown bars and floating numbers.
  - 5 lives, 10 trophies, generated ghost opponents per round, the Rat King as the final fight.
  - Renown meta: unlock 2 classes and 6 items. Save and continue in `localStorage`.
  - Drag and drop with mouse and touch, rotate with `R`, right-click or double tap. Debug API (`?debug`, `window.debug`).
- Balance after bot runs (30 runs per class, smart vs. weak bot): smart bot wins 50–77% of runs, weak bot 0–7%.
  - Round 1 ghosts get only their start items, round 2 ×0.5 and round 3 ×0.75 of your income. Later rounds rise from ×1.2 by 0.11 per round. Round 1 is now won 93–100% (smart) and 73–97% (weak) — before this, about half of all runs lost round 1.
  - Poison loses 1 stack after each tick. Herbalist starts with an Apple instead of a Mushroom. Knight also starts with a Whetstone — the Herbalist start build beat every other start build.
  - Rat King budget ×1.5 and +30 HP. Ghosts try up to 140 picks.
  - Mage nerfs: Wand cooldown 1.5 → 2.2 s, Fire Orb 2.6 → 3.2 s and damage 5 → 4, Spellbook 3.2 → 3.6 s and damage 4 → 3, Star Staff 2.2 → 2.6 s, Mana Crystal 20% → 12%, Spell Pouch no longer speeds up items — free magic made the Mage the strongest class. The Mage is still the strongest (77% for the smart bot).
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
