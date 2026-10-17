# Dungeon Director

New-concept roguelite: keep the hero in the fun zone. Status: playable.

You do not fight. A hero bot walks through the dungeon. You place the next room in front of it. Keep the hero's fun on the target curve, not too easy and not too hard.

## How to play

1. Each run gives you a hero. Read its profile: what it likes, what it hates.
2. Each turn, pick 1 of 3 room cards. The hero walks into that room.
3. Each card shows its expected effect on **this** hero: the fun value against the target, and the change to boredom 💤, stress 😰, delight ✨ and HP ❤️.
4. Hover or focus a card to see its dot on the fun graph.
5. Room 9 is the boss. Pick 1 of 3 bosses.
6. Keys: `1`–`3` place a card, `Enter` continues, `D` shows the cards left, `H` help, `M` mute, `Esc` menu. Mouse and touch work on all buttons.

## Rules

- **Fun** of a room = 12 + danger, loot and surprise times the hero's weights, minus rest. The shown fun is 35% the last fun and 65% this room, so a ramp needs planning.
- **Target curve** (8 rooms + boss): 25, 35, 45, 55, 68, 38, 52, 70, 90. That is a build-up, a short release and a peak at the boss.
- **Points** per room: full points when the fun is within 8 of the target, zero at 24 or more. The boss counts triple. Delight adds a little on top.
- **Mood meters** (0–100):
  - 💤 Boredom grows when the fun is under the hero's bore line, when the same room kind comes twice in a row, and for some heroes after rest or rooms with no loot. At 100 the hero leaves.
  - 😰 Stress grows with damage, with monster power above the hero's nerve, and with low HP. Rest and delight lower it. At 100 the hero quits.
  - ✨ Delight grows with the things the hero likes. It decays by 30% per room. It lowers boredom and stress.
  - ❤️ HP at 0: the hero dies.
- A leaving, quitting or dead hero ends the run.
- **Rating.** Each dungeon gets 1–5 ★ from the share of fit (30, 45, 60, 75, 88%). Under 3★ costs 1 of 2 guild trust 🤝. At 0 trust you are fired.
- Monster power grows by 36% per dungeon. Loot raises gear 🗡️, and gear lowers damage and stress.
- Each card comes at most once per dungeon. The 2 cards you do not pick go back under the pile.
- Between dungeons the hero gets 30% HP back. Stress drops by 40% and boredom by 50%.
- Win: finish 5 dungeons.

## Heroes

The same card is good for one hero and bad for another. Example values for room 5 of dungeon 2:

| Hero | Likes | Campfire 🔥 | Arena ⚔️ | Unlock |
|---|---|---|---|---|
| 🛡️ Cautious Knight | rest, small fights. Big monsters stress him. | +13 ✨, −10 😰 | +39 😰 | free |
| 💰 Greedy Rogue | loot. Rooms with no loot bore her. | +28 💤 | +30 😰, +6 ✨ | free |
| 🪓 Reckless Barbarian | big fights. Rest bores him. Traps stress him double. | +40 💤 | +8 😰, +12 ✨ | free |
| 🔮 Curious Mage | surprise. A repeat room kind gives +14 💤. Frail. | +14 💤 | +43 😰 | 8 ⭐ |
| 🎻 Story-loving Bard | +14 ✨ when the fun is on the curve. | +16 💤 | +32 😰, +13 ✨ | 20 ⭐ |

## Room cards

Stats: ⚔️ danger, 💰 loot, ❓ surprise, 🛏️ rest.

| Card | Kind | ⚔️ | 💰 | ❓ | 🛏️ | Note |
|---|---|---|---|---|---|---|
| 🕸️ Empty Hall | empty | 0 | 0 | 1 | 2 | starter |
| 🐀 Rat Nest | fight | 2 | 1 | 1 | 0 | starter ×2 |
| 👺 Goblin Camp | fight | 4 | 2 | 2 | 0 | starter ×2 |
| 💰 Treasure Chest | loot | 0 | 5 | 2 | 0 | starter |
| 🔥 Campfire | rest | 0 | 0 | 0 | 6 | starter |
| ⚙️ Spike Trap | trap | 3 | 0 | 4 | 0 | starter |
| 🗿 Strange Altar | mystery | 0 | 6 | 6 | 1 | starter. 40%: curse (⚔️5) |
| 🧌 Troll Bridge | fight | 6 | 3 | 2 | 0 | starter |
| 🗡️ Ambush | fight | 5 | 1 | 7 | 0 | shop |
| 🏺 Old Vault | loot | 1 | 8 | 2 | 0 | shop |
| ⛲ Healing Spring | rest | 0 | 0 | 2 | 9 | shop |
| 📦 Mimic | fight | 4 | 5 | 8 | 0 | shop |
| 📚 Quiet Library | rest | 0 | 1 | 5 | 4 | shop |
| 🧙 Merchant | loot | 0 | 4 | 3 | 3 | shop |
| ⚔️ Arena | fight | 7 | 2 | 3 | 0 | shop |
| 🐉 Drake Lair | fight | 8 | 6 | 3 | 0 | 6 ⭐ |
| 🌀 Portal Maze | mystery | 1 | 2 | 9 | 0 | 6 ⭐. 30%: monster (⚔️4) |
| 🍄 Spore Cave | trap | 2 | 1 | 6 | 1 | 12 ⭐ |
| 💎 Gem Mine | loot | 2 | 7 | 4 | 0 | 12 ⭐ |
| 👻 Haunted Crypt | fight | 5 | 3 | 8 | 0 | 20 ⭐ |
| 🍺 Hidden Inn | rest | 0 | 2 | 4 | 7 | 20 ⭐ |
| 🕳️ Pit of Doom | trap | 7 | 2 | 5 | 0 | 30 ⭐ |

Bosses (3 of 6 per dungeon): 🐲 Red Dragon, 💀 Lich King, 🦑 Deep Horror, 🗿 Iron Golem, 🕷️ Spider Queen, 👹 Ogre Chief.

## Run loop

1. A new run picks a hero from the unlocked ones (not the same as last run).
2. Each dungeon: 8 rooms from your deck, then the boss.
3. Review: stars, the fun graph of the dungeon and renown 🏆.
4. Shop: buy room cards, 🩹 healing (+40 HP), 🍵 calming tea (−30 stress and boredom), 🗡️ gear (+3) or ✂️ cut a card (deck stays at 10 or more).
5. Win after 5 dungeons. Score = room points + 15 per star + 150 for a win + 25 per trust left.

## Meta progress

Each run gives stars ⭐: the sum of the dungeon stars, plus 5 for a win. Stars unlock 2 heroes and 7 room cards. The title screen shows stars, runs, wins and the best score.

## Balance

A headless sim plays 200 runs per hero (1000 runs per bot) with the starter unlocks.

| Director bot | How it picks | Wins | Avg. dungeon reached |
|---|---|---|---|
| Random | random card | 0% | 1.5 |
| Greedy | best points for this room only | 8% | 1.9 |
| Planner | rolls out the rest of the dungeon with the cards left, and keeps stress, boredom and HP safe | 54% | 3.8 |

The greedy bot hits the curve best (86% fit) but runs the hero into stress and damage. Most of its runs end with a quit or a death. With all cards unlocked the numbers stay close (0%, 6%, 53%).

## Code

| File | Contents |
|---|---|
| `src/hero.ts` | Pure hero step `enterRoom(hero, card, level, step, rng)`. With `rng = null` it gives the expected result for the card preview and the bots. |
| `src/run.ts` | Run state, deck and hand, dungeon rating, shop, score, save data |
| `src/bot.ts` | Random, greedy and planner directors. Shop choices. |
| `src/data.ts` | Room cards, bosses, hero types, target curve, thought lines |
| `src/app.ts` | Screens, fun graph (SVG), path, cards, animations, input, debug API |
| `src/sfx.ts` | WebAudio sounds |

Save keys: `director.run` and `director.meta`.

## Debug

Open the game with `?debug` (add `&fast` to skip animations). The console then has `window.debug`:

- `debug.step()`: one action of the planner bot. It returns `'busy'` while the hero walks.
- `debug.state()`: screen, hero, dungeon, step, HP, mood meters, fun, hand, renown, trust, results, end and score.
- `debug.renown(n)`, `debug.stars(n)`.
