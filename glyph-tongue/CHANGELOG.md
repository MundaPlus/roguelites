# Changelog

## 2026-10-17
- Fixed the notebook Log tab count, which stayed at its old value during a fight (`src/app.ts`) — the fight refresh redrew the log list but not the tab label.
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the language-learning design from the README is now playable.
  - Every run deals 3 elements, 2 targets and 3 modifiers (from pools of 6 / 4 / 5) to 8 SVG runes. The grammar has 3 base rules (target order, modifier order, default target) and 2 special rules from a pool of 5 (cancel pair, resonance, stutter, head word, taboo).
  - A pure spell parser, a cast log that names the source rune, the targets and the amount of every effect, and grey "silent" runes.
  - Notebook with a guess list and a note field per rune, grammar notes, the full cast log and a lexicon. It is saved with the run. Guesses show on the rune keys.
  - 2 safe test rooms with dummies at the start, study halls, libraries, shops, campfires, 3 acts with 18 foes, 3 elites and 3 bosses, 8 charms, hint scrolls and 5 meta perks paid with ink.
  - Canvas stage with bolts, floating numbers and shake. WebAudio sounds. Mouse, keyboard and touch input. Debug API (`?debug`, `window.debug`).
  - A learning bot (`src/bot.ts`) keeps a hypothesis table per rune and per rule and drops every hypothesis that does not match a cast result.
- Balance after sim runs (500 runs per bot): random bot 0%, learner 49%, oracle 67%.
  - Foes gain +2 attack per turn from turn 9 (elite 12, boss 14) — the first learner runs could stall forever when no damage rune was known yet.
  - Test rooms cut from 8 to 6 casts, study from 6 to 5 — the learner knew almost everything before the first real fight.
  - Act 2 and 3 foes get ×1.05 HP and ×1.1 attack — the learner won 54%, near the top of the 30–60% target.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
