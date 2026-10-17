# Changelog

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`). The cellular-automata design is now playable.
  - Two-color life engine on typed arrays (16×14 board, 12 generations per turn): each color follows its own birth and survival rule. Touching colors both die. Cells that reach the back row or sit in the enemy zone at the end of a turn hit the core.
  - Ghost preview of 1, 4, 12 or 24 generations with a path trail and a damage line. Animated generations with fast-forward and skip.
  - 15 templates with rotate and mirror (4 at the start, 3 unlocks), 11 rule cards (4 unlocks), 16 enemy colonies with 11 different rule sets over 3 acts, with elites and bosses. Rules show in plain words.
  - Tutorial fight with a coach box (glider, block, blinker, preview). Run map with rewards, a fork (elite or lab) and a boss per act. Spore Lab meta unlocks.
  - Mouse, keyboard and two-tap touch placement. Save and continue (`life.run`, `life.meta`). Debug API (`?debug`, `window.debug`).
- Balance after bot runs (headless sim of full runs, 200 random runs, 80 runs per smart bot): random placer 0%, smart bot with 10 tries 26%, smart bot with 30 tries 43%.
  - Board height 18 → 14 and 12 generations per turn: on the tall board almost no attack reached a core and fights hit the turn limit.
  - Added invader damage (cells in the enemy zone at the end of a turn, at most 8 per turn): walls stopped every attack before.
  - Removed explosive rules (Maze, Seeds, B3/S234) from enemies and cards: Maze killed the player in 4 turns. Stubborn now adds survival at 6, Lone Root survival at 0.
  - Forward Zone reaches 1 row instead of 2: with 2 rows the player zone touched the enemy zone.
  - Enemy AI caution 0.6 (more attacks). Assimilator core 22 → 18, Ink Stain core 20 → 17: these two caused most smart-bot losses.

## 2026-10-17
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
