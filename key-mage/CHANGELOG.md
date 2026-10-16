# Changelog

## 2026-10-16
- Added a difficulty choice on the title screen: Relaxed, Normal and Swift (`src/data.ts`, `src/battle.ts`, `src/run.ts`, `src/app.ts`, `src/style.css`). Many players type 35–45 WPM, and Normal was too hard for them.
  - Difficulty scales enemy speed, spawn and wave pace, boss timers, word-change and shield timers, and enemy HP. Relaxed also has less growth per act, 1 less shield word and no longer words in act 3.
  - The meta save keeps the choice, plus best score and wins per difficulty. The end screen shows the difficulty.
  - Sim (300 runs): Relaxed: 36 WPM bot 41%. Normal: 55 WPM bot 42% (no change). Swift: 84 WPM bot 44%.
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the typing design is now playable.
  - Real-time Canvas field with 3 lanes. Typing locks the closest matching enemy. Typos break the combo. Combo and accuracy scale damage.
  - 7 spell words: elements `fire`, `frost`, `volt`, the shape `lance`, and `nova`, `wall`, `mend`. 19 runes.
  - 23 enemy types over 3 acts (with 3 boss missiles): shields, splitting slimes, decoys, changing words, a support cultist, 3 elites and 3 bosses with phrases and missiles.
  - 717 hand-written words in 4 length tiers (checked: lowercase, no clash with spell words).
  - Map with fights, elites, shrines, shops and bosses. Grimoire unlocks paid with shards. Save and continue.
  - Keyboard, mouse and touch input with an on-screen keyboard. Debug API (`?debug`, `window.debug`).
- Balance after sim runs (300 runs per bot):
  - Fights now come in waves of quick bursts. With even spawns, a 55 WPM bot never lost HP in normal fights.
  - Boss minions are capped at 2–3 alive, and boss HP no longer scales with the act. Before, a 48 WPM bot got stuck in boss fights for over 10 minutes.
  - Enemy speed ×1.1 (+25% per act), HP +60% per act, waves +1.5 enemies per act, boss missiles every 4.1 s. Result: weak bot 0%, mid bot 3%, good bot 42%, fast bot 98%.
  - Grimoire costs raised to 40–70 shards. At 12–24, one won run unlocked everything.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
