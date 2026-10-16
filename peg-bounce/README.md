# Peg Bounce

Physics pachinko roguelite (like Peglin). Status: playable.

## How to play

1. Aim with the mouse and click to shoot. On touch screens, drag to aim and release to shoot. Keys: `←` `→` aim (`Shift` for big steps), `Space` shoots.
2. The dotted line shows the path of the orb up to its first bounce.
3. Every peg the orb hits adds its damage. When the orb falls out, the hero attacks the closest enemy with the total.
4. Then the enemies act. The icon above each enemy shows its next move: `⚔️N` attacks for N, `👣` moves closer, `⏳` charges up.
5. Click or press `Space` during a shot to play it 3 times faster.

## Pegs

| Peg | Effect |
|---|---|
| 🔵 Normal | Adds the orb's damage per peg. |
| 🟠 Crit | Every peg of this shot deals the orb's crit damage. 2 per board. |
| 🟢 Refresh | All broken pegs come back after the shot. 1 per board. |
| 🔴 Bomb | Explodes on the second hit (also across shots). Hits every enemy for 6 and breaks the pegs nearby. |

- Pegs you hit break after the shot. When fewer than 25% of the pegs are left, the board refreshes by itself.
- Crit and refresh pegs move to new places after each shot.
- Land the orb in the moving bucket for +50% damage. The bucket only moves while an orb is in play, so you can see where it starts.

## Orbs

The orb bag works like a deck. You draw one orb per turn and the bag reshuffles when it is empty. You can swap the current orb for the next one once per fight. Orbs go up to level 3 (★★).

| Orb | Per peg / crit (level 1) | Effect |
|---|---|---|
| 🪨 Pebble | 2 / 4 | None |
| 🔷 Splitter | 1 / 3 | Splits in two at the first peg |
| 🗡️ Lancer | 1 / 3 | The attack hits every enemy |
| 🌑 Boulder | 3 / 5 | Big and heavy, bounces less |
| 🟢 Bouncer | 1 / 3 | Very bouncy, wall hits count as pegs |
| 🔥 Fireball | 2 / 4 | Also hits the enemy behind for half |
| 🧪 Venom | 1 / 2 | 1 poison on the target per 4 pegs |
| 👻 Ghost | 2 / 4 | Passes through the first 4 pegs (Armory) |
| 🪙 Midas | 1 / 3 | 1 gold per peg (Armory) |
| 💚 Mender | 1 / 2 | Heals 1 HP per 5 pegs (Armory) |

## Enemies

Enemies stand in 8 slots on the lane. Slot 1 is next to the hero. Each enemy attacks when it is within its range, else it walks closer. Poison deals its value at the start of the enemy turn, then goes down by 1.

| Act | Enemies | Elite | Boss |
|---|---|---|---|
| 🌲 Mossy Woods | Slime, Bat, Goblin Archer (range 4), Shroom (heals allies) | 👹 Ogre | 🌳 Elder Treant: grows Saplings |
| 🕯️ Deep Caves | Skeleton, Shield Knight (shield 8 each turn), Bomb Imp (explodes), Cave Spider, Bat | 🗿 Golem (armor 3) | 🧙 Lich: raises Skeletons |
| 🏰 Dragon Keep | Dire Wolf, Dark Mage (heals), Tower Guard (shield 12), War Boar, Skeleton | 🧌 Troll (regen 10) | 🐉 Ember Dragon: hatches Whelps |

Bosses do not move and attack every second turn. Enemy HP and attack grow with each act.

## Run loop

1. 3 acts with 9 steps each. At each step choose a room: fight, elite, event, treasure, shop, campfire. The last step is the boss.
2. After a fight: gold, and one pick of 3 (a new orb, an orb upgrade, or max HP). Elites also drop a relic. Bosses give a choice of 3 relics.
3. Shop: orbs, relics, healing, an orb upgrade, or orb removal.
4. Campfire: heal 30% of max HP, or upgrade an orb.
5. 6 events with choices (Wishing Well, Old Smith, Mushroom Ring, Lost Pack, Blood Altar, Training Yard).
6. 16 relics change the rules, for example Crit Lens (+1 crit peg), Powder Keg (bombs explode at once), Echo Bell (first shot deals double) and Long Scope (aim line shows two bounces).

## Meta progress

Each run gives shards 💎 (score / 60). Spend them in the Armory on the title screen to unlock 3 orbs and 4 relics for later runs.

## Code

| File | Contents |
|---|---|
| `src/physics.ts` | Fixed-step orb physics (circle vs. circle), board layouts, aim line trace |
| `src/fight.ts` | Enemy lane, orb bag, attack math, enemy turns |
| `src/data.ts` | Orbs, relics, enemies, acts |
| `src/run.ts` | Map plan, rewards, shop, events, score, save data |
| `src/app.ts` | Screens, canvas renderer, animation queue, input |

The physics has no randomness, so the aim line and the bot see the same path that the shot takes.

## Debug

Open the game with `?debug` (add `&fast` to skip animations and play shots at once). The console then has `window.peg`:

- `peg.step(k?)`: one bot action. In a fight the bot tries `k` random aims and shoots the best one.
- `peg.state()`, `peg.gold(n)`, `peg.relic(id)`, `peg.shards(n)`, `peg.win()`.
