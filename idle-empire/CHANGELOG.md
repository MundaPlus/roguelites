# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the incremental idle design from the roguelites plan is now playable.
  - Own big number class (mantissa and exponent) with short scale and scientific formatting.
  - 8 generator tiers in a chain, sets of 10 with a bonus, decrees, 16 upgrades.
  - 3 prestige layers (Ascension, Dynasty, Transcendence) with 31 skill nodes, conquest regions and a 5-stage Wonder as the final goal.
  - Run paths after each prestige (10 blessings, 8 curses, 6 goals) and 6 challenges.
  - Autobuyers, auto-prestige, offline progress with a cap and a summary, autosave, export and import.
  - Mouse, keyboard and touch input. Debug API (`?debug`, `window.debug`) for bot tests.
- Balance after sim runs: global multipliers now act on gold income only. When they acted on every tier, the chain multiplied them 8 times and gold grew without limit (1e1000000 in 10 minutes).
- Balance: ascension at 1e40, dynasty at 1e120, transcendence at 1e350, Wonder at 1e350–1e700, so a good bot ascends after 7.5 min and finishes after about 2.4 h. At 1e10 the first ascension came after 2 minutes.
- Balance: Corruption raises the cost growth instead of a flat ×1000. The flat cost could lock a run with no gold and no income. Clicks always give at least 1 gold for the same reason.
- Balance: Sigil and star passive bonus power 1.5 (was 2 and 3) and Starborn costs 150 sigils (was 60). The dynasty layer took only 17 minutes before.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
