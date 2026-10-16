# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the solitaire combat design is now playable.
  - Golf-style fights against enemy tableaus: locked, armored, bomb, gold and face-down cards. Mana by suit, one-step undo.
  - 17 spells, 3 heroes with own spell books, 16 relics, 4 potions, 18 enemies over 3 acts with elites and bosses. The Dealer is the final boss.
  - Map with fights, elites, events, treasure, shops and campfires. Hero unlocks paid with gems. Run and meta saves in `localStorage`.
  - DOM cards with CSS transitions, WebAudio sounds, floating numbers. Mouse, keyboard and touch input. Debug API (`?debug`, `window.debug`).
- Balance after sim runs (`src/bot.ts`): 2 mana per cleared card instead of 1, strikes and bombs +2 per act, faster act 2 and 3 timers, loss damage 3 + 2 per act + cards left, lower hero HP, less gold and stock growth — at first values the smart bot won 0–18% of runs, and after the mana change it won over 90%. Now it wins 52–59% and the weak bot 0%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
