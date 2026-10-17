# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the nonogram design is now playable.
  - Line solver with a solvability check. Random grids are generated again and pictures get given cells until no guessing is needed.
  - 55 hand-made pixel pictures (5×5 to 15×15) that reveal in color. 21 monsters with 4 traits, 8 floor guardians.
  - Doors: monster, chest, key, mystery, rune, shrine, shop, vault. 7 spells, 14 charms.
  - Meta unlocks (4 spells, 2 picture packs), a gallery, save and continue.
  - Mouse drag, touch drag, keyboard cursor. Debug API (`?debug`, `window.debug`) with a line-solver bot.
- Balance after sim runs: start HP 10 → 8, mana only from clean solves (+1), Peek 1 → 2 mana, Insight 2 → 3, damage grows with the floor, guardians no longer heal, less gold and fewer charms — at first a careful bot won every run.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
