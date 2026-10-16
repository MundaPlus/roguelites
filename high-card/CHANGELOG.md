# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the poker-hand design from the roguelites plan is now playable.
  - DOM cards with CSS transitions, and a step-by-step chips × mult count with floating numbers and sounds.
  - 10 hand types with levels, 67 jokers (9 unlock over time), 10 planets, 24 tarots, 4 pack types.
  - Card enhancements (6), seals (4) and editions (3). Joker editions, Blueprint and Brainstorm, so joker order matters.
  - 8 antes with small, big and boss blinds. 16 boss rules plus 2 final bosses. Endless mode after the win.
  - 6 decks that unlock with the best ante. Meta stats on the title screen. Save and continue in `localStorage`.
  - Mouse, keyboard and touch input. Help modal, menu, mute. Debug API (`?debug`, `window.debug`) for bot tests.
- Balance after bot runs: base targets lowered to 300 / 600 / 1,100 / 2,200 / 4,000 / 6,500 / 10,000 / 15,000 — with the Balatro curve (up to 50,000) the smart bot won 1% of runs. Now: random bot 0%, greedy bot 2%, smart bot 36%.
- The Needle now has half the boss target and Violet Vessel ×1.5 instead of ×3 — one-hand and final bosses ended most smart-bot runs.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
