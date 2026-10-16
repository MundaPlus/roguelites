# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the team auto-battler design is now playable.
  - 45 critters in tiers 1–6 with 7 triggers (buy, sell, faint, start of battle, hurt, end of turn, friend summoned), 4 summoned tokens, 11 foods with 6 perks.
  - Shop with 10 gold, reroll, freeze, merges to level 2 and 3 with a bonus critter on level up, and a line of 5 with drag and drop.
  - Pure battle sim with one trigger queue in a fixed order and an event log, replayed with animations, speed and skip.
  - Opponents built by a bot with the same gold per round, and a champion team for the last trophy.
  - Meta stars unlock the Tide and Jungle packs. Save and continue, help, menu, mute, keyboard and touch input.
  - Debug API (`?debug`, `window.debug`) for bot tests.
- Balance after sim runs: 6 lives instead of 5, a loss costs 1/2/3 lives from rounds 1/5/9 instead of 1/4/8, champion bonus +1 gold instead of +2 — the good bot won only 20–25% before. Now the good bot wins about 32%, a random bot never wins.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
