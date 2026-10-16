# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the minesweeper roguelite design is now playable.
  - Clues show the sum of monster strengths. Fights cost HP, kills and opened tiles give XP, manual level-ups refill HP.
  - Logic solver (domain sets, bound checks, local backtracking, monster counts) and a generator that regenerates floors until the boss and ≥96% of tiles are solvable without guessing. First click is always safe.
  - 10 floors, 9 normal monsters, ghost, gazer, mimic, 10 bosses, 4 items plus keys, chests and coins, 14 boons, a merchant, 5 heroes unlocked with souls, a daily seed.
  - Markers by right-click, long press or number keys. Mouse, keyboard and touch input. Debug API (`?debug`, `window.debug`).
- Balance after bot sims: monster XP ×2, XP need 6 + 8·(L−1) + 0.25·(L−1)², 4 tiles per XP — at 1 XP per tile and a linear curve the smart bot won 100%, at 1× monster XP it died on floor 1 every run.
- Knight starts with one Thick Skin instead of Thick Skin + Chainmail — the smart bot won 90% with it (wanderer 43%).
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
