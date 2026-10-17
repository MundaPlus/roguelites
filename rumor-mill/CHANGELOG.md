# Changelog

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the rumor design is now playable.
  - Word-tile rumors with deterministic trait rules: gossip adds "surely", skeptic cuts a word, loyalist adds or removes "did NOT", muddler swaps the object, townsfolk drop "surely".
  - Belief from 2 sources of the same claim, big rumors count as 2, weak links carry only big rumors, guard traces, a rival counter-rumor from town 3.
  - SVG graph with no crossing links, a label per person with struck and marked words, a 2-turn plant preview, trace lines with turns left.
  - 5 towns, 12 words, 3 agent types, rewards, a market, cover, meta unlocks, save and continue, help, menu, mute, keyboard and touch input.
  - Debug API (`?debug`, `window.debug`) and a lookahead bot.
- Balance after sim runs (40–50 runs per bot):
  - At first every hearer passed rumors on. Almost everyone came to believe, and a random bot won most towns. Now only believers pass rumors on.
  - Townsfolk now drop "surely", and "surely" is no longer a start word. Before, one gossip set off the whole town.
  - "burned" no longer makes a rumor big. It crosses weak links instead. "I swear" was removed, and "bribed" took its loyalist-proof perk.
  - Denser graphs (about 2 links per person) and 3 start agents. With sparse graphs, even the lookahead bot reached only about 25%.
  - Goals now rise from 45% to 68%, and town wins pay fewer coins. The lookahead bot snowballed with rewards and won every run. Result: the weak bot wins 0%, the lookahead bot wins 56%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
