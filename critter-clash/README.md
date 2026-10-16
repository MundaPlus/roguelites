# Critter Clash

Team auto-battler roguelite (like Super Auto Pets). Status: playable.

## How to play

1. Each round you get 💰 10 gold. A critter costs 3, a food costs 3, a reroll costs 1. Gold does not carry over.
2. Tap a shop critter, then a team slot, to buy it there. Or drag it to the slot. The **Buy** button puts it at the back.
3. Your line has 5 slots. The slot on the right is the front. Drag critters, or use **◀ Back** and **Front ▶**, to change the order.
4. Buy or drag a copy onto a critter with the same name to merge it.
5. Drag a critter onto **Sell**, or select it and press Sell.
6. Select a shop slot and press **❄️ Freeze** to keep it for the next round.
7. Press **End turn**. The battle runs on its own. Use **Speed** or **Skip** to watch it faster.

Keys: `1`–`5` shop critters, `6`–`7` food, `Shift`+`1`–`5` team slots, `B` buy or feed, `S` sell, `F` freeze, `R` reroll, `←` `→` move, `Space` end turn (in a battle: speed), `Enter` skip or continue, `M` mute, `H` help, `Esc` menu.

## Rules

- **Merge.** A merge gives +1/+1 over the higher stats of the two. 3 copies make level 2. 6 copies make level 3. Abilities scale with the level.
- **Level up.** A level up adds one critter of the next tier to the shop.
- **Sell** gives 1 gold per level.
- **Battle.** The two front critters hit each other at the same time. A critter with 0 HP faints. The battle ends when one line is empty. Both lines empty is a draw.
- **Trigger order.** Every trigger goes into one queue. The triggers that one action causes are sorted: highest attack first, then your team, then the front first.
- **Result.** A win gives +1 🏆. A loss costs ❤️ 1 in rounds 1–4, 2 in rounds 5–8 and 3 after that. A draw costs nothing. You start with 6 lives.
- **Goal.** Win 10 trophies. The battle for the tenth trophy is against a champion team.
- **Tiers.** The shop shows tier 1 in rounds 1–2. A new tier joins every 2 rounds, up to tier 6 from round 11. The shop has 3 critters in rounds 1–2, 4 in rounds 3–4 and 5 after that.

## Triggers

| Trigger | When |
|---|---|
| 🛒 Buy | You buy the critter, also on a merge. |
| 💰 Sell | You sell the critter. |
| 💀 Faint | The critter faints in a battle. |
| ⚔️ Start of battle | Before the first attack. |
| 💢 Hurt | The critter takes damage and lives. |
| 🌙 End of turn | You press End turn. |
| ✨ Friend summoned | A new critter joins the team (a buy in the shop, or a summon in a battle). |

## Critters

Stats and abilities at level 1. Level 2 and level 3 multiply the numbers by 2 and 3.

| Tier | Critter | Stats | Trigger | Ability | Pack |
|---|---|---|---|---|---|
| 1 | 🐜 Ant Scout | 2/1 | Faint | Give a random friend +2/+1. | Meadow |
| 1 | 🐭 Field Mouse | 2/1 | Sell | Gain +1 gold. | Meadow |
| 1 | 🦗 Hopper | 1/2 | Faint | Summon a 1/1 Hop Spirit. | Meadow |
| 1 | 🐌 Moss Snail | 2/2 | Buy | Give 2 random friends +1 HP. | Meadow |
| 1 | 🦆 Puddle Duck | 2/3 | Sell | Give the shop critters +1 HP. | Meadow |
| 1 | 🐝 Busy Bee | 1/3 | End of turn | Give the friend ahead +1 attack. | Meadow |
| 1 | 🐟 Guppy | 2/2 | Hurt | Gain +1 attack. | Tide |
| 1 | 🦎 Gecko | 1/2 | Start of battle | Deal 1 damage to 2 random enemies. | Jungle |
| 2 | 🦔 Bramble Hog | 3/2 | Faint | Deal 2 damage to all other critters. | Meadow |
| 2 | 🐦 Robin | 2/3 | Buy | Give 2 random friends +1 attack. | Meadow |
| 2 | 🐸 Pond Frog | 2/4 | Start of battle | Give the friend ahead +2 attack. | Meadow |
| 2 | 🦇 Dusk Bat | 2/3 | Start of battle | Lower the front enemy's attack by 2. | Meadow |
| 2 | 🐀 Tunnel Rat | 3/2 | Friend summoned | Give the new friend +1 attack. | Meadow |
| 2 | 🐿️ Nut Squirrel | 1/4 | End of turn | If you kept gold, give a random friend +1/+1. | Meadow |
| 2 | 🐡 Puffer | 2/3 | Hurt | Deal 2 damage to a random enemy. | Tide |
| 2 | 🐒 Banana Monkey | 1/3 | End of turn | Give the front friend +1/+1. | Jungle |
| 3 | 🦉 Night Owl | 3/4 | Sell | Give a random friend +2/+2. | Meadow |
| 3 | 🐢 Old Turtle | 2/5 | Faint | Give 1 friend behind a 🥜 Shell. | Meadow |
| 3 | 🦊 Red Fox | 4/3 | Start of battle | Deal 3 damage to the enemy with the least HP. | Meadow |
| 3 | 🐑 Woolly Sheep | 2/2 | Faint | Summon two 2/2 Lambs. | Meadow |
| 3 | 🐕 Farm Dog | 3/3 | Friend summoned | In battle: gain +1/+1. | Meadow |
| 3 | 🦨 Stinker | 3/5 | Start of battle | The enemy with the most HP loses 33% of its HP. | Meadow |
| 3 | 🦀 Rock Crab | 3/1 | Buy | Gain 50% of the HP of your healthiest friend. | Tide |
| 3 | 🐊 Swamp Croc | 3/4 | Start of battle | Deal 3 damage to the last enemy. | Jungle |
| 4 | 🐻 Brown Bear | 4/6 | Hurt | Give the friend behind +1/+1. | Meadow |
| 4 | 🦬 Plains Bison | 4/4 | End of turn | Gain +1/+1. | Meadow |
| 4 | 🐺 Grey Wolf | 5/3 | Faint | Give all friends +1 attack. | Meadow |
| 4 | 🦅 Sky Eagle | 4/4 | Start of battle | Deal 2 damage to the 2 enemies at the back. | Meadow |
| 4 | 🐐 Hill Goat | 3/6 | Faint | Give the 2 friends behind +1/+2. | Meadow |
| 4 | 🦭 Harbor Seal | 3/5 | Hurt | Give 2 random friends +1/+1. | Tide |
| 4 | 🐍 Viper | 4/3 | Start of battle | Deal 1 damage to every enemy. | Jungle |
| 5 | 🦁 Sun Lion | 5/6 | Start of battle | Gain +50% attack. | Meadow |
| 5 | 🦏 Iron Rhino | 5/8 | Start of battle | Deal 4 damage to the front enemy. | Meadow |
| 5 | 🐘 Grand Tusk | 4/10 | Hurt | Give all friends +1 HP. | Meadow |
| 5 | 🦒 Tall Giraffe | 3/7 | End of turn | Give the 2 friends ahead +1/+1. | Meadow |
| 5 | 🦍 Silverback | 6/8 | Hurt | Gain a 🍉 Melon (1× per battle). | Meadow |
| 5 | 🐬 Bright Dolphin | 5/5 | Start of battle | Deal 4 damage to the enemy with the least HP. | Tide |
| 5 | 🦚 Peacock | 3/7 | Hurt | Gain +2 attack. | Jungle |
| 6 | 🦣 Tundra Mammoth | 4/10 | Faint | Give all friends +2/+2. | Meadow |
| 6 | 🐅 Stripe Tiger | 6/6 | Start of battle | Give all friends +1 attack. | Meadow |
| 6 | 🦈 Reef Shark | 6/5 | Start of battle | Deal 2 damage to all enemies. | Meadow |
| 6 | 🦘 Boxer Roo | 5/7 | Friend summoned | Give the new friend +2/+2. | Meadow |
| 6 | 🐫 Dune Camel | 3/9 | Hurt | Give the friend behind +2/+2. | Meadow |
| 6 | 🐋 Deep Whale | 4/10 | Faint | Summon a 5/5 Calf. | Tide |
| 6 | 🦖 Rex | 7/7 | Hurt | Deal 3 damage to a random enemy. | Jungle |

Summoned tokens: 👻 Hop Spirit, 🐏 Lamb, 🪲 Bumble, 🐳 Calf.

## Food

| Food | Tier | Effect |
|---|---|---|
| 🍎 Apple | 1 | +1/+1 to one critter. |
| 🍯 Honey | 1 | Perk. Faint: summon a 1/1 Bumble. |
| 🥗 Salad | 2 | +1/+1 to 2 random critters. |
| 🦴 Bone | 2 | Perk. Attacks deal +3 damage. |
| 🍫 Chocolate | 3 | +1 level progress. |
| 🥜 Nut Shell | 3 | Perk. Take 2 less damage per hit (at least 1). |
| 🍐 Pear | 4 | +2/+2 to one critter. |
| 🌶️ Chili | 4 | Perk. Attacks also deal 4 damage to the enemy behind. |
| 🍉 Melon | 5 | Perk. Block 20 damage once. |
| 🍣 Sushi | 5 | +2/+2 to 3 random critters. |
| 🍄 Mushroom | 6 | Perk. Faint: come back as a 1/1. |

A critter holds one perk. A new perk replaces the old one.

## Run loop

1. Shop: buy, merge, feed, sell, reroll, freeze, order the line.
2. End turn: end-of-turn abilities run, then the battle.
3. The opponent is a bot team. It played its own seeded shops from round 1 to this round with the same gold. The champion team had +1 gold each round.
4. After the battle the next round starts with a new shop. Frozen slots stay.
5. The run ends at 10 trophies (win) or 0 lives (loss).

## Meta progress

Each run gives stars ⭐: 1 per trophy and +5 for a win. Spend them on the title screen to unlock packs. The 🌊 Tide Pack costs 8 stars. The 🌴 Jungle Pack costs 14 stars. Unlocked packs join the shop and the opponents.

The title screen shows runs, wins, the best trophy count and the best score. Score = 100 per win, plus 500 + 60 per life left and a speed bonus for a victory.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Critters with their ability functions, foods, perks, packs, round rules |
| `src/battle.ts` | Pure battle sim with the trigger queue and the event log |
| `src/run.ts` | Run state, shop actions, merges, opponent builder, score, save data |
| `src/bot.ts` | Shop bots (weak, good, opponent) |
| `src/app.ts` | Screens, battle replay, drag and drop, input, debug API |
| `src/sfx.ts` | WebAudio sounds |
| `src/rng.ts` | Seeded RNG |

Abilities use one effect context (`Ctx`). The shop and the battle sim both implement it, so one ability function works in both places. Each battle event holds a snapshot of both lines. The replay draws the snapshots one by one with CSS animations.

The run is saved in `localStorage` under `critter.run` after each action. Meta progress is under `critter.meta`.

## Debug

Open the game with `?debug` (add `&fast` to skip the battle replay). The console then has `window.debug`:

- `debug.step()`: one bot action. On the shop screen the good bot buys, merges, feeds, rerolls or orders the line, then ends the turn. It returns `'busy'` while a replay runs.
- `debug.state()`: screen, round, gold, lives, trophies, team, shop, battle and end data.
- `debug.gold(n)`, `debug.stars(n)`.

## Balance

A headless sim plays full runs with the opponent builder (1000 runs each):

| Bot | Meadow only | All packs |
|---|---|---|
| Weak (random buys and food) | 0% wins, 0.9 trophies | 0% wins, 0.9 trophies |
| Good (merges, best tier, replaces, food, line order) | 33% wins, 6.5 trophies | 31% wins, 6.5 trophies |
