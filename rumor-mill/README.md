# Rumor Mill

New-concept roguelite: rumors that change as they spread. Status: playable.

Plant a rumor. Watch it change from mouth to mouth. Topple the duke.

## How to play

1. Write a rumor from word tiles: a verb, an object and an optional tone word. The subject is always the town's target, for example "the mayor stole the grain".
2. Pick an agent and tap a person. The board and the side panel show how the rumor changes at the next 1–2 people, who will believe it, and if a guard will trace it.
3. Tap the person again (or press Plant) to plant the rumor. Each agent plants once per town. You can plant once per turn.
4. Press Spread. Every rumor moves one link.
5. Reach the goal share of believers before the turns run out.

Keys: arrows move the selection, `P` plants, `Enter` or `Space` spreads, `1`–`5` pick an agent, `V` `O` `T` cycle verb, object and tone word, `Esc` clears the selection.

## Rules

- A person who comes to believe a claim tells it to all neighbors on the next turn. Only believers pass rumors on.
- A person believes a claim when 2 different people told them the same claim. The same claim means the same verb, object and "NOT". The tone word does not count.
- A big rumor (tone word "surely" ❗) counts as 2 sources. One teller is enough.
- Dashed links are weak. They carry only big rumors.
- Each person changes the rumor when they hear it. The rule depends only on the trait, so you can plan:

| Trait | Change |
|---|---|
| 🙂 Townsfolk | Drops "surely". |
| 🗣️ Gossip | Sets the tone word to "surely". A gossip believes at once. |
| 🧐 Skeptic | Cuts one word: the tone word, else the object, else the verb (the rumor dies). |
| 🛡️ Loyalist | Turns the claim around: adds or removes "did NOT". |
| 🌀 Muddler | Swaps the object along the ring 🌾 → 🪙 → 🐴 → 🪣 → 🌾. |
| 💂 Guard | No change. Traces the rumor back to your agent, 1 step per turn. |

- Each label under a person shows the claim that they hold. A struck word is a word that they removed. A marked word is a word that they changed or added.
- When a guard trace reaches your agent, the agent is exposed and you lose 1 cover ❤️.
- From town 3, a rival 🦊 whispers the "did NOT" version of your last rumor to the best-linked free person. People who believe "did NOT" are defenders. They do not count for you.

## Content

| Words | Perk |
|---|---|
| 🫳 stole, 🙈 hid, 🌾 the grain, 🪙 the gold | Start words. No perk. |
| 🐴 the horses, 🪣 the well | Only from muddlers. |
| 🔥 burned | Wildfire: crosses weak links. Guards trace it 2 steps per turn. |
| ✒️ forged | Sly: guards trace it 1 step every 2 turns. |
| 🤝 bribed | Shocking: loyalists do not turn it around (unlock). |
| ✉️ the letters | Sealed: skeptics and muddlers cannot change it. |
| ❗ surely | Big: counts as 2 sources and crosses weak links. |
| 🤫 they whisper | Quiet: guards do not trace it (unlock). |

| Agent | Effect |
|---|---|
| 🕵️ Informant | Plants the rumor as written. You start with 3. |
| 🎻 Bard | Adds "surely" when the rumor has no tone word (unlock). |
| 👤 Ghost | Guard traces that reach it fail (unlock). |

| Town | Target | People | Guards | Extra | Goal |
|---|---|---|---|---|---|
| Millbrook | 🎩 the mayor | 26 | 1 | | 45% in 7 turns |
| Ashford | 📿 the priest | 30 | 2 | muddlers | 52% in 7 turns |
| Saltmarsh | ⚓ the captain | 34 | 2 | rival every 3 turns | 58% in 8 turns |
| Ironvale | 💼 the banker | 38 | 3 | rival every 3 turns | 62% in 8 turns |
| Duke's Seat | 👑 the duke | 42 | 4 | rival every 2 turns | 68% in 9 turns |

The town graph comes from the run seed. People are placed with a spacing pass. Links never cross, so the graph stays readable on a phone.

## Run loop

1. 5 towns. Win a town when the believers reach the goal.
2. A failed town costs 1 cover. Failing the last town ends the run. At 0 cover the run ends.
3. After each town: pick 1 of 3 rewards (word, agent, cover), then buy from the market with coins.
4. Score: 100 per town won, plus believers and spare turns. A full win adds 300 and 50 per cover left.

## Meta progress

Towns won over all runs unlock the Bard (2), "they whisper" (4), the Ghost (7) and "bribed" (10). The title screen shows the stats and the unlocks.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Traits, words, agents, towns, unlocks |
| `src/rumor.ts` | Claims, claim key, the mutation rules, claim text with change marks |
| `src/town.ts` | Seeded town generator, plant, the pure spread step, traces, rival, preview |
| `src/bot.ts` | Weak random bot and a lookahead bot |
| `src/run.ts` | Run state, rewards, market, score, save data (`rumor.run`, `rumor.meta`) |
| `src/app.ts` | Screens, SVG graph with HTML labels, animation, input, debug API |
| `src/sfx.ts` | WebAudio synth |

`spread(town)` returns a new town, the events and the moves. The preview and the bot use the same function, so the preview is exact.

## Debug

Open the game with `?debug` (add `&fast` to skip animation waits). The console then has `window.debug`:

- `debug.step()`: one bot action. On the title it starts a run. In a town the lookahead bot plants (if it helps) and spreads one turn. On the reward screen it picks, buys, then goes on. Returns `'busy'` during an animation.
- `debug.state()`: screen, town, turn, believers, cover, coins, words, agents, end result.
- `debug.win()`, `debug.coins(n)`, `debug.townsWon(n)`.
