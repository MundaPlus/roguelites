# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `public/words.txt`, `README.md`) — the word combat design is now playable.
  - 4×4 letter grid with letter values, a weighted letter bag with 5–7 vowels, and a "Qu" tile.
  - Bundled dictionary of 52,167 words from `/usr/share/dict/american-english`, prefix-compressed (213 KB).
  - 8 gems, 18 books, 5 potions, 18 enemies over 3 chapters with elites and bosses. Enemies lock, crack, poison, scramble and steal tiles.
  - Map with fights, elites, shops, events and reading rooms. Archive unlocks paid with ink.
  - Mouse, touch and keyboard input (type to select tiles). Debug API (`?debug`, `window.debug`) with a word-search bot.
- Balance after sim runs (200 runs per bot): enemy HP ×2 / ×2.7 / ×3.4 and attack ×1.5 / ×1.8 / ×2.1 per chapter — at base values a bot that played random words won 79%.
  - Weak bot (random word): 0% wins. Good bot (best of 6 random words of up to 6 tiles): 52.5%. Strong bot (best of 6 words, any length): 94.5%.
  - Amethyst and Diamond add to one multiplier instead of stacking, and the gem tile chance is 3% per gem (at most 25%) — stacked gems made damage explode.
  - Paper Bat attack lowered to 2 and later group members start 1 turn later — two bats that hit every turn from turn 1 were too harsh.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
